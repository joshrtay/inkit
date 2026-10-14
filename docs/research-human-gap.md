# Research: how our generated puzzles differ from human-made ones

The graph network finds a correct move 88% of the time on held-out generated puzzles and 61% on
human-made ones (Janko, Puzzle Square JP); the learning curve showed that 10 times more generated
data leaves the human number flat. The sharpest drops: Star Battle 95% → 51%, Shikaku 78% → 40%,
Hitori 62% → 37%. This note measures how the generated puzzles differ, builds a score for how
human a generated puzzle looks, and writes targets for the generator. Written 2026-10-13.

## Method

- **Code:** puzzles/difficulty/human-gap.ts gathers the measures, human_gap.py compares them and
  trains the classifier.
- **Human puzzles:** every one we can read: Janko's eight types (janko.ts) and every Puzzle Square
  JP puzzle (7,274 in all, 13 genres with enough of both sides).
- **Generated puzzles:** the fleet's 133,033 (gen-fleet-20261013-0921). It made no Shikaku, so
  Shikaku is compared with the corpus's 60 generated ones, the network's generated Shikaku.
- **Three groups of measures:**
  - **The puzzle** (size, settings, clue density, clue kinds and values, symmetry): every human
    puzzle against every generated one.
  - **The solve** (band, estimate, step tiers, interest.ts's measures, step families, required
    techniques): solved the way gen-set.ts measures what it makes.
  - **The shape of the solve** (rounds, stuck rounds, where the hardest tenth of steps falls,
    runs of easy steps, break-ins, facts per step).
- **The sample solved:** up to 50 human puzzles per genre (up to 12 × 12, Janko and Puzzle Square
  JP alternating) and 50 generated per genre, both solved again with today's solver. 1,349
  solves, cached.
- **"Beyond":** a human puzzle no band solves without a case split. It's solved again with the
  solver's defaults, so its solve has a shape.
- **The fleet's records hold:** checked against today's solve of the same 50 puzzles per genre,
  the band agrees in all 13 genres and step counts correlate 1.00, except Spiral Galaxies (re-banded
  since; steps r −0.01) and Hitori (steps r 0.42).
- **Effect sizes:** Cohen's d for numbers, Cohen's h for shares.
- **The classifier:** L2 logistic regression in numpy (the venv has no scikit-learn), with
  standardised features and the two classes weighted equally. AUCs are 5-fold cross-validated,
  stratified.
- **Variants:**
  - all features;
  - size-free: without size, settings, round counts or raw clue values;
  - the puzzle only;
  - the solve only.
- **Fleet scoring:** the human sample against every generated puzzle of the genre, on what the
  fleet records hold. Out of fold, so no puzzle is scored by a model that saw it.
- **Outputs (local):** the reports are in references/ml/human-gap/ (one per genre, plus
  summary.md); the scores are references/ml/human-gap/scores.jsonl (90,997 puzzles: `score` and
  `scoreSizeFree`). The targets are puzzles/difficulty/human-targets.json (committed; summary
  statistics only, described in human-targets.md).
- **Small samples:** Easy as ABC and Minesweeper have under 12 human puzzles and are left out.
  Cave and Aquarium have 20 each, Nurikabe 14 solved: read those with care. The other genres in
  the fleet have no human puzzles: Thermo and Irregular Sudoku, Binary, Fill-in, Hidoku, Simple
  Path, Square Jam, Briquet.

## The answer in one line

**Human and generated puzzles are nearly perfectly separable in every genre (AUC 0.76–1.00), and
size isn't the reason.** Without size, AUC is still 0.76–1.00. The generator differs in four ways,
in this order:

1. **Small boards and fixed settings.**
2. **Asymmetric, dense clue layouts.**
3. **Puzzles that never need what human puzzles most often need:** about half of the human
   puzzles are beyond our expert band.
4. **Solves with many easy moves open at once,** where human solves follow a narrow thread.

## Across genres

Medians, human / generated. "Exact symmetry" is the share of puzzles whose clue layout (or area
walls) is exactly symmetric. "Open moves" is the easy moves open per round, per cell. "Longest
easy run" is the longest run of cheap steps, as a share of the steps.

| Genre | AUC (size-free) | Side | Clue density | Exact symmetry | Human beyond expert | Open moves / cell | Longest easy run | Facts per step |
|---|---|---|---|---|---|---|---|---|
| Akari | 0.76 (0.76) | 11 / 10 | 0.12 / 0.12 | 89% / 100% | 18% | 0.056 / 0.067 | 0.10 / 0.13 | 1.63 / 1.65 |
| Aquarium | 0.94 (0.84) | 7 / 6 | 0.19 / 0.25 (areas) | 10% / 0% | 0% | 0.072 / 0.095 | 0 / 0 | 1.72 / 1.89 |
| Cave | 1.00 (1.00) | 10 / 6 | 0.20 / 0.31 | 70% / 0% | 100% | 0.000 / 0.056 | 0.44 / 1.00 | 1.50 / 1.57 |
| Hitori | 0.89 (0.83) | 12 / 6 | all cells | — | 57% | 0.032 / 0.104 | 0.35 / 0.47 | 1.23 / 1.36 |
| Masyu | 0.96 (0.95) | 10 / 6 | 0.22 / 0.22 | 13% / 0% | 74% | 0.044 / 0.113 | 0 / 0 | 1.28 / 1.34 |
| Nurikabe | 1.00 (1.00) | 10 / 6 | 0.12 / 0.22 | 32% / 0% | 79% | 0.004 / 0.049 | 0.03 / 0.09 | 1.02 / 1.16 |
| Shikaku | 1.00 (1.00) | 10 / 6 | 0.16 / 0.31 | 71% / 0% | 14% | 0.007 / 0.056 | 0.13 / 0.52 | 3.67 / 2.93 |
| Simple Loop | 1.00 (1.00) | 10 / 6 | blocks only / walls | 0% / 13% | 38% | 0.041 / 0.080 | 0.01 / 0 | 1.37 / 1.56 |
| Skyscrapers | 1.00 (1.00) | 5 / 6 | 0.25 / 0.32 | 26% / 0% | 3% | 0.188 / 0.158 | 0.03 / 0.03 | 3.19 / 2.64 |
| Slitherlink | 0.93 (0.92) | 10 / 6 | 0.40 / 0.44 | 71% / 0% | 62% | 0.088 / 0.140 | 0.06 / 0.05 | 1.64 / 1.76 |
| Spiral Galaxies | 0.96 (0.95) | 12 / 6 | 0.22 / 0.42 | 0% / 0% | 50% | 0.139 / 0.122 | 0.59 / 0.47 | 1.62 / 1.82 |
| Star Battle | 0.95 (0.94) | 10 / 8 | 2 stars / 1 star | 0% / 0% | 13% | 0.023 / 0.056 | 0.09 / 0.21 | 1.37 / 1.72 |
| Sudoku | 0.96 (0.97) | 9 / 9 | 0.31 / 0.30 | 82% / 0% | 8% | 0.125 / 0.104 | 0.01 / 0.01 | 2.34 / 2.36 |

The fleet-scoring AUCs (human sample against the whole genre, recorded measures only) agree:
0.77–1.00, size-free 0.77–1.00.

**What holds in nearly every genre:**

- **Size.** Human puzzles are mostly 10 × 10 (Akari, Masyu, Slitherlink, Nurikabe, Shikaku,
  Simple Loop, Cave, Star Battle), many larger, and 20–36% of Akari, Masyu, Slitherlink and
  Spiral Galaxies aren't square. The generator makes 5–8, and 10–12 only for Akari and Star
  Battle.
- **Symmetry.** Hand-made clue layouts are half-turn symmetric in most of Sudoku (74%),
  Shikaku (71%), Slitherlink (70%), Cave (70%) and Akari (86%); a quarter to a third of
  Nurikabe and Skyscrapers. The generator's are never symmetric, except Akari's blocks (always
  half-turn).
- **Sparser clues where clues carry size.** Nurikabe (0.12 against 0.22 clues per cell; half
  the generated clues are 1s against 14%), Shikaku (0.16 against 0.31, numbers twice as big),
  Spiral Galaxies (0.22 against 0.42), Cave (0.20 against 0.31).
- **Harder, and hard differently.** In the solved sample, 62% of human Slitherlink, 74% of
  Masyu, 79% of Nurikabe, 57% of Hitori, 50% of Spiral Galaxies and all of Cave need a case
  split even with every expert technique. No generated puzzle does (the generator rejects them).
  Size isn't the reason: human puzzles no bigger than the generated ones still have stuck rounds
  (Slitherlink 12% of rounds, Hitori 18%; generated 0%).
- **A narrow thread.** Fewer easy moves are open per round per cell in 11 of 13 genres (Star
  Battle 0.023 against 0.056, Hitori 0.032 against 0.104, Masyu 0.044 against 0.113). There are
  more rounds per cell, and each step settles fewer facts. Generated puzzles open many moves at
  once and the solver sweeps them up; human ones hand over one or two at a time.
- **Families our generated puzzles never show.** Of human steps, 39% in Star Battle, 42% in
  Nurikabe, 34% in Cave and 24% in Hitori are in step families absent from the generated
  sample; 3–12% elsewhere.

## Per genre, biggest differences first

### Star Battle (network 95% → 51%)
- **Settings:** 65% of human puzzles are 2-star, 9% 3-star; every generated one is 1-star, even
  at 10 × 10 (h −2.1). This is the largest single difference, and it explains the families:
  39% of human steps are in families the generated set never has (stars that can't touch across
  a 2 × 2 while a line holds two).
- **Size:** human median 10 (48% are 10 × 10, 8% 14 × 14); generated 6 and 8 (8% at 10).
- **Areas:** human areas are much more even in size (spread 0.45 against 0.65 of the mean;
  d −1.1, the classifier's top feature).
- **Solve, size-matched (42 human up to 125 cells):** 26 rounds against 12 (d +1.7), fewer facts
  per step (1.38 against 1.75), half as long easy runs (0.12 against 0.21), half as many open
  moves, more steps of tier 1 (28% against 14%). The hardest steps come earlier (0.41 of the way
  against 0.53).
- **Required:** pairs 26% against 12%, counting 17% against 4%.
- **AUC:** 0.95 (size-free 0.94; the puzzle alone 0.97).

### Shikaku (network 78% → 40%)
- **No fleet Shikaku:** the network's generated Shikaku are the corpus's 60, all 6 × 6. Human
  ones are 10 × 10 (81%).
- **Clues:** half as dense (0.16 against 0.31 per cell), numbers twice as big (mean 6.8 against
  3.3; 0.69 of the side against 0.54).
- **Symmetry:** 71% exactly half-turn symmetric, against none.
- **Solve:** each step settles more (3.7 facts against 2.9), and more steps need two windows
  (tier 1: 72% against 41%). Open moves per cell are an eighth (0.007 against 0.056), and the
  longest easy run is a quarter (0.13 against 0.52). Bands: human 82% hard, 14% beyond; generated
  all hard. Every human puzzle but a few requires rects, as the generated ones do.
- **AUC:** 1.00 on every variant: nothing overlaps.

### Hitori (network 62% → 37%)
- **Size:** human 12 × 12 (26%), 8, 10, 17, 15; generated only 6 × 6. Every human value scales
  with the side (mean 6.3 against 3.5); the share of repeated numbers is the same (0.65).
- **Solve:**
  - 57% of human puzzles are beyond expert; generated are all exactly expert (the fleet makes
    Hitori only there).
  - Generated solves lean on the connection lemma: steps of `connect@local` are 16% against 6%,
    and 23% of steps are tier 1 against 2%.
  - Human solves go by each-once and no-adjacent patterns along lines, then need case splits.
  - 24% of human steps are in families the generated never show.
- **Size-matched (only 9 human up to 45 cells):** still more rounds per cell (0.48 against
  0.26), hard steps (15% against 1%) and stuck rounds (18% against 0).
- **AUC:** 0.89 (size-free 0.83).

### Slitherlink
- **Size:** 10 × 10 (78% of square ones), 22% not square; generated 5–8.
- **Symmetry:** 70% half-turn symmetric, against none.
- **Clues:** smaller relative to the side, more 3s (28% against 20%), fewer 1s (28% against
  35%).
- **Solve:** 62% beyond expert. Size-matched: stuck rounds 12% against 0, band 3.2 against 1.2.
- **AUC:** 0.93 (size-free 0.92; top: share of 3s, theme, loop families).

### Masyu
- **Size:** 10 × 10 (74% of square ones), 31% not square; generated 6 and 8.
- **Pearls:** a few more black (38% against 32%); density the same.
- **Solve:** 74% beyond expert; more steps per cell (1.44 against 1.26), half the open moves.
  Generated puzzles require the loop lemma (50% against 20%) and pairs (44% against 10%) more
  often: harder in the windows, easier overall.
- **AUC:** 0.96.

### Akari (the closest)
- **Size:** human median 11 × 15, 36% not square; generated 7, 10, 12.
- **Symmetry:** generated blocks are always half-turn symmetric; 86% of human ones are.
- **Clues:** slightly fewer blocks (0.36 against 0.40 per cell), more of them numbered (35%
  against 32%), more 1s.
- **Bands:** human 44% easy, 26% medium, 10% hard, 18% beyond; generated 62/30/8/0.
- **AUC:** 0.76, the lowest. Akari is where the generator already looks human.

### Nurikabe, Cave (few human puzzles)
- **Nurikabe:**
  - **Clues:** half the density (0.12 against 0.22). Generated islands are tiny (49% of clues
    are 1, against 14%); nearly half of human clues are 4 or more, against none.
  - **Bands:** 79% of human puzzles beyond expert.
  - **Families:** 42% of human steps are in families the generated never show.
- **Cave:**
  - **Clues:** all 20 human puzzles need case splits, at 10 × 10, with 0.20 clues per cell
    against 0.31.
  - **Symmetry:** 70% symmetric, against none.
- **AUC:** 1.00 for both.

### Simple Loop, Skyscrapers, Spiral Galaxies, Sudoku, Aquarium
- **Simple Loop:**
  - **Clues:** human puzzles give only blocks; 64% of generated givens are walls between cells,
    a clue kind no human puzzle in our set uses.
  - **Size:** 10 × 10 against 6 × 6; 38% of human puzzles beyond expert.
  - **AUC:** 1.00.
- **Skyscrapers:**
  - **Clues:** human puzzles give only outside clues (36% of the border filled, against 15%).
    65% of generated givens are digits in the grid.
  - **Symmetry:** 26% of human clue layouts symmetric, against none.
  - **Solve:** one idea throughout (theme 0.91 against 0.59), fewer rule kinds (3 against 4).
  - **AUC:** 1.00.
- **Spiral Galaxies:**
  - **Clues:** half as many centres per cell (0.22 against 0.42).
  - **Size:** 10–17 against 6.
  - **Solve:** half beyond expert; generated solves need two windows far more often (tier 1: 41%
    against 4% of steps).
  - **AUC:** 0.96.
- **Sudoku:**
  - **Symmetry:** the same size and density, but 82% of human puzzles are exactly symmetric
    (74% half-turn) against none. This alone separates them (symmetry is the classifier's top
    feature).
  - **Bands:** 84% easy, against 68%.
  - **AUC:** 0.96.
- **Aquarium (20 human):**
  - **Size and areas:** 7 × 7 with bigger areas (7.7 cells against 4.0).
  - **Solve:** narrower (open moves 0.072 against 0.095).
  - **AUC:** 0.94.

## What to change in the generator, ranked

By how much of the gap each closes, and by how many genres it touches:

1. **Grid size: make 10 × 10 the main size** (and 8, 12, 15; some not square) for Star Battle,
   Masyu, Slitherlink, Nurikabe, Shikaku, Hitori, Simple Loop, Spiral Galaxies and Cave.
   Size is the single largest difference in nine genres. The solve's shape scales with it (more
   rounds, longer threads), and the network has never seen a 10 × 10 Masyu or Slitherlink from
   the generator. Weights per genre: `sizes` in human-targets.json.
2. **Star Battle: 2 stars** (65% of human puzzles; 3 stars 9%) and **even area sizes**. This is
   the likeliest single cause of the 95% → 51% drop: 39% of human steps are families 1-star
   puzzles can't produce.
3. **Symmetric clue layouts:** half-turn symmetric by default for Sudoku, Shikaku, Slitherlink,
   Cave, Akari and Nurikabe (the `symmetry` shares; 70–86% in most). Cheap, and decisive for
   Sudoku and Shikaku, where symmetry is most of what separates them.
4. **Sparser clues with bigger numbers** for the size genres: Nurikabe (0.12 per cell, few 1s),
   Shikaku (0.16, numbers about two thirds of the side), Spiral Galaxies (0.22), Cave (0.20).
   Use the `clueDensity` range.
5. **Allow harder than expert where people go there.** Half or more of human Slitherlink, Masyu,
   Nurikabe, Hitori, Spiral Galaxies and Cave need a case split even with every expert
   technique. Either keep a "beyond" share of puzzles whose one case split is short, or add the
   techniques that remove it, so they become expert (the mining harness's job). Until then, the
   network trains on no positions like these.
6. **A narrower thread.** Prefer puzzles with few easy moves open per round, short easy runs, and
   steps that settle few facts. A selection score from the path (open moves per cell, the
   longest easy run as a share of steps) can rank candidates like the break-in score does. The
   human-likeness score, size-free, is a ready proxy.
7. **Clue kinds people use:** Simple Loop with blocks only, no walls; Skyscrapers with outside
   clues only, and more of them, no digits in the grid.
8. **Steer the step families** toward the human mix (`families`; keys are gen-set's own family
   strings). Most of the gap in families closes by itself with items 1–2. Star Battle's and
   Hitori's target families are partly ones the fleet never made (15 and 13 of 25 seen), so
   steering needs the new settings first.

**Since (2026-10-14):** items 2 and 4–7 are generator options, measured in
docs/generation-plan.md ("The rest of the gap"): even Star Battle areas, a "beyond" band of a few
shallow case splits, sparse clues, a narrow-thread preference, rocks-only Simple Loop and
outside-only Skyscrapers. New puzzles can be scored with `human_gap.py score <records>`.

## How to use the score

- **Where:** references/ml/human-gap/scores.jsonl holds each fleet key's probability of being
  human, out of fold.
- **Which score:** use `scoreSizeFree` to rank within a size. `score` is mostly size and
  settings.
- **Where it ranks:** the score is a ranking within a genre, not a calibrated probability (the
  classes were weighted equally). In Akari, Hitori, Slitherlink and Masyu it orders the fleet
  meaningfully (AUC 0.77–0.96). In the genres at 1.00, every generated puzzle scores near 0 and
  the ranking is weak until the generator moves (items 1–4).
- **Retraining:** rerun `human_gap.py` after a new fleet. The human side is cached.

## Uncertainty and a cascade

The classifier and Opus fail in different places: Opus, shown pairs as grids
([research-llm-labels.md](research-llm-labels.md), "Can Opus tell human-made puzzles?"), is 8 of 8
on Akari, where the classifier is weakest, and at chance on Hitori and Spiral Galaxies. Would a
cascade beat either alone, with the classifier deciding when it's sure and Opus when it isn't?
**No.** On the 96 pairs and on 60 new ones chosen where the classifier is least sure, no cascade or
combination beats the classifier alone by more than a pair or two. The one gain, sending Akari to
Opus, is 3 pairs in 156.

- **Code:** human-cascade.ts measures the pair puzzles as human-gap.ts measures its sample;
  human_cascade.py scores them and simulates the policies. Opus's replies on new pairs come from
  llm-human.ts with `LLM_HUMAN_DIR=human-cascade` (its own ledger). Outputs (local):
  references/ml/human-cascade/.
- **The classifier:** human_gap.py's, per type, on every feature (the puzzle, the solve, its shape,
  the top step families). It's refitted with every pair puzzle left out of training, so no pair
  puzzle is scored by a model that saw it. All 192 pair puzzles, and the 120 new ones, were solved
  (DEDUCE_JOBS=2, none timed out), so no pair fell back to puzzle-only features.
- **Its uncertainty:**
  - **Margin:** for a pair, the gap between the two sides' log-odds (each clipped at ±12). The
    pair's pick is the side with the higher probability.
  - **Spread:** 20 bootstrap refits, resampled within each class. For each puzzle, the spread of
    its probability; for each pair, the spread of the gap and the share of refits that agree with
    the pick.
- **Policies:**
  - the classifier alone;
  - Opus alone (grid only, from the saved replies);
  - a cascade: the classifier when the pair's certainty is at least t, else Opus;
  - a combination: the log-odds gap plus w × Opus's confidence as log-odds;
  - routing by type: Opus where the classifier's cross-validated AUC on its training sample is
    below a cut.
- **No peeking:** t, w and the cut are chosen by 5-fold cross-validation over pairs (20 repeats),
  and checked by choosing on one half and testing on the other. Confidence intervals are
  bootstraps over pairs.

### On the 96 pairs

| Policy | All (95% CI) | Size-matched (70) | Akari | Hitori | Slitherlink | Spiral Galaxies | Shikaku | Other 7 types |
|---|---|---|---|---|---|---|---|---|
| Classifier's AUC on its training sample | | | 0.78 | 0.87 | 0.92 | 1.00 | 1.00 | 0.94–1.00 |
| Classifier | 94.8% (90–99%) | 95.7% | 75% | 100% | 100% | 75% | 88% | 100% |
| Opus, grid only | 83.3% (76–91%) | 87.1% | 100% | 50% | 75% | 50% | 75% | 75–100% |
| Cascade on the gap (t by CV) | 94.6% (89–99%) | 95.7% | 75% | 100% | 100% | 72% | 88% | 100% |
| Cascade on refit agreement (CV) | 94.5% (89–99%) | 95.7% | 75% | 100% | 100% | 71% | 88% | 100% |
| Combination (w by CV) | 94.6% (89–99%) | 95.7% | 75% | 100% | 100% | 72% | 88% | 100% |
| Routing by type (cut by CV) | 96.4% (92–99%) | 97.9% | 94% | 100% | 100% | 75% | 88% | 100% |
| Either right (ceiling) | 97.9% (95–100%) | 98.6% | 100% | 100% | 100% | 88% | 88% | 100% |

- **The classifier makes 5 errors in 96;** Opus is right on 3 of them (two Akari, one Spiral
  Galaxies). The ceiling, a policy that always knew which to trust, is 3 points above the
  classifier.
- **Cross-validation chooses t = 0 (nothing to Opus) in almost every fold,** and w = 0. The
  cascade's gain over the classifier is −0.2% (CI −0.5 to 0). Choosing on half and testing on the
  other: cascade 93.9%, combination 94.4%, routing 95.7%, against the classifier's 94.8%.
- **The sweep:** sending the least certain 5% of pairs to Opus gives 92.7%, 25% gives 90.6%, 50%
  gives 85.4%. Accuracy only falls as Opus takes more.
- **Why:** in the least certain quarter of pairs, the classifier is right 83% of the time and Opus
  67%. Where the classifier is unsure, Opus is unsure too: those are the pairs that look alike.
- **The uncertainty does find the classifier's errors:** the gap ranks right pairs above wrong ones
  with AUC 0.80 (refit agreement 0.81, gap over its spread 0.78). The spread is small (median
  standard deviation of a puzzle's probability 0.03 human, 0.01 generated) and only a little larger
  on wrong pairs (the gap's spread 1.5 against 1.3). So the ensemble adds nothing to the margin.
- **Routing:** the cut chosen is the classifier's training AUC 0.87, so Akari alone goes to Opus.
  That's +1.6% (CI 0 to +3.9%), within the noise. It doesn't clear the bar the task set: more than
  the CI's half-width.
- **Size-free classifier:** 92.7% (86–98%), with seven errors, four of them in Spiral Galaxies.
  The cascade and combination are again within a pair of it (93.5% at best, by refit agreement).

### On 60 new pairs (the confirmation)

Run because routing looked better on Akari, the classifier's weak type (75% against Opus's 100%,
though only 2 pairs of 8).

- **The pairs:** none of their puzzles are among the 96 or in the classifier's training sample.
  They were drawn from 292 candidates, weighted toward the classifier's uncertain region (by the
  puzzle-only model's gap, weight e^(−|gap|/2), at most 15 a type).
- **Which types:** Hitori 15, Masyu 12, Akari 10, Slitherlink 10, Star Battle 8, Nurikabe 3,
  Sudoku 1, Spiral Galaxies 1; 41 size-matched.
- **No tuning on them:** t, w and the cut were fixed at the values chosen on the 96.
- **Opus:** grid only, $0.59 against a $3 cap.

| Policy | All (95% CI) | Size-matched (41) | Akari (10) | Hitori (15) | Slitherlink (10) | Star Battle (8) | Masyu (12) |
|---|---|---|---|---|---|---|---|
| Classifier | 88.3% (80–95%) | 90.2% | 90% | 93% | 90% | 100% | 75% |
| Opus, grid only | 75.0% (63–85%) | 75.6% | 100% | 47% | 90% | 75% | 75% |
| Cascade (t fixed: 0) | 88.3% | 90.2% | 90% | 93% | 90% | 100% | 75% |
| Cascade, 10% to Opus | 85.0% (75–93%) | 82.9% | 90% | 87% | 90% | 88% | 75% |
| Cascade, 25% to Opus | 86.7% (77–95%) | 87.8% | 100% | 87% | 90% | 88% | 75% |
| Routing (Akari to Opus) | 90.0% (82–97%) | 92.7% | 100% | 93% | 90% | 100% | 75% |
| Either right (ceiling) | 96.7% (92–100%) | 97.6% | 100% | 93% | 90% | 100% | 100% |

- **The weighting worked:** both do worse than on the 96. The classifier drops from 95% to 88%,
  Opus from 83% to 75%.
- **The classifier is still ahead in the uncertain region:** in the least certain quarter it's
  right 67% of the time, Opus 60%.
- **Here the ceiling is higher (+8 points):** Opus is right on 5 of the classifier's 7 errors (3
  Masyu, 1 Akari, 1 Nurikabe). But its confidence doesn't single those pairs out (0.55–0.70, its
  usual range), and neither does the classifier's gap. Nothing available picks them in advance.
- **Size-free classifier:** 85.0%. The fixed cascade (t 0.53) and combination (w 1) gain one pair
  each (86.7%), and 10% to Opus gains two (88.3%, CI 0 to +8%). Neither reaches the all-features
  classifier.
- **Pooled, 156 pairs:**

  | | Right | Accuracy |
  |---|---|---|
  | Classifier | 144 | 92.3% |
  | Opus | 125 | 80.1% |
  | Routing (Akari to Opus) | 147 | 94.2% |

  On Akari alone, the classifier gets 15 of 18 and Opus 18 of 18.

### Cost

- **Opus, grid only:** about $0.0095 a pair, or about half that for one puzzle shown alone: about
  $5 per 1,000 puzzles sent.
- **Routing:** only Akari's share of a batch would be sent.
- **The classifier:** free, beyond the solve every generated puzzle already gets.

### Recommendation

- **Use the classifier alone.** On the size-free score, rank within a size, as in "How to use the
  score".
- **Don't build a cascade.** Its threshold goes to zero under cross-validation and on new pairs.
  Where the classifier is unsure, Opus is less sure.
- **The one defensible exception is Akari:** Opus gets 18 of 18 there against the classifier's 15,
  about $5 per 1,000 Akari puzzles. It isn't significant at this size, and Akari is the type where
  the generator already looks most human. Revisit if Akari becomes a type we screen hard.
- **Not done, since the cascade didn't help:**
  - the batch-scoring tool (human-score.ts) and Opus's single-puzzle judgements. Opus's accuracy on
    one puzzle shown alone ("was this set by a person?") is unmeasured;
  - Opus at a higher effort, or with pictures: a better Opus would be needed for a cascade to pay.
- **Where Opus earns its keep:** as a critic of the generator (its reasons; research-llm-labels.md),
  not as a second judge beside the classifier.

## Not done

- **Puzzles over 12 × 12 aren't solved** (the solver is too slow at that size). Their sizes,
  settings, density and symmetry are in.
- **Janko's Skyscrapers, Abc End View, Hidoku and Minesweeper** (about 2,000 puzzles) have no
  reader in janko.ts. They would add human puzzles for four genres.
- **A pooled classifier** with the genre as a feature: per genre was enough, since the
  differences are genre-specific.
