// The sketch reader's conversion of a reading into a puzzle (app/lib/read-sketch.server.ts): no
// calls to Claude here, just how each clue's row, col and value text becomes a given.
import { describe, expect, it } from "vitest";
import { givenOf, ruleSettings, toSketch, type Reading } from "~/lib/read-sketch.server";
import { parseSketch } from "~/games/sketch";

type ReadGiven = Reading["givens"][number];
const g = (kind: ReadGiven["kind"], row: number, col: number, value = ""): ReadGiven => ({ kind, row, col, value });

const reading = (over: Partial<Reading>): Reading => ({
  readable: true, problem: "", genre: "panel", candidates: ["panel"], title: "",
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
  });
  it("keeps a triangle's, shape's or eraser's color only when it isn't the usual one", () => {
    expect(givenOf(g("triangle", 2, 0, "2 purple"))).toEqual({ at: "cell", cell: [2, 0], kind: "triangle", value: 2, color: "purple" });
    expect(givenOf(g("triangle", 2, 0, "2 orange"))).toEqual({ at: "cell", cell: [2, 0], kind: "triangle", value: 2 });
    expect(givenOf(g("shape", 0, 0, "0,0 1,0 red"))).toEqual({ at: "cell", cell: [0, 0], kind: "shape", value: [[0, 0], [1, 0]], color: "red" });
    expect(givenOf(g("shape", 0, 0, "0,0 yellow"))).toEqual({ at: "cell", cell: [0, 0], kind: "shape", value: [[0, 0]] });
    expect(givenOf(g("shape", 0, 0, "0,0 hollow blue"))).toEqual({ at: "cell", cell: [0, 0], kind: "shape", value: [[0, 0]], negative: true });
    expect(givenOf(g("shape", 0, 0, "0,0 blue"))).toEqual({ at: "cell", cell: [0, 0], kind: "shape", value: [[0, 0]], color: "blue" });
    expect(givenOf(g("eraser", 0, 0, "white"))).toEqual({ at: "cell", cell: [0, 0], kind: "eraser" });
    expect(givenOf(g("eraser", 0, 0, "green"))).toEqual({ at: "cell", cell: [0, 0], kind: "eraser", color: "green" });
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
    // an x between numbers separates them; elsewhere it's a letter ("max", not "ma")
    expect(ruleSettings("max 3")).toMatchObject({ max: 3 });
    expect(ruleSettings("min 2 max 5")).toMatchObject({ min: 2, max: 5 });
    expect(ruleSettings("box 2x3")).toMatchObject({ box: [2, 3] });
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
  it("draws two mirrored lines only with a symmetry", () => {
    const sym = (rules: Reading["rules"]) => {
      const parsed = parseSketch(toSketch(reading({
        rows: 2, cols: 2, rules,
        givens: [g("start", 2, 0, "blue"), g("start", 2, 2, "yellow"), g("end", 0, 0), g("end", 0, 2)],
      })));
      return parsed.ok ? parsed.spec.rules : parsed.errors;
    };
    // a plain panel-line is the panel's own (one line), so it's left out
    expect(sym([{ rule: "panel-line", settings: "" }])).toBeUndefined();
    expect(sym([{ rule: "panel-line", settings: "symmetry left-right" }])).toEqual([{ rule: "panel-line", symmetry: "left-right" }]);
    expect(sym([{ rule: "panel-line", settings: "symmetry turn" }])).toEqual([{ rule: "panel-line", symmetry: "turn" }]);
  });
});

describe("reading Panes (Glimmith) clues and rules", () => {
  it("reads palisade marks: how many borders, and two at a corner or opposite", () => {
    expect(givenOf(g("palisade", 1, 2, "0"))).toEqual({ at: "cell", cell: [1, 2], kind: "palisade", value: 0 });
    expect(givenOf(g("palisade", 1, 2, "2 corner"))).toEqual({ at: "cell", cell: [1, 2], kind: "palisade", value: 2 });
    expect(givenOf(g("palisade", 1, 2, "2 opposite"))).toEqual({ at: "cell", cell: [1, 2], kind: "palisade", value: 2, opposite: true });
    expect(givenOf(g("palisade", 1, 2, "3"))).toEqual({ at: "cell", cell: [1, 2], kind: "palisade", value: 3 });
    expect(givenOf(g("palisade", 1, 2, "5"))).toBeNull();
  });
  it("reads a colored rose as its color", () => {
    expect(givenOf(g("symbol", 0, 0, "Red rose"))).toEqual({ at: "cell", cell: [0, 0], kind: "symbol", value: "red" });
    expect(givenOf(g("symbol", 0, 0, "★"))).toEqual({ at: "cell", cell: [0, 0], kind: "symbol", value: "★" });
  });
  it("turns away a setting a rule doesn't take, saying which", () => {
    const sketch = toSketch(reading({ genre: "panes", candidates: ["panes"], rules: [{ rule: "one-each", settings: "of each" }, { rule: "size", settings: "ma 4" }] }));
    const parsed = parseSketch(sketch);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.join(" ")).toMatch(/"one-each" can't have of "each"/);
      expect(parsed.errors.join(" ")).toMatch(/"size" has no setting "ma"/);
    }
  });
  it("reads the signs, numbers and shapes of Inequality, Difference, Watchtower, Polyomino and Shape Bank", () => {
    expect(givenOf(g("inequality", 1, 1, "right <"))).toEqual({ at: "border", cells: [[1, 1], [1, 2]], kind: "inequality" });
    expect(givenOf(g("inequality", 1, 1, "right >"))).toEqual({ at: "border", cells: [[1, 2], [1, 1]], kind: "inequality" });
    expect(givenOf(g("inequality", 1, 1, "below v"))).toEqual({ at: "border", cells: [[2, 1], [1, 1]], kind: "inequality" });
    expect(givenOf(g("inequality", 1, 1, "below"))).toBeNull();
    expect(givenOf(g("difference", 0, 2, "below 3"))).toEqual({ at: "border", cells: [[0, 2], [1, 2]], kind: "difference", value: 3 });
    expect(givenOf(g("watchtower", 2, 3, "2"))).toEqual({ at: "corner", corner: [2, 3], kind: "watchtower", value: 2 });
    expect(givenOf(g("watchtower", 2, 3, "7"))).toBeNull();
    expect(givenOf(g("bank", -1, -1, "1,1 1,2 2,1"))).toEqual({ at: "aside", kind: "bank", value: [[0, 0], [0, 1], [1, 0]] });
    expect(givenOf(g("shape", 0, 0, "0,0 1,0"))).toEqual({ at: "cell", cell: [0, 0], kind: "shape", value: [[0, 0], [1, 0]] });
  });
  it("reads Solitude as one clue of any kind, and Bricky as counting the outline", () => {
    const sketch = toSketch(reading({
      genre: "panes", candidates: ["panes"], rows: 3, cols: 3,
      rules: [{ rule: "one-each", settings: "of any" }, { rule: "no-four-corners", settings: "outline" }],
      givens: [g("compass", 0, 0, "e1"), g("number", 2, 2, "3")],
    }));
    const parsed = parseSketch(sketch);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.spec.rules).toEqual([{ rule: "one-each", of: "any" }, { rule: "no-four-corners", outline: true }]);
  });
  it("makes a playable puzzle with every new Glimmith rule", () => {
    const sketch = toSketch(reading({
      genre: "panes", candidates: ["panes"], rows: 3, cols: 4,
      rules: ["no-t-junctions", "no-rectangles", "all-same", "neighbors-differ-size", "shape-bank", "region-shape", "size-compare", "size-difference", "regions-at-corner"].map((rule) => ({ rule: rule as Reading["rules"][number]["rule"], settings: "" })),
      givens: [g("inequality", 0, 0, "right <"), g("difference", 1, 1, "below 1"), g("watchtower", 1, 1, "2"), g("bank", -1, -1, "0,0 0,1 1,0"), g("shape", 2, 3, "0,0 1,0 1,1")],
    }));
    expect(parseSketch(sketch).ok).toBe(true);
  });
  it("makes a playable Glimmith puzzle with holes, walls and the new rules", () => {
    const sketch = toSketch(reading({
      genre: "panes", candidates: ["panes"], rows: 3, cols: 3,
      rules: [{ rule: "cell-borders", settings: "" }, { rule: "neighbors-differ", settings: "" }, { rule: "one-of-each", settings: "" }],
      givens: [g("block", 0, 0), g("wall", 1, 1, "right"), g("palisade", 2, 2, "2 corner"), g("symbol", 1, 0, "red"), g("symbol", 2, 1, "blue")],
    }));
    expect(parseSketch(sketch).ok).toBe(true);
  });
});
