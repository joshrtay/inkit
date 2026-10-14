// A human-made test set for the graph network (graph_policy.py), never trained on: Janko's puzzles
// (janko.ts's types, up to 10 × 10, with recorded moves) and Puzzle Square JP's, as graph-data.ts
// writes them. Janko's records also carry the person's order (janko.ts: the move that first gave
// each mark its final value) and who solved it, so the network's guesses can be compared with what
// people did next. → references/ml/graphs-human.jsonl (local only; the puzzles are others')
//
//   DEDUCE_JOBS=3 node puzzles/difficulty/graph-human.ts [--janko 150] [--psjp 100] [--write] [--no-skip]
//
// --train: the human training set instead (GRAPH_HUMAN_TRAIN in graph_policy.py): every Janko
// puzzle janko.ts reads (all fourteen types; the test set keeps the first eight) and every Puzzle
// Square JP puzzle (the rated set, and psjp-links.ts's from links), up to --max × --max (default 15), except
// the test set's (graphs-human.jsonl must be there: its names are left out before solving, and any
// record with the same type, givens and rule instances as a test puzzle after, as graph_policy.py's
// leakage guard matches them). Janko's keep the solver and, where moves were recorded, the order.
// → references/ml/graphs-human-train.jsonl. Too slow for the Mac (about 3½ hours at 3 jobs): a cloud
// CPU job (puzzles/cloud/run-human-job.sh). --count lists the jobs without solving; --limit N
// takes the first N (round robin over types), for a small test.
//
// Each solve is cached in references/ml/human-cache/ (a rerun picks up where the last stopped;
// --write only writes the file from the cache). Puzzle Square JP up to 12 × 12, as graph-data.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { contentKey, graphRecord } from "./graph-data.ts";
import { JANKO_FIRST, JANKO_TYPES, readType, REFS_DIR } from "./janko.ts";
import { deduceCacheFile, studied } from "./janko-order.ts";
import { JOBS, mapPool } from "./pool.ts";

const argv = process.argv.slice(2);
const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
const TRAIN = argv.includes("--train");
const ml = `${REFS_DIR}ml/`, cache = `${ml}human-cache/`;
const testFile = `${ml}graphs-human.jsonl`;
const out = process.env.GRAPH_OUT ?? (TRAIN ? `${ml}graphs-human-train.jsonl` : testFile);
mkdirSync(cache, { recursive: true });

interface Job { source: string; genre: string; name: string; spec: GridSpec; solver?: string; humanOrder?: [string, number][] }
const jobs: Job[][] = [];

// the test set, left out of the training set: by name before solving, by content after
const test = { names: new Set<string>(), keys: new Set<string>() };
if (TRAIN) {
  if (!existsSync(testFile)) { console.error(`--train needs the test set, ${testFile}`); process.exit(1); }
  for (const l of readFileSync(testFile, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    test.names.add(d.name); test.keys.add(contentKey(d));
  }
}
const MAX = opt("--max", 15);
const order = (settled: Map<string, number>) => [...settled].sort((a, b) => a[1] - b[1]);

if (TRAIN) {
  // Janko: every puzzle janko.ts reads up to MAX × MAX, the order where moves were recorded
  for (const type of Object.keys(JANKO_TYPES))
    jobs.push(readType(type).filter(({ j }) => j.spec.size[0] <= MAX && j.spec.size[1] <= MAX).map(({ f, j }) => ({
      source: "janko", genre: j.spec.genre!, name: `janko ${JANKO_TYPES[type].folder}/${f}`, spec: j.spec, solver: j.solver,
      ...(j.moves ? { humanOrder: order(j.settled) } : {}),
    })).filter((x) => !test.names.has(x.name)));
} else {
  // Janko: the first eight types janko.ts read (JANKO_FIRST, so the set stays as it was), puzzles
  // with enough recorded moves (janko-order.ts, studied)
  for (const type of JANKO_FIRST) {
    jobs.push(studied(type, 10, opt("--janko", 150)).map(({ f, j }) => ({
      source: "janko", genre: j.spec.genre!, name: `janko ${JANKO_TYPES[type].folder}/${f}`, spec: j.spec, solver: j.solver,
      humanOrder: order(j.settled),
    })));
  }
}
// Puzzle Square JP: up to N per type, spread evenly through its numbering (all of them for --train)
const psjp = `${REFS_DIR}psjp/`;
if (existsSync(psjp))
  for (const type of readdirSync(psjp).filter((t) => !t.includes(".") && t !== "scripts").sort()) {
    const files = readdirSync(`${psjp}${type}`).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    const max = TRAIN ? MAX : 12;
    const items = files.map((f) => {
      const d = JSON.parse(readFileSync(`${psjp}${type}/${f}`, "utf8"));
      return { source: "psjp", genre: d.grid.genre ?? type, name: `psjp ${type}/${f}`, spec: { ...d.grid, genre: d.grid.genre ?? type } as GridSpec };
    }).filter((x) => x.spec.size && x.spec.size[0] <= max && x.spec.size[1] <= max);
    if (TRAIN) { jobs.push(items.filter((x) => !test.names.has(x.name))); continue; }
    const n = opt("--psjp", 100);
    jobs.push(items.length <= n ? items : Array.from({ length: n }, (_, k) => items[Math.floor((k * items.length) / n)]));
  }
// Puzzle Square JP's puzzles from their links (psjp-links.ts: those with exactly one solution, not in
// the rated set above), for --train
const links = `${REFS_DIR}psjp-links/`;
if (TRAIN && existsSync(links))
  for (const f of readdirSync(links).filter((f) => f.endsWith(".jsonl")).sort())
    jobs.push(readFileSync(`${links}${f}`, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
      .map((d) => ({ source: "psjp-links", genre: d.genre, name: d.name, spec: d.spec as GridSpec }))
      .filter((x) => x.spec.size[0] <= MAX && x.spec.size[1] <= MAX && !test.names.has(x.name)));
// round robin over types, so a run stopped early still covers every type
const all: Job[] = [];
for (let k = 0; jobs.some((js) => k < js.length); k++) for (const js of jobs) if (k < js.length) all.push(js[k]);
if (argv.includes("--limit")) all.splice(opt("--limit", all.length));   // a small test: the first N

if (argv.includes("--count")) {
  const n = new Map<string, number>();
  for (const j of all) n.set(`${j.source} ${j.genre}`, (n.get(`${j.source} ${j.genre}`) ?? 0) + 1);
  console.log([...n].sort().map(([k, v]) => `${k} ${v}`).join("\n"));
  console.log(`${all.length} puzzles (${all.filter((j) => j.source === "janko").length} Janko)${TRAIN ? `, ${test.names.size} test puzzles left out by name` : ""}`);
  process.exit(0);
}

const keyOf = (spec: GridSpec) => createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 24);
const write = (final = false) => {
  const lines: string[] = [], seen = new Set<string>(), tally = new Map<string, [number, number]>();
  let leaked = 0, twice = 0;
  for (const job of all) {
    const f = `${cache}${keyOf(job.spec)}.json`;
    if (!existsSync(f)) continue;
    const r = JSON.parse(readFileSync(f, "utf8"));
    if (!r) continue;
    if (TRAIN) {
      // a test puzzle under another name (or from the other source): left out; a puzzle twice in
      // the training set (Janko's and Puzzle Square JP's copies): kept once
      const key = contentKey({ ...r, genre: job.genre });
      if (test.keys.has(key)) { leaked++; continue; }
      if (seen.has(key)) { twice++; continue; }
      seen.add(key);
      const t = tally.get(`${job.source} ${job.genre}`) ?? [0, 0];
      t[0]++; t[1] += r.rounds.length; tally.set(`${job.source} ${job.genre}`, t);
    }
    lines.push(JSON.stringify({ ...r, source: job.source, genre: job.genre, name: job.name, ...(job.solver !== undefined ? { solver: job.solver, ...(job.humanOrder ? { humanOrder: job.humanOrder } : {}) } : {}) }));
  }
  writeFileSync(out, lines.join("\n") + (lines.length ? "\n" : ""));
  if (TRAIN && final) {
    console.error(`left out: ${test.names.size} test puzzles by name, ${leaked} more by content (same type, givens and rule instances); ${twice} duplicates`);
    console.error("| Source | Type | Puzzles | States |\n|---|---|---|---|\n" + [...tally].sort().map(([k, [p, s]]) => `| ${k.replace(" ", " | ")} | ${p} | ${s} |`).join("\n"));
  }
  return lines.length;
};

if (!argv.includes("--write")) {
  console.error(`${all.length} puzzles (${all.filter((j) => j.source === "janko").length} Janko), ${JOBS} at a time`);
  let done = 0, skipped = 0;
  const tally = new Map<string, { tried: number; kept: number }>();   // per source and type
  await mapPool(all, async (job) => {
    const f = `${cache}${keyOf(job.spec)}.json`, type = `${job.source} ${job.genre}`;
    const t = tally.get(type) ?? { tried: 0, kept: 0 };
    tally.set(type, t);
    // known not to solve in janko-order.ts's cached solve (the same budget): not tried again, and
    // not counted below
    const known = job.source === "janko" && existsSync(deduceCacheFile(job.spec)) ? JSON.parse(readFileSync(deduceCacheFile(job.spec), "utf8")) : undefined;
    if (known !== undefined && !known?.profile?.solved) { if (!existsSync(f)) writeFileSync(f, "null"); done++; return; }
    if (!existsSync(f)) {
      // a type the solver rarely finishes in time (Nurikabe, Numberlink): after 12 tries with under
      // a quarter kept, the rest are skipped (not cached; --no-skip tries them)
      if (!argv.includes("--no-skip") && t.tried >= 12 && t.kept < 0.25 * t.tried) { skipped++; done++; return; }
      const r = await deduceGuarded(job.spec, { budgetMs: 30000, structure: true }, 120000).catch(() => null);
      // kept even when unsolved (as null), so a rerun doesn't wait for it again
      const rec = r ? graphRecord({ source: job.source, genre: job.genre, name: job.name }, job.spec, r) : null;
      writeFileSync(f, JSON.stringify(rec));
    }
    t.tried++;
    if (readFileSync(f, "utf8") !== "null") t.kept++;
    if (++done % (TRAIN ? 200 : 25) === 0) console.error(`${done}/${all.length} (${write()} kept, ${skipped} skipped)`);
  });
  console.error([...tally].map(([k, v]) => `${k} ${v.kept}/${v.tried}`).join(", "));
}
console.log(`${write(true)} puzzles in ${out}`);
