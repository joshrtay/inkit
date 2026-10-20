// The person's moves the solver's menu didn't have (human-menus.ts: next[k].item < 0): how far
// away were they? From the person's position (deduce.ts Options.from), the solver goes on with no
// case splits, each round taking every step the windows find (Options.closure: a fact's round is
// its depth), until the move is known (Options.until), or can't.
//
//   2–3 rounds, the steps in between all "no" facts (a cross, a no-bulb cell): bookkeeping the
//     recording leaves out (people don't record what they see at a glance)
//   2–3 rounds otherwise: a chain the person ran in their head and wrote down the end of: a phrase
//   more, or never without a split: a deduction beyond the windows (a missing technique), or a guess
//
// One miss a position (the first of the person's next moves, if missed: its position is exact; a
// mark the puzzle settled itself is no move), up to --per a genre (a rerun tops each genre up).
// Rows to references/proof-menus/misses.jsonl; a summary at the end.
//
//   DEDUCE_JOBS=2 node --no-warnings puzzles/difficulty/human-misses.ts [--per 150]
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { deduceGuarded } from "./deduce-guarded.ts";
import { REFS_DIR } from "./janko.ts";
import { mapPool } from "./pool.ts";

const DIR = `${REFS_DIR}proof-menus/`, OUT = `${DIR}misses.jsonl`, CORPUS = `${REFS_DIR}ml/human-corpus/`;
const argv = process.argv.slice(2), per = Number(argv[argv.indexOf("--per") + 1]) || 150;
const jsonl = (f: string): any[] => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };

const doneRows = jsonl(OUT), done = new Set(doneRows.map((r) => `${r.id}@${r.at}`));
const todo: { genre: string; id: string; at: number; mark: string; from: string[]; spec: any }[] = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".jsonl") && x !== "misses.jsonl")) {
  const genre = f.slice(0, -6);
  const specs = new Map(jsonl(`${CORPUS}${genre}.jsonl`).map((d) => [d.key, d]));
  const cands: typeof todo = [];
  for (const r of jsonl(DIR + f)) {
    const d = specs.get(r.id);
    if (!r.positions || !d) continue;
    const order: string[] = [...d.humanOrder].sort((a: [string, number], b: [string, number]) => a[1] - b[1]).map((x: [string, number]) => x[0]);
    for (const p of r.positions) if (p.next[0]?.item < 0 && !p.next[0].known && !done.has(`${r.id}@${p.at}`))
      cands.push({ genre, id: r.id, at: p.at, mark: p.next[0].mark, from: order.slice(0, p.at), spec: { ...d.spec, genre: d.spec.genre ?? genre } });
  }
  // a rerun tops a genre up to --per
  const had = doneRows.filter((r) => r.genre === genre).length;
  todo.push(...cands.sort((a, b) => hash(`${a.id}@${a.at}`) - hash(`${b.id}@${b.at}`)).slice(0, Math.max(0, per - had)));
}
console.error(`${todo.length} misses to follow`);
let n = 0;
await mapPool(todo, async (t) => {
  const t0 = Date.now();
  let row: Record<string, unknown>;
  try {
    const r = await deduceGuarded(t.spec, { budgetMs: 30000, closure: true, maxTier: 1, from: t.from, until: [t.mark] }, 90000);
    if (!r) row = { cap: 1 };
    else {
      const k = r.path.findIndex((s) => s.facts.some((f) => f.mark === t.mark));
      // the steps before it that touch its window: the chain it rests on (roughly)
      const last = k >= 0 ? r.path[k] : null, near = last ? new Set(last.cells) : new Set<number>();
      const before = last ? r.path.slice(0, k).filter((s) => (s.round ?? 0) < (last.round ?? 0) && s.cells.some((c) => near.has(c))) : [];
      row = {
        reached: !!last, rounds: last ? (last.round ?? 0) - (r.path[0].round ?? 0) + 1 : null, stepsBefore: before.length,
        noFactsOnly: before.every((s) => s.facts.every((f) => !f.value)),
        step: last ? { c: last.cost, t: last.tier, cl: last.because?.clues ?? [], sh: last.shape } : null,
        chain: before.slice(-6).map((s) => ({ c: s.cost, r: s.round, m: s.facts.map((f) => `${f.mark}=${f.value ? 1 : 0}`), cl: s.because?.clues ?? [] })),
        notes: r.profile.notes,
      };
    }
  } catch (e) { row = { error: (e as Error).message.slice(0, 200) }; }
  appendFileSync(OUT, JSON.stringify({ id: t.id, genre: t.genre, at: t.at, mark: t.mark, ms: Date.now() - t0, ...row }) + "\n");
  console.error(`${++n}/${todo.length} ${t.genre} ${row.cap ? "cap" : row.error ? "error" : row.reached ? `round ${row.rounds}, ${row.stepsBefore} steps before${row.noFactsOnly ? ", all no-facts" : ""}` : "not without a split"}`);
});

// the summary: by genre, how far the missed moves were
const rows = jsonl(OUT), by = new Map<string, any[]>();
for (const r of rows) (by.get(r.genre) ?? by.set(r.genre, []).get(r.genre)!).push(r);
console.log("genre        misses  bookkeeping  chain(2-3)  further  no split  cap/error");
for (const [g, rs] of [...by.entries()].sort()) {
  const ok = rs.filter((r) => !r.cap && !r.error);
  const book = ok.filter((r) => r.reached && r.rounds <= 3 && r.noFactsOnly).length, chain = ok.filter((r) => r.reached && r.rounds <= 3 && !r.noFactsOnly).length;
  const far = ok.filter((r) => r.reached && r.rounds > 3).length, never = ok.filter((r) => !r.reached).length;
  const pct = (x: number) => `${Math.round((100 * x) / Math.max(1, ok.length))}%`.padStart(6);
  console.log(`${g.padEnd(12)} ${String(rs.length).padStart(6)}  ${pct(book).padStart(11)}  ${pct(chain).padStart(10)}  ${pct(far).padStart(7)}  ${pct(never).padStart(8)}  ${String(rs.length - ok.length).padStart(9)}`);
}
