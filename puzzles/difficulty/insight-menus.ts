// deduce.ts's menus at insight_grain.py's states (its prep step): for each held-out Janko puzzle,
// at each state, every mark some window decides there, with the cheapest such step's cost and
// stage (0: the smallest windows), and the menu's cheapest cost. Appends; a rerun skips puzzles already done.
//
//   DEDUCE_JOBS=2 node --no-warnings puzzles/difficulty/insight-menus.ts <jobs.jsonl> <menus.jsonl>
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { deduceGuarded } from "./deduce-guarded.ts";
import { JANKO_DIR, JANKO_TYPES, READERS } from "./janko.ts";
import { mapPool } from "./pool.ts";

const [jobsFile, out] = process.argv.slice(2);
const jsonl = (f: string): any[] => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
const done = new Set(jsonl(out).map((r) => r.name));
const jobs = jsonl(jobsFile).filter((j) => !done.has(j.name));
const typeOf = Object.fromEntries(Object.entries(JANKO_TYPES).map(([t, { folder }]) => [folder, t]));
console.error(`${jobs.length} puzzles`);
let n = 0;
await mapPool(jobs, async (j) => {
  const t0 = Date.now(), file = j.name.replace(/^janko /, ""), type = typeOf[file.split("/")[0]];
  let row: Record<string, unknown> = { name: j.name, genre: j.genre };
  try {
    const jk = type ? READERS[type](JANKO_DIR + file) : null;
    if (!jk) row.error = "unreadable";
    else {
      const r = await deduceGuarded({ ...jk.spec, genre: jk.spec.genre ?? j.genre }, { budgetMs: Number(process.env.MENU_BUDGET_MS) || 60000, menus: j.adds }, 2 * (Number(process.env.MENU_BUDGET_MS) || 60000));
      if (!r?.menus) row.cap = 1;
      else row.positions = r.menus.map((menu, i) => {
        const cost: Record<string, [number, number]> = {};
        for (const s of menu) for (const f of s.facts) {
          const c = cost[f.mark];
          if (!c || s.cost < c[0] || (s.cost === c[0] && s.stage < c[1])) cost[f.mark] = [s.cost, s.stage];
        }
        // only the marks that matter here, to keep rows small: the person's next 3
        const keep = Object.fromEntries((j.next[i] as string[]).filter((m) => m in cost).map((m) => [m, cost[m]]));
        return { k: j.ks[i], next: j.next[i], cost: keep, items: menu.length, min: menu.length ? Math.min(...menu.map((s) => s.cost)) : null };
      });
    }
  } catch (e) { row.error = (e as Error).message.slice(0, 200); }
  appendFileSync(out, JSON.stringify({ ...row, ms: Date.now() - t0 }) + "\n");
  console.error(`${++n}/${jobs.length} ${j.name} ${row.error ?? (row.cap ? "cap" : "ok")} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
});
