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
  // number paths (Hidoku: a standard name; the original's name is a trademark), on squares and hexagons
  hidoku: "Hidoku",
  "hex-hidoku": "Hex Hidoku",
  // names of ours: each hexagon the smallest number its neighbours lack; a path of set lengths on a lattice
  "missing-number": "Missing Number",
  "distance-path": "Distance Path",
};
export const kindName = (id: string) => (KIND_NAMES as Record<string, string>)[id] ?? id;
