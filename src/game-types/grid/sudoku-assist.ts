// The Sudoku player's helpers, after Good Sudoku: which digits a square can still take, which
// digits already clash, and how many of each are placed. Pure, so the player (game.ts) and the
// unit tests share it.
//
// Each rule with local logic says when a digit can't go in a square, given the digits placed
// around it: the houses (rows and columns, boxes or outlined areas) by repeats, a thermometer by
// its order, a whisper by its gap. A variant's rule joins with one entry in LOCAL. Rules without
// one (Skyscrapers' edge clues) are only checked when the grid is full, as before.
import { boxesOf } from "../../engine/rules.ts";
import type { Board, Puzzle, RuleSpec } from "../../engine/types.ts";

export interface Assist {
  /** the groups of squares that hold each digit at most once */
  houses: number[][];
  /** the houses each square is in, by square */
  peers: Set<number>[];
  /** whether `d` breaks a local rule at square `i`, with the board's other digits as they are */
  blocked(b: Board, i: number, d: number): boolean;
  /** how many of each digit a full grid holds (0: not counted, the digits aren't spread evenly) */
  perDigit: number;
}

type Local = (s: RuleSpec, p: Puzzle) => {
  houses?: number[][];
  /** a rule's own test for `d` at `i` (houses are tested for every rule together) */
  blocked?: (b: Board, i: number, d: number) => boolean;
};

const rowsAndColumns = (p: Puzzle) => {
  const g = p.grid, out: number[][] = [];
  for (let r = 0; r < g.rows; r++) out.push(Array.from({ length: g.cols }, (_, c) => g.cell(r, c)));
  for (let c = 0; c < g.cols; c++) out.push(Array.from({ length: g.rows }, (_, r) => g.cell(r, c)));
  return out;
};

/** A thermometer: digits rise from the bulb, so a square k steps past a placed digit e needs at
 *  least e + k, and k steps before one at most e − k; the bulb's end needs room for the rest. */
function thermoBlocked(p: Puzzle) {
  const on = new Map<number, [number[], number][]>();
  for (const t of p.thermos) t.forEach((i, k) => on.set(i, [...(on.get(i) ?? []), [t, k]]));
  return (b: Board, i: number, d: number) => (on.get(i) ?? []).some(([t, k]) => {
    if (d < k + 1 || d > p.digits - (t.length - 1 - k)) return true;
    return t.some((j, m) => m !== k && b.digit[j] > 0 && (m < k ? d < b.digit[j] + (k - m) : d > b.digit[j] - (m - k)));
  });
}

/** German Whispers: neighbours along a whisper differ by at least the gap (ceil(digits / 2) by
 *  default), so a digit too near the middle can't sit on one at all, and a placed digit rules out
 *  its near neighbours next to it. */
function whispersBlocked(s: RuleSpec, p: Puzzle) {
  const gap = typeof s.gap === "number" ? s.gap : Math.ceil(p.digits / 2);
  const next = new Map<number, number[]>();
  // p.whispers comes with the German Whispers genre (read loosely until the engine has it everywhere)
  for (const w of (p as { whispers?: number[][] }).whispers ?? []) w.forEach((i, k) => {
    next.set(i, [...(next.get(i) ?? []), ...[w[k - 1], w[k + 1]].filter((j) => j !== undefined)]);
  });
  // a digit with no other digit far enough from it can't sit on a whisper
  const lonely = (d: number) => d - gap < 1 && d + gap > p.digits;
  return (b: Board, i: number, d: number) => {
    const ns = next.get(i);
    return !!ns && (lonely(d) || ns.some((j) => b.digit[j] > 0 && Math.abs(b.digit[j] - d) < gap));
  };
}

export const LOCAL: Record<string, Local> = {
  latin: (_s, p) => ({ houses: rowsAndColumns(p) }),
  boxes: (s, p) => ({ houses: boxesOf(s, p) }),
  thermo: (_s, p) => ({ blocked: thermoBlocked(p) }),
  whispers: (s, p) => ({ blocked: whispersBlocked(s, p) }),
};

/** The helpers for a puzzle, or null when none of its rules has local logic (not a Sudoku). */
export function assistFor(p: Puzzle): Assist | null {
  if (!p.marks.includes("digit")) return null;
  const parts = p.rules.flatMap((s) => (LOCAL[s.rule] ? [LOCAL[s.rule](s, p)] : []));
  if (!parts.length) return null;
  const houses = parts.flatMap((x) => x.houses ?? []), tests = parts.flatMap((x) => (x.blocked ? [x.blocked] : []));
  const peers = Array.from({ length: p.grid.cellCount }, () => new Set<number>());
  for (const h of houses) for (const i of h) for (const j of h) if (i !== j) peers[i].add(j);
  const latin = p.rules.some((s) => s.rule === "latin") && p.grid.rows === p.digits && p.grid.cols === p.digits;
  return {
    houses, peers,
    blocked: (b, i, d) => [...peers[i]].some((j) => b.digit[j] === d) || tests.some((t) => t(b, i, d)),
    perDigit: latin ? p.digits : 0,
  };
}

/** The digits square `i` can still take, as a bit set (bit d for digit d). */
export function candidates(a: Assist, p: Puzzle, b: Board, i: number): number {
  let bits = 0;
  for (let d = 1; d <= p.digits; d++) if (!a.blocked(b, i, d)) bits |= 1 << d;
  return bits;
}

/** The squares whose digit breaks a local rule: a repeat in a house, a thermometer out of order.
 *  Each is tested as if it were empty, so both of two repeats are marked. */
export function clashes(a: Assist, b: Board): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < b.digit.length; i++) {
    const d = b.digit[i];
    if (!d) continue;
    b.digit[i] = 0;
    if (a.blocked(b, i, d)) out.add(i);
    b.digit[i] = d;
  }
  return out;
}

/** How many times each digit is on the board, by digit. */
export function placed(p: Puzzle, b: Board): number[] {
  const out = new Array<number>(p.digits + 1).fill(0);
  for (const d of b.digit) if (d > 0 && d <= p.digits) out[d]++;
  return out;
}

/** The notes to wipe when `d` goes in square `i`: `d` in the notes of every square that sees it. */
export function notesSeeing(a: Assist, b: Board, i: number, d: number): [number, number][] {
  return [...a.peers[i]].filter((j) => b.pencil[j] & (1 << d)).map((j) => [j, b.pencil[j] & ~(1 << d)]);
}

/** Auto-notes: the notes to change so every empty square shows what it can still take. Notes
 *  are only taken away (a note the player crossed out stays out), except that an empty square
 *  with none gets them all, and a digit taken out of a square (`erased`: square and digit) comes
 *  back to the notes that see it. Returns [square, notes] pairs to set. */
export function autoNotes(a: Assist, p: Puzzle, b: Board, erased: [number, number][] = []): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < b.digit.length; i++) {
    if (b.digit[i] || p.blocked.has(i)) continue;
    const open = candidates(a, p, b, i), cur = b.pencil[i];
    let next = cur && !erased.some(([j]) => j === i) ? cur & open : open;
    for (const [j, d] of erased) if (a.peers[i].has(j)) next |= open & (1 << d);
    if (next !== cur) out.push([i, next]);
  }
  return out;
}
