// The Sudoku technique solver (puzzles/difficulty/sudoku): each technique on a small hand-made
// candidate grid, where it must fire and where it mustn't; whole puzzles solved with every step
// checked against the answer; the profile and its ratings.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { puzzleFromJson } from "../../../puzzles/difficulty/sudoku/cli.ts";
import { bit, boardOf, emptyBoard, fromString, toString, type Board, type SudokuPuzzle } from "../../../puzzles/difficulty/sudoku/grid.ts";
import { rate } from "../../../puzzles/difficulty/sudoku/solve.ts";
import * as T from "../../../puzzles/difficulty/sudoku/techniques.ts";

const example = (genre: string, n: number) => {
  const file = new URL(`../../../src/games/${genre}/${n}.json`, import.meta.url);
  return puzzleFromJson(readFileSync(file, "utf8"), `src/games/${genre}/${n}.json`);
};

// ---------- hand-made candidate grids (9 × 9, every candidate open unless taken out) ----------
const shape = fromString(".".repeat(81)).shape;
const blank = () => emptyBoard(shape);
const at = (r: number, c: number) => (r - 1) * 9 + (c - 1);
const row = (r: number) => Array.from({ length: 9 }, (_, c) => at(r, c + 1));
const col = (c: number) => Array.from({ length: 9 }, (_, r) => at(r + 1, c));
const box = (k: number) => { const r0 = Math.floor((k - 1) / 3) * 3 + 1, c0 = ((k - 1) % 3) * 3 + 1; return [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => at(r0 + i, c0 + j))); };
/** d stays only in `keep` among these cells */
const only = (b: Board, d: number, cells: number[], keep: number[]) => { for (const c of cells) if (!keep.includes(c)) b.cand[c] &= ~bit(d); };
const set = (b: Board, c: number, ds: number[]) => { b.cand[c] = ds.reduce((m, d) => m | bit(d), 0); };
const sorted = (rs: [number, number][]) => [...rs].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
const ctx = { unique: true };

describe("singles", () => {
  it("full house: the last cell of a row", () => {
    const p = fromString("12345678.".padEnd(81, "."));
    expect(T.fullHouse(start(p))?.place).toEqual([[8, 9]]);
    expect(T.fullHouse(start(fromString("1234567..".padEnd(81, "."))))).toBeNull();
  });
  it("hidden single in a box, not when two cells can hold it", () => {
    const b = blank();
    only(b, 5, box(1), [at(2, 2)]);
    expect(T.hiddenSingleBox(b)?.place).toEqual([[at(2, 2), 5]]);
    const b2 = blank();
    only(b2, 5, box(1), [at(2, 2), at(3, 3)]);
    expect(T.hiddenSingleBox(b2)).toBeNull();
  });
  it("hidden single in a row", () => {
    const b = blank();
    only(b, 7, row(4), [at(4, 6)]);
    expect(T.hiddenSingleLine(b)?.place).toEqual([[at(4, 6), 7]]);
    expect(T.hiddenSingleBox(b)).toBeNull();
  });
  it("naked single", () => {
    const b = blank();
    expect(T.nakedSingle(b)).toBeNull();
    set(b, at(5, 5), [3]);
    expect(T.nakedSingle(b)?.place).toEqual([[at(5, 5), 3]]);
  });
});

/** the board after the givens, before any step */
const start = (p: SudokuPuzzle) => boardOf(p.shape, p.givens);

describe("intersections", () => {
  it("pointing: a box's 4s in one row leave the rest of the row", () => {
    const b = blank();
    only(b, 4, box(1), [at(1, 1), at(1, 2)]);
    const st = T.pointing(b)!;
    expect(sorted(st.remove)).toEqual([4, 5, 6, 7, 8, 9].map((c) => [at(1, c), 4]));
    only(b, 4, row(1), [at(1, 1), at(1, 2)]);   // nothing left to take
    expect(T.pointing(b)).toBeNull();
  });
  it("claiming: a row's 4s in one box leave the rest of the box", () => {
    const b = blank();
    only(b, 4, row(1), [at(1, 1), at(1, 2)]);
    const st = T.claiming(b)!;
    expect(sorted(st.remove)).toEqual([at(2, 1), at(2, 2), at(2, 3), at(3, 1), at(3, 2), at(3, 3)].map((c) => [c, 4]));
    const b2 = blank();
    only(b2, 4, row(1), [at(1, 1), at(1, 5)]);
    expect(T.claiming(b2)).toBeNull();
  });
});

describe("subsets", () => {
  it("naked pair, triple and quad", () => {
    const b = blank();
    set(b, at(1, 1), [1, 2]); set(b, at(1, 5), [1, 2]);
    const st = T.nakedSubset(b, 2, 3)!;
    expect(st.technique).toBe("Naked pair");
    expect(st.remove).toContainEqual([at(1, 9), 1]);
    expect(st.remove).not.toContainEqual([at(1, 5), 1]);
    set(b, at(1, 5), [1, 2, 3]);
    expect(T.nakedSubset(b, 2, 3)).toBeNull();

    const t = blank();
    set(t, at(1, 1), [1, 2]); set(t, at(1, 5), [2, 3]); set(t, at(1, 9), [1, 3]);
    expect(T.nakedSubset(t, 2, 3)).toBeNull();
    const st3 = T.nakedSubset(t, 3, 3.6)!;
    expect(st3.digits).toEqual([1, 2, 3]);
    expect(st3.remove).toContainEqual([at(1, 2), 3]);

    const q = blank();
    set(q, at(1, 1), [1, 2]); set(q, at(1, 2), [2, 3]); set(q, at(1, 3), [3, 4]); set(q, at(1, 4), [1, 4]);
    expect(T.nakedSubset(q, 3, 3.6)).toBeNull();
    expect(T.nakedSubset(q, 4, 5)!.remove).toContainEqual([at(1, 9), 4]);
  });
  it("hidden pair, triple and quad", () => {
    const b = blank();
    only(b, 1, row(1), [at(1, 1), at(1, 2)]); only(b, 2, row(1), [at(1, 1), at(1, 2)]);
    const st = T.hiddenSubset(b, 2, 3.4)!;
    expect(st.technique).toBe("Hidden pair");
    expect(sorted(st.remove)).toEqual([at(1, 1), at(1, 2)].flatMap((c) => [3, 4, 5, 6, 7, 8, 9].map((d) => [c, d])));
    const b2 = blank();
    only(b2, 1, row(1), [at(1, 1), at(1, 2)]); only(b2, 2, row(1), [at(1, 1), at(1, 3)]);
    expect(T.hiddenSubset(b2, 2, 3.4)).toBeNull();
    // triple: 1, 2, 3 in three cells of column 5
    const t = blank(), three = [at(2, 5), at(5, 5), at(8, 5)];
    only(t, 1, col(5), three.slice(0, 2)); only(t, 2, col(5), three.slice(1)); only(t, 3, col(5), [three[0], three[2]]);
    expect(T.hiddenSubset(t, 2, 3.4)).toBeNull();
    const st3 = T.hiddenSubset(t, 3, 4)!;
    expect(st3.cells).toEqual(three);
    expect(st3.remove).toContainEqual([at(5, 5), 9]);
    // quad: 1-4 in four cells of box 9
    const q = blank(), four = [at(7, 7), at(7, 9), at(9, 7), at(9, 9)];
    for (let d = 1; d <= 4; d++) only(q, d, box(9), [four[d - 1], four[d % 4]]);
    expect(T.hiddenSubset(q, 3, 4)).toBeNull();
    expect(T.hiddenSubset(q, 4, 5.4)!.remove).toContainEqual([at(7, 7), 5]);
  });
});

describe("fish", () => {
  it("X-Wing on rows 1 and 4, columns 1 and 5", () => {
    const b = blank();
    only(b, 5, row(1), [at(1, 1), at(1, 5)]); only(b, 5, row(4), [at(4, 1), at(4, 5)]);
    const st = T.fish(b, 2, 3.2)!;
    expect(st.technique).toBe("X-Wing");
    expect(st.remove).toContainEqual([at(7, 1), 5]);
    expect(st.remove).toContainEqual([at(9, 5), 5]);
    expect(st.remove).not.toContainEqual([at(4, 1), 5]);
    only(b, 5, row(4), []); set(b, at(4, 7), [5, 6]); b.cand[at(4, 1)] |= bit(5); b.cand[at(4, 5)] |= bit(5);
    expect(T.fish(b, 2, 3.2)).toBeNull();
  });
  it("Swordfish and Jellyfish", () => {
    const b = blank();
    only(b, 5, row(1), [at(1, 1), at(1, 5)]); only(b, 5, row(4), [at(4, 5), at(4, 9)]); only(b, 5, row(7), [at(7, 1), at(7, 9)]);
    expect(T.fish(b, 2, 3.2)).toBeNull();
    const st = T.fish(b, 3, 3.8)!;
    expect(st.technique).toBe("Swordfish");
    expect(st.remove).toContainEqual([at(5, 9), 5]);
    const j = blank();
    only(j, 6, row(1), [at(1, 1), at(1, 3)]); only(j, 6, row(3), [at(3, 3), at(3, 5)]); only(j, 6, row(5), [at(5, 5), at(5, 8)]); only(j, 6, row(7), [at(7, 1), at(7, 8)]);
    expect(T.fish(j, 3, 3.8)).toBeNull();
    const sj = T.fish(j, 4, 5.2)!;
    expect(sj.technique).toBe("Jellyfish");
    expect(sj.remove).toContainEqual([at(9, 8), 6]);
  });
});

describe("single-digit patterns", () => {
  it("Skyscraper", () => {
    const b = blank();
    only(b, 5, row(2), [at(2, 1), at(2, 4)]); only(b, 5, row(7), [at(7, 1), at(7, 6)]);
    const st = T.skyscraper(b)!;
    expect(sorted(st.remove)).toEqual([at(1, 6), at(3, 6), at(8, 4), at(9, 4)].map((c) => [c, 5]));
    const b2 = blank();
    only(b2, 5, row(2), [at(2, 2), at(2, 4)]); only(b2, 5, row(7), [at(7, 1), at(7, 6)]);
    expect(T.skyscraper(b2)).toBeNull();
  });
  it("2-String Kite", () => {
    const b = blank();
    only(b, 5, row(1), [at(1, 2), at(1, 7)]); only(b, 5, col(1), [at(2, 1), at(7, 1)]);
    expect(T.twoStringKite(b)!.remove).toEqual([[at(7, 7), 5]]);
    const b2 = blank();
    only(b2, 5, row(1), [at(1, 5), at(1, 7)]); only(b2, 5, col(1), [at(4, 1), at(7, 1)]);
    expect(T.twoStringKite(b2)).toBeNull();
  });
  it("simple coloring: a cell seeing both colors", () => {
    const b = blank();
    only(b, 5, col(1), [at(1, 1), at(7, 1)]); only(b, 5, row(7), [at(7, 1), at(7, 5)]); only(b, 5, col(5), [at(7, 5), at(2, 5)]);
    const st = T.simpleColoring(b)!;
    expect(sorted(st.remove)).toEqual([at(1, 4), at(1, 6), at(2, 2), at(2, 3)].map((c) => [c, 5]));
    const b2 = blank();
    only(b2, 5, col(1), [at(1, 1), at(7, 1)]);
    expect(T.simpleColoring(b2)).toBeNull();
  });
  it("X-Chain finds the same as a skyscraper, and grows longer", () => {
    const b = blank();
    only(b, 5, row(2), [at(2, 1), at(2, 4)]); only(b, 5, row(7), [at(7, 1), at(7, 6)]);
    const st = T.xChain(b)!;
    expect(st.length).toBe(3);
    expect(sorted(st.remove)).toEqual(sorted(T.skyscraper(b)!.remove));
    expect(T.xChain(blank())).toBeNull();
  });
});

describe("wings and rectangles", () => {
  it("XY-Wing", () => {
    const b = blank();
    set(b, at(1, 1), [1, 2]); set(b, at(1, 5), [1, 3]); set(b, at(5, 1), [2, 3]);
    expect(T.xyWing(b)!.remove).toEqual([[at(5, 5), 3]]);
    set(b, at(5, 1), [2, 4]);
    expect(T.xyWing(b)).toBeNull();
  });
  it("XY-Chain finds the XY-Wing too", () => {
    const b = blank();
    set(b, at(1, 1), [1, 2]); set(b, at(1, 5), [1, 3]); set(b, at(5, 1), [2, 3]);
    expect(T.xyChain(b)!.remove).toEqual([[at(5, 5), 3]]);
  });
  it("XYZ-Wing", () => {
    const b = blank();
    set(b, at(1, 1), [1, 2, 3]); set(b, at(1, 2), [1, 3]); set(b, at(4, 1), [2, 3]);
    expect(T.xyzWing(b)!.remove).toEqual([[at(2, 1), 3], [at(3, 1), 3]]);
    set(b, at(4, 1), [2, 4]);
    expect(T.xyzWing(b)).toBeNull();
  });
  it("W-Wing", () => {
    const b = blank();
    set(b, at(1, 1), [1, 2]); set(b, at(5, 9), [1, 2]);
    expect(T.wWing(b)).toBeNull();
    only(b, 1, row(9), [at(9, 1), at(9, 9)]);
    expect(sorted(T.wWing(b)!.remove)).toEqual([[at(1, 9), 2], [at(5, 1), 2]]);
  });
  it("unique rectangle type 1, only when the puzzle is unique", () => {
    const b = blank();
    set(b, at(1, 1), [1, 2]); set(b, at(1, 2), [1, 2]); set(b, at(4, 1), [1, 2]); set(b, at(4, 2), [1, 2, 5]);
    expect(T.uniqueRectangle(b, ctx)!.remove).toEqual([[at(4, 2), 1], [at(4, 2), 2]]);
    expect(T.uniqueRectangle(b, { unique: false })).toBeNull();
    // four boxes: not a deadly pattern
    const b2 = blank();
    set(b2, at(1, 1), [1, 2]); set(b2, at(1, 5), [1, 2]); set(b2, at(5, 1), [1, 2]); set(b2, at(5, 5), [1, 2, 5]);
    expect(T.uniqueRectangle(b2, ctx)).toBeNull();
  });
});

describe("length bonus and trials", () => {
  it("adds 0.1 per step of SE's length ceilings", () => {
    expect(T.lengthBonus(3)).toBe(0);
    expect(T.lengthBonus(6)).toBe(0);
    expect(T.lengthBonus(7)).toBe(0.1);
    expect(T.lengthBonus(9)).toBe(0.2);
    expect(T.lengthBonus(11)).toBe(0.3);
  });
  it("refutes a candidate that breaks a unit at once", () => {
    const b = blank();
    only(b, 5, row(1), [at(1, 1), at(1, 2)]);
    // r2c1 = 5 takes both places for 5 in row 1 (same box)
    expect(T.refute(b, at(2, 1), 5, 81)).toBe(1);
    expect(T.refute(b, at(9, 9), 5, 81)).toBe(0);
  });
});

// ---------- whole puzzles ----------

/** puzzles made for these tests (random grids, clues taken out while unique), each needing the
 *  technique named */
const NEEDS: [string, string][] = [
  ["X-Wing", "....3..91..58.2.4.....64..37......16..6..7.......5.....6..4..5..235..9.4.8......."],
  ["Swordfish", ".......71.5.3...8.....9.2..3...7.6...6.....4...14.8.......2...6..7....2.8..13.9.."],
  ["Hidden triple", ".76..45....42.96..8.2..3....93.....4....5..91.......2...9.....764.........71....."],
  ["XY-Wing", "73...6..8.....1.........39...2.......14..32...8....9...6.95...3.2..3..17....1..4."],
  ["XYZ-Wing", "....3..91..58.2.4.....64..37......16..6..7.......5.....6..4..5..235..9.4.8......."],
  ["Unique rectangle", "1...6.7....9.2.6...4...82.........6.2.6..59.7.....38......4......7..1..55....2..."],
  ["Naked quad", ".467....9.....2....2..9.......5..68...7...5.4.6..8..2....3.7......6..8.11...5.7.."],
  ["Skyscraper", ".2..39...8..1.......98...25..8....323.......4..5...8....25.4.69....6..184.1......"],
  ["2-String Kite", "6.182....3.....8....5.1........4.........923..1...5..7..4......29.7...1..3..6.7.9"],
  ["Simple coloring", "...8....6.7.1....54...3.......7........5618.......36.13...9......5......9..6.8.74"],
  ["X-Chain", "3..5...682.7..69.4.9....3...3..1.4.....4..........9...96.1..53.7.4.5.6..........1"],
  ["W-Wing", ".3.9..7..4.91.....2......8.1.2..........69....8..2.36....51....7.1..3..884......."],
  ["XY-Chain", "..1.3.....7...2......6..38...58......36.....48..4..9..19.....5.....2..7...417...."],
  ["Forcing chain", "13.2.....8..3...1...7...8.6...9.45.1........2...83..9..5...64..68...9......1....."],
];

describe("whole puzzles, every step checked against the answer", () => {
  for (const [technique, text] of NEEDS) it(`uses ${technique}`, () => {
    const { profile, board } = rate(fromString(text), { check: true });
    expect(profile.solved).toBe(true);
    expect(profile.byTechnique[technique]).toBeGreaterThan(0);
    expect(toString(board)).not.toContain(".");
  });
  it("a puzzle past every chain (Inkala's) falls to trials", () => {
    const { profile } = rate(fromString("800000000003600000070090200050007000000045700000100030001000068008500010090000400"), { check: true });
    expect(profile.solved).toBe(true);
    expect(profile.trials).toBeGreaterThan(0);
    expect(profile.se).toBeGreaterThanOrEqual(9);
  }, 60000);
  it("the check catches a technique that removes a true candidate", () => {
    const wrong: T.Technique = { name: "Wrong", se: 1, find: (b) => {
      const c = b.value.findIndex((d) => !d), d = Math.min(...[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => b.cand[c] & bit(x)));
      return { technique: "Wrong", se: 1, text: "", place: [[c, d]], remove: [], cells: [c], digits: [d], units: [] };
    } };
    expect(() => rate(fromString(NEEDS[0][1]), { check: true, techniques: [wrong, ...T.TECHNIQUES] })).toThrow(/Wrong/);
  });
});

describe("the example puzzles", () => {
  const all = [["sudoku", 1], ["sudoku", 2], ["sudoku", 3], ["irregular-sudoku", 1], ["irregular-sudoku", 2], ["thermo-sudoku", 1], ["thermo-sudoku", 2]] as const;
  for (const [genre, n] of all) it(`solves ${genre}/${n}`, () => {
    const { profile } = rate(example(genre, n), { check: true });
    expect(profile.solved).toBe(true);
    expect(profile.unique).toBe(true);
  }, 30000);
  it("a 4 × 4 is all singles", () => {
    const { profile } = rate(example("sudoku", 1));
    expect(Object.keys(profile.byTechnique).every((t) => ["Full house", "Hidden single", "Naked single"].includes(t))).toBe(true);
  });
  it("a 6 × 6 has 2 × 3 boxes", () => {
    const { shape } = example("sudoku", 2);
    expect(shape.units.find((u) => u.name === "box 1")!.cells).toEqual([0, 1, 2, 6, 7, 8]);
  });
  it("irregular areas are the boxes", () => {
    const { shape } = example("irregular-sudoku", 1);
    expect(shape.irregular).toBe(true);
    expect(shape.units.find((u) => u.name === "area 2")!.cells).toEqual([1, 2, 3, 4, 5, 11]);
  });
  it("thermometers narrow candidates", () => {
    const { profile } = rate(example("thermo-sudoku", 1));
    expect(profile.byTechnique["Thermo bounds"]).toBeGreaterThan(0);
  });
  it("ratings rise from sudoku 1 to 2 to 3", () => {
    const [a, b, c] = [1, 2, 3].map((n) => rate(example("sudoku", n)).profile);
    expect(a.estimate).toBeLessThan(b.estimate);
    expect(b.estimate).toBeLessThan(c.estimate);
    expect(a.se).toBeLessThanOrEqual(b.se);
    expect(b.se).toBeLessThan(c.se);
    expect(a.effort).toBeLessThan(b.effort);
    expect(b.effort).toBeLessThan(c.effort);
  });
  it("a JSON puzzle and its string rate the same", () => {
    const p = example("sudoku", 3);
    const fromText = fromString(p.givens.map((d) => d || ".").join(""));
    expect(rate(fromText).profile.se).toBe(rate(p).profile.se);
  });
});
