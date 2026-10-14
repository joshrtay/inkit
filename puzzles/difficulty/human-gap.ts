// How our generated puzzles differ from human-made ones (docs/research-human-gap.md). This file
// gathers the measures; human_gap.py compares them, trains the human-or-generated classifier and
// writes the reports, the scores and the generator's targets (human-targets.json).
//
//   node puzzles/difficulty/human-gap.ts specs
//       every human puzzle we can read (Janko's eight types, janko.ts; Puzzle Square JP's, all
//       types), unsolved: → references/ml/human-gap/human-specs.jsonl, for size, settings, clue
//       density and symmetry, which need no solve
//   DEDUCE_JOBS=2 node puzzles/difficulty/human-gap.ts measure [--human 100] [--gen 120] [--max-size 12]
//       a sample of each, solved the way gen-set.ts measures what it makes (band, required
//       techniques, the band's explained solve, interest, looks, step families), plus each step's
//       round, tier and cost: → references/ml/human-gap/measured.jsonl
//       --human N   human puzzles per genre (up to N × N cells by --max-size, spread through each
//                   source's numbering, Janko and Puzzle Square JP alternating)
//       --gen N     generated puzzles per genre (spread through the fleet's file; GAP_GEN names the
//                   folder, default references/ml/gen-fleet-20261013-0921/generated)
//       --only a,b  these genres only
//   GAP_TAG=x writes measured-x.jsonl instead (another folder of generated puzzles: GAP_GEN; the
//   corpus's Shikaku, references/ml/human-gap/gen-corpus/, are the network's generated Shikaku)
//
// Only genres with both human and generated puzzles are solved. Each solve runs in its own process,
// killed at 4 minutes, and is cached in references/ml/human-gap/cache/ (by the spec), so a rerun
// picks up where the last stopped. A puzzle no band solves without search ("beyond") is solved
// again with the solver's defaults, case splits allowed, for the shape of its solve.
//
// The quick checks' budget grows with the grid (8 s at 6 × 6, as gen-set's, up to 30 s), so a big
// human puzzle isn't put beyond expert for its size alone.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { BAND_LIST, bandOf, optionsOf, quickSolve, requiredOf } from "./bands.ts";
import { deduce } from "./deduce.ts";
import { interestOf } from "./interest.ts";
import { JANKO_TYPES, readType } from "./janko.ts";
import { looksOf } from "./looks.ts";
import { JOBS, mapPool } from "./pool.ts";
import { family, signature } from "./signatures.ts";

const self = fileURLToPath(import.meta.url);
const repo = new URL("../../", import.meta.url).pathname;
/** references/: this checkout's, or (in a worktree) the main one's */
const refs = [`${repo}references/`, repo.replace(/\.claude\/worktrees\/[^/]+\/$/, "") + "references/"].find((d) => existsSync(`${d}ml`)) ?? `${repo}references/`;
export const out = `${refs}ml/human-gap/`, cache = `${out}cache/`;
/** givens that are the board, not clues (as gen-set.ts) */
const FIXED = new Set(["block", "door", "peg", "lengths", "start", "end", "gap", "bank"]);

// ---------- one puzzle, measured as gen-set.ts measures what it makes ----------

export async function measure(spec: GridSpec) {
  const t0 = Date.now(), p = makePuzzle(spec), cells = p.grid.cellCount;
  const budget = Math.min(30000, Math.round(8000 * Math.max(1, cells / 36)));
  const bi = await bandOf(spec, BAND_LIST.length - 1, budget);
  const band = bi >= 0 ? BAND_LIST[bi] : null;
  let used: string[] = [], required: string[] = [];
  if (band) {
    const q = await quickSolve(spec, band, Math.max(20000, budget));
    used = q.used;
    required = await requiredOf(spec, band, q.used, budget);
  }
  // the explained solve: the band's, or the solver's defaults (case splits allowed) beyond expert
  const full = await deduce(spec, band ? optionsOf(band, { structure: true, budgetMs: 60000 }, spec.genre) : { structure: true, budgetMs: 60000 });
  const real = full.path.filter((s) => !s.choice);
  const tally = (xs: string[]) => { const m: Record<string, number> = {}; for (const x of xs) if (x) m[x] = (m[x] ?? 0) + 1; return m; };
  return {
    band: band ? band.name : "beyond", solved: full.profile.solved, ms: Date.now() - t0,
    clues: (spec.givens ?? []).filter((x) => !FIXED.has(x.kind)).length, areas: p.areas ? p.areas.cells.length : 0, cells,
    estimate: full.profile.estimate, dSteps: full.profile.dSteps, maxCost: full.profile.maxCost, steps: real.length, perTier: full.profile.perTier,
    ruleLoad: full.profile.ruleLoad, solveMs: full.profile.ms, used, required,
    shapes: tally(real.map((s) => s.shape ?? "")), families: tally(real.map((s) => family(s.shapeText ?? ""))), signatures: tally(real.map(signature)),
    interest: interestOf(full.path, full.profile), looks: looksOf(spec),
    // each step: [round, tier, cost, facts]
    path: real.map((s) => [s.round ?? 0, s.tier, +s.cost.toFixed(2), s.facts.length]),
  };
}

if (process.argv[2] === "--job") {
  process.stdout.on("error", () => process.exit(0));
  const spec = JSON.parse(Buffer.from(process.argv[3], "base64").toString()) as GridSpec;
  measure(spec).then((r) => process.stdout.write(JSON.stringify(r)), (e) => process.stdout.write(JSON.stringify({ error: String(e?.message ?? e).slice(0, 300) })));
}

export const live = new Set<ReturnType<typeof spawn>>();
export function measureGuarded(spec: GridSpec, capMs = 240000): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [self, "--job", Buffer.from(JSON.stringify(spec)).toString("base64")], { stdio: ["ignore", "pipe", "ignore"] });
    live.add(child);
    let text = "", killed = false;
    const timer = setTimeout(() => { killed = true; child.kill("SIGKILL"); }, capMs);
    child.stdout.on("data", (d) => { text += d; });
    child.on("close", () => {
      live.delete(child); clearTimeout(timer);
      if (killed) return resolve({ band: "timeout" });
      try { resolve(JSON.parse(text)); } catch { resolve({ error: "crash" }); }
    });
  });
}

// ---------- the puzzles ----------

interface Item { source: string; genre: string; name: string; spec: GridSpec; key?: string; band?: string }

/** Every human puzzle we can read: Janko's (janko.ts's types) and Puzzle Square JP's. */
export function humanPuzzles(): Item[] {
  const items: Item[] = [];
  for (const type of Object.keys(JANKO_TYPES))
    for (const { f, j } of readType(type)) items.push({ source: "janko", genre: j.spec.genre!, name: `janko ${JANKO_TYPES[type].folder}/${f}`, spec: j.spec });
  const psjp = `${refs}psjp/`;
  if (existsSync(psjp))
    for (const type of readdirSync(psjp).filter((t) => !t.includes(".") && t !== "scripts").sort())
      for (const f of readdirSync(`${psjp}${type}`).filter((x) => /^\d+\.json$/.test(x)).sort((a, b) => parseInt(a) - parseInt(b))) {
        const d = JSON.parse(readFileSync(`${psjp}${type}/${f}`, "utf8"));
        if (!d.grid?.size) continue;
        items.push({ source: "psjp", genre: d.grid.genre ?? type, name: `psjp ${type}/${f}`, spec: { ...d.grid, genre: d.grid.genre ?? type } as GridSpec });
      }
  return items;
}

const spread = <T>(xs: T[], n: number) => (xs.length <= n ? xs : Array.from({ length: n }, (_, k) => xs[Math.floor((k * xs.length) / n)]));
export const keyOfSpec = (spec: GridSpec) => createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 24);

const isMain = !!process.argv[1] && realpathSync(process.argv[1]) === self && process.argv[2] !== "--job";
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
  const only = argv.includes("--only") ? new Set(argv[argv.indexOf("--only") + 1].split(",")) : null;
  mkdirSync(cache, { recursive: true });
  const humans = humanPuzzles();
  if (argv[0] === "specs") {
    writeFileSync(`${out}human-specs.jsonl`, humans.map((h) => JSON.stringify(h)).join("\n") + "\n");
    console.log(`${humans.length} human puzzles in ${out}human-specs.jsonl`);
  } else if (argv[0] === "measure") {
    const genDir = process.env.GAP_GEN ?? `${refs}ml/gen-fleet-20261013-0921/generated/`;
    const genGenres = readdirSync(genDir).filter((f) => f.endsWith(".jsonl")).map((f) => f.replace(".jsonl", ""));
    const maxSize = opt("--max-size", 12), nh = opt("--human", 100), ng = opt("--gen", 120);
    const lists: Item[][] = [];
    for (const genre of genGenres.sort()) {
      if (only && !only.has(genre)) continue;
      const mine = humans.filter((h) => h.genre === genre && h.spec.size[0] <= maxSize && h.spec.size[1] <= maxSize);
      if (!mine.length) continue;
      // Janko and Puzzle Square JP alternating, each spread through its numbering
      const by = [...new Set(mine.map((h) => h.source))].map((s) => spread(mine.filter((h) => h.source === s), nh));
      const human: Item[] = [];
      for (let k = 0; human.length < nh && by.some((xs) => k < xs.length); k++) for (const xs of by) if (k < xs.length && human.length < nh) human.push(xs[k]);
      const lines = readFileSync(`${genDir}${genre}.jsonl`, "utf8").split("\n").filter(Boolean);
      const gen = spread(lines, ng).map((l) => { const d = JSON.parse(l); return { source: "gen", genre, name: d.key, key: d.key, band: d.band, spec: d.spec as GridSpec }; });
      lists.push(human, gen);
    }
    // round robin, so a run stopped early still covers every genre
    const all: Item[] = [];
    for (let k = 0; lists.some((xs) => k < xs.length); k++) for (const xs of lists) if (k < xs.length) all.push(xs[k]);
    process.on("exit", () => { for (const c of live) c.kill("SIGKILL"); });
    for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => process.exit(130));
    const write = () => {
      const rows: string[] = [];
      for (const it of all) {
        const f = `${cache}${keyOfSpec(it.spec)}.json`;
        if (!existsSync(f)) continue;
        rows.push(JSON.stringify({ source: it.source, genre: it.genre, name: it.name, ...(it.key ? { key: it.key, fleetBand: it.band } : {}), spec: it.spec, ...JSON.parse(readFileSync(f, "utf8")) }));
      }
      writeFileSync(`${out}measured${process.env.GAP_TAG ? `-${process.env.GAP_TAG}` : ""}.jsonl`, rows.join("\n") + "\n");
      return rows.length;
    };
    console.error(`${all.length} puzzles (${all.filter((x) => x.source !== "gen").length} human), ${JOBS} at a time`);
    let done = 0;
    await mapPool(all, async (it) => {
      const f = `${cache}${keyOfSpec(it.spec)}.json`;
      if (!existsSync(f)) {
        const r = await measureGuarded(it.spec);
        writeFileSync(f, JSON.stringify(r));
        console.error(`${done + 1}/${all.length} ${it.genre} ${it.name} ${r.band ?? r.error} ${((r.ms as number ?? 0) / 1000).toFixed(1)} s`);
      }
      if (++done % 20 === 0) write();
    });
    console.log(`${write()} puzzles in ${out}measured.jsonl`);
  } else console.error("usage: human-gap.ts specs | measure [--human N] [--gen N] [--max-size N] [--only a,b]");
}
