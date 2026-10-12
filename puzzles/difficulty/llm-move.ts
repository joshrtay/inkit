// Can a Claude model point the solver at the next move? Puzzles from Puzzle Square JP (local only)
// at two moments: the opening, and the solver's breakthrough (the state just before its first step
// that needed a case split or search; else its costliest step). Each model is asked for one cell
// it's certain of; the solver's answer scores it: correct, new (not already known), and the
// breakthrough itself (one of the facts the solver's hard step found). Latency and tokens per call.
//
//   node puzzles/difficulty/llm-move.ts [perType]     (needs ANTHROPIC_API_KEY in app/.dev.vars)
import Anthropic from "@anthropic-ai/sdk";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduce, type Step } from "./deduce.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const key = /^ANTHROPIC_API_KEY=(.*)$/m.exec(readFileSync(`${repo}app/.dev.vars`, "utf8"))?.[1]?.trim();
if (!key) throw new Error("no ANTHROPIC_API_KEY in app/.dev.vars");
const client = new Anthropic({ apiKey: key });
const perType = Number(process.argv[2]) || 5;

const CONFIGS: { label: string; model: string; think: boolean }[] = [
  { label: "Haiku 5.5", model: "claude-haiku-5-5", think: false },
  { label: "Sonnet 5.5", model: "claude-sonnet-5-5", think: false },
  { label: "Opus 5.5", model: "claude-opus-5-5", think: false },
  { label: "Fable 5.1", model: "claude-fable-5-1", think: false },
  { label: "Opus 5.5 thinking", model: "claude-opus-5-5", think: true },
];

type Known = Map<string, boolean>;   // mark name → value
interface State { puzzle: string; genre: string; moment: string; spec: GridSpec; known: Known; answer: Known; target: Set<string> }

// ---- the puzzles and their moments ----
const states: State[] = [];
for (const genre of ["sudoku", "star-battle", "akari"]) {
  const dir = `${repo}references/psjp/${genre}/`;
  const files = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(b) - parseInt(a));
  let taken = 0;
  for (const f of files) {
    if (taken >= perType) break;
    const d = JSON.parse(readFileSync(dir + f, "utf8"));
    const spec: GridSpec = { ...d.grid, genre };
    if (spec.size[0] > 10) continue;
    const { path, profile, answer: trueMarks } = await deduce(spec, { budgetMs: 30000 });
    if (!profile.solved || !trueMarks) continue;
    // every mark the answer has true; any other shaded mark is false (Sudoku is scored on true digits only)
    const answer: Known = new Map(trueMarks.map((m) => [m, true]));
    for (const s of path) for (const x of s.facts) if (!answer.has(x.mark)) answer.set(x.mark, false);
    for (let i = 0; i < spec.size[0] * spec.size[1]; i++) if (!answer.has(`shaded(${i})`)) answer.set(`shaded(${i})`, false);
    const real = path.filter((s) => !s.choice);
    let k = real.findIndex((s) => s.tier >= 2);
    if (k < 0) k = real.reduce((b, s, i) => (s.cost > real[b].cost ? i : b), 0);
    const before = (n: number) => { const m: Known = new Map(); for (const s of real.slice(0, n)) for (const x of s.facts) m.set(x.mark, x.value); return m; };
    states.push({ puzzle: f, genre, moment: "opening", spec, known: before(0), answer, target: new Set() });
    states.push({ puzzle: f, genre, moment: `breakthrough (${real[k].tier >= 2 ? `tier ${real[k].tier}` : "costliest step"})`, spec, known: before(k), answer, target: new Set(real[k].facts.filter((x) => x.value || genre !== "sudoku").map((x) => `${x.mark}=${x.value}`)) });
    taken++;
    console.error(`${genre} ${f}: ready`);
  }
}

// ---- the grid as text ----
function render(s: State): { rules: string; grid: string; answerForm: string } {
  const p = makePuzzle(s.spec), g = p.grid, R = g.rows, C = g.cols;
  const clue = new Map<number, string>();
  for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") clue.set(i, String(x.value));
  const cells: string[][] = [];
  for (let r = 0; r < R; r++) {
    const row: string[] = [];
    for (let c = 0; c < C; c++) {
      const i = g.cell(r, c);
      if (s.genre === "sudoku") {
        let v = clue.get(i) ?? ".";
        for (let d = 1; d <= (p.digits ?? 9); d++) if (s.known.get(`digit(${i},${d})`) === true) v = String(d);
        row.push(v);
      } else if (s.genre === "star-battle") {
        const a = String.fromCharCode(97 + (p.areas!.of[i] % 26));
        const k = s.known.get(`shaded(${i})`);
        row.push(k === true ? "*" : k === false ? `${a}x` : a);
      } else {
        const block = p.blocked.has(i) || [...(p.cellGivens.get(i) ?? [])].some((x) => x.kind === "block");
        const k = s.known.get(`shaded(${i})`);
        row.push(block ? (clue.has(i) ? clue.get(i)! : "#") : k === true ? "B" : k === false ? "-" : ".");
      }
    }
    cells.push(row);
  }
  const w = Math.max(...cells.flat().map((x) => x.length));
  const grid = ["     " + Array.from({ length: C }, (_, c) => `c${c + 1}`.padEnd(w + 1)).join(""), ...cells.map((row, r) => `r${String(r + 1).padEnd(3)} ${row.map((x) => x.padEnd(w + 1)).join("")}`)].join("\n");
  const n = (rule: string) => Number(p.rules.find((x) => x.rule === rule)?.n ?? 1);
  if (s.genre === "sudoku") return {
    rules: `Sudoku: fill the ${R}×${C} grid with digits 1–${p.digits} so every row, column and box has each digit once. "." is an empty cell.`,
    grid, answerForm: `{"row": r, "col": c, "value": "<digit>", "reason": "..."}: a digit you are certain goes in an empty cell`,
  };
  if (s.genre === "star-battle") return {
    rules: `Star Battle: place ${n("shaded-per-line")} star(s) in every row and column and ${n("shaded-per-area")} in every outlined area; stars never touch, not even diagonally. Each cell shows its area's letter; "*" is a known star; a letter followed by "x" is a cell known to have no star.`,
    grid, answerForm: `{"row": r, "col": c, "value": "star" | "empty", "reason": "..."}: a cell not yet decided that you are certain of`,
  };
  return {
    rules: `Akari: place light bulbs in white cells. A bulb lights its row and column until a black cell. Every white cell must be lit, no bulb may light another, and a number on a black cell is how many bulbs touch it on its four sides. "#" is a black cell, a digit a numbered black cell, "B" a known bulb, "-" a white cell known to have no bulb, "." undecided.`,
    grid, answerForm: `{"row": r, "col": c, "value": "bulb" | "no bulb", "reason": "..."}: an undecided white cell you are certain of`,
  };
}

const markOf = (s: State, r: number, c: number, value: string): [string, boolean] | null => {
  const p = makePuzzle(s.spec), i = p.grid.cell(r - 1, c - 1);
  if (r < 1 || c < 1 || r > p.grid.rows || c > p.grid.cols) return null;
  if (s.genre === "sudoku") { const d = parseInt(value); return d > 0 ? [`digit(${i},${d})`, true] : null; }
  if (s.genre === "star-battle") return value === "star" ? [`shaded(${i})`, true] : value === "empty" ? [`shaded(${i})`, false] : null;
  return value === "bulb" ? [`shaded(${i})`, true] : value === "no bulb" ? [`shaded(${i})`, false] : null;
};

// ---- ask ----
interface Result { config: string; puzzle: string; genre: string; moment: string; ms: number; inTok: number; outTok: number; verdict: string; reply: string }
const jobs = states.flatMap((s) => CONFIGS.map((cfg) => ({ s, cfg })));
console.error(`${states.length} states × ${CONFIGS.length} configurations = ${jobs.length} calls`);
const results = await mapPool(jobs, async ({ s, cfg }): Promise<Result> => {
  const { rules, grid, answerForm } = render(s);
  const prompt = `${rules}\n\nThe puzzle has exactly one solution. Current state:\n\n${grid}\n\nGive one move you are certain of, deduced by logic (no guessing). End your reply with JSON: ${answerForm}. Rows and columns count from 1.`;
  const t0 = Date.now();
  try {
    const res = await client.messages.create({
      model: cfg.model, max_tokens: cfg.think ? 16000 : 4000,
      ...(cfg.think ? { thinking: { type: "adaptive" as const } } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    const ms = Date.now() - t0;
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    // the reply's last JSON object (a model may reason first)
    const json = [...text.matchAll(/\{[^{}]*\}/g)].at(-1)?.[0];
    let verdict = "unparsed";
    if (json) {
      try {
        const j = JSON.parse(json), m = markOf(s, Number(j.row), Number(j.col), String(j.value).toLowerCase());
        if (!m) verdict = "invalid";
        else {
          const [mark, v] = m, truth = s.answer.get(mark);
          // a Sudoku digit's truth: the answer has that digit there
          const correct = s.genre === "sudoku" ? truth === true : truth === v;
          const already = s.known.get(mark) !== undefined;
          verdict = !correct ? "wrong" : already ? "already known" : s.target.has(`${mark}=${v}`) ? "breakthrough" : "correct, new";
        }
      } catch { verdict = "unparsed"; }
    }
    console.error(`${cfg.label} ${s.genre} ${s.puzzle} ${s.moment}: ${verdict} (${ms} ms)`);
    return { config: cfg.label, puzzle: s.puzzle, genre: s.genre, moment: s.moment.split(" ")[0], ms, inTok: res.usage.input_tokens, outTok: res.usage.output_tokens, verdict, reply: text.slice(0, 400) };
  } catch (e) {
    return { config: cfg.label, puzzle: s.puzzle, genre: s.genre, moment: s.moment.split(" ")[0], ms: Date.now() - t0, inTok: 0, outTok: 0, verdict: `error: ${(e as Error).message.slice(0, 80)}`, reply: "" };
  }
}, 6);
writeFileSync(`${repo}references/ranker/llm-move.json`, JSON.stringify(results, null, 1));

// ---- the table ----
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
console.log("| Model | Moment | Calls | Correct and new | Breakthrough | Wrong | Median s | Tokens out (mean) |\n|---|---|---|---|---|---|---|---|");
for (const cfg of CONFIGS) for (const moment of ["opening", "breakthrough"]) {
  const rs = results.filter((r) => r.config === cfg.label && r.moment === moment);
  const good = rs.filter((r) => r.verdict === "correct, new" || r.verdict === "breakthrough").length;
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`| ${cfg.label} | ${moment} | ${rs.length} | ${pct(good, rs.length)} | ${pct(rs.filter((r) => r.verdict === "breakthrough").length, rs.length)} | ${pct(rs.filter((r) => r.verdict === "wrong").length, rs.length)} | ${((ms[Math.floor(ms.length / 2)] ?? 0) / 1000).toFixed(1)} | ${Math.round(rs.reduce((a, r) => a + r.outTok, 0) / Math.max(1, rs.length))} |`);
}
const errors = results.filter((r) => r.verdict.startsWith("error"));
if (errors.length) console.log(`\nErrors: ${errors.map((r) => `${r.config}: ${r.verdict}`).join("; ")}`);
console.log(`\nTokens: ${results.reduce((a, r) => a + r.inTok, 0)} in, ${results.reduce((a, r) => a + r.outTok, 0)} out`);
