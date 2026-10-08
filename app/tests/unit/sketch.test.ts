// Sketches: the text a puzzle is kept as (app/games/sketch.ts).
import { describe, expect, it } from "vitest";
import { looseSpec, parseSketch, specToSketch } from "~/games/sketch";
import { settingProblems } from "~/editor/coverage";

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

describe("rule settings", () => {
  it("a rule's value in the header goes to its first setting", () => {
    const parsed = parseSketch('panes: size 4, one-each symbol\n{"size": [4, 4], "givens": [{"at": "cell", "cell": [0, 0], "kind": "symbol", "value": "★"}]}');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.spec.rules).toEqual([{ rule: "size", is: 4 }, { rule: "one-each", of: "symbol" }]);
  });
  it("turns away settings a rule doesn't take, and values it can't have", () => {
    expect(settingProblems({ rule: "size", is: 4 })).toEqual([]);
    expect(settingProblems({ rule: "color-count", red: 2, c4: 1 })).toEqual([]);
    expect(settingProblems({ rule: "size", ma: 4 })).toEqual(['The rule "size" has no setting "ma" (its settings: is, min, max).']);
    expect(settingProblems({ rule: "twins", of: "shape" })).toEqual(['The rule "twins" has no setting "of" (it takes none).']);
    expect(settingProblems({ rule: "one-each", of: "each" })[0]).toMatch(/one of: number, symbol/);
    const parsed = parseSketch('panes\n{"size": [3, 3], "rules": [{"rule": "size", "is": 3, "ma": 4}]}');
    expect(parsed.ok).toBe(false);
  });
});
