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
