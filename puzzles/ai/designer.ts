// Opus as a puzzle setter with our solvers as its harness (the generator plan, "G0 result and the
// Opus designer pilot"): Opus designs a grid with an idea in mind; a check tool proves it has one
// solution (clingo; or shows where a second solution differs) and reports what our deduction solver
// sees: the difficulty estimate, clues that do nothing, guessing and grind (puzzles/difficulty/
// assess.ts), the stuck points a player would meet (puzzles/hints/stuck.ts), and how sparse and
// symmetric it looks. Opus revises until it's happy, then submits. Every submitted puzzle has been
// checked. The pilot (16 of 20 unique, about $0.64 each) found its Slitherlink and Masyu look
// human-made where the generator's don't, so Lumen's posts of those types come from here
// (GenrePlan.designer; ./make.ts), and ./opus-design.ts runs it by hand.
import Anthropic from "@anthropic-ai/sdk";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import type { Given, GridSpec } from "../../src/engine/types.ts";
import { assess } from "../difficulty/assess.ts";
import { looksOf } from "../difficulty/looks.ts";
import { stuckPoints } from "../hints/stuck.ts";

export const DESIGNER = { model: "claude-opus-5-5", effort: "high", input: 4 / 1e6, output: 20 / 1e6 };
export const MAX_CHECKS = 10;

// ---------- each genre: its rules, and its grid as text ----------
interface Form { rules: string; legend: string; parse(lines: string[]): GridSpec | string; show(spec: GridSpec): string }
const at = (r: number, c: number) => ({ at: "cell" as const, cell: [r, c] as [number, number] });

function cellsForm(genre: string, rows: number, cols: number, rules: string, legend: string,
  read: (ch: string, r: number, c: number) => Given[] | null | "bad", write: (gs: Given[]) => string): Form {
  return {
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
  };
}

/** The genres the designer can set. */
export const DESIGN_GENRES = ["akari", "masyu", "slitherlink", "star-battle"] as const;

export function formFor(genre: string, rows: number, cols: number): Form | null {
  switch (genre) {
    case "akari": return cellsForm(genre, rows, cols,
      "Akari (Light Up): place light bulbs in white squares. A bulb lights its square and every square in its row and column until a black square stops it. Every white square must be lit, no bulb may light another bulb, and a numbered black square has exactly that many bulbs on its four sides.",
      "'.' white square, '#' black square, '0'-'4' numbered black square",
      (ch, r, c) => (ch === "." ? null : ch === "#" ? [{ ...at(r, c), kind: "block" }] : /[0-4]/.test(ch) ? [{ ...at(r, c), kind: "block" }, { ...at(r, c), kind: "number", value: Number(ch) }] : "bad") as Given[] | null | "bad",
      (gs) => { const num = gs.find((g) => g.kind === "number"); return num ? String((num as { value: number }).value) : gs.some((g) => g.kind === "block") ? "#" : "."; });
    case "masyu": return cellsForm(genre, rows, cols,
      "Masyu: draw one loop through the centres of squares, moving up, down, left and right, never crossing or branching. It passes through every pearl. At a white pearl it goes straight through and turns in at least one of the squares next to it along the loop. At a black pearl it turns, and goes straight through the square after it on both sides.",
      "'.' empty, 'W' white pearl, 'B' black pearl",
      (ch, r, c) => (ch === "." ? null : ch === "W" ? [{ ...at(r, c), kind: "pearl", value: "white" }] : ch === "B" ? [{ ...at(r, c), kind: "pearl", value: "black" }] : "bad") as Given[] | null | "bad",
      (gs) => { const p = gs[0] as { value?: string } | undefined; return p ? (p.value === "white" ? "W" : "B") : "."; });
    case "slitherlink": return cellsForm(genre, rows, cols,
      "Slitherlink: draw one loop along the grid lines between dots, never crossing or branching. A number says how many of its square's four sides the loop uses.",
      "'.' no number, '0'-'3' a number in that square",
      (ch, r, c) => (ch === "." ? null : /[0-3]/.test(ch) ? [{ ...at(r, c), kind: "number", value: Number(ch) }] : "bad") as Given[] | null | "bad",
      (gs) => { const v = gs[0] as { value?: number } | undefined; return v ? String(v.value) : "."; });
    case "star-battle": return {
      rules: `Star Battle: the grid is split into ${rows} regions. Place one star in every row, every column and every region. Stars never touch, not even at a corner.`,
      legend: `each square is a letter naming its region (a, b, c, ...); exactly ${rows} regions, each one connected piece`,
      parse(lines) {
        if (lines.length !== rows || lines.some((l) => l.length !== cols)) return `the grid must be ${rows} lines of ${cols} characters`;
        if (!lines.every((l) => /^[a-z]+$/.test(l))) return "use lower-case letters only";
        if (new Set(lines.join("")).size !== rows) return `use exactly ${rows} regions`;
        return { genre, size: [rows, cols], areas: lines } as GridSpec;
      },
      show: (spec) => (spec.areas ?? []).join("\n"),
    };
    default: return null;
  }
}

// ---------- the check tool ----------
interface Checked { ok: boolean; text: string; spec?: GridSpec; unique?: boolean }

function differences(spec: GridSpec, cols: number, a: Record<string, ArrayLike<number>>, b: Record<string, ArrayLike<number>>): string {
  const grid = makePuzzle(spec).grid, cells = new Set<number>();
  for (const layer of ["shade", "color", "digit"]) for (let i = 0; i < (a[layer]?.length ?? 0); i++) if (a[layer][i] !== b[layer][i]) cells.add(i);
  for (let i = 0; i < (a.loop?.length ?? 0); i++) if (!!a.loop[i] !== !!b.loop[i]) grid.links[i].cells.forEach((c) => c >= 0 && cells.add(c));
  for (let i = 0; i < (a.fence?.length ?? 0); i++) if ((a.fence[i] === 1) !== (b.fence[i] === 1)) grid.borders[i].cells.forEach((c) => c >= 0 && cells.add(c));
  return [...cells].sort((x, y) => x - y).slice(0, 30).map((c) => `r${Math.floor(c / cols) + 1}c${(c % cols) + 1}`).join(" ");
}

async function check(form: Form, genre: string, cols: number, text: string): Promise<Checked> {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const spec = form.parse(lines);
  if (typeof spec === "string") return { ok: false, text: `Can't read it: ${spec}.` };
  let sols;
  try { sols = await solve(makePuzzle(spec), 2); } catch (e) { return { ok: false, text: `Not a valid puzzle: ${(e as Error).message.slice(0, 200)}` }; }
  if (sols.length === 0) return { ok: true, spec, unique: false, text: "No solution: the clues contradict each other." };
  if (sols.length > 1) return { ok: true, spec, unique: false, text: `More than one solution. Two of them differ at: ${differences(spec, cols, sols[0] as never, sols[1] as never)}. Add or change a clue there.` };
  const a = await assess(spec, { budgetMs: 30_000, capMs: 90_000, redundancy: true }).catch(() => null);
  const s = await stuckPoints(spec, { budgetMs: 60_000 });
  const looks = looksOf(spec);
  const sq = (c: number) => `r${Math.floor(c / cols) + 1}c${(c % cols) + 1}`;
  return { ok: true, spec, unique: true, text: [
    "One solution.",
    `Difficulty estimate ${a?.estimate?.toFixed(2) ?? "?"} (0 trivial, 0.3 easy, 0.5 medium, 0.7 hard, 0.9 expert); the solver ${a?.solved ? "finished" : "did NOT finish"} it without guessing.`,
    `Quality ${a?.quality.toFixed(2) ?? "?"}${a?.flags.length ? `: ${a.flags.join("; ")}` : ": no problems found"}.`,
    `Looks: ${(looks.density * 100).toFixed(0)}% of squares carry a clue${genre === "star-battle" ? " (regions per square)" : ""}; ${looks.exact ? "exactly symmetric" : `${Math.round(looks.sym * 100)}% symmetric`}.`,
    `Stuck points a player would meet (where the next step is harder than a ${genre} solver at that level manages at a glance): ${s.points.length}.`,
    ...s.points.map((p, k) => `  ${k + 1}. at ${Math.round(p.progress * 100)}% of the solve: ${p.key.tier >= 2 ? "a case split (try a guess, see it fail)" : `uses ${p.key.uses.join(", ") || "the rules"}`}; it settles ${p.key.facts.slice(0, 3).map((f) => f.text).join(", ")}${p.key.cells.length ? ` (squares ${p.key.cells.slice(0, 6).map(sq).join(" ")})` : ""}`),
  ].join("\n") };
}

// ---------- the setter ----------
/** The difficulty asked for, in words (the estimate's scale, as the check reports it). */
export const aimOf = (d: number) => (d < 0.2 ? "very easy: a gentle puzzle with at most one stuck point" : d < 0.4 ? "easy: one or two stuck points" : d < 0.6 ? "medium: a few stuck points, the first not at the very start" : "hard: several real stuck points");

function systemFor(form: Form, genre: string, rows: number, cols: number, difficulty: number): string {
  return `You set logic puzzles for inkit.games, a site for people who love hand-made puzzles, from age 10 to adult. You're setting one ${rows}×${cols} ${genre} puzzle.

${form.rules}

Write the grid as ${rows} lines of ${cols} characters: ${form.legend}.

What makes a puzzle good, from what solvers say about thousands of puzzles:
- It has exactly one solution, found by reasoning alone, never by guessing.
- Every clue matters. A clue the puzzle could lose and still have one solution is dull.
- It flows: there's a clear way in, then steady progress, with a few real sticking points spread through the solve, not one wall at the start and not a long stretch of busywork.
- It has an idea: one or two moments where the rules interact in a way the solver has to notice. Plan that moment first, then build the rest of the grid around it.
- It looks hand-made: sparse clues, a pleasing (usually symmetric) layout, clues placed with purpose.
- Aim for ${aimOf(difficulty)} (difficulty estimate near ${difficulty.toFixed(2)}).

Use the check tool on every draft. It proves how many solutions the grid has and says what our solver sees: difficulty, dull clues, guessing, the stuck points a player would meet, and how the grid looks. Revise until it's good, then submit. You have ${MAX_CHECKS} checks; submit only a grid whose last check said "One solution".`;
}

function toolsFor(rows: number, cols: number): Anthropic.Tool[] {
  return [
    { name: "check", description: "Check a draft grid: how many solutions, and what our solver sees.", strict: true,
      input_schema: { type: "object", properties: { grid: { type: "string", description: `${rows} lines of ${cols} characters` } }, required: ["grid"], additionalProperties: false } },
    { name: "submit", description: "Submit the finished puzzle (it must be the grid you last checked with one solution).", strict: true,
      input_schema: { type: "object", properties: { grid: { type: "string" }, idea: { type: "string", description: "one sentence: the puzzle's idea, the moment the solver must notice" } }, required: ["grid", "idea"], additionalProperties: false } },
  ] as Anthropic.Tool[];
}

export interface DesignOptions {
  genre: string; rows: number; cols: number;
  /** the target difficulty estimate, 0..1 (default medium) */
  difficulty?: number;
  /** the opening request (default: an idea different from an ordinary puzzle of the type) */
  ask?: string;
  log?: (s: string) => void;
}
export interface Designed { spec: GridSpec | null; idea: string | null; checks: number; cost: number; ms: number; grid: string | null; lastCheck: string | null }

/** One puzzle from Opus: a checked, unique spec and its idea, or spec null if it gave up. */
export async function design(client: Anthropic, o: DesignOptions): Promise<Designed> {
  const { genre, rows, cols } = o, difficulty = o.difficulty ?? 0.5;
  const form = formFor(genre, rows, cols);
  if (!form) throw new Error(`the designer can't set ${genre} (only ${DESIGN_GENRES.join(", ")})`);
  const t0 = Date.now(), system = systemFor(form, genre, rows, cols, difficulty), tools = toolsFor(rows, cols);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: o.ask ?? `Set the puzzle. Make its idea different from an ordinary ${genre}: pick one interaction of the rules and build around it.` }];
  let cost = 0, checks = 0, last: Checked | null = null, done: { spec: GridSpec; idea: string } | null = null, turns = 0;
  while (!done && turns++ < MAX_CHECKS + 4) {
    const r = await client.messages.create({ model: DESIGNER.model, max_tokens: 16000, output_config: { effort: DESIGNER.effort }, system, tools, messages } as never) as Anthropic.Message;
    cost += r.usage.input_tokens * DESIGNER.input + r.usage.output_tokens * DESIGNER.output;
    messages.push({ role: "assistant", content: r.content });
    const uses = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length) { messages.push({ role: "user", content: "Use the check tool on a draft, or submit." }); continue; }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = u.input as { grid?: string; idea?: string };
      if (u.name === "check") {
        checks++;
        last = checks > MAX_CHECKS ? { ok: false, text: "No checks left: submit your best grid that had one solution." } : await check(form, genre, cols, String(input.grid ?? ""));
        results.push({ type: "tool_result", tool_use_id: u.id, content: last.text + (checks >= MAX_CHECKS ? "\n(That was your last check.)" : "") });
      } else {
        const c = await check(form, genre, cols, String(input.grid ?? ""));
        if (c.unique && c.spec) { done = { spec: c.spec, idea: String(input.idea ?? "") }; results.push({ type: "tool_result", tool_use_id: u.id, content: "Submitted." }); }
        else results.push({ type: "tool_result", tool_use_id: u.id, content: `Not accepted: ${c.text}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
    if (checks > MAX_CHECKS + 1) break;
  }
  o.log?.(`  designer: ${genre} ${rows}x${cols} ${done ? "submitted" : "gave up"} after ${checks} checks, $${cost.toFixed(2)}`);
  return { spec: done?.spec ?? null, idea: done?.idea ?? null, checks, cost: +cost.toFixed(4), ms: Date.now() - t0, grid: done ? form.show(done.spec) : null, lastCheck: last?.text ?? null };
}
