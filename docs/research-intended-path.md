# The intended path against likes (2026-10-23)

The cheap test from docs/research-state.md ("Experiment: the intended path"): do the features of a
min-peak, split-free path predict Puzzle Square JP's likes per solver once the site's difficulty is
held fixed, and do they do better than the usual path's interest measures? CPU only, local data.

## What ran

- **The solver:** `deduce.ts` gained `minPeak`. Each round it runs the tier-0 windows, and the
  wider stages only when nothing is open at or below max(peak so far, 3). It takes every step at or
  below the peak so far, else only the cheapest. With `maxTier: 1` there are no case splits, so an
  unsolved result means no split-free path exists within the windows.
- **The features** (`intended.ts`): peak, noSplit, hinges, stuck, peakRounds, gap, peakAt, usage
  (the share of the puzzle's rule instances the explanations cite), openMean, oneWay, steps and dSteps.
- **The data** (`intended-run.ts`): 3,286 puzzles with solvers, each solved the usual way (prefix
  `g_`, interest.ts) and min-peak. The puzzles were 1,270 Akari, 459 Slitherlink, 864 Masyu, 416
  Simple Loop and 277 Nurikabe, from the rated set plus psjp-links. It ran with 3 jobs, about 8 hours.
- **The test** (`intended-analyze.ts`): partial Spearman with site difficulty regressed out, with
  bootstrap intervals, and a held-out fit (5 folds × 20) of ranked likes per solver: difficulty
  alone, then with the min-peak features, then with the usual ones. Types were pooled by ranking
  within each type.

Rerun with `node puzzles/difficulty/intended-analyze.ts akari slitherlink masyu simple-loop nurikabe [--solved]`.

## Results

**A split-free path is rare outside easy Akari.** These are the shares with no split-free path:

| Type | Overall | At site difficulty 1 | At site difficulty 3 |
|---|---|---|---|
| Akari | 41% | 2% | 54% |
| Slitherlink | 82% | 52% | 90% |
| Masyu | 89% | 64% | 98% |
| Simple Loop | 64% | 28% | 89% |
| Nurikabe | 99% | 96% | 100% |

These are setters' puzzles, so almost all of that is techniques our windows lack, not guessing.
Nurikabe and the loop genres are the miner's best targets.

**Held-out fit of likes per solver.** Each cell is the gain over difficulty alone:

| Set | Difficulty alone | + min-peak | + usual |
|---|---|---|---|
| All 3,286 | 0.199 | +0.088 | +0.079 |
| 1,077 where min-peak solved | 0.284 | **+0.051** | +0.034 |
| Akari, solved (743) | 0.319 | **+0.088** | +0.052 |
| Simple Loop, solved (150) | 0.143 | +0.121 | +0.082 |
| Masyu, all | 0.142 | +0.131 | +0.099 |
| Nurikabe, all | 0.123 | +0.026 | +0.118 |

**Beyond difficulty, on the puzzles where min-peak solved** (pooled partial Spearman):

- **Clue usage: +0.16.** It is +0.17 on Akari, +0.23 on Masyu and +0.16 on Simple Loop. This is the
  one feature that is new, since the usual path has nothing like it.
- **Peak position: −0.11** (−0.19 on Akari). Puzzles whose hardest step comes earlier get more likes.
- **Tier-0 steps open per round: −0.14.** Fewer moves open at once gets more likes.
- **Peak and dSteps: +0.11 and +0.14.** These overlap with our own estimate (g_estimate, +0.14).
  They are mostly the part of difficulty that the site's 1–5 rating misses, not elegance.
- **Hinges, peakRounds and gap: about 0.** The "one hinge" idea doesn't show up as measured.

## Reading

- **Go, narrowly.** The min-peak features add more beyond difficulty than the usual measures, but
  only on puzzles where a split-free path exists: about +0.02 held-out pooled, and +0.04 on Akari.
  Most of that comes from clue usage and the peak's position.
- **The old −0.15 doesn't hold up.** On this larger sample the usual measures also predict beyond
  difficulty, so that figure (from 72 puzzles) was noise or that sample's.
- **Unsolved paths need care.** Where no split-free path exists, the features describe a partial
  path. The all-puzzles rows mix that with "how far it got", so read the solved rows.

## Caveats

- **Difficulty is held fixed through the site's 1–5 rating, which is coarse.** Part of each
  feature's signal is leftover difficulty, so peak, dSteps and the usual estimate partly measure
  that.
- **Peak is exact only above 3.** Below 3 the wider stages aren't checked.
- **The path is approximate.** Costs depend on order (explanations differ), so min-peak can come
  out above the usual path's peak on a few puzzles.
- **The bootstrap intervals are approximate.** Rows are ranked before resampling.

## Next

- **Use clue usage as the elegance candidate.** Pool it per setter beside the like-rate score.
- **Feed the technique-missing list to the miner.** The rows with `solved=false` in
  `references/psjp/intended-*.csv` are setters' puzzles with no split-free path, and Nurikabe and
  Masyu are nearly all of their rows.
- **Rerun the test once the miner adds techniques.** More puzzles will then solve split-free.
