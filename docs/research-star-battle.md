# Research: how people solve and rate Star Battle

Star Battle was invented by Hans Eendebak and first appeared at the 2003 World Puzzle
Championship. Other names: Two Not Touch (Krazydad, the New York Times), and Queens (LinkedIn's
1-star version). The rules: N stars in every row, column and area, and no two stars touching,
not even at a corner.

This note covers what solvers do by hand, what programs do, and what our deduction solver
(`puzzles/difficulty/deduce.ts`) lacks. It looks at the solver as it stands: tier-0 windows are
rows, columns, areas and 3×3 neighbourhoods; tier-1 windows are pairs of tier-0 windows that
*share a cell*; tier 2 is a case split checked by clingo's propagation; tier 3 is search.

## Techniques

The fullest catalogue is Kris De Asis's *Star Battle Guide* [1]. Krazydad's advanced Two Not
Touch tutorial [2] names most of the same ideas. A 2013 reader comment by Jack Bross on
GMPuzzles [3] and the Puzzles Wiki [4] add a little. Below, a *container* is a row, column or
area, or any set of cells whose star count is known.

### Basics

| Technique | Premise | Conclusion | Generalises to |
|---|---|---|---|
| Trivial marks [1] ("finished containers" [2]) | A star is placed, or a container holds all its stars | Clear the star's 8 neighbours, and the rest of the container | — |
| Forced placement [2] | A container has exactly as many open cells as stars still needed (or one way to fit them) | Those cells are stars | — |
| The 2×2 [1, 3, 4] | Any 2×2 block holds at most 1 star | A set of cells that k 2×2 blocks can cover holds at most k stars. If k equals the stars it needs, each block holds exactly one | Any set of cells. This is the basic upper bound behind everything else |
| Four-squares and clumps [2] | An area with N stars splits into N pieces, each inside a 2×2 | Each piece holds exactly one star, so treat each piece as a 1-star container | Any container whose cover number equals its need |
| 1×n [1] | A piece known to hold ≥1 star lies in one row (or column) | If such pieces supply all the row's stars, clear the rest of the row. Each piece then holds exactly one | Rows or columns |
| Nosy neighbours [2] | A set of cells holds ≥1 star | A cell outside it that touches every cell of the set is empty. Example: a pair of adjacent cells in a row clears the 4 cells beside it [3, 4] | Any set |
| Selfish roommates [2] | A set holds ≥2 stars | A cell in the set that touches all the others is empty. Example: the centre of a 3×3 | Any set |
| Crowding / exclusion [1, 2] | A star in cell x would leave some container unable to fit its stars, judged by 2×2 cover | x is empty. Generalises nosy neighbours and selfish roommates | x may be inside or outside the container |
| Pressured exclusion [1] | Exclusion, where another star or 1×n in the same line removes more room | More cells are empty | — |
| Simple shapes [1] | Small areas (tetrominoes, pentominoes, 2×3) analysed by 2×2 cover and exclusion | Fixed patterns. Example (2★): a 2×3 holding 2 stars has one in each end pair, none in the middle pair [3] | A lookup table of shapes |
| Container consumption [2] (2★) | Part of a container holds ≥1 star | The rest of it holds ≤1 | Any N: the rest holds ≤ N − (lower bound on the part) |

### Counting across several units

These are the steps no single row, column or area can see.

| Technique | Premise | Conclusion | Generalises to |
|---|---|---|---|
| Undercounting [1] ("container cabals" [2], "span counting" [4], Bross [3]) | k areas lie wholly inside k rows | Those rows' stars all fall in those areas, so the rest of the k rows is empty | Any k, rows or columns. With partial progress, use stars still needed and live cells |
| Overcounting [1] (the converse in [2, 4]) | k areas wholly contain k rows | Those areas' stars all fall in those rows, so the areas' cells outside the rows are empty | Same |
| Fish [1] | In k columns, the stars can only be in the same k rows | The rest of those k rows is empty | Sudoku's X-wing and swordfish. Common in 1★ |
| Finned counts [1] | A star in x would *create* an undercount or overcount that x breaks | x is empty | One step of case split, then counting |
| Composite shapes [1] | Containers with known counts, combined, leave a region with a known count | Cover that region with 2×2 blocks for marks | Any grouping |
| Set differentials [1] | Containers with known counts, added and subtracted cell by cell | The result has a known count, often zero | Any linear combination with no cell counted twice or negatively |
| The squeeze [1] | Two adjacent rows hold 2N stars, and their open cells can be covered by exactly 2N 2×2 blocks (4 blocks in 2★) | Each block holds exactly one star. Exclusion then applies to each block | Called easy to spot and strong [1]. Any band whose cover number equals its need |
| The M, pressured Ts, kissing Ls [1] (2★) | Particular shapes: 3 blocks holding ≤2 stars; a T whose long side shares a line with a star; two L-shaped star blocks | Bounds that make a squeeze useful | Named special cases of 2×2 counting under pressure |

### Uniqueness and size-specific patterns

- **Uniqueness** [1] ("by a thread", "at sea"): if some stars could swap places without the rest
  of the board telling them apart, the one cell that does tell them apart is a star. The guide
  keeps these for computer-made puzzles.
- **n-rooks** [1]: on a (4N+2)×(4N+2) grid (6×6 1★, 10×10 2★), split the grid into 2×2 blocks.
  The empty blocks form a rook pattern: one per block-row and block-column. Combined with
  squeezes, this places stars.
- **Entanglement** [1]: specific star positions, found by computer, that rule out certain edge
  cells on 10×10 2★.
- On a 4N×4N grid there are only two possible star layouts, whatever the areas [4].

### What the community treats as hard

Single-unit steps are easy. Undercounting and overcounting are the main intermediate tool. The
2×2 cover of a two-row band (the squeeze) and its pressured variants are the main advanced
tool. Finned counts and hypotheticals come last. Hand-made puzzles avoid uniqueness steps [1].
GMPuzzles grades by solving time, not by technique.

## Solvers and raters

### masonomara/star-battle: a human-technique solver with a rating [5]

This is the most relevant project. It is TypeScript and uses production rules taken from [1]
and [2]. The rules are applied cheapest first, restarting after each one fires, with no
backtracking. It has 11 levels:

1. Star neighbours. 2. Forced placements. 3. Trivial marks.
4. **Tiling enumeration**: find the minimum 2×2 cover of a container's open cells (exact cover
   by Knuth's DLX; blocks may stick out of the container). If the cover number equals the need,
   list the ways to put one star in each block. A cell starred in every way is a star. A cell
   starred in none is empty. A cell *outside* the container that is covered by a block in
   every minimum cover is empty ("overhang").
5. **Counting**: a max-flow network per axis (see below).
6. **Tiling pairs**: the same as level 4, for two adjacent rows or columns (the squeeze).
7. **Tiling counting**: a region's minimum contribution to a line is its need minus the cover
   number of its cells outside the line. If those minimums sum to the line's need, they are
   exact. A "group" version does the same for every combination of 2 to 4 lines.
8. to 11. **Hypotheticals**: place a star, propagate, and test counts (8), cover numbers (9) and
   the counting flow (10), or all three after chaining forced moves (11).

The rating formula is `raw = 4 × maxLevel + cycles / 4`, scaled from [20, 60] to 1–100. It was
calibrated on 1,000 Krazydad 10×10 2★ puzzles. In that set it solved 999 of the 1,000 in about
21 s in total:

- Counting (L5) fired in 77–84% of puzzles.
- Tiling pairs (L6) fired in 24–38%.
- Group tiling counting (L7) fired in 18%, and took about half the run time.
- Some hypothetical (L8–L10) was needed in at least 27%. Fully propagated hypotheticals (L11)
  were needed in about 2%.

**How it finds multi-unit counts.** It does not enumerate unions of units. For each axis, it
builds a flow network:

- source → each line, with capacity equal to the stars that line still needs;
- line → area, with capacity equal to the open cells they share;
- area → sink, with capacity equal to the stars that area still needs.

It runs Dinic's max flow. If the flow falls short of the total need, the position is
contradictory (that is how the hypotheticals use it). Otherwise it finds the strongly connected
components of the residual graph (Tarjan) and walks them in topological order. Wherever total
line need equals total area supply, that cut is a *tight set*: a group of lines and areas whose
stars must match exactly. This is the Dulmage–Mendelsohn decomposition of the line–area
incidence. If an area's whole need must fit inside a tight set's lines, its cells outside those
lines are empty. One flow finds every undercount and overcount of any size k at once.

Cover numbers are cached by cell set for the whole solve, since they depend only on geometry.
Flow results are recomputed after every change.

### Demystify (St Andrews) [6]

Espasa, Gent, Hoffmann, Jefferson, Lynch, Salamon and McIlree. It explains each step by a
*minimal unsatisfiable subset* (MUS) of constraints: the same idea as our explanation by
deletion. Star Battle is one of its puzzles, and its steps matched the published Star Battle
guides in most cases. It gives no difficulty model beyond suggesting MUS size as a proxy. On
hard puzzles, exact MUS search was too slow, so it uses randomised searches for small MUSes. It
publishes no Star Battle figures on MUS size.

### Other programs

- **qsolve** (Rust, LinkedIn Queens) [7]: eliminates and confirms squares with heuristics, step
  by step, with no search, and can animate the solve. No rating.
- **gjohnhazel/StarBattleSolver** [8]: hints named "multi-unit constraints", "sandwich", L-, T-
  and square shapes, and 2×3 rectangles. Undocumented.
- Search-based solvers with no rating:
  - mmachenry/star-battle [9], CLP(FD): about 90 s for a 10×10, against more than a day for
    plain backtracking.
  - ebuehrle/star-battle [10]: linear programming.
  - ricbit/puzzles [11]: exact cover.
  - KeatonMueller/starbattle: backtracking from a photo.
  - SAT and SMT encodings of Queens, e.g. Hillel Wayne's.

### Complexity

I found no published proof that Star Battle is NP-complete. Related object-placement puzzles
(Battleships) are NP-complete [12].

## What our solver is missing

### Why it is slow and rates high

1. **Tier 1 never pairs two adjacent rows.** A pair needs a shared cell, and row r and row r+1
   share none. So the squeeze, the most-used advanced step, has no window. Neither does any band
   of k rows.
2. **No window holds k rows plus k areas for k ≥ 2.** A row plus an area (tier 1) is only the
   k = 1 case. Undercounting and overcounting need the union of k rows and the k areas, which
   is 2k units and 30–60 cells on a 10×10. The pair cap (`2 × max(rows, cols)` = 20 cells)
   rules these out even when the units overlap.
3. **Tier 2 cannot use counting.** Clingo's propagation with zero choices does unit
   propagation on each `#count` separately. It never adds constraints together. So finned
   counts and the hypotheticals of [5] (needed in about 27% of Krazydad puzzles) fall through
   to tier 3 search. Most likely, this is why so many puzzles rate near the maximum.
4. **Counting is a pigeonhole argument, and CDCL proves pigeonhole slowly.** Even with the
   right window, proving "this cell is empty because 3 areas sit in 3 rows" by clingo, and then
   shrinking the explanation by repeated deletion, means many unsatisfiable calls that each
   need search. That costs time, and the number of conflicts overstates how hard the step is
   for a person.
5. **2×2 blocks are not units.** `no-touch` is encoded as pairwise constraints. Diagonal pairs
   lie in no row, column or area, so each becomes its own group in the explanation. A squeeze
   that a person sees as "2 rows and 4 blocks" is costed as 2 rows plus a dozen pair
   constraints.

### Recommendations, in order

**1. Make 2×2 blocks a unit for `no-touch`.** Group the pairwise constraints by 2×2 block
(every touching pair lies in at least one block), so an explanation names "the block at
r3c4". Then the costs match the guides' language. This is a small change in the group
assignment. It needs a block-shaped unit list for square grids with no-touch.

**2. Add band windows: k adjacent rows (or columns), k = 2 first.** There are 2(n−1)
two-row strips, each 2n cells. Adding them to tier 1 (or a tier "1b") gives the squeeze,
tiling pairs and "pressured" variants directly. Their program holds the 2 line counts and the
no-touch blocks inside, so clingo finds it fast. Bands of 3 add little for 2★ by hand [1].
Make bands of 3 optional for 3★ and up.

**3. Find counting steps by flow, not by enumerating unions.** For each axis, run the flow of
[5] (lines × areas, with current needs and open intersections). It is tiny: about 20 nodes and
at most 100 edges on a 10×10, so it costs microseconds. Read off the tight sets. For each, make
a *targeted window*: the tight set's lines plus its areas, with only their count constraints
and the no-touch blocks. Push it into the tier-1 queue, so it is costed like any other window.
The tight set *is* the explanation, so its cost (k lines + k areas) is known without asking
clingo to shrink it. Also run the same flow with the roles swapped (areas as demand, lines as
supply). Then overcounts appear too. The flow handles k of any size, and lines that are not
adjacent. If you would rather enumerate:

- At the start, areas are connected, so each area spans an interval of rows. Contiguous bands
  of k rows are then enough. There are O(n²) per axis, and by complement k ≤ n/2 (k areas in k
  rows is the same fact as the other n−k areas covering the other n−k rows).
- Once cells are eliminated, live spans can skip rows. So keep the flow, or allow all subsets
  up to k = 4. In [5], all combinations of 2 to 4 lines were enough on 10×10 2★, but that
  enumeration was the slowest rule.

**4. Check counting with arithmetic, not search.** Undercounts, overcounts, set differentials,
composite shapes and squeezes are all the same kind of proof: a sum of unit constraints
(rows and areas count exactly N, 2×2 blocks count at most 1) shows that a cell is 0 (or 1).
That is a linear-programming certificate. Two cheap ways to use it:

- **Flow and cover only**, as in [5]: flow for line–area counts, and the minimum 2×2 cover
  (exact cover over ≤ 2n cells, cached by cell set) for bands and areas.
- **LP relaxation as a general tier**: variables in [0, 1], row, column and area equalities,
  each 2×2 block ≤ 1, and the known facts. If the LP's maximum for a cell is 0, the cell is
  empty in every solution. If its minimum is above 0, the cell is a star. Both are sound. The
  dual solution names the units used, which is the explanation. Minimise the number of units in
  it to get the cost. On 100 variables this takes milliseconds, and it covers almost all of the
  "Counting" section without any window search. It does not cover exclusion. That needs a case
  split; see 5.

**5. Let the tier-2 case split use counting.** After "assume x is a star" and clingo's
propagation, also run the count checks from 3 and 4: line–area flow short of demand, a
container whose cover number is below its need, or an infeasible LP. Then the finned counts,
exclusion and pressured exclusion of [1], and levels 8–10 of [5], become case splits instead of
search. Cost them as the assumption plus the units the failed check named. This is the change
most likely to bring ratings down from the maximum.

**6. Rate on the guides' ladder.** Roughly:

- single units (trivial marks, forced placements, nosy neighbours);
- 2×2 cover of a single area (four-squares, clumps);
- k = 1 and k = 2 counting;
- squeeze, and larger k;
- finned counts and hypotheticals.

This is close to [5]'s order. One check of our costing: an undercount with k = 3 (6 units) should
come out about as hard as a squeeze (2 lines + 4 blocks). Both are rated advanced by hand. If
`costOf` counts each unit once, recommendations 1 and 3 bring this about without special cases.

**How large k needs to be.** On 10×10 2★, k = 1–2 covers most counting steps by hand. k ≤ 4
was enough for [5] on 1,000 Krazydad puzzles. Guides state the rule for any k, but with the
complement, nothing beyond n/2 is needed. The flow makes k free, so there is no need to choose
a cap.

**Keeping it cheap.**

- The flow and cover computations are tiny, and cover numbers cache by cell set.
- Targeted windows come only from tight sets, at most a handful per position.
- Band windows add 4(n−1) windows on an n×n grid.
- None of these needs clingo to find the step, and only the targeted windows need it to check
  one.
- These additions are Star-Battle-shaped: rows, columns and areas with exact counts, and
  no-touch. They also apply to other genres with "N per line and area" (e.g. shaded-per-line
  and shaded-per-area in other genres). Turn them on whenever those rule blocks are present,
  not by genre name.

## Sources

1. Kris De Asis, *Star Battle Guide*. https://kris.pengy.ca/starbattle
2. Krazydad, *Advanced Strategies for Two Not Touch Puzzles*. https://krazydad.com/twonottouch/adv_tutorial ; basics: https://krazydad.com/how-to-solve-star-battle ; 10×10 walkthrough: https://krazydad.com/starbattle/tutorial/tutorial_10x10.php
3. GMPuzzles, *Dr. Sudoku Prescribes #14 – Star Battle*, comment by Jack Bross (2013). https://www.gmpuzzles.com/blog/2013/01/dr-sudoku-prescribes-14-star-battle/
4. Puzzles Wiki, *Star Battle*. https://www.puzzles.wiki/wiki/Star_Battle
5. masonomara/star-battle: README, `PRODUCTION_RULES.md`, `research.md`. https://github.com/masonomara/star-battle
6. Espasa et al., *Using Small MUSes to Explain How to Solve Pen and Paper Puzzles* (arXiv 2104.15040, 2021/2023). https://arxiv.org/abs/2104.15040
7. qsolve (Rust, LinkedIn Queens). https://docs.rs/crate/qsolve/latest
8. gjohnhazel/StarBattleSolver. https://github.com/gjohnhazel/StarBattleSolver
9. mmachenry/star-battle. https://github.com/mmachenry/star-battle
10. ebuehrle/star-battle. https://github.com/ebuehrle/star-battle
11. ricbit/puzzles. https://github.com/ricbit/puzzles
12. Sevenster, *Battleships as a decision problem*, ICGA Journal 27(3), 2004. https://content.iospress.com/articles/icga-journal/icg27303
13. Also seen: KeatonMueller/starbattle (https://github.com/KeatonMueller/starbattle); Hillel Wayne's Queens SMT gist (https://gist.github.com/hwayne/c5de7bc52e733995311236666bedecd3); UKPL *Star Battle Puzzle Guide* (https://www.ukpuzzles.org/ukpl/library/Star%20Battle%20Puzzle%20Guide.pdf, not read: the PDF text could not be extracted).
