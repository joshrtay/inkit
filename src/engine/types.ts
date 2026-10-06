// A puzzle description, the player's board, and what the rules see (docs/grid-engine.md).
import type { Grid, RC } from "./geometry.ts";

export type MarkKind = "fence" | "loop" | "shade" | "regions" | "digit";

/** A clue fixed to the grid. In a digit puzzle a "number" is a given digit. */
export type Given =
  | { at: "cell"; cell: RC; kind: "number"; value: number }
  | { at: "cell"; cell: RC; kind: "block" }                       // a rock: no marks, not part of any loop or region
  | { at: "cell"; cell: RC; kind: "compass"; value: { n?: number; e?: number; s?: number; w?: number } }
  | { at: "cell"; cell: RC; kind: "symbol"; value: string }
  | { at: "border"; cells: [RC, RC]; kind: "twins" | "opposites" | "wall" }   // a wall: loops can't cross it
  | { at: "row" | "col"; index: number; kind: "runs"; value: number[] };     // nonogram clue beside a row / above a column

/** One configured building block, e.g. { rule: "size", is: 4 }. */
export interface RuleSpec { rule: string; [setting: string]: unknown }

export interface GridStyle {
  ink?: string;
  grid?: "lines" | "dots";
  major?: number;                // a heavier grid line every n cells (nonograms: 5)
  empty?: "dot" | "x";           // how a known-empty shade cell is marked
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
}

/** The player's board: one array per mark kind (unused kinds stay zero). */
export interface Board {
  shade: Uint8Array;   // cells:   0 empty, 1 shaded, 2 dot (known unshaded)
  fence: Uint8Array;   // borders: 0 empty, 1 line, 2 X
  loop: Uint8Array;    // links:   0 empty, 1 line, 2 X
  cut: Uint8Array;     // borders: 0 none, 1 cut
  color: Uint8Array;   // cells:   0 unpainted, 1.. palette color
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
  /** clues indexed by cell / border id */
  cellGivens: Map<number, Given[]>;
  borderGivens: Map<number, Given[]>;
  /** nonogram clues per row / column */
  rowRuns: Map<number, number[]>;
  colRuns: Map<number, number[]>;
  /** rocks, and the links walls close */
  blocked: Set<number>;
  walls: Set<number>;
  /** a digit puzzle's digits run 1..digits */
  digits: number;
}
