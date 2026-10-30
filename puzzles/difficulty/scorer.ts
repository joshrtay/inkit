// The deduction solver as an AI-creator scorer (puzzles/ai/score.ts's `Scorer`). Difficulty comes
// from the solve path (deduce.ts: step costs by smallest explanation, combined by soft-max, plus
// rule load); quality still comes from another scorer (proxyScorer by default), whose cheap
// checks (clue density, symmetry, every clue kind needed) the deduction solver doesn't repeat.
//
// Not wired into the personas yet: to try it, pass `deductionScorer` where week.ts takes a Scorer.
// What is wired in is `checkedScorer`: proxyScorer with the bad-puzzle checks (quality.ts).
import { proxyScorer, type Scorer } from "../ai/score.ts";
import { assess, type AssessOptions } from "./assess.ts";
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

/** The generator's budget for one candidate's assessment: a few candidates per post, so smaller than
 *  the site batch's (assess.ts SITE_BUDGET). A solve that doesn't finish keeps base's quality. */
export const GENERATOR_BUDGET: AssessOptions = { budgetMs: 15000, capMs: 30000, redundancy: false };

/** base's scorer with the bad-puzzle checks (quality.ts: dull, guessing, grind) taking their share off
 *  its quality, so a dull or guessy candidate loses to a clean one; one with a kind of clue or an
 *  added rule that does nothing is rejected. The assessment rides along on the score (`assessment`), for the site to store with the post:
 *  the solver's difficulty there is the game's when the solve finished. Difficulty for picking the
 *  candidate stays base's (scaled to the persona's sizes, as its targets are). */
export function withQualityChecks(base: Scorer, opts: AssessOptions = GENERATOR_BUDGET): Scorer {
  return async (c, persona, slot) => {
    const score = await base(c, persona, slot);
    if (score.quality <= 0) return score;
    try {
      const a = await assess(c.spec, opts);
      // the checks rank candidates but don't reject one on their own, except for a kind of clue
      // or rule that does nothing: splits and grind are provisional, and a type the solver splits
      // on everywhere would otherwise lose its posts
      const idle = (a.measures.idleKinds ?? 0) > 0;
      const quality = idle ? 0 : Math.max(Math.min(score.quality, persona.quality.minQuality), score.quality - (1 - a.quality));
      if (idle) score.notes.push("rejected: a kind of clue or rule does nothing");
      if (a.flags.length) score.notes.push(...a.flags.map((f) => `checks: ${f}`));
      return {
        ...score, quality, assessment: a,
        measures: { ...score.measures, solverEstimate: a.estimate ?? -1, solved: a.solved ? 1 : 0, checks: a.quality },
      };
    } catch (e) {
      score.notes.push(`quality checks failed: ${(e as Error).message.slice(0, 120)}`);
      return score;
    }
  };
}

/** proxyScorer with the bad-puzzle checks: the AI creators' default (week.ts, backfill.ts). */
export const checkedScorer: Scorer = withQualityChecks(proxyScorer);
