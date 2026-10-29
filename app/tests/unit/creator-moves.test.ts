import { describe, expect, it } from "vitest";
import { creatorMarks, noMoves, noteBoard } from "~/games/creator-moves";

describe("creator moves", () => {
  it("orders the finished marks by when they were last set", () => {
    let o = noMoves();
    o = noteBoard(o, { shade: [0, 0, 0] });
    o = noteBoard(o, { shade: [0, 1, 0] });
    o = noteBoard(o, { shade: [2, 1, 0] });
    o = noteBoard(o, { shade: [2, 0, 0] });      // undone
    o = noteBoard(o, { shade: [2, 0, 1], digit: [0, 3, 0] });
    o = noteBoard(o, { shade: [2, 1, 1], digit: [0, 3, 0] });   // set again: counts from here
    expect(creatorMarks(o, o.prev)).toEqual([["shade", 0, 2], ["shade", 2, 1], ["digit", 1, 3], ["shade", 1, 1]]);
  });
  it("puts marks it never saw change first", () => {
    let o = noMoves();
    o = noteBoard(o, { loop: [1, 0] });
    o = noteBoard(o, { loop: [1, 2] });
    expect(creatorMarks(o, o.prev)).toEqual([["loop", 0, 1], ["loop", 1, 2]]);
  });
});
