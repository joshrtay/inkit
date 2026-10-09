// This puzzle's checklist (sketchpad/checklist.ts): the guide's lines ticked or crossed, each broken
// rule under the line about it, the solution line last, a panel's lines only for its symbols.
import { describe, expect, it } from "vitest";
import { guides } from "~site/guides/guides.ts";
import * as m from "~/sketchpad/model";
import { convert } from "~/sketchpad/to-puzzle";
import { checkList, type Verdict } from "~/sketchpad/check";
import { checklist, usesLine } from "~/sketchpad/checklist";

const lines = (g: keyof typeof guides) => guides[g].rules.map((r) => ({ text: r.text, checks: r.checks }));
function sudoku(digits: [number, number, string][]): m.Drawing {
  let d = m.setGrid(m.EMPTY, { x: 40, y: 40, rows: 6, cols: 6, S: 40 });
  for (const [r, c, t] of digits) d = m.add(d, { kind: "text", at: { at: "cell", r, c }, text: t });
  return d;
}

describe("a sudoku's checklist", () => {
  it("each broken rule hangs under its guide line; the solution line waits", () => {
    // two 5s in row 6; two 3s in the top-left box (rows 1–2, columns 1–3)
    const conv = convert(sudoku([[5, 0, "5"], [5, 4, "5"], [0, 0, "3"], [1, 2, "3"]]), "sudoku");
    const list = checkList(conv);
    const c = checklist("sudoku", lines("sudoku"), conv.spec, list, { kind: "broken", rules: 2 });
    expect(c.rules.map((l) => [l.mark, l.items.map((x) => x.text)])).toEqual([
      ["bad", ["Two 5s in row 6"]],
      ["bad", ["Two 3s in a box"]],
      ["none", []],
    ]);
    expect(c.rules[2]).toMatchObject({ text: "Exactly one solution", note: "The solver looks once every rule holds." });
    expect(c.broken).toBe(2);
    expect(c.drawing.mark).toBe("ok");
  });
  it("fixed and solved: every line ticked", () => {
    const conv = convert(sudoku([[0, 0, "1"]]), "sudoku");
    const c = checklist("sudoku", lines("sudoku"), conv.spec, checkList(conv), { kind: "one" });
    expect(c.rules.map((l) => l.mark)).toEqual(["ok", "ok", "ok"]);
    expect(c.broken).toBe(0);
  });
  it("several solutions: the differences hang under the solution line", () => {
    const conv = convert(sudoku([]), "sudoku");
    const list = checkList(conv, { differences: [{ cells: [[0, 0]], values: ["1", "2"] }] });
    const c = checklist("sudoku", lines("sudoku"), conv.spec, list, { kind: "several" });
    expect(c.rules[2].mark).toBe("bad");
    expect(c.rules[2].items.map((x) => x.kind)).toEqual(["difference"]);
  });
  it("what doesn't fit goes under Your drawing", () => {
    const d = m.add(sudoku([]), { kind: "stamp", stamp: "crest", at: { at: "cell", r: 2, c: 2 } });
    const conv = convert(d, "sudoku");
    const c = checklist("sudoku", lines("sudoku"), conv.spec, checkList(conv), { kind: "checking" });
    expect(c.drawing.mark).toBe("bad");
    expect(c.drawing.items.map((x) => x.text)).toEqual(["A crest isn't part of Sudoku"]);
    expect(c.rules[2].mark).toBe("wait");
  });
  it("no grid: nothing ticked yet", () => {
    const c = checklist("sudoku", lines("sudoku"), null, [], { kind: "no-grid" });
    expect(c.rules.map((l) => l.mark)).toEqual(["none", "none", "none"]);
  });
});

describe("a panel lists only the symbols it uses", () => {
  const spec = { genre: "panel", size: [2, 2] as [number, number], givens: [
    { at: "corner" as const, corner: [2, 0] as [number, number], kind: "start" as const },
    { at: "cell" as const, cell: [0, 0] as [number, number], kind: "square" as const, color: "black" as const },
  ] };
  it("the line, squares, and At least one solution", () => {
    const c = checklist("panel", lines("panel"), spec, [], { kind: "solvable" });
    expect(c.rules.map((l) => l.text.split(":")[0].split(" ").slice(0, 2).join(" "))).toEqual(["Draw one", "Squares", "At least"]);
    expect(c.rules.every((l) => l.mark === "ok")).toBe(true);
  });
  it("other types keep every line", () => {
    expect(usesLine("akari", "Dots: anything", null)).toBe(true);
    expect(usesLine("panel", "Symmetry: two lines", { ...spec, rules: [{ rule: "panel-line", symmetry: "left-right" }] })).toBe(true);
    expect(usesLine("panel", "Symmetry: two lines", spec)).toBe(false);
  });
});

it("a broken rule's verdict type is exhaustive enough to type-check", () => {
  const v: Verdict = { kind: "none" };
  expect(checklist("akari", lines("akari"), null, [], v).rules.at(-1)!.mark).toBe("bad");
});
