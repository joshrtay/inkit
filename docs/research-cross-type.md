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
