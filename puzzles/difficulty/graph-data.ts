// Training data for the cross-type graph network (graph_policy.py): puzzles of many types as
// graphs (deduce's structure: marks on cells, rule instances on sets of cells) with each round's
// settled facts, their signatures (signatures.ts) and costs. From the corpus (corpus.ts) and the
// generator, a few types at small sizes. → references/ml/graphs.jsonl (local only)
//
//   node puzzles/difficulty/graph-data.ts [generatedPerType]
//     GRAPH_TYPES="sudoku:9,akari:7,…" chooses the generated types and sizes; GRAPH_CORPUS=0 leaves
//     the corpus out; GRAPH_OUT names the file (references/ml/<name>.jsonl)
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { generate } from "../grid/generate.ts";
import { corpus } from "./corpus.ts";
import { deduce } from "./deduce.ts";
import { mapPool } from "./pool.ts";
import { signature } from "./signatures.ts";

const self = fileURLToPath(import.meta.url);
type Job = { source: string; genre: string; name: string; spec?: GridSpec; size?: number; seed?: number };

async function run(job: Job) {
  const spec = job.spec ?? (await generate({ genre: job.genre, rows: job.size!, cols: job.size!, seed: job.seed! }));
  if (!spec) return null;
  const { path, profile, initial, answer, structure } = await deduce(spec, { budgetMs: 20000, structure: true });
  if (!profile.solved || !structure) return null;
  // what each cell shows at the start: a printed number, a block, or another clue
  const p = makePuzzle(spec), givens: [number, string, number][] = [];
  for (const [i, gs] of p.cellGivens) for (const x of gs) givens.push([i, x.kind, "value" in x && typeof x.value === "number" ? x.value : 0]);
  for (const i of p.blocked) givens.push([i, "blocked", 0]);
  const rounds = new Map<number, { facts: [string, boolean, string, number][] }>();
  for (const s of path) {
    if (s.choice) continue;
    const r = rounds.get(s.round ?? 0) ?? { facts: [] };
    const sig = signature(s);
    for (const f of s.facts) r.facts.push([f.mark, f.value, sig, s.cost]);
    rounds.set(s.round ?? 0, r);
  }
  return { ...job, spec: undefined, estimate: profile.estimate, structure, givens, initial, answer, rounds: [...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r) };
}

if (process.argv[2] === "--job") {
  process.stdout.on("error", () => process.exit(0));
  run(JSON.parse(Buffer.from(process.argv[3], "base64").toString())).then((r) => process.stdout.write(JSON.stringify(r)), () => process.stdout.write("null"));
} else {
  const per = Number(process.argv[2]) || 60;
  const GENERATED: [string, number][] = process.env.GRAPH_TYPES ? process.env.GRAPH_TYPES.split(",").map((x) => { const [g, n] = x.split(":"); return [g, Number(n)] as [string, number]; }) : [["sudoku", 9], ["star-battle", 8], ["akari", 7], ["hitori", 6], ["skyscrapers", 5], ["binary-puzzle", 6], ["minesweeper", 6],
    ["shikaku", 6], ["easy-as-abc", 5], ["spiral-galaxies", 6], ["simple-loop", 6], ["masyu", 6], ["nurikabe", 6], ["cave", 6]];
  const jobs: Job[] = [
    ...(process.env.GRAPH_CORPUS === "0" ? [] : corpus(12)).filter((x) => x.spec.size[0] <= 12 && x.spec.size[1] <= 12).map((x) => ({ source: x.source, genre: x.genre, name: x.name, spec: x.spec })),
    ...GENERATED.flatMap(([genre, size]) => Array.from({ length: per }, (_, k) => ({ source: "generated", genre, name: `${genre} ${size} #${k + 1}`, size, seed: 1000 + size * 10000 + k }))),
  ];
  const repo = new URL("../../", import.meta.url).pathname;
  mkdirSync(`${repo}references/ml`, { recursive: true });
  const file = `${repo}references/ml/${process.env.GRAPH_OUT ?? (process.env.GRAPH_CORPUS === "0" ? "graphs-smoke" : "graphs")}.jsonl`;
  writeFileSync(file, "");
  const live = new Set<ReturnType<typeof spawn>>();
  process.on("exit", () => { for (const c of live) c.kill("SIGKILL"); });
  let done = 0, kept = 0;
  await mapPool(jobs, (job) => new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [self, "--job", Buffer.from(JSON.stringify(job)).toString("base64")], { stdio: ["ignore", "pipe", "ignore"] });
    live.add(child);
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", () => {
      live.delete(child); clearTimeout(timer); done++;
      if (out && out !== "null") { appendFileSync(file, out + "\n"); kept++; }
      if (done % 100 === 0 || done === jobs.length) console.error(`${done}/${jobs.length} (${kept} kept)`);
      resolve();
    });
  }));
  console.log(`${kept} puzzles in ${file}`);
}
