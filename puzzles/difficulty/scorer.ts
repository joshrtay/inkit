// The deduction solver as an AI-creator scorer (puzzles/ai/score.ts's `Scorer`). Difficulty comes
// from the solve path (deduce.ts: step costs by smallest explanation, combined by soft-max, plus
// rule load); quality still comes from another scorer (proxyScorer by default), whose cheap
// checks (clue density, symmetry, every clue kind needed) the deduction solver doesn't repeat.
//
// Not wired into the personas yet: to try it, pass `deductionScorer` where week.ts takes a Scorer.
import { proxyScorer, type Scorer } from "../ai/score.ts";
import { deduce, type Options, type Step } from "./deduce.ts";

/** The last deduction path found for a candidate's spec, for scorers built on this one (the lesson
 *  checks in puzzles/ai/lesson.ts read which rules each step used). */
export const deductionPaths = new WeakMap<object, Step[]>();

/** A scorer whose difficulty is the deduction solver's estimate (0..1, the same scale for every
 *  persona: not stretched to each persona's size range as proxyScorer's is), with quality and
 *  notes from `base`. If the solver fails or runs out of time, base's difficulty stands. */
export function withDeductionDifficulty(base: Scorer, opts: Options = { budgetMs: 10000 }): Scorer {
  return async (c, persona, slot) => {
    const score = await base(c, persona, slot);
    try {
      const { profile, path } = await deduce(c.spec, opts);
      deductionPaths.set(c.spec, path);
      if (!profile.solved) { score.notes.push(`deduction solver: unsolved (${profile.notes.join("; ")}); kept ${score.difficulty.toFixed(2)}`); return score; }
      const hardest = Object.entries(profile.bands).filter(([, n]) => n).map(([b, n]) => `${n} ${b}`).join(", ");
      score.notes.push(`deduction: ${profile.steps} steps (${hardest}), hardest step costs ${profile.maxCost}, rule load ${profile.ruleLoad} (${profile.ruleItems.join(", ")})`);
      return {
        ...score,
        difficulty: profile.estimate,
        measures: { ...score.measures, proxyDifficulty: +score.difficulty.toFixed(3), dSteps: profile.dSteps, maxCost: profile.maxCost, ruleLoad: profile.ruleLoad, steps: profile.steps, deduceMs: profile.ms },
      };
    } catch (e) {
      score.notes.push(`deduction solver failed: ${(e as Error).message.slice(0, 120)}; kept ${score.difficulty.toFixed(2)}`);
      return score;
    }
  };
}

/** proxyScorer's quality checks with the deduction solver's difficulty. */
export const deductionScorer: Scorer = withDeductionDifficulty(proxyScorer);
