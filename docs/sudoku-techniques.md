# The Sudoku technique solver

`puzzles/difficulty/sudoku/` solves a Sudoku the way a practised solver does: with named
techniques, always the easiest one available, singles first. It records each step and sums the
solve up in a profile: steps by technique, the hardest step (a rating in the style of Sudoku
Explainer, SE), a weighted effort, Pelánek's dependency and refutation measures, and one 0..1
estimate. It is the specialised rater beside the general deduction solver
(`puzzles/difficulty/deduce.ts`); see [research-sudoku-difficulty.md](research-sudoku-difficulty.md)
for why it measures what it does. Pure TypeScript, no clingo.

## What it reads

- **Sudoku** of any size n × n with boxes (4 × 4 with 2 × 2 boxes, 6 × 6 with 2 × 3, 9 × 9, ...).
- **Irregular Sudoku**: the units are the rows, the columns and the outlined areas.
- **Thermo Sudoku**: digits rise along each thermometer from its bulb. Thermometers enter as one
  technique, *thermo bounds*, and in the trials and the search.
- A **puzzle string** of n² characters, '.' or '0' empty (16, 36, 81, 256 characters; above 9 the
  digits go on as A, B, ...), with standard boxes.

From our puzzles (`src/games/<type>/<n>.json` or any GridSpec) it goes through `makePuzzle`:
digits, givens, boxes (`boxesOf`, so an irregular puzzle's areas) and thermometers. A rule it
doesn't know is an error.

## Files

| File | What |
|---|---|
| `grid.ts` | The candidate grid: units, peers, a bit set of candidates per cell; reading GridSpecs and strings |
| `techniques.ts` | The techniques, each a finder that returns one application (or null), in order; `nextStep`, `apply` |
| `solve.ts` | The loop (`rate`), the profile and the estimate |
| `brute.ts` | A plain search: counts solutions (uniqueness), gives the answer for checking; thermometer bounds |
| `cli.ts` | The command line |

## Techniques

Each step names its technique, its rating, what it places or removes, the cells, digits and
units it uses, and a short description. The solve loop takes the first technique in this order
that applies. A chain's rating grows with its length, so when one rates above a later
technique's base rating, the later ones are tried too and the lowest rating wins.

| Technique | SE | Notes |
|---|---|---|
| Full house | 1.0 | the last empty cell of a unit |
| Hidden single (box or area) | 1.2 | |
| Hidden single (row or column) | 1.5 | |
| Thermo bounds | 2.0 | not in SE; each thermometer cell above the smallest digit before it and below the largest after it |
| Naked single | 2.3 | |
| Pointing | 2.6 | a box's places for a digit in one line clear the rest of the line |
| Claiming | 2.8 | a line's places for a digit in one box clear the rest of the box |
| Pointing at a cell | 2.9 | not in SE: every place for a digit in a unit sees one cell. With standard boxes this is always pointing or claiming; irregular areas need it |
| Naked pair | 3.0 | |
| X-Wing | 3.2 | |
| Hidden pair | 3.4 | |
| Naked triple | 3.6 | |
| Swordfish | 3.8 | |
| Hidden triple | 4.0 | |
| XY-Wing | 4.2 | |
| XYZ-Wing | 4.4 | |
| Unique rectangle (type 1) | 4.5 | only when the puzzle has exactly one solution, and not on thermometers |
| Naked quad | 5.0 | |
| Jellyfish | 5.2 | |
| Hidden quad | 5.4 | |
| Skyscraper | 6.6 | SE has no Skyscraper: it finds one as a turbot fish (6.6) |
| 2-String Kite | 6.6 | likewise |
| Simple coloring | 6.6 + length | SE finds these as X-chains; length is the colored cells |
| X-Chain | 6.6 + length | one digit, strong and weak links alternating, up to 13 links; the shortest is taken |
| W-Wing | 7.0 | SE: a forcing chain |
| XY-Chain | 7.0 + length | two-digit cells, up to 8; the shortest is taken |
| Forcing chain | 7.5 + length | assume a candidate, fill singles until something breaks (a cell with no digit, a digit with no place in a unit); the shortest refutation is taken. SE's Nishio level |
| Dynamic forcing chain | 9.0 + length | the same, filling singles, intersections and pairs. SE's dynamic forcing chains (+) |
| Trial and error | 10.0 + up to 1 | when neither breaks anything: a search shows the candidate has no solution; length is the search's size |

The length bonus is SE's: 0.1 each time the chain passes the next of the ceilings 4, 6, 8, 12,
16, 24, 32, ... (length counted less 2). The three trials stand in for SE's family of forcing
chains, so above 7.5 our rating is rougher than SE's. Fish are basic (rows against columns).
Not there yet: finned fish, other unique rectangle types, BUG, ALS, grouped chains, and the
irregular-only techniques (law of leftovers); a puzzle that needs them falls to the trials.

## The profile

| Field | What |
|---|---|
| `solved`, `unique` | solved to the answer; exactly one solution |
| `steps`, `placements`, `eliminations` | |
| `byTechnique` | steps per technique |
| `hardest`, `se` | the hardest step and its rating: the SE-style rating of the puzzle |
| `effort` | Σ 2^(se − 1.2) over the steps: a hidden single counts 1, a naked single about 2, an XY-Wing 8, a forcing chain 80 or more |
| `dependency.start`, `dependency.mean` | single moves open (distinct cells a full house, hidden or naked single fills) at the start, and on average before each of the first 25 steps. Few means each step waits on the one before: Pelánek's dependency |
| `trials`, `refutation` | trial steps and the sum of their refutation lengths (the assumption plus the steps after it; a search's size for trial and error). Pelánek's refutation sum, from our shortest refutation rather than his average over random runs |
| `ms` | time taken |
| `estimate` | one 0..1 number (below) |
| `notes` | no solution, several, stuck |

**Estimate** (`estimateOf`, to be calibrated against solving times):

    0.5 · clamp((se − 1) / 7.5)                   the hardest step: SE 1.0 → 0, 8.5 and up → 1
  + 0.35 · clamp((log₂(1 + effort) − 3) / 8)      the work: a 4 × 4 of singles under 0.1, a 9 × 9 of singles about 0.4
  + 0.15 / (1 + dependency.mean)                  one single open at a time → 0.075

An unsolved puzzle counts as at least 0.95. Pelánek's best combination (SE rating, technique
counts, refutation, dependency) reached r = 0.84–0.95 against human times. These are the same
parts; the weights here are a guess until we fit them on our own solving times.

## Running it

    node puzzles/difficulty/sudoku/cli.ts src/games/sudoku/3.json          # the path and the profile
    node puzzles/difficulty/sudoku/cli.ts src/games/sudoku/3.json --brief  # the profile only
    node puzzles/difficulty/sudoku/cli.ts src/games/sudoku/3.json --json
    node puzzles/difficulty/sudoku/cli.ts 4.....8.5.3..........7......2.....6.....8.4......1.......6.3.7.5..2.....1.4......
    node puzzles/difficulty/sudoku/cli.ts puzzles.txt                      # one line per puzzle

A text file holds one puzzle string per line (anything after the first space is ignored, `#`
starts a comment). With more than one puzzle (or `--batch`) it prints a tab-separated table:
puzzle, solved, se, hardest, estimate, steps, effort, dep_start, dep_mean, trials, refutation,
ms, techniques; with `--json` one JSON profile per line.

In code: `rate(fromSpec(spec))` or `rate(fromString(text))` returns `{ path, profile, board }`.
`rate(p, { check: true })` throws if any step removes a true candidate or places a wrong digit;
the tests solve every example and a set of puzzles needing each technique that way.

## Speed

On an M-series Mac: the examples take 5–20 ms (4 × 4 and 6 × 6), about 100–180 ms (9 × 9
Classic and Heat Wave) and 750 ms (Crazy Paving, 40 trials). Minimal random 9 × 9 puzzles
average about 10 ms each (1,000 in 10 s). Arto Inkala's "hardest" puzzle takes about 3 s, most of
it in the trials.

## Examples

| Puzzle | Solved | SE | Hardest | Estimate | Steps | Effort | Dependency (start / mean) | Trials (refutation) |
|---|---|---|---|---|---|---|---|---|
| sudoku/1 (4 × 4) | yes | 1.2 | Hidden single | 0.064 | 12 | 11.1 | 7 / 5.17 | 0 |
| sudoku/2 (6 × 6) | yes | 1.5 | Hidden single | 0.134 | 27 | 25.8 | 2 / 5.12 | 0 |
| sudoku/3 (9 × 9) | yes | 7.1 | XY-Chain | 0.718 | 73 | 613.1 | 4 / 3 | 0 |
| irregular-sudoku/1 (6 × 6) | yes | 1.5 | Hidden single | 0.152 | 30 | 29.1 | 2 / 3.32 | 0 |
| irregular-sudoku/2 (9 × 9) | yes | 7.8 | Forcing chain | 0.921 | 144 | 3645 | 2 / 0.28 | 40 (278) |
| thermo-sudoku/1 (6 × 6) | yes | 2.0 | Thermo bounds | 0.189 | 34 | 35.7 | 2 / 4.72 | 0 |
| thermo-sudoku/2 (9 × 9) | yes | 7.0 | W-Wing | 0.621 | 77 | 161.3 | 2 / 3.8 | 0 |

Crazy Paving's 40 trials probably say more about what's missing for irregular grids (law of
leftovers and the like) than about the puzzle.
