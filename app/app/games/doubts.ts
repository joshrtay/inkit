// What Claude wasn't sure of when it read a drawing. Each doubt says what it's about (a square, a
// row's or column's numbers, some rows or columns, an area, or the whole puzzle) so the editor can
// pin it there; the creator ticks it off once they've checked it. Safe to use anywhere.

export type DoubtPlace = "cell" | "row-clue" | "column-clue" | "rows" | "columns" | "area" | "whole";
export const DOUBT_PLACES: DoubtPlace[] = ["cell", "row-clue", "column-clue", "rows", "columns", "area", "whole"];

export interface Doubt {
  text: string;
  place?: DoubtPlace;
  /** rows and columns from 0 (row..row2, col..col2 for a range or an area) */
  row?: number; col?: number; row2?: number; col2?: number;
  /** the creator has checked it */
  done?: boolean;
}

/** Stored doubts, including older ones (plain strings, or a row and column without a place). */
export const doubtsOf = (stored: unknown): Doubt[] =>
  Array.isArray(stored) ? stored.flatMap((d): Doubt[] => {
    if (typeof d === "string") return [{ text: d, place: "whole" }];
    if (!d || typeof d.text !== "string") return [];
    const x = d as Doubt;
    const place = x.place ?? (x.row !== undefined && x.col !== undefined ? "cell" : x.row !== undefined ? "rows" : x.col !== undefined ? "columns" : "whole");
    return [{ ...x, place }];
  }) : [];

const span = (a?: number, b?: number) => (a === undefined ? "" : b === undefined || b === a ? `${a + 1}` : `${a + 1}–${b + 1}`);

/** Where it is, for people (rows and columns from 1): "Row 4, column 1", "Row 4's numbers"... */
export function doubtPlace(d: Doubt) {
  switch (d.place) {
    case "cell": return `Row ${span(d.row)}, column ${span(d.col)}`;
    case "row-clue": return `Row ${span(d.row)}'s numbers`;
    case "column-clue": return `Column ${span(d.col)}'s numbers`;
    case "rows": return `${d.row2 !== undefined && d.row2 !== d.row ? "Rows" : "Row"} ${span(d.row, d.row2)}`;
    case "columns": return `${d.col2 !== undefined && d.col2 !== d.col ? "Columns" : "Column"} ${span(d.col, d.col2)}`;
    case "area": return `Rows ${span(d.row, d.row2)}, columns ${span(d.col, d.col2)}`;
    default: return "";
  }
}

/** A note as the sketch reader gives it: what it's about, rows and columns from 0 (-1 for none). */
export interface Note { text: string; place: DoubtPlace; fromRow: number; toRow: number; fromCol: number; toCol: number }

/** A reader's note as a doubt, kept on a rows × cols grid (a place missing what it needs, or off
 *  the grid, is about the puzzle as a whole). */
export function doubtFromNote(n: Note, rows: number, cols: number): Doubt {
  const fix = (v: number, max: number) => (v >= 0 && v < max ? v : undefined);
  const row = fix(n.fromRow, rows), col = fix(n.fromCol, cols);
  const row2 = fix(n.toRow, rows) ?? row, col2 = fix(n.toCol, cols) ?? col;
  const needs = { cell: [row, col], "row-clue": [row], "column-clue": [col], rows: [row], columns: [col], area: [row, col], whole: [] }[n.place];
  // a place missing what it needs is about the puzzle as a whole
  if (needs.some((v) => v === undefined)) return { text: n.text, place: "whole" };
  const lo = (a?: number, b?: number) => (a === undefined || b === undefined ? a : Math.min(a, b));
  const hi = (a?: number, b?: number) => (a === undefined || b === undefined ? b : Math.max(a, b));
  switch (n.place) {
    case "cell": return { text: n.text, place: "cell", row, col };
    case "row-clue": return { text: n.text, place: "row-clue", row };
    case "column-clue": return { text: n.text, place: "column-clue", col };
    case "rows": return { text: n.text, place: "rows", row: lo(row, row2), row2: hi(row, row2) };
    case "columns": return { text: n.text, place: "columns", col: lo(col, col2), col2: hi(col, col2) };
    case "area": return { text: n.text, place: "area", row: lo(row, row2), row2: hi(row, row2), col: lo(col, col2), col2: hi(col, col2) };
    default: return { text: n.text, place: "whole" };
  }
}
