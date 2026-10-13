# Language models as labellers: the pilot

Can Claude Opus 5.5 and Claude Fable 5.1 label puzzles for our three products when they read our
solver's explanations in words, rather than solving a raw grid? Four jobs, each against an answer
key and beside a baseline from our own solver (October 2026; approved budget $15, spent $14.45).
The design is in [learning-design.md](learning-design.md), "Where labels come from".

Code: puzzles/difficulty/llm-label.ts. Every request, reply, parsed answer, score and dollar is in
references/ml/llm-label/ (local only: the puzzles are others').

## What was tested

Each puzzle was shown as a text grid plus a summary of our solver's path (deduce.ts): steps by kind
(single unit, two units, case split, search), the hardest kind needed round by round, and its ten
hardest steps in full (where it looked, what it found, which rules and clues forced it). Step costs
and our estimate were never shown. Both models ran with adaptive thinking at medium effort, one
reply per item.

1. **Difficulty.** Puzzle Square JP, the scoreboard's spread sample: 20 each of Sudoku, Akari, Star
   Battle, Slitherlink and Masyu, in shuffled batches of 10 of one type. Ranked easiest to hardest;
   scored by Spearman with the site's rating within each batch.
2. **Sequences.** Beast Academy's Puzzle Lab, the 15 sets with 3 or more puzzles (87 puzzles:
   Akari, Fillomino, Spiral Galaxies), shuffled, set names withheld. Put in the order a teacher
   would; scored by Spearman with the real order, averaged over sets.
3. **Hints.** Positions from Janko's recorded solves, six types:
   - *ordinary* (23): the start of a round in the middle of our solver's path, with 3–12 steps
     open. The model picks the step the person makes next from our solver's list, and writes a
     three-level hint (where to look; which idea; the move). Scored: the step settles one of the
     person's next 3 marks.
   - *stuck* (18, from references/janko/stuck-*.json): where our solver's only way on was a case
     split. The model names its own move (any certain move) and writes the hint. Scored: correct
     per the solution, and among the person's next 3.
   - Each model judged a sample of the other's hints against the solution.
4. **Interest.** Puzzle Square JP likes per solver for Sudoku, Akari, Masyu and Slitherlink: puzzles
   with 100 or more solvers, spread over the site's difficulty (20 per type; 12 Sudoku qualified),
   batches of 10, ranked least to most enjoyed. Scored by Spearman with likes per solver, and partial
   Spearman with the site's difficulty held fixed (as interest-analyze.ts).

## Results

| Job | Model | Score | Our solver's baseline | Naive baseline | n | Dollars |
|---|---|---|---|---|---|---|
| Difficulty (Spearman with rating, within batches) | Opus 5.5 | 0.59 | 0.59 (our estimate) | 0.27 (grid size) | 100 puzzles | 0.95 |
| | Fable 5.1 | 0.58 | 0.59 | 0.27 | 100 | 2.52 |
| Sequences (mean Spearman within sets) | Opus 5.5 | 0.59 | 0.16 (our estimate) | **0.69** (grid size) | 15 sets | 0.61 |
| | Fable 5.1 | 0.55 | 0.16 | **0.69** | 15 sets | 1.45 |
| Hints, ordinary: pick among the person's next 3 | Opus 5.5 | 43% (50% on the 16 both did) | 43% (cheapest step) | 33% (random step) | 23 | 2.47 |
| | Fable 5.1 | 56% | 44% | 36% | 16 | 3.10 |
| Hints, stuck: own move correct / among the next 3 | Opus 5.5 | 100% / **44%** | 17% (our case split's fact) | | 18 | (above) |
| | Fable 5.1 | 100% / 0% | 0% | | 3 | (above) |
| Hints judged by the other model: correct, forced, well graded, no false claims | Opus 5.5 | 9/9, 9/9, 9/9, 8/9 | | | 9 | 0.57 (Fable judging) |
| | Fable 5.1 | 12/12, 11/12, 12/12, 11/12 | | | 12 | 0.22 (Opus judging) |
| Interest (Spearman with likes per solver, within batches) | Opus 5.5 | 0.30 | 0.00 (our estimate) | 0.10 (grid size) | 72 | 0.62 |
| | Fable 5.1 | **0.39** | 0.00 | 0.10 | 72 | 1.93 |
| Interest beyond difficulty (partial, mean of types) | Opus 5.5 | 0.18 | −0.15 (our estimate) | | 72 | |
| | Fable 5.1 | **0.34** | −0.15 | | 72 | |

Total: $14.45 over 148 calls. Fable cost 2.5–3 times Opus per call for the same work.

By type:

| Type | Difficulty: Opus / Fable / ours | Interest beyond difficulty: Opus / Fable | Sparse clues beyond difficulty |
|---|---|---|---|
| Sudoku | 0.55 / 0.55 / **0.80** | −0.18 / 0.08 (n 12) | 0.32 |
| Akari | 0.78 / 0.78 / **0.85** | −0.18 / 0.39 | 0.01 |
| Star Battle | 0.77 / 0.71 / 0.73 | | |
| Slitherlink | 0.61 / 0.56 / 0.53 | **0.77 / 0.62** | 0.21 |
| Masyu | 0.22 / 0.26 / 0.29 | 0.33 / 0.28 | **0.45** |

| Beast Academy | Opus | Fable | Our estimate | Grid size |
|---|---|---|---|---|
| Fillomino (5 sets) | 0.96 | 0.98 | 0.49 | 0.95 |
| Spiral Galaxies (4) | 0.91 | 0.87 | 0.83 | 0.96 |
| Akari (6) | 0.06 | −0.03 | −0.57 | 0.30 |

## What it means for each product

- **Difficulty: no gain.** Given our solver's summary, both models rank about as well as our
  estimate (0.59 against 0.59) and worse on the types where our estimate is strongest (Sudoku 0.55
  against 0.80). They read the solver's signals back rather than add to them. Don't use a model
  here; the solver is the place to improve.
- **Hints: the strongest case, in two ways.**
  - *Writing hints.* Every judged hint pointed to a correct move, and the three levels were well
    graded; 2 of 21 gave a faulty reason for a correct move. Turning a solver step into words is
    what models do well. Picking which open step a person takes next is near our cheapest-step
    baseline (50–56% against 44% on 16 positions: one or two positions, within noise).
  - *Stuck moments.* Where our solver had only a case split, Opus named a correct move 18 times
    of 18, and it was among the person's next 3 moves 8 times (44%), against 3 of 18 (17%) for our
    solver's searched fact. People move elsewhere when our solver is stuck, and the model often
    finds where. This is a source for the miner (moves to explain with new window families), and a
    fallback hint, once our solver has checked the move. It is costly: $0.11 a stuck moment for Opus;
    Fable ran $0.15–0.81, one reply ran out of tokens, and we could afford only 3.
- **Interest: promising, the one job where models beat everything we have.** Fable's ranking
  matched likes at 0.39 within batches and 0.34 beyond difficulty, where our estimate and our path
  measures give nothing. Slitherlink is striking (0.62–0.77 beyond difficulty from both models);
  Sudoku shows nothing, as our own measures found. Its replies cite things our measures don't
  capture: a visible idea in the clue layout, "smooth flow", too many case splits making a solve
  feel like guesswork. But 20 puzzles a type can be off by 0.2 or more, and on Masyu sparse clues
  alone (0.45) beat both models. Next: Opus at about $0.01 a puzzle, 100 or more per type, held
  out from anything tuned, before trusting it.
- **Sequences: models beat our solver but not the simplest rule.** Sorting by grid size gets 0.69;
  the models 0.55–0.59; our estimate 0.16. Inside Beast Academy's sets order is mostly size
  ([research-beast-academy.md](research-beast-academy.md)), and on Fillomino and Spiral Galaxies the
  models sorted by size too. Where size is held (Akari), the models are near zero, though Opus
  found Countdown's idea (clues counting down from 4 to 0; 0.94). The answer key is too
  size-driven to tell whether a model sequences ideas well; an Akari-style key (same size, varying
  ideas) is needed.

**Which model.** Fable was better on interest (0.34 against 0.18 beyond difficulty) and no better
elsewhere, at 2.5–3 times the price. Opus is the default; Fable for taste, if interest holds up at
scale.

## Caveats

- **Small samples.** 20 puzzles per type (12 for Sudoku interest), 15 sets, 16–23 hint positions,
  3 Fable stuck moments. A Spearman on 10 can swing by 0.3; differences of a few hint positions are
  noise. One reply per item: the models' own variance is unmeasured.
- **The summaries are our solver's.** The model sees our solver's choice of hardest steps (picked
  by its costs, though the costs are hidden), so it inherits the solver's blind spots, as the
  difficulty results show. Fillomino summaries are nothing but case splits (our solver's weak type).
- **Scores are within batches.** A model ranks 10 at a time, so pooled scores lose information
  between batches; the tables compare our estimate the same way.
- **What "next 3" counts.** Only marks people make (they rarely cross out empty edges or cells),
  and the first 3 still open. A correct step the person took later scores zero.
- **The cipher sets** (Akari Cipher 1–3) were converted with their letters already replaced by
  numbers, so the set's idea was invisible to every judge.
- **Leakage.** Puzzle Square JP's puzzles are user-made and unlikely to be memorised; Beast
  Academy's are published but were shown as text, with set names withheld. Likes are public, but a
  model can't recall likes for individual puzzles shown as text grids. The risk looks small, not
  zero.
- **Images** weren't tried: the repo's picture renderer (src/game-types/grid/picture.ts) needs the
  site's CSS, and no SVG-to-PNG tool is installed.
- **Budget shaped the sample.** Each job × model had an equal share, but stuck moments cost far more
  than expected, so Fable did 16 of 23 ordinary positions and 3 of 18 stuck ones.
