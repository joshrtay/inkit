# One representation for every type: first results

October 2026. Can every puzzle type and every move be put in one space, so that what's learned on
one type helps with another? Four steps, all on the solver's own explanations and paths; puzzle
data local (corpus: our examples, Puzzle Square JP, Tatham, Janko, Beast Academy, and generated).

## 1. Technique signatures (puzzles/difficulty/signatures.ts, techniques-table.ts)

Each engine rule maps to a primitive from a small vocabulary (count, each-once, pattern, connect,
size, sum, sight, order) and each unit to a kind (line, strip, region, 2 × 2 block, local, whole
grid). A step's signature is the multiset of primitive@unit pairs in its explanation.

From 23,688 steps on 446 puzzles of 37 types: 134 signatures, 33 in two or more types. The shared
ones are the families the learning design expected: counting along lines (Star Battle, Aquarium,
Akari, Abstract Art, Binary Puzzle), each-once along lines (the Sudokus, Skyscrapers, Hitori, Easy
as ABC), connection (Slitherlink, Masyu, the loops and paths), sight along lines (Akari,
Skyscrapers, Easy as ABC), lines against regions (Aquarium and Star Battle). The signature is
coarse (which primitives and unit kinds, not how they overlap); a finer one is the next step.

## 2. One network for every type (graph-data.ts, graph_policy.py)

A puzzle state as a graph of marks, cells and rule instances, the rule instances described only
by primitive and unit kind; message passing between them; for every open mark, the chance it's
settled within three rounds. Trained on 1,137 puzzles (20,809 states) of 37 types.

| Type | Top guess is a move | Random |
|---|---|---|
| Star Battle | 90% | 29% |
| Simple Loop | 83% | 22% |
| Masyu | 73% | 14% |
| Akari | 68% | 32% |
| Slitherlink | 58% | 12% |
| Sudoku | 49% | 18% |
| Shikaku | 39% | 9% |
| Nurikabe | 6% | 7% |

It beats random on almost every type; per-type networks still win where we have them (Sudoku 71%
on the grid network). Nurikabe, Cave and Spiral Galaxies are weakest: area and connection
reasoning, and the least data.

## 3. Types never seen

| Held-out type | Trained with it | Zero-shot | + 10 of its puzzles | Random |
|---|---|---|---|---|
| Star Battle | 90% | 36–50% | 36% | 29% |
| Akari | 68% | 48% | 43% | 32% |
| Slitherlink | 58% | 25% | 29% | 12% |
| Sudoku | 49% | 32% | 45% | 18% |

Zero-shot beats random on every held-out type (1.5–2×): reasoning learned on other types carries
over. Ten puzzles bring Sudoku close to full training. Runs vary a lot at this data size (Star
Battle's zero-shot was 50% in one run, 36% in another).

## 4. A space of moves

Each move's vector is the network's state for its mark at that moment (10,402 moves, 37 types).
A move's five nearest neighbours share its signature 58% of the time (chance 6%); its nearest
neighbour from another type, 21% (chance 3%). The network places the same reasoning together
across types without being told about types or signatures. Step cost is only weakly a direction
(R² 0.16).

## Next

More and harder data, evenly across types (generated at scale and kept for difficulty; Tatham's
hard grades; Janko's other types with their recorded human moves); finer signatures (how the units
overlap); repeated runs to measure the spread; then the move space as the cross-type map in the
learning design, and the held-out-type test as the machine version of its transfer experiment.

## 5. Mining techniques (miner.ts, miner-propose.ts)

A proposal language for window families in the solver (unit kinds line, region, 2 × 2 block,
clue; relations pivot, pairwise, touch). Windows only gather true constraints, so anything a
family finds is sound; the harness measures usefulness. Stuck set: 169 corpus puzzles (3,205
searches), led by Slitherlink, Hitori, Fillomino, Shikaku, Akari and Cave.

**Phase A**, every family of two or three units (116): the clear winner is three lines in a chain
(each touching the next), removing 565 of the 3,205 searches (56 puzzles) for 17% more time; then
two lines and a clue (171), a line and two blocks (170). Many families make solving faster
overall, the searches they remove costing more than the windows they add.

**Phase B**, Opus 5.5 with thinking on the stuck moments phase A's best families don't fix: $1.52
for 40 rounds. Its best family was outside phase A's reach, four lines (three crossed by one):
317 searches removed, 34 puzzles, faster (× 0.62). Its 34 ideas the language can't say fall into
three groups, each aimed at our weakest types:
- **loop parity** (7 times): a closed loop crosses any line an even number of times;
  Slitherlink, Masyu, Simple Loop;
- **components and their exits** (about 10): a joined group of cells and its few ways out,
  so "the only exit is here" is local; Nurikabe, Cave, Hitori;
- **clue reach** (about 5): every cell a clue could still cover, so "who owns this cell" is a
  window; Shikaku, Fillomino.

Next: the winning families into the solver's defaults (scoreboard first), then these three
primitives, then a second phase B on what remains.

## 6. Finer signatures, loops and the first cloud run

**Shapes.** A step's shape (deduce.ts `shapeOf`) is how its rule instances and the decided cell
relate: inside, overlapping or touching, refined twice (Weisfeiler–Lehman) and hashed; its family
(signatures.ts `family`) folds alike instances into one. Over 24,388 steps of 446 puzzles in 37
types: 2,223 shapes, 89 in two or more types; 2,157 families, 94 shared. What's shared is small:
one instance holding the decided cell (a loop around a corner, a count along a line, each-once in a
row: the same shape in 5–9 types), and two loop pieces overlapping (5 types). Larger shapes stay
within a type or its family (Sudoku's pointing and claiming in Sudoku, Thermo and Irregular), so
the cross-type language is in the primitives and their small shapes, not in whole techniques.

**Loops.** Parity over any closed curve is the sum of the corner rule round each corner it
encloses, so straight cuts were already its useful form. New: the premature-loop lemma
(`DEDUCE_LEMMAS=loop`, Tatham's loop deductions): a known chain that isn't all the known line
can't close, so the gap between its ends stays empty; added while solving, like the component
lemma. On three hard and three tricky 7×7 Loopy puzzles, searches fell from 19 to 2 and the
estimates came off the 0.80 ceiling. Against Tatham's grades (2 jobs): 10×10 solved 39 of 40 in
the budget instead of 29, agreement 0.42 to 0.48; but 7×7 fell 0.37 to 0.21 (every grade's
estimate drops alike, easy and normal most). Opt-in until its steps are priced.

**Loopy step labels** (references/tatham/build/loopy-one.c): one application of a deduction
doesn't fit Loopy (a corner 3 takes two passes of its pair deductions), so a step's label is the
lowest level of Tatham's solver that, run to the end from the position, settles the edge. 7,139
steps: harder levels appear only in harder grades. Today's costs already order them on average
(easy 3.1; normal, tricky, hard 4.7–4.9), but within easy they spread widely (agreement 0.13), and
fitting the step features doesn't help (0.13), so prices stay as they were.

**Cloud run** (puzzles/cloud, one L4): the graph network on 8,780 puzzles of 37 types; its top
guess is a move 35–94% of the time (random 10–50%). Left out of training, a type still beats chance:
Akari 54% (random 29%), Sudoku 40% (20%), Slitherlink 24% (14%), Star Battle 32% (28%), Nurikabe
13% (14%, no better). Ten of its puzzles (few-shot) lift Star Battle to 57%. The move embedding ran
out of memory on the VM; it needs batching before the next run.

**The table from data** (technique_svd.py): types × techniques (each type's share of steps per
signature, square-rooted), factored by SVD. Six factors hold 56%; past the first (steps on one cell
alone: how much of a type is easy), each is a family of types no one listed: lines and loops (Simple
Loop, Simple Path, Numberlink, Masyu, Slitherlink); order (Hive, Hidoku, Pythagorean Paths,
Honeycomb Paths, alike at 0.99–1.00); regions by size (Shikaku, Square Jam, Spiral Galaxies,
Polyomino Packing, Fillomino); counting along lines and regions (Star Battle, Aquarium, Abstract
Art, Binary Puzzle); counting what's seen or near (Akari, Minesweeper, Cave, Wittgenstein Briquet);
and each-once (the Sudokus, Skyscrapers, Easy as ABC, Hitori). Panel sits alone. These are the
periodic table's groups, and the held-out tests should take them in turn (leave a family out, not
a type).

**Pricing loops** (on by default): Loopy step labels with the premature-loop lemma on showed its
steps are all Tatham-easy (255 of 255, in every grade) though they cost 7.7 against 2.6 for other
easy steps: a long chain makes a big explanation, but a person follows the line. Two new features
(a premature-loop step; its chain's length) get a discount of −1.25 and −1.47. Loopy also exposed
linear instance counts in the prices (a step can use 70 corner rules: corrections of −30, undone by
offsets of +9): counts are now on a log scale. Prices are refitted, caps written by the fit,
offsets recentred on the new defaults (the loop lemma on). Full scoreboard against the board saved
2026-10-12 (before the learned prices): Puzzle Square JP Simple Loop −0.01 to 0.63, Masyu 0.19 to
0.29, Sudoku 0.71 to 0.80, Star Battle 0.66 to 0.73, Skyscrapers 0.61 to 0.66, Spiral Galaxies 0.20
to 0.50 (5 solved); Tatham Light Up 0.77/0.79 to 0.91/0.85, Loopy 7×7 0.37 to 0.41 (10×10 0.50,
39 of 40 solved, against 0.42 and 29 at the same job count before). Drops: Easy as ABC 0.93 to 0.80
(5 puzzles; from the earlier prices) and Minesweeper 0.58 to 0.48 (8 puzzles); Beast Academy's Akari
within sets −0.30 to −0.57 against the previous commit, on sets of a few puzzles and already
backwards (its tier agreement 0.20 to 0.23).

## 7. Attention, hide-and-fill, and leaving out a family (graph_policy.py grid)

Four versions of the graph network on the same 8,780 puzzles, one cloud run (graph-20261012-2311,
one L4, 1 h 50 min): **base**; **attention**, global self-attention over all of a puzzle's nodes
after every other round of message passing (GPS-style; no positional encodings); **pretrain**,
hide and fill first (solved puzzles with 15–50% of their marks hidden, the network fills them in,
84–85% right) then move prediction; **both**. Each is scored on every type (trained on all), and
with each family of section 6 left out in turn (trained on the rest, hide and fill too; then ten of
each left-out type's puzzles). Top guess is a move, mean over the family's types:

| Version | All types | Lines, loops | Counting | Each-once | Sight, near | Regions by size | Order |
|---|---|---|---|---|---|---|---|
| base | 60% | 30% / 51% | 40% / 47% | 36% / 41% | 34% / 41% | 29% / 48% | 37% / 60% |
| attention | 63% | 27% / 53% | 35% / 47% | 29% / 44% | 36% / 42% | 29% / 38% | 43% / 52% |
| pretrain | 61% | 30% / 48% | 30% / 45% | 34% / 40% | 31% / 35% | 29% / 43% | 45% / 57% |
| both | 62% | 31% / 50% | 34% / 46% | 28% / 43% | 35% / 39% | 26% / 44% | 39% / 47% |
| random | 25% | 14% | 32% | 23% | 28% | 25% | 34% |

(zero-shot / few-shot.) Attention helps a little in distribution (60% to 63%, spread over many
types: Honeycomb Paths 54% to 65%, Skyscrapers 48% to 55%), but not the whole-grid types it was
meant for: Slitherlink 59% to 63%, Nurikabe 34% to 35%, Cave 34% to 36%. Neither attention nor hide
and fill lifts a left-out family: zero-shot is level with base or below on five of six (each-once
36% to 28–34%, counting 40% to 30–35%), and few-shot moves both ways. A whole family left out
still beats random on most of its types (Lines and loops 30% against 14%, Akari 42–51% against 29%),
but some fall to chance (Aquarium, Abstract Art, Square Jam, Minesweeper). One seed, so differences
under about five points are noise. Reach alone isn't what whole-grid types lack (attention gives
every node the whole puzzle), and knowing what solutions look like doesn't carry to finding the
next move of a new kind of puzzle; the next tries are the components-and-exits primitive (section 5) as input, and training
long enough and on enough types that a family's reasoning appears elsewhere.

## 8. Mining from people's moves (miner-propose.ts, MINER_SOURCE=janko)

Opus 5.5 was shown 60 of 67 moments where today's solver (loop lemma on) had to search on Janko's
Slitherlink, Masyu and Nurikabe, each with the person's next moves from there, loops drawn as a
grid; 20 rounds, $0.98 (stopped by a network timeout with the set nearly used; the proposer now
retries and skips a failed round). Best families, tested on the whole set:

- three 2 × 2 blocks and a line through them, up to 16 cells (pivot): 83 searches removed, 8
  moments helped, 45% slower; the blocks sit round the open ends of nearby line pieces;
- two clues and a line through both (pivot): 35–55 removed, 12–20% slower;
- three 2 × 2 blocks in a chain (touch), up to 12 cells: 36–40 removed (corridors and pockets);
- a clue between two neighbours' reaches (Nurikabe): 34 removed.

The ideas the language can't say converge on a few units, each proposed several times: the **ends
of a line piece** with the open cells between and near them (does joining them close the loop
early: the premature-loop lemma as a window); a **pocket** or **corridor**, an open area bounded
by known lines with the loop ends entering it (they pair up, enter and leave an even number of
times: parity round a closed boundary, which straight cuts can't say); a **frontier**, a known
group with its open neighbours (the component lemma as a window, seen as soon as the group is
known); a **vertex**, the edges at one grid point; and a **border** relation for units touching
the grid's edge. Next: these units in the proposal language, the families above through the
scoreboard.

## 9. Is the network too small? (graph-20261013-0640, scale step)

The attention network with each cell's position as input, trained 16 epochs on every type, at
three widths (8 heads, learning rate 2e-3 for all):

| Width | Parameters | All types (31 with ≥ 20 puzzles) | Sudoku | Skyscrapers | Irregular Sudoku | Nurikabe | Cave |
|---|---|---|---|---|---|---|---|
| 64, earlier (8 epochs, no positions) | 0.5M | 63% | 53% | 55% | 45% | 35% | 36% |
| 64 | 0.5M | 67% | 67% | 70% | 69% | 39% | 38% |
| 128 | 2.0M | 64% | 51% | 53% | 43% | 36% | 37% |
| 256 | 7.9M | 29% (diverged) | 20% | 29% | 21% | 9% | 12% |

Positions and longer training help (each-once types most: knowing a cell's row and column). The
wider networks did worse, and width 256's training diverged (loss 1.79 at epoch 16, above its
start): the same learning rate for every width is too high for the wide ones, so this doesn't yet
say whether size helps. A fair test scales the learning rate down with width (and warms it up).
The whole-grid types stay under 40% at every width that trained.

**The component lemma under step-label prices** (frontiers: a known group and its ways out, asked
for again by the mining round): still opt-in. With it on (and the loop lemma): Puzzle Square JP
Masyu 0.29 to 0.41, but Hitori 0.46 to 0.14, Tatham Singles 8×8 0.75 to 0.42 (6×6 0.69), Loopy
10×10 0.50 to 0.44. Every Singles estimate falls (easy 0.63 to 0.35): the lemma replaces the
searches that carried the difficulty, and its group steps (Tatham's tricky removesplits) are
priced only +1.0 above single-cell ones. Next for it: price group steps from the Singles labels
alone, and centre offsets on solves with it on.

**The fair size test** (graph-20261013-1125: the learning rate scaled down with width, warmed up
over the first epoch, gradients clipped; 16 epochs; attention and positions): size helps.

| Width | Parameters | Hours | All types | Sudoku | Skyscrapers | Slitherlink | Cave | Nurikabe |
|---|---|---|---|---|---|---|---|---|
| 64 | 0.5M | 0.6 | 69.4% | 76% | 79% | 61% | 40% | 39% |
| 128 | 2.0M | 0.7 | 73.5% | 79% | 82% | 65% | 43% | 48% |
| 256 | 7.9M | 1.3 | 76.0% | 85% | 86% | 69% | 46% | 43% |

Still rising at 256. The whole-grid types gain less and stay far below the rest (one seed each:
Nurikabe's 48% then 43% is within noise), so size isn't their answer alone. The warm-up and
clipping also lifted width 64 (66.8% to 69.4%).

## 10. A fairer ruler (graph-human.ts; graph_policy.py report, load; cloud step curve)

The test so far was lenient (a top guess counts if it's settled in any of the next three rounds)
and in distribution (an 80/20 split of the same sources, nearly all ours). Before training on the
133,000 generated puzzles, which could teach the network our generator's habits, `all` now reports,
beside the per-type table (unchanged, so earlier results stay comparable):

- **Human test set** (graph-human.ts → references/ml/graphs-human.jsonl): Janko's puzzles of the
  eight types janko.ts reads (up to 10 × 10, with recorded moves, up to 150 a type) and Puzzle Square
  JP's (up to 12 × 12, up to 100 a type). Never trained on: a corpus copy of one of its puzzles
  (same type, givens and rule instances) stays in the per-type split but leaves training (123 of
  graphs.jsonl's puzzles were such copies: the earlier runs trained on part of this test). Per
  type, with random's line, and per source. Built: 1,322 puzzles, 54,690 states; Janko 660
  (Akari 148, Hitori 150, Masyu 150, Star Battle 115, Slitherlink 55, Nurikabe 36, Spiral Galaxies
  4, Fillomino 2), Puzzle Square JP 662 over 17 types (Masyu 100, Slitherlink 99, Akari 97,
  Shikaku 73, Simple Loop 56, Sudoku 56, Skyscrapers 37, Star Battle 37, Hitori 26, Spiral Galaxies
  22, Cave 19, Aquarium 14, Nonogram 11, and under 10 of Minesweeper, Easy as ABC, Numberlink and
  Nurikabe). Only puzzles our solver finishes in 30 s are in: few Fillomino, Nurikabe, Spiral
  Galaxies and Numberlink.
- **Agreement with people:** on Janko's states, the share where the top guess is among the
  person's next 3 moves (of the marks they settled, the first 3 still open, as janko-stuck.ts),
  beside our solver's next step (any of its facts, and its first fact alone) and random; per type
  and per person (seven people made the ~6,700 recorded solves, Rainer about a third, so the pooled
  number leans on one person's habits). The states are the solver's rounds, not the person's own
  positions. Janko's files hold no solve times: no difficulty labels from them. (But Janko's index pages rank each folder by solving time, "leicht", 1–8, "schwer": `meta.jankoLevel` in janko-full.ts's output since 2026-10-22.)
- **Key move:** the share where the top guess is the round's key fact, a fact of its costliest
  step (the costs the records already carry), with random's line.
- **By band and by family:** a fixed 1% of the generated puzzles (by a hash of the name) held out,
  by band; each set by family (FAMILIES).
- **Seeds:** GRAPH_SEEDS=n runs `all` n times (seeds 1…n; seed 1 is the old run) and reports the
  mean and spread of each headline number.

**Loading at 133,000 puzzles.** States are no longer stored: each mark's settling round and value
give every state and its targets on demand (checked identical to the old states on graphs.jsonl),
mark names are dropped after reading, and the files are read a line at a time. GRAPH_GEN_SHARE takes
a share of the generated set by the same hash (so 10% ⊂ 25% ⊂ 50% ⊂ 100%; skipped lines aren't
parsed), and GRAPH_STATES_PER keeps at most N states of each generated puzzle, spread through its
solve. The whole set (about 1,300 held out, the rest to train) loads in 61 s on the Mac at a peak of 2.0 GB.

**The learning curve** (graph-job.sh step `curve`): the attention network at width 128 (8 heads,
positions, GRAPH_LR_SCALE=1; the fair size test gave 69.4% at 64, 73.5% at 128 and 76.0% at 256,
still rising, and a network too small to use more data would hide the answer) on the corpus plus
100, 10, 50 and 25% of the generated set, 4 states a generated puzzle (516,523 states, 62M
mark-states at 100%: 3.3 times the corpus's 18.6M a training epoch). Every share gets the same
training time as the size test's 16 corpus epochs (44 minutes at 128): 12, 9, 6 and 4 epochs for
10, 25, 50 and 100%, so the curve measures more data rather than more steps, and the size test is
its 0% point. About 50 minutes a share, 3.4 hours in all. Width 256 at the same time per share
(81 minutes) would need about 5.6 hours: two VMs, two shares each. Bands are read from the records
when scored (a re-banding changes nothing else; the held-out slice is hashed on the name without
its band), and Spiral Galaxies and Fill-in are left out of the by-band table while their bands are
redone (GRAPH_BAND_SKIP). Results to come.

## 11. Structure as input (graph-20261013-1435)

Each cell's structure, computed from the position (puzzles/difficulty/structure.py, GRAPH_STRUCTURE=1):
- the known group it's in, the group's size and its ways out;
- the room a clue still needs, and what it can still reach;
- for lines, the ends of each piece, its length and how far apart the ends are, and the open edges
  that would close a loop early;
- for marks, whether they join two ends or close a piece.

All of it is keyed on rule primitives, not genre names. The run is the fair size test's width-128
run with only these features added (16 epochs, attention, positions, learning rate scaled):

| Type | Without | With |
|---|---|---|
| Hitori | 67% | 83% |
| Slitherlink | 65% | 79% |
| Nurikabe | 48% | 60% |
| Cave | 43% | 54% |
| Shikaku | 84% | 88% |
| Sudoku | 79% | 82% |
| Masyu, Star Battle, Akari | 84%, 96%, 85% | 84%, 96%, 86% |
| Fillomino (52 test states) | 60% | 54% |
| All types (31) | 73.5% | 77.1% |

The whole-grid types gain 11–16 points, more than width 256 gave them, and the mean beats width 256
(76.0%) at a quarter of the size. What the network lacked was sight of groups and their exits, not
reach or size. One seed each; both runs on the same data (which still held the 123 puzzles later
found to be copies of human test puzzles), so the comparison is fair.

## 12. Training on human-made puzzles (graph-human.ts --train; graph_policy.py GRAPH_HUMAN_TRAIN; cloud steps human-job, next)

The curve run's network scores 88% on held-out generated puzzles but 61% on the human test set: it
learns what our generator's puzzles look like. The human training set adds every other Janko and
Puzzle Square JP puzzle:

- **What:** every Janko puzzle janko.ts reads (its eight types) and every Puzzle Square JP puzzle,
  up to 15 × 15, less the test set's 1,322: 3,779 to solve (2,265 Janko). Janko's keep the solver
  and, where recorded, the order. Beast Academy's are in the corpus already; Tatham's are generated
  by his program, so left out. Only those our solver finishes in 30 s are kept: about half in a
  test of 46 (none of Nurikabe, Numberlink, Spiral Galaxies or the 13–15 Sudoku and Star Battle).
- **Leakage:** test puzzles are left out by name before solving, and by content after (type,
  givens and rule instances: graph_policy.py's content_key, computed the same in TypeScript and
  checked identical on 600 records). graph_policy.py checks again at load and also drops a human
  training puzzle that copies a corpus puzzle (the corpus's copy may be in the per-type test split)
  or repeats one; the counts are printed.
- **Weighting:** GRAPH_HUMAN_WEIGHT=w weights each human state's loss w times a corpus or
  generated state's, normalised by the batch's weighted marks (loss_of). Chosen over sampling them
  w times as often because the epoch, and so the run's time, stays the same whatever w is, so
  weights can be compared at equal cost; in expectation the gradient is the same. Checked: on one
  batch the loss is exactly the weighted mean of the two sources' losses at w = 1, 2, 5.
- **The mix** is printed at load: puzzles, states, weight and share of training by source.
- **Build:** about 10½ CPU-hours, so a spot CPU job (puzzles/cloud/run-human-job.sh), resumable
  from its solve cache; the raw files are in the bucket's private path (private/janko,
  private/psjp), never published. A finished build goes to data/graphs-human-train.jsonl.
- **The run** (graph-job.sh step `next`): width 256, 8 heads, positions, structure, learning rate
  scaled, attention; the corpus, the whole generated set at 3 states a puzzle and the human set at
  weight 2; 8 epochs of about 22 minutes, GRAPH_TRAIN_DEADLINE stopping early if they run long, so
  about 3½ hours with loading and scoring. Weight 2 makes the human set about a quarter to a third
  of training, and each human puzzle is then seen 16 times in effect, as often as the corpus's in
  the 16-epoch runs that didn't overfit. Results to come.

## 13. The learning curve (graph-20261013-1542)

Width 128, attention, positions, no structure features; the corpus plus 10%, 25%, 50% and 100% of
the 133k generated puzzles (nested shares), each trained for the same time (12, 9, 6 and 4 epochs),
scored with the new tests:

| Generated share | Human-made: any move | Human-made: key move | Agreement with people | Generated held out | Corpus held out |
|---|---|---|---|---|---|
| 10% | 61% | 29% | 20% | 85% | 74.9% |
| 25% | 62% | 29% | 24% | 87% | 75.8% |
| 50% | 61% | 30% | 20% | 89% | 73.9% |
| 100% | 61% | 30% | 22% | 88% | 74.2% |

Random: 20% (any move) and 7% (key move) on human-made puzzles, 9% for agreement; our solver's
next step agrees with people 36% of the time. Ten times the generated data moves generated puzzles
a little and human-made ones not at all: volume of this kind isn't the limit, its likeness to human
puzzles is. Equal time per share means fewer passes at larger shares, but the human line is flat at
every share. Next: human puzzles in training, a human-like generator, structure features (§11), at
width 256.

## 14. The baseline before human data (graph-20261013-2329)

Everything that has helped, together, and no human puzzles in training: attention at width 256,
structure as input, positions, the learning rate scaled, the corpus plus the generated set (3
states a puzzle), 8 epochs; Beast Academy evaluation-only. Against the learning curve's width-128
run without structure (§13):

| | Before | Baseline |
|---|---|---|
| Human-made: any move | 61% | 68% |
| Human-made: key move | 30% | 35% |
| Agreement with people (solver 36%) | 22% | 28% |
| Human Hitori / Nurikabe / Cave | 37% / 34% / 23% | 63% / 56% / 47% |
| Human Shikaku / Star Battle | 40% / 51% | 48% / 59% |
| Corpus held out / generated held out | 74% / 88% | 80% / 92% |

Structure and size carry over to real puzzles, most for the whole-grid types. Star Battle and
Shikaku stay weak on human puzzles, where the generator lacked 2-star and sparse layouts. The
network still trails our solver at predicting people (28% against 36%). This is the reference for
adding human data: the same setup, plus the human training set and human-move labels.
