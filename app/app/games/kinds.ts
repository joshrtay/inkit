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
  // FLEB's game (Wyatt's were called Three Coats); the id stays, as games use it
  coats: "RYB",
  // line panels in the style of The Witness (src/engine/panel.ts)
  panel: "Panel",
  // a generic name: Binairo and Takuzu are trademarks
  "binary-puzzle": "Binary Puzzle",
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
/** A type's name; a draft with no type yet (paint: the type is chosen as it's drawn) says so. */
export const kindName = (id: string) => (id ? (KIND_NAMES as Record<string, string>)[id] ?? id : "No type yet");

/** What a draft is called before it's named (the title is set on the publish page): its title if it
 *  has one, else its type and size ("Sudoku · 6 × 6"), else "New puzzle". "Untitled" is what the
 *  server stores for no title. */
export const draftName = (title: string | null | undefined, kind: string, size?: readonly [number, number] | null) => {
  const t = title?.trim();
  if (t && t !== "Untitled") return t;
  return kind ? `${kindName(kind)}${size ? ` · ${size[0]} × ${size[1]}` : ""}` : "New puzzle";
};

/** Where a game is edited: paint (/g/<id>/draw) for every type but RYB, which keeps its figure
 *  editor (/g/<id>/edit) until paint can draw pieces (docs/creation-flow.md, decision 7). */
export const editPath = (game: { id: string; kind: string }) => `/g/${game.id}/${game.kind === "coats" ? "edit" : "draw"}`;

/** Types still being worked out (their rules or implementation aren't right yet): the engine, its
 *  tests and examples keep them, but they aren't offered anywhere on the site (the puzzle types,
 *  paint's type list, What type is this?, the reader, the sitemap and llms.txt). The local test
 *  database still seeds their examples, so the parity tests cover them. */
export const WIP_KINDS: readonly GenreName[] = [
  "twins-and-triplets",   // its rules and play aren't right yet
];
export const isListed = (k: string) => !(WIP_KINDS as readonly string[]).includes(k);
