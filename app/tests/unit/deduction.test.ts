// The deduction solver (puzzles/difficulty): how step costs combine into a difficulty, the rule
// tagging it relies on, and a few real solves of the example puzzles.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deduce, profileOf, softmax, tagRules, type Step } from "../../../puzzles/difficulty/deduce.ts";
import type { GridSpec } from "../../../src/engine/types.ts";

const step = (cost: number): Step => ({ tier: 0, where: "", cells: [], facts: [{ mark: "shaded(0)", value: true, text: "" }], uses: ["rule"], cost });
const estimate = (costs: number[]) => profileOf(costs.map(step), true, 1, costs.length, 0, 0, []).estimate;
const example = (genre: string, n: number): GridSpec => ({ genre, ...JSON.parse(readFileSync(new URL(`../../../src/games/${genre}/${n}.json`, import.meta.url), "utf8")).grid });

describe("combining step costs", () => {
  const easy = Array(20).fill(2), medium = 3.5, hard = 6.5;
  it("two hard steps score above one", () => {
    expect(estimate([...easy, hard, hard])).toBeGreaterThan(estimate([...easy, hard]));
  });
  it("one hard step scores above many medium ones", () => {
    expect(estimate([...easy, hard])).toBeGreaterThan(estimate([...easy, ...Array(12).fill(medium)]));
  });
  it("a long easy slog only nudges it", () => {
    expect(softmax(Array(60).fill(2))).toBeLessThan(softmax([2, hard]));
  });
  it("soft-max sits between the max and the max plus log(n)/k", () => {
    expect(softmax([5, 5], 1)).toBeCloseTo(5 + Math.log(2));
    expect(softmax([7, 1], 1)).toBeGreaterThan(7);
    expect(softmax([7, 1], 1)).toBeLessThan(7.01);
  });
  it("rule load adds on its own", () => {
    const one = profileOf([step(4)], true, 1, 1, 0, 0, []), many = profileOf([{ ...step(4), uses: ["a", "b", "c", "d", "e"] }], true, 1, 1, 0, 0, []);
    expect(many.estimate).toBeGreaterThan(one.estimate);
  });
});

describe("tagging a rule block's rules", () => {
  it("adds the tag to rule bodies and leaves facts and directives", () => {
    const out = tagRules("box(1,2).\n:- a(X), b(X : c(X)). % note\n{x(I)} :- cell(I).\n1 { y } 1.\n#show a/1.", 3);
    expect(out.split("\n")).toEqual(["box(1,2).", ":- a(X), b(X : c(X)); rbk(3).", "{x(I)} :- cell(I); rbk(3).", "1 { y } 1 :- rbk(3).", "#show a/1."]);
  });
});

describe("solving examples", () => {
  it("solves a 4×4 Sudoku with only easy steps, below a 6×6", async () => {
    const small = await deduce(example("sudoku", 1)), big = await deduce(example("sudoku", 2));
    expect(small.profile.solved).toBe(true);
    expect(small.profile.perTier.slice(1)).toEqual([0, 0, 0]);
    expect(small.path.every((s) => s.cost > 0 && s.because)).toBe(true);
    expect(big.profile.estimate).toBeGreaterThan(small.profile.estimate);
  }, 30000);
  it("counts a panel's symbol kinds in its rule load", async () => {
    const one = await deduce(example("panel", 4)), four = await deduce(example("panel", 6));
    expect(four.profile.ruleLoad).toBeGreaterThan(one.profile.ruleLoad);
    expect(four.profile.estimate).toBeGreaterThan(one.profile.estimate);
  }, 30000);
});

describe("the scorer", () => {
  it("keeps the base scorer's quality and takes the solver's difficulty", async () => {
    const { withDeductionDifficulty } = await import("../../../puzzles/difficulty/scorer.ts");
    const base = async () => ({ difficulty: 0.99, quality: 0.7, notes: ["base"], measures: {} });
    const s = await withDeductionDifficulty(base)({ spec: example("sudoku", 1), plan: {} as never }, {} as never, {} as never);
    expect(s.quality).toBe(0.7);
    expect(s.difficulty).toBeLessThan(0.5);
    expect(s.measures.proxyDifficulty).toBe(0.99);
  }, 30000);
});
