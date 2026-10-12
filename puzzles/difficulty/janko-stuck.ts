// What do people do where our solver gets stuck? For each of Janko's Star Battles (local only):
// the first moment our solver needed a case split or search, what it knew then, the fact it
// searched for, and the person's next moves from there (of the cells still open, the ones they
// settled earliest). Saved for study in references/janko/stuck-star-battle.json.
//
//   node puzzles/difficulty/janko-stuck.ts [maxSize]
import { readdirSync, writeFileSync } from "node:fs";
import { deduceGuarded } from "./deduce-guarded.ts";
import { readStarBattle } from "./janko.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const dir = `${repo}references/janko/Sternenschlacht/`;
const maxSize = Number(process.argv[2]) || 10;
const puzzles = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()
  .map((f) => ({ f, j: readStarBattle(dir + f) }))
  .filter((x) => x.j && x.j.spec.size[0] <= maxSize && x.j.settled.size > x.j.spec.size[0] ** 2 * 0.6);

const cellOf = (mark: string) => Number(/^shaded\((\d+)\)$/.exec(mark)?.[1] ?? -1);
const rows = await mapPool(puzzles, async ({ f, j }) => {
  const r = await deduceGuarded(j!.spec, { budgetMs: 30000 }, 120000).catch(() => null);
  if (!r || !r.profile.solved) return null;
  const steps = r.path.filter((s) => !s.choice);
  const k = steps.findIndex((s) => s.tier >= 2);
  if (k < 0) return null;
  // what our solver knew just before: cell → star?
  const known = new Map<number, boolean>();
  for (const x of r.initial ?? []) { const m = /^shaded\((\d+)\)=(\w+)$/.exec(x); if (m) known.set(+m[1], m[2] === "true"); }
  for (const s of steps.slice(0, k)) for (const x of s.facts) { const c = cellOf(x.mark); if (c >= 0) known.set(c, x.value); }
  const searched = steps[k].facts.flatMap((x) => (cellOf(x.mark) >= 0 ? [{ cell: cellOf(x.mark), star: x.value }] : []));
  const answer = new Set((r.answer ?? []).map(cellOf).filter((c) => c >= 0));
  const n = j!.spec.size[0];
  const open = [...j!.settled.keys()].filter((c) => !known.has(c)).sort((a, b) => j!.settled.get(a)! - j!.settled.get(b)!);
  const humanNext = open.slice(0, 3).map((c) => ({ cell: c, star: answer.has(c) }));
  const humanRank = (c: number) => open.indexOf(c);
  return {
    f, n, stars: j!.spec.rules!.find((x) => x.rule === "shaded-per-line")!.n, areas: j!.spec.areas, solver: j!.solver, tier: steps[k].tier, where: steps[k].where,
    known: [...known].map(([c, s]) => [c, s ? 1 : 0]), searched, humanNext,
    // where our searched cells sit in the person's order of the open cells (0: their very next)
    searchedRank: searched.map((x) => humanRank(x.cell)),
    open: open.length,
  };
});
const ok = rows.filter((r): r is NonNullable<typeof r> => !!r);
writeFileSync(`${repo}references/janko/stuck-star-battle.json`, JSON.stringify(ok, null, 1));
const ranks = ok.map((r) => Math.min(...r.searchedRank.filter((x) => x >= 0)) / Math.max(1, r.open - 1)).filter(Number.isFinite);
const median = [...ranks].sort((a, b) => a - b)[Math.floor(ranks.length / 2)];
console.log(`${ok.length} puzzles where our solver got stuck (of ${puzzles.length})`);
console.log(`our searched fact among the person's next 3: ${ok.filter((r) => r.searchedRank.some((x) => x >= 0 && x < 3)).length}; its place in the person's order of the open cells: median ${(100 * median).toFixed(0)}% of the way through`);
