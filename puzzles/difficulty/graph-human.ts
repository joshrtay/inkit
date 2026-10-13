// A human-made test set for the graph network (graph_policy.py), never trained on: Janko's puzzles
// (janko.ts's types, up to 10 × 10, with recorded moves) and Puzzle Square JP's, as graph-data.ts
// writes them. Janko's records also carry the person's order (janko.ts: the move that first gave
// each mark its final value) and who solved it, so the network's guesses can be compared with what
// people did next. → references/ml/graphs-human.jsonl (local only; the puzzles are others')
//
//   DEDUCE_JOBS=3 node puzzles/difficulty/graph-human.ts [--janko 150] [--psjp 100] [--write]
//
// Each solve is cached in references/ml/human-cache/ (a rerun picks up where the last stopped;
// --write only writes the file from the cache). Puzzle Square JP up to 12 × 12, as graph-data.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { graphRecord } from "./graph-data.ts";
import { JANKO_TYPES } from "./janko.ts";
import { studied } from "./janko-order.ts";
import { JOBS, mapPool } from "./pool.ts";

const argv = process.argv.slice(2);
const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
const repo = new URL("../../", import.meta.url).pathname;
const ml = `${repo}references/ml/`, cache = `${ml}human-cache/`, out = process.env.GRAPH_OUT ?? `${ml}graphs-human.jsonl`;
mkdirSync(cache, { recursive: true });

interface Job { source: string; genre: string; name: string; spec: GridSpec; solver?: string; humanOrder?: [string, number][] }
const jobs: Job[][] = [];

// Janko: the types janko.ts reads, puzzles with enough recorded moves (janko-order.ts, studied)
for (const type of Object.keys(JANKO_TYPES)) {
  jobs.push(studied(type, 10, opt("--janko", 150)).map(({ f, j }) => ({
    source: "janko", genre: j.spec.genre!, name: `janko ${JANKO_TYPES[type].folder}/${f}`, spec: j.spec, solver: j.solver,
    humanOrder: [...j.settled].sort((a, b) => a[1] - b[1]),
  })));
}
// Puzzle Square JP: up to N per type, spread evenly through its numbering
const psjp = `${repo}references/psjp/`;
if (existsSync(psjp))
  for (const type of readdirSync(psjp).filter((t) => !t.includes(".") && t !== "scripts").sort()) {
    const files = readdirSync(`${psjp}${type}`).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    const items = files.map((f) => {
      const d = JSON.parse(readFileSync(`${psjp}${type}/${f}`, "utf8"));
      return { source: "psjp", genre: d.grid.genre ?? type, name: `psjp ${type}/${f}`, spec: { ...d.grid, genre: d.grid.genre ?? type } as GridSpec };
    }).filter((x) => x.spec.size && x.spec.size[0] <= 12 && x.spec.size[1] <= 12);
    const n = opt("--psjp", 100);
    jobs.push(items.length <= n ? items : Array.from({ length: n }, (_, k) => items[Math.floor((k * items.length) / n)]));
  }
// round robin over types, so a run stopped early still covers every type
const all: Job[] = [];
for (let k = 0; jobs.some((js) => k < js.length); k++) for (const js of jobs) if (k < js.length) all.push(js[k]);

const keyOf = (spec: GridSpec) => createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 24);
const write = () => {
  const lines: string[] = [];
  for (const job of all) {
    const f = `${cache}${keyOf(job.spec)}.json`;
    if (!existsSync(f)) continue;
    const r = JSON.parse(readFileSync(f, "utf8"));
    if (r) lines.push(JSON.stringify({ ...r, source: job.source, genre: job.genre, name: job.name, ...(job.solver !== undefined ? { solver: job.solver, humanOrder: job.humanOrder } : {}) }));
  }
  writeFileSync(out, lines.join("\n") + (lines.length ? "\n" : ""));
  return lines.length;
};

if (!argv.includes("--write")) {
  console.error(`${all.length} puzzles (${all.filter((j) => j.source === "janko").length} Janko), ${JOBS} at a time`);
  let done = 0;
  await mapPool(all, async (job) => {
    const f = `${cache}${keyOf(job.spec)}.json`;
    if (!existsSync(f)) {
      const r = await deduceGuarded(job.spec, { budgetMs: 30000, structure: true }, 120000).catch(() => null);
      // kept even when unsolved (as null), so a rerun doesn't wait for it again
      const rec = r ? graphRecord({ source: job.source, genre: job.genre, name: job.name }, job.spec, r) : null;
      writeFileSync(f, JSON.stringify(rec));
    }
    if (++done % 25 === 0) console.error(`${done}/${all.length} (${write()} kept)`);
  });
}
console.log(`${write()} puzzles in ${out}`);
