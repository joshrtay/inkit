# Masyu difficulty: the estimate saturates (24 October 2026)

Masyu was the fitted game with the most room: puzz.link and PSJP raters agree at 0.76 (ceiling
about 0.87), and our best score was 0.53 (step 2's simulated cost sum). The reason is the
solver's estimate itself, not missing techniques. Its formula (deduce.ts `estimateOf`) scores the
soft-max of step costs, the hardest few steps, and caps at 0.9. Nearly every Masyu needs at least
one case split, and one split is enough to reach the cap, so the estimate can't tell one split from
twenty. What separates easy from hard Masyu is how often the solver gets stuck, which the estimate
ignores.

Data: the solver at 60 s (`psjp-features.ts`) on two PSJP samples, then `psjp_features.py`.
- **10 × 10 only, spread over the ratings** (70 a rating, 12 at rating 5; 291 solved): one size, so
  size can't explain anything.
- **All sizes at the ratings' own mix** (250, hashed draw; ratings 2 and 3 are 80% of it).

| Readout (Spearman with the PSJP rating) | 10 × 10, spread | All sizes, natural |
|---|---|---|
| Solver estimate | **0.19** (0.07 to 0.31) | **0.19** (0.06 to 0.31) |
| Case splits and search steps | 0.64 (0.57 to 0.71) | 0.54 (0.45 to 0.63) |
| Rounds | 0.72 (0.66 to 0.77) | 0.56 (0.47 to 0.66) |
| Mean step cost | 0.64 | 0.44 |
| Soft-max of step costs (the estimate's input) | 0.53 | 0.40 |
| Entry points at the start (fewer is harder) | −0.59 | −0.29 |
| Black pearls (more is easier) | −0.50 | −0.18 |
| Cells | (one size) | 0.28 |
| Ridge on 26 solver readouts, held-out halves | **0.76, 0.76** | **0.63, 0.64** |

- **The estimate is flat:** 80% of puzzles sit at its top value (0.85 or more), and its mean is 0.82
  to 0.85 at every rating from 1 to 5. Case splits run 1.2, 4.8, 9.3, 11.0 and 28.5 from rating 1
  to rating 5 in the natural sample.
- **The split count alone (0.54) matches the best score so far (0.53).** A held-out ridge on the
  solver's own readouts reaches 0.63 on the natural sample and 0.76 on the spread one, where the
  raters agree at 0.76.
- **Not a size effect:** the 10 × 10 sample has one size, and cells alone score 0.28 on the natural
  one.
- PSJP's solve count tracks the rating at −0.58 to −0.77 (harder puzzles get fewer solves). It is
  popularity, not something the solver can see, and it is left out of the ridge.

## What was proposed

Add the number of case splits (or rounds) to the estimate, judged the way the guard rule asks: fix
the form first, fit its weight on one sample, test it once on fresh PSJP Masyus and on puzz.link's,
and check the other split-heavy types (Slitherlink, Simple Loop, Nurikabe).

## The fix: a case-split term in the estimate

Josh said go ahead (24 October, 20:54Z). The form was fixed before fitting (`estimate_splits.py`):
estimateOf's two terms plus S · clamp(log2(1 + splits) / 5), with splits the steps of tier 2 or
more (32 or more count as 1), S taken out of the soft-max's weight, and solves still capped at 0.9.
S was fitted on the natural Masyu sample only. The curve is flat from about 0.3 (0.53 at 0.30,
0.54 from 0.40 to 0.70), so S = 0.35 was taken as the smallest weight within 0.01 of the best.
Nothing else was tuned, and every other row below was scored once at that S.

| PSJP rating unless noted (n) | Today | With splits | Gain (bootstrap 95%) |
|---|---|---|---|
| Masyu, fit sample (250) | 0.19 | 0.54 | +0.34 (+0.22 to +0.47) |
| **Masyu, fresh: the next 250 of the same draw** | 0.28 | **0.54** | **+0.26 (+0.15 to +0.38)** |
| Masyu, puzz.link ratings (249) | 0.44 | 0.50 | +0.06 (−0.06 to +0.17) |
| Slitherlink (150) | 0.40 | 0.64 | +0.24 (+0.13 to +0.37) |
| Simple Loop (150) | 0.36 | 0.55 | +0.18 (+0.10 to +0.29) |
| Nurikabe (140) | 0.37 | 0.47 | +0.10 (+0.01 to +0.19) |
| Hitori (119) | 0.57 | 0.60 | +0.04 (−0.02 to +0.10) |
| Akari (150) | 0.79 | 0.79 | 0.00 |
| Star Battle (148) | 0.80 | 0.80 | 0.00 |
| Shikaku (149) | 0.45 | 0.45 | 0.00 |
| Spiral Galaxies (114) | 0.17 | 0.17 | 0.00 |
| Fillomino (30 with a solve) | 0.68 | 0.66 | −0.03 (−0.09 to 0.00) |

- The loop games gain most, as expected: their solves are mostly splits, and the soft-max had
  saturated (Slitherlink 55% at 0.85 or more, now 2%; Masyu 78% to 4%). No type loses beyond noise.
  Fillomino's −0.03 is on 30 puzzles, the few its solver finishes at 60 s.
- puzz.link's Masyu ratings gain less (within noise). Its easiest band (rating −2, 11 puzzles) has
  the most splits (35 on average): big, easy puzzles whose many forced loops the solver splits on.
- **The scale moves.** The soft-max term lost weight, so types without many splits read lower:
  Akari's mean 0.49 to 0.36, Star Battle's 0.54 to 0.35, Masyu's 0.83 to 0.66. Ranks within a type
  are what the table tests. The AI scorer passes `profile.estimate` to the site as its difficulty
  (puzzles/difficulty/scorer.ts), and the site's levels cut at 0.4 and 0.62, so AI-posted Akari and
  Star Battle puzzles would show "easy" more often. Setting the levels against the ratings is a
  separate step.
- Not yet: Numberlink (still running when this was written), and Tatham and Janko as guard sources.

Rows: scratch only (PSJP data stays private). Scripts: `puzzles/difficulty/psjp-features.ts`
(now with `--skip` for a fresh draw), `puzzles/difficulty/psjp_features.py`,
`puzzles/difficulty/estimate_splits.py`. The change: `estimateOf` in `puzzles/difficulty/deduce.ts`.
