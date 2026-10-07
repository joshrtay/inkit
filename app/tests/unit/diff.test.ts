// How a read is scored against the published puzzle (app/games/diff.ts).
import { describe, expect, it } from "vitest";
import { diffSketches } from "~/games/diff";
import { specToSketch } from "~/games/sketch";
import type { GridSpec } from "~site/engine/types.ts";

const sk = (spec: GridSpec) => specToSketch(spec);
const sudoku = (givens: GridSpec["givens"]): GridSpec => ({ genre: "sudoku", size: [4, 4], givens });

describe("diffSketches", () => {
  it("calls an unchanged puzzle exact, whatever order its clues are in", () => {
    const a = sudoku([{ at: "cell", cell: [0, 0], kind: "number", value: 1 }, { at: "cell", cell: [1, 1], kind: "number", value: 2 }]);
    const b = sudoku([...a.givens!].reverse());
    expect(diffSketches(sk(a), sk(b))).toMatchObject({ exact: true, score: 1 });
  });
  it("counts clues added and removed", () => {
    const d = diffSketches(sk(sudoku([{ at: "cell", cell: [0, 0], kind: "number", value: 1 }])), sk(sudoku([{ at: "cell", cell: [0, 0], kind: "number", value: 3 }])))!;
    expect(d.exact).toBe(false);
    expect(d.givens).toEqual({ added: 1, removed: 1, kept: 0 });
    expect(d.sameKind && d.sameSize).toBe(true);
  });
  it("notices a wrong type and a wrong size", () => {
    const d = diffSketches(sk({ genre: "sudoku", size: [4, 4] }), sk({ genre: "akari", size: [5, 5] }))!;
    expect(d.sameKind).toBe(false);
    expect(d.sameSize).toBe(false);
  });
  it("compares pictures by color, not by the letters standing for them", () => {
    const a: GridSpec = { genre: "nonogram", size: [1, 2], picture: { rows: ["a."], palette: { ".": "#fff", a: "#D8443A" } } };
    const b: GridSpec = { genre: "nonogram", size: [1, 2], picture: { rows: ["x."], palette: { ".": "#fff", x: "#d8443a" } } };
    expect(diffSketches(sk(a), sk(b))!.exact).toBe(true);
    const c: GridSpec = { ...b, picture: { rows: ["xx"], palette: b.picture!.palette } };
    expect(diffSketches(sk(a), sk(c))!.pictureSquares).toBe(1);
  });
  it("counts area squares that moved", () => {
    const a: GridSpec = { genre: "star-battle", size: [2, 2], areas: ["ab", "ab"] }, b: GridSpec = { ...a, areas: ["aa", "ab"] };
    expect(diffSketches(sk(a), sk(b))!.areaSquares).toBe(1);
  });
  it("is null when either side isn't a puzzle", () => {
    expect(diffSketches("not a sketch", sk(sudoku([])))).toBeNull();
  });
});
