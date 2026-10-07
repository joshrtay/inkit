// Claude's doubts and where they're pinned (app/games/doubts.ts).
import { describe, expect, it } from "vitest";
import { doubtFromNote, doubtPlace, doubtsOf } from "~/games/doubts";

const note = (place: string, fromRow = -1, toRow = -1, fromCol = -1, toCol = -1) =>
  ({ text: "?", place, fromRow, toRow, fromCol, toCol }) as Parameters<typeof doubtFromNote>[0];

describe("doubts", () => {
  it("keep a square, a line's clues, rows and areas", () => {
    expect(doubtFromNote(note("cell", 2, 2, 1, 1), 5, 5)).toEqual({ text: "?", place: "cell", row: 2, col: 1 });
    expect(doubtFromNote(note("row-clue", 3), 5, 5)).toEqual({ text: "?", place: "row-clue", row: 3 });
    expect(doubtFromNote(note("rows", 4, 2), 5, 5)).toEqual({ text: "?", place: "rows", row: 2, row2: 4 });
    expect(doubtFromNote(note("area", 0, 1, 3, 2), 5, 5)).toEqual({ text: "?", place: "area", row: 0, row2: 1, col: 2, col2: 3 });
  });
  it("are about the whole puzzle when their place is missing or off the grid", () => {
    expect(doubtFromNote(note("cell", 2, 2), 5, 5).place).toBe("whole");
    expect(doubtFromNote(note("cell", 9, 9, 0, 0), 5, 5).place).toBe("whole");
  });
  it("read older stored doubts", () => {
    expect(doubtsOf(["smudged", { text: "x", row: 1, col: 2 }, { text: "y", row: 1 }])).toEqual([
      { text: "smudged", place: "whole" }, { text: "x", row: 1, col: 2, place: "cell" }, { text: "y", row: 1, place: "rows" },
    ]);
  });
  it("say where they are, counting from 1", () => {
    expect(doubtPlace({ text: "", place: "cell", row: 3, col: 0 })).toBe("Row 4, column 1");
    expect(doubtPlace({ text: "", place: "row-clue", row: 3 })).toBe("Row 4's numbers");
    expect(doubtPlace({ text: "", place: "rows", row: 1, row2: 2 })).toBe("Rows 2–3");
  });
});
