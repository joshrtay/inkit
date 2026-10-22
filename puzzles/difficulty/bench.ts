// The model calibration benchmark (docs/research-calibration-benchmarks.md): many test-takers
// (model × effort × input format) on many items (stuck states), pass or fail per pair, and an item
// response fit over them. An item is a position where the reader (the solver up to the genre's
// cost ceiling, as in walkthrough-loop.ts) has done everything easy; the test-taker names one move
// it is certain of. A pass is a true move on the frontier (one solver step, or a short case split,
// decides it from here); a true move off the frontier is counted apart (a leap or a lucky guess),
// and so are wrong moves and no answer.
//
// Sets: `thinky` (Thinky Dailies, private: references/thinky-dailies/converted.jsonl, the author's
// level 1-5 as the human anchor); `examples` (the repo's own example puzzles, for dry runs); the
// rated sets (PSJP, puzz.link, LMI Expo) once their converted puzzles are in references/.
// Formats: `grid` (the drawing the next-move test uses) and `listed` (the drawing plus every cell,
// link or side spelled out with its clue and state: what is printed, nothing deduced). The
// listing-minus-grid gap is the perception cost.
//
//   node --no-warnings puzzles/difficulty/bench.ts items <set> [--per 3] [--limit N]   → <set>/items.json (free)
//   node --no-warnings puzzles/difficulty/bench.ts ask <set> <model>:<effort>:<format>[,…] [--limit N] [--jobs 8]
//                                                                                      → <set>/runs/<taker>.jsonl (paid; resumable)
//   node --no-warnings puzzles/difficulty/bench.ts dry <set>                          (free: stand-in takers, then report)
//   node --no-warnings puzzles/difficulty/bench.ts report <set>                       → <set>/report.md (free)
//   node --no-warnings puzzles/difficulty/bench.ts show <set> [item id] [format]      (the prompt)
//
// Models: haiku (Haiku 5.5), sonnet (Sonnet 5.5), opus (Opus 5.5), opus48 (Opus 4.8); efforts low,
// medium, high. The key is INKIT_ANTHROPIC_KEY. BENCH_CAP (dollars, default 10) stops asking before
// the ledger would pass it. Everything goes to references/ml/bench/ (local only: the puzzles are
// other people's).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { shuffled } from "./llm-label.ts";
import { draw, lastJson, listed, markOf, moveForm, NAME, readJsonl, rules, VALUES, wilson } from "./opus-human.ts";
import { mapPool } from "./pool.ts";
import { type MoveResult, type MV, scoreMove } from "./walkthrough-core.ts";
import { askOpus, ctxOf, DEFAULT_CEILING, ledger, type LoopItem, menu, type Model, reader, splits } from "./walkthrough-loop.ts";

const repo = new URL("../../", import.meta.url).pathname;
const OUT = `${repo}references/ml/bench/`;
const argv = process.argv.slice(2), cmd = argv[0] ?? "report";
const opt = (name: string, d: string) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : d; };
const num = (name: string, d: number) => Number(opt(name, String(d)));
const CAP = Number(process.env.BENCH_CAP) || 10;
const dir = (set: string, sub = "") => { const d = `${OUT}${set}/${sub}`; mkdirSync(d, { recursive: true }); return d; };

/** genres whose rules, drawing and move form the prompts already cover */
export const GENRES = new Set([...Object.keys(VALUES), "skyscrapers", "hidoku", "easy-as-abc", "sudoku"]);

// ======== items ========
export interface BenchItem {
  id: string; set: string; genre: string; spec: GridSpec;
  /** what's known: the reader's closure from the empty grid or from a later state */
  known: MV[];
  /** every mark one solver step or a short case split decides from here */
  frontier: string[];
  /** the cheapest step's cost (null: only case splits), its kind, and how many steps are open */
  cost: number | null; kind: string; steps: number;
  /** where in the solve: the k-th stuck point of n */
  at: [number, number];
  /** the human anchor, where the set has one */
  anchor: { level?: number; hints?: number; rating?: number; solves?: number; seconds?: number };
  source: string;
}
interface Puzzle { id: string; genre: string; spec: GridSpec; anchor: BenchItem["anchor"]; source: string }

function puzzlesOf(set: string): Puzzle[] {
  if (set === "thinky") {
    const f = `${repo}references/thinky-dailies/converted.jsonl`;
    return readJsonl(f).filter((d) => d.unique === "unique" && GENRES.has(d.spec.genre))
      .map((d) => ({ id: `thinky-${d.slug}`, genre: d.spec.genre, spec: d.spec, anchor: { level: d.difficulty, hints: d.hints }, source: `Thinky ${d.slug} ${d.title}` }));
  }
  if (set === "examples") {
    const out: Puzzle[] = [];
    for (const genre of readdirSync(`${repo}src/games/`)) {
      if (!GENRES.has(genre) || !existsSync(`${repo}src/games/${genre}/1.json`)) continue;
      const d = JSON.parse(readFileSync(`${repo}src/games/${genre}/1.json`, "utf8"));
      if (!d.grid) continue;
      out.push({ id: `example-${genre}-1`, genre, spec: { ...d.grid, genre: d.grid.genre ?? genre }, anchor: {}, source: `src/games/${genre}/1.json` });
    }
    return out;
  }
  if (set === "puzzlink" || set === "psjp") {
    // banded by the human rating: per genre, up to --per-band puzzles at each level, ≤ 100 cells
    // (as the Thinky grids and the hint test), seeded; puzz.link only where 5+ people solved it
    const folder = set === "puzzlink" ? "puzzlink-db" : "psjp-full", perBand = num("--per-band", 2), out: Puzzle[] = [];
    for (const genre of [...GENRES].sort()) {
      const f = `${repo}references/${folder}/converted/${genre}.jsonl`;
      if (!existsSync(f)) continue;
      const rated = readJsonl(f).map((d) => ({ d, level: set === "puzzlink" ? d.meta?.difficulty5 : d.meta?.difficulty }))
        .filter(({ d, level }) => Number.isFinite(level) && d.spec?.size?.[0] * d.spec?.size?.[1] <= 100 && (set === "psjp" || (d.meta?.solves ?? 0) >= 5));
      const bands = new Map<number, typeof rated>();
      for (const r of shuffled(rated, `bench ${set} ${genre}`)) bands.set(r.level, [...(bands.get(r.level) ?? []), r]);
      for (const [level, rs] of [...bands].sort((a, b) => a[0] - b[0])) for (const { d } of rs.slice(0, perBand))
        out.push({ id: `${set}-${genre}-${d.sourceId}`.slice(0, 80), genre, spec: { ...d.spec, genre }, anchor: { rating: level, ...(d.meta?.solves ? { solves: d.meta.solves } : {}) }, source: d.url ?? d.sourceId });
    }
    return out;
  }
  throw new Error(`no set ${set} yet (thinky, examples, puzzlink, psjp)`);
}

/** Every stuck point on one solve: the reader's closure, the frontier there; then the cheapest step
 *  (or a case split) is taken and the reader runs again. */
async function stuckPoints(pz: Puzzle, ceiling: number, most = 40): Promise<Omit<BenchItem, "id" | "at">[]> {
  const it: LoopItem = { id: pz.id, set: "bench", genre: pz.genre, known: [], spec: pz.spec };
  const ctx = await ctxOf(it), known = new Map<string, boolean>(), out: Omit<BenchItem, "id" | "at">[] = [];
  // what the setup settles before any step (a 0's neighbours, givens) is drawn as known too
  for (const m of ctx.initial) known.set(m, ctx.truth.get(m) ?? false);
  for (let k = 0; k < most; k++) {
    const r = await reader(ctx, known, ceiling);
    for (const [m, v] of r.added) known.set(m, v);
    if (r.solved || r.open === 0) break;
    const steps = (await menu(ctx, known)).sort((a, b) => a.cost - b.cost);
    const split = steps.length ? [] : await splits(ctx, known, ctx.markNames.length);
    const take = steps[0] ?? split[0];
    if (!take) break;
    const frontier = [...new Set([...steps, ...split].flatMap((s) => s.facts.map((f) => f.mark)))];
    out.push({ set: "", genre: pz.genre, spec: pz.spec, known: [...known], frontier, cost: steps[0]?.cost ?? null, kind: take.kind, steps: steps.length, anchor: pz.anchor, source: pz.source });
    for (const f of take.facts) known.set(f.mark, f.value);
  }
  return out;
}

async function itemsCmd(set: string) {
  const per = num("--per", 3), limit = num("--limit", Infinity), items: BenchItem[] = [];
  const puzzles = puzzlesOf(set).slice(0, limit);
  const done = await mapPool(puzzles, async (pz) => {
    const pts = await stuckPoints(pz, DEFAULT_CEILING).catch((e) => { console.error(`${pz.id}: ${(e as Error).message}`); return []; });
    // the first, the last and evenly between: early stuck points are easier to read, late ones need
    // the whole board held in mind
    const pick = pts.length <= per ? pts.map((_, i) => i) : [...new Set(Array.from({ length: per }, (_, j) => Math.round((j * (pts.length - 1)) / (per - 1 || 1))))];
    console.error(`${pz.id}: ${pts.length} stuck points, kept ${pick.length}`);
    return pick.map((i) => ({ ...pts[i], id: `${pz.id}#${i + 1}`, set, at: [i + 1, pts.length] as [number, number] }));
  }, num("--jobs", 4));
  for (const d of done) items.push(...d);
  writeFileSync(`${dir(set)}items.json`, JSON.stringify({ set, ceiling: DEFAULT_CEILING, items }, null, 1));
  const byGenre = new Map<string, number>();
  for (const it of items) byGenre.set(it.genre, (byGenre.get(it.genre) ?? 0) + 1);
  console.log(`${items.length} items from ${puzzles.length} puzzles (${[...byGenre].map(([g, n]) => `${g} ${n}`).join(", ")}) → ${set}/items.json`);
}
const loadItems = (set: string): BenchItem[] => JSON.parse(readFileSync(`${dir(set)}items.json`, "utf8")).items;

// ======== test-takers ========
const MODELS: Record<string, Omit<Model, "effort" | "maxTokens">> = {
  haiku: { id: "claude-haiku-5-5", openrouter: "anthropic/claude-haiku-5.5", price: { input: 0.1 / 1e6, output: 0.5 / 1e6 } },
  sonnet: { id: "claude-sonnet-5-5", openrouter: "anthropic/claude-sonnet-5.5", price: { input: 2 / 1e6, output: 10 / 1e6 } },
  opus: { id: "claude-opus-5-5", openrouter: "anthropic/claude-opus-5.5", price: { input: 4 / 1e6, output: 20 / 1e6 } },
  opus48: { id: "claude-opus-4-8", openrouter: "anthropic/claude-opus-4.8", price: { input: 5 / 1e6, output: 25 / 1e6 } },
};
const TOKENS: Record<string, number> = { low: 8000, medium: 16000, high: 32000, xhigh: 64000, max: 64000 };
type Format = "grid" | "listed";
interface Taker { name: string; model: Model; format: Format }
function takerOf(s: string): Taker {
  const [m, effort = "medium", format = "grid"] = s.split(":");
  if (!MODELS[m] || !TOKENS[effort] || !["grid", "listed"].includes(format)) throw new Error(`bad taker ${s} (model:effort:format, e.g. haiku:low:grid)`);
  return { name: `${m}-${effort}-${format}`, model: { ...MODELS[m], effort, maxTokens: TOKENS[effort] }, format: format as Format };
}

export function promptOf(it: BenchItem, format: Format): string {
  const known = new Map(it.known), name = NAME[it.genre] ?? it.genre.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return `Here is a partly solved ${name} puzzle.

Rules: ${rules(it.spec)} The puzzle has exactly one solution.

The grid:

${draw(it.spec, known)}${format === "listed" ? `\n\n${listed(it.spec, known)}` : ""}

Find one move that is certain: a cell (or line) still undecided above whose value follows by logic from the rules, the clues and what is already decided. Don't guess: a wrong move counts against you, worse than no move. If you can't find a certain move, say so and give {"at": "stuck"}.

End your reply with JSON: ${moveForm(it.genre)}. Rows and columns count from 1.`;
}

interface Row { id: string; taker: string; result: MoveResult | "stuck" | "error"; move?: unknown; cost: number; outTokens?: number; finish?: string; ms: number }
function scoreOf(it: BenchItem, text: string): { result: Row["result"]; move: unknown } {
  const j = lastJson(text);
  if (!j || String(j.at).toLowerCase() === "stuck") return { result: j ? "stuck" : "none", move: j };
  const mv = markOf(it.spec, j);
  if (!mv) return { result: "none", move: j };
  const truth = (m: string) => solutionOf(it).get(m) ?? false;
  return { result: scoreMove(mv, truth, new Set(it.known.map(([m]) => m)), new Set(it.frontier)), move: j };
}
const truthCache = new Map<string, Map<string, boolean>>();
function solutionOf(it: BenchItem): Map<string, boolean> {
  const key = it.id.split("#")[0];
  if (!truthCache.has(key)) throw new Error(`no solution loaded for ${key}`);
  return truthCache.get(key)!;
}
async function loadTruths(items: BenchItem[]) {
  for (const it of items) {
    const key = it.id.split("#")[0];
    if (truthCache.has(key)) continue;
    truthCache.set(key, (await ctxOf({ id: key, set: "bench", genre: it.genre, known: [], spec: it.spec })).truth);
  }
}

async function askCmd(set: string, takers: string) {
  const items = loadItems(set).slice(0, num("--limit", Infinity));
  await loadTruths(items);
  for (const t of takers.split(",").map(takerOf)) {
    const f = `${dir(set, "runs/")}${t.name}.jsonl`, done = new Set(readJsonl(f).filter((r: Row) => r.result !== "error").map((r: Row) => r.id));
    const todo = items.filter((it) => !done.has(it.id));
    console.error(`${t.name}: ${todo.length} to ask (${done.size} done)`);
    let stop = false;
    await mapPool(todo, async (it) => {
      if (stop) return;
      if (ledger.spent > CAP) { stop = true; console.error(`stopping: $${ledger.spent.toFixed(2)} spent (BENCH_CAP ${CAP})`); return; }
      const t0 = Date.now();
      try {
        const r = await askOpus([{ role: "user", content: promptOf(it, t.format) }], undefined, t.model);
        const s = scoreOf(it, r.text);
        appendFileSync(f, JSON.stringify({ id: it.id, taker: t.name, ...s, cost: r.cost, outTokens: (r.usage as any)?.output_tokens, finish: r.finish, ms: Date.now() - t0 } satisfies Row) + "\n");
      } catch (e) {
        const msg = (e as Error).message;
        if (/ledger would pass/.test(msg)) { stop = true; console.error(msg); return; }
        appendFileSync(f, JSON.stringify({ id: it.id, taker: t.name, result: "error", move: msg.slice(0, 300), cost: 0, ms: Date.now() - t0 } satisfies Row) + "\n");
      }
    }, num("--jobs", 8));
    console.error(`${t.name}: done; $${ledger.spent.toFixed(2)} spent so far`);
  }
}

// ======== the stand-in (dry runs) ========
/** A taker of skill p: a frontier move with probability p (more often on cheap items), else a mark
 *  chosen at random with a random value. */
async function dryCmd(set: string) {
  const items = loadItems(set);
  await loadTruths(items);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const [name, p] of [["standin-weak", 0.25], ["standin-mid", 0.5], ["standin-strong", 0.85]] as const) {
    const f = `${dir(set, "runs/")}${name}.jsonl`;
    writeFileSync(f, "");
    for (const it of items) {
      const easy = it.cost === null ? 0.5 : 1.2;
      const truth = solutionOf(it), knownSet = new Set(it.known.map(([m]) => m));
      let mv: MV | null;
      if (rnd() < Math.min(1, p * easy)) { const m = it.frontier[Math.floor(rnd() * it.frontier.length)]; mv = [m, truth.get(m) ?? false]; }
      else { const open = [...truth.keys(), ...it.frontier].filter((m) => !knownSet.has(m)); const m = open[Math.floor(rnd() * open.length)]; mv = m ? [m, rnd() < 0.5] : null; }
      const result = scoreMove(mv, (m) => truth.get(m) ?? false, knownSet, new Set(it.frontier));
      appendFileSync(f, JSON.stringify({ id: it.id, taker: name, result, move: mv, cost: 0, ms: 0 } satisfies Row) + "\n");
    }
  }
  report(set);
}

// ======== report ========
/** Rasch (one-parameter) fit by joint maximum likelihood: P(pass) = σ(θ_taker − b_item). Items every
 *  taker passes or every taker fails carry no information and are left out (counted). */
export function rasch(pass: (0 | 1 | null)[][], iters = 500): { theta: number[]; b: number[]; kept: number[] } {
  const T = pass.length, I = pass[0]?.length ?? 0;
  const kept = [...Array(I).keys()].filter((i) => { const v = pass.map((r) => r[i]).filter((x) => x !== null); return v.length > 1 && v.some((x) => x === 1) && v.some((x) => x === 0); });
  const theta = new Array(T).fill(0), b = new Array(I).fill(0), sig = (x: number) => 1 / (1 + Math.exp(-x));
  for (let n = 0; n < iters; n++) {
    for (let t = 0; t < T; t++) { let g = 0, h = 0; for (const i of kept) { const x = pass[t][i]; if (x === null) continue; const p = sig(theta[t] - b[i]); g += x - p; h += p * (1 - p); } if (h) theta[t] = Math.max(-6, Math.min(6, theta[t] + g / h)); }
    for (const i of kept) { let g = 0, h = 0; for (let t = 0; t < T; t++) { const x = pass[t][i]; if (x === null) continue; const p = sig(theta[t] - b[i]); g += p - x; h += p * (1 - p); } if (h) b[i] = Math.max(-6, Math.min(6, b[i] + g / h)); }
    const mean = kept.reduce((s, i) => s + b[i], 0) / (kept.length || 1);
    for (const i of kept) b[i] -= mean;
    for (let t = 0; t < T; t++) theta[t] -= mean;
  }
  return { theta, b, kept };
}
const spearmanXY = (x: number[], y: number[]) => {
  const rank = (v: number[]) => { const o = v.map((x2, i) => [x2, i]).sort((a, b2) => a[0] - b2[0]), r = new Array(v.length); for (let k = 0; k < o.length;) { let e = k; while (e + 1 < o.length && o[e + 1][0] === o[k][0]) e++; for (let q = k; q <= e; q++) r[o[q][1]] = (k + e) / 2; k = e + 1; } return r; };
  const rx = rank(x), ry = rank(y), n = x.length, mx = rx.reduce((a, b2) => a + b2, 0) / n, my = ry.reduce((a, b2) => a + b2, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
const pct = (k: number, n: number) => { if (!n) return "–"; const [a, b] = wilson(k, n); return `${Math.round((100 * k) / n)}% (${Math.round(100 * a)}–${Math.round(100 * b)})`; };

function report(set: string) {
  const items = loadItems(set), idx = new Map(items.map((it, i) => [it.id, i]));
  const runs = existsSync(dir(set, "runs/")) ? readdirSync(dir(set, "runs/")).filter((f) => f.endsWith(".jsonl")).sort() : [];
  const takers = runs.map((f) => f.replace(/\.jsonl$/, ""));
  const rows = runs.map((f) => { const m = new Map<string, Row>(); for (const r of readJsonl(`${dir(set, "runs/")}${f}`) as Row[]) if (r.result !== "error" || !m.has(r.id)) m.set(r.id, r); return m; });
  // tiers by the solver's cost of the cheapest step (thirds; case-split-only items on top)
  const costs = items.map((it) => it.cost ?? Infinity), sorted = [...costs].sort((a, b) => a - b);
  const cut = [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
  const tierOf = (it: BenchItem) => (it.cost === null ? "split" : it.cost < cut[0] ? "cheap" : it.cost < cut[1] ? "middle" : "dear");
  const tiers = ["cheap", "middle", "dear", "split"];
  const anchorOf = (it: BenchItem) => it.anchor.level ?? it.anchor.rating;
  const levels = [...new Set(items.map(anchorOf).filter((x) => x !== undefined))].sort() as number[];
  const L: string[] = [`# Calibration benchmark: ${set}`, "", `${items.length} stuck states from ${new Set(items.map((it) => it.id.split("#")[0])).size} puzzles; ${takers.length} test-takers. A pass is a true move on the frontier; a leap is true but off it; wrong includes moves already decided the other way.`, ""];
  L.push("| taker | n | pass | leap | wrong | stuck/none | errors | $ | out tokens (mean) |", "|---|---|---|---|---|---|---|---|---|");
  takers.forEach((t, k) => {
    const rs = [...rows[k].values()].filter((r) => idx.has(r.id)), n = rs.filter((r) => r.result !== "error").length, c = (f: (r: Row) => boolean) => rs.filter(f).length;
    const out = rs.filter((r) => r.outTokens).map((r) => r.outTokens!);
    L.push(`| ${t} | ${n} | ${pct(c((r) => r.result === "success"), n)} | ${pct(c((r) => r.result === "correct"), n)} | ${pct(c((r) => r.result === "wrong"), n)} | ${pct(c((r) => r.result === "stuck" || r.result === "none" || r.result === "already"), n)} | ${c((r) => r.result === "error")} | ${rs.reduce((s, r) => s + r.cost, 0).toFixed(2)} | ${out.length ? Math.round(out.reduce((a, b) => a + b, 0) / out.length) : "–"} |`);
  });
  L.push("", "## Pass by solver tier", "", `Tiers by the cheapest step's cost (cuts ${cut.map((x) => x.toFixed(2)).join(", ")}); split = only a case split decides anything.`, "", `| taker | ${tiers.map((x) => `${x} (${items.filter((it) => tierOf(it) === x).length})`).join(" | ")} |`, `|---|${tiers.map(() => "---").join("|")}|`);
  takers.forEach((t, k) => L.push(`| ${t} | ${tiers.map((x) => { const rs = items.filter((it) => tierOf(it) === x).map((it) => rows[k].get(it.id)).filter((r) => r && r.result !== "error"); return pct(rs.filter((r) => r!.result === "success").length, rs.length); }).join(" | ")} |`));
  if (levels.length) {
    L.push("", "## Pass by the human rating (Thinky: the author's level; puzz.link and PSJP: the site's difficulty)", "", `| taker | ${levels.map((l) => `${l} (${items.filter((it) => anchorOf(it) === l).length})`).join(" | ")} |`, `|---|${levels.map(() => "---").join("|")}|`);
    takers.forEach((t, k) => L.push(`| ${t} | ${levels.map((l) => { const rs = items.filter((it) => anchorOf(it) === l).map((it) => rows[k].get(it.id)).filter((r) => r && r.result !== "error"); return pct(rs.filter((r) => r!.result === "success").length, rs.length); }).join(" | ")} |`));
  }
  // the fit
  const pass = takers.map((_, k) => items.map((it) => { const r = rows[k].get(it.id); return !r || r.result === "error" ? null : r.result === "success" ? 1 : 0; })) as (0 | 1 | null)[][];
  if (takers.length >= 2) {
    const fit = rasch(pass);
    L.push("", "## Item response fit (Rasch)", "", `${fit.kept.length} of ${items.length} items carry information (the rest every taker passed or every taker failed: ${items.length - fit.kept.length}). θ is on the logit scale, items centred at 0.`, "", "| taker | θ |", "|---|---|");
    takers.map((t, k) => [t, fit.theta[k]] as const).sort((a, b) => b[1] - a[1]).forEach(([t, th]) => L.push(`| ${t} | ${th.toFixed(2)} |`));
    const withLevel = fit.kept.filter((i) => anchorOf(items[i]) !== undefined);
    if (withLevel.length > 5) L.push("", `Item difficulty b against the human rating: Spearman ${spearmanXY(withLevel.map((i) => fit.b[i]), withLevel.map((i) => anchorOf(items[i])!)).toFixed(2)} (n = ${withLevel.length} items; puzzles repeat, so this overstates n).`);
    const withCost = fit.kept.filter((i) => items[i].cost !== null);
    if (withCost.length > 5) L.push(`Item difficulty b against the solver's cheapest-step cost: Spearman ${spearmanXY(withCost.map((i) => fit.b[i]), withCost.map((i) => items[i].cost!)).toFixed(2)} (n = ${withCost.length}).`);
    const both = new Map<string, [number, number]>();
    takers.forEach((t, k) => { const base = t.replace(/-(grid|listed)$/, ""), f = t.endsWith("-listed") ? 1 : 0; const v = both.get(base) ?? [NaN, NaN]; v[f] = fit.theta[k]; both.set(base, v); });
    const gaps = [...both].filter(([, v]) => v.every(Number.isFinite));
    if (gaps.length) { L.push("", "## Perception cost (θ listed − θ grid)", "", "| model × effort | gap |", "|---|---|"); for (const [b, [g, l]] of gaps) L.push(`| ${b} | ${(l - g).toFixed(2)} |`); }
  }
  // per item: who passes (the tier pilot's input)
  const both0 = items.filter((_, i) => pass.every((r) => r[i] === 1)).length, none0 = items.filter((_, i) => pass.every((r) => r[i] === 0)).length;
  L.push("", `Items every taker passed: ${both0}; every taker failed: ${none0}.`);
  writeFileSync(`${dir(set)}report.md`, L.join("\n") + "\n");
  console.log(L.join("\n"));
}

async function show(set: string, id?: string, format: Format = "grid") {
  const items = loadItems(set), it = items.find((x) => x.id === id) ?? items[0];
  console.log(promptOf(it, format));
  console.log(`\n(frontier: ${it.frontier.length} marks; cheapest cost ${it.cost ?? "split"}; ${it.kind})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "items") await itemsCmd(argv[1] ?? "thinky");
  else if (cmd === "ask") await askCmd(argv[1], argv[2]);
  else if (cmd === "dry") await dryCmd(argv[1] ?? "examples");
  else if (cmd === "show") await show(argv[1] ?? "thinky", argv[2], (argv[3] as Format) ?? "grid");
  else report(argv[1] ?? "thinky");
}
