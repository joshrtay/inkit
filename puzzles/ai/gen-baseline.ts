// The generator baseline (docs/plan-generator-and-hints.md, "G0"): our makers and human setters
// measured alike (./gen-eval.ts), and records for the human-likeness classifier
// (puzzles/difficulty/human_gap.py score).
//
//   node --no-warnings puzzles/ai/gen-baseline.ts sample [--genres akari,masyu,star-battle,hitori] [--per 25]
//       human and old-fleet puzzles from references/ml/human-gap/measured.jsonl (already solved for
//       the classifier), and this week's AI posts (archive/ai-week/<dir>: --week), written to
//       references/ml/gen-baseline/sample.jsonl
//   node --no-warnings puzzles/ai/gen-baseline.ts run --shard 0/4
//       evaluates each sampled puzzle (cached by spec in references/ml/gen-baseline/cache/), so four
//       shards can run side by side and a rerun picks up where one stopped
//   node --no-warnings puzzles/ai/gen-baseline.ts one <key>
//       one puzzle (run each under `timeout`, as `run` can stall on a big human puzzle)
//   node --no-warnings puzzles/ai/gen-baseline.ts add <file.jsonl> <source>
//       more puzzles to compare (one { spec } per line: the Opus designer's), measured for the
//       classifier too
//   node --no-warnings puzzles/ai/gen-baseline.ts report
//       per maker and type: the measures' medians and shares → references/ml/gen-baseline/report.md
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { evaluate, type Evaluation } from "./gen-eval.ts";

const repo = new URL("../../", import.meta.url).pathname;
const dir = `${repo}references/ml/gen-baseline/`, cache = `${dir}cache/`;
mkdirSync(cache, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const keyOf = (spec: GridSpec) => createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 24);
const readJsonl = (f: string) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

interface Item { source: string; genre: string; name: string; spec: GridSpec; key: string }
const sampleFile = `${dir}sample.jsonl`;

if (argv[0] === "sample") {
  const genres = new Set(arg("genres", "akari,masyu,star-battle,hitori")!.split(","));
  const per = Number(arg("per", "25"));
  const items: Item[] = [];
  const by = new Map<string, Item[]>();
  for (const r of readJsonl(`${repo}references/ml/human-gap/measured.jsonl`)) {
    if (!genres.has(r.genre) || !r.solved) continue;
    const source = r.source === "gen" ? "fleet" : "human";
    const k = `${r.genre}/${source}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push({ source, genre: r.genre, name: r.name ?? r.key ?? "", spec: r.spec, key: keyOf(r.spec) });
  }
  for (const xs of by.values()) for (let i = 0; i < Math.min(per, xs.length); i++) items.push(xs[Math.floor((i * xs.length) / Math.min(per, xs.length))]);
  const week = arg("week", "archive/ai-week/baseline-2026-11-01")!;
  for (const f of existsSync(`${repo}${week}`) ? readdirSync(`${repo}${week}`).filter((x) => x.endsWith(".json")) : []) {
    const d = JSON.parse(readFileSync(`${repo}${week}/${f}`, "utf8"));
    const [genre, body] = [d.sketch.split("\n")[0], d.sketch.slice(d.sketch.indexOf("\n") + 1)];
    const spec = { genre, ...JSON.parse(body) } as GridSpec;
    items.push({ source: "posts", genre, name: f, spec, key: keyOf(spec) });
  }
  writeFileSync(sampleFile, items.map((x) => JSON.stringify(x)).join("\n") + "\n");
  const n: Record<string, number> = {};
  for (const x of items) n[x.source] = (n[x.source] ?? 0) + 1;
  console.log(`${items.length} puzzles: ${JSON.stringify(n)} → ${sampleFile}`);
} else if (argv[0] === "add") {
  const [file, source] = [argv[1], argv[2]];
  const items = readJsonl(file).map((r: { spec: GridSpec; name?: string }, i: number) => ({ source, genre: r.spec.genre!, name: r.name ?? `${source}-${i}`, spec: r.spec, key: keyOf(r.spec) }));
  const had = existsSync(sampleFile) ? readJsonl(sampleFile) as Item[] : [];
  const keys = new Set(had.map((x) => x.key));
  writeFileSync(sampleFile, [...had, ...items.filter((x: Item) => !keys.has(x.key))].map((x) => JSON.stringify(x)).join("\n") + "\n");
  console.log(`${items.length} added from ${file} as ${source}`);
} else if (argv[0] === "run" || argv[0] === "one") {
  // one: a single puzzle by key (a shell runs each under a time limit: see the timeout note in the report)
  const [k, n] = arg("shard", "0/1")!.split("/").map(Number);
  const items = (readJsonl(sampleFile) as Item[]).filter((x, i) => (argv[0] === "one" ? x.key === argv[1] : i % n === k));
  const { measure } = await import("../difficulty/human-gap.ts");
  for (const it of items) {
    const f = `${cache}${it.key}.json`;
    if (existsSync(f)) continue;
    const t0 = Date.now();
    const ev: Evaluation | { error: string } = await evaluate(it.spec).catch((e) => ({ error: String(e?.message ?? e).slice(0, 200) }));
    // the classifier's record (posts and new makers only: the human and fleet ones are measured already)
    const gap = it.source === "human" || it.source === "fleet" ? null : await measure(it.spec).catch(() => null);
    writeFileSync(f, JSON.stringify({ ...it, ev, gap }));
    console.log(`${it.source.padEnd(6)} ${it.genre.padEnd(12)} ${it.name.slice(0, 30).padEnd(30)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} else if (argv[0] === "report") {
  const rows = readdirSync(cache).map((f) => JSON.parse(readFileSync(`${cache}${f}`, "utf8")));
  const med = (xs: number[]) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const share = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : NaN);
  const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
  const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "–");
  const groups = new Map<string, typeof rows>();
  for (const r of rows) { const g = `${r.genre}|${r.source}`; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(r); }
  const lines = ["| type | maker | n | cells | clue density | symmetric | unique | quality | dull | guessing | grind | estimate | stuck points | first stuck at | distinct rules | finished |", "|" + "---|".repeat(16)];
  for (const [g, rs] of [...groups].sort()) {
    const [genre, source] = g.split("|");
    const ok = rs.filter((r) => r.ev && !r.ev.error);
    const a = ok.filter((r) => r.ev.assess), s = ok.filter((r) => r.ev.stuck);
    const flag = (name: string) => share(a.map((r) => r.ev.assess.flags.some((x: string) => x.startsWith(name))));
    lines.push(`| ${genre} | ${source} | ${rs.length} | ${med(ok.map((r) => r.ev.looks.cells))} | ${f2(med(ok.map((r) => r.ev.looks.density)))} | ${pct(share(ok.map((r) => r.ev.looks.exact === 1)))} | ${pct(share(ok.map((r) => r.ev.unique)))} | ${f2(med(a.map((r) => r.ev.assess.quality)))} | ${pct(flag("dull"))} | ${pct(flag("guessing"))} | ${pct(flag("grind"))} | ${f2(med(a.map((r) => r.ev.assess.estimate)))} | ${med(s.map((r) => r.ev.stuck.points))} | ${f2(med(s.map((r) => r.ev.stuck.firstAt ?? NaN)))} | ${med(s.map((r) => r.ev.stuck.techniques))} | ${pct(share(s.map((r) => r.ev.stuck.solved)))} |`);
  }
  // the classifier's records: the new makers' puzzles, as gen-set.ts lines
  const recs = rows.filter((r) => r.gap && !r.gap.error && r.gap.band).map((r) => ({ ...r.gap, key: r.key, genre: r.genre, spec: r.spec, source: r.source }));
  writeFileSync(`${dir}records.jsonl`, recs.map((x) => JSON.stringify(x)).join("\n") + "\n");
  writeFileSync(`${dir}report.md`, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  console.log(`\n${recs.length} records for human_gap.py score → ${dir}records.jsonl`);
}
