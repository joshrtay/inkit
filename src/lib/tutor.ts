// The puzzle tutor: a chat beside the board (app/components/TutorPanel.tsx). When the player asks,
// the deduction solver reads their board in their browser (puzzles/hints/tutor.ts): what's wrong
// on it and the moves open from it, cheapest first. A model then talks with the player from that
// read (app/lib/tutor.server.ts). The solver decides what's true; the model only words it, and
// leads the player to find the move rather than handing it over.
import type { GridSpec } from "../engine/types.ts";
import type { KeyMark } from "./hint-ladder.ts";
import { givensText, guideOf } from "./hint-words.ts";

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
- If they ask to be told, tell them the move plainly, and why.
- Name places the way a player sees them: "the black pearl on the right edge, third row down", "the white pearl next to it". Never write coordinates like r3c4.
- Only say a line, mark or value is forced if it follows from a listed move or a mistake above. Don't invent rules or claim anything else.
- Keep it short: at most two sentences, under 40 words, plain words, no lists or markdown. One idea per reply; the player can always ask for more.

Set "move" to the number of the listed move your reply points at (0 for none), and "mistake" to true when it points at a wrong mark.`;
}
