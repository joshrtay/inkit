// The AI creators' scorer (puzzles/ai/score.ts): the rule load (how many rules or kinds of symbol
// a solver holds in mind) is a term of its own that raises the difficulty, and the persona's caps
// on rule load and crowding throw a candidate out.
import { describe, expect, it } from "vitest";
import type { Given, GridSpec } from "~site/engine/types.ts";
import { PERSONAS, personaByHandle, type GenrePlan } from "~/ai/personas";
import type { Slot } from "~/ai/schedule";
import { proxyScorer, ruleLoad, ruleNorm, RULE_WEIGHT, withRuleLoad } from "../../../puzzles/ai/score.ts";

type RC = [number, number];
const cell = (r: number, c: number, kind: string, extra: Record<string, unknown> = {}) => ({ at: "cell", cell: [r, c] as RC, kind, ...extra }) as Given;
const ends: Given[] = [{ at: "corner", corner: [4, 0], kind: "start" }, { at: "corner", corner: [0, 4], kind: "end" }];
const panel = (givens: Given[], rules?: GridSpec["rules"]): GridSpec => ({ genre: "panel", size: [4, 4], givens: [...ends, ...givens], ...(rules ? { rules } : {}) });

describe("rule load", () => {
  it("is 1 for a plain genre, whatever its size or clue count", () => {
    expect(ruleLoad({ genre: "nurikabe", size: [8, 8], givens: [cell(0, 0, "number", { value: 3 }), cell(5, 5, "number", { value: 1 }), cell(2, 2, "block")] }).load).toBe(1);
    expect(ruleLoad({ genre: "masyu", size: [6, 6], givens: [cell(0, 0, "pearl", { value: "white" }), cell(3, 3, "pearl", { value: "black" })] }).load).toBe(1);
    expect(ruleLoad({ genre: "sudoku", size: [9, 9], givens: [cell(0, 0, "number", { value: 3 })] }).load).toBe(1);
    expect(ruleLoad({ genre: "slitherlink", size: [5, 5], givens: [] }).load).toBe(1);
  });

  it("counts a panel's kinds of symbol, symmetry, and a little for each colour beyond two", () => {
    expect(ruleLoad(panel([cell(0, 0, "square", { color: "black" }), cell(1, 1, "square", { color: "white" })])).load).toBe(1);
    const two = ruleLoad(panel([cell(0, 0, "square", { color: "black" }), cell(1, 1, "triangle", { value: 2 })]));
    expect(two.load).toBe(2);
    expect(two.kinds.sort()).toEqual(["squares", "triangles"]);
    // gaps are walls, not a rule
    expect(ruleLoad(panel([cell(0, 0, "square", { color: "black" }), { at: "line", corners: [[0, 0], [0, 1]], kind: "gap" }])).load).toBe(1);
    // a hollow shape is a kind of its own; so is the mirror
    const shapes = ruleLoad(panel([cell(0, 0, "shape", { value: [[0, 0], [0, 1]] }), cell(1, 1, "shape", { value: [[0, 0]], negative: true })], [{ rule: "panel-line", symmetry: "left-right" }]));
    expect(shapes.kinds.sort()).toEqual(["hollow shapes", "shapes", "symmetry"]);
    // squares in black and white, stars in orange and purple: two kinds and two extra colours
    const busy = ruleLoad(panel([cell(0, 0, "square", { color: "black" }), cell(0, 1, "square", { color: "white" }), cell(1, 0, "star", { color: "orange" }), cell(1, 1, "star", { color: "orange" }), cell(2, 0, "star", { color: "purple" }), cell(2, 1, "star", { color: "purple" })]));
    expect(busy.load).toBeCloseTo(2.3, 5);
  });

  it("counts every rule a Panes puzzle lists", () => {
    expect(ruleLoad({ genre: "panes", size: [4, 4], rules: [{ rule: "size", is: 4 }, { rule: "twins" }], givens: [] }).load).toBe(2);
    expect(ruleLoad({ genre: "panes", size: [4, 4], rules: [{ rule: "size", is: 4 }, { rule: "twins" }, { rule: "opposites" }, { rule: "compass" }], givens: [] }).load).toBe(4);
  });

  it("adds a Sudoku's constraints: thermometers, irregular areas, diagonals", () => {
    expect(ruleLoad({ genre: "thermo-sudoku", size: [6, 6], givens: [{ at: "cells", cells: [[0, 0], [0, 1]], kind: "thermo" }] }).load).toBe(2);
    expect(ruleLoad({ genre: "irregular-sudoku", size: [6, 6], areas: ["aaabbb", "aaabbb", "cccddd", "cccddd", "eeefff", "eeefff"], givens: [] }).load).toBe(2);
    const stacked = ruleLoad({ genre: "thermo-sudoku", size: [6, 6], areas: ["aaabbb", "aaabbb", "cccddd", "cccddd", "eeefff", "eeefff"], rules: [{ rule: "latin" }, { rule: "boxes" }, { rule: "thermo" }, { rule: "diagonals" }], givens: [] });
    expect(stacked.kinds).toEqual(["sudoku", "thermometers", "irregular areas", "diagonals"]);
    expect(stacked.load).toBe(4);
  });

  it("counts other genres' kinds of clue and added rules, but not a digit puzzle's given digits", () => {
    expect(ruleLoad({ genre: "skyscrapers", size: [4, 4], givens: [cell(0, 0, "number", { value: 2 }), { at: "edge", cell: [0, 0], side: "top", kind: "skyscraper", value: 2 }] }).load).toBe(1);
    expect(ruleLoad({ genre: "abstract-art", size: [6, 6], rules: [{ rule: "line-shares", parts: [1, 1] }, { rule: "no-three-in-a-row" }], givens: [cell(0, 0, "color", { value: 1 })] }).load).toBe(2);
    expect(ruleLoad({ genre: "abstract-art", size: [6, 6], rules: [{ rule: "line-shares", parts: [1, 1, 1] }], givens: [cell(0, 0, "color", { value: 1 })] }).load).toBe(2);
    expect(ruleLoad({ genre: "akari", size: [6, 6], givens: [cell(0, 0, "number", { value: 0, letter: "B" })] }).load).toBe(2);
  });
});

describe("difficulty with the rule load", () => {
  it("leaves one rule's logic as it is", () => {
    for (const x of [0, 0.3, 0.8]) expect(withRuleLoad(x, 1)).toBeCloseTo(x, 10);
  });
  it("puts four or more rules well toward the hard end on its own", () => {
    expect(withRuleLoad(0, 4)).toBeCloseTo(RULE_WEIGHT, 10);
    expect(withRuleLoad(0, 4)).toBeGreaterThanOrEqual(0.65);
    expect(withRuleLoad(0, 6)).toBe(withRuleLoad(0, 4));
    expect(withRuleLoad(0.5, 4)).toBeGreaterThan(0.8);
  });
  it("rises with every rule, and never past 1", () => {
    const xs = [1, 2, 2.3, 3, 4].map((n) => withRuleLoad(0.2, n));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(withRuleLoad(1, 5)).toBe(1);
    expect(ruleNorm(1)).toBe(0);
    expect(ruleNorm(4)).toBe(1);
  });
});

describe("the proxy scorer", () => {
  const isola = personaByHandle("isola")!;
  const plan: GenrePlan = { genre: "panel", weight: 1, sizes: [[3, 3], [4, 4]] };
  const slot = { handle: "isola", at: new Date("2026-10-09T16:30:00Z"), date: "2026-10-09", weekday: "fri", difficulty: 0.5 } as Slot;
  // a 3 × 3 panel: black squares top left, white bottom right (a line between them solves it)
  const small: GridSpec = { genre: "panel", size: [3, 3], givens: [{ at: "corner", corner: [3, 0], kind: "start" }, { at: "corner", corner: [0, 3], kind: "end" }, cell(0, 0, "square", { color: "black" }), cell(2, 2, "square", { color: "white" })] };

  it("reports the rule load in its measures and notes, and scores more rules as harder", async () => {
    const one = await proxyScorer({ spec: small, plan }, isola, slot);
    expect(one.measures.ruleLoad).toBe(1);
    expect(one.measures.ruleTerm).toBe(0);
    expect(one.difficulty).toBeCloseTo(one.measures.logic, 3);
    const more: GridSpec = { ...small, givens: [...small.givens!, cell(1, 1, "triangle", { value: 1 })] };
    const two = await proxyScorer({ spec: more, plan }, { ...isola, quality: { ...isola.quality, allKindsNeeded: false } }, slot);
    expect(two.measures.ruleLoad).toBe(2);
    expect(two.notes.join(" ")).toMatch(/rule load 2: .*squares/);
    expect(two.difficulty).toBeGreaterThan(two.measures.logic);
  }, 30000);

  it("throws out a candidate over the persona's rule load or crowded with symbols", async () => {
    const strict = { ...isola, quality: { ...isola.quality, allKindsNeeded: false, maxRuleLoad: 1 } };
    const more: GridSpec = { ...small, givens: [...small.givens!, cell(1, 1, "triangle", { value: 1 })] };
    const s = await proxyScorer({ spec: more, plan }, strict, slot);
    expect(s.quality).toBe(0);
    expect(s.notes.join(" ")).toMatch(/rejected: rule load/);
    const crowded = { ...isola, quality: { ...isola.quality, allKindsNeeded: false, maxSymbolShare: 0.2 } };
    const c = await proxyScorer({ spec: small, plan }, crowded, slot);
    expect(c.quality).toBe(0);
    expect(c.notes.join(" ")).toMatch(/crowded/);
  }, 30000);
});

describe("the personas' caps", () => {
  it("keep Isola's panels to the new symbol and one earlier one", () => {
    expect(personaByHandle("isola")!.quality.maxRuleLoad).toBeLessThanOrEqual(3.5);
    expect(personaByHandle("isola")!.quality.maxSymbolShare).toBeLessThanOrEqual(0.7);
  });
  it("are sane where set", () => {
    for (const p of PERSONAS) {
      if (p.quality.maxRuleLoad != null) expect(p.quality.maxRuleLoad).toBeGreaterThanOrEqual(1);
      if (p.quality.maxSymbolShare != null) expect(p.quality.maxSymbolShare).toBeGreaterThan(0);
    }
  });
});
