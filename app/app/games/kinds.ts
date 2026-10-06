import type { GenreName } from "~site/engine/puzzle.ts";

/** Game types by genre id (a sketch's first word), with their display names. Safe to use anywhere.
 *  Typed against the engine's genres, so a new genre needs a name here before the build passes. */
export const KIND_NAMES: Record<GenreName, string> = {
  "simple-loop": "Simple Loop",
  nonogram: "Nonogram",
  slitherlink: "Slitherlink",
  nurikabe: "Nurikabe",
  panes: "Panes",
  sudoku: "Sudoku",
  maze: "Number Line Maze",
  coats: "Three Coats",
};
export const kindName = (id: string) => (KIND_NAMES as Record<string, string>)[id] ?? id;
