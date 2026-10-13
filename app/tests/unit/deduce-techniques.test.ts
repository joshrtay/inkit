// The deduction solver's per-genre techniques (puzzles/difficulty/deduce.ts TECHNIQUES), which only
// the generator's expert band uses (bands.ts): each is sound (deduce checks every fact it settles
// against the solution and throws on a wrong one, so solving every example of its genre with it on
// is the test), named in quick steps, and off by default.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bandNamed, optionsOf, quickSolve, techniquesOf, without } from "../../../puzzles/difficulty/bands.ts";
import { deduce, TECHNIQUES, techniqueApplies } from "../../../puzzles/difficulty/deduce.ts";
import { makePuzzle } from "../../../src/engine/puzzle.ts";
import type { GridSpec } from "../../../src/engine/types.ts";

const examples = (genre: string) => readdirSync(new URL(`../../../src/games/${genre}/`, import.meta.url)).filter((f) => f.endsWith(".json"))
  .map((f) => [`${genre}/${f}`, { genre, ...JSON.parse(readFileSync(new URL(`../../../src/games/${genre}/${f}`, import.meta.url), "utf8")).grid } as GridSpec] as const);

/** each technique's genres, and whether the expert band solves all their examples */
const GENRES: Record<string, string[]> = {
  rects: ["shikaku"],
  mines: ["minesweeper"],
  ends: ["simple-path"],
  cuts: ["simple-path"],
  mirror: ["spiral-galaxies"],
  distance: ["hidoku"],
  deadends: ["hidoku"],
};
const expert = bandNamed("expert");

describe("per-genre techniques", () => {
  it("are all in the expert band, and only there", () => {
    expect(Object.keys(GENRES).sort()).toEqual(Object.keys(TECHNIQUES).sort());
    expect(techniquesOf(expert)).toEqual(expect.arrayContaining(Object.keys(TECHNIQUES)));
    for (const name of ["easy", "medium", "hard"]) expect(techniquesOf(bandNamed(name)).filter((t) => t in TECHNIQUES)).toEqual([]);
    expect(without(expert, "rects").techniques).not.toContain("rects");
  });

  for (const [t, genres] of Object.entries(GENRES)) {
    it.each(genres.flatMap(examples))(`${t}: %s, sound and solved in the expert band`, async (_name, spec) => {
      expect(techniqueApplies(t, makePuzzle(spec), spec.genre)).toBe(true);
      const q = await quickSolve(spec, expert, 60000);
      expect(q.error).toBeUndefined();
      expect(q.solved).toBe(true);
      // explained too (the full solve the generator records)
      const full = await deduce(spec, optionsOf(expert, { budgetMs: 60000 }));
      expect(full.profile.solved).toBe(true);
    }, 120000);
  }

  it("rects: Shikaku needs it (no band solves the examples without it), and steps name it", async () => {
    const [, spec] = examples("shikaku")[0];
    expect((await quickSolve(spec, without(expert, "rects"), 60000)).solved).toBe(false);
    expect((await quickSolve(spec, expert, 60000)).used).toContain("rects");
  }, 120000);

  it("off by default", async () => {
    const [, spec] = examples("shikaku")[0];
    const { path } = await deduce(spec, { quick: true, maxTier: 1 });
    expect(path.flatMap((s) => s.uses)).not.toContain("rects");
  }, 60000);
});
