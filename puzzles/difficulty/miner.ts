// The technique-mining harness, phase A: no model, just the proposal language (deduce.ts's
// FamilySpec) searched systematically. A stuck set (corpus puzzles where the solver needs a case
// split or search) is solved with each candidate window family added; a family is worth keeping
// when it removes searches across types at an affordable time. Windows only gather constraints
// that hold, so every fact a family finds is sound: the harness measures usefulness only.
// Phase B (later, with a budget) asks Opus for families and relations the language lacks.
//
//   node puzzles/difficulty/miner.ts stuck [perSource]   build references/ml/stuck-set.json
//   node puzzles/difficulty/miner.ts search [maxArity]   try every family; rank them
//   node puzzles/difficulty/miner.ts try '<json spec>'   one family, per type
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { corpus } from "./corpus.ts";
import type { FamilySpec } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
export const stuckFile = `${repo}references/ml/stuck-set.json`;
export type Stuck = { genre: string; name: string; spec: GridSpec; search: number; estimate: number; ms: number };
type Run = { search: number; estimate: number; ms: number; solved: boolean };

export async function solve(spec: GridSpec, families: FamilySpec[] = []): Promise<Run | null> {
  const t0 = Date.now();
  const r = await deduceGuarded(spec, { budgetMs: 20000, families }, 90000).catch(() => null);
  if (!r) return null;
  return { search: r.profile.perTier[2] + r.profile.perTier[3], estimate: r.profile.estimate, ms: Date.now() - t0, solved: r.profile.solved };
}

/** How a family does on the stuck set: searches removed, puzzles helped, time, per type. */
export async function measure(set: Stuck[], f: FamilySpec) {
  const runs = await mapPool(set, (s) => solve(s.spec, [f]));
  const byType = new Map<string, { before: number; after: number; helped: number; ms0: number; ms1: number }>();
  set.forEach((s, i) => {
    const r = runs[i];
    if (!r) return;
    const t = byType.get(s.genre) ?? { before: 0, after: 0, helped: 0, ms0: 0, ms1: 0 };
    t.before += s.search; t.after += r.search; if (r.search < s.search) t.helped++; t.ms0 += s.ms; t.ms1 += r.ms;
    byType.set(s.genre, t);
  });
  const all = [...byType.values()].reduce((a, t) => ({ before: a.before + t.before, after: a.after + t.after, helped: a.helped + t.helped, ms0: a.ms0 + t.ms0, ms1: a.ms1 + t.ms1 }), { before: 0, after: 0, helped: 0, ms0: 0, ms1: 0 });
  return { all, byType };
}

export const name = (f: FamilySpec) => `${f.units.join(" + ")} (${f.relation})`;
// run as a script only (miner-propose.ts imports the pieces above)
const mode = import.meta.url === `file://${process.argv[1]}` ? process.argv[2] : "";

if (mode === "stuck") {
  const items = corpus(Number(process.argv[3]) || 12).filter((x) => x.spec.size[0] <= 12);
  let done = 0;
  const runs = await mapPool(items, async (it) => { const r = await solve(it.spec); if (++done % 50 === 0) console.error(`${done}/${items.length}`); return r; });
  const set: Stuck[] = items.flatMap((it, i) => (runs[i] && runs[i]!.solved && runs[i]!.search > 0 ? [{ genre: it.genre, name: it.name, spec: it.spec, ...runs[i]! }] : []));
  writeFileSync(stuckFile, JSON.stringify(set));
  const by = new Map<string, number>();
  for (const s of set) by.set(s.genre, (by.get(s.genre) ?? 0) + 1);
  console.log(`${set.length} stuck puzzles (of ${items.length}): ${[...by].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(", ")}`);
} else if (mode === "search" || mode === "try") {
  if (!existsSync(stuckFile)) throw new Error("build the stuck set first: miner.ts stuck");
  const set = JSON.parse(readFileSync(stuckFile, "utf8")) as Stuck[];
  const kinds = ["line", "region", "block", "clue"], relations: FamilySpec["relation"][] = ["pivot", "pairwise", "touch"];
  const families: FamilySpec[] = mode === "try" ? [JSON.parse(process.argv[3])] : [];
  if (mode === "search") {
    const maxArity = Number(process.argv[3]) || 3;
    const seen = new Set<string>();
    const add = (units: string[], relation: FamilySpec["relation"]) => {
      // pairwise and touch don't depend on order; pivot only on which unit is last
      const key = relation === "pivot" ? `${[...units.slice(0, -1)].sort().join("+")}|${units.at(-1)}|pivot` : `${[...units].sort().join("+")}|${relation}`;
      if (!seen.has(key)) { seen.add(key); families.push({ units, relation }); }
    };
    for (let n = 2; n <= maxArity; n++) {
      const rec = (prefix: string[]) => { if (prefix.length === n) { for (const r of relations) add(prefix, r); return; } for (const k of kinds) rec([...prefix, k]); };
      rec([]);
    }
  }
  const before = set.reduce((a, s) => a + s.search, 0);
  console.log(`${set.length} stuck puzzles, ${before} searches; ${families.length} families to try\n`);
  const rows: { f: FamilySpec; removed: number; helped: number; time: number }[] = [];
  for (const [k, f] of families.entries()) {
    const { all, byType } = await measure(set, f);
    const row = { f, removed: all.before - all.after, helped: all.helped, time: all.ms1 / Math.max(1, all.ms0) };
    rows.push(row);
    console.error(`${k + 1}/${families.length} ${name(f)}: ${row.removed} searches removed, ${row.helped} puzzles helped, time ×${row.time.toFixed(2)}`);
    if (mode === "try") for (const [g, t] of [...byType].sort((a, b) => (b[1].before - b[1].after) - (a[1].before - a[1].after))) console.log(`  ${g}: ${t.before} → ${t.after} searches, ${t.helped} helped, time ×${(t.ms1 / Math.max(1, t.ms0)).toFixed(2)}`);
  }
  rows.sort((a, b) => b.removed - a.removed);
  console.log("| Family | Searches removed | Puzzles helped | Time |\n|---|---|---|---|");
  for (const r of rows.slice(0, 25)) console.log(`| ${name(r.f)} | ${r.removed} of ${before} | ${r.helped} | ×${r.time.toFixed(2)} |`);
  writeFileSync(`${repo}references/ml/miner-results.json`, JSON.stringify(rows, null, 1));
}
