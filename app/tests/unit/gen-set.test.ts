// Generating puzzles that afford techniques (puzzles/difficulty/bands.ts, gen-set.ts, gen-best.ts):
// the bands as technique sets, taking one technique away, the balancing arithmetic, the shortlist's
// ranks, and one real band-limited puzzle from the generator.
import { describe, expect, it } from "vitest";
import { BAND_LIST, bandNamed, bandOf, expertApplies, optionsOf, quickSolve, techniquesOf, without } from "../../../puzzles/difficulty/bands.ts";
import { pickArm, rarityOf, seedOf, type ArmStats } from "../../../puzzles/difficulty/gen-set.ts";
import { ranks01, scoreGenre, type Generated } from "../../../puzzles/difficulty/gen-best.ts";
import { generate } from "../../../puzzles/grid/generate.ts";

describe("bands", () => {
  it("each band holds the techniques of the one before", () => {
    for (let k = 1; k < BAND_LIST.length; k++) {
      const lower = techniquesOf(BAND_LIST[k - 1]), upper = techniquesOf(BAND_LIST[k]);
      expect(lower.every((t) => upper.includes(t))).toBe(true);
    }
    expect(techniquesOf(bandNamed("easy"))).toEqual([]);
    expect(techniquesOf(bandNamed("medium")).sort()).toEqual(["pairs", "strips"]);
    expect(techniquesOf(bandNamed("expert"))).toEqual(expect.arrayContaining(["count", "lines", "loop", "component", "parity", "reach"]));
  });
  it("takes one technique away", () => {
    const hard = bandNamed("hard");
    expect(without(hard, "pairs").stages).toBe("t0,strips+triples,count,extra+components");
    expect(without(hard, "count").stages).toBe("t0,pairs+strips+triples,extra+components");
    expect(without(hard, "loop").lemmas).toEqual([]);
    expect(without(hard, "lines").lines).toBe(false);
    expect(() => without(hard, "magic")).toThrow();
  });
  it("never allows a case split or search", () => {
    for (const b of BAND_LIST) expect(optionsOf(b).maxTier).toBe(1);
  });
  it("expert for every genre (it holds the mined families as well as the lemmas)", () => {
    expect(expertApplies("slitherlink")).toBe(true);    // loop parity, pockets
    expect(expertApplies("hitori")).toBe(true);         // components
    expect(expertApplies("minesweeper")).toBe(true);    // mined clue chains
  });
});

describe("balancing", () => {
  it("rarity is high for families not seen yet", () => {
    const counts = new Map([["a", 100], ["b", 0]]);
    expect(rarityOf({ b: 3 }, counts)).toBeGreaterThan(rarityOf({ a: 3 }, counts));
    expect(rarityOf({}, counts)).toBe(0);
  });
  it("extra jobs go to the arm with the rarest families that succeeds", () => {
    const stats = new Map<string, ArmStats>([
      ["x", { attempts: 10, made: 9, rarity: [0.05, 0.05] }],
      ["y", { attempts: 10, made: 8, rarity: [0.6, 0.7] }],
      ["z", { attempts: 10, made: 0, rarity: [] }],
    ]);
    expect(pickArm(["x", "y", "z"], stats, () => false)).toBe("y");
    expect(pickArm(["x", "y", "z"], stats, (a) => a === "y")).toBe("x");
    expect(pickArm(["x"], stats, () => true)).toBeNull();
  });
  it("seeds differ between arms and repeat within one", () => {
    expect(seedOf("akari|7|easy", 0)).toBe(seedOf("akari|7|easy", 0));
    expect(seedOf("akari|7|easy", 0)).not.toBe(seedOf("akari|7|hard", 0));
    expect(seedOf("akari|7|easy", 1)).toBe(seedOf("akari|7|easy", 0) + 1);
  });
});

describe("shortlist", () => {
  it("ranks run 0 to 1 with ties shared", () => {
    expect(ranks01([3, 1, 2])).toEqual([1, 0, 0.5]);
    expect(ranks01([1, 1])).toEqual([0.5, 0.5]);
    expect(ranks01([7])).toEqual([0.5]);
  });
  it("sparse clues and a required technique score higher", () => {
    const p = (key: string, density: number, required: string[]): Generated => ({ key, genre: "akari", size: 7, band: "hard", status: "ok", seed: 1, spec: {}, clues: 10, steps: 30, cells: 49, estimate: 0.4, required,
      interest: { busywork: 0.3, flowSpread: 1, variety: 3, breakIn: 1, stuck: 0 }, looks: { density, sym: 1 } });
    const s = scoreGenre([p("dense", 0.4, []), p("sparse", 0.1, ["count"])]);
    expect(s[1].score).toBeGreaterThan(s[0].score);
    expect(s[1].reasons.join(" ")).toContain("needs count");
  });
});

describe("generating with the solver in the loop", () => {
  it("makes a puzzle the easy band solves without search", async () => {
    const easy = bandNamed("easy");
    const spec = await generate({ genre: "akari", rows: 5, cols: 5, seed: 3, accept: async (s) => (await quickSolve(s, easy)).solved });
    expect(spec).not.toBeNull();
    expect((await quickSolve(spec!, easy)).solved).toBe(true);
    expect(await bandOf(spec!)).toBe(0);
  }, 60000);
});
