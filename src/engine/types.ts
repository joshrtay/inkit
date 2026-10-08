// A puzzle description, the player's board, and what the rules see (docs/grid-engine.md).
import type { Grid, RC } from "./geometry.ts";

export type MarkKind = "fence" | "loop" | "shade" | "regions" | "digit" | "paint";

/** A clue fixed to the grid. In a digit puzzle a "number" is a given digit. */
export type Given =
  | { at: "cell"; cell: RC; kind: "number"; value: number }
  | { at: "cell"; cell: RC; kind: "block" }                       // a rock: no marks, not part of any loop or region
  | { at: "cell"; cell: RC; kind: "compass"; value: { n?: number; e?: number; s?: number; w?: number } }
  | { at: "cell"; cell: RC; kind: "symbol"; value: string }
  | { at: "cell"; cell: RC; kind: "pearl"; value: "white" | "black" }        // Masyu
  | { at: "cell"; cell: RC; kind: "dots"; value: number[]; hidden?: boolean }   // paint dots (palette colors 1..n); hidden until painted
  | { at: "border"; cells: [RC, RC]; kind: "twins" | "opposites" | "wall" }   // a wall: loops can't cross it; in a maze, a wall given already drawn
  | { at: "corner"; corner: RC; kind: "count"; value: number }               // a number on a corner: how many walls touch it (mazes)
  | { at: "edge"; cell: RC; side: Side; kind: "door"; role: "in" | "out" }   // an opening in the outside edge, beside a cell (mazes)
  | { at: "edge"; cell: RC; side: Side; kind: "first" | "skyscraper"; value: number }   // outside the grid, looking in: the first letter seen (Easy as ABC) / how many buildings are seen (Skyscrapers)
  | { at: "cells"; cells: RC[]; kind: "thermo" }                              // a thermometer from its bulb (first cell) to its tip
  | { at: "point"; point: RC; kind: "galaxy" }                                // a galaxy centre in half-cell units: [2r+1, 2c+1] is a cell's centre, even numbers lie on lines
  | { at: "row" | "col"; index: number; kind: "runs"; value: number[] }      // nonogram clue beside a row / above a column
  | { at: "row" | "col"; index: number; kind: "total"; value: number }      // how many shaded cells in that row / column (Aquarium)
  // ---- panels (line puzzles in the style of The Witness: src/engine/panel.ts) ----
  | { at: "corner"; corner: RC; kind: "start"; color?: LineColor }           // where a line starts (a big circle); its color, with two lines
  | { at: "corner"; corner: RC; kind: "end" }                                // where a line may end: a corner on the outside edge
  | { at: "corner"; corner: RC; kind: "hexagon"; color?: LineColor }         // a dot the line passes through (a line of that color, if colored)
  | { at: "line"; corners: [RC, RC]; kind: "hexagon"; color?: LineColor }    // a dot halfway along a stretch of grid line: the line runs along it
  | { at: "line"; corners: [RC, RC]; kind: "gap" }                           // a break in a grid line: the line can't run along it
  | { at: "cell"; cell: RC; kind: "square" | "star"; color: SymbolColor }    // squares: one color per region; stars: two of a color per region
  | { at: "cell"; cell: RC; kind: "triangle"; value: number }                // 1-3 triangles: how many of the cell's sides the line runs along
  | { at: "cell"; cell: RC; kind: "shape"; value: RC[]; rotate?: boolean; negative?: boolean }   // a polyomino (its cells, top-left at 0,0); the region is made of its region's shapes
  | { at: "cell"; cell: RC; kind: "eraser" };                                // cancels itself and one other symbol in its region

/** The two lines of a symmetry panel. */
export type LineColor = "blue" | "yellow";
/** Colors of squares and stars. */
export const SYMBOL_COLORS = ["black", "white", "red", "orange", "yellow", "green", "blue", "purple"] as const;
export type SymbolColor = (typeof SYMBOL_COLORS)[number];

/** A side of a cell. */
export type Side = "top" | "right" | "bottom" | "left";

/** One configured building block, e.g. { rule: "size", is: 4 }. */
export interface RuleSpec { rule: string; [setting: string]: unknown }

export interface GridStyle {
  ink?: string;
  grid?: "lines" | "dots";
  major?: number;                // a heavier grid line every n cells (nonograms: 5)
  empty?: "dot" | "x";           // how a known-empty shade cell is marked
  shaded?: "wash" | "star" | "bulb" | "water" | "mine";
  symbols?: string;              // a digit puzzle's digits shown as these letters instead (Easy as ABC: "ABC")   // how a shaded cell looks: an ink wash, a star (Star Battle), a light bulb (Akari)
  palette?: string[];            // region / glass colors
  wash?: string;                 // shading and loop color
}

/** An instance's "grid" data (src/games/<genre>/<n>.json). Missing parts come from the genre. */
export interface GridSpec {
  genre?: string;
  size: [number, number];        // rows, cols
  marks?: MarkKind[];
  rules?: RuleSpec[];
  givens?: Given[];
  style?: GridStyle;
  /** A nonogram's hidden picture: one letter per cell ("." = empty), its colors and title.
   *  Its row and column clues are worked out from it; solving reveals it in color. */
  picture?: { rows: string[]; palette: Record<string, string>; title?: string };
  /** A figure of polygon pieces instead of a square grid (Three Coats): each piece is a cell,
   *  and pieces sharing part of an edge are neighbours. "size" is then [1, number of pieces]
   *  and cell [0, i] is piece i. Any units; corners closer than 1.5% of the figure's size meet. */
  figure?: { pieces: number[][][] };
  /** Outlined areas: one string per row, one letter per cell; cells with the same letter are one
   *  area, drawn with a thick outline (Star Battle, Irregular Sudoku). */
  areas?: string[];
  /** Mistakes allowed: a wrong move is turned away and costs a heart, and pieces painted right
   *  lock in (paint puzzles). 0 = play freely and check at the end. */
  hearts?: number;
}

/** The player's board: one array per mark kind (unused kinds stay zero). */
export interface Board {
  shade: Uint8Array;   // cells:   0 empty, 1 shaded, 2 dot (known unshaded)
  fence: Uint8Array;   // borders: 0 empty, 1 line, 2 X
  loop: Uint8Array;    // links:   0 empty, 1 line, 2 X
  cut: Uint8Array;     // borders: 0 none, 1 cut
  color: Uint8Array;   // cells:   0 unpainted, 1.. palette color (regions and paint)
  digit: Uint8Array;   // cells:   0 empty, 1..n
  pencil: Uint16Array; // cells:   the player's pencil notes, bit d = digit d (not part of the answer)
}

export const emptyBoard = (g: Grid): Board => ({
  shade: new Uint8Array(g.cellCount), fence: new Uint8Array(g.borders.length), loop: new Uint8Array(g.links.length),
  cut: new Uint8Array(g.borders.length), color: new Uint8Array(g.cellCount), digit: new Uint8Array(g.cellCount),
  pencil: new Uint16Array(g.cellCount),
});

/** A broken rule, pointing at what's wrong. */
export interface Problem { message: string; cells?: number[]; borders?: number[]; links?: number[] }

/** A puzzle with its genre filled in, ready for rules to read. */
export interface Puzzle {
  spec: GridSpec;
  grid: Grid;
  marks: MarkKind[];
  rules: RuleSpec[];
  style: GridStyle;
  /** clues indexed by cell / border / corner id */
  cellGivens: Map<number, Given[]>;
  borderGivens: Map<number, Given[]>;
  cornerGivens: Map<number, Given[]>;
  /** a maze's doors: outside-edge border id -> in or out */
  doors: Map<number, "in" | "out">;
  /** nonogram clues per row / column */
  rowRuns: Map<number, number[]>;
  /** shaded-cell totals per row / column */
  rowTotals: Map<number, number>;
  colTotals: Map<number, number>;
  colRuns: Map<number, number[]>;
  /** rocks, and the links walls close */
  blocked: Set<number>;
  walls: Set<number>;
  /** a digit puzzle's digits run 1..digits */
  digits: number;
  /** a figure's pieces (corners snapped together), or null for a square grid */
  figure: number[][][] | null;
  /** mistakes allowed (0 = free play) */
  hearts: number;
  /** clues outside the grid (not doors): the cell they look in at, from which side */
  edgeClues: { cell: number; side: Side; kind: "first" | "skyscraper"; value: number }[];
  /** thermometers, bulb first */
  thermos: number[][];
  /** galaxy centres, in half-cell units */
  galaxies: [number, number][];
  /** a digit puzzle whose cells may stay empty (Easy as ABC) */
  blanks: boolean;
  /** outlined areas: each cell's area index, and each area's cells (null if none) */
  areas: { of: number[]; cells: number[][] } | null;
  /** clues on a stretch of grid line (panels' hexagons and gaps), by border id */
  lineGivens: Map<number, Given[]>;
  /** the borders a panel's line can't run along */
  gaps: Set<number>;
}
