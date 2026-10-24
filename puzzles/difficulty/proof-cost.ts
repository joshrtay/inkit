// The cost model's terms over a whole proof (docs/research-trajectory.md, "the objective"), read
// off a proof kept by proof-paths.ts. Each term is computed on its own, so the checks in
// proof-cost-fit.ts can weigh them separately and they can disagree. Versioned: the terms are
// relative to the solver's vocabulary of techniques (its windows, lemmas and prices), so costs
// from different versions are never compared.
//
//   sum, peak          v0: the step costs' sum and the hardest step (phase 0)
//   size               rule instances and earlier facts the explanations cite, over the proof
//   perMark            sum and size per decided mark (the board's size taken out)
//   reuse              how much the proof compresses when a step shape seen before is cited, not
//                      paid again: 1 − description length / sum (0 nothing repeats)
//   shapes             distinct shapes among the non-trivial steps
//   span               the hardest steps' reach on the board: each step's window bounding box over
//                      the board's diagonal, cost-weighted
//   jump               how far attention moves: consecutive steps' centres apart, over the diagonal
//   splits             case splits (tier 2), and their share of the steps
//   hinges, gap, peakAt, peakRounds   the intended path's shape (intended.ts): rounds needing a
//                      harder look than usual, how far the peak stands out, where it comes
//   aha                after the peak round, how much cheaper the next rounds are than the median
//   dead               the longest run of rounds with at most one easy move open, over the rounds
//   openMean, oneWay   easy moves open per round; the share of rounds with one
//   busywork           the share of trivial steps (cost ≤ 2.5)
//   usage              the share of the puzzle's rule instances the explanations cite
import type { Proof, PStep } from "./proof-paths.ts";

export const COST_VERSION = "v1 (deduce.ts min-peak, maxTier 2, step-prices.json of 2026-10-15)";

export const TERMS = ["sum", "peak", "size", "sumPerMark", "sizePerMark", "reuse", "shapes", "span", "jump", "splits", "splitShare", "hinges", "gap", "peakAt", "peakRounds", "aha", "dead", "openMean", "oneWay", "busywork", "usage", "steps"] as const;
export type Term = (typeof TERMS)[number];
export type Terms = Record<Term, number>;

const TRIVIAL = 2.5;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

/** a step's window: its centre and bounding box diagonal, in cells */
export function geometry(s: PStep, cols: number) {
  if (!s.x.length) return { cx: NaN, cy: NaN, diag: 0 };
  const rs = s.x.map((c) => Math.floor(c / cols)), cs = s.x.map((c) => c % cols);
  const [r0, r1, c0, c1] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)];
  return { cx: (c0 + c1) / 2, cy: (r0 + r1) / 2, diag: Math.hypot(r1 - r0, c1 - c0) };
}

/** a step's size: the rule instances and earlier facts its explanation cites */
export const stepSize = (s: PStep) => s.cl.length + s.kf;

export function termsOf(p: Proof): Terms | null {
  if (!p.solved || !p.steps?.length) return null;
  const S = p.steps.filter((s) => !s.ch);
  const n = S.length, marks = S.reduce((a, s) => a + s.m.length, 0) || 1;
  const costs = S.map((s) => s.c), sum = costs.reduce((a, b) => a + b, 0), peak = Math.max(...costs);
  const size = S.reduce((a, s) => a + stepSize(s), 0);
  // reuse: a shape is paid in full once, then cited at log2(1 + shapes) bits a time
  const hard = S.filter((s) => s.c > TRIVIAL);
  const shapeSet = new Set(hard.map((s) => s.sh ?? `${s.c}`));
  const cite = Math.log2(1 + shapeSet.size);
  const seen = new Set<string>();
  let dl = 0;
  for (const s of S) {
    const k = s.sh ?? `${s.c}`;
    if (s.c <= TRIVIAL || !seen.has(k)) { dl += s.c; seen.add(k); } else dl += Math.min(s.c, cite);
  }
  // locality
  const diag = Math.hypot(p.rows, p.cols) || 1;
  const geo = S.map((s) => geometry(s, p.cols));
  const w = costs.map((c) => Math.max(0, c - TRIVIAL));
  const ws = w.reduce((a, b) => a + b, 0);
  const span = ws ? geo.reduce((a, g, i) => a + g.diag * w[i], 0) / ws / diag : 0;
  const jumps: number[] = [];
  for (let i = 1; i < geo.length; i++) if (Number.isFinite(geo[i].cx) && Number.isFinite(geo[i - 1].cx)) jumps.push(Math.hypot(geo[i].cx - geo[i - 1].cx, geo[i].cy - geo[i - 1].cy) / diag);
  // rounds
  const byRound = new Map<number, PStep[]>();
  for (const s of S) { if (!byRound.has(s.r)) byRound.set(s.r, []); byRound.get(s.r)!.push(s); }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const need = rounds.map((r) => Math.min(...byRound.get(r)!.map((s) => s.c)));
  const open = rounds.map((r) => byRound.get(r)![0].o);
  const med = median(need);
  const sorted = [...need].sort((a, b) => b - a);
  const firstPeak = S.findIndex((s) => s.c === peak);
  const peakRound = need.indexOf(Math.max(...need));
  const after = need.slice(peakRound + 1, peakRound + 4);
  let dead = 0, run = 0;
  for (const o of open) { run = o <= 1 ? run + 1 : 0; dead = Math.max(dead, run); }
  const splits = S.filter((s) => s.t >= 2).length;
  return {
    sum, peak, size, sumPerMark: sum / marks, sizePerMark: size / marks,
    reuse: sum ? 1 - dl / sum : 0, shapes: shapeSet.size,
    span, jump: jumps.length ? mean(jumps) : 0,
    splits, splitShare: splits / n,
    hinges: need.filter((x) => x >= 1.5 * med).length,
    gap: (sorted[0] ?? 0) - (sorted[1] ?? 0),
    peakAt: Math.max(0, firstPeak) / Math.max(1, n - 1),
    peakRounds: need.filter((x) => x >= peak - 0.5).length,
    aha: after.length && med ? (med - mean(after)) / med : 0,
    dead: dead / (open.length || 1),
    openMean: mean(open), oneWay: open.filter((o) => o === 1).length / (open.length || 1),
    busywork: costs.filter((c) => c <= TRIVIAL).length / n,
    usage: p.usage?.of ? p.usage.used / p.usage.of : NaN,
    steps: n,
  };
}
