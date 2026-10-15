// The human corpus solved (human-corpus.ts → references/ml/human-corpus/): for each puzzle, a
// uniqueness check (the engine's solver, clingo: exactly one solution?) and, unless it has none or
// several, our deduction solver's solve as a graph record (graph-human.ts --train's logic: deduce
// with structure, 30 s budget, killed at 2 minutes). One shard of N at a time, by a hash of the
// puzzle's key, so N cloud VMs each take one (puzzles/cloud/human-job.sh); --gather merges the
// shards' caches into the training file. Local only (the puzzles are others').
//
//   DEDUCE_JOBS=2 node puzzles/difficulty/human-shard.ts [--shard k --of N] [--max-side 20] [--limit N] [--sample K] [--no-skip]
//   node puzzles/difficulty/human-shard.ts --gather [cache dir ...]
//
// - Each puzzle's outcome is cached in references/ml/human-corpus-cache/<key>.json (HUMAN_CACHE):
//   { key, genre, side, unique: "unique" | "none" | "several" | "timeout" | "skipped" | "error", uniqueMs,
//   finished, deduceMs, why?, estimate?, record? }. A rerun skips what's cached.
// - Over --max-side (20): uniqueness only; no solve (solverFinished false, why "over max side").
// - Caps: clingo's uniqueness solve UNIQUE_CAP_S (60 s) in its own process; deduce's budget
//   DEDUCE_BUDGET_S (30 s, checked between rounds) and its process killed at DEDUCE_CAP_S (120 s,
//   since one round's clingo call can't be interrupted).
// - A genre and size band that mostly hits the caps is skipped after 10 tries (the solve when under
//   20% finished, the uniqueness check, "skipped", when over 60% timed out); --no-skip tries all.
// - --sample K: K puzzles per genre and size band (≤ 10, ≤ 15, ≤ 20, > 20), for timing; prints
//   CPU-seconds per puzzle by outcome.
// - --gather: every cache dir given (default the local one) → references/ml/graphs-human-train.jsonl
//   (GRAPH_OUT): one record per distinct puzzle (contentKey, which with the solution confirms
//   specKey's merge) that is unique and finished, with the corpus's sources, ids, labels, authors
//   and setters; the test sets' puzzles left out by content too. Also human-corpus-status.jsonl
//   (every corpus puzzle: unique, solverFinished, estimate, labels; no graph) and
//   human-corpus-solved.md (counts by genre; the sources' difficulties against ours).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { GridSpec } from "../../src/engine/types.ts";

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === "--child-unique") {
  // one uniqueness solve, in its own process: "unique", "none" or "several"
  const { makePuzzle } = await import("../../src/engine/puzzle.ts");
  const { solve } = await import("../../src/engine/solve.ts");
  let input = "";
  process.stdin.on("data", (d) => { input += d; });
  process.stdin.on("end", async () => {
    try { const boards = await solve(makePuzzle(JSON.parse(input)), 2); process.stdout.write(boards.length === 0 ? "none" : boards.length > 1 ? "several" : "unique"); }
    catch (e) { process.stdout.write(`error: ${String((e as Error).message ?? e).replace(/\s+/g, " ").slice(-160)}`); }
  });
} else await main();

async function main() {
  const { deduceGuarded } = await import("./deduce-guarded.ts");
  const { spearman } = await import("./calibrate.ts");
  const { contentKey, graphRecord } = await import("./graph-data.ts");
  const { REFS_DIR } = await import("./janko.ts");
  const { JOBS, mapPool } = await import("./pool.ts");
  const argv = process.argv.slice(2);
  const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
  const ml = `${REFS_DIR}ml/`, corpusDir = process.env.HUMAN_CORPUS ?? `${ml}human-corpus/`;
  const cache = process.env.HUMAN_CACHE ?? `${ml}human-corpus-cache/`;
  mkdirSync(cache, { recursive: true });
  const MAX_SIDE = opt("--max-side", 20);
  const UNIQUE_CAP = Number(process.env.UNIQUE_CAP_S ?? 60) * 1000;
  const BUDGET = Number(process.env.DEDUCE_BUDGET_S ?? 30) * 1000, CAP = Number(process.env.DEDUCE_CAP_S ?? 120) * 1000;

  const corpus: any[] = [];
  for (const f of readdirSync(corpusDir).filter((x) => x.endsWith(".jsonl")).sort())
    for (const l of readFileSync(`${corpusDir}${f}`, "utf8").split("\n")) if (l.trim()) corpus.push(JSON.parse(l));
  const side = (r: any) => Math.max(...r.spec.size);
  const band = (s: number) => (s <= 10 ? "≤ 10" : s <= 15 ? "≤ 15" : s <= 20 ? "≤ 20" : "> 20");

  if (argv.includes("--gather")) return gather(corpus, argv.slice(argv.indexOf("--gather") + 1).filter((a) => !a.startsWith("--")));

  // ---- this shard's puzzles, small boards first, round robin over genres
  const N = opt("--of", 1), K = opt("--shard", 0);
  let mine = corpus.filter((r) => parseInt(r.key.slice(0, 8), 16) % N === K);
  if (argv.includes("--sample")) {
    const per = opt("--sample", 1), seen = new Map<string, number>();
    mine = mine.filter((r) => { const b = `${r.genre} ${band(side(r))}`; const k = seen.get(b) ?? 0; seen.set(b, k + 1); return k < per; });
  }
  const byGenre = new Map<string, any[]>();
  for (const r of mine) { const l = byGenre.get(r.genre) ?? []; l.push(r); byGenre.set(r.genre, l); }
  for (const l of byGenre.values()) l.sort((a, b) => side(a) - side(b) || a.key.localeCompare(b.key));
  const order: any[] = [];
  for (let k = 0; [...byGenre.values()].some((l) => k < l.length); k++) for (const l of byGenre.values()) if (k < l.length) order.push(l[k]);
  if (argv.includes("--limit")) order.splice(opt("--limit", order.length));
  const todo = order.filter((r) => !existsSync(`${cache}${r.key}.json`));
  console.error(`shard ${K} of ${N}: ${order.length} puzzles, ${todo.length} to do, ${JOBS} at a time (max side ${MAX_SIDE}, caps: unique ${UNIQUE_CAP / 1000} s, deduce ${BUDGET / 1000}/${CAP / 1000} s)`);

  const unique = (spec: GridSpec): Promise<string> => new Promise((resolve) => {
    const c = spawn(process.execPath, ["--no-warnings", self, "--child-unique"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { c.kill("SIGKILL"); resolve("timeout"); }, UNIQUE_CAP);
    c.stdout.on("data", (d) => { out += d; });
    c.stderr.on("data", (d) => { err += d; });
    c.on("close", () => { clearTimeout(timer); resolve(out || `error: ${err.trim().split("\n").pop()?.slice(0, 120) ?? "?"}`); });
    c.stdin.end(JSON.stringify(spec));
  });

  // a genre and size band whose puzzles mostly hit the caps (Fillomino's grounding, Hidoku,
  // Numberlink): after SKIP_AFTER tries, the rest of the band is skipped (--no-skip tries them);
  // the solve when under SKIP_FINISHED of those tried finished, the uniqueness check when over
  // SKIP_TIMEOUTS of its checks timed out. Seeded from what's cached (a resumed shard).
  const SKIP_AFTER = 10, SKIP_FINISHED = 0.2, SKIP_TIMEOUTS = 0.6, noSkip = argv.includes("--no-skip");
  const tries = new Map<string, { solved: number; finished: number; checked: number; timeouts: number }>();
  const tryOf = (r: any) => { const b = `${r.genre} ${band(side(r))}`; if (!tries.has(b)) tries.set(b, { solved: 0, finished: 0, checked: 0, timeouts: 0 }); return tries.get(b)!; };
  const count = (r: any, x: any) => {
    const t = tryOf(r);
    if (x.unique === "unique" || x.unique === "timeout" || x.unique === "none" || x.unique === "several") { t.checked++; if (x.unique === "timeout") t.timeouts++; }
    if (x.deduceMs != null) { t.solved++; if (x.finished) t.finished++; }
  };
  for (const r of order) if (existsSync(`${cache}${r.key}.json`)) count(r, JSON.parse(readFileSync(`${cache}${r.key}.json`, "utf8")));

  let done = 0;
  const t0 = Date.now();
  await mapPool(todo, async (r) => {
    const s = side(r), res: any = { key: r.key, genre: r.genre, side: s }, tr = tryOf(r);
    let t = Date.now();
    res.unique = !noSkip && tr.checked >= SKIP_AFTER && tr.timeouts > SKIP_TIMEOUTS * tr.checked ? "skipped" : await unique(r.spec);
    res.uniqueMs = Date.now() - t;
    if (res.unique.startsWith("error")) { res.why = res.unique; res.unique = "error"; }
    res.finished = false;
    if (res.unique === "none" || res.unique === "several" || res.unique === "error") res.why ??= `not one solution (${res.unique})`;
    else if (s > MAX_SIDE) res.why = "over max side";
    else if (!noSkip && tr.solved >= SKIP_AFTER && tr.finished < SKIP_FINISHED * tr.solved) res.why = "skipped: its genre and size rarely finish";
    else {
      t = Date.now();
      const d = await deduceGuarded(r.spec, { budgetMs: BUDGET, structure: true }, CAP).catch((e) => ({ error: String(e.message ?? e).slice(0, 120) }));
      res.deduceMs = Date.now() - t;
      if (d === null) res.why = "deduce over the cap";
      else if ("error" in d) res.why = `deduce: ${d.error}`;
      else {
        res.estimate = d.profile.estimate;
        const rec = graphRecord({ source: r.sources[0], genre: r.genre, name: `human ${r.genre}/${r.key}` }, r.spec, d);
        if (rec) { res.finished = true; res.record = rec; } else res.why = d.profile.solved ? "no structure" : "deduce: unfinished in budget";
      }
    }
    writeFileSync(`${cache}${r.key}.json`, JSON.stringify(res));
    count(r, res);
    if (++done % 100 === 0) console.error(`${done}/${todo.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  });

  // ---- timing: CPU-seconds (wall time per solve) by outcome, genre and band
  const rows = order.map((r) => existsSync(`${cache}${r.key}.json`) ? JSON.parse(readFileSync(`${cache}${r.key}.json`, "utf8")) : null).filter(Boolean);
  const tally = new Map<string, { n: number; ms: number; uniq: number; fin: number; capped: number }>();
  for (const x of rows) for (const k of [`${x.genre} ${band(x.side)}`, `all ${band(x.side)}`, "all"]) {
    const t = tally.get(k) ?? { n: 0, ms: 0, uniq: 0, fin: 0, capped: 0 };
    t.n++; t.ms += x.uniqueMs + (x.deduceMs ?? 0); t.uniq += x.unique === "unique" ? 1 : 0; t.fin += x.finished ? 1 : 0;
    t.capped += x.unique === "timeout" || x.why === "deduce over the cap" || x.why === "deduce: unfinished in budget" ? 1 : 0;
    tally.set(k, t);
  }
  console.log("| Genre, side | Puzzles | s each | Unique | Finished | Hit a cap |\n|---|---|---|---|---|---|");
  for (const [k, t] of [...tally].sort()) console.log(`| ${k} | ${t.n} | ${(t.ms / t.n / 1000).toFixed(1)} | ${t.uniq} | ${t.fin} | ${t.capped} |`);

  // ---- gather: the shards' caches → the training file, the status file, the counts
  function gather(corpus: any[], dirs: string[]) {
    if (!dirs.length) dirs = [cache];
    // corpus puzzles found afterwards not to be human-made (references/ml/human-corpus-generated-keys.json:
    // puzz.link's computer-made puzzles, which the first corpus kept): left out
    const notHuman = `${ml}human-corpus-generated-keys.json`;
    if (existsSync(notHuman)) {
      const drop = new Set<string>(JSON.parse(readFileSync(notHuman, "utf8")));
      const before = corpus.length;
      corpus = corpus.filter((r) => !drop.has(r.key));
      console.error(`${before - corpus.length} corpus puzzles left out as computer-made`);
    }
    const byKey = new Map(corpus.map((r) => [r.key, r]));
    // the test sets by content: graphs-human.jsonl and the labels' test side
    const test = new Set<string>();
    for (const f of [`${ml}graphs-human.jsonl`, `${ml}graphs-human-labels.jsonl`])
      if (existsSync(f)) for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim()) { const d = JSON.parse(l); if (d.split !== "train") test.add(contentKey(d)); }
    const out = process.env.GRAPH_OUT ?? `${ml}graphs-human-train.jsonl`;
    const lines: string[] = [], status: string[] = [], seen = new Map<string, any>();
    const t = new Map<string, Record<string, number>>();
    let leaked = 0, merged = 0;
    const res = new Map<string, any>();
    for (const dir of dirs) for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const x = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      if (byKey.has(x.key)) res.set(x.key, x);
    }
    for (const r of corpus) {
      const x = res.get(r.key);
      const c = t.get(r.genre) ?? { corpus: 0, checked: 0, unique: 0, none: 0, several: 0, timeout: 0, skipped: 0, error: 0, overSide: 0, solveSkipped: 0, finished: 0, train: 0 };
      t.set(r.genre, c); c.corpus++;
      const { spec: _s, humanOrder: _h, ...meta } = r;
      if (!x) { status.push(JSON.stringify({ ...meta, unique: null, solverFinished: null })); continue; }
      c.checked++; c[x.unique]++; if (x.finished) c.finished++; if (x.why === "over max side") c.overSide++; if (x.why?.startsWith("skipped")) c.solveSkipped++;
      status.push(JSON.stringify({ ...meta, unique: x.unique, solverFinished: x.finished, why: x.why, estimate: x.estimate ?? null, uniqueMs: x.uniqueMs, deduceMs: x.deduceMs ?? null }));
      if (!x.finished) continue;
      const key = contentKey({ ...x.record, genre: r.genre });
      if (test.has(key)) { leaked++; continue; }
      const first = seen.get(key);
      if (first) { merged++; first.ids = [...new Set([...first.ids, ...r.ids])]; first.sources = [...new Set([...first.sources, ...r.sources])]; for (const [k, v] of Object.entries(r.labels)) first.sourceLabels[k] ??= v; first.authors = [...new Set([...first.authors, ...r.authors])]; first.setters = [...new Set([...first.setters, ...r.setters])]; continue; }
      const rec = { ...x.record, name: `human ${r.genre}/${r.key}`, source: r.sources[0], genre: r.genre, corpusKey: r.key, sources: r.sources, ids: r.ids, sourceLabels: r.labels, authors: r.authors, setters: r.setters, licences: r.licences, solverFinished: true, ...(r.solver ? { solver: r.solver, ...(r.humanOrder ? { humanOrder: r.humanOrder } : {}) } : {}) };
      seen.set(key, rec); c.train++;
    }
    for (const rec of seen.values()) lines.push(JSON.stringify(rec));
    writeFileSync(out, lines.join("\n") + (lines.length ? "\n" : ""));
    writeFileSync(out.replace(/[^/]*$/, "human-corpus-status.jsonl"), status.join("\n") + "\n");
    const all: Record<string, number> = {};
    for (const c of t.values()) for (const [k, v] of Object.entries(c)) all[k] = (all[k] ?? 0) + v;
    const cols = ["corpus", "checked", "unique", "none", "several", "timeout", "skipped", "error", "overSide", "solveSkipped", "finished", "train"];
    const md = [`# Human corpus solved\n\n${lines.length} training records in ${out}; ${merged} more merged by content (same puzzle, two spec keys); ${leaked} left out as test puzzles by content.\n`,
      `| Genre | ${cols.join(" | ")} |`, `|---|${cols.map(() => "---|").join("")}`,
      ...[...t].sort().map(([g, c]) => `| ${g} | ${cols.map((k) => c[k]).join(" | ")} |`), `| **all** | ${cols.map((k) => all[k]).join(" | ")} |`].join("\n");
    // how the sources' difficulties relate where they overlap, and our solver's estimate (finished
    // puzzles) beside them: Spearman's ρ (n) per genre with 20+ pairs, and overall
    const est = new Map<string, number>();
    for (const r of corpus) { const x = res.get(r.key); if (x?.finished && x.estimate != null) est.set(r.key, x.estimate); }
    const judges: [string, (r: any) => number | null | undefined][] = [
      ["psjp", (r) => r.labels.psjp?.difficulty], ["puzz.link", (r) => r.labels.puzzlink?.difficulty],
      ["lmd", (r) => r.labels.lmd?.difficulty], ["ours", (r) => est.get(r.key)]];
    const pairs: [number, number][] = [[0, 1], [0, 3], [1, 3], [2, 3]];
    const cell = (rs: any[], a: number, b: number) => {
      const xy = rs.map((r) => [judges[a][1](r), judges[b][1](r)]).filter(([x, y]) => x != null && y != null) as [number, number][];
      return xy.length >= 20 ? `${spearman(xy.map((p) => p[0]), xy.map((p) => p[1])).toFixed(2)} (${xy.length})` : xy.length ? `(${xy.length})` : "";
    };
    const genres = [...new Set(corpus.map((r) => r.genre))].sort();
    const cmp = [`\n## Difficulty: the sources against each other and our solver (Spearman ρ, pairs)\n`,
      `| Genre | ${pairs.map(([a, b]) => `${judges[a][0]} ~ ${judges[b][0]}`).join(" | ")} |`, `|---|${pairs.map(() => "---|").join("")}`,
      ...genres.map((g) => { const rs = corpus.filter((r) => r.genre === g); return `| ${g} | ${pairs.map(([a, b]) => cell(rs, a, b)).join(" | ")} |`; }),
      `| **all** | ${pairs.map(([a, b]) => cell(corpus, a, b)).join(" | ")} |`,
      `\nOver all genres the scales mix (each genre's ours is relative to it); the per-genre rows are the fair ones. Their median: ${pairs.map(([a, b]) => { const v = genres.map((g) => cell(corpus.filter((r) => r.genre === g), a, b)).filter((c) => /^-?\d/.test(c)).map((c) => parseFloat(c)).sort((x, y) => x - y); return `${judges[a][0]} ~ ${judges[b][0]} ${v.length ? v[Math.floor(v.length / 2)].toFixed(2) : "–"} (${v.length} genres)`; }).join("; ")}.`].join("\n");
    writeFileSync(out.replace(/[^/]*$/, "human-corpus-solved.md"), md + "\n" + cmp + "\n");
    console.log(md + "\n" + cmp);
  }
}
