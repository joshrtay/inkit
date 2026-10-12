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
