// Opening a Penpa+ link (app/lib/import-penpa.ts): the grids Penpa+ itself drew from puzz.link
// links (its own import's test snapshots) read as the same puzzles our puzz.link reader makes;
// our examples written as Penpa+ links (by penpa-link.ts, after Penpa+'s maketext) open as
// themselves, their type guessed from what's drawn, or narrowed by a stored solution, or asked;
// a type we don't have comes back as unsupported; a link that isn't one, as unreadable.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { solve } from "~site/engine/solve.ts";
import type { GridSpec } from "~site/engine/types.ts";
import { readLink } from "~/lib/import-link";
import { penpaPuzzle, readPenpaGrid, type PenpaGrid } from "~/lib/import-penpa";
import { drawn, penpaLink, solutionOf, type Drawn } from "./penpa-link";
import { FOLDER_GENRE, specOf } from "~/sketchpad/from-puzzle";
import { normalSpec } from "~/sketchpad/to-puzzle";

async function grid(link: string): Promise<PenpaGrid> {
  const g = await readPenpaGrid(link);
  expect(g, link).not.toBeNull();
  return g!;
}

// ---- Penpa+'s own drawings of puzz.link puzzles ----

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/penpa-puzzlink.json", import.meta.url), "utf8")) as {
  puzzles: { name: string; url: string; grid_type: string; grid_size: [number, number]; outside_spacing: number[]; genre_tags: string[]; contents: Record<string, unknown> }[];
};

describe("Penpa+'s drawings of puzz.link puzzles", () => {
  for (const f of FIXTURE.puzzles) {
    it(`${f.name}: the same puzzle as the puzz.link link`, async () => {
      const want = await readLink(f.url);
      expect(want.kind, f.url).toBe("puzzle");
      const spec = (want as Extract<typeof want, { kind: "puzzle" }>).spec;
      const d: Drawn = { gridtype: f.grid_type, nx: f.grid_size[0] - 4, ny: f.grid_size[1] - 4, space: f.outside_spacing, q: f.contents, tags: f.genre_tags };
      const g = await grid(await penpaLink(d));
      // by its tag
      const tagged = penpaPuzzle(g);
      expect(tagged?.kind, f.name).toBe("puzzle");
      expect(normalSpec((tagged as { spec: GridSpec }).spec)).toEqual(normalSpec(spec));
      // with no tag: the type guessed, or offered among others
      const untagged = penpaPuzzle({ ...g, tags: [] });
      if (untagged?.kind === "puzzle") expect(normalSpec(untagged.spec)).toEqual(normalSpec(spec));
      else expect(untagged, f.name).toMatchObject({ kind: "choose", genres: expect.arrayContaining([spec.genre]) });
      // and chosen
      expect(normalSpec((penpaPuzzle({ ...g, tags: [] }, spec.genre) as { spec: GridSpec }).spec)).toEqual(normalSpec(spec));
    });
  }
});

// ---- our examples as Penpa+ links ----

const GAMES = new URL("../../../src/games/", import.meta.url).pathname;
const example = (folder: string, n = 1) => specOf(FOLDER_GENRE[folder] ?? folder, JSON.parse(readFileSync(`${GAMES}${folder}/${n}.json`, "utf8")));

describe("our examples as Penpa+ links", () => {
  it.each([["star-battle"], ["masyu"], ["spiral-galaxies"], ["akari"], ["aquarium"], ["sudoku", 3], ["hitori"], ["numberlink"]] as [string, number?][])(
    "%s: the type is clear from what's drawn", async (folder, n) => {
      const spec = example(folder, n);
      if (folder === "numberlink") delete spec.rules;   // Numberlink (not every cell used): pairs of numbers
      const got = penpaPuzzle(await grid(await penpaLink(drawn(spec))));
      expect(got?.kind, folder).toBe("puzzle");
      expect(normalSpec((got as { spec: GridSpec }).spec)).toEqual(normalSpec(spec));
    });

  it("black squares alone: Simple Loop or Akari, the creator chooses; tagged, it opens", async () => {
    const spec = example("round-the-bend", 7), d = drawn(spec);
    expect(penpaPuzzle(await grid(await penpaLink(d)))).toEqual({ kind: "choose", genres: ["akari", "simple-loop"] });
    const tagged = penpaPuzzle(await grid(await penpaLink({ ...d, tags: ["simple loop"] })));
    expect(normalSpec((tagged as { spec: GridSpec }).spec)).toEqual(normalSpec(spec));
  });

  it("numbers alone: the creator chooses, among the types they fit", async () => {
    const spec = example("nurikabe");
    const got = penpaPuzzle(await grid(await penpaLink(drawn(spec))));
    expect(got).toMatchObject({ kind: "choose", genres: expect.arrayContaining(["nurikabe", "shikaku", "cave", "fillomino"]) });
    // not ones whose numbers can't be that big, or don't come in pairs
    expect((got as { genres: string[] }).genres).not.toContain("slitherlink");
    expect((got as { genres: string[] }).genres).not.toContain("numberlink");
  });

  it("numbers with a stored solution: the solution says which", async () => {
    for (const folder of ["nurikabe", "cave", "slitherlink", "shikaku", "minesweeper"]) {
      const spec = example(folder), d = drawn(spec), [board] = await solve(makePuzzle(spec), 1);
      const got = penpaPuzzle(await grid(await penpaLink({ ...d, solution: solutionOf(spec, board, d) })));
      expect(got?.kind, folder).toBe("puzzle");
      expect(normalSpec((got as { spec: GridSpec }).spec), folder).toEqual(normalSpec(spec));
    }
  }, 60_000);

  it("a Star Battle's stars in its solution give how many per row", async () => {
    // puzz.link's two-star test puzzle, without Penpa+'s "2 ★" beside it
    const read = await readLink(FIXTURE.puzzles.find((f) => f.name === "Starbattle 1")!.url);
    const spec = (read as Extract<typeof read, { kind: "puzzle" }>).spec, d = drawn(spec);
    expect(spec.rules).toEqual([{ rule: "shaded-per-line", n: 2 }, { rule: "shaded-per-area", n: 2 }]);
    const [board] = await solve(makePuzzle(spec), 1);
    expect((penpaPuzzle(await grid(await penpaLink(d))) as { spec: GridSpec }).spec.rules).toBeUndefined();
    const got = penpaPuzzle(await grid(await penpaLink({ ...d, solution: solutionOf(spec, board, d) })));
    expect((got as { spec: GridSpec }).spec.rules).toEqual(spec.rules);
  }, 60_000);
});

describe("readLink with a Penpa+ link", () => {
  it("a clear type opens; numbers alone ask; the type chosen opens", async () => {
    const masyu = example("masyu");
    expect(await readLink(await penpaLink(drawn(masyu)))).toMatchObject({ kind: "puzzle", source: "penpa", spec: { genre: "masyu" } });
    const nurikabe = example("nurikabe"), link = await penpaLink(drawn(nurikabe));
    expect(await readLink(link)).toMatchObject({ kind: "choose", source: "penpa", genres: expect.arrayContaining(["nurikabe"]) });
    const chosen = await readLink(link, "nurikabe");
    expect(chosen.kind === "puzzle" && normalSpec(chosen.spec)).toEqual(normalSpec(nurikabe));
    // a type the drawing can't be
    expect((await readLink(link, "masyu")).kind).toBe("unreadable");
  });
  it("a type we don't have: unsupported, from Penpa+", async () => {
    expect(await readLink(await penpaLink(drawn(example("star-battle"), ["heyawake"])))).toEqual({ kind: "unsupported", source: "penpa", genreId: "heyawake", genreName: "Heyawake" });
  });
});

describe("other Penpa+ links", () => {
  it("tagged as a type we don't have: unsupported, with its name", async () => {
    const d = drawn(example("star-battle"), ["heyawake"]);
    expect(penpaPuzzle(await grid(await penpaLink(d)))).toEqual({ kind: "unsupported", genreId: "heyawake", genreName: "Heyawake" });
    expect(penpaPuzzle(await grid(await penpaLink({ ...d, tags: ["killer"] })))).toMatchObject({ kind: "unsupported", genreName: "Killer Sudoku" });
  });
  it("a drawing none of our types fits, untagged: unsupported, unnamed", async () => {
    const d = drawn(example("nurikabe"));
    (d.q.symbol as Record<string, unknown>)[String((2 + 0) * (d.nx + 4) + 3)] = [1, "circle_L", 1];
    expect(penpaPuzzle(await grid(await penpaLink(d)))).toEqual({ kind: "unsupported", genreId: "unknown", genreName: "" });
  });
  it("garbage: no grid", async () => {
    for (const link of ["https://swaroopg92.github.io/penpa-edit/#m=edit&p=notbase64!!", "https://swaroopg92.github.io/penpa-edit/", "#p=AAAA"])
      expect(await readPenpaGrid(link), link).toBeNull();
  });
});

// every example folder this file uses exists
it("the examples are there", () => {
  const folders = readdirSync(GAMES);
  for (const f of ["star-battle", "masyu", "spiral-galaxies", "round-the-bend", "akari", "aquarium", "sudoku", "hitori", "numberlink", "nurikabe", "cave", "slitherlink", "shikaku", "minesweeper"])
    expect(folders).toContain(f);
});
