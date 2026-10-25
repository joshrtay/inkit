// Whole solves for the calibration benchmark (docs/research-calibration-benchmarks.md, parts C and E):
// the model solves a puzzle from the empty grid in turns, each turn listing every move it is now
// certain of. The harness applies them in order against the unique solution; the first wrong move
// is counted and it and the rest of that turn are dropped. In hint mode (Thinky Dailies only) a wrong
// move, or a turn with nothing new, reveals the author's next hint; earlier hints stay shown. With no
// hints, the same loop is the plain whole solve, so "hints helped" is a paired difference.
//
// A puzzle is solved when every positive mark (each bulb, star, shaded cell, line, digit) is placed;
// the negative ones are implied. Measures per run: solved, the share of positive marks placed,
// turns, wrong moves, and (hint mode) hints shown as a share of the ladder, since ladder length
// itself tracks the author's rating.
//
//   node --no-warnings puzzles/difficulty/bench-solve.ts puzzles <set> [--per-band 1] [--limit N]   → solve-<set>/puzzles.json (free)
//   node --no-warnings puzzles/difficulty/bench-solve.ts run <set> <model>:<effort>:<format>[,…] [--hints [--long]] [--turns 12]
//     [--limit N | --sample N] [--jobs 6]                                         → solve-<set>/runs/<taker>[-hints].jsonl (paid; resumable)
//   node --no-warnings puzzles/difficulty/bench-solve.ts ladders <set> [--limit N]  → solve-<set>/ladders-ours.jsonl (paid: our chapter ladders)
//     run … --hints --ladder ours [--full]: solve with our ladders instead of the author's; --full gives every run turns + ladder length
//   node --no-warnings puzzles/difficulty/bench-solve.ts recall <model>:<effort> [--limit N]  (Thinky contamination check: hints from the title alone)
//   node --no-warnings puzzles/difficulty/bench-solve.ts report <set>              → solve-<set>/report.md (free)
//   node --no-warnings puzzles/difficulty/bench-solve.ts show <set> [puzzle id]     (the first turn's prompt)
//
// Sets as bench.ts: thinky, puzzlink (banded by rating), psjp, examples. BENCH_CAP (dollars, default
// 10) stops a command before its ledger would pass it. Output under references/ml/bench/ (local only).
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { dir, type Format, pct, type Puzzle, puzzlesOf, spearmanXY, takerOf } from "./bench.ts";
import { shuffled } from "./llm-label.ts";
import { draw, listed, markOf, moveForm, NAME, readJsonl, rules } from "./opus-human.ts";
import { mapPool } from "./pool.ts";
import { type MV } from "./walkthrough-core.ts";
import { deduce } from "./deduce.ts";
import { askOpus, ctxOf, DEFAULT_CEILING, FINISH, ledger, loadSeed, OPUS } from "./walkthrough-loop.ts";

const repo = new URL("../../", import.meta.url).pathname;
const argv = process.argv.slice(2), cmd = argv[0] ?? "report";
const opt = (name: string, d: string) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : d; };
const num = (name: string, d: number) => Number(opt(name, String(d)));
const CAP = Number(process.env.BENCH_CAP) || 10;

interface SolvePuzzle extends Puzzle { hints?: string[]; title?: string }

// ======== puzzles ========
/** Thinky's hint ladders by slug, as plain text (the scrape keeps them in order). */
function thinkyHints(): Map<string, { hints: string[]; title: string; author: string }> {
  const d = JSON.parse(readFileSync(`${repo}references/thinky-dailies/thinky-dailies.json`, "utf8"));
  const out = new Map<string, { hints: string[]; title: string; author: string }>();
  for (const p of d.puzzles ?? d.list ?? []) out.set(String(p.slug), { hints: (p.hints ?? []).map((h: any) => String(h.hint ?? "").trim()).filter(Boolean), title: String(p.title ?? ""), author: String(p.author?.displayName ?? "") });
  return out;
}
function puzzlesCmd(set: string) {
  let ps: SolvePuzzle[] = puzzlesOf(set).slice(0, num("--limit", Infinity));
  if (set === "thinky") {
    const h = thinkyHints();
    ps = ps.map((p) => { const t = h.get(p.id.replace(/^thinky-/, "")); return { ...p, hints: t?.hints ?? [], title: t?.title }; });
  }
  writeFileSync(`${dir(`solve-${set}`)}puzzles.json`, JSON.stringify({ set, puzzles: ps }, null, 1));
  const byGenre = new Map<string, number>();
  for (const p of ps) byGenre.set(p.genre, (byGenre.get(p.genre) ?? 0) + 1);
  console.log(`${ps.length} puzzles (${[...byGenre].map(([g, n]) => `${g} ${n}`).join(", ")}) → solve-${set}/puzzles.json`);
}
const loadPuzzles = (set: string): SolvePuzzle[] => JSON.parse(readFileSync(`${dir(`solve-${set}`)}puzzles.json`, "utf8")).puzzles;

// ======== a solve ========
const nameOf = (g: string) => NAME[g] ?? g.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const one = (genre: string) => moveForm(genre).replace(/, "reason": "one line"\}.*$/, "}");
export function turnPrompt(p: SolvePuzzle, known: Map<string, boolean>, format: Format, hints: string[], note: string): string {
  const start = [...known.values()].every((v) => v === false) && known.size === 0;
  return `Here is a ${nameOf(p.genre)} puzzle${start ? "" : ", partly solved"}.

Rules: ${rules(p.spec)} The puzzle has exactly one solution.

The grid:

${draw(p.spec, known)}${format === "listed" ? `\n\n${listed(p.spec, known)}` : ""}
${hints.length ? `\nHints from the puzzle's author, in order (the last is the newest):\n${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n` : ""}${note ? `\n${note}\n` : ""}
List every move you are now certain of, in the order you deduce them, each following by logic from the rules, the clues, what is decided and your earlier moves in the list. Don't guess: a wrong move is checked, and it and every move after it are thrown away. You don't need to mark cells empty or lines absent unless it helps you; the puzzle is finished when every ${p.genre === "skyscrapers" || p.genre === "sudoku" || p.genre === "hidoku" || p.genre === "easy-as-abc" ? "cell is filled" : "positive mark is placed"}. If you are certain of nothing new, give an empty list.

End your reply with JSON: {"moves": [${one(p.genre)}, …]}. Rows and columns count from 1.`;
}
function movesOf(text: string): any[] | null {
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1))
    for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
      try { const x = JSON.parse(text.slice(start, end + 1)); if (x && Array.isArray(x.moves)) return x.moves; } catch { /* not this span */ }
    }
  return null;
}

interface Run {
  id: string; taker: string; hints: boolean; solved: boolean; placed: number; positives: number;
  turns: number; wrong: number; shown: number; ladder: number; cost: number; stop: string; ms: number;
  log: { turn: number; got: number; listed: number; unread?: number; wrong?: string; hint?: number; finish?: string }[];
}
async function solveOne(p: SolvePuzzle, taker: ReturnType<typeof takerOf>, withHints: boolean, maxTurns: number): Promise<Run> {
  const t0 = Date.now(), ctx = await ctxOf({ id: p.id, set: "bench", genre: p.genre, known: [], spec: p.spec });
  const truth = (m: string) => ctx.truth.get(m) ?? false;
  const known = new Map<string, boolean>();
  for (const m of ctx.initial) known.set(m, truth(m));
  const positives = ctx.markNames.filter((m) => truth(m));
  const ladder = withHints ? (p.hints ?? []) : [];
  let shown = 0, wrong = 0, cost = 0, idle = 0, note = "", stop = "turns";
  const log: Run["log"] = [];
  const placed = () => positives.filter((m) => known.get(m) === true).length;
  let turn = 0;
  for (; turn < maxTurns; turn++) {
    if (placed() === positives.length) { stop = "solved"; break; }
    if (ledger.spent > CAP) { stop = "cap"; break; }
    const r = await askOpus([{ role: "user", content: turnPrompt(p, known, taker.format, ladder.slice(0, shown), note) }], undefined, taker.model);
    cost += r.cost;
    const moves = movesOf(r.text) ?? [];
    let got = 0, unread = 0, bad: string | undefined;
    for (const mv of moves) {
      const mark: MV | null = markOf(p.spec, mv);
      if (!mark) { unread++; continue; } // unreadable: skipped, not counted wrong
      if (known.has(mark[0])) { if (known.get(mark[0]) !== mark[1]) { bad = `${mv.at} ${mv.value}`; break; } continue; }
      if (truth(mark[0]) !== mark[1]) { bad = `${mv.at} ${mv.value}`; break; }
      known.set(mark[0], mark[1]);
      got++;
    }
    note = bad ? `Your move ${bad} was wrong; it and the moves after it were not applied. The grid shows the moves that were right.` : "";
    if (bad) wrong++;
    const stuck = got === 0;
    let hint: number | undefined;
    if ((bad || stuck) && shown < ladder.length) hint = ++shown;
    log.push({ turn: turn + 1, got, listed: moves.length, ...(unread ? { unread } : {}), ...(bad ? { wrong: bad } : {}), ...(hint ? { hint } : {}), finish: r.finish });
    idle = stuck && !hint ? idle + 1 : 0;
    if (idle >= 2) { stop = "stuck"; turn++; break; }
  }
  if (placed() === positives.length) stop = "solved";
  return { id: p.id, taker: taker.name, hints: withHints, solved: stop === "solved", placed: placed(), positives: positives.length, turns: turn, wrong, shown, ladder: ladder.length, cost, stop, ms: Date.now() - t0, log };
}

async function runCmd(set: string, takers: string) {
  const all = loadPuzzles(set), n = num("--sample", 0), withHints = argv.includes("--hints");
  if (withHints && set !== "thinky") throw new Error("hints are Thinky's only");
  const ps = (n ? shuffled(all, `bench solve ${set}`).slice(0, n) : all.slice(0, num("--limit", Infinity))).filter((p) => !withHints || (p.hints?.length ?? 0) > 0);
  // --long: redo the hint runs that ended unsolved, with room for every rung (turns + the ladder's length);
  // --full: every run gets that room; --ladder ours: our chapter ladders in place of the author's
  const long = withHints && argv.includes("--long"), full = withHints && argv.includes("--full"), ours = withHints && opt("--ladder", "") === "ours";
  if (ours) {
    const L = new Map(readJsonl(`${dir(`solve-${set}`)}ladders-ours.jsonl`).filter((x) => x.ladder?.length).map((x) => [x.id, x.ladder as string[]]));
    for (let i = ps.length - 1; i >= 0; i--) { const l = L.get(ps[i].id); if (l) ps[i] = { ...ps[i], hints: l }; else ps.splice(i, 1); }
  }
  for (const t of takers.split(",").map(takerOf)) {
    const base = `${dir(`solve-${set}`, "runs/")}${t.name}${withHints ? "-hints" : ""}${ours ? "-ours" : ""}`, f = `${base}${long ? "-long" : full ? "-full" : ""}.jsonl`;
    const unsolved = long ? new Set(readJsonl(`${base}.jsonl`).filter((r: Run) => !r.solved).map((r: Run) => r.id)) : null;
    const done = new Set(readJsonl(f).map((r: Run) => r.id)), todo = ps.filter((p) => !done.has(p.id) && (!unsolved || unsolved.has(p.id)));
    console.error(`${t.name}${withHints ? " with hints" : ""}: ${todo.length} to solve (${done.size} done)`);
    await mapPool(todo, async (p) => {
      if (ledger.spent > CAP) return;
      try {
        const r = await solveOne(p, t, withHints, num("--turns", 12) + (long || full ? p.hints?.length ?? 0 : 0));
        if (r.stop !== "cap") appendFileSync(f, JSON.stringify(r) + "\n");
        console.error(`${p.id} ${t.name}: ${r.solved ? "solved" : r.stop} in ${r.turns} turns, ${r.placed}/${r.positives}, ${r.wrong} wrong${withHints ? `, ${r.shown}/${r.ladder} hints` : ""}, $${r.cost.toFixed(3)}`);
      } catch (e) { console.error(`${p.id} ${t.name}: ${(e as Error).message}`); }
    }, num("--jobs", 6));
    console.error(`${t.name}: done; $${ledger.spent.toFixed(2)} spent so far`);
  }
}

// ======== our ladders ========
/** The solve's key steps, for the writer only: the path's steps a reader at the ceiling can't take
 *  (tier 2 or dearer), in order, with how many easy steps fall between. */
async function outlineOf(p: SolvePuzzle): Promise<{ where: string; facts: string[]; easyBefore: number }[]> {
  const r = await deduce(p.spec, { finish: FINISH, budgetMs: 120000 });
  const out: { where: string; facts: string[]; easyBefore: number }[] = [];
  let easy = 0;
  for (const st of r.path) {
    if (st.tier >= 2 || st.cost > DEFAULT_CEILING) { out.push({ where: st.where, facts: st.facts.slice(0, 5).map((f) => f.text), easyBefore: easy }); easy = 0; }
    else easy++;
  }
  // at most 12, evenly spaced and in order
  if (out.length <= 12) return out;
  const keep = new Set<number>();
  for (let k = 0; k < 12; k++) keep.add(Math.round((k * (out.length - 1)) / 11));
  return out.filter((_, i) => keep.has(i));
}
function ladderPrompt(p: SolvePuzzle, initial: Map<string, boolean>, outline: { where: string; facts: string[]; easyBefore: number }[]): string {
  const seed = loadSeed();
  return `You are writing the hints for a ${nameOf(p.genre)} puzzle, shown to a player who asks for help.

Rules: ${rules(p.spec)} The puzzle has exactly one solution.

The puzzle:

${draw(p.spec, initial)}

A solver's walk through it, for you (not the player): its key steps in order, the ones that need a real idea, with the number of easy steps (simple rule applications) before each.
${outline.map((o, i) => `${i + 1}. (${o.easyBefore} easy steps first) at ${o.where}: ${o.facts.join(", ")}`).join("\n")}

Write the hints as chapters of the solve, in order. A chapter is one key idea (merge key steps that are the same idea in the same place; leave the easy steps to the player, mentioning them only as "fill in what follows"). Each chapter has three depths, shown one at a time:
- look: where to look (a row, column, region, clue or cells), not why;
- idea: the kind of reasoning that works there and a question that leads to it, without the answer (you may use one of the patterns below);
- step: what follows and why, plainly, so a player who reads it can make the move.
Before the chapters, one theme line: what this puzzle's solve is about, without giving any step away.
Use as many chapters as the puzzle needs (more for a harder one), at most 10. Name cells as r3c4 (rows and columns count from 1). For each chapter also give one mark its step decides, as {"at": "r3c4", "value": …} in the form ${one(p.genre)}, so we can check it.

Patterns (name: when it applies / its general nudge):
${seed.map((e) => `- ${e.name}: ${e.when} / ${(e.ladder ?? [])[0] ?? ""}`).join("\n")}

Reply with JSON only: {"theme": "…", "chapters": [{"look": "…", "idea": "…", "step": "…", "decides": {…}}, …]}`;
}
async function laddersCmd(set: string) {
  const file = `${dir(`solve-${set}`)}ladders-ours.jsonl`, rows = readJsonl(file), done = new Set(rows.filter((x) => x.ladder?.length).map((x) => x.id));
  ledger.spent = rows.reduce((t, x) => t + (x.cost ?? 0), 0);
  const ps = loadPuzzles(set).filter((p) => (p.hints?.length ?? 0) > 0 && !done.has(p.id)).slice(0, num("--limit", Infinity));
  const writer = { ...OPUS, maxTokens: 24000 };
  await mapPool(ps, async (p) => {
    if (ledger.spent > CAP) return;
    try {
      const ctx = await ctxOf({ id: p.id, set: "bench", genre: p.genre, known: [], spec: p.spec });
      const initial = new Map<string, boolean>([...ctx.initial].map((m) => [m, ctx.truth.get(m) ?? false]));
      const outline = await outlineOf(p);
      const r = await askOpus([{ role: "user", content: ladderPrompt(p, initial, outline) }], undefined, writer);
      const j = topLevelJson(r.text).find((x) => Array.isArray(x?.chapters));
      const chapters: { look?: string; idea?: string; step?: string; decides?: any }[] = j?.chapters ?? [];
      // the check: each chapter's claimed mark against the answer
      const check = chapters.map((c) => { const m = c.decides ? markOf(p.spec, c.decides) : null; return m ? ((ctx.truth.get(m[0]) ?? false) === m[1] ? "true" : "false") : "unread"; });
      const ladder = [...(j?.theme ? [String(j.theme)] : []), ...chapters.flatMap((c) => [c.look, c.idea, c.step].filter(Boolean).map(String))];
      appendFileSync(file, JSON.stringify({ id: p.id, theme: j?.theme, chapters, check, ladder, keySteps: outline.length, cost: r.cost, finish: r.finish, ...(j ? {} : { text: r.text }) }) + "\n");
      console.error(`${p.id}: ${chapters.length} chapters (${outline.length} key steps), checks ${check.filter((c) => c === "true").length}/${check.length} true, $${r.cost.toFixed(3)} (total $${ledger.spent.toFixed(2)})`);
    } catch (e) { console.error(`${p.id}: ${(e as Error).message}`); }
  }, num("--jobs", 4));
}
/** the top-level JSON objects in a reply, in order (one pass over braces outside strings) */
function topLevelJson(text: string): any[] {
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
}

// ======== contamination ========
/** Can a model recall a Thinky puzzle's hints from its title alone? Word overlap of its answer with
 *  the real ladder against its overlap with another puzzle's ladder of the same genre (the baseline:
 *  genre-generic advice overlaps too). Both printed for reading. */
async function recallCmd(takerStr: string) {
  const t = takerOf(`${takerStr}:grid`), ps = loadPuzzles("thinky").filter((p) => (p.hints?.length ?? 0) >= 3).slice(0, num("--limit", 20));
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const overlap = (a: Set<string>, b: Set<string>) => { let k = 0; for (const w of a) if (b.has(w)) k++; return k / Math.max(1, Math.min(a.size, b.size)); };
  const own: number[] = [], other: number[] = [];
  const rows = await mapPool(ps, async (p, i) => {
    const r = await askOpus([{ role: "user", content: `Thinky Games publishes a daily logic puzzle with a ladder of hints written by its author. Do you remember the ${nameOf(p.genre)} daily titled "${p.title}" (Thinky Dailies ${p.id.replace(/^thinky-/, "season ").replace("-", ", #")})? If you do, write out its hints in order. If you don't remember it, say so plainly; don't invent hints.` }], undefined, t.model);
    const mate = ps.find((q, j) => j !== i && q.genre === p.genre) ?? ps[(i + 1) % ps.length];
    const a = words(r.text);
    return { id: p.id, title: p.title, own: overlap(a, words(p.hints!.join(" "))), other: overlap(a, words(mate.hints!.join(" "))), says: r.text.slice(0, 300).replace(/\n/g, " ") };
  }, 6);
  for (const r of rows) { own.push(r.own); other.push(r.other); console.log(`${r.id} "${r.title}": overlap ${r.own.toFixed(2)} (another puzzle's ${r.other.toFixed(2)}) — ${r.says}`); }
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
  console.log(`\nmean overlap with its own ladder ${mean(own).toFixed(2)}, with another of the genre ${mean(other).toFixed(2)}; $${ledger.spent.toFixed(2)}`);
}

// ======== report ========
function report(set: string) {
  const ps = loadPuzzles(set), byId = new Map(ps.map((p) => [p.id, p]));
  const rd = dir(`solve-${set}`, "runs/"), files = readdirSync(rd).filter((f) => f.endsWith(".jsonl")).sort();
  const level = (p: SolvePuzzle) => p.anchor.level ?? p.anchor.rating;
  const levels = [...new Set(ps.map(level).filter((x) => x !== undefined))].sort() as number[];
  const L = [`# Whole solves: ${set}`, "", `${ps.length} puzzles. A solve is every positive mark placed; placed is the share of them reached; a wrong move drops the rest of its turn.`, ""];
  L.push("| taker | n | solved | placed (mean) | wrong per solve | turns | hints used (of ladder) | $ | ρ(solved, rating) |", "|---|---|---|---|---|---|---|---|---|");
  const runs = new Map<string, Run[]>();
  for (const f of files) {
    const rs = (readJsonl(`${rd}${f}`) as Run[]).filter((r) => byId.has(r.id)), name = f.replace(/\.jsonl$/, "");
    runs.set(name, rs);
    const n = rs.length, mean = (g: (r: Run) => number) => rs.reduce((a, r) => a + g(r), 0) / (n || 1);
    const rated = rs.filter((r) => level(byId.get(r.id)!) !== undefined);
    const rho = rated.length > 5 ? spearmanXY(rated.map((r) => (r.solved ? 1 : r.placed / r.positives - 1)), rated.map((r) => level(byId.get(r.id)!)!)).toFixed(2) : "–";
    L.push(`| ${name} | ${n} | ${pct(rs.filter((r) => r.solved).length, n)} | ${Math.round(100 * mean((r) => r.placed / r.positives))}% | ${mean((r) => r.wrong).toFixed(1)} | ${mean((r) => r.turns).toFixed(1)} | ${rs[0]?.hints ? `${Math.round(100 * mean((r) => (r.ladder ? r.shown / r.ladder : 0)))}%` : "–"} | ${rs.reduce((a, r) => a + r.cost, 0).toFixed(2)} | ${rho} |`);
  }
  if (levels.length) {
    L.push("", "## Solved by rating", "", `| taker | ${levels.map((l) => `${l} (${ps.filter((p) => level(p) === l).length})`).join(" | ")} |`, `|---|${levels.map(() => "---").join("|")}|`);
    for (const [name, rs] of runs) L.push(`| ${name} | ${levels.map((l) => { const x = rs.filter((r) => level(byId.get(r.id)!) === l); return pct(x.filter((r) => r.solved).length, x.length); }).join(" | ")} |`);
  }
  L.push("", "ρ uses solved as 1 and an unsolved run as its share placed minus 1, against the rating (higher rating should mean lower).");
  writeFileSync(`${dir(`solve-${set}`)}report.md`, L.join("\n") + "\n");
  console.log(L.join("\n"));
}

async function show(set: string, id?: string) {
  const ps = loadPuzzles(set), p = ps.find((x) => x.id === id) ?? ps[0];
  const ctx = await ctxOf({ id: p.id, set: "bench", genre: p.genre, known: [], spec: p.spec as GridSpec });
  const known = new Map<string, boolean>([...ctx.initial].map((m) => [m, ctx.truth.get(m) ?? false]));
  console.log(turnPrompt(p, known, "grid", p.hints?.slice(0, 1) ?? [], ""));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "puzzles") puzzlesCmd(argv[1] ?? "thinky");
  else if (cmd === "run") await runCmd(argv[1], argv[2]);
  else if (cmd === "ladders") await laddersCmd(argv[1] ?? "thinky");
  else if (cmd === "recall") await recallCmd(argv[1] ?? "opus:high");
  else if (cmd === "show") await show(argv[1] ?? "thinky", argv[2]);
  else report(argv[1] ?? "thinky");
}
