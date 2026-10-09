// Can every puzzle type be drawn in the sketchpad (/new/draw)? Each example puzzle (src/games/<type>/*.json),
// and a made-up puzzle for each clue kind no example uses, is converted into a sketchpad Drawing using
// only the sketchpad's model (app/sketchpad/model.ts) and what its toolbar offers (Sketchpad.tsx): the
// grid and its gaps, pen and straight lines in three weights, washes, the stamps (any shape on the 5 × 5
// pad, hollow or tilted; colours on stones, crests, triangles, shapes and erasers, ink / blue / yellow on
// starts and dots) and text, normal or small. Whatever has no
// faithful drawing is listed as a gap, and the gaps are checked against EXPECTED_GAPS below, so this file
// documents them: when the sketchpad gains a tool, a gap disappears and the table has to shrink with it.
// It also works out how big a square the page leaves for each puzzle (scale findings, logged). The
// drawing itself is made by app/sketchpad/from-puzzle.ts (toDrawing), shared with the reader evaluation.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENRE_NAMES, makePuzzle } from "~site/engine/puzzle.ts";
import type { Given, GridSpec, Side } from "~site/engine/types.ts";
import * as m from "~/sketchpad/model";
import { itemSvg } from "~/sketchpad/draw";
import { FOLDER_GENRE, specOf as specOfData, toDrawing, type Converted } from "~/sketchpad/from-puzzle";

const GAMES = new URL("../../../src/games/", import.meta.url).pathname;
/** An example file as a grid-engine spec. */
const specOf = (genre: string, path: string): GridSpec => specOfData(genre, JSON.parse(readFileSync(path, "utf8")));

// ---- made-up puzzles: clue kinds no example uses, panels' corner cases, and the largest sizes ----

const C = (r: number, c: number): [number, number] => [r, c];
const SYNTHETIC: Record<string, GridSpec> = {
  "panes: palisade, symbol, rose, shape, bank, wall, block": { genre: "panes", size: [5, 5], rules: [{ rule: "cell-borders" }, { rule: "one-of-each" }, { rule: "region-shape" }, { rule: "shape-bank" }], givens: [
    { at: "cell", cell: C(0, 0), kind: "palisade", value: 2, opposite: true }, { at: "cell", cell: C(1, 1), kind: "symbol", value: "★" },
    { at: "cell", cell: C(1, 2), kind: "symbol", value: "red" }, { at: "cell", cell: C(2, 2), kind: "shape", value: [C(0, 0), C(0, 1), C(1, 0)] },
    { at: "aside", kind: "bank", value: [C(0, 0), C(1, 0), C(2, 0), C(2, 1)] }, { at: "border", cells: [C(3, 3), C(3, 4)], kind: "wall" },
    { at: "cell", cell: C(4, 4), kind: "block" }] },
  "panes: inequality, difference, watchtower": { genre: "panes", size: [4, 4], rules: [{ rule: "size-compare" }, { rule: "size-difference" }, { rule: "regions-at-corner" }], givens: [
    { at: "border", cells: [C(0, 0), C(0, 1)], kind: "inequality" }, { at: "border", cells: [C(1, 0), C(2, 0)], kind: "inequality" },
    { at: "border", cells: [C(2, 2), C(2, 3)], kind: "difference", value: 2 }, { at: "corner", corner: C(2, 2), kind: "watchtower", value: 3 }] },
  "panes: pentomino and mirrored shapes": { genre: "panes", size: [6, 6], rules: [{ rule: "region-shape" }, { rule: "shape-bank" }], givens: [
    { at: "cell", cell: C(0, 0), kind: "shape", value: [C(0, 1), C(0, 2), C(1, 0), C(1, 1), C(2, 1)] },          // F pentomino
    { at: "aside", kind: "bank", value: [C(0, 1), C(1, 1), C(2, 0), C(2, 1)] }] },                               // J (an L's mirror)
  "panel: hollow, turning, pentomino, coloured eraser/start/dot, square": { genre: "panel", size: [5, 5], rules: [{ rule: "panel-line", symmetry: "turn" }], givens: [
    { at: "corner", corner: C(5, 0), kind: "start", color: "blue" }, { at: "corner", corner: C(0, 5), kind: "start", color: "yellow" },
    { at: "corner", corner: C(0, 0), kind: "end" }, { at: "corner", corner: C(5, 5), kind: "end" },
    { at: "corner", corner: C(2, 2), kind: "hexagon", color: "blue" },
    { at: "cell", cell: C(0, 0), kind: "shape", value: [C(0, 0), C(0, 1)], rotate: true },
    { at: "cell", cell: C(1, 1), kind: "shape", value: [C(0, 0)], negative: true },
    { at: "cell", cell: C(2, 2), kind: "shape", value: [C(0, 0), C(1, 0), C(2, 0), C(3, 0), C(4, 0)] },
    { at: "cell", cell: C(3, 3), kind: "eraser", color: "red" },
    { at: "cell", cell: C(4, 4), kind: "square", color: "black" },
    { at: "cell", cell: C(4, 0), kind: "star", color: "purple" }] },
  // scale: the largest realistic sizes
  "sudoku 16×16": { genre: "sudoku", size: [16, 16], givens: [{ at: "cell", cell: C(0, 0), kind: "number", value: 16 }, { at: "cell", cell: C(0, 1), kind: "number", value: 10 }] },
  "sudoku 25×25": { genre: "sudoku", size: [25, 25], givens: [{ at: "cell", cell: C(0, 0), kind: "number", value: 25 }, { at: "cell", cell: C(0, 1), kind: "number", value: 13 }] },
  "nonogram 20×20, 6 numbers a line": { genre: "nonogram", size: [20, 20], givens: [
    ...Array.from({ length: 20 }, (_, i): Given => ({ at: "row", index: i, kind: "runs", value: [1, 2, 1, 3, 1, 2] })),
    ...Array.from({ length: 20 }, (_, i): Given => ({ at: "col", index: i, kind: "runs", value: [1, 2, 1, 3, 1, 2] }))] },
  "nonogram 30×30, 8 numbers a line": { genre: "nonogram", size: [30, 30], givens: [
    ...Array.from({ length: 30 }, (_, i): Given => ({ at: "row", index: i, kind: "runs", value: [1, 1, 2, 1, 1, 2, 1, 1] })),
    ...Array.from({ length: 30 }, (_, i): Given => ({ at: "col", index: i, kind: "runs", value: [1, 1, 2, 1, 1, 2, 1, 1] }))] },
  "skyscrapers 9×9, clues on all sides": { genre: "skyscrapers", size: [9, 9], givens: (["top", "bottom", "left", "right"] as Side[]).flatMap((side) =>
    Array.from({ length: 9 }, (_, i): Given => ({ at: "edge", kind: "skyscraper", side, value: 3, cell: side === "top" ? C(0, i) : side === "bottom" ? C(8, i) : side === "left" ? C(i, 0) : C(i, 8) }))) },
  "slitherlink 30×30": { genre: "slitherlink", size: [30, 30], givens: [{ at: "cell", cell: C(0, 0), kind: "number", value: 3 }] },
  "panes 8×8 compass": { genre: "panes", size: [8, 8], rules: [{ rule: "compass" }], givens: [{ at: "cell", cell: C(3, 3), kind: "compass", value: { n: 12, e: 3, s: 10, w: 2 } }] },
};

// ---- the gaps, as they are today ----

/** What each example type (and each made-up puzzle) can't be drawn with today: nothing. (What's
 *  only drawn roughly is in the report: a rose as a stone, a nonogram's numbers without its
 *  picture's colours, and RYB's stones at a fixed size with no grid to size them by.) */
const EXPECTED_GAPS: Record<string, string[]> = Object.fromEntries([
  ...readdirSync(GAMES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name),
  "panes: palisade, symbol, rose, shape, bank, wall, block", "panes: inequality, difference, watchtower", "panes: pentomino and mirrored shapes",
  "panel: hollow, turning, pentomino, coloured eraser/start/dot, square", "sudoku 16×16", "sudoku 25×25",
  "nonogram 20×20, 6 numbers a line", "nonogram 30×30, 8 numbers a line",   // fits, just: squares 14.9 against the 14 minimum
  "skyscrapers 9×9, clues on all sides", "slitherlink 30×30", "panes 8×8 compass",
].map((name) => [name, []]));

// ---- the checks ----

const folders = readdirSync(GAMES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const results: Record<string, { gaps: Set<string>; rough: Set<string>; S: number[]; textPx: number[]; crowded: number }> = {};
function collect(name: string, c: Converted) {
  const r = (results[name] ??= { gaps: new Set(), rough: new Set(), S: [], textPx: [], crowded: 0 });
  c.gaps.forEach((x) => r.gaps.add(x)); c.rough.forEach((x) => r.rough.add(x));
  r.S.push(Math.round(c.S * 10) / 10); r.textPx.push(Math.round(c.textPx)); r.crowded += c.crowded;
  // every item draws, and the drawing survives being saved
  for (const it of c.drawing.items) expect(() => itemSvg(c.drawing, it)).not.toThrow();
  expect(m.revive(JSON.parse(JSON.stringify(c.drawing)))).toEqual(c.drawing);
}

describe("every puzzle type in the sketchpad", () => {
  it("every engine genre has an example folder", () => {
    const covered = new Set(folders.map((f) => FOLDER_GENRE[f] ?? f));
    expect(GENRE_NAMES.filter((g) => !covered.has(g))).toEqual([]);
  });

  for (const folder of folders) {
    it(`${folder}: its examples draw, with only the known gaps`, () => {
      const genre = FOLDER_GENRE[folder] ?? folder;
      for (const f of readdirSync(`${GAMES}${folder}`).filter((x) => x.endsWith(".json")).sort()) {
        collect(folder, toDrawing(makePuzzle(specOf(genre, `${GAMES}${folder}/${f}`)), genre));
      }
      expect([...results[folder].gaps].sort(), `gaps in ${folder}`).toEqual([...(EXPECTED_GAPS[folder] ?? ["(no entry in EXPECTED_GAPS)"])].sort());
    });
  }

  for (const [name, spec] of Object.entries(SYNTHETIC)) {
    it(`${name}: draws, with only the known gaps`, () => {
      collect(name, toDrawing(makePuzzle(spec, { unfinished: true }), spec.genre!));
      expect([...results[name].gaps].sort(), `gaps in ${name}`).toEqual([...(EXPECTED_GAPS[name] ?? ["(no entry in EXPECTED_GAPS)"])].sort());
    });
  }

  it("covers every clue kind the engine has", () => {
    // read off types.ts so a new clue kind (the Glimmith work in progress) shows up here
    const src = readFileSync(new URL("../../../src/engine/types.ts", import.meta.url), "utf8");
    const kinds = new Set([...src.matchAll(/kind: ((?:"[a-z-]+"(?: \| )?)+)/g)].flatMap((x) => x[1].match(/[a-z-]+/g)!));
    const used = new Set<string>();
    for (const folder of folders) for (const f of readdirSync(`${GAMES}${folder}`).filter((x) => x.endsWith(".json")))
      for (const gv of specOf(FOLDER_GENRE[folder] ?? folder, `${GAMES}${folder}/${f}`).givens ?? []) used.add(gv.kind);
    for (const spec of Object.values(SYNTHETIC)) for (const gv of spec.givens ?? []) used.add(gv.kind);
    used.add("runs");   // nonograms' clues come from their pictures
    expect([...kinds].filter((k) => !used.has(k)).sort()).toEqual([]);
  });

  it("(report)", () => {
    const rows = Object.entries(results).map(([name, r]) =>
      `${name.padEnd(62)} S ${Math.min(...r.S).toFixed(1).padStart(5)}  text ${String(Math.min(...r.textPx)).padStart(3)}px  crowded ${String(r.crowded).padStart(3)}  ` +
      `gaps: ${[...r.gaps].join("; ") || "-"}  | rough: ${[...r.rough].join("; ") || "-"}`);
    console.log(rows.join("\n"));
  });
});
