// The deduction solver's scoreboard: one command for everything we judge it by, so a change to
// the solver (by hand, or proposed by a model) is kept only if the board says it's better.
//
//   examples       every example in src/games: solved, time, and each score against the last
//                  saved board (moves over 0.02 are listed)
//   psjp           Puzzle Square JP's rated puzzles (references/psjp, local only), a spread sample
//                  per type: Spearman of our estimate with the site's 1–5 difficulty
//   beast-academy  their Puzzle Lab sets (references/beast-academy, local only): our estimate
//                  against their tiers, and its rank within each set against their order
//   tatham         Simon Tatham's generators' graded puzzles (references/tatham, generated
//                  locally): our estimate against his grade, per game and size
//
//   node puzzles/difficulty/scoreboard.ts [--quick] [--only <section>] [--games a,b] [--psjp N] [--save] [--rows <file>]
//
// --games keeps only these types in the Puzzle Square JP and Tatham sections (Tatham's names:
// singles, filling, ...), for checking one solver change quickly.
// --quick runs the examples only; --psjp sets the sample per type (default 20); --save makes this
// board the one later runs compare against (references/scoreboard.json, local only, since the
// rows come partly from others' puzzles). --rows writes each Puzzle Square JP and Tatham solve as a
// JSON line (section, group, name, rating, estimate, time, note), for comparing runs puzzle by puzzle.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { convert, GENRE, loadSets, ORDER } from "./ba-convert.ts";
import { fromTatham, TATHAM } from "./tatham.ts";
import { spearman } from "./calibrate.ts";
import { genres } from "../../src/engine/puzzle.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { JOBS, mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const boardFile = `${repo}references/scoreboard.json`;
const args = process.argv.slice(2);
const quick = args.includes("--quick"), save = args.includes("--save");
const perType = Number(args[args.indexOf("--psjp") + 1]) || 20;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const want = (section: string) => !only || only === section;
const games = args.includes("--games") ? args[args.indexOf("--games") + 1].split(",") : null;
const rowsFile = args.includes("--rows") ? args[args.indexOf("--rows") + 1] : null;
// DEDUCE_BUDGET_CALLS: a budget in clingo calls instead (the same on any machine and load), with
// the wall clock only as a guard
const CALLS = process.env.DEDUCE_BUDGET_CALLS ? Number(process.env.DEDUCE_BUDGET_CALLS) : undefined;
const BUDGET = CALLS !== undefined ? 90000 : 15000, CAP = 120000;

interface Solve { name: string; estimate: number; solved: boolean; ms: number; capped: boolean; note: string }
const solve = async (name: string, spec: GridSpec): Promise<Solve> => {
  const t0 = Date.now();
  try {
    const r = await deduceGuarded(spec, { budgetMs: BUDGET, ...(CALLS !== undefined ? { budgetCalls: CALLS } : {}) }, CAP);
    if (!r) return { name, estimate: 0.9, solved: false, ms: Date.now() - t0, capped: true, note: "cap" };
    return { name, estimate: r.profile.estimate, solved: r.profile.solved, ms: Date.now() - t0, capped: false, note: r.profile.notes.join("; ") };
  } catch (e) { return { name, estimate: NaN, solved: false, ms: Date.now() - t0, capped: false, note: `error: ${(e as Error).message.slice(0, 80)}` }; }
};
const secs = (xs: Solve[]) => Math.round(xs.reduce((a, x) => a + x.ms, 0) / 1000);
const t0 = Date.now();
// budgets are wall-clock time, so results depend on how many solves share the machine: the board
// records its job count, and a comparison at a different count is flagged
const board: Record<string, unknown> = { at: new Date().toISOString(), jobs: JOBS, ...(CALLS !== undefined ? { budgetCalls: CALLS } : {}) };
const last = existsSync(boardFile) ? JSON.parse(readFileSync(boardFile, "utf8")) : null;
const out: string[] = [];
const dump: (Solve & { section: string; group: string; rated: number })[] = [];

// ---- examples ----
if (want("examples")) {
  const jobs: { name: string; spec: GridSpec }[] = [];
  for (const genre of readdirSync(`${repo}src/games`).sort().filter((x) => x in genres))
    for (const f of readdirSync(`${repo}src/games/${genre}`).filter((x) => x.endsWith(".json")).sort((a, b) => parseInt(a) - parseInt(b))) {
      const d = JSON.parse(readFileSync(`${repo}src/games/${genre}/${f}`, "utf8"));
      if (d.grid) jobs.push({ name: `${genre}/${f.replace(".json", "")}`, spec: { genre, ...d.grid } });
    }
  const rs = await mapPool(jobs, ({ name, spec }) => solve(name, spec));
  const scores = Object.fromEntries(rs.map((r) => [r.name, +r.estimate.toFixed(3)]));
  board.examples = { scores, solved: rs.filter((r) => r.solved).length, total: rs.length, seconds: secs(rs) };
  out.push(`## Examples\n\n${rs.filter((r) => r.solved).length} of ${rs.length} solved, ${secs(rs)} s of solving`);
  const bad = rs.filter((r) => !r.solved);
  if (bad.length) out.push(`Not solved: ${bad.map((r) => `${r.name} (${r.note || "unsolved"})`).join("; ")}`);
  const before = (last?.examples as { scores: Record<string, number> } | undefined)?.scores;
  if (before) {
    const moved = rs.filter((r) => before[r.name] !== undefined && Math.abs(r.estimate - before[r.name]) > 0.02);
    out.push(moved.length ? `Moved since the saved board:\n${moved.map((r) => `- ${r.name}: ${before[r.name]} → ${r.estimate.toFixed(2)}`).join("\n")}` : "No score moved since the saved board.");
  }
}

// ---- Puzzle Square JP ----
if (!quick && want("psjp") && existsSync(`${repo}references/psjp/data.json`)) {
  const root = `${repo}references/psjp/`;
  const data = JSON.parse(readFileSync(`${root}data.json`, "utf8")) as Record<string, { difficulty: number }>;
  const types = readdirSync(root).filter((t) => existsSync(`${root}${t}`) && !t.includes(".") && t !== "scripts").sort();
  const jobs: { type: string; name: string; spec: GridSpec; rated: number }[] = [];
  for (const type of types.filter((t) => !games || games.includes(t))) {
    const files = readdirSync(`${root}${type}`).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    // a spread sample: every k-th file
    const step = Math.max(1, Math.floor(files.length / perType));
    for (const f of files.filter((_, i) => i % step === 0).slice(0, perType)) {
      const d = JSON.parse(readFileSync(`${root}${type}/${f}`, "utf8"));
      const rated = data[d.source?.psjp]?.difficulty;
      if (rated) jobs.push({ type, name: `${type}/${f}`, spec: { ...d.grid, genre: d.grid.genre ?? type }, rated });
    }
  }
  const rs = await mapPool(jobs, (j) => solve(j.name, j.spec));
  rs.forEach((r, i) => dump.push({ section: "psjp", group: jobs[i].type, rated: jobs[i].rated, ...r }));
  const rows: string[] = [], psjp: Record<string, { n: number; rho: number; solved: number; seconds: number }> = {};
  for (const type of types) {
    const idx = jobs.map((j, i) => [j, i] as const).filter(([j]) => j.type === type);
    if (idx.length < 5) continue;
    const ok = idx.filter(([, i]) => Number.isFinite(rs[i].estimate));
    const rho = spearman(ok.map(([, i]) => rs[i].estimate), ok.map(([j]) => j.rated));
    const mine = idx.map(([, i]) => rs[i]);
    psjp[type] = { n: idx.length, rho: +rho.toFixed(2), solved: mine.filter((r) => r.solved).length, seconds: secs(mine) };
    const was = (last?.psjp as typeof psjp | undefined)?.[type]?.rho;
    rows.push(`| ${type} | ${idx.length} | ${psjp[type].solved} | ${rho.toFixed(2)}${was !== undefined ? ` (was ${was.toFixed(2)})` : ""} | ${psjp[type].seconds} |`);
  }
  board.psjp = psjp;
  out.push(`## Puzzle Square JP\n\nOur estimate against the site's difficulty (Spearman), ${perType} per type\n\n| Type | n | Solved | Spearman | Seconds |\n|---|---|---|---|---|\n${rows.join("\n")}`);
}

// ---- Beast Academy ----
const ba = loadSets();
if (!quick && want("beast-academy") && ba.length) {
  const jobs: { type: string; set: string; tier: number; at: number; spec: GridSpec }[] = [];
  for (const [t, order] of Object.entries(ORDER)) for (const [name, tier] of order) {
    const set = ba.find((s) => s.t === +t && s.s === name);
    set?.p.forEach((c, at) => jobs.push({ type: GENRE[+t], set: name, tier, at, spec: convert(+t, c) as GridSpec }));
  }
  const rs = await mapPool(jobs, (j) => solve(`${j.set} ${j.at + 1}`, j.spec));
  const rows: string[] = [], result: Record<string, { tier: number; within: number; solved: number; n: number }> = {};
  for (const type of new Set(jobs.map((j) => j.type))) {
    const idx = jobs.map((j, i) => [j, i] as const).filter(([j, i]) => j.type === type && rs[i].solved);
    const tierRho = spearman(idx.map(([, i]) => rs[i].estimate), idx.map(([j]) => j.tier));
    const rhos: number[] = [];
    for (const set of new Set(idx.map(([j]) => j.set))) {
      const s = idx.filter(([j]) => j.set === set);
      if (s.length > 2) rhos.push(spearman(s.map(([, i]) => rs[i].estimate), s.map(([j]) => j.at)));
    }
    const within = rhos.reduce((a, b) => a + b, 0) / (rhos.length || 1);
    result[type] = { tier: +tierRho.toFixed(2), within: +within.toFixed(2), solved: idx.length, n: jobs.filter((j) => j.type === type).length };
    const was = (last?.beastAcademy as typeof result | undefined)?.[type];
    rows.push(`| ${type} | ${idx.length} of ${result[type].n} | ${tierRho.toFixed(2)}${was ? ` (was ${was.tier.toFixed(2)})` : ""} | ${within.toFixed(2)}${was ? ` (was ${was.within.toFixed(2)})` : ""} |`);
  }
  board.beastAcademy = result;
  out.push(`## Beast Academy\n\nOur estimate against their tier, and within each set against their order (mean Spearman)\n\n| Type | Solved | With tier | Within sets |\n|---|---|---|---|\n${rows.join("\n")}`);
}

// ---- Tatham ----
const tathamDir = `${repo}references/tatham/puzzles/`;
if (!quick && want("tatham") && existsSync(tathamDir)) {
  const perGrade = Math.max(4, Math.round(perType / 2));
  const jobs: { game: string; size: string; grade: number; spec: GridSpec }[] = [];
  for (const f of readdirSync(tathamDir).filter((x) => x.endsWith(".txt")).sort()) {
    const game = f.split("-")[0];
    if (!TATHAM[game] || (games && !games.includes(game))) continue;
    for (const id of readFileSync(tathamDir + f, "utf8").trim().split("\n").slice(0, perGrade)) {
      const r = fromTatham(game, id);
      if (!r) continue;
      const grade = TATHAM[game].grades.indexOf(r.grade);
      if (grade >= 0) jobs.push({ game, size: r.spec.size.join("x"), grade, spec: r.spec });
    }
  }
  const rs = await mapPool(jobs, (j) => solve(`${j.game} ${j.size} ${j.grade}`, j.spec));
  rs.forEach((r, i) => dump.push({ section: "tatham", group: `${jobs[i].game} ${jobs[i].size}`, rated: jobs[i].grade, ...r }));
  const rows: string[] = [], tatham: Record<string, { rho: number; means: number[]; solved: number; n: number }> = {};
  for (const key of [...new Set(jobs.map((j) => `${j.game} ${j.size}`))]) {
    const idx = jobs.map((j, i) => [j, i] as const).filter(([j]) => `${j.game} ${j.size}` === key);
    const ok = idx.filter(([, i]) => Number.isFinite(rs[i].estimate));
    const rho = spearman(ok.map(([, i]) => rs[i].estimate), ok.map(([j]) => j.grade));
    const grades = [...new Set(idx.map(([j]) => j.grade))].sort();
    const means = grades.map((g) => { const e = ok.filter(([j]) => j.grade === g).map(([, i]) => rs[i].estimate); return +(e.reduce((a, b) => a + b, 0) / (e.length || 1)).toFixed(2); });
    tatham[key] = { rho: +rho.toFixed(2), means, solved: idx.filter(([, i]) => rs[i].solved).length, n: idx.length };
    const was = (last?.tatham as typeof tatham | undefined)?.[key]?.rho;
    const game = key.split(" ")[0];
    rows.push(`| ${key} | ${tatham[key].solved} of ${idx.length} | ${grades.map((g, k) => `${TATHAM[game].grades[g]} ${means[k].toFixed(2)}`).join(", ")} | ${rho.toFixed(2)}${was !== undefined ? ` (was ${was.toFixed(2)})` : ""} |`);
  }
  board.tatham = tatham;
  out.push(`## Tatham's grades\n\nOur mean estimate per grade (easiest first), and Spearman of our estimate with his grade\n\n| Game and size | Solved | Mean estimate by grade | Spearman |\n|---|---|---|---|\n${rows.join("\n")}`);
}

out.push(`\n${Math.round((Date.now() - t0) / 1000)} s on ${JOBS} jobs${last ? `; compared with the board saved ${String(last.at).slice(0, 16)}` : "; no saved board to compare with"}.`);
if (last && last.jobs !== JOBS) out.push(`Note: the saved board ran with ${last.jobs ?? "unknown"} jobs and this one with ${JOBS}; solves near their time budget can differ for that reason alone.`);
console.log(out.join("\n\n"));
if (rowsFile) writeFileSync(rowsFile, dump.map((r) => JSON.stringify(r)).join("\n") + "\n");
if (save) { writeFileSync(boardFile, JSON.stringify({ ...(only ? last ?? {} : {}), ...board }, null, 1)); console.log("Saved as the board to compare against."); }
