# Grid engine (design)

One engine for grid logic puzzles: Slitherlink, Nurikabe, Sudoku, Masyu, region-division
puzzles in the style of The Artisan of Glimmith, Simple Loop and Nonograms. A puzzle is **geometry + marks + givens + rules (+ style)**. Status: prototype on
the `grid-engine` branch, with twenty-five genres: Simple Loop (`simple-loop`), Simple Path (`simple-path`), Numberlink
(`numberlink`), Masyu (`masyu`), Cave (`cave`), Aquarium (`aquarium`), Square Jam (`square-jam`),
Wittgenstein Briquet (`wittgenstein-briquet`), Hitori (`hitori`), Minesweeper (`minesweeper`),
Spiral Galaxies (`spiral-galaxies`), Thermo Sudoku (`thermo-sudoku`), Skyscrapers (`skyscrapers`),
Easy as ABC (`easy-as-abc`), Star Battle (`star-battle`), Akari (`akari`), Shikaku (`shikaku`), Irregular Sudoku (`irregular-sudoku`), Nonogram (`nonogram`), Number Line Maze (`maze`), Three Coats (`coats`), Slitherlink, Nurikabe, Panes
and Sudoku, and Panel (`panel`: line puzzles in the style of The Witness; see "Panels" below).
Later: Binairo (`binairo`), Colour Balance (`colour-balance`, our name: each row and column holds its
share of each of 2 or 3 colors) and Number Fill-In (`fill-in`), and Akari ciphers (letters for numbers).

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
| `digit` | cells | 1..n, pencil notes (shown as the style's `symbols`: Easy as ABC's letters, a fill-in's 0-9) | Sudoku, Number Fill-In |
| `paint` | cells | palette color 1..n (red, yellow, blue by default) | Three Coats (a figure's pieces), Binairo and Colour Balance (a square grid's cells) |

Regions come from either input: painting cells a color, or cutting borders. A region is a
connected group of same-color cells not separated by a cut. For shading puzzles, the
*islands* (connected unshaded cells) are regions too, so region rules work for both.

**Areas** (`areas`) are outlined regions given in the puzzle, written like a picture: one
string per row, one letter per cell. They're drawn with thick outlines; rules can count in
them (`shaded-per-area`), and `boxes` uses them as a sudoku's boxes when they're there.

**Givens** are clues fixed to an element: a number in a cell (in a digit puzzle, a given
digit), a rock (`block`: no marks; in a region puzzle a hole, in no region, its edges borders), a
symbol (a color name for a colored one), a compass, a `palisade` mark, a `shape` (a panel's symbol, or a
region's shape in a region puzzle), a ◆ / ◇ / `wall` on a border (in a region puzzle a wall is a border drawn already: different regions on either side), an
`inequality` sign or a `difference` number on a border, a number on a corner (`count`, or a `watchtower`
counting regions), a shape bank's shapes (`{at: "aside", kind: "bank"}`, drawn under the board), paint `dots` in a piece (colors, optionally `hidden` until
it's painted), a `door` in the outside edge (a maze's way in or out), and a
nonogram's runs or a `total` beside a row or above a column, a clue outside the grid looking in
(`first` letter seen, `skyscraper` count), a `thermo` through a run of cells (bulb first), and a
`galaxy` centre on a point in half-cell steps (cell centres, edge midpoints, corners). A nonogram's runs can instead come from its
`picture`, which solving reveals. A number in a cell can carry a `letter` instead (an Akari cipher: each
letter stands for a different number 0-4, found while solving; its `value` isn't used); a `color` in a
cell is a printed paint color that stays (Binairo, Colour Balance). A fill-in's list of numbers is the
puzzle's `entries` (strings in the style's symbols), drawn under the board grouped by length and
crossed off as they appear (`src/game-types/grid/entry-list.ts`); its black squares are rocks, which
digit puzzles leave empty.

**Rules** are configured *building blocks* (`src/engine/rules.ts`). Each block does four
jobs:

1. **check** a board and point at what's wrong (browser: auto-solve),
2. **encode** itself for the solver (answer set programming, run with clingo),
3. **describe** itself in plain words for the "How to play" card,
4. say which shared structures (regions, shapes) its encoding needs.

A puzzle's own rule replaces its genre's rule of the same name, so a 2-star Star Battle lists
`{"rule": "shaded-per-line", "n": 2}` (and the same for areas). A puzzle lists its rules with their settings, e.g. `{"rule": "size", "is": 4}` or
`{"rule": "twins"}`. A *genre* (`src/engine/puzzle.ts`) is a preset of marks + rules +
style, so a Slitherlink puzzle only lists its givens. Creators mix blocks freely; a rule
that can't be built from existing blocks is a new block (reviewed code), and then every
puzzle can use it.

### Building blocks (first set)

| Block | Meaning |
|---|---|
| `loop` | The lines (fence or loop marks) form exactly one closed loop; `cover` makes it pass through every open cell. |
| `path` | The loop marks form one path from the way-in door's cell to the way-out door's cell; `cover` makes it pass through every open cell (Simple Path). |
| `links` | Lines (loop marks) join each pair of matching numbers; they never branch or cross; `cover` uses every cell (Connectlink). |
| `pearls` | Masyu: the loop goes straight through white pearls, turning in a cell next to them; it turns on black pearls and goes straight through the cells on both sides. |
| `sides` | A number in a cell counts the fence lines on its four sides. |
| `shaded-per-line` | Every row and column has `n` shaded cells (Star Battle's stars). |
| `shaded-per-area` | Every outlined area has `n` shaded cells. |
| `no-touch` | Shaded cells never touch, not even diagonally. |
| `lit` | Shaded cells are light bulbs: each lights its row and column up to a rock; every open cell is lit and no two bulbs see each other (Akari). |
| `adjacent-count` | A number counts the shaded cells (bulbs) orthogonally beside it; in Akari the numbers sit on rocks. |
| `unshaded-connected` | All unshaded cells form one group (Cave). |
| `shaded-to-edge` | Every group of shaded cells touches the grid's edge (Cave). |
| `sight` | A number counts the unshaded cells it sees along its row and column, itself included (Cave). |
| `water` | Shaded cells are water in the outlined tanks: water in a cell means water in every cell of its tank it could flow to at that level or below (Aquarium). |
| `line-totals` | A `total` beside a row / above a column counts its shaded cells (Aquarium). |
| `squares` | Every region is a square (Square Jam). |
| `no-four-corners` | Four regions never meet at a point (Square Jam); with `outline`, no point where four border lines meet, the board's outline and holes counting as lines (Glimmith's Bricky). |
| `side-clue` | A number gives the side of its square (Square Jam). |
| `bars` | Shaded cells split into straight blocks of `length` (3: Wittgenstein Briquet). |
| `no-adjacent` | Shaded cells never share a side (Hitori). |
| `unique-unshaded` | Unshaded numbers differ in each row and column; the player shades the number cells themselves (Hitori). |
| `mine-count` | A number counts the shaded cells (mines) in the 8 around it (Minesweeper). |
| `letters` | Each of `count` letters once per row and column, other cells empty; shown with the style's `symbols` (Easy as ABC). |
| `first-seen` | A letter outside is the first one met looking in (Easy as ABC). |
| `skyscrapers` | A number outside counts the buildings seen looking in (Skyscrapers). |
| `thermo` | Digits rise along a thermometer (Thermo Sudoku). |
| `galaxies` | Each region holds one galaxy centre and is symmetric about it (Spiral Galaxies). |
| `connected` | All shaded cells form one connected group. |
| `no-pool` | No 2×2 block of shaded cells. |
| `size` | Every region has `is` cells (or `min` / `max`). |
| `size-clue` | A numbered cell's region has that many cells. |
| `one-each` | Every region contains exactly one clue of a kind (`of`: `number`, `symbol`, or `any` clue in a cell: Glimmith's Solitude). |
| `twins` | The two regions on either side of a ◆ are different regions with the same shape (turns and flips allowed). |
| `opposites` | The two regions on either side of a ◇ are different regions with different shapes. |
| `rectangles` | Every region is a rectangle (Shikaku). |
| `all-different` | No two regions have the same shape. |
| `compass` | A compass clue's numbers count the cells of its region that lie north, east, south and west of it. |
| `neighbors-differ` | Regions that share a border have different shapes (Glimmith's Mingle Shape). |
| `one-of-each` | Every region holds exactly one symbol of each kind: one of every color (Glimmith's Rose Windows with several colors of rose; a symbol's value is its color). |
| `no-t-junctions` | No point where exactly three border lines meet, the outline and holes counting (Glimmith's Loopy). |
| `no-rectangles` | No region is a rectangle (Glimmith's Non-Boxy). |
| `all-same` | Every region has the same shape, turned or flipped (Glimmith's Match). |
| `neighbors-differ-size` | Regions that share a border have different sizes (Glimmith's Size Separation). |
| `shape-bank` | Every region is one of the `bank` shapes, turned or flipped (Glimmith's Shape Bank). |
| `region-shape` | A `shape` clue in a cell is its region's shape, turned or flipped (Glimmith's Polyomino). |
| `size-compare` | An `inequality` sign on a border points to the smaller of the two regions (its first cell's; Glimmith's Inequality). |
| `size-difference` | A `difference` number on a border: two different regions whose sizes differ by it (Glimmith's Difference). |
| `regions-at-corner` | A `watchtower` number on a corner counts the regions among the cells around it (Glimmith's Watchtower). |
| `cell-borders` | A `palisade` clue shows how many of its cell's four sides are region borders (0-4), and with two whether they're `opposite` or at a corner, turned any way; the grid's edge and holes count (Glimmith's Palisade). |
| `runs` | Each row's and column's runs of shaded cells match its numbers (nonograms). Offers a hint: a line whose numbers alone give cells away. |
| `latin` | Every cell holds a digit 1..n; each row and column has each digit once. |
| `boxes` | Each box (`box: [h, w]`, or sized from the grid; the outlined areas if the puzzle has them) has each digit once. |
| `corner-count` | A number on a corner counts the fence lines (walls) touching it; the outside edge counts. |
| `painted` | Every cell (piece) gets a paint color. |
| `neighbor-dots` | k dots of a color in a piece need at least k neighbours of that color. |
| `color-count` | Exactly this many pieces of each color (`red`, `yellow`, `blue`, or `c1`, `c2`...). |
| `perfect-maze` | The walls make a perfect maze: the outside edge is walled except the two doors, given walls stay, every cell is reachable and there's one way between any two (the open passages form a spanning tree). |
| `panel-line` | A panel's line (fence marks) runs from a start circle to an end on the outside edge, never touching itself or crossing a gap; `symmetry` (`left-right`, `up-down`, `turn`) makes it two lines, mirror images that never touch, each passing the dots of its color. |
| `panel-symbols` | Every symbol in the regions the line cuts the grid into: dots, squares, stars, triangles, shapes and erasers (see "Panels"). |
| `line-shares` | Every row and column holds each paint color in proportion to `parts` (one per palette color; default equal: half and half). A line that can't be split evenly makes the puzzle invalid (Binairo, Colour Balance). |
| `no-three-in-a-row` | No three cells in a row, across or down, have the same paint color (Binairo). |
| `unique-lines` | No two rows are painted the same, and no two columns (Binairo). |
| `fill-in` | Every entry on the list goes into one slot (a run of 2+ open cells across or down, between rocks or the edge), every slot takes one, every open cell gets a digit (Number Fill-In). |

`adjacent-count` also reads an Akari cipher's letters: cells with the same letter have the same count,
different letters different counts (0-4).

Genre names: use the standard name when a genre has one that's used across puzzle sites
(Slitherlink, Nurikabe, Sudoku, Star Battle, Masyu, Akari, Shikaku, Simple Loop, Nonogram...),
Wyatt's games included. A genre with no shared name (Number Line Maze), or whose only name is one
commercial game's (Three Coats, after FLEB's RYB), gets a name of ours.
Mechanics are fair game; other sites' art and levels aren't ours to copy, so puzzles are Wyatt's
(or generated).

## Panels

Line puzzles in the style of the panels in Jonathan Blow's The Witness (`src/engine/panel.ts`),
which a kid can draw on paper. A line runs along the grid lines from a **start** circle (a corner)
to an **end** (a corner on the outside edge, drawn as a stub sticking out); it never touches or
crosses itself and never runs across a **gap** (`at: "line"` givens sit on a stretch of grid line
between two neighbouring corners). The line cuts the cells into regions, and the symbols say
where it can go:

| Symbol | Given | Rule |
|---|---|---|
| Dot | `hexagon` on a corner or a line | The line passes through it (with symmetry, a colored dot by the line of that color). |
| Square | `square`, with a color | No region holds squares of two colors. |
| Star | `star`, with a color | Its region holds exactly one other symbol of its color, of any kind. |
| Triangle | `triangle`, 1-3 | The line runs along that many of the cell's sides. |
| Shape | `shape`: its cells, `rotate`, `negative` | A region with shapes is exactly its shapes fitted together, as drawn (tilted ones may turn), and the line never cuts through a shape; hollow (negative) shapes cancel cells of the others: every cell of the region is covered 0 or 1 times net (the same for all), every cell outside it evenly. As the game counts it, a solid shape also fills the stretches of line between its squares and a hollow one takes away every stretch around its squares, so the line can cut through a solid shape only where a hollow one cancels the cut. |
| Eraser | `eraser` | Cancels itself and one symbol in its region that's wrong before any erasing, or pairs off with another eraser. |

Every cell symbol has a color that stars count: squares and stars as given, triangles orange,
shapes yellow, hollow shapes blue, erasers white (a given's `color` can change it). The rules
follow the game as the open-source Witness puzzle validator has it (jbzdarkid's witness-puzzles,
`engine/validate.js` and `polyominos.js`, default settings), and Demaine et al., "Who witnesses The
Witness?" (2018), where they agree. One limit keeps the one-solution proof exact in clingo: no
erasers in a panel with shapes (proving a region can't be packed is a harder problem). It's one
game type: symbols mix freely, and symmetry is a setting (a puzzle's own `panel-line` rule). A
panel needs a solution, not exactly one (the genre's `solutions: "some"`): as in the game, any
line that obeys the symbols solves it. The generator still makes panels with one solution. Left
out, since paper can't carry them: environmental and shadow puzzles, sound, colored light,
reflections, and puzzles that span several panels.

`node puzzles/grid/witness-import.ts <codes> <out dir>` turns panels written in The Windmill's
format (windmill.thefifthmatt.com) into ours and counts their solutions (trying every line when the
solver can't take a panel); it builds the local reference set in `references/witness/` (not
published: those are the games' designs).

`npm run new -- --genre panel --mix <dots|squares|stars|triangles|shapes|erasers|symmetry>` (`puzzles/grid/panels.ts`) draws a random winding line,
puts every symbol true of it on the panel, adds gaps until the line is the only one, and takes out
what isn't needed (gaps first). Drawing: `src/game-types/grid/panel-draw.ts` (pale tracks with
the ink line in them; the symbols over it). Playing: the line is drawn like a fence; gaps can't be
drawn over, and with symmetry the mirror line draws itself.

## Solving and the one-solution guarantee

clingo runs with `--project=show`: two answers only count as different if their shown marks
differ, so helper atoms (how a shading splits into blocks, which galaxy a cell belongs to) never
make one answer look like several.


At build time, `src/engine/solve.ts` turns a puzzle into an answer set program: a choice for
every mark, the shared region and shape predicates the rules need, and each rule's
encoding. clingo (`clingo-wasm`, WebAssembly, so it runs in Node and in the browser alike) is asked for up to two solutions. Each one is confirmed with the same TypeScript
`check` the browser uses, so an encoding that disagrees with its check fails the build. The
build fails unless there is exactly one solution; the browser then knows the board is
solved when every rule's check passes.

`node src/engine/selftest.ts [rounds] [seed] [kind]` tries every possible board on small random
puzzles and confirms the checks and the solver accept exactly the same ones (`kind`: only that
genre, or `panel` for random panels). Run it after adding or changing a block.

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
(`app/app/lib/read-sketch.server.ts`), they check the reading beside the photo, and they correct it
on the puzzle itself. So the editors must be able to express everything each game type needs, and
the reader must know how to read it.

The editor is a page of its own (`app/app/components/GameEditor.tsx`, no site nav), after
Substack's post editor (see ARCHITECTURE.md). The puzzle itself is edited by:
- **The on-puzzle editor** (`app/app/components/BoardEditor.tsx`), for every grid type: the puzzle
  drawn as the player sees it, edited in place with the few tools its type needs (`TOOLS`, typed
  against the engine's genres, so a new genre fails the build until it has tools). The tools: a
  number typed into a square (Enter or the arrow keys move on), rocks, walls between squares,
  pearls, galaxy circles, thermometers dragged from the bulb, doors, numbers and letters outside the
  grid, corner numbers, line totals, outlined areas painted, symbols, compasses, ◆/◇ marks, Panes'
  < signs, differences, watchtowers, shapes drawn on a small pad and the shape bank, and erase; nonograms paint their picture or type their numbers. Sudokus come in 4×4, 6×6 and 9×9;
  square types keep one size; Star Battle sets its stars per row, column and area. It draws the
  puzzle with `makePuzzle(spec, { unfinished: true })`, so a puzzle still missing something (a
  maze's second door, an area painted in two pieces) stays on screen to be fixed, and a draft can
  be saved that way (publishing still needs a complete puzzle with one solution).
- **The figure editor** (`FigureEditor.tsx`) for Three Coats: draw a piece corner by corner, drag
  corners, delete pieces, give a piece dots and hide them, and set the hearts.
- **The Rules panel** (`RulesPanel.tsx`): rules beyond the type's own, with every setting. Shown for
  Panes, and to admins on any puzzle.
- **The Look panel** (`LookPanel.tsx`): style options and which marks the player draws. Admins only.

**Coverage tables** (`app/app/editor/coverage.ts` for the editors, `read-sketch.server.ts` for the
reader) are typed against the engine's own lists, so a new name fails the type check until it has
an entry saying where it's edited and how it's read:

| Engine list | Editors | Reader |
|---|---|---|
| `GenreName` (`puzzle.ts`) | `TOOLS` (BoardEditor; Three Coats excepted) | `GENRE_GUIDE` |
| `Given["kind"]` (`types.ts`) | `CLUE_TOOLS`: the tool that places it | `CLUE_GUIDE` |
| `RuleName` (`rules.ts`) | `RULES`, with each setting (Rules panel) | `RULE_GUIDE` |
| `keyof GridStyle` | `STYLE` (Look panel) | |
| `MarkKind` | `MARKS` (Look panel) | |
| `keyof GridSpec` | `SPEC_PARTS` | |

Game type names live in `app/app/games/kinds.ts` (`KIND_NAMES`).

A name missing from a table fails `npm --prefix app run typecheck`. The tables can't see inside a
rule's settings or a clue's fields, so a new setting on an existing rule, or a new field on a clue,
has to be added by hand: a control in the editor and a line in the reader's guide.

## Puzzle guides

The social site's /puzzles pages explain every genre: one page each, with the rules stated as
briefly as possible, small ✓ / ✗ pictures of what works and what doesn't (in the style of Thinky
Dailies), and a worked example shown unsolved and solved, plus a searchable list of them all.

- `src/guides/guides.ts`: each genre's guide, typed against `GenreName` (a new genre fails the
  build until it has one). Pictures are written compactly (`src/guides/types.ts`): shading as rows
  of `#` / `.`, lines as paths of cells, fences as paths of corners, regions as rows of letters.
- `npm run guides` (`puzzles/grid/guides.ts`) checks every picture against the engine's own rules
  (a ✓ must pass the rules it names, a ✗ must break one) and solves each example into
  `src/guides/examples.json`.
- `src/game-types/grid/picture.ts` draws any puzzle, with or without marks, as an SVG string with
  the player's own look; the pages draw them on the server (`app/app/lib/guides.server.ts`).

## Next

1. More blocks: sums and cages (Kakuro, Killer), polyomino shape clues, Masyu pearls.
2. Number Line Maze (`maze`) and Three Coats (`coats`) are ported; the social site's seed
   converts their old instances (`app/seed/make.py`).
3. Covers for the new genres; a feel pass on phones.
