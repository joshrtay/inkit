// Generating puzzles that afford techniques (puzzles/difficulty/bands.ts, gen-set.ts, gen-best.ts):
// the bands as technique sets, taking one technique away, the balancing arithmetic, the shortlist's
// ranks, and one real band-limited puzzle from the generator.
import { describe, expect, it } from "vitest";
import { BAND_LIST, bandNamed, bandOf, expertApplies, optionsOf, quickSolve, techniquesOf, without } from "../../../puzzles/difficulty/bands.ts";
import { aimHigher, armOf, armWeight, deficits, drawByShares, keyOf, pickArm, pickArmHuman, rarityOf, seedOf, variantOptions, type ArmStats } from "../../../puzzles/difficulty/gen-set.ts";
import { breakInScore } from "../../../puzzles/difficulty/interest.ts";
import type { Step } from "../../../puzzles/difficulty/deduce.ts";
import { makePuzzle } from "../../../src/engine/puzzle.ts";
import { solve } from "../../../src/engine/solve.ts";
import { ranks01, scoreGenre, type Generated } from "../../../puzzles/difficulty/gen-best.ts";
import { generate, isSymmetric } from "../../../puzzles/grid/generate.ts";

describe("bands", () => {
  it("each band holds the techniques of the one before", () => {
    for (let k = 1; k < BAND_LIST.length; k++) {
      for (const g of [undefined, "sudoku", "spiral-galaxies", "minesweeper", "numberlink"]) {
        const lower = techniquesOf(BAND_LIST[k - 1], g), upper = techniquesOf(BAND_LIST[k], g);
        expect(lower.every((t) => upper.includes(t))).toBe(true);
      }
    }
    expect(techniquesOf(bandNamed("easy"))).toEqual([]);
    expect(techniquesOf(bandNamed("medium")).sort()).toEqual(["pairs", "strips"]);
    expect(techniquesOf(bandNamed("expert"))).toEqual(expect.arrayContaining(["count", "lines", "loop", "component", "parity", "reach"]));
  });
  it("takes one technique away", () => {
    const hard = bandNamed("hard");
    expect(without(hard, "pairs").stages).toBe("t0,strips+triples,count,techniques,extra+components");
    expect(without(hard, "count").stages).toBe("t0,pairs+strips+triples,techniques,extra+components");
    expect(without(hard, "mirror").byGenre?.["spiral-galaxies"]).toEqual([]);
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
  it("aims higher with the generator's options only above easy, for the genres that need them", () => {
    expect(aimHigher("fill-in", 2)).toHaveProperty("digits");
    expect(aimHigher("minesweeper", 1)).toEqual({ denseMines: true });
    expect(aimHigher("minesweeper", 3).insistMs).toBeGreaterThan(0);
    expect(aimHigher("simple-loop", 3).insistMs).toBeGreaterThan(0);
    expect(aimHigher("simple-loop", 1)).toEqual({});
    expect(aimHigher("akari", 2)).toEqual({});
  });
  it("seeds differ between arms and repeat within one", () => {
    expect(seedOf("akari|7|easy", 0)).toBe(seedOf("akari|7|easy", 0));
    expect(seedOf("akari|7|easy", 0)).not.toBe(seedOf("akari|7|hard", 0));
    expect(seedOf("akari|7|easy", 1)).toBe(seedOf("akari|7|easy", 0) + 1);
  });
});

describe("aiming at human-made puzzles", () => {
  it("an arm's settings join its key only when it has some", () => {
    expect(armOf({ genre: "akari", size: 7, target: "hard" })).toBe("akari|7|hard");
    expect(keyOf({ genre: "akari", size: 7, target: "hard", seed: 4 })).toBe("akari|7|hard|4");
    expect(armOf({ genre: "star-battle", size: 10, target: "hard", variant: "stars=2" })).toBe("star-battle|10|hard|stars=2");
  });
  it("settings become the generator's options; symmetry only where it applies", () => {
    expect(variantOptions("star-battle", "stars=2", 1)).toEqual({ stars: 2 });
    expect(variantOptions("easy-as-abc", "letters=4", 1)).toEqual({ letters: 4 });
    expect(variantOptions("akari", "sym=rot180", 1)).toEqual({ symmetry: "rot180" });
    expect(variantOptions("nurikabe", "sym=rot180", 1)).toEqual({});
    expect(variantOptions("akari", undefined, 1)).toEqual({});
    // drawn by the targets' shares, the same for the same seed
    expect(variantOptions("akari", "sym=human", 3, { symmetry: { mirror: 1 } })).toEqual({ symmetry: "mirror" });
    expect(variantOptions("akari", "sym=human", 3, { symmetry: { none: 1 } })).toEqual({});
  });
  it("draws by shares", () => {
    const n = { a: 0, b: 0 };
    for (let s = 0; s < 2000; s++) n[drawByShares({ a: 3, b: 1 }, s) as "a" | "b"]++;
    expect(n.a / 2000).toBeGreaterThan(0.68);
    expect(n.a / 2000).toBeLessThan(0.82);
    expect(drawByShares({ a: 1, b: 1 }, 9)).toBe(drawByShares({ a: 1, b: 1 }, 9));
    expect(drawByShares({}, 1)).toBeUndefined();
  });
  it("weights arms by the human sizes and settings", () => {
    const t = { sizes: { "10": 0.7, "8": 0.2 }, settings: { stars: { "2": 0.8, "1": 0.2 } } };
    expect(armWeight(10, "stars=2", t)).toBeCloseTo(0.56);
    expect(armWeight(8, "stars=1", t)).toBeCloseTo(0.04);
    expect(armWeight(6, undefined, t)).toBeLessThan(0.05);
    expect(armWeight(6, "stars=2")).toBe(1);
  });
  it("extra jobs go to the arm whose families the genre is short of", () => {
    const d = deficits({ chain: 0.5, single: 0.5 }, new Map([["single", 90], ["chain", 10]]));
    expect(d.get("chain")).toBeCloseTo(0.4);
    expect(d.has("single")).toBe(false);
    const stats = new Map<string, ArmStats>([
      ["x", { attempts: 10, made: 9, rarity: [0.1, 0.1, 0.1], fams: { single: 30 } }],
      ["y", { attempts: 10, made: 6, rarity: [0.1, 0.1, 0.1], fams: { single: 10, chain: 20 } }],
    ]);
    expect(pickArmHuman(["x", "y"], stats, () => false, () => d)).toBe("y");
    // no human mix: rarity, as pickArm
    expect(pickArmHuman(["x", "y"], stats, () => false, () => null)).toBe("x");
  });
  it("scores a break-in: one costly step, then cheap ones", () => {
    const path = (costs: number[]) => costs.map((cost) => ({ cost, tier: cost > 3 ? 1 : 0, where: "", cells: [], facts: [], uses: [] }) as unknown as Step);
    expect(breakInScore(path([2, 2, 2, 9, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2]))).toBeGreaterThan(0.6);
    expect(breakInScore(path([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]))).toBe(0);
    expect(breakInScore(path([2, 2, 9, 8, 9, 8, 9, 8, 9, 8, 9]))).toBeLessThan(0.1);
    expect(breakInScore(path([9, 1, 1]))).toBe(0);
  });
  it("makes symmetric clue layouts that stay unique, and Easy as ABC with more letters", async () => {
    for (const [genre, n, symmetry] of [["slitherlink", 5, "rot180"], ["akari", 6, "mirror"], ["sudoku", 4, "rot180"]] as const) {
      const spec = await generate({ genre, rows: n, cols: n, seed: 5, symmetry });
      expect(spec).not.toBeNull();
      expect(isSymmetric(spec!, symmetry)).toBe(true);
      expect((await solve(makePuzzle(spec!), 2)).length).toBe(1);
    }
    const abc = await generate({ genre: "easy-as-abc", rows: 5, cols: 5, seed: 2, letters: 4 });
    expect(abc!.style?.symbols).toBe("ABCD");
    expect((await solve(makePuzzle(abc!), 2)).length).toBe(1);
  }, 60000);
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
  it("Fill-in from few digits, and denser Minesweeper with no 0 shown", async () => {
    const fill = await generate({ genre: "fill-in", rows: 5, cols: 5, seed: 7, digits: 3 });
    expect(fill).not.toBeNull();
    expect(new Set(fill!.entries!.join("")).size).toBeLessThanOrEqual(3);
    const mines = await generate({ genre: "minesweeper", rows: 6, cols: 6, seed: 7, denseMines: true });
    expect(mines).not.toBeNull();
    expect(mines!.givens!.every((x) => !("value" in x) || x.value !== 0)).toBe(true);
  }, 60000);
});
