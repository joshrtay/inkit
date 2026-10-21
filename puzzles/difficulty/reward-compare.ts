// Different rewards, different solvers: what each reward's best policy does on the same puzzles
// (thread "Where RL could help us", 2026-10-21). The puzzle rules are an exact simulator, so instead of
// training a policy with RL, each reward's greedy policy is run over the solver's menu
// (deduce.ts Options.simulate with pick "max") and its solve is described:
//
//   cheapest   take the cheapest step (reward: forced marks, easiest first; deductions only grow,
//              so this is also the lowest-peak path)
//   nosplit    the same, but never case-split (reward: pure logic; stops where the windows can't go on)
//   nearest    take the step nearest the last move (reward: penalty for distance travelled)
//   human      the human move model's likeliest move
//   sample     a person sampled from the human move model (the step 2 simulated person; reference)
//
// Each solve's readouts: solved, share of the puzzle settled, steps, case splits, step costs summed
// and peak, distance a move, and how human its moves were: bits a move under the human model (lower
// is more human), and on Janko's puzzles the rank agreement with the person's recorded order (rho). Rows to references/reward-compare/<set>.jsonl, appended; a rerun skips what's there.
//
//   DEDUCE_JOBS=4 node --no-warnings puzzles/difficulty/reward-compare.ts run [examples|psjp|janko] [--types akari,hitori] [--per 20]
//   node --no-warnings puzzles/difficulty/reward-compare.ts report
// With --shard k --of N a run takes only the puzzles whose id hashes to shard k (Cloud Batch:
// puzzles/cloud/run-batch.sh puzzles/difficulty/reward-compare.ts reward-compare --args "run janko --per 20").
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { spearman } from "./calibrate.ts";
import type { MoveModel, Step } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { JANKO_TYPES, readType, REFS_DIR } from "./janko.ts";
import { mapPool } from "./pool.ts";

const OUT = `${REFS_DIR}reward-compare/`;
const args = process.argv.slice(2), opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
// the words, without the options and their values (Batch puts --shard k --of N first)
const argv = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };
const MODELS = JSON.parse(readFileSync(new URL("./human-model.json", import.meta.url), "utf8")) as Record<string, MoveModel>;

/** each reward's policy, as a move model to maximise (or sample, for the reference person) */
const POLICIES: Record<string, (human: MoveModel) => { model: MoveModel; pick: "max" | "sample"; noSplits?: boolean }> = {
  cheapest: () => ({ model: { cost: -50, dist: -0.01, items: 0 }, pick: "max" }),
  nosplit: () => ({ model: { cost: -50, dist: -0.01, items: 0 }, pick: "max", noSplits: true }),
  nearest: () => ({ model: { cost: -0.5, dist: -50, items: 0 }, pick: "max" }),
  human: (h) => ({ model: h, pick: "max" }),
  sample: (h) => ({ model: h, pick: "sample" }),
};

const readouts = (path: Step[], solved: boolean, total: number) => {
  const moves = path.filter((s) => s.sim && !s.sim.split), facts = path.reduce((a, s) => a + s.facts.length, 0);
  const mean = (xs: number[]) => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : 0;
  return {
    solved, settled: total ? +(facts / total).toFixed(3) : 0, steps: path.length,
    splits: path.filter((s) => s.sim?.split).length,
    costSum: +path.reduce((a, s) => a + s.cost, 0).toFixed(2), costPeak: Math.max(0, ...path.map((s) => s.cost)),
    dist: mean(moves.map((s) => s.sim!.dist)), bits: mean(moves.map((s) => -Math.log2(s.sim!.ps ?? 1))),
  };
};

interface Job { set: string; type: string; genre: string; id: string; spec: GridSpec; settled?: Map<string, number> }

if (argv[0] === "run") {
  const set = argv[1] ?? "examples", types = opt("types")?.split(","), per = Number(opt("per") ?? 20);
  const jobs: Job[] = [];
  if (set === "examples") {
    const root = new URL("../../src/games/", import.meta.url).pathname;
    for (const type of readdirSync(root).filter((t) => !types || types.includes(t)).sort())
      for (const f of readdirSync(root + type).filter((f) => f.endsWith(".json")).sort()) {
        const d = JSON.parse(readFileSync(`${root}${type}/${f}`, "utf8"));
        if (d.type === "grid" && d.grid) jobs.push({ set, type, genre: d.grid.genre ?? type, id: `${type}/${f}`, spec: { ...d.grid, genre: d.grid.genre ?? type } });
      }
  } else if (set === "psjp") {
    const root = `${REFS_DIR}psjp/`;
    for (const type of readdirSync(root).filter((t) => !t.includes(".") && t !== "scripts" && (!types || types.includes(t))).sort()) {
      const fs = readdirSync(`${root}${type}`).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => hash(a) - hash(b)).slice(0, per);
      for (const f of fs) { const d = JSON.parse(readFileSync(`${root}${type}/${f}`, "utf8")); if (d.grid) jobs.push({ set, type, genre: d.grid.genre ?? type, id: `${type}/${f}`, spec: { ...d.grid, genre: d.grid.genre ?? type } }); }
    }
  } else if (set === "janko") {
    for (const type of Object.keys(JANKO_TYPES).filter((t) => !types || types.includes(t))) {
      const all = readType(type).filter((x) => x.j.spec.size[0] <= 10).sort((a, b) => hash(a.f) - hash(b.f)).slice(0, per);
      for (const { f, j } of all) jobs.push({ set, type, genre: j.spec.genre ?? JANKO_TYPES[type].genre, id: `${type}/${f}`, spec: j.spec, settled: j.settled });
    }
  }
  mkdirSync(OUT, { recursive: true });
  const file = `${OUT}${set}.jsonl`;
  const had = new Set(existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l).id) : []);
  const shard = opt("shard"), of = Number(opt("of") ?? 1);
  const todo = jobs.filter((j) => !had.has(j.id) && (shard === undefined || Math.floor(hash(`shard:${j.id}`) * of) === Number(shard)));
  console.error(`${todo.length} puzzles to run (${jobs.length} chosen)`);
  let n = 0;
  await mapPool(todo, async (j) => {
    const t0 = Date.now(), human = MODELS[j.genre] ?? MODELS.generic;
    const row: Record<string, unknown> = { id: j.id, set: j.set, type: j.type, genre: j.genre, model: j.genre in MODELS ? j.genre : "generic" };
    for (const [name, policy] of Object.entries(POLICIES)) {
      try {
        const p = policy(human);
        const r = await deduceGuarded(j.spec, { budgetMs: 120000, simulate: { ...p, score: human, samples: 1, seed: Math.floor(hash(j.id) * 2 ** 31) } }, 180000);
        // the marks to settle: everything the reference person settled (it always finishes or is capped)
        row[name] = r ? { path: r.sims![0].path, solved: r.sims![0].solved } : "cap";
      } catch (e) { row[name] = `error: ${(e as Error).message.slice(0, 120)}`; }
    }
    const total = Math.max(0, ...Object.keys(POLICIES).map((k) => { const x = row[k] as any; return x?.path ? x.path.reduce((a: number, s: Step) => a + s.facts.length, 0) : 0; }));
    // Janko: agreement with the person's order (Spearman over the marks both settled)
    const agree = (path: Step[]) => {
      if (!j.settled) return undefined;
      const at = new Map<string, number>();
      path.forEach((s, k) => { for (const f of s.facts) if (!at.has(f.mark)) at.set(f.mark, k); });
      const ms = [...j.settled.keys()].filter((m) => at.has(m));
      return ms.length >= 3 ? +spearman(ms.map((m) => j.settled!.get(m)!), ms.map((m) => at.get(m)!)).toFixed(3) : undefined;
    };
    for (const k of Object.keys(POLICIES)) { const x = row[k] as any; if (x?.path) row[k] = { ...readouts(x.path, x.solved, total), rho: agree(x.path) }; }
    appendFileSync(file, JSON.stringify({ ...row, ms: Date.now() - t0 }) + "\n");
    console.error(`${++n}/${todo.length} ${j.id} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  });
}

if (argv[0] === "report") {
  const rows = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith(".jsonl")).flatMap((f) => readFileSync(OUT + f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))) : [];
  const keys = ["solved", "settled", "steps", "splits", "costSum", "costPeak", "dist", "bits", "rho"] as const;
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  // each set on its own (Janko's and the rated site's types share names but not puzzles)
  const groups = [...new Set(rows.map((r) => r.set))].sort().flatMap((set) => {
    const of = rows.filter((r) => r.set === set);
    return [[`${set}: all`, of], ...[...new Set(of.map((r) => r.type))].sort().map((t) => [`${set}: ${t}`, of.filter((r) => r.type === t)])];
  }) as [string, any[]][];
  for (const [g, rs] of groups) {
    console.log(`\n### ${g} (${rs.length} puzzles)\n\n| policy | ${keys.join(" | ")} |\n|---|${"---|".repeat(keys.length)}`);
    for (const p of Object.keys(POLICIES)) {
      const ok = rs.map((r) => r[p]).filter((x) => x && typeof x === "object");
      console.log(`| ${p} | ${keys.map((k) => { const v = mean(ok.map((x) => k === "solved" ? (x.solved ? 1 : 0) : x[k]).filter((v) => typeof v === "number" && Number.isFinite(v))); return Number.isFinite(v) ? (k === "solved" || k === "settled" ? `${Math.round(v * 100)}%` : v.toFixed(2)) : "-"; }).join(" | ")} |`);
    }
  }
  // the rated set: within each type, Spearman of each policy's readouts with the site's difficulty
  // rating, then the mean over types (types rank differently, so they aren't pooled)
  const rated = rows.filter((r) => r.set === "psjp").flatMap((r) => {
    try { const d = JSON.parse(readFileSync(`${REFS_DIR}psjp/${r.id}`, "utf8")); return d.rating?.difficulty != null ? [{ ...r, rating: d.rating.difficulty }] : []; } catch { return []; }
  });
  if (rated.length) {
    const ks = ["costPeak", "costSum", "settled", "steps", "splits"] as const, types = [...new Set(rated.map((r) => r.type))].sort();
    // every puzzle, then only the ones the policy finished (an unfinished path is short and cheap,
    // and harder puzzles are finished less often within the budget)
    for (const only of [false, true]) {
    console.log(`\n### against the ratings${only ? ", finished solves only" : ""} (psjp, ${rated.length} rated puzzles, ${types.length} types; mean within-type Spearman, types counted)\n\n| policy | ${ks.join(" | ")} |\n|---|${"---|".repeat(ks.length)}`);
    for (const p of Object.keys(POLICIES)) {
      console.log(`| ${p} | ${ks.map((k) => {
        const per = types.flatMap((t) => {
          const ok = rated.filter((r) => r.type === t && r[p] && typeof r[p] === "object" && Number.isFinite(r[p][k]) && (!only || r[p].solved));
          const rho = ok.length >= 5 ? spearman(ok.map((r) => r.rating), ok.map((r) => r[p][k])) : NaN;
          return Number.isFinite(rho) ? [rho] : [];
        });
        return per.length ? `${mean(per).toFixed(2)} (${per.length})` : "-";
      }).join(" | ")} |`);
    }
    }
  }
  // Janko: each policy's rho against cheapest's, on the puzzles where every policy has one
  const both = rows.filter((r) => r.set === "janko" && Object.keys(POLICIES).every((p) => typeof r[p]?.rho === "number"));
  if (both.length) {
    console.log(`\n### rho paired against cheapest (janko, ${both.length} puzzles; bootstrap 95%)\n\n| policy | rho | minus cheapest |\n|---|---|---|`);
    let seed = 1; const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
    for (const p of Object.keys(POLICIES)) {
      const d = both.map((r) => r[p].rho - r.cheapest.rho);
      const boot = Array.from({ length: 2000 }, () => mean(d.map(() => d[Math.floor(rnd() * d.length)]))).sort((a, b) => a - b);
      console.log(`| ${p} | ${mean(both.map((r) => r[p].rho)).toFixed(3)} | ${mean(d).toFixed(3)} (${boot[50].toFixed(3)}, ${boot[1949].toFixed(3)}) |`);
    }
  }
}
