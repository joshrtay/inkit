// The intended path's features (docs/research-state.md, "the intended path"): a setter builds
// around a path a person can follow, with no guessing, usually one hinge and every clue
// load-bearing. Read off the solver's min-peak path (deduce.ts, Options.minPeak with maxTier 1):
// each round takes only the cheapest steps, the wider windows only when nothing cheap is open.
//
//   peak       the hardest step's cost (the path's bottleneck)
//   noSplit    1 when it solves with no case split (else the solver lacks a technique, or the
//              puzzle is meant to be guessed)
//   hinges     rounds whose cheapest step costs half again the median round's or more: the
//              moments a harder look was needed, read against the puzzle's own steps
//   stuck      rounds with no tier-0 step open (one window, one unit) per round
//   peakRounds rounds whose cheapest step is within 0.5 of the peak: one hinge, or several alike
//   gap        the peak less the next-hardest round's cheapest step: how far the hinge stands out
//   peakAt     where the first peak step falls, 0 (the start) to 1 (the end)
//   usage      the share of the puzzle's rule instances (clues, rows, areas) the path's
//              explanations cite: a setter's puzzle uses every clue
//   openMean   the tier-0 steps open per round; oneWay the share of rounds with just one
//   dSteps     the steps' costs combined by soft-max (the solver's difficulty before rule load)
import type { Profile, Step } from "./deduce.ts";

export interface Intended {
  peak: number; noSplit: number; hinges: number; stuck: number; peakRounds: number; gap: number; peakAt: number;
  usage: number; openMean: number; oneWay: number; steps: number; rounds: number; dSteps: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);

export function intendedOf(path: Step[], profile: Profile, usage?: { used: number; of: number }): Intended {
  const real = path.filter((s) => !s.choice);
  const byRound = new Map<number, Step[]>();
  for (const s of real) { const r = s.round ?? 0; if (!byRound.has(r)) byRound.set(r, []); byRound.get(r)!.push(s); }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  // each round's cheapest step: what that moment demanded
  const need = rounds.map((r) => Math.min(...byRound.get(r)!.map((s) => s.cost)));
  const open = rounds.map((r) => byRound.get(r)![0].open ?? 0);
  const peak = real.length ? Math.max(...real.map((s) => s.cost)) : 0;
  const sorted = [...need].sort((a, b) => b - a);
  const first = real.findIndex((s) => s.cost === peak);
  const median = [...need].sort((a, b) => a - b)[Math.floor(need.length / 2)] ?? 0;
  return {
    peak,
    noSplit: profile.solved && real.every((s) => s.tier < 2) ? 1 : 0,
    hinges: need.filter((x) => x >= 1.5 * median).length,
    stuck: +(open.filter((o) => o === 0).length / (open.length || 1)).toFixed(3),
    peakRounds: need.filter((x) => x >= peak - 0.5).length,
    gap: +((sorted[0] ?? 0) - (sorted[1] ?? 0)).toFixed(2),
    peakAt: +(Math.max(0, first) / Math.max(1, real.length - 1)).toFixed(2),
    usage: usage?.of ? +(usage.used / usage.of).toFixed(3) : NaN,
    openMean: +mean(open).toFixed(2),
    oneWay: +(open.filter((o) => o === 1).length / (open.length || 1)).toFixed(3),
    steps: real.length, rounds: rounds.length, dSteps: profile.dSteps,
  };
}
