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

## What to do

Add the number of case splits (or rounds) to the estimate, at least for Masyu, and judge it the
way the guard rule asks: fix the form first (for example log(1 + splits) beside the soft-max),
fit its weight on one sample, and test it once on fresh PSJP Masyus and on Tatham's or puzz.link's.
The same saturation probably hits other split-heavy types (Slitherlink, Simple Loop, Nurikabe):
`psjp-features.ts` runs on any type in a few minutes, so check those next.

Rows: scratch only (PSJP data stays private). Scripts: `puzzles/difficulty/psjp-features.ts`,
`puzzles/difficulty/psjp_features.py`.
