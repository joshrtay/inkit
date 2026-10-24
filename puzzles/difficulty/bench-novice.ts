// The solver's estimate for the whole-solve benchmark's puzzles (bench-solve.ts: 63 Thinky Dailies
// and 70 puzz.link), so weak models' solve rates can be set beside it as a novice difficulty proxy
// (research review 2026-10-24, idea 6; the analysis is bench_novice.py). One row a puzzle: the
// estimate and whether the solve finished (deduce.ts at 60 s, as sim-difficulty.ts's solver).
//
//   DEDUCE_JOBS=3 node --no-warnings puzzles/difficulty/bench-novice.ts <whole-solves.jsonl> <thinky converted.jsonl> <puzz.link rows.jsonl> <out.jsonl>
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";

const [runs, thinky, puzzlink, out] = process.argv.slice(2);
const jsonl = (f: string): any[] => readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const specs = new Map<string, GridSpec>();
for (const d of jsonl(thinky)) if (d.spec) specs.set(`thinky-${d.slug}`, d.spec);
for (const d of jsonl(puzzlink)) specs.set(`puzzlink-${d.genre}-${d.sourceId}`, { ...d.spec, genre: d.spec.genre ?? d.genre });
const done = new Set(existsSync(out) ? jsonl(out).map((r) => r.id) : []);
const ids = [...new Set(jsonl(runs).map((r) => r.id as string))].filter((id) => !done.has(id));
console.error(`${ids.length} puzzles to solve (${ids.filter((id) => !specs.has(id)).length} without a spec)`);
let n = 0;
await mapPool(ids, async (id) => {
  const spec = specs.get(id), t0 = Date.now();
  let row: Record<string, unknown> = { id };
  if (!spec) row.error = "no spec";
  else {
    try {
      const r = await deduceGuarded(spec, { budgetMs: 60000 }, 120000);
      row = r ? { id, estimate: r.profile.estimate, solved: r.profile.solved, steps: r.profile.steps, maxCost: r.profile.maxCost, cells: spec.size[0] * spec.size[1] } : { id, cap: 1, cells: spec.size[0] * spec.size[1] };
    } catch (e) { row.error = (e as Error).message.slice(0, 200); }
  }
  appendFileSync(out, JSON.stringify({ ...row, ms: Date.now() - t0 }) + "\n");
  console.error(`${++n}/${ids.length} ${id} ${row.estimate ?? row.error ?? "cap"}`);
});
