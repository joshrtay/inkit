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
// GUARD_SETTINGS=a,b keeps only those settings; a setting can set DEDUCE_JOBS itself.
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
] as [string, Record<string, string>][]).filter(([name]) => !process.env.GUARD_SETTINGS || process.env.GUARD_SETTINGS.split(",").includes(name));
const repo = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const shard = Number(args[args.indexOf("--shard") + 1]), of = Number(args[args.indexOf("--of") + 1]);
const dir = `${repo}references/${process.env.OUT ?? "guard-check"}/`, file = `${dir}rows.jsonl`;
mkdirSync(dir, { recursive: true });
const done = new Set(existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.setting} ${r.section}`; }) : []);

for (const [name, env] of SETTINGS.filter((_, i) => i % of === shard))
  for (const section of ["psjp", "tatham"]) {
    if (done.has(`${name} ${section}`)) continue;
    const tmp = `${dir}${name}-${section}.tmp`, t0 = Date.now();
    const r = spawnSync(process.execPath, ["--no-warnings", `${repo}puzzles/difficulty/scoreboard.ts`, "--only", section, "--rows", tmp], {
      env: { ...process.env, DEDUCE_JOBS: process.env.GUARD_JOBS ?? "16", ...env }, encoding: "utf8", maxBuffer: 1 << 26,
    });
    console.log(`# ${name} ${section}: exit ${r.status}, ${Math.round((Date.now() - t0) / 1000)} s\n${r.stdout}`);
    if (r.status !== 0) { console.error(r.stderr.slice(-4000)); process.exit(1); }
    const rows = readFileSync(tmp, "utf8").split("\n").filter(Boolean).map((l, i) => ({ id: `${name}|${section}|${i}`, setting: name, ...JSON.parse(l) }));
    appendFileSync(file, rows.map((x) => JSON.stringify(x)).join("\n") + "\n");
  }
