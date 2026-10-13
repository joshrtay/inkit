// The deduction solver's per-genre techniques (puzzles/difficulty/deduce.ts TECHNIQUES), which only
// the generator's bands use (bands.ts: all in expert, each genre's basic ones in hard): each is sound (deduce checks every fact it settles
// against the solution and throws on a wrong one, so solving every example of its genre with it on
// is the test), named in quick steps, and off by default.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bandNamed, HARD_TECHNIQUES, optionsOf, quickSolve, techniquesOf, without } from "../../../puzzles/difficulty/bands.ts";
import { deduce, TECHNIQUES, techniqueApplies } from "../../../puzzles/difficulty/deduce.ts";
import { makePuzzle } from "../../../src/engine/puzzle.ts";
import type { GridSpec } from "../../../src/engine/types.ts";

const examples = (genre: string) => readdirSync(new URL(`../../../src/games/${genre}/`, import.meta.url)).filter((f) => f.endsWith(".json"))
  .map((f) => [`${genre}/${f}`, { genre, ...JSON.parse(readFileSync(new URL(`../../../src/games/${genre}/${f}`, import.meta.url), "utf8")).grid } as GridSpec] as const);

/** each technique's genres (the expert band, with every technique, solves their examples but these) */
const GENRES: Record<string, string[]> = {
  rects: ["shikaku"],
  rectpairs: ["shikaku"],
  mines: ["minesweeper"],
  chains: ["minesweeper"],
  ends: ["simple-path", "numberlink"],
  cuts: ["simple-path", "numberlink"],
  owners: ["numberlink"],
  mirror: ["spiral-galaxies"],
  distance: ["hidoku"],
  deadends: ["hidoku"],
  fish: ["easy-as-abc"],
  slots: ["fill-in"],
  sizes: ["fillomino"],
  shapes: ["fillomino"],
};
const UNSOLVED = new Set(["numberlink/1.json", "fillomino/1.json", "fillomino/2.json", "fillomino/3.json"]);
const expert = bandNamed("expert");

describe("per-genre techniques", () => {
  it("are all in the expert band; hard has a genre's basic ones; easy and medium none", () => {
    expect(Object.keys(GENRES).sort()).toEqual(Object.keys(TECHNIQUES).sort());
    expect(techniquesOf(expert)).toEqual(expect.arrayContaining(Object.keys(TECHNIQUES)));
    const hard = bandNamed("hard");
    for (const name of ["easy", "medium"]) for (const g of Object.keys(HARD_TECHNIQUES)) expect(techniquesOf(bandNamed(name), g).filter((t) => t in TECHNIQUES)).toEqual([]);
    expect(techniquesOf(hard).filter((t) => t in TECHNIQUES)).toEqual([]);
    expect(techniquesOf(hard, "sudoku").filter((t) => t in TECHNIQUES)).toEqual([]);
    for (const [g, ts] of Object.entries(HARD_TECHNIQUES)) {
      expect(techniquesOf(hard, g).filter((t) => t in TECHNIQUES).sort()).toEqual([...ts].sort());
      for (const t of ts) expect(GENRES[t]).toContain(g);   // each applies to its genre
    }
    expect(techniquesOf(hard, "minesweeper")).toContain("mines");
    expect(techniquesOf(hard, "minesweeper")).not.toContain("chains");
    expect(techniquesOf(hard, "simple-path")).not.toContain("cuts");
    expect(without(expert, "rects").techniques).not.toContain("rects");
    expect(techniquesOf(without(hard, "rects"), "shikaku")).not.toContain("rects");
    expect(optionsOf(hard, {}, "spiral-galaxies").techniques).toEqual(["mirror"]);
    expect(optionsOf(hard).techniques).toEqual([]);
  });

  const genres = [...new Set(Object.values(GENRES).flat())];
  it.each(genres.flatMap(examples))("%s: sound, and solved in the expert band", async (name, spec) => {
    for (const [t, gs] of Object.entries(GENRES)) expect(techniqueApplies(t, makePuzzle(spec), spec.genre)).toBe(gs.includes(spec.genre!));
    const q = await quickSolve(spec, expert, 60000);
    expect(q.error).toBeUndefined();
    expect(q.solved).toBe(!UNSOLVED.has(name));
    // explained too (the full solve the generator records)
    const full = await deduce(spec, optionsOf(expert, { budgetMs: 60000 }));
    expect(full.profile.solved).toBe(!UNSOLVED.has(name));
  }, 120000);

  it("rects: Shikaku needs it (no band solves the examples without it), and steps name it", async () => {
    const [, spec] = examples("shikaku")[0];
    expect((await quickSolve(spec, without(expert, "rects"), 60000)).solved).toBe(false);
    expect((await quickSolve(spec, expert, 60000)).used).toContain("rects");
    // hard has it for Shikaku: the example is hard, not expert
    expect((await quickSolve(spec, bandNamed("hard"), 60000)).solved).toBe(true);
    expect((await quickSolve(spec, bandNamed("medium"), 60000)).solved).toBe(false);
  }, 120000);

  it("off by default", async () => {
    const [, spec] = examples("shikaku")[0];
    const { path } = await deduce(spec, { quick: true, maxTier: 1 });
    expect(path.flatMap((s) => s.uses)).not.toContain("rects");
  }, 60000);
});
