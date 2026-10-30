// The deduction solver's local encodings (puzzles/difficulty/local.ts)
// mean the same as the engine's: every example has the same answers (the cut links) under both,
// and they ground small.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clingoJson, ground, loadClingo } from "../../../puzzles/difficulty/clingo.ts";
import { localProgram } from "../../../puzzles/difficulty/local.ts";
import { makePuzzle } from "../../../src/engine/puzzle.ts";
import { program } from "../../../src/engine/encode.ts";
import type { GridSpec } from "../../../src/engine/types.ts";

const examples = (genre: string) => readdirSync(new URL(`../../../src/games/${genre}/`, import.meta.url)).filter((f) => f.endsWith(".json"))
  .map((f) => [`${genre}/${f}`, { genre, ...JSON.parse(readFileSync(new URL(`../../../src/games/${genre}/${f}`, import.meta.url), "utf8")).grid } as GridSpec] as const);
// up to two: a published puzzle has exactly one, and a second would show the encodings differ
const answers = (text: string, mark = "cut(") => (clingoJson(text, 2).Call?.[0]?.Witnesses ?? [])
  .map((w) => w.Value.filter((v) => v.startsWith(mark)).sort().join(" ")).sort();

describe("local encodings", () => {
  it.each([...examples("shikaku"), ...examples("square-jam")])("%s: the same answers as the engine's", async (_name, spec) => {
    await loadClingo();
    const p = makePuzzle(spec), local = localProgram(p, spec.genre);
    expect(local).not.toBeNull();
    const mine = answers(local!.plain), theirs = answers(program(p));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine).toEqual(theirs);
    // and small, ground: a few hundred rules
    expect(ground(local!.plain).split("\n").length).toBeLessThan(1500);
  }, 60000);
  // Nurikabe (shaded cells) and Fillomino (cut links): owners within reach, no region pairs
  it.each([...examples("nurikabe"), ...examples("fillomino")])("%s: the same answers as the engine's, ground far smaller", async (_name, spec) => {
    await loadClingo();
    if (spec.genre === "fillomino") process.env.DEDUCE_LOCAL = "fillomino";   // (off by default)
    const p = makePuzzle(spec), local = localProgram(p, spec.genre);
    delete process.env.DEDUCE_LOCAL;
    if (!local) return;   // (other rules: an allowed-sizes Fillomino)
    const mark = spec.genre === "nurikabe" ? "shaded(" : "cut(";
    const mine = answers(local.plain, mark), theirs = answers(program(p), mark);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine).toEqual(theirs);
    expect(ground(local.plain).length).toBeLessThan(ground(program(p)).length / 3);
  }, 120000);
  it("leaves other puzzles to the engine", () => {
    const [, sudoku] = examples("sudoku")[0];
    expect(localProgram(makePuzzle(sudoku), "sudoku")).toBeNull();
  });
});
