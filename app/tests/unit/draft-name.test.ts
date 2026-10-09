// What a draft is called before it has a title (games/kinds.ts): its type and size, or "New puzzle".
import { describe, expect, it } from "vitest";
import { draftName } from "~/games/kinds";

describe("draftName", () => {
  it("is the title, once there is one", () => expect(draftName("Morning walk", "sudoku", [6, 6])).toBe("Morning walk"));
  it("is the type and size for an untitled draft", () => {
    expect(draftName("Untitled", "sudoku", [6, 6])).toBe("Sudoku · 6 × 6");
    expect(draftName("", "akari", null)).toBe("Akari");
  });
  it("is New puzzle with no type", () => expect(draftName("Untitled", "", [5, 5])).toBe("New puzzle"));
});
