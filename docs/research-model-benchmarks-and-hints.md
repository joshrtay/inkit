# Model benchmarks and hint ladders (2026-10-23 to 2026-10-25)

This doc collects the results of the calibration benchmark ([research-calibration-benchmarks.md](research-calibration-benchmarks.md)) and the walkthrough plan's hint test ([research-walkthrough-loop.md](research-walkthrough-loop.md), "Hints"), and what they mean for building hint ladders.

The code is `puzzles/difficulty/bench.ts` (stuck states), `bench-solve.ts` (whole solves, hint-to-solve, chapter ladders), `walkthrough-hints.ts` (the hint test) and `ladder_order.py` (chapter order from the human-move network). Raw runs stay out of the repo, because the Thinky Dailies puzzles and hints are private. Only aggregates appear here.

Total spend was about $320 in API calls. Josh approved each stage over $20.

Models: Haiku 5.5, Sonnet 5.5 and Opus 5.5, each at low or high effort, with the grid drawn as text unless the text says otherwise.

## 1. How models solve puzzles

**Stuck states.** These are the reader's closure at a stuck point, with one solver step or a short case split deciding the next move.
- Thinky Dailies: 128 items. Haiku low passes 58%, Sonnet low 63%, Haiku high 73%, Opus high 83% (96% counting correct leaps).
- puzz.link: 199 items. Haiku low 50%, Opus high 89%.
- Rasch fits rank the setups clearly. But item difficulty barely tracks the human rating: Spearman 0.34 on Thinky, 0.14 on puzz.link, and slightly negative against the solver's step cost. **Stuck states rank models. They don't anchor them to people.**
- Perception cost: giving a listing of the cells instead of the drawn grid raises low-effort setups by 0.8 to 1.8 logits. Models lose a real share of their ability just reading the grid.

**Whole solves.** The model lists every move it is sure of, turn by turn, from the empty grid, and the first wrong move drops the rest of that turn. Share of puzzles solved:

| setup | puzz.link (70, bands 1–5) | Thinky (63, levels 1–4) | $ per puzz.link puzzle |
|---|---|---|---|
| Haiku low | 31% | 41% | 0.01 |
| Haiku high | 54% | 73% | 0.03 |
| Sonnet low | 26% | 46% | 0.07 |
| Sonnet high | 84% | 95% | 0.23 |
| Opus low | 57% | 79% | 0.39 |
| Opus high | 93% | 95% | 0.38 |

- **Whole solves follow human difficulty.** On puzz.link, every setup solves fewer puzzles as the band rises (Opus high goes 100, 100, 93, 93, 79 from band 1 to band 5; Sonnet high 100, 100, 86, 71, 64). Whole solves on puzz.link are the benchmark of record.
- **Effort matters more than model size.** Sonnet low is below Haiku high everywhere. Opus low costs as much as Opus high, because it takes many more turns, and solves far less.
- **Thinky is saturated at the top.** Sonnet high and Opus high both solve 95%, so Thinky only separates the weaker setups.
- **Contamination check:** asked for the hints of 12 Thinky puzzles from their titles alone, Opus recalled nothing beyond chance word overlap.
- Weak-model solve rate as a difficulty proxy (review idea 6, in [research-review-ideas-2026-10-24.md](research-review-ideas-2026-10-24.md)): 0.58 against Thinky's levels, against 0.46 for the solver estimate.

## 2. The authors' hint ladders (Thinky)

- A hint is revealed after a wrong move or a turn with no progress.
- With a 12-turn limit, the authors' ladders seemed to add only 7 to 11 points. **That was the limit, not the hints:** the weak setups ran out of turns before they ran out of rungs.
- With room for every rung, the gains are large:
  - Sonnet low: 47% to 77%
  - Haiku low: 41% to 60%
  - Haiku high: 73% to 86%
  - Opus low: 75% to 97%
- Strong setups barely ask. Opus high and Sonnet high used about 4% of the ladder.
- What the authors' ladders look like (220 puzzles, 1,783 hints):
  - About 7 hints per puzzle, a median of 30 words each. Ladder length tracks difficulty (rho 0.69).
  - 41% open with a theme for the whole solve rather than a place.
  - The rest walk the solve in order, one key idea per hint, usually stating the conclusion plainly.
  - Routine filling gets one line.
  - Some ideas are split across two hints: first a pointer, then the reason.
  - They aren't vague-to-specific ladders for a single step.

## 3. Which kind of hint helps a stuck solver (H1, H2)

**Setup (H2).**
- 100 stuck states from puzz.link bands 3 to 5.
- Opus writes every hint kind in one call per state, in two versions: grounded (shown the solver's frontier) and free.
- Students: Haiku low (3 repeats) on both versions, and Sonnet low (2 repeats) on the grounded hints.
- Success means the student's move is true and on the frontier.

**Changes since H1.**
- Explain now ends on the one cell it decides.
- A frontier cell named inside a hypothetical ("if r3c4 were …?") now counts as *posits a value*, not a leak.
- A parser bug in the first H1 pass dropped every Opus hint. It is fixed.

| hint | Haiku, free | Haiku, grounded | Sonnet, grounded |
|---|---|---|---|
| none | 51% | 52% | 62% |
| solver "look at row 3" | 63% | 60% | 70% |
| Opus location | 67% | 72% | 82% |
| Opus question | 72% | 67% | 86% |
| Opus technique | 59% | 55% | 73% |
| Opus what-if | 73% | 69% | 84% |
| library nudge + question | 75% | 74% | 87% |
| ladder (up to 4 rungs) | 90% | 94% | 98% |
| explain (the answer) | 58% | 58% | 71% |

Results, against the plan's decision rules:

- **The language model is needed.** The library arm beats the solver's free hint by 10 to 17 points, and grounded location by 12, with paired intervals above zero. The solver's hint alone still adds 8 to 11 points.
- **Write location hints grounded.** Grounded location adds 12 points over the solver's hint; free location adds only 3. For the other hint kinds, grounding makes no consistent difference.
- **The library writes the best fair hint.** Its arm takes the general nudge of one of the 20 seed patterns (`walkthrough-seed.json`) and adds Opus's question for the spot. It is the best hint that doesn't give the answer, for both students. Templated questions are good enough.
- **The ladder is worth its turns.** It succeeds 90 to 98% of the time, in 1.6 to 1.9 rungs on average.
- **Explain is a poor ceiling.** Students pass on a long full explanation more often than on a short hint.
- Writing every hint kind costs 3 to 6 cents per stuck point.

**The library gate** compared seed-only against no library, on 10 Akari walkthroughs. It couldn't separate them: every walkthrough was already clean in both arms.

## 4. Automatic chapter ladders

**Construction (`bench-solve.ts ladders`).**
1. The solver lists the solve's key steps: the steps a reader at the default ceiling can't take, at most 12, in order.
2. Opus is shown the puzzle, those steps and the 20 patterns. It writes a theme line, plus chapters, one per key idea. Each chapter has three depths: *look* (where), *idea* (the kind of reasoning plus a question) and *step* (what follows, stated plainly). Each chapter also names one mark it decides.
3. The solver checks that mark.

On 63 Thinky puzzles this produced 6.6 chapters per puzzle, with all 416 claimed marks true, for 13 cents a puzzle.

**Our ladders against the authors'.** Haiku low whole solves on 62 puzzles, every run given room for every rung:

| ladder | solved |
|---|---|
| none | 42% |
| authors' | 61% |
| ours, flattened | 68% |

Ours won 6 puzzles the authors' ladders didn't, against 2 the other way; that edge isn't significant. But the flattened version is 22 rungs against the authors' 6.

**Chapter order doesn't matter to Haiku.** On 51 puzzles, the same chapters in four orders: the solver's order, the solver's order rerun, the order of the relations-tuned human-move network (Kendall tau only 0.21 against the solver's), and reversed. They solved 36, 34, 34 and 34. The last three solved exactly the same puzzles. Rungs stay on screen once shown, and Haiku uses whichever one applies. Order needs data from people.

**Which hints cut later hint use.** Chapter mode: the theme first, then the current chapter's next depth, skipping chapters the student has already passed. Haiku low, 62 puzzles:

| depths per chapter | solved | hints per puzzle | answers given (step reveals) |
|---|---|---|---|
| step only | 37 | 3.8 | 191 |
| idea, step | 37 | 5.6 | 137 |
| look, step | 38 | 5.4 | 127 |
| look, idea, step | 38 | 7.6 | 113 |
| authors' ladders | 38 | 4.7 | – |

- **The solve rate doesn't move; the hints spent do.** For Haiku the question is cost.
- **Early rungs cut the late ones.** Look plus idea means 41% fewer answers given than step only.
- **Look earns the most per reveal:** about 0.38 answers avoided per look shown, against 0.31 per idea. The two overlap.
- **Theme, look, step is the efficient ladder.** It gives the answer about a third less often than step only, for 1.6 more hints per puzzle.
- **Step only matches the authors' ladders** (37 against 38 solved) with fewer hints (3.8 against 4.7).

## What to build

1. **One chapter ladder per puzzle**, written when the puzzle is made:
   - the solver's key steps go in, Opus writes the chapters with grounding, and the solver checks every chapter's mark;
   - the hint button reveals the theme, then the current chapter's look, idea and step;
   - chapters the player has passed fold away.
2. **Default depths: look, then step.** Keep idea as an option. For people it may matter more than it does for Haiku, since it keeps the player doing the reasoning.
3. **Use the library's 20 patterns to name the idea.** Players then see the same technique names across puzzles and genres.
4. **Model students can't settle order or how a hint feels.** Those need the inkit A/B test, logging the next move and its time after each hint, with arms for the solver's hint, the grounded location hint and the chapter ladder.

## Caveats

- One run per arm in most comparisons; reruns varied by about ±2 solves out of 62.
- Haiku and Sonnet are proxies for stuck people, and weak ones (the review's point 10).
- Leak and posit are text heuristics.
- puzz.link states have no human move order, so "the person's next" is empty.
- Thinky is one setter's ratings and hints.
