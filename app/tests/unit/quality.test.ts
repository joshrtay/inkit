// The bad-puzzle checks (puzzles/difficulty/quality.ts): dull, guessing and grind read off a solve
// path, and the assessment as the site takes it (app/games/assessment.ts).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Step } from "../../../puzzles/difficulty/deduce.ts";
import { GRIND_RUN, PENALTY, qualityOf } from "../../../puzzles/difficulty/quality.ts";
import type { Given, GridSpec } from "~site/engine/types.ts";
import { assessmentOf, estimateWith, type Assessment } from "~/games/assessment";
import { estimate } from "~/games/estimate";

type RC = [number, number];
const cell = (r: number, c: number, kind: string, extra: Record<string, unknown> = {}) => ({ at: "cell", cell: [r, c] as RC, kind, ...extra }) as Given;
const step = (cost: number, tier: 0 | 1 | 2 | 3 = 0): Step => ({ tier, where: "", cells: [], facts: [{ mark: "shaded(0)", value: true, text: "" }], uses: [], cost });
const solved = { solved: true, entryPoints: 1, notes: [] };
const akari: GridSpec = { genre: "akari", size: [5, 5], givens: [cell(0, 0, "number", { value: 1 }), cell(2, 2, "block")] };

describe("the checks", () => {
  it("finds nothing wrong with a clean, varied solve", () => {
    const q = qualityOf({ spec: akari, path: [2, 3, 4, 2, 5].map((c) => step(c)), profile: solved, redundant: [] });
    expect(q.score).toBe(1);
    expect(q.flags).toEqual([]);
  });

  it("calls a clue that could go, or a kind that could all go, dull", () => {
    const q = qualityOf({ spec: akari, path: [step(2)], profile: solved, redundant: ["number at r1c1"], idle: ["no-adjacent"] });
    expect(q.flags.filter((f) => f.startsWith("dull"))).toHaveLength(2);
    expect(q.score).toBeCloseTo(1 - PENALTY.redundant - PENALTY.idleKind);
    expect(q.measures.redundant).toBe(1);
    // not checked is not the same as none found
    expect(qualityOf({ spec: akari, path: [step(2)], profile: solved }).measures.redundant).toBeNull();
  });

  it("counts case splits as guessing, but not where the solver lacks the type's techniques", () => {
    const path = [step(2), step(3), step(6, 2), step(2)];
    const q = qualityOf({ spec: akari, path, profile: solved });
    expect(q.flags.some((f) => f.startsWith("guessing"))).toBe(true);
    expect(q.score).toBeCloseTo(1 - PENALTY.split - PENALTY.splitShare * 0.25);
    const n = qualityOf({ spec: { genre: "nurikabe", size: [5, 5], givens: [] }, path, profile: solved });
    expect(n.score).toBe(1);
    expect(n.measures.splits).toBe(1);
  });

  it("calls a long run of easy steps that makes up the solve a grind", () => {
    const long = Array.from({ length: GRIND_RUN + 5 }, () => step(2));
    expect(qualityOf({ spec: akari, path: long, profile: solved }).flags.some((f) => f.startsWith("grind"))).toBe(true);
    // a short easy puzzle isn't a grind
    expect(qualityOf({ spec: akari, path: long.slice(0, 10), profile: solved }).flags).toEqual([]);
  });

  it("never goes below 0", () => {
    const q = qualityOf({ spec: akari, path: [step(6, 3)], profile: solved, redundant: ["a", "b", "c", "d", "e"], idle: ["x", "y"] });
    expect(q.score).toBe(0);
  });
});

describe("the site's use of an assessment", () => {
  const a: Assessment = { version: 1, solved: true, estimate: 0.7, quality: 0.6, flags: ["dull: x"], measures: { steps: 20 }, ms: 1200 };
  it("reads one from a post's meta, and ignores a malformed one", () => {
    expect(assessmentOf({ assessment: a })).toEqual(a);
    expect(assessmentOf({ assessment: { ...a, quality: 2 } })).toBeNull();
    expect(assessmentOf({ difficulty: 0.4 })).toBeNull();
    expect(assessmentOf(undefined)).toBeNull();
  });
  it("takes a finished solve's difficulty, else the rough estimate", () => {
    expect(estimateWith("akari", akari, a).difficulty).toBe(0.7);
    expect(estimateWith("akari", akari, a).level).toBe(3);
    // the solver's estimate takes its type's level cuts (Masyu's sit higher than the shared ones)
    expect(estimateWith("masyu", { size: [10, 10], givens: [] }, a).level).toBe(2);
    expect(estimateWith("akari", akari, { ...a, estimate: 0.35 }).level).toBe(2);
    expect(estimateWith("akari", akari, { ...a, estimate: 0.25 }).level).toBe(1);
    expect(estimateWith("akari", akari, { ...a, solved: false })).toEqual(estimate("akari", akari));
    expect(estimateWith("akari", akari, { ...a, solved: false }, 0.3).difficulty).toBe(0.3);
  });
});

describe("kinds and clues that do nothing, by uniqueness", () => {
  it("finds a clue that could go, and none in a minimal puzzle", async () => {
    const { idleKinds, redundantClues } = await import("../../../puzzles/difficulty/assess.ts");
    const example = (genre: string, n: number): GridSpec => ({ genre, ...JSON.parse(readFileSync(new URL(`../../../src/games/${genre}/${n}.json`, import.meta.url), "utf8")).grid });
    const spec = example("akari", 1);
    expect(await redundantClues(spec)).toEqual([]);
    // a clue given twice: either copy could go
    const extra: GridSpec = { ...spec, givens: [...(spec.givens ?? []), ...(spec.givens ?? []).filter((g) => g.kind === "number").slice(0, 1)] };
    expect((await redundantClues(extra)).length).toBeGreaterThan(0);
    expect(await idleKinds(spec)).toEqual([]);
  }, 60000);
});

describe("a solve that's mostly splits", () => {
  it("is the solver's gap, not guessing", async () => {
    const { qualityOf: q } = await import("../../../puzzles/difficulty/quality.ts");
    const r = q({ spec: { genre: "sum-blobs", size: [4, 4], givens: [] }, path: [step(5, 2), step(5, 2), step(5, 2), step(2)], profile: { solved: true, entryPoints: 1, notes: [] } });
    expect(r.score).toBe(1);
    expect(r.flags[0]).toMatch(/^splits/);
  });
});
