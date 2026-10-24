# Phase 1a: the hand-written cost model, fitted (2026-10-23)

[research-trajectory.md](research-trajectory.md), phase 1a: the terms in proof-cost.ts (size, reuse,
locality, splits, peak, shape) on each puzzle's cheapest-only proof (proof-paths.ts: deduce.ts's
min-peak path with shallow case splits), against every external check. Proofs from 2,293 puzzles
solved locally on 2026-10-15 (references/proof/); the fit is proof-cost-fit.ts.

## Verdict

- **Interest: no-go.** Beyond difficulty, likes follow the board's size, not the proof's shape.
  The v1 interest score gets 0.20 out of fold, but our old difficulty estimate alone gets 0.17
  and cell count alone about 0.17. With cells held fixed too, only **clue usage** holds up (the
  share of the puzzle's rule instances the proof cites: 0.16, interval 0.09 to 0.21), with the old
  estimate at 0.12. The shape terms (aha, dead stretches, gap, where the peak comes) give nothing.
  The fitted weights don't carry to the judges: v1 against Opus's 372 places is 0.11 (interval
  −0.19 to 0.32), against Fable's 72 it is 0.03, and against likes on the 372 it is 0.02. By the
  stop rule, elegance isn't recoverable from this vocabulary. That matches phase 1b.
- **The old −0.15 baseline didn't replicate.** It came from 72 puzzles. On 719 it is +0.17.
- **The experts don't follow the cheapest proof.** Agreement with the expert's order is the same
  for the cheapest-only proof and the greedy path (per solver 0.57 against 0.58 for Otto Janko,
  0.61 against 0.62 for Rainer, within 0.04 for every solver). One per-step signal: the experts
  leave steps with large explanations for later than the proof does (step size +0.05 to +0.20,
  every type), so the step price undercounts how much an explanation cites.
- **Difficulty: a modest gain.** The v1 difficulty score (shape count, peak and easy moves open
  carry most of the weight) gets 0.66 out of fold on the site's difficulty, against 0.54 for the
  estimate. On Tatham's grades it gets 0.72 against 0.69. Beast Academy's sets are too small to
  judge (2 to 6 sets a type), and v1 is worse there.
- **For phase 2:** the cheapest-only proof is no more human than greedy's, so proof search toward
  this cost model has nothing to gain from people. That supports the 2026-10-20 reassessment (the
  human move model as the core). Worth carrying over: clue usage as an interest feature, and
  explanation size in the step price.

Coverage: Puzzle Square JP 719 of 1,000 solved (Akari 199, Masyu 139, Simple Loop 223,
Slitherlink 158; the rest stuck without a deep split); the judge pilot 291 of 372; Janko 315 of
603 (Fillomino 0, Spiral Galaxies 4, Nurikabe 7); Beast Academy 70 of 88; Tatham 198 of 230.
Leaving out the unsolved puzzles leaves out the hardest, so every check is on the easier part.

## Tables

Cost model v1 (deduce.ts min-peak, maxTier 2, step-prices.json of 2026-10-15). Partial Spearman within type, mean of types, bootstrap 95% interval; * the interval excludes 0.

## Likes per solver, the site's difficulty held fixed (Puzzle Square JP, puzzles with 20 or more solvers)

Coverage: akari 199 of 250 (cap 0); masyu 139 of 250 (cap 0); simple-loop 223 of 250 (cap 0); slitherlink 158 of 250 (cap 0). "estimate" is our usual difficulty estimate on the same proof (the old baseline).

| term | akari | masyu | simple-loop | slitherlink | mean of types (95%) | + cells held fixed |
|---|---|---|---|---|---|---|
| sum |  0.14 | -0.02 |  0.30 |  0.24 |  0.16 ( 0.09,  0.26) * |  0.04 (-0.04,  0.11) |
| peak |  0.09 | -0.07 |  0.25 |  0.22 |  0.12 ( 0.05,  0.20) * |  0.08 ( 0.01,  0.16) * |
| size |  0.15 |  0.04 |  0.34 |  0.24 |  0.19 ( 0.10,  0.28) * |  0.10 ( 0.02,  0.16) * |
| sumPerMark | -0.03 | -0.04 | -0.05 |  0.19 |  0.02 (-0.05,  0.07) |  0.06 (-0.01,  0.13) |
| sizePerMark | -0.02 | -0.03 |  0.10 |  0.24 |  0.07 ( 0.01,  0.14) * |  0.09 ( 0.03,  0.15) * |
| reuse | -0.12 |  0.03 | -0.13 | -0.05 | -0.07 (-0.15,  0.00) | -0.02 (-0.10,  0.05) |
| shapes |  0.15 |  0.02 |  0.29 |  0.22 |  0.17 ( 0.11,  0.25) * |  0.10 ( 0.04,  0.16) * |
| span |  0.03 | -0.17 | -0.12 | -0.06 | -0.08 (-0.15, -0.00) * |  0.03 (-0.03,  0.09) |
| jump | -0.18 |  0.09 | -0.02 | -0.07 | -0.04 (-0.11,  0.03) | -0.04 (-0.10,  0.04) |
| splits |  0.01 | -0.01 |  0.27 |  0.19 |  0.12 ( 0.02,  0.20) * |  0.09 (-0.00,  0.15) |
| splitShare | -0.01 | -0.05 |  0.20 |  0.20 |  0.09 ( 0.01,  0.16) * |  0.09 ( 0.01,  0.15) * |
| hinges |  0.07 |  0.07 |  0.26 |  0.17 |  0.14 ( 0.07,  0.23) * |  0.08 ( 0.01,  0.15) * |
| gap |  0.09 | -0.11 |  0.15 |  0.12 |  0.06 (-0.01,  0.14) |  0.05 (-0.03,  0.13) |
| peakAt | -0.17 | -0.10 |  0.09 | -0.05 | -0.06 (-0.14,  0.01) | -0.09 (-0.17, -0.02) * |
| peakRounds | -0.02 |  0.18 | -0.14 | -0.10 | -0.02 (-0.11,  0.05) | -0.01 (-0.09,  0.06) |
| aha |  0.01 | -0.13 |  0.17 | -0.02 |  0.01 (-0.07,  0.07) |  0.02 (-0.06,  0.07) |
| dead | -0.04 | -0.11 | -0.01 |  0.05 | -0.03 (-0.09,  0.06) |  0.03 (-0.05,  0.12) |
| openMean | -0.14 |  0.16 |  0.21 | -0.13 |  0.02 (-0.04,  0.08) | -0.07 (-0.13, -0.00) * |
| oneWay |  0.13 | -0.03 |  0.03 |  0.07 |  0.05 (-0.03,  0.13) |  0.06 (-0.03,  0.14) |
| busywork | -0.06 |   –  |  0.08 | -0.08 | -0.02 (-0.08,  0.08) | -0.06 (-0.13,  0.05) |
| usage |  0.25 |  0.01 |  0.05 |  0.22 |  0.13 ( 0.07,  0.18) * |  0.16 ( 0.09,  0.21) * |
| steps |  0.14 | -0.02 |  0.28 |  0.23 |  0.16 ( 0.09,  0.25) * |  0.02 (-0.05,  0.09) |
| estimate |  0.13 |  0.11 |  0.27 |  0.16 |  0.17 ( 0.09,  0.24) * |  0.12 ( 0.05,  0.18) * |

Cells alone:  0.18,  0.09,  0.31,  0.12; n 199, 139, 223, 158.

## The site's difficulty (Spearman within type)

| term | akari | masyu | simple-loop | slitherlink | mean (95%) |
|---|---|---|---|---|---|
| sum |  0.51 |  0.60 |  0.46 |  0.51 |  0.52 ( 0.46,  0.58) * |
| peak |  0.67 |  0.56 |  0.53 |  0.44 |  0.55 ( 0.50,  0.60) * |
| size |  0.58 |  0.64 |  0.53 |  0.48 |  0.56 ( 0.51,  0.60) * |
| sumPerMark |  0.55 |  0.63 |  0.41 |  0.41 |  0.50 ( 0.43,  0.54) * |
| sizePerMark |  0.64 |  0.61 |  0.49 |  0.44 |  0.55 ( 0.49,  0.60) * |
| reuse | -0.32 | -0.31 | -0.51 | -0.31 | -0.36 (-0.43, -0.26) * |
| shapes |  0.68 |  0.66 |  0.61 |  0.53 |  0.62 ( 0.57,  0.67) * |
| span |  0.38 |  0.05 | -0.02 | -0.30 |  0.03 (-0.05,  0.11) |
| jump | -0.16 | -0.43 | -0.18 | -0.21 | -0.25 (-0.32, -0.18) * |
| splits |  0.53 |  0.63 |  0.60 |  0.38 |  0.53 ( 0.48,  0.59) * |
| splitShare |  0.52 |  0.61 |  0.60 |  0.29 |  0.51 ( 0.45,  0.56) * |
| hinges |  0.56 |  0.60 |  0.54 |  0.24 |  0.49 ( 0.43,  0.54) * |
| gap |  0.13 |  0.19 |  0.20 |  0.23 |  0.19 ( 0.12,  0.26) * |
| peakAt | -0.28 | -0.19 | -0.08 | -0.06 | -0.15 (-0.23, -0.07) * |
| peakRounds | -0.12 | -0.20 | -0.14 | -0.16 | -0.15 (-0.22, -0.08) * |
| aha |  0.11 | -0.03 |  0.15 |  0.21 |  0.11 ( 0.05,  0.21) * |
| dead |  0.34 |  0.03 |  0.25 |  0.12 |  0.18 ( 0.10,  0.26) * |
| openMean | -0.57 | -0.51 | -0.26 | -0.39 | -0.43 (-0.50, -0.36) * |
| oneWay |  0.23 |  0.47 |  0.44 |  0.21 |  0.34 ( 0.27,  0.41) * |
| busywork | -0.30 |   –  | -0.45 | -0.48 | -0.41 (-0.47, -0.34) * |
| usage |  0.36 |  0.35 |  0.57 |  0.36 |  0.41 ( 0.32,  0.48) * |
| steps |  0.35 |  0.44 |  0.33 |  0.44 |  0.39 ( 0.33,  0.45) * |
| estimate |  0.69 |  0.49 |  0.55 |  0.45 |  0.54 ( 0.49,  0.59) * |

## Cost model v1: weights (ridge on within-type ranks, λ chosen out of fold)

**interest** (likes per solver, difficulty held fixed; λ 1000): out of fold akari  0.21, masyu  0.03, simple-loop  0.32, slitherlink  0.23; mean  0.20.
Weights, largest first: usage +0.05, shapes +0.04, steps +0.04, hinges +0.03, sumPerMark -0.03, peakAt -0.03, peak +0.02, span -0.02, openMean +0.02, gap +0.02, splitShare +0.02, oneWay +0.02, aha +0.01, dead -0.01, jump -0.01, reuse -0.00, busywork +0.00, sizePerMark +0.00.

**difficulty** (the site's difficulty; λ 1): out of fold akari  0.72, masyu  0.71, simple-loop  0.66, slitherlink  0.56; mean  0.66.
Weights, largest first: shapes +0.35, peak +0.27, openMean -0.26, sizePerMark -0.15, splitShare +0.12, steps +0.08, jump +0.08, aha +0.07, gap -0.07, sumPerMark +0.04, oneWay +0.04, span -0.04, dead -0.04, usage -0.02, hinges -0.01, peakAt -0.01, reuse -0.00, busywork -0.00.

## The labeller pilot's judges, the site's difficulty held fixed

Coverage 291 of 372 (cap 0). Each judge's place within its batch of 10 (0 least enjoyed, 1 most); likes on the same puzzles for reference. v1 interest uses the weights fitted on the Puzzle Square JP sets (the pilot's puzzles left out of the fit only in that they are a different sample; the sets overlap little).

**Fable (the pilot's 72)**, n akari 19, masyu 12, slitherlink 16, sudoku 8

| term | akari | masyu | slitherlink | sudoku | mean (95%) |
|---|---|---|---|---|---|
| sum |  0.01 |  0.36 |  0.20 |  0.36 |  0.23 (-0.09,  0.53) |
| peak | -0.28 | -0.27 | -0.14 | -0.06 | -0.19 (-0.51,  0.18) |
| size | -0.18 |  0.35 | -0.06 |  0.33 |  0.11 (-0.27,  0.42) |
| sumPerMark |  0.16 |  0.17 | -0.11 |  0.24 |  0.12 (-0.25,  0.43) |
| sizePerMark |  0.03 | -0.00 | -0.32 |  0.13 | -0.04 (-0.37,  0.34) |
| reuse | -0.37 |  0.24 |  0.08 | -0.91 | -0.24 (-0.47,  0.03) |
| shapes | -0.06 |  0.03 | -0.09 |  0.17 |  0.01 (-0.29,  0.38) |
| span | -0.25 | -0.55 | -0.44 | -0.44 | -0.42 (-0.60, -0.03) * |
| jump | -0.28 |  0.14 | -0.07 |  0.63 |  0.10 (-0.24,  0.39) |
| splits | -0.20 |  0.02 | -0.25 |   –  | -0.14 (-0.49,  0.18) |
| splitShare | -0.22 | -0.08 | -0.16 |   –  | -0.15 (-0.48,  0.24) |
| hinges |  0.11 |  0.02 |  0.23 | -0.15 |  0.05 (-0.30,  0.41) |
| gap | -0.27 | -0.79 | -0.31 |  0.30 | -0.26 (-0.60,  0.05) |
| peakAt |  0.07 | -0.21 | -0.37 | -0.42 | -0.23 (-0.52,  0.09) |
| peakRounds |  0.36 |  0.54 |  0.58 |  0.23 |  0.43 ( 0.10,  0.66) * |
| aha | -0.26 |  0.42 | -0.03 | -0.15 | -0.01 (-0.37,  0.32) |
| dead | -0.11 | -0.23 |  0.28 |   –  | -0.02 (-0.36,  0.37) |
| openMean |  0.23 |  0.27 |  0.36 |  0.58 |  0.36 (-0.03,  0.58) |
| oneWay | -0.10 |  0.26 | -0.06 |   –  |  0.03 (-0.24,  0.41) |
| busywork |  0.21 |   –  | -0.15 | -0.55 | -0.16 (-0.44,  0.30) |
| usage | -0.02 | -0.11 | -0.17 |  0.11 | -0.05 (-0.44,  0.29) |
| steps |  0.24 |  0.39 | -0.07 |  0.39 |  0.24 (-0.07,  0.56) |
| estimate | -0.24 | -0.06 |  0.09 |  0.29 |  0.02 (-0.36,  0.38) |
| v1 | -0.01 |  0.05 |  0.06 |  0.02 |  0.03 (-0.35,  0.36) |
| likes |  0.33 |  0.33 |  0.57 |  0.08 |  0.32 ( 0.03,  0.68) * |

**Opus (372 at scale)**, n akari 105, masyu 79, slitherlink 99, sudoku 8

| term | akari | masyu | slitherlink | sudoku | mean (95%) |
|---|---|---|---|---|---|
| sum |  0.15 |  0.14 |  0.12 |  0.62 |  0.26 ( 0.04,  0.41) * |
| peak |  0.24 | -0.22 |  0.02 |  0.05 |  0.02 (-0.26,  0.27) |
| size |  0.13 |  0.08 |  0.12 |  0.59 |  0.23 (-0.02,  0.37) |
| sumPerMark |  0.11 |  0.01 |  0.07 |  0.21 |  0.10 (-0.16,  0.31) |
| sizePerMark |  0.12 | -0.09 |  0.06 |  0.32 |  0.10 (-0.15,  0.31) |
| reuse |  0.25 | -0.05 | -0.03 | -0.82 | -0.16 (-0.27,  0.04) |
| shapes |  0.06 |  0.16 |  0.01 |  0.41 |  0.16 (-0.12,  0.34) |
| span |  0.04 | -0.27 | -0.18 | -0.14 | -0.14 (-0.33,  0.12) |
| jump |  0.20 |  0.13 | -0.00 |  0.77 |  0.27 ( 0.09,  0.36) * |
| splits |  0.12 | -0.10 | -0.20 |   –  | -0.06 (-0.18,  0.05) |
| splitShare |  0.11 | -0.20 | -0.22 |   –  | -0.10 (-0.20,  0.01) |
| hinges |  0.20 | -0.07 |  0.12 |  0.05 |  0.07 (-0.18,  0.34) |
| gap |  0.09 | -0.22 | -0.15 |  0.10 | -0.04 (-0.33,  0.21) |
| peakAt | -0.22 |  0.00 |  0.02 | -0.62 | -0.20 (-0.35,  0.12) |
| peakRounds | -0.07 |  0.12 |  0.19 |  0.44 |  0.17 (-0.10,  0.38) |
| aha |  0.15 | -0.03 | -0.16 | -0.37 | -0.10 (-0.29,  0.18) |
| dead |  0.15 | -0.21 |  0.16 |   –  |  0.04 (-0.08,  0.19) |
| openMean | -0.26 |  0.29 |  0.10 |  0.44 |  0.14 (-0.14,  0.30) |
| oneWay |  0.06 | -0.28 | -0.08 |   –  | -0.10 (-0.24,  0.06) |
| busywork | -0.12 |   –  |  0.07 | -0.36 | -0.14 (-0.38,  0.22) |
| usage |  0.35 | -0.16 | -0.01 |  0.33 |  0.13 (-0.21,  0.31) |
| steps |  0.12 |  0.13 |  0.19 |  0.66 |  0.28 ( 0.06,  0.40) * |
| estimate |  0.25 | -0.17 |  0.16 |  0.56 |  0.20 (-0.04,  0.36) |
| v1 |  0.27 | -0.01 | -0.00 |  0.17 |  0.11 (-0.19,  0.32) |
| likes |  0.05 |  0.08 |  0.30 | -0.17 |  0.06 (-0.16,  0.35) |

**Likes per solver (the 372)**, n akari 105, masyu 79, slitherlink 99, sudoku 8

| term | akari | masyu | slitherlink | sudoku | mean (95%) |
|---|---|---|---|---|---|
| sum |  0.09 |  0.08 |  0.19 | -0.49 | -0.03 (-0.20,  0.22) |
| peak | -0.08 | -0.06 |  0.19 | -0.05 | -0.00 (-0.22,  0.24) |
| size |  0.20 |  0.22 |  0.30 | -0.46 |  0.06 (-0.11,  0.34) |
| sumPerMark | -0.13 |  0.11 |  0.09 |  0.52 |  0.15 (-0.06,  0.30) |
| sizePerMark |  0.01 |  0.17 |  0.20 | -0.13 |  0.06 (-0.14,  0.34) |
| reuse |  0.18 |  0.08 | -0.15 | -0.12 | -0.00 (-0.22,  0.26) |
| shapes | -0.14 |  0.00 |  0.09 | -0.55 | -0.15 (-0.30,  0.10) |
| span | -0.02 | -0.16 |  0.08 | -0.82 | -0.23 (-0.33, -0.09) * |
| jump | -0.03 | -0.00 | -0.01 | -0.15 | -0.05 (-0.30,  0.23) |
| splits | -0.04 | -0.00 |  0.16 |   –  |  0.04 (-0.10,  0.15) |
| splitShare | -0.05 | -0.09 |  0.12 |   –  | -0.01 (-0.10,  0.13) |
| hinges | -0.04 |  0.11 |  0.27 | -0.02 |  0.08 (-0.12,  0.33) |
| gap | -0.14 | -0.04 | -0.11 |  0.39 |  0.02 (-0.24,  0.21) |
| peakAt | -0.15 |  0.28 |  0.02 | -0.02 |  0.03 (-0.24,  0.27) |
| peakRounds |  0.09 | -0.18 |  0.12 |  0.08 |  0.03 (-0.18,  0.26) |
| aha |  0.08 |  0.05 |  0.07 |  0.29 |  0.12 (-0.16,  0.32) |
| dead | -0.11 | -0.08 |  0.15 |   –  | -0.01 (-0.13,  0.10) |
| openMean | -0.14 | -0.08 |  0.08 | -0.10 | -0.06 (-0.27,  0.21) |
| oneWay | -0.04 | -0.10 |  0.07 |   –  | -0.02 (-0.12,  0.11) |
| busywork |  0.09 |   –  |  0.09 | -0.69 | -0.17 (-0.32,  0.11) |
| usage |  0.14 |  0.28 |  0.12 | -0.07 |  0.12 (-0.06,  0.39) |
| steps |  0.17 |  0.10 |  0.15 | -0.48 | -0.01 (-0.20,  0.19) |
| estimate | -0.04 |  0.01 |  0.25 | -0.51 | -0.07 (-0.24,  0.17) |
| v1 |  0.04 |  0.06 |  0.19 | -0.20 |  0.02 (-0.19,  0.33) |

## Janko's experts: do they follow the proof?

Per puzzle, Spearman of the order the expert settled marks with the proof's order (the cheapest-only proof; the usual greedy path from janko-order.ts's results, where kept). Per step, the expert's time for the step's marks against the step's terms with the proof position held fixed: positive means the expert left such steps for later than the proof does.

| type | puzzles | proof order | greedy order | step cost | step size | step reach | jump from the last step |
|---|---|---|---|---|---|---|---|
| akari | 79 of 80 |  0.75 |  0.77 | -0.05 |  0.20 | -0.01 | -0.06 |
| fillomino | 0 of 80 |   –  |   –  |   –  |   –  |   –  |   –  |
| hitori | 73 of 80 |  0.52 |  0.50 |  0.08 |  0.12 |  0.08 | -0.02 |
| masyu | 58 of 80 |  0.48 |  0.48 | -0.01 |  0.05 | -0.03 |  0.04 |
| nurikabe | 7 of 68 |  0.35 |  0.45 |  0.06 |  0.13 | -0.04 | -0.01 |
| slitherlink | 49 of 55 |  0.56 |  0.55 |  0.08 |  0.08 | -0.05 | -0.03 |
| spiral-galaxies | 4 of 80 |  0.21 |  0.37 | -0.37 |  0.18 | -0.37 | -0.02 |
| star-battle | 45 of 80 |  0.76 |  0.76 |  0.10 |  0.15 |  0.05 | -0.03 |

By solver (5 or more puzzles): Otto Janko 100: proof  0.57, greedy  0.58, step cost -0.04; Rainer 92: proof  0.61, greedy  0.62, step cost  0.07; Jürgen Helbig 61: proof  0.58, greedy  0.57, step cost  0.07; Emma 23: proof  0.68, greedy  0.64, step cost  0.04; Steve C 22: proof  0.72, greedy  0.71, step cost  0.10; Groffin 7: proof  0.70, greedy  0.74, step cost  0.00; Holger Zuck 6: proof  0.74, greedy  0.74, step cost  0.05.

## Beast Academy: within each set, against its order (mean Spearman over sets with 3 or more solved); and against tier

Coverage 70 of 88 (cap 0).

| term | akari within sets | akari tier | fillomino within sets | fillomino tier | spiral-galaxies within sets | spiral-galaxies tier |
|---|---|---|---|---|---|---|
| sum | -0.03 (6) |  0.45 |  0.85 (2) |  0.05 |  0.65 (4) |  0.39 |
| peak | -0.10 (6) |  0.39 |  0.68 (2) |  0.37 | -0.34 (4) | -0.61 |
| size |  0.40 (6) |  0.13 |  0.87 (2) |  0.39 |  0.76 (4) |  0.59 |
| sumPerMark | -0.43 (6) |  0.60 |  0.35 (2) |  0.22 | -0.26 (4) | -0.73 |
| splits |  0.00 (6) |  0.00 |  0.80 (2) | -0.26 |  0.00 (4) |  0.00 |
| steps |  0.37 (6) |  0.33 |  0.81 (2) | -0.14 |  0.81 (4) |  0.67 |
| estimate | -0.43 (6) |  0.57 |  0.65 (2) |  0.41 |  0.19 (4) | -0.40 |
| v1 | -0.30 (6) |  0.34 |  0.65 (2) |  0.22 | -0.18 (4) | -0.55 |

## Tatham's grades (Spearman within each game and size)

Coverage 198 of 230 (cap 0).

| term | lightup 10x10 | lightup 7x7 | loopy 10x10 | loopy 7x7 | singles 6x6 | singles 8x8 | solo 9x9 | mean |
|---|---|---|---|---|---|---|---|---|
| sum |  0.65 |  0.77 |  0.55 |  0.51 |  0.76 |  0.50 |  0.52 |  0.61 |
| peak |  0.90 |  0.87 |  0.57 |  0.32 |  0.62 |  0.57 |  0.76 |  0.66 |
| size |  0.62 |  0.81 |  0.61 |  0.54 |  0.77 |  0.61 |  0.45 |  0.63 |
| sumPerMark |  0.66 |  0.70 |  0.55 |  0.51 |  0.76 |  0.50 |  0.39 |  0.58 |
| splits |  0.55 |  0.41 |  0.28 |  0.37 |  0.69 |  0.63 |  0.00 |  0.42 |
| steps |  0.39 |  0.42 |  0.31 |  0.27 |  0.47 |  0.09 |  0.23 |  0.31 |
| estimate |  0.90 |  0.89 |  0.48 |  0.44 |  0.75 |  0.75 |  0.63 |  0.69 |
| v1 |  0.71 |  0.85 |  0.71 |  0.59 |  0.69 |  0.83 |  0.64 |  0.72 |

n: lightup 10x10 30, lightup 7x7 30, loopy 10x10 39, loopy 7x7 40, singles 6x6 20, singles 8x8 20, solo 9x9 19.

