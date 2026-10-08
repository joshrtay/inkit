// The sketch reader's conversion of a reading into a puzzle (app/lib/read-sketch.server.ts): no
// calls to Claude here, just how each clue's row, col and value text becomes a given.
import { describe, expect, it } from "vitest";
import { givenOf, ruleSettings, toSketch, type Reading } from "~/lib/read-sketch.server";
import { parseSketch } from "~/games/sketch";

type ReadGiven = Reading["givens"][number];
const g = (kind: ReadGiven["kind"], row: number, col: number, value = ""): ReadGiven => ({ kind, row, col, value });

const reading = (over: Partial<Reading>): Reading => ({
  readable: true, problem: "", genre: "panel-dots", candidates: ["panel-dots"], title: "",
  bounds: { left: 0, top: 0, right: 1, bottom: 1 }, rows: 3, cols: 3, rules: [], givens: [], runs: [],
  pictureRows: [], palette: [], areas: [], figure: [], sure: true, notes: [], ...over,
});

describe("reading panels", () => {
  it("puts starts and ends on corners, with a start's color", () => {
    expect(givenOf(g("start", 3, 0))).toEqual({ at: "corner", corner: [3, 0], kind: "start" });
    expect(givenOf(g("start", 3, 0, "Yellow"))).toEqual({ at: "corner", corner: [3, 0], kind: "start", color: "yellow" });
    expect(givenOf(g("end", 0, 3))).toEqual({ at: "corner", corner: [0, 3], kind: "end" });
  });
  it("puts dots on a corner, or halfway along a stretch of grid line", () => {
    expect(givenOf(g("hexagon", 1, 2))).toEqual({ at: "corner", corner: [1, 2], kind: "hexagon" });
    expect(givenOf(g("hexagon", 1, 2, "blue"))).toEqual({ at: "corner", corner: [1, 2], kind: "hexagon", color: "blue" });
    expect(givenOf(g("hexagon", 1, 2, "right"))).toEqual({ at: "line", corners: [[1, 2], [1, 3]], kind: "hexagon" });
    expect(givenOf(g("hexagon", 1, 2, "below yellow"))).toEqual({ at: "line", corners: [[1, 2], [2, 2]], kind: "hexagon", color: "yellow" });
  });
  it("puts gaps on a stretch of grid line, and needs to know which", () => {
    expect(givenOf(g("gap", 0, 1, "right"))).toEqual({ at: "line", corners: [[0, 1], [0, 2]], kind: "gap" });
    expect(givenOf(g("gap", 0, 1, "below"))).toEqual({ at: "line", corners: [[0, 1], [1, 1]], kind: "gap" });
    expect(givenOf(g("gap", 2, 1, "left"))).toEqual({ at: "line", corners: [[2, 0], [2, 1]], kind: "gap" });
    expect(givenOf(g("gap", 0, 1))).toBeNull();
  });
  it("reads squares' and stars' colors (black when it can't tell)", () => {
    expect(givenOf(g("square", 1, 1, "white"))).toEqual({ at: "cell", cell: [1, 1], kind: "square", color: "white" });
    expect(givenOf(g("star", 0, 2, "Orange"))).toEqual({ at: "cell", cell: [0, 2], kind: "star", color: "orange" });
    expect(givenOf(g("square", 1, 1))).toEqual({ at: "cell", cell: [1, 1], kind: "square", color: "black" });
    expect(givenOf(g("star", 1, 1, "pink"))).toEqual({ at: "cell", cell: [1, 1], kind: "star", color: "black" });
  });
  it("reads how many triangles, 1 to 3", () => {
    expect(givenOf(g("triangle", 2, 0, "2"))).toEqual({ at: "cell", cell: [2, 0], kind: "triangle", value: 2 });
    expect(givenOf(g("triangle", 2, 0, "▲▲▲"))).toEqual({ at: "cell", cell: [2, 0], kind: "triangle", value: 3 });
    expect(givenOf(g("triangle", 2, 0, "4"))).toBeNull();
    expect(givenOf(g("triangle", 2, 0))).toBeNull();
  });
  it("reads a shape's blocks from the top left, tilted and hollow", () => {
    expect(givenOf(g("shape", 1, 1, "0,0 1,0 1,1"))).toEqual({ at: "cell", cell: [1, 1], kind: "shape", value: [[0, 0], [1, 0], [1, 1]] });
    expect(givenOf(g("shape", 1, 1, "1,1 1,2 rotate negative"))).toEqual(
      { at: "cell", cell: [1, 1], kind: "shape", value: [[0, 0], [0, 1]], rotate: true, negative: true });
    expect(givenOf(g("shape", 1, 1, "0,0 0,0 hollow"))).toEqual({ at: "cell", cell: [1, 1], kind: "shape", value: [[0, 0]], negative: true });
    expect(givenOf(g("shape", 1, 1, "an L"))).toBeNull();
  });
  it("reads erasers", () => {
    expect(givenOf(g("eraser", 0, 0))).toEqual({ at: "cell", cell: [0, 0], kind: "eraser" });
  });
  it("reads a symmetry", () => {
    expect(ruleSettings("symmetry up-down")).toEqual({ symmetry: "up-down" });
    expect(ruleSettings("turn")).toEqual({ symmetry: "turn" });
    expect(ruleSettings("symmetry sideways")).toEqual({});
  });

  it("makes a playable panel of every symbol", () => {
    const r = reading({
      givens: [
        g("start", 3, 0), g("end", 0, 3), g("hexagon", 1, 1), g("hexagon", 0, 0, "right"), g("gap", 2, 2, "below"),
        g("square", 0, 0, "black"), g("star", 0, 1, "white"), g("triangle", 1, 1, "1"), g("shape", 2, 2, "0,0"), g("eraser", 2, 0),
      ],
    });
    const parsed = parseSketch(toSketch(r));
    expect(parsed.ok ? parsed.spec.givens?.length : parsed.errors).toBe(10);
  });
  it("keeps a symmetry panel mirrored unless the drawing says another way", () => {
    const sym = (rules: Reading["rules"]) => {
      const parsed = parseSketch(toSketch(reading({
        genre: "panel-symmetry", candidates: ["panel-symmetry"], rows: 2, cols: 2, rules,
        givens: [g("start", 2, 0, "blue"), g("start", 2, 2, "yellow"), g("end", 0, 0), g("end", 0, 2)],
      })));
      return parsed.ok ? parsed.spec.rules : parsed.errors;
    };
    // a plain panel-line would replace the type's mirrored one, so it's left out
    expect(sym([{ rule: "panel-line", settings: "" }])).toBeUndefined();
    expect(sym([{ rule: "panel-line", settings: "symmetry turn" }])).toEqual([{ rule: "panel-line", symmetry: "turn" }]);
  });
});
