# What solvers say makes a puzzle good: Logic Masters comments

2026-10-23. Code: `puzzles/difficulty/lmd-themes.ts` (`tag`, `report`). The comments, tags and full
report are local-only (`references/lmd/themes.jsonl`, `themes-report.md`; bucket
`gs://inkit-research-ml/private/refs/lmd/`), because they are Logic Masters users' words.

## The question

Opus's elegance score followed difficulty, not likes (`research-opus-walkthroughs.md`), and our
compression measure of elegance found nothing against likes (`research-trajectory.md`). Josh
asked whether any site's comments say what people find interesting. Logic Masters Deutschland is
the one source we have with comment text: 8,903 comments on the 1,266 puzzle pages crawled on
2026-10-14, and a beauty rating (solvers' vote, %) for most puzzles.

## What ran

Claude Haiku 5.5 (effort low) tagged each comment with any of 12 themes, a tone (−1, 0, 1) and a
short quote of the reason, one call per puzzle with its comments numbered. The cost was $0.35. All
but one puzzle parsed. Spot checks of about 30 tags looked right on most; the quotes chosen
per theme are noisier than the tags. The puzzle author's own comments are left out (8,052
comments remain). Beauty is turned into a percentile among all the portal's rated puzzles of the
same solvers' difficulty level, so difficulty is held fixed. 1,224 puzzles have both.

| theme | share of comments | meaning given to the tagger |
|---|---|---|
| praise | 69% | enjoyment with no reason given |
| social | 27% | thanks, replies, chat |
| rules | 22% | the rules or constraints interact in an interesting or novel way |
| hard | 20% | hard, tricky, took long |
| look | 16% | theme, title, story, picture |
| aha | 14% | a clever key deduction or break-in |
| flow | 14% | the solve flowed, fell into place |
| stuck | 9% | got stuck, confused, needed a hint |
| easy | 8% | easy, gentle, a good introduction |
| broken | 7% | errors, unclear rules, link problems |
| learning | 4% | learned or practised a technique |
| tedious | 4% | bookkeeping, grind, trial and error |

77% of comments are positive and 4% negative. Most people who comment liked the puzzle.

## Results

**With difficulty held fixed, "flow" is the theme that goes most with beauty.** Spearman of each
theme's share of a puzzle's comments with its beauty percentile (95% interval):

| theme | all 1,224 puzzles | ≥ 5 comments (668) | not Sudoku (180) |
|---|---|---|---|
| flow | **0.28** (0.22–0.33) | **0.26** | **0.37** |
| aha | 0.22 (0.16–0.27) | 0.12 | 0.26 |
| rules | 0.21 (0.16–0.27) | 0.14 | 0.31 |
| look | 0.18 | 0.12 | 0.13 |
| hard | 0.13 | −0.03 | 0.18 |
| stuck | 0.02 | −0.13 | −0.15 |
| tedious | −0.03 | −0.16 | **−0.28** |
| broken | −0.08 | **−0.21** | −0.11 |

**Taken together, flow and interesting rules add something and aha doesn't.** Least squares of the
beauty percentile on every theme's share plus log comments and log solvers (points of beauty
percentile per standard deviation, 95% bootstrap interval):

- flow +2.7 (1.4 to 4.1), rules +2.6 (1.4 to 3.9), learning +2.5 (1.0 to 4.1);
- aha +0.6 (−0.6 to 2.0), look +0.2, hard +0.2: nothing beyond the others;
- broken −2.9, tedious −2.1, stuck −1.6 (all intervals below zero);
- the biggest term is how many comments a puzzle gets (+11.5), then plain praise (+5.0) and
  solvers (+4.2). R² 0.34.

Comments that mention an aha usually also say it flowed ("lovely break-in, and the logic remained
interesting throughout"), so the break-in alone carries no weight once the flow is known.

## What it suggests

- **What people praise is a solve that keeps moving, not one concentrated aha.** Our working
  definition of elegance (`research-trajectory.md`: short total, bits concentrated in one or two
  steps) is close to the aha theme, which is the one that drops out. A better candidate is the
  absence of stalls: steady progress, no grind, no trial and error. The solver can measure that
  directly (case splits, how long the cheapest available step stays expensive, step-cost spikes
  after the break-in). That is a cheap next test against LMD beauty (104 plain Sudokus and other
  standard puzzles we convert) and PSJP likes.
- **The negatives are clearer than the positives on well-commented puzzles:** tedium, being stuck
  and errors pull beauty down. An "avoid grind" filter may be worth more than an "aha" detector.
- **Interesting rule interactions matter**, but that is about variant design and mostly outside our
  standard genres.

## Caveats

- Correlation only, and the commenters are partly the raters. Comment volume is itself the
  strongest predictor, so engagement and beauty move together.
- 85% of the puzzles are Sudoku variants. The non-Sudoku subset (180) points the same way, more
  strongly, but is small.
- Beauty sits near its ceiling (median 92%), so the percentile mostly separates good from great.
- Tags come from one cheap model with one pass. The codebook is ours, and themes overlap (praise
  vs flow; hard vs stuck).
