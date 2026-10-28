// The words of a hint ladder (./hint-ladder.ts), from the stuck points the deduction solver finds
// (puzzles/hints/stuck.ts, in Node or in the publish page's worker). Pure, so the site's server, the
// publish page and the batch share it:
//   solver words   free: plain sentences from the solver's step and the type's guide (its rules' own
//                  wording); the fallback for anything a model writes badly
//   the prompt     for a model (Sonnet on the publish page, Opus or Sonnet in the batch), grounded
//                  on the same stuck points (the H2 result: a grounded location beat the solver's own
//                  by 12 points), in the hybrid style: where in the solve it comes, a reusable
//                  "whenever X, Y" rule with one question, then the step
//   its reply      checked rung by rung; a rung that's too long, names a cell or says nothing falls
//                  back to the solver's words
// No hint names cells ("r3c4"): the page outlines them on the board instead.
import { makePuzzle } from "../engine/puzzle.ts";
import type { GridSpec } from "../engine/types.ts";
import { guides } from "../guides/guides.ts";
import { type KeyMark, type Ladder, LIMITS, type Rung, words } from "./hint-ladder.ts";

// ---------- the stuck points, as they travel (worker → page → server) ----------
export interface StuckFact { mark: string; value: boolean; text: string }
/** The step that gets a stuck player moving: what the solver looked at, what it found, and how. */
export interface KeyStep {
  where: string; cells: number[]; facts: StuckFact[];
  /** the rule blocks (and clue kinds) it used, and the rule instances its explanation names */
  uses: string[]; clues: string[];
  /** 0-1 a window, 2 a case split, 3 search; "creator": the creator's own move where the solver stalled */
  tier: number; cost: number; by?: "solver" | "creator";
}
export interface StuckPoint {
  key: KeyStep;
  /** how far through the solve it comes: the share of the answer's marks settled before it */
  progress: number;
  /** the board marks a player past it has made */
  marks: KeyMark[];
  /** the cells of the rule instances its explanation uses */
  clueCells: number[];
}
export interface Stuck {
  /** the solver (with the creator's moves where it stalled, if any) reached the answer */
  solved: boolean;
  points: StuckPoint[];
  rows: number; cols: number;
  /** how many stuck points the creator's own moves got past */
  creatorMoves?: number;
}

export const SOLVER_WRITER = "solver-1";

/** what a "yes" and a "no" mean in a type's own words, where "shaded" isn't what players say */
const VALUES: Record<string, [string, string]> = {
  akari: ["has a bulb", "has no bulb"], "star-battle": ["has a star", "has no star"], minesweeper: ["has a mine", "has no mine"],
  nurikabe: ["is wall", "is part of an island"], hitori: ["is shaded", "stays white"], nonogram: ["is filled", "is empty"],
};

const genreOf = (spec: GridSpec) => spec.genre ?? "";
const guideOf = (spec: GridSpec) => (guides as Record<string, (typeof guides)[keyof typeof guides] | undefined>)[genreOf(spec)];
const firstSentence = (s: string) => s.split(/(?<=[.!?])\s+/)[0];
const clip = (s: string, n: number = LIMITS.words) => { const w = s.trim().split(/\s+/); return w.length <= n ? s.trim() : `${w.slice(0, n - 1).join(" ")}…`; };

/** The rule kinds a step's explanation uses ("lit", "adjacent-count"). */
const kindsOf = (s: KeyStep) => [...new Set(s.uses.map((u) => u.replace(/^clue:/, "")))];
/** The type's guide rule that covers a step: the one for the first rule instance its explanation
 *  names ("adjacent-count (r3c5 r4c4 r5c5)"), else for any rule it uses. */
function guideRule(spec: GridSpec, s: KeyStep): string | null {
  const g = guideOf(spec);
  const kinds = [...new Set([...s.clues.map((c) => c.replace(/ \(.*$/, "")), ...s.uses])];
  for (const k of kinds) { const rule = g?.rules.find((r) => (r.checks ?? []).includes(k)); if (rule) return firstSentence(rule.text); }
  return null;
}
const leap = (s: KeyStep) => s.tier >= 2 || s.by === "creator" || /^assume\b/.test(s.where);
/** A technique's tag from the solver: the rule kinds it combines ("adjacent count + lit"). */
const solverTechnique = (s: KeyStep) => (leap(s) ? "what-if" : kindsOf(s).map((k) => k.replace(/-/g, " ")).join(" + ") || "the rules");

/** The cells a mark is on (a cell's, or the two cells either side of a line or wall). */
export function cellsOfMark(spec: GridSpec, mark: string): number[] {
  const q = /^(\w+)\((\d+)(?:,(\d+))?\)$/.exec(mark);
  if (!q) return [];
  const g = makePuzzle(spec).grid, id = Number(q[2]);
  if (q[1] === "line" || q[1] === "cut") return g.links[id]?.cells ?? [];
  if (q[1] === "fence") return g.borders[id]?.cells?.filter((c: number) => c >= 0) ?? [];
  return [id];
}

const phase = (progress: number) => progress < 0.1 ? "At the start" : progress < 0.4 ? "Early on" : progress < 0.7 ? "About halfway through" : "Near the end";
const unitOf = (where: string) => /^row\b/.test(where) ? "row" : /^column\b/.test(where) ? "column" : /^(box|region|area|cage)\b/.test(where) ? "area" : "squares";

/** One fact said plainly, about the outlined cells. */
function factText(spec: GridSpec, f: StuckFact): string {
  const p = makePuzzle(spec);
  const d = /^digit\(\d+,(\d+)\)$/.exec(f.mark);
  if (d) return `The outlined square ${f.value ? "is" : "isn't"} ${p.style.symbols?.[Number(d[1]) - 1] ?? d[1]}.`;
  if (/^line\(/.test(f.mark)) return f.value ? "The line runs between the two outlined squares." : "The line doesn't run between the two outlined squares.";
  if (/^fence\(/.test(f.mark)) {
    // the loop drawn on the grid's edges (Slitherlink), or walls
    const line = p.rules.find((r) => r.rule === "loop" || r.rule === "path")?.rule;
    if (line) return f.value ? `The ${line} runs along the edge between the two outlined squares.` : `The ${line} doesn't use the edge between the two outlined squares.`;
    return f.value ? "There's a wall between the two outlined squares." : "There's no wall between the two outlined squares.";
  }
  if (/^cut\(/.test(f.mark)) return f.value ? "The two outlined squares are in different regions." : "The two outlined squares are in the same region.";
  if (/^paint\(/.test(f.mark)) return "The outlined square takes this color.";
  const v = VALUES[genreOf(spec)] ?? ["is shaded", "isn't shaded"];
  return `The outlined square ${f.value ? v[0] : v[1]}.`;
}

/** The solver's words for one stuck point. */
export function solverRungs(spec: GridSpec, f: StuckPoint): Rung[] {
  const s = f.key, fact = s.facts.find((x) => x.value) ?? s.facts[0];
  const rule = guideRule(spec, s), technique = solverTechnique(s);
  const where: Rung = { kind: "where", text: `${phase(f.progress)}, look at the outlined ${unitOf(s.where)}.`, area: s.cells };
  const ruleRung: Rung = leap(s)
    ? { kind: "rule", text: "Whenever nothing follows directly, try a what-if: suppose one outlined square went the other way. Which rule breaks?", technique, short: "Try a what-if here.", area: s.cells }
    : { kind: "rule", text: clip(`${rule ? `Remember: ${rule}` : "Look at what the clues here allow."} What must be true here?`), technique, short: `This is a ${technique} spot.`, ...(f.clueCells.length ? { area: f.clueCells } : {}) };
  const rungs = [where, ruleRung];
  if (fact) rungs.push({ kind: "step", text: factText(spec, fact), area: cellsOfMark(spec, fact.mark) });
  return rungs;
}

/** The opening, in the solver's words: no cells, nothing about this puzzle in particular. */
export function solverOpening(spec: GridSpec): Rung[] {
  const marks = makePuzzle(spec).marks;
  const habit = marks.includes("digit") ? "Pencil in the digits a square can still take; the ones with a single option come first."
    : marks.includes("loop") || marks.includes("fence") ? "Cross out the edges you know are empty: they narrow down the rest."
    : "Dot the squares you know stay empty as you go: they make the next step easier to see.";
  return [
    { kind: "start", text: "Start where a clue leaves the least room: the biggest or smallest numbers, the corners and the edges." },
    { kind: "habit", text: habit },
  ];
}

/** A ladder in the solver's words: free, for every puzzle. */
export function solverLadder(spec: GridSpec, stuck: Stuck): Ladder {
  return { version: SOLVER_WRITER, opening: solverOpening(spec), points: stuck.points.map((f) => ({ marks: f.marks, rungs: solverRungs(spec, f) })) };
}

// ---------- a model's ladder ----------
const rc = (cols: number) => (c: number) => `r${Math.floor(c / cols) + 1}c${(c % cols) + 1}`;

/** The puzzle's givens as lines ("r2c3: number 4"), for a model to picture it. */
export function givensText(spec: GridSpec): string {
  const p = makePuzzle(spec), cell = rc(p.grid.cols), out: string[] = [];
  for (const [i, gs] of p.cellGivens) for (const x of gs) out.push(`${cell(i)}: ${x.kind}${"value" in x && x.value !== undefined ? ` ${x.value}` : ""}`);
  if (p.areas) {
    const by = new Map<number, number[]>();
    p.areas.of.forEach((a, i) => { if (a >= 0) by.set(a, [...(by.get(a) ?? []), i]); });
    for (const [a, cells] of by) out.push(`area ${a + 1}: ${cells.map(cell).join(" ")}`);
  }
  return out.join("\n") || "(no givens)";
}

/** The prompt: the rules, the givens, and each stuck point as the solver found it (with cells, for
 *  the model only: the hints it writes must not name them). The hybrid style in our own words. */
export function writerPrompt(spec: GridSpec, stuck: Stuck): string {
  const name = guideOf(spec)?.name ?? genreOf(spec), cell = rc(stuck.cols);
  const rules = guideOf(spec)?.rules.map((r) => `- ${r.text}`).join("\n") ?? `(type: ${genreOf(spec)})`;
  const points = stuck.points.map((f, k) => {
    const s = f.key;
    const how = s.by === "creator" ? "The solver could not continue by itself here; the puzzle's creator's next move was"
      : `The solver looked at ${s.where} (${s.cells.map(cell).join(" ")}) and found`;
    return `${k + 1}. About ${Math.round(100 * f.progress)}% through the solve. ${how}: ${s.facts.map((x) => x.text).join("; ")}.` +
      (s.by === "creator" ? "" : ` It used: ${s.clues.join(", ") || s.uses.join(", ")}${s.tier >= 2 ? " (a case split: one value leads to a contradiction)" : ""}.`);
  }).join("\n");
  return `You are writing the hints for a ${name} puzzle (${stuck.rows} rows × ${stuck.cols} columns) on a puzzle site. A player who is stuck opens them one at a time.

Rules:
${rules}

The puzzle's givens (row 1 at the top, column 1 at the left):
${givensText(spec)}

A solver found where a person is likely to get stuck, in solve order, and the step that gets them moving each time:
${points}

Write:
- "start": how to begin this puzzle in general (where a strong solver looks first), with no particular cell;
- "habit": one bookkeeping habit that helps in this type (what to mark as you go);
- for each stuck point, in order:
  - "where": where to look, beginning with where in the solve it comes ("Once the corners are done, ...");
  - "rule": a reusable idea in the form "Whenever X, Y", then one short question that leads the player to apply it here;
  - "technique": a short name for that idea (two to four words), the same name whenever the same idea comes back;
  - "short": the rule in five words or fewer, for players who have met it often ("A corner 3 again.");
  - "step": the step itself: what the outlined squares are, and why.
Each hint is plain text, at most 35 words. Never name a cell by its row and column: the page outlines the right squares for each hint, so say "the outlined squares", "this row", "the clue here". Don't give the answer before the "step".

Reply with JSON only: {"start": "...", "habit": "...", "points": [{"where": "...", "rule": "...", "technique": "...", "short": "...", "step": "..."}, ...]} with ${stuck.points.length} points.`;
}

export interface WriterReply { start?: string; habit?: string; points?: { where?: string; rule?: string; technique?: string; short?: string; step?: string }[] }

/** The reply's JSON: the last object with "points" (a fence or a sentence around it is fine). */
export function parseReply(text: string): WriterReply | null {
  for (let i = text.lastIndexOf("{"); i >= 0; i = text.lastIndexOf("{", i - 1)) {
    for (let j = text.lastIndexOf("}"); j > i; j = text.lastIndexOf("}", j - 1)) {
      try { const o = JSON.parse(text.slice(i, j + 1)); if (o && Array.isArray(o.points)) return o; } catch { /* a shorter span */ }
    }
  }
  return null;
}

/** The cells a text names, in any of the forms people write: "r3c4", "R3 C4", "row 3, column 4",
 *  "(3,4)" (as walkthrough-core.ts reads them). */
export function cellsInText(text: string, rows: number, cols: number): number[] {
  const out = new Set<number>();
  const add = (r: number, c: number) => { if (r >= 1 && c >= 1 && r <= rows && c <= cols) out.add((r - 1) * cols + c - 1); };
  for (const q of text.matchAll(/\br\s*(\d+)\s*,?\s*c\s*(\d+)/gi)) add(+q[1], +q[2]);
  for (const q of text.matchAll(/\brow\s+(\d+)\s*,?\s*(?:and\s+)?col(?:umn)?\s+(\d+)/gi)) add(+q[1], +q[2]);
  for (const q of text.matchAll(/\((\d+)\s*,\s*(\d+)\)/g)) add(+q[1], +q[2]);
  return [...out];
}

/** A hint a model wrote, if it keeps the house rules: something said, short, plain, and no cell named. */
export function usable(text: unknown, rows: number, cols: number): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const t = text.trim().replace(/\s+/g, " ");
  if (words(t) > LIMITS.words || /[*_`#<>]/.test(t) || cellsInText(t, rows, cols).length || /\br\d+\s*c\d+\b/i.test(t)) return null;
  return t;
}

/** A model's ladder, each rung checked, the solver's words where one fails. `problems` lists what fell back. */
export function ladderFromReply(spec: GridSpec, stuck: Stuck, reply: WriterReply | null, version: string): { ladder: Ladder; problems: string[] } {
  const base = solverLadder(spec, stuck), problems: string[] = [];
  if (!reply) return { ladder: base, problems: ["no reply: the solver's words throughout"] };
  const ok = (t: unknown, what: string) => { const u = usable(t, stuck.rows, stuck.cols); if (!u) problems.push(what); return u; };
  const opening = base.opening.map((r) => ({ ...r, text: ok(r.kind === "start" ? reply.start : reply.habit, r.kind) ?? r.text }));
  const points = base.points.map((p, k) => {
    const o = reply.points?.[k] ?? {};
    return {
      ...p, rungs: p.rungs.map((r) => {
        if (r.kind === "where") return { ...r, text: ok(o.where, `point ${k + 1} where`) ?? r.text };
        if (r.kind === "step") return { ...r, text: ok(o.step, `point ${k + 1} step`) ?? r.text };
        // the model's rule with its own name, or the solver's rule with the solver's
        const text = ok(o.rule, `point ${k + 1} rule`);
        if (!text) return r;
        const technique = typeof o.technique === "string" && o.technique.trim() && words(o.technique) <= 5 ? o.technique.trim().toLowerCase() : r.technique ?? "the rules";
        return { ...r, text, technique, short: usable(o.short, stuck.rows, stuck.cols) ?? `${technique[0].toUpperCase()}${technique.slice(1)} again.` };
      }),
    };
  });
  return { ladder: { version, opening, points }, problems };
}

/** Is this a stuck-point list as the page sends it? (Shape and size only: the server checks what it
 *  can't trust by other means.) */
export function readStuck(x: unknown, cells: number): Stuck | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const int = (v: unknown, hi: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= hi;
  const str = (v: unknown, n = 200) => typeof v === "string" && v.length <= n;
  if (typeof o.solved !== "boolean" || !int(o.rows, 100) || !int(o.cols, 100) || !Array.isArray(o.points) || o.points.length > LIMITS.points) return null;
  const points: StuckPoint[] = [];
  for (const p of o.points as Record<string, unknown>[]) {
    const k = p?.key as Record<string, unknown> | undefined;
    if (!k || !str(k.where) || !Array.isArray(k.cells) || !Array.isArray(k.facts) || !Array.isArray(k.uses) || !Array.isArray(k.clues)) return null;
    const facts = (k.facts as Record<string, unknown>[]).slice(0, 12).filter((f) => str(f?.mark, 40) && typeof f.value === "boolean" && str(f.text, 80))
      .map((f) => ({ mark: f.mark as string, value: f.value as boolean, text: f.text as string }));
    points.push({
      key: {
        where: k.where as string, cells: (k.cells as unknown[]).filter((c): c is number => int(c, cells - 1)).slice(0, 200), facts,
        uses: (k.uses as unknown[]).filter((u): u is string => str(u, 60)).slice(0, 12), clues: (k.clues as unknown[]).filter((u): u is string => str(u, 120)).slice(0, 12),
        tier: int(k.tier, 3) ? k.tier as number : 0, cost: typeof k.cost === "number" && Number.isFinite(k.cost) ? k.cost : 0, ...(k.by === "creator" ? { by: "creator" as const } : {}),
      },
      progress: typeof p.progress === "number" && p.progress >= 0 && p.progress <= 1 ? p.progress : 0,
      marks: (Array.isArray(p.marks) ? p.marks : []).filter((m): m is KeyMark => Array.isArray(m) && m.length === 3 && typeof m[0] === "string" && int(m[1], 1e5) && int(m[2], 255)).slice(0, LIMITS.marks),
      clueCells: (Array.isArray(p.clueCells) ? p.clueCells : []).filter((c): c is number => int(c, cells - 1)).slice(0, 200),
    });
  }
  return { solved: o.solved, points, rows: o.rows as number, cols: o.cols as number, ...(int(o.creatorMoves, 1000) ? { creatorMoves: o.creatorMoves as number } : {}) };
}
