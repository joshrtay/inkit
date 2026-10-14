// Graph records labelled by people, not by our solver: Janko's puzzles with recorded moves, every
// type janko.ts reads, as graph_policy.py's records (graph-data.ts) whose states come from the
// person's progression and whose labels are the person's next moves. A human puzzle otherwise
// enters the graph data only if our solver finishes it in 30 s (graph-human.ts), which drops the
// hardest, the ones least like ours; these need no solve.
//
// - Structure (marks, cells, rule instances) and what's known at the start come from the engine
//   and the puzzle (deduce.ts with setupOnly: grounding and each given's own cell, no solving),
//   checked against Janko's solution. The lemmas' groups, which our solver adds while solving
//   (premature loops), aren't there.
// - Each round is one of the person's moves that settled marks (janko.ts: the first move giving a
//   mark its final value), in their order; state k is what they had settled before their k-th such
//   move. Marks they never touch (a loop's empty links) stay open in every state.
// - The labels: humanOrder, the marks the person settled, earliest first (graph_policy.py with
//   labels "human" takes the next 3 still open in each state, as its agreement measure does). For
//   digit types a move writing a digit settles the cell's other digits too (in the states), but only
//   the written digit is a label (an Easy as ABC cell left empty: its digits, all false).
// - Only puzzles whose person settled at least 60% of the solution's marks (janko-order.ts's
//   studied), up to --max × --max (15); Hidoku with more than MAX_MARKS digit marks left out (the
//   network leaves such puzzles out anyway), Fillomino over 100 cells (grounding a 10 × 10 one
//   takes 12 s and 2.3 GB), and those janko-check.ts found not to have exactly one
//   solution under our rules (a timeout stays).
// - split: "test" for every puzzle of the human test set (graphs-human.jsonl, by name) and a fixed
//   --hold share of the rest (by a hash of the name); "train" otherwise. graph_policy.py trains on
//   "train" (GRAPH_HUMAN_LABELS) and measures agreement on "test", and keeps every test puzzle's
//   other copies (the solver-labelled ones) out of training.
// - solverFinished: whether our solver finished the puzzle: the human corpus run (human-shard.ts,
//   human-corpus-status.jsonl; a skipped one counts as not run), else a cached run (graph-human.ts's
//   human-cache, janko-order.ts's deduce cache), or null if no run is cached.
//
// → references/ml/graphs-human-labels.jsonl (local only; the puzzles are others')
//
//   DEDUCE_JOBS=2 node puzzles/difficulty/graph-human-labels.ts [--max 15] [--hold 0.15] [--types a,b] [--limit N] [--cap-s 60] [--write]
//
// Each puzzle's record is cached in references/ml/human-labels-cache/ (--write: only write the file).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import type { deduce } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { contentKey, givensOf, specKey } from "./graph-data.ts";
import { JANKO_DIR, JANKO_TYPES, type Janko, READERS, readType, REFS_DIR } from "./janko.ts";
import { JOBS, mapPool } from "./pool.ts";

const argv = process.argv.slice(2);
const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
const MAX = opt("--max", 15), HOLD = opt("--hold", 0.15), MAX_MARKS = 4000, MAX_FILLOMINO = 100, CAP = opt("--cap-s", 60) * 1000;
// the setup children: 3 GB each at most (a puzzle that needs more is left out)
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=3072`.trim();
const ml = `${REFS_DIR}ml/`, cache = `${ml}human-labels-cache/`;
const out = process.env.GRAPH_OUT ?? `${ml}graphs-human-labels.jsonl`;
mkdirSync(cache, { recursive: true });

interface Job { type: string; file: string; name: string }
const keyOf = (spec: GridSpec) => createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 24);
const cacheFile = (job: Job) => `${cache}${createHash("sha256").update(`v2 ${job.name}`).digest("hex").slice(0, 24)}.json`;

/** A label mark: any mark of a yes/no type; of a digit type, a true digit, or a digit of a cell
 *  that holds none (all false). */
function labelMarks(j: Janko): (mark: string) => boolean {
  const filled = new Set<string>();
  for (const [m, v] of j.truth) { const d = /^digit\((\d+),/.exec(m); if (d && v) filled.add(d[1]); }
  return (m) => { const d = /^digit\((\d+),/.exec(m); return !d || j.truth.get(m) === true || !filled.has(d[1]); };
}

/** Our solver's cached outcome on a puzzle: finished, not, or not run. */
/** The human corpus's run (human-shard.ts --gather → human-corpus-status.jsonl): finished or not,
 *  by spec key and by source id ("janko:Akari/001"); a puzzle it skipped counts as not run. */
let corpusStatus: Map<string, boolean> | undefined;
function corpusFinished(key: string): boolean | undefined {
  if (!corpusStatus) {
    corpusStatus = new Map();
    const f = `${ml}human-corpus-status.jsonl`;
    if (existsSync(f)) for (const l of readFileSync(f, "utf8").split("\n")) {
      if (!l.trim()) continue;
      const d = JSON.parse(l);
      if (typeof d.solverFinished !== "boolean" || d.why?.startsWith("skipped") || d.why === "over max side") continue;
      for (const k of [...(d.specKeys ?? [d.key]), ...(d.ids ?? [])]) corpusStatus.set(k, d.solverFinished);
    }
  }
  return corpusStatus.get(key);
}
function solverFinished(spec: GridSpec): boolean | null {
  const c = corpusFinished(specKey(spec));
  if (c !== undefined) return c;
  const human = `${ml}human-cache/${keyOf(spec)}.json`;
  if (existsSync(human)) return readFileSync(human, "utf8").trim() !== "null";
  const k = createHash("sha256").update(JSON.stringify([spec, process.env.DEDUCE_LEMMAS ?? "", process.env.DEDUCE_PRICES ?? ""])).digest("hex").slice(0, 24);
  const janko = `${JANKO_DIR}deduce/${k}.json`;
  if (existsSync(janko)) { const r = JSON.parse(readFileSync(janko, "utf8")); return !!r?.profile?.solved; }
  return null;
}

/** janko-check.ts's verdicts that aren't "one solution, Janko's" (none, several, timeout: in
 *  check-<type>.json, if it was run); a puzzle not one solution under our rules is left out (a
 *  timeout isn't: Janko's solution passes our rules, uniqueness unproved). */
const checks = new Map<string, Map<string, string>>();
function checked(type: string): Map<string, string> {
  if (!checks.has(type)) {
    const f = `${JANKO_DIR}check-${type}.json`;
    checks.set(type, new Map(existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")).bad as { f: string; v: string }[]).map((b) => [b.f, b.v]) : []));
  }
  return checks.get(type)!;
}

type Skip = { skip: string };
/** One puzzle's record, or why it has none. */
async function build(job: Job): Promise<object | Skip> {
  const j = READERS[job.type](job.file);
  if (!j) return { skip: "doesn't convert" };
  const verdict = checked(job.type).get(job.file.split("/").pop()!);
  if (verdict && verdict !== "timeout") return { skip: `janko-check: ${verdict}` };
  const [rows, cols] = j.spec.size;
  if (rows > MAX || cols > MAX) return { skip: "too big" };
  if (!j.moves) return { skip: "no moves" };
  const isLabel = labelMarks(j);
  const truths = [...j.truth].filter(([m, v]) => v && isLabel(m)).map(([m]) => m);
  if (truths.filter((m) => j.settled.has(m)).length < 0.6 * truths.length) return { skip: "under 60% settled" };
  if (j.spec.genre === "hidoku" && (rows * cols) ** 2 > MAX_MARKS) return { skip: "too many marks" };
  // grounding Fillomino's sizes takes about 12 s and 2.3 GB at 10 × 10, and more past it
  if (j.spec.genre === "fillomino" && rows * cols > MAX_FILLOMINO) return { skip: "Fillomino over 100 cells" };
  const answer = [...j.truth].filter(([, v]) => v).map(([m]) => m);
  // each in its own process, killed at the cap (grounding a big Fillomino can take minutes and
  // gigabytes), its memory capped (NODE_OPTIONS, set below)
  let r: Awaited<ReturnType<typeof deduce>> | null;
  try { r = await deduceGuarded(j.spec, { setupOnly: true, answer }, CAP); }
  catch (e) { return { skip: `setup: ${(e as Error).message.slice(0, 80)}` }; }
  if (!r) return { skip: "setup over the cap" };
  const st = r.structure!;
  if (st.marks.length > MAX_MARKS) return { skip: "too many marks" };
  const marks = new Set(st.marks.map((m) => m.name));
  const known = new Set((r.initial ?? []).map((f) => f.slice(0, f.lastIndexOf("="))));
  // every mark must be one Janko's solution decides
  const undecided = st.marks.filter((m) => !j.truth.has(m.name)).length;
  if (undecided) return { skip: "marks not in the solution" };
  // the person's moves that settled marks still open at the start, in order
  const byMove = new Map<number, string[]>();
  for (const [m, k] of j.settled) if (marks.has(m) && !known.has(m)) byMove.set(k, [...(byMove.get(k) ?? []), m]);
  const moves = [...byMove.keys()].sort((a, b) => a - b);
  const humanOrder: [string, number][] = moves.flatMap((k) => byMove.get(k)!.filter(isLabel).map((m): [string, number] => [m, k]));
  if (!humanOrder.length) return { skip: "no labels" };
  // rounds past the last label give no state with a label still to come
  const last = humanOrder[humanOrder.length - 1][1];
  const rounds = moves.filter((k) => k <= last).map((k) => ({ facts: byMove.get(k)!.map((m) => [m, j.truth.get(m)!, "human", 0]) }));
  const open = st.marks.length - known.size;
  return {
    source: "janko", genre: j.spec.genre, name: job.name, solver: j.solver, author: j.author, labels: "human",
    structure: st, givens: givensOf(j.spec), initial: r.initial, answer: r.answer, rounds, humanOrder,
    coverage: +(moves.reduce((a, k) => a + byMove.get(k)!.length, 0) / (open || 1)).toFixed(3), solverFinished: solverFinished(j.spec),
  };
}

const types = argv.includes("--types") ? argv[argv.indexOf("--types") + 1].split(",") : Object.keys(JANKO_TYPES);
const jobs: Job[] = [];
for (const type of types) {
  const dir = `${JANKO_DIR}${JANKO_TYPES[type].folder}/`;
  for (const { f } of readType(type)) jobs.push({ type, file: dir + f, name: `janko ${JANKO_TYPES[type].folder}/${f}` });
}
if (argv.includes("--limit")) jobs.splice(opt("--limit", jobs.length));

if (!argv.includes("--write")) {
  const todo = jobs.filter((job) => !existsSync(cacheFile(job)));
  console.error(`${jobs.length} puzzles, ${todo.length} to build, ${JOBS} at a time`);
  let done = 0;
  const t0 = Date.now();
  await mapPool(todo, async (job) => {
    writeFileSync(cacheFile(job), JSON.stringify(await build(job)));
    if (++done % 200 === 0) console.error(`${done}/${todo.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  });
}

// the human test set's names: their puzzles are on the test side here too
const testFile = `${ml}graphs-human.jsonl`;
const testNames = new Set<string>();
if (existsSync(testFile)) for (const l of readFileSync(testFile, "utf8").split("\n")) if (l.trim()) testNames.add(JSON.parse(l).name);
const draw = (name: string) => parseInt(createHash("md5").update(`human-labels:${name}`).digest("hex").slice(0, 12), 16) / 16 ** 12;

const lines: string[] = [], skips = new Map<string, Map<string, number>>();
const tally = new Map<string, { train: number; test: number; states: number; finished: number; unfinished: number; unknown: number }>();
const seen = new Set<string>();
for (const job of jobs) {
  const f = cacheFile(job);
  if (!existsSync(f)) continue;
  const r = JSON.parse(readFileSync(f, "utf8"));
  const genre = READERS[job.type] ? JANKO_TYPES[job.type].genre : job.type;
  if (r.skip) { const s = skips.get(genre) ?? new Map(); s.set(r.skip, (s.get(r.skip) ?? 0) + 1); skips.set(genre, s); continue; }
  // the same puzzle twice in Janko's files: kept once
  const key = contentKey(r);
  if (seen.has(key)) { const s = skips.get(genre) ?? new Map(); s.set("twice", (s.get("twice") ?? 0) + 1); skips.set(genre, s); continue; }
  seen.add(key);
  const split = testNames.has(r.name) || draw(r.name) < HOLD ? "test" : "train";
  // the corpus run's verdict, by the puzzle's Janko id, over the one cached with the record
  const m = /^janko (.+)\.txt$/.exec(r.name), c = m ? corpusFinished(`janko:${m[1]}`) : undefined;
  if (c !== undefined) r.solverFinished = c;
  lines.push(JSON.stringify({ ...r, split }));
  const t = tally.get(genre) ?? { train: 0, test: 0, states: 0, finished: 0, unfinished: 0, unknown: 0 };
  t[split]++; t.states += r.rounds.length;
  if (r.solverFinished === true) t.finished++; else if (r.solverFinished === false) t.unfinished++; else t.unknown++;
  tally.set(genre, t);
}
writeFileSync(out, lines.join("\n") + (lines.length ? "\n" : ""));
const sum = (k: "train" | "test" | "states" | "finished" | "unfinished" | "unknown") => [...tally.values()].reduce((a, t) => a + t[k], 0);
console.log("| Type | Puzzles (train / test) | States | Our solver finished it / didn't / not run |\n|---|---|---|---|");
for (const [g, t] of [...tally].sort()) console.log(`| ${g} | ${t.train + t.test} (${t.train} / ${t.test}) | ${t.states} | ${t.finished} / ${t.unfinished} / ${t.unknown} |`);
console.log(`| all | ${sum("train") + sum("test")} (${sum("train")} / ${sum("test")}) | ${sum("states")} | ${sum("finished")} / ${sum("unfinished")} / ${sum("unknown")} |`);
console.log(`\nleft out: ${[...skips].sort().map(([g, s]) => `${g}: ${[...s].map(([k, n]) => `${k} ${n}`).join(", ")}`).join("; ")}`);
console.log(`${lines.length} puzzles in ${out}`);
