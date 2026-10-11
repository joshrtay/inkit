# Research: rating Sudoku difficulty against people

We are building two raters. One is a Sudoku technique solver (singles, intersections, subsets,
fish, wings, chains, uniqueness) with a rating in the style of Sudoku Explainer (SE). The other
is the general deduction solver (`puzzles/difficulty/deduce.ts`). It finds steps in small
windows, costs each by its smallest explanation, combines the costs by soft-max and adds rule
load. This note collects what is known about rating Sudoku against human data, and the data we
can test against.

Raw notes are in `references/sudoku-difficulty/` (local only).

## Pelánek's findings

Radek Pelánek (Masaryk University, Brno) is the main source of published results that compare
difficulty measures with human solving times.

### Sudoku (FLAIRS 2011; arXiv 2014)

The FLAIRS paper [1] and its full version, the tech report "Human Problem Solving: Sudoku Case
Study" [2], were expanded into the arXiv overview [3]. The numbers below are from [3].

**Data.** Times scraped from three sites, with the webmasters' help:

| Source | Puzzles | Solvers | What was recorded |
|---|---|---|---|
| fed-sudoku.eu (2008) | 1,089 | about 131 per puzzle | each solve's time, by user |
| sudoku.org.uk (2006–09) | 731 used of 1,331 | about 1,307 per puzzle | count and mean time only |
| czech-sudoku.com | 15 | 10–60 per puzzle | every move with a timestamp |

Difficulty is the mean solving time. The median and per-solver normalised times all correlate
above 0.93 with the mean; the median did slightly better. The first 600 days of sudoku.org.uk
were dropped because of a learning effect (time fell as the site aged, r = −0.30).

**Measures compared.**

- Number of givens.
- Search effort: backtracking steps, simulated annealing steps, harmony search.
- Constraint relaxation: drop k random constraints and count solutions, or measure "fixedness"
  (how often a cell keeps its value across the relaxed solutions).
- Technique ratings: SE's rating (the hardest step), a linear model over how many times each
  SE technique is used ("Serate LM"), and Fowler's formula over technique counts.
- His own model, SiSuS. It knows only naked and hidden singles and picks at random among the
  moves available. Two metrics come from it:
  - **Refutation sum.** When singles stall, refute each wrong candidate with simple steps, and
    add up the steps needed. It is averaged over 30 runs.
  - **Dependency.** The mean number of simple moves available at each of the first k steps.
    Few options means each step depends on the last. k of 20 to 30 worked best.
- Linear combinations, fitted on half the puzzles and tested on the other half.

**Results** (Pearson r with mean time; Spearman gave the same order):

| Measure | fed-sudoku.eu | sudoku.org.uk |
|---|---|---|
| Backtracking | 0.16 | 0.25 |
| Harmony search | 0.18 | 0.22 |
| Number of givens | 0.25 | 0.27 |
| Simulated annealing | 0.38 | 0.39 |
| Relaxation: solutions | 0.40 | 0.46 |
| Relaxation: fixedness | 0.56 | 0.61 |
| Dependency | 0.67 | 0.69 |
| Refutation sum | 0.68 | 0.83 |
| Fowler | 0.68 | 0.87 |
| SE rating (hardest step) | 0.70 | 0.86 |
| SE technique counts, linear model | 0.78 | 0.86 |
| Refutation + dependency | 0.74 | 0.88 |
| SE + Fowler + refutation + dependency | **0.84** | **0.95** |

The 0.95 in the abstracts is this last row on sudoku.org.uk. The 0.88 is the less
Sudoku-specific pair (refutation and dependency).

**What he concludes.**

- Difficulty has two sources: how hard each step is, and how the steps depend on each other.
  The second is real and separate. Dependency alone reaches about 0.7. Among puzzles that
  singles alone solve, where step difficulty barely varies, it reaches 0.73–0.80.
- The hardest step alone is a good but incomplete rating. Counting how often each technique is
  used beats it on one site (0.78 against 0.70). Adding structure beats both.
- Search effort is a poor proxy. Backtracking is worse than counting givens.
- His simple model also predicts the order in which people fill cells (r about 0.85–0.95 on
  intermediate puzzles).
- For Nurikabe (45 puzzles from his tutor), constraint relaxation reached r = 0.9 and a
  propagation-based measure 0.8. He calls this preliminary.

### Transport puzzles (FLAIRS 2011)

Jarušek and Pelánek [4] collected their own data: several hundred people, mostly students, and
over 400 hours of solving. They had 35 Sokoban, 45 Rush Hour and 40 "replacement" puzzles. Their
model is a random walk over the state space that prefers moves toward the goal and remembers
visited states. The metric is the mean number of steps to the goal over 1,000 runs.

| Puzzle | Shortest path (Pearson / Spearman) | Model |
|---|---|---|
| Rush Hour | 0.77 / 0.90 | 0.75 / 0.90 |
| Sokoban | 0.19 / 0.41 | 0.39 / 0.61 |
| Replacement | 0.28 / 0.21 | 0.57 / 0.49 |

The size of the state space did not correlate at all. Solution length works only when moves are
reversible and easy to imagine (Rush Hour). One outlier moved Sokoban's Pearson r from 0.39 to
0.80, so they prefer Spearman for small sets. Earlier work on Sokoban [5] used a decomposition
metric on 2,000 solves.

### Problem Solving Tutor

The tutor (tutor.fi.muni.cz) is a free practice site run by Pelánek's group [6–8]. By 2013 it had
over 10,000 users, 13,000 hours and 400,000 solved problems across 30 problem types. Those
include Sokoban, Rush Hour, Nurikabe, Slitherlink, Tilt maze and region division. The papers model
solving times like item response theory: log time is linear in the player's skill, with a
difficulty and a discrimination per problem. Most of the predictive gain comes from a simple
baseline: the problem's mean log time, shifted by how fast this player usually is. Learning-rate
estimates are stable between halves of the data (Spearman 0.5–0.7). Two practical points: work
in log time, and separate player skill from puzzle difficulty.

A 2011 master's thesis on Nurikabe (Babinčák, supervised by Pelánek) collected human solves on
the group's site and compared them with a human-like solver [9].

### Is the data available?

No. The Sudoku times came from the sites' operators and were not released. The tutor's data is
"internal, available on request": the lab's data page asks outside researchers to contact
Pelánek for a password [10]. No license is stated. The lab's public datasets are about geography,
maths and anatomy, not puzzles.

## What this means for our two solvers

1. **Rate with more than the hardest step.** SE's rating is the hardest step. It got 0.70/0.86
   alone, and adding technique counts and structure raised that to 0.84/0.95. Our soft-max is
   between a max and a sum, which is a reasonable start. The technique solver should also record
   how many times each technique was used, not only the hardest. Fit the weights on held-out human
   data rather than by hand.
2. **Add a dependency measure.** This is the part SE misses. `deduce.ts` already counts
   `entryPoints`, the easy steps available at the start. Pelánek's version averages the number of
   easy steps available at each of the first 20–30 steps. Both solvers can compute this from
   their step loop. It matters most for easy puzzles, where step costs are all alike. That is
   most of our puzzles.
3. **Grade case splits instead of capping them.** The refutation sum (simple steps needed to
   rule out each wrong candidate) is close to `deduce.ts`'s tier 2 (assume a mark, propagate to a
   contradiction). Charging by the length of the refutation, not one flat tier cost, gives a
   graded measure. It reached 0.83 on its own on the larger dataset.
4. **Don't use search effort as difficulty.** Backtracks and search-tree depth correlated
   0.16–0.25. Several big public datasets are rated this way (Kaggle, sudoku-extreme). Use them
   for coverage and speed, not as ground truth.
5. **Work in log time and use the median.** Remove learning effects (players' first puzzles,
   a site's early days). Report Spearman as well as Pearson, because Pearson moves a lot on small
   sets with outliers.
6. **The general solver should hold up beyond Sudoku.** The relaxation and refutation measures
   were his general-purpose ones. They did well on Nurikabe and reasonably on Sudoku (0.88
   combined). That supports a genre-free rater like `deduce.ts`, with the Sudoku technique
   solver as the specialised check.

## Datasets

Nothing here was downloaded. Sizes and licenses are as stated on the pages; check before use.

| Name | Size | Rating kind | License | Link | Use for us |
|---|---|---|---|---|---|
| Sudoku Explainer / SukakuExplainer `serate` | tool | SE: hardest step; also pearl and diamond ratings (the hardest step before the first placement or elimination) | LGPL-2.1 | [repo](https://github.com/SudokuMonster/SukakuExplainer), [CLI](https://github.com/SudokuMonster/SukakuExplainer/wiki/Batch-mode-command-line-parameters), [scale](https://github.com/SudokuMonster/SukakuExplainer/wiki/Difficulty-ratings-in-Sudoku-Explainer-v1.2.1) | Reference rater: our technique solver's rating should match SE's on standard sets |
| HoDoKu | tool | Per-technique level and score; the puzzle score is the sum of step scores | GPLv3 | [site](https://hodoku.sourceforge.net/), [rating docs](https://hodoku.sourceforge.net/en/docs_cre.php) | Second reference; its summed score is a "steps count" rating |
| Kaggle, 3 million Sudoku with ratings (Radcliffe) | 3M | Mean search-tree depth over 10 runs (machine), 0–8.5 | CC0 per the OpenML mirror; confirm on Kaggle | [Kaggle](https://www.kaggle.com/datasets/radcliffe/3-million-sudoku-puzzles-with-ratings), [OpenML 43476](https://www.openml.org/d/43476) | Bulk, mostly easy; speed and coverage tests; not ground truth |
| tdoku benchmarks (Dillon) | kaggle 100k, unbiased 1M, 17-clue 49,158, top1465, forum hardest 1905 (over 2M) and its SE 11+ subset (about 49k), hardest 1106 (376) | Mostly none; the forum sets are SE-rated | Code BSD-2-Clause; data licenses not stated | [README](https://github.com/t-dillon/tdoku/blob/master/benchmarks/README.md) | The "unbiased" set is a fair sample of all Sudoku; the forum sets test the hard end |
| enjoysudoku "potential hardest" list (champagne) | about 3M (2020) | SE, mostly 11.x | none stated | [summary](https://sw-amt.ws/sudoku/doc/_build/html/potential-hardest-sudokus.html) | Check the chain and net techniques against SE at the top of the scale |
| Royle's 17-clue list | 49,151 (49,158 completed) | none | none found | [McGuire et al.](https://arxiv.org/abs/1201.0749) | Hidden-single-heavy test set |
| sudoku-extreme (Sapient) | about 3.8M train, 423k test | tdoku backtracks | not stated | [card](https://huggingface.co/datasets/sapientinc/sudoku-extreme) | Same caveat as the other machine ratings |
| Sudoku-Bench (Sakana) | 100 puzzles, plus Cracking the Cryptic solve transcripts | Expert-curated variants | not verified (card needs login) | [paper](https://arxiv.org/abs/2505.16135) | Hard variant puzzles with a human solve narrative; qualitative |
| Pelánek's Sudoku times | about 1,800 puzzles | Human mean time | not released | [3] | Not available |
| Problem Solving Tutor | 30 types, 400k solves | Human times | on request | [10] | Ask Pelánek if we need human times for Nurikabe, Slitherlink and other types |
| Puzzle Square JP (already used by `calibrate.ts`) | per genre | Site difficulty labels | site terms | — | Labels across many genres |

Human ratings other than times: a 2025 study of 6×6 Sudoku found SE's rating agrees with human
1–5 ratings at Spearman 0.87, while two people agreed with each other at 0.80 [11]. Project
Patti compared measures against the labels of five Sudoku sites. It warns that web solving times
are inflated by pauses [12]. We found no public dataset of human Sudoku solving times.

## Evaluation plan

1. **Match SE first.** Run `serate` with SE 1.2.1 settings on a sample stratified by SE rating:
   the tdoku unbiased set, top1465, and a slice of the forum list. Our technique solver's rating
   should agree on most puzzles and differ only where its technique list differs. Look at each
   disagreement.
2. **Compare the two solvers.** On the same sample, report Spearman between `deduce.ts`'s
   estimate (and its parts: soft-max cost, max cost, step count, entry points) and SE's rating.
   SE is not ground truth. A large gap on easy puzzles is expected, because SE ignores
   dependency.
3. **Collect our own human times.** We already record solves through the GameHost. For each
   puzzle keep the median log time, after dropping each player's first few puzzles and long idle
   gaps. Fit log t = difficulty − skill, as the tutor papers do, so fast players don't bias easy
   puzzles. Aim for at least 30 solvers per puzzle (the EDM 2013 paper needed about 30 to
   estimate discrimination) and a few hundred puzzles.
4. **Validate against those times.** Use Pearson and Spearman with a split half: fit the
   weights of any combination (soft-max k, rule load weight, dependency, technique counts) on
   one half and report the other. The target is Pelánek's range, 0.8–0.9. Report each part
   alone too, so we can see what carries the signal.
5. **Other genres.** Repeat step 4 for our other types, using our own times and Puzzle Square
   JP labels. If we need outside human times for a Nikoli genre, ask Pelánek for the tutor data
   (Nurikabe, Slitherlink).

## References

1. R. Pelánek, "Difficulty Rating of Sudoku Puzzles by a Computational Model", FLAIRS 2011.
   https://www.fi.muni.cz/~xpelanek/publications/flairs-sudoku.pdf
2. R. Pelánek, "Human Problem Solving: Sudoku Case Study", FIMU-RS-2011-01.
   https://www.fi.muni.cz/~xpelanek/publications/sudoku-tr.pdf
3. R. Pelánek, "Difficulty Rating of Sudoku Puzzles: An Overview and Evaluation",
   arXiv:1403.7373, 2014. https://arxiv.org/abs/1403.7373
4. P. Jarušek, R. Pelánek, "What Determines Difficulty of Transport Puzzles?", FLAIRS 2011.
   https://cdn.aaai.org/ocs/2518/2518-11200-1-PB.pdf
5. P. Jarušek, R. Pelánek, "Difficulty Rating of Sokoban Puzzle", STAIRS 2010.
   http://www.fi.muni.cz/~xpelanek/publications/stairs2010-final.pdf
6. P. Jarušek, R. Pelánek, "Analysis of a Simple Model of Problem Solving Times", ITS 2012.
   https://www.fi.muni.cz/~xpelanek/publications/its12.pdf
7. P. Jarušek, M. Klusáček, R. Pelánek, "Modeling Students' Learning and Variability of
   Performance in Problem Solving", EDM 2013. http://www.fi.muni.cz/~xpelanek/publications/edm13.pdf
8. R. Pelánek, P. Jarušek, "Student Modeling Based on Problem Solving Times", IJAIED 25(4), 2015.
   https://doi.org/10.1007/s40593-015-0048-x
9. P. Babinčák, master's thesis on Nurikabe difficulty, Masaryk University, 2011.
   https://is.muni.cz/th/kdthw/
10. Adaptive Learning group, data page. https://www.fi.muni.cz/adaptivelearning/?a=data
11. "Explaining Puzzle Solutions in Natural Language: An Exploratory Study on 6×6 Sudoku",
    arXiv:2505.15993. https://arxiv.org/abs/2505.15993
12. "Project Patti", arXiv:2507.21137. https://arxiv.org/abs/2507.21137

Pelánek's full publication list: https://www.fi.muni.cz/~xpelanek/publications/publications.html
