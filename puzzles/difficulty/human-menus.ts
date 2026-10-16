// Phase 1 v2's first test (docs/research-trajectory.md; Fable's review of phase 1 by compression):
// at points along a person's recorded solve, the menu of every deduction available there (deduce.ts
// Options.menus) and which of them the person's next moves were. This is the data for a code that
// prices a step as a choice from its menu, and for a network that learns the menu from the solver
// and the choice from people.
//
// The people are Janko's solvers (the human corpus's humanOrder: each mark a person settled, in
// order). For each puzzle, POSITIONS points spread over its order: what the person had settled
// before that point is known, the menu is listed, and the person's next NEXT marks are looked up
// in it (the item deciding each one, or none: a move the windows can't make from there).
//
// Rows go to references/proof-menus/<genre>.jsonl, appended; a rerun skips what's there.
//
//   DEDUCE_JOBS=2 node --no-warnings puzzles/difficulty/human-menus.ts [genre …] [--limit n] [--shard k --of N]
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import type { Step } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { REFS_DIR } from "./janko.ts";
import { mapPool } from "./pool.ts";

const OUT = `${REFS_DIR}proof-menus/`, CORPUS = `${REFS_DIR}ml/human-corpus/`;
const POSITIONS = 8, NEXT = 3;
const argv = process.argv.slice(2), flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? Number(argv[i + 1]) : NaN; };
const shard = flag("shard"), of = flag("of"), limit = flag("limit");
const named = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const jsonl = (f: string): any[] => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };

/** a menu item, kept short: cost, tier, stage, the window's bounding box (r0, c0, r1, c1), the facts,
 *  the explanation's rule instances, its shape */
const item = (cols: number) => (s: Step & { stage: number }) => {
  const rs = s.cells.map((i) => Math.floor(i / cols)), cs = s.cells.map((i) => i % cols);
  return { c: s.cost, k: s.stage, b: [Math.min(...rs), Math.min(...cs), Math.max(...rs), Math.max(...cs)], m: s.facts.map((f) => `${f.mark}=${f.value ? 1 : 0}`), cl: s.because?.clues ?? [], sh: s.shape };
};

mkdirSync(OUT, { recursive: true });
const genres = readdirSync(CORPUS).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -6)).filter((g) => !named.length || named.includes(g)).sort();
const todo: { genre: string; d: any }[] = [];
for (const genre of genres) {
  const done = new Set(jsonl(`${OUT}${genre}.jsonl`).map((r) => r.id));
  let rows = jsonl(`${CORPUS}${genre}.jsonl`).filter((d) => d.humanOrder?.length >= 4 && !done.has(d.key) && (!(of > 1) || Math.floor(hash(d.key) * of) === shard));
  if (limit > 0) rows = rows.sort((a, b) => hash(a.key) - hash(b.key)).slice(0, limit);
  for (const d of rows) todo.push({ genre, d });
}
console.error(`${new Date().toISOString()} ${todo.length} puzzles with a person's order`);
let n = 0;
await mapPool(todo, async ({ genre, d }) => {
  const order: string[] = [...d.humanOrder].sort((a: [string, number], b: [string, number]) => a[1] - b[1]).map((x: [string, number]) => x[0]);
  // positions: after 0, then spread to near the end, each with the marks added since the last
  const at = [...new Set(Array.from({ length: POSITIONS }, (_, j) => Math.floor((j * (order.length - 1)) / POSITIONS)))];
  const adds = at.map((p, j) => order.slice(j ? at[j - 1] : 0, p));
  const t0 = Date.now();
  let row: Record<string, unknown>;
  try {
    const r = await deduceGuarded({ ...d.spec, genre: d.spec.genre ?? genre }, { budgetMs: 120000, menus: adds }, 240000);
    if (!r) row = { id: d.key, genre, cap: 1 };
    else {
      const given = new Set((r.initial ?? []).map((x) => x.split("=")[0]));
      const positions = (r.menus ?? []).map((menu, j) => {
        const next = order.slice(at[j], at[j] + NEXT);
        return {
          at: at[j], of: order.length, menu: menu.map(item(d.spec.size[1])),
          // known: settled before this position by the puzzle itself (grounding, the givens): not a choice
          next: next.map((mark) => ({ mark, item: menu.findIndex((s) => s.facts.some((f) => f.mark === mark)), ...(given.has(mark) ? { known: 1 } : {}) })),
        };
      });
      row = { id: d.key, genre, rows: d.spec.size[0], cols: d.spec.size[1], solver: d.solver, initial: r.initial?.length ?? 0, positions, notes: r.profile.notes };
    }
  } catch (e) { row = { id: d.key, genre, error: (e as Error).message.slice(0, 200) }; }
  appendFileSync(`${OUT}${genre}.jsonl`, JSON.stringify({ ...row, ms: Date.now() - t0 }) + "\n");
  const ps = (row.positions as { menu: unknown[]; next: { item: number }[] }[] | undefined) ?? [];
  const hits = ps.flatMap((p) => p.next).filter((x) => x.item >= 0).length, all = ps.flatMap((p) => p.next).length;
  console.error(`${++n}/${todo.length} ${genre} ${((Date.now() - t0) / 1000).toFixed(1)} s: ${row.cap ? "cap" : row.error ?? `${ps.length} menus, avg ${ps.length ? Math.round(ps.reduce((s, p) => s + p.menu.length, 0) / ps.length) : 0} items, next moves on the menu ${hits}/${all}`}`);
});
