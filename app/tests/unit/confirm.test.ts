// The confirm dialog's pure parts (app/components/confirm.ts): Tab wraps round inside it, what it
// answers, and what gets focus first.
import { describe, expect, it } from "vitest";
import { answerOf, firstFocus, focusStep } from "~/components/confirm";

describe("focusStep: Tab stays inside the dialog", () => {
  it("moves on and wraps round", () => {
    expect(focusStep(3, 0, false)).toBe(1);
    expect(focusStep(3, 2, false)).toBe(0);
    expect(focusStep(3, 0, true)).toBe(2);
    expect(focusStep(3, 1, true)).toBe(0);
  });
  it("comes in from outside at the first (Tab) or the last (Shift+Tab)", () => {
    expect(focusStep(3, -1, false)).toBe(0);
    expect(focusStep(3, -1, true)).toBe(2);
  });
  it("has nowhere to go with nothing focusable", () => {
    expect(focusStep(0, -1, false)).toBe(-1);
    expect(focusStep(1, 0, false)).toBe(0);
  });
});

describe("answerOf", () => {
  it("answers yes ('') with no field", () => expect(answerOf(undefined, "anything")).toBe(""));
  it("answers the field's text, trimmed and cut to its length", () => {
    expect(answerOf({ label: "Why?" }, "  spam  ")).toBe("spam");
    expect(answerOf({ label: "Why?", maxLength: 4 }, "too long")).toBe("too");
  });
  it("can't answer while a required field is empty", () => {
    expect(answerOf({ label: "Why?", required: true }, "   ")).toBeNull();
    expect(answerOf({ label: "Why?" }, "")).toBe("");
  });
});

describe("firstFocus", () => {
  it("is the field, else Cancel for something destructive, else the action", () => {
    expect(firstFocus({ field: { label: "Why?" }, danger: true })).toBe("field");
    expect(firstFocus({ danger: true })).toBe("cancel");
    expect(firstFocus({})).toBe("action");
  });
});
