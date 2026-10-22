// Difficulty from the human model (docs/research-trajectory.md, step 2): a simulated person
// (deduce.ts Options.simulate, sampling moves from human-model.json) solves each rated puzzle, and
// the cost of their solve is tested against the ratings, beside the solver's own estimate on the
// same puzzles. The bar is the scoreboard's: "what" bits 0.56, the step costs' peak 0.53 (Spearman
// within type on Puzzle Square JP).
//
// Sets: psjp (Puzzle Square JP's rated puzzles, references/psjp/<type>/, a spread sample of --per a
// type) and tatham (Simon Tatham's graded puzzles, references/tatham/puzzles/, --per / 4 a file, a type per game
// and size), and puzzlink (puzz.link's player ratings, difficulty5 1..5 from 5+ solves,
// references/puzzlink-db/converted/, a spread sample of --pl-per a genre, leaving out any puzzle also
// in Puzzle Square JP's rated set). Types without recorded solves use the generic model. Rows to references/sim-difficulty/<set>-<type>.jsonl,
// appended; a rerun skips what's there.
//
//   DEDUCE_JOBS=4 node --no-warnings puzzles/difficulty/sim-difficulty.ts run [psjp|tatham|puzzlink …] [--types akari,masyu] [--per 40] [--pl-per 100] [--samples 2] [--shard k --of N]
//   node --no-warnings puzzles/difficulty/sim-difficulty.ts report
//   DEDUCE_JOBS=4 node --no-warnings puzzles/difficulty/sim-difficulty.ts logic [psjp|tatham|puzzlink …] [--types …] [--budget 120] [--out sim-logic] [--shard k --of N]
// logic: how far logic without case splits gets on the puzzles already in the rows (see below).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { spearman } from "./calibrate.ts";
import type { MoveModel, Step } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { REFS_DIR } from "./janko.ts";
import { mapPool } from "./pool.ts";
import { fromTatham, TATHAM } from "./tatham.ts";

const OUT = `${REFS_DIR}sim-difficulty/`;
const argv = process.argv.slice(2), opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
// the words, without the options and their values (Batch puts --shard k --of N first): the command, then the sets
const words = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--")), cmd = words[0];
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };
const MODELS = JSON.parse(readFileSync(new URL("./human-model.json", import.meta.url), "utf8")) as Record<string, MoveModel>;

/** a solve's readouts: steps, case splits, the step costs' sum and peak, and the human model's
 *  bits: the choice's entropy summed (how spread the options were), the chosen moves' surprisal,
 *  minus the log-partitions (how unattractive the options were), and the distance travelled */
const readouts = (path: Step[]) => {
  const sum = (f: (s: Step) => number) => +path.reduce((a, s) => a + f(s), 0).toFixed(2);
  return {
    steps: path.length, splits: path.filter((s) => s.sim?.split || s.tier >= 2).length,
    costSum: sum((s) => s.cost), costPeak: Math.max(0, ...path.map((s) => s.cost)),
    h: sum((s) => s.sim?.h ?? 0), surprisal: sum((s) => -Math.log2(s.sim?.p ?? 1)), lse: sum((s) => (s.sim && !s.sim.split ? -s.sim.lse : 0)),
    dist: sum((s) => s.sim?.dist ?? 0), marks: sum((s) => s.sim?.n ?? 0),
  };
};

type Job = { set: string; type: string; genre: string; id: string; rated: number; spec: GridSpec };
const idsIn = (file: string) => new Set(existsSync(file) ? readFileSync(file, "utf8").split("\n").flatMap((l) => { const m = /^\{"id":"([^"]+)"/.exec(l); return m ? [m[1]] : []; }) : []);

/** the rated puzzles of these sets: a spread sample of `per` a type (`plPer` for puzz.link), each
 *  passed through `keep(file, id)`, the rows file it belongs to (under OUT) and its id */
function listJobs(sets: string[], types: string[] | undefined, per: number, plPer: number, keep: (file: string, id: string) => boolean): Job[] {
  const jobs: Job[] = [], done = (file: string) => ({ has: (id: string) => !keep(file.slice(OUT.length), id) });
  if (!sets.length || sets.includes("psjp")) {
    const root = `${REFS_DIR}psjp/`, data = JSON.parse(readFileSync(`${root}data.json`, "utf8")) as Record<string, { difficulty: number }>;
    for (const type of readdirSync(root).filter((t) => !t.includes(".") && t !== "scripts" && (!types || types.includes(t))).sort()) {
      const rated = readdirSync(`${root}${type}`).filter((f) => /^\d+\.json$/.test(f)).flatMap((f) => {
        const d = JSON.parse(readFileSync(`${root}${type}/${f}`, "utf8")), r = data[d.source?.psjp]?.difficulty;
        return r && d.grid ? [{ id: f.replace(".json", ""), rated: r, spec: { ...d.grid, genre: d.grid.genre ?? type } as GridSpec }] : [];
      });
      // a spread sample: sorted by rating, every k-th
      rated.sort((a, b) => a.rated - b.rated || hash(a.id) - hash(b.id));
      const step = Math.max(1, rated.length / per), had = done(`${OUT}psjp-${type}.jsonl`);
      for (let i = 0; i < Math.min(per, rated.length); i++) {
        const x = rated[Math.floor(i * step)];
        if (!had.has(x.id)) jobs.push({ set: "psjp", type, genre: x.spec.genre!, ...x });
      }
    }
  }
  if (!sets.length || sets.includes("tatham")) {
    const dir = `${REFS_DIR}tatham/puzzles/`;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".txt")).sort()) {
      const game = f.split("-")[0];
      if (!TATHAM[game] || (types && !types.includes(game))) continue;
      // a type is a game at one size: Tatham grades within a size
      readFileSync(dir + f, "utf8").trim().split("\n").slice(0, Math.max(4, Math.round(per / 4))).forEach((line, k) => {
        const r = fromTatham(game, line), id = `${f.replace(".txt", "")}#${k}`;
        const grade = r ? TATHAM[game].grades.indexOf(r.grade) : -1, type = r ? `${game}-${r.spec.size.join("x")}` : "";
        if (r && grade >= 0 && !done(`${OUT}tatham-${type}.jsonl`).has(id)) jobs.push({ set: "tatham", type, genre: TATHAM[game].genre, id, rated: grade, spec: r.spec });
      });
    }
  }
  if (sets.includes("puzzlink")) {
    // puzz.link's ratings: a different set of raters; the puzzles Puzzle Square JP also rates left out
    const dir = `${REFS_DIR}puzzlink-db/converted/`;
    const key = (g: GridSpec) => JSON.stringify([g.size, [...(g.givens ?? [])].map((x) => JSON.stringify(x)).sort()]);
    const psjp = new Set<string>(), proot = `${REFS_DIR}psjp/`;
    if (existsSync(proot)) for (const t of readdirSync(proot).filter((x) => !x.includes(".") && x !== "scripts"))
      for (const f of readdirSync(`${proot}${t}`).filter((x) => /^\d+\.json$/.test(x))) { const d = JSON.parse(readFileSync(`${proot}${t}/${f}`, "utf8")); if (d.grid) psjp.add(key(d.grid)); }
    for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort() : []) {
      const type = f.replace(".jsonl", "");
      if (types && !types.includes(type)) continue;
      const rated = readFileSync(dir + f, "utf8").split("\n").filter(Boolean).flatMap((l) => {
        const d = JSON.parse(l), m = d.meta ?? {};
        return m.difficulty5 && (m.solves ?? 0) >= 5 && !m.generated && !psjp.has(key(d.spec)) ? [{ id: d.sourceId as string, rated: m.difficulty5 as number, spec: { ...d.spec, genre: d.spec.genre ?? d.genre } as GridSpec }] : [];
      });
      rated.sort((a, b) => a.rated - b.rated || hash(a.id) - hash(b.id));
      const step = Math.max(1, rated.length / plPer), had = done(`${OUT}puzzlink-${type}.jsonl`);
      for (let i = 0; i < Math.min(plPer, rated.length); i++) {
        const x = rated[Math.floor(i * step)];
        if (!had.has(x.id)) jobs.push({ set: "puzzlink", type, genre: x.spec.genre!, ...x });
      }
    }
  }
  return jobs;
}

if (cmd === "run") {
  const sets = words.slice(1);
  const types = opt("types")?.split(","), per = Number(opt("per") ?? 40), samples = Number(opt("samples") ?? 2);
  const shard = Number(opt("shard") ?? 0), of = Number(opt("of") ?? 1);
  const had = new Map<string, Set<string>>();
  const jobs = listJobs(sets, types, per, Number(opt("pl-per") ?? 100), (file, id) => { if (!had.has(file)) had.set(file, idsIn(OUT + file)); return !had.get(file)!.has(id); });
  const mine = jobs.filter((j) => of <= 1 || Math.floor(hash(`${j.set}:${j.type}:${j.id}`) * of) === shard)
    // in a hashed order, so a run cut short loses a random slice of every type, not the last types
    .sort((a, b) => hash(`order:${a.set}:${a.id}`) - hash(`order:${b.set}:${b.id}`));
  mkdirSync(OUT, { recursive: true });
  console.error(`${new Date().toISOString()} ${mine.length} puzzles (of ${jobs.length})`);
  let n = 0;
  await mapPool(mine, async (j) => {
    const t0 = Date.now(), model = MODELS[j.genre] ?? MODELS.generic;
    const row: Record<string, unknown> = { id: j.id, set: j.set, type: j.type, genre: j.genre, rated: j.rated, model: j.genre in MODELS ? j.genre : "generic" };
    try {
      const r = await deduceGuarded(j.spec, { budgetMs: 600000, simulate: { model, samples, seed: Math.floor(hash(j.id) * 2 ** 31) } }, 900000);
      row.sims = r ? r.sims!.map((s) => ({ solved: s.solved, ...readouts(s.path) })) : "cap";
      if (r?.profile.notes.length) row.notes = r.profile.notes;
      const b = await deduceGuarded(j.spec, { budgetMs: 60000 }, 120000);
      row.solver = b ? { estimate: b.profile.estimate, solved: b.profile.solved, ...readouts(b.path) } : "cap";
    } catch (e) { row.error = (e as Error).message.slice(0, 200); }
    appendFileSync(`${OUT}${j.set}-${j.type}.jsonl`, JSON.stringify({ ...row, ms: Date.now() - t0 }) + "\n");
    const s = Array.isArray(row.sims) ? row.sims as { solved: boolean; steps: number; costSum: number }[] : [];
    console.error(`${++n}/${mine.length} ${j.set} ${j.type} ${j.id} (rated ${j.rated}) ${((Date.now() - t0) / 1000).toFixed(0)} s: ${row.error ?? (s.length ? s.map((x) => `${x.solved ? "" : "unsolved, "}${x.steps} steps, cost ${x.costSum}`).join("; ") : row.sims)}`);
  });
}

if (cmd === "logic") {
  // How far logic without case splits gets on the same puzzles (the reward comparison's "nosplit"
  // policy: the cheapest step each time, stopping where the menu is empty instead of splitting).
  // Deductions only grow, so where it stops doesn't depend on the order. The share it settles is
  // defined on every puzzle, including ones no solve finishes. Only the puzzles with rows in
  // references/sim-difficulty/ (it scores beside them in sim_fit.py); rows to
  // references/sim-logic/<set>-<type>.jsonl, appended; a rerun skips what's there.
  const LOGIC = `${REFS_DIR}${opt("out") ?? "sim-logic"}/`, budget = 1000 * Number(opt("budget") ?? 120), shard = Number(opt("shard") ?? 0), of = Number(opt("of") ?? 1);
  const sets = words.length > 1 ? words.slice(1) : ["psjp", "tatham", "puzzlink"];
  const rows = new Map<string, Set<string>>(), had = new Map<string, Set<string>>();
  const jobs = listJobs(sets, opt("types")?.split(","), Infinity, Infinity, (file, id) => {
    if (!rows.has(file)) { rows.set(file, idsIn(OUT + file)); had.set(file, idsIn(LOGIC + file)); }
    return rows.get(file)!.has(id) && !had.get(file)!.has(id);
  });
  const mine = jobs.filter((j) => of <= 1 || Math.floor(hash(`${j.set}:${j.type}:${j.id}`) * of) === shard)
    .sort((a, b) => hash(`order:${a.set}:${a.id}`) - hash(`order:${b.set}:${b.id}`));
  mkdirSync(LOGIC, { recursive: true });
  console.error(`${new Date().toISOString()} ${mine.length} puzzles (of ${jobs.length})`);
  let n = 0;
  await mapPool(mine, async (j) => {
    const t0 = Date.now(), row: Record<string, unknown> = { id: j.id, set: j.set, type: j.type, rated: j.rated };
    try {
      const r = await deduceGuarded(j.spec, { budgetMs: budget, simulate: { model: { cost: -50, dist: -0.01, items: 0 }, pick: "max", noSplits: true, samples: 1 } }, budget + 60000);
      const s = r?.sims?.[0];
      if (!s) row.logic = "cap";
      else {
        const facts = s.path.reduce((a, x) => a + x.facts.length, 0);
        // capped: out of time before the menu ran dry, so the share is a floor
        row.logic = { solved: s.solved, settled: s.open ? +(facts / s.open).toFixed(4) : 1, open: s.open, capped: r!.profile.notes.some((x) => x.startsWith("out of time")),
          steps: s.path.length, costSum: +s.path.reduce((a, x) => a + x.cost, 0).toFixed(2), costPeak: Math.max(0, ...s.path.map((x) => x.cost)) };
      }
    } catch (e) { row.error = (e as Error).message.slice(0, 200); }
    appendFileSync(`${LOGIC}${j.set}-${j.type}.jsonl`, JSON.stringify({ ...row, ms: Date.now() - t0 }) + "\n");
    const l = row.logic as { settled?: number } | undefined;
    console.error(`${++n}/${mine.length} ${j.set} ${j.type} ${j.id} ${((Date.now() - t0) / 1000).toFixed(0)} s: ${row.error ?? (typeof l === "object" ? `settled ${l.settled}` : l)}`);
  });
}

if (cmd === "report") {
  // per type, Spearman of each readout (the mean over samples; unsolved samples kept: their cost is
  // a floor) with the rating, a bootstrap 95% interval; then the within-type mean over psjp types
  const rows = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith(".jsonl")).flatMap((f) => readFileSync(OUT + f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))) : [];
  const SIM = ["costSum", "costPeak", "h", "surprisal", "lse", "dist", "marks", "steps", "splits"] as const;
  const BASE = ["estimate", "costSum", "costPeak", "steps"] as const;
  const cols = [...SIM.map((k) => `sim ${k}`), ...BASE.map((k) => `solver ${k}`)];
  const value = (r: any, c: string) => {
    const [who, k] = c.split(" ");
    if (who === "solver") return typeof r.solver === "object" ? r.solver[k] : NaN;
    const s = Array.isArray(r.sims) ? r.sims : [];
    return s.length ? s.reduce((a: number, x: any) => a + x[k], 0) / s.length : NaN;
  };
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const boot = (xs: number[], ys: number[]) => {
    const rs: number[] = [];
    for (let b = 0; b < 400; b++) { const idx = xs.map(() => Math.floor(rand() * xs.length)); rs.push(spearman(idx.map((i) => xs[i]), idx.map((i) => ys[i]))); }
    rs.sort((a, b) => a - b);
    return [rs[10], rs[389]];
  };
  const groups = [...new Set(rows.map((r) => `${r.set} ${r.type}`))].sort();
  console.log(`| set and type | n | model | ${cols.join(" | ")} |\n|${"---|".repeat(cols.length + 3)}`);
  const within: Record<string, { rho: number; n: number }[]> = {};
  for (const g of groups) {
    const rs = rows.filter((r) => `${r.set} ${r.type}` === g && Array.isArray(r.sims) && typeof r.solver === "object");
    if (rs.length < 8) continue;
    const cells = cols.map((c) => {
      const ok = rs.filter((r) => Number.isFinite(value(r, c)));
      const x = ok.map((r) => value(r, c)), y = ok.map((r) => r.rated), rho = spearman(x, y);
      if (g.startsWith("psjp")) (within[c] ??= []).push({ rho, n: ok.length });
      return c === "sim lse" || c === "sim costSum" || c === "solver costPeak" ? `${rho.toFixed(2)} (${boot(x, y).map((v) => v.toFixed(2)).join(", ")})` : rho.toFixed(2);
    });
    console.log(`| ${g} | ${rs.length} | ${rs[0].model} | ${cells.join(" | ")} |`);
  }
  const mean = (c: string) => { const w = within[c] ?? []; const n = w.reduce((a, x) => a + x.n, 0); return n ? (w.reduce((a, x) => a + x.rho * x.n, 0) / n).toFixed(2) : "-"; };
  console.log(`| psjp, within type (n-weighted) | | | ${cols.map(mean).join(" | ")} |`);
  const solved = rows.filter((r) => Array.isArray(r.sims)), simSolved = solved.flatMap((r) => r.sims).filter((s: any) => s.solved).length;
  console.log(`\n${rows.length} puzzles; simulated solves finished: ${simSolved} of ${solved.flatMap((r) => r.sims).length}; caps or errors: ${rows.filter((r) => !Array.isArray(r.sims)).length}`);
}
