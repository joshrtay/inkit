// Phase 1 of docs/research-trajectory.md (the cost model): each puzzle's cheapest-only proof,
// kept step by step so the cost terms (proof-cost.ts) can be computed, weighted and re-versioned
// without solving again. The proof is deduce.ts's min-peak path with shallow case splits
// (Options.minPeak, maxTier 2): only the cheapest steps each round, over every stage. Phase 0 found
// it within a few percent of the best proof by the sum (more on Akari) and optimal for the peak.
//
// Sets (all local, never published):
//   psjp <type> [n]  Puzzle Square JP's puzzles with likes (references/psjp-full/converted), a seeded n
//   pilot            the labeller pilot's interest puzzles (Fable's 72) and Opus's 372 at scale
//   ba               Beast Academy's Puzzle Lab sets, in their order
//   tatham [n]       Tatham's graded puzzles, n per grade file (default 10)
//   janko <type> [n] Janko's puzzles with recorded moves (janko-order.ts's selection, default 80)
//
// Rows go to references/proof/<set>.jsonl, one per puzzle, appended as each finishes; a rerun
// skips what's there, and --retry runs again the ones stopped at the cap (the Mac sleeping stops
// a solve's clock and trips it).
//
//   DEDUCE_JOBS=2 node --no-warnings puzzles/difficulty/proof-paths.ts <set> [arg …] [--retry]
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { convert, GENRE, loadSets, ORDER } from "./ba-convert.ts";
import type { Step } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { REFS_DIR } from "./janko.ts";
import { drawGrid } from "./llm-label.ts";
import { mapPool } from "./pool.ts";
import { fromTatham, TATHAM } from "./tatham.ts";

const refs = REFS_DIR;
export const PROOF_DIR = `${refs}proof/`;

export interface Item { id: string; spec: GridSpec; meta: Record<string, unknown> }
/** a step, kept short: cost, tier, round, tier-0 steps open then, the window's cells, the facts
 *  (mark=value), the explanation's rule instances and earlier facts, its shape and price features */
export interface PStep { c: number; t: number; r: number; o: number; x: number[]; m: string[]; cl: string[]; kf: number; sh?: string; f?: Record<string, number>; ch?: 1 }
export interface Proof {
  id: string; set: string; genre: string; rows: number; cols: number; meta: Record<string, unknown>;
  solved: boolean; cap?: 1; error?: string; ms: number; notes?: string[];
  profile?: { steps: number; maxCost: number; dSteps: number; estimate: number; ruleLoad: number; entryPoints: number };
  usage?: { used: number; of: number }; instances?: number; initial?: number; steps?: PStep[];
}

const seeded = <T>(xs: T[], seed0: number) => {
  let seed = seed0;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const jsonl = (f: string) => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];

/** Puzzle Square JP's converted puzzles of a type with solvers (likes are per solver) */
export function psjpItems(type: string): Item[] {
  return jsonl(`${refs}psjp-full/converted/${type}.jsonl`).filter((d) => d.meta?.answered_n > 0).map((d) => ({
    id: String(d.sourceId), spec: { ...d.spec, genre: d.spec.genre ?? type },
    meta: { type, likes: d.meta.favorite_n, solvers: d.meta.answered_n, difficulty: d.meta.difficulty, user: d.meta.user, registered: d.meta.registered },
  }));
}

/** The labeller pilot's interest puzzles: Fable's batches matched to Puzzle Square JP's rated set
 *  by their drawn grid (the pilot's own result file was overwritten by the run at scale), and the
 *  run at scale's (Opus) by id. Each with its place in its batch (0 least enjoyed, 1 most). */
export function pilotItems(): Item[] {
  const ll = `${refs}ml/llm-label/`, psjp = `${refs}psjp/`;
  const data = JSON.parse(readFileSync(`${psjp}data.json`, "utf8")) as Record<string, { favorite_n: number; answered_n: number; difficulty: number }>;
  const byType = new Map<string, Map<string, { id: string; spec: GridSpec }>>();
  const rated = (type: string) => {
    if (!byType.has(type)) {
      const m = new Map<string, { id: string; spec: GridSpec }>();
      for (const f of readdirSync(`${psjp}${type}`).filter((f) => /^\d+\.json$/.test(f))) {
        const d = JSON.parse(readFileSync(`${psjp}${type}/${f}`, "utf8")), spec = { ...d.grid, genre: d.grid.genre ?? type };
        m.set(String(d.source.psjp), { id: String(d.source.psjp), spec });
      }
      byType.set(type, m);
    }
    return byType.get(type)!;
  };
  const out = new Map<string, Item>();
  const add = (type: string, id: string, spec: GridSpec, key: string, place: number, batch: string) => {
    const k = `${type}:${id}`, m = data[id];
    if (!out.has(k)) out.set(k, { id: k, spec, meta: { type, psjp: id, likes: m?.favorite_n, solvers: m?.answered_n, difficulty: m?.difficulty } });
    Object.assign(out.get(k)!.meta, { [`${key}_place`]: place, [`${key}_batch`]: batch });
  };
  // Fable's pilot batches: each P block's grid against the rated set's drawings
  const fdir = `${ll}calls/interest/fable/`;
  for (const f of existsSync(fdir) ? readdirSync(fdir).filter((f) => f.endsWith(".json")) : []) {
    const call = JSON.parse(readFileSync(fdir + f, "utf8")), type = String(call.item).replace(/-\d+$/, "");
    const parsed = typeof call.parsed === "string" ? JSON.parse(call.parsed.replace(/'/g, '"')) : call.parsed;
    const order: string[] = parsed?.order ?? [];
    const drawn = new Map([...rated(type).values()].map((x) => [drawGrid(x.spec), x]));
    const blocks = [...String(call.prompt).matchAll(/### (P\d+)\n([\s\S]*?)\n\nHow our step-by-step solver/g)];
    for (const [, p, grid] of blocks) {
      const hit = drawn.get(grid);
      if (!hit) { console.error(`pilot ${call.item} ${p}: no rated puzzle draws the same`); continue; }
      const k = order.indexOf(p);
      add(type, hit.id, hit.spec, "fable", k < 0 ? NaN : k / Math.max(1, order.length - 1), call.item);
    }
  }
  // Opus at scale
  const scale = existsSync(`${ll}result-interest.json`) ? JSON.parse(readFileSync(`${ll}result-interest.json`, "utf8")) : { places: [] };
  for (const p of scale.places as { model: string; type: string; batch: string; id: string; place: number }[]) {
    const x = rated(p.type).get(p.id);
    if (x) add(p.type, p.id, x.spec, p.model, p.place, p.batch);
  }
  return [...out.values()];
}

export function baItems(): Item[] {
  const sets = loadSets(), out: Item[] = [];
  for (const t of [9, 18, 14]) for (const [setAt, [name, tier]] of ORDER[t].entries()) {
    const set = sets.find((s) => s.t === t && s.s === name);
    set?.p.forEach((c, at) => out.push({ id: `${t}:${name}:${at}`, spec: convert(t, c) as GridSpec, meta: { type: GENRE[t], set: name, tier, setAt, at } }));
  }
  return out;
}

export function tathamItems(per: number): Item[] {
  const dir = `${refs}tatham/puzzles/`, out: Item[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".txt")).sort()) {
    const game = f.split("-")[0];
    if (!TATHAM[game]) continue;
    readFileSync(dir + f, "utf8").trim().split("\n").slice(0, per).forEach((id, k) => {
      const r = fromTatham(game, id);
      if (!r) return;
      const grade = TATHAM[game].grades.indexOf(r.grade);
      if (grade >= 0) out.push({ id: `${f.replace(/\.txt$/, "")}:${k}`, spec: r.spec, meta: { type: TATHAM[game].genre, game, size: r.spec.size.join("x"), grade } });
    });
  }
  return out;
}

export async function jankoItems(type: string, limit: number): Promise<Item[]> {
  const { studied } = await import("./janko-order.ts");
  return studied(type, 10, limit).map(({ f, j }) => ({ id: f, spec: j.spec, meta: { type, file: f, solver: j.solver } }));
}

const compact = (s: Step): PStep => ({
  c: s.cost, t: s.tier, r: s.round ?? 0, o: s.open ?? 0, x: s.cells, m: s.facts.map((f) => `${f.mark}=${f.value ? 1 : 0}`),
  cl: s.because?.clues ?? [], kf: s.because?.facts ?? 0, sh: s.shape, f: s.feat, ...(s.choice ? { ch: 1 as const } : {}),
});

/** one puzzle's cheapest-only proof */
export async function proofOf(it: Item, set: string, budgetMs: number, capMs: number): Promise<Proof> {
  const [rows, cols] = it.spec.size as [number, number];
  const base = { id: it.id, set, genre: it.spec.genre as string, rows, cols, meta: it.meta };
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
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [kind, a1, a2] = args;
  let items: Item[] = [], set = kind;
  if (kind === "psjp") { set = `psjp-${a1}`; items = seeded(psjpItems(a1), 20261015).slice(0, Number(a2) || 250); }
  else if (kind === "pilot") items = pilotItems();
  else if (kind === "ba") items = baItems();
  else if (kind === "tatham") items = tathamItems(Number(a1) || 10);
  else if (kind === "janko") { set = `janko-${a1}`; items = await jankoItems(a1, Number(a2) || 80); }
  else { console.error("sets: psjp <type> [n] | pilot | ba | tatham [n] | janko <type> [n]"); process.exit(1); }
  const budgetMs = Number(process.env.PROOF_BUDGET) || 30000, capMs = Number(process.env.PROOF_CAP) || 150000;
  mkdirSync(PROOF_DIR, { recursive: true });
  const out = `${PROOF_DIR}${set}.jsonl`;
  let have: Proof[] = jsonl(out);
  if (process.argv.includes("--retry")) { have = have.filter((p) => !p.cap); writeFileSync(out, have.map((p) => JSON.stringify(p)).join("\n") + (have.length ? "\n" : "")); }
  const done = new Set(have.map((p) => p.id));
  const todo = items.filter((it) => !done.has(it.id));
  console.error(`${set}: ${items.length} puzzles, ${todo.length} to run`);
  let n = 0;
  await mapPool(todo, async (it) => {
    const p = await proofOf(it, set, budgetMs, capMs);
    appendFileSync(out, JSON.stringify(p) + "\n");
    console.error(`${++n}/${todo.length} ${it.id} ${(p.ms / 1000).toFixed(1)} s: ${p.solved ? `${p.steps!.length} steps, peak ${p.profile!.maxCost}` : p.cap ? "cap" : p.error ?? p.notes?.at(-1) ?? "unsolved"}`);
  });
}
