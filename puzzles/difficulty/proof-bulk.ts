// Proofs at scale for phase 1 by compression (mdl.ts): every puzzle of the human corpus
// (human-corpus.ts, references/ml/human-corpus/<genre>.jsonl, 39,467 puzzles with the test set
// already left out), each one's cheapest-only proof, in the same row format as the original
// phase 1's proof-paths.ts so mdl.ts reads both.
//
// The order interleaves genres (a seeded shuffle within each, then round-robin), so any prefix of
// the run is a balanced sample and the learning curve can be read as it grows. Rows go to
// references/proof-bulk/<genre>.jsonl, appended as each finishes; a rerun skips what's there and
// --retry runs again the ones stopped at the cap (the Mac sleeping stops a solve's clock and trips
// it). Nurikabe is left out unless named: no Nurikabe solves by windows and shallow splits (phase 0).
//
//   DEDUCE_JOBS=2 node --no-warnings puzzles/difficulty/proof-bulk.ts [genre …] [--retry]
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import type { Step } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { REFS_DIR } from "./janko.ts";
import { mapPool } from "./pool.ts";

export const BULK_DIR = `${REFS_DIR}proof-bulk/`;
const CORPUS = `${REFS_DIR}ml/human-corpus/`;
const SKIP = new Set(["nurikabe"]);

const jsonl = (f: string): any[] => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
const seeded = <T>(xs: T[], seed0: number) => {
  let seed = seed0;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

interface Item { id: string; genre: string; spec: GridSpec; meta: Record<string, unknown> }

/** a corpus record's labels, kept short: Puzzle Square JP's likes and difficulty, puzz.link's,
 *  Logic Masters' beauty, the sources and setters */
function itemOf(d: any): Item {
  const ids: string[] = d.ids ?? [], psjp = ids.find((x) => x.startsWith("psjp:"))?.slice(5);
  const l = d.labels ?? {};
  return {
    id: d.key, genre: d.genre, spec: { ...d.spec, genre: d.spec.genre ?? d.genre },
    meta: {
      type: d.genre, sources: d.sources, ids, setters: d.setters, ...(psjp ? { psjp } : {}),
      ...(l.psjp ? { likes: l.psjp.likes, solvers: l.psjp.solves, difficulty: l.psjp.difficulty, user: l.psjp.user } : {}),
      ...(l.puzzlink ? { pzlDifficulty: l.puzzlink.difficulty, pzlSolves: l.puzzlink.solves } : {}),
      ...(l.lmd ? { beauty: l.lmd.beauty, lmdDifficulty: l.lmd.difficulty } : {}),
      ...(d.humanOrder ? { humanOrder: 1 } : {}),
    },
  };
}

const compact = (s: Step) => ({
  c: s.cost, t: s.tier, r: s.round ?? 0, o: s.open ?? 0, x: s.cells, m: s.facts.map((f) => `${f.mark}=${f.value ? 1 : 0}`),
  cl: s.because?.clues ?? [], kf: s.because?.facts ?? 0, sh: s.shape, f: s.feat, ...(s.choice ? { ch: 1 as const } : {}),
});

async function proofOf(it: Item, budgetMs: number, capMs: number) {
  const [rows, cols] = it.spec.size as [number, number];
  const base = { id: it.id, set: `bulk-${it.genre}`, genre: it.genre, rows, cols, meta: it.meta };
  const t0 = Date.now();
  try {
    const r = await deduceGuarded(it.spec, { budgetMs, minPeak: true, maxTier: 2, structure: true }, capMs);
    if (!r) return { ...base, solved: false, cap: 1, ms: Date.now() - t0 };
    const p = r.profile;
    return {
      ...base, solved: p.solved && !r.path.some((s) => s.choice), ms: Date.now() - t0, notes: p.notes,
      profile: { steps: p.steps, maxCost: p.maxCost, dSteps: p.dSteps, estimate: p.estimate, ruleLoad: p.ruleLoad, entryPoints: p.entryPoints },
      usage: r.usage, instances: r.structure?.groups.length, initial: r.initial?.length, steps: r.path.map(compact),
    };
  } catch (e) { return { ...base, solved: false, error: (e as Error).message.slice(0, 200), ms: Date.now() - t0 }; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const genres = readdirSync(CORPUS).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -6))
    .filter((g) => named.length ? named.includes(g) : !SKIP.has(g)).sort();
  const budgetMs = Number(process.env.PROOF_BUDGET) || 30000, capMs = Number(process.env.PROOF_CAP) || 150000;
  mkdirSync(BULK_DIR, { recursive: true });
  const queues = genres.map((g) => {
    const out = `${BULK_DIR}${g}.jsonl`;
    let have = jsonl(out);
    if (process.argv.includes("--retry")) { have = have.filter((p) => !p.cap); writeFileSync(out, have.map((p) => JSON.stringify(p)).join("\n") + (have.length ? "\n" : "")); }
    const done = new Set(have.map((p) => p.id));
    return seeded(jsonl(`${CORPUS}${g}.jsonl`).map(itemOf), 20261015).filter((it) => !done.has(it.id));
  });
  const todo: Item[] = [];
  for (let k = 0; queues.some((q) => k < q.length); k++) for (const q of queues) if (k < q.length) todo.push(q[k]);
  console.error(`${new Date().toISOString()} ${genres.join(", ")}: ${todo.length} to run`);
  let n = 0;
  await mapPool(todo, async (it) => {
    const p: any = await proofOf(it, budgetMs, capMs);
    appendFileSync(`${BULK_DIR}${it.genre}.jsonl`, JSON.stringify(p) + "\n");
    console.error(`${++n}/${todo.length} ${it.genre} ${(p.ms / 1000).toFixed(1)} s: ${p.solved ? `${p.steps.length} steps` : p.cap ? "cap" : p.error ?? `unsolved, ${p.steps?.length ?? 0} steps`}`);
  });
}
