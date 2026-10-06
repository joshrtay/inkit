# Grid engine (design)

One engine for grid logic puzzles: Slitherlink, Nurikabe, Sudoku, Masyu, region-division
puzzles in the style of The Artisan of Glimmith, and our own Round the Bend and Picture
Squares. A puzzle is **geometry + marks + givens + rules (+ style)**. Status: prototype on
the `grid-engine` branch, with six genres: Round the Bend (`river`), Picture Squares
(`nonogram`), Slitherlink, Nurikabe, Panes and Sudoku.

## The model

**Geometry.** A grid is a graph of *cells*, *corners* and two kinds of edges:
*borders* (between two corners, separating cells) and *links* (between two cell centers).
Every interior border has a matching link across it. The first version is the square grid
(`src/engine/geometry.ts`); other shapes (hex, irregular like Three Coats) are new
geometries with the same interface.

**Marks** are what the player puts down. Each kind lives on one kind of element:

| Mark | On | Values | Used by |
|---|---|---|---|
| `shade` | cells | empty, shaded, dot | Nurikabe, nonograms, LITS |
| `fence` | borders | empty, line, X | Slitherlink |
| `loop` | links | empty, line, X | Round the Bend, Masyu |
| `regions` | borders + cell colors | cut / color | Panes (Glimmith-style), Fillomino, Shikaku |
| `digit` | cells | 1..n, pencil notes | Sudoku (Kakuro later) |

Regions come from either input: painting cells a color, or cutting borders. A region is a
connected group of same-color cells not separated by a cut. For shading puzzles, the
*islands* (connected unshaded cells) are regions too, so region rules work for both.

**Givens** are clues fixed to an element: a number in a cell (in a digit puzzle, a given
digit), a rock (`block`: no marks), a symbol, a compass, a ◆ / ◇ / `wall` on a border, and a
nonogram's runs beside a row or above a column. A nonogram's runs can instead come from its
`picture`, which solving reveals.

**Rules** are configured *building blocks* (`src/engine/rules.ts`). Each block does four
jobs:

1. **check** a board and point at what's wrong (browser: Check button, auto-solve),
2. **encode** itself for the solver (answer set programming, run with clingo),
3. **describe** itself in plain words for the "How to play" card,
4. say which shared structures (regions, shapes) its encoding needs.

A puzzle lists its rules with their settings, e.g. `{"rule": "size", "is": 4}` or
`{"rule": "twins"}`. A *genre* (`src/engine/puzzle.ts`) is a preset of marks + rules +
style, so a Slitherlink puzzle only lists its givens. Creators mix blocks freely; a rule
that can't be built from existing blocks is a new block (reviewed code), and then every
puzzle can use it.

### Building blocks (first set)

| Block | Meaning |
|---|---|
| `loop` | The lines (fence or loop marks) form exactly one closed loop; `cover` makes it pass through every open cell. |
| `sides` | A number in a cell counts the fence lines on its four sides. |
| `connected` | All shaded cells form one connected group. |
| `no-pool` | No 2×2 block of shaded cells. |
| `size` | Every region has `is` cells (or `min` / `max`). |
| `size-clue` | A numbered cell's region has that many cells. |
| `one-each` | Every region contains exactly one clue of a kind (`of`). |
| `twins` | The two regions on either side of a ◆ are different regions with the same shape (turns and flips allowed). |
| `opposites` | The two regions on either side of a ◇ are different regions with different shapes. |
| `all-different` | No two regions have the same shape. |
| `compass` | A compass clue's numbers count the cells of its region that lie north, east, south and west of it. |
| `runs` | Each row's and column's runs of shaded cells match its numbers (nonograms). Offers a hint: a line whose numbers alone give cells away. |
| `latin` | Every cell holds a digit 1..n; each row and column has each digit once. |
| `boxes` | Each box (`box: [h, w]`, or sized from the grid) has each digit once. |

Names are our own. Mechanics are fair game; another game's rule names, art and levels
aren't ours to copy, so puzzles are Wyatt's (or generated).

## Solving and the one-solution guarantee

At build time, `src/engine/solve.ts` turns a puzzle into an answer set program: a choice for
every mark, the shared region and shape predicates the rules need, and each rule's
encoding. clingo (`clingo-wasm`, WebAssembly, so it runs in the Astro build like our other
solvers) is asked for up to two solutions. Each one is confirmed with the same TypeScript
`check` the browser uses, so an encoding that disagrees with its check fails the build. The
build fails unless there is exactly one solution; the browser then knows the board is
solved when every rule's check passes.

`node src/engine/selftest.ts [rounds] [seed]` tries every possible board on small random
puzzles and confirms the checks and the solver accept exactly the same ones. Run it after
adding or changing a block.

## Making puzzles

`node puzzles/grid/new.ts --genre <g> --size RxC --number <n> --name <name>` makes a puzzle
for any genre: clingo picks a random finished board, every clue true of it goes in a pool,
clues that rule out other solutions are added until one is left, and unneeded clues are
removed. For Panes, `--rules "size=5,twins,opposites,compass"` picks the rule mix.

## Playing

`src/game-types/grid/game.ts` plays any genre. Gestures come from the marks, so every genre
that uses a mark gets the same behavior:

- `fence` / region cuts: drag along the lines from corner to corner (fast drags fill in the
  skipped edges); tap a line to cycle line / X / empty (cuts toggle).
- `loop`: drag from cell to cell; tap between two cells to cycle the link.
- `shade`: tap cycles shaded / dot (or X, for nonograms) / empty (right-click the other way);
  dragging paints what the first cell got. Nonogram clue numbers can be tapped to tick them.
- `digit`: tap a cell, then a number on the pad (on the paper, under the board) or the
  keyboard; pencil notes; arrow keys move, Backspace erases.
- `regions`: pick a glass color and paint cells, or drag along a border to cut. Drags that
  start on a border cut; drags that start inside a cell paint.
- One gesture is one undo step. Check highlights what the note is about; a solved board is
  noticed automatically.

## Style

Each genre (and puzzle) can set its ink, grid look (`lines` or `dots`) and glass palette.
Slitherlink's fence is a crisp pen line on a dot grid; Nurikabe's wall is an ink wash;
Panes are stained glass: dark lead lines between pieces, each piece a watercolor glass
color, and a cut-only solve is colored in when it's solved.

## Sketches

A sketch headed with a genre (`slitherlink`) or a rule list
(`panes: size 4, twins, compass`) is transcribed to an instance:

```json
{ "type": "grid", "name": "First Window", "meta": "5 × 5", "grid": {
    "size": [5, 5],
    "rules": [{ "rule": "size", "is": 5 }, { "rule": "twins" }],
    "givens": [{ "at": "border", "cells": [[1, 1], [1, 2]], "kind": "twins" }] } }
```

Blocks can also offer a **hint** (`hint()`), shown by the Hint button: an area to look at and
what it gives away. `runs` does; others can add one.

## Next

1. More blocks: sums and cages (Kakuro, Killer), polyomino shape clues, Masyu pearls.
2. Port Number Line Maze and Three Coats (needs an irregular geometry).
3. Covers for the new genres; a feel pass on phones.
