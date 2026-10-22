// The Sudoku player's helpers (src/game-types/grid/sudoku-assist.ts): candidates from the houses
// and thermometers, repeats marked at once, notes tidied and kept by auto-notes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { emptyBoard, type Board, type Puzzle } from "~site/engine/types.ts";
import { assistFor, autoNotes, candidates, clashes, notesSeeing, placed } from "~site/game-types/grid/sudoku-assist.ts";
import { specOf } from "~/sketchpad/from-puzzle";

const GAMES = new URL("../../../src/games/", import.meta.url).pathname;
const example = (folder: string, n = 1) => makePuzzle(specOf(folder, JSON.parse(readFileSync(`${GAMES}${folder}/${n}.json`, "utf8"))));
const fresh = (p: Puzzle): Board => {
  const b = emptyBoard(p.grid);
  for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") b.digit[i] = x.value;
  return b;
};
const bits = (ds: number[]) => ds.reduce((m, d) => m | (1 << d), 0);
const digitsOf = (m: number, n: number) => Array.from({ length: n }, (_, k) => k + 1).filter((d) => m & (1 << d));

describe("sudoku assist", () => {
  const p = example("sudoku", 3), a = assistFor(p)!;
  const g = p.grid;

  it("is for digit puzzles with local rules only", () => {
    expect(a).not.toBeNull();
    expect(assistFor(example("akari"))).toBeNull();
    expect(a.perDigit).toBe(p.digits);
  });

  it("a square's candidates leave out its row, column and box", () => {
    const b = emptyBoard(g);
    b.digit[g.cell(0, 5)] = 1;               // same row
    b.digit[g.cell(7, 0)] = 2;               // same column
    b.digit[g.cell(1, 1)] = 3;               // same box
    b.digit[g.cell(8, 8)] = 4;               // none of them
    const m = candidates(a, p, b, g.cell(0, 0));
    expect(digitsOf(m, 9)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it("marks both of a repeat, and nothing on a clean board", () => {
    const b = fresh(p);
    expect(clashes(a, b).size).toBe(0);
    const empty = [...Array(g.cellCount).keys()].find((i) => !b.digit[i])!;
    const seen = [...a.peers[empty]].find((j) => b.digit[j])!;
    b.digit[empty] = b.digit[seen];
    const c = clashes(a, b);
    expect(c.has(empty) && c.has(seen)).toBe(true);
    for (const i of c) expect(i === empty || (a.peers[empty].has(i) && b.digit[i] === b.digit[empty])).toBe(true);
  });

  it("counts what's placed", () => {
    const b = emptyBoard(g);
    b.digit[0] = 5; b.digit[40] = 5; b.digit[80] = 9;
    const c = placed(p, b);
    expect(c[5]).toBe(2); expect(c[9]).toBe(1); expect(c[1]).toBe(0);
  });

  it("a placed digit is wiped from the notes that see it", () => {
    const b = emptyBoard(g);
    b.pencil[g.cell(0, 8)] = bits([4, 7]);   // same row
    b.pencil[g.cell(8, 8)] = bits([4]);      // sees nothing of (0, 0)
    expect(notesSeeing(a, b, g.cell(0, 0), 4)).toEqual([[g.cell(0, 8), bits([7])]]);
  });

  it("auto-notes fill empty squares, keep crossed-out notes out, and give back an erased digit", () => {
    const b = emptyBoard(g);
    for (const [i, v] of autoNotes(a, p, b)) b.pencil[i] = v;
    expect(b.pencil[0]).toBe(bits([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    b.pencil[1] &= ~(1 << 6);                // the player crosses out 6
    b.digit[0] = 4;
    for (const [i, v] of autoNotes(a, p, b)) b.pencil[i] = v;
    expect(digitsOf(b.pencil[1], 9)).toEqual([1, 2, 3, 5, 7, 8, 9]);
    expect(b.pencil[g.cell(8, 8)] & (1 << 4)).toBeTruthy();   // far away, 4 stays
    b.digit[0] = 0;                          // 4 taken out again
    for (const [i, v] of autoNotes(a, p, b, [[0, 4]])) b.pencil[i] = v;
    expect(digitsOf(b.pencil[1], 9)).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);   // 4 is back, 6 stays out
    expect(b.pencil[0]).toBe(bits([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });
});

describe("thermometers", () => {
  const p = example("thermo-sudoku"), a = assistFor(p)!;
  const t = p.thermos.find((x) => x.length >= 3)!;

  it("the bulb leaves room for the rest, and digits rise past a placed one", () => {
    const b = emptyBoard(p.grid);
    const n = p.digits, len = t.length;
    expect(Math.max(...digitsOf(candidates(a, p, b, t[0]), n))).toBeLessThanOrEqual(n - (len - 1));
    expect(Math.min(...digitsOf(candidates(a, p, b, t[len - 1]), n))).toBeGreaterThanOrEqual(len);
    b.digit[t[0]] = 2;
    expect(Math.min(...digitsOf(candidates(a, p, b, t[2]), n))).toBeGreaterThanOrEqual(4);
  });

  it("a thermometer out of order clashes", () => {
    const b = emptyBoard(p.grid);
    b.digit[t[0]] = 3; b.digit[t[1]] = 2;
    expect(clashes(a, b).has(t[1])).toBe(true);
  });
});

describe("German Whispers", () => {
  // a 9 × 9 Sudoku with one whisper along the top row's first three squares (gap 5 by default)
  const base = example("sudoku", 3);
  const p = { ...base, rules: [...base.rules, { rule: "whispers" }], whispers: [[0, 1, 2]] } as Puzzle;
  const a = assistFor(p)!;

  it("a whisper square can't hold 5, and a placed digit rules out its near neighbours", () => {
    const b = emptyBoard(p.grid);
    expect(candidates(a, p, b, 1) & (1 << 5)).toBe(0);
    expect(candidates(a, p, b, 40) & (1 << 5)).toBeTruthy();   // off the whisper, 5 is fine
    b.digit[1] = 3;
    expect(digitsOf(candidates(a, p, b, 0), 9)).toEqual([8, 9]);
    expect(digitsOf(candidates(a, p, b, 2), 9)).toEqual([8, 9]);
  });

  it("neighbours too close clash, and a smaller gap is read from the rule", () => {
    const b = emptyBoard(p.grid);
    b.digit[0] = 2; b.digit[1] = 6;
    expect([...clashes(a, b)].sort()).toEqual([0, 1]);
    const p3 = { ...p, rules: [...base.rules, { rule: "whispers", gap: 3 }] } as Puzzle;
    expect(clashes(assistFor(p3)!, b).size).toBe(0);
  });
});
