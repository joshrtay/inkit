# Research review, 24 October 2026

A reading of everything the research has established since 13 October, where the evidence is weaker
than the write-ups read, and the next experiments ranked by what they decide against what they cost.
Sources: [research-state.md](research-state.md), [research-ops.md](research-ops.md),
[research-trajectory.md](research-trajectory.md), merged PRs 1 to 23 and open PR 24, the project
files under research/, and project memory. Nothing here was run. The living copy, with comments, is
the Claude doc "Inkit research review"; this file is the snapshot of that day.

## The verdict in six lines

1. **The human move model is real but has no ceiling and one population.** The tuned network's 45 to
   49% top-3 agreement beats Opus (38%) and the solver (21%), but nobody knows what two people would
   score against each other, and every human move comes from seven Janko experts, a third of them
   one person.
2. **Difficulty on the fitted games is finished.** Three independent fits land at 0.65 to 0.66 on
   Puzzle Square JP, and raters there agree with other raters at 0.63 to 0.68. What remains is
   transfer to new games, region genres where solves stall, and players who are not experts.
3. **Elegance beyond difficulty is a settled null, five ways.** Clue usage (every clue does work) is
   the one survivor, and it matches the strongest complaint in Logic Masters comments, "dull". The
   pivot to faults is right.
4. **Aim 4 is a strong engineering result judged on one of its three guards.** Agreement with people
   and bits a move have not been measured since the speedups, the split share is known to undercount
   search, the dev set was tuned on, and the test gate has not run.
5. **Pricing, not technique-finding, is the bottleneck.** Joins, the component lemma and
   candidates-as-one-fact all fail the difficulty guard because their steps are unpriced, while the
   misses data says people use exactly those moves. The refit with the finish set on is named as
   "next" in three documents and has not happened.
6. **The highest-value items are free or nearly free:** an inter-person ceiling from repeat Janko
   solves, a size and ceiling audit, insight-grain scoring, and the price refit. The one product item
   that unblocks everything is solve logging on inkit.

## What is established, by aim

Status: **solid** = replicated or large n; **provisional** = small n, one sample, or post hoc;
**artifact risk** = a confound could explain it; **null** = a tested negative.

| Aim | Finding | Evidence | Status | Caveat |
|---|---|---|---|---|
| Human model | Network tuned on Janko moves predicts people best: top guess in the person's next 3 moves 45 to 49%; Opus 38%; solver 21%. Hidoku fixed by number-relation inputs (10 to 56%). | PR 2, 3; 400 states, 14 types | solid | No ceiling; one expert population; never reported per solver; the network's guesses only 86% correct. |
| Human model | People's next move is graded, not symbolic: nearness to the last move first, then the cheapest step, then kind of step. Library learning finds 0 to 6% beyond nearness; a readable logit recovers 19 to 103% of the network's gain. | Phase 1b, PR 4 | solid | Nearness may be the recorder's click order; test per solver. |
| Human model | Moves people make that the solver cannot without a case split: Hitori 93%, Hidoku 85%, Numberlink 91% of misses. | human-misses, up to 150 a type | solid | Points at connectivity and distance techniques; those exist in the finish set but fail the guard unpriced. |
| Human model | Opus writing a whole walkthrough: first move in the person's next 3 50%, 99% of moves correct; the gap to people is mostly marks people never write. | PR 13; n = 20 | provisional | ±20 points; overlaps the network's interval. |
| Human model | Experts follow the cheapest proof no better than the greedy path (0.57 vs 0.58), and no reward policy over the solver's menu beats cheapest-first on order. | PR 24 (open), PR 8 | solid | Experts leave big-explanation steps for later (+0.05 to +0.20): explanation size belongs in the price. |
| Difficulty | A fitted score reaches 0.65 to 0.66 within type on Puzzle Square JP against the solver's 0.51 to 0.54, whether fitted on simulated person + solver, solver + logic share, or proof-cost terms. | PR 6, 11, 24; n about 1,500 | solid | At the inter-rater ceiling (puzz.link vs PSJP 0.63 to 0.68). Size-only baseline never reported. |
| Difficulty | The fitted score does not transfer to new games; the plain solver estimate is as good or better there. Solver + logic share transfers best of the fits. | sim-new2, 2,319 puzzles | solid | "Game held out" was siblings (loop among loop). |
| Difficulty | Where solves stall (Nurikabe, Galaxies, Numberlink, Fillomino) nothing measures difficulty; stall pricing (unfinished above finished) helps Nurikabe +0.13, confirmed fresh. | PR 10, guard follow-ups | provisional | Numberlink's three stop prices were chosen after looking at all three samples (documented). |
| Difficulty | Janko levels are mostly grid size (Hidoku: cell count alone 0.72); a size term lifts Janko and fails PSJP on five samples. | PR 19, 21 | solid | Janko is a time-to-solve target, usable within size only. |
| Difficulty | LLM whole solves follow human bands (Opus high 100% in band 1 down to 79% in band 5; weak setups rho −0.45 to −0.8 on Thinky). Stuck states do not anchor to people (rho 0.06 to 0.17). | benchmark, $180 | solid | 14 puzzles a band; one run a setup. |
| Aim 4 | Dev set finished by 10/30/60 s went 3/14/50% to 21/64/86%; median 60 to 23 s. Nurikabe and Fillomino local encodings, Galaxies cell atoms, window-check and explanation fixes. | PR 10; dev 196 | artifact risk | Tuned on dev; test gate unrun; part is supplied answers; two of three human-style guards unmeasured; tier-2 splits hide search (Simple Loop 92%). |
| Aim 4 | Local encodings are speed wins, not difficulty gains (Nurikabe engine +0.09 vs local −0.02 held out). Candidates-as-one-fact fails fresh Sudoku (0.75 to 0.48) and Janko Hidoku. | guard follow-ups 6, 14 | solid | Good guard discipline here. |
| Hints | Opus hints judged correct and well graded; at stuck moments Opus's move is in the person's next 3 44% vs the solver's split 17%. Hint test with 10 arms is designed; H1 running. | labeller pilot; PR 14, 20 | provisional | Judged by models, not people. Student validity questionable (critique 10). |
| Hints | Thinky Dailies: 1,783 human hint ladders on 120 convertible puzzles; ladder length rho 0.69 with author difficulty. With every rung shown, the authors' ladders lift weak model setups a lot: Sonnet low 47% to 77%, Haiku low 41% to 60% (a second attempt, so part is the retry). | PR 15; benchmark | solid | Private data; 8 authors, one rating each. |
| Good and bad | Elegance beyond difficulty: compression concentration −0.04; Opus elegance 1.5 of 4 pairs; solver aha about 0 on 1,382 puzzles; proof-shape terms 0 on 719; comment "aha" +0.6 n.s. once flow is known. | Phase 1, PR 13, 22, 24 | null | The −0.15 that motivated the line did not replicate (+0.17 on 719). n = 72 misleads. |
| Good and bad | Clue usage (share of rule instances the proof cites) predicts likes beyond difficulty and size at 0.16; in Logic Masters comments "dull" costs 23 beauty points, non-unique 16, guessing 12, rating off 11, grind 8; flow, rules and learning carry praise. | PR 24; PR 22, 1,224 puzzles | provisional | Two sources agree. LMD is 85% Sudoku variants; "dull" is 42 puzzles. |
| Generation | Generated puzzles are separable from human ones at AUC 0.76 to 1.00, size left out; 10× generated volume did not move the human test. | human-gap, cross-type §13 | solid | Human data first; the learned generator is unneeded while creators supply puzzles. |

## Threads in flight (24 October)

Two threads were open when this was written. Both carry results that arrived after the write-ups
above, and two of those results change what the sections above say.

| Thread | State | Done since the write-ups | What it changes here |
|---|---|---|---|
| PR cleanup, benchmarks, walkthrough plan | Working; about $260 spent in all | Library gate ($2.55): seed-only no better than none on 10 Akari, but every walkthrough was already clean, so the test had no headroom. Thinky full-ladder rerun ($14): with every rung shown, Sonnet low 47% to 77%, Haiku low 41% to 60%, Haiku high 73% to 86%, Opus low 75% to 97% (a second attempt, so part of the gain is the retry). Hint test H1 running: 30 hard puzz.link stuck states, Opus writes grounded and free hints, Haiku low as student; a parsing bug dropped every Opus hint on the first pass, now fixed, about $5 to rerun. Hard-tier puzz.link items rebuilding (free). | The "weak setups read 42% of a ladder and gain little" figure was a turn-cap artifact: weak models do use human ladders. Critique 10 softens (the student can follow hints; the perception cost stands). Idea 12 is already running with Haiku low, so the format and effort corrections apply to H2. The library gate is uninformative, not a null: rerun it on puzzles the draft does not already clean, or drop it. |
| Trajectory phase 1: cost model | Blocked on review of PR 24 | Fit done 23 October: interest no-go, clue usage 0.16, experts no closer to the cheapest proof than greedy, difficulty v1 0.66 vs 0.54. Nothing else is owed. | Nothing new; the findings are in the table above. Merge it, and carry clue usage and explanation size into ideas 5 and 7. |

Every other thread is resolved, including the Aim 4 thread (closed 24 October with its test gate
unrun). The two threads in flight are both language-model benchmark and hint work, so none of the
Tier 1 or Tier 2 items below is in progress anywhere.

## Where the evidence is weaker than it reads

**1. One population, and a third of it one person.** All human moves are Janko's: about 6,700 solves
by 7 experienced solvers, Rainer 2,109 of them. The products are for inkit players, who include a
ten-year-old. The network is tuned on Janko and tested on held-out Janko by the same people, so
"agreement with people" is "agreement with these seven". No result reports agreement per solver, and
the dominant predictor, nearness, could be the recorder's click order as much as a habit.
*Fix:* report every agreement figure per solver (free). If nearness and the network's gain vary a lot
by solver, the model is a seven-person model and its product use needs inkit data.

**2. The headline 45% has no ceiling.** Nobody has measured how often one person's next move lands in
another person's next 3 on the same position. The walkthrough rescoring hints the ceiling is well
below 100: dropping marks people never write moved the network from 40% to 47%. Without a ceiling,
"45% vs 38%" says who is ahead but not how much room is left, so it cannot decide whether to keep
pushing the network.
*Fix:* about 6,700 solves cover about 5,200 puzzles, so some puzzles carry two or more recorded
solvers. Those pairs give the ceiling directly, for free. Check the count first.

**3. Difficulty on the fitted games is saturated.** Three fits with different features (simulated
person + solver 0.65, solver + logic 0.66, proof-cost terms 0.66) land on the same number. Puzzle
Square JP and puzz.link raters agree at 0.63 to 0.68 on shared puzzles. That is the ceiling. Every
further guard decision on Akari, Masyu, Slitherlink, Simple Loop and Hitori is tuning inside the
noise.
*Fix:* state each difficulty result as a fraction of its inter-rater ceiling, and move the effort to
new games, stall genres and non-expert players.

**4. Grid size is a lurking variable everywhere, not only in Janko.** Janko's size confound is
documented. Phase 1a found that likes beyond difficulty follow board size too. But no PSJP difficulty
table reports what cell count alone scores within type. If that is 0.3 to 0.4, several "gains" are
smaller than they look, and any size-correlated feature (steps, shapes, sum) inherits it.
*Fix:* a cells-only column beside every within-type Spearman, and partial correlations with size held
fixed (free, a day).

**5. The guard has low power and a forking-path history.** At 20 puzzles a type a Spearman has about
±0.2 sampling error, so a 0.1 drop on one type is invisible, and the one-sided rule only catches
gross harm. Many settings were judged on the same guard sample; the Numberlink stop prices were
chosen after looking at all three samples, and the per-type rule was rewritten after it flagged every
path change. All of this is documented honestly, which is the point: the record shows how easily the
rule bends.
*Fix:* pre-register the next gate (settings, samples, rule) before running it; use the frozen 400 test
set once; report how many comparisons each sample has already served.

**6. Aim 4 is judged on one of its three guards.** The plan set three divergence guards: difficulty
unchanged, agreement with people (at least 21%), and bits a move against the 300 s path (at most
+5%). Only the first has been run since the speedups. The fresh-split check shows tier-2 splits hide
search on five genres (Simple Loop 92%, Hitori 54%, Nurikabe 52%), so the opaque-share target is not
measurable with today's accounting. Dev-set numbers were tuned on, and part of the gain is supplied
answers, which is legitimate for published puzzles but is not a solver improvement.
*Fix:* run the two unmeasured guards and the honest split accounting before more speed work (about $5
of CPU), then the test gate once.

**7. Pricing is the bottleneck disguised as a technique problem.** The misses data says people use
connectivity in Hitori and distance in Hidoku. The solver has those techniques (joins, islands,
candidates-as-one-fact), and each fails the difficulty guard because its steps are unpriced or
mispriced, not because people do not take them. The guard anchors to today's prices, so it rejects
exactly the human moves the human model wants. The refit with the finish set on is "next" in
research-state, step 3 and Aim 4, and has not run.
*Fix:* the refit, with Tatham's expert labels, PSJP and Janko within size as targets, and explanation
size as a term (PR 24's finding). About $10 of CPU. This is the single biggest structural unblock.

**8. Small samples quoted as findings.** Walkthrough 20 states (±20 points); Hitori sim n = 29; "dull"
42 puzzles; Beast Academy 2 to 6 sets a type; Fable's interest 0.34 on 72 puzzles, never rerun at
scale; benchmark 14 puzzles a band; Thinky 63 (±12). The −0.15 path-feature baseline from 72 puzzles
drove a whole trajectory and came out +0.17 on 719. Treat any n under 100 as a pilot.

**9. The interest targets may be the problem, not the signal.** Likes per solver on one Japanese site
measure exposure and setter fame as much as taste; Logic Masters beauty is Sudoku variants near its
ceiling, rated by the commenters. Five nulls on these targets mean "no elegance signal recoverable
from these targets", which is weaker than "no elegance". The pivot to faults is the right response;
the risk is building a "flow" measure and testing it against the same two targets.

**10. A model student is a weak proxy for a stuck person.** The benchmark found a perception cost of
0.8 to 1.8 logits. The first Thinky run suggested weak setups gain little from hints, but the
full-ladder rerun (threads in flight) shows gains of 19 to 30 points, so they can follow hints. What
stands is that part of a model student's failure is reading the grid, not reasoning, and the test as
designed measures "can Haiku use a hint". Its decision rule (Opus hints must beat the solver's "look
here" by 10 points) is sound; its student is not.
*Fix:* give the student the listed format or Haiku at high effort, keep the Thinky human-ladder arm
as the reference, and plan the inkit A/B as the real test.

## Research ideas, ranked by what they decide against what they cost

Ranked by expected value per dollar and day. "OK" marks items that need Josh's spending approval;
everything in the first tier is free.

**Tier 1: free, days, each decides something**

| # | Idea | What it decides | Cost | OK |
|---|---|---|---|---|
| 1 | **Inter-person ceiling from repeat Janko solves.** Find puzzles with two or more recorded solvers; score solver A's next move against solver B's next 3 and the whole-order Spearman. | What 45% means; whether the network has room; a fair bar for Opus walkthroughs. | 1 day | no |
| 2 | **Size and ceiling audit.** Cells-only baseline and inter-rater ceiling beside every within-type figure (PSJP, puzz.link, Tatham, Janko, Beast Academy); partial correlations with size fixed. | Which gains survive; where difficulty work is finished. | 1 day | no |
| 3 | **Per-solver analysis.** Nearness weight, agreement and the network's gain for each of the seven Janko solvers. | Whether nearness is habit or recording; whether the model is a seven-person model. | 1 day | no |
| 4 | **Insight-grain scoring.** Segment each recorded solve into insights and bookkeeping (a move that follows by propagation from the previous ones is bookkeeping); score every predictor on the insights only; count bits per insight, not per move. | Whether the gap to people is bookkeeping (walkthroughs say so); gives hints their unit; may raise the ceiling and change the ranking of predictors. | 2 to 3 days | no |
| 5 | **Bad-puzzle check.** Unused clues and rules (dull), case splits on the cheapest path (guessing), long trivial runs (grind), estimate vs stated band (rating off). Validate against PSJP likes and LMD beauty with difficulty and size fixed, then put it in the editor and the generator. | The one surviving quality signal becomes a product; the first creator-facing output of the research. | 2 days CPU, then product | no |
| 6 | **Weak-model solve rate as a novice difficulty proxy.** The benchmark rows already hold Haiku and Sonnet solve rates per puzzle (rho −0.45 to −0.8 with Thinky ratings). Compare them with the solver's estimate on Thinky, puzz.link bands and Beast Academy's set order, where the estimate runs backwards (−0.57). | Whether novice difficulty differs from expert step cost, and whether a cheap model can stand in until inkit logs exist. | 1 day, no new spend | no |

**Tier 2: cheap cloud runs that unblock defaults**

| # | Idea | What it decides | Cost | OK |
|---|---|---|---|---|
| 7 | **Price refit with the finish set on.** Refit step prices with joins, islands, routes, unique, candidates-as-one-fact and complete explanations available; targets Tatham labels, PSJP and Janko within size; add explanation size as a term. Judge with a pre-registered gate on the frozen 400 set. | Whether human techniques can become default; removes the tension in critique 7. | about $10 CPU | yes |
| 8 | **Aim 4 honest guards and test gate.** Agreement with people and bits a move on the fast solver; splits counted as search when a fresh call needs choices; then the 400-puzzle test set once. | Whether Aim 4's speed cost human style; a number for the opaque share. | about $5 CPU | yes |
| 9 | **Difficulty for new games by family.** Solver + logic share fitted per family (loop, number, region), with Janko within size and Thinky ratings as extra targets; report against the cells-only baseline. | A default difficulty for the genres creators actually upload. | about $5 CPU | yes |

**Tier 3: the product item that unblocks everything**

| # | Idea | What it decides | Cost | OK |
|---|---|---|---|---|
| 10 | **Solve logging with consent on inkit.** Moves with timestamps, hint requests, undo, abandons, per puzzle and anonymous player; the solves table already stores duration per creator and game, so this extends it. Ship the schema and consent before any hint feature. | Every blind spot above: a second population, an inter-person ceiling, novice difficulty from times, the hint A/B, puzzle selection by bandit. Nothing else gives these. | Engineering, no spend | no |
| 11 | **Hint A/B on inkit** once logging exists: the solver's "look here" against one Opus ladder, with the next move and its time logged. | The real hint test; the first human hint data. | Product, plus API per hint | yes |

**Tier 4: model spend, worth it with the fixes above**

| # | Idea | What it decides | Cost | OK |
|---|---|---|---|---|
| 12 | **Hint test H1, corrected.** H1 is running now in the benchmarks thread with Haiku low on 30 hard puzz.link states. For H2: student in the listed format or Haiku high; Thinky human ladders as the reference arm; same decision rule (Opus must beat solver-where by 10 points). | Whether a language model is needed to write hints, or only to check them. | about $10 API | yes |
| 13 | **Opus walkthroughs at 100 to 200 states**, scored on insights (idea 4), on marks people make, and per solver, against the ceiling from idea 1. | Whether walkthroughs are a training signal for the human model and a hint source; today it is a 20-state hint. | about $25 to 50 API | yes |
| 14 | **Model-written techniques** for Nurikabe, Spiral Galaxies and Hitori connectivity, as clingo rules proved sound and kept only if they cut splits on the dev set (Aim 4 step 5), after the price refit so they can be priced. | Whether the stall genres can be reached without search. | about $20 to 50 API plus CPU | yes |

## Stop or pause

- **Elegance from likes or beauty.** Five nulls on the same two targets. Reopen only with inkit's own
  signals.
- **Per-type guard tuning on the five fitted PSJP games.** Inside the inter-rater noise.
- **Open-weight models as label substitutes** (26 to 27% vs the network's 45%), **RL or reward
  variants on the solver's menu** (no policy beats cheapest-first), and **language learning over
  proofs** (0 to 6% beyond nearness). All measured; all closed.
- **The learned generator.** Creators supply human puzzles; the classifier gap matters only if the
  site needs generated volume.
- **More Aim 4 speed work before its human guards run.**

## Suggested order

1. **This week, no spend:** ideas 1 to 6. Each is a day or two and each changes how the existing
   results read. Start with the repeat-solver count, since it decides whether idea 1 exists.
2. **Then, with about $15 of cloud OK:** the price refit (7) and Aim 4's honest guards (8), both
   pre-registered against the frozen test set.
3. **In parallel as product work:** solve logging (10), and the bad-puzzle check in the editor (5).
4. **Then, with about $10 of API OK:** H1's result from the benchmarks thread, then H2 corrected (12);
   the walkthrough test (13) only after idea 1 gives it a bar.

The thread through all of it: every finding so far is about seven experts on Janko and the ratings
of two expert communities. The research needs its second population more than it needs another
model, and inkit is the only place to get it.
