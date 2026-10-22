# Research: benchmarks for the model calibration ladder

2026-10-22. Design only: nothing here has been run on a paid model. Companion to the walkthrough
loop design (`research-walkthrough-loop.md` in the project files, PR #14), which proposed running
Opus 4.8, Opus 5.5, Sonnet 5.5 and Haiku 5.5 at several effort levels as a "calibration ladder".

## What the ladder is for

Three uses, and they want different benchmarks:

1. **Picking a model for a role.** The walkthrough loop needs a writer (Opus), a student who can be
   helped by a hint but not solve unaided (Haiku or Sonnet at low effort), and later a hint giver on
   inkit. The question is which model × effort sits where.
2. **A simulated solver of a chosen skill.** If the ladder's rungs line up with human skill levels,
   "Sonnet at low effort" can stand in for "an intermediate player" when we test hints or price a
   puzzle before anyone has played it.
3. **Testing what varies.** Josh's question from the walkthrough thread: do tier, effort and release
   move one ability or several (for example reading the grid versus deducing)?

All three are the same measurement: many test-takers (model × effort, 4 models × 3 efforts = 12)
on many items (puzzles or stuck states), with a pass/fail or a count per pair. The standard tool for
that is **item response theory** (IRT): each test-taker gets an ability θ, each item a difficulty b
(and a discrimination a), fitted together. Use 3 then asks "is one θ enough?" (a one-factor fit
against a two-factor fit), and use 2 asks "where do the human anchors land on the same θ scale?".
The benchmark design below is about getting items with human anchors.

**The limit, stated once.** Every set below calibrates models against *what someone said or measured
about people on that set*, never against inkit's own players. Ratings are a setter's or a site's
opinion; times are from competition solvers, who are far above inkit's audience. Inkit's solve
logs (time, errors, hints pressed, quits) are the target. The benchmark is built so the same
measures can be read off inkit later and the anchors swapped.

## The Thinky Dailies set

Now in the bucket (`gs://inkit-research-ml/private/refs/thinky-dailies/`): the scrape, plus
`converted.jsonl` and `summary.json` from `puzzles/difficulty/sources/thinky.ts`. Private: never in
the repo or anything public.

**What converts.** 220 puzzles: 199 penpa grids and 21 riddles. Every grid carries Thinky's own
answer (`puzzleData.solution`), so moves can be checked in any genre, ours or not. After the
importer fixes (PR #15: Board-mode grids, letters for numbers, nonogram `*`, Shikaku empty circles,
shapes as Numberlink pairs) and four added types (Simple Path, Connectlink as Numberlink that fills
the grid, Slitherlink Path, Hamiltonian Plumbers), 122 grids read as our puzzles and 120 solve to
exactly one answer with clingo (120 s cap), Thinky's answer in every case. The rest: 2 Square Jam
timeouts. The first pass
(74 read, 66 unique) lost most of its puzzles to importer gaps and one engine bug (rocks counted as
Nurikabe islands), not to broken puzzles.

| difficulty | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| usable puzzles | 19 | 51 | 40 | 10 | 0 |
| mean hints in the ladder | 4.0 | 5.2 | 8.8 | 11.6 | |

Grids are small (up to 100 cells).

**What it measures, honestly.** The ratings are each of 8 authors' own 1-5 label, set before
anyone solved, not solve rates. The ladders are written for the whole puzzle from the empty grid,
in the order the author expects, not for a given position. And the set is small: 120 puzzles give a
Spearman ρ with a standard error of about 0.09, and only 10 puzzles above level 3.

**A trap in "number of hints".** Ladder length already tracks the rating: ρ = 0.69 between the
author's difficulty and how many hints they wrote. So "hints a model needed" partly re-measures the
author's verbosity. Report it as the *share* of the ladder used (rungs revealed ÷ rungs written),
and check that it predicts the rating beyond ladder length (a partial correlation, or a fit with
ladder length as a covariate). Raw counts agreeing with the rating is not evidence by itself.

**The protocol: hint-to-solve.**

- The model gets the rules, the grid as text (the same rendering as the next-move test) and solves
  move by move. After each batch of moves the harness checks them against the unique solution.
- A wrong move, or "stuck", reveals the next rung (cumulative: all earlier rungs stay shown). A
  wrong move is undone and counted.
- Measures per (model × effort, puzzle): solved or not; rungs used (and the share); wrong moves;
  the rung after which the next correct move came (the "unlocking" rung); tokens.
- No-hint run first: the unaided solve rate is the cleanest single number and decides whether the
  ladder has room. If Opus solves all of them unaided, Thinky only informs the weaker rungs.
- Contamination check: the dailies are on the public web (Nov 2025 on), inside the newer models'
  training window. Before scoring, ask each model to recall a puzzle's hints from its title alone;
  if any can, drop or flag that season.

**Uses beyond calibration** (already in the walkthrough design): the authors' ladders as a human
hint arm against our arms, and as a style reference (how many rungs, when a cell is first named).

## Our existing sets

| set | human signal | size in our genres | what it measures | weakness |
|---|---|---|---|---|
| Puzzle Square JP | site difficulty label | ~12k converted | rated difficulty, many genres | label set by poster, coarse |
| puzz.link db | difficulty voted by solvers, solve counts | 21.5k converted, 5+ solves on almost all | the best rating we have: from people who solved it | voters are enthusiasts; per-solve times are not public |
| LMI Puzzle Expo | top-50 average and best solve time | (converted subset; see `lmi-expo.ts`) | **measured human time** | elite solvers only; time, not success |
| Logic Masters (LMD) | difficulty from solvers' ratings, solved-by counts | (see `lmd-convert.ts`) | rating and popularity | small per genre |
| Tatham | generator level | any | the solver's idea of difficulty | no human signal; cross-check only |
| Janko human orders | one expert's solve order | 5,200 | human-likeness of the next move | not skill; one person per puzzle |
| Aim 4 test set | | 400 | | held for the Aim 4 gates; keep it out |

puzz.link and PSJP agree at ρ = 0.63 overall where both rate a puzzle, which is a ceiling on how
well anything can match either.

**Two tasks on them**, both already built for the walkthrough and hint tests:

- *Stuck states* (cheap): positions where the solver's easy moves are done; the model names one
  forced move. Pass/fail per state. This is the item bank for the IRT fit.
- *Whole solves* (10-20× dearer): only on a small subset, to check that stuck-state ability
  predicts finishing.

## Other datasets worth adding

Ranked by how close the human signal is to what inkit will log.

1. **Pelánek's Problem Solving Tutor** (Masaryk University). About 400k human solves with times over
   30 puzzle types (which of ours are among them is still to check), from ordinary (student) players.
   Closest thing to inkit's audience that exists. Not public: available on request
   (`research-sudoku-difficulty.md`). Worth an email.
2. **Puzzle competition results with per-puzzle solve rates.** The WPF Puzzle Grand Prix and the
   LMI monthly tests publish, per puzzle, how many competitors solved it, with points set by the
   setters' time estimates. That is a measured solve rate under a time limit, across hundreds of
   solvers, in our genres. Weakness: strong solvers, timed. Needs a check of each site's terms and
   a crawl (not yet done; unverified that every year has per-puzzle tables).
3. **puzz.link's per-solve tables** (`pzv_solves_anon`, `griddle_solves_anon`). They exist, and
   return 401 to the public. Solve times for 75k puzzles from a broad audience would be the best
   public-ish set there is. Ask the puzz.link maintainers.
4. **Cracking the Cryptic via Sudoku-Bench** (Sakana; its Nikoli 100 part, CC BY 4.0, is already in
   `references/`; the CTC part's licence is unverified). Expert solve transcripts with timestamps, so time per step and the reasoning said
   aloud. Sudoku variants only, one elite solver; good for a human-reasoning style reference, weak
   for skill calibration.
5. **Lichess puzzle database** (CC0, millions of puzzles, Glicko ratings fitted from millions of
   attempts). Not our domain, but it is the one large set where item difficulty is fitted from
   real attempts by people of known rating, which is exactly the IRT setup above. Worth using as a
   method check (does our fit recover Lichess ratings from model results?) and as the model for how
   inkit should rate puzzles once logs exist.
6. **Puzzle hunts** (MIT Mystery Hunt, Galactic, Teammate). Per-puzzle solve counts, times and, for
   some, hint requests. Word and meta puzzles, a different skill; low priority.

Machine-rated Sudoku sets (Kaggle 3M, sudoku-extreme, SE ratings) have no human signal and are not
benchmarks for this purpose.

## Input format as a factor

Weak models often fail at reading the grid (wrong row, miscounted neighbours, a clue placed in the
wrong cell) before they fail at deducing. On raw grid text that floors the low rungs: Haiku at low
effort scores near 0 on most items, every item at 0 carries no information, and the IRT fit can't
tell Haiku low from Haiku high. The open-model test already showed format matters: the listed /
relations format beat the plain grid by about 5 points, and for the move network a better encoding
took Hidoku from 10% to 56%.

So every set runs in more than one format, crossed with model and effort:

| format | what it holds | what it removes |
|---|---|---|
| grid text | the board as rows of characters, as now | nothing |
| listing (perception only) | every cell with its row, column and content; each cell's neighbours; outlined area membership; each clue and where it sits (inside, beside a row, on a corner) | the work of locating things |
| image (optional) | the board as the site draws it | the text rendering; tests vision |

The listing holds only what is printed on the puzzle. No candidates, no "this cell can't be X",
no derived regions, no counts of what's left: those are deduction, and pre-digesting them would
measure the encoder, not the model. A trap to check per genre: some printed facts nearly give the
answer away in some genres (in Shikaku or Nurikabe, a "region" field must mean outlined areas
only, never the regions being solved).

How it's read:

- Fit format as part of the test-taker (model × effort × format) on the same items, or as a second
  ability factor. The listing-minus-grid gap per model is its **perception cost**. If the gap
  shrinks with tier and effort, perception and deduction are separate abilities (use 3 in the
  first section), and the gap is the cleanest evidence for it.
- Low-end sensitivity rises because the listing lifts weak models off the floor, so their
  deduction differences show. The grid run stays the main score at the top, where the gap should
  be small, and it is what a player-facing hint model would see.
- Human anchors saw a picture. A format that makes items easier for models doesn't change the
  items' human difficulty, so the anchors are compared with the grid (or image) run; the listing
  run is for ranking models, not for placing them on the human scale.

Other ways to keep the low end informative, which don't depend on format: easy items (Thinky
levels 1-2, small grids, stuck states one step from a forced move), partial credit (correct moves
before the first error; the share of the hint ladder used is graded already), and the grid-reading
probe items in A, which measure perception directly.

Cost: the listing doubles the calls. To keep it down, run both formats on the lower half of the
ladder and on a 50-item subset for the top rungs (enough to estimate their gap).

## Proposed benchmark

| part | items | per test-taker | role |
|---|---|---|---|
| A. stuck states, rated | 200 (PSJP + puzz.link, banded by rating, ~10 genres) | 1 call each | IRT item bank; ability per model × effort |
| B. stuck states, timed | 50 from LMI Expo (and GP, if crawled) | 1 call each | the only measured-time anchors |
| C. Thinky hint-to-solve | 120 | a solve with up to N rungs | hints-to-solve; human hint arm |
| D. next-move agreement | the 400 Janko states already run on Opus 5.5 | 1 call each | human-likeness, separate from skill |
| E. whole solves | 30 of A | a solve | does A predict finishing? |

Outputs: θ per model × effort with intervals, a one- versus two-factor comparison (perception versus
deduction, using grid-reading probe items in A), where the rating bands and Expo times fall on θ, and
the Thinky share-of-ladder against difficulty beyond ladder length.

**Order and gates.** First the free steps: build A and
B from what is in the bucket, and dry-run the harness. Then a pilot of A on Haiku low and Opus high
only: if both pass nearly everything (or nothing) the bands are wrong and get redrawn before the
full ladder runs. Costs to be estimated from the pilot's tokens; every paid step needs Josh's OK
and an Anthropic key in the cloud environment.

**Inkit logging to plan alongside.** The benchmark's measures map to log fields: solved, time,
wrong moves, hints pressed and at which rung, quit position. Logging those from the first public
puzzles is what eventually replaces every anchor above.
