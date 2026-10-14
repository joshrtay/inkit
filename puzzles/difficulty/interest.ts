// What might make a puzzle interesting, read off the deduction solver's path (deduce.ts): not how
// hard it is, but how its hard moments are placed (docs/research-interestingness.md; the
// conversation of October 2026: a technique used on purpose, a break-in, flow, little busywork).
//
//   busywork   share of steps that are trivial (cost ≤ 2.5)
//   hardShare  share of steps that are hard (cost ≥ 5)
//   stuck      rounds where no easy (tier-0) step was open, so a harder look was needed, per step
//   breakIn    the key step (the costliest) and what it unlocks: the easy steps in the next three
//              rounds, against the average round's
//   keyAt      where the key step falls, 0 (the start) to 1 (the end)
//   flow       the easy moves open per round: mean, spread, and the share of rounds with just one
//              (a single thread to follow) or with many (aimless)
//   theme      among the harder steps (cost ≥ 4), the share sharing the commonest kind of
//              explanation: 1 = one idea throughout
//   variety    kinds of explanation among the non-trivial steps
import type { Profile, Step } from "./deduce.ts";

export interface Interest {
  steps: number; busywork: number; hardShare: number; stuck: number;
  breakIn: number; keyAt: number; keyCost: number;
  flowMean: number; flowSpread: number; oneWay: number; aimless: number;
  theme: number; variety: number;
  estimate: number; ruleLoad: number; solved: boolean;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);

export function interestOf(path: Step[], profile: Profile): Interest {
  const real = path.filter((s) => !s.choice);
  const n = real.length || 1;
  const costs = real.map((s) => s.cost);
  // rounds: their open count, and the steps in them
  const byRound = new Map<number, Step[]>();
  for (const s of real) { const r = s.round ?? 0; if (!byRound.has(r)) byRound.set(r, []); byRound.get(r)!.push(s); }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const open = rounds.map((r) => byRound.get(r)![0].open ?? 0);
  const stuck = open.filter((o) => o === 0).length;
  // the key step and what it unlocks
  let key = 0;
  costs.forEach((c, i) => { if (c > costs[key]) key = i; });
  const keyRound = real[key]?.round ?? 0;
  const after = rounds.filter((r) => r > keyRound).slice(0, 3).map((r) => byRound.get(r)!.filter((s) => s.tier === 0).length);
  const easyPerRound = mean(rounds.map((r) => byRound.get(r)!.filter((s) => s.tier === 0).length)) || 1;
  const breakIn = mean(after) / easyPerRound;
  // theme and variety: explanations by their kinds
  const sig = (s: Step) => [...s.uses].sort().join("+") || "-";
  const harder = real.filter((s) => s.cost >= 4), counts = new Map<string, number>();
  for (const s of harder) counts.set(sig(s), (counts.get(sig(s)) ?? 0) + 1);
  const theme = harder.length ? Math.max(...counts.values()) / harder.length : 0;
  const variety = new Set(real.filter((s) => s.cost > 2.5).map(sig)).size;
  const flowMean = mean(open), flowSpread = Math.sqrt(mean(open.map((o) => (o - flowMean) ** 2)));
  return {
    steps: real.length,
    busywork: +(costs.filter((c) => c <= 2.5).length / n).toFixed(3),
    hardShare: +(costs.filter((c) => c >= 5).length / n).toFixed(3),
    stuck: +(stuck / n).toFixed(3),
    breakIn: +breakIn.toFixed(2), keyAt: +(key / Math.max(1, n - 1)).toFixed(2), keyCost: costs[key] ?? 0,
    flowMean: +flowMean.toFixed(2), flowSpread: +flowSpread.toFixed(2),
    oneWay: +(open.filter((o) => o === 1).length / (open.length || 1)).toFixed(3),
    aimless: +(open.filter((o) => o >= 6).length / (open.length || 1)).toFixed(3),
    theme: +theme.toFixed(2), variety,
    estimate: profile.estimate, ruleLoad: profile.ruleLoad, solved: profile.solved,
  };
}

/** A break-in, scored 0 to 1 (for the generator's preference at hard and expert, gen-set.ts): one
 *  costly step early or mid-solve, then a run of cheap ones, as hand-made puzzles have. Costs are
 *  read against the path's own median (each genre's steps cost differently). The key step is the
 *  costliest in the first three quarters of the path; the steps right after it that cost nearly as
 *  much (≥ 0.8 of it) are its burst, the same idea applied again. The score multiplies
 *  - how far it stands above the typical step: (its cost over the median − 1) / 1.5, at most 1;
 *  - the run after the burst: the share of the next ten steps no dearer than the median;
 *  - that it's the one: 1 less the share of the later steps (after the burst) nearly as costly;
 *  - where it falls: 1 from a twentieth to seven tenths of the way, half at the very start or later.
 *  A path of fewer than 6 real steps scores 0. */
export function breakInScore(path: Step[]): number {
  const real = path.filter((s) => !s.choice), n = real.length;
  if (n < 6) return 0;
  const costs = real.map((s) => s.cost), sorted = [...costs].sort((a, b) => a - b), median = sorted[Math.floor(n / 2)] || 1;
  const reach = Math.max(1, Math.floor(n * 0.75));
  let key = 0;
  for (let i = 1; i < reach; i++) if (costs[i] > costs[key]) key = i;
  const kc = costs[key], at = key / (n - 1);
  let end = key + 1;
  while (end < n && costs[end] >= 0.8 * kc) end++;
  const stand = Math.min(1, Math.max(0, (kc / median - 1) / 1.5));
  const next = costs.slice(end, end + 10);
  const run = next.length ? next.filter((c) => c <= median).length / next.length : 0;
  const later = costs.slice(end), rivals = later.length ? later.filter((c) => c >= 0.8 * kc).length / later.length : 0;
  const place = at >= 0.05 && at <= 0.7 ? 1 : 0.5;
  return +(stand * run * (1 - rivals) * place).toFixed(3);
}

/** How narrow a solve's thread is (docs/research-human-gap.md: hand-made puzzles hand over one or
 *  two easy moves at a time; ours open many at once and the solver sweeps them up), from the
 *  explained path as human_gap.py measures it:
 *  - flowPerCell: the easy (tier-0) moves open per round, per cell (interestOf's flowMean over the
 *    cells; human medians 0.004–0.09, ours 0.05–0.14);
 *  - factsPerStep: marks settled per step;
 *  - roundsPerCell: rounds per cell (more, in human solves). */
export interface Thread { flowPerCell: number; factsPerStep: number; roundsPerCell: number }

export function threadOf(path: Step[], cells: number): Thread {
  const real = path.filter((s) => !s.choice), open = new Map<number, number>();
  for (const s of real) if (!open.has(s.round ?? 0)) open.set(s.round ?? 0, s.open ?? 0);
  const c = Math.max(1, cells);
  return {
    flowPerCell: +(mean([...open.values()]) / c).toFixed(4),
    factsPerStep: +(real.length ? real.reduce((a, s) => a + s.facts.length, 0) / real.length : 0).toFixed(3),
    roundsPerCell: +(open.size / c).toFixed(4),
  };
}

/** Each candidate's thread score (gen-set.ts GEN_THREAD), 0 to 1, against the others for the same
 *  job: the narrowest gets 1. Half from open moves per cell, half from facts per step, each as the
 *  smallest among the candidates over its own (a little added to both, so 0 open moves doesn't
 *  divide by nothing). Relative, not absolute: the scales differ by genre and size, and the
 *  candidates share both. */
export function threadScores(ts: Thread[]): number[] {
  if (!ts.length) return [];
  const minFlow = Math.min(...ts.map((t) => t.flowPerCell)), minFacts = Math.min(...ts.map((t) => t.factsPerStep));
  return ts.map((t) => +(0.5 * (minFlow + 0.005) / (t.flowPerCell + 0.005) + 0.5 * (minFacts + 0.1) / (t.factsPerStep + 0.1)).toFixed(3));
}
