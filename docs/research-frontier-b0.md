# The frontier and the no-network baseline B0 (2026-10-15)

The question (research-state.md, "a cheap solver for hard human puzzles"): on the human puzzles our
deduction solver doesn't finish, is a network what's missing? CPU only, on the Mac, no spend.
Code: `puzzles/difficulty/frontier-b0.ts`. Per-puzzle results and the full tables:
`references/ml/frontier/` (local only).

## The frontier

From the running human build (`human-20261014-2153`, its shards' caches as of 2026-10-15 05:30
UTC, 24,691 of 39,467 puzzles checked): **9,327 puzzles the deduction solver didn't finish**,
leaving out those with no or several solutions, errors, and puz.link's computer-made puzzles.
They include uniqueness timeouts and skipped genre-size bands; B0 settling every mark proves the
puzzle unique.

## B0

Ground the puzzle once (Lua inside clingo-wasm). Then: try both values of every open mark under
**propagation alone** (a propagator stops each solve at its first fixpoint, before any choice), and
play every value whose opposite fails. When nothing is forced, **case-split** under a rising
conflict limit (1, 4, 16 … 1024), trying first the values that settled the most marks under
propagation (the most constrained marks). Play the first refuted value, then go back to
propagation. Every move is proven. No explanations, no windows. Every solved board passes the
engine's own rule check (0 failures).

## Results: 445 frontier puzzles (10 per genre and size band), 60 CPU-seconds each

| | ≤ 1 s | ≤ 3 s | ≤ 10 s | ≤ 60 s |
|---|---|---|---|---|
| B0, share solved | 15% | 35% | 46% | 53% |
| B0, share of marks decided (mean) | 36% | 59% | 68% | 75% |
| clingo alone (uniqueness proof, build's wall time) | 0% | — | 67% | 69% |

- **Most of the frontier is easy for propagation.** Akari, Masyu, Slitherlink, Spiral Galaxies,
  Minesweeper, Star Battle and Wittgenstein Briquet are all solved, mostly in 1–10 s. Cave, Hitori
  and Nonogram are solved 85–93% of the time.
- **Stalls are shallow.** Of 1,276 states where propagation forced nothing, 84% needed one
  conflict to find the next fact, 95% needed 4 or fewer, and none needed more than 1,024.
- **What fails is the region genres, and B0 fails there for the same reason clingo does.**
  Shikaku, Square Jam and Fillomino are solved 0% of the time, Numberlink 25% and Nurikabe 25%.
  clingo times out on them too (0–30%; Nurikabe 75%). Propagation through the region encoding
  (reach, cuts) is slow: one test takes about 10 ms, so a sweep takes seconds, and the 60 s run
  out before anything is forced. Most of the 90 errors are child processes that hit the
  wall-clock cap on these genres.
- **B0 trails clingo where puzzles are large or need many splits** (Sudoku 25 × 25, Skyscrapers,
  Simple Loop, Irregular Sudoku). There, step-by-step proving costs more than a whole search.

## At the deduction solver's own stall: 60 of 103 puzzles (3 per band) left one

We reran the deduction solver (30 s budget) and played its facts. It had decided a median of
28% of the marks, in a median 32 s.

- **75% of these stalls weren't real stalls.** Propagation alone forced at least one more mark,
  a median of 12. The deduction solver's windows simply didn't see them.
- **The other 25% were Fillomino, Numberlink and Nurikabe** (plus one Skyscrapers and one Star
  Battle). There the next fact took a split of up to 1,024 conflicts.
- **B0 picked up from the stall** and solved 37% of these puzzles within 1 s, 68% within 10 s and
  87% within 60 s.

## What this says

- **The network isn't the bottleneck on most of the frontier.** A no-network checker clears
  about half of it, and three quarters of the marks. The deduction solver stops because its
  windows and explanations are expensive and its windows miss facts that propagation over all the
  rules finds at once.
- **The addressable set for a learned policy is narrow:** the region genres. There each
  propagation test is costly and nothing is forced, so choosing which mark to test, or split on,
  is what costs. That's the split head the plan held in reserve, not a forced-move proposer.
- **Not done:** the baseline network's top-5 and top-20 recall of forced-now facts at the stall.
  Given the above, it matters only for the region genres. B0 also needs a run on the whole
  frontier once the build finishes.
