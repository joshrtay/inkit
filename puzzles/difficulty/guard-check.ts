// Aim 4's difficulty guard: do the off-by-default speedups and techniques keep the estimate's
// agreement with ratings? One shard per solver setting runs the scoreboard's Puzzle Square JP and
// Tatham sections under it and appends each solve as a row (scoreboard.ts --rows), so
// guard-report.ts can compare the settings' Spearman, time and errors puzzle by puzzle.
//
//   puzzles/cloud/run-batch.sh puzzles/difficulty/guard-check.ts guard-check --tasks 5 \
//     --machine n2-standard-32 --input private/refs/psjp:references/psjp \
//     --input private/refs/tatham/puzzles:references/tatham/puzzles
//   (locally: node puzzles/difficulty/guard-check.ts --shard 0 --of 5)
//
// Solves share the machine at GUARD_JOBS at a time (default 16, the scoreboard's own default on a
// 32-vCPU machine), the same for every setting, since the budgets are wall-clock time.
// GUARD_SETTINGS=a,b keeps only those settings; a setting can set DEDUCE_JOBS itself. GUARD_PSJP=N
// sets Puzzle Square JP's sample per type (the guard's gates use 60); Tatham keeps its usual sample.
// GUARD_SHIFT=1,2,3 takes PSJP's held-out puzzles (scoreboard.ts --psjp-shift), for confirming a gain,
// and GUARD_TATHAM_SKIP=10 Tatham's (--tatham-skip).
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";

const SETTINGS = ([
  ["baseline", {}],
  ["rank", { DEDUCE_RANK: "0.3" }],
  ["core", { DEDUCE_CORE: "1" }],
  ["techniques", { DEDUCE_TECHNIQUES: "islands,joins" }],
  ["all", { DEDUCE_RANK: "0.3", DEDUCE_CORE: "1", DEDUCE_TECHNIQUES: "islands,joins" }],
  // the baseline again on another VM: how far Spearman moves from timing alone
  ["baseline-repeat", {}],
  // a budget in clingo calls instead of 15 s (the wall clock only as a 90 s guard), each at two
  // loads: it should repeat exactly
  ...["100", "200", "400"].flatMap((n) => [[`calls${n}`, { DEDUCE_BUDGET_CALLS: n }], [`calls${n}-32jobs`, { DEDUCE_BUDGET_CALLS: n, DEDUCE_JOBS: "32" }]]),
  // the guard at its budget, 200 calls; joins only on the types its finish set uses it for
  ["c200-baseline", { DEDUCE_BUDGET_CALLS: "200" }],
  ["c200-rank", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_RANK: "0.3" }],
  ["c200-core", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_CORE: "1" }],
  ["c200-islands", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_TECHNIQUES: "islands" }],
  ["c200-corewide", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_CORE: "wide" }],
  ["c200-nurikabe", { DEDUCE_BUDGET_CALLS: "200" }, ["--games", "nurikabe"]],
  // types that finish under 1 in 5 at 200 calls are judged at 1,000 (the guard rule, 5ecb89a)
  ["c1000-low", { DEDUCE_BUDGET_CALLS: "1000" }, ["--games", "numberlink,nurikabe,square-jam"]],
  // the finish set, with and without explanations reading a cell's known digits as one element
  ["c200-finish", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_FINISH: "1" }],
  ["c1000-finish", { DEDUCE_BUDGET_CALLS: "1000", DEDUCE_FINISH: "1" }],
  ["c200-finish-kbc", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_FINISH: "1", DEDUCE_KNOWN_BY_CELL: "1" }],
  ["c200-finish-digits", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_FINISH: "1" }, ["--games", "sudoku,skyscrapers"]],
  ["c200-finish-kbc-digits", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_FINISH: "1", DEDUCE_KNOWN_BY_CELL: "1" }, ["--games", "sudoku,skyscrapers"]],
  // Janko's Hidokus rated by Janko's level (input mapped to references/psjp): the default, the finish
  // set, and the finish set reading a cell's known digits as one element, at 200 and 1,000 calls
  ...["200", "1000"].flatMap((n) => [
    [`hk${n}-default`, { DEDUCE_BUDGET_CALLS: n }, ["--games", "hidoku"]],
    [`hk${n}-finish`, { DEDUCE_BUDGET_CALLS: n, DEDUCE_FINISH: "1" }, ["--games", "hidoku"]],
    [`hk${n}-finish-kbc`, { DEDUCE_BUDGET_CALLS: n, DEDUCE_FINISH: "1", DEDUCE_KNOWN_BY_CELL: "1" }, ["--games", "hidoku"]],
  ]),
  ["c200-joins", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_TECHNIQUES: "joins" }, ["--games", "cave,nurikabe"]],
  // Nurikabe stalls at 200 calls (nothing solves), so it's judged at 1,000
  ["n1000-baseline", { DEDUCE_BUDGET_CALLS: "1000" }, ["--games", "nurikabe"]],
  ["n1000-islands", { DEDUCE_BUDGET_CALLS: "1000", DEDUCE_TECHNIQUES: "islands" }, ["--games", "nurikabe"]],
  // Nurikabe's compact encoding (local.ts) against the engine's, with the finish set, at the
  // guard's budget and at 1,000 calls
  ...["200", "1000"].flatMap((n) => [
    [`nk${n}-finish`, { DEDUCE_BUDGET_CALLS: n, DEDUCE_FINISH: "1" }, ["--games", "nurikabe"]],
    [`nk${n}-finish-nolocal`, { DEDUCE_BUDGET_CALLS: n, DEDUCE_FINISH: "1", DEDUCE_LOCAL: "0" }, ["--games", "nurikabe"]],
  ]),
  // Fillomino's compact encoding (local.ts) against the engine's, with the finish set
  ["fl200-finish", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_FINISH: "1" }, ["--games", "fillomino"]],
  ["fl200-finish-nolocal", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_FINISH: "1", DEDUCE_LOCAL: "0" }, ["--games", "fillomino"]],
  ["fl200-finish-on", { DEDUCE_BUDGET_CALLS: "200", DEDUCE_FINISH: "1", DEDUCE_LOCAL: "fillomino" }, ["--games", "fillomino"]],
] as [string, Record<string, string>, string[]?][]).filter(([name]) => !process.env.GUARD_SETTINGS || process.env.GUARD_SETTINGS.split(",").includes(name));
const repo = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const shard = Number(args[args.indexOf("--shard") + 1]), of = Number(args[args.indexOf("--of") + 1]);
const dir = `${repo}references/${process.env.OUT ?? "guard-check"}/`, file = `${dir}rows.jsonl`;
mkdirSync(dir, { recursive: true });
const done = new Set(existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.setting} ${r.section}`; }) : []);

for (const [name, env, extra = []] of SETTINGS.filter((_, i) => i % of === shard))
  for (const section of ["psjp", "tatham"]) {
    if (done.has(`${name} ${section}`)) continue;
    const tmp = `${dir}${name}-${section}.tmp`, t0 = Date.now();
    const r = spawnSync(process.execPath, ["--no-warnings", `${repo}puzzles/difficulty/scoreboard.ts`, "--only", section, "--rows", tmp, ...extra, ...(section === "psjp" && process.env.GUARD_PSJP ? ["--psjp", process.env.GUARD_PSJP] : []), ...(section === "psjp" && process.env.GUARD_SHIFT ? ["--psjp-shift", process.env.GUARD_SHIFT] : []), ...(section === "tatham" && process.env.GUARD_TATHAM_SKIP ? ["--tatham-skip", process.env.GUARD_TATHAM_SKIP] : [])], {
      env: { ...process.env, DEDUCE_JOBS: process.env.GUARD_JOBS ?? "16", ...env }, encoding: "utf8", maxBuffer: 1 << 26,
    });
    console.log(`# ${name} ${section}: exit ${r.status}, ${Math.round((Date.now() - t0) / 1000)} s\n${r.stdout}`);
    if (r.status !== 0) { console.error(r.stderr.slice(-4000)); process.exit(1); }
    const rows = readFileSync(tmp, "utf8").split("\n").filter(Boolean).map((l, i) => ({ id: `${name}|${section}|${i}`, setting: name, ...JSON.parse(l) }));
    appendFileSync(file, rows.map((x) => JSON.stringify(x)).join("\n") + "\n");
  }
