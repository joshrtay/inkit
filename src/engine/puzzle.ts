// Genres (presets of marks + rules + style), turning a description into a Puzzle, and
// checking a whole board against every rule.
import { squareGrid } from "./geometry.ts";
import { regionsOf, type Regions } from "./derive.ts";
import { blockFor } from "./rules.ts";
import type { Board, Given, GridSpec, GridStyle, MarkKind, Problem, Puzzle, RuleSpec } from "./types.ts";

export interface Genre { marks: MarkKind[]; rules: RuleSpec[]; style: GridStyle }

export const genres: Record<string, Genre> = {
  slitherlink: {
    marks: ["fence"],
    rules: [{ rule: "loop", of: "fence" }, { rule: "sides" }],
    style: { grid: "dots" },
  },
  nurikabe: {
    marks: ["shade"],
    rules: [{ rule: "size-clue" }, { rule: "one-each", of: "number" }, { rule: "connected" }, { rule: "no-pool" }],
    style: {},
  },
  // our region-division puzzles in the style of The Artisan of Glimmith: each puzzle lists its rules
  panes: {
    marks: ["regions"],
    rules: [],
    style: { palette: ["#e2667a", "#4f9fdc", "#f2c23a", "#6cbf7e", "#a77bd6", "#f29a52"] },
  },
};

export function makePuzzle(spec: GridSpec): Puzzle {
  const genre = spec.genre ? genres[spec.genre] : undefined;
  if (spec.genre && !genre) throw new Error(`unknown genre "${spec.genre}"`);
  const grid = squareGrid(spec.size[0], spec.size[1]);
  const cellGivens = new Map<number, Given[]>(), borderGivens = new Map<number, Given[]>();
  const push = <K>(m: Map<K, Given[]>, k: K, g: Given) => m.set(k, [...(m.get(k) ?? []), g]);
  for (const g of spec.givens ?? []) {
    if (g.at === "cell") push(cellGivens, grid.cell(...g.cell), g);
    else {
      const e = grid.borderBetween(grid.cell(...g.cells[0]), grid.cell(...g.cells[1]));
      if (e < 0) throw new Error(`a ${g.kind} mark needs two neighbouring cells`);
      push(borderGivens, e, g);
    }
  }
  const rules = [...(genre?.rules ?? []), ...(spec.rules ?? [])];
  rules.forEach(blockFor);   // fails early on an unknown rule
  return {
    spec, grid, cellGivens, borderGivens, rules,
    marks: spec.marks ?? genre?.marks ?? [],
    style: { ...genre?.style, ...spec.style },
  };
}

/** Every broken rule on this board; an empty list means it's solved. */
export function check(p: Puzzle, b: Board): Problem[] {
  let reg: Regions | undefined;
  const regions = () => (reg ??= regionsOf(p, b));
  return p.rules.flatMap((s) => blockFor(s).check(s, p, b, regions));
}

/** The rules in plain words, for the "How to play" card. */
export const describe = (p: Puzzle) => p.rules.map((s) => blockFor(s).describe(s, p));
