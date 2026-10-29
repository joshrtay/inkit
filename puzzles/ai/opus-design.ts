// Opus as a puzzle setter with our solvers as its harness (the generator plan's pilot, Josh's go
// 2026-10-29): Opus designs a grid with a trick in mind; a check tool proves it has one solution
// (clingo; or shows where a second solution differs), and reports what our deduction solver sees:
// the difficulty estimate, clues that do nothing, guessing and grind (puzzles/difficulty/assess.ts),
// the stuck points a player would meet (puzzles/hints/stuck.ts), and how sparse and symmetric it
// looks. Opus revises until it's happy, then submits. Every submitted puzzle has been checked.
//
//   INKIT_ANTHROPIC_KEY=... node --no-warnings puzzles/ai/opus-design.ts --genre akari --size 7x7 --n 5 [--out file.jsonl] [--cap 15]
//
// Cost: Opus 5.5 at high effort; stops before a puzzle once DESIGN_CAP (or --cap) dollars are
// spent in this run (spent so far is read back from --out's lines, so a rerun keeps counting).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import type { Given, GridSpec } from "../../src/engine/types.ts";
import { assess } from "../difficulty/assess.ts";
import { looksOf } from "../difficulty/looks.ts";
import { stuckPoints } from "../hints/stuck.ts";

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const genre = arg("genre", "akari")!, [rows, cols] = arg("size", "7x7")!.split("x").map(Number);
const n = Number(arg("n", "5")), out = arg("out", `references/ml/gen-baseline/opus-${genre}.jsonl`)!;
const CAP = Number(arg("cap", process.env.DESIGN_CAP ?? "15"));
const MODEL = { id: "claude-opus-5-5", input: 4 / 1e6, output: 20 / 1e6 };
const MAX_CHECKS = 10;
const key = process.env.INKIT_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("no INKIT_ANTHROPIC_KEY"); process.exit(1); }
const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 600_000 });

// ---------- each genre: its rules, and its grid as text ----------
interface Form { rules: string; legend: string; parse(lines: string[]): GridSpec | string; show(spec: GridSpec): string }
const at = (r: number, c: number) => ({ at: "cell" as const, cell: [r, c] as [number, number] });
const cellsForm = (rules: string, legend: string, read: (ch: string, r: number, c: number) => Given[] | null | "bad", write: (gs: Given[]) => string): Form => ({
  rules, legend,
  parse(lines) {
    if (lines.length !== rows || lines.some((l) => l.length !== cols)) return `the grid must be ${rows} lines of ${cols} characters`;
    const givens: Given[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const g = read(lines[r][c], r, c);
      if (g === "bad") return `unknown character "${lines[r][c]}" at row ${r + 1}, column ${c + 1}`;
      if (g) givens.push(...g);
    }
    return { genre, size: [rows, cols], givens } as GridSpec;
  },
  show(spec) {
    const by = new Map<string, Given[]>();
    for (const g of spec.givens ?? []) { const k = String((g as { cell?: number[] }).cell); by.set(k, [...(by.get(k) ?? []), g]); }
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => write(by.get(String([r, c])) ?? [])).join("")).join("\n");
  },
});
const FORMS: Record<string, Form> = {
  akari: cellsForm(
    "Akari (Light Up): place light bulbs in white squares. A bulb lights its square and every square in its row and column until a black square stops it. Every white square must be lit, no bulb may light another bulb, and a numbered black square has exactly that many bulbs on its four sides.",
    "'.' white square, '#' black square, '0'-'4' numbered black square",
    (ch, r, c) => (ch === "." ? null : ch === "#" ? [{ ...at(r, c), kind: "block" }] : /[0-4]/.test(ch) ? [{ ...at(r, c), kind: "block" }, { ...at(r, c), kind: "number", value: Number(ch) }] : "bad") as Given[] | null | "bad",
    (gs) => { const num = gs.find((g) => g.kind === "number"); return num ? String((num as { value: number }).value) : gs.some((g) => g.kind === "block") ? "#" : "."; }),
  masyu: cellsForm(
    "Masyu: draw one loop through the centres of squares, moving up, down, left and right, never crossing or branching. It passes through every pearl. At a white pearl it goes straight through and turns in at least one of the squares next to it along the loop. At a black pearl it turns, and goes straight through the square after it on both sides.",
    "'.' empty, 'W' white pearl, 'B' black pearl",
    (ch, r, c) => (ch === "." ? null : ch === "W" ? [{ ...at(r, c), kind: "pearl", value: "white" }] : ch === "B" ? [{ ...at(r, c), kind: "pearl", value: "black" }] : "bad") as Given[] | null | "bad",
    (gs) => { const p = gs[0] as { value?: string } | undefined; return p ? (p.value === "white" ? "W" : "B") : "."; }),
  slitherlink: cellsForm(
    "Slitherlink: draw one loop along the grid lines between dots, never crossing or branching. A number says how many of its square's four sides the loop uses.",
    "'.' no number, '0'-'3' a number in that square",
    (ch, r, c) => (ch === "." ? null : /[0-3]/.test(ch) ? [{ ...at(r, c), kind: "number", value: Number(ch) }] : "bad") as Given[] | null | "bad",
    (gs) => { const v = gs[0] as { value?: number } | undefined; return v ? String(v.value) : "."; }),
  "star-battle": {
    rules: `Star Battle: the grid is split into ${rows} regions. Place one star in every row, every column and every region. Stars never touch, not even at a corner.`,
    legend: `each square is a letter naming its region (a, b, c, ...); exactly ${rows} regions, each one connected piece`,
    parse(lines) {
      if (lines.length !== rows || lines.some((l) => l.length !== cols)) return `the grid must be ${rows} lines of ${cols} characters`;
      if (!lines.every((l) => /^[a-z]+$/.test(l))) return "use lower-case letters only";
      if (new Set(lines.join("")).size !== rows) return `use exactly ${rows} regions`;
      return { genre, size: [rows, cols], areas: lines } as GridSpec;
    },
    show: (spec) => (spec.areas ?? []).join("\n"),
  },
};
const form = FORMS[genre];
if (!form) { console.error(`--genre is one of ${Object.keys(FORMS).join(", ")}`); process.exit(1); }

// ---------- the check tool ----------
interface Checked { ok: boolean; text: string; spec?: GridSpec; unique?: boolean }
function differences(spec: GridSpec, a: Record<string, ArrayLike<number>>, b: Record<string, ArrayLike<number>>): string {
  const grid = makePuzzle(spec).grid, cells = new Set<number>();
  for (const layer of ["shade", "color", "digit"]) for (let i = 0; i < (a[layer]?.length ?? 0); i++) if (a[layer][i] !== b[layer][i]) cells.add(i);
  for (let i = 0; i < (a.loop?.length ?? 0); i++) if (!!a.loop[i] !== !!b.loop[i]) grid.links[i].cells.forEach((c) => c >= 0 && cells.add(c));
  for (let i = 0; i < (a.fence?.length ?? 0); i++) if ((a.fence[i] === 1) !== (b.fence[i] === 1)) grid.borders[i].cells.forEach((c) => c >= 0 && cells.add(c));
  return [...cells].sort((x, y) => x - y).slice(0, 30).map((c) => `r${Math.floor(c / cols) + 1}c${(c % cols) + 1}`).join(" ");
}
async function check(text: string): Promise<Checked> {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const spec = form.parse(lines);
  if (typeof spec === "string") return { ok: false, text: `Can't read it: ${spec}.` };
  let sols;
  try { sols = await solve(makePuzzle(spec), 2); } catch (e) { return { ok: false, text: `Not a valid puzzle: ${(e as Error).message.slice(0, 200)}` }; }
  if (sols.length === 0) return { ok: true, spec, unique: false, text: "No solution: the clues contradict each other." };
  if (sols.length > 1) return { ok: true, spec, unique: false, text: `More than one solution. Two of them differ at: ${differences(spec, sols[0] as never, sols[1] as never)}. Add or change a clue there.` };
  const a = await assess(spec, { budgetMs: 30_000, capMs: 90_000, redundancy: true }).catch(() => null);
  const s = await stuckPoints(spec, { budgetMs: 60_000 });
  const ev = { looks: looksOf(spec) };
  const lines2 = [
    "One solution.",
    `Difficulty estimate ${a?.estimate?.toFixed(2) ?? "?"} (0 trivial, 0.3 easy, 0.5 medium, 0.7 hard, 0.9 expert); the solver ${a?.solved ? "finished" : "did NOT finish"} it without guessing.`,
    `Quality ${a?.quality.toFixed(2) ?? "?"}${a?.flags.length ? `: ${a.flags.join("; ")}` : ": no problems found"}.`,
    `Looks: ${(ev.looks.density * 100).toFixed(0)}% of squares carry a clue${genre === "star-battle" ? " (regions per square)" : ""}; ${ev.looks.exact ? "exactly symmetric" : `${Math.round(ev.looks.sym * 100)}% symmetric`}.`,
    `Stuck points a player would meet (where the next step is harder than a ${genre} solver at that level manages at a glance): ${s.points.length}.`,
    ...s.points.map((p, k) => `  ${k + 1}. at ${Math.round(p.progress * 100)}% of the solve: ${p.key.tier >= 2 ? "a case split (try a guess, see it fail)" : `uses ${p.key.uses.join(", ") || "the rules"}`}; it settles ${p.key.facts.slice(0, 3).map((f) => f.text).join(", ")}${p.key.cells.length ? ` (squares ${p.key.cells.slice(0, 6).map((c) => `r${Math.floor(c / cols) + 1}c${(c % cols) + 1}`).join(" ")})` : ""}`),
  ];
  return { ok: true, spec, unique: true, text: lines2.join("\n") };
}

// ---------- the setter ----------
const SYSTEM = `You set logic puzzles for inkit.games, a site for people who love hand-made puzzles, from age 10 to adult. You're setting one ${rows}×${cols} ${genre} puzzle.

${form.rules}

Write the grid as ${rows} lines of ${cols} characters: ${form.legend}.

What makes a puzzle good, from what solvers say about thousands of puzzles:
- It has exactly one solution, found by reasoning alone, never by guessing.
- Every clue matters. A clue the puzzle could lose and still have one solution is dull.
- It flows: there's a clear way in, then steady progress, with a few real sticking points spread through the solve, not one wall at the start and not a long stretch of busywork.
- It has an idea: one or two moments where the rules interact in a way the solver has to notice. Plan that moment first, then build the rest of the grid around it.
- It looks hand-made: sparse clues, a pleasing (usually symmetric) layout, clues placed with purpose.
- Aim for medium difficulty: a few stuck points, the first not at the very start.

Use the check tool on every draft. It proves how many solutions the grid has and says what our solver sees: difficulty, dull clues, guessing, the stuck points a player would meet, and how the grid looks. Revise until it's good, then submit. You have ${MAX_CHECKS} checks; submit only a grid whose last check said "One solution".`;

const TOOLS: Anthropic.Tool[] = [
  { name: "check", description: "Check a draft grid: how many solutions, and what our solver sees.", strict: true,
    input_schema: { type: "object", properties: { grid: { type: "string", description: `${rows} lines of ${cols} characters` } }, required: ["grid"], additionalProperties: false } },
  { name: "submit", description: "Submit the finished puzzle (it must be the grid you last checked with one solution).", strict: true,
    input_schema: { type: "object", properties: { grid: { type: "string" }, idea: { type: "string", description: "one sentence: the puzzle's idea, the moment the solver must notice" } }, required: ["grid", "idea"], additionalProperties: false } },
] as Anthropic.Tool[];

let spent = existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).reduce((s, l) => s + (JSON.parse(l).cost ?? 0), 0) : 0;
for (let k = 0; k < n; k++) {
  if (spent >= CAP) { console.log(`stopped: $${spent.toFixed(2)} of $${CAP} spent`); break; }
  const t0 = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Set puzzle ${k + 1}. Make its idea different from an ordinary ${genre}: pick one interaction of the rules and build around it.` }];
  let cost = 0, checks = 0, last: Checked | null = null, done: { spec: GridSpec; idea: string } | null = null, turns = 0;
  while (!done && turns++ < MAX_CHECKS + 4) {
    const r = await client.messages.create({ model: MODEL.id, max_tokens: 16000, output_config: { effort: "high" }, system: SYSTEM, tools: TOOLS, messages } as never) as Anthropic.Message;
    cost += r.usage.input_tokens * MODEL.input + r.usage.output_tokens * MODEL.output;
    messages.push({ role: "assistant", content: r.content });
    const uses = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length) { messages.push({ role: "user", content: "Use the check tool on a draft, or submit." }); continue; }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = u.input as { grid?: string; idea?: string };
      if (u.name === "check") {
        checks++;
        last = checks > MAX_CHECKS ? { ok: false, text: "No checks left: submit your best grid that had one solution." } : await check(String(input.grid ?? ""));
        results.push({ type: "tool_result", tool_use_id: u.id, content: last.text + (checks >= MAX_CHECKS ? "\n(That was your last check.)" : "") });
      } else {
        const c = await check(String(input.grid ?? ""));
        if (c.unique && c.spec) { done = { spec: c.spec, idea: String(input.idea ?? "") }; results.push({ type: "tool_result", tool_use_id: u.id, content: "Submitted." }); }
        else results.push({ type: "tool_result", tool_use_id: u.id, content: `Not accepted: ${c.text}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
    if (checks > MAX_CHECKS + 1) break;
  }
  spent += cost;
  const line = { genre, size: [rows, cols], ok: !!done, spec: done?.spec, idea: done?.idea, checks, cost: +cost.toFixed(4), s: Math.round((Date.now() - t0) / 1000), grid: done ? form.show(done.spec) : undefined, lastCheck: last?.text };
  appendFileSync(out, JSON.stringify(line) + "\n");
  console.log(`${genre} ${k + 1}: ${done ? "submitted" : "gave up"} after ${checks} checks, $${cost.toFixed(2)}, ${line.s}s${done ? `\n${line.grid}\n  idea: ${done.idea}` : ""}`);
}
console.log(`spent $${spent.toFixed(2)} in all`);
