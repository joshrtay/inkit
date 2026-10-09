// Paint with a type (sketchpad/kit.ts, sketchpad/check.ts, games/paint-save.ts): the tools a type
// offers, the verdict from the converter and the solver, the numbered list of what's wrong, where
// each is on the paper, and where two solutions differ.
import { describe, expect, it } from "vitest";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { emptyBoard } from "~site/engine/types.ts";
import * as m from "~/sketchpad/model";
import { kitFor, colourAllowed } from "~/sketchpad/kit";
import { convert } from "~/sketchpad/to-puzzle";
import { checkList, differences, highlight, marksSvg, passes, verdictOf, verdictWords, type Solved } from "~/sketchpad/check";
import { readPaintSave, sketchOf } from "~/games/paint-save";

/** A 6 × 6 grid of 40-unit squares at (40, 40), with digits written in squares. */
function sudoku(digits: [number, number, string][]): m.Drawing {
  let d = m.setGrid(m.EMPTY, { x: 40, y: 40, rows: 6, cols: 6, S: 40 });
  for (const [r, c, t] of digits) d = m.add(d, { kind: "text", at: { at: "cell", r, c }, text: t });
  return d;
}

describe("a type's kit", () => {
  it("Sudoku: the grid, text and the eraser; no stamps; lines", () => {
    expect(kitFor("sudoku")).toEqual({ tools: ["grid", "text", "erase"], stamps: [], colours: {}, look: "lines" });
  });
  it("Irregular Sudoku draws its areas with the pen", () => {
    expect(kitFor("irregular-sudoku")!.tools).toEqual(["grid", "pen", "line", "text", "erase"]);
  });
  it("Panel: stamps on tracks, its symbols only, starts and dots in its lines' colours", () => {
    const k = kitFor("panel")!;
    expect(k.tools).toEqual(["grid", "stamp", "erase"]);
    expect(k.look).toBe("tracks");
    expect([...k.stamps].sort()).toEqual(["crest", "end", "eraser", "hoshi", "shape", "start", "stone", "triangle"]);
    expect(colourAllowed(k, "start", "red")).toBe(false);
    expect(colourAllowed(k, "stone", "red")).toBe(true);
  });
  it("Masyu's stones are black or white; Thermo Sudoku has the thermometer; Panes the new stamps; RYB isn't in paint", () => {
    expect(colourAllowed(kitFor("masyu"), "stone", "red")).toBe(false);
    expect(kitFor("thermo-sudoku")!.stamps).toEqual(["thermo"]);
    expect(kitFor("panes")!.stamps).toEqual(expect.arrayContaining(["inequality", "palisade", "diamond", "open-diamond", "rock"]));
    expect(kitFor("honeycomb-paths")!.look).toBe("hex");
    expect(kitFor("twins-and-triplets")!.tools).not.toContain("text");
    expect(kitFor("coats")).toBeNull();
  });
});

describe("the verdict", () => {
  const d = sudoku([[0, 0, "1"]]);
  const conv = convert(d, "sudoku");
  const key = JSON.stringify(conv.spec);
  it("no type: nothing to check", () => {
    expect(verdictOf(null, null, "", null)).toEqual({ kind: "no-type" });
    expect(verdictWords({ kind: "no-type" }).text).toBe("No type yet, so nothing to check");
  });
  it("waits for the solver's answer for this very puzzle", () => {
    expect(verdictOf("sudoku", conv, key, null).kind).toBe("checking");
    const stale: Solved = { key: "another", solutions: 1, boards: [] };
    expect(verdictOf("sudoku", conv, key, stale).kind).toBe("checking");
    expect(verdictOf("sudoku", conv, key, { key, solutions: 1, boards: [] }).kind).toBe("one");
    expect(verdictOf("sudoku", conv, key, { key, solutions: 2, boards: [] }).kind).toBe("several");
    expect(verdictOf("sudoku", conv, key, { key, solutions: 0, boards: [] }).kind).toBe("none");
    expect(verdictOf("sudoku", conv, key, { key, error: "boom" })).toEqual({ kind: "error", text: "boom" });
  });
  it("a broken rule says No solution at once, without the solver", () => {
    const bad = convert(sudoku([[5, 0, "5"], [5, 4, "5"]]), "sudoku");
    const v = verdictOf("sudoku", bad, JSON.stringify(bad.spec), null);
    expect(v).toEqual({ kind: "broken", rules: 1 });
    expect(verdictWords(v)).toEqual({ text: "No solution · 1 broken rule", tone: "bad" });
    expect(passes(v)).toBe(false);
  });
  it("panels pass with several solutions: Solvable", () => {
    let d = m.setGrid(m.EMPTY, m.setLook({ x: 40, y: 40, rows: 2, cols: 2, S: 80 }, "tracks"));
    d = m.add(m.add(d, { kind: "stamp", stamp: "start", at: { at: "corner", r: 2, c: 0 } }), { kind: "stamp", stamp: "end", at: { at: "corner", r: 0, c: 2 } });
    const p = convert(d, "panel");
    expect(p.problems).toEqual([]);
    expect(verdictOf("panel", p, "k", { key: "k", solutions: 2, boards: [] }).kind).toBe("solvable");
    expect(passes({ kind: "solvable" })).toBe(true);
  });
  it("no grid", () => {
    expect(verdictOf("sudoku", convert(m.EMPTY, "sudoku"), "", null).kind).toBe("no-grid");
  });
});

describe("the list and its marks", () => {
  const d = m.add(sudoku([[5, 0, "5"], [5, 4, "5"], [0, 0, "1"]]), { kind: "stamp", stamp: "crest", at: { at: "cell", r: 2, c: 2 } });
  const conv = convert(d, "sudoku");
  const list = checkList(conv, { digits: "1 to 6" });
  it("broken rules first, then what doesn't fit, numbered", () => {
    expect(list.map((x) => [x.n, x.kind, x.place, x.text])).toEqual([
      [1, "rule", "Row 6", "Two 5s in row 6"],
      [2, "misfit", "Doesn't fit", "A crest isn't part of Sudoku"],
    ]);
    expect(list[0].tip).toBe("Each row holds 1 to 6 once, so one of these is wrong. Change or erase one of them.");
    expect(list[0].cells).toEqual([[5, 0], [5, 4]]);
  });
  it("a broken rule rings its squares and joins them; the pin on the first, the tip over the last", () => {
    const h = highlight(d, list[0]);
    expect(h.rings).toHaveLength(2);
    expect(h.boxes).toEqual([]);
    expect(h.join).toEqual([{ x: 60, y: 260 }, { x: 220, y: 260 }]);
    // squares 40 across: row 6 is y 240..280, ringed just inside (2.4 in)
    expect(h.rings[0][0]).toEqual({ x: 42.4, y: 242.4 });
    expect(h.pin).toEqual({ x: 77.6, y: 242.4 });
    expect(h.tip).toEqual({ x: 220, y: 242.4 });
    expect(marksSvg(h, "error", 1, true)).toContain('class="sp-mark error selected"');
  });
  it("what doesn't fit is boxed where it's drawn", () => {
    const h = highlight(d, list[1]);
    expect(h.rings).toEqual([]);
    expect(h.boxes).toEqual([{ x: 124, y: 124, w: 32, h: 32 }]);
    expect(marksSvg(h, "misfit", 2, false)).toContain("sp-mark-box");
  });
});

describe("where two solutions differ", () => {
  it("each square with a different digit, with both digits", () => {
    const p = makePuzzle({ genre: "sudoku", size: [4, 4] }, { unfinished: true });
    const a = emptyBoard(p.grid), b = emptyBoard(p.grid);
    a.digit.fill(1); b.digit.fill(1);
    a.digit[5] = 4; b.digit[5] = 3;
    expect(differences(p, a, b)).toEqual([{ cells: [[1, 1]], values: ["4", "3"] }]);
    expect(checkList(convert(sudoku([]), "sudoku"), { differences: differences(p, a, b) })[0]).toMatchObject({
      kind: "difference", text: "This square can be a 4 or a 3", place: "Row 2, column 2",
    });
  });
  it("shading as one difference", () => {
    const p = makePuzzle({ genre: "nurikabe", size: [3, 3] }, { unfinished: true });
    const a = emptyBoard(p.grid), b = emptyBoard(p.grid);
    a.shade[0] = 1; b.shade[8] = 1;
    expect(differences(p, a, b)).toEqual([{ cells: [[0, 0], [2, 2]] }]);
  });
});

describe("the saved drawing", () => {
  it("reads back, and its sketch is the converter's", () => {
    const save = { drawing: sudoku([[0, 0, "1"]]), genre: "sudoku", settings: { rules: [{ rule: "boxes", box: [3, 2] }] } };
    const back = readPaintSave(JSON.stringify(save))!;
    expect(back).toEqual(save);
    const { sketch, kind } = sketchOf(back);
    expect(kind).toBe("sudoku");
    expect(sketch.split("\n")[0]).toBe("sudoku");
    expect(JSON.parse(sketch.slice(sketch.indexOf("\n") + 1))).toMatchObject({ size: [6, 6], rules: [{ rule: "boxes", box: [3, 2] }], givens: [{ kind: "number", value: 1 }] });
  });
  it("no type: no sketch; not a drawing: null", () => {
    expect(sketchOf({ drawing: m.EMPTY, genre: null, settings: {} })).toMatchObject({ sketch: "", kind: "" });
    expect(readPaintSave("{\"drawing\": 3}")).toBeNull();
    expect(readPaintSave({ drawing: m.EMPTY, genre: "chess" })!.genre).toBeNull();
  });
});
