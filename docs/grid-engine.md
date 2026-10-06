# Grid engine (design)

One engine for grid logic puzzles: Slitherlink, Nurikabe, Sudoku, Masyu, region-division
puzzles in the style of The Artisan of Glimmith, Simple Loop and Nonograms. A puzzle is **geometry + marks + givens + rules (+ style)**. Status: prototype on
the `grid-engine` branch, with thirteen genres: Simple Loop (`simple-loop`), Simple Path (`simple-path`), Star Battle
(`star-battle`), Akari (`akari`), Shikaku (`shikaku`), Irregular Sudoku (`irregular-sudoku`), Nonogram (`nonogram`), Number Line Maze (`maze`), Three Coats (`coats`), Slitherlink, Nurikabe, Panes
and Sudoku.

## The model

**Geometry.** A grid is a graph of *cells*, *corners* and two kinds of edges:
*borders* (between two corners, separating cells) and *links* (between two cell centers).
Every interior border has a matching link across it. There are two geometries
(`src/engine/geometry.ts`): the square grid, and a **figure** of polygon pieces (Three Coats,
`figure` in the puzzle). In a figure each piece is a cell (row 0, column i), pieces sharing
part of an edge are neighbours (a border and a link between them), and corners closer than
1.5% of the figure's size are snapped together so hand-traced pieces meet. A figure is
played by painting.

**Marks** are what the player puts down. Each kind lives on one kind of element:

| Mark | On | Values | Used by |
|---|---|---|---|
| `shade` | cells | empty, shaded, dot | Nurikabe, nonograms, LITS |
| `fence` | borders | empty, line, X | Slitherlink |
| `loop` | links | empty, line, X | Simple Loop, Masyu |
| `regions` | borders + cell colors | cut / color | Panes (Glimmith-style), Fillomino, Shikaku |
| `digit` | cells | 1..n, pencil notes | Sudoku (Kakuro later) |
| `paint` | cells | palette color 1..n (red, yellow, blue by default) | Three Coats |

Regions come from either input: painting cells a color, or cutting borders. A region is a
connected group of same-color cells not separated by a cut. For shading puzzles, the
*islands* (connected unshaded cells) are regions too, so region rules work for both.

**Areas** (`areas`) are outlined regions given in the puzzle, written like a picture: one
string per row, one letter per cell. They're drawn with thick outlines; rules can count in
them (`shaded-per-area`), and `boxes` uses them as a sudoku's boxes when they're there.

**Givens** are clues fixed to an element: a number in a cell (in a digit puzzle, a given
digit), a rock (`block`: no marks), a symbol, a compass, a ◆ / ◇ / `wall` on a border, a
number on a corner (`count`), paint `dots` in a piece (colors, optionally `hidden` until
it's painted), a `door` in the outside edge (a maze's way in or out), and a
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
| `path` | The loop marks form one path from the way-in door's cell to the way-out door's cell; `cover` makes it pass through every open cell (Simple Path). |
| `sides` | A number in a cell counts the fence lines on its four sides. |
| `shaded-per-line` | Every row and column has `n` shaded cells (Star Battle's stars). |
| `shaded-per-area` | Every outlined area has `n` shaded cells. |
| `no-touch` | Shaded cells never touch, not even diagonally. |
| `lit` | Shaded cells are light bulbs: each lights its row and column up to a rock; every open cell is lit and no two bulbs see each other (Akari). |
| `adjacent-count` | A number counts the shaded cells (bulbs) orthogonally beside it; in Akari the numbers sit on rocks. |
| `connected` | All shaded cells form one connected group. |
| `no-pool` | No 2×2 block of shaded cells. |
| `size` | Every region has `is` cells (or `min` / `max`). |
| `size-clue` | A numbered cell's region has that many cells. |
| `one-each` | Every region contains exactly one clue of a kind (`of`). |
| `twins` | The two regions on either side of a ◆ are different regions with the same shape (turns and flips allowed). |
| `opposites` | The two regions on either side of a ◇ are different regions with different shapes. |
| `rectangles` | Every region is a rectangle (Shikaku). |
| `all-different` | No two regions have the same shape. |
| `compass` | A compass clue's numbers count the cells of its region that lie north, east, south and west of it. |
| `runs` | Each row's and column's runs of shaded cells match its numbers (nonograms). Offers a hint: a line whose numbers alone give cells away. |
| `latin` | Every cell holds a digit 1..n; each row and column has each digit once. |
| `boxes` | Each box (`box: [h, w]`, or sized from the grid; the outlined areas if the puzzle has them) has each digit once. |
| `corner-count` | A number on a corner counts the fence lines (walls) touching it; the outside edge counts. |
| `painted` | Every cell (piece) gets a paint color. |
| `neighbor-dots` | k dots of a color in a piece need at least k neighbours of that color. |
| `color-count` | Exactly this many pieces of each color (`red`, `yellow`, `blue`, or `c1`, `c2`...). |
| `perfect-maze` | The walls make a perfect maze: the outside edge is walled except the two doors, given walls stay, every cell is reachable and there's one way between any two (the open passages form a spanning tree). |

Genre names: use the standard name when a genre has one that's used across puzzle sites
(Slitherlink, Nurikabe, Sudoku, Star Battle, Masyu, Akari, Shikaku, Simple Loop, Nonogram...),
Wyatt's games included. A genre with no shared name (Number Line Maze), or whose only name is one
commercial game's (Three Coats, after FLEB's RYB), gets a name of ours.
Mechanics are fair game; other sites' art and levels aren't ours to copy, so puzzles are Wyatt's
(or generated).

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
- `loop`: drag from cell to cell; tap between two cells to cycle the link. A path's doors show
  as arrows with the line's ends drawn out to them.
- `shade`: tap cycles shaded / dot (or X, for nonograms) / empty (right-click the other way);
  dragging paints what the first cell got. Nonogram clue numbers can be tapped to tick them.
- `digit`: tap a cell, then a number on the pad (on the paper, under the board) or the
  keyboard; pencil notes; arrow keys move, Backspace erases.
- `regions`: pick a glass color and paint cells, or drag along a border to cut. Drags that
  start on a border cut; drags that start inside a cell paint.
- A maze (`maze`): draw walls along the lines; given walls and the doors are locked, and each
  corner number turns green when it has its walls. Once the walls check out, drag (or use the
  arrow keys) from the arrow in to the arrow out (`src/game-types/grid/walk.ts`); getting out
  solves it.
- Paint (`coats`, `src/game-types/grid/figure.ts`): pick a pot (or R / Y / B) and tap a piece.
  With `hearts` (Three Coats has 3) a wrong color is turned away and costs a heart, and right
  ones lock in; the player finds the answer with a quick paint solver (`src/engine/paint.ts`),
  which the self-test holds to the same answers as the checks. With `hearts: 0` players paint
  freely, undo and check.
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

## The visual editor

On the social site (`app/`), creators never see or type a sketch: Claude reads their drawing
(`app/app/lib/read-sketch.server.ts`) and they change it only in the visual puzzle editor
(`app/app/components/PuzzleEditor.tsx`). So the editor must be able to express everything this
engine can, and the reader must know how to read it.

**Rule: whenever the engine gains something, add it to the editor and the reader in the same
change.** That means a genre, a clue kind, a rule block or a new setting on one, a style option, a
mark, or a field of `GridSpec`.

The editor covers:
- the game type and grid size
- every clue kind: in cells, on borders, on corners, doors in the outside edge, and nonogram row /
  column numbers
- outlined areas (an area painter: pick an area, click cells into it)
- a figure's pieces (Three Coats, `app/app/components/FigureEditor.tsx`): draw a piece corner by
  corner, drag corners, delete pieces, give a piece dots and hide them, and set the hearts
- a nonogram's picture: painted in any number of colors, with its title
- rules beyond the genre's own, with every setting
- the style options, and which marks the player draws

Both files keep **coverage tables typed against the engine's own lists**:

| Engine list | Editor | Reader |
|---|---|---|
| `GenreName` (`puzzle.ts`) | `GENRE_CLUES` | `GENRE_GUIDE` |
| `Given["kind"]` (`types.ts`) | `CLUES` | `CLUE_GUIDE` |
| `RuleName` (`rules.ts`) | `RULES`, with each setting | `RULE_GUIDE` |
| `keyof GridStyle` | `STYLE` | |
| `MarkKind` | `MARKS` | |
| `keyof GridSpec` | `SPEC_PARTS` | |

Game type names live in `app/app/games/kinds.ts` (`KIND_NAMES`).

A name missing from a table fails `npm --prefix app run typecheck`. The tables can't see inside a
rule's settings or a clue's fields, so a new setting on an existing rule, or a new field on a clue,
has to be added by hand: a control in the editor and a line in the reader's guide.

## Next

1. More blocks: sums and cages (Kakuro, Killer), polyomino shape clues, Masyu pearls.
2. Number Line Maze (`maze`) and Three Coats (`coats`) are ported; the social site's seed
   converts their old instances (`app/seed/make.py`).
3. Covers for the new genres; a feel pass on phones.
