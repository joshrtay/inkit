// The deduction solver ("instrument D" in docs/research-interestingness.md): solves a grid puzzle
// step by step, roughly as a person would, and says how hard each step was to see.
//
// It works on the engine's own encoding (src/engine/encode.ts), ground once by clingo. Every
// ground constraint touches some cells (its footprint: the cells of the marks it mentions,
// directly or through helper atoms) and belongs to a rule instance (a "group": a rule applied to
// one row, box, area or clue, or to the whole grid). A *window* is a set of cells; its program
// keeps the constraints inside it plus whatever defines their atoms. Dropping constraints only
// relaxes the puzzle, so what holds in every answer of a window's program (clingo's cautious
// consequences), given what's known, is a sound deduction.
//
// Finding facts (cheapest first; the tiers only find candidates):
//   0  one window: a row, column, box or area, a 3×3 neighbourhood, one clue's own footprint
//   1  two overlapping tier-0 windows (a box and a row: Sudoku's pointing pairs)
//   2  a case split on the whole board: assume a mark the other way, and propagation alone
//      contradicts it (clingo: unsatisfiable with zero choices)
//   3  search: the fact needing the fewest conflicts to prove
//
// Costing them (Bogaerts, Gamba, Guns and Claes, "Step-wise explanations of constraint
// satisfaction problems", ECAI 2020): each fact's explanation is a subset-minimal set of rule
// instances and earlier facts that entails it, found by deletion in a Lua script inside clingo.
// A step's cost counts the distinct rule and clue kinds, the instances and the earlier facts
// (costOf). Each round takes the cheapest steps; the profile combines step costs by soft-max
// (softmax) and adds rule load (estimateOf).
import { readFileSync } from "node:fs";
import { makePuzzle, genres } from "../../src/engine/puzzle.ts";
import { program } from "../../src/engine/encode.ts";
import { blockFor, fillSlots, galaxyCore, pathEnds, pathNeighbours, symbolOf } from "../../src/engine/rules.ts";
import type { Given, GridSpec, Puzzle } from "../../src/engine/types.ts";
import { outputLine, parseAspif, ruleLine, type Ground, type Rule } from "./aspif.ts";
import { clingoJson, clingoRaw, ground, loadClingo } from "./clingo.ts";
import { localProgram } from "./local.ts";
import { countSets, countSystems } from "./counting.ts";
import { PRIMITIVE, unitKind } from "./signatures.ts";

export type Tier = 0 | 1 | 2 | 3;

export interface Fact { mark: string; value: boolean; text: string }

export interface Step {
  tier: Tier;
  /** the round it was taken in, and how many tier-0 steps were open then (0: none, so a harder
   *  look was needed): for flow and break-ins (puzzles/difficulty/interest.ts) */
  round?: number;
  open?: number;
  /** what was looked at: "row 3", "box 2 + row 3", "assume r2c4 shaded", ... */
  where: string;
  cells: number[];
  facts: Fact[];
  /** the rule blocks (and clue kinds) the window holds */
  uses: string[];
  /** a free choice (a puzzle with several answers, where nothing more is forced) */
  choice?: boolean;
  /** how hard it was to see: the size of its smallest explanation (see costOf) */
  cost: number;
  /** that explanation: the rule instances, the kinds held in mind, the earlier facts used */
  because?: { clues: string[]; kinds: string[]; facts: number; capped: boolean };
  /** type-free features of the step, for pricing it (puzzles/difficulty/price.ts): rule instances
   *  by primitive and unit kind, whether a global property (connection, a loop) is used, the
   *  largest group held as one, the known facts relied on and how far apart, the window's size */
  feat?: Record<string, number>;
  /** the explanation's shape, the same in any type (puzzles/difficulty/signatures.ts, fine): each
   *  rule instance as primitive@unit kind, how instances relate (one inside another, overlapping,
   *  touching), and where the decided cells sit; canonical by colour refinement. `shape` is short
   *  (a hash), `shapeText` readable */
  shape?: string;
  shapeText?: string;
  /** Options.simulate: the choice it was, among the menu's marks (see SimMove) */
  sim?: SimMove;
}

/** A simulated person's move (Options.simulate): the chosen mark's probability, the entropy of the
 *  choice and its log-partition (bits), how many marks there were, the distance from the last
 *  move, and whether the menu was empty (a case split, then p is 1) */
export interface SimMove { p: number; h: number; lse: number; n: number; dist: number; split?: 1; ps?: number }

/** The human move model a simulated person samples from (puzzles/difficulty/human-model.ts): a
 *  conditional logit over the menu's marks on the cheapest step deciding the mark (its cost), the
 *  distance of that step's window from the last move, log of how many steps decide it, and a weight
 *  for the step's kind (its rules, "adjacent-count+lit"; kinds not listed get `other`) */
export interface MoveModel { cost: number; dist: number; items: number; kinds?: Record<string, number>; other?: number }

export interface Profile {
  solved: boolean;
  steps: number;
  hardestTier: Tier;
  perTier: [number, number, number, number];
  /** tier-0 steps available at the start */
  entryPoints: number;
  /** the longest run of consecutive hard steps (cost 5 or more) */
  hardStretch: number;
  /** the costliest step's explanation cost */
  maxCost: number;
  /** steps per cost band (BANDS) */
  bands: Record<string, number>;
  /** the steps' costs combined by soft-max (see softmax, SOFTMAX_K) */
  dSteps: number;
  totalCost: number;
  /** distinct rules and clue kinds the solve used */
  ruleLoad: number;
  ruleItems: string[];
  /** facts (marks settled) */
  facts: number;
  rounds: number;
  ms: number;
  clingoCalls: number;
  /** caps hit, unsupported parts */
  notes: string[];
  /** 0 (trivial) .. 1 (very hard): see estimateOf */
  estimate: number;
}

export interface Options {
  /** stop deducing after this long (the profile says so; default 20 s) */
  budgetMs?: number;
  /** tier-1 windows at most (smallest first) */
  maxPairWindows?: number;
  /** marks tried as tier-2 case splits per clingo call (most constrained first) */
  maxSplits?: number;
  /** tier-3 candidates compared per round */
  maxDeep?: number;
  /** record every window check (for learning which windows to check first) */
  trace?: boolean;
  /** the order window families are tried in each round, a later stage only when the earlier ones
   *  found nothing: stages split by ",", families in a stage joined by "+" (t0 single units and
   *  neighbourhoods, pairs, strips, triples (two areas and a line), count). A step found in the
   *  first stage costs as tier 0, in later ones as tier 1. Default (or DEDUCE_STAGES):
   *  "t0,pairs+strips+triples,count". */
  stages?: string;
  /** also return the puzzle's structure: its marks and rule instances (for graph networks) */
  structure?: boolean;
  /** stop after setting up, before solving anything: the marks and rule instances (the puzzle's
   *  own; the lemmas' groups, added while solving, aren't there) and what's known before the first
   *  step, from grounding and each given's own cell (graph-human-labels.ts: a person's moves as
   *  labels, without our solve). With `answer` (the solution's true marks, from elsewhere) those
   *  first facts are checked against it; without, no answer is looked for. Returns no steps. */
  setupOnly?: boolean;
  answer?: string[];
  /** extra window families (or DEDUCE_FAMILIES, as JSON): checked with the pairs */
  families?: FamilySpec[];
  /** the lemmas the solver adds ("component", "parity", "loop"); default DEDUCE_LEMMAS, else "loop" */
  lemmas?: string[];
  /** per-genre techniques (TECHNIQUES), for the generator's bands only (bands.ts): constraints
   *  each implies from what's known, added each round like the lemmas, with windows over them (the
   *  stage family "techniques"). Default none */
  techniques?: string[];
  /** helper atoms named by a cell take that cell as their footprint (Spiral Galaxies' gal(I,G)):
   *  otherwise, made from facts alone, they have none, the constraints over them hold in every
   *  window, and every window holds the whole puzzle (each solves a Spiral Galaxies in a round or
   *  two). For the generator's bands (bands.ts); default off */
  cellAtoms?: boolean;
  /** the line families (DEFAULT_FAMILIES) where lines carry rules; default on (DEDUCE_DEFAULT_FAMILIES=0: off) */
  defaultFamilies?: boolean;
  /** the hardest tier allowed: 1 stops where only a case split or search would go on (the profile
   *  says unsolved, with a note); 2 allows shallow case splits (refuted by propagation alone) but no
   *  search, and spends no clingo time on deep candidates. Default 3 */
  maxTier?: Tier;
  /** case splits (tier-2 steps) allowed in the whole solve: past this many it stops, unsolved, with
   *  a note (bands.ts's "beyond": a few shallow splits, not a split-driven solve). Default no limit */
  maxSplitSteps?: number;
  /** only whether it solves: every fact a stage finds is settled at once, unexplained (cost 0, no
   *  shape; `uses` names the technique: the stage family, "lines", "reach" or "mined" for extra families, "loop"
   *  or "component" for a lemma's window), for a quick check (puzzles/difficulty/bands.ts). Window deductions only grow as more
   *  is known, so it solves when the full solver does with the same options (but for a lemma seen
   *  only in a state one of them passes through: loop chains join) */
  quick?: boolean;
  /** the intended path (docs/research-state.md, "the intended path"): each round checks every
   *  stage's windows, not just the first stage that finds something, and takes only the cheapest
   *  steps (within PEAK_TIE), so the path's hardest step is as low as the windows allow (deductions
   *  only grow as more is known, so cheapest-first never raises the peak). With maxTier 1 there is
   *  no case split: unsolved then means no split-free path within the windows (a missing
   *  technique). A step's `open` is the tier-0 steps open that round, as usual */
  minPeak?: boolean;
  /** called at the start of each round and once at the end: time so far, marks still open of all
   *  of them, the path so far (solver-speed.ts: progress over time on long solves) */
  onRound?: (ms: number, open: number, marks: number, path: Step[]) => void;
  /** best-first proof search (docs/research-trajectory.md, phase 0): the cheapest proof by the
   *  sum of step costs, against the greedy path. A state is what's known; from each, every stage's
   *  windows are checked, and the moves are: the usual round (the first stage that finds
   *  something, within SLACK of its cheapest), only the cheapest steps (within PEAK_TIE, over
   *  every stage), every step up to a few cost levels above the cheapest, and the cheapest plus one
   *  dearer step (a hinge taken early). Stuck, a shallow case split is the only move (tier 2, as
   *  the usual solve takes it); no search steps. The greedy path and the cheapest-only path (the
   *  min-peak path: deductions only grow, so it is optimal for the max) are found first and seed
   *  the bound; then states are expanded by g + ρ·open marks, ρ the greedy path's cost per mark
   *  (an estimate, not a bound), pruning at the best proof so far, until `nodes` expansions or
   *  the budget. The path returned is the best proof found; `search` reports all three */
  search?: { nodes?: number; branch?: number };
  /** menus along a person's solve (phase 1's human choices): for each entry, its marks become
   *  known (at the answer's values), then every step available there is listed, over every
   *  stage's windows (no case splits), none taken. Entries add to what's known, so a person's
   *  positions in order (the lemmas found at one stay true at the next). Returned as `menus`, with
   *  no path */
  menus?: string[][];
  /** a simulated person (docs/research-trajectory.md, step 2): from the start, each move samples a
   *  mark from everything every stage's windows find, under the move model, and takes the cheapest
   *  step deciding it; an empty menu takes the usual case split (or, with none, the fact the least search proves). `samples` solves from the
   *  same start, by a seeded generator; returned as `sims` (each a path with each step's `sim`).
   *  For other policies (reward-compare.ts): `pick: "max"` takes the model's likeliest mark instead
   *  of sampling (a policy as a reward to maximise), `score` also gives each move's probability
   *  under a second model (`sim.ps`: how human the policy's move was), and `noSplits` stops at an
   *  empty menu instead of splitting (the solve ends unsolved) */
  simulate?: { model: MoveModel; samples?: number; seed?: number; pick?: "sample" | "max"; score?: MoveModel; noSplits?: boolean };
  /** start from a person's position: these marks known (at the answer's values) before solving */
  from?: string[];
  /** stop as soon as all these marks are known (with `from`: how far a person's move was) */
  until?: string[];
  /** each round takes every step every stage's windows find (breadth first: a fact's round is its
   *  depth, the fewest rounds of window deductions it needs) */
  closure?: boolean;
}

/** Learned step prices (puzzles/difficulty/price.py → step-prices.json): a correction added to a
 *  step's cost from its features, fitted so puzzles rank like their labels (Tatham's grades, Sudoku
 *  ratings). On by default (DEDUCE_PRICES=0 turns them off): against the current solver they raised
 *  agreement with Sudoku (Puzzle Square JP 0.71 to 0.86), Aquarium (0.22 to 0.58) and Light Up
 *  (Tatham 0.80/0.82 to 0.88/0.84) and lowered none beyond noise. Centred per type on puzzle scores
 *  (price_centre.py), features capped at the labelled range. Scaled exactly as price.py's vec. */
export function priceCorrection(f: Record<string, number>, prices: { features: string[]; weights: number[]; offset?: number; offsets?: Record<string, number>; caps?: number[] }, genre?: string): number {
  // steps over a loop or the whole grid weren't in the labelled data (Singles and Sudoku): no
  // correction for them, rather than a guess
  if ((f.global ?? 0) > 0 && !(f.extent ?? 0)) return 0;
  // a type without its own centring wasn't measured: no correction (a shared offset pushed such
  // types' easy puzzles to 0)
  if (prices.offsets && !(genre && genre in prices.offsets)) return 0;
  const t = f.tier ?? 0, v: Record<string, number> = {
    tier1: t === 1 ? 1 : 0, tier2: t === 2 ? 1 : 0, tier3: t === 3 ? 1 : 0, instances: Math.log1p(f.instances ?? 0) / 2, facts: (f.facts ?? 0) / 4,
    global: f.global ?? 0, extent: Math.log1p(f.extent ?? 0) / 2, cells: Math.log1p(f.cells ?? 0) / 3, spread: (f.spread ?? 0) / 10,
    window: Math.log1p(f.window ?? 0) / 4, capped: f.capped ?? 0,
    connect_group: (f.p_connect ?? 0) > 0 && (f.extent ?? 0) >= 2 ? 1 : 0,
    connect_single: (f.p_connect ?? 0) > 0 && (f.extent ?? 0) < 2 ? 1 : 0,
    premature: (f.premature ?? 0) > 0 ? 1 : 0, premature_length: (f.premature ?? 0) > 0 ? Math.log1p(f.extent ?? 0) / 2 : 0,
  };
  // centred per type: a type's average step keeps its cost; the corrections only reorder its steps
  // each feature capped at the largest seen in the labelled steps: no extrapolating past the evidence
  return (prices.offsets?.[genre ?? ""] ?? prices.offset ?? 0) + prices.features.reduce((a, k, i) => {
    // instance counts on a log scale (price.py LOG_COUNTS): a Loopy step can use 70 corner rules at once
    const x = v[k] ?? (k.startsWith("p_") || k.startsWith("u_") ? Math.log1p(f[k] ?? 0) / 2 : 0);
    return a + prices.weights[i] * Math.min(x, prices.caps?.[i] ?? Infinity);
  }, 0);
}
const PRICES: { features: string[]; weights: number[]; offset?: number; offsets?: Record<string, number>; caps?: number[] } | null = (() => {
  if (process.env.DEDUCE_PRICES === "0") return null;
  try { return JSON.parse(readFileSync(new URL("./step-prices.json", import.meta.url), "utf8")); } catch { return null; }
})();

/** A window family in the proposal language (puzzles/difficulty/miner.ts): units of the given kinds
 *  (line: a row or column; region: an area or box; block: a 2 × 2; clue: a clue's cells) related so:
 *  "pivot", the last unit meets every other; "pairwise", every two share a cell; "touch", each
 *  shares a cell or an edge with the next. A window is their cells together, up to maxCells. */
export interface FamilySpec { units: string[]; relation: "pivot" | "pairwise" | "touch"; maxCells?: number; tag?: string }

/** Families the mining harness found worth keeping (docs/research-cross-type.md): three lines in a
 *  chain (565 of 3,205 searches on the stuck set) and three lines crossed by a fourth (317). They
 *  raised agreement with Star Battle's and Light Up's ratings and lowered none. */
export const DEFAULT_FAMILIES: FamilySpec[] = [
  { units: ["line", "line", "line"], relation: "touch" },
  { units: ["line", "line", "line", "line"], relation: "pivot" },
];
/** Found, but not yet priced: two clues whose reach overlaps (Shikaku and Fillomino solve about
 *  twice as fast, but every Shikaku then rates easy; agreement with Puzzle Square JP fell from 0.35
 *  to 0.19). Ask for it with `families`. */
export const REACH_FAMILY: FamilySpec = { units: ["reach", "reach"], relation: "pairwise" };
/** The families the mining rounds on people's stuck moments proposed and measured best
 *  (docs/research-cross-type.md §8), tagged "mined": not priced, so off by default; the
 *  generator's expert band uses them (bands.ts). */
export const MINED_FAMILIES: FamilySpec[] = [
  { units: ["block", "block", "block", "line"], relation: "pivot", maxCells: 16, tag: "mined" },
  { units: ["clue", "clue", "line"], relation: "pivot", maxCells: 20, tag: "mined" },
  { units: ["block", "block", "block"], relation: "touch", maxCells: 12, tag: "mined" },
  { units: ["clue", "reach", "reach"], relation: "touch", maxCells: 16, tag: "mined" },
  { units: ["clue", "clue", "clue"], relation: "touch", tag: "mined" },
];

/** The per-genre techniques (Options.techniques), each named as quick steps and `requiredOf` name
 *  it, and the puzzles it applies to. Off by default (unpriced); the generator's expert band uses
 *  them all, and its hard band each genre's basic ones (bands.ts HARD_TECHNIQUES). */
export const TECHNIQUES: Record<string, (p: Puzzle, genre?: string) => boolean> = {
  // Shikaku: a number's candidate rectangles (rects); two numbers' candidates together (rectpairs)
  rects: (p, genre) => genre === "shikaku" && p.rules.map((r) => r.rule).join(",") === "rectangles,one-each,size-clue",
  rectpairs: (p, genre) => genre === "shikaku" && p.rules.map((r) => r.rule).join(",") === "rectangles,one-each,size-clue",
  // Minesweeper: two overlapping numbers together (mines); chains of three (chains)
  mines: (p) => p.grid.kind === "square" && !p.figure && p.rules.some((r) => r.rule === "mine-count"),
  chains: (p) => p.grid.kind === "square" && !p.figure && p.rules.some((r) => r.rule === "mine-count"),
  // Simple Path and Numberlink: loose ends that mustn't close up (or join different numbers)
  ends: (p) => p.grid.kind === "square" && !p.figure && p.rules.some((r) => r.rule === "path" || r.rule === "links"),
  // Simple Path, Simple Loop and Numberlink with every cell used: a part of the grid with few ways out
  cuts: (p) => p.grid.kind === "square" && !p.figure && p.rules.some((r) => r.cover && (r.rule === "path" || r.rule === "links" || (r.rule === "loop" && r.of === "loop"))),
  // Numberlink: the cells each pair can still reach
  owners: (p) => p.grid.kind === "square" && !p.figure && p.rules.some((r) => r.rule === "links"),
  // Fillomino (regions cut by borders, numbers their sizes): parts that close, stay apart or must
  // grow (sizes); the shapes a numbered part can still grow into (shapes)
  sizes: (p, genre) => genre !== "shikaku" && !p.figure && p.marks.includes("regions") && p.rules.some((r) => r.rule === "size-clue"),
  shapes: (p, genre) => genre !== "shikaku" && !p.figure && p.marks.includes("regions") && p.rules.some((r) => r.rule === "size-clue"),
  // Spiral Galaxies: the cells each galaxy can still reach, by symmetry (needs Options.cellAtoms)
  mirror: (p) => p.grid.kind === "square" && !p.figure && p.rules.some((r) => r.rule === "galaxies"),
  // Hidoku and Honeycomb Paths: how far a number can be from the placed ones; a number needs the
  // one before it beside it too (dead ends)
  distance: (p) => !p.figure && p.rules.some((r) => r.rule === "number-path"),
  deadends: (p) => !p.figure && p.rules.some((r) => r.rule === "number-path"),
  // Easy as ABC: a letter's places in two rows and two columns (an X-wing)
  fish: (p) => p.grid.kind === "square" && !p.figure && p.rules.some((r) => r.rule === "letters"),
  // Fill-in: the entries each slot still fits, the slots each entry still fits (needs Options.cellAtoms)
  slots: (p) => p.grid.kind === "square" && !p.figure && p.rules.some((r) => r.rule === "fill-in"),
};
export const techniqueApplies = (t: string, p: Puzzle, genre?: string) => TECHNIQUES[t]?.(p, genre) ?? false;

/** A puzzle as a graph: cells, marks on cells, and rule instances (each a kind on a set of cells). */
export interface Structure { cells: number; rows: number; cols: number; marks: { name: string; cells: number[] }[]; groups: { kind: string; label: string; cells: number[] }[] }

/** One window check, for learning which windows find facts (puzzles/difficulty/ranker). */
export interface TraceRow {
  round: number; kind: string; size: number; marks: number; open: number;
  /** marks settled since the window was last checked (all of them if never) */
  changed: number;
  /** whether its last check found a fact: 1, 0, or -1 if never checked */
  before: number;
  facts: number;
}
/** What kind of window a label names. */
export const windowKind = (label: string) =>
  / inside /.test(label) ? "count" : / \+ /.test(label) ? "pair" : /^(rows|columns) \d+–/.test(label) ? "strip"
  : /^(row|column|area|box) /.test(label) ? label.split(" ")[0] : /^around /.test(label) ? "around" : /^pocket /.test(label) ? "pocket" : "clue";

/** clingo's conflict limits: a case split (tier 2) must need no search at all; tier 3's search is capped */
const SPLIT_LIMIT = 50, DEEP_LIMIT = 3000;
/** Step cost = 1 per distinct rule or clue kind held in mind + GROUP_COST per rule instance (a
 *  row, a box, a clue) + FACT_COST per earlier fact used + a case split's surcharge. */
export const GROUP_COST = 0.5, FACT_COST = 0.2, TIER_COST = [0, 0, 2, 4] as const;
/** Each round takes every step within SLACK of the cheapest (Options.minPeak: within PEAK_TIE). */
const SLACK = 1, PEAK_TIE = 0.05;
/** clingo solves allowed per explanation (deletion stops there, keeping a larger set) */
const MUS_SOLVES = 400;

const MARK = /^(shaded|digit|paint|line|cut|fence)\((\d+)(?:,(\d+))?\)$/;

// ---------- bit sets over cells ----------
type Bits = Uint32Array;
const bitsOf = (n: number, cells: Iterable<number>) => { const b = new Uint32Array((n + 31) >>> 5); for (const c of cells) b[c >>> 5] |= 1 << (c & 31); return b; };
const subset = (a: Bits, b: Bits) => { for (let k = 0; k < a.length; k++) if ((a[k] & ~b[k]) !== 0) return false; return true; };
const orInto = (a: Bits, b: Bits) => { let changed = false; for (let k = 0; k < a.length; k++) { const v = (a[k] | b[k]) >>> 0; if (v !== a[k]) { a[k] = v; changed = true; } } return changed; };
const cellsOf = (b: Bits) => { const out: number[] = []; for (let k = 0; k < b.length; k++) { let w = b[k]; while (w) { const t = w & -w; out.push((k << 5) + 31 - Math.clz32(t)); w ^= t; } } return out; };

interface Window { label: string; cells: number[]; bits: Bits; size: number }

/** The engine's program with every rule of a rule block tagged by an external atom rbk(K), so
 *  the ground rules can be traced back to their block. */
/** Loop parity (found by the mining harness, docs/research-cross-type.md): a closed loop crosses
 *  every straight cut through the grid an even number of times. For a puzzle with a closed loop
 *  (the loop rule), one constraint per cut between neighbouring rows or columns (loops through cells)
 *  or through the middle of a row or column (loops along grid lines), as rule block `block`: implied
 *  by the loop rule, so sound, and local, so a window over the cut can use it. */
export function parityLemma(p: Puzzle, block: number): string | null {
  const g = p.grid, loop = p.rules.find((r) => r.rule === "loop");
  if (!loop || g.kind !== "square" || p.figure) return null;
  const fence = loop.of === "fence", cuts: number[][] = [];
  if (fence) {
    for (let c = 0; c < g.cols; c++) cuts.push(g.borders.filter((b) => b.horizontal && g.cornerRC(b.corners[0])[1] === c).map((b) => b.id));
    for (let r = 0; r < g.rows; r++) cuts.push(g.borders.filter((b) => !b.horizontal && g.cornerRC(b.corners[0])[0] === r).map((b) => b.id));
  } else {
    for (let c = 0; c + 1 < g.cols; c++) cuts.push(g.links.filter((l) => { const [a, b] = l.cells.map((i) => g.rc(i)); return a[0] === b[0] && Math.min(a[1], b[1]) === c; }).map((l) => l.id));
    for (let r = 0; r + 1 < g.rows; r++) cuts.push(g.links.filter((l) => { const [a, b] = l.cells.map((i) => g.rc(i)); return a[1] === b[1] && Math.min(a[0], b[0]) === r; }).map((l) => l.id));
  }
  const on = fence ? "fence" : "line";
  const facts = cuts.flatMap((es, k) => (es.length ? [`pk(${k}).`, ...es.map((e) => `pcut(${k},${e}).`)] : []));
  return `% parity\n${facts.join(" ")}\n:- pk(K), N = #count{E: ${on}(E), pcut(K,E)}, N \\ 2 = 1, rbk(${block}).\n#external rbk(${block}).`;
}

function taggedProgram(p: Puzzle): string {
  let prog = program(p), from = 0;
  p.rules.forEach((s, k) => {
    const text = `% ${s.rule}\n${blockFor(s).asp(s, p)}`;
    const at = prog.indexOf(text, from);
    if (at < 0) return;   // not found (shouldn't happen): left untagged
    const tagged = `% ${s.rule}\n${tagRules(blockFor(s).asp(s, p), k)}`;
    prog = prog.slice(0, at) + tagged + prog.slice(at + text.length);
    from = at + tagged.length;
  });
  return `${prog}\n#external rbk(0..${Math.max(0, p.rules.length - 1)}).\n#show rbk/1.`;
}

/** Add `rbk(k)` to the body of every rule in an ASP text (facts and directives stay). */
export function tagRules(asp: string, k: number): string {
  const text = asp.replace(/%[^\n]*/g, "");
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (ch === "." && depth === 0 && text[i + 1] !== "." && text[i - 1] !== "." && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      out.push(text.slice(start, i).trim()); start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean).map((st) => {
    if (st.startsWith("#")) return `${st}.`;
    const neck = topLevelNeck(st);
    if (neck >= 0) return `${st}; rbk(${k}).`;
    return st.includes("{") ? `${st} :- rbk(${k}).` : `${st}.`;
  }).join("\n");
}
function topLevelNeck(st: string) {
  let depth = 0;
  for (let i = 0; i + 1 < st.length; i++) {
    const ch = st[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (ch === ":" && st[i + 1] === "-" && depth === 0) return i;
  }
  return -1;
}

/** The cells a given touches (for counting the clue kinds a step used). */
function givenCells(p: Puzzle, g: Given): number[] {
  const G = p.grid, inside = (r: number, c: number) => r >= 0 && c >= 0 && r < G.rows && c < G.cols;
  const cell = (r: number, c: number) => (inside(r, c) ? [G.cell(r, c)] : []);
  switch (g.at) {
    case "cell": case "edge": return cell(g.cell[0], g.cell[1]);
    case "cells": return g.cells.flatMap(([r, c]) => cell(r, c));
    case "border": return g.cells.flatMap(([r, c]) => cell(r, c));
    case "corner": { const [r, c] = g.corner; return [...cell(r - 1, c - 1), ...cell(r - 1, c), ...cell(r, c - 1), ...cell(r, c)]; }
    case "line": return g.corners.flatMap(([r, c]) => [...cell(r - 1, c - 1), ...cell(r - 1, c), ...cell(r, c - 1), ...cell(r, c)]);
    case "row": return Array.from({ length: G.cols }, (_, c) => G.cell(g.index, c));
    case "col": return Array.from({ length: G.rows }, (_, r) => G.cell(r, g.index));
    case "point": { const [y, x] = g.point; return [...cell(Math.floor((y - 1) / 2), Math.floor((x - 1) / 2)), ...cell(Math.ceil((y - 1) / 2), Math.ceil((x - 1) / 2))]; }
    default: return [];
  }
}
/** Clue kinds that are structure rather than something to reason with. */
const STRUCTURE = new Set(["start", "end", "block", "gap", "wall", "door", "bank", "lengths", "peg"]);

/** Solve `spec` step by step. */
export async function deduce(spec: GridSpec, opts: Options = {}): Promise<{ path: Step[]; menus?: (Step & { stage: number })[][]; profile: Profile; trace?: TraceRow[]; timing?: { buildMs: number; clingoMs: number }; answer?: string[]; initial?: string[]; structure?: Structure; usage?: { used: number; of: number }; search?: Record<string, unknown>; sims?: { path: Step[]; solved: boolean }[] }> {
  const t0 = Date.now(), budget = opts.budgetMs ?? 20000;
  const maxPairs = opts.maxPairWindows ?? 1500, maxSplits = opts.maxSplits ?? 300, maxDeep = opts.maxDeep ?? 12;
  await loadClingo();
  const p = makePuzzle(spec), g = p.grid, n = g.cellCount, notes: string[] = [];
  let calls = 0;
  const dbg = (what: string) => { if (process.env.DEDUCE_DEBUG) console.error(`${Date.now() - t0} ms: ${what}`); };
  // the rectangle puzzles have a local encoding (./local.ts); everything else, the engine's
  const techOn = new Set((opts.techniques ?? []).filter((t) => techniqueApplies(t, p, spec.genre)));
  const local = localProgram(p, spec.genre, techOn.has("rects") || techOn.has("rectpairs"));
  // rule blocks past the puzzle's own rules: lemmas the solver adds (loop parity; components and
  // their exits, added while solving)
  const lemmaNames: string[] = [];
  // DEDUCE_LEMMAS chooses lemmas: "component", "parity" and "loop" (premature loops); "loop" alone by
  // default (DEDUCE_LEMMAS="" for none): priced from Tatham's Loopy levels (its chains are easy
  // however long), it raised agreement with his Loopy grades (10x10 0.42 to 0.53, 7x7 0.37 to 0.40). The component
  // lemma finds Hitori's connectivity moves without search but prices them as easy, so Tatham's
  // easy and tricky Singles grades rated alike (agreement 0.75 to 0.04): on once it's priced. Loop
  // parity helped little for 11% more time.
  const lemmasOn = opts.lemmas ?? (process.env.DEDUCE_LEMMAS ?? "loop").split(",");
  const parity = local || !lemmasOn.includes("parity") ? null : parityLemma(p, p.rules.length);
  if (parity) lemmaNames.push("parity");
  const COMPONENT = p.rules.length + lemmaNames.length; lemmaNames.push("component");
  if (!local && lemmasOn.includes("loop")) lemmaNames.push("loop");
  // the per-genre techniques' blocks, one each
  const techBlock = new Map<string, number>();
  for (const t of techOn) { techBlock.set(t, p.rules.length + lemmaNames.length); lemmaNames.push(t); }
  const ruleName = (block: number) => (block < p.rules.length ? p.rules[block].rule : lemmaNames[block - p.rules.length]);
  // Options.cellAtoms: Spiral Galaxies' gal(I,G) (cell I is in galaxy G) shown, to take cell I as
  // its footprint
  const galAtoms = !!opts.cellAtoms && p.rules.some((r) => r.rule === "galaxies") && !local;
  // and Fill-in's put(E,S) (entry E goes in slot S), footprint the slot's cells
  const putAtoms = !!opts.cellAtoms && p.rules.some((r) => r.rule === "fill-in") && !local;
  const slots = putAtoms ? fillSlots(p) : [];
  const prog = local ? `${local.text}\n#external rbk(0..${Math.max(0, p.rules.length - 1)}).\n#show rbk/1.` : `${taggedProgram(p)}${parity ? `\n${parity}` : ""}${galAtoms ? "\n#show gal/2." : ""}${putAtoms ? "\n#show put/2." : ""}`;
  const G: Ground = parseAspif(ground(prog));
  dbg(`ground: ${G.rules.length} rules${local ? " (local encoding)" : ""}`);
  calls++;

  // ---- blocks: strip the rbk tags ----
  const tagAtom = new Map<number, number>();
  for (const [name, lit] of G.outputs) { const m = /^rbk\((\d+)\)$/.exec(name); if (m && lit > 0) tagAtom.set(lit, +m[1]); }
  for (const r of G.rules) {
    if (!tagAtom.size) break;
    const k = r.body.findIndex((l) => tagAtom.has(l));
    if (k >= 0) { r.block = tagAtom.get(r.body[k])!; r.body.splice(k, 1); if (r.bound !== null) r.weights.splice(k, 1); }
  }
  const rules = G.rules;

  // ---- marks: the shown atoms ----
  const markName: string[] = [], markAtom: number[] = [], markCells: number[][] = [];
  const known: number[] = [];   // -1 unknown, 0 false, 1 true
  const atomMark = new Map<number, number>();
  for (const [name, lit] of G.outputs) {
    const m = MARK.exec(name);
    if (!m) continue;
    const id = +m[2];
    const cells = m[1] === "line" || m[1] === "cut" ? g.links[id].cells.slice()
      : m[1] === "fence" ? g.borders[id].cells.filter((c) => c >= 0) : [id];
    markName.push(name); markAtom.push(lit); markCells.push(cells);
    known.push(lit === 0 ? 1 : -1);
    if (lit > 0) atomMark.set(lit, markName.length - 1);
  }
  const M = markName.length;

  dbg("marks");
  // ---- footprints ----
  const fp: (Bits | null)[] = new Array(G.maxAtom + 1).fill(null);
  for (let m = 0; m < M; m++) if (markAtom[m] > 0) fp[markAtom[m]] = bitsOf(n, markCells[m]);
  // helper atoms named by their cell (Options.cellAtoms): without a footprint of their own (they're
  // chosen freely, from facts), every constraint over them would hold in every window, so each
  // window would hold the whole puzzle
  if (galAtoms) for (const [name, lit] of G.outputs) { const x = /^gal\((\d+),(\d+)\)$/.exec(name); if (x && lit > 0) fp[lit] = bitsOf(n, [+x[1]]); }
  if (putAtoms) for (const [name, lit] of G.outputs) { const x = /^put\((\d+),(\d+)\)$/.exec(name); if (x && lit > 0) fp[lit] = bitsOf(n, slots[+x[2]]); }
  const defs: number[][] = Array.from({ length: G.maxAtom + 1 }, () => []);
  const usedIn: number[][] = Array.from({ length: G.maxAtom + 1 }, () => []);
  const constraints: number[] = [];
  rules.forEach((r, k) => {
    if (!r.head.length && !r.choice) constraints.push(k);
    for (const h of r.head) defs[h].push(k);
    for (const l of r.body) usedIn[Math.abs(l)].push(k);
  });
  // An atom's footprint is its own cells and those of every atom its defining rules' bodies use.
  // Atoms that depend on each other in a loop (recursion: reachability, connectivity) share one
  // footprint, so the atom graph's strongly connected components are each worked out once,
  // dependencies first (Tarjan's order): one pass, where re-queueing rules till nothing changed
  // took seconds on big shape puzzles.
  {
    const A = G.maxAtom + 1;
    // an atom's dependencies: the body atoms of the rules that define it
    const deps = (a: number) => { const out: number[] = []; for (const k of defs[a]) for (const l of rules[k].body) out.push(Math.abs(l)); return out; };
    const index = new Int32Array(A).fill(-1), low = new Int32Array(A), onStack = new Uint8Array(A), comp = new Int32Array(A).fill(-1);
    const stack: number[] = [];
    let counter = 0, comps = 0;
    const compFp: (Bits | null)[] = [];
    for (let root = 1; root < A; root++) {
      if (index[root] >= 0 || (!defs[root].length && !fp[root])) continue;
      // iterative Tarjan: frames of [atom, its dependencies, next one to visit]
      const frames: [number, number[], number][] = [];
      const open = (a: number) => { index[a] = low[a] = counter++; stack.push(a); onStack[a] = 1; frames.push([a, deps(a), 0]); };
      open(root);
      while (frames.length) {
        const f = frames[frames.length - 1], [a, ds] = f;
        if (f[2] < ds.length) {
          const b = ds[f[2]++];
          if (index[b] < 0) open(b);
          else if (onStack[b]) low[a] = Math.min(low[a], index[b]);
          continue;
        }
        frames.pop();
        if (frames.length) { const up = frames[frames.length - 1][0]; low[up] = Math.min(low[up], low[a]); }
        if (low[a] !== index[a]) continue;
        // a component: its members, then its footprint from theirs and their dependencies'
        const members: number[] = [];
        let x: number;
        do { x = stack.pop()!; onStack[x] = 0; comp[x] = comps; members.push(x); } while (x !== a);
        let acc: Bits | null = null;
        const add = (b: Bits | null) => { if (b) { acc ??= new Uint32Array(b.length); orInto(acc, b); } };
        for (const m of members) {
          add(fp[m]);
          for (const d of deps(m)) if (comp[d] !== comps) add(comp[d] >= 0 ? compFp[comp[d]] : fp[d]);
        }
        compFp.push(acc);
        for (const m of members) fp[m] = acc ? (acc as Bits).slice() : null;
        comps++;
      }
    }
  }
  dbg("footprints");
  const empty = new Uint32Array((n + 31) >>> 5);
  const cfp = constraints.map((k) => {
    const acc = new Uint32Array(empty.length);
    for (const l of rules[k].body) { const f = fp[Math.abs(l)]; if (f) orInto(acc, f); }
    return acc;
  });
  // constraints by their first cell; constraints touching no cell hold in every window
  const byCell: number[][] = Array.from({ length: n }, () => []), everywhere: number[] = [];
  cfp.forEach((b, j) => { const cs = cellsOf(b); if (cs.length) byCell[cs[0]].push(j); else everywhere.push(j); });

  dbg("constraints");
  // ---- the answer (to aim case splits at, and to check every deduction against) ----
  calls++;
  // (a local encoding gives the same answer as the engine's: tests/unit/deduce-local.test.ts)
  // (setupOnly: the answer given, or none looked for)
  const answer = new Uint8Array(M), markOf = new Map(markName.map((x, m) => [x, m]));
  for (let m = 0; m < M; m++) if (markAtom[m] === 0) answer[m] = 1;
  if (!opts.setupOnly) {
    const first = clingoJson(local ? local.plain : program(p), 1);
    if (first.Result !== "SATISFIABLE") throw new Error("the puzzle has no solution");
    for (const v of first.Call?.[0]?.Witnesses?.[0]?.Value ?? []) { const m = markOf.get(v); if (m !== undefined) answer[m] = 1; }
  } else for (const v of opts.answer ?? []) { const m = markOf.get(v); if (m !== undefined) answer[m] = 1; }
  const severalAnswers = (genres as Record<string, { solutions?: string }>)[spec.genre ?? ""]?.solutions === "some" || (!!opts.setupOnly && !opts.answer);

  const knownLines = (map: (a: number) => number, marks: Iterable<number>) => {
    const out: string[] = [];
    for (const m of marks) if (known[m] >= 0 && markAtom[m] > 0) out.push(`1 0 0 0 1 ${known[m] ? -map(markAtom[m]) : map(markAtom[m])}`);
    return out;
  };

  dbg("answer");
  // ---- windows ----
  const win = (label: string, cells: Iterable<number>): Window => { const cs = [...new Set(cells)].sort((a, b) => a - b); return { label, cells: cs, bits: bitsOf(n, cs), size: cs.length }; };
  const rc = (i: number) => { const [r, c] = g.rc(i); return `r${r + 1}c${c + 1}`; };
  const t0w: Window[] = [], units: Window[] = [];
  const unit = (w: Window) => { units.push(w); t0w.push(w); };
  if (g.kind === "square" && !p.figure) {
    for (let r = 0; r < g.rows; r++) unit(win(`row ${r + 1}`, Array.from({ length: g.cols }, (_, c) => g.cell(r, c))));
    for (let c = 0; c < g.cols; c++) unit(win(`column ${c + 1}`, Array.from({ length: g.rows }, (_, r) => g.cell(r, c))));
    for (let r = 0; r + 2 < Math.max(g.rows, 3); r++) for (let c = 0; c + 2 < Math.max(g.cols, 3); c++) {
      const cs: number[] = [];
      for (let y = r; y < r + 3; y++) for (let x = c; x < c + 3; x++) if (y < g.rows && x < g.cols) cs.push(g.cell(y, x));
      t0w.push(win(`around ${rc(g.cell(Math.min(r + 1, g.rows - 1), Math.min(c + 1, g.cols - 1)))}`, cs));
    }
  } else {
    for (let i = 0; i < n; i++) t0w.push(win(`around ${rc(i)}`, [i, ...g.cellLinks[i].map((l) => (g.links[l].cells[0] === i ? g.links[l].cells[1] : g.links[l].cells[0]))]));
  }
  p.areas?.cells.forEach((cs, a) => unit(win(`area ${String.fromCharCode(97 + (a % 26))}`, cs)));
  const boxCells: number[][] = [];
  {
    const boxes = new Map<number, number[]>();
    for (const m of program(p).matchAll(/\bbox\((\d+),(\d+)\)\./g)) { const k = +m[2]; if (!boxes.has(k)) boxes.set(k, []); boxes.get(k)!.push(+m[1]); }
    for (const [k, cs] of [...boxes].sort((x, y) => x[0] - y[0])) { unit(win(`box ${k + 1}`, cs)); boxCells.push(cs); }
  }
  // 2 × 2 blocks: units for explaining only (a no-touch or no-pool rule's constraints at a corner
  // belong to their block), not windows
  if (g.kind === "square" && !p.figure)
    for (let r = 0; r + 1 < g.rows; r++) for (let c = 0; c + 1 < g.cols; c++)
      units.push(win(`2 × 2 at ${rc(g.cell(r, c))}`, [g.cell(r, c), g.cell(r, c + 1), g.cell(r + 1, c), g.cell(r + 1, c + 1)]));
  // each clue's or rule's own footprint, when it's local
  const cap0 = Math.max(g.rows, g.cols, 9);
  {
    const seen = new Set<string>();
    for (const b of cfp) {
      const cs = cellsOf(b);
      if (cs.length < 2 || cs.length > cap0) continue;
      const key = cs.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      t0w.push(win(cs.length <= 3 ? cs.map(rc).join(" ") : `near ${rc(cs[0])}–${rc(cs.at(-1)!)}`, cs));
    }
  }
  const prune = (ws: Window[]) => {
    const byKey = new Map<string, Window>();
    for (const w of ws) if (!byKey.has(w.cells.join(","))) byKey.set(w.cells.join(","), w);
    const list = [...byKey.values()].sort((a, b) => b.size - a.size);
    const kept: Window[] = [];
    for (const w of list) if (!kept.some((k) => k.size > w.size && subset(w.bits, k.bits))) kept.push(w);
    return kept.sort((a, b) => a.size - b.size);
  };
  const T0 = prune(t0w);
  dbg("tier-0 windows");
  // tier 1: two overlapping tier-0 windows
  let T1: Window[] = [];
  const strips: Window[] = [], triplesW: Window[] = [], extraW: Window[] = [];
  {
    const cap1 = 2 * Math.max(g.rows, g.cols, 5);
    const seen = new Set(T0.map((w) => w.cells.join(",")));
    const pairs: Window[] = [];
    for (let a = 0; a < T0.length; a++) for (let b = a + 1; b < T0.length; b++) {
      const A = T0[a], B = T0[b];
      let meet = false;
      for (let k = 0; k < A.bits.length && !meet; k++) if (A.bits[k] & B.bits[k]) meet = true;
      if (!meet) continue;
      const u = A.bits.slice(); orInto(u, B.bits);
      const cs = cellsOf(u);
      if (cs.length > cap1) continue;
      const key = cs.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ label: `${A.label} + ${B.label}`, cells: cs, bits: u, size: cs.length });
    }
    pairs.sort((x, y) => x.size - y.size);
    if (pairs.length > maxPairs) notes.push(`tier 1: kept the ${maxPairs} smallest of ${pairs.length} window pairs`);
    T1 = pairs.slice(0, maxPairs);
    // strips: two neighbouring rows, or columns, which share no cell (Star Battle's squeeze)
    if (g.kind === "square" && !p.figure) {
      for (let r = 0; r + 1 < g.rows; r++) strips.push(win(`rows ${r + 1}–${r + 2}`, Array.from({ length: 2 * g.cols }, (_, k) => g.cell(r + (k >= g.cols ? 1 : 0), k % g.cols))));
      for (let c = 0; c + 1 < g.cols; c++) strips.push(win(`columns ${c + 1}–${c + 2}`, Array.from({ length: 2 * g.rows }, (_, k) => g.cell(k % g.rows, c + (k >= g.rows ? 1 : 0)))));
    }
    // two areas (or boxes) and a row or column through both: the move people make most where
    // window pairs see nothing (Janko's Star Battles, puzzles/difficulty/janko-explain.ts)
    {
      const regions = units.filter((w) => /^(area|box) /.test(w.label)), lines = units.filter((w) => /^(row|column) /.test(w.label));
      const meets = (a: Window, b: Window) => { for (let k = 0; k < a.bits.length; k++) if (a.bits[k] & b.bits[k]) return true; return false; };
      const triples: Window[] = [];
      for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) for (const l of lines) {
        if (!meets(regions[i], l) || !meets(regions[j], l)) continue;
        const u = regions[i].bits.slice(); orInto(u, regions[j].bits); orInto(u, l.bits);
        const cs = cellsOf(u);
        triples.push({ label: `${regions[i].label} + ${regions[j].label} + ${l.label}`, cells: cs, bits: u, size: cs.length });
      }
      triples.sort((x, y) => x.size - y.size);
      triplesW.push(...triples.slice(0, maxPairs));
    }
    // clue reach (found by the mining harness): the cells a size clue's region could still cover,
    // within its size (by steps) or, for a square's side, within that many cells each way
    const reachUnits = (): Window[] => {
      if (g.kind !== "square" || p.figure) return [];
      const size = p.rules.some((r) => r.rule === "size-clue"), side = p.rules.some((r) => r.rule === "side-clue");
      if (!size && !side) return [];
      const out: Window[] = [];
      for (const [i, gs] of p.cellGivens) for (const x of gs) {
        const v = (x as { value?: unknown }).value;
        if (x.kind !== "number" || typeof v !== "number") continue;
        const [r0, c0] = g.rc(i), cs: number[] = [];
        for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
          const d = side ? Math.max(Math.abs(r - r0), Math.abs(c - c0)) : Math.abs(r - r0) + Math.abs(c - c0);
          if (d <= v - 1) cs.push(g.cell(r, c));
        }
        out.push(win(`reach of ${rc(i)}`, cs));
      }
      return out;
    };
    // families from the proposal language
    // the families the mining harness found worth keeping, then any asked for
    // (the default line families only where lines carry rules: in Shikaku, say, a band of rows is
    // just a big window, and cheapened unrelated steps)
    const LINE_RULES = ["shaded-per-line", "latin", "letters", "skyscrapers", "first-seen", "line-totals", "line-shares", "unique-lines", "no-three-in-a-row", "lit", "sight", "runs"];
    const linesRule = p.rules.some((r) => LINE_RULES.includes(r.rule));
    const lineFamilies = opts.defaultFamilies ?? process.env.DEDUCE_DEFAULT_FAMILIES !== "0";
    const specs: FamilySpec[] = [...(!lineFamilies || !linesRule ? [] : DEFAULT_FAMILIES), ...(opts.families ?? (process.env.DEDUCE_FAMILIES ? JSON.parse(process.env.DEDUCE_FAMILIES) : []))];
    if (specs.length) {
      const kinds: Record<string, Window[]> = {
        line: units.filter((w) => /^(row|column) /.test(w.label)),
        region: units.filter((w) => /^(area|box) /.test(w.label)),
        block: units.filter((w) => w.label.startsWith("2 × 2 ")),
        clue: T0.filter((w) => windowKind(w.label) === "clue"),
        reach: reachUnits(),
      };
      const any = (a: Bits, b: Bits) => { for (let k = 0; k < a.length; k++) if (a[k] & b[k]) return true; return false; };
      const grown = new Map<Window, Bits>();
      const near = (w: Window) => {
        let b = grown.get(w);
        if (!b) { b = w.bits.slice(); for (const c of w.cells) for (const l of g.cellLinks[c]) for (const j of g.links[l].cells) b[j >>> 5] |= 1 << (j & 31); grown.set(w, b); }
        return b;
      };
      for (const f of specs) {
        const lists = f.units.map((k) => kinds[k] ?? []);
        if (lists.some((l) => !l.length)) continue;
        const cap = f.maxCells ?? 3 * Math.max(g.kind === "square" ? Math.max(g.rows, g.cols) : 9, 5);
        const found = new Map<string, Window>(), pick: Window[] = [];
        let tries = 0;
        const fits = (k: number) => {
          const w = pick[k];
          if (pick.slice(0, k).includes(w)) return false;
          if (f.relation === "pairwise") return pick.slice(0, k).every((x) => any(x.bits, w.bits));
          if (f.relation === "touch") return k === 0 || any(near(pick[k - 1]), w.bits);
          return k < lists.length - 1 || pick.slice(0, k).every((x) => any(x.bits, w.bits));
        };
        const walk = (k: number) => {
          if (++tries > 200_000) return;
          if (k === lists.length) {
            const u = new Uint32Array(pick[0].bits.length);
            for (const x of pick) orInto(u, x.bits);
            const cs = cellsOf(u);
            if (cs.length > cap) return;
            const key = cs.join(",");
            if (!found.has(key)) found.set(key, { label: (f.tag ? `${f.tag}: ` : "") + pick.map((x) => x.label).join(" + "), cells: cs, bits: u, size: cs.length });
            return;
          }
          for (const w of lists[k]) { pick[k] = w; if (fits(k)) walk(k + 1); }
          pick.length = k;
        };
        walk(0);
        extraW.push(...[...found.values()].sort((x, y) => x.size - y.size).slice(0, maxPairs));
      }
    }
  }
  // counting across units (./counting.ts): its windows are found afresh each round, from what's
  // known, and kept by their cells so a window checked before isn't checked again for nothing
  const systems = countSystems(p, boxCells);
  const countCache = new Map<string, Window>();
  const stages = (opts.stages ?? process.env.DEDUCE_STAGES ?? "t0,pairs+strips+triples,count,extra+components").split(",").map((x) => x.split("+").map((y) => y.trim()));
  const family = (name: string): Window[] => (name === "t0" ? T0 : name === "pairs" ? T1 : name === "strips" ? strips : name === "triples" ? triplesW : name === "extra" ? extraW : name === "components" ? componentW : name === "count" ? countWindows() : name === "pockets" ? pocketWindows() : name === "techniques" ? techW : []);
  const countWindows = (): Window[] => {
    if (!systems.length) return [];
    const sets = countSets(systems, (name) => { const m = markOf.get(name); return m === undefined ? undefined : known[m]; });
    const out: Window[] = [];
    for (const s of sets.sort((x, y) => x.size - y.size)) {
      const key = s.cells.join(",");
      let w = countCache.get(key);
      if (!w) { w = win(s.label, s.cells); countCache.set(key, w); }
      if (!out.includes(w)) out.push(w);
      if (out.length >= 200) break;
    }
    return out;
  };

  dbg("tier-1 windows");

  // ---- explanation units: each constraint belongs to a rule instance (a rule applied to a row,
  // a box, an area, one clue, or the whole grid); a cell's own bookkeeping ("one digit per
  // cell") is free ----
  const ROOM = 4000;   // constraints the solver may add while solving (component lemmas)
  const TECH_ROOM = techOn.size ? 60000 : 0;   // and for the per-genre techniques
  const consOf = new Int32Array(rules.length + ROOM + 2 * TECH_ROOM).fill(-1);
  constraints.forEach((k, j) => { consOf[k] = j; });
  interface Group { kind: string; label: string; cells: number[]; extent?: number }
  const groups: Group[] = [], groupOf = new Int32Array(constraints.length + ROOM + TECH_ROOM).fill(-1);
  {
    const byKey = new Map<string, number>();
    // a constraint inside several units (a pair of cells in both a row and a box) goes to the
    // unit holding most of its rule's constraints (the box, for the box rule)
    // A rule whose constraints all fit in 2 × 2 blocks, some of them in nothing else (no-touch's
    // diagonal pairs, a pool), is about blocks: its constraints go to their block. Other rules
    // never go to a block (no-adjacent's pairs stay with their row or column).
    const isBlock = (w: Window) => w.label.startsWith("2 × 2 ");
    const local = new Map<number, boolean>(), onlyBlock = new Set<number>();
    constraints.forEach((k, j) => {
      const b = rules[k].block, cs = cellsOf(cfp[j]);
      if (!cs.length) return;
      const fits = units.some((w) => isBlock(w) && subset(cfp[j], w.bits));
      local.set(b, (local.get(b) ?? true) && fits);
      if (fits && !units.some((w) => !isBlock(w) && subset(cfp[j], w.bits))) onlyBlock.add(b);
    });
    for (const b of local.keys()) if (!onlyBlock.has(b)) local.set(b, false);
    const count = new Map<string, number>(), within = (j: number) => {
      const blockLocal = local.get(rules[constraints[j]].block) === true;
      return units.filter((w) => isBlock(w) === blockLocal && subset(cfp[j], w.bits));
    };
    constraints.forEach((k, j) => { if (cellsOf(cfp[j]).length) for (const w of within(j)) { const key = `${rules[k].block}|${w.label}`; count.set(key, (count.get(key) ?? 0) + 1); } });
    constraints.forEach((k, j) => {
      const cs = cellsOf(cfp[j]), block = rules[k].block;
      if (block < 0 && cs.length <= 1) return;
      const kind = block >= 0 ? ruleName(block) : "regions";
      const u = cs.length ? within(j).sort((a, b) => (count.get(`${block}|${b.label}`) ?? 0) - (count.get(`${block}|${a.label}`) ?? 0) || a.size - b.size)[0] : undefined;
      const label = u ? u.label : cs.length === 0 || cs.length > cap0 ? "the whole grid" : cs.length <= 3 ? cs.map(rc).join(" ") : `near ${rc(cs[0])}–${rc(cs.at(-1)!)}`;
      const key = `${kind}|${u ? u.label : cs.length > cap0 ? "*" : cs.join(",")}`;
      let gi = byKey.get(key);
      if (gi === undefined) { gi = groups.length; byKey.set(key, gi); groups.push({ kind, label, cells: u ? u.cells : cs }); }
      groupOf[j] = gi;
    });
  }
  const ownGroups = groups.length;   // the puzzle's own; the lemmas' and techniques' come later
  // ---- a window's program: its constraints and what defines their atoms ----
  interface Prog { rules: number[]; marks: number[]; blocks: Set<number> }
  const progCache = new Map<Window, Prog>();
  const progOf = (w: Window): Prog => {
    const hit = progCache.get(w);
    if (hit) return hit;
    const cons: number[] = [...everywhere];
    for (const c of w.cells) for (const j of byCell[c]) if (subset(cfp[j], w.bits)) cons.push(j);
    const ruleSet = new Set<number>(), atoms = new Set<number>(), stack: number[] = [];
    const addRule = (k: number) => { if (ruleSet.has(k)) return; ruleSet.add(k); for (const a of rules[k].head) stack.push(a); for (const l of rules[k].body) stack.push(Math.abs(l)); };
    for (const j of cons) addRule(constraints[j]);
    while (stack.length) { const a = stack.pop()!; if (atoms.has(a)) continue; atoms.add(a); for (const k of defs[a]) addRule(k); }
    const marks: number[] = [];
    for (const a of atoms) { const m = atomMark.get(a); if (m !== undefined) marks.push(m); }
    const blocks = new Set<number>();
    for (const k of ruleSet) if (rules[k].block >= 0) blocks.add(rules[k].block);
    const out = { rules: [...ruleSet], marks, blocks };
    // only windows with a constraint can deduce anything
    if (!cons.length) out.marks = [];
    progCache.set(w, out);
    return out;
  };

  // ---- clue kinds by cell, for rule load ----
  const kindsAt: Set<string>[] = Array.from({ length: n }, () => new Set());
  const allGivens: Given[] = spec.givens ?? [];
  for (const gv of allGivens) if (!STRUCTURE.has(gv.kind)) for (const c of givenCells(p, gv)) kindsAt[c].add(gv.kind);


  // ---- describing facts ----
  const factText = (m: number, v: boolean): string => {
    const mm = MARK.exec(markName[m])!, id = +mm[2];
    switch (mm[1]) {
      case "shaded": return `${rc(id)} ${v ? "shaded" : "unshaded"}`;
      case "digit": return `${rc(id)} ${v ? "=" : "≠"} ${mm[3]}`;
      case "paint": return `${rc(id)} ${v ? "is" : "isn't"} color ${mm[3]}`;
      case "fence": { const cs = g.borders[id].cells; return `${v ? "line" : "no line"} on the edge of ${cs.filter((c) => c >= 0).map(rc).join("/")}${cs.includes(-1) ? " (outside)" : ""}`; }
      case "line": return `${v ? "line" : "no line"} ${rc(g.links[id].cells[0])}–${rc(g.links[id].cells[1])}`;
      default: return `${v ? "cut" : "no cut"} ${rc(g.links[id].cells[0])}|${rc(g.links[id].cells[1])}`;
    }
  };

  // ---- the solve ----
  const path: Step[] = [];
  const decidedAt = new Int32Array(M).fill(-1);   // the round each mark was settled in
  const trace: TraceRow[] = [], lastFound = new Map<Window, number>(), timing = { buildMs: 0, clingoMs: 0 };
  const evaluatedAt = new Map<Window, number>();
  let round = 0, undecided = known.filter((v) => v < 0).length, outOfTime = false;
  const settle = (m: number, v: boolean) => {
    if (known[m] >= 0) return false;
    if ((v ? 1 : 0) !== answer[m] && !severalAnswers) throw new Error(`deduced a wrong fact: ${factText(m, v)}`);
    known[m] = v ? 1 : 0; decidedAt[m] = round; undecided--;
    return true;
  };

  /** Cautious consequences of each (changed) window; returns the windows' new facts. */
  const runWindows = (ws: Window[]): Map<Window, [number, boolean][]> => {
    const todo = ws.filter((w) => {
      const pr = progOf(w);
      if (!pr.marks.some((m) => known[m] < 0)) return false;
      const last = evaluatedAt.get(w);
      return last === undefined || pr.marks.some((m) => decidedAt[m] >= last);
    });
    const found = new Map<Window, [number, boolean][]>();
    const rowsHere: [Window, TraceRow][] = [];
    if (opts.trace) for (const w of todo) {
      const pr = progOf(w), last = evaluatedAt.get(w);
      rowsHere.push([w, { round, kind: windowKind(w.label), size: w.size, marks: pr.marks.length, open: pr.marks.filter((m) => known[m] < 0).length,
        changed: last === undefined ? pr.marks.length : pr.marks.filter((m) => decidedAt[m] >= last).length, before: lastFound.get(w) ?? -1, facts: 0 }]);
    }
    let tb = Date.now();
    // clingo-wasm takes the program on its stack, which holds about 2 MB: calls stay well under
    const CHUNK = 500_000;   // characters per clingo call
    let lines: string[] = [], chars = 0, members: Window[] = [], next = 1;
    const flush = () => {
      if (!members.length) return;
      calls++;
      const tc = Date.now();
      timing.buildMs += tc - tb;
      const res = clingoJson(["asp 1 0 0", ...lines, "0"].join("\n"), 0, ["--enum-mode=cautious", "--quiet=1"]);
      timing.clingoMs += Date.now() - tc;
      dbg(`round ${round}: ${members.length} windows, ${chars} chars, ${res.Call?.[0]?.Witnesses?.length} models, ${Date.now() - tc} ms`);
      if (res.Result === "UNSATISFIABLE") throw new Error("a window has no answer: the known facts are wrong");
      const last = res.Call?.[0]?.Witnesses?.at(-1)?.Value ?? [];
      for (const v of last) {
        const mt = /^([tf])\((\d+),(\d+)\)$/.exec(v);
        if (!mt) continue;
        const w = members[+mt[2]], m = +mt[3];
        if (known[m] >= 0) continue;
        if (!found.has(w)) found.set(w, []);
        found.get(w)!.push([m, mt[1] === "t"]);
      }
      lines = []; chars = 0; members = []; next = 1;
      tb = Date.now();
    };
    for (const w of todo) {
      evaluatedAt.set(w, round);
      const pr = progOf(w), idx = members.length, local = new Map<number, number>();
      members.push(w);
      const map = (a: number) => { let x = local.get(a); if (x === undefined) { x = next++; local.set(a, x); } return x; };
      const mine: string[] = [];
      for (const k of pr.rules) mine.push(ruleLine(rules[k], map));
      mine.push(...knownLines(map, pr.marks));
      for (const m of pr.marks) if (known[m] < 0) {
        const a = map(markAtom[m]), neg = next++;
        mine.push(`1 0 1 ${neg} 0 1 ${-a}`, outputLine(`t(${idx},${m})`, a), outputLine(`f(${idx},${m})`, neg));
      }
      const size = mine.reduce((x, l) => x + l.length + 1, 0);
      if (size > CHUNK) { members.pop(); notes.push(`${w.label}: too big to check`); continue; }
      lines.push(...mine); chars += size;
      if (chars > CHUNK) flush();
    }
    flush();
    for (const w of todo) lastFound.set(w, found.has(w) ? 1 : 0);
    if (opts.trace) for (const [w, r] of rowsHere) { r.facts = found.get(w)?.length ?? 0; trace.push(r); }
    return found;
  };

  // ---- explanations ----
  // A fact's explanation is a smallest set of rule instances (groups) and earlier facts that
  // entails it (Bogaerts, Gamba, Guns and Claes, "Step-wise explanations of constraint
  // satisfaction problems", ECAI 2020): assume the fact's negation with the set switched on, and
  // clingo finds no answer. Within a window, a Lua script shrinks the window's whole set by
  // deletion (groups before facts, since facts are cheaper), in halving chunks, to a
  // subset-minimal one.
  const ALL: Window = win("the whole grid", Array.from({ length: n }, (_, i) => i));
  interface Expl { groups: number[]; facts: number[]; capped: boolean }
  const explain = (jobs: { w: Window; facts: [number, boolean][] }[]): Map<Window, (Expl | null)[]> => {
    const out = new Map<Window, (Expl | null)[]>();
    let text: string[] = [], tables: string[] = [], members: { w: Window; facts: [number, boolean][] }[] = [];
    const flush = () => {
      if (!members.length) return;
      calls++;
      const lua = `#script (lua)
local function S(n, W, x) return clingo.Function(n, {clingo.Number(W), clingo.Number(x)}) end
function main(prg)
  prg:ground({{"base", {}}})
  local wins = {${tables.join(",")}}
  for _, w in ipairs(wins) do
    local W = w[1]
    local elems = {}
    for _, G in ipairs(w[2]) do elems[#elems + 1] = {"g", G, S("g", W, G)} end
    for _, m in ipairs(w[3]) do elems[#elems + 1] = {"k", m, S("k", W, m)} end
    local on = {clingo.Function("e", {clingo.Number(W)}), true}
    local solves = 0
    local function unsat(t, set)
      local a = {on, {t, true}}
      for _, i in ipairs(set) do a[#a + 1] = {elems[i][3], true} end
      solves = solves + 1
      return prg:solve({assumptions = a}).unsatisfiable == true
    end
    local cache = {}
    for _, m in ipairs(w[4]) do
      local t = S("t", W, m)
      local found, capped = nil, false
      for _, c in ipairs(cache) do if unsat(t, c) then found = c break end end
      if not found then
        local set = {}
        for i = 1, #elems do set[i] = i end
        if unsat(t, set) then
          local size = math.max(1, math.floor(#set / 2))
          while true do
            local i = 1
            while i <= #set do
              if solves > ${MUS_SOLVES} then capped = true break end
              local rest = {}
              for j = 1, #set do if j < i or j >= i + size then rest[#rest + 1] = set[j] end end
              if #rest < #set and unsat(t, rest) then set = rest else i = i + size end
            end
            if size == 1 or capped then break end
            size = math.max(1, math.floor(size / 2))
          end
          found = set
          cache[#cache + 1] = set
        end
      end
      if found then
        local parts = {}
        for _, i in ipairs(found) do parts[#parts + 1] = elems[i][1] .. elems[i][2] end
        print("E " .. W .. " " .. m .. " " .. (capped and "1" or "0") .. " " .. table.concat(parts, ","))
      else print("X " .. W .. " " .. m) end
    end
  end
end
#end.
`;
      const te = Date.now();
      const { lines, status, errors } = clingoRaw(lua + text.join("\n"), "--outf=3");
      dbg(`explain: ${members.length} windows, ${members.reduce((a, j) => a + j.facts.length, 0)} facts, ${text.reduce((a, l) => a + l.length, 0)} chars, ${Date.now() - te} ms`);
      if (status === 33 || status === 65 || status === 128) throw new Error(`clingo failed (${status}): ${errors.join("\n").slice(0, 300)}`);
      for (const l of lines) {
        const x = /^([EX]) (\d+) (\d+)(?: (\d) ?(.*))?$/.exec(l);
        if (!x) continue;
        const job = members[+x[2]], m = +x[3], k = job.facts.findIndex(([mm]) => mm === m);
        if (!out.has(job.w)) out.set(job.w, job.facts.map(() => null));
        if (x[1] === "X") continue;
        const parts = (x[5] ?? "").split(",").filter(Boolean);
        out.get(job.w)![k] = { groups: parts.filter((q) => q[0] === "g").map((q) => +q.slice(1)), facts: parts.filter((q) => q[0] === "k").map((q) => +q.slice(1)), capped: x[4] === "1" };
      }
      text = []; tables = []; members = [];
    };
    let chars = 0;
    for (const job of jobs) {
      const W = members.length, pr = progOf(job.w), mine: string[] = [];
      // atoms as short constants (a0_ya: window 0, atom 1234 in base 36): the same program in about
      // half the text, which is most of what a whole-grid explanation costs clingo to read
      const A = (a: number) => `a${W}_${a.toString(36)}`;
      const L = (l: number) => (l < 0 ? `not ${A(-l)}` : A(l));
      const gs = new Set<number>();
      for (const k of pr.rules) {
        const r = rules[k], j = consOf[k];
        const body = r.bound === null ? r.body.map(L) : [`#sum{${r.body.map((l, q) => `${r.weights[q]},${q}:${L(l)}`).join(";")}} >= ${r.bound}`];
        if (j >= 0) {
          const gi = groupOf[j];
          if (gi >= 0) gs.add(gi);
          mine.push(`:- ${[...body, gi >= 0 ? `g(${W},${gi})` : `e(${W})`].join(", ")}.`);
        } else if (r.choice) {
          if (r.head.length) mine.push(`{${r.head.map(A).join(";")}} :- ${[...body, `e(${W})`].join(", ")}.`);
        } else mine.push(body.length ? `${r.head.map(A).join(";")} :- ${body.join(", ")}.` : `${r.head.map(A).join(";")}.`);
      }
      const kn = pr.marks.filter((m) => known[m] >= 0 && markAtom[m] > 0);
      for (const m of kn) mine.push(`:- ${known[m] ? "not " : ""}${A(markAtom[m])}, k(${W},${m}).`);
      for (const [m, v] of job.facts) mine.push(`:- ${v ? "" : "not "}${A(markAtom[m])}, t(${W},${m}).`);
      // free externals: switched on by assumptions, otherwise the solver may leave them off
      mine.push(`#external e(${W}). [free]`, ...[...gs].map((gi) => `#external g(${W},${gi}). [free]`), ...kn.map((m) => `#external k(${W},${m}). [free]`), ...job.facts.map(([m]) => `#external t(${W},${m}). [free]`));
      const size = mine.reduce((x, l) => x + l.length + 1, 0);
      if (size > 900_000) { notes.push(`${job.w.label}: too big to explain`); continue; }
      if (chars + size > 900_000) { flush(); chars = 0; return explainRest(jobs.slice(jobs.indexOf(job)), out); }
      members.push(job); text.push(...mine); chars += size;
      tables.push(`{${W},{${[...gs].join(",")}},{${kn.join(",")}},{${job.facts.map(([m]) => m).join(",")}}}`);
    }
    flush();
    return out;
  };
  const explainRest = (jobs: { w: Window; facts: [number, boolean][] }[], acc: Map<Window, (Expl | null)[]>) => {
    for (const [w, e] of explain(jobs)) acc.set(w, e);
    return acc;
  };

  // ---- costs ----
  const puzzleKinds = new Set([...groups.map((x) => x.kind), ...kindsAt.flatMap((ks) => [...ks].map((k) => `clue:${k}`))]).size;
  const kindsOf = (e: Expl) => {
    const ks = new Set<string>();
    for (const gi of e.groups) { ks.add(groups[gi].kind); for (const c of groups[gi].cells) for (const k of kindsAt[c]) ks.add(`clue:${k}`); }
    return [...ks].sort();
  };
  // A case split's explanation is a chain of small steps under the assumption, not one look at
  // everything at once: its rule instances count a quarter each (a crude stand-in for costing
  // the nested steps, as Bogaerts et al. do). An explanation that couldn't be found (too big)
  // costs the surcharge plus every kind the puzzle has, plus 2.
  const costOf = (e: Expl | null, tier: Tier) => {
    if (!e) return TIER_COST[tier] + puzzleKinds + 2;
    const per = tier >= 2 ? GROUP_COST / 2 : GROUP_COST;
    return per * e.groups.length + kindsOf(e).length + FACT_COST * e.facts.length + TIER_COST[tier];
  };

  /** A step's type-free features (Step.feat). */
  const featuresOf = (e: Expl | null, tier: Tier, w: Window): Record<string, number> => {
    const f: Record<string, number> = { tier, window: w.size, capped: e ? 0 : 1 };
    if (!e) return f;
    f.instances = e.groups.length; f.facts = e.facts.length;
    const cells = new Set<number>();
    let extent = 0, global = 0;
    for (const gi of e.groups) {
      const gr = groups[gi], prim = gr.kind === "component" || gr.kind === "parity" || gr.kind === "premature" ? "connect" : PRIMITIVE[gr.kind] ?? "other";
      f[`p_${prim}`] = (f[`p_${prim}`] ?? 0) + 1;
      if (gr.kind === "premature") f.premature = (f.premature ?? 0) + 1;   // a chain that can't close yet
      const uk = unitKind(gr.label);
      f[`u_${uk}`] = (f[`u_${uk}`] ?? 0) + 1;
      if (prim === "connect" || uk === "grid") global = 1;
      extent = Math.max(extent, gr.extent ?? (prim === "connect" ? gr.cells.length : 0));
      for (const c of gr.cells) cells.add(c);
    }
    f.global = global; f.extent = extent; f.cells = cells.size;
    // how far apart the facts relied on are (rows plus columns spanned), on square grids
    if (g.kind === "square" && e.facts.length) {
      const rcs = e.facts.flatMap((m) => markCells[m]).map((c) => g.rc(c));
      f.spread = Math.max(...rcs.map((x) => x[0])) - Math.min(...rcs.map((x) => x[0])) + Math.max(...rcs.map((x) => x[1])) - Math.min(...rcs.map((x) => x[1]));
    }
    return f;
  };

  /** The explanation's shape (Step.shape): nodes are the rule instances and the decided cells, as
   *  primitive@unit kind; edges say how two relate ("in" one inside the other, "x" overlapping,
   *  "t" touching); two rounds of colour refinement (Weisfeiler–Lehman) make it canonical. */
  const shapeOf = (e: Expl, target: number[]): { shape: string; text: string } => {
    const prim = (k: string) => (k === "component" || k === "parity" || k === "premature" ? "connect" : PRIMITIVE[k] ?? k);
    const nodes = e.groups.map((gi) => ({ label: `${prim(groups[gi].kind)}@${unitKind(groups[gi].label)}`, cells: new Set(groups[gi].cells) }));
    nodes.push({ label: "decided", cells: new Set(target) });
    const touch = (a: Set<number>, b: Set<number>) => { for (const c of a) for (const l of g.cellLinks[c] ?? []) for (const j of g.links[l].cells) if (b.has(j)) return true; return false; };
    const rel = (a: Set<number>, b: Set<number>) => {
      let common = 0; for (const c of a) if (b.has(c)) common++;
      if (common && (common === a.size || common === b.size)) return "in";
      if (common) return "x";
      return touch(a, b) ? "t" : "";
    };
    const adj = nodes.map((a, i) => nodes.flatMap((b, j) => { if (i === j) return []; const r = rel(a.cells, b.cells); return r ? [[j, r] as const] : []; }));
    let colour = nodes.map((x) => x.label);
    for (let round = 0; round < 2; round++) colour = nodes.map((_, i) => `${colour[i]}{${adj[i].map(([j, r]) => `${r}:${colour[j]}`).sort().join(",")}}`);
    const text = [...colour].sort().join(" | ");
    let h = 2166136261; for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    // readable: each instance with how it meets the others, one level deep
    const readable = nodes.map((x, i) => `${x.label}[${adj[i].map(([j, r]) => `${r} ${nodes[j].label}`).sort().join(", ")}]`).sort().join("; ");
    return { shape: (h >>> 0).toString(36), text: readable };
  };

  /** Turn windows' facts into candidate steps: each fact goes to the smallest window that found
   *  it, and facts with the same explanation make one step. */
  const explained = new Map<string, { stamp: number; e: Expl | null }>();
  const sigOf = (w: Window) => { let x = ""; for (const m of progOf(w).marks) x += known[m] < 0 ? "." : known[m]; return x; };
  const candidates = (found: Map<Window, [number, boolean][]>, tier: Tier): (Step & { w: Window })[] => {
    const ws = [...found.keys()].sort((a, b) => a.size - b.size);
    const claimed = new Set<number>(), jobs: { w: Window; facts: [number, boolean][] }[] = [];
    const stamp = (w: Window) => opts.search || opts.simulate ? 0 : progOf(w).marks.reduce((a, m) => Math.max(a, decidedAt[m]), -1);
    // (Options.search: branches share no history, so an explanation is kept by what its window knows)
    const sigs = new Map<Window, string>();
    const ek = (w: Window, m: number) => {
      if (!opts.search && !opts.simulate) return `${w.label}|${m}`;
      let x = sigs.get(w); if (x === undefined) { x = sigOf(w); sigs.set(w, x); }
      return `${w.label}|${m}|${x}`;
    };
    for (const w of ws) {
      const facts = found.get(w)!.filter(([m]) => !claimed.has(m));
      for (const [m] of facts) claimed.add(m);
      // explained before, with nothing new known in the window since: the same explanation
      const fresh = facts.filter(([m]) => explained.get(ek(w, m))?.stamp !== stamp(w));
      if (fresh.length) jobs.push({ w, facts: fresh });
    }
    const ex = explain(jobs), steps: (Step & { w: Window })[] = [];
    for (const { w, facts } of jobs) ex.get(w)?.forEach((e, k) => explained.set(ek(w, facts[k][0]), { stamp: stamp(w), e }));
    for (const w of ws) {
      const facts = found.get(w)!.filter(([m]) => known[m] < 0 && claimed.has(m) && jobs.every((j) => j.w === w || !j.facts.some(([x]) => x === m)));
      if (!facts.length) continue;
      const es = facts.map(([m]) => explained.get(ek(w, m))?.e ?? null), byKey = new Map<string, Step & { w: Window }>();
      facts.forEach(([m, v], k) => {
        const e = es[k];
        const key = e ? `${e.groups.join(",")}|${e.facts.join(",")}` : "none";
        let st = byKey.get(key);
        if (!st) {
          const kinds = e ? kindsOf(e) : [...new Set(groups.map((x) => x.kind))];
          st = { w, tier, where: w === ALL ? "the whole grid" : w.label, cells: w.cells, facts: [], uses: kinds, cost: +Math.max(0.3, costOf(e, tier) + (PRICES ? priceCorrection(featuresOf(e, tier, w), PRICES, spec.genre) : 0)).toFixed(2), feat: featuresOf(e, tier, w),
            because: e ? { clues: e.groups.map((gi) => `${groups[gi].kind} (${groups[gi].label})`), kinds, facts: e.facts.length, capped: e.capped } : { clues: ["(not found)"], kinds, facts: 0, capped: true } };
          byKey.set(key, st);
        }
        st.facts.push({ mark: markName[m], value: v, text: factText(m, v) });
      });
      // each step's shape, now that its decided cells are known
      for (const [key, st] of byKey) {
        const e = key === "none" ? null : es[facts.findIndex(([m]) => st.facts.some((f) => f.mark === markName[m]))];
        if (e) { const sh = shapeOf(e, st.facts.flatMap((f) => markCells[markOf.get(f.mark)!])); st.shape = sh.shape; st.shapeText = sh.text; }
      }
      steps.push(...byKey.values());
    }
    return steps;
  };

  /** A fact found by a case split or search: explained in the smallest neighbourhood that
   *  entails it (the tier-0 windows through its cells, then those touching them, and so on),
   *  falling back to the whole grid. */
  const wideStep = (m: number, v: boolean, tier: Tier) => {
    const tw = Date.now();
    try { return wideStepIn(m, v, tier); } finally { dbg(`wide step: ${Date.now() - tw} ms`); }
  };
  const wideStepIn = (m: number, v: boolean, tier: Tier) => {
    let bits = bitsOf(n, markCells[m]);
    for (let level = 0; level < 4; level++) {
      const next = bits.slice();
      for (const w of T0) { let meet = false; for (let k = 0; k < bits.length && !meet; k++) if (w.bits[k] & bits[k]) meet = true; if (meet) orInto(next, w.bits); }
      if (cellsOf(next).length === n) break;
      bits = next;
      const w: Window = { label: `around ${markCells[m].map(rc).join("/")} (${level + 1} deep)`, cells: cellsOf(bits), bits, size: cellsOf(bits).length };
      if (!progOf(w).marks.includes(m)) continue;
      const e = explain([{ w, facts: [[m, v]] }]).get(w)?.[0];
      if (e) return candidates(new Map([[w, [[m, v]]]]), tier)[0];
    }
    return candidates(new Map([[ALL, [[m, v]]]]), tier)[0];
  };

  /** Take the cheapest candidate steps (within SLACK of the cheapest); the rest wait for a later
   *  round, when more is known and they may come cheaper. */
  const take = (steps: (Step & { w: Window })[], open = 0) => {
    if (!steps.length) return 0;
    const min = Math.min(...steps.map((s) => s.cost));
    let count = 0;
    for (const s of steps) {
      if (s.cost > min + SLACK) { evaluatedAt.delete(s.w); continue; }
      const { w: _w, ...step } = s;
      path.push({ ...step, round, open }); count++;
    }
    for (const s of steps) if (s.cost <= min + SLACK) for (const f of s.facts) settle(markOf.get(f.mark)!, f.value);
    return count;
  };

  // components and their exits (found by the mining harness): a group of known cells that must
  // join another known cell of its kind (unshaded-connected: the unshaded cells; connected: the
  // shaded ones) can't have every unknown neighbour go the other way. Added as constraints while
  // solving, each with a window of the group and its neighbours; once true, true for good.
  const componentW: Window[] = [], lemmaSeen = new Set<string>(), firstAdded = constraints.length;
  let techAdded = 0;   // constraints the per-genre techniques added (counted apart from ROOM)
  const addComponentLemmas = () => {
    if (g.kind !== "square" || p.figure || !lemmasOn.includes("component")) return;
    const kinds: [boolean, boolean][] = [[false, p.rules.some((r) => r.rule === "unshaded-connected")], [true, p.rules.some((r) => r.rule === "connected")]];
    // a cell's shading: true, false, null unknown, undefined blocked
    const shadeOf = (i: number): boolean | null | undefined => {
      if (p.blocked.has(i)) return undefined;
      const m = markOf.get(`shaded(${i})`);
      return m === undefined ? false : known[m] === 1 ? true : known[m] === 0 ? false : null;
    };
    for (const [want, active] of kinds) {
      if (!active) continue;
      const seen = new Uint8Array(n), comps: number[][] = [];
      for (let i = 0; i < n; i++) {
        if (seen[i] || shadeOf(i) !== want) continue;
        const comp = [i]; seen[i] = 1;
        for (let k = 0; k < comp.length; k++) for (const l of g.cellLinks[comp[k]]) for (const j of g.links[l].cells) if (!seen[j] && shadeOf(j) === want) { seen[j] = 1; comp.push(j); }
        comps.push(comp);
      }
      if (comps.length < 2) continue;   // nothing known outside it to join
      for (const comp of comps) {
        const inS = new Set(comp), open = new Set<number>();
        for (const c of comp) for (const l of g.cellLinks[c]) for (const j of g.links[l].cells) if (!inS.has(j) && shadeOf(j) === null) open.add(j);
        if (!open.size) continue;
        const key = `${want}|${[...comp].sort((a, b) => a - b).join(",")}`;
        if (lemmaSeen.has(key) || constraints.length - firstAdded - techAdded >= ROOM - 1) continue;
        lemmaSeen.add(key);
        // the violation: every unknown neighbour goes the other way
        const body = [...open].map((j) => { const a = markAtom[markOf.get(`shaded(${j})`)!]; return want ? -a : a; });
        const k = rules.length, jx = constraints.length;
        rules.push({ choice: false, head: [], bound: null, body, weights: [], block: COMPONENT });
        constraints.push(k); consOf[k] = jx;
        const bits = new Uint32Array(empty.length);
        for (const l of body) { const f = fp[Math.abs(l)]; if (f) orInto(bits, f); }
        cfp.push(bits);
        const cs = cellsOf(bits);
        if (cs.length) byCell[cs[0]].push(jx); else everywhere.push(jx);
        groupOf[jx] = groups.length;
        groups.push({ kind: "component", label: `around ${rc(comp[0])}`, cells: cs, extent: comp.length });
        const cells = [...comp, ...open];
        if (cells.length <= 3 * Math.max(g.rows, g.cols)) componentW.push(win(`the group at ${rc(comp[0])} and its ways out`, cells));
      }
    }
  };

  // premature loops (Tatham's loop deductions): for a single loop, a known chain of line that isn't
  // all the line known can't close on itself, so the gap between its two ends stays empty. Added
  // as constraints while solving (the chain, the gap and one known piece of line elsewhere), each
  // with a window of the chain; once true, true for good.
  const LOOP = lemmaNames.indexOf("loop") >= 0 ? p.rules.length + lemmaNames.indexOf("loop") : -1;
  const addLoopLemmas = () => {
    const loop = p.rules.find((r) => r.rule === "loop");
    if (LOOP < 0 || !loop || g.kind !== "square" || p.figure) return;
    const fence = loop.of === "fence";
    // the loop's graph: corners joined by borders, or cells joined by links
    const ends = (e: number): [number, number] => (fence ? g.borders[e].corners : g.links[e].cells) as [number, number];
    const count = fence ? g.borders.length : g.links.length, name = (e: number) => `${fence ? "fence" : "line"}(${e})`;
    const state = (e: number) => { const m = markOf.get(name(e)); return m === undefined ? 0 : known[m]; };
    const yes: number[] = [];
    for (let e = 0; e < count; e++) if (state(e) === 1) yes.push(e);
    if (yes.length < 2) return;
    const at = new Map<number, number[]>();
    for (const e of yes) for (const v of ends(e)) { if (!at.has(v)) at.set(v, []); at.get(v)!.push(e); }
    const gap = new Map<string, number>();
    for (let e = 0; e < count; e++) if (state(e) < 0) { const [a, b] = ends(e); gap.set(a < b ? `${a},${b}` : `${b},${a}`, e); }
    const used = new Set<number>();
    for (const e0 of yes) {
      if (used.has(e0)) continue;
      // the chain through e0
      const chain = [e0], vs = new Set(ends(e0)); used.add(e0);
      for (let k = 0; k < chain.length; k++) for (const v of ends(chain[k])) for (const f of at.get(v) ?? []) if (!used.has(f)) { used.add(f); chain.push(f); for (const w of ends(f)) vs.add(w); }
      const tips = [...vs].filter((v) => at.get(v)!.length === 1);
      if (tips.length !== 2 || chain.length === yes.length) continue;
      const [a, b] = tips[0] < tips[1] ? tips : [tips[1], tips[0]];
      const e = gap.get(`${a},${b}`);
      if (e === undefined) continue;
      const key = `loop|${chain.slice().sort((x, y) => x - y).join(",")}`;
      if (lemmaSeen.has(key) || constraints.length - firstAdded - techAdded >= ROOM - 1) continue;
      lemmaSeen.add(key);
      // the line elsewhere: the known piece nearest the gap
      const inChain = new Set(chain), mid = markCells[markOf.get(name(e))!][0];
      const other = yes.filter((x) => !inChain.has(x)).map((x) => ({ x, d: Math.min(...markCells[markOf.get(name(x))!].map((c) => Math.abs(g.rc(c)[0] - g.rc(mid)[0]) + Math.abs(g.rc(c)[1] - g.rc(mid)[1]))) })).sort((u, w) => u.d - w.d)[0].x;
      const lit = (x: number) => markAtom[markOf.get(name(x))!];
      // the violation: the gap filled, with the chain and the other line as they are (atoms fixed
      // true in grounding drop out)
      const body = [lit(e), ...[...chain, other].map(lit).filter((l) => l > 0)];
      const k = rules.length, jx = constraints.length;
      rules.push({ choice: false, head: [], bound: null, body, weights: [], block: LOOP });
      constraints.push(k); consOf[k] = jx;
      const bits = new Uint32Array(empty.length);
      for (const l of body) { const f = fp[Math.abs(l)]; if (f) orInto(bits, f); }
      cfp.push(bits);
      const cs = cellsOf(bits);
      if (cs.length) byCell[cs[0]].push(jx); else everywhere.push(jx);
      groupOf[jx] = groups.length;
      groups.push({ kind: "premature", label: `the line through ${rc(mid)}`, cells: cs, extent: chain.length });
      if (cs.length <= 4 * Math.max(g.rows, g.cols)) componentW.push(win(`the line ending at ${rc(mid)}`, cs));
    }
  };

  // pockets (asked for again and again by the mining harness): for a loop, an open area of its
  // graph, the points (or cells) that still need line, joined by undecided edges, with the loose
  // ends of drawn line pieces that enter it. Whatever enters must leave (the line pairs up inside or
  // passes through), so a window over the pocket sees moves no fixed window holds. Found afresh each
  // round, like counting's windows; a stage names them ("pockets"), off unless asked for.
  const pocketCache = new Map<string, Window>();
  const pocketWindows = (): Window[] => {
    const loop = p.rules.find((r) => r.rule === "loop");
    if (!loop || g.kind !== "square" || p.figure) return [];
    const fence = loop.of === "fence";
    const nodes = fence ? (g.rows + 1) * (g.cols + 1) : n, count = fence ? g.borders.length : g.links.length;
    const ends = (e: number): [number, number] => (fence ? g.borders[e].corners : g.links[e].cells) as [number, number];
    const state = (e: number) => { const m = markOf.get(`${fence ? "fence" : "line"}(${e})`); return m === undefined ? 0 : known[m]; };
    const yes = new Int8Array(nodes), adj: number[][] = Array.from({ length: nodes }, () => []);
    for (let e = 0; e < count; e++) {
      const s = state(e), [a, b] = ends(e);
      if (s === 1) { yes[a]++; yes[b]++; } else if (s < 0) { adj[a].push(b); adj[b].push(a); }
    }
    // a corner's cells: the up to four around it
    const cellsAt = (v: number) => {
      if (!fence) return [v];
      const r = Math.floor(v / (g.cols + 1)), c = v % (g.cols + 1), out: number[] = [];
      for (const [y, x] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]]) if (y >= 0 && x >= 0 && y < g.rows && x < g.cols) out.push(g.cell(y, x));
      return out;
    };
    const open = (v: number) => adj[v].length > 0 && yes[v] < 2;
    const seen = new Uint8Array(nodes), out: Window[] = [], cap = 4 * Math.max(g.rows, g.cols);
    for (let v0 = 0; v0 < nodes; v0++) {
      if (seen[v0] || !open(v0)) continue;
      const comp = [v0]; seen[v0] = 1;
      for (let k = 0; k < comp.length; k++) for (const w of adj[comp[k]]) if (!seen[w] && open(w)) { seen[w] = 1; comp.push(w); }
      // small ones are inside the fixed windows already; big ones aren't a step a person takes
      if (comp.length < 3 || !comp.some((v) => yes[v] === 1)) continue;
      const cs = [...new Set(comp.flatMap(cellsAt))].sort((a, b) => a - b);
      if (cs.length > cap) continue;
      const key = cs.join(",");
      let w = pocketCache.get(key);
      if (!w) { w = win(`pocket at ${rc(cs[0])}`, cs); pocketCache.set(key, w); }
      out.push(w);
    }
    return out.sort((a, b) => a.size - b.size).slice(0, 100);
  };

  // ---- per-genre techniques (Options.techniques: the generator's bands, bands.ts) ----
  // Each adds, every round, constraints that the genre's rules imply from what's known now (so
  // they hold in every solution that agrees with the known facts, as the component lemma's do),
  // with windows that hold them: the windows' facts come from the puzzle's own constraints plus
  // these, so whatever they find is implied too. The stage family "techniques" checks the windows;
  // quick steps name the technique (the window label's prefix).
  // A literal for a technique's constraint body: an atom (undefined: no such atom, so false; 0: true
  // in grounding) taken true or false; null holds always (left out), NaN never (no constraint).
  const LIT = (atom: number | undefined, value: boolean): number | null => {
    if (atom === undefined) return value ? NaN : null;
    if (atom === 0) return value ? null : NaN;
    return value ? atom : -atom;
  };
  const techKeys = new Set<string>(), techCons: number[] = [];
  /** A technique's constraint ("not all of these at once"); its footprint, or null if it holds
   *  anyway or was added before. */
  const addTech = (t: string, lits: (number | null)[], label: string, extent?: number): Bits | null => {
    if (lits.some((l) => Number.isNaN(l))) return null;
    const body = [...new Set(lits.filter((l): l is number => l !== null))].sort((a, b) => a - b);
    if (!body.length) throw new Error(`technique ${t}: the known facts contradict ${label}`);
    const block = techBlock.get(t)!, key = `${block}|${body.join(",")}`;
    const bits = new Uint32Array(empty.length);
    for (const l of body) { const f = fp[Math.abs(l)]; if (f) orInto(bits, f); }
    if (techKeys.has(key) || techAdded >= TECH_ROOM - 1) return bits;
    techKeys.add(key);
    const k = rules.length, jx = constraints.length;
    rules.push({ choice: false, head: [], bound: null, body, weights: [], block });
    constraints.push(k); consOf[k] = jx;
    cfp.push(bits);
    const cs = cellsOf(bits);
    if (cs.length) byCell[cs[0]].push(jx); else everywhere.push(jx);
    // constraints with one label are one rule instance (a cell's dead-end rules, say), so an
    // explanation weighs them as one, and deletion has fewer to try
    const gk = `${t}|${label}`;
    let gi = techGroup.get(gk);
    if (gi === undefined) { gi = groups.length; techGroup.set(gk, gi); groups.push({ kind: t, label, cells: cs, ...(extent !== undefined ? { extent } : {}) }); }
    else { const gr = groups[gi], have = new Set(gr.cells); for (const c of cs) if (!have.has(c)) gr.cells.push(c); }
    groupOf[jx] = gi;
    techAdded++; techCons.push(jx);
    return bits;
  };
  const techGroup = new Map<string, number>();
  /** A new atom for a technique, true exactly when every literal of `body` holds (a candidate
   *  region, say); its footprint is theirs. The same body gives the same atom. */
  let nextAtom = G.maxAtom + 1;
  const techAtoms = new Map<string, number>();
  const defineAtom = (t: string, lits: number[]): number => {
    const body = [...new Set(lits)].sort((a, b) => a - b), key = `${t}|${body.join(",")}`;
    let a = techAtoms.get(key);
    if (a !== undefined) return a;
    if (techAtoms.size >= TECH_ROOM) return NaN;   // no room: the caller says nothing
    a = nextAtom++;
    techAtoms.set(key, a);
    const k = rules.length;
    rules.push({ choice: false, head: [a], bound: null, body, weights: [], block: techBlock.get(t)! });
    defs[a] = [k];
    const bits = new Uint32Array(empty.length);
    for (const l of body) { const f = fp[Math.abs(l)]; if (f) orInto(bits, f); }
    fp[a] = bits;
    return a;
  };
  // windows over the techniques' constraints: kept by their cells, made again when a constraint
  // added since lies inside (a window's program is fixed when first built)
  const techCache = new Map<string, { w: Window; at: number }>();
  let techW: Window[] = [];
  const techWin = (label: string, bits: Bits): Window => {
    const cs = cellsOf(bits), key = cs.join(",");
    const hit = techCache.get(key);
    if (hit && !techCons.some((j) => j >= hit.at && subset(cfp[j], bits))) return hit.w;
    const w: Window = { label, cells: cs, bits: bits.slice(), size: cs.length };
    techCache.set(key, { w, at: constraints.length });
    return w;
  };
  const techCap = 4 * (g.kind === "square" ? Math.max(g.rows, g.cols) : 9);
  const pushTechWindows = (ws: Window[]) => {
    const seen = new Set<Window>();
    techW = ws.filter((w) => !seen.has(w) && (seen.add(w), true)).sort((a, b) => a.size - b.size).slice(0, 400);
  };
  const unionBits = (...bs: Bits[]) => { const u = new Uint32Array(empty.length); for (const b of bs) orInto(u, b); return u; };

  // Shikaku (techniques "rects" and "rectpairs"): a number's candidate rectangles (of its area, holding it and no
  // other number: local.ts's shapes) that the known borders still allow. Its region is one of them;
  // a cell is covered by one of the candidates through it. Windows: each number's candidates, each
  // cell whose candidates belong to several numbers, and two numbers whose candidates overlap.
  // Within them, cells every candidate covers join the number, a cell only one number can reach
  // is its, and a candidate that would leave a cell uncovered goes. rects: the windows of one number
  // or one cell; rectpairs: of two numbers (with rects off, its constraints are its own).
  const rectsRound = (single: boolean, pairs: boolean): Window[] => {
    const T = single ? "rects" : "rectpairs";
    const shapes = local?.shapes;
    if (!shapes) return [];
    const state = (lk: number) => { const m = markOf.get(`cut(${lk})`); return m === undefined ? -1 : known[m]; };
    const pick = (id: number) => G.outputs.get(`pick(${id})`);
    const live = shapes.map((s, id) => pick(id) !== undefined && s.inside.every((lk) => state(lk) !== 1) && s.border.every((lk) => state(lk) !== 0));
    const byClue = new Map<number, number[]>(), byCell: number[][] = Array.from({ length: n }, () => []);
    shapes.forEach((s, id) => { if (!live[id]) return; if (!byClue.has(s.clue)) byClue.set(s.clue, []); byClue.get(s.clue)!.push(id); for (const c of s.cells) byCell[c].push(id); });
    const ws: Window[] = [], clueBits = new Map<number, Bits>();
    for (const [i, ids] of byClue) {
      const b = addTech(T, ids.map((id) => LIT(pick(id), false)), `the number at ${rc(i)}`, ids.length);
      if (!b) continue;
      clueBits.set(i, b);
      if (single) ws.push(techWin(`rects: the number at ${rc(i)}`, b));
    }
    for (let c = 0; c < n; c++) {
      const ids = byCell[c];
      if (!ids.length) continue;
      const b = addTech(T, ids.map((id) => LIT(pick(id), false)), `who covers ${rc(c)}`, ids.length);
      if (single && b && new Set(ids.map((id) => shapes[id].clue)).size > 1) ws.push(techWin(`rects: who covers ${rc(c)}`, b));
    }
    // two numbers whose candidates overlap
    const clues = pairs ? [...clueBits.keys()] : [];
    for (let a = 0; a < clues.length; a++) for (let b = a + 1; b < clues.length; b++) {
      const A = byClue.get(clues[a])!, B = byClue.get(clues[b])!;
      const cellsA = new Set(A.flatMap((id) => shapes[id].cells));
      if (!B.some((id) => shapes[id].cells.some((c) => cellsA.has(c)))) continue;
      ws.push(techWin(`rectpairs: the numbers at ${rc(clues[a])} and ${rc(clues[b])}`, unionBits(clueBits.get(clues[a])!, clueBits.get(clues[b])!)));
    }
    return ws.filter((w) => w.size <= techCap);
  };

  // Minesweeper (techniques "mines" and "chains"): two numbers whose open neighbours overlap
  // (mines: subsets and differences of their counts, the 1-2 patterns), or three in a chain, each
  // sharing an open cell with the next (chains), taken together. The fixed windows hold two
  // numbers only when side by side (a pair of neighbourhoods two apart is past the pairs' size
  // cap). No total mine count: the rules have none.
  const minesRound = (pairs: boolean, chains: boolean): Window[] => {
    const shadeOf = (i: number) => { const m = markOf.get(`shaded(${i})`); return m === undefined ? 0 : known[m]; };
    const clues: { i: number; open: Set<number>; bits: Bits }[] = [];
    for (const [i, gs] of p.cellGivens) {
      if (!gs.some((x) => x.kind === "number")) continue;
      const [r, c] = g.rc(i), around: number[] = [];
      for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) if (y >= 0 && x >= 0 && y < g.rows && x < g.cols) around.push(g.cell(y, x));
      const open = new Set(around.filter((j) => j !== i && shadeOf(j) < 0));
      if (open.size) clues.push({ i, open, bits: bitsOf(n, around) });
    }
    const meets = (a: Set<number>, b: Set<number>) => { for (const x of a) if (b.has(x)) return true; return false; };
    const nb = clues.map((a) => clues.flatMap((b, k) => (a !== b && meets(a.open, b.open) ? [k] : [])));
    const ws: Window[] = [];
    clues.forEach((a, ka) => {
      for (const kb of nb[ka]) {
        if (pairs && kb > ka) ws.push(techWin(`mines: ${rc(a.i)} and ${rc(clues[kb].i)}`, unionBits(a.bits, clues[kb].bits)));
        // chains of three with a in the middle
        if (chains) for (const kc of nb[ka]) if (kc > kb) ws.push(techWin(`chains: ${rc(clues[kb].i)}, ${rc(a.i)} and ${rc(clues[kc].i)}`, unionBits(a.bits, clues[kb].bits, clues[kc].bits)));
      }
    });
    return ws;
  };
  // lines through cells (Simple Path, Simple Loop, Numberlink): each link's state and atom
  const lineState = (l: number) => { const m = markOf.get(`line(${l})`); return m === undefined ? 0 : known[m]; };
  const lineAtom = (l: number) => { const m = markOf.get(`line(${l})`); return m === undefined ? undefined : markAtom[m]; };
  const otherEnd = (l: number, c: number) => (g.links[l].cells[0] === c ? g.links[l].cells[1] : g.links[l].cells[0]);
  /** The drawn pieces of line: each piece's links and its cells, and the cells at its two ends (a
   *  lone cell in `alone` counts as a piece with no links, both its ends itself). */
  const linePieces = (alone: number[] = []) => {
    const seen = new Uint8Array(n), out: { links: number[]; cells: number[]; tips: number[] }[] = [];
    const onAt = (c: number) => g.cellLinks[c].filter((l) => lineState(l) === 1);
    for (let c0 = 0; c0 < n; c0++) {
      if (seen[c0] || !(onAt(c0).length || alone.includes(c0))) continue;
      const cells = [c0], links = new Set<number>(); seen[c0] = 1;
      for (let k = 0; k < cells.length; k++) for (const l of onAt(cells[k])) { links.add(l); const d = otherEnd(l, cells[k]); if (!seen[d]) { seen[d] = 1; cells.push(d); } }
      const tips = cells.filter((c) => onAt(c).length <= 1);
      out.push({ links: [...links], cells, tips: tips.length === 1 ? [tips[0], tips[0]] : tips });
    }
    return out;
  };

  // Simple Path (technique "ends"): loose ends that mustn't close up. A piece of line whose two
  // ends are side by side can't be joined into a ring (the path has none); and with every cell to
  // visit, the piece from the way in can't join the piece from the way out while a cell is left
  // over. Both said of the drawn line itself (its links in the constraint), so they hold by the
  // rules alone, like the premature-loop lemma for loops.
  const endsRound = (): Window[] => {
    if (p.rules.some((r) => r.rule === "links")) return linkEndsRound();
    const path = p.rules.find((r) => r.rule === "path");
    if (!path) return [];
    const ends = pathEnds(p), pieces = linePieces(ends), ws: Window[] = [];
    const gapOf = (a: number, b: number) => g.cellLinks[a].find((l) => otherEnd(l, a) === b && lineState(l) < 0);
    const open = [...Array(n).keys()].filter((c) => !p.blocked.has(c));
    for (const pc of pieces) {
      const [a, b] = pc.tips;
      if (a === b || ends.includes(a) || ends.includes(b)) continue;
      const gap = gapOf(a, b);
      if (gap === undefined) continue;
      const bits = addTech("ends", [LIT(lineAtom(gap), true), ...pc.links.map((l) => LIT(lineAtom(l), true))], `the line ending at ${rc(a)}`, pc.links.length);
      if (bits) ws.push(techWin(`ends: the line ending at ${rc(a)}`, bits));
    }
    if (path.cover) {
      const A = pieces.find((pc) => pc.cells.includes(ends[0])), B = pieces.find((pc) => pc.cells.includes(ends[1]));
      if (A && B && A !== B && A.cells.length + B.cells.length < open.length) {
        const x = A.tips.find((c) => c !== ends[0]) ?? ends[0], y = B.tips.find((c) => c !== ends[1]) ?? ends[1];
        const gap = gapOf(x, y);
        if (gap !== undefined) {
          const bits = addTech("ends", [LIT(lineAtom(gap), true), ...[...A.links, ...B.links].map((l) => LIT(lineAtom(l), true))], `the way in and out at ${rc(x)}`, A.links.length + B.links.length);
          if (bits) ws.push(techWin(`ends: the way in and out at ${rc(x)}`, bits));
        }
      }
    }
    return ws.filter((w) => w.size <= techCap);
  };

  // Numberlink's numbers: cell → its number
  const linkNums = new Map<number, number>();
  if (p.rules.some((r) => r.rule === "links")) for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number" && typeof x.value === "number") linkNums.set(i, x.value);
  /** A known-implied constraint said of the drawn line (`lits`, rule-level) when its footprint fits
   *  a window, else of `short` alone (it holds given what's known) */
  const addTechFitting = (t: string, lits: (number | null)[], short: (number | null)[], label: string, extent?: number) => {
    const full = addTech(t, lits, label, extent);
    return full && cellsOf(full).length <= techCap ? full : addTech(t, short, label, extent);
  };
  // Numberlink (technique "ends"): two pieces of line can't be joined if they carry different
  // numbers (a line would join them), and a piece with no number can't close into a ring (a ring
  // reaches no number).
  const linkEndsRound = (): Window[] => {
    const pieces = linePieces([...linkNums.keys()]), pieceOf = new Int32Array(n).fill(-1), ws: Window[] = [];
    pieces.forEach((pc, k) => { for (const c of pc.cells) pieceOf[c] = k; });
    const label = pieces.map((pc) => [...new Set(pc.cells.filter((c) => linkNums.has(c)).map((c) => linkNums.get(c)!))]);
    const free = (k: number, c: number) => pieces[k].tips.includes(c) && (!linkNums.has(c) || !pieces[k].links.length);
    for (let l = 0; l < g.links.length; l++) {
      if (lineState(l) >= 0) continue;
      const [x, y] = g.links[l].cells, A = pieceOf[x], B = pieceOf[y];
      if (A < 0 || B < 0 || !free(A, x) || !free(B, y)) continue;
      const ring = A === B && !label[A].length, clash = A !== B && label[A].length > 0 && label[B].length > 0 && label[A][0] !== label[B][0];
      if (!ring && !clash) continue;
      const links = A === B ? pieces[A].links : [...pieces[A].links, ...pieces[B].links];
      const bits = addTechFitting("ends", [LIT(lineAtom(l), true), ...links.map((k) => LIT(lineAtom(k), true))], [LIT(lineAtom(l), true)], `the line ending at ${rc(x)}`, links.length);
      if (bits) ws.push(techWin(`ends: the line ending at ${rc(x)}`, bits));
    }
    return ws.filter((w) => w.size <= techCap);
  };
  // Numberlink (technique "owners"): the cells each pair's line can still reach, from either of
  // its numbers, through cells no other pair has taken (another number, or a piece of line joined
  // to one) by links not ruled out. A link can be drawn only by a pair that reaches both its cells.
  const ownersRound = (): Window[] => {
    if (!linkNums.size) return [];
    const pieces = linePieces([...linkNums.keys()]), owner = new Int32Array(n).fill(-1);
    for (const pc of pieces) { const vs = [...new Set(pc.cells.filter((c) => linkNums.has(c)).map((c) => linkNums.get(c)!))]; if (vs.length === 1) for (const c of pc.cells) owner[c] = vs[0]; }
    const values = [...new Set(linkNums.values())];
    const reach = new Map<number, Uint8Array>();
    for (const v of values) {
      const seen = new Uint8Array(n), st = [...linkNums].filter(([, w]) => w === v).map(([c]) => c);
      for (const c of st) seen[c] = 1;
      while (st.length) { const c = st.pop()!; for (const l of g.cellLinks[c]) { if (lineState(l) === 0) continue; const d = otherEnd(l, c); if (!seen[d] && !p.blocked.has(d) && (owner[d] < 0 || owner[d] === v)) { seen[d] = 1; st.push(d); } } }
      reach.set(v, seen);
    }
    const ws: Window[] = [];
    for (let l = 0; l < g.links.length; l++) {
      if (lineState(l) >= 0) continue;
      const [x, y] = g.links[l].cells;
      if (values.some((v) => reach.get(v)![x] && reach.get(v)![y])) continue;
      addTech("owners", [LIT(lineAtom(l), true)], `the pairs that reach ${rc(x)}`);
    }
    for (let i = 0; i < n; i++) if (g.cellLinks[i].some((l) => lineState(l) < 0)) ws.push(techWin(`owners: ${rc(i)}`, bitsOf(n, [i, ...g.cellLinks[i].map((l) => otherEnd(l, i))])));
    return ws;
  };

  // Simple Path and Simple Loop with every cell visited (technique "cuts"): a part of the grid
  // that the line can only leave by one, two or three links (what's undecided and drawn; walls,
  // rocks and links ruled out don't count). The line must cross into it and out again: a loop an
  // even number of times, at least two; a path the same, or an odd number if one of its ends is
  // inside. Said of every link round the part (the counts it can't have), so it holds by the rules
  // alone; the windows are the part's edge.
  const cutsRound = (): Window[] => {
    const rule = p.rules.find((r) => (r.rule === "path" || r.rule === "loop" || r.rule === "links") && r.cover && (r.rule !== "loop" || r.of === "loop"));
    if (!rule) return [];
    const ends = rule.rule === "path" ? pathEnds(p) : rule.rule === "links" ? [...linkNums.keys()] : [];
    const V = [...Array(n).keys()].filter((c) => !p.blocked.has(c));
    const possible = (l: number) => lineState(l) !== 0 && !g.links[l].cells.some((c) => p.blocked.has(c));
    const E = g.links.map((_, l) => l).filter(possible);
    if (!V.length || E.length > 250) return [];
    // the bridges of what's possible with some links taken out (Tarjan's low points, iteratively)
    const bridges = (removed: Set<number>): number[] => {
      const disc = new Int32Array(n).fill(-1), low = new Int32Array(n), out: number[] = [];
      let t = 0;
      const frames: [number, number, number][] = [[V[0], -1, 0]];   // cell, link in, next link index
      disc[V[0]] = low[V[0]] = t++;
      while (frames.length) {
        const f = frames[frames.length - 1], [c, inL] = f, ls = g.cellLinks[c];
        if (f[2] < ls.length) {
          const l = ls[f[2]++];
          if (l === inL || removed.has(l) || !possible(l)) continue;
          const d = otherEnd(l, c);
          if (disc[d] < 0) { disc[d] = low[d] = t++; frames.push([d, l, 0]); }
          else low[c] = Math.min(low[c], disc[d]);
          continue;
        }
        frames.pop();
        if (frames.length) { const up = frames[frames.length - 1][0]; low[up] = Math.min(low[up], low[c]); if (low[c] > disc[up]) out.push(inL); }
      }
      return out;
    };
    // cuts of one, two and three links (each link of a cut crossing it)
    const cuts = new Map<string, number[]>();
    const note = (R: number[]) => { const k = [...R].sort((x, y) => x - y); cuts.set(k.join(","), k); };
    const b0 = new Set(bridges(new Set()));
    for (const e of b0) note([e]);
    const rest = E.filter((e) => !b0.has(e));
    const b1 = new Map(rest.map((e) => [e, bridges(new Set([e])).filter((f) => !b0.has(f))]));
    for (const [e, fs] of b1) for (const f of fs) note([e, f]);
    if (rest.length <= 150) for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
      const e = rest[i], f = rest[j];
      if (b1.get(e)!.includes(f)) continue;
      for (const h of bridges(new Set([e, f]))) if (!b0.has(h) && !b1.get(e)!.includes(h) && !b1.get(f)!.includes(h)) note([e, f, h]);
    }
    const sideOf = (R: number[]) => {
      const removed = new Set(R), seen = new Uint8Array(n), st = [V[0]]; seen[V[0]] = 1;
      while (st.length) { const c = st.pop()!; for (const l of g.cellLinks[c]) if (possible(l) && !removed.has(l)) { const d = otherEnd(l, c); if (!seen[d]) { seen[d] = 1; st.push(d); } } }
      const inS = V.filter((c) => seen[c]), outS = V.filter((c) => !seen[c]);
      return inS.length <= outS.length ? inS : outS;
    };
    // a loop's single cell is its own degree rule (a path's cells may have none, as far as the
    // cell's own rule goes: being on the path is the global part)
    const least = rule.rule === "path" ? 1 : 2;
    const parts = [...cuts.values()].map((R) => ({ R, S: sideOf(R) })).filter(({ S }) => S.length >= least && V.length - S.length >= least)
      .sort((x, y) => x.S.length - y.S.length).slice(0, 300);
    const ws: Window[] = [];
    for (const { R, S } of parts) {
      const inSet = new Set(S), boundary = new Set<number>();
      for (const c of S) for (const l of g.cellLinks[c]) if (!inSet.has(otherEnd(l, c))) boundary.add(l);
      const inside = ends.filter((e) => inSet.has(e)).length, parity = inside % 2, need = parity ? 1 : rule.rule === "links" && inside ? 0 : 2;
      let bits: Bits | null = null;
      for (let mask = 0; mask < 1 << R.length; mask++) {
        const on = new Set(R.filter((_, k) => mask & (1 << k)));
        if (on.size >= need && on.size % 2 === parity) continue;
        const b = addTech("cuts", [...boundary].map((l) => LIT(lineAtom(l), on.has(l))), `the part at ${rc(S[0])}`, S.length);
        if (b) bits = bits ? unionBits(bits, b) : b;
      }
      if (bits) ws.push(techWin(`cuts: the part at ${rc(S[0])}`, bits));
    }
    return ws.filter((w) => w.size <= techCap);
  };

  // Spiral Galaxies (technique "mirror", with Options.cellAtoms): the cells each galaxy can still
  // reach. A cell can be in a galaxy only if its mirror through the centre is in the grid and can
  // be too, and it joins the centre through cells that can be, by sides not known to be borders;
  // two cells with no border between them are in the same galaxy; a cell only one galaxy can reach
  // is that galaxy's, and its known borders keep that galaxy out of the cells beyond. Repeated
  // till nothing changes; each cell kept out of a galaxy is a constraint, and each cell with its
  // four neighbours a window (where the borders follow).
  const mirrorRound = (): Window[] => {
    if (!galAtoms || g.kind !== "square") return [];
    const K = p.galaxies.length, gal = (i: number, k: number) => G.outputs.get(`gal(${i},${k})`);
    const cutState = (l: number) => { const m = markOf.get(`cut(${l})`); return m === undefined ? -1 : known[m]; };
    const mirror = (i: number, [y, x]: [number, number]) => {
      const [r, c] = g.rc(i), r2 = y - r - 1, c2 = x - c - 1;
      return r2 >= 0 && c2 >= 0 && r2 < g.rows && c2 < g.cols ? g.cell(r2, c2) : -1;
    };
    const can: Uint8Array[] = p.galaxies.map((gx, k) => Uint8Array.from({ length: n }, (_, i) => (gal(i, k) !== undefined && mirror(i, gx) >= 0 && !p.blocked.has(i) ? 1 : 0)));
    const cores = p.galaxies.map((gx) => galaxyCore(p, gx));
    let changed = true;
    while (changed) {
      changed = false;
      const drop = (k: number, i: number) => { if (can[k][i]) { can[k][i] = 0; changed = true; } };
      for (let k = 0; k < K; k++) {
        // symmetry
        for (let i = 0; i < n; i++) if (can[k][i] && !can[k][mirror(i, p.galaxies[k])]) drop(k, i);
        // reach from the centre, not through a known border
        const seen = new Uint8Array(n), st = cores[k].filter((i) => can[k][i]);
        for (const i of st) seen[i] = 1;
        while (st.length) { const i = st.pop()!; for (const l of g.cellLinks[i]) { if (cutState(l) === 1) continue; const j = otherEnd(l, i); if (can[k][j] && !seen[j]) { seen[j] = 1; st.push(j); } } }
        for (let i = 0; i < n; i++) if (can[k][i] && !seen[i]) drop(k, i);
      }
      for (let l = 0; l < g.links.length; l++) {
        const [a, b] = g.links[l].cells, s = cutState(l);
        if (s === 0) for (let k = 0; k < K; k++) if (can[k][a] !== can[k][b]) { drop(k, a); drop(k, b); }
        if (s === 1) for (const [x, y] of [[a, b], [b, a]]) {
          const ks = [...Array(K).keys()].filter((k) => can[k][x]);
          if (ks.length === 1) drop(ks[0], y);
        }
      }
    }
    const ws: Window[] = [];
    for (let i = 0; i < n; i++) {
      if (p.blocked.has(i)) continue;
      for (let k = 0; k < K; k++) {
        const a = gal(i, k);
        if (!can[k][i] && a !== undefined) addTech("mirror", [LIT(a, true)], `the galaxies that reach ${rc(i)}`);
      }
      if (g.cellLinks[i].some((l) => cutState(l) < 0)) ws.push(techWin(`mirror: ${rc(i)}`, bitsOf(n, [i, ...g.cellLinks[i].map((l) => otherEnd(l, i))])));
    }
    return ws;
  };

  // Hidoku and the other number paths (techniques "distance" and "deadends"). Distance: between
  // two placed numbers a < b with none placed between, k can only be in a cell within k - a steps
  // of a and b - k of b, counting steps through cells that can still hold a number between them
  // (below the smallest placed or above the largest, one side only); each cell kept from k is a
  // constraint, and so is "k is in one of the cells left". Dead ends: k (past 1) needs k - 1
  // beside it as well as k + 1 (the rules only ask for k + 1 next to k), so a cell with one open
  // neighbour can only be an end; said of the cell and its neighbours, by the rules alone.
  // Windows: each number's cells with the next and last numbers' cells, and each cell with its
  // neighbours.
  const numberPath = p.rules.find((r) => r.rule === "number-path");
  const N = p.digits;
  const digitState = (i: number, d: number) => { const m = markOf.get(`digit(${i},${d})`); return m === undefined ? 0 : known[m]; };
  const digitAtom = (i: number, d: number) => { const m = markOf.get(`digit(${i},${d})`); return m === undefined ? undefined : markAtom[m]; };
  const pnOf = numberPath ? Array.from({ length: n }, (_, i) => pathNeighbours(numberPath, p, i)) : [];
  const nearBits = (i: number) => bitsOf(n, [i, ...pnOf[i]]);
  let deadendsDone = false;
  const deadendsRound = (): Window[] => {
    if (!numberPath) return [];
    if (!deadendsDone) {
      deadendsDone = true;
      for (let i = 0; i < n; i++) if (!p.blocked.has(i)) for (let d = 2; d <= N; d++)
        addTech("deadends", [LIT(digitAtom(i, d), true), ...pnOf[i].map((j) => LIT(digitAtom(j, d - 1), false))], `the number before ${rc(i)}`);
    }
    const ws: Window[] = [];
    for (let i = 0; i < n; i++) if (!p.blocked.has(i) && [...Array(N).keys()].some((k) => digitState(i, k + 1) < 0)) ws.push(techWin(`deadends: around ${rc(i)}`, nearBits(i)));
    return ws;
  };
  const distanceRound = (): Window[] => {
    if (!numberPath) return [];
    const open = [...Array(n).keys()].filter((i) => !p.blocked.has(i));
    const placedAt = new Int32Array(N + 1).fill(-1), valueOf = new Int32Array(n).fill(0);
    for (const i of open) for (let d = 1; d <= N; d++) if (digitState(i, d) === 1) { placedAt[d] = i; valueOf[i] = d; }
    const placed = [...Array(N).keys()].map((k) => k + 1).filter((d) => placedAt[d] >= 0);
    // steps from a placed cell through cells that can hold a number in (lo, hi)
    const stepsFrom = (src: number, lo: number, hi: number) => {
      const dist = new Int32Array(n).fill(-1), st = [src]; dist[src] = 0;
      const through = (j: number) => !valueOf[j] && [...Array(hi - lo - 1).keys()].some((x) => digitState(j, lo + 1 + x) !== 0);
      for (let q = 0; q < st.length; q++) { const i = st[q]; for (const j of pnOf[i]) if (dist[j] < 0 && through(j)) { dist[j] = dist[i] + 1; st.push(j); } }
      return dist;
    };
    const cand = new Map<number, number[]>();
    const segments: [number, number][] = [];
    if (!placed.length) return [];
    if (placed[0] > 1) segments.push([0, placed[0]]);
    for (let x = 0; x + 1 < placed.length; x++) if (placed[x + 1] > placed[x] + 1) segments.push([placed[x], placed[x + 1]]);
    if (placed.at(-1)! < N) segments.push([placed.at(-1)!, N + 1]);
    for (const [a, b] of segments) {
      const dA = a >= 1 ? stepsFrom(placedAt[a], a, b) : null, dB = b <= N ? stepsFrom(placedAt[b], a, b) : null;
      for (let k = a + 1; k < b; k++) {
        const cs: number[] = [];
        for (const i of open) {
          if (valueOf[i] || digitState(i, k) === 0) continue;
          const ok = (!dA || (dA[i] >= 0 && dA[i] <= k - a)) && (!dB || (dB[i] >= 0 && dB[i] <= b - k));
          if (ok) cs.push(i);
          else addTech("distance", [LIT(digitAtom(i, k), true)], `how far ${rc(i)} is`);
        }
        cand.set(k, cs);
        if (cs.length) addTech("distance", cs.map((i) => LIT(digitAtom(i, k), false)), `where ${k} goes`, cs.length);
      }
    }
    const ws: Window[] = [];
    const cellsFor = (k: number) => (placedAt[k] >= 0 ? [placedAt[k]] : cand.get(k) ?? []);
    for (const [k, cs] of cand) {
      if (!cs.length) continue;
      const cells = [...cellsFor(k - 1), ...cs, ...cellsFor(k + 1)];
      ws.push(techWin(`distance: ${k}`, bitsOf(n, cells)));
    }
    for (let i = 0; i < n; i++) if (!valueOf[i] && !p.blocked.has(i)) ws.push(techWin(`distance: around ${rc(i)}`, nearBits(i)));
    return ws.filter((w) => w.size <= techCap);
  };

  // Easy as ABC (technique "fish"): each letter is once in every row and column, so for one
  // letter the rows and columns are matched up; two rows and two columns together (with the clues
  // that look along them) see an X-wing: the letter's two places in two rows fill both columns.
  // The fixed windows hold three lines in a chain or crossed by a fourth, not two by two. Windows
  // only, over the puzzle's own rules: the pairs of rows and pairs of columns still open.
  const fishRound = (): Window[] => {
    if (g.kind !== "square" || !p.rules.some((r) => r.rule === "letters")) return [];
    const openLine = (cells: number[]) => cells.some((i) => [...Array(p.digits).keys()].some((d) => digitState(i, d + 1) < 0));
    const rows = [...Array(g.rows).keys()].map((r) => [...Array(g.cols).keys()].map((c) => g.cell(r, c))).filter(openLine);
    const cols = [...Array(g.cols).keys()].map((c) => [...Array(g.rows).keys()].map((r) => g.cell(r, c))).filter(openLine);
    // two lines one way where some letter's places fall in at most three lines the other way:
    // those lines, two at a time
    const ws: Window[] = [];
    const name = (cells: number[], across: boolean) => (across ? `row ${g.rc(cells[0])[0] + 1}` : `column ${g.rc(cells[0])[1] + 1}`);
    for (const [ls, others, across] of [[rows, cols, true], [cols, rows, false]] as const) {
      const at = (cell: number) => (across ? g.rc(cell)[1] : g.rc(cell)[0]);
      for (let a = 0; a < ls.length; a++) for (let b = a + 1; b < ls.length; b++) {
        const pairs = new Set<string>();
        for (let d = 1; d <= p.digits; d++) {
          const where = new Set([...ls[a], ...ls[b]].filter((i) => digitState(i, d) !== 0).map(at));
          if (where.size > 3) continue;
          const xs = [...where].sort((u, v) => u - v);
          for (let x = 0; x < xs.length; x++) for (let y = x + 1; y < xs.length; y++) pairs.add(`${xs[x]},${xs[y]}`);
        }
        for (const key of pairs) {
          const [x, y] = key.split(",").map(Number), ox = others.find((o) => at(o[0]) !== undefined && (across ? g.rc(o[0])[1] : g.rc(o[0])[0]) === x), oy = others.find((o) => (across ? g.rc(o[0])[1] : g.rc(o[0])[0]) === y);
          if (!ox || !oy) continue;
          ws.push(techWin(`fish: ${name(ls[a], across)} and ${name(ls[b], across)}, ${name(ox, !across)} and ${name(oy, !across)}`, bitsOf(n, [...ls[a], ...ls[b], ...ox, ...oy])));
        }
      }
    }
    return ws;
  };

  // Fill-in (technique "slots", with Options.cellAtoms): which entries still fit each slot (its
  // length, and the digits known in it and known not to be), and which slots each entry still
  // fits. An entry with one slot left goes there, and a slot with one entry left takes it, and
  // neither is then anywhere else; repeated till nothing changes. Each pair ruled out is a
  // constraint, and so are "this slot takes one of these" and "this entry goes in one of these".
  // Windows: each slot with the slots crossing it, and each entry's slots.
  const slotsRound = (): Window[] => {
    if (!putAtoms) return [];
    const put = (e: number, s: number) => G.outputs.get(`put(${e},${s})`);
    const E = p.entries.length, S = slots.length;
    const fits = Array.from({ length: E }, (_, e) => Array.from({ length: S }, (_, s) =>
      put(e, s) !== undefined && slots[s].length === p.entries[e].length && slots[s].every((i, k) => digitState(i, p.entries[e][k]) !== 0
        && [...Array(p.digits).keys()].every((d) => d + 1 === p.entries[e][k] || digitState(i, d + 1) !== 1))));
    let changed = true;
    while (changed) {
      changed = false;
      for (let e = 0; e < E; e++) {
        const ss = [...Array(S).keys()].filter((s) => fits[e][s]);
        if (ss.length === 1) for (let f = 0; f < E; f++) if (f !== e && fits[f][ss[0]]) { fits[f][ss[0]] = false; changed = true; }
      }
      for (let s = 0; s < S; s++) {
        const es = [...Array(E).keys()].filter((e) => fits[e][s]);
        if (es.length === 1) for (let t = 0; t < S; t++) if (t !== s && fits[es[0]][t]) { fits[es[0]][t] = false; changed = true; }
      }
    }
    const ws: Window[] = [], slotName = (s: number) => `the slot at ${rc(slots[s][0])} ${g.rc(slots[s][1])[0] === g.rc(slots[s][0])[0] ? "across" : "down"}`;
    for (let s = 0; s < S; s++) {
      for (let e = 0; e < E; e++) if (!fits[e][s] && put(e, s) !== undefined) addTech("slots", [LIT(put(e, s), true)], slotName(s));
      const es = [...Array(E).keys()].filter((e) => fits[e][s]);
      if (es.length) addTech("slots", es.map((e) => LIT(put(e, s), false)), slotName(s), es.length);
      if (slots[s].some((i) => [...Array(p.digits).keys()].some((d) => digitState(i, d + 1) < 0))) {
        const crossing = slots.filter((t, k) => k !== s && t.some((i) => slots[s].includes(i)));
        ws.push(techWin(`slots: ${slotName(s)}`, bitsOf(n, [...slots[s], ...crossing.flat()])));
      }
    }
    for (let e = 0; e < E; e++) {
      const ss = [...Array(S).keys()].filter((s) => fits[e][s]);
      if (ss.length < 2) continue;
      const b = addTech("slots", ss.map((s) => LIT(put(e, s), false)), `where ${p.entries[e].map((d) => symbolOf(p, d)).join("")} goes`, ss.length);
      if (b) ws.push(techWin(`slots: where ${p.entries[e].map((d) => symbolOf(p, d)).join("")} goes`, b));
    }
    return ws.filter((w) => w.size <= techCap);
  };

  // Fillomino (techniques "sizes", and "shapes" for the shapes a part can grow into): the known
  // parts of regions (cells joined by links known not to be cut), with the number in them if any. A part that has reached its number closes (every
  // link out is cut); parts with different numbers, or whose sizes together pass the number, stay
  // apart (the link between them is cut); a part short of its number with every way out into one
  // cell takes that cell in (those links aren't cut), and with one way out, takes it. Each holds
  // given the known links; windows are each part with the cells round it.
  const sizesRound = (basic: boolean, shaped: boolean): Window[] => {
    if (!p.marks.includes("regions") || !p.rules.some((r) => r.rule === "size-clue")) return [];
    const cutState = (l: number) => { const m = markOf.get(`cut(${l})`); return m === undefined ? -1 : known[m]; };
    const cutAtom = (l: number) => { const m = markOf.get(`cut(${l})`); return m === undefined ? undefined : markAtom[m]; };
    const num = new Map<number, number>();
    for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number" && typeof x.value === "number") num.set(i, x.value);
    const part = new Int32Array(n).fill(-1), parts: { cells: number[]; value: number | undefined }[] = [];
    for (let c0 = 0; c0 < n; c0++) {
      if (part[c0] >= 0 || p.blocked.has(c0)) continue;
      const k = parts.length, cells = [c0]; part[c0] = k;
      for (let q = 0; q < cells.length; q++) for (const l of g.cellLinks[cells[q]]) { const d = otherEnd(l, cells[q]); if (cutState(l) === 0 && part[d] < 0 && !p.blocked.has(d)) { part[d] = k; cells.push(d); } }
      const vs = [...new Set(cells.filter((c) => num.has(c)).map((c) => num.get(c)!))];
      parts.push({ cells, value: vs.length === 1 ? vs[0] : undefined });
    }
    const ws: Window[] = [], label = (k: number) => `the region at ${rc(parts[k].cells[0])}`, differ = p.rules.some((r) => r.rule === "neighbors-differ-size");
    const cutIt = (l: number, k: number) => addTech("sizes", [LIT(cutAtom(l), false)], label(k), parts[k].cells.length);
    const joinIt = (l: number, k: number) => addTech("sizes", [LIT(cutAtom(l), true)], label(k), parts[k].cells.length);
    parts.forEach((pt, k) => {
      const exits: number[] = [];
      for (const c of pt.cells) for (const l of g.cellLinks[c]) if (cutState(l) < 0 && part[otherEnd(l, c)] !== k && !p.blocked.has(otherEnd(l, c))) exits.push(l);
      if (!exits.length) return;
      const v = pt.value;
      if (basic) basicMoves(pt, k, exits, v);
      if (shaped) shapesOf(pt, k, v);
    });
    return ws;
    function basicMoves(pt: { cells: number[] }, k: number, exits: number[], v: number | undefined) {
      if (v !== undefined && pt.cells.length >= v) for (const l of exits) cutIt(l, k);
      for (const l of exits) {
        const c = pt.cells.includes(g.links[l].cells[0]) ? g.links[l].cells[0] : g.links[l].cells[1], o = part[otherEnd(l, c)], w = parts[o].value;
        if (v !== undefined && w !== undefined && v !== w) cutIt(l, k);
        const cap = v ?? w;
        if (cap !== undefined && pt.cells.length + parts[o].cells.length > cap) cutIt(l, k);
      }
      if (v !== undefined && pt.cells.length < v) {
        const into = new Set(exits.map((l) => part[g.links[l].cells.find((c) => part[c] !== k)!]));
        if (into.size === 1) for (const l of exits) joinIt(l, k);
      }
      const around = new Set(pt.cells);
      for (const c of pt.cells) for (const l of g.cellLinks[c]) around.add(otherEnd(l, c));
      if (around.size <= techCap) ws.push(techWin(`sizes: ${label(k)}`, bitsOf(n, around)));
    }
    function shapesOf(pt: { cells: number[] }, k: number, v: number | undefined) {
      // (technique "shapes") a numbered part short of its number: the regions it can still grow into (every shape of
      // that size holding it, whole parts at a time, none with another number, no link inside
      // known cut, none beside a part of the same number outside it). Its region is one of them,
      // as Shikaku's rectangles.
      if (v === undefined || pt.cells.length >= v || v > 8) return;
      const shapes: number[][] = [], seen = new Set<string>();
      const grow = (cells: number[]) => {
        if (seen.size > 4000) return;
        const key = [...cells].sort((a, b) => a - b).join(",");
        if (seen.has(key)) return;
        seen.add(key);
        if (cells.length === v) { shapes.push(cells); return; }
        const inS = new Set(cells);
        for (const c of cells) for (const l of g.cellLinks[c]) {
          const d = otherEnd(l, c);
          if (inS.has(d) || p.blocked.has(d) || cutState(l) === 1) continue;
          const o = parts[part[d]];
          if (o.value !== undefined && o.value !== v) continue;
          if (cells.length + o.cells.length > v) continue;
          grow([...cells, ...o.cells]);
        }
      };
      grow(pt.cells);
      const ok = shapes.filter((cs) => {
        const inS = new Set(cs);
        for (const c of cs) for (const l of g.cellLinks[c]) {
          const d = otherEnd(l, c);
          if (inS.has(d)) { if (cutState(l) === 1) return false; }
          else if (differ && !p.blocked.has(d) && parts[part[d]].value === v) return false;
        }
        return true;
      });
      if (seen.size > 4000 || !ok.length || ok.length > 300) return;
      const atoms = ok.map((cs) => {
        const inS = new Set(cs), lits: number[] = [];
        for (const c of cs) for (const l of g.cellLinks[c]) {
          const d = otherEnd(l, c);
          if (p.blocked.has(d) || (inS.has(d) && d < c)) continue;
          const a = cutAtom(l), want = !inS.has(d);
          if (a === undefined) { if (want) return -1; continue; }   // no such cut: never a border
          if (a === 0) { if (!want) return -1; continue; }          // cut for sure
          lits.push(want ? a : -a);
        }
        return defineAtom("shapes", lits);
      });
      if (atoms.some((a) => Number.isNaN(a))) return;
      atoms.splice(0, atoms.length, ...atoms.filter((a) => a >= 0));
      if (!atoms.length) return;
      const b = addTech("shapes", atoms.map((a) => -a), `the shapes for ${rc(pt.cells[0])}`, atoms.length);
      if (b && cellsOf(b).length <= 2 * techCap) ws.push(techWin(`shapes: the shapes for ${label(k)}`, b));
    }
  };

  const ROUNDS: Record<string, () => Window[]> = { sizes: () => sizesRound(true, techOn.has("shapes")), shapes: () => (techOn.has("sizes") ? [] : sizesRound(false, true)), owners: ownersRound, slots: slotsRound, fish: fishRound, rects: () => rectsRound(true, techOn.has("rectpairs")), rectpairs: () => (techOn.has("rects") ? [] : rectsRound(false, true)), mines: () => minesRound(true, false), chains: () => minesRound(false, true), ends: endsRound, cuts: cutsRound, mirror: mirrorRound, distance: distanceRound, deadends: deadendsRound };
  const addTechniques = () => {
    if (!techOn.size) return;
    pushTechWindows([...techOn].flatMap((t) => ROUNDS[t]?.() ?? []));
  };

  dbg("setup");
  // single cells first, silently: a given's own cell (a printed digit rules out the others)
  {
    const singles = Array.from({ length: n }, (_, i) => win(rc(i), [i]));
    const found = runWindows(singles);
    for (const fs of found.values()) for (const [m, v] of fs) settle(m, v);
  }
  // what's known before the first step (settled in grounding, or by a given's own cell)
  const initial = markName.flatMap((x, m) => (known[m] >= 0 ? [`${x}=${known[m] === 1}`] : []));
  const structureOf = (): Structure => ({ cells: n, rows: g.kind === "square" ? g.rows : 0, cols: g.kind === "square" ? g.cols : 0, marks: markName.map((name, m) => ({ name, cells: markCells[m] })), groups: groups.map((x) => ({ kind: x.kind, label: x.label, cells: x.cells })) });
  if (opts.setupOnly)
    return { path: [], profile: profileOf([], false, 0, 0, Date.now() - t0, calls, ["setup only"]), initial, structure: structureOf(), ...(opts.answer ? { answer: markName.filter((_, m) => answer[m] === 1) } : {}) };
  if (opts.from) for (const name of opts.from) { const m = markOf.get(name); if (m !== undefined) settle(m, answer[m] === 1); }
  const untilMarks = (opts.until ?? []).map((x) => markOf.get(x)).filter((m): m is number => m !== undefined);
  // Options.menus: at each of a person's positions, everything available, none taken
  if (opts.menus) {
    const menus: (Step & { stage: number })[][] = [];
    // runWindows checks only windows whose marks changed since it last ran them, and nothing is
    // taken here, so a window it skips still has what it found last time: keep that, less what's
    // known since (before 2026-10-20 skipped windows were dropped, so every menu after the first
    // listed only what changed near the last position)
    const lastFacts = new Map<Window, [number, boolean][]>();
    for (const add of opts.menus) {
      if (Date.now() - t0 > budget) { outOfTime = true; break; }
      round++;
      for (const name of add) { const m = markOf.get(name); if (m !== undefined) settle(m, answer[m] === 1); }
      addComponentLemmas(); addLoopLemmas(); addTechniques();
      const menu: (Step & { stage: number })[] = [], seen = new Set<Window>();
      for (const [k, stage] of stages.entries()) {
        const ws = stage.flatMap((fam) => family(fam)).filter((w) => !seen.has(w) && (seen.add(w), true));
        const fresh = runWindows(ws), f = new Map<Window, [number, boolean][]>();
        for (const w of ws) {
          if (evaluatedAt.get(w) === round) { if (fresh.has(w)) lastFacts.set(w, fresh.get(w)!); else lastFacts.delete(w); }
          const left = lastFacts.get(w)?.filter(([m]) => known[m] < 0);
          if (left?.length) f.set(w, left);
        }
        // each fact once a stage, from its smallest window, as on a first listing (with every
        // explanation already cached, candidates lists a fact from every window that finds it)
        const listed = new Set<string>();
        if (f.size) for (const st of candidates(f, k === 0 ? 0 : 1)) {
          const { w: _w, ...step } = st, facts = step.facts.filter((x) => !listed.has(x.mark));
          for (const x of facts) listed.add(x.mark);
          if (facts.length) menu.push({ ...step, facts, round, stage: k });
        }
      }
      menus.push(menu);
    }
    return { path: [], menus, profile: profileOf([], false, 0, 0, Date.now() - t0, calls, outOfTime ? ["menus: out of time"] : ["menus"]), initial, ...(opts.structure ? { structure: structureOf() } : {}) };
  }

  let entryPoints = -1;
  const order = (): number[] => {
    // case-split candidates: marks next to the most settled ones first
    const score = new Float64Array(M);
    const near = new Float64Array(n);
    for (let m = 0; m < M; m++) if (known[m] >= 0) for (const c of markCells[m]) near[c]++;
    const cand: number[] = [];
    for (let m = 0; m < M; m++) if (known[m] < 0) {
      let s = 0;
      for (const c of markCells[m]) { s += near[c]; for (const l of g.cellLinks[c] ?? []) { const [a, b] = g.links[l].cells; s += 0.25 * near[a === c ? b : a]; } }
      score[m] = s; cand.push(m);
    }
    return cand.sort((a, b) => score[b] - score[a]);
  };

  /** One clingo call (a Lua script over the engine's program): for each candidate mark, assume
   *  it the other way from the answer and see what it takes to refute. The first `deepCount`
   *  candidates get a real search (tier 3); the rest only propagation (tier 2). */
  const hardRound = (cand: number[], deepCount: number, deepLimit = DEEP_LIMIT) => {
    calls++;
    const lit = (m: number, v: boolean) => `{clingo.parse_term("${markName[m]}"), ${v}}`;
    const knowns: string[] = [];
    for (let m = 0; m < M; m++) if (known[m] >= 0 && markAtom[m] > 0) knowns.push(lit(m, known[m] === 1));
    const cands = cand.map((m) => `{${m}, ${lit(m, answer[m] !== 1)}}`);
    const lua = `#script (lua)
function main(prg)
  prg:ground({{"base", {}}})
  local known = {${knowns.join(",")}}
  local cands = {${cands.join(",")}}
  local ch0, co0 = 0, 0
  local function try(c, limit)
    prg.configuration.solve.solve_limit = limit
    local a = {}
    for i, k in ipairs(known) do a[i] = k end
    a[#a + 1] = c[2]
    local r = prg:solve({assumptions = a})
    local s = prg.statistics.accu.solving.solvers
    local ch, co = s.choices - ch0, s.conflicts - co0
    ch0, co0 = s.choices, s.conflicts
    return r, ch, co
  end
  for i, c in ipairs(cands) do
    local r, ch, co = try(c, i <= ${deepCount} and "${deepLimit}" or "${SPLIT_LIMIT}")
    print(string.format("C %d %s %s %d %d", c[1], tostring(r.satisfiable), tostring(r.unsatisfiable), ch, co))
  end
end
#end.
`;
    const th = Date.now();
    // the program case splits work on: the local encoding where there is one (small), else the engine's
    const { lines, status, errors } = clingoRaw(lua + (local ? local.plain : program(p)), "--outf=3 --stats --forget-on-step=varScores,signs,lemmaScores,lemmas");
    dbg(`hard round: ${cand.length} candidates, ${Date.now() - th} ms`);
    if (status === 33 || status === 65 || status === 128) throw new Error(`clingo failed (${status}): ${errors.join("\n").slice(0, 300)}`);
    return lines.flatMap((l) => {
      const x = /^C (\d+) (\w+) (\w+) (\d+) (\d+)$/.exec(l);
      return x ? [{ m: +x[1], sat: x[2] === "true", unsat: x[3] === "true", choices: +x[4], cost: +x[4] + +x[5] }] : [];
    });
  };
  let pool: number[] = [], deep: { m: number; cost: number }[] = [], sat: number[] = [], escalated = false, escalatedDeep = false;
  let splitSteps = 0;   // tier-2 steps taken (Options.maxSplitSteps)
  // Options.minPeak: facts windows found that weren't taken yet (still sound: what's known only
  // grows), with their stage, so the window needn't be checked again until its marks change
  const pending = new Map<Window, { k: number; facts: [number, boolean][] }>();
  // A later stage is checked only when nothing is open at or below the peak so far (a step there
  // can't raise it) or WIDE_FLOOR (what only a later stage's windows see needs two rule instances
  // or more: one would be inside a tier-0 window)
  const WIDE_FLOOR = Number(process.env.DEDUCE_WIDE_FLOOR ?? BANDS[1][0]);
  let peak = 0;
  const minPeakRound = (): boolean => {
    const byStage = stages.map(() => new Map<Window, [number, boolean][]>());
    for (const [w, { k, facts }] of pending) {
      const left = facts.filter(([m]) => known[m] < 0);
      if (left.length) byStage[k].set(w, left);
    }
    pending.clear();
    const c: (Step & { w: Window; k: number })[] = [];
    const seen = new Set<Window>();
    for (const [k, stage] of stages.entries()) {
      if (c.length && Math.min(...c.map((s) => s.cost)) <= Math.max(peak, WIDE_FLOOR)) {
        // not checked this round: what they found before waits for another
        for (let j = k; j < stages.length; j++) for (const [w, fs] of byStage[j]) pending.set(w, { k: j, facts: fs });
        break;
      }
      const ws = stage.flatMap((fam) => family(fam)).filter((w) => !seen.has(w) && (seen.add(w), true));
      for (const [w, fs] of runWindows(ws)) byStage[k].set(w, fs);
      if (byStage[k].size) c.push(...candidates(byStage[k], k === 0 ? 0 : 1).map((s) => ({ ...s, k })));
    }
    const open = c.filter((s) => s.k === 0).length;
    if (entryPoints < 0) entryPoints = open;
    if (!c.length) return false;
    const min = Math.min(...c.map((s) => s.cost));
    peak = Math.max(peak, min);
    // everything at or below the peak so far goes now: it can't raise the peak
    const upTo = Math.max(peak, min + PEAK_TIE);
    c.sort((a, b) => a.cost - b.cost);
    for (const s of c) {
      const facts = s.facts.filter((x) => known[markOf.get(x.mark)!] < 0);
      if (!facts.length) continue;
      if (s.cost > upTo) {
        const p0 = pending.get(s.w) ?? { k: s.k, facts: [] };
        p0.facts.push(...facts.map((x) => [markOf.get(x.mark)!, x.value] as [number, boolean]));
        pending.set(s.w, p0);
        continue;
      }
      const { w: _w, k: _k, ...step } = s;
      path.push({ ...step, facts, round, open });
      for (const x of facts) settle(markOf.get(x.mark)!, x.value);
    }
    return true;
  };

  // ---- Options.search: best-first over proofs ----
  // a window's facts, kept by what the window knows (states revisit the same local pictures)
  const winCache = new Map<Window, Map<string, [number, boolean][]>>();
  const runCached = (ws: Window[]) => {
    const out = new Map<Window, [number, boolean][]>(), todo: Window[] = [], sig = new Map<Window, string>();
    for (const w of ws) {
      if (!progOf(w).marks.some((m) => known[m] < 0)) continue;
      const x = sigOf(w), hit = winCache.get(w)?.get(x);
      if (hit) { if (hit.length) out.set(w, hit); continue; }
      sig.set(w, x); todo.push(w); evaluatedAt.delete(w);
    }
    const f = runWindows(todo);
    for (const w of todo) {
      const fs = f.get(w) ?? [];
      if (!winCache.has(w)) winCache.set(w, new Map());
      winCache.get(w)!.set(sig.get(w)!, fs);
      if (fs.length) out.set(w, fs);
    }
    return out;
  };
  interface SNode { known: Int8Array; g: number; peak: number; steps: Step[]; open: number; depth: number }
  type Cand = Step & { w: Window };
  const restore = (s: SNode) => { for (let m = 0; m < M; m++) known[m] = s.known[m]; undecided = s.open; round = s.depth + 1; };
  const keyOf = (k: ArrayLike<number>) => { let x = ""; for (let m = 0; m < k.length; m++) x += k[m] < 0 ? "." : k[m]; return x; };
  /** the moves from a state: named sets of candidate steps (or one split step), deduplicated by
   *  the state each leads to */
  const movesOf = (s: SNode, branch: number): { names: string[]; child: SNode }[] => {
    restore(s);
    addComponentLemmas(); addLoopLemmas(); addTechniques();
    const byStage: Cand[][] = [], claimed = new Set<number>();
    for (const [k, stage] of stages.entries()) {
      const f = runCached([...new Set(stage.flatMap((fam) => family(fam)))]);
      // a later stage's windows hold the earlier ones: their facts go to the earlier stage
      for (const [w, fs] of f) { const left = fs.filter(([m]) => !claimed.has(m)); if (left.length) f.set(w, left); else f.delete(w); }
      for (const fs of f.values()) for (const [m] of fs) claimed.add(m);
      byStage.push(f.size ? candidates(f, k === 0 ? 0 : 1) : []);
    }
    const all = byStage.flat().sort((a, b) => a.cost - b.cost);
    const sets: [string, Cand[]][] = [];
    if (all.length) {
      const first = byStage.find((c) => c.length)!, fmin = Math.min(...first.map((x) => x.cost)), min = all[0].cost;
      sets.push(["greedy", first.filter((x) => x.cost <= fmin + SLACK)]);
      const cheap = all.filter((x) => x.cost <= min + PEAK_TIE);
      sets.push(["cheapest", cheap]);
      const levels = [...new Set(all.map((x) => x.cost))].filter((c) => c > min + PEAK_TIE);
      for (const c of levels.slice(0, branch)) sets.push([`up to ${c}`, all.filter((x) => x.cost <= c)]);
      // a dearer step taken early, with the cheapest: those deciding the most per cost first
      const dear = all.filter((x) => x.cost > min + PEAK_TIE).sort((a, b) => b.facts.length / b.cost - a.facts.length / a.cost);
      for (const x of dear.slice(0, branch)) sets.push([`hinge ${x.where}`, [...cheap, x]]);
    } else {
      // stuck: the usual solve's shallow case split, the first refutable mark in its order
      if ((opts.maxTier ?? 2) < 2) return [];
      const res = hardRound(order().slice(0, maxSplits), 0);
      const rank = new Map(order().slice(0, maxSplits).map((m, k) => [m, k]));
      const ok = res.filter((x) => x.unsat && x.choices === 0).sort((a, b) => rank.get(a.m)! - rank.get(b.m)!);
      if (!ok.length) return [];
      const m = ok[0].m, v = answer[m] === 1;
      sets.push(["split", [{ ...wideStep(m, v, 2), where: `assume ${factText(m, !v)}: a contradiction` }]]);
    }
    const out: { names: string[]; child: SNode }[] = [], seen = new Map<string, string[]>();
    for (const [name, set] of sets) {
      restore(s);
      const steps = s.steps.slice();
      let g = s.g, peak = s.peak;
      for (const x of [...set].sort((a, b) => a.cost - b.cost)) {
        const facts = x.facts.filter((f) => known[markOf.get(f.mark)!] < 0);
        if (!facts.length) continue;
        const { w: _w, ...step } = x;
        steps.push({ ...step, facts, round, open: byStage[0]?.length ?? 0 });
        for (const f of facts) settle(markOf.get(f.mark)!, f.value);
        g += x.cost; peak = Math.max(peak, x.cost);
      }
      const key = keyOf(known);
      if (steps.length === s.steps.length) continue;
      const had = seen.get(key);
      if (had) { had.push(name); continue; }
      const names = [name];
      seen.set(key, names);
      out.push({ names, child: { known: Int8Array.from(known), g: +g.toFixed(2), peak, steps, open: undecided, depth: s.depth + 1 } });
    }
    restore(s);
    return out;
  };
  let searchReport: Record<string, unknown> | undefined;
  if (opts.search && !opts.quick) {
    const nodes = opts.search.nodes ?? 200, branch = opts.search.branch ?? 3;
    const root: SNode = { known: Int8Array.from(known), g: 0, peak: 0, steps: [], open: undecided, depth: 0 };
    const best = new Map<string, number>([[keyOf(root.known), 0]]);
    const queue: { f: number; n: SNode }[] = [];
    let expanded = 0, outBudget = false;
    const children = new Map<SNode, { names: string[]; child: SNode }[]>();
    const expand = (n: SNode) => {
      let c = children.get(n);
      if (!c) { c = movesOf(n, branch); children.set(n, c); expanded++; }
      return c;
    };
    /** follow one named move to the end (or a dead end), queueing the other children met */
    const chain = (name: string, push: (n: SNode) => void): SNode | null => {
      let n = root;
      while (n.open > 0) {
        if (Date.now() - t0 > budget) { outBudget = true; return null; }
        const c = expand(n);
        const next = c.find((x) => x.names.includes(name)) ?? c.find((x) => x.names.includes("split"));
        for (const x of c) if (x !== next) push(x.child);
        if (!next) return null;
        n = next.child;
      }
      return n;
    };
    const later: SNode[] = [];
    const greedy = chain("greedy", (x) => later.push(x));
    const cheapest = chain("cheapest", (x) => later.push(x));
    let inc = [greedy, cheapest].filter((x): x is SNode => !!x).sort((a, b) => a.g - b.g)[0] ?? null;
    const rho = greedy ? greedy.g / Math.max(1, root.open) : 1;
    const push = (n: SNode) => {
      const k = keyOf(n.known), b = best.get(k);
      if (b !== undefined && b <= n.g) return;
      best.set(k, n.g);
      if (inc && n.g >= inc.g) return;
      if (n.open === 0) { if (!inc || n.g < inc.g) inc = n; return; }
      queue.push({ f: n.g + rho * n.open, n });
    };
    for (const x of later) push(x);
    let improvedAt = -1;
    while (queue.length && expanded < nodes) {
      if (Date.now() - t0 > budget) { outBudget = true; break; }
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].f < queue[bi].f) bi = i;
      const { n } = queue.splice(bi, 1)[0];
      if (inc && n.g >= inc.g) continue;
      if ((best.get(keyOf(n.known)) ?? Infinity) < n.g) continue;
      const before = inc;
      for (const x of expand(n)) push(x.child);
      if (inc !== before) improvedAt = expanded;
    }
    const sum = (n: SNode | null) => (n ? n.g : null);
    searchReport = {
      greedy: greedy ? { sum: sum(greedy), peak: greedy.peak, steps: greedy.steps.length, rounds: greedy.depth } : null,
      cheapest: cheapest ? { sum: sum(cheapest), peak: cheapest.peak, steps: cheapest.steps.length, rounds: cheapest.depth } : null,
      best: inc ? { sum: inc.g, peak: inc.peak, steps: inc.steps.length, rounds: inc.depth } : null,
      expanded, open: queue.length, exhausted: !queue.length && !outBudget && expanded < nodes, outOfBudget: outBudget, improvedAt, rho: +rho.toFixed(3),
      greedyPath: greedy?.steps.map((x) => ({ cost: x.cost, where: x.where, facts: x.facts.map((f) => f.mark), round: x.round })),
      cheapestPath: cheapest?.steps.map((x) => ({ cost: x.cost, where: x.where, facts: x.facts.map((f) => f.mark), round: x.round })),
    };
    if (inc) { restore(inc); path.push(...inc.steps); round = inc.depth; }
    else if (outBudget) outOfTime = true;
    else notes.push("stuck: no proof by windows and shallow case splits");
  }

  // ---- Options.simulate: a simulated person ----
  if (opts.simulate) {
    const { model, samples = 1 } = opts.simulate;
    let seed = (opts.simulate.seed ?? 1) >>> 0;
    const rand = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
    const cols = spec.size[1];
    const centre = (cells: number[]) => {
      const rs = cells.map((i) => Math.floor(i / cols)), cs = cells.map((i) => i % cols);
      return { r: (Math.min(...rs) + Math.max(...rs)) / 2, c: (Math.min(...cs) + Math.max(...cs)) / 2 };
    };
    const kindOf = (st: Step) => [...new Set((st.because?.clues ?? []).map((x) => x.split(" (")[0]))].sort().join("+");
    const start: SNode = { known: Int8Array.from(known), g: 0, peak: 0, steps: [], open: undecided, depth: 0 };
    const sims: { path: Step[]; solved: boolean }[] = [];
    for (let k = 0; k < samples && !outOfTime; k++) {
      restore(start);
      const steps: Step[] = [];
      let prev: { r: number; c: number } | null = null, stuck = false;
      while (undecided > 0) {
        if (Date.now() - t0 > budget) { outOfTime = true; break; }
        round++;
        addComponentLemmas(); addLoopLemmas(); addTechniques();
        // the menu, as movesOf lists it: every stage's windows, each fact in its earliest stage
        const menu: (Step & { w: Window })[] = [], claimed = new Set<number>();
        for (const [j, stage] of stages.entries()) {
          const f = runCached([...new Set(stage.flatMap((fam) => family(fam)))]);
          for (const [w, fs] of f) { const left = fs.filter(([m]) => !claimed.has(m)); if (left.length) f.set(w, left); else f.delete(w); }
          for (const fs of f.values()) for (const [m] of fs) claimed.add(m);
          if (f.size) menu.push(...candidates(f, j === 0 ? 0 : 1));
        }
        if (!menu.length && opts.simulate.noSplits) { notes.push("simulate: no split allowed, stopped"); break; }
        if (!menu.length) {
          // stuck: the usual solve's shallow case split, the first refutable mark in its order
          const cand = order().slice(0, maxSplits), rank = new Map(cand.map((m, i) => [m, i]));
          const res = hardRound(cand, Math.min(cand.length, maxDeep));
          const ok = res.filter((x) => x.unsat && x.choices === 0).sort((a, b) => rank.get(a.m)! - rank.get(b.m)!);
          // none refutable by propagation: the fact that takes the least search (tier 3), as the solve does
          const deepest = res.filter((x) => x.unsat && x.choices > 0).sort((a, b) => a.cost - b.cost);
          if (!ok.length && !deepest.length) { stuck = true; break; }
          const m = ok.length ? ok[0].m : deepest[0].m, v = answer[m] === 1, tier = ok.length ? 2 : 3;
          steps.push({ ...wideStep(m, v, tier), where: tier === 2 ? `assume ${factText(m, !v)}: a contradiction` : `search (${deepest[0].cost} choices and conflicts)`, round, sim: { p: 1, h: 0, lse: 0, n: 0, dist: 0, split: 1 } });
          settle(m, v);
          prev = centre(markCells[m]);
          continue;
        }
        // the menu's marks, each with its cheapest step and how many steps decide it
        const marks = new Map<number, { st: Step & { w: Window }; items: number }>();
        for (const st of menu) for (const x of st.facts) {
          const m = markOf.get(x.mark)!, had = marks.get(m);
          if (known[m] >= 0) continue;
          if (!had) marks.set(m, { st, items: 1 });
          else { had.items++; if (st.cost < had.st.cost) had.st = st; }
        }
        const ms = [...marks.values()];
        const dists = ms.map(({ st }) => { const c = centre(st.cells); return prev ? Math.hypot(c.r - prev.r, c.c - prev.c) : 0; });
        const util = (md: MoveModel) => ms.map(({ st, items }, i) => md.cost * st.cost + md.dist * dists[i] + md.items * Math.log(items) + (md.kinds?.[kindOf(st)] ?? md.other ?? 0));
        const u = util(model);
        const mx = Math.max(...u), e = u.map((x) => Math.exp(x - mx)), z = e.reduce((a, b) => a + b, 0);
        let x = rand() * z, i = 0;
        if (opts.simulate.pick === "max") i = u.indexOf(mx);
        else while (i < e.length - 1 && x >= e[i]) { x -= e[i]; i++; }
        let ps: number | undefined;
        if (opts.simulate.score) { const v = util(opts.simulate.score), vm = Math.max(...v), ev = v.map((y) => Math.exp(y - vm)); ps = ev[i] / ev.reduce((a, b) => a + b, 0); }
        const h = -e.reduce((a, q) => a + (q / z) * Math.log2(q / z || 1), 0);
        const { st } = ms[i], facts = st.facts.filter((f) => known[markOf.get(f.mark)!] < 0);
        const { w: _w, ...step } = st;
        steps.push({ ...step, facts, round, sim: { p: e[i] / z, h, lse: (mx + Math.log(z)) / Math.LN2, n: ms.length, dist: dists[i], ...(ps !== undefined ? { ps } : {}) } });
        for (const f of facts) settle(markOf.get(f.mark)!, f.value);
        prev = centre(st.cells);
      }
      if (stuck) notes.push("simulate: stuck, no case split or search proves a fact");
      sims.push({ path: steps, solved: undecided === 0 });
    }
    if (outOfTime) notes.push(`out of time after ${budget} ms`);
    return { path: [], sims, profile: profileOf([], false, 0, round, Date.now() - t0, calls, [...new Set(notes)]), initial };
  }

  while (undecided > 0 && !(opts.search && !opts.quick)) {
    opts.onRound?.(Date.now() - t0, undecided, M, path);
    if (Date.now() - t0 > budget) { outOfTime = true; break; }
    if (untilMarks.length && untilMarks.every((m) => known[m] >= 0)) { notes.push("until: reached"); break; }
    round++;
    addComponentLemmas();
    addLoopLemmas();
    addTechniques();
    let progressed = false;
    if (opts.closure) {
      const seen = new Set<Window>(), all: (Step & { w: Window })[] = [];
      for (const [k, stage] of stages.entries()) {
        const ws = stage.flatMap((fam) => family(fam)).filter((w) => !seen.has(w) && (seen.add(w), true));
        const f = runWindows(ws);
        if (f.size) all.push(...candidates(f, k === 0 ? 0 : 1));
      }
      for (const st of all) {
        const facts = st.facts.filter((x) => known[markOf.get(x.mark)!] < 0);
        if (!facts.length) continue;
        const { w: _w, ...step } = st;
        path.push({ ...step, facts, round });
        for (const x of facts) settle(markOf.get(x.mark)!, x.value);
      }
      progressed = all.length > 0;
    }
    else if (opts.minPeak && !opts.quick) progressed = minPeakRound();
    else for (const [k, stage] of stages.entries()) {
      const tagged = stage.flatMap((fam) => family(fam).map((w) => [w, fam] as const));
      const f = runWindows(tagged.map(([w]) => w));
      if (k === 0 && entryPoints < 0 && !f.size) entryPoints = 0;
      if (!f.size) continue;
      if (opts.quick) {
        // settled at once, unexplained: one step per window
        if (k === 0 && entryPoints < 0) entryPoints = f.size;
        // each step's family (bands.ts's techniques): the stage family, the lemma or the extra family
        const famOf = new Map<Window, string>();
        for (const [w, fam] of tagged) if (!famOf.has(w)) famOf.set(w, fam === "components" ? (w.label.startsWith("the group") ? "component" : "loop") : fam === "extra" ? (w.label.startsWith("reach") ? "reach" : w.label.startsWith("mined: ") ? "mined" : "lines") : fam === "techniques" ? w.label.split(":")[0] : fam);
        for (const [w, fs] of f) {
          const facts = fs.filter(([m]) => known[m] < 0);
          if (!facts.length) continue;
          path.push({ tier: k === 0 ? 0 : 1, round, where: w.label, cells: w.cells, facts: facts.map(([m, v]) => ({ mark: markName[m], value: v, text: factText(m, v) })), uses: [famOf.get(w) ?? "?"], cost: 0 });
          for (const [m, v] of facts) settle(m, v);
        }
        progressed = true;
        break;
      }
      const c = candidates(f, k === 0 ? 0 : 1);
      if (k === 0 && entryPoints < 0) entryPoints = c.length;
      take(c, k === 0 ? c.length : 0);
      progressed = true;
      break;
    }
    if (progressed) continue;
    const maxTier = opts.maxTier ?? 3;
    if (maxTier < 2) { notes.push("stuck: only a case split or search would go on"); break; }
    if (opts.maxSplitSteps !== undefined && splitSteps >= opts.maxSplitSteps) { notes.push(`stuck: more than ${opts.maxSplitSteps} case splits`); break; }

    // tier 2: assume a mark the other way; propagation alone must contradict it. What's
    // refutable this way stays so as more is known, so one clingo call fills a pool to draw on.
    pool = pool.filter((m) => known[m] < 0);
    const cand = order().slice(0, maxSplits);
    if (!pool.length && !escalatedDeep) {
      // (no deep candidates when search isn't allowed)
      const res = hardRound(cand, maxTier < 3 ? 0 : Math.min(cand.length, maxDeep));
      pool = res.filter((x) => x.unsat && x.choices === 0).map((x) => x.m);
      deep = res.filter((x) => x.unsat && x.choices > 0).sort((a, b) => a.cost - b.cost);
      sat = res.filter((x) => x.sat).map((x) => x.m);
    }
    if (pool.length) {
      const rank = new Map(cand.map((m, k) => [m, k]));
      pool.sort((a, b) => rank.get(a)! - rank.get(b)!);
      const m = pool.shift()!, v = answer[m] === 1;
      splitSteps++;
      if (opts.quick) {
        // settled at once, unexplained, as the windows' facts are
        path.push({ tier: 2, round, where: `assume ${factText(m, !v)}: a contradiction`, cells: markCells[m], facts: [{ mark: markName[m], value: v, text: factText(m, v) }], uses: ["splits"], cost: 0 });
        settle(m, v);
      } else take([{ ...wideStep(m, v, 2), where: `assume ${factText(m, !v)}: a contradiction` }]);
      continue;
    }
    if (maxTier < 3) { notes.push("stuck: only a search would go on"); break; }

    // tier 3: the fact that takes the least search to prove
    deep = deep.filter((x) => known[x.m] < 0);
    const best = deep.length ? deep[0].m : -1, bestCost = deep.length ? deep[0].cost : 0;
    deep = []; escalatedDeep = false;
    const free = sat.find((m) => known[m] < 0) ?? -1;
    if (best >= 0) {
      const v = answer[best] === 1;
      take([{ ...wideStep(best, v, 3), where: `search (${bestCost} choices and conflicts)` }]);
    } else if (free >= 0 && severalAnswers) {
      // nothing is forced: several answers remain, and the solver picks a way (as a player would)
      const v = answer[free] === 1;
      path.push({ tier: 0, where: "a free choice", cells: markCells[free], facts: [{ mark: markName[free], value: v, text: factText(free, v) }], uses: [], choice: true, cost: 0 });
      settle(free, v);
    } else if (cand.length && !escalated) {
      // nothing proved within the usual caps: once per solve, search every candidate, ten times
      // as deep, before giving up (hard Fillominoes need it)
      escalated = true;
      const res = hardRound(cand, cand.length, DEEP_LIMIT * 10);
      deep = res.filter((x) => x.unsat).sort((a, b) => a.cost - b.cost);
      if (deep.length) { notes.push("needed a deeper search"); escalatedDeep = true; round--; continue; }
      notes.push("stuck: no candidate could be proved within the caps");
      break;
    } else if (cand.length) {
      notes.push("stuck: no candidate could be proved within the caps");
      break;
    }
  }
  if (outOfTime) notes.push(`out of time after ${budget} ms with ${undecided} marks open`);
  opts.onRound?.(Date.now() - t0, undecided, M, path);

  const profile = profileOf(path, undecided === 0, entryPoints < 0 ? 0 : entryPoints, round, Date.now() - t0, calls, [...new Set(notes)]);
  // the answer's true marks (some are settled in grounding, before any step, so a path alone
  // doesn't hold them all)
  const answerMarks = markName.filter((_, m) => answer[m] === 1);
  const structure: Structure | undefined = opts.structure ? structureOf() : undefined;
  // how many of the puzzle's own rule instances (clues, rows, areas: not the whole grid, not the
  // lemmas') the path's explanations cite: a setter's puzzle uses every clue
  const own = new Set(groups.slice(0, ownGroups).filter((x) => x.label !== "the whole grid").map((x) => `${x.kind} (${x.label})`));
  const cited = new Set(path.flatMap((s) => s.because?.clues ?? []).filter((x) => own.has(x)));
  const usage = { used: cited.size, of: own.size };
  return { path, profile, answer: answerMarks, initial, usage, ...(searchReport ? { search: searchReport } : {}), ...(structure ? { structure } : {}), ...(opts.trace ? { trace, timing } : { timing }) };
}

/** How step costs combine: a soft-max, D = (1/k)·log Σ exp(k·cost). One step costing Δ more than
 *  a medium one weighs as much as e^(kΔ) medium steps; two equal hard steps add log(2)/k over
 *  one; easy steps barely count. Costs run about 2 (one rule, one clue) to 3–4 (medium: two or
 *  three rule instances and a few earlier facts) to 5+ (hard: several kinds and many instances
 *  together, or a case split). */
export const SOFTMAX_K = 1.5;
/** Cost bands for the profile: [from, label] */
export const BANDS = [[0, "easy"], [3, "medium"], [5, "hard"], [7, "very hard"]] as const;

export const softmax = (costs: number[], k = SOFTMAX_K) => {
  if (!costs.length) return 0;
  const top = Math.max(...costs);
  return top + Math.log(costs.reduce((a, c) => a + Math.exp(k * (c - top)), 0)) / k;
};

/** Summarise a solve path. */
export function profileOf(path: Step[], solved: boolean, entryPoints: number, rounds: number, ms: number, clingoCalls: number, notes: string[], k = SOFTMAX_K): Profile {
  const real = path.filter((s) => !s.choice);
  const perTier: [number, number, number, number] = [0, 0, 0, 0];
  for (const s of real) perTier[s.tier]++;
  const hardestTier = (real.length ? Math.max(...real.map((s) => s.tier)) : 0) as Tier;
  const costs = real.map((s) => s.cost);
  const maxCost = costs.length ? Math.max(...costs) : 0;
  const bands: Record<string, number> = Object.fromEntries(BANDS.map(([, l]) => [l, 0]));
  for (const c of costs) bands[[...BANDS].reverse().find(([from]) => c >= from)![1]]++;
  const hard = (c: number) => c >= BANDS[2][0];
  let run = 0, hardStretch = 0;
  for (const c of costs) { run = hard(c) ? run + 1 : 0; hardStretch = Math.max(hardStretch, run); }
  const items = new Set<string>();
  for (const s of real) for (const u of s.uses) items.add(u);
  const ruleItems = [...items].sort();
  const p: Profile = {
    solved, steps: real.length, maxCost, bands, dSteps: +softmax(costs, k).toFixed(2),
    totalCost: +costs.reduce((a, c) => a + c, 0).toFixed(1), hardestTier, perTier, entryPoints, hardStretch,
    ruleLoad: ruleItems.length, ruleItems, facts: path.reduce((a, s) => a + s.facts.length, 0),
    rounds, ms, clingoCalls, notes, estimate: 0,
  };
  p.estimate = estimateOf(p);
  return p;
}

/** One 0..1 number: f(D_steps) + w·rule load. D_steps of 3 (only easy and medium steps) maps to
 *  0 and 11 to 1; rule load counts from 2 kinds (one rule and one clue kind) to 7. Unsolved (out
 *  of time) counts as hard. */
export const LOAD_WEIGHT = 0.25;
export function estimateOf(p: Pick<Profile, "dSteps" | "ruleLoad" | "solved">): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const x = (1 - LOAD_WEIGHT) * clamp((p.dSteps - 3) / 8) + LOAD_WEIGHT * clamp((p.ruleLoad - 2) / 5);
  return +clamp(p.solved ? x : Math.max(x, 0.9)).toFixed(3);
}
