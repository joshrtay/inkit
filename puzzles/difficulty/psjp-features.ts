// The solver's readouts on a sample of Puzzle Square JP's rated puzzles of one type, for asking what
// it misprices (Masyu first: raters agree at 0.76 there and our best score is 0.53; review-ideas
// write-up, idea 2). One row a puzzle: the rating, size and clue counts, the profile (estimate,
// steps, costs, tiers) and each step's cost, tier and rule kinds, at 60 s (sim-difficulty.ts's
// solver budget). The sample is spread over the ratings, optionally at one grid size, so size can't
// carry the result. The analysis is psjp_features.py.
//
//   DEDUCE_JOBS=3 node --no-warnings puzzles/difficulty/psjp-features.ts <psjp-full/converted/<type>.jsonl> <out.jsonl> [--size 10x10] [--per 80 | --sample 250 [--skip 250]]
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";

const argv = process.argv.slice(2), opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const [src, out] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const size = opt("size"), per = Number(opt("per") ?? 80);
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };
const jsonl = (f: string): any[] => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];

const done = new Set(jsonl(out).map((r) => r.id));
const rated = jsonl(src).filter((d) => d.meta?.difficulty != null && !d.meta.variation && (!size || `${d.spec.size[0]}x${d.spec.size[1]}` === size));
// per rating, a hashed (so repeatable) draw of up to `per`
const byRating = new Map<number, any[]>();
for (const d of rated) byRating.set(d.meta.difficulty, [...(byRating.get(d.meta.difficulty) ?? []), d]);
// or --sample n: a hashed draw of n from all of them, at the ratings' own mix (--skip m: after the
// first m of that draw, for a fresh test set)
const sample = Number(opt("sample") ?? 0), skip = Number(opt("skip") ?? 0);
const todo = (sample ? [...rated].sort((a, b) => hash(a.sourceId) - hash(b.sourceId)).slice(skip, skip + sample)
  : [...byRating.values()].flatMap((ds) => ds.sort((a, b) => hash(a.sourceId) - hash(b.sourceId)).slice(0, per))).filter((d) => !done.has(d.sourceId));
console.error(`${todo.length} puzzles (${[...byRating].map(([r, ds]) => `${r}: ${Math.min(per, ds.length)}`).join(", ")})`);

let n = 0;
await mapPool(todo, async (d) => {
  const spec: GridSpec = { ...d.spec, genre: d.spec.genre ?? d.genre }, t0 = Date.now();
  const clues: Record<string, number> = {};
  for (const g of (spec.givens ?? []) as { kind: string; value?: unknown }[]) { const k = `${g.kind}${typeof g.value === "string" ? `:${g.value}` : ""}`; clues[k] = (clues[k] ?? 0) + 1; }
  const row: Record<string, unknown> = { id: d.sourceId, rating: d.meta.difficulty, answered: d.meta.answered_n, favorite: d.meta.favorite_n, rows: spec.size[0], cols: spec.size[1], clues };
  try {
    const r = await deduceGuarded(spec, { budgetMs: 60000 }, 120000);
    if (!r) row.cap = 1;
    else {
      const { ruleItems: _r, ...profile } = r.profile;
      row.profile = profile;
      // each step: cost, tier, how many facts, the rule kinds it uses
      row.steps = r.path.filter((s) => !s.choice).map((s) => [Math.round(s.cost * 100) / 100, s.tier, s.facts.length, s.uses.join("+")]);
    }
  } catch (e) { row.error = (e as Error).message.slice(0, 200); }
  appendFileSync(out, JSON.stringify({ ...row, ms: Date.now() - t0 }) + "\n");
  console.error(`${++n}/${todo.length} ${d.sourceId} r${d.meta.difficulty} ${(row.profile as any)?.estimate ?? row.error ?? "cap"} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
});
