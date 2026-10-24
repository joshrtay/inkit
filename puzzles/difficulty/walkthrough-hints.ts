// The hint test (docs/research-walkthrough-loop.md, "Hints"): which kind of hint helps a stuck solver
// find the next step without giving it away? Each state is a held-out Janko position after the reader
// (the solver up to the genre's cost ceiling) has filled in everything easy: where a person would be
// stuck and ask for help. Each arm is one kind of hint; a weaker model (the student) gets the state
// and the hint and names one cell it is now sure of. A hint works when the student's move is true and
// on the frontier (one solver step, or a short case split, decides it from here), and it is fair when
// it doesn't say the answer.
//
// Arms: none (the floor); two built from the solver's cheapest step with no language model at all
// (solver-where: the row or region; solver-clues: the clues it uses); and from one Opus call per
// state, location, question (Socratic), technique (its name and the general idea), what-if (a
// counterfactual to try), library (a seed entry's ladder, walkthrough-seed.json, filled in for this
// spot), ladder (four rungs, vaguest first, given one at a time until the student gets it: scored by
// rungs needed) and explain (the bottom-out explanation: the ceiling, and the leak control). Opus
// writes them grounded (shown the solver's frontier) or free (on its own), so the solver's part in
// a good hint can be measured too.
//
//   node --no-warnings puzzles/difficulty/walkthrough-hints.ts states [--set abc] [--n 100]       → hints/states.json (free)
//   node --no-warnings puzzles/difficulty/walkthrough-hints.ts write [--grounding solver|free] [--limit N]
//                                                                                  → hints/hints-<grounding>.jsonl (paid: Opus)
//   node --no-warnings puzzles/difficulty/walkthrough-hints.ts student [--model haiku|sonnet] [--repeats 3]
//     [--grounding solver] [--arms none,location,…] [--limit N]                    → hints/student-<model>-<grounding>.jsonl (paid)
//   node --no-warnings puzzles/difficulty/walkthrough-hints.ts report                → hints/report.md (free)
//   node --no-warnings puzzles/difficulty/walkthrough-hints.ts show <state id>       (the prompts and hints for one state)
//   node --no-warnings puzzles/difficulty/walkthrough-hints.ts dry [akari/1,…]       (free: the whole test on the repo's
//     examples, with stand-ins for Opus and the student)
//
// The states come from walkthrough-loop.ts's abc set (`walkthrough-loop.ts sample abc`, and
// `calibrate abc` for the ceilings). LOOP_CAP caps each paid command as there. Output goes to
// references/ml/walkloop/hints/ (local only: the puzzles are Janko's).
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { shuffled } from "./llm-label.ts";
import { draw, moveForm, NAME, readJsonl, rules, VALUES } from "./opus-human.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { cellsInText, hintLeak, type MenuStep, type MoveResult, type MV, rungsNeeded, scoreMove, type SeedEntry } from "./walkthrough-core.ts";
import {
  askOpus, bootstrap, ceilingOf, type Ctx, ctxOf, dir, f2, ledger, loadSeed, loadSet, type LoopItem, markOfMove, markText, meanOf, menu, type Model,
  OPUS, pct, reader, splits, valueOf,
} from "./walkthrough-loop.ts";

const argv = process.argv.slice(2), cmd = argv[0] ?? "report";
const opt = (name: string, d: string) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : d; };
const num = (name: string, d: number) => Number(opt(name, String(d)));
const SEED = "walkthrough-hints 2026-10-22";
const MOCK = process.env.WALK_MOCK === "1" || cmd === "dry";
const CAP = Number(process.env.LOOP_CAP) || 25;
/** the students: low effort, so the hint has room to matter */
const STUDENTS: Record<string, Model> = {
  haiku: { id: "claude-haiku-5-5", openrouter: "anthropic/claude-haiku-5.5", price: { input: 0.1 / 1e6, output: 0.5 / 1e6 }, effort: "low", maxTokens: 8000 },
  sonnet: { id: "claude-sonnet-5-5", openrouter: "anthropic/claude-sonnet-5.5", price: { input: 2 / 1e6, output: 10 / 1e6 }, effort: "low", maxTokens: 8000 },
};
const WRITER: Model = { ...OPUS, maxTokens: 16000 };
export const ARMS = ["none", "solver-where", "solver-clues", "location", "question", "technique", "what-if", "library", "ladder", "explain"] as const;
type Arm = (typeof ARMS)[number];
/** arms that are meant to keep the answer back (explain gives it on purpose) */
const FAIR = new Set<Arm>(["solver-where", "solver-clues", "location", "question", "technique", "what-if", "library", "ladder"]);
const RUNGS = 4;

// ======== states ========
interface Fact { mark: string; value: boolean; text: string }
interface FrontStep { facts: Fact[]; cells: number[]; cost: number; where: string; clues: string[]; kind: string }
interface HintState {
  id: string; item: LoopItem;
  /** what's known once the reader is done: the student's grid */
  known: MV[];
  /** what one step decides from here, cheapest first (or, where no step does, the short case splits) */
  steps: FrontStep[];
  /** every mark the frontier decides (steps and case splits): a student's move there is a success */
  frontier: string[];
  /** the person's next mark from here, when they made one on the frontier */
  human?: string;
}
const OUTDIR = () => dir(opt("--out", "hints"));
const loadStates = (): HintState[] => JSON.parse(readFileSync(`${OUTDIR()}states.json`, "utf8")).states;
const front = (s: MenuStep): FrontStep => ({ facts: s.facts, cells: s.cells, cost: s.cost, where: s.where, clues: s.clues, kind: s.kind });

/** A state from an item: the reader's closure, the frontier there, and the person's next move. */
async function stateOf(it: LoopItem, ceiling: number, humanOrder?: string[]): Promise<HintState | null> {
  const ctx = await ctxOf(it), known = new Map<string, boolean>(it.known);
  const r = await reader(ctx, known, ceiling);
  if (r.solved) return null;
  for (const [m, v] of r.added) known.set(m, v);
  const steps = (await menu(ctx, known)).sort((a, b) => a.cost - b.cost).map(front);
  const split = await splits(ctx, known, ctx.markNames.length);
  if (!steps.length && !split.length) return null;
  const frontier = [...new Set([...steps, ...split].flatMap((s) => s.facts.map((f) => f.mark)))];
  const human = humanOrder?.find((m) => !known.has(m) && !ctx.initial.has(m));
  return { id: it.id, item: it, known: [...known], steps: steps.length ? steps : split.map(front), frontier, ...(human && frontier.includes(human) ? { human } : {}) };
}

async function statesCmd() {
  const set = opt("--set", "abc"), N = num("--n", 100), labels = humanOrders();
  const out: HintState[] = [];
  for (const it of shuffled(set.startsWith("bench:") ? benchItems(set.slice(6), num("--min-rating", 1)) : loadSet(set), SEED)) {
    if (out.length >= N) break;
    const s = await stateOf(it, ceilingOf(set, it.genre), it.name ? labels.get(it.name) : undefined).catch((e) => { console.error(`${it.id}: ${(e as Error).message}`); return null; });
    if (s) out.push(s);
    console.error(`${it.id}: ${s ? `${s.frontier.length} marks on the frontier${s.human ? ", the person's next among them" : ""}` : "skipped (the reader finishes, or nothing follows)"}`);
  }
  writeFileSync(`${OUTDIR()}states.json`, JSON.stringify({ seed: SEED, set, states: out }, null, 1));
  console.log(`${out.length} states → hints/states.json`);
}
/** a benchmark set's stuck states (bench.ts items, already the reader's closure) at or above a human rating */
function benchItems(name: string, minRating: number): LoopItem[] {
  const items: { id: string; genre: string; spec: GridSpec; known: MV[]; anchor: { level?: number; rating?: number } }[] =
    JSON.parse(readFileSync(new URL(`../../references/ml/bench/${name}/items.json`, import.meta.url), "utf8")).items;
  return items.filter((it) => (it.anchor.level ?? it.anchor.rating ?? 0) >= minRating).map((it) => ({ id: it.id, set: "bench", genre: it.genre, known: it.known, spec: it.spec }));
}
/** the person's order of marks by record name (graphs-human-labels.jsonl) */
function humanOrders(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const l of readFileSync(new URL("../../references/ml/graphs-human-labels.jsonl", import.meta.url), "utf8").split("\n")) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    out.set(d.name, (d.humanOrder as [string, number][]).map(([m]) => m));
  }
  return out;
}

// ======== writing the hints (Opus) ========
interface Hints { target?: string; location?: string; question?: string; technique?: string; what_if?: string; library?: { uses?: string; hint?: string }; ladder?: string[]; explain?: string }
const stateCtx = async (s: HintState) => ({ ctx: await ctxOf(s.item), known: new Map<string, boolean>(s.known) });
const genreName = (g: string) => NAME[g] ?? g.replace(/-/g, " ");

function seedBlock(seed: SeedEntry[]): string {
  return seed.map((e, i) => `- S${i + 1} "${e.name}" (when ${e.when}): ${(e.ladder ?? []).join(" / ")}`).join("\n");
}
function writePrompt(ctx: Ctx, s: HintState, grounding: string, seed: SeedEntry[]): string {
  const genre = ctx.item.genre;
  const given = grounding === "solver" ? `
A solver lists what follows next from here by one step, cheapest first (for you, not the person):
${s.steps.slice(0, 6).map((st) => `- ${st.facts.map((f) => f.text).join(", ")}: from ${st.clues.join(", ") || st.where}`).join("\n")}
Aim your hints at one of these, the one a strong person would most likely see next.
` : "";
  return `A person solving this ${genreName(genre)} puzzle has filled in everything easy and is now stuck.

Rules: ${rules(ctx.spec)} The puzzle has exactly one solution.

Where they are:

${draw(ctx.spec, new Map(s.known))}
${given}
Decide what the next step is: the piece of reasoning that gets them moving. Then write hints toward it, each a different kind, each on its own (the person sees one kind only):
- location: where to look (a row, column, region or clue), nothing about why;
- question: one Socratic question that leads them to see it themselves;
- technique: the name of the technique and what it says in general, without applying it here;
- what_if: a "what would happen if …?" for them to try;
- library: pick the one entry below that fits best, and give its question filled in for this spot;
- ladder: four hints, vaguest first, each saying a little more than the one before (the last can come close, but still leaves the final step to them);
- explain: the full explanation, the answer included.

Except in explain, never say what a cell is. Pointing at a cell or clue is fine.

Library entries (id, name, when it applies: its general nudge / its question with slots):
${seedBlock(seed)}

Reply with JSON only:
{"target": "the next step, for us: which cells it decides and why", "location": "…", "question": "…", "technique": "…", "what_if": "…", "library": {"uses": "S<n>", "hint": "…"}, "ladder": ["…", "…", "…", "…"], "explain": "…"}
Rows and columns count from 1; name cells as r3c4.`;
}
/** The top-level JSON objects in a reply, in order: one pass matching braces outside strings (the old
 * try-every-span search was cubic, and its last "{" was a nested object, not the reply). */
const topJson = (text: string): any[] => {
  const t = text.replace(/```(?:json)?/g, ""), out: any[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"' && depth > 0) inStr = true;
    else if (c === "{") { if (depth++ === 0) start = i; }
    else if (c === "}" && depth > 0 && --depth === 0) { try { out.push(JSON.parse(t.slice(start, i + 1))); } catch { /* not JSON */ } }
  }
  return out;
};
const lastJson = (text: string): any => topJson(text).at(-1) ?? null;
/** The stand-in (dry runs): hints from the solver's cheapest step, the leaky ones leaky on purpose. */
function mockHints(ctx: Ctx, s: HintState): Hints {
  const st = s.steps[0], ref = (c: number) => `r${Math.floor(c / ctx.cols) + 1}c${(c % ctx.cols) + 1}`;
  const facts = st.facts.map((f) => f.text).join(", ");
  return {
    target: facts, location: `Look at ${st.where}.`, question: `What does ${st.clues[0] ?? st.where} still need?`, technique: `${st.kind}: a clue that has nearly run out of options decides the rest.`,
    what_if: `What would happen if ${ref(st.cells[0])} went the other way?`, library: { uses: "S3", hint: `How many places around ${st.where} can still help it, and how many does it need?` },
    ladder: [`Look at ${st.where}.`, `Think about ${st.kind}.`, `Look at ${st.cells.map(ref).join(" and ")}.`, `From ${st.clues.join(", ") || st.where}: ${facts}.`], explain: `From ${st.clues.join(", ") || st.where}: ${facts}.`,
  };
}
async function writeCmd() {
  const grounding = opt("--grounding", "solver"), file = `${OUTDIR()}hints-${grounding}.jsonl`, rows = readJsonl(file), done = new Set(rows.filter((x) => x.hints).map((x) => x.id));
  ledger.spent = rows.reduce((t, x) => t + (x.cost ?? 0), 0);
  const seed = loadSeed();
  for (const s of loadStates().slice(0, num("--limit", 1e9))) {
    if (done.has(s.id)) continue;
    if (ledger.spent >= CAP) { console.error(`cap $${CAP} reached`); break; }
    const { ctx } = await stateCtx(s), prompt = writePrompt(ctx, s, grounding, seed);
    try {
      const r = MOCK ? { text: JSON.stringify(mockHints(ctx, s)), cost: 0, finish: "mock" } : await askOpus([{ role: "user", content: prompt }], undefined, WRITER);
      const hints = lastJson(r.text) as Hints | null;
      appendFileSync(file, JSON.stringify({ id: s.id, grounding, hints, cost: r.cost, finish: r.finish, text: r.text, at: new Date().toISOString() }) + "\n");
      console.error(`${s.id}: ${hints ? "ok" : "unparsed"}, $${r.cost.toFixed(3)} (total $${ledger.spent.toFixed(2)})`);
    } catch (e) { console.error(`${s.id}: ${(e as Error).message}`); }
  }
}

// ======== the hint each arm gives ========
/** "Look at row 3", "Look around r4c3" (the solver's places can start with around or near) */
const look = (where: string) => (/^(around|near) /.test(where) ? `Look ${where}` : `Look at ${where}`);
/** The hint text for an arm (a ladder gives its rungs), or null where the writer gave none. */
function hintOf(arm: Arm, s: HintState, h: Hints | null, seed: SeedEntry[]): string[] | null {
  const st = s.steps[0];
  switch (arm) {
    case "none": return [];
    case "solver-where": return st.where ? [`${look(st.where)}.`] : null;
    case "solver-clues": {
      // the rule instances behind the step, "lit (row 3)", grouped by place: "Look at row 3 (lit)."
      const by = new Map<string, string[]>();
      for (const c of st.clues) { const q = /^(.*?) \((.*)\)$/.exec(c), at = q?.[2] ?? c; by.set(at, [...(by.get(at) ?? []), ...(q ? [q[1]] : [])]); }
      return by.size ? [`${look([...by].map(([at, ks]) => (ks.length ? `${at} (${ks.join(", ")})` : at)).join(" and "))} together.`] : null;
    }
    case "location": return h?.location ? [h.location] : null;
    case "question": return h?.question ? [h.question] : null;
    case "technique": return h?.technique ? [h.technique] : null;
    case "what-if": return h?.what_if ? [h.what_if] : null;
    case "library": {
      const e = seed[Number(String(h?.library?.uses ?? "").replace(/^S/i, "")) - 1];
      return e && h?.library?.hint ? [`${e.ladder?.[0] ?? e.name} ${h.library.hint}`] : null;
    }
    case "ladder": return h?.ladder?.length ? h.ladder.slice(0, RUNGS) : null;
    case "explain": return h?.explain ? [h.explain] : null;
  }
}
/** The words that say a frontier mark's value, either way ("bulb", "no bulb"; a digit as itself). */
function leakTargets(ctx: Ctx, s: HintState): { cells: number[]; words: string[] }[] {
  const out: { cells: number[]; words: string[] }[] = [];
  for (const st of s.steps) for (const f of st.facts) {
    const d = /^digit\(\d+,(\d+)\)$/.exec(f.mark), w = VALUES[ctx.item.genre];
    out.push({ cells: st.cells, words: d ? [d[1]] : w ? [...w] : ["yes", "no"] });
  }
  return out;
}

// ======== the student ========
function studentPrompt(ctx: Ctx, s: HintState, hints: string[]): string {
  const genre = ctx.item.genre;
  const coach = hints.length === 0 ? "" : hints.length === 1 ? `\nA coach gives you a hint: ${hints[0]}\n` : `\nA coach gives you hints, one after another:\n${hints.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n`;
  return `You are solving this ${genreName(genre)} puzzle.

Rules: ${rules(ctx.spec)} The puzzle has exactly one solution.

Where you are:

${draw(ctx.spec, new Map(s.known))}
${coach}
Name one undecided cell whose value you can now be certain of from the rules, the clues and what is filled in, and say why in a line. Only answer if you are sure: a wrong answer is worse than none.

Reply with JSON only: ${moveForm(genre)}, or {"stuck": true} if you can't be sure of anything.
Rows and columns count from 1.`;
}
/** The stand-in student: it takes a named frontier cell when the hint names one, otherwise guesses
 *  (seeded) half the time, so the scoring has every outcome to count. */
function mockStudent(ctx: Ctx, s: HintState, hints: string[], key: string): string {
  const named = new Set(hints.flatMap((h) => cellsInText(h, ctx.rows, ctx.cols)));
  const st = s.steps.find((x) => x.cells.some((c) => named.has(c)));
  if (st) return JSON.stringify({ at: `mark:${st.facts[0].mark}`, value: String(st.facts[0].value) });
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (h % 2) return JSON.stringify({ stuck: true });
  const open = ctx.markNames.filter((m) => !s.known.some(([k]) => k === m) && !ctx.initial.has(m));
  return JSON.stringify({ at: `mark:${open[h % open.length]}`, value: String(h % 3 === 0) });
}
interface Try { id: string; arm: Arm; repeat: number; rung?: number; result: MoveResult; human?: boolean; move?: unknown; cost: number }
async function ask(ctx: Ctx, s: HintState, hints: string[], who: Model, key: string): Promise<{ result: MoveResult; human: boolean; move: unknown; cost: number }> {
  const r = MOCK ? { text: mockStudent(ctx, s, hints, key), cost: 0 } : await askOpus([{ role: "user", content: studentPrompt(ctx, s, hints) }], undefined, who);
  const move = lastJson(r.text), mv = move && !move.stuck ? markOfMove(ctx, move) : null;
  const known = new Set([...s.known.map(([m]) => m), ...ctx.initial]);
  const result = scoreMove(mv, (m) => valueOf(ctx, m), known, new Set(s.frontier));
  return { result, human: !!mv && mv[0] === s.human, move, cost: r.cost };
}
async function studentCmd() {
  const name = opt("--model", "haiku"), who = STUDENTS[name], grounding = opt("--grounding", "solver"), repeats = num("--repeats", name === "haiku" ? 3 : 2);
  if (!who) throw new Error(`no student ${name}`);
  const arms = opt("--arms", ARMS.join(",")).split(",") as Arm[];
  const file = `${OUTDIR()}student-${name}-${grounding}.jsonl`, rows = readJsonl(file) as Try[];
  const done = new Set(rows.map((x) => `${x.id} ${x.arm} ${x.repeat}`));
  ledger.spent = rows.reduce((t, x) => t + (x.cost ?? 0), 0);
  const hintsBy = new Map(readJsonl(`${OUTDIR()}hints-${grounding}.jsonl`).map((x) => [x.id, x.hints as Hints | null]));
  const seed = loadSeed(), skip = new Set(opt("--skip", "").split(","));
  for (const s of loadStates().slice(0, num("--limit", 1e9))) {
    if (skip.has(s.id)) continue;
    const { ctx } = await stateCtx(s);
    for (const arm of arms) for (let rep = 0; rep < repeats; rep++) {
      if (done.has(`${s.id} ${arm} ${rep}`)) continue;
      if (ledger.spent >= CAP) { console.error(`cap $${CAP} reached`); return; }
      const hs = hintOf(arm, s, hintsBy.get(s.id) ?? null, seed);
      if (!hs) continue;
      try {
        if (arm === "ladder") {
          // one rung more each time, until the student gets it or the rungs run out
          let cost = 0;
          for (let k = 1; k <= hs.length; k++) {
            const a = await ask(ctx, s, hs.slice(0, k), who, `${s.id} ${arm} ${rep} ${k}`);
            cost += a.cost;
            if (a.result === "success" || k === hs.length) { appendFileSync(file, JSON.stringify({ id: s.id, arm, repeat: rep, rung: a.result === "success" ? k : RUNGS + 1, result: a.result, human: a.human, move: a.move, cost } satisfies Try) + "\n"); break; }
          }
        } else {
          const a = await ask(ctx, s, hs, who, `${s.id} ${arm} ${rep}`);
          appendFileSync(file, JSON.stringify({ id: s.id, arm, repeat: rep, result: a.result, human: a.human, move: a.move, cost: a.cost } satisfies Try) + "\n");
        }
      } catch (e) { console.error(`${s.id} ${arm}: ${(e as Error).message}`); }
    }
    console.error(`${s.id}: done (total $${ledger.spent.toFixed(2)})`);
  }
}

// ======== report ========
interface ArmRow { arm: Arm; n: number; states: number; success: number; correct: number; wrong: number; none: number; human: number; leak: number; pinpoint: number; hints: number; words: number; delta: number; ci: [number, number]; rungs?: number[] }
/** One student and grounding: per arm, outcomes over state × repeat, the paired gain over no hint
 *  (per state, bootstrapped), and the hint's own leak, pinpointing and length. */
function armTable(states: HintState[], ctxs: Map<string, Ctx>, tries: Try[], hintsBy: Map<string, Hints | null>, seed: SeedEntry[], only?: Set<string>): ArmRow[] {
  const per = (arm: Arm) => {
    const by = new Map<string, Try[]>();
    for (const t of tries) if (t.arm === arm && (!only || only.has(t.id))) by.set(t.id, [...(by.get(t.id) ?? []), t]);
    return by;
  };
  const rate = (ts: Try[]) => ts.filter((t) => t.result === "success").length / ts.length;
  const floor = per("none");
  const out: ArmRow[] = [];
  for (const arm of ARMS) {
    const by = per(arm), all = [...by.values()].flat();
    if (!all.length) continue;
    let leak = 0, pinpoint = 0, hints = 0, words = 0;
    for (const s of states) {
      if (!by.has(s.id)) continue;
      const hs = hintOf(arm, s, hintsBy.get(s.id) ?? null, seed);
      if (!hs?.length) continue;
      const ctx = ctxs.get(s.id)!, l = hintLeak(hs.join("\n"), leakTargets(ctx, s), ctx.rows, ctx.cols);
      hints++; leak += +l.leak; pinpoint += +l.pinpoint; words += hs.join(" ").split(/\s+/).length;
    }
    const diffs = [...by].filter(([id]) => floor.has(id)).map(([id, ts]) => rate(ts) - rate(floor.get(id)!));
    const k = (r: MoveResult) => all.filter((t) => t.result === r).length;
    out.push({
      arm, n: all.length, states: by.size, success: k("success"), correct: k("correct"), wrong: k("wrong"), none: k("none") + k("already"), human: all.filter((t) => t.human).length,
      leak, pinpoint, hints, words: hints ? words / hints : NaN, delta: meanOf(diffs), ci: bootstrap(diffs),
      ...(arm === "ladder" ? { rungs: all.map((t) => t.rung ?? RUNGS + 1) } : {}),
    });
  }
  return out;
}
function renderTable(rows: ArmRow[]): string[] {
  const lines = ["| arm | n | success | true leap | wrong | no answer | vs none (95%) | the person's next | hint leaks | names the cell | words |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const r of rows) lines.push(`| ${r.arm}${FAIR.has(r.arm) ? "" : r.arm === "explain" ? " (gives the answer)" : ""} | ${r.n} | ${pct(r.success, r.n)} | ${pct(r.correct, r.n)} | ${pct(r.wrong, r.n)} | ${pct(r.none, r.n)} | ${r.arm === "none" ? "–" : `${f2(r.delta)} (${f2(r.ci[0])} to ${f2(r.ci[1])})`} | ${pct(r.human, r.success)} | ${r.arm === "none" ? "–" : pct(r.leak, r.hints)} | ${r.arm === "none" ? "–" : pct(r.pinpoint, r.hints)} | ${r.arm === "none" ? "–" : Math.round(r.words)} |`);
  const lad = rows.find((r) => r.rungs);
  if (lad?.rungs) {
    const at = (k: number) => lad.rungs!.filter((x) => x <= k).length;
    lines.push("", `Ladder: mean rungs ${f2(meanOf(lad.rungs))} (${RUNGS + 1} = not found); found by rung 1: ${pct(at(1), lad.n)}, 2: ${pct(at(2), lad.n)}, 3: ${pct(at(3), lad.n)}, 4: ${pct(at(4), lad.n)}.`);
  }
  return lines;
}
async function report() {
  const states = loadStates(), seed = loadSeed(), ctxs = new Map<string, Ctx>();
  for (const s of states) ctxs.set(s.id, (await stateCtx(s)).ctx);
  const lines = [`# The hint test`, "", `${states.length} stuck states (the reader's closure of held-out Janko positions). Success: the student's move is true and on the frontier. True leap: true, but nothing decides it in one step from here (a lucky guess, or reasoning past the frontier). "vs none" is the paired gain in success per state over no hint. A hint leaks when one sentence names a frontier cell and a word for its value; it names the cell when it points at one.`, ""];
  for (const f of readdirHints()) {
    const [, name, grounding] = /^student-(\w+)-(\w+)\.jsonl$/.exec(f)!;
    const tries = readJsonl(`${OUTDIR()}${f}`) as Try[], hintsBy = new Map(readJsonl(`${OUTDIR()}hints-${grounding}.jsonl`).map((x) => [x.id, x.hints as Hints | null]));
    lines.push(`## Student ${name}, hints written ${grounding === "solver" ? "with the solver's frontier" : "without the solver"}`, "", ...renderTable(armTable(states, ctxs, tries, hintsBy, seed)), "");
    // headroom: the states the student can't do alone (no success in any repeat without a hint)
    const floor = new Map<string, boolean>();
    for (const t of tries) if (t.arm === "none") floor.set(t.id, (floor.get(t.id) ?? false) || t.result === "success");
    const hard = new Set([...floor].filter(([, ok]) => !ok).map(([id]) => id));
    lines.push(`On the ${hard.size} states the student never gets alone:`, "", ...renderTable(armTable(states, ctxs, tries, hintsBy, seed, hard)), "");
    lines.push(`Cost: $${tries.reduce((t, x) => t + (x.cost ?? 0), 0).toFixed(2)}.`, "");
  }
  for (const g of ["solver", "free"]) {
    const rows = readJsonl(`${OUTDIR()}hints-${g}.jsonl`);
    if (rows.length) lines.push(`Writing the hints (${g}): ${rows.length} states, ${rows.filter((x) => !x.hints).length} unparsed, $${rows.reduce((t, x) => t + (x.cost ?? 0), 0).toFixed(2)}.`);
  }
  writeFileSync(`${OUTDIR()}report.md`, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}
const readdirHints = (): string[] => readdirSync(OUTDIR()).filter((f) => /^student-\w+-\w+\.jsonl$/.test(f)).sort();

async function show(id: string) {
  const s = loadStates().find((x) => x.id === id) ?? loadStates()[0], { ctx } = await stateCtx(s), seed = loadSeed();
  console.log(writePrompt(ctx, s, opt("--grounding", "solver"), seed));
  const h = readJsonl(`${OUTDIR()}hints-${opt("--grounding", "solver")}.jsonl`).find((x) => x.id === s.id)?.hints ?? null;
  for (const arm of ARMS) console.log(`\n--- ${arm} ---\n${hintOf(arm, s, h, seed)?.join("\n") ?? "(none)"}`);
  console.log(`\nfrontier: ${s.steps.slice(0, 6).map((st) => st.facts.map((f) => f.text).join(", ")).join("; ")}`);
}

// ======== dry run: the whole test on the repo's examples, with stand-ins ========
async function dry() {
  const files = (argv[1] ?? "akari/1,slitherlink/1,skyscrapers/1").split(","), seed = loadSeed();
  let failed = 0;
  for (const f of files) {
    const genre = f.split("/")[0], item: LoopItem = { id: `example-${f.replace("/", "-")}`, set: "example", genre, known: [], file: `${f}.json` };
    // a stuck state: the reader at a low ceiling, so there's something left for a hint
    const s = await stateOf(item, 1);
    if (!s) { console.log(`${f}: the reader finishes it; no stuck state`); continue; }
    const ctx = await ctxOf(item), h = mockHints(ctx, s), tries: Try[] = [];
    console.log(`\n## ${item.id}: ${s.frontier.length} marks on the frontier; cheapest step ${s.steps[0].facts.map((x) => x.text).join(", ")} (${s.steps[0].kind})\n`);
    for (const arm of ARMS) {
      const hs = hintOf(arm, s, h, seed)!;
      for (let rep = 0; rep < 3; rep++) {
        if (arm === "ladder") {
          for (let k = 1; k <= hs.length; k++) {
            const a = await ask(ctx, s, hs.slice(0, k), STUDENTS.haiku, `${s.id} ${arm} ${rep} ${k}`);
            if (a.result === "success" || k === hs.length) { tries.push({ id: s.id, arm, repeat: rep, rung: a.result === "success" ? k : RUNGS + 1, result: a.result, cost: 0 }); break; }
          }
        } else tries.push({ id: s.id, arm, repeat: rep, ...(await ask(ctx, s, hs, STUDENTS.haiku, `${s.id} ${arm} ${rep}`)) });
      }
    }
    const rows = armTable([s], new Map([[s.id, ctx]]), tries, new Map([[s.id, h]]), seed);
    console.log(renderTable(rows).join("\n"));
    // what must hold: the bottom-out explanation leaks and works; a location-only hint doesn't leak
    const get = (a: Arm) => rows.find((r) => r.arm === a)!;
    if (get("explain").leak !== 1 || get("explain").success !== 3) { console.log("explain should leak and always work"); failed++; }
    if (get("solver-where").leak !== 0) { console.log("solver-where should not leak"); failed++; }
    if (get("ladder").rungs!.some((x) => x > 3)) { console.log("the stand-in should get the ladder by rung 3, where the cells are named"); failed++; }
    console.log(`\nthe solver's hints: ${hintOf("solver-where", s, h, seed)} / ${hintOf("solver-clues", s, h, seed)}`);
    console.log(`\nstudent prompt with the ladder's first two rungs:\n\n${studentPrompt(ctx, s, hintOf("ladder", s, h, seed)!.slice(0, 2)).split("\n").slice(-8).join("\n")}`);
    console.log(`\nwriter prompt (grounded), last lines:\n\n${writePrompt(ctx, s, "solver", seed).split("\n").slice(-6).join("\n")}`);
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nthe dry run's checks hold");
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "states") await statesCmd();
  else if (cmd === "write") await writeCmd();
  else if (cmd === "student") await studentCmd();
  else if (cmd === "show") await show(argv[1]);
  else if (cmd === "dry") await dry();
  else await report();
}
