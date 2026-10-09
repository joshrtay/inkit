// The puzzle guides: one per genre, typed against the engine's genre list, so a new genre needs a
// guide before the build passes. Every picture is checked against the engine's own rules by
// `node puzzles/grid/guides.ts` (a ✓ picture must pass its rule, a ✗ picture must break it), which
// also solves each worked example into examples.json.
import type { GenreName } from "../engine/puzzle.ts";
import type { Given, LineColor, RuleSpec, Side, SymbolColor } from "../engine/types.ts";
import type { Category, Guide } from "./types.ts";

type RC = [number, number];
const num = (r: number, c: number, value: number): Given => ({ at: "cell", cell: [r, c], kind: "number", value });
/** an Akari cipher's letter, standing for a number */
const letter = (r: number, c: number, l: string): Given => ({ at: "cell", cell: [r, c], kind: "number", value: 0, letter: l });
const rock = (r: number, c: number): Given => ({ at: "cell", cell: [r, c], kind: "block" });
const wall = (a: RC, b: RC): Given => ({ at: "border", cells: [a, b], kind: "wall" });
const twins = (a: RC, b: RC): Given => ({ at: "border", cells: [a, b], kind: "twins" });
const opposites = (a: RC, b: RC): Given => ({ at: "border", cells: [a, b], kind: "opposites" });
const door = (r: number, c: number, side: Side, role: "in" | "out"): Given => ({ at: "edge", cell: [r, c], side, kind: "door", role });
const corner = (r: number, c: number, value: number): Given => ({ at: "corner", corner: [r, c], kind: "count", value });
const pearl = (r: number, c: number, value: "white" | "black"): Given => ({ at: "cell", cell: [r, c], kind: "pearl", value });
const outside = (r: number, c: number, side: Side, kind: "first" | "skyscraper", value: number): Given => ({ at: "edge", cell: [r, c], side, kind, value });
const thermo = (...cells: RC[]): Given => ({ at: "cells", cells, kind: "thermo" });
const galaxy = (y: number, x: number): Given => ({ at: "point", point: [y, x], kind: "galaxy" });
const dots = (i: number, value: number[]): Given => ({ at: "cell", cell: [0, i], kind: "dots", value });
const total = (at: "row" | "col", index: number, value: number): Given => ({ at, index, kind: "total", value });
const runs = (at: "row" | "col", index: number, value: number[]): Given => ({ at, index, kind: "runs", value });
const palisade = (r: number, c: number, value: number, opposite = false): Given => ({ at: "cell", cell: [r, c], kind: "palisade", value, ...(opposite ? { opposite } : {}) });
const rose = (r: number, c: number, color: string): Given => ({ at: "cell", cell: [r, c], kind: "symbol", value: color });
const compass = (r: number, c: number, value: { n?: number; e?: number; s?: number; w?: number }): Given => ({ at: "cell", cell: [r, c], kind: "compass", value });
const less = (smaller: RC, bigger: RC): Given => ({ at: "border", cells: [smaller, bigger], kind: "inequality" });
const differ = (a: RC, b: RC, value: number): Given => ({ at: "border", cells: [a, b], kind: "difference", value });
const tower = (r: number, c: number, value: number): Given => ({ at: "corner", corner: [r, c], kind: "watchtower", value });
const bank = (...value: RC[]): Given => ({ at: "aside", kind: "bank", value });
const ELL: RC[] = [[0, 0], [0, 1], [1, 0]];
const critter = (r: number, c: number): Given => ({ at: "cell", cell: [r, c], kind: "symbol", value: "★" });
// panels: corners are [row, col] from 0,0 at the top left; a stretch of line is its two corners
const start = (r: number, c: number, color?: LineColor): Given => ({ at: "corner", corner: [r, c], kind: "start", ...(color ? { color } : {}) });
const end = (r: number, c: number): Given => ({ at: "corner", corner: [r, c], kind: "end" });
const hexAt = (r: number, c: number, color?: LineColor): Given => ({ at: "corner", corner: [r, c], kind: "hexagon", ...(color ? { color } : {}) });
const hexOn = (a: RC, b: RC): Given => ({ at: "line", corners: [a, b], kind: "hexagon" });
const gap = (a: RC, b: RC): Given => ({ at: "line", corners: [a, b], kind: "gap" });
const square = (r: number, c: number, color: SymbolColor): Given => ({ at: "cell", cell: [r, c], kind: "square", color });
const star = (r: number, c: number, color: SymbolColor): Given => ({ at: "cell", cell: [r, c], kind: "star", color });
const triangle = (r: number, c: number, value: number): Given => ({ at: "cell", cell: [r, c], kind: "triangle", value });
const shape = (r: number, c: number, value: RC[], opts: { rotate?: boolean; negative?: boolean } = {}): Given => ({ at: "cell", cell: [r, c], kind: "shape", value, ...opts });
const eraser = (r: number, c: number): Given => ({ at: "cell", cell: [r, c], kind: "eraser" });
/** A 2×2 panel's usual start (bottom left) and end (top right). */
const corners2 = [start(2, 0), end(0, 2)];
/** Lines around a 2×2 panel: up the left side and along the top; and a step in, cutting off the top-left cell. */
const ROUND: RC[][] = [[[2, 0], [0, 0], [0, 2]]];
const STEP: RC[][] = [[[2, 0], [1, 0], [1, 1], [0, 1], [0, 2]]];
/** A line straight across the middle of a 2×2 panel, from the left edge to the right. */
const HALF = [start(1, 0), end(1, 2)];
const ACROSS: RC[][] = [[[1, 0], [1, 2]]];
/** Symmetry: two starts at the bottom corners, two ends at the top, and lines up both sides. */
const MIRROR: RuleSpec[] = [{ rule: "panel-line", symmetry: "left-right" }];
const TWO = [start(2, 0, "blue"), start(2, 2, "yellow"), end(0, 0), end(0, 2)];
const SIDES: RC[][] = [[[2, 0], [0, 0]], [[2, 2], [0, 2]]];

// lattices: a dot on a point, and the lengths (as squares: 5 is √5)
const peg = (r: number, c: number): Given => ({ at: "cell", cell: [r, c], kind: "peg" });
const lengths = (...value: number[]): Given => ({ at: "aside", kind: "lengths", value });
/** Four dots at a 3 × 3 lattice's corners. */
const FOUR = [peg(0, 0), peg(0, 2), peg(2, 0), peg(2, 2)];

const squares = (n: number) => ({ pieces: Array.from({ length: n }, (_, i) => [[i * 10, 0], [i * 10 + 10, 0], [i * 10 + 10, 10], [i * 10, 10]]) });

export const CATEGORIES: Category[] = ["Lines", "Shading", "Regions", "Numbers", "Paint"];

export const guides: Record<GenreName, Guide> = {
  // ---------------- lines ----------------
  "simple-loop": {
    name: "Simple Loop", aka: ["Round the Bend"], category: "Lines", ink: "#2d6a45",
    summary: "Draw one loop that winds through every white cell.",
    origin: "A classic loop-drawing puzzle. Wyatt's version was called Round the Bend.",
    credit: { note: "A classic puzzle-championship type; no single inventor is known.", source: { label: "WPC wiki", url: "https://wpcunofficial.miraheze.org/wiki/Simple_Loop" } },
    rules: [
      { text: "Draw one closed loop through the centre of every white cell.", checks: ["loop"], pictures: [
        { ok: true, note: "Every cell, one loop", size: [2, 3], lines: [[[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [0, 0]]] },
        { ok: false, note: "Two cells missed", size: [2, 3], lines: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
      ] },
      { text: "The loop goes straight or turns. It never branches or crosses itself.", checks: ["loop"], pictures: [
        { ok: false, note: "Branches", size: [2, 3], lines: [[[1, 0], [0, 0], [0, 1], [0, 2], [1, 2]], [[0, 1], [1, 1]]] },
      ] },
      { text: "Dark cells are rocks and thick lines are walls: the loop goes around them.", checks: ["loop"], pictures: [
        { ok: true, note: "Around the rock", size: [3, 3], givens: [rock(1, 1)], lines: [[[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0], [0, 0]]] },
        { ok: false, note: "Through a wall", size: [2, 2], givens: [wall([0, 0], [0, 1])], lines: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
      ] },
    ],
    controls: "Drag from cell to cell to draw; drag back over a line to erase it.",
    example: "round-the-bend/2.json",
  },
  "simple-path": {
    name: "Simple Path", aka: ["Hamiltonian Path"], category: "Lines", ink: "#2d6a45",
    summary: "Draw one path from the arrow in to the arrow out that visits every white cell.",
    origin: "A Hamiltonian path puzzle: the idea of visiting every spot exactly once goes back to William Rowan Hamilton's Icosian game of 1857.",
    credit: { note: "No inventor is known for the grid puzzle; the idea goes back to William Rowan Hamilton's Icosian game (1857).", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Icosian_game" } },
    rules: [
      { text: "Draw one path from the arrow in to the arrow out, through every white cell.", checks: ["path"], pictures: [
        { ok: true, note: "Every cell", size: [2, 3], givens: [door(0, 0, "left", "in"), door(1, 0, "left", "out")], lines: [[[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0]]] },
        { ok: false, note: "Cells missed", size: [2, 3], givens: [door(0, 0, "left", "in"), door(1, 0, "left", "out")], lines: [[[0, 0], [1, 0]]] },
      ] },
      { text: "The path never branches or crosses itself.", checks: ["path"], pictures: [
        { ok: false, note: "Branches", size: [2, 3], givens: [door(0, 0, "left", "in"), door(1, 0, "left", "out")], lines: [[[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0]], [[0, 1], [1, 1]]] },
      ] },
      { text: "It goes around dark cells and never crosses a thick wall.", checks: ["path"], pictures: [
        { ok: true, note: "Around the rock", size: [3, 3], givens: [rock(1, 1), door(0, 0, "left", "in"), door(1, 0, "left", "out")], lines: [[[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]]] },
        { ok: false, note: "Through a wall", size: [2, 2], givens: [wall([0, 0], [0, 1]), door(0, 0, "left", "in"), door(1, 0, "left", "out")], lines: [[[0, 0], [0, 1], [1, 1], [1, 0]]] },
      ] },
    ],
    controls: "Drag from cell to cell to draw; drag back over a line to erase it.",
    example: "simple-path/1.json",
  },
  slitherlink: {
    name: "Slitherlink", aka: ["Fences", "Loop the Loop"], category: "Lines", ink: "#26398f",
    summary: "Draw one loop along the dotted lines; each number counts the sides of its cell the loop uses.",
    origin: "A Nikoli puzzle, first published in 1989.",
    credit: { popularizer: "Nikoli", year: "1989", source: { label: "Nikoli", url: "https://www.nikoli.co.jp/en/puzzles/slitherlink/" } },
    rules: [
      { text: "Draw one loop along the grid lines. It never branches or crosses itself.", checks: ["loop"], pictures: [
        { ok: true, note: "One loop", size: [2, 2], fence: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]] },
        { ok: false, note: "Two loops", size: [1, 3], fence: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]], [[0, 2], [0, 3], [1, 3], [1, 2], [0, 2]]] },
      ] },
      { text: "A number says how many of its cell's four sides the loop runs along.", checks: ["sides"], pictures: [
        { ok: true, note: "3 sides", size: [1, 2], givens: [num(0, 0, 3)], fence: [[[0, 0], [0, 2], [1, 2], [1, 0], [0, 0]]] },
        { ok: false, note: "Not 2 sides", size: [1, 2], givens: [num(0, 0, 2)], fence: [[[0, 0], [0, 2], [1, 2], [1, 0], [0, 0]]] },
      ] },
    ],
    controls: "Drag along the dotted lines to draw. Tap a line to cycle line, ✕ and empty.",
    example: "slitherlink/1.json",
  },
  masyu: {
    name: "Masyu", aka: ["Pearl"], category: "Lines", ink: "#2b2b30",
    summary: "Draw one loop through cell centres that goes straight through white pearls and turns on black ones.",
    origin: "A Nikoli puzzle from 2000.",
    credit: { popularizer: "Nikoli", year: "2000", source: { label: "Nikoli", url: "https://www.nikoli.co.jp/en/puzzles/masyu/" } },
    rules: [
      { text: "Draw one loop through the centres of cells. It doesn't have to visit every cell.", checks: ["loop"], pictures: [
        { ok: true, note: "One loop", size: [3, 3], lines: [[[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0], [0, 0]]] },
      ] },
      { text: "White pearl: go straight through it, and turn in the cell just before or after it.", checks: ["pearls"], pictures: [
        { ok: true, note: "Turns next to it", size: [2, 5], givens: [pearl(0, 1, "white")], lines: [[[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 4], [1, 3], [1, 2], [1, 1], [1, 0], [0, 0]]] },
        { ok: false, note: "Straight on both sides", size: [2, 5], givens: [pearl(0, 2, "white")], lines: [[[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 4], [1, 3], [1, 2], [1, 1], [1, 0], [0, 0]]] },
      ] },
      { text: "Black pearl: turn on it, then go straight through the next cell on both sides.", checks: ["pearls"], pictures: [
        { ok: true, note: "Turns, then straight", size: [3, 3], givens: [pearl(0, 0, "black")], lines: [[[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0], [0, 0]]] },
        { ok: false, note: "Turns again too soon", size: [2, 2], givens: [pearl(0, 0, "black")], lines: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
      ] },
    ],
    controls: "Drag from cell to cell to draw; drag back over a line to erase it.",
    example: "masyu/1.json",
  },
  numberlink: {
    name: "Numberlink", aka: ["Connectlink", "Flow", "Arukone"], category: "Lines", ink: "#26398f",
    summary: "Join each pair of matching numbers with a line; lines never cross.",
    origin: "Sam Loyd printed an early form of it in 1897; Nikoli made it popular in Japan. Connectlink adds the rule that every cell is used.",
    credit: { popularizer: "Nikoli", note: "Sam Loyd printed an early form in 1897.", source: { label: "Nikoli", url: "https://www.nikoli.co.jp/en/puzzles/numberlink/" } },
    rules: [
      { text: "Join each pair of matching numbers with one line.", checks: ["links"], pictures: [
        { ok: true, note: "Pairs joined", size: [2, 3], givens: [num(0, 0, 1), num(0, 2, 1), num(1, 0, 2), num(1, 2, 2)], lines: [[[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [1, 2]]] },
        { ok: false, note: "1 joined to 2", size: [2, 3], givens: [num(0, 0, 1), num(1, 2, 1), num(1, 0, 2), num(0, 2, 2)], lines: [[[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [1, 2]]] },
      ] },
      { text: "Lines never branch, cross or touch another number.", checks: ["links"], pictures: [
        { ok: false, note: "Lines cross", size: [3, 3], givens: [num(0, 1, 1), num(2, 1, 1), num(1, 0, 2), num(1, 2, 2)], lines: [[[0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2]]] },
      ] },
      { text: "In Connectlink, every cell is used by a line.", checks: ["links"], pictures: [
        { ok: false, note: "Cells left empty", size: [2, 3], rules: [{ rule: "links", cover: true }], givens: [num(0, 0, 1), num(0, 1, 1), num(1, 0, 2), num(1, 1, 2)], lines: [[[0, 0], [0, 1]], [[1, 0], [1, 1]]] },
      ] },
    ],
    controls: "Drag from a number through the cells to its match; drag back to erase.",
    example: "numberlink/1.json",
  },
  maze: {
    name: "Number Line Maze", category: "Lines", ink: "#26398f",
    summary: "Draw the walls each number asks for, then find your way from the arrow in to the arrow out.",
    origin: "Invented by Wyatt, a young puzzle maker, who drew the first ones by hand.",
    credit: { inventor: "@wyatt / inkit", source: { label: "@wyatt", url: "https://inkit.games/wyatt" } },
    rules: [
      { text: "A number counts the walls touching it. The outside edge counts too.", checks: ["corner-count"], pictures: [
        { ok: true, note: "3 walls", size: [2, 2], givens: [door(0, 0, "top", "in"), door(1, 1, "bottom", "out"), corner(1, 2, 3)], fence: [[[0, 1], [0, 2], [1, 2], [2, 2]], [[2, 1], [2, 0], [1, 0], [0, 0]], [[1, 1], [1, 2]]] },
        { ok: false, note: "Not 2 walls", size: [2, 2], givens: [door(0, 0, "top", "in"), door(1, 1, "bottom", "out"), corner(1, 2, 2)], fence: [[[0, 1], [0, 2], [1, 2], [2, 2]], [[2, 1], [2, 0], [1, 0], [0, 0]], [[1, 1], [1, 2]]] },
      ] },
      { text: "Walls never close off a square or form a loop, so there's exactly one way between any two squares.", checks: ["perfect-maze"], pictures: [
        { ok: true, note: "One way through", size: [2, 2], givens: [door(0, 0, "top", "in"), door(1, 1, "bottom", "out")], fence: [[[0, 1], [0, 2], [1, 2], [2, 2]], [[2, 1], [2, 0], [1, 0], [0, 0]], [[1, 1], [1, 2]]] },
        { ok: false, note: "Squares shut off", size: [2, 2], givens: [door(0, 0, "top", "in"), door(1, 1, "bottom", "out")], fence: [[[0, 1], [0, 2], [1, 2], [2, 2]], [[2, 1], [2, 0], [1, 0], [0, 0]], [[1, 0], [1, 2]]] },
      ] },
      { text: "When the walls are right, walk from the arrow in to the arrow out.", checks: [], pictures: [] },
    ],
    controls: "Drag along the lines between numbers to draw walls; tap a line to cycle it. Then drag (or use the arrow keys) to walk out.",
    example: "number-line-maze/1.json",
  },
  panel: {
    name: "Panel", aka: ["Witness-style panels"], category: "Lines", ink: "#26398f",
    summary: "Draw a line from the start circle to an end; the symbols in the grid say where it may go.",
    origin: "These panels follow the rules of the line puzzles in Jonathan Blow's video game The Witness (2016).",
    credit: { inventor: "Jonathan Blow (Thekla), in the video game The Witness", year: "2016", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/The_Witness_(2016_video_game)" } },
    rules: [
      { text: "Draw one line along the grid lines, from the start circle to an end sticking out of the edge. It never touches itself and never crosses a gap.", checks: ["panel-line"], pictures: [
        { ok: true, note: "Start to end", size: [2, 2], givens: corners2, fence: STEP },
        { ok: false, note: "Doesn't reach the end", size: [2, 2], givens: corners2, fence: [[[2, 0], [1, 0], [1, 1]]] },
        { ok: false, note: "Runs into itself", size: [2, 2], givens: corners2, fence: [[[2, 0], [1, 0], [1, 1], [0, 1], [0, 0], [1, 0]]] },
        { ok: false, note: "Across a gap", size: [2, 2], givens: [...corners2, gap([0, 0], [0, 1])], fence: ROUND },
      ] },
      { text: "Dots: the line passes through every dot, on a corner or along a stretch of line.", checks: ["panel-line", "panel-symbols"], pictures: [
        { ok: true, note: "Every dot", size: [2, 2], givens: [...corners2, hexAt(1, 0), hexOn([0, 1], [0, 2])], fence: ROUND },
        { ok: false, note: "Misses a dot", size: [2, 2], givens: [...corners2, hexAt(1, 0), hexAt(1, 1)], fence: ROUND },
      ] },
      { text: "Squares: the line (with the edge) cuts the grid into regions, and squares of different colors end up in different regions.", checks: ["panel-line", "panel-symbols"], pictures: [
        { ok: true, note: "Kept apart", size: [2, 2], givens: [...corners2, square(0, 0, "black"), square(1, 1, "white")], fence: STEP },
        { ok: false, note: "Same region", size: [2, 2], givens: [...corners2, square(0, 0, "black"), square(1, 1, "white")], fence: ROUND },
      ] },
      { text: "Stars: a star's region holds exactly one other symbol of its color, of any kind. Triangles count as orange, shapes as yellow.", checks: ["panel-line", "panel-symbols"], pictures: [
        { ok: true, note: "Two pairs", size: [2, 2], givens: [...HALF, star(0, 0, "orange"), star(0, 1, "orange"), star(1, 0, "purple"), star(1, 1, "purple")], fence: ACROSS },
        { ok: true, note: "Star and triangle", size: [2, 2], givens: [...HALF, star(0, 0, "orange"), triangle(0, 1, 1)], fence: ACROSS },
        { ok: false, note: "No partner", size: [2, 2], givens: [...HALF, star(0, 0, "orange"), star(0, 1, "purple"), star(1, 0, "purple"), star(1, 1, "orange")], fence: ACROSS },
        { ok: false, note: "Three of a color", size: [2, 2], givens: [...corners2, star(0, 0, "orange"), star(0, 1, "orange"), star(1, 0, "orange")], fence: ROUND },
      ] },
      { text: "Triangles: the line runs along exactly as many of the cell's four sides as there are triangles.", checks: ["panel-line", "panel-symbols"], pictures: [
        { ok: true, note: "2 sides", size: [2, 2], givens: [...corners2, triangle(0, 0, 2)], fence: STEP },
        { ok: false, note: "Only 2 sides", size: [2, 2], givens: [...corners2, triangle(0, 0, 3)], fence: STEP },
      ] },
      { text: "Shapes: a region with shapes in it is exactly those shapes fitted together, the way round they're drawn (tilted ones may turn). The line never cuts through a shape.", checks: ["panel-line", "panel-symbols"], pictures: [
        { ok: true, note: "Fits", size: [2, 2], givens: [...HALF, shape(0, 0, [[0, 0], [0, 1]])], fence: ACROSS },
        { ok: false, note: "Wrong way round", size: [2, 2], givens: [...HALF, shape(0, 0, [[0, 0], [1, 0]])], fence: ACROSS },
        { ok: true, note: "Tilted: turned to fit", size: [2, 2], givens: [...HALF, shape(0, 0, [[0, 0], [1, 0]], { rotate: true })], fence: ACROSS },
        { ok: false, note: "The line cuts it", size: [2, 2], givens: [start(1, 1), end(0, 1), shape(1, 0, [[0, 0], [0, 1], [1, 0], [1, 1]])], fence: [[[1, 1], [0, 1]]] },
      ] },
      { text: "Hollow shapes take away: shapes may overlap, and each hollow cell cancels one layer of them.", checks: ["panel-line", "panel-symbols"], pictures: [
        { ok: true, note: "Overlap taken away", size: [2, 2], givens: [...corners2, shape(0, 1, [[0, 0], [1, 0]]), shape(1, 0, [[0, 0], [0, 1]]), shape(1, 1, [[0, 0]], { negative: true })], fence: STEP },
        { ok: false, note: "Takes away too much", size: [2, 2], givens: [...corners2, shape(0, 1, [[0, 0], [1, 0]]), shape(1, 0, [[0, 0], [0, 1]]), shape(1, 1, [[0, 0], [0, 1]], { negative: true })], fence: STEP },
      ] },
      { text: "Erasers: an eraser cancels itself and one symbol in its region that's wrong, or another eraser. An eraser with nothing to cancel is wrong itself.", checks: ["panel-line", "panel-symbols"], pictures: [
        { ok: true, note: "Cancels a square", size: [2, 2], givens: [...corners2, square(0, 0, "black"), square(1, 1, "white"), eraser(0, 1)], fence: ROUND },
        { ok: true, note: "Two cancel each other", size: [2, 2], givens: [...corners2, eraser(0, 0), eraser(1, 1)], fence: ROUND },
        { ok: false, note: "Nothing to cancel", size: [2, 2], givens: [...corners2, square(0, 0, "black"), square(1, 1, "black"), eraser(0, 1)], fence: ROUND },
      ] },
      { text: "Symmetry: two lines are drawn at once, mirror images of each other, and never touch. A blue or yellow dot is passed by the line of its color.", checks: ["panel-line", "panel-symbols"], pictures: [
        { ok: true, note: "Mirror images", size: [2, 2], rules: MIRROR, givens: TWO, fence: SIDES },
        { ok: false, note: "Not mirrored", size: [2, 2], rules: MIRROR, givens: TWO, fence: [[[2, 0], [0, 0]], [[2, 2], [1, 2], [1, 1], [0, 1], [0, 2]]] },
        { ok: false, note: "They meet", size: [2, 2], rules: MIRROR, givens: TWO, fence: [[[2, 0], [2, 1], [1, 1], [1, 0], [0, 0]], [[2, 2], [2, 1], [1, 1], [1, 2], [0, 2]]] },
        { ok: true, note: "Yellow dot, yellow line", size: [2, 2], rules: MIRROR, givens: [...TWO, hexAt(1, 2, "yellow")], fence: SIDES },
        { ok: false, note: "Wrong line", size: [2, 2], rules: MIRROR, givens: [...TWO, hexAt(1, 0, "yellow")], fence: SIDES },
      ] },
    ],
    controls: "Drag along the tracks from the start circle to draw the line; drag back to undo it. Tap a stretch of track to cycle line, ✕ and empty. With symmetry, the mirror line draws itself.",
    example: "panel/2.json",
  },

  // ---------------- shading ----------------
  nonogram: {
    name: "Nonogram", aka: ["Picture Squares", "Griddlers", "Paint by Numbers", "Picross"], category: "Shading", ink: "#a3343f",
    summary: "Shade the cells the numbers ask for to uncover a hidden picture.",
    origin: "Invented in 1987 by two puzzle makers, Non Ishida and Tetsuya Nishio, each on their own.",
    credit: { inventor: "Non Ishida and Tetsuya Nishio, each on their own", popularizer: "James Dalgety and The Sunday Telegraph", year: "1987", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Nonogram" } },
    rules: [
      { text: "Numbers beside a row (or above a column) are the lengths of its runs of shaded cells, in order, with at least one gap between runs.", checks: ["runs"], pictures: [
        { ok: true, note: "2 then 1", size: [1, 5], givens: [runs("row", 0, [2, 1])], shade: ["##.#."] },
        { ok: false, note: "Wrong order", size: [1, 5], givens: [runs("row", 0, [2, 1])], shade: ["#.##."] },
        { ok: false, note: "No gap", size: [1, 5], givens: [runs("row", 0, [2, 1])], shade: ["###.."] },
      ] },
    ],
    controls: "Tap a cell to shade it, again for ✕, again to clear. Drag to fill many. Tap a clue number to tick it off.",
    example: "picture-squares/1.json",
  },
  nurikabe: {
    name: "Nurikabe", aka: ["Islands in the Stream"], category: "Shading", ink: "#2d6a45",
    summary: "Shade a winding wall so every number sits in a white island of exactly that size.",
    origin: "A Nikoli puzzle from 1991.",
    credit: { popularizer: "Nikoli", year: "1991", source: { label: "Nikoli", url: "https://www.nikoli.co.jp/en/puzzles/nurikabe/" } },
    rules: [
      { text: "Each number sits in a white island of exactly that many cells, and each island has one number.", checks: ["size-clue", "one-each"], pictures: [
        { ok: true, note: "Island of 3", size: [2, 3], givens: [num(0, 1, 3)], shade: ["#..", "##."] },
        { ok: false, note: "Island too big", size: [2, 3], givens: [num(0, 1, 2)], shade: ["#..", "##."] },
      ] },
      { text: "All the shaded cells connect.", checks: ["connected"], pictures: [
        { ok: true, note: "One wall", size: [2, 3], shade: ["#..", "##."] },
        { ok: false, note: "Two pieces", size: [2, 3], shade: ["#.#", "..."] },
      ] },
      { text: "No 2×2 block is all shaded.", checks: ["no-pool"], pictures: [
        { ok: false, note: "A pool", size: [2, 3], shade: ["##.", "##."] },
      ] },
    ],
    controls: "Tap a cell to shade it, again for a dot (white), again to clear.",
    example: "nurikabe/1.json",
  },
  "star-battle": {
    name: "Star Battle", aka: ["Two Not Touch"], category: "Shading", ink: "#26398f",
    summary: "Place one star in every row, column and outlined area; stars never touch.",
    origin: "Invented by Hans Eendebak for the 2003 World Puzzle Championship in the Netherlands.",
    credit: { inventor: "Hans Eendebak", popularizer: "the World Puzzle Championship", year: "2003", source: { label: "WPC wiki", url: "https://wpcunofficial.miraheze.org/wiki/Star_Battle" } },
    rules: [
      { text: "Every row and every column has exactly one star.", checks: ["shaded-per-line"], pictures: [
        { ok: true, note: "One each", size: [4, 4], areas: ["aabb", "aabb", "ccdd", "ccdd"], shade: [".#..", "...#", "#...", "..#."] },
        { ok: false, note: "Two in a row", size: [4, 4], areas: ["aabb", "aabb", "ccdd", "ccdd"], shade: ["#.#.", "....", ".#..", "...#"] },
      ] },
      { text: "Every outlined area has exactly one star.", checks: ["shaded-per-area"], pictures: [
        { ok: false, note: "Two in an area", size: [4, 4], areas: ["aabb", "aabb", "ccdd", "ccdd"], shade: [".#..", "#...", "...#", "..#."] },
      ] },
      { text: "Stars never touch each other, not even at a corner.", checks: ["no-touch"], pictures: [
        { ok: false, note: "Touching corners", size: [4, 4], areas: ["aabb", "aabb", "ccdd", "ccdd"], shade: ["#...", ".#..", "....", "...."] },
      ] },
    ],
    controls: "Tap a cell for a star, again for a dot (no star), again to clear.",
    example: "star-battle/1.json",
  },
  akari: {
    name: "Akari", aka: ["Light Up"], category: "Shading", ink: "#2b2b30",
    summary: "Place light bulbs so every white cell is lit and no bulb shines on another.",
    origin: "A Nikoli puzzle from 2001.",
    credit: { popularizer: "Nikoli", year: "2001", note: "Also known as Light Up.", source: { label: "Nikoli", url: "https://www.nikoli.co.jp/en/puzzles/akari/" } },
    rules: [
      { text: "A bulb lights its row and column, up to a black cell. Every white cell must be lit.", checks: ["lit"], pictures: [
        { ok: true, note: "All lit", size: [3, 3], givens: [rock(1, 1)], shade: ["#..", "...", "..#"] },
        { ok: false, note: "Dark cells", size: [3, 3], givens: [rock(1, 1)], shade: ["#..", "...", "..."] },
      ] },
      { text: "No bulb may shine on another bulb.", checks: ["lit"], pictures: [
        { ok: false, note: "They see each other", size: [3, 3], givens: [rock(1, 1)], shade: ["#.#", "...", "..."] },
      ] },
      { text: "A number on a black cell says how many bulbs are right beside it (not diagonally).", checks: ["adjacent-count"], pictures: [
        { ok: true, note: "2 bulbs", size: [3, 3], givens: [rock(1, 1), num(1, 1, 2)], shade: [".#.", "..#", "..."] },
        { ok: false, note: "Not 1 bulb", size: [3, 3], givens: [rock(1, 1), num(1, 1, 1)], shade: [".#.", "..#", "..."] },
      ] },
      { text: "In a cipher, black cells show letters instead of numbers. Each letter stands for a number from 0 to 4: the same letter is always the same number, and different letters are different numbers. Work them out as you go.", checks: ["adjacent-count"], pictures: [
        { ok: true, note: "Both A's are 1", size: [3, 3], givens: [rock(0, 0), letter(0, 0, "A"), rock(2, 2), letter(2, 2, "A")], shade: [".#.", "..#", "..."] },
        { ok: false, note: "One A is 1, one is 0", size: [3, 3], givens: [rock(0, 0), letter(0, 0, "A"), rock(2, 2), letter(2, 2, "A")], shade: [".#.", "...", "..."] },
        { ok: false, note: "A and B both 1", size: [3, 3], givens: [rock(0, 0), letter(0, 0, "A"), rock(2, 2), letter(2, 2, "B")], shade: [".#.", "..#", "..."] },
      ] },
    ],
    controls: "Tap a white cell for a bulb, again for a dot (no bulb), again to clear. Lit cells glow.",
    example: "akari/1.json",
  },
  cave: {
    name: "Cave", aka: ["Corral", "Bag"], category: "Shading", ink: "#2b2b30",
    summary: "Shade the rock around one connected cave; each number counts the cave cells it can see.",
    origin: "Nikoli introduced it in 1996 as a loop puzzle called Bag; it became Corral in the West, and later the shading puzzle Cave.",
    credit: { popularizer: "Nikoli", year: "1996", source: { label: "WPC wiki", url: "https://wpcunofficial.miraheze.org/wiki/Cave" } },
    rules: [
      { text: "The white cells form one connected cave.", checks: ["unshaded-connected"], pictures: [
        { ok: true, note: "One cave", size: [3, 3], shade: ["#..", "...", "..#"] },
        { ok: false, note: "Cut in two", size: [3, 3], shade: ["#..", "###", "..."] },
      ] },
      { text: "Every group of shaded cells touches the edge of the grid.", checks: ["shaded-to-edge"], pictures: [
        { ok: false, note: "Rock floats inside", size: [3, 3], shade: ["...", ".#.", "..."] },
      ] },
      { text: "A number counts the white cells it can see along its row and column, itself included. Shaded cells block the view.", checks: ["sight"], pictures: [
        { ok: true, note: "Sees 4", size: [3, 3], givens: [num(0, 1, 4)], shade: ["#..", "...", "..."] },
        { ok: false, note: "Doesn't see 5", size: [3, 3], givens: [num(0, 1, 5)], shade: ["#..", "...", "..."] },
      ] },
    ],
    controls: "Tap a cell to shade it, again for a dot (cave), again to clear.",
    example: "cave/1.json",
  },
  aquarium: {
    name: "Aquarium", category: "Shading", ink: "#26398f",
    summary: "Fill the outlined tanks with water that settles level; the numbers count the water in each row and column.",
    origin: "Invented by the Japanese puzzle author Naoki Inaba in 2004, as Aqua Place.",
    credit: { inventor: "Naoki Inaba", year: "2004", source: { label: "WPC wiki", url: "https://wpcunofficial.miraheze.org/wiki/Aquarium" } },
    rules: [
      { text: "Water settles: each tank fills from the bottom up, level all the way across.", checks: ["water"], pictures: [
        { ok: true, note: "Settled", size: [3, 3], areas: ["aab", "aab", "ccb"], shade: ["...", "##.", "###"] },
        { ok: false, note: "Floating", size: [3, 3], areas: ["aab", "aab", "ccb"], shade: ["#..", "...", "..."] },
        { ok: false, note: "Not level", size: [3, 3], areas: ["aab", "aab", "ccb"], shade: ["...", "#..", "..."] },
      ] },
      { text: "A number beside a row or above a column counts its water cells.", checks: ["line-totals"], pictures: [
        { ok: true, note: "3 in the row", size: [3, 3], areas: ["aab", "aab", "ccb"], givens: [total("row", 2, 3)], shade: ["...", "##.", "###"] },
        { ok: false, note: "Not 2", size: [3, 3], areas: ["aab", "aab", "ccb"], givens: [total("row", 2, 2)], shade: ["...", "##.", "###"] },
      ] },
    ],
    controls: "Tap a cell to fill it with water, again for ✕, again to clear.",
    example: "aquarium/1.json",
  },
  hitori: {
    name: "Hitori", category: "Shading", ink: "#2b2b30",
    summary: "Shade cells so no number repeats in a row or column; shaded cells never touch, and the rest stay connected.",
    origin: "A Nikoli puzzle from 1990. Its full name, Hitori ni shitekure, means \"leave me alone\".",
    credit: { popularizer: "Nikoli", year: "1990", source: { label: "Nikoli", url: "https://www.nikoli.co.jp/en/puzzles/hitori/" } },
    rules: [
      { text: "Shade cells so no number repeats in any row or column.", checks: ["unique-unshaded"], pictures: [
        { ok: true, note: "No repeats", size: [2, 2], givens: [num(0, 0, 1), num(0, 1, 1), num(1, 0, 2), num(1, 1, 1)], shade: [".#", ".."] },
        { ok: false, note: "1 repeats", size: [2, 2], givens: [num(0, 0, 1), num(0, 1, 1), num(1, 0, 2), num(1, 1, 1)], shade: ["..", ".."] },
      ] },
      { text: "Shaded cells never share a side (corners are fine).", checks: ["no-adjacent"], pictures: [
        { ok: false, note: "Side by side", size: [2, 2], givens: [num(0, 0, 1), num(0, 1, 1), num(1, 0, 2), num(1, 1, 1)], shade: ["##", ".."] },
      ] },
      { text: "The white cells all stay connected.", checks: ["unshaded-connected"], pictures: [
        { ok: true, note: "Connected", size: [2, 2], givens: [num(0, 0, 1), num(0, 1, 1), num(1, 0, 2), num(1, 1, 1)], shade: [".#", ".."] },
        { ok: false, note: "Cut apart", size: [2, 2], givens: [num(0, 0, 1), num(0, 1, 1), num(1, 0, 2), num(1, 1, 1)], shade: [".#", "#."] },
      ] },
    ],
    controls: "Tap a number to shade it, again for a dot (keep), again to clear.",
    example: "hitori/1.json",
  },
  minesweeper: {
    name: "Minesweeper", category: "Shading", ink: "#2b2b30",
    summary: "Every number counts the mines in the eight cells around it.",
    origin: "The computer game turned into a logic puzzle: every number is shown from the start, and nothing explodes.",
    credit: { popularizer: "Microsoft's Minesweeper", year: "1990", note: "The computer game, as a pencil puzzle.", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Minesweeper_(video_game)" } },
    rules: [
      { text: "A number counts the mines in the eight cells around it, diagonals included. Numbered cells are never mines.", checks: ["mine-count"], pictures: [
        { ok: true, note: "2 around it", size: [3, 3], givens: [num(1, 1, 2)], shade: ["#..", "...", "..#"] },
        { ok: false, note: "Not 1", size: [3, 3], givens: [num(1, 1, 1)], shade: ["#..", "...", "..#"] },
      ] },
    ],
    controls: "Tap a cell to place a mine, again for a dot (safe), again to clear.",
    example: "minesweeper/1.json",
  },
  "wittgenstein-briquet": {
    name: "Wittgenstein Briquet", aka: ["Desk Place"], category: "Shading", ink: "#2b2b30",
    summary: "Place straight blocks of three; numbers count block cells beside them, and the rest stays connected.",
    origin: "It began as \"Desk Place\" at the Japan Puzzle Championship in 2007; Serkan Yürekli gave it its English name.",
    credit: { popularizer: "Serkan Yürekli, who named it", note: "It began as Desk Place at the Japan Puzzle Championship (2007).", source: { label: "Serkan Yürekli", url: "https://yureklis.wordpress.com/2012/06/03/wittgenstein-briquet/" } },
    rules: [
      { text: "Blocks are straight lines of 3 cells, across or down. Blocks may touch.", checks: ["bars"], pictures: [
        { ok: true, note: "A block of 3", size: [3, 3], shade: ["###", "...", "..."] },
        { ok: false, note: "Bent", size: [3, 3], shade: ["##.", "#..", "..."] },
      ] },
      { text: "A number counts the block cells right beside it (not diagonally).", checks: ["adjacent-count"], pictures: [
        { ok: true, note: "1 beside it", size: [3, 3], givens: [num(1, 1, 1)], shade: ["###", "...", "..."] },
        { ok: false, note: "Not 2", size: [3, 3], givens: [num(1, 1, 2)], shade: ["###", "...", "..."] },
      ] },
      { text: "All the cells without blocks stay connected.", checks: ["unshaded-connected"], pictures: [
        { ok: false, note: "Cut in two", size: [3, 3], shade: ["...", "###", "..."] },
      ] },
    ],
    controls: "Tap cells to fill in blocks, again for ✕ (empty), again to clear.",
    example: "wittgenstein-briquet/1.json",
  },

  // ---------------- regions ----------------
  shikaku: {
    name: "Shikaku", aka: ["Rectangles", "Divide by Box"], category: "Regions", ink: "#a3343f",
    summary: "Cut the grid into rectangles, each holding one number: its size.",
    origin: "A Nikoli puzzle, first published in 1989.",
    credit: { popularizer: "Nikoli", year: "1989", source: { label: "Nikoli", url: "https://www.nikoli.co.jp/en/puzzles/shikaku/" } },
    rules: [
      { text: "Cut the grid into rectangles (squares count).", checks: ["rectangles"], pictures: [
        { ok: true, note: "Rectangles", size: [2, 3], regions: ["aab", "aab"] },
        { ok: false, note: "Not a rectangle", size: [2, 3], regions: ["aab", "abb"] },
      ] },
      { text: "Each rectangle holds exactly one number, and the number is its size.", checks: ["one-each", "size-clue"], pictures: [
        { ok: true, note: "4 and 2", size: [2, 3], givens: [num(0, 0, 4), num(0, 2, 2)], regions: ["aab", "aab"] },
        { ok: false, note: "Wrong size", size: [2, 3], givens: [num(0, 0, 4), num(0, 2, 2)], regions: ["abb", "abb"] },
      ] },
    ],
    controls: "Drag along the lines between cells to cut, or pick a color and paint cells into a group.",
    example: "shikaku/1.json",
  },
  "square-jam": {
    name: "Square Jam", category: "Regions", ink: "#a3343f",
    summary: "Split the grid into squares; four never meet at a point, and a number is its square's side.",
    origin: "The American puzzle designer Eric Fox wrote its puzzles for the 2022 World Puzzle Championship.",
    credit: { popularizer: "the 2022 World Puzzle Championship", note: "Its puzzles there were by Eric Fox.", source: { label: "WPC wiki", url: "https://wpcunofficial.miraheze.org/wiki/WPC_2022/Round_16" } },
    rules: [
      { text: "Split the grid into squares.", checks: ["squares"], pictures: [
        { ok: true, note: "All squares", size: [2, 3], regions: ["aab", "aac"] },
        { ok: false, note: "Not a square", size: [2, 3], regions: ["aab", "aab"] },
      ] },
      { text: "Four squares never meet at one point.", checks: ["no-four-corners"], pictures: [
        { ok: false, note: "Four meet", size: [2, 2], regions: ["ab", "cd"] },
      ] },
      { text: "A number gives the side length of its square. Squares may have any number of numbers, or none.", checks: ["side-clue"], pictures: [
        { ok: true, note: "2 × 2", size: [2, 3], givens: [num(0, 0, 2), num(1, 2, 1)], regions: ["aab", "aac"] },
        { ok: false, note: "Not 1 × 1", size: [2, 3], givens: [num(0, 0, 1)], regions: ["aab", "aac"] },
      ] },
    ],
    controls: "Drag along the lines between cells to cut, or pick a color and paint cells into a group.",
    example: "square-jam/1.json",
  },
  "spiral-galaxies": {
    name: "Spiral Galaxies", aka: ["Tentai Show"], category: "Regions", ink: "#26398f",
    summary: "Split the grid into regions that look the same turned halfway round their circle.",
    origin: "Nikoli introduced it in 2001 as Tentai Show, a pun meaning both \"astronomy show\" and \"symmetric dots\".",
    credit: { popularizer: "Nikoli, as Tentai Show", year: "2001", source: { label: "WPC wiki", url: "https://wpcunofficial.miraheze.org/wiki/Spiral_Galaxies" } },
    rules: [
      { text: "Every region holds exactly one circle.", checks: ["galaxies"], pictures: [
        { ok: false, note: "Two circles", size: [2, 3], givens: [galaxy(2, 1), galaxy(2, 4)], regions: ["aaa", "aaa"] },
      ] },
      { text: "Each region is symmetric about its circle: turn it halfway round and it looks the same.", checks: ["galaxies"], pictures: [
        { ok: true, note: "Symmetric", size: [2, 3], givens: [galaxy(2, 1), galaxy(2, 4)], regions: ["abb", "abb"] },
        { ok: false, note: "Lopsided", size: [2, 3], givens: [galaxy(2, 1), galaxy(2, 4)], regions: ["aab", "abb"] },
      ] },
    ],
    controls: "Drag along the lines between cells to cut, or pick a color and paint cells into a group.",
    example: "spiral-galaxies/1.json",
  },
  panes: {
    name: "Panes", category: "Regions", ink: "#2b2b30",
    summary: "Cut the window into panes of stained glass that follow every rule listed with the puzzle.",
    origin: "Our own puzzle, after the region-dividing puzzles of The Artisan of Glimmith.",
    credit: { inventor: "@wyatt / inkit", note: "After the region puzzles of The Artisan of Glimmith.", source: { label: "The Artisan of Glimmith", url: "https://pixeltwelve.com/games/the-artisan-of-glimmith" } },
    rules: [
      { text: "Each puzzle lists its own rules. Size N: every pane has N cells. Dark squares are holes, in no pane; thick lines are borders drawn already.", checks: ["size"], pictures: [
        { ok: true, note: "Size 3", size: [2, 3], rules: [{ rule: "size", is: 3 }], regions: ["aab", "abb"] },
        { ok: false, note: "4 and 2", size: [2, 3], rules: [{ rule: "size", is: 3 }], regions: ["aab", "aab"] },
        { ok: true, note: "Around the holes", size: [2, 4], rules: [{ rule: "size", is: 3 }], givens: [rock(0, 0), rock(1, 3)], regions: ["#abb", "aab#"] },
      ] },
      { text: "◆: the panes on either side have the same shape (turned or flipped is fine).", checks: ["twins"], pictures: [
        { ok: true, note: "Same shape", size: [2, 3], rules: [{ rule: "twins" }], givens: [twins([0, 1], [0, 2])], regions: ["aab", "abb"] },
        { ok: false, note: "Different", size: [2, 3], rules: [{ rule: "twins" }], givens: [twins([0, 1], [0, 2])], regions: ["aab", "aab"] },
      ] },
      { text: "◇: the panes on either side have different shapes.", checks: ["opposites"], pictures: [
        { ok: true, note: "Different", size: [2, 3], rules: [{ rule: "opposites" }], givens: [opposites([0, 1], [0, 2])], regions: ["aab", "aab"] },
        { ok: false, note: "Same shape", size: [2, 3], rules: [{ rule: "opposites" }], givens: [opposites([0, 1], [0, 2])], regions: ["aab", "abb"] },
      ] },
      { text: "Compass: its numbers count the cells of its pane to the north, east, south and west.", checks: ["compass"], pictures: [
        { ok: true, note: "1 east, 1 south", size: [2, 3], rules: [{ rule: "compass" }], givens: [compass(0, 0, { e: 1, s: 1 })], regions: ["aab", "abb"] },
        { ok: false, note: "Not 2 east", size: [2, 3], rules: [{ rule: "compass" }], givens: [compass(0, 0, { e: 2 })], regions: ["aab", "abb"] },
      ] },
      { text: "Palisade: the diamond's thick sides are how many of its square's sides are borders, two at a corner or opposite (turned any way). The edge and holes count.", checks: ["cell-borders"], pictures: [
        { ok: true, note: "2 at a corner", size: [2, 3], rules: [{ rule: "cell-borders" }], givens: [palisade(0, 1, 2)], regions: ["aab", "aab"] },
        { ok: false, note: "Not opposite", size: [2, 3], rules: [{ rule: "cell-borders" }], givens: [palisade(0, 1, 2, true)], regions: ["aab", "aab"] },
        { ok: true, note: "3 sides", size: [2, 3], rules: [{ rule: "cell-borders" }], givens: [palisade(0, 1, 3)], regions: ["abc", "abc"] },
      ] },
      { text: "Mingle Shape: panes side by side never have the same shape (turned or flipped counts as the same).", checks: ["neighbors-differ"], pictures: [
        { ok: true, note: "All different", size: [2, 3], rules: [{ rule: "neighbors-differ" }], regions: ["aab", "acc"] },
        { ok: false, note: "Two dominoes side by side", size: [2, 3], rules: [{ rule: "neighbors-differ" }], regions: ["aab", "ccb"] },
      ] },
      { text: "Rose Windows: every pane holds exactly one rose of each color.", checks: ["one-of-each"], pictures: [
        { ok: true, note: "One of each", size: [2, 3], rules: [{ rule: "one-of-each" }], givens: [rose(0, 0, "red"), rose(1, 1, "blue"), rose(0, 2, "red"), rose(1, 2, "blue")], regions: ["aab", "aab"] },
        { ok: false, note: "No blue", size: [2, 3], rules: [{ rule: "one-of-each" }], givens: [rose(0, 0, "red"), rose(1, 1, "blue"), rose(0, 2, "red"), rose(1, 2, "blue")], regions: ["abb", "abb"] },
      ] },
      { text: "Solitude: every pane holds exactly one clue, of any kind.", checks: ["one-each"], pictures: [
        { ok: true, note: "One each", size: [2, 3], rules: [{ rule: "one-each", of: "any" }], givens: [num(0, 0, 3), rose(1, 2, "★")], regions: ["aab", "abb"] },
        { ok: false, note: "Two in one", size: [2, 3], rules: [{ rule: "one-each", of: "any" }], givens: [num(0, 0, 3), rose(0, 2, "★")], regions: ["aaa", "bbb"] },
      ] },
      { text: "Bricky: no point where four border lines meet. The outline and holes count.", checks: ["no-four-corners"], pictures: [
        { ok: true, note: "Three lines", size: [2, 3], rules: [{ rule: "no-four-corners", outline: true }], givens: [rock(0, 0)], regions: ["#aa", "baa"] },
        { ok: false, note: "Four at the notch", size: [2, 3], rules: [{ rule: "no-four-corners", outline: true }], givens: [rock(0, 0)], regions: ["#ab", "cbb"] },
      ] },
      { text: "Loopy: no point where exactly three border lines meet. The outline counts, so a border never ends at the edge.", checks: ["no-t-junctions"], pictures: [
        { ok: true, note: "A closed loop", size: [3, 3], rules: [{ rule: "no-t-junctions" }], regions: ["aaa", "aba", "aaa"] },
        { ok: false, note: "Ends at the edge", size: [2, 3], rules: [{ rule: "no-t-junctions" }], regions: ["aab", "aab"] },
      ] },
      { text: "Non-Boxy: no pane is a rectangle (squares and straight lines are rectangles too).", checks: ["no-rectangles"], pictures: [
        { ok: true, note: "Two Ls", size: [2, 3], rules: [{ rule: "no-rectangles" }], regions: ["aab", "abb"] },
        { ok: false, note: "A square", size: [2, 3], rules: [{ rule: "no-rectangles" }], regions: ["aab", "aab"] },
      ] },
      { text: "Match: every pane has the same shape (turned or flipped is fine).", checks: ["all-same"], pictures: [
        { ok: true, note: "Two Ls", size: [2, 3], rules: [{ rule: "all-same" }], regions: ["aab", "abb"] },
        { ok: false, note: "Different", size: [2, 3], rules: [{ rule: "all-same" }], regions: ["aab", "acb"] },
      ] },
      { text: "Size Separation: panes side by side have different sizes.", checks: ["neighbors-differ-size"], pictures: [
        { ok: true, note: "3, 1 and 2", size: [2, 3], rules: [{ rule: "neighbors-differ-size" }], regions: ["aab", "acc"] },
        { ok: false, note: "Two 2s side by side", size: [2, 3], rules: [{ rule: "neighbors-differ-size" }], regions: ["aab", "ccb"] },
      ] },
      { text: "Shape Bank: every pane is one of the shapes under the board, turned or flipped any way.", checks: ["shape-bank"], pictures: [
        { ok: true, note: "Two Ls", size: [2, 3], rules: [{ rule: "shape-bank" }], givens: [bank(...ELL)], regions: ["aab", "abb"] },
        { ok: false, note: "Not in the bank", size: [2, 3], rules: [{ rule: "shape-bank" }], givens: [bank(...ELL)], regions: ["aab", "aab"] },
      ] },
      { text: "Polyomino: a shape in a square is the shape of its pane (turned or flipped is fine).", checks: ["region-shape"], pictures: [
        { ok: true, note: "An L", size: [2, 3], rules: [{ rule: "region-shape" }], givens: [shape(0, 0, ELL)], regions: ["aab", "abb"] },
        { ok: false, note: "A square", size: [2, 3], rules: [{ rule: "region-shape" }], givens: [shape(0, 0, ELL)], regions: ["aab", "aab"] },
      ] },
      { text: "Inequality: the sign on a border points to the smaller pane.", checks: ["size-compare"], pictures: [
        { ok: true, note: "Points to the 2", size: [2, 3], rules: [{ rule: "size-compare" }], givens: [less([0, 2], [0, 1])], regions: ["aab", "aab"] },
        { ok: false, note: "Points to the 4", size: [2, 3], rules: [{ rule: "size-compare" }], givens: [less([0, 2], [0, 1])], regions: ["abb", "abb"] },
      ] },
      { text: "Difference: a number on a border is how much bigger one pane is than the other.", checks: ["size-difference"], pictures: [
        { ok: true, note: "4 and 2", size: [2, 3], rules: [{ rule: "size-difference" }], givens: [differ([0, 1], [0, 2], 2)], regions: ["aab", "aab"] },
        { ok: false, note: "3 and 3", size: [2, 3], rules: [{ rule: "size-difference" }], givens: [differ([0, 1], [0, 2], 2)], regions: ["aab", "abb"] },
      ] },
      { text: "Watchtower: a number on a corner counts the panes that meet there.", checks: ["regions-at-corner"], pictures: [
        { ok: true, note: "3 meet", size: [2, 3], rules: [{ rule: "regions-at-corner" }], givens: [tower(1, 1, 3)], regions: ["abb", "acc"] },
        { ok: false, note: "Only 2", size: [2, 3], rules: [{ rule: "regions-at-corner" }], givens: [tower(1, 1, 3)], regions: ["abb", "aab"] },
      ] },
    ],
    controls: "Drag along the lines between cells to cut the glass, or pick a color and paint cells into a pane.",
    example: "panes/1.json",
  },

  // ---------------- numbers ----------------
  sudoku: {
    name: "Sudoku", category: "Numbers", ink: "#2b2b30",
    summary: "Fill the grid so every row, column and box has each digit once.",
    origin: "Howard Garns created it for Dell in 1979 as Number Place; Nikoli named it Sudoku in 1984.",
    credit: { inventor: "Howard Garns, for Dell, as Number Place", popularizer: "Nikoli, which named it Sudoku, and Wayne Gould", year: "1979", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Sudoku" } },
    rules: [
      { text: "Every row and every column has each digit once.", checks: ["latin"], pictures: [
        { ok: true, note: "No repeats", size: [4, 4], digits: ["1234", "3412", "2143", "4321"] },
        { ok: false, note: "Column repeats", size: [4, 4], digits: ["1234", "1234", "3412", "4321"] },
      ] },
      { text: "Every box (heavy lines) has each digit once.", checks: ["boxes"], pictures: [
        { ok: false, note: "Box repeats", size: [4, 4], digits: ["1234", "2341", "3412", "4123"] },
      ] },
    ],
    controls: "Tap a cell, then a number (or type it). Pencil adds small notes.",
    example: "sudoku/1.json",
  },
  "irregular-sudoku": {
    name: "Irregular Sudoku", aka: ["Jigsaw Sudoku"], category: "Numbers", ink: "#2b2b30",
    summary: "A sudoku whose boxes are odd shapes: every row, column and outlined area has each digit once.",
    origin: "A Sudoku variant whose boxes are irregular shapes.",
    credit: { note: "A Sudoku variant; its inventor isn't known.", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Sudoku" } },
    rules: [
      { text: "Every row and every column has each digit once.", checks: ["latin"], pictures: [
        { ok: true, note: "No repeats", size: [4, 4], areas: ["aabb", "aabb", "ccdd", "ccdd"], digits: ["1234", "3412", "2143", "4321"] },
      ] },
      { text: "Every outlined area has each digit once.", checks: ["boxes"], pictures: [
        { ok: true, note: "Each area 1–4", size: [4, 4], areas: ["aaab", "ccab", "ccdb", "dddb"], digits: ["1234", "2341", "4123", "3412"] },
        { ok: false, note: "Area repeats", size: [4, 4], areas: ["aaab", "ccab", "ccdb", "dddb"], digits: ["1234", "3412", "2143", "4321"] },
      ] },
    ],
    controls: "Tap a cell, then a number (or type it). Pencil adds small notes.",
    example: "irregular-sudoku/1.json",
  },
  "thermo-sudoku": {
    name: "Thermo Sudoku", category: "Numbers", ink: "#a3343f",
    summary: "A sudoku whose digits rise along each thermometer, from the bulb to the tip.",
    origin: "A Sudoku variant with thermometers.",
    credit: { inventor: "Thomas Snyder", popularizer: "GMPuzzles", source: { label: "GMPuzzles", url: "https://www.gmpuzzles.com/blog/sudoku-rules-and-info/thermo-sudoku-rules-and-info/" } },
    rules: [
      { text: "It's a sudoku: every row, column and box has each digit once.", checks: ["latin", "boxes"], pictures: [
        { ok: true, note: "A sudoku", size: [4, 4], digits: ["1234", "3412", "2143", "4321"] },
      ] },
      { text: "Along a thermometer, digits rise from the bulb to the tip (gaps are fine).", checks: ["thermo"], pictures: [
        { ok: true, note: "1, 2, 3", size: [4, 4], givens: [thermo([0, 0], [0, 1], [0, 2])], digits: ["1234", "3412", "2143", "4321"] },
        { ok: false, note: "Falls", size: [4, 4], givens: [thermo([0, 2], [0, 1], [0, 0])], digits: ["1234", "3412", "2143", "4321"] },
      ] },
    ],
    controls: "Tap a cell, then a number (or type it). Pencil adds small notes.",
    example: "thermo-sudoku/1.json",
  },
  skyscrapers: {
    name: "Skyscrapers", aka: ["Towers"], category: "Numbers", ink: "#26398f",
    summary: "Fill in building heights; the numbers outside count the buildings you can see.",
    origin: "Invented by Masanori Natsuhara in 1992.",
    credit: { inventor: "Masanori Natsuhara", year: "1992", source: { label: "WPC wiki", url: "https://wpcunofficial.miraheze.org/wiki/Skyscrapers" } },
    rules: [
      { text: "Every row and every column has each height once.", checks: ["latin"], pictures: [
        { ok: true, note: "No repeats", size: [3, 3], digits: ["123", "312", "231"] },
        { ok: false, note: "Row repeats", size: [3, 3], digits: ["113", "321", "232"] },
      ] },
      { text: "A number outside counts the buildings you'd see looking in from there: taller ones hide shorter ones behind them.", checks: ["skyscrapers"], pictures: [
        { ok: true, note: "See 2 each way", size: [1, 4], givens: [outside(0, 0, "left", "skyscraper", 2), outside(0, 3, "right", "skyscraper", 2)], digits: ["2143"] },
        { ok: false, note: "Only 2 seen", size: [1, 4], givens: [outside(0, 0, "left", "skyscraper", 3)], digits: ["2143"] },
      ] },
    ],
    controls: "Tap a cell, then a number (or type it). Pencil adds small notes.",
    example: "skyscrapers/1.json",
  },
  "easy-as-abc": {
    name: "Easy as ABC", aka: ["Letterraam", "End View"], category: "Numbers", ink: "#2d6a45",
    summary: "Put each letter once in every row and column; letters outside are the first one seen.",
    origin: "Known in Dutch as Letterraam, \"letter frame\".",
    credit: { note: "Its inventor isn't known; puzzle championships made it popular.", source: { label: "WPC wiki", url: "https://wpcunofficial.miraheze.org/wiki/ABCtje" } },
    rules: [
      { text: "Every row and column has A, B and C exactly once; the other cells stay empty.", checks: ["letters"], pictures: [
        { ok: true, note: "One of each", size: [4, 4], digits: ["ABC.", "C.AB", "BA.C", ".CBA"] },
        { ok: false, note: "B twice", size: [4, 4], digits: ["ABCB", "C.A.", "BA.C", ".CBA"] },
      ] },
      { text: "A letter outside is the first one you meet looking in from that side.", checks: ["first-seen"], pictures: [
        { ok: true, note: "B comes first", size: [1, 4], givens: [outside(0, 0, "left", "first", 2)], digits: [".BAC"] },
        { ok: false, note: "A isn't first", size: [1, 4], givens: [outside(0, 0, "left", "first", 1)], digits: [".BAC"] },
      ] },
    ],
    controls: "Tap a cell, then a letter (or type it). Erase leaves a cell empty.",
    example: "easy-as-abc/1.json",
  },

  hidoku: {
    name: "Hidoku", aka: ["Number Snake"], category: "Numbers", ink: "#26398f",
    summary: "Fill in the numbers 1 to the last so each one touches the next, making one snake through the grid.",
    origin: "Invented by Gyora Benedek and sold as Hidato, a trademarked name; Hidoku and Number Snake are the names puzzle sites use. The sides-only kind is often called Numbrix.",
    credit: { inventor: "Gyora Benedek", note: "He named it Hidato, a registered trademark, so we use the generic name.", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Hidato" } },
    rules: [
      { text: "Fill every white cell with the numbers 1 to the last one, each once.", checks: ["number-path"], pictures: [
        { ok: true, note: "1 to 6, once each", size: [2, 3], digits: ["135", "246"] },
        { ok: false, note: "4 twice, no 6", size: [2, 3], digits: ["135", "244"] },
      ] },
      { text: "Each number touches the next one, at a side or a corner.", checks: ["number-path"], pictures: [
        { ok: true, note: "Corners count", size: [2, 3], digits: ["135", "246"] },
        { ok: false, note: "5 and 6 apart", size: [2, 3], digits: ["123", "645"] },
      ] },
      { text: "Dark cells are rocks: the snake goes around them.", checks: ["number-path"], pictures: [
        { ok: true, note: "Around the rock", size: [2, 3], givens: [rock(0, 2)], digits: ["12.", "543"] },
      ] },
      { text: "When a puzzle says \"sides only\", a corner isn't enough.", checks: ["number-path"], pictures: [
        { ok: true, note: "Side to side", size: [2, 3], rules: [{ rule: "number-path" }], digits: ["123", "654"] },
        { ok: false, note: "2 to 3 at a corner", size: [2, 3], rules: [{ rule: "number-path" }], digits: ["135", "246"] },
      ] },
    ],
    controls: "Tap a cell, then type its number (1 then 2 makes 12), on the keys under the board or the keyboard. Backspace erases.",
    example: "hidoku/1.json",
  },
  "honeycomb-paths": {
    name: "Honeycomb Paths", aka: ["Honeycombs"], category: "Numbers", ink: "#7a4a12",
    summary: "Fill a honeycomb with the numbers 1 to the last so each one touches the next.",
    origin: "Hidoku on hexagons, as Beast Academy draws it. A hexagon touches six others, always along a side, so there are no corner steps to worry about.",
    credit: { popularizer: "Beast Academy (Art of Problem Solving)", note: "Gyora Benedek's Hidato, on hexagons.", source: { label: "Beast Academy Puzzles 2", url: "https://beastacademy.com/books/puzzles2" } },
    rules: [
      { text: "Fill every hexagon with the numbers 1 to the last one, each once.", checks: ["number-path"], pictures: [
        { ok: true, note: "1 to 6, once each", size: [2, 3], digits: ["123", "654"] },
        { ok: false, note: "4 twice, no 6", size: [2, 3], digits: ["123", "445"] },
      ] },
      { text: "Each number touches the next one: the numbers make one snake through the honeycomb.", checks: ["number-path"], pictures: [
        { ok: true, note: "A snake", size: [2, 3], digits: ["123", "654"] },
        { ok: false, note: "3 and 4 apart", size: [2, 3], digits: ["123", "456"] },
      ] },
    ],
    controls: "Tap a hexagon, then type its number (1 then 2 makes 12), on the keys under the board or the keyboard. Backspace erases.",
    example: "honeycomb-paths/1.json",
  },
  hive: {
    name: "Hive", category: "Numbers", ink: "#7a4a12",
    summary: "Each hexagon holds the smallest number that none of its neighbours has.",
    origin: "A honeycomb puzzle from Beast Academy's maths books for kids. Each number is the \"mex\" (minimum excluded value) of its neighbours, the rule behind Sprague and Grundy's numbers for games, from the 1930s.",
    credit: { popularizer: "Beast Academy (Art of Problem Solving)", source: { label: "Beast Academy Puzzles 4", url: "https://beastacademy.com/books/puzzles4" } },
    rules: [
      { text: "Hexagons that touch never hold the same number.", checks: ["smallest-missing"], pictures: [
        { ok: true, note: "No two the same", size: [2, 3], digits: ["143", "212"] },
        { ok: false, note: "Two 1s touch", size: [2, 3], digits: ["143", "211"] },
      ] },
      { text: "Each hexagon's number is the smallest one its neighbours don't have: a hexagon next to 1, 2 and 3 (and no 4) is 4.", checks: ["smallest-missing"], pictures: [
        { ok: true, note: "Next to 1, 2, 3: 4", size: [2, 3], digits: ["143", "212"] },
        { ok: false, note: "Should be 4, not 5", size: [2, 3], digits: ["153", "212"] },
      ] },
    ],
    controls: "Tap a hexagon, then a number (or type it). Pencil notes keep track of what's possible.",
    example: "hive/1.json",
  },
  "pythagorean-paths": {
    name: "Pythagorean Paths", category: "Lines", ink: "#2d6a45",
    summary: "Join the dots with one path of straight segments whose lengths are the ones listed.",
    origin: "A geoboard puzzle from Beast Academy's maths books for kids. The lengths come from Pythagoras: a segment 1 across and 2 down is √(1² + 2²) = √5 long.",
    credit: { popularizer: "Beast Academy (Art of Problem Solving)", source: { label: "Beast Academy Puzzles 5", url: "https://beastacademy.com/books/puzzles5" } },
    rules: [
      { text: "Join all the dots into one path of straight segments, each from a dot to a dot.", checks: ["distance-path"], pictures: [
        { ok: true, note: "Every dot", size: [3, 3], givens: [peg(0, 0), peg(0, 2), peg(2, 1), lengths(4, 5)], lines: [[[0, 0], [0, 2], [2, 1]]] },
        { ok: false, note: "A dot left out", size: [3, 3], givens: [peg(0, 0), peg(0, 2), peg(2, 1), lengths(4, 5)], lines: [[[0, 0], [0, 2]]] },
      ] },
      { text: "The segments are the listed lengths, each used once, in any order. √5 means 1 square one way and 2 the other.", checks: ["distance-path"], pictures: [
        { ok: true, note: "2 and √5", size: [3, 3], givens: [peg(0, 0), peg(0, 2), peg(2, 1), lengths(4, 5)], lines: [[[0, 0], [0, 2], [2, 1]]] },
        { ok: false, note: "√5 twice, no 2", size: [3, 3], givens: [peg(0, 0), peg(0, 2), peg(2, 1), lengths(4, 5)], lines: [[[0, 0], [2, 1], [0, 2]]] },
      ] },
      { text: "The path never crosses itself.", checks: ["distance-path"], pictures: [
        { ok: true, note: "Around the edge", size: [3, 3], givens: [...FOUR, lengths(4, 4, 4)], lines: [[[0, 0], [0, 2], [2, 2], [2, 0]]] },
        { ok: false, note: "Crosses", size: [3, 3], givens: [...FOUR, lengths(4, 8, 8)], lines: [[[0, 0], [2, 2], [0, 2], [2, 0]]] },
      ] },
      { text: "Some puzzles say how segments may run: like a chess queen (straight or diagonal) or a knight (one jump of 1 and 2).", checks: ["distance-path"], pictures: [
        { ok: true, note: "Queen: diagonal", size: [3, 3], rules: [{ rule: "distance-path", moves: "queen" }], givens: [peg(0, 0), peg(2, 2), peg(2, 0), lengths(4, 8)], lines: [[[0, 0], [2, 2], [2, 0]]] },
        { ok: false, note: "Queen: not √5", size: [3, 3], rules: [{ rule: "distance-path", moves: "queen" }], givens: [peg(0, 0), peg(0, 2), peg(2, 1), lengths(4, 5)], lines: [[[0, 0], [0, 2], [2, 1]]] },
      ] },
    ],
    controls: "Drag from dot to dot to draw a segment; drag back over it, or tap it, to take it away. The lengths cross themselves off as you use them.",
    example: "pythagorean-paths/1.json",
  },

  // ---------------- paint ----------------
  coats: {
    name: "RYB", aka: ["Three Coats"], category: "Paint", ink: "#2b2b30",
    summary: "Paint every shape red, yellow or blue so each dot sees its color next door.",
    origin: "FLEB's logic puzzle game RYB (2016): colour shapes from clues, a little like a mix of Sudoku and Minesweeper. Wyatt's puzzles of this kind were first called Three Coats.",
    credit: { inventor: "FLEB, in the game RYB", year: "2016", source: { label: "RYB", url: "https://rawg.io/games/ryb" } },
    rules: [
      { text: "Paint every piece red, yellow or blue.", checks: ["painted"], pictures: [] },
      { text: "A dot asks for a neighbour of its color: two red dots need at least two red neighbours. Neighbours share an edge, not just a corner.", checks: ["neighbor-dots"], pictures: [
        { ok: true, note: "Red and blue beside", size: [1, 3], figure: squares(3), givens: [dots(1, [1, 3])], paint: [1, 2, 3] },
        { ok: false, note: "No blue beside", size: [1, 3], figure: squares(3), givens: [dots(1, [1, 3])], paint: [1, 2, 1] },
      ] },
      { text: "A wrong color is turned away and costs a heart. Right colors lock in.", checks: [], pictures: [] },
    ],
    controls: "Pick a pot (or press R, Y or B), then tap a piece.",
    example: "three-coats/2.json",
  },
  "binary-puzzle": {
    name: "Binary Puzzle", category: "Paint", ink: "#2b2b30",
    summary: "Paint every cell red or blue: half of each in every row and column, never three alike in a row, and no two lines the same.",
    origin: "Peter De Schepper and Frank Coussement published it in Belgium in 2009 as Binairo; it's also sold as Takuzu. Both names are trademarks, so we use the generic one. It's often written with 0s and 1s.",
    credit: { inventor: "Peter De Schepper and Frank Coussement", year: "2009", note: "They named it Binairo; Binairo and Takuzu are trademarks, so we use the generic name.", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Takuzu" } },
    rules: [
      { text: "Every row and every column is half red and half blue.", checks: ["line-shares"], pictures: [
        { ok: true, note: "Two of each", size: [2, 4], paint: [1, 2, 1, 2, 2, 1, 2, 1] },
        { ok: false, note: "Three red, one blue", size: [2, 4], paint: [1, 1, 2, 1, 2, 2, 1, 2] },
      ] },
      { text: "No three cells in a row, across or down, are the same color.", checks: ["no-three-in-a-row"], pictures: [
        { ok: true, note: "Never three", size: [2, 4], paint: [1, 1, 2, 2, 2, 2, 1, 1] },
        { ok: false, note: "Three blue", size: [2, 4], paint: [1, 2, 2, 2, 2, 1, 1, 1] },
      ] },
      { text: "No two rows are painted the same, and no two columns are.", checks: ["unique-lines"], pictures: [
        { ok: true, note: "All different", size: [2, 4], paint: [1, 1, 2, 2, 1, 2, 1, 2] },
        { ok: false, note: "Two rows alike", size: [2, 4], paint: [1, 2, 1, 2, 1, 2, 1, 2] },
      ] },
    ],
    controls: "Pick a pot (or press 1 or 2), then tap or drag across cells to paint them. The same color again clears a cell.",
    example: "binary-puzzle/2.json",
  },
  "abstract-art": {
    name: "Abstract Art", category: "Paint", ink: "#26398f",
    summary: "Paint every cell so each row and column has its share of each color: half and half, a third of each, or whatever the puzzle asks.",
    origin: "A paint-by-shares puzzle from Beast Academy's maths books for kids; the Binary Puzzle is its best-known two-color cousin.",
    credit: { popularizer: "Beast Academy (Art of Problem Solving)", source: { label: "Beast Academy Puzzles 3", url: "https://beastacademy.com/books/puzzles3" } },
    rules: [
      { text: "Paint every cell. Every row and every column has the share of each color the puzzle asks for, like half blue and half yellow.", checks: ["line-shares"], pictures: [
        { ok: true, note: "Half and half", size: [2, 4], paint: [1, 2, 2, 1, 2, 1, 1, 2] },
        { ok: false, note: "Too much yellow", size: [2, 4], paint: [2, 2, 1, 2, 1, 1, 2, 1] },
      ] },
      { text: "Shares can be thirds too: a third of each of three colors, or a third blue and two thirds yellow.", checks: ["line-shares"], pictures: [
        { ok: true, note: "A third each", size: [3, 3], rules: [{ rule: "line-shares", parts: [1, 1, 1] }], style: { palette: ["#3fb0e6", "#f7cf3d", "#ef5a6a"] }, paint: [1, 2, 3, 2, 3, 1, 3, 1, 2] },
        { ok: false, note: "No yellow in row 2", size: [3, 3], rules: [{ rule: "line-shares", parts: [1, 1, 1] }], style: { palette: ["#3fb0e6", "#f7cf3d", "#ef5a6a"] }, paint: [1, 2, 3, 3, 3, 1, 2, 1, 2] },
        { ok: true, note: "⅓ blue, ⅔ yellow", size: [3, 3], rules: [{ rule: "line-shares", parts: [1, 2] }], paint: [1, 2, 2, 2, 1, 2, 2, 2, 1] },
      ] },
      { text: "Some puzzles add the Binary Puzzle's rules: no three in a row of one color, or no two rows (or columns) alike. The rules under the puzzle say which.", checks: ["no-three-in-a-row"], pictures: [
        { ok: false, note: "Three blue in a row", size: [2, 4], rules: [{ rule: "no-three-in-a-row" }], paint: [1, 1, 1, 2, 2, 2, 2, 1] },
      ] },
    ],
    controls: "Pick a pot (or press 1, 2 or 3), then tap or drag across cells to paint them. The same color again clears a cell.",
    example: "abstract-art/2.json",
  },
  "fill-in": {
    name: "Number Fill-In", aka: ["Fill-In", "Numbercross"], category: "Numbers", ink: "#2b2b30",
    summary: "Fit every number on the list into the grid, across or down, like a crossword made of numbers.",
    origin: "A puzzle-magazine favourite: fill-ins come with words or numbers, and the number kind is usually called Number Fill-In.",
    credit: { note: "A traditional puzzle-magazine type with no known inventor; Beast Academy calls it Numbercross.", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Fill-In_(puzzle)" } },
    rules: [
      { text: "Every number on the list goes into the grid once, reading across (left to right) or down (top to bottom).", checks: ["fill-in"], pictures: [
        { ok: true, note: "12, 34 across; 13, 24 down", size: [2, 2], entries: ["12", "13", "24", "34"], digits: ["12", "34"] },
        { ok: false, note: "21 isn't on the list", size: [2, 2], entries: ["12", "13", "24", "34"], digits: ["21", "34"] },
      ] },
      { text: "A number fills a whole run of white squares, from the edge or a black square to the next. Black squares stay empty.", checks: ["fill-in"], pictures: [
        { ok: true, note: "Every run filled", size: [2, 3], givens: [rock(0, 2)], entries: ["12", "13", "24", "345"], digits: ["12.", "345"] },
        { ok: false, note: "123 doesn't fit", size: [2, 3], givens: [rock(0, 2)], entries: ["123", "13", "24", "345"], digits: ["12.", "345"] },
      ] },
    ],
    controls: "Tap a square, then a digit (or type it). Numbers on the list cross themselves off once they're in the grid.",
    example: "fill-in/1.json",
  },

  // ---------------- regions and pieces, after Beast Academy's Puzzle Lab ----------------
  fillomino: {
    name: "Fillomino", category: "Regions", ink: "#26398f",
    summary: "Split the grid into regions: a number is its region's size, and regions of the same size never share a side.",
    origin: "A Nikoli puzzle, first published in 1994.",
    credit: { popularizer: "Nikoli", year: "1994", source: { label: "Nikoli", url: "https://www.nikoli.co.jp/en/puzzles/fillomino/" } },
    rules: [
      { text: "Split the grid into regions. A number tells how many cells its region has. A region can hold several numbers (all the same), or none.", checks: ["size-clue"], pictures: [
        { ok: true, note: "3, 2 and 1", size: [2, 3], givens: [num(0, 0, 3), num(1, 2, 2)], regions: ["aab", "acb"] },
        { ok: false, note: "The 3 has 4 cells", size: [2, 3], givens: [num(0, 0, 3), num(1, 2, 2)], regions: ["aab", "aab"] },
      ] },
      { text: "Two regions of the same size never share a side (touching at a corner is fine).", checks: ["neighbors-differ-size"], pictures: [
        { ok: true, note: "All different", size: [2, 3], regions: ["aab", "acb"] },
        { ok: false, note: "Two 2s side by side", size: [2, 3], regions: ["aab", "ccb"] },
      ] },
      { text: "Some puzzles allow only a few sizes, written with the puzzle (here only 1s and 3s).", checks: ["allowed-sizes"], pictures: [
        { ok: true, note: "Two 3s", size: [2, 3], rules: [{ rule: "allowed-sizes", sizes: [1, 3] }], regions: ["aab", "abb"] },
        { ok: false, note: "A 2", size: [2, 3], rules: [{ rule: "allowed-sizes", sizes: [1, 3] }], regions: ["aab", "acb"] },
      ] },
    ],
    controls: "Drag along the lines between cells to cut, or pick a color and paint cells into a group.",
    example: "fillomino/1.json",
  },
  "sum-blobs": {
    name: "Sum Blobs", category: "Regions", ink: "#2f6b3a",
    summary: "Every square has a number: split the grid into regions whose numbers each add up to the target.",
    origin: "Beast Academy's puzzle, from its maths books for kids: dividing a grid of numbers into groups with the same total.",
    credit: { popularizer: "Beast Academy (Art of Problem Solving)", source: { label: "Beast Academy Puzzles 2", url: "https://beastacademy.com/books/puzzles2" } },
    rules: [
      { text: "Split the grid into regions of squares joined side by side. The numbers in every region add up to the target written with the puzzle (here 6).", checks: ["region-sum"], pictures: [
        { ok: true, note: "6, 6 and 6", size: [2, 3], rules: [{ rule: "region-sum", is: 6 }], givens: [num(0, 0, 1), num(0, 1, 5), num(0, 2, 3), num(1, 0, 2), num(1, 1, 4), num(1, 2, 3)], regions: ["aab", "ccb"] },
        { ok: false, note: "7 and 5", size: [2, 3], rules: [{ rule: "region-sum", is: 6 }], givens: [num(0, 0, 1), num(0, 1, 5), num(0, 2, 3), num(1, 0, 2), num(1, 1, 4), num(1, 2, 3)], regions: ["abb", "aab"] },
      ] },
    ],
    controls: "Drag along the lines between cells to cut, or pick a color and paint cells into a group.",
    example: "sum-blobs/1.json",
  },
  "polyomino-packing": {
    name: "Polyomino Packing", aka: ["Polyominoes", "Polyomino Tiling", "Pentomino puzzle"], category: "Regions", ink: "#5b3a8f",
    summary: "Cut the board into the pieces under it, using each piece exactly once.",
    origin: "Fitting polyominoes into a shape is a classic: Solomon Golomb named polyominoes in 1953, and pentomino puzzles go back to Henry Dudeney's in 1907.",
    credit: { inventor: "Solomon Golomb, who named polyominoes", popularizer: "Martin Gardner", year: "1953", note: "Beast Academy calls its version Polyominoes.", source: { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Polyomino" } },
    rules: [
      { text: "Cut the board into the pieces under it, each used exactly once. Pieces may be turned or flipped. Dark squares aren't part of the board.", checks: ["shape-bank"], pictures: [
        { ok: true, note: "An L and a domino", size: [2, 3], givens: [rock(1, 2), bank(...ELL), bank([0, 0], [0, 1])], regions: ["abb", "aa#"] },
        { ok: false, note: "A square isn't a piece", size: [2, 3], givens: [rock(1, 2), bank(...ELL), bank([0, 0], [0, 1])], regions: ["aab", "aa#"] },
      ] },
    ],
    controls: "Drag along the lines between cells to cut, or pick a color and paint cells into a piece.",
    example: "polyomino-packing/1.json",
  },
  "connect-the-critters": {
    name: "Connect the Critters", category: "Shading", ink: "#7a4a1f",
    summary: "Place the pieces so they cover every critter and join up into one group.",
    origin: "A placement puzzle from Beast Academy's maths books for kids and its online Puzzle Lab.",
    credit: { popularizer: "Beast Academy (Art of Problem Solving)", source: { label: "Beast Academy Puzzles 3", url: "https://beastacademy.com/books/puzzles3" } },
    rules: [
      { text: "Shade squares to place every piece under the board exactly once. Pieces can be turned but not flipped (unless the puzzle says so), and never overlap.", checks: ["pieces"], pictures: [
        { ok: true, note: "Turned is fine", size: [3, 2], givens: [bank([0, 1], [0, 2], [1, 0], [1, 1])], shade: ["#.", "##", ".#"] },
        { ok: false, note: "Flipped", size: [2, 3], givens: [bank([0, 1], [0, 2], [1, 0], [1, 1])], shade: ["##.", ".##"] },
        { ok: false, note: "An extra square", size: [2, 3], givens: [bank(...ELL)], shade: ["###", "#.."] },
      ] },
      { text: "Every critter (✦) is covered by a piece.", checks: ["cover-symbols"], pictures: [
        { ok: true, note: "Both covered", size: [1, 3], givens: [critter(0, 0), critter(0, 2)], shade: ["###"] },
        { ok: false, note: "One left out", size: [1, 3], givens: [critter(0, 0), critter(0, 2)], shade: ["##."] },
      ] },
      { text: "All the pieces join into one group, side by side.", checks: ["connected"], pictures: [
        { ok: true, note: "One group", size: [2, 3], shade: ["###", "#.#"] },
        { ok: false, note: "Two groups", size: [2, 3], shade: ["#.#", "#.#"] },
      ] },
    ],
    controls: "Tap a cell to shade it, again for a dot (empty), again to clear.",
    example: "connect-the-critters/1.json",
  },
  "find-the-cut-line": {
    name: "Find the Cut Line", category: "Regions", ink: "#a3343f",
    summary: "Cut the shape into two pieces (or three), each of them symmetric.",
    origin: "A cutting puzzle from Beast Academy's online Puzzle Lab.",
    credit: { popularizer: "Beast Academy (Art of Problem Solving)", source: { label: "Beast Academy Online", url: "https://beastacademy.com/online" } },
    rules: [
      { text: "Cut the shape along the grid lines into two pieces (or as many as the puzzle says). Dark squares aren't part of it.", checks: ["region-count"], pictures: [
        { ok: true, note: "Two pieces", size: [2, 3], regions: ["aab", "abb"] },
        { ok: false, note: "Three pieces", size: [2, 3], regions: ["abc", "abc"] },
      ] },
      { text: "Every piece is symmetric: it matches its mirror image (folded across, down or corner to corner), or it looks the same turned halfway round. A puzzle may ask for just mirrors or just turns.", checks: ["symmetric-regions"], pictures: [
        { ok: true, note: "Two mirror Ls", size: [2, 3], regions: ["aab", "abb"] },
        { ok: true, note: "Same turned round", size: [2, 3], givens: [rock(0, 0), rock(1, 2)], regions: ["#aa", "aa#"] },
        { ok: false, note: "Lopsided", size: [2, 3], regions: ["aab", "bbb"] },
      ] },
    ],
    controls: "Drag along the lines between cells to cut, or pick a color and paint cells into a piece.",
    example: "find-the-cut-line/1.json",
  },
  "twins-and-triplets": {
    name: "Twins and Triplets", category: "Numbers", ink: "#2b2b30",
    summary: "Place every tile so that tiles side by side share a colour or a shape.",
    origin: "A tile-placing puzzle from Beast Academy's online Puzzle Lab.",
    credit: { popularizer: "Beast Academy (Art of Problem Solving)", source: { label: "Beast Academy Online", url: "https://beastacademy.com/online" } },
    rules: [
      { text: "There's one tile of every shape in every colour. Place each tile once, one in every open square; some are placed already.", checks: ["tiles"], pictures: [
        { ok: true, note: "All six", size: [1, 6], digits: ["124365"] },
        { ok: false, note: "A tile twice", size: [1, 6], digits: ["114365"] },
      ] },
      { text: "Tiles side by side share a colour or a shape (or both).", checks: ["shared-feature"], pictures: [
        { ok: true, note: "Red, then crests", size: [1, 3], digits: ["124"] },
        { ok: false, note: "Nothing shared", size: [1, 2], digits: ["14"] },
      ] },
    ],
    controls: "Tap a square, then a tile on the pad. Erase takes a tile back.",
    example: "twins-and-triplets/1.json",
  },
};
