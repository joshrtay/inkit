// The puzzle guides: one per genre, typed against the engine's genre list, so a new genre needs a
// guide before the build passes. Every picture is checked against the engine's own rules by
// `node puzzles/grid/guides.ts` (a ✓ picture must pass its rule, a ✗ picture must break it), which
// also solves each worked example into examples.json.
import type { GenreName } from "../engine/puzzle.ts";
import type { Given, Side } from "../engine/types.ts";
import type { Category, Guide } from "./types.ts";

type RC = [number, number];
const num = (r: number, c: number, value: number): Given => ({ at: "cell", cell: [r, c], kind: "number", value });
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
const compass = (r: number, c: number, value: { n?: number; e?: number; s?: number; w?: number }): Given => ({ at: "cell", cell: [r, c], kind: "compass", value });
const squares = (n: number) => ({ pieces: Array.from({ length: n }, (_, i) => [[i * 10, 0], [i * 10 + 10, 0], [i * 10 + 10, 10], [i * 10, 10]]) });

export const CATEGORIES: Category[] = ["Lines", "Shading", "Regions", "Numbers", "Paint"];

export const guides: Record<GenreName, Guide> = {
  // ---------------- lines ----------------
  "simple-loop": {
    name: "Simple Loop", aka: ["Round the Bend"], category: "Lines", ink: "#2d6a45",
    summary: "Draw one loop that winds through every white cell.",
    origin: "A classic loop-drawing puzzle. Wyatt's version was called Round the Bend.",
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

  // ---------------- shading ----------------
  nonogram: {
    name: "Nonogram", aka: ["Picture Squares", "Griddlers", "Paint by Numbers", "Picross"], category: "Shading", ink: "#a3343f",
    summary: "Shade the cells the numbers ask for to uncover a hidden picture.",
    origin: "Invented in 1987 by two puzzle makers, Non Ishida and Tetsuya Nishio, each on their own.",
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
    ],
    controls: "Tap a white cell for a bulb, again for a dot (no bulb), again to clear. Lit cells glow.",
    example: "akari/1.json",
  },
  cave: {
    name: "Cave", aka: ["Corral", "Bag"], category: "Shading", ink: "#2b2b30",
    summary: "Shade the rock around one connected cave; each number counts the cave cells it can see.",
    origin: "Nikoli introduced it in 1996 as a loop puzzle called Bag; it became Corral in the West, and later the shading puzzle Cave.",
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
    origin: "Invented by the Japanese puzzle author Naoki Inaba.",
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
    origin: "Invented by Yosuke Imai in 2007 as \"Desk Place\"; Serkan Yürekli gave it its English name.",
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
    origin: "Invented by the American puzzle designer Eric Fox in 2022.",
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
    rules: [
      { text: "Each puzzle lists its own rules. Size N: every pane has N cells.", checks: ["size"], pictures: [
        { ok: true, note: "Size 3", size: [2, 3], rules: [{ rule: "size", is: 3 }], regions: ["aab", "abb"] },
        { ok: false, note: "4 and 2", size: [2, 3], rules: [{ rule: "size", is: 3 }], regions: ["aab", "aab"] },
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
    ],
    controls: "Drag along the lines between cells to cut the glass, or pick a color and paint cells into a pane.",
    example: "panes/1.json",
  },

  // ---------------- numbers ----------------
  sudoku: {
    name: "Sudoku", category: "Numbers", ink: "#2b2b30",
    summary: "Fill the grid so every row, column and box has each digit once.",
    origin: "Howard Garns created it for Dell in 1979 as Number Place; Nikoli named it Sudoku in 1984.",
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

  // ---------------- paint ----------------
  coats: {
    name: "Three Coats", category: "Paint", ink: "#2b2b30",
    summary: "Paint every shape red, yellow or blue so each dot sees its color next door.",
    origin: "Our version of RYB, a 2016 logic game by FLEB.",
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
};
