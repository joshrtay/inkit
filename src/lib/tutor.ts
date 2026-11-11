// The puzzle tutor: a chat beside the board (app/components/TutorPanel.tsx). When the player asks,
// the deduction solver reads their board in their browser (puzzles/hints/tutor.ts): what's wrong
// on it and the moves open from it, cheapest first. A model then talks with the player from that
// read (app/lib/tutor.server.ts). The solver decides what's true; the model only words it, and
// leads the player to find the move rather than handing it over. How it teaches is the few lines
// under "How to help" in tutorSystem: the whole policy, for now.
import { makePuzzle } from "../engine/puzzle.ts";
import type { GridSpec } from "../engine/types.ts";
import { guides } from "../guides/guides.ts";

/** The board's layers the tutor reads (game.ts's Board, without pencil notes). */
export const LAYERS = ["shade", "fence", "loop", "cut", "color", "digit"] as const;
export type Layer = (typeof LAYERS)[number];
/** A mark on the board: the layer, its index there, and its value. */
export type KeyMark = [Layer, number, number];
/** A player's board, as far as the tutor reads it. */
export type BoardLike = Partial<Record<Layer, ArrayLike<number>>>;

export const guideOf = (spec: GridSpec) => (guides as Record<string, (typeof guides)[keyof typeof guides] | undefined>)[spec.genre ?? ""];

/** The cells a mark is on (a cell's, or the two cells either side of a line or wall). */
export function cellsOfMark(spec: GridSpec, mark: string): number[] {
  const q = /^(\w+)\((\d+)(?:,(\d+))?\)$/.exec(mark);
  if (!q) return [];
  const g = makePuzzle(spec).grid, id = Number(q[2]);
  if (q[1] === "line" || q[1] === "cut") return g.links[id]?.cells ?? [];
  if (q[1] === "fence") return g.borders[id]?.cells?.filter((c: number) => c >= 0) ?? [];
  return [id];
}

/** The squares to outline for a move. A what-if's own cells are everything the solver touched
 *  following it (often the whole grid), so it outlines what it decides and the squares around that. */
export function focusOf(spec: GridSpec, s: { where: string; cells: number[]; facts: { mark: string }[]; tier: number }, rows: number, cols: number): number[] {
  if (s.tier < 2 && !/^assume\b/.test(s.where)) return s.cells;
  const decided = [...new Set(s.facts.flatMap((x) => cellsOfMark(spec, x.mark)))];
  if (!decided.length) return s.cells;
  const out = new Set<number>();
  for (const c of decided) {
    const r = Math.floor(c / cols), k = c % cols;
    for (let dr = -1; dr <= 1; dr++) for (let dk = -1; dk <= 1; dk++) {
      const rr = r + dr, kk = k + dk;
      if (rr >= 0 && rr < rows && kk >= 0 && kk < cols) out.add(rr * cols + kk);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The puzzle's givens as lines ("r2c3: number 4"), for the model to picture it. */
export function givensText(spec: GridSpec): string {
  const p = makePuzzle(spec), cols = p.grid.cols, cell = (c: number) => `r${Math.floor(c / cols) + 1}c${(c % cols) + 1}`, out: string[] = [];
  for (const [i, gs] of p.cellGivens) for (const x of gs) out.push(`${cell(i)}: ${x.kind}${"value" in x && x.value !== undefined ? ` ${x.value}` : ""}`);
  if (p.areas) {
    const by = new Map<number, number[]>();
    p.areas.of.forEach((a, i) => { if (a >= 0) by.set(a, [...(by.get(a) ?? []), i]); });
    for (const [a, cells] of by) out.push(`area ${a + 1}: ${cells.map(cell).join(" ")}`);
  }
  return out.join("\n") || "(no givens)";
}

export interface TutorFact { mark: string; value: boolean; text: string }
export interface TutorMove {
  /** what the solver looked at ("row 3", "assume r2c4 shaded", …) and its cells */
  where: string; cells: number[];
  facts: TutorFact[];
  /** how hard it is to see (the solver's step cost), and 2+ for a case split */
  cost: number; tier: number;
  /** the clues its reason uses, and their cells */
  clues: string[]; clueCells: number[];
  /** the squares to outline for it, and the marks it puts on the board */
  focus: number[]; marks: KeyMark[];
}
/** A wrong mark. `ruledOut`: the other marks already rule it out (`why`: the clues that do); otherwise
 *  it was a guess, which nothing on the board decided yet. */
export interface Mistake { mark: string; text: string; cells: number[]; ruledOut: boolean; why?: string[] }
export interface BoardRead { mistakes: Mistake[]; moves: TutorMove[]; done: boolean }

/** The questions offered as buttons. Their first answers, from a given read, are kept and reused. */
export const ASKS = {
  look: "Where should I look?",
  rule: "What rule am I missing?",
  check: "Is anything wrong so far?",
  tell: "Just tell me the next move.",
} as const;
export type Ask = keyof typeof ASKS;

export interface ChatTurn { role: "player" | "tutor"; text: string }

/** How hard a move is, in words (the solver's step costs: under 4 is a glance, a case split is hard). */
export const ease = (m: TutorMove) => (m.tier >= 2 ? "hard (a case split: suppose one way, find a contradiction)" : m.cost < 4 ? "easy" : m.cost < 7 ? "medium" : "hard");

/** What a cached answer depends on: the question, and what the solver found on the board (the
 *  mistakes, or the cheapest move). */
export function cacheKey(ask: Ask, read: BoardRead): string {
  const sig = read.mistakes.length ? `wrong:${read.mistakes.map((m) => m.mark).sort().join(",")}`
    : read.moves[0] ? `move:${read.moves[0].facts.map((f) => `${f.mark}=${f.value}`).sort().join(",")}` : read.done ? "done" : "none";
  return `${ask}|${sig}`;
}

/** The tutor's instructions: the puzzle, what the solver found on the player's board, and how to talk. */
export function tutorSystem(spec: GridSpec, read: BoardRead): string {
  const g = guideOf(spec), name = g?.name ?? spec.genre ?? "grid";
  const rules = g?.rules.map((r) => `- ${r.text}`).join("\n") ?? "";
  const found = read.mistakes.length
    ? `The board has ${read.mistakes.length} wrong mark${read.mistakes.length > 1 ? "s" : ""}:\n${read.mistakes.map((m) => `- ${m.text}. ${m.ruledOut
      ? `The rest of the board already rules it out${m.why?.length ? `, by ${m.why.join(", ")}` : ""}: a logical slip.`
      : "No simple step from the rest of the board decides it: most likely a guess, where the other way looked just as possible."}`).join("\n")}`
    : "Nothing on the board is wrong.";
  const moves = read.done ? "The puzzle is solved." : read.moves.length
    ? read.moves.map((m, i) => `${i + 1}. [${ease(m)}] ${m.facts.map((f) => f.text).join("; ")}. Found by looking at ${m.where}${m.clues.length ? `, using ${m.clues.join(", ")}` : ""}.`).join("\n")
    : "The solver couldn't find the next move in time.";
  return `You are the tutor beside a player solving a ${name} puzzle (${spec.size[0]} rows × ${spec.size[1]} columns) on a puzzle site. They asked you for help.

The rules:
${rules}

The givens (row 1 is the top, column 1 the left):
${givensText(spec)}

A solver read the player's board just now.
${found}
Moves open from here, easiest first (the solver proved each one):
${moves}

How to help:
- If something on the board is wrong, deal with that first. Say what kind of error it is, since that is the lesson: a guess (nothing decided it yet, so both ways were open: say so, and suggest undoing it and finding what does decide it) or a slip (a rule already rules it out: ask them to check that spot against the rule). Say roughly where before saying exactly which mark. Don't just say it's not in the solution.
- Otherwise steer toward move 1, unless the player is plainly working on another listed move.
- Teach, don't just tell. Prefer a short question that lets them find it themselves ("How far does a black pearl's leg have to run?"). If the move is easy, be specific right away: name the spot and the rule. If it's hard, start with where to look and the idea, and get more specific each time they ask again.
- If they ask to be told, tell them the move plainly, and why, the first time they ask. Then add the question that would have found it ("Next time, ask: which pearl has the fewest ways to go?").
- Name places the way a player sees them: "the black pearl on the right edge, third row down", "the white pearl next to it". Never write coordinates like r3c4.
- Only say a line, mark or value is forced if it follows from a listed move or a mistake above. Don't invent rules or claim anything else.
- Keep it short: at most two sentences, under 40 words, plain words, no lists or markdown. One idea per reply; the player can always ask for more.

Set "move" to the number of the listed move your reply points at (0 for none), and "mistake" to true when it points at a wrong mark.`;
}

/** What's wrong with a reply as written, checked in code before the player sees it: a square named
 *  by coordinates (the player sees landmarks, and the page outlines the spot), or too long. */
export const REPLY_WORDS = 60;
export function replyProblems(text: string): string[] {
  const out: string[] = [];
  if (/\br\d{1,2}c\d{1,2}\b/i.test(text)) out.push("names a square by coordinates");
  if (text.trim().split(/\s+/).length > REPLY_WORDS) out.push("too long");
  if (!text.trim()) out.push("empty");
  return out;
}

/** A plain reply from the solver's read alone, with no model: when the day's limit is reached, the
 *  model's reply fails its checks twice, or there's no key. It points at the spot, which the page
 *  outlines ("Show where"). */
export function plainReply(read: BoardRead): { text: string; move: number; mistake: boolean } {
  if (read.mistakes.length) return { text: read.mistakes.length > 1 ? "Some marks on your board are wrong. Check the squares I've outlined against the rules." : "One mark on your board is wrong. Check the squares I've outlined against the rules.", move: 0, mistake: true };
  if (read.done) return { text: "That's solved.", move: 0, mistake: false };
  if (read.moves.length) return { text: "There's a move in the squares I've outlined. Which rule applies there?", move: 1, mistake: false };
  return { text: "I couldn't find the next move in time. Try the board's own hint button.", move: 0, mistake: false };
}
