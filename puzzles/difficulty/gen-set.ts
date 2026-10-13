// A large set of generated puzzles that afford techniques: each solvable by reasoning alone (no
// case split or search) within a difficulty band's techniques (bands.ts), made by the generator
// with the deduction solver in the loop (puzzles/grid/generate.ts, `accept`). For training data
// (the graph network) and a shortlist for the site (gen-best.ts).
//
//   node puzzles/difficulty/gen-set.ts [perArm]          N puzzles per (genre, size, band); default 20
//   node puzzles/difficulty/gen-set.ts --summary         the summary of what's there, nothing made
//
//   GEN_GENRES   "sudoku:9,akari:7+10,hitori:6:expert,…" (sizes joined by +, then the bands if
//                only some, joined by +); default GENRES below
//   GEN_BANDS    "easy,medium,hard,expert" (default all; expert only where it adds a technique)
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
// succeeds.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { generate, type GenerateOptions } from "../grid/generate.ts";
import { BAND_LIST, bandNamed, bandOf, expertApplies, optionsOf, quickSolve, requiredOf } from "./bands.ts";
import { deduce } from "./deduce.ts";
import { graphRecord } from "./graph-data.ts";
import { interestOf } from "./interest.ts";
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

export interface Job { genre: string; size: number; target: string; seed: number; k: number }
export const keyOf = (j: Pick<Job, "genre" | "size" | "target" | "seed">) => `${j.genre}|${j.size}|${j.target}|${j.seed}`;
export const armOf = (j: Pick<Job, "genre" | "size" | "target">) => `${j.genre}|${j.size}|${j.target}`;
/** An arm's k-th seed: arms never share seeds, and the same k is always the same puzzle. */
export const seedOf = (arm: string, k: number) => {
  let h = 2166136261;
  for (const ch of arm) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) * 1000 + k + 1;
};

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
  let checks = 0, checkMs = 0;
  const accept = async (s: GridSpec) => {
    checks++;
    const q = await quickSolve(s, BAND_LIST[target]);
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
  const spec = await generate({ genre: job.genre, rows: job.size, cols: job.size, seed: job.seed, accept, harder, ...(target > 0 ? aimHigher(job.genre, target) : {}) });
  const genMs = Date.now() - t0;
  const base = { key: keyOf(job), genre: job.genre, size: job.size, target: job.target, seed: job.seed, k: job.k, genMs, checks, checkMs };
  if (!spec) return { ...base, status: "none", ms: Date.now() - t0 };
  // its band: the easiest that solves it (the target does)
  const bi = await bandOf(spec, target), band = BAND_LIST[bi];
  const q = await quickSolve(spec, band, 20000);
  const required = await requiredOf(spec, band, q.used);
  // the full solve, explained, for the measures and the training data
  const full = await deduce(spec, optionsOf(band, { structure: true, budgetMs: 60000 }, spec.genre));
  if (!full.profile.solved) return { ...base, status: "unsolved", band: band.name, ms: Date.now() - t0 };
  const real = full.path.filter((s) => !s.choice);
  const tally = (xs: string[]) => { const m: Record<string, number> = {}; for (const x of xs) if (x) m[x] = (m[x] ?? 0) + 1; return m; };
  const p = makePuzzle(spec);
  const graph = graphRecord({ source: "gen-set", genre: job.genre, name: `${job.genre} ${job.size} ${band.name} #${job.seed}`, band: band.name, seed: job.seed, size: job.size }, spec, full);
  return {
    ...base, status: bi < target ? "easier" : "ok", band: band.name, ms: Date.now() - t0, spec,
    clues: (spec.givens ?? []).filter((x) => !FIXED.has(x.kind)).length, areas: p.areas ? p.areas.cells.length : 0, cells: p.grid.cellCount,
    estimate: full.profile.estimate, dSteps: full.profile.dSteps, maxCost: full.profile.maxCost, steps: real.length, perTier: full.profile.perTier,
    ruleLoad: full.profile.ruleLoad, solveMs: full.profile.ms,
    used: q.used, required,
    shapes: tally(real.map((s) => s.shape ?? "")), families: tally(real.map((s) => family(s.shapeText ?? ""))), signatures: tally(real.map(signature)),
    interest: interestOf(full.path, full.profile), looks: looksOf(spec),
    graph,
  };
}

if (process.argv[2] === "--job") {
  process.stdout.on("error", () => process.exit(0));
  const job = JSON.parse(Buffer.from(process.argv[3], "base64").toString()) as Job;
  runJob(job).then((r) => process.stdout.write(JSON.stringify(r)), (e) => process.stdout.write(JSON.stringify({ key: keyOf(job), status: "error", error: String(e?.message ?? e).slice(0, 300) })));
}

// ---------- balancing (pure, unit-tested) ----------

export interface ArmStats { attempts: number; made: number; rarity: number[] }

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

// ---------- the batch ----------

const isMain = !!process.argv[1] && realpathSync(process.argv[1]) === self && process.argv[2] !== "--job";
if (isMain) await main();

async function main() {
  const repo = new URL("../../", import.meta.url).pathname;
  const dir = process.env.GEN_DIR ?? `${repo}references/ml/generated`;
  mkdirSync(dir, { recursive: true });
  const graphFile = process.env.GEN_GRAPHS ?? `${repo}references/ml/graphs-gen.jsonl`, attemptsFile = `${dir}/attempts.jsonl`;
  const per = Number(process.argv[2]) || 20;
  const genres: [string, number[], string[]?][] = process.env.GEN_GENRES
    ? process.env.GEN_GENRES.split(",").map((x) => { const [g, s, b] = x.split(":"); return [g, s.split("+").map(Number), b ? b.split("+") : undefined]; })
    : GENRES;
  const bandNames = (process.env.GEN_BANDS ?? BAND_LIST.map((b) => b.name).join(",")).split(",");
  bandNames.forEach(bandNamed);
  const tries = Number(process.env.GEN_TRIES) || 3, capMs = (Number(process.env.GEN_CAP) || 600) * 1000;
  const deadline = process.env.GEN_DEADLINE ? Date.now() + Number(process.env.GEN_DEADLINE) * 1000 : Infinity;
  const extraShare = process.env.GEN_EXTRA === undefined ? 0.25 : Number(process.env.GEN_EXTRA);

  // what's done (resuming): attempts by key, arm stats, family counts per genre
  type Attempt = { key: string; genre: string; size: number; target: string; seed: number; k: number; status: string; band?: string; ms: number; genMs?: number; checks?: number; families?: Record<string, number>; extra?: boolean };
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
      if (a.status === "ok") s.rarity.push(rarityOf(a.families, fc));
      for (const [f, n] of Object.entries(a.families)) fc.set(f, (fc.get(f) ?? 0) + n);
      famCounts.set(a.genre, fc);
    }
    stats.set(arm, s);
    nextK.set(arm, Math.max(nextK.get(arm) ?? 0, a.k + 1));
  };
  attempts.forEach(record);

  if (process.argv[2] === "--summary") { summary(attempts, famCounts); return; }

  const arms: Job[] = [];
  for (const [genre, sizes, only] of genres) for (const size of sizes) for (const target of bandNames) {
    if ((target === "expert" && !expertApplies(genre)) || (only && !only.includes(target))) continue;
    arms.push({ genre, size, target, seed: 0, k: 0 });
  }
  const armKeys = arms.map(armOf), armJob = new Map(arms.map((a) => [armOf(a), a]));
  const running = new Map<string, number>();   // jobs out per arm
  // an arm stops at per × tries attempts, or after 6 with nothing made (a band the genre can't reach)
  const exhausted = (arm: string) => { const s = stats.get(arm); return (s?.attempts ?? 0) + (running.get(arm) ?? 0) >= per * tries || ((s?.attempts ?? 0) >= 6 && !s?.made); };
  const baseNeeded = (arm: string) => { const s = stats.get(arm); return (s?.made ?? 0) + (running.get(arm) ?? 0) < per && !exhausted(arm); };
  let extraLeft = Math.round(arms.length * per * extraShare), rr = 0;
  const nextJob = (): Job | null => {
    if (Date.now() > deadline) return null;
    let arm: string | null = null;
    // base: round robin over arms still short of N
    for (let i = 0; i < armKeys.length && !arm; i++) { const a = armKeys[(rr + i) % armKeys.length]; if (baseNeeded(a)) { arm = a; rr = (rr + i + 1) % armKeys.length; } }
    let extra = false;
    if (!arm && extraLeft > 0) { arm = pickArm(armKeys, stats, exhausted); if (arm) { extraLeft--; extra = true; } }
    if (!arm) return null;
    const a = armJob.get(arm)!;
    let k = nextK.get(arm) ?? 0;
    while (done.has(keyOf({ ...a, seed: seedOf(arm, k) }))) k++;
    nextK.set(arm, k + 1);
    running.set(arm, (running.get(arm) ?? 0) + 1);
    return { ...a, seed: seedOf(arm, k), k, ...(extra ? { extra: true } : {}) };
  };

  console.error(`${arms.length} arms × ${per} (${JOBS} at a time), ${attempts.length} attempts already done`);
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
      const a: Attempt = { key: keyOf(job), genre: job.genre, size: job.size, target: job.target, seed: job.seed, k: job.k, status: String(rec.status), band: rec.band as string | undefined, ms: Date.now() - t,
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
