// Sketches: the text a puzzle is kept as (app/games/sketch.ts).
import { describe, expect, it } from "vitest";
import { looseSpec, parseSketch, specToSketch } from "~/games/sketch";

describe("sketches", () => {
  it("round-trip a puzzle", () => {
    const spec = { genre: "sudoku", size: [4, 4] as [number, number], givens: [{ at: "cell" as const, cell: [0, 0] as [number, number], kind: "number" as const, value: 1 }] };
    const parsed = parseSketch(specToSketch(spec));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.spec.givens).toEqual(spec.givens);
  });
  it("explain an unknown type", () => {
    const parsed = parseSketch('nope\n{"size": [4, 4]}');
    expect(parsed.ok).toBe(false);
  });
  it("read an unfinished puzzle loosely (the editor still draws it)", () => {
    // a maze with no doors doesn't parse, but its shape is still there to edit
    const sketch = 'maze\n{"size": [3, 3], "givens": []}';
    expect(parseSketch(sketch).ok).toBe(false);
    expect(looseSpec(sketch)?.size).toEqual([3, 3]);
  });
});
