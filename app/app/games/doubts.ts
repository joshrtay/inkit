// What Claude wasn't sure of when it read a drawing: each doubt is about one cell, a whole row or
// column, or the puzzle as a whole, and the creator ticks it off once they've checked it.
// Safe to use anywhere.

export interface Doubt {
  text: string;
  /** the cell (or row / column) it's about; absent for the puzzle as a whole */
  row?: number;
  col?: number;
  /** the creator has checked it */
  done?: boolean;
}

/** Stored doubts, including the plain strings older drafts kept. */
export const doubtsOf = (stored: unknown): Doubt[] =>
  Array.isArray(stored) ? stored.flatMap((d): Doubt[] => (typeof d === "string" ? [{ text: d }] : d && typeof d.text === "string" ? [d as Doubt] : [])) : [];

/** "Row 3, column 2", "Row 3", "Column 2", or "" (rows and columns count from 1 for people). */
export const doubtPlace = (d: Doubt) =>
  d.row !== undefined && d.col !== undefined ? `Row ${d.row + 1}, column ${d.col + 1}`
    : d.row !== undefined ? `Row ${d.row + 1}` : d.col !== undefined ? `Column ${d.col + 1}` : "";
