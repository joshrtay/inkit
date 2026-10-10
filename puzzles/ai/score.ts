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
//
// Difficulty has two parts, kept apart: the logic (how hard the deductions are: today the proxy's
// size, sparsity and search; later the deduction solver) and the rule load (`ruleLoad`: how many
// rules or kinds of symbol a solver has to hold in mind, which is hard for newcomers even when each
// step is easy). `withRuleLoad` joins them, so the logic part can be swapped without touching it.
import { genres, makePuzzle, type Genre } from "../../src/engine/puzzle.ts";
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

// ---- rule load ----

/** Givens that are structure, not a rule to hold in mind: rocks, walls, panel gaps and ends, doors,
 *  the piece bank and the length list (they come with the genre's own rules). */
const STRUCTURE = new Set(["block", "wall", "gap", "start", "end", "door", "bank", "lengths"]);
/** A panel's kinds of symbol (a hollow shape is a kind of its own). */
const PANEL_KIND: Record<string, string> = { square: "squares", star: "stars", triangle: "triangles", shape: "shapes", eraser: "erasers", hexagon: "dots" };
const SUDOKUS = new Set(["sudoku", "thermo-sudoku", "irregular-sudoku"]);

export interface RuleLoad {
  /** how many rules or kinds of symbol to hold in mind: 1 for a plain genre */
  load: number;
  /** what they are, for the notes */
  kinds: string[];
}

/** How many rules or symbol kinds a solver has to keep in mind (1 for a plain genre):
 *  - a panel: its distinct symbol kinds (squares, stars, triangles, shapes, hollow shapes, erasers,
 *    dots) and symmetry, plus 0.15 for each symbol colour beyond two;
 *  - Panes (whose genre has no rules of its own): each rule it lists;
 *  - a Sudoku: 1, plus one for each added constraint (thermometers, irregular areas, any rule
 *    beyond the plain one's, such as diagonals);
 *  - any other genre: its distinct kinds of clue (a digit puzzle's given digits aren't one), plus
 *    each rule beyond the genre's defaults (an added no-three-in-a-row), a third colour to
 *    balance, and an Akari cipher. */
export function ruleLoad(spec: GridSpec): RuleLoad {
  const genre = (genres as Record<string, Genre>)[spec.genre ?? ""];
  const own = new Set((genre?.rules ?? []).map((r) => r.rule));
  const extra = (spec.rules ?? []).filter((r) => !own.has(r.rule)).map((r) => r.rule);
  const clues = cluesOf(spec).filter((g) => !STRUCTURE.has(g.kind));
  if (spec.genre === "panel") {
    const kinds = new Set<string>();
    for (const g of clues) kinds.add(g.kind === "shape" && "negative" in g && g.negative ? "hollow shapes" : PANEL_KIND[g.kind] ?? g.kind);
    if ((spec.rules ?? []).some((r) => r.rule === "panel-line" && r.symmetry)) kinds.add("symmetry");
    const colors = new Set(clues.flatMap((g) => (g.kind !== "hexagon" && "color" in g && g.color ? [g.color as string] : [])));
    const tint = 0.15 * Math.max(0, colors.size - 2);
    return { load: Math.max(1, kinds.size) + tint, kinds: [...kinds, ...(tint ? [`${colors.size} colours`] : [])] };
  }
  if (spec.genre === "panes") return { load: Math.max(1, (spec.rules ?? []).length), kinds: (spec.rules ?? []).map((r) => r.rule) };
  if (SUDOKUS.has(spec.genre ?? "")) {
    const sudoku = new Set(genres.sudoku.rules.map((r) => r.rule));
    const kinds = ["sudoku",
      ...(spec.genre === "thermo-sudoku" || clues.some((g) => g.kind === "thermo") ? ["thermometers"] : []),
      ...(spec.genre === "irregular-sudoku" || spec.areas ? ["irregular areas"] : []),
      ...(spec.rules ?? []).map((r) => r.rule).filter((r) => !sudoku.has(r) && r !== "thermo")];
    return { load: kinds.length, kinds };
  }
  // in a digit puzzle a given number is a digit already written in, not a rule
  const digits = genre?.marks.includes("digit");
  const kinds = [...new Set(clues.filter((g) => !(digits && g.kind === "number")).map(kindKey))];
  const parts = (spec.rules ?? []).find((r) => r.rule === "line-shares")?.parts;
  const more = [...extra,
    ...(Array.isArray(parts) && parts.length > 2 ? [`${parts.length} colours`] : []),
    ...(clues.some((g) => g.kind === "number" && "letter" in g && g.letter) ? ["cipher"] : [])];
  return { load: Math.max(1, kinds.length) + more.length, kinds: [...kinds, ...more] };
}

/** How much the rule load adds at most: 4 or more rules on an easy board lands here on its own. */
export const RULE_WEIGHT = 0.7;
/** The rule load as 0..1: one rule is 0, four or more is 1. */
export const ruleNorm = (load: number) => clamp01((load - 1) / 3);
/** A puzzle's difficulty from its logic (0..1) and its rule load: the load takes a share of
 *  what's left, so one rule leaves the logic as it is and many rules make any board hard. */
export const withRuleLoad = (logic: number, load: number) => clamp01(1 - (1 - clamp01(logic)) * (1 - RULE_WEIGHT * ruleNorm(load)));

/** The proxy scorer: size, clue density, clingo statistics, and cheap quality checks. */
export const proxyScorer: Scorer = async ({ spec, plan }, persona) => {
  const q = persona.quality, notes: string[] = [];
  const [rows, cols] = spec.size, cells = rows * cols;
  const clues = cluesOf(spec), density = clues.length / cells;
  const { choices, conflicts } = await searchStats(spec);

  // ---- difficulty: bigger, sparser and more search are harder ----
  // within the sizes this persona makes the genre in, across all its plans (Isola's Monday 3 × 3
  // is her smallest panel, not the middle of a one-size list)
  const areas = [plan, ...persona.genres.filter((g) => g.genre === plan.genre)].flatMap((g) => g.sizes.map(([r, c]) => r * c)), lo = Math.min(...areas), hi = Math.max(...areas);
  const sizeNorm = hi > lo ? clamp01((cells - lo) / (hi - lo)) : 0.5;
  const [dlo, dhi] = q.clueDensity;
  const sparsity = dhi > dlo ? clamp01(1 - (density - dlo) / (dhi - dlo)) : 0.5;
  const search = clamp01(Math.log2(1 + choices + 2 * conflicts) / 8);
  const logic = clamp01(0.5 * sizeNorm + 0.2 * sparsity + 0.3 * search);
  // ---- and the rules to hold in mind (a term of its own: a deduction solver replaces `logic`) ----
  const rl = ruleLoad(spec);
  const difficulty = withRuleLoad(logic, rl.load);

  // ---- quality ----
  let quality = 1;
  let rejected = false;
  const reject = (why: string) => { rejected = true; notes.push(`rejected: ${why}`); };
  if (rl.load > 1) notes.push(`rule load ${+rl.load.toFixed(2)}: ${rl.kinds.join(", ")}`);
  if (q.maxRuleLoad != null && rl.load > q.maxRuleLoad + 1e-9) reject(`rule load ${+rl.load.toFixed(2)} over ${q.maxRuleLoad} (${rl.kinds.join(", ")})`);
  const symbols = clues.filter((g) => g.kind !== "gap").length;
  if (q.maxSymbolShare != null && symbols > q.maxSymbolShare * cells) reject(`${symbols} symbols on ${cells} cells: crowded (at most ${Math.floor(q.maxSymbolShare * cells)})`);
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
    measures: { cells, clues: clues.length, density: +density.toFixed(3), choices, conflicts, symmetry: +sym.toFixed(2), sizeNorm: +sizeNorm.toFixed(2), search: +search.toFixed(2),
      logic: +logic.toFixed(3), ruleLoad: +rl.load.toFixed(2), ruleTerm: +(RULE_WEIGHT * ruleNorm(rl.load)).toFixed(3) },
  };
};
