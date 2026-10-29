// The reader's ceiling per puzzle type, for the hint ladders' stuck points (stuck.ts): the
// q-quantile of tier 0-1 step costs on the solver's cheapest-first path, as walkthrough-loop.ts's
// calibrate does, over the repo's examples (and any more puzzle files given). Writes ceilings.json.
//
//   node --no-warnings puzzles/hints/ceilings.ts [--q 0.6] [more/*.json …]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduce } from "../difficulty/deduce.ts";

const argv = process.argv.slice(2), qi = argv.indexOf("--q"), q = qi >= 0 ? Number(argv[qi + 1]) : 0.6;
const extra = argv.filter((a, i) => a.endsWith(".json") && i !== qi + 1);
const root = new URL("../../src/games/", import.meta.url);
const files = [...readdirSync(root).flatMap((t) => readdirSync(new URL(`${t}/`, root)).filter((f) => f.endsWith(".json")).sort().slice(0, 3).map((f) => new URL(`${t}/${f}`, root).pathname)), ...extra];
const costs = new Map<string, number[]>();
for (const f of files) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  if (!d.grid || d.grid.figure) continue;
  const spec: GridSpec = { ...d.grid, genre: d.grid.genre ?? f.split("/").at(-2) };
  const r = await deduce(spec, { finish: true, budgetMs: 60_000 }).catch(() => null);
  if (!r) continue;
  costs.set(spec.genre!, [...(costs.get(spec.genre!) ?? []), ...r.path.filter((s) => s.tier <= 1).map((s) => s.cost)]);
}
const ceilings: Record<string, number> = {};
for (const [genre, cs] of [...costs].sort()) {
  cs.sort((a, b) => a - b);
  if (cs.length >= 10) ceilings[genre] = Number(cs[Math.min(cs.length - 1, Math.floor(q * cs.length))].toFixed(2));
  console.error(`${genre}: ${ceilings[genre] ?? "(too few steps)"} from ${cs.length} steps`);
}
writeFileSync(new URL("./ceilings.json", import.meta.url), JSON.stringify({ q, puzzles: files.length, ceilings }, null, 1) + "\n");
