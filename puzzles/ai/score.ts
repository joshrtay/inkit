// Scoring a candidate puzzle for an AI creator's post: how hard it is (0..1, to compare with the
// day's target) and how good (0..1, against the persona's quality targets in
// app/app/ai/personas.ts), with notes saying why. puzzles/ai/week.ts makes several candidates per
// post and keeps the one closest to the target difficulty among the good ones.
//
// The scorer is pluggable: anything of type `Scorer`. Today's is `proxyScorer`, a rough proxy
// (board size, clue density, clingo's search statistics, and the cheap checks from
// docs/panel-design.md and docs/design-grant.md). It will be replaced by a step-by-step deduction
// solver (panel-design §3 and §9: propagation rounds, case-split depth, entry points, flow vs gem,
// which clues each step uses) and later a learned "looks like an acclaimed puzzle" scorer; both
// read the same persona targets, so only this module changes.
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { program, solve } from "../../src/engine/solve.ts";
import type { Given, GridSpec } from "../../src/engine/types.ts";
import type { GenrePlan, Persona } from "../../app/app/ai/personas.ts";
import type { Slot } from "../../app/app/ai/schedule.ts";

export interface Candidate {
  spec: GridSpec;
  /** the plan it was made from (genre, its size range) */
  plan: GenrePlan;
}

export interface Score {
  /** 0 (a warm-up) .. 1 (the hardest this persona makes) */
  difficulty: number;
  /** 0 .. 1; 0 means rejected (see notes) */
  quality: number;
  notes: string[];
  /** raw measures, for the record */
  measures: Record<string, number>;
}

export type Scorer = (c: Candidate, persona: Persona, slot: Slot) => Promise<Score>;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Clues a solver reads (a panel's start and end are structure, not clues). */
export const cluesOf = (spec: GridSpec) => (spec.givens ?? []).filter((g) => g.kind !== "start" && g.kind !== "end");

/** clingo's search statistics for proving the puzzle: choices and conflicts. Zero choices means
 *  propagation alone found the answer (a rough sign of "no guessing needed"). */
async function searchStats(spec: GridSpec) {
  const clingo = await import("clingo-wasm");
  const res = await clingo.run(program(makePuzzle(spec)), 2, ["--project=show", "--stats"]) as { Stats?: { Core?: { Choices?: number; Conflicts?: number } } };
  return { choices: res.Stats?.Core?.Choices ?? 0, conflicts: res.Stats?.Core?.Conflicts ?? 0 };
}

/** The share of clued cells whose 180°-turned partner is clued too (1 = symmetric layout). */
function symmetryOf(spec: GridSpec) {
  const [rows, cols] = spec.size;
  const cells = new Set(cluesOf(spec).flatMap((g) => (g.at === "cell" ? [`${g.cell[0]},${g.cell[1]}`] : [])));
  if (!cells.size) return 1;
  let paired = 0;
  for (const k of cells) { const [r, c] = k.split(",").map(Number); if (cells.has(`${rows - 1 - r},${cols - 1 - c}`)) paired++; }
  return paired / cells.size;
}

const kindKey = (g: Given) => g.kind;

/** The proxy scorer: size, clue density, clingo statistics, and cheap quality checks. */
export const proxyScorer: Scorer = async ({ spec, plan }, persona) => {
  const q = persona.quality, notes: string[] = [];
  const [rows, cols] = spec.size, cells = rows * cols;
  const clues = cluesOf(spec), density = clues.length / cells;
  const { choices, conflicts } = await searchStats(spec);

  // ---- difficulty: bigger, sparser and more search are harder ----
  const areas = plan.sizes.map(([r, c]) => r * c), lo = Math.min(...areas), hi = Math.max(...areas);
  const sizeNorm = hi > lo ? clamp01((cells - lo) / (hi - lo)) : 0.5;
  const [dlo, dhi] = q.clueDensity;
  const sparsity = dhi > dlo ? clamp01(1 - (density - dlo) / (dhi - dlo)) : 0.5;
  const search = clamp01(Math.log2(1 + choices + 2 * conflicts) / 8);
  const difficulty = clamp01(0.5 * sizeNorm + 0.2 * sparsity + 0.3 * search);

  // ---- quality ----
  let quality = 1;
  let rejected = false;
  const reject = (why: string) => { rejected = true; notes.push(`rejected: ${why}`); };
  if (density < dlo || density > dhi) { quality -= 0.3; notes.push(`clue density ${density.toFixed(2)} outside ${dlo}–${dhi}`); }
  const sym = symmetryOf(spec);
  if (q.symmetry === "prefer") { quality -= 0.25 * (1 - sym); if (sym === 1 && clues.some((g) => g.at === "cell")) notes.push("symmetric clue layout"); }
  // the shape of the solve, as far as clingo's numbers can tell (a deduction solver will do this properly)
  if (q.profile === "flow" && choices > 20) { quality -= 0.2; notes.push(`flow wanted, but ${choices} choices to prove it`); }
  if (q.profile === "gem" && choices === 0 && sizeNorm > 0.5) { quality -= 0.1; notes.push("gem wanted, but propagation alone solves it"); }
  if (q.profile === "steady" && conflicts > 30 * cells) { quality -= 0.15; notes.push(`${conflicts} conflicts on ${cells} cells: lumpy`); }
  if (q.colors) {
    const off = clues.filter((g) => "color" in g && g.color && !q.colors!.includes(g.color as string));
    if (off.length) reject(`colours other than ${q.colors.join(" and ")}`);
  }
  if (q.maxGapShare != null && clues.length) {
    const gaps = clues.filter((g) => g.kind === "gap").length / clues.length;
    if (gaps > q.maxGapShare) reject(`${Math.round(gaps * 100)}% of the clues are gaps (panel-design §7)`);
  }
  // every kind of clue must be needed: without all of one kind, there's a second answer
  // (panel-design §1, design-grant "pertinence")
  const kinds = [...new Set(clues.map(kindKey))].filter((k) => k !== "gap");
  if (q.allKindsNeeded && kinds.length > 1 && !rejected) {
    for (const k of kinds) {
      const fewer: GridSpec = { ...spec, givens: (spec.givens ?? []).filter((g) => g.kind !== k) };
      let n = 2;
      try { n = (await solve(makePuzzle(fewer), 2)).length; } catch { /* not a puzzle without them: needed */ }
      if (n === 1) { reject(`the ${k} clues are decoration (it's unique without them)`); break; }
    }
    if (!rejected) notes.push(`all ${kinds.length} kinds needed`);
  }
  if (rejected) quality = 0;
  return {
    difficulty, quality: clamp01(quality), notes,
    measures: { cells, clues: clues.length, density: +density.toFixed(3), choices, conflicts, symmetry: +sym.toFixed(2), sizeNorm: +sizeNorm.toFixed(2), search: +search.toFixed(2) },
  };
};
