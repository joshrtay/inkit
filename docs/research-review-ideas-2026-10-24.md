# Review ideas 1 to 4 and 6: results (24 October 2026)

The free ideas from [research-review-2026-10-24.md](research-review-2026-10-24.md), run in one day
with no spend. Ideas 5 (bad-puzzle check) and 10 (solve logging) went to the product thread. The
bucket was out of reach from this thread, so everything ran on the copies in the project files
(Janko's recordings, the human labels, the tuned network `relations-tune/best.pt`, PSJP and
puzz.link ratings, the benchmark's whole-solve rows).

## The short version

| # | Idea | Result | What it changes |
|---|---|---|---|
| 1 | Inter-person ceiling from repeat Janko solves | **Not possible.** 6,723 solves of 6,683 distinct puzzles, one solver each; one puzzle has two different solvers. | The ceiling needs inkit's own logs (several players, same puzzle). The review's "6,700 solves on 5,200 puzzles" was wrong. |
| 2 | Size and ceiling audit | Cell count alone scores **0.31** within type on PSJP (Hitori 0.63). puzz.link and PSJP raters agree at **0.69**. | The fitted 0.65 is real gain beyond size, except on Hitori. It is not at the ceiling: a perfect score could reach about 0.83 against one rater, and Masyu has the most room. |
| 3 | Per-solver analysis | Within a type, the network's agreement differs by person by 15 to 25 points (Masyu 44% vs 59%, Hitori 51% vs 30%). Nearness is a property of the genre, about the same for every solver in it. | The model is not a Rainer model, but people differ: a per-player term is worth having once inkit logs exist. Nearness is not a personal habit. |
| 4 | Insight-grain scoring | 63% of the people's next moves are not the cheapest step on offer. The network drops only from 56% to 51% on them; nearness halves (35% to 18%). | The network's edge is on the real choices, not the bookkeeping. Star Battle and Masyu are the exceptions, and the place to improve it. |
| 6 | Weak-model solve rate as a novice proxy | Weak setups' solve rate tracks human ratings better than the solver's estimate: Thinky 0.58 vs 0.46; within genre 0.65 vs 0.40 (Thinky) and 0.53 vs 0.45 (puzz.link). | A cheap model run is a usable stand-in for novice difficulty until inkit has solve times. Small n (63 and 69 puzzles). |

## 1. Inter-person ceiling

`puzzles/difficulty/janko-repeats.ts` groups Janko's files by their puzzle and solution sections and
reads every [moves] block (four Hitori files hold two).

- 7,619 files, 6,723 with moves, 6,683 distinct puzzles. Solvers: Rainer 2,109, Steve C 1,125,
  Jürgen Helbig 996, Angela Janko 786, Otto Janko 711, Groffin 562, Emma 409, a handful of others.
- **One** puzzle has two different solvers (Easy as ABC, Rainer and Emma: 23 of 47 positions, 49%).
- 40 pairs are the same person solving the same puzzle twice (30 of them Groffin on Numberlink, the
  same grids republished). Replaying one solve's order to predict the other: the first open mark
  in A's order is among B's next 3 moves **32%** of the time (34% when A's order resumes from the
  point that best matches B's position), random 9%; whole-order Spearman median 0.86.
- That replay ignores the position, so it is a floor on what the person would do, not a ceiling,
  and it is one person on one genre. It sits far under the network's 69% on Numberlink.

**Verdict:** there is no inter-person ceiling in Janko's data. The product thread logging solves
was asked to keep each move's time and the player, so two players on one puzzle give the ceiling.

## 2. Size and ceiling audit

`puzzles/difficulty/size_audit.py`, on psjp-full (all rated puzzles, variation 0) and the 3,163
puzz.link records of PSJP puzzles.

Cell count alone, Spearman with the PSJP rating within type:

| Type | n | Cells alone | Best fitted or solver figure so far |
|---|---|---|---|
| Akari | 2,869 | 0.29 (0.26 to 0.33) | solver 0.71 |
| Masyu | 2,793 | 0.33 (0.29 to 0.36) | sim 0.53 |
| Slitherlink | 1,585 | 0.28 (0.24 to 0.33) | sim 0.61 |
| Simple Loop | 842 | 0.31 (0.25 to 0.38) | sim 0.74 |
| **Hitori** | 119 | **0.63** (0.52 to 0.74) | sim 0.70, solver 0.64 |
| n-weighted | | **0.31** | fits 0.65 to 0.66 |

(The right column is from step 2's 1,517-puzzle sample, a subset; the cells figures are on the
whole rated set.)

Raters: puzz.link's rating against PSJP's on the same puzzles, within type: Masyu 0.76 (174), Akari
0.68 (153), Numberlink 0.59 (102), Nurikabe 0.70 (94), Slitherlink 0.60 (72), Shikaku 0.84 (32),
Fillomino 0.46 (28), Spiral Galaxies 0.89 (25); **0.69** n-weighted. Cells against PSJP on the same
set: 0.36.

- **Gains are not size.** Outside Hitori, size alone is 0.28 to 0.33, so the solver and the fits add
  0.2 to 0.4 beyond it. On Hitori the whole signal could be size: the fits barely beat cells alone.
- **The ceiling is higher than the review said.** Two raters agreeing at 0.69 means each rating has
  a reliability near 0.69; a score that tracked the true difficulty perfectly would correlate about
  √0.69 ≈ 0.83 with one rater (classical test theory; Spearman on 1 to 5 scales, so approximate).
  0.65 is about 80% of the way there, not at the wall.
- **By type:** Akari's solver estimate (0.71) already matches its raters (0.68), and Slitherlink's sim
  (0.61) matches its 0.60. Masyu is the gap: raters 0.76, our best 0.53.

So critique 3 ("difficulty on the fitted games is finished") holds for Akari and Slitherlink and
fails for Masyu.

## 3. Per solver

`puzzles/difficulty/per_solver.py`: the tuned network on opus_human_tune.py's held-out side (1,192
puzzles, 6 states each, the person's own positions), its top guess among the person's next 3,
beside nearness (the open mark nearest the person's previous move, ties shared) and random.
Intervals resample puzzles.

All: network 51% (50 to 53), nearness 24%, random 6%. By solver over all types: Groffin 64%, Emma
56%, Rainer 54%, Otto Janko 52%, Steve C 52%, Jürgen Helbig 45%, Angela Janko 30% (mostly Spiral
Galaxies and Fillomino, the network's weakest types).

Within a type, where two people have enough puzzles:

| Type | Person (puzzles) | Network | Nearness |
|---|---|---|---|
| Masyu | Otto Janko (118) | 44% (39 to 48) | 8% |
| Masyu | Steve C (55) | **59%** (54 to 65) | 7% |
| Hitori | Rainer (210) | 51% (48 to 54) | 33% |
| Hitori | Steve C (11) | **30%** (21 to 42) | 40% |
| Akari | Otto Janko (97) | 59% (54 to 64) | 3% |
| Akari | Steve C (7) | 36% (21 to 52) | 14% |
| Star Battle | Rainer (59) / Steve C (54) / Jürgen (19) | 55% / 49% / 54% | 40% / 39% / 34% |
| Numberlink | Otto Janko (20) / Groffin (46) | 71% / 67% | 7% / 5% |
| Nurikabe | Otto (13) / Jürgen (24) | 56% / 44% | 58% / 54% |

- **People differ.** Masyu's 15-point gap between Otto Janko and Steve C has disjoint intervals; so
  do Hitori's and Akari's for Steve C. The network fits some people better on the same genre.
- **Not a seven-person model in the worrying sense:** Rainer, a third of the data, is not the best
  fitted, and every solver lands well above random and nearness on most types.
- **Nearness is the genre's, not the person's.** Within a type the solvers' nearness agree within
  about 10 points (Star Battle 34 to 45%, Nurikabe 54 to 58%), while between types it runs from 2%
  (Akari) to 58% (Nurikabe). A person's habit would show across their types; a recorder artefact
  would show in every type. This fits local logic: in some genres the next forced mark is next to
  the last one.
- On Nurikabe and Slitherlink, plain nearness ties the network.

## 4. Insight-grain scoring

`puzzles/difficulty/insight_grain.py` (prep and score) and `insight-menus.ts`: deduce.ts's menus at
the same held-out states (every step any window makes there, none taken). The person's next move is
**bookkeeping** if the smallest windows (stage 0) make it within 0.5 of the cheapest step on offer;
otherwise an **insight**: a dearer step on the menu, or a move no window makes from there. 1,192
puzzles listed at 60 s each; 65 ran out of time and 21 crashed, leaving 6,416 of 7,146 states.

| Next move | States | Network | Nearness |
|---|---|---|---|
| Bookkeeping | 2,354 (37%) | 56% | 35% |
| Insight, a dearer step | 3,041 | 51% | 17% |
| Insight, off the menu | 1,021 | 50% | 18% |

The split holds at other thresholds: with the tie at 0, 1.5 or 3, bookkeeping is 55 to 59% for the
network and 31 to 39% for nearness; insights 49 to 51% and 14 to 19%.

By type (bookkeeping / insight; share of states that are insights): Star Battle 69% / **33%** (48%
insights), Masyu 58 / 47 (78%), Minesweeper 64 / 49, Numberlink 89 / 68, Akari 62 / 55, Hitori 49 /
53 (33%), Slitherlink 38 / 38, Skyscrapers 13 / 62 (88% insights; 15 bookkeeping states).

- **Most moves are choices.** Even in recorded expert solves, 63% of next moves are not the cheapest
  step available: people do not mop up cheap consequences first.
- **The network's lead is on the choices.** Over nearness it gains 21 points on bookkeeping and 33 on
  insights. The walkthrough finding ("the gap to people is mostly bookkeeping") was about Opus and
  negative marks; it does not describe the network.
- **Where to improve it:** Star Battle (insights 33%) and Masyu (47%) are where the network loses the
  person once the obvious moves run out; Slitherlink is low everywhere.
- **For hints:** an insight is the unit a hint should name. On insight moves the network finds the
  person's move half the time, so it can say where to look; whether it can say why is the hint test.

## 6. Weak models as a novice proxy

`puzzles/difficulty/bench-novice.ts` (the solver's estimate at 60 s on the benchmark's 133
puzzles) and `bench_novice.py`. Weak setups: Haiku low, Sonnet low, Haiku high, no hints. Spearman
with the human rating, where higher means harder:

| Set | n | Weak unsolved | Weak, answer not placed | All six unsolved | Solver estimate | Cells | Rank average, solver + weak |
|---|---|---|---|---|---|---|---|
| Thinky (author level) | 63 | **0.58** (0.38 to 0.73) | 0.58 | 0.57 | 0.46 (0.23 to 0.64) | 0.26 | 0.60 |
| puzz.link (band), pooled | 69 | 0.30 | 0.29 | 0.35 | 0.07 | 0.02 | 0.20 |
| Within genre, n-weighted: Thinky | 50 | | 0.65 | 0.51 | 0.40 | 0.38 | |
| Within genre, n-weighted: puzz.link | 69 | | 0.53 | **0.62** | 0.45 | 0.11 | |

Thinky by genre (weak / solver): Akari 0.81 / 0.51, Star Battle 0.76 / 0.55, Numberlink 0.60 / 0.41,
Nurikabe 0.33 / 0.21, Nonogram 0.63 / **0.91** (8 to 10 puzzles each).

- **The proxy works at least as well as the solver** on both sets, and better on Thinky, whose
  ratings are for players rather than experts. Weak placed share and the solver correlate only 0.43,
  so they measure different things.
- **Pooled across genres the solver fails on puzz.link (0.07)**; its estimate is a within-type scale.
  The models' rate is closer to a cross-genre scale (0.30 pooled).
- **Not run:** Beast Academy, where the estimate runs backwards (−0.57). That needs new model runs
  (weak setups only, a few dollars).
- Small n: one run per setup, 14 puzzles a band, and part of a weak model's failure is reading the
  grid (the benchmark's perception cost).

## What to do next

- **Difficulty:** Masyu is the one fitted game with room (raters 0.76, ours 0.53); Hitori's signal is
  mostly size. Report every difficulty figure beside cells alone and √(inter-rater).
- **Novice difficulty:** run the weak setups on Beast Academy's sets (a few dollars, needs an OK); if
  they read the set order the right way round, use the weak-model rate as the novice score until
  inkit solve times exist.
- **Human model:** improve on Star Battle and Masyu insight moves; add a per-player term once inkit
  logs exist.
- **The ceiling:** comes only from inkit (two players or more per puzzle, moves with times).

All scripts are on branch `claude/project-thread-vdfhuc`; they take the data paths as arguments,
and no data is in the repo.
