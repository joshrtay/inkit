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

## Not done

- **Puzzles over 12 × 12 aren't solved** (the solver is too slow at that size). Their sizes,
  settings, density and symmetry are in.
- **Janko's Skyscrapers, Abc End View, Hidoku and Minesweeper** (about 2,000 puzzles) have no
  reader in janko.ts. They would add human puzzles for four genres.
- **A pooled classifier** with the genre as a feature: per genre was enough, since the
  differences are genre-specific.
