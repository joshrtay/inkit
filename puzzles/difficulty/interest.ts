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
