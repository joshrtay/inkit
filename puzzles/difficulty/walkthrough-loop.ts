// The walkthrough refinement loop (docs/research-walkthrough-loop.md): Opus writes a human-style
// walkthrough as a short list of insights (logic, not moves), our solver checks it, and Opus revises
// from the check, before anything is trained on the result. Two questions, two tests:
//
// - abc: how much solver help keeps the human shape? Held-out Janko states (as the pilot,
//   opus-walkthrough.ts), one shared first draft, then three paradigms of feedback: A, errors only
//   (the teacher); B, errors plus the valid steps nearest to what Opus tried; C, errors plus the
//   whole menu at every insight (the drift control). Each in two harnesses: fixed critique rounds
//   (`refine --mode rounds`) and tool use, where Opus asks the solver while it writes
//   (`refine --mode tools`).
// - lib: does an insight library (named sentences, reused and refactored as puzzles go by, scored
//   by description length) make better walkthroughs? Its own controlled test: per genre, the same
//   paradigm and puzzle sequence without a library (none), with a growing one (grow, refactored
//   every few puzzles), and on the held-out puzzles with grow's library frozen (frozen).
//
// The check (audit): a reader, our solver limited to steps up to a cost ceiling (deduce.ts's
// `ceiling`), fills in every easy step; each insight is judged where the reader has got to: wrong
// (against the solution clingo proves unique), already decided (trivial if all of it was), true but
// not yet following (a leap), or forced by one step there (with its cost and smallest reason, set
// against the clues Opus cites). After the last insight the reader must finish the grid.
//
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts sample abc [--n 100]         → abc/items.json
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts sample lib [--genres a,b] [--train 25] [--test 10]
//                                                                                    → lib/items.json
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts calibrate <set> [--q 0.6]   → <set>/ceilings.json
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts draft abc [--limit N] [--library <file>|seed]  → abc/draft.jsonl (paid)
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts refine abc --arm A|B|C [--mode rounds|tools] [--rounds 4] [--limit N] [--library …]
//                                                                                    → abc/<mode>-<arm>.jsonl (paid)
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts library <genre> --arm none|grow|frozen|seeded|seeded-frozen|seed-only
//     [--paradigm A] [--every 10] [--train-too]
//                                                                                    → lib/<genre>-<arm>.jsonl, lib/<genre>-<grow|seeded>-library.json (paid)
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts report <set> [--ceiling-q 0.4,0.6,0.8]  → <set>/report.md (free)
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts show <set> <id> [--arm A]   (the prompt and, if run, the feedback)
//   node --no-warnings puzzles/difficulty/walkthrough-loop.ts dry [akari/1,nurikabe/1]    (free: the whole loop on the repo's
//     example puzzles, with a stand-in for Opus built from the solver's own path)
//
// Opus is asked from Anthropic (ANTHROPIC_API_KEY); fixed rounds can also go through OpenRouter
// (OPENROUTER_API_KEY), tool use can't. LOOP_CAP (dollars, default 25) stops any paid command before
// its ledger would pass it; LOOP_EFFORT (default medium) and LOOP_TOKENS (default 32000) as the
// pilot's. WALK_MOCK=1 uses the stand-in instead of Opus anywhere. Everything goes to
// references/ml/walkloop/ (local only: the puzzles are Janko's).
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { program } from "../../src/engine/encode.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { clingoJson, loadClingo } from "./clingo.ts";
import { BANDS, deduce, type Step } from "./deduce.ts";
import { JANKO_TYPES } from "./janko.ts";
import { shuffled } from "./llm-label.ts";
import { draw, jankoOf, loadItems, markOf, moveForm, NAME, readJsonl, rules, VALUES, wilson } from "./opus-human.ts";
import {
  absorb, along, type Audit, applyRefactor, clean, citation, cellsOfRefs, descriptionLength, emptyLibrary, feedback, firstIn3, grounded,
  type Insight, type InsightCheck, type Library, libraryBlock, type MenuStep, minimal, nearest, type MV, type Paradigm, parseWalk, type RawMove,
  type RefactorOp, sameWalk, type SeedEntry, seedLibrary, sound, spearman, sufficient, type Walk,
} from "./walkthrough-core.ts";

const repo = new URL("../../", import.meta.url).pathname;
const OUT = `${repo}references/ml/walkloop/`;
const argv = process.argv.slice(2), cmd = argv[0] ?? "report";
const opt = (name: string, d: string) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : d; };
const num = (name: string, d: number) => Number(opt(name, String(d)));
const SEED = "walkthrough-loop 2026-10-22";
const EFFORT = process.env.LOOP_EFFORT || "medium", MAX_TOKENS = Number(process.env.LOOP_TOKENS) || 32000;
/** who is asked: the model on Anthropic and on OpenRouter, its price per token, effort and output cap */
export interface Model { id: string; openrouter: string; price: { input: number; output: number }; effort: string; maxTokens: number }
export const OPUS: Model = { id: "claude-opus-5-5", openrouter: "anthropic/claude-opus-5.5", price: { input: 4 / 1e6, output: 20 / 1e6 }, effort: EFFORT, maxTokens: MAX_TOKENS };
const CAP = Number(process.env.LOOP_CAP) || 25;
const MOCK = process.env.WALK_MOCK === "1" || cmd === "dry";
/** the reader's ceiling when a set has no calibration: the solver's "medium" band */
export const DEFAULT_CEILING = BANDS[1][0];
const TOOL_CALLS = 30;
/** the reader and the menus use the genre's extra techniques (deduce.ts FINISH: Nurikabe islands and
 *  so on): more of what people do counts as following; LOOP_FINISH=0 leaves them out */
export const FINISH = process.env.LOOP_FINISH !== "0";

// ======== items ========
export interface LoopItem {
  id: string; set: "abc" | "lib" | "example"; genre: string; known: MV[];
  /** Janko: the record's name and the person; lib: train or test, and the place in the sequence */
  name?: string; person?: string; part?: "train" | "test"; seq?: number;
  /** example: the file under src/games/ */
  file?: string;
}
export const dir = (set: string) => { const d = `${OUT}${set}/`; mkdirSync(d, { recursive: true }); return d; };
export const loadSet = (set: string): LoopItem[] => JSON.parse(readFileSync(`${dir(set)}items.json`, "utf8")).items;

/** graphs-human-labels.jsonl records by name (the person's order, the split) */
const labelRecs = (() => {
  let recs: Map<string, any> | null = null;
  return () => {
    if (recs) return recs;
    recs = new Map();
    for (const l of readFileSync(`${repo}references/ml/graphs-human-labels.jsonl`, "utf8").split("\n")) {
      if (!l.trim()) continue;
      const d = JSON.parse(l);
      recs.set(d.name, d);
    }
    return recs;
  };
})();

function sample(which: string) {
  if (which === "abc") {
    // as the pilot: ordinary held-out states (the person's own), ≤ 100 cells, 8–60 of their moves
    // to come; spread evenly over types, fresh seed (the pilot's 20 may come up again: that's fine,
    // its numbers aren't reused)
    const N = num("--n", 100), recs = labelRecs();
    const ok = loadItems().filter((it) => {
      const d = recs.get(it.name);
      if (!d || d.split !== "test" || it.kind !== "ordinary") return false;
      const known = new Set(it.known.map(([m]) => m)), left = new Set((d.humanOrder as [string, number][]).map(([m]) => m).filter((m) => !known.has(m))).size;
      return d.structure.rows * d.structure.cols <= 100 && left >= 8 && left <= 60;
    });
    const order = shuffled(ok, `${SEED} abc`), picked: typeof ok = [], per = new Map<string, number>();
    for (let pass = 1; picked.length < N && pass <= N; pass++) for (const it of order) {
      if (picked.length >= N) break;
      if ((per.get(it.genre) ?? 0) < pass && !picked.includes(it)) { picked.push(it); per.set(it.genre, (per.get(it.genre) ?? 0) + 1); }
    }
    const items: LoopItem[] = picked.map((it) => ({ id: it.id, set: "abc", genre: it.genre, known: it.known, name: it.name, person: it.person }));
    writeFileSync(`${dir("abc")}items.json`, JSON.stringify({ seed: SEED, items }, null, 1));
    console.log(`${items.length} states (${[...per].map(([g, n]) => `${g} ${n}`).join(", ")}) → abc/items.json`);
    return;
  }
  // lib: whole Janko puzzles from the empty grid, side ≤ 8. Train from the training split, in
  // order of the person's solve length (short first: a rough easy-to-hard curriculum); test from
  // the held-out split, shuffled
  const genres = opt("--genres", "akari,slitherlink,skyscrapers").split(","), T = num("--train", 25), H = num("--test", 10);
  const items: LoopItem[] = [];
  for (const genre of genres) {
    const folder = JANKO_TYPES[genre]?.folder;
    const recs = [...labelRecs().values()].filter((d) => String(d.name).startsWith(`janko ${folder}/`))
      .filter((d) => d.structure.rows <= 8 && d.structure.cols <= 8);
    const train = shuffled(recs.filter((d) => d.split !== "test"), `${SEED} lib ${genre}`).slice(0, T * 3)
      .sort((a, b) => a.humanOrder.length - b.humanOrder.length).slice(0, T);
    const test = shuffled(recs.filter((d) => d.split === "test"), `${SEED} lib test ${genre}`).slice(0, H);
    [...train, ...test].forEach((d, i) => items.push({ id: `lib-${genre}-${i < train.length ? "train" : "test"}-${i}`, set: "lib", genre, known: [], name: d.name, part: i < train.length ? "train" : "test", seq: i }));
    console.log(`${genre}: ${train.length} train, ${test.length} test`);
  }
  writeFileSync(`${dir("lib")}items.json`, JSON.stringify({ seed: SEED, items }, null, 1));
}

// ======== a puzzle's context: spec, solution, structure ========
export interface Ctx {
  item: LoopItem; spec: GridSpec; rows: number; cols: number;
  truth: Map<string, boolean>; marks: number; markNames: string[]; initial: Set<string>;
  /** the engine's program, for the case-split check */
  asp: string;
  /** a rule instance's cells, by deduce.ts's explanation label ("lit (row 3)") */
  groupCells: Map<string, number[]>;
}
const ctxCache = new Map<string, Ctx>();
export async function ctxOf(item: LoopItem): Promise<Ctx> {
  if (ctxCache.has(item.id)) return ctxCache.get(item.id)!;
  let spec: GridSpec, truth: Map<string, boolean>;
  if (item.set === "example") {
    const d = JSON.parse(readFileSync(`${repo}src/games/${item.file}`, "utf8"));
    spec = { ...d.grid, genre: d.grid.genre ?? item.genre };
    await loadClingo();
    const r = clingoJson(program(makePuzzle(spec)), 2), ws = r.Call?.[0]?.Witnesses ?? [];
    if (ws.length !== 1) throw new Error(`${item.id}: ${ws.length} solutions`);
    truth = new Map((ws[0].Value as string[]).map((a) => [a, true]));
  } else {
    const j = jankoOf(item.name!).j;
    spec = j.spec; truth = j.truth;
  }
  const setup = await deduce(spec, { setupOnly: true, structure: true });
  const st = setup.structure!;
  const ctx: Ctx = {
    item, spec, rows: st.rows, cols: st.cols, truth, marks: st.marks.length, markNames: st.marks.map((m) => m.name), asp: program(makePuzzle(spec)),
    initial: new Set((setup.initial ?? []).map((f) => f.slice(0, f.lastIndexOf("=")))),
    groupCells: new Map(st.groups.map((g) => [`${g.kind} (${g.label})`, g.cells])),
  };
  ctxCache.set(item.id, ctx);
  return ctx;
}
export const valueOf = (ctx: Ctx, m: string) => ctx.truth.get(m) ?? false;
/** A move as Opus wrote it, as one of our marks ("mark:shaded(3)" with "true"/"false": the stand-in's form). */
export function markOfMove(ctx: Ctx, m: RawMove): MV | null {
  if (String(m?.at ?? "").startsWith("mark:")) return [m.at.slice(5), m.value === "true"];
  return m?.at ? markOf(ctx.spec, m) : null;
}

// ======== the solver's probes ========
/** The reader: from what's known, every step up to the ceiling, cheapest first, until none is left. */
export async function reader(ctx: Ctx, known: Map<string, boolean>, ceiling: number): Promise<{ added: MV[]; solved: boolean; open: number }> {
  const r = await deduce(ctx.spec, { from: [...known.keys()], ceiling, finish: FINISH, budgetMs: 60000 });
  const added: MV[] = [], seen = new Set([...known.keys(), ...ctx.initial]);
  for (const s of r.path) for (const f of s.facts) if (!seen.has(f.mark)) { seen.add(f.mark); added.push([f.mark, f.value]); }
  return { added, solved: r.profile.solved, open: Math.max(0, ctx.marks - seen.size) };
}
/** Everything one step decides from what's known (no case splits), each with its smallest reason. */
export async function menu(ctx: Ctx, known: Map<string, boolean>): Promise<MenuStep[]> {
  const r = await deduce(ctx.spec, { from: [...known.keys()], menus: [[]], finish: FINISH, budgetMs: 60000 });
  // the same facts found in several windows (or stages): the cheapest only
  const best = new Map<string, MenuStep>();
  for (const s of (r.menus?.[0] ?? []) as Step[]) {
    const step: MenuStep = {
      facts: s.facts.map((f) => ({ ...f, text: say(ctx, f.text) })), cells: s.cells, cost: s.cost, where: s.where, tier: s.tier, kind: s.uses.join("+"),
      clues: s.because?.clues ?? [], clueCells: [...new Set((s.because?.clues ?? []).flatMap((c) => ctx.groupCells.get(c) ?? []))],
    };
    const k = step.facts.map((f) => `${f.mark}=${f.value}`).sort().join(" ");
    if (!best.has(k) || best.get(k)!.cost > step.cost) best.set(k, step);
  }
  return [...best.values()];
}
/** Does a mark follow by a short case split: assume it the other way, and clingo's propagation alone
 *  (no choices, within a few conflicts) finds a contradiction, given what's known? (deduce.ts's tier 2) */
async function bySplit(ctx: Ctx, known: Map<string, boolean>, mv: MV): Promise<boolean> {
  await loadClingo();
  const facts = [...known].map(([m, v]) => (v ? `:- not ${m}.` : `:- ${m}.`)), against = mv[1] ? `:- ${mv[0]}.` : `:- not ${mv[0]}.`;
  const r = clingoJson(`${ctx.asp}\n${facts.join("\n")}\n${against}`, 1, ["--stats", "--solve-limit=50"]);
  return r.Result === "UNSATISFIABLE" && (r.Stats?.Core?.Choices ?? 1) === 0;
}
/** The undecided marks a short case split settles, as menu steps (kind "case split"). */
export async function splits(ctx: Ctx, known: Map<string, boolean>, tries: number): Promise<MenuStep[]> {
  const out: MenuStep[] = [];
  for (const m of ctx.markNames.filter((x) => !known.has(x) && !ctx.initial.has(x)).slice(0, tries)) {
    const mv: MV = [m, valueOf(ctx, m)];
    if (await bySplit(ctx, known, mv)) out.push({ facts: [{ mark: m, value: mv[1], text: markText(ctx, mv) }], cells: cellsOfMark(ctx, m), cost: NaN, where: "a case split", clues: [], clueCells: [], kind: "case split", tier: 2 });
  }
  return out;
}
/** The cells a mark is on (a cell's, or the two cells of a link or border). */
export function cellsOfMark(ctx: Ctx, m: string): number[] {
  const q = /^(\w+)\((\d+)(?:,(\d+))?\)$/.exec(m);
  if (!q) return [];
  const g = makePuzzle(ctx.spec).grid, id = Number(q[2]);
  if (q[1] === "line" || q[1] === "cut") return g.links[id]?.cells ?? [];
  if (q[1] === "fence") return g.borders[id]?.cells?.filter((c: number) => c >= 0) ?? [];
  return [id];
}
/** A mark in words, roughly as the solver says it ("r2c3 no bulb", "r1c1 3", "r2c2–r2c3 line"). */
export function markText(ctx: Ctx, [m, v]: MV): string {
  const rc = (c: number) => `r${Math.floor(c / ctx.cols) + 1}c${(c % ctx.cols) + 1}`, cells = cellsOfMark(ctx, m).map(rc).join("–");
  const d = /^digit\(\d+,(\d+)\)$/.exec(m);
  if (d) return `${cells} ${v ? "" : "not "}${d[1]}`;
  const words = VALUES[ctx.item.genre];
  return `${cells} ${words ? words[v ? 0 : 1] : v ? "yes" : "no"}`;
}
/** A solver fact in the genre's words ("r2c3 unshaded" in Akari is "r2c3 no bulb"). */
const say = (ctx: Ctx, text: string) => {
  const v = VALUES[ctx.item.genre];
  return v ? text.replace(/ unshaded$/, ` ${v[1]}`).replace(/ shaded$/, ` ${v[0]}`) : text;
};

/** The check: each insight where the reader has got to, then whether the reader finishes. */
async function audit(ctx: Ctx, walk: Walk, ceiling: number, withMenus = true): Promise<Audit> {
  const known = new Map<string, boolean>(ctx.item.known), order: MV[] = [];
  const checks: InsightCheck[] = [];
  for (const [k, ins] of walk.insights.entries()) {
    const r = await reader(ctx, known, ceiling);
    for (const mv of r.added) { known.set(mv[0], mv[1]); order.push(mv); }
    const steps = await menu(ctx, known);
    const c: InsightCheck = { k, unreadable: [], wrong: [], already: [], forced: [], split: [], notYet: [], trivial: false, citation: null, readerMarks: r.added.length, simpler: steps.length > 0 };
    const cited = cellsOfRefs(ins.clues, ctx.rows, ctx.cols), cites: { recall: number; precision: number }[] = [];
    const fresh: MV[] = [], cells = new Set(cited);
    let readable = 0, chain: MenuStep[] = [], chainAt = 0;
    for (const m of ins.concludes) {
      const mv = markOfMove(ctx, m);
      if (!mv) { c.unreadable.push(m); continue; }
      readable++;
      for (const x of cellsOfRefs([m.at], ctx.rows, ctx.cols)) cells.add(x);
      const text = `${m.at} ${m.value}`;
      if (known.has(mv[0]) || ctx.initial.has(mv[0])) { if ((known.get(mv[0]) ?? valueOf(ctx, mv[0])) === mv[1]) c.already.push(text); else c.wrong.push(m); continue; }
      if (valueOf(ctx, mv[0]) !== mv[1]) { c.wrong.push(m); continue; }
      // a chain inside one insight: a later mark may need the earlier ones, so it is judged with them
      // known (the menu taken again only when needed)
      const forcing = (ss: MenuStep[]) => ss.filter((s) => s.facts.some((f) => f.mark === mv[0] && f.value === mv[1])).sort((a, b) => a.cost - b.cost)[0];
      let best = forcing(steps);
      const withFresh = () => new Map([...known, ...fresh]);
      if (!best && fresh.length) { if (chainAt < fresh.length) { chain = await menu(ctx, withFresh()); chainAt = fresh.length; } best = forcing(chain); }
      if (best) {
        c.forced.push({ text, cost: best.cost, clues: best.clues, kind: best.kind });
        const ci = citation(cited, best.clueCells);
        if (ci) cites.push(ci);
      } else if (await bySplit(ctx, withFresh(), mv)) c.split.push(text);
      else c.notYet.push(text);
      fresh.push(mv);
    }
    c.trivial = readable > 0 && c.already.length === readable;
    if (cites.length) c.citation = { recall: cites.reduce((s, x) => s + x.recall, 0) / cites.length, precision: cites.reduce((s, x) => s + x.precision, 0) / cites.length };
    if (withMenus) { c.menu = steps; c.cells = [...cells]; }
    for (const mv of fresh) { known.set(mv[0], mv[1]); order.push(mv); }
    checks.push(c);
  }
  const r = await reader(ctx, known, ceiling);
  for (const mv of r.added) { known.set(mv[0], mv[1]); order.push(mv); }
  let stuckMenu: MenuStep[] | undefined;
  if (!r.solved && withMenus) stuckMenu = await menu(ctx, known);
  // nothing by one step: the short case splits there instead (at most 40 marks tried)
  if (stuckMenu && !stuckMenu.length) stuckMenu = await splits(ctx, known, 40);
  const stall = r.solved ? null : { open: r.open, total: ctx.marks, grid: draw(ctx.spec, known), ...(stuckMenu ? { menu: stuckMenu } : {}) };
  return { checks, stall, order, ceiling };
}
/** An audit without its menus, for the ledger. */
const slim = (a: Audit) => ({ ...a, checks: a.checks.map(({ menu: _m, ...c }) => c), stall: a.stall && { open: a.stall.open, total: a.stall.total }, order: undefined, verdict: { sound: sound(a), sufficient: sufficient(a), minimal: minimal(a), grounded: grounded(a), clean: clean(a) } });

// ======== ceilings ========
/** Per genre, the reader's ceiling: the q-quantile of step costs on the solver's cheapest-first path
 *  over the set's puzzles (at most 10 a genre). Insights are then roughly the dearest 1 − q of steps. */
async function calibrate(set: string) {
  const q = num("--q", 0.6), byGenre = new Map<string, LoopItem[]>();
  for (const it of loadSet(set)) byGenre.set(it.genre, [...(byGenre.get(it.genre) ?? []), it]);
  const out: Record<string, number> = {}, search: Record<string, number> = {};
  for (const [genre, its] of byGenre) {
    // and how much of the solve needs search (tier 3): there the check can't tell a leap from a
    // human technique the solver lacks, so a genre far above 10% is a weak place to run the loop
    const costs: number[] = [], tiers = [0, 0, 0, 0];
    for (const it of its.slice(0, 10)) {
      const r = await deduce((await ctxOf(it)).spec, { minPeak: true, finish: FINISH, budgetMs: 60000 }).catch(() => null);
      for (const s of r?.path ?? []) { if (s.tier <= 1) costs.push(s.cost); tiers[s.tier] += s.facts.length; }
    }
    costs.sort((a, b) => a - b);
    out[genre] = costs.length ? Number(costs[Math.min(costs.length - 1, Math.floor(q * costs.length))].toFixed(2)) : DEFAULT_CEILING;
    const all = tiers.reduce((a, b) => a + b, 0) || 1;
    search[genre] = Number((tiers[3] / all).toFixed(3));
    console.error(`${genre}: ceiling ${out[genre]} (${costs.length} steps); facts by split ${Math.round((100 * tiers[2]) / all)}%, by search ${Math.round((100 * tiers[3]) / all)}%`);
  }
  writeFileSync(`${dir(set)}ceilings.json`, JSON.stringify({ q, ceilings: out, search }, null, 1));
}
export const ceilingOf = (set: string, genre: string): number => {
  const f = `${OUT}${set}/ceilings.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).ceilings[genre] ?? DEFAULT_CEILING : DEFAULT_CEILING;
};

// ======== prompts ========
function promptOf(ctx: Ctx, lib?: string): string {
  const it = ctx.item, start = it.known.length === 0, genre = it.genre;
  const move = moveForm(genre).replace(/, "reason": "one line"\}.*$/, "}");
  const library = lib === undefined ? "" : `
You keep a library of insights for ${NAME[genre] ?? genre}: reasoning patterns written as general sentences, with slots in braces. Here it is${lib ? "" : " (empty so far)"}:
${lib || "(none yet)"}

Use an entry whenever it really fits: give its id as "uses" and write the idea as the entry's sentence filled in for this puzzle. When no entry fits, write the idea in your own words and, if the pattern could come back in other puzzles, propose an entry as "new_entry" (a short name, the sentence with slots, when it applies, what it concludes). Don't force an entry onto reasoning it doesn't describe.
`;
  return `${start ? "A person is about to solve" : "A person is partway through"} this ${NAME[genre] ?? genre.replace(/-/g, " ")} puzzle.

Rules: ${rules(ctx.spec)} The puzzle has exactly one solution.

${start ? "The empty grid" : "Where they are now"}:

${draw(ctx.spec, new Map(it.known))}

Explain how to solve it ${start ? "" : "from here "}the way an experienced human solver would, so it would teach someone. Explain the logic, not the moves.

Write the walkthrough as a short list of insights. An insight is one piece of reasoning (a technique applied to a few named clues) that unlocks part of the grid. Assume a reader who fills in every easy, direct consequence alone: what one clue, row or region gives at a glance once enough is decided around it. Leave all of that to the reader. Only write the insights the reader would need to be shown, in the order a strong person would most likely find them, and enough of them that, with the easy steps in between, the grid gets finished.

For each insight give:
- idea: the reasoning, said so it would teach (why it must be so, in general terms, then how it applies here);
- clues: the clues, cells and lines it uses ("r2c4", "row 3", "column 5");
- concludes: the cells it decides directly (only the key ones; the reader does the rest), each certain from the rules, the clues and what is decided by then;
- technique: a few words a solver would recognise;
- hint: what a coach could say just before it, a nudge toward where to look, without the answer.
${library}
Then judge the puzzle as a whole: its key ideas, its difficulty for a strong human solver (1 to 10), and its elegance (1 to 10), with a sentence on why.

Reply with JSON only, in this form:
{"insights": [{"idea": "…", "clues": ["…"], "concludes": [${move}, …], "technique": "…", "hint": "…"${lib === undefined ? "" : `, "uses": "<entry id or omit>", "new_entry": {"name": "…", "template": "…", "when": "…", "concludes": "…"}`}}, …], "key_ideas": "…", "difficulty": <1-10>, "elegance": <1-10>, "elegance_why": "…"}
Rows and columns count from 1.`;
}
const REVISE: Record<Paradigm, string> = {
  A: "A careful reader checked your walkthrough against the rules. The check only says what is wrong, never what the right reasoning is: that part is yours to find.",
  B: "A careful reader checked your walkthrough against the rules. Where something is wrong or missing, it also lists the valid steps nearest to it. Use them as evidence of what is true there, but explain the reasoning in your own words, the way a person would see it.",
  C: "A careful reader checked your walkthrough against the rules. At every insight it also lists everything that follows by one step at that point, cheapest first.",
};
const reviseOf = (paradigm: Paradigm, fb: string) => `${REVISE[paradigm]}

${fb}

Revise the walkthrough: keep what is right, fix what is flagged, add or drop insights as needed, and keep it explaining logic, not moves. Reply with the complete revised walkthrough as JSON only, in the same form.`;

// ======== asking Opus ========
export interface Turn { role: "user" | "assistant"; content: any }
export interface Reply { text: string; content: any[]; cost: number; usage: unknown; finish: string; toolUses: { id: string; name: string; input: any }[] }
let spent = 0;
/** the ledger, for another harness sharing this one's cap (walkthrough-hints.ts) */
export const ledger = { get spent() { return spent; }, set spent(x: number) { spent = x; } };
function guard(promptChars: number, who: Model) {
  const worst = (promptChars / 3) * who.price.input + who.maxTokens * who.price.output;
  if (!MOCK && spent + worst > CAP) throw new Error(`the ledger would pass $${CAP} ($${spent.toFixed(2)} spent)`);
}
export async function askOpus(turns: Turn[], tools?: Anthropic.Tool[], who: Model = OPUS): Promise<Reply> {
  const PRICE = who.price;
  guard(JSON.stringify(turns).length, who);
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20 * 60 * 1000, maxRetries: 4 });
    const res = await client.messages.stream({
      model: who.id, max_tokens: who.maxTokens, thinking: { type: "adaptive" }, output_config: { effort: who.effort as "medium" },
      messages: turns as Anthropic.MessageParam[], ...(tools ? { tools } : {}),
    } as any).finalMessage();
    const cost = res.usage.input_tokens * PRICE.input + res.usage.output_tokens * PRICE.output;
    spent += cost;
    return {
      text: res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(""), content: res.content, cost, usage: res.usage, finish: String(res.stop_reason),
      toolUses: res.content.filter((b) => b.type === "tool_use").map((b: any) => ({ id: b.id, name: b.name, input: b.input })),
    };
  }
  if (tools) throw new Error("tool use needs ANTHROPIC_API_KEY");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("no ANTHROPIC_API_KEY or OPENROUTER_API_KEY");
  let res: Response | null = null;
  for (let a = 0; a < 5; a++) {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: who.openrouter, max_tokens: who.maxTokens, reasoning: { effort: who.effort }, messages: turns.map((t) => ({ role: t.role, content: typeof t.content === "string" ? t.content : JSON.stringify(t.content) })) }),
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 4000 * 2 ** a));
  }
  const body = await res!.json() as any;
  if (!res!.ok) throw new Error(`${res!.status} ${JSON.stringify(body).slice(0, 200)}`);
  const cost = body.usage?.cost ?? ((body.usage?.prompt_tokens ?? 0) * PRICE.input + (body.usage?.completion_tokens ?? 0) * PRICE.output);
  spent += cost;
  const text = String(body.choices?.[0]?.message?.content ?? "");
  return { text, content: [{ type: "text", text }], cost, usage: body.usage, finish: body.choices?.[0]?.finish_reason, toolUses: [] };
}

/** The stand-in for Opus (dry runs): insights from the solver's own path, each where the reader
 *  stops, its cheapest step's facts and reason. The first draft is spoilt on purpose (a trivial
 *  insight first, the second insight dropped, one wrong move), so the check has something to find;
 *  any revision is the unspoilt one. */
async function mockWalk(ctx: Ctx, ceiling: number, spoil: boolean): Promise<Walk> {
  const known = new Map<string, boolean>(ctx.item.known), insights: Insight[] = [];
  const rawOf = (mv: MV): RawMove => ({ at: `mark:${mv[0]}`, value: String(mv[1]) });
  const refs = (cells: number[]) => cells.slice(0, 4).map((c) => `r${Math.floor(c / ctx.cols) + 1}c${(c % ctx.cols) + 1}`);
  let firstEasy: MV | null = null;
  for (let k = 0; k < 40; k++) {
    const r = await reader(ctx, known, ceiling);
    for (const mv of r.added) { known.set(mv[0], mv[1]); firstEasy ??= mv; }
    if (r.solved) break;
    const best = (await menu(ctx, known)).sort((a, b) => a.cost - b.cost)[0] ?? (await splits(ctx, known, ctx.markNames.length))[0];
    if (!best) break;
    insights.push({ idea: `From ${best.clues.join(", ") || best.where}: ${best.facts.map((f) => f.text).join(", ")}.`, clues: refs(best.clueCells), concludes: best.facts.map((f) => rawOf([f.mark, f.value])), technique: best.kind, hint: `Look at ${best.where}.` });
    for (const f of best.facts) known.set(f.mark, f.value);
  }
  if (spoil) {
    if (insights.length > 1) insights.splice(1, 1);
    if (insights[0]?.concludes[0]) insights[0].concludes.push({ ...insights[0].concludes[0], value: insights[0].concludes[0].value === "true" ? "false" : "true", at: insights[0].concludes[0].at });
    if (firstEasy) insights.unshift({ idea: "An easy one.", clues: [], concludes: [rawOf(firstEasy)], technique: "easy", hint: "" });
  }
  return { insights, key_ideas: "(stand-in)", difficulty: 0, elegance: 0 };
}

// ======== the loop: fixed rounds ========
interface RoundRec { round: number; walk: Walk | null; audit?: ReturnType<typeof slim>; feedback?: string; cost: number; finish?: string; text?: string }
async function draftOf(ctx: Ctx, ceiling: number, lib?: string): Promise<{ turns: Turn[]; rec: RoundRec }> {
  const prompt = promptOf(ctx, lib);
  if (MOCK) { const walk = await mockWalk(ctx, ceiling, true); return { turns: [{ role: "user", content: prompt }, { role: "assistant", content: JSON.stringify(walk) }], rec: { round: 0, walk, cost: 0 } }; }
  const r = await askOpus([{ role: "user", content: prompt }]);
  return { turns: [{ role: "user", content: prompt }, { role: "assistant", content: r.text }], rec: { round: 0, walk: parseWalk(r.text), cost: r.cost, finish: r.finish, text: r.text } };
}
/** Revise from the check until it is clean, a revision changes nothing, or `rounds` revisions. */
async function refineRounds(ctx: Ctx, paradigm: Paradigm, ceiling: number, start: { turns: Turn[]; rec: RoundRec }, rounds: number): Promise<RoundRec[]> {
  const recs: RoundRec[] = [], turns = [...start.turns];
  let cur = start.rec;
  for (let k = 0; ; k++) {
    if (!cur.walk) { recs.push(cur); break; }
    const a = await audit(ctx, cur.walk, ceiling);
    const fb = feedback(a, paradigm, ctx.cols);
    recs.push({ ...cur, audit: slim(a), feedback: fb });
    if (clean(a) || k >= rounds) break;
    if (k > 0 && recs.length > 1 && recs[recs.length - 2].walk && sameWalk(recs[recs.length - 2].walk!, cur.walk)) break;
    turns.push({ role: "user", content: reviseOf(paradigm, fb) });
    if (MOCK) {
      const walk = await mockWalk(ctx, ceiling, false);
      turns.push({ role: "assistant", content: JSON.stringify(walk) });
      cur = { round: k + 1, walk, cost: 0 };
    } else {
      const r = await askOpus(turns);
      turns.push({ role: "assistant", content: r.text });
      cur = { round: k + 1, walk: parseWalk(r.text), cost: r.cost, finish: r.finish, text: r.text };
    }
  }
  return recs;
}

// ======== the loop: tool use ========
/** The solver as tools, by paradigm: A may check a whole draft, test one move and see where the
 *  reader stops; B may also list the valid steps near some cells; C may also list every step. Each
 *  tool takes the insights so far, so the state is whatever Opus says it is. */
function toolsFor(paradigm: Paradigm): Anthropic.Tool[] {
  const insights = { type: "array", description: "the insights so far, in order, in the walkthrough's form", items: { type: "object" } } as const;
  const t: Anthropic.Tool[] = [
    { name: "check_walkthrough", description: "Check a whole walkthrough: what is wrong, what doesn't follow yet, what is only an easy step, and where a reader gets stuck.", input_schema: { type: "object", properties: { insights }, required: ["insights"] } },
    { name: "does_it_follow", description: "After these insights (and every easy step they allow), is this move wrong, already decided, true but not following yet, or forced by one step?", input_schema: { type: "object", properties: { insights, move: { type: "object", properties: { at: { type: "string" }, value: { type: "string" } }, required: ["at", "value"] } }, required: ["insights", "move"] } },
    { name: "where_reader_stops", description: "After these insights, where does a reader taking only easy steps get stuck? Returns the grid there, or says it finishes.", input_schema: { type: "object", properties: { insights }, required: ["insights"] } },
  ];
  if (paradigm !== "A") t.push({ name: "nearby_steps", description: "After these insights, the valid single steps nearest to some cells.", input_schema: { type: "object", properties: { insights, near: { type: "array", items: { type: "string" }, description: "cells or lines: \"r2c4\", \"row 3\"" } }, required: ["insights", "near"] } });
  if (paradigm === "C") t.push({ name: "all_steps", description: "After these insights, every valid single step, cheapest first.", input_schema: { type: "object", properties: { insights }, required: ["insights"] } });
  return t;
}
async function runTool(ctx: Ctx, paradigm: Paradigm, ceiling: number, name: string, input: any): Promise<string> {
  const walk = parseWalk(JSON.stringify({ insights: input?.insights ?? [] })) ?? { insights: [] };
  const line = (s: MenuStep) => `- ${s.facts.map((f) => f.text).join(", ")}: from ${s.clues.join(", ") || s.where} (${s.kind}; cost ${s.cost.toFixed(1)})`;
  if (name === "check_walkthrough") return feedback(await audit(ctx, walk, ceiling), paradigm, ctx.cols);
  // the state after the insights: their right moves plus every easy step
  const a = await audit(ctx, walk, ceiling, false), known = new Map<string, boolean>(ctx.item.known);
  for (const mv of a.order) known.set(mv[0], mv[1]);
  if (name === "where_reader_stops") return a.stall ? `Stuck with ${a.stall.open} of ${a.stall.total} marks open:\n\n${a.stall.grid}` : "The reader finishes the grid.";
  if (name === "does_it_follow") {
    const mv = markOfMove(ctx, input?.move ?? {});
    if (!mv) return "I can't read that move.";
    if (known.has(mv[0]) || ctx.initial.has(mv[0])) return (known.get(mv[0]) ?? valueOf(ctx, mv[0])) === mv[1] ? "Already decided by then." : "Wrong.";
    if (valueOf(ctx, mv[0]) !== mv[1]) return "Wrong.";
    const best = (await menu(ctx, known)).filter((s) => s.facts.some((f) => f.mark === mv[0] && f.value === mv[1])).sort((x, y) => x.cost - y.cost)[0];
    return best ? `It follows by one step${paradigm === "A" ? "" : `: from ${best.clues.join(", ")} (${best.kind})`}.` : "True, but it doesn't follow yet: something is missing before it.";
  }
  const steps = await menu(ctx, known);
  if (name === "nearby_steps" && paradigm !== "A") {
    return nearest(steps, cellsOfRefs(input?.near ?? [], ctx.rows, ctx.cols), ctx.cols, 5).map(line).join("\n") || "Nothing follows by one step there.";
  }
  if (name === "all_steps" && paradigm === "C") return [...steps].sort((x, y) => x.cost - y.cost).slice(0, 25).map(line).join("\n") || "Nothing follows by one step.";
  return "No such tool here.";
}
async function refineTools(ctx: Ctx, paradigm: Paradigm, ceiling: number): Promise<RoundRec[]> {
  const prompt = `${promptOf(ctx, libFor(ctx.item.genre))}\n\nYou can ask a careful reader with a solver while you write, through the tools. Use them as a person would test their ideas; when you are satisfied, reply with the final walkthrough as JSON only.`;
  const turns: Turn[] = [{ role: "user", content: prompt }], tools = toolsFor(paradigm), calls: { name: string; input: unknown; out: string }[] = [];
  let cost = 0, text = "", finish = "";
  for (let k = 0; k <= TOOL_CALLS; k++) {
    if (MOCK) { text = JSON.stringify(await mockWalk(ctx, ceiling, false)); break; }
    const r = await askOpus(turns, tools);
    cost += r.cost; text = r.text; finish = r.finish;
    if (!r.toolUses.length) break;
    turns.push({ role: "assistant", content: r.content });
    const results = [];
    for (const u of r.toolUses) {
      const out = k === TOOL_CALLS ? "No more checks: reply with the final walkthrough now." : await runTool(ctx, paradigm, ceiling, u.name, u.input).catch((e) => `error: ${(e as Error).message}`);
      calls.push({ name: u.name, input: u.input, out: out.slice(0, 2000) });
      results.push({ type: "tool_result", tool_use_id: u.id, content: out });
    }
    turns.push({ role: "user", content: results });
  }
  const walk = parseWalk(text), a = walk ? await audit(ctx, walk, ceiling) : null;
  return [{ round: 0, walk, cost, finish, text, ...(a ? { audit: slim(a), feedback: feedback(a, paradigm, ctx.cols) } : {}), calls } as RoundRec];
}

// ======== commands: draft, refine ========
/** --library <file> (a library the library test saved, e.g. lib/akari-seeded-library-trained.json,
 *  or "seed"): A/B/C written with that library in the prompt, fixed. The draft and every arm must
 *  use the same one. */
function libFor(genre: string): string | undefined {
  const f = opt("--library", "");
  if (!f) return undefined;
  const lib: Library = f === "seed" ? seedLibrary(genre, loadSeed()) : JSON.parse(readFileSync(f.startsWith("/") ? f : `${OUT}${f}`, "utf8"));
  return libraryBlock(lib, genre);
}
async function draftCmd(set: string) {
  const file = `${dir(set)}draft.jsonl`, done = new Set(readJsonl(file).filter((x) => x.rec.walk).map((x) => x.id));
  spent = readJsonl(file).reduce((s, x) => s + (x.rec.cost ?? 0), 0);
  let todo = loadSet(set).filter((it) => !done.has(it.id));
  if (argv.includes("--limit")) todo = todo.slice(0, num("--limit", 2));
  for (const it of todo) {
    const ctx = await ctxOf(it), d = await draftOf(ctx, ceilingOf(set, it.genre), libFor(it.genre)).catch((e) => { console.error(`${it.id}: ${(e as Error).message}`); return null; });
    if (!d) { if (spent >= CAP) break; continue; }
    appendFileSync(file, JSON.stringify({ id: it.id, turns: d.turns, rec: d.rec, at: new Date().toISOString() }) + "\n");
    console.error(`${it.id}: ${d.rec.walk ? `${d.rec.walk.insights.length} insights` : "unparsed"}, $${d.rec.cost.toFixed(3)} (total $${spent.toFixed(2)})`);
  }
}
async function refineCmd(set: string) {
  const paradigm = opt("--arm", "A") as Paradigm, mode = opt("--mode", "rounds"), rounds = num("--rounds", 4);
  const file = `${dir(set)}${mode}-${paradigm}.jsonl`, done = new Set(readJsonl(file).map((x) => x.id));
  const drafts = new Map(readJsonl(`${dir(set)}draft.jsonl`).map((x) => [x.id, x]));
  spent = readJsonl(file).reduce((s, x) => s + x.cost, 0);
  let todo = loadSet(set).filter((it) => !done.has(it.id));
  if (argv.includes("--limit")) todo = todo.slice(0, num("--limit", 2));
  for (const it of todo) {
    const ctx = await ctxOf(it), ceiling = ceilingOf(set, it.genre);
    try {
      let recs: RoundRec[];
      if (mode === "tools") recs = await refineTools(ctx, paradigm, ceiling);
      else {
        // every paradigm revises the same first draft
        const d = drafts.get(it.id) ?? (await draftOf(ctx, ceiling, libFor(it.genre)));
        recs = await refineRounds(ctx, paradigm, ceiling, { turns: d.turns, rec: d.rec }, rounds);
        if (drafts.has(it.id)) recs[0] = { ...recs[0], cost: 0 };   // the draft's cost is the draft's
      }
      const last = recs[recs.length - 1], cost = recs.reduce((s, r) => s + r.cost, 0);
      appendFileSync(file, JSON.stringify({ id: it.id, paradigm, mode, ceiling, rounds: recs, cost, at: new Date().toISOString() }) + "\n");
      console.error(`${it.id}: ${recs.length} round(s), ${last.audit?.verdict.clean ? "clean" : "not clean"}, $${cost.toFixed(3)} (total $${spent.toFixed(2)})`);
    } catch (e) { console.error(`${it.id}: ${(e as Error).message}`); if (spent >= CAP || /ledger/.test((e as Error).message)) break; }
  }
}

// ======== the library test ========
const REFACTOR = (genre: string, block: string, dl: number) => `You keep a library of insights for ${NAME[genre] ?? genre} walkthroughs: reasoning patterns written as general sentences with slots. Here it is, with how often each was used and an example:

${block}

Refactor it so the library plus everything written with it gets shorter (now ${Math.round(dl)} bits), without losing meaning: merge entries that say the same thing (a generalisation is a merge with a slot), split an entry that covers two different ideas (say which examples go to which part, as "<item>#<insight number>"), reword unclear ones, and drop entries that are almost never used. Change nothing that is already good.

Reply with JSON only: {"ops": [{"op": "merge", "ids": ["L1", "L4"], "into": {"name": "…", "template": "…", "when": "…", "concludes": "…"}} | {"op": "split", "id": "L2", "into": [{"name": "…", "template": "…", "when": "…", "concludes": "…", "examples": ["<item>#<k>"]}, …]} | {"op": "reword", "id": "L3", "template": "…"} | {"op": "drop", "id": "L5"}, …]}`;

/** The library arms. none: no library. grow: empty, absorbing and refactoring. seeded: the same,
 *  starting from the seed (walkthrough-seed.json). frozen, seeded-frozen: grow's or seeded's library
 *  as it stood after the last training puzzle, fixed. seed-only: the seed, fixed. The frozen arms,
 *  seed-only and none run on the test puzzles only (none on all with --train-too, for a learning
 *  curve beside grow's). */
const ARMS = ["none", "grow", "frozen", "seeded", "seeded-frozen", "seed-only"];
async function libraryCmd(genre: string) {
  const arm = opt("--arm", "none"), paradigm = opt("--paradigm", "A") as Paradigm, every = num("--every", 10), rounds = num("--rounds", 4);
  if (!ARMS.includes(arm)) throw new Error(`--arm is one of ${ARMS.join(", ")}`);
  const base = arm.startsWith("seed") ? "seeded" : "grow", growing = arm === "grow" || arm === "seeded";
  const libFile = `${dir("lib")}${genre}-${base}-library.json`, snap = `${dir("lib")}${genre}-${base}-library-trained.json`, file = `${dir("lib")}${genre}-${arm}.jsonl`;
  const rows = readJsonl(file), done = new Set(rows.map((x) => x.id));
  spent = rows.reduce((s, x) => s + x.cost, 0);
  const all = loadSet("lib").filter((it) => it.genre === genre).sort((a, b) => a.seq! - b.seq!);
  const items = growing || (arm === "none" && argv.includes("--train-too")) ? all : all.filter((it) => it.part === "test");
  let lib: Library = growing && existsSync(libFile) ? JSON.parse(readFileSync(libFile, "utf8")) : base === "seeded" ? seedLibrary(genre, loadSeed()) : emptyLibrary();
  if (arm.endsWith("frozen")) {
    if (!existsSync(snap)) throw new Error(`run ${base} over the training puzzles first (${snap})`);
    lib = JSON.parse(readFileSync(snap, "utf8"));
  }
  for (const it of items) {
    if (done.has(it.id)) continue;
    const ctx = await ctxOf(it), ceiling = ceilingOf("lib", genre);
    const block = arm === "none" ? undefined : libraryBlock(lib, genre);
    try {
      const d = await draftOf(ctx, ceiling, block);
      const recs = await refineRounds(ctx, paradigm, ceiling, d, rounds);
      const last = recs[recs.length - 1];
      let refactor: unknown = null;
      // a fixed library still counts its uses (in a copy), so its description length can be compared
      if (last.walk && arm !== "none") {
        const next = absorb(lib, last.walk, it.id, genre);
        if (growing) {
          lib = next;
          if (lib.puzzles % every === 0) refactor = await refactorLib(lib, genre).then((r) => { lib = r.lib; return r.note; });
          writeFileSync(libFile, JSON.stringify(lib, null, 1));
          if (it.id === all.filter((x) => x.part === "train").at(-1)?.id) writeFileSync(snap, JSON.stringify(lib, null, 1));
        } else {
          // fixed: new entries proposed are counted, not kept
          lib = { ...next, entries: next.entries.filter((e) => lib.entries.some((x) => x.id === e.id)), next: lib.next };
        }
      }
      const cost = recs.reduce((s, r) => s + r.cost, 0);
      const dl = arm === "none" ? null : descriptionLength(lib, genre);
      const proposed = last.walk?.insights.filter((i) => i.new_entry && !i.uses).length ?? 0;
      appendFileSync(file, JSON.stringify({ id: it.id, arm, paradigm, part: it.part, seq: it.seq, ceiling, rounds: recs, cost, library: arm === "none" ? null : { size: lib.entries.filter((e) => e.genre === genre).length, dl, proposed }, refactor, at: new Date().toISOString() }) + "\n");
      console.error(`${it.id}: ${recs.length} round(s), ${last.audit?.verdict.clean ? "clean" : "not clean"}, library ${dl ? `${lib.entries.length} entries, ${Math.round(dl.total)} bits` : "none"}, $${cost.toFixed(3)} (total $${spent.toFixed(2)})`);
    } catch (e) { console.error(`${it.id}: ${(e as Error).message}`); if (/ledger/.test((e as Error).message)) break; }
  }
}
export const loadSeed = () => JSON.parse(readFileSync(new URL("./walkthrough-seed.json", import.meta.url), "utf8")).entries as SeedEntry[];
/** One refactor: Opus proposes, the description length decides (kept only if it doesn't grow). */
async function refactorLib(lib: Library, genre: string): Promise<{ lib: Library; note: unknown }> {
  const before = descriptionLength(lib, genre).total;
  const block = lib.entries.filter((e) => e.genre === genre).map((e) => `- ${e.id} "${e.name}": ${e.template} (when: ${e.when}; concludes: ${e.concludes}; used ${e.examples.length}×; e.g. ${e.examples.slice(0, 3).map((x) => `${x.item}#${x.k + 1} "${x.idea}"`).join(" / ")})`).join("\n");
  if (!block) return { lib, note: null };
  let ops: RefactorOp[] = [], cost = 0;
  if (MOCK) {
    // the stand-in merges the two least used entries, if there are two
    const es = lib.entries.filter((e) => e.genre === genre).sort((a, b) => a.examples.length - b.examples.length);
    if (es.length >= 2) ops = [{ op: "merge", ids: [es[0].id, es[1].id], into: { name: es[0].name, template: es[0].template, when: es[0].when, concludes: es[0].concludes } }];
  } else {
    const r = await askOpus([{ role: "user", content: REFACTOR(genre, block, before) }]);
    cost = r.cost;
    try { ops = JSON.parse(r.text.replace(/```(?:json)?/g, "").slice(r.text.indexOf("{"))).ops ?? []; } catch { ops = []; }
  }
  const { lib: next, skipped } = applyRefactor(lib, genre, ops), after = descriptionLength(next, genre).total;
  const kept = after <= before;
  return { lib: kept ? next : lib, note: { ops, skipped, before, after, kept, cost } };
}

// ======== report ========
export const pct = (k: number, n: number) => { if (!n) return "–"; const [a, b] = wilson(k, n); return `${Math.round((100 * k) / n)}% (${Math.round(100 * a)}–${Math.round(100 * b)})`; };
export const meanOf = (xs: number[]) => { const ys = xs.filter(Number.isFinite); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : NaN; };
export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
/** the person's order from the item's state: each mark they settled, first time, at the solution's value */
export function humanOrder(ctx: Ctx): MV[] | null {
  const rec = ctx.item.name ? labelRecs().get(ctx.item.name) : null;
  if (!rec) return null;
  const known = new Set(ctx.item.known.map(([m]) => m)), seen = new Set<string>();
  return (rec.humanOrder as [string, number][]).map(([m]) => m).filter((m) => !known.has(m) && !seen.has(m) && seen.add(m)).map((m): MV => [m, valueOf(ctx, m)]);
}
/** A paired bootstrap of the mean difference by item (95%). */
export function bootstrap(diffs: number[], n = 2000): [number, number] {
  const xs = diffs.filter(Number.isFinite);
  if (!xs.length) return [NaN, NaN];
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const means = Array.from({ length: n }, () => { let t = 0; for (let i = 0; i < xs.length; i++) t += xs[Math.floor(rnd() * xs.length)]; return t / xs.length; }).sort((a, b) => a - b);
  return [means[Math.floor(0.025 * n)], means[Math.floor(0.975 * n)]];
}

interface Scored { id: string; arm: string; verdict: Record<string, boolean>; insights: number; marks: number; rounds: number; cost: number; first?: boolean; al?: { hits: number; n: number }; alp?: { hits: number; n: number }; rho?: number; rhoIns?: number; cite?: number; words: number }
async function scoreRow(ctx: Ctx, arm: string, row: any, ceiling: number): Promise<Scored | null> {
  const last = row.rounds[row.rounds.length - 1] as RoundRec;
  if (!last.walk) return null;
  // re-audited at the ceiling asked for (free: the solver only), so the measures can move with it
  const a = await audit(ctx, last.walk, ceiling, false), order = a.order;
  const verdict: Record<string, boolean> = { sound: sound(a), sufficient: sufficient(a), minimal: minimal(a), grounded: grounded(a), clean: clean(a) };
  const human = humanOrder(ctx), known = new Set([...ctx.item.known.map(([m]) => m), ...ctx.initial]);
  const insMarks = last.walk.insights.flatMap((i) => i.concludes.map((m) => markOfMove(ctx, m)).filter((x): x is MV => !!x));
  const checks = a.checks;
  const s: Scored = {
    id: row.id, arm, verdict, insights: last.walk.insights.length, marks: insMarks.length, rounds: row.rounds.length - 1, cost: row.cost,
    cite: meanOf(checks.map((c) => c.citation?.recall ?? NaN)), words: last.walk.insights.reduce((n, i) => n + i.idea.split(/\s+/).length, 0),
  };
  if (human) {
    s.first = firstIn3(human, order, known);
    s.al = along(human, order, known, (m) => valueOf(ctx, m), 20);
    s.alp = along(human, order, known, (m) => valueOf(ctx, m), 20, true);
    s.rho = spearman(human, order);
    s.rhoIns = spearman(human, insMarks);
  }
  return s;
}
function table(rows: Scored[], arms: string[], base: string): string[] {
  const out = ["| arm | n | clean | sound | sufficient | minimal | grounded | insights | marks/insight | words | rounds | first move in next 3 | along the way | people's kinds | Spearman (all) | Spearman (insights) | cite recall | $ |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const arm of arms) {
    const rs = rows.filter((r) => r.arm === arm);
    if (!rs.length) continue;
    const c = (f: string) => pct(rs.filter((r) => r.verdict[f]).length, rs.length);
    const hs = rs.filter((r) => r.al), sum = (k: "al" | "alp") => [hs.reduce((a, r) => a + r[k]!.hits, 0), hs.reduce((a, r) => a + r[k]!.n, 0)] as const;
    out.push(`| ${arm} | ${rs.length} | ${c("clean")} | ${c("sound")} | ${c("sufficient")} | ${c("minimal")} | ${c("grounded")} | ${f2(meanOf(rs.map((r) => r.insights)))} | ${f2(meanOf(rs.map((r) => r.marks / Math.max(1, r.insights))))} | ${Math.round(meanOf(rs.map((r) => r.words)))} | ${f2(meanOf(rs.map((r) => r.rounds)))} | ${hs.length ? pct(hs.filter((r) => r.first).length, hs.length) : "–"} | ${hs.length ? pct(...sum("al")) : "–"} | ${hs.length ? pct(...sum("alp")) : "–"} | ${f2(meanOf(rs.map((r) => r.rho ?? NaN)))} | ${f2(meanOf(rs.map((r) => r.rhoIns ?? NaN)))} | ${f2(meanOf(rs.map((r) => r.cite ?? NaN)))} | ${rs.reduce((a, r) => a + r.cost, 0).toFixed(2)} |`);
  }
  // paired differences against the base arm, by item
  const b = new Map(rows.filter((r) => r.arm === base).map((r) => [r.id, r]));
  out.push("", `Paired against ${base} (mean difference by item, 95% bootstrap):`, "", "| arm | n | clean | along the way (hit rate) | Spearman (all) | insights |", "|---|---|---|---|---|---|");
  for (const arm of arms.filter((x) => x !== base)) {
    const ps = rows.filter((r) => r.arm === arm && b.has(r.id)).map((r) => [r, b.get(r.id)!] as const);
    if (!ps.length) continue;
    const d = (f: (r: Scored) => number) => { const xs = ps.map(([r, q]) => f(r) - f(q)); const [lo, hi] = bootstrap(xs); return `${f2(meanOf(xs))} (${f2(lo)} to ${f2(hi)})`; };
    out.push(`| ${arm} | ${ps.length} | ${d((r) => +r.verdict.clean)} | ${d((r) => (r.al?.n ? r.al.hits / r.al.n : NaN))} | ${d((r) => r.rho ?? NaN)} | ${d((r) => r.insights)} |`);
  }
  return out;
}
async function report(set: string) {
  const qs = opt("--ceiling-q", "").split(",").filter(Boolean).map(Number);
  const items = new Map(loadSet(set).map((it) => [it.id, it]));
  const out: string[] = [`# Walkthrough loop: ${set}\n`];
  const runs: [string, any[]][] = set === "lib"
    ? [...new Set([...items.values()].map((it) => it.genre))].flatMap((g) => ARMS.map((a): [string, any[]] => [`${g} ${a}`, readJsonl(`${dir(set)}${g}-${a}.jsonl`)]))
    : [["draft", readJsonl(`${dir(set)}draft.jsonl`).map((x) => ({ id: x.id, rounds: [x.rec], cost: x.rec.cost, ceiling: ceilingOf(set, items.get(x.id)?.genre ?? "") }))],
      ...["rounds", "tools"].flatMap((m) => (["A", "B", "C"] as const).map((p): [string, any[]] => [`${m} ${p}`, readJsonl(`${dir(set)}${m}-${p}.jsonl`)]))];
  // the draft is audited here if no run has (draft.jsonl keeps only the reply)
  const ceilings: (number | null)[] = [null, ...qs.map(() => 0)];
  for (const [qi, cq] of ceilings.entries()) {
    const rows: Scored[] = [];
    for (const [arm, rs] of runs) for (const row of rs) {
      const it = items.get(row.id);
      if (!it) continue;
      const ctx = await ctxOf(it);
      // another ceiling: the q-quantile asked for, from the step costs saved by calibrate
      const ceiling = cq === null ? (row.ceiling ?? ceilingOf(set, it.genre)) : await quantileCeiling(set, it.genre, qs[qi - 1]);
      const s = await scoreRow(ctx, arm, row, ceiling).catch(() => null);
      if (s) rows.push(s);
    }
    const arms = runs.map(([a]) => a).filter((a) => rows.some((r) => r.arm === a));
    out.push(cq === null ? "## At the ceiling the loop ran with\n" : `## Re-audited at ceiling quantile ${qs[qi - 1]}\n`);
    if (set === "lib") for (const g of new Set([...items.values()].map((it) => it.genre))) {
      out.push(`### ${g} (test puzzles)\n`, ...table(rows.filter((r) => items.get(r.id)?.part === "test"), arms.filter((a) => a.startsWith(g)), `${g} none`), "");
    } else out.push(...table(rows, arms, "draft"), "");
  }
  if (set === "lib") out.push(...libraryReport([...items.values()]));
  writeFileSync(`${dir(set)}report.md`, out.join("\n"));
  console.log(out.join("\n"));
}
const quantileCache = new Map<string, number[]>();
async function quantileCeiling(set: string, genre: string, q: number): Promise<number> {
  if (!quantileCache.has(genre)) {
    const costs: number[] = [];
    for (const it of loadSet(set).filter((x) => x.genre === genre).slice(0, 10)) {
      const r = await deduce((await ctxOf(it)).spec, { minPeak: true, finish: FINISH, budgetMs: 60000 }).catch(() => null);
      for (const s of r?.path ?? []) if (s.tier <= 1) costs.push(s.cost);
    }
    quantileCache.set(genre, costs.sort((a, b) => a - b));
  }
  const cs = quantileCache.get(genre)!;
  return cs.length ? cs[Math.min(cs.length - 1, Math.floor(q * cs.length))] : DEFAULT_CEILING;
}
/** The library's own measures: growth, reuse, description length against step kinds as a library. */
function libraryReport(items: LoopItem[]): string[] {
  const out = ["## The library\n", "Reuse: share of insights naming an entry. DL: the library's two-part description length (bits) after each puzzle. Kinds baseline: the same insights written with the solver's step kinds as the library (each insight filed under its cheapest step's kind): if the learned library is no shorter, it is only renaming the solver's kinds.\n", "| genre | arm | puzzles | entries (seed / Opus's) | reuse, first third | reuse, last third | seed entries used | DL now | DL with step kinds | refactors kept |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const g of new Set(items.map((it) => it.genre))) for (const base of ["grow", "seeded"]) {
    const rows = readJsonl(`${OUT}lib/${g}-${base}.jsonl`);
    if (!rows.length) continue;
    const f = `${OUT}lib/${g}-${base}-library.json`;
    const lib: Library = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : emptyLibrary();
    const mine = lib.entries.filter((e) => e.genre === g), seeds = mine.filter((e) => e.id.startsWith("S"));
    const reuse = (rs: any[]) => { const ins = rs.flatMap((r) => r.rounds.at(-1).walk?.insights ?? []); return pct(ins.filter((i: Insight) => !!i.uses).length, ins.length); };
    const third = Math.max(1, Math.floor(rows.length / 3));
    // the kinds baseline: entries = step kinds, examples = each insight's idea under its first forced step's kind
    const kinds = emptyLibrary();
    for (const r of rows) {
      const last = r.rounds.at(-1);
      (last.walk?.insights ?? []).forEach((ins: Insight, k: number) => {
        const kind = last.audit?.checks?.[k]?.forced?.[0]?.kind;
        if (!kind) { kinds.free.push({ genre: g, item: r.id, k, idea: ins.idea }); return; }
        let e = kinds.entries.find((x) => x.name === kind);
        if (!e) kinds.entries.push(e = { id: `K${kinds.next++}`, genre: g, name: kind, template: kind.replace(/\+/g, " and "), when: "", concludes: "", examples: [], born: 0 });
        e.examples.push({ item: r.id, k, idea: ins.idea });
      });
    }
    const kept = rows.filter((r) => r.refactor?.kept).length, tried = rows.filter((r) => r.refactor).length;
    out.push(`| ${g} | ${base} | ${rows.length} | ${seeds.length} / ${mine.length - seeds.length} | ${reuse(rows.slice(0, third))} | ${reuse(rows.slice(-third))} | ${seeds.filter((e) => e.examples.length).length} of ${seeds.length} | ${Math.round(descriptionLength(lib, g).total)} | ${Math.round(descriptionLength(kinds, g).total)} | ${kept} of ${tried} |`);
  }
  out.push("", "Known techniques: lib/known-sheet.md lists every entry Opus made (not the seed's) beside the genre's named techniques (walkthrough-known.json) for a blind match.\n");
  // the sheet for the rediscovery check
  const known = JSON.parse(readFileSync(new URL("./walkthrough-known.json", import.meta.url), "utf8")) as Record<string, { name: string; says: string }[]>;
  const key = ["# Which library each sheet entry came from (don't open before matching)\n"];
  const sheet = ["# Library entries and known techniques\n", "Match each entry to a known technique (or none), without looking at which arm or puzzle it came from.\n"];
  for (const g of new Set(items.map((it) => it.genre))) {
    // both libraries' entries in one shuffled list, renumbered, so the matcher can't tell the arms apart
    const es = ["grow", "seeded"].flatMap((base) => { const f = `${OUT}lib/${g}-${base}-library.json`; return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Library).entries.filter((e) => e.genre === g && !e.id.startsWith("S")).map((e) => ({ ...e, base })) : []; });
    if (!es.length) continue;
    const order = shuffled(es, `${SEED} sheet ${g}`);
    sheet.push(`## ${g}\n`, "Known:", ...(known[g] ?? []).map((t, i) => `${i + 1}. **${t.name}**: ${t.says}`), "", "Entries (shuffled):", ...order.map((e, i) => `- E${i + 1}: ${e.template} (when ${e.when}; concludes ${e.concludes}; used ${e.examples.length}×)`), "");
    key.push(`## ${g}`, ...order.map((e, i) => `- E${i + 1}: ${e.base} ${e.id}`), "");
  }
  writeFileSync(`${OUT}lib/known-sheet-key.md`, key.join("\n"));
  writeFileSync(`${OUT}lib/known-sheet.md`, sheet.join("\n"));
  return out;
}

// ======== dry run: the whole loop on the repo's examples, no Opus ========
async function dry() {
  const files = (argv[1] ?? "akari/1,nurikabe/1").split(",");
  let failed = 0;
  for (const f of files) {
    const genre = f.split("/")[0], item: LoopItem = { id: `example-${f.replace("/", "-")}`, set: "example", genre, known: [], file: `${f}.json` };
    const ctx = await ctxOf(item), ceiling = await (async () => {
      const r = await deduce(ctx.spec, { minPeak: true, finish: FINISH, budgetMs: 60000 }), cs = r.path.filter((s) => s.tier <= 1).map((s) => s.cost).sort((a, b) => a - b);
      return cs.length ? cs[Math.floor(0.6 * cs.length)] : DEFAULT_CEILING;
    })();
    console.log(`\n## ${item.id}: ${ctx.marks} marks, reader's ceiling ${ceiling.toFixed(2)}\n`);
    // the stand-in's revision is the solver's own walkthrough: where that isn't clean (a solve that
    // needs search), the loop can't end clean either, and that's the stand-in's limit, not a failure
    const own = await audit(ctx, await mockWalk(ctx, ceiling, false), ceiling, false);
    if (!clean(own)) console.log(`(the stand-in can't finish this one without search: ${own.stall?.open ?? 0} marks left; not counted)\n`);
    for (const p of ["A", "B", "C"] as const) {
      const recs = await refineRounds(ctx, p, ceiling, await draftOf(ctx, ceiling), 3);
      const v = recs.map((r) => r.audit?.verdict);
      console.log(`### ${p}: ${recs.length} round(s); ${v.map((x, k) => `round ${k}: ${x ? Object.entries(x).filter(([, y]) => !y).map(([n]) => `not ${n}`).join(", ") || "clean" : "unparsed"}`).join("; ")}\n`);
      if (p !== "A") console.log(recs[0].feedback?.split("\n").slice(0, 14).join("\n"), "\n");
      else console.log(recs[0].feedback, "\n");
      if (clean(own) && (!recs.at(-1)?.audit?.verdict.clean || recs[0].audit?.verdict.clean)) failed++;
    }
    // the library's bookkeeping on the stand-in's walkthrough
    let lib = emptyLibrary();
    const w = await mockWalk(ctx, ceiling, false);
    w.insights.forEach((i) => (i.new_entry = { name: i.technique, template: `${i.technique}: {clue} forces {cells}`, when: i.technique, concludes: "cells" }));
    lib = absorb(lib, w, item.id, genre);
    const r = await refactorLib(lib, genre);
    console.log(`library: ${lib.entries.length} entries, ${Math.round(descriptionLength(lib, genre).total)} bits; refactor ${JSON.stringify((r.note as any)?.kept)} (${Math.round((r.note as any)?.before ?? 0)} → ${Math.round((r.note as any)?.after ?? 0)} bits)`);
    // the tools answer as they should
    const one = w.insights[0];
    console.log(`tools: does_it_follow(first move) → ${await runTool(ctx, "A", ceiling, "does_it_follow", { insights: [], move: one?.concludes[0] })}; where_reader_stops(all) → ${(await runTool(ctx, "A", ceiling, "where_reader_stops", { insights: w.insights })).split("\n")[0]}`);
  }
  console.log(failed ? `\n${failed} paradigm run(s) did not go from a flagged draft to clean` : "\nevery paradigm went from a flagged draft to clean");
  if (failed) process.exitCode = 1;
}

async function show(set: string, id: string) {
  const it = loadSet(set).find((x) => x.id === id) ?? loadSet(set)[0], ctx = await ctxOf(it);
  console.log(promptOf(ctx, set === "lib" ? "" : undefined));
  const row = readJsonl(`${dir(set)}rounds-${opt("--arm", "A")}.jsonl`).find((x) => x.id === it.id);
  if (row) for (const r of row.rounds) console.log(`\n--- round ${r.round} ---\n${r.feedback ?? "(no audit)"}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "sample") sample(argv[1] ?? "abc");
  else if (cmd === "calibrate") await calibrate(argv[1] ?? "abc");
  else if (cmd === "draft") await draftCmd(argv[1] ?? "abc");
  else if (cmd === "refine") await refineCmd(argv[1] ?? "abc");
  else if (cmd === "library") await libraryCmd(argv[1]);
  else if (cmd === "show") await show(argv[1] ?? "abc", argv[2]);
  else if (cmd === "dry") await dry();
  else await report(argv[1] ?? "abc");
}
