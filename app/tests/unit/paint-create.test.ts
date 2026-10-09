// The start and publish steps around paint (docs/creation-flow.md §1.2, §1.4, §1.7, §1.9): a photo's
// reading drawn in ink (paint-save.ts's paintFromSketch), its doubts marked on the paper (check.ts),
// "What type is this?" without AI (sketchpad/suggest.ts), and the drawing as a still picture
// (sketchpad/picture.ts).
import { describe, expect, it } from "vitest";
import * as m from "~/sketchpad/model";
import { doubtHighlight, marksSvg } from "~/sketchpad/check";
import { drawingBounds, drawingSvg } from "~/sketchpad/picture";
import { fitOf, fitsOf, fitWords, inLookOf, rankSuggestions, saidBeforeSolving, saidOf, type Fit, type Said } from "~/sketchpad/suggest";
import { paintFromSketch, sketchOf } from "~/games/paint-save";
import { kindName } from "~/games/kinds";

/** A 3 × 3 grid of 48-unit squares at (60, 60). */
const grid = (): m.Drawing => m.setGrid(m.EMPTY, { x: 60, y: 60, rows: 3, cols: 3, S: 48 });
/** The smallest Akari: a 4 on a shaded square in the middle (one solution: a light on each side). */
function akari(): m.Drawing {
  let d = m.add(grid(), { kind: "stamp", stamp: "rock", at: { at: "cell", r: 1, c: 1 } });
  d = m.add(d, { kind: "text", at: { at: "cell", r: 1, c: 1 }, text: "4" });
  return d;
}

describe("a photo's reading, drawn in paint", () => {
  it("draws the sketch with its type and rules, and converts back to the same puzzle", () => {
    const sketch = `akari\n${JSON.stringify({ size: [3, 3], givens: [{ at: "cell", cell: [1, 1], kind: "block" }, { at: "cell", cell: [1, 1], kind: "number", value: 4 }] })}`;
    const save = paintFromSketch(sketch)!;
    expect(save.genre).toBe("akari");
    expect(save.drawing.grid).toMatchObject({ rows: 3, cols: 3 });
    const again = sketchOf(save);
    expect(again.kind).toBe("akari");
    expect(again.conversion!.problems).toEqual([]);
    expect(JSON.parse(again.sketch.slice(again.sketch.indexOf("\n") + 1)).givens).toHaveLength(2);
  });
  it("none for RYB (not in paint) or a sketch that isn't a puzzle", () => {
    expect(paintFromSketch("coats\n{}")).toBeNull();
    expect(paintFromSketch("not a sketch")).toBeNull();
    expect(paintFromSketch("")).toBeNull();
  });
});

describe("a draft with no type yet", () => {
  it("is named as such, and has no sketch", () => {
    expect(kindName("")).toBe("No type yet");
    expect(sketchOf({ drawing: akari(), genre: null, settings: {} })).toMatchObject({ sketch: "", kind: "" });
  });
});

describe("doubts on the paper", () => {
  const d = grid();
  it("a square's doubt rings it, with a lettered amber pin", () => {
    const h = doubtHighlight(d, { text: "a 2 or a 3?", place: "cell", row: 2, col: 0 });
    expect(h.rings).toHaveLength(1);
    expect(h.pin).not.toBeNull();
    const svg = marksSvg(h, "doubt", "A", false);
    expect(svg).toContain('class="sp-mark doubt"');
    expect(svg).toContain(">A</text>");
  });
  it("rows, columns, an area and a line of clues get a box; the whole puzzle no mark", () => {
    expect(doubtHighlight(d, { text: "", place: "rows", row: 0, row2: 1 }).boxes[0]).toMatchObject({ x: expect.closeTo(63, 0), w: expect.closeTo(138, 0) });
    expect(doubtHighlight(d, { text: "", place: "columns", col: 2 }).boxes).toHaveLength(1);
    expect(doubtHighlight(d, { text: "", place: "area", row: 0, col: 0, row2: 1, col2: 1 }).boxes).toHaveLength(1);
    const clue = doubtHighlight(d, { text: "", place: "row-clue", row: 1 }).boxes[0];
    expect(clue.x + clue.w).toBeLessThanOrEqual(60);   // left of the grid
    expect(doubtHighlight(d, { text: "", place: "whole" }).pin).toBeNull();
    expect(doubtHighlight(m.EMPTY, { text: "", place: "cell", row: 0, col: 0 }).pin).toBeNull();
  });
});

describe("What type is this? (no AI)", () => {
  it("a shaded 4 in a 3 × 3 grid: Akari fits it all", () => {
    const fits = fitsOf(akari());
    const a = fits.find((f) => f.genre === "akari")!;
    expect(a.wontFit).toBe(0);
    expect(fitWords(a)).toBe("Uses everything you drew");
    // Sudoku has no shaded squares: it can't use the stamp
    const s = fitOf(akari(), "sudoku")!;
    expect(s.wontFit).toBe(1);
    expect(fitWords(s)).toBe("1 thing won't fit");
    // best fit first
    expect(fits.findIndex((f) => f.genre === "akari")).toBeLessThan(fits.findIndex((f) => f.genre === "sudoku"));
  });
  it("a photo's candidates keep the reader's order, and only paint's types", () => {
    expect(fitsOf(akari(), {}, ["sudoku", "akari", "coats"]).map((f) => f.genre)).toEqual(["sudoku", "akari"]);
  });
  it("no grid: nothing fits", () => {
    expect(fitsOf(m.EMPTY)).toEqual([]);
  });
  it("tries each type in its own look (a panel's tracks)", () => {
    expect(inLookOf(grid(), "panel").grid!.tracks).toBe(true);
    expect(inLookOf(grid(), "akari")).toEqual(grid());
  });
  it("a broken rule or something missing is said without the solver", () => {
    let d = m.setGrid(m.EMPTY, { x: 60, y: 60, rows: 4, cols: 4, S: 48 });
    d = m.add(d, { kind: "text", at: { at: "cell", r: 0, c: 0 }, text: "2" });
    d = m.add(d, { kind: "text", at: { at: "cell", r: 0, c: 3 }, text: "2" });
    expect(saidBeforeSolving(fitOf(d, "sudoku")!)).toBe("broken");
    expect(saidBeforeSolving(fitOf(akari(), "akari")!)).toBeNull();
  });
  it("the solver's count as a verdict; panels need only one", () => {
    expect(saidOf("akari", 1)).toBe("one");
    expect(saidOf("akari", 2)).toBe("several");
    expect(saidOf("panel", 2)).toBe("solvable");
    expect(saidOf("akari", 0)).toBe("none");
  });
  it("ranks what uses everything first, then a passing verdict, then by fit (or only by verdict, for a reading)", () => {
    const fit = (genre: string, wontFit: number) => ({ genre, wontFit, problems: 0, used: 2 } as unknown as Fit);
    const list: { fit: Fit; said: Said }[] = [
      { fit: fit("nurikabe", 0), said: "several" }, { fit: fit("akari", 1), said: "one" },
      { fit: fit("shikaku", 0), said: "none" }, { fit: fit("hitori", 0), said: "one" },
    ];
    expect(rankSuggestions(list).map((x) => x.fit.genre)).toEqual(["hitori", "nurikabe", "shikaku", "akari"]);
    expect(rankSuggestions(list, true).map((x) => x.fit.genre)).toEqual(["akari", "hitori", "nurikabe", "shikaku"]);
  });
});

describe("the drawing as a picture (Drawn by)", () => {
  it("crops to the ink, square, and draws the grid, the stamp and the writing", () => {
    const b = drawingBounds(akari())!;
    expect(b.w).toBe(b.h);
    expect(b.x).toBeLessThan(60);
    expect(b.x + b.w).toBeGreaterThan(204);
    const svg = drawingSvg(akari(), "Night <Shift>");
    expect(svg).toMatch(/^<svg class="sp-drawing" viewBox=/);
    expect(svg).toContain('aria-label="Night &lt;Shift>"');
    expect(svg).toContain('class="frame"');
    expect(svg).toContain(">4</text>");
  });
  it("a blank page draws nothing", () => {
    expect(drawingSvg(m.EMPTY)).toBe("");
  });
});
