// The drawing → puzzle converter (app/sketchpad/to-puzzle.ts): every example puzzle drawn by
// toDrawing (from-puzzle.ts) converts back to itself, and what doesn't fit, isn't on the grid or
// is unclear is flagged where it is.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENRE_NAMES, makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import type { Given, GridSpec } from "~site/engine/types.ts";
import * as m from "~/sketchpad/model";
import { FOLDER_GENRE, specOf, toDrawing } from "~/sketchpad/from-puzzle";
import { areasOf, breaksRules, convert, normalSpec, paintAreas, PROFILES, READERS, resolveStroke, withAreas, type Problem } from "~/sketchpad/to-puzzle";

const GAMES = new URL("../../../src/games/", import.meta.url).pathname;
const folders = readdirSync(GAMES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const examples = (folder: string) => readdirSync(`${GAMES}${folder}`).filter((x) => x.endsWith(".json")).sort()
  .map((f) => ({ f, spec: specOf(FOLDER_GENRE[folder] ?? folder, JSON.parse(readFileSync(`${GAMES}${folder}/${f}`, "utf8"))) }));

/** The puzzle drawn, then read back with the same settings (the Rules and Look panels'). */
function roundTrip(spec: GridSpec, unfinished = false) {
  const genre = spec.genre as GenreName, drawing = toDrawing(makePuzzle(spec, { unfinished }), genre).drawing;
  return { drawing, ...convert(drawing, genre, { rules: spec.rules, style: spec.style }) };
}
const C = (r: number, c: number): [number, number] => [r, c];
const kinds = (ps: Problem[]) => ps.map((p) => p.kind);

describe("round trip: every example", () => {
  for (const folder of folders) {
    const genre = (FOLDER_GENRE[folder] ?? folder) as GenreName;
    if (!PROFILES[genre]) {
      it(`${folder}: not made in paint yet`, () => {
        const { spec, problems } = roundTrip(examples(folder)[0].spec);
        expect(spec).toBeNull();
        expect(kinds(problems)).toEqual(["unsupported"]);
      });
      continue;
    }
    it(`${folder}: convert(toDrawing(spec)) is the spec`, () => {
      for (const { f, spec } of examples(folder)) {
        const out = roundTrip(spec);
        expect(out.problems, `${folder}/${f}`).toEqual([]);
        expect(normalSpec(out.spec!), `${folder}/${f}`).toEqual(normalSpec(spec, genre));
        // everything drawn went into the puzzle, but the title written above it
        const unused = out.drawing.items.filter((it) => !out.used.has(it.id));
        expect(unused.map((it) => it.kind), `${folder}/${f}`).toEqual(["text"]);
      }
    });
  }

  // clue kinds and settings no example uses
  const SYNTHETIC: GridSpec[] = [
    { genre: "panes", size: [5, 5], rules: [{ rule: "one-of-each" }, { rule: "region-shape" }, { rule: "shape-bank" }], givens: [
      { at: "cell", cell: C(1, 1), kind: "symbol", value: "★" }, { at: "cell", cell: C(1, 2), kind: "symbol", value: "red" },
      { at: "cell", cell: C(2, 2), kind: "shape", value: [C(0, 0), C(0, 1), C(1, 0)] }, { at: "aside", kind: "bank", value: [C(0, 0), C(1, 0), C(2, 0), C(2, 1)] },
      { at: "border", cells: [C(3, 3), C(3, 4)], kind: "wall" }, { at: "cell", cell: C(4, 4), kind: "block" }, { at: "cell", cell: C(0, 4), kind: "number", value: 3 }] },
    { genre: "panes", size: [4, 4], rules: [{ rule: "size-compare" }, { rule: "size-difference" }, { rule: "regions-at-corner" }], givens: [
      { at: "border", cells: [C(0, 0), C(0, 1)], kind: "inequality" }, { at: "border", cells: [C(0, 3), C(0, 2)], kind: "inequality" },
      { at: "border", cells: [C(1, 0), C(2, 0)], kind: "inequality" }, { at: "border", cells: [C(2, 1), C(1, 1)], kind: "inequality" },
      { at: "border", cells: [C(2, 2), C(2, 3)], kind: "difference", value: 2 }, { at: "corner", corner: C(2, 2), kind: "watchtower", value: 3 }] },
    { genre: "panel", size: [5, 5], rules: [{ rule: "panel-line", symmetry: "turn" }], givens: [
      { at: "corner", corner: C(5, 0), kind: "start", color: "blue" }, { at: "corner", corner: C(0, 5), kind: "start", color: "yellow" },
      { at: "corner", corner: C(0, 0), kind: "end" }, { at: "corner", corner: C(5, 5), kind: "end" },
      { at: "corner", corner: C(2, 2), kind: "hexagon", color: "blue" },
      { at: "cell", cell: C(0, 0), kind: "shape", value: [C(0, 0), C(0, 1)], rotate: true },
      { at: "cell", cell: C(1, 1), kind: "shape", value: [C(0, 0)], negative: true },
      { at: "cell", cell: C(3, 3), kind: "eraser", color: "red" }, { at: "cell", cell: C(4, 4), kind: "square", color: "black" },
      { at: "cell", cell: C(4, 0), kind: "star", color: "purple" }, { at: "cell", cell: C(2, 4), kind: "triangle", value: 2 }] },
    { genre: "sudoku", size: [6, 6], rules: [{ rule: "boxes", box: [3, 2] }], givens: [{ at: "cell", cell: C(0, 0), kind: "number", value: 6 }] },
    { genre: "sudoku", size: [16, 16], givens: [{ at: "cell", cell: C(0, 0), kind: "number", value: 16 }, { at: "cell", cell: C(0, 1), kind: "number", value: 10 }] },
    { genre: "akari", size: [4, 4], givens: [{ at: "cell", cell: C(1, 1), kind: "block" }, { at: "cell", cell: C(1, 1), kind: "number", value: 0, letter: "A" }] },
    { genre: "skyscrapers", size: [4, 4], givens: (["top", "bottom", "left", "right"] as const).map((side, i): Given => ({ at: "edge", kind: "skyscraper", side, value: i + 1,
      cell: side === "top" ? C(0, i) : side === "bottom" ? C(3, i) : side === "left" ? C(i, 0) : C(i, 3) })) },
    { genre: "spiral-galaxies", size: [3, 3], givens: [{ at: "point", point: C(1, 1), kind: "galaxy" }, { at: "point", point: C(2, 2), kind: "galaxy" }, { at: "point", point: C(3, 4), kind: "galaxy" }, { at: "point", point: C(4, 5), kind: "galaxy" }] },
    { genre: "thermo-sudoku", size: [4, 4], givens: [{ at: "cells", cells: [C(3, 3), C(2, 2), C(1, 2), C(0, 2)], kind: "thermo" }] },
    { genre: "panes", size: [4, 4], rules: [{ rule: "cell-borders" }], givens: [
      { at: "cell", cell: C(0, 0), kind: "palisade", value: 2, opposite: true }, { at: "cell", cell: C(1, 1), kind: "palisade", value: 2 },
      { at: "cell", cell: C(2, 2), kind: "palisade", value: 0 }, { at: "cell", cell: C(3, 3), kind: "palisade", value: 4 }, { at: "cell", cell: C(0, 3), kind: "palisade", value: 3 }] },
    { genre: "easy-as-abc", size: [4, 4], givens: [{ at: "cell", cell: C(1, 1), kind: "number", value: 2 }, { at: "edge", cell: C(0, 1), side: "top", kind: "first", value: 3 }] },
  ];
  for (const spec of SYNTHETIC) {
    it(`${spec.genre}: ${(spec.givens ?? []).map((g) => g.kind).filter((k, i, a) => a.indexOf(k) === i).join(", ")}`, () => {
      const out = roundTrip(spec, true);
      expect(out.problems.filter((p) => p.kind !== "incomplete")).toEqual([]);
      expect(normalSpec(out.spec!)).toEqual(normalSpec(spec));
    });
  }
});

describe("profiles", () => {
  it("every genre has one (RYB: not yet), and every part it reads has a reader but the ones paint can't make", () => {
    expect(Object.keys(PROFILES).sort()).toEqual([...GENRE_NAMES].sort());
    expect(GENRE_NAMES.filter((g) => !PROFILES[g])).toEqual(["coats"]);
    const missing = GENRE_NAMES.flatMap((g) => (PROFILES[g]?.reads ?? []).filter((p) => !READERS[p]));
    expect([...new Set(missing)]).toEqual([]);
  });
});

// ---- drawings made by hand ----

/** A drawing on a rows × cols grid of 40-unit squares at (40, 40), with these items. */
function drawing(rows: number, cols: number, items: m.NewItem[], look?: "tracks" | "hex" | "dots"): m.Drawing {
  let d = m.setGrid(m.EMPTY, { x: 40, y: 40, rows, cols, S: 40 });
  if (look) d = m.setGrid(d, m.setLook(d.grid!, look));
  for (const it of items) d = m.add(d, it);
  return d;
}
const cell = (r: number, c: number): m.Anchor => ({ at: "cell", r, c });
const G = (r: number, c: number): m.Anchor => ({ at: "grid", r, c });
const text = (at: m.Anchor, t: string, small = false): m.NewItem => ({ kind: "text", at, text: t, ...(small ? { small } : {}) });
const pen = (weight: m.Weight, ...pts: [number, number][]): m.NewItem => ({ kind: "pen", weight, points: pts.map(([r, c]) => G(r, c)) });
const givens = (d: m.Drawing, genre: GenreName, rules?: GridSpec["rules"]) => convert(d, genre, { rules }).spec?.givens ?? [];

describe("off-type, off-grid and type switching", () => {
  it("a stamp the type doesn't use is flagged where it is, and left out", () => {
    const d = drawing(4, 4, [text(cell(0, 0), "1"), { kind: "stamp", stamp: "crest", at: cell(1, 1) }]);
    const out = convert(d, "sudoku");
    expect(out.spec!.givens).toEqual([{ at: "cell", cell: [0, 0], kind: "number", value: 1 }]);
    expect(out.problems).toEqual([{ kind: "off-type", text: "A crest isn't part of Sudoku", items: [2], cells: [[1, 1]] }]);
    expect(out.used).toEqual(new Set([1]));
  });

  it("things off the grid: a stamp far away, a scribble, a clue in the ring of a type without outside clues", () => {
    const d = drawing(4, 4, [{ kind: "stamp", stamp: "rock", at: G(8, 8) }, pen("medium", [6, -0.5], [7.2, 3.3], [6.5, 5]), text(cell(-1, 2), "3")]);
    const out = convert(d, "akari");
    expect(out.problems.map((p) => [p.kind, p.text])).toEqual([
      ["off-grid", "A shaded square isn't on the grid"], ["off-grid", "This line isn't on the grid"], ["off-type", "Akari has no clues outside the grid"]]);
    expect(out.spec!.givens).toBeUndefined();
  });

  it("writing above the grid is the title: left out, not flagged", () => {
    const out = convert(drawing(3, 3, [text(G(-1.2, 1.5), "My puzzle")]), "nurikabe");
    expect(out.problems).toEqual([]);
    expect(out.used.size).toBe(0);
  });

  it("switching type: a Masyu drawn, read as Sudoku and as Panel", () => {
    const masyu = examples("masyu")[0].spec, d = toDrawing(makePuzzle(masyu), "masyu").drawing;
    const stones = d.items.filter((it) => it.kind === "stamp").length;
    const sudoku = convert(d, "sudoku");
    expect(sudoku.problems.filter((p) => p.text === "A stone isn't part of Sudoku")).toHaveLength(stones);
    expect(sudoku.spec!.givens).toBeUndefined();
    // a panel reads stones as its squares, and its grid is tracks
    const panel = convert(d, "panel");
    expect(panel.spec!.givens!.every((g) => g.kind === "square")).toBe(true);
    expect(kinds(panel.problems)).toContain("grid");
    expect(panel.problems.find((p) => p.kind === "incomplete")?.text).toMatch(/start circle/);
  });

  it("switching type: a Sudoku read as Panel flags every number", () => {
    const sudoku = examples("sudoku")[0].spec, d = toDrawing(makePuzzle(sudoku), "sudoku").drawing;
    const out = convert(d, "panel");
    const numbers = (sudoku.givens ?? []).length;
    expect(out.problems.filter((p) => p.kind === "off-type" && p.text.startsWith("Writing"))).toHaveLength(numbers);
    // the box lines aren't a panel's: the player draws the line
    expect(out.problems.some((p) => p.text.startsWith("Players draw the line"))).toBe(true);
  });

  it("switching type: Akari's rocks and numbers carry over to Hidoku as they are", () => {
    const akari = examples("akari")[0].spec, d = toDrawing(makePuzzle(akari), "akari").drawing;
    const out = convert(d, "hidoku");
    expect(normalSpec({ ...out.spec!, genre: "akari" }).givens).toEqual(normalSpec(akari).givens);
    expect(out.problems.filter((p) => p.kind === "off-type")).toEqual([]);
  });

  it("RYB isn't made in paint yet", () => {
    expect(convert(drawing(2, 2, []), "coats")).toEqual({ spec: null, used: new Set(), problems: [{ kind: "unsupported", text: "RYB isn't made in paint yet: use its own editor", items: [] }] });
  });

  it("no grid, no puzzle; the wrong look is flagged", () => {
    expect(convert(m.EMPTY, "sudoku").problems).toEqual([{ kind: "grid", text: "Draw a grid first", items: [] }]);
    expect(convert(drawing(3, 3, []), "hive").problems.map((p) => p.text)).toEqual(["Hive is drawn on hexagons"]);
  });

  it("a loose stamp near a square counts as in it; one between squares doesn't", () => {
    const d = drawing(3, 3, [{ kind: "stamp", stamp: "rock", at: G(1.6, 0.4) }, { kind: "stamp", stamp: "rock", at: G(1, 2) }]);
    const out = convert(d, "simple-loop");
    expect(out.spec!.givens).toEqual([{ at: "cell", cell: [1, 0], kind: "block" }]);
    expect(kinds(out.problems)).toEqual(["off-type"]);
  });
});

describe("pen lines", () => {
  it("resolves a stroke along grid lines into the stretches it covers", () => {
    const parts = resolveStroke([{ r: 0, c: 1 }, { r: 2, c: 1 }, { r: 2, c: 3 }], 4, 4);
    expect(parts).toEqual([{ kind: "edges", len: expect.any(Number), edges: [
      { side: "left", r: 0, c: 1 }, { side: "left", r: 1, c: 1 }, { side: "top", r: 2, c: 1 }, { side: "top", r: 2, c: 2 }] }]);
  });

  it("resolves a stroke through square centres, diagonals too", () => {
    const parts = resolveStroke([{ r: 0.5, c: 0.5 }, { r: 1.5, c: 1.5 }, { r: 1.5, c: 2.5 }], 4, 4);
    expect(parts).toEqual([{ kind: "centres", len: expect.any(Number), cells: [[0, 0], [1, 1], [1, 2]] }]);
  });

  it("a wobbly wall that overshoots the corner is still one wall", () => {
    const d = drawing(4, 4, [pen("bold", [0.9, 2.08], [1.5, 1.93], [2.1, 2.05], [2.3, 2.0])]);
    expect(givens(d, "simple-loop")).toEqual([
      { at: "border", cells: [[1, 1], [1, 2]], kind: "wall" }, { at: "border", cells: [[2, 1], [2, 2]], kind: "wall" }]);
  });

  it("a wobbly thermometer through the centres, bulb at the far end", () => {
    const d = drawing(4, 4, [{ kind: "stamp", stamp: "stone", color: "white", at: cell(3, 2) },
      pen("bold", [0.55, 0.45], [1.02, 0.6], [1.48, 0.52], [2.0, 1.1], [2.5, 1.45], [3.1, 2.0], [3.45, 2.52])]);
    const out = convert(d, "thermo-sudoku");
    expect(out.spec!.givens).toEqual([{ at: "cells", cells: [[3, 2], [2, 1], [1, 0], [0, 0]], kind: "thermo" }]);
    expect(out.problems).toEqual([]);
  });

  it("a mixed stroke is split: the part along the grid is a wall, the part across the squares is flagged", () => {
    const d = drawing(4, 4, [pen("bold", [0, 2], [2, 2], [2.5, 2.5], [2.5, 3.5])]);
    const out = convert(d, "simple-loop");
    expect(out.spec!.givens).toEqual([{ at: "border", cells: [[0, 1], [0, 2]], kind: "wall" }, { at: "border", cells: [[1, 1], [1, 2]], kind: "wall" }]);
    expect(out.problems.map((p) => p.text)).toEqual(["Lines through the squares aren't part of Simple Loop"]);
    expect(out.used.has(1)).toBe(true);
  });

  it("ambiguous lines: a thermometer with no bulb, a border that closes nothing off, a door with no head", () => {
    const thermo = convert(drawing(4, 4, [pen("bold", [0.5, 0.5], [0.5, 2.5])]), "thermo-sudoku");
    expect(thermo.problems.map((p) => [p.kind, p.text])).toEqual([["ambiguous", "Which end is the bulb? Stamp a stone on it"]]);
    expect(thermo.spec!.givens).toEqual([{ at: "cells", cells: [[0, 0], [0, 1], [0, 2]], kind: "thermo" }]);

    const areas = convert(drawing(4, 4, [pen("bold", [0, 2], [4, 2]), pen("bold", [2, 0], [2, 1])]), "star-battle");
    expect(areas.spec!.areas).toEqual(["aabb", "aabb", "aabb", "aabb"]);
    expect(areas.problems.map((p) => [p.kind, p.text, p.items])).toEqual([["ambiguous", "This line doesn't close off an area", [2]]]);

    const door = convert(drawing(3, 3, [{ kind: "line", weight: "medium", from: G(3, 1.5), to: G(3.8, 1.5) }]), "simple-path");
    expect(door.spec!.givens).toEqual([{ at: "edge", cell: [2, 1], side: "bottom", kind: "door", role: "out" }]);
    expect(kinds(door.problems)).toEqual(["ambiguous", "incomplete"]);
  });

  it("a sudoku's box lines must be where the boxes are", () => {
    const d = drawing(6, 6, [pen("medium", [0, 3], [6, 3]), pen("medium", [0, 2], [6, 2])]);
    const out = convert(d, "sudoku");
    expect(out.problems.map((p) => [p.kind, p.items])).toEqual([["ambiguous", [2]]]);
    expect(out.problems[0].text).toBe("Not a box line. Boxes are 2 × 3");
    // with tall boxes set in Rules, the other line is the wrong one
    expect(convert(d, "sudoku", { rules: [{ rule: "boxes", box: [3, 2] }] }).problems.map((p) => p.items)).toEqual([[1]]);
  });
});

describe("rule hints", () => {
  it("two 5s in row 6, pointing at both", () => {
    const d = drawing(6, 6, [text(cell(5, 0), "5"), text(cell(5, 4), "5"), text(cell(0, 0), "1")]);
    const out = convert(d, "sudoku");
    expect(out.problems).toEqual([{ kind: "rule", text: "Two 5s in row 6", items: [1, 2], cells: [[5, 0], [5, 4]], rule: "latin" }]);
    expect(breaksRules(out.problems)).toBe(true);
  });

  it("a repeat in a box, a digit out of range, a thermometer that falls", () => {
    const box = convert(drawing(4, 4, [text(cell(0, 0), "2"), text(cell(1, 1), "2")]), "sudoku");
    expect(box.problems.map((p) => p.text)).toEqual(["Two 2s in a box"]);
    const big = convert(drawing(4, 4, [text(cell(0, 0), "7")]), "sudoku");
    expect(big.problems.map((p) => p.text)).toEqual(["7 is too big. Use 1 to 4"]);
    const thermo = convert(drawing(4, 4, [{ kind: "stamp", stamp: "stone", at: cell(0, 0) }, pen("bold", [0.5, 0.5], [0.5, 2.5]), text(cell(0, 0), "3"), text(cell(0, 2), "1")]), "thermo-sudoku");
    expect(thermo.problems).toEqual([{ kind: "rule", text: "These can't rise along the thermometer", items: [3, 4], cells: [[0, 0], [0, 2]], rule: "thermo" }]);
  });

  it("letters in Easy as ABC; nothing for types without digits", () => {
    const abc = convert(drawing(4, 4, [text(cell(0, 0), "A"), text(cell(3, 0), "A")]), "easy-as-abc");
    expect(abc.problems.map((p) => p.text)).toEqual(["Two As in column 1"]);
    expect(convert(drawing(4, 4, [text(cell(0, 0), "2"), text(cell(0, 1), "2")]), "nurikabe").problems).toEqual([]);
  });
});

describe("areas, painted (paint's Areas tool)", () => {
  const spec = specOf("star-battle", JSON.parse(readFileSync(new URL("../../../src/games/star-battle/1.json", import.meta.url), "utf8")));
  const drawing = () => toDrawing(makePuzzle(spec), "star-battle").drawing;
  it("reads a drawing's areas, and one area for a grid with no borders", () => {
    expect(normalSpec({ ...spec, areas: areasOf(drawing(), "star-battle")! }).areas).toEqual(normalSpec(spec).areas);
    const bare = m.setGrid(m.EMPTY, { x: 40, y: 40, rows: 3, cols: 4, S: 40 });
    expect(areasOf(bare, "star-battle")).toEqual(["aaaa", "aaaa", "aaaa"]);
    expect(areasOf(bare, "sudoku")).toEqual(["aaaa", "aaaa", "aaaa"]);
    expect(areasOf(bare, "akari")).toBeNull();
  });
  it("redraws the borders for new areas, and the converter reads them back", () => {
    const areas = paintAreas(spec.areas!, [[0, 0], [1, 0]], null);
    const d = withAreas(drawing(), areas, "star-battle");
    expect(normalSpec({ ...spec, areas: convert(d, "star-battle").spec!.areas }).areas).toEqual(normalSpec({ ...spec, areas }).areas);
    // the old borders went: only the new bold lines are left
    expect(d.items.filter((it) => it.kind === "line" || it.kind === "pen").every((it) => it.kind === "line" && it.weight === "bold")).toBe(true);
  });
  it("moves squares into a square's area, or a new one", () => {
    expect(paintAreas(["aab", "abb"], [[0, 2], [1, 2]], "a")).toEqual(["aaa", "aba"]);
    expect(paintAreas(["aab", "abb"], [[1, 1]], null)).toEqual(["aab", "acb"]);
  });
  it("keeps a sudoku's box lines (medium) when it redraws an Irregular Sudoku's areas", () => {
    let d = m.setGrid(m.EMPTY, { x: 40, y: 40, rows: 4, cols: 4, S: 40 });
    d = m.add(d, { kind: "line", weight: "medium", from: { at: "corner", r: 2, c: 0 }, to: { at: "corner", r: 2, c: 4 } });
    const out = withAreas(d, ["aabb", "aabb", "ccdd", "ccdd"], "irregular-sudoku");
    expect(out.items.filter((it) => it.kind === "line" && it.weight === "medium")).toHaveLength(1);
    expect(out.items.filter((it) => it.kind === "line" && it.weight === "bold")).toHaveLength(2);
  });
});

describe("a lattice's lengths, written as the old editor took them", () => {
  it("reads √5, r5 and sqrt 5 alike", () => {
    let d = m.setGrid(m.EMPTY, { x: 40, y: 40, rows: 4, cols: 4, S: 40 });
    d = m.setGrid(d, m.setLook(d.grid!, "dots"));
    d = m.add(d, { kind: "text", at: { at: "grid", r: 4.8, c: 2 }, text: "1 √2 r5 sqrt 10 2" });
    expect(convert(d, "pythagorean-paths").spec!.givens).toContainEqual({ at: "aside", kind: "lengths", value: [1, 2, 5, 10, 4] });
  });
});
