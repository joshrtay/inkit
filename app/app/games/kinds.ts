/** Game types by genre id (a sketch's first word), with their display names. Safe to use anywhere. */
export const KIND_NAMES: Record<string, string> = {
  river: "Round the Bend",
  nonogram: "Picture Squares",
  slitherlink: "Slitherlink",
  nurikabe: "Nurikabe",
  panes: "Panes",
  sudoku: "Sudoku",
};
export const kindName = (id: string) => KIND_NAMES[id] ?? id;
