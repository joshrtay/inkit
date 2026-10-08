import type { GenreName } from "~site/engine/puzzle.ts";

/** Game types by genre id (a sketch's first word), with their display names. Safe to use anywhere.
 *  Typed against the engine's genres, so a new genre needs a name here before the build passes. */
export const KIND_NAMES: Record<GenreName, string> = {
  "simple-loop": "Simple Loop",
  "simple-path": "Simple Path",
  "star-battle": "Star Battle",
  akari: "Akari",
  numberlink: "Numberlink",
  cave: "Cave",
  "square-jam": "Square Jam",
  "wittgenstein-briquet": "Wittgenstein Briquet",
  hitori: "Hitori",
  minesweeper: "Minesweeper",
  "spiral-galaxies": "Spiral Galaxies",
  "thermo-sudoku": "Thermo Sudoku",
  skyscrapers: "Skyscrapers",
  "easy-as-abc": "Easy as ABC",
  aquarium: "Aquarium",
  masyu: "Masyu",
  shikaku: "Shikaku",
  "irregular-sudoku": "Irregular Sudoku",
  nonogram: "Nonogram",
  slitherlink: "Slitherlink",
  nurikabe: "Nurikabe",
  panes: "Panes",
  sudoku: "Sudoku",
  maze: "Number Line Maze",
  coats: "Three Coats",
  // line panels in the style of The Witness (src/engine/panel.ts)
  panel: "Panel",
  binairo: "Binairo",
  // Beast Academy's: each row and column holds its share of each color
  "abstract-art": "Abstract Art",
  "fill-in": "Number Fill-In",
  // number paths: Hidoku (a generic name, since Hidato is a registered trademark) and Beast Academy's
  // Honeycomb Paths on hexagons
  hidoku: "Hidoku",
  "honeycomb-paths": "Honeycomb Paths",
  // Beast Academy's: each hexagon the smallest number its neighbours lack; a path of set lengths on a lattice
  hive: "Hive",
  "pythagorean-paths": "Pythagorean Paths",
  // region and placement types from Beast Academy (its names; Fillomino and Polyomino Packing are the standard ones)
  fillomino: "Fillomino",
  "sum-blobs": "Sum Blobs",
  "polyomino-packing": "Polyomino Packing",
  "connect-the-critters": "Connect the Critters",
  "find-the-cut-line": "Find the Cut Line",
  "twins-and-triplets": "Twins and Triplets",
};
export const kindName = (id: string) => (KIND_NAMES as Record<string, string>)[id] ?? id;
