// Code v2's data (Fable's review of phase 1 by compression): the menu of every deduction available
// at points along the solver's own proofs, and which item each next step was. Code v2 prices a step
// as a choice from its menu (the facts free: the decoder has the puzzle and the state), so it needs
// the menu where each step was taken; human-menus.ts does the same along people's solves.
//
// The proofs are proof-bulk.ts's (references/proof-bulk/<genre>.jsonl), up to --per puzzles a genre
// (by a hash of the id, proofs of 8 steps or more). At POSITIONS points spread over a proof, the
// facts of the steps before it are known, the menu is listed (deduce.ts Options.menus), and the
// next NEXT steps are looked up in it: the item deciding exactly the step's facts, else the first
// item deciding its first fact, else none (a case split, or a step the windows don't list there).
//
// Rows go to references/proof-menus-solver/<genre>.jsonl, appended; a rerun skips what's there.
//
//   DEDUCE_JOBS=2 node --no-warnings puzzles/difficulty/proof-menus.ts [genre …] [--per 100] [--shard k --of N]
import { appendFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import type { Step } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { REFS_DIR } from "./janko.ts";
import { mapPool } from "./pool.ts";

const OUT = `${REFS_DIR}proof-menus-solver/`, PROOFS = `${REFS_DIR}proof-bulk/`, CORPUS = `${REFS_DIR}ml/human-corpus/`;
const POSITIONS = Number(process.env.MENU_POSITIONS) || 16, NEXT = 3;
const argv = process.argv.slice(2), flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? Number(argv[i + 1]) : NaN; };
const shard = flag("shard"), of = flag("of"), per = flag("per") || 100;
const named = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };
const ids = (f: string) => new Set(existsSync(f) ? readFileSync(f, "utf8").split("\n").flatMap((l) => { const m = /^\{"id":"([^"]+)"/.exec(l); return m ? [m[1]] : []; }) : []);

/** a menu item, kept short (as human-menus.ts): cost, stage, the window's bounding box, the facts,
 *  the explanation's rule instances, its shape */
const item = (cols: number) => (s: Step & { stage: number }) => {
  const rs = s.cells.map((i) => Math.floor(i / cols)), cs = s.cells.map((i) => i % cols);
  return { c: s.cost, k: s.stage, b: [Math.min(...rs), Math.min(...cs), Math.max(...rs), Math.max(...cs)], m: s.facts.map((f) => `${f.mark}=${f.value ? 1 : 0}`), cl: s.because?.clues ?? [], sh: s.shape };
};

mkdirSync(OUT, { recursive: true });
const genres = readdirSync(PROOFS).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -6)).filter((g) => !named.length || named.includes(g)).sort();
const todo: { genre: string; p: any; spec: any }[] = [];
for (const genre of genres) {
  if (!existsSync(`${CORPUS}${genre}.jsonl`)) continue;
  // the sample: proofs of 8 steps or more, by a salted hash of the id; then this shard's share
  const done = ids(`${OUT}${genre}.jsonl`), picked: any[] = [];
  for await (const line of createInterface({ input: createReadStream(`${PROOFS}${genre}.jsonl`) })) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    if (p.steps?.length >= 8) picked.push({ id: p.id, steps: p.steps.map((s: any) => ({ m: s.m, t: s.t, c: s.c })), solved: p.solved, h: hash(`menus:${p.id}`) });
  }
  const sample = picked.sort((a, b) => a.h - b.h).slice(0, per).filter((p) => !done.has(p.id) && (!(of > 1) || Math.floor(hash(p.id) * of) === shard));
  const want = new Set(sample.map((p) => p.id)), specs = new Map<string, any>();
  for (const l of readFileSync(`${CORPUS}${genre}.jsonl`, "utf8").split("\n")) { const m = /^\{"key":"([^"]+)"/.exec(l); if (m && want.has(m[1])) specs.set(m[1], JSON.parse(l).spec); }
  for (const p of sample) if (specs.has(p.id)) todo.push({ genre, p, spec: { ...specs.get(p.id), genre: specs.get(p.id).genre ?? genre } });
}
console.error(`${new Date().toISOString()} ${todo.length} proofs`);
let n = 0;
await mapPool(todo, async ({ genre, p, spec }) => {
  const steps: { m: string[]; t: number; c: number }[] = p.steps;
  const at = [...new Set(Array.from({ length: POSITIONS }, (_, j) => Math.floor((j * (steps.length - 1)) / POSITIONS)))];
  const adds = at.map((x, j) => steps.slice(j ? at[j - 1] : 0, x).flatMap((s) => s.m.map((f) => f.split("=")[0])));
  const t0 = Date.now();
  let row: Record<string, unknown>;
  try {
    const r = await deduceGuarded(spec, { budgetMs: 300000, menus: adds }, 420000);
    if (!r) row = { id: p.id, genre, cap: 1 };
    else {
      const positions = (r.menus ?? []).map((menu, j) => {
        const items = menu.map(item(spec.size[1]));
        const next = steps.slice(at[j], at[j] + NEXT).map((s) => {
          const key = [...s.m].sort().join(" ");
          let k = items.findIndex((it) => [...it.m].sort().join(" ") === key), exact = 1;
          if (k < 0) { exact = 0; k = items.findIndex((it) => it.m.includes(s.m[0])); }
          return { m: s.m, t: s.t, c: s.c, item: k, ...(k >= 0 && !exact ? { part: 1 } : {}) };
        });
        return { at: at[j], of: steps.length, menu: items, next };
      });
      row = { id: p.id, genre, rows: spec.size[0], cols: spec.size[1], solved: p.solved, initial: r.initial?.length ?? 0, positions, notes: r.profile.notes };
    }
  } catch (e) { row = { id: p.id, genre, error: (e as Error).message.slice(0, 200) }; }
  appendFileSync(`${OUT}${genre}.jsonl`, JSON.stringify({ ...row, ms: Date.now() - t0 }) + "\n");
  const ps = (row.positions as { menu: unknown[]; next: { item: number }[] }[] | undefined) ?? [];
  const hits = ps.flatMap((x) => x.next).filter((x) => x.item >= 0).length, all = ps.flatMap((x) => x.next).length;
  console.error(`${++n}/${todo.length} ${genre} ${((Date.now() - t0) / 1000).toFixed(1)} s: ${row.cap ? "cap" : row.error ?? `${ps.length} menus, avg ${ps.length ? Math.round(ps.reduce((s, x) => s + x.menu.length, 0) / ps.length) : 0} items, next steps on the menu ${hits}/${all}`}`);
});
