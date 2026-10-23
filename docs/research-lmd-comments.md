# What solvers say makes a puzzle good or bad: Logic Masters comments

2026-10-23. Code: `puzzles/difficulty/lmd-themes.ts` and `lmd-faults.ts` (each `tag`, `report`). The
comments, tags and full reports are local-only (`references/lmd/themes.jsonl`, `faults.jsonl` and
their `-report.md`; bucket
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

## What makes a puzzle bad

Josh asked to document what makes a puzzle bad rather than chase individual taste. The 1,373
critical comments (negative in tone, or tagged tedious, stuck or broken) were sorted again into
12 finer complaints, a codebook drawn from reading 90 of them (Haiku 5.5, $0.13). For each
complaint: how much lower the beauty percentile is on puzzles where at least one comment names it,
holding comment count and solver count fixed. Without that hold every complaint looks harmless or
even good, because well-liked puzzles get more comments of every kind.

| complaint | puzzles | beauty pct, held (95%) | what the solver or the site could do |
|---|---|---|---|
| **dull**: a rule or clue that does nothing, an underwhelming or derivative idea | 42 | **−23** (−31 to −15) | check that every clue and rule is used in the proof and needed for uniqueness; variety of step kinds |
| **not unique**: several solutions, none, or a uniqueness argument needed | 37 | **−16** (−26 to −7) | already enforced: clingo proves every inkit puzzle unique |
| **guessing**: trial and error, bifurcation | 92 | **−12** (−18 to −7) | case splits in the solver's path; the stall measures from Aim 4 |
| **rating off**: the stated difficulty is wrong | 63 | **−11** (−17 to −4) | our difficulty estimate; calibration matters |
| **hard to read**: clutter, colours, layout | 59 | **−10** (−17 to −4) | rendering and style, not the solver |
| *platform*: link, answer check, solution code | 105 | **−10** (−16 to −5) | inkit checks in the player; no codes to type |
| **grind**: bookkeeping, arithmetic, too long for what it gives | 105 | **−8** (−13 to −3) | long runs of cheap steps per idea; heavy pencil-marking |
| **rules unclear** | 198 | **−8** (−12 to −4) | the guides (rules with ✓/✗ pictures) |
| **no start**: break-in too hidden | 104 | **−6** (−11 to 0) | the cost of the first step against the rest |
| *own mistake* | 189 | −4 (−7 to 1) | – |
| **wall**: one step mid-solve far harder than the rest | 109 | −3 (−8 to 2) | – |
| theme off | 10 | −10 (−26 to 6) | – |

Reading it:

- **A platform complaint, which isn't the puzzle's fault at all, costs about 10 points.** Some of
  any complaint's penalty is just raters who had a bad time, so read the rest against that line.
- **Dull is the worst by far, and the clearest fault in the design itself.** Comments say "a rule
  that does nothing", "two separate puzzles with no interaction", "the diagonal rule ends up
  underwhelming". It is also the most checkable: a clue or rule the proof never uses is a defect.
- **Guessing hurts; a wall doesn't.** A solve that forces trial and error loses 12 points. A
  single hard step mid-solve loses nothing measurable, and puzzles with one are well liked before
  the hold. People forgive being stuck if logic gets them out. This matches the good side: flow
  is praised and aha adds nothing beyond it, because the aha is usually the wall someone got
  through.
- **Grind and a hidden break-in cost a little.** Not being able to start is milder than not being
  able to continue without guessing.
- **For inkit**, uniqueness and the answer check are already handled. The checkable faults left
  are dull (unused clues and rules), guessing (case splits) and grind (long runs of trivial steps).
  These three could be a "bad puzzle" check run on every generated or submitted puzzle.

## Aha from the solver, not the comments

Josh's point: real ahas may be sparse and the comment tag ("nice break-in") too blunt to find
them. So the aha was measured on the solver's path instead, and set against Puzzle Square JP likes
per solver with the site's difficulty held fixed (`interest-analyze.ts`'s partial Spearman).

An earlier measure already existed (`interest.ts` breakIn: the costliest step, and the easy steps
in the three rounds after it against the average round's), and so did the generator's
`breakInScore`. A stricter one was added and fixed before the run (`ahaOf`): a hard step (cost ≥ 5)
taken in a stalled round (no easy step open), scored by the easy steps it opens in the next three
rounds against the average round's. *aha* is the best such unlock in the puzzle; *ahaCount* is how
many unlock at least twice the average, for the sparse case. The solver was rerun on every PSJP
puzzle of five types (no API spend; rows in the bucket as `psjp/interest-<type>-2026-10-23.csv`).

| type (solved) | aha, raw | aha, beyond difficulty | ahaCount | breakIn | breakInScore | chance ± |
|---|---|---|---|---|---|---|
| Akari (495) | 0.30 | 0.07 | 0.06 | −0.01 | −0.02 | 0.09 |
| Masyu (553) | −0.14 | −0.06 | 0.05 | −0.01 | −0.08 | 0.08 |
| Slitherlink (241) | 0.16 | 0.07 | −0.13 | 0.02 | 0.04 | 0.13 |
| Sudoku (52) | 0.32 | 0.02 | 0.00 | −0.22 | −0.19 | 0.27 |
| Star Battle (41) | 0.24 | 0.01 | 0.02 | 0.28 | −0.02 | 0.31 |

**No aha measure predicts likes beyond difficulty**, on 1,382 puzzles and five types. Raw, the
stricter aha goes with likes (0.16–0.32 outside Masyu), but all of that is difficulty: harder
puzzles have more stalls and bigger unlocks, and harder puzzles get more likes per solver. This
matches the comments (aha adds nothing once flow is known), Opus's elegance score (it tracked
difficulty) and Phase 1's concentration statistic (−0.04). Four measures, three data sources, the
same answer: an aha, as far as we can measure one, is part of difficulty, not a separate pleasure.

What does show beyond difficulty in this run: Masyu likes fall with the share of hard steps
(−0.31) and rise with length (0.21) and uneven flow (0.18); Slitherlink likes rise with the solver's
estimate (0.29) and getting stuck (0.21). Both fit "no grind, a long satisfying line" more than
"one big moment". Masyu solved far more puzzles than in the first run (553 against 275), so its
numbers are new.

## Caveats

- Correlation only, and the commenters are partly the raters. Comment volume is itself the
  strongest predictor, so engagement and beauty move together.
- 85% of the puzzles are Sudoku variants. The non-Sudoku subset (180) points the same way, more
  strongly, but is small.
- Beauty sits near its ceiling (median 92%), so the percentile mostly separates good from great.
- Likes per solver (PSJP) and beauty (LMD) are different yardsticks from different sites; the aha
  test uses only PSJP.
- Complaints are rarer than praise (42 puzzles name "dull"), so the intervals are wide.
- Tags come from one cheap model with one pass. The codebook is ours, and themes overlap (praise
  vs flow; hard vs stuck).
