// A large set of generated puzzles that afford techniques: each solvable by reasoning alone (no
// case split or search) within a difficulty band's techniques (bands.ts), made by the generator
// with the deduction solver in the loop (puzzles/grid/generate.ts, `accept`). For training data
// (the graph network) and a shortlist for the site (gen-best.ts).
//
//   node puzzles/difficulty/gen-set.ts [perArm]          N puzzles per (genre, size, band); default 20
//   node puzzles/difficulty/gen-set.ts --summary         the summary of what's there, nothing made
//
//   GEN_GENRES   "sudoku:9,akari:7+10,hitori:6:expert,star-battle:10::stars=2,…" (sizes joined by +,
//                then the bands if only some, joined by +, then the arm's settings, joined by +:
//                stars=2|3, letters=4, sym=rot180|mirror|none|human, even (Star Battle's areas of
//                even size), sparse (fewer clues, bigger numbers: Nurikabe, Shikaku, Spiral
//                Galaxies, Cave), outside (Skyscrapers' clues outside only), blocks (Simple Loop's
//                rocks only, no walls); default GENRES below, or HUMAN_GENRES with GEN_HUMAN
//   GEN_HUMAN    1: aim at human-made puzzles (the targets below): HUMAN_GENRES by default, sym=human
//                for the genres it applies to, quotas by the targets' size and setting shares,
//                extra jobs to the families most under-represented against the human mix, and the
//                best break-in of GEN_BREAKIN candidates at hard and expert
//   GEN_TARGETS  the human targets (default puzzles/difficulty/human-targets.json; defaults if missing)
//   GEN_BREAKIN  candidates per job at hard, expert and beyond, the best break-in kept (default 1;
//                3 with GEN_HUMAN); GEN_BREAKIN_MS: no candidate starts after this long (default 240000)
//   GEN_THREAD   1: among those candidates, rank by break-in plus a narrow thread (threadOf: few
//                easy moves open per round per cell, few facts per step, against the job's other
//                candidates), and make them all (no early stop). Default off
//   GEN_CANDS    a file to append every candidate's record to (for measuring the preferences)
//   GEN_BANDS    "easy,medium,hard,expert" (default; expert only where it adds a technique), and
//                "beyond" (bands.ts: a few shallow case splits) when asked for, or with GEN_HUMAN
//                for the genres where the targets put BEYOND_MIN of human puzzles or more there
//   GEN_EXTRA    extra jobs for balancing, as a share of the base ones (default 0.25)
//   GEN_TRIES    attempts per arm at most, as a multiple of perArm (default 3)
//   GEN_CAP      seconds one job may take before it's killed (default 600)
//   GEN_DEADLINE seconds after which no job starts (default none)
//   GEN_DIR      output folder (default references/ml/generated)
//   GEN_GRAPHS   the training data's file (default references/ml/graphs-gen.jsonl)
//   DEDUCE_JOBS  jobs at a time (pool.ts)
//
// Writes, append-only (a run picks up where the last stopped; local only):
//   <dir>/<genre>.jsonl     one line per puzzle: spec, band, seed, times, estimate, steps, step
//                           shapes, families and signatures, required techniques, clues, interest
//   <dir>/attempts.jsonl    every attempt and its outcome (made, or why not), for resuming
//   references/ml/graphs-gen.jsonl   graph-network training data, as graph-data.ts writes it
//
// An arm is a (genre, size, target band). A puzzle counts for its arm when its band (the easiest
// that solves it) is the target; one that comes out easier is kept under its own band but counts
// as a rejection ("easier"). Balancing: after the base jobs, extra ones go to the arms whose
// puzzles bring the step families rarest in their genre so far, weighted by how often the arm
// succeeds; with GEN_HUMAN and the genre's family mix in the targets, to the arms whose puzzles
// bring the families most under-represented against that mix (pickArmHuman).
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { generate, SYMMETRY_GENRES, type GenerateOptions, type Symmetry } from "../grid/generate.ts";
import { BAND_LIST, bandNamed, bandOf, expertApplies, optionsOf, quickSolve, requiredOf } from "./bands.ts";
import { deduce } from "./deduce.ts";
import { graphRecord } from "./graph-data.ts";
import { breakInScore, interestOf, threadOf, threadScores, type Thread } from "./interest.ts";
import { looksOf } from "./looks.ts";
import { JOBS } from "./pool.ts";
import { family, signature } from "./signatures.ts";

const self = fileURLToPath(import.meta.url);
/** givens that are the board, not clues (rocks, blocks, doors, dots, the lengths list) */
const FIXED = new Set(["block", "door", "peg", "lengths", "start", "end", "gap", "bank"]);

/** The genres and sizes that come out without search, and the bands each can reach (all by
 *  default), from a trial of every generated genre at one puzzle per band. Hitori, Nurikabe and
 *  Square Jam only in expert: they need its connection lemma or clue reach. Shikaku, Numberlink
 *  and Fillomino in hard and expert: they need their per-genre techniques (deduce.ts TECHNIQUES:
 *  candidate rectangles; pieces that can't join, the cells each pair reaches; the shapes a
 *  numbered part can grow into), which hard has for them (bands.ts HARD_TECHNIQUES) and the
 *  bands below don't. Easy as ABC at 6 as well: 5 × 5 has no room past
 *  easy. Left out: Nonogram (its pictures are fixed: easy or nothing) and the other piece genres
 *  (case splits). */
export const GENRES: [string, number[], string[]?][] = [
  ["sudoku", [9]], ["irregular-sudoku", [6]], ["thermo-sudoku", [6]], ["skyscrapers", [5, 6]], ["easy-as-abc", [5, 6]],
  ["akari", [7, 10]], ["slitherlink", [5, 6]], ["masyu", [6]], ["simple-loop", [6]], ["simple-path", [6]], ["cave", [6]],
  ["aquarium", [6]], ["minesweeper", [6]], ["wittgenstein-briquet", [6]], ["binary-puzzle", [6]], ["star-battle", [6, 8]],
  ["spiral-galaxies", [6]], ["hidoku", [5]], ["fill-in", [5]],
  ["hitori", [6], ["expert"]], ["nurikabe", [6], ["expert"]], ["square-jam", [6], ["expert"]],
  ["shikaku", [5, 6], ["hard", "expert"]], ["numberlink", [5, 6], ["hard", "expert"]], ["fillomino", [5], ["hard", "expert"]],
];

/** Human-like arms (GEN_HUMAN): the sizes and settings of hand-made puzzles (Janko, Puzzle Square
 *  JP): 10 × 10 for the grid genres, 2-star Star Battle, Easy as ABC with more letters, Skyscrapers
 *  6 and 7, and the genres that can now reach hard or expert, at the sizes and bands that come out
 *  in time (measured, at 10-minute jobs: Hitori 9 and 10 make no unique board; Nurikabe and
 *  Shikaku 10 time out, so 8; 2-star Star Battle and Spiral Galaxies 7 time out at expert; no
 *  Skyscrapers 6 or 7 reaches expert, no Numberlink 6 or 7 does; Galaxies makes no easy one; see
 *  docs/generation-plan.md, "A human-like run"). Then the settings people use: Star Battle's areas
 *  even, Skyscrapers' clues outside only, Simple Loop's rocks only, sparse clues for Cave, Shikaku
 *  and Galaxies, and beyond for Hitori and Nurikabe (and, by BEYOND_MIN, Masyu, Slitherlink and
 *  Cave). Left out, measured: sparse Nurikabe (no puzzle at expert or beyond in 10 minutes) and
 *  3-star Star Battle (needs 14 x 14; even easy times out). */
export const HUMAN_GENRES: [string, number[], string[]?, string?][] = [
  ["sudoku", [9]], ["skyscrapers", [6, 7], ["easy", "medium", "hard"], "outside"], ["easy-as-abc", [6], undefined, "letters=4"], ["easy-as-abc", [7], undefined, "letters=5"],
  ["akari", [10]], ["slitherlink", [10]], ["masyu", [10]], ["cave", [10], undefined, "sparse"],
  ["star-battle", [10], ["easy", "medium", "hard"], "stars=2+even"],
  ["hitori", [8], ["expert", "beyond"]], ["nurikabe", [8], ["expert", "beyond"]], ["shikaku", [8], ["hard", "expert"], "sparse"],
  ["spiral-galaxies", [7], ["medium", "hard"], "sparse"], ["simple-loop", [10], ["hard", "expert"], "blocks"], ["fill-in", [6]], ["minesweeper", [8]], ["simple-path", [7]], ["hidoku", [6]],
  ["numberlink", [7], ["hard"]], ["fillomino", [6], ["hard", "expert"]],
];
/** GEN_HUMAN without GEN_BANDS: beyond arms for the genres where the targets put at least this
 *  share of human puzzles beyond expert (Masyu, Nurikabe, Slitherlink, Hitori, Cave, Spiral
 *  Galaxies, Simple Loop) */
export const BEYOND_MIN = 0.3;

export interface Job { genre: string; size: number; target: string; seed: number; k: number; variant?: string }
/** an arm's settings, when it has any, after its band ("star-battle|10|hard|stars=2") */
export const armOf = (j: Pick<Job, "genre" | "size" | "target" | "variant">) => `${j.genre}|${j.size}|${j.target}${j.variant ? `|${j.variant}` : ""}`;
export const keyOf = (j: Pick<Job, "genre" | "size" | "target" | "seed" | "variant">) => `${armOf(j)}|${j.seed}`;
/** An arm's k-th seed: arms never share seeds, and the same k is always the same puzzle. */
export const seedOf = (arm: string, k: number) => {
  let h = 2166136261;
  for (const ch of arm) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) * 1000 + k + 1;
};

// ---------- human targets ----------

/** What hand-made puzzles of a genre look like (puzzles/difficulty/human-targets.json, measured
 *  from Janko and Puzzle Square JP): shares of sizes ("10": 0.7), of each setting's values
 *  ({ stars: { "2": 0.8 } }), of symmetries, of bands, and of step families. */
export interface HumanTarget {
  sizes?: Record<string, number>;
  settings?: Record<string, Record<string, number> | unknown>;
  clueDensity?: [number, number];
  symmetry?: Record<string, number>;
  bands?: Record<string, number>;
  families?: Record<string, number>;
}
/** When the targets don't say: most hand-made clue layouts are symmetric, nearly all half-turn. */
export const DEFAULT_SYMMETRY: Record<string, number> = { rot180: 0.6, mirror: 0.1, none: 0.3 };

/** GEN_TARGETS, or human-targets.json beside this file */
function targetsFile(): string {
  return process.env.GEN_TARGETS ?? new URL("./human-targets.json", import.meta.url).pathname;
}

export function loadTargets(path: string): Record<string, HumanTarget> {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}; } catch { return {}; }
}

/** A value drawn by shares (they needn't sum to 1), the same for the same seed. */
export function drawByShares(shares: Record<string, number>, seed: number): string | undefined {
  const xs = Object.entries(shares).filter(([, w]) => w > 0).sort(([a], [b]) => (a < b ? -1 : 1));
  const total = xs.reduce((a, [, w]) => a + w, 0);
  if (!total) return undefined;
  let h = Math.imul(seed ^ 0x9e3779b9, 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  let u = ((h ^ (h >>> 13)) >>> 0) / 2 ** 32 * total;
  for (const [v, w] of xs) { if (u < w) return v; u -= w; }
  return xs.at(-1)![0];
}

/** An arm's settings ("stars=2+letters=4+sym=rot180") as a map. */
export const settingsOf = (variant?: string) => new Map((variant ?? "").split("+").filter(Boolean).map((x) => { const [k, v] = x.split("="); return [k, v ?? "true"] as [string, string]; }));

/** The generator's options for an arm's settings, for one job (its seed): stars, letters, even,
 *  sparse, outside, blocks and symmetry; sym=human draws the symmetry from the genre's target shares (DEFAULT_SYMMETRY if none). */
export function variantOptions(genre: string, variant: string | undefined, seed: number, target?: HumanTarget): Partial<GenerateOptions> {
  const m = settingsOf(variant), out: Partial<GenerateOptions> = {};
  if (m.has("stars")) out.stars = Number(m.get("stars"));
  if (m.has("letters")) out.letters = Number(m.get("letters"));
  if (m.has("even")) out.evenAreas = true;
  if (m.has("sparse")) out.sparse = true;
  if (m.has("outside")) out.outsideOnly = true;
  if (m.has("blocks")) out.blocksOnly = true;
  let sym = m.get("sym");
  if (sym === "human") sym = drawByShares(target?.symmetry ?? DEFAULT_SYMMETRY, seed) ?? "none";
  if (sym && sym !== "none" && SYMMETRY_GENRES.includes(genre)) out.symmetry = sym as Symmetry;
  return out;
}

/** An arm's share of the human mix (GEN_HUMAN quotas): its size's share times each setting's
 *  value's share, 1 for what the target doesn't give. */
export function armWeight(size: number, variant: string | undefined, t?: HumanTarget): number {
  let w = 1;
  if (t?.sizes && Object.keys(t.sizes).length) w *= t.sizes[String(size)] ?? t.sizes[`${size}x${size}`] ?? 0.02;
  for (const [k, v] of settingsOf(variant)) {
    const shares = t?.settings?.[k];
    if (shares && typeof shares === "object") w *= (shares as Record<string, number>)[v] ?? 0.02;
  }
  return w;
}

/** A beyond arm's quota against its genre's others (GEN_HUMAN): the targets' beyond share over the
 *  largest of hard's and expert's (at least 0.1), between 0.25 and 2; 1 without targets. */
export function beyondWeight(t?: HumanTarget): number {
  const b = t?.bands;
  if (!b) return 1;
  return Math.min(2, Math.max(0.25, (b.beyond ?? 0) / Math.max(0.1, b.hard ?? 0, b.expert ?? 0)));
}

// ---------- one job (in its own process) ----------

/** The generator's options for aiming above easy (band index `target`), for the genres whose
 *  plain boards come out easy: Fill-in's entries from three digits, so they share starts and slots
 *  compete; Minesweeper's denser mines with no 0 shown, so numbers' neighbourhoods overlap; for
 *  both, at hard and expert, another board while one stays too easy, for 3 minutes (a board takes
 *  seconds); at expert, Simple Loop's wider search (more swaps, and other boards for 5 minutes,
 *  inside gen-set's 10-minute cap). */
export function aimHigher(genre: string, target: number): Partial<GenerateOptions> {
  const insist = target >= 2 ? { insistMs: 180000 } : {};
  if (genre === "fill-in") return { digits: 3, ...insist };
  if (genre === "minesweeper") return { denseMines: true, ...insist };
  // (medium too would only waste the 5 minutes: its puzzles jump from easy to hard, 0 of 8)
  if (genre === "simple-loop" && target >= 3) return { climbTries: 120, insistMs: 300000 };
  return {};
}

async function runJob(job: Job) {
  const t0 = Date.now(), target = BAND_LIST.findIndex((b) => b.name === job.target);
  // (beyond's checks may split a few times: a longer budget)
  const budget = BAND_LIST[target]?.splits ? 20000 : 8000;
  let checks = 0, checkMs = 0;
  const accept = async (s: GridSpec) => {
    checks++;
    const q = await quickSolve(s, BAND_LIST[target], budget);
    checkMs += q.ms;
    return q.solved;
  };
  // aiming above easy: swap clues until the band below can't solve it (generate.ts, harder)
  const harder = target > 0 ? async (s: GridSpec) => {
    checks++;
    const q = await quickSolve(s, BAND_LIST[target - 1]);
    checkMs += q.ms;
    return !q.solved;
  } : undefined;
  const human = !!process.env.GEN_HUMAN, targets = human || job.variant?.includes("sym=human") ? loadTargets(targetsFile()) : {};
  const opts = variantOptions(job.genre, job.variant, job.seed, targets[job.genre]);
  // at hard and above, with GEN_BREAKIN > 1: several candidates (this seed, then seed + 1e8, + 2e8,
  // ...), the one in the target band with the best break-in kept (with GEN_THREAD, break-in plus
  // the narrowest thread among them); no candidate starts after GEN_BREAKIN_MS, and without
  // GEN_THREAD one in the band scoring 0.6 or more ends the search
  const breakIns = target >= 2 ? Number(process.env.GEN_BREAKIN) || (human ? 3 : 1) : 1, breakInMs = Number(process.env.GEN_BREAKIN_MS) || 240000;
  const threadOn = breakIns > 1 && !!Number(process.env.GEN_THREAD);
  type Cand = { spec: GridSpec; bi: number; full: Awaited<ReturnType<typeof deduce>>; score: number; seed: number; thread: Thread; threadScore?: number };
  const cands: Cand[] = [];
  let candidates = 0, genMs = 0;
  for (let i = 0; i < breakIns && (i === 0 || Date.now() - t0 < breakInMs); i++) {
    const seed = job.seed + i * 100000000, tg = Date.now();
    const spec = await generate({ genre: job.genre, rows: job.size, cols: job.size, seed, accept, harder, ...(target > 0 ? aimHigher(job.genre, target) : {}), ...opts });
    genMs += Date.now() - tg;
    if (!spec) continue;
    candidates++;
    // its band: the easiest that solves it (the target does)
    const bi = await bandOf(spec, target, budget);
    if (bi < 0) continue;
    // the full solve, explained, for the measures and the training data (beyond: case splits
    // without the quick check's cap, which an explained solve's other order may need; no search)
    const full = await deduce(spec, optionsOf(BAND_LIST[bi], { structure: true, budgetMs: 60000, maxSplitSteps: undefined }, spec.genre));
    const score = full.profile.solved ? breakInScore(full.path) : -1;
    cands.push({ spec, bi, full, score, seed, thread: threadOf(full.path, makePuzzle(spec).grid.cellCount) });
    if (!threadOn && breakIns > 1 && bi === target && score >= 0.6) break;
  }
  // a narrow thread, against the job's other candidates
  if (threadOn) threadScores(cands.map((c) => c.thread)).forEach((t, k) => (cands[k].threadScore = t));
  const rank = (c: Cand) => (c.full.profile.solved ? 2 : 0) + (c.bi === target ? 1 : 0) + (c.score + (c.threadScore ?? 0)) / 10;
  let best: Cand | null = null;
  for (const c of cands) if (!best || rank(c) > rank(best)) best = c;
  const base = { key: keyOf(job), genre: job.genre, size: job.size, target: job.target, seed: job.seed, k: job.k, ...(job.variant ? { variant: job.variant } : {}), genMs, checks, checkMs };
  if (!best) return { ...base, status: "none", ms: Date.now() - t0 };
  const recordOf = async ({ spec, bi, full, score, seed, thread, threadScore }: Cand) => {
    const band = BAND_LIST[bi];
    if (!full.profile.solved) return { ...base, status: "unsolved", band: band.name, ms: Date.now() - t0 };
    const q = await quickSolve(spec, band, Math.max(20000, budget));
    const required = await requiredOf(spec, band, q.used, budget);
    const real = full.path.filter((s) => !s.choice);
    const tally = (xs: string[]) => { const m: Record<string, number> = {}; for (const x of xs) if (x) m[x] = (m[x] ?? 0) + 1; return m; };
    const p = makePuzzle(spec);
    const graph = graphRecord({ source: "gen-set", genre: job.genre, name: `${job.genre} ${job.size} ${band.name} #${job.seed}`, band: band.name, seed: job.seed, size: job.size }, spec, full);
    return {
      ...base, status: bi < target ? "easier" : "ok", band: band.name, ms: Date.now() - t0, spec,
      ...(opts.symmetry ? { symmetry: opts.symmetry } : {}), ...(breakIns > 1 ? { candidates, madeSeed: seed } : {}), breakInScore: score,
      ...(threadOn ? { thread, threadScore } : {}),
      clues: (spec.givens ?? []).filter((x) => !FIXED.has(x.kind)).length, areas: p.areas ? p.areas.cells.length : 0, cells: p.grid.cellCount,
      estimate: full.profile.estimate, dSteps: full.profile.dSteps, maxCost: full.profile.maxCost, steps: real.length, perTier: full.profile.perTier,
      ruleLoad: full.profile.ruleLoad, solveMs: full.profile.ms,
      used: q.used, required,
      shapes: tally(real.map((s) => s.shape ?? "")), families: tally(real.map((s) => family(s.shapeText ?? ""))), signatures: tally(real.map(signature)),
      interest: interestOf(full.path, full.profile), looks: looksOf(spec),
      graph,
    };
  };
  // GEN_CANDS: every candidate's record, the kept one marked (for measuring the preferences)
  if (process.env.GEN_CANDS && cands.length > 1) for (const c of cands) {
    const { graph: _g, ...r } = (await recordOf(c)) as Record<string, unknown>;
    appendFileSync(process.env.GEN_CANDS, JSON.stringify({ ...r, thread: c.thread, threadScore: c.threadScore, chosen: c === best, candSeed: c.seed }) + "\n");
  }
  return recordOf(best);
}

if (process.argv[2] === "--job") {
  process.stdout.on("error", () => process.exit(0));
  const job = JSON.parse(Buffer.from(process.argv[3], "base64").toString()) as Job;
  runJob(job).then((r) => process.stdout.write(JSON.stringify(r)), (e) => process.stdout.write(JSON.stringify({ key: keyOf(job), status: "error", error: String(e?.message ?? e).slice(0, 300) })));
}

// ---------- balancing (pure, unit-tested) ----------

export interface ArmStats { attempts: number; made: number; rarity: number[]; fams?: Record<string, number> }

/** How rare a puzzle's step families are in its genre so far: Σ steps-of-f / (count of f + 1),
 *  over its families, divided by its step count (0 = nothing rare, near 1 = everything new). */
export function rarityOf(fams: Record<string, number>, genreCounts: Map<string, number>): number {
  let steps = 0, r = 0;
  for (const [f, n] of Object.entries(fams)) { steps += n; r += n / ((genreCounts.get(f) ?? 0) + 1); }
  return steps ? r / steps : 0;
}

/** The arm extra jobs go to: the best mean rarity × success rate, each with a prior of one
 *  attempt at 0.5 so an arm tried a few times isn't written off (or crowned) too soon. */
export function pickArm(arms: string[], stats: Map<string, ArmStats>, exhausted: (arm: string) => boolean): string | null {
  let best: string | null = null, bestScore = -1;
  for (const a of arms) {
    if (exhausted(a)) continue;
    const s = stats.get(a) ?? { attempts: 0, made: 0, rarity: [] };
    const meanRarity = (s.rarity.reduce((x, y) => x + y, 0) + 0.5) / (s.rarity.length + 1);
    const success = (s.made + 0.5) / (s.attempts + 1);
    const score = meanRarity * success;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

/** How far our puzzles of a genre fall short of the human family mix: per family, the human share
 *  less ours (step counts as shares), where positive. */
export function deficits(human: Record<string, number>, ours: Map<string, number> | undefined): Map<string, number> {
  const hTotal = Object.values(human).reduce((a, x) => a + x, 0) || 1;
  const oTotal = [...(ours?.values() ?? [])].reduce((a, x) => a + x, 0) || 1;
  const out = new Map<string, number>();
  for (const [f, h] of Object.entries(human)) { const d = h / hTotal - (ours?.get(f) ?? 0) / oTotal; if (d > 0) out.set(f, d); }
  return out;
}

/** Steering toward the human mix (GEN_HUMAN): the arm extra jobs go to, by success rate (prior as
 *  pickArm's) times how much of its puzzles' steps fall in the families its genre is short of
 *  (deficits, as a share of the genre's whole shortfall, 0 to 1); an arm with no puzzles yet is
 *  taken as its genre's average family. Genres without a human mix score by rarity, as pickArm. */
export function pickArmHuman(arms: string[], stats: Map<string, ArmStats>, exhausted: (arm: string) => boolean, deficitOf: (arm: string) => Map<string, number> | null): string | null {
  let best: string | null = null, bestScore = -1;
  for (const a of arms) {
    if (exhausted(a)) continue;
    const s = stats.get(a) ?? { attempts: 0, made: 0, rarity: [] };
    const success = (s.made + 0.5) / (s.attempts + 1);
    const d = deficitOf(a);
    let pull: number;
    if (!d) pull = (s.rarity.reduce((x, y) => x + y, 0) + 0.5) / (s.rarity.length + 1);
    else {
      const short = [...d.values()].reduce((x, y) => x + y, 0);
      const steps = Object.values(s.fams ?? {}).reduce((x, y) => x + y, 0);
      const hit = steps ? Object.entries(s.fams!).reduce((x, [f, n]) => x + n * (d.get(f) ?? 0), 0) / steps : 0;
      // its families' shortfall as a share of the genre's, against an average family (a prior of one puzzle)
      const avg = d.size ? short / d.size : 0, n = s.rarity.length;
      pull = short ? ((hit * n + avg) / (n + 1)) / short : 0;
    }
    const score = pull * success;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

// ---------- the batch ----------

const isMain = !!process.argv[1] && realpathSync(process.argv[1]) === self && process.argv[2] !== "--job";
if (isMain) await main();

async function main() {
  const repo = new URL("../../", import.meta.url).pathname;
  const dir = process.env.GEN_DIR ?? `${repo}references/ml/generated`;
  mkdirSync(dir, { recursive: true });
  const graphFile = process.env.GEN_GRAPHS ?? `${repo}references/ml/graphs-gen.jsonl`, attemptsFile = `${dir}/attempts.jsonl`;
  const per = Number(process.argv[2]) || 20;
  const human = !!process.env.GEN_HUMAN, targets = human ? loadTargets(targetsFile()) : {};
  const genres: [string, number[], string[]?, string?][] = process.env.GEN_GENRES
    ? process.env.GEN_GENRES.split(",").map((x) => { const [g, s, b, v] = x.split(":"); return [g, s.split("+").map(Number), b ? b.split("+") : undefined, v || undefined]; })
    : human ? HUMAN_GENRES : GENRES;
  // the bands: GEN_BANDS, or every band reached without a case split, and beyond for a genre whose
  // own bands list it, or with GEN_HUMAN for the genres the targets put there often (BEYOND_MIN)
  const bandNames = (process.env.GEN_BANDS ?? BAND_LIST.map((b) => b.name).join(",")).split(",");
  const beyondHere = (genre: string, only?: string[]) => !!process.env.GEN_BANDS || !!only?.includes("beyond") || (human && (targets[genre]?.bands?.beyond ?? 0) >= BEYOND_MIN);
  bandNames.forEach(bandNamed);
  const tries = Number(process.env.GEN_TRIES) || 3, capMs = (Number(process.env.GEN_CAP) || 600) * 1000;
  const deadline = process.env.GEN_DEADLINE ? Date.now() + Number(process.env.GEN_DEADLINE) * 1000 : Infinity;
  const extraShare = process.env.GEN_EXTRA === undefined ? 0.25 : Number(process.env.GEN_EXTRA);

  // what's done (resuming): attempts by key, arm stats, family counts per genre
  type Attempt = { key: string; genre: string; size: number; target: string; variant?: string; seed: number; k: number; status: string; band?: string; ms: number; genMs?: number; checks?: number; families?: Record<string, number>; extra?: boolean };
  const attempts: Attempt[] = existsSync(attemptsFile) ? readFileSync(attemptsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const done = new Set(attempts.map((a) => a.key));
  const stats = new Map<string, ArmStats>(), famCounts = new Map<string, Map<string, number>>(), nextK = new Map<string, number>();
  const record = (a: Attempt) => {
    const arm = armOf(a);
    const s = stats.get(arm) ?? { attempts: 0, made: 0, rarity: [] };
    s.attempts++;
    if (a.status === "ok") s.made++;
    if (a.families) {
      const fc = famCounts.get(a.genre) ?? new Map<string, number>();
      if (a.status === "ok") {
        s.rarity.push(rarityOf(a.families, fc));
        s.fams ??= {};
        for (const [f, n] of Object.entries(a.families)) s.fams[f] = (s.fams[f] ?? 0) + n;
      }
      for (const [f, n] of Object.entries(a.families)) fc.set(f, (fc.get(f) ?? 0) + n);
      famCounts.set(a.genre, fc);
    }
    stats.set(arm, s);
    nextK.set(arm, Math.max(nextK.get(arm) ?? 0, a.k + 1));
  };
  attempts.forEach(record);

  if (process.argv[2] === "--summary") { summary(attempts, famCounts); return; }

  const arms: Job[] = [];
  for (const [genre, sizes, only, settings] of genres) for (const size of sizes) for (const target of bandNames) {
    if ((target === "expert" && !expertApplies(genre)) || (only && !only.includes(target)) || (target === "beyond" && !beyondHere(genre, only))) continue;
    // aiming at human-made puzzles: a symmetric layout by the targets' shares where it applies
    const variant = human && SYMMETRY_GENRES.includes(genre) && !settingsOf(settings).has("sym") ? [settings, "sym=human"].filter(Boolean).join("+") : settings;
    arms.push({ genre, size, target, seed: 0, k: 0, ...(variant ? { variant } : {}) });
  }
  const armKeys = arms.map(armOf), armJob = new Map(arms.map((a) => [armOf(a), a]));
  // puzzles per arm: perArm, or with GEN_HUMAN its share of the human mix against the genre's
  // commonest arm (armWeight), at least 1; a beyond arm's times the targets' beyond share over
  // hard's or expert's (beyondWeight)
  const quota = new Map(arms.map((a) => {
    if (!human) return [armOf(a), per];
    const mates = arms.filter((b) => b.genre === a.genre && b.target === a.target), top = Math.max(...mates.map((b) => armWeight(b.size, b.variant, targets[b.genre])));
    const band = a.target === "beyond" ? beyondWeight(targets[a.genre]) : 1;
    return [armOf(a), Math.max(1, Math.round(per * band * armWeight(a.size, a.variant, targets[a.genre]) / (top || 1)))];
  }));
  // the family shortfall per genre against the human mix (GEN_HUMAN, where the targets give one)
  const deficitOf = (arm: string) => { const g = armJob.get(arm)!.genre, h = targets[g]?.families; return h && Object.keys(h).length ? deficits(h, famCounts.get(g)) : null; };
  const running = new Map<string, number>();   // jobs out per arm
  // an arm stops at per × tries attempts, or after 6 with nothing made (a band the genre can't reach)
  const exhausted = (arm: string) => { const s = stats.get(arm); return (s?.attempts ?? 0) + (running.get(arm) ?? 0) >= quota.get(arm)! * tries || ((s?.attempts ?? 0) >= 6 && !s?.made); };
  const baseNeeded = (arm: string) => { const s = stats.get(arm); return (s?.made ?? 0) + (running.get(arm) ?? 0) < quota.get(arm)! && !exhausted(arm); };
  let extraLeft = Math.round([...quota.values()].reduce((a, x) => a + x, 0) * extraShare), rr = 0;
  const nextJob = (): Job | null => {
    if (Date.now() > deadline) return null;
    let arm: string | null = null;
    // base: round robin over arms still short of N
    for (let i = 0; i < armKeys.length && !arm; i++) { const a = armKeys[(rr + i) % armKeys.length]; if (baseNeeded(a)) { arm = a; rr = (rr + i + 1) % armKeys.length; } }
    let extra = false;
    if (!arm && extraLeft > 0) { arm = human ? pickArmHuman(armKeys, stats, exhausted, deficitOf) : pickArm(armKeys, stats, exhausted); if (arm) { extraLeft--; extra = true; } }
    if (!arm) return null;
    const a = armJob.get(arm)!;
    let k = nextK.get(arm) ?? 0;
    while (done.has(keyOf({ ...a, seed: seedOf(arm, k) }))) k++;
    nextK.set(arm, k + 1);
    running.set(arm, (running.get(arm) ?? 0) + 1);
    return { ...a, seed: seedOf(arm, k), k, ...(extra ? { extra: true } : {}) };
  };

  console.error(`${arms.length} arms × ${human ? `up to ${per} (human shares)` : per} (${JOBS} at a time), ${attempts.length} attempts already done`);
  const live = new Set<ReturnType<typeof spawn>>();
  process.on("exit", () => { for (const c of live) c.kill("SIGKILL"); });
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => process.exit(130));
  let finished = 0;
  const one = (job: Job) => new Promise<void>((resolve) => {
    const t = Date.now();
    const child = spawn(process.execPath, [self, "--job", Buffer.from(JSON.stringify(job)).toString("base64")], { stdio: ["ignore", "pipe", "ignore"] });
    live.add(child);
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), capMs);
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", () => {
      live.delete(child); clearTimeout(timer);
      running.set(armOf(job), (running.get(armOf(job)) ?? 1) - 1);
      let r: Record<string, unknown>;
      try { r = JSON.parse(out); } catch { r = { status: Date.now() - t >= capMs - 50 ? "timeout" : "crash" }; }
      const { graph, ...rec } = r as { graph?: unknown } & Record<string, unknown>;
      const a: Attempt = { key: keyOf(job), genre: job.genre, size: job.size, target: job.target, ...(job.variant ? { variant: job.variant } : {}), seed: job.seed, k: job.k, status: String(rec.status), band: rec.band as string | undefined, ms: Date.now() - t,
        genMs: rec.genMs as number | undefined, checks: rec.checks as number | undefined, families: rec.families as Record<string, number> | undefined, ...((job as { extra?: boolean }).extra ? { extra: true } : {}) };
      if (rec.spec) appendFileSync(`${dir}/${job.genre}.jsonl`, JSON.stringify(rec) + "\n");
      if (graph) appendFileSync(graphFile, JSON.stringify(graph) + "\n");
      appendFileSync(attemptsFile, JSON.stringify(a) + "\n");
      attempts.push(a); done.add(a.key); record(a);
      finished++;
      console.error(`${finished} ${a.key} ${a.status}${a.band && a.band !== a.target ? ` (${a.band})` : ""} ${(a.ms / 1000).toFixed(1)} s`);
      resolve();
    });
  });
  await Promise.all(Array.from({ length: JOBS }, async () => { for (let j = nextJob(); j; j = nextJob()) await one(j); }));
  summary(attempts, famCounts);
}

function summary(attempts: { genre: string; target: string; status: string; band?: string; ms: number; families?: Record<string, number> }[], famCounts: Map<string, Map<string, number>>) {
  console.log("| Genre | Band | Made | Rejected | Mean s | Families |\n|---|---|---|---|---|---|");
  const genres = [...new Set(attempts.map((a) => a.genre))].sort();
  for (const g of genres) {
    for (const b of BAND_LIST.map((x) => x.name)) {
      const xs = attempts.filter((a) => a.genre === g && a.target === b);
      if (!xs.length) continue;
      const made = xs.filter((a) => a.status === "ok");
      const why = new Map<string, number>();
      for (const a of xs) if (a.status !== "ok") { const k = a.status === "easier" ? `easier (${a.band})` : a.status; why.set(k, (why.get(k) ?? 0) + 1); }
      const fams = new Set(made.flatMap((a) => Object.keys(a.families ?? {})));
      console.log(`| ${g} | ${b} | ${made.length} | ${[...why].map(([k, n]) => `${n} ${k}`).join(", ") || "-"} | ${(xs.reduce((s, a) => s + a.ms, 0) / xs.length / 1000).toFixed(1)} | ${fams.size} |`);
    }
    const fc = famCounts.get(g);
    if (fc) console.log(`| ${g} | all | | | | ${fc.size} families; rarest: ${[...fc].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([f, n]) => `${f.slice(0, 50)} (${n})`).join("; ")} |`);
  }
}
