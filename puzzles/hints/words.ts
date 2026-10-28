// The words of a hint ladder (src/lib/hint-ladder.ts), from the stuck points stuck.ts finds. Two
// writers, the same shape:
//   solver   free: plain sentences from the solver's step and the type's guide (its rules' own
//            wording); every puzzle can have one at once
//   opus     one Opus call per puzzle, grounded on the same stuck points (the H2 result: a grounded
//            location beat the solver's own by 12 points), in the hybrid style: where in the solve
//            it comes, a reusable "whenever X, Y" rule with one question, then the step. Paid, so
//            only when asked (write-site.ts --writer opus); any rung it gets wrong (too long, a cell
//            named, nothing said) falls back to the solver's wording
// Neither names cells ("r3c4"): the page outlines them on the board instead.
import Anthropic from "@anthropic-ai/sdk";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { guides } from "../../src/guides/guides.ts";
import { type Ladder, LIMITS, type Rung, type StuckPoint, words } from "../../src/lib/hint-ladder.ts";
import type { Fact, Step } from "../difficulty/deduce.ts";
import { drawGrid, rulesOf } from "../difficulty/llm-label.ts";
import { cellsInText } from "../difficulty/walkthrough-core.ts";
import type { Found, Stuck } from "./stuck.ts";

export const SOLVER_WRITER = "solver-1", OPUS_WRITER = "opus-1";
const OPUS = { id: "claude-opus-5-5", input: 4 / 1e6, output: 20 / 1e6 };

/** what a "yes" and a "no" mean in a type's own words, where "shaded" isn't what players say */
const VALUES: Record<string, [string, string]> = {
  akari: ["has a bulb", "has no bulb"], "star-battle": ["has a star", "has no star"], minesweeper: ["has a mine", "has no mine"],
  nurikabe: ["is wall", "is part of an island"], hitori: ["is shaded", "stays white"], nonogram: ["is filled", "is empty"],
};

const genreOf = (spec: GridSpec) => spec.genre ?? "";
const guideOf = (spec: GridSpec) => (guides as Record<string, (typeof guides)[keyof typeof guides] | undefined>)[genreOf(spec)];
const firstSentence = (s: string) => s.split(/(?<=[.!?])\s+/)[0];
const clip = (s: string, n = LIMITS.words) => { const w = s.trim().split(/\s+/); return w.length <= n ? s.trim() : `${w.slice(0, n - 1).join(" ")}…`; };

/** The rule kinds a step's explanation uses, cheapest-to-say first ("lit", "adjacent-count"). */
const kindsOf = (s: Step) => [...new Set(s.uses.map((u) => u.replace(/^clue:/, "")))];
/** The type's guide rule that covers a step: the one for the first rule instance its explanation
 *  names ("adjacent-count (r3c5 r4c4 r5c5)"), else for any rule it uses. */
function guideRule(spec: GridSpec, s: Step): string | null {
  const g = guideOf(spec);
  const kinds = [...new Set([...(s.because?.clues ?? []).map((c) => c.replace(/ \(.*$/, "")), ...s.uses])];
  for (const k of kinds) { const rule = g?.rules.find((r) => (r.checks ?? []).includes(k)); if (rule) return firstSentence(rule.text); }
  return null;
}
/** A technique's tag from the solver: the rule kinds it combines ("adjacent count + lit"). */
const solverTechnique = (s: Step) => (s.tier >= 2 ? "what-if" : kindsOf(s).map((k) => k.replace(/-/g, " ")).join(" + ") || "the rules");

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
function factText(spec: GridSpec, f: Fact): string {
  const d = /^digit\(\d+,(\d+)\)$/.exec(f.mark);
  const symbols = makePuzzle(spec).style.symbols;
  if (d) return `The outlined square ${f.value ? "is" : "isn't"} ${symbols?.[Number(d[1]) - 1] ?? d[1]}.`;
  if (/^line\(/.test(f.mark)) return f.value ? "The line runs between the two outlined squares." : "The line doesn't run between the two outlined squares.";
  if (/^fence\(/.test(f.mark)) {
    // the loop drawn on the grid's edges (Slitherlink), or walls
    const line = makePuzzle(spec).rules.find((r) => r.rule === "loop" || r.rule === "path")?.rule;
    if (line) return f.value ? `The ${line} runs along the edge between the two outlined squares.` : `The ${line} doesn't use the edge between the two outlined squares.`;
    return f.value ? "There's a wall between the two outlined squares." : "There's no wall between the two outlined squares.";
  }
  if (/^cut\(/.test(f.mark)) return f.value ? "The two outlined squares are in different regions." : "The two outlined squares are in the same region.";
  if (/^paint\(/.test(f.mark)) return "The outlined square takes this color.";
  const v = VALUES[genreOf(spec)] ?? ["is shaded", "isn't shaded"];
  return `The outlined square ${f.value ? v[0] : v[1]}.`;
}

/** The solver's words for one stuck point. */
export function solverRungs(spec: GridSpec, f: Found): Rung[] {
  const s = f.key, fact = s.facts.find((x) => x.value) ?? s.facts[0];
  const split = s.tier >= 2 || /^assume\b/.test(s.where);
  const rule = guideRule(spec, s), technique = solverTechnique(s);
  const where: Rung = { kind: "where", text: `${phase(f.progress)}, look at the outlined ${unitOf(s.where)}.`, area: s.cells };
  const ruleRung: Rung = split
    ? { kind: "rule", text: "Whenever nothing follows directly, try a what-if: suppose one outlined square went the other way. Which rule breaks?", technique, short: "Try a what-if here.", area: s.cells }
    : { kind: "rule", text: clip(`${rule ? `Remember: ${rule}` : "Look at what the clues here allow."} What must be true here?`), technique, short: `This is a ${technique} spot.`, ...(f.clueCells.length ? { area: f.clueCells } : {}) };
  const step: Rung = { kind: "step", text: factText(spec, fact), area: cellsOfMark(spec, fact.mark) };
  return [where, ruleRung, step];
}

/** The opening, in the solver's words: no cells, nothing about this puzzle in particular. */
export function solverOpening(spec: GridSpec): Rung[] {
  const p = makePuzzle(spec), marks = p.marks;
  const habit = marks.includes("digit") ? "Pencil in the digits a square can still take; the ones with a single option come first."
    : marks.includes("loop") || marks.includes("fence") ? "Cross out the edges you know are empty: they narrow down the rest."
    : "Dot the squares you know stay empty as you go: they make the next step easier to see.";
  return [
    { kind: "start", text: "Start where a clue leaves the least room: the biggest or smallest numbers, the corners and the edges." },
    { kind: "habit", text: habit },
  ];
}

const point = (f: Found, rungs: Rung[]): StuckPoint => ({ marks: f.marks, rungs });

/** A ladder in the solver's words: free, for every puzzle. */
export function solverLadder(spec: GridSpec, stuck: Stuck): Ladder {
  return { version: SOLVER_WRITER, opening: solverOpening(spec), points: stuck.points.map((f) => point(f, solverRungs(spec, f))) };
}

// ---------- Opus ----------
const rc = (cols: number) => (c: number) => `r${Math.floor(c / cols) + 1}c${(c % cols) + 1}`;

/** The prompt: the rules, the empty grid, and each stuck point as the solver found it (with cells,
 *  for Opus only: the hints it writes must not name them). The hybrid style in our own words. */
export function opusPrompt(spec: GridSpec, stuck: Stuck): string {
  const name = guideOf(spec)?.name ?? genreOf(spec), cell = rc(stuck.cols);
  const rules = guideOf(spec)?.rules.map((r) => `- ${r.text}`).join("\n") ?? rulesOf(spec);
  let grid = "";
  try { grid = drawGrid(spec); } catch { /* a type the drawing doesn't know: the rules and cells will do */ }
  const points = stuck.points.map((f, k) => {
    const s = f.key;
    return `${k + 1}. About ${Math.round(100 * f.progress)}% through the solve. The solver looked at ${s.where} (${s.cells.map(cell).join(" ")}) and found: ${s.facts.map((x) => x.text).join("; ")}.` +
      ` It used: ${(s.because?.clues ?? []).join(", ") || s.uses.join(", ")}${s.tier >= 2 ? " (a case split: one value leads to a contradiction)" : ""}.`;
  }).join("\n");
  return `You are writing the hints for a ${name} puzzle on a puzzle site. A player who is stuck opens them one at a time.

Rules:
${rules}

The puzzle (row 1 at the top, column 1 at the left):
${grid}

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

interface OpusReply { start?: string; habit?: string; points?: { where?: string; rule?: string; technique?: string; short?: string; step?: string }[] }

/** The reply's JSON: the last object with "points" (a fence or a sentence around it is fine). */
export function parseReply(text: string): OpusReply | null {
  for (let i = text.lastIndexOf("{"); i >= 0; i = text.lastIndexOf("{", i - 1)) {
    for (let j = text.lastIndexOf("}"); j > i; j = text.lastIndexOf("}", j - 1)) {
      try { const o = JSON.parse(text.slice(i, j + 1)); if (o && Array.isArray(o.points)) return o; } catch { /* a shorter span */ }
    }
  }
  return null;
}

/** A hint Opus wrote, if it keeps the house rules: something said, short, plain, and no cell named. */
export function usable(text: unknown, rows: number, cols: number): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const t = text.trim().replace(/\s+/g, " ");
  if (words(t) > LIMITS.words || /[*_`#<>]/.test(t) || cellsInText(t, rows, cols).length || /\br\d+\s*c\d+\b/i.test(t)) return null;
  return t;
}

/** Opus's ladder, each rung checked, the solver's words where one fails. `problems` lists what fell back. */
export function ladderFromReply(spec: GridSpec, stuck: Stuck, reply: OpusReply | null): { ladder: Ladder; problems: string[] } {
  const base = solverLadder(spec, stuck), problems: string[] = [];
  if (!reply) return { ladder: base, problems: ["no JSON in the reply: the solver's words throughout"] };
  const ok = (t: unknown, what: string) => { const u = usable(t, stuck.rows, stuck.cols); if (!u) problems.push(what); return u; };
  const opening = base.opening.map((r) => ({ ...r, text: ok(r.kind === "start" ? reply.start : reply.habit, r.kind) ?? r.text }));
  const points = base.points.map((p, k) => {
    const o = reply.points?.[k] ?? {};
    const [where, rule, step] = p.rungs;
    const technique = typeof o.technique === "string" && o.technique.trim() && words(o.technique) <= 5 ? o.technique.trim().toLowerCase() : rule.technique ?? "the rules";
    const ruleText = ok(o.rule, `point ${k + 1} rule`);
    return {
      ...p, rungs: [
        { ...where, text: ok(o.where, `point ${k + 1} where`) ?? where.text },
        // Opus's rule with its own name, or the solver's rule with the solver's
        ruleText ? { ...rule, text: ruleText, technique, short: usable(o.short, stuck.rows, stuck.cols) ?? `${technique[0].toUpperCase()}${technique.slice(1)} again.` } : rule,
        { ...step, text: ok(o.step, `point ${k + 1} step`) ?? step.text },
      ],
    };
  });
  return { ladder: { version: OPUS_WRITER, opening, points }, problems };
}

/** Ask Opus (INKIT_ANTHROPIC_KEY, else ANTHROPIC_API_KEY). Returns the reply's text and its cost. */
export async function askOpus(prompt: string): Promise<{ text: string; cost: number }> {
  const key = process.env.INKIT_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no INKIT_ANTHROPIC_KEY or ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 10 * 60_000 });
  const r = await client.messages.create({ model: OPUS.id, max_tokens: 16000, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, messages: [{ role: "user", content: prompt }] } as any) as Anthropic.Message;
  const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { text, cost: r.usage.input_tokens * OPUS.input + r.usage.output_tokens * OPUS.output };
}
