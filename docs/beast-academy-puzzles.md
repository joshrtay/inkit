# Beast Academy's puzzles, and what we could build

A catalogue of the logic and number puzzles in Beast Academy (BA), Art of Problem Solving's
grades 1–5 maths curriculum, built from public sources only (October 2026), and how each one fits
our grid engine (`docs/grid-engine.md`). Rules are described in our own words; no BA puzzle is
reproduced. Names follow `memory/genre-naming.md`: where a BA puzzle is a known genre, the
standard cross-site name is given, and a BA-only invention would need a name of ours if we built
it.

## Where BA puts its puzzles

| Place | Public? | What's known |
|---|---|---|
| **Puzzles 1–5** books (one per level) | Contents, a curriculum table and 2 sample sections per book are free PDFs | 12 puzzle types per book, 60 in all; 400–500+ puzzles per book; each type gets 10–18 pages (roughly 30–50 puzzles), a solved example and a strategies section; the hardest ones are by Palmer Mebane (2011 World Puzzle Champion) and US puzzle team members |
| **Guide and Practice** books 1A–5D | 3–6 sample pages per book plus printables | Puzzles appear as named practice sections inside chapters; about a third of the Puzzles-book types started out here ("Find more in Practice book 4C") |
| **Beast Academy Online: Puzzle Lab** | Only the help centre | It's one of BA Online's three main areas. It has 17 puzzle types, each with up to 10 sets of up to 8 puzzles. It unlocks at XP level 10, and students get unlimited tries. **The type names aren't public.** |
| **BA Online lessons** | No | Interactive puzzles inside lessons. The Puzzles books point to BA Online for more Spiral Galaxies, Shikaku, Fillominoes, Fence 'Em In, Connect the Critters, Abstract Art and skip-counting puzzles |
| **Daily Puzzles** (beastacademy.com/puzzles/daily) | Yes, free | Five daily games: All Ten, Scurry, Clueless, Folds and Honeycombs. The site's public code also holds Sumtiles, Productiles and Roly-Poly |
| **Playground** (beastacademy.com/playground) | Yes, free | Tabletop games for two players (Nim, Sim, Sprouts, Fifteen…), not solo logic puzzles; out of scope |

There are **no separate AoPS puzzle books** beyond Puzzles 1–5. The AoPS store sells the same
five books.

## Summary table

Key to "Rules": **C** = confirmed from a free BA sample or printable; **P** = partly confirmed
(the sample shows the set-up, not the full rules); **I** = inferred from the name, the topic and
the cover art in the contents PDF. Treat **I** rows as guesses until someone looks inside.

Key to "Engine": **Have**: we already have the genre. **Express**: existing blocks can express
it; at most a label or style is needed. **Block**: one new rule block (small). **New**: new
geometry, a new mark or a new kind of answer (bigger). **Out**: not a grid logic puzzle with
one answer.

| BA name | Standard name | Book / chapter | Rules | Grid, one answer? | Engine |
|---|---|---|---|---|---|
| Number Paths | (path-tracing; nearest: Hidato) | P1 ch1; Practice 2A | C | grid, trivial logic | Block |
| Polyominoes | Polyomino packing | P1 ch2; 1A, 3A | I | grid packing | Express (shape-bank) |
| Sumdoku | Killer Sudoku without boxes / addition-only Calcudoku | P1 ch4 | I | yes | Block (cage sums) |
| Deka Dots | (BA's own) | P1 ch4 | C | yes | New (digit 0, corner sums) |
| Difference Pyramids | Number pyramid | P1 ch5 | I | triangle, not grid | Out / New |
| Greater Than Sudoku | Futoshiki or Greater Than Sudoku | P1 ch8; 1C | I | yes | Block (digit compare) |
| Ordered Paths | (path-tracing) | P1 ch8; 1C | I | grid | Block (as Number Paths) |
| Skip-Counting Crosswords | Fill-in / Cross Number | P1 ch9 | I | fill-in | Out |
| Magic SUMmer | Magic-square family | P1 ch10 | I | small grid | Block (line sums) |
| Digit Differences | (BA's own) | P1 ch10 | I | unknown | ? |
| Shape Connect | (BA's own) | P1 ch11; 1D | P | measuring | Out |
| Turn Mazes | Simple Path with turn arrows | P1 ch12 (new) | C | yes | Block (turns) |
| Honeycomb Paths | Hidato on hexagons | P2 ch2; 1D, 2C; Daily "Honeycombs" | C | yes | New (hex grid) + Block |
| Sum Blobs | (BA's own; region division by sum) | P2 ch3 | C | yes | Block (region sum) |
| Subtractiles | (BA's own) | P2 ch4 | I | unknown | ? |
| X-Outs | Hitori-like crossing-out with sums | P2 ch4; Practice 2B | C | yes | Block (line sums of unshaded) |
| Expression Search | Number search | P2 ch5 | I | word-search style | Out |
| Mismo | (BA's own) | P2 ch5; Practice 2B | I | unknown | ? |
| Sym-Sums | (BA's own) | P2 ch6 | I | unknown | ? |
| Measure Mazes | (BA's own) | P2 ch7; Practice 2C | C | path on a drawing | Out |
| Equation Paths | (BA's own) | P2 ch8; Practice 2C | P | grid path | Block (path value) |
| 8s and 9s | (BA's own) | P2 ch9; Practice 2C | I | unknown | ? |
| Numbercross | Fill-in (numbers from words) | P2 ch10 | C | fill-in | Out (new answer kind) |
| Cross Sums | Addition cryptarithm (not Kakuro) | P2 ch11 | I | arithmetic | Out |
| Angle Mazes | (BA's own) | P3 ch1; Practice 3A | C | path on dots | New (geometry) |
| Connect the Critters | unknown (has cut-outs) | P3 ch1; BA Online | I | spatial | ? |
| Skip-Counting Paths | (path-tracing) | P3 ch2 | I | grid path | Block |
| Fence 'Em In | unknown (perimeter and area) | P3 ch3; BA Online | I | likely region division | Block? |
| Fillominoes | Fillomino (BA variant) | P3 ch3; BA Online | C | yes | Express (standard) / Block (BA's) |
| Times Out | X-Outs with products | P3 ch4; Practice 4B | I | yes | Block |
| Product Squares | Magic-square family (products) | P3 ch4; Practice 5D | C (5D) | yes | Block (line products) |
| Arranging Squares | Square packing | P3 ch5; Practice 3B | C | packing | Express (shape-bank, squares) |
| Circle Sums | (BA's own) | P3 ch7 | I | unknown | ? |
| Fraction Link | Numberlink with equal values | P3 ch10; Practice 3D | C | yes | Block (labelled links) |
| Abstract Art | Shading with line counts | P3 ch10; BA Online | C | yes | Express (line-totals) |
| Shikaku | Shikaku | P3 ch12; BA Online | known genre | yes | **Have** |
| Dot Puzzles | (BA's own) | P4 ch1 (new) | C | geometry on dots | Out |
| Spiral Galaxies | Spiral Galaxies | P4 ch1; BA Online | known genre | yes | **Have** |
| Product Placement | unknown | P4 ch2; Practice 4A | I | unknown | ? |
| Pyramid Descent | (BA's own) | P4 ch3/7; Practice 4A | C | triangle path | Out / New |
| Dutch Loop | Dutch Loop (classic) | P4 ch6 | I (genre known) | yes | Block (turns) |
| Hive | Suguru/Tectonic on hexagons (from memory) | P4 ch6; Practice 4B; 5A | I | yes | New (hex grid) + Block |
| Factor Cave | Cave with product clues | P4 ch7 (new) | C | yes | Block (sight product) |
| Factor Blobs | Sum Blobs with products | P4 ch7; Practice 4C | I | yes | Block (region product) |
| Fraction Sumdoku | Killer-style cages with fractions | P4 ch8 (new) | I | yes | Block + fraction digits |
| Sum Squares | Magic-square family | P4 ch9; Practice 4C | C | yes | New (signs) |
| Paint the Town | "Fraction Fill" (Practice 4D) | P4 ch10 | I | likely shading | ? |
| Decimal Numbercross | Fill-in with decimals | P4 ch11 (new) | I | fill-in | Out |
| Integer Tiles | (BA's own) | P5 ch2 (new) | I | unknown | ? |
| Like Terms Corrals | Region division, like terms | P5 ch3; Practice 5A | I | likely region division | Block? |
| Averatiles | (BA's own) | P5 ch4; Practice 5B | P | tiling of shapes | New (figure) |
| F&M Grids | (BA's own) | P5 ch5 (new) | I | unknown | ? |
| Shikaku Fractions | Shikaku with fraction clues | P5 ch6 | I | yes | Express (labelled size-clue) |
| Cross-Sequences | Fill-in with arithmetic sequences | P5 ch7; Practice 5C | I | fill-in | Out / Block |
| Ratio Rooms | Rectangle division by colour ratio | P5 ch8 (new); Practice 5C "Rectivide" | P | yes | Block (region ratio) |
| Frac-Turns | (BA's own) | P5 ch9; Practice 5C | P | yes | New |
| Percent Squares | Magic-square family | P5 ch10; Practice 5D | C | yes | Block (shaded share) |
| Equivalink | Numberlink with equal values | P5 ch10 | I (by name) | yes | Block (labelled links) |
| Pythagorean Paths | Dot-to-dot with lengths | P5 ch11; Practice 5D | C | yes | New (segment geometry) |
| Prime Power Grids | unknown | P5 ch12 (new) | I | unknown | ? |

Practice-book puzzles not in the Puzzles books (from free samples and printables):

| BA name | Standard name | Where | Rules | Engine |
|---|---|---|---|---|
| Sum Grid | Line-sum fill-in | 1C ch7 | P | Block (line sums) |
| Triangle Connect | (BA's own) | 1D | C | Out (measuring) |
| Fly Catcher | Ordering logic | 1D | C | Out |
| Leaf Drops | Ordering logic | 1D | C | Out |
| Number Search | Number search | 2A | C | Out |
| Three-Four | Fact families | 2B | C | Out |
| SumBox | Arrangement (BA's own) | 2B ch6 | C | Out (not a grid) |
| Length Links | Numberlink by length | 2C ch7 | P | Block (labelled links) |
| Dot Trace | One-stroke drawing (Euler path) | 2C ch9 | C | Out (needs a drawing) |
| Cryptarithms | Cryptarithm | 2D ch11 | C | Out |
| Taxi Paths, Checkerboard Paths | Path counting | 2D ch12 | C | Out (counting, open) |
| Angle Mazes | see above | 3A ch1 | C | New |
| Short Circuit | Numberlink with expressions and walls | 3D | C | Block (labelled links) |
| Fragment Puzzles | Dissection | 3D ch12 | C | Out |
| Square Dissections, Tangrams | Dissection | 3B, 3D | C | Out (open-ended) |
| Sudoku (4×4) | Sudoku | 4B ch6 | C | **Have** |
| Minesweeper | Minesweeper | 4B ch6 | C | **Have** |
| Cross Number Puzzles | Cross Math (row and column equations) | 2A, 4C, 4D, 5A | P | New (equation grid) |
| Maze Escape | Maze | 4C ch8 | I | ? |
| Decimal Path Puzzles | Number Paths on hexagons | 4D ch11 | C | New (hex grid) |
| Block Mountains | Number pyramid (products) | 5A ch2 | C | Out (computation) |
| Like Terms Link | Numberlink with like terms | 5A ch3 | C | Block (labelled links) |
| Rectivide | see Ratio Rooms | 5C ch8 | C | Block |
| GCF/LCM Webs | unknown | 5B | I | ? |

Daily Puzzles (free, public):

| BA name | What it is (from its own one-line instructions) | Engine |
|---|---|---|
| Honeycombs | Number the hexagons so the numbers run 1–10 along one connected path: Hidato on hexagons | New (hex grid) + Block |
| All Ten | Use four given numbers once each, with operations, to make every target from 1 to 10 | Out (arithmetic) |
| Scurry | Place bugs; each placed bug pushes its neighbours one square away; fill the target squares | Out (moves, not a fixed answer) |
| Folds | Fold coloured triangles across grid lines to match a target pattern | Out (moves) |
| Clueless | Fill six crossing words with no clues | Out (word puzzle) |
| Sumtiles / Productiles (in the code) | Slide tiles until each row's and column's sum (product) hits its target, in few moves | Out (sliding) |
| Roly-Poly (in the code) | Tilt to slide all bugs at once until they stop; get them onto targets | Out (sliding) |

## Per-type notes

### Puzzles 1 (grade 1)

- **Number Paths** (C, 14 pp.). A grid of numbers; trace the one path through every square that
  visits the numbers from least to greatest, moving up, down, left or right. Trains counting and
  ordering within 100. All the numbers are given, so it's an ordering exercise more than a deduction.
  It could be a Simple Path with the order given, or (better) a Hidato/Numbrix where some numbers
  are missing.
- **Polyominoes** (I, 14 pp.). Shapes and spatial reasoning; BA prints polyomino cut-outs. Most likely
  "fit these pieces into this outline". The `shape-bank` block (regions are bank shapes) covers it
  if every piece is used exactly once; that needs a count per bank shape.
- **Sumdoku** (I, 14 pp.). Adding small numbers. By name and by Fraction Sumdoku in P4, it's a
  Latin square divided into cages, each cage showing the sum of its digits: Calcudoku with addition
  only (Killer Sudoku without boxes). Needs the planned cages-and-sums block.
- **Deka Dots** (C, 14 pp.). Fill boxes with single digits 0–9 so the boxes around each dot add up to 10, and
  boxes that share a side never hold the same digit. Trains making ten. Boxes may not form a full
  grid. Needs digit 0, a corner-sum block, and a no-repeat-neighbour block.
- **Difference Pyramids** (I, 12 pp.). Subtraction. Probably a number pyramid where each block is
  the difference of the two under it (cf. Block Mountains in 5A, which uses products). Mostly
  computation; triangular layout.
- **Greater Than Sudoku** (I, 12 pp.). Comparing with < and >. A small Latin square (maybe with
  boxes) with inequality signs between neighbours. Futoshiki if there are no boxes; Greater Than
  Sudoku if there are. Our `inequality` given exists but only `size-compare` reads it; a
  `digit-compare` block on it is small.
- **Ordered Paths** (I, 10 pp.). Ordering within 100: by the name, Number Paths with harder numbers.
- **Skip-Counting Crosswords** (I, 12 pp.). A crossword filled with skip-counting sequences. Fill-in.
- **Magic SUMmer** (I, 14 pp.). Adding larger numbers; probably a magic-square-style arrangement.
- **Digit Differences** (I, 14 pp.). Subtraction within 100. Rules not public.
- **Shape Connect** (P, 12 pp.). Measuring with a ruler (1D's Triangle Connect: pick lines on a drawing
  that make a shape with the given side lengths). Physical measuring; out of scope.
- **Turn Mazes** (C, 13 pp.). Trace a path from the start dot to the finish square through every empty
  square once; marked squares force a right (or left) turn, relative to the direction you enter;
  unmarked squares allow anything. This is our Simple Path (`path` with `cover`) plus a turn-marker
  block. One block also gives Dutch Loop (P4).

### Puzzles 2 (grade 2)

- **Honeycomb Paths** (C, 14 pp.; also 1D, 2C and the free daily "Honeycombs"). Fill empty hexagons
  so consecutive numbers touch and form one path across every hexagon: **Hidato on a hex grid**.
  Trains counting and ordering. BA uses it at three levels and as a daily game. Needs hex geometry
  and a consecutive-path block.
- **Sum Blobs** (C, 14 pp.). A grid of numbers; divide all of it into connected blobs (edge-connected,
  no overlap) whose numbers each add up to the target. Trains adding several numbers. Fits our
  regions mark; needs a `region-sum` block over the cells' printed numbers.
- **Subtractiles** (I, 12 pp.). Subtraction. The contents art shows a target sum and number tiles;
  rules not public.
- **X-Outs** (C, 16 pp.; printable for 2B ch4). Cross out numbers so each row and column's remaining
  numbers add up to the target. A shading puzzle: Hitori-like, but with a sum instead of
  no-repeats. Needs a block "unshaded cells in each line sum to N" (plus a uniqueness check;
  BA's may allow several answers).
- **Expression Search** (I, 10 pp.). Like 2A's Number Search: circle expressions in a strip or grid that
  meet a condition. Out.
- **Mismo** (I, 10 pp.; printable 2B ch5). Writing and evaluating expressions. Rules not public.
- **Sym-Sums** (I, 10 pp.). Guess-and-check. Rules not public; the name suggests symmetric
  sums.
- **Measure Mazes** (C, 12 pp.). Trace a path along given lines through every point so the
  distances between dots match a given list in order. Measuring; it's a drawing, not a grid.
- **Equation Paths** (P, 12 pp.). Trace a path through a grid of signed numbers (+10, +2…) that
  never revisits a square and adds up to a target. Grid path plus a "path total" block.
- **8s and 9s** (I, 10 pp.). Adding odds and evens. Rules not public.
- **Numbercross** (C, 14 pp.). Numbers given in words; write them in digits into a crossing grid
  (across or down) so all fit. A fill-in; needs a "word list" answer kind. Out for now.
- **Cross Sums** (I, 13 pp.). The standard addition algorithm. Despite the name, the contents art
  suggests crossing column additions with missing digits, not Kakuro. Out.

### Puzzles 3 (grade 3)

- **Angle Mazes** (C, 10 pp.). Trace a path from start to finish that makes only acute (or only obtuse) angles
  at the dots. Needs a dot-and-segment geometry; skip.
- **Connect the Critters** (I, 14 pp.). Spatial reasoning, with cut-outs, and more in BA Online.
  Rules not public.
- **Skip-Counting Paths** (I, 12 pp.). A path through a grid following a skip-counting sequence. Grid
  path with a sequence rule.
- **Fence 'Em In** (I, 14 pp.). Perimeter and area, with more in BA Online. Likely fencing regions of a
  given area or perimeter: region division with size and perimeter clues. A perimeter block would
  be new.
- **Fillominoes** (C, 14 pp.; BA Online). BA's variant: fill the grid with polyominoes, each numbered with its
  area, with **exactly one polyomino of each listed area**. Standard Fillomino (same-size pieces
  can't share an edge) is expressible now with `regions` + `size-clue` + `neighbors-differ-size`;
  BA's variant needs a "sizes from this list, once each" block. Trains area.
- **Times Out** (I, 12 pp.). Adapted from 4B; by name, X-Outs with products. Same block as X-Outs
  with a product setting.
- **Product Squares** (C from 5D, 10 pp.). Fill a 3×3 so each row and column multiplies to the given
  product (5D uses powers). Needs line-product clues on digits.
- **Arranging Squares** (C, 18 pp.; printable 3B). Cover a grid exactly with a listed set of squares
  (two 3×3, one 5×5…). `shape-bank` plus counts. Trains perfect squares and area.
- **Circle Sums** (I, 12 pp.). Variables and expressions. Rules not public.
- **Fraction Link** (C, 12 pp.; Practice 3D). Connect each pair of equal values (a fraction and its
  equal) with a path; one path per square. **Numberlink where pairs match by value, not by
  identical label.** The same mechanic is Like Terms Link (5A), Length Links (2C), Short Circuit
  (3D) and, by name, Equivalink (P5). It's our `links` block with a display label on each end.
- **Abstract Art** (C, 14 pp.; BA Online). Shade squares so each row and column has the shaded fraction
  shown beside it. Our `line-totals` block with the totals written as fractions: a display
  change.
- **Shikaku** (15 pp.; BA Online). Standard Shikaku. **We have it.**

### Puzzles 4 (grade 4)

- **Dot Puzzles** (C, 16 pp.). Use the given points as corners of the named quadrilaterals; each point is
  a corner of at most one. Geometry; out.
- **Spiral Galaxies** (12 pp.; BA Online). Symmetry. **We have it.**
- **Product Placement** (I, 12 pp.). Multiplication; rules not public.
- **Pyramid Descent** (C, 10 pp.; Practice 4A). Find a path down a pyramid, one square per row, touching
  squares, whose product is the target. Exponents and factoring. Triangular, mostly search;
  low fit.
- **Dutch Loop** (I, 12 pp.). BA marks it a "classic puzzle": in the usual rules, one loop through
  every cell, going straight through white circles and turning on black ones. Simple Loop plus the
  turn-marker block that Turn Mazes needs.
- **Hive** (I, 14 pp.; printables 4B, 5A). Logic. From memory, unconfirmed: hexagons in outlined groups,
  each group of n holding 1..n, touching hexagons never equal: Suguru/Tectonic on hexagons. Needs hex
  geometry.
- **Factor Cave** (C, 14 pp.). Our Cave, but each clue is the product of how many cells it sees in its
  row and how many in its column (itself counted in both). A `sight` setting (`product`) is small.
  Strong pick.
- **Factor Blobs** (I, 12 pp.). By name and pairing with Sum Blobs: divide into blobs by product. Same
  block as Sum Blobs with a product setting.
- **Fraction Sumdoku** (I, 16 pp.). Adding fractions; Sumdoku with fraction sums. Needs cages plus
  fraction display.
- **Sum Squares** (C, 12 pp.; Practice 4C). Place 1–9 once each in a 3×3, some made negative, so rows and
  columns have the given sums. Needs signs; low fit.
- **Paint the Town** (I, 14 pp.). An adaptation of 4D's "Fraction Fill". Rules not public.
- **Decimal Numbercross** (I, 15 pp.). Numbercross with decimals. Out.

### Puzzles 5 (grade 5)

- **Integer Tiles** (I, 14 pp.). Adding and multiplying integers. Rules not public.
- **Like Terms Corrals** (I, 12 pp.). Combining like terms. "Corrals" suggests fencing like terms into
  regions; region division with a matching rule.
- **Averatiles** (P, 12 pp.; Practice 5B). Shapes (squares and triangles) take digits; a number is the
  average of the shapes around it, and touching shapes differ. Needs a figure of pieces like
  Three Coats', with digits.
- **F&M Grids** (I, 14 pp.). Factors and multiples; rules not public.
- **Shikaku Fractions** (I, 16 pp.). Shikaku whose clues are fractions of the whole board. Our Shikaku
  with a clue label (the size is the fraction times the area).
- **Cross-Sequences** (I, 12 pp.). Crossing arithmetic sequences to complete. Fill-in.
- **Ratio Rooms** (P, 14 pp.). Like 5C's Rectivide (divide a rectangle into three rectangles, each with
  the same ratio of grey to white squares as the whole). Fits `rectangles` + a new "grey:white
  ratio per region" block.
- **Frac-Turns** (P, 12 pp.; 5C). Place digits 0–9 on a grid so each fraction's path traces its decimal
  digits. Bespoke; low fit.
- **Percent Squares** (C, 12 pp.; Practice 5D). Each square takes one digit 1–9; the percent beside a row or column says
  what share of that line's sum lies in its shaded squares. Digits plus a "shaded share" line
  block.
- **Equivalink** (I, 18 pp.). Fractions, decimals and percents; by name the Fraction Link mechanic.
- **Pythagorean Paths** (C, 14 pp.). Join every dot of a grid into one path whose segment lengths
  (√5, √13…) come in the given order; segments never overlap or pass through dots. Needs a
  segment geometry.
- **Prime Power Grids** (I, 13 pp.). Prime factorization; rules not public.

## What the site already has

From `src/games/` and `app/app/games/kinds.ts`: Akari, Aquarium, Cave, Easy as ABC, Hitori, Irregular
Sudoku, Masyu, Minesweeper, Nonogram, Numberlink, Nurikabe, Number Line Maze, Panel, Panes,
Shikaku, Simple Loop, Simple Path, Skyscrapers, Slitherlink, Spiral Galaxies, Square Jam, Star
Battle, Sudoku, Thermo Sudoku, Three Coats, Wittgenstein Briquet.

Direct matches with BA: **Shikaku, Spiral Galaxies, Sudoku (4×4), Minesweeper**. Near misses:
Cave (Factor Cave), Numberlink (the Link family), Simple Path and Simple Loop (Turn Mazes, Dutch
Loop), Nonogram and Aquarium line totals (Abstract Art), Panes' region rules (Fillomino, Blobs,
Arranging Squares).

Several genres the brief expected are **not** in BA's public material: no KenKen/Calcudoku by that
name (Sumdoku is the nearest), no Kakuro (BA's "Cross Sums" is something else), and no Nurikabe,
Slitherlink, Akari, Star Battle, Skyscrapers, Snake or Tetromino puzzles. Some may be in Puzzle Lab.

## What to build

Ranked by value for kids (BA uses it early or often; quick to grasp; good on a phone) against
effort. Each new genre also needs the editor, reader and guide work in CLAUDE.md.

1. **Labelled Numberlink** (Fraction Link, Equivalink, Like Terms Link, Length Links, Short
   Circuit). Five BA types share one mechanic, and it's grades 2–5. Work: a display label on a link
   end (fraction, expression or picture) with a match key; `links` matches by key. Small; the
   existing generator and player work unchanged.
2. **Factor Cave**. Cave with product clues: a `product` setting on `sight`, and a generator run.
   Small, and a strong times-table puzzle.
3. **Futoshiki / Greater Than Sudoku**. Latin square plus `<` between digits: a `digit-compare` block
   reading the existing `inequality` given. Small; grade 1 in BA, ideal for young kids. Use the
   standard names.
4. **Turn markers: Dutch Loop and a Turn Maze genre**. One block: a cell given that forces straight /
   turn (Dutch Loop) or left / right relative to travel (Turn Maze, on `path`). Small–medium;
   grade 1 and grade 4.
5. **Sumdoku / Killer cages**. Cages (areas) with a sum clue: the "sums and cages" block already
   on the engine's Next list. Medium. Opens Calcudoku (add operations), Killer Sudoku, Fraction
   Sumdoku (fraction display).
6. **Fillomino**. Standard Fillomino is expressible now (`regions` + `size-clue` +
   `neighbors-differ-size`). Only a genre preset, a guide and generator settings. Add BA's
   "listed sizes once each" later as a block. Small.
7. **Sum Blobs / Factor Blobs**. A `region-sum` (and product) block over printed cell numbers. Medium-small;
   grades 2 and 4.
8. **Hidato / Numbrix, then Honeycombs**. A consecutive-numbers path block on the square grid
   (Number Paths, Ordered Paths, Skip-Counting Paths); later hex geometry for Honeycomb Paths, Hive
   and Decimal Paths. The square version is medium; hex geometry is large but unlocks three or four BA
   types plus a daily game.
9. **Abstract Art**. Shading with fraction line totals: `line-totals` plus a fraction label.
   Small, but it overlaps Nonogram and Aquarium.
10. **X-Outs / Times Out**. A line-sum (product) block on unshaded printed numbers. Small–medium.

Skip: fill-ins (Numbercross, crosswords), drawings and measuring (Measure Mazes, Angle Mazes,
Pythagorean Paths, Dot Puzzles), pyramids, sliding and moving games (the daily Scurry, Folds,
Sumtiles), and open-ended or counting work (Taxi Paths, dissections).

## Sources

- Puzzles book pages: [Puzzles 1](https://beastacademy.com/books/puzzles1), [Puzzles 2](https://beastacademy.com/books/puzzles2), [Puzzles 3](https://beastacademy.com/books/puzzles3), [Puzzles 4](https://beastacademy.com/books/puzzles4), [Puzzles 5](https://beastacademy.com/books/puzzles5); AoPS store: [Beast 1 Puzzles](https://artofproblemsolving.com/store/book/beast-1-puzzles)
- Contents and curriculum tables (free PDFs): [P1](https://beastacademy.com/u/pdfs/puzzles1/samples/Puzzles1_ToC.pdf), [P2](https://beastacademy.com/u/pdfs/puzzles2/samples/Puzzles2_ToC.pdf), [P3](https://beastacademy.com/u/pdfs/puzzles3/samples/Puzzles3_ToC.pdf), [P4](https://beastacademy.com/u/pdfs/puzzles4/samples/Puzzles4_ToC.pdf), [P5](https://beastacademy.com/u/pdfs/puzzles5/samples/Introduction_ContentsUse.pdf)
- Sample sections (rules read, not copied): [Deka Dots](https://beastacademy.com/u/pdfs/puzzles1/samples/Puzzles1_DekaDots_ProblemsSolutions.pdf), [Turn Mazes](https://beastacademy.com/u/pdfs/puzzles1/samples/Puzzles1_TurnMazes_ProblemsSolutions.pdf), [Numbercross](https://beastacademy.com/u/pdfs/puzzles2/samples/Puzzles2_Numbercross_Problems.pdf), [Sum Blobs](https://beastacademy.com/u/pdfs/puzzles2/samples/Puzzles2_Sum_Blobs_Problems.pdf), [Fillominoes](https://beastacademy.com/u/pdfs/puzzles3/samples/Puzzles3_Fillominoes_Problems.pdf), [Abstract Art](https://beastacademy.com/u/pdfs/puzzles3/samples/Puzzles3_AbstractArt_Problems.pdf), [Dot Puzzles](https://beastacademy.com/u/pdfs/puzzles4/samples/Puzzles4_DotPuzzles_Problems.pdf), [Factor Cave](https://beastacademy.com/u/pdfs/puzzles4/samples/Puzzles4_FactorCave_Problems.pdf), [Pythagorean Paths](https://beastacademy.com/u/pdfs/puzzles5/samples/PythagoreanPaths_ProblemsSolutions.pdf)
- Guide and Practice book pages with samples and printables, e.g. [1B](https://beastacademy.com/books/1B), [2B](https://beastacademy.com/books/2B), [3D](https://beastacademy.com/books/3D), [4B](https://beastacademy.com/books/4B), [5A](https://beastacademy.com/books/5A). Practice samples used: 1C pp. 64–67 (Sum Grid), 1D pp. 24–27 (Honeycomb Path), 1D pp. 108–111 (Triangle Connect), 1D pp. 184–187 (Fly Catcher, Leaf Drops), 2A pp. 14–17 and 54–57 (Number Search, Number Paths), 2B pp. 96–99 (SumBox), 2C pp. 16–17 (Measure-Mazes), 2C pp. 52–55 (Equation Paths), 3D pp. 7–10 (Fraction Link), 3D pp. 53–56 (Short Circuit), 4A pp. 81–84 (Pyramid Descent), 4B pp. 76–79 (Sudoku), 4C pp. 84–87 (Sum Squares), 5A pp. 46–49 (Block Mountains), 5A pp. 74–77 (Like Terms Link), 5B pp. 14–17 (Averatile), 5C pp. 46–49 (Rectivide), 5D pp. 18–20 (Percent Squares), 5D pp. 70–73 (Product Squares); printables X-Outs, Angle Mazes, Arranging Squares, Minesweeper, Decimal Path Puzzles, Like Terms Link, Frac-Turn, Dot Trace, Taxi Paths, Checkerboard Paths, Cryptarithms (all under `beastacademy.com/u/pdfs/<book>/printables/`)
- BA Online: [overview](https://beastacademy.com/online) (interactive puzzles by Palmer Mebane, in lessons and the Puzzle Lab); help centre: [navigating](https://help.beastacademy.com/a/1798920-navigating-beast-academy-online), [solutions and Puzzle Lab](https://help.beastacademy.com/a/1890360-how-to-find-solutions-to-beast-academy-online-problems), [manual locks](https://help.beastacademy.com/a/1861857), [locks overview](https://help.beastacademy.com/a/1818660)
- [Daily Puzzles](https://beastacademy.com/puzzles/daily) (names and one-line instructions from its public page code); [Playground](https://beastacademy.com/playground)
- Dutch Loop as a known genre: [GMPuzzles, Dutch Loop (Hex, Tricolor)](https://www.gmpuzzles.com/blog/2021/06/dutch-loop-hex-tricolor-by-bryce-herdt/)

## Puzzle Lab, seen from the parent view (October 2026)

Read from a parent account's Puzzle Lab report, where each puzzle opens with its problem and
solution. Rules are in our own words, worked out from one or two puzzles each; nothing was copied.
"Fit" says how our engine would take it.

| Puzzle Lab type | What it is | Standard name | Fit |
|---|---|---|---|
| Honeycomb Paths | Fill a honeycomb with 1 to N so each number touches the next: one path through every cell. | Hidato on hexagons | Needs a hex grid; the path rule exists (numbered path). |
| Sum Blobs | Split a grid of numbers into connected blobs, each adding up to the target. | (sum-target division) | Region division with a sum rule: small new rule. |
| Ice Rinks | A puck slides until it hits a wall; reach the star in the fewest moves. | Ricochet Robots-style | Not a grid logic puzzle (move planning). |
| Polyominoes | Tile a shape exactly with a given set of pieces. | Polyomino packing | Region division with a shape bank (Glimmith's Shape Bank, used once each). |
| Connect the Critters | Place the given pieces so they cover every critter and join into one connected group. | — | Placement with a connectivity rule: new. |
| Abstract Art | Colour the cells so each row and column has the stated fraction of each colour. | Takuzu / Binairo-like, with fractions | Count-per-line rule exists (shaded-per-line); colours beyond two are new. |
| Fillominoes | Fillomino, with only some region sizes allowed (e.g. only 4s and 6s). | Fillomino | Region size rules exist; add an allowed-sizes setting. |
| Remove A Block | Take away one square so the shape has the asked-for symmetry. | — | Not a grid logic puzzle (one-move insight). |
| Find The Cut Line | Cut a shape into two pieces, each with the asked-for symmetry. | Symmetry dissection | Region division with a symmetric-region rule: new (galaxies have a related rule). |
| Spiral Galaxies | Standard. | Spiral Galaxies | Have it. |
| Numbercross | Place the listed numbers into the grid's across and down slots. | Number fill-in | New (word-list placement). |
| Hive | Every hexagon holds the smallest positive number that none of its neighbours has, so touching hexagons never match (confirmed: BA's 4B printable, HivePuzzles.pdf, and a Well-Trained Mind thread). | (mex hive) | Hex grid plus a mex rule: being built with Hex Hidato. |
| Laser Mazes | Push boxes so the cat can reach the milk. | Sokoban-like | Not a grid logic puzzle (moves). |
| Akari | Standard; "Cipher" sets give clue letters standing for different numbers to work out. | Akari | Have it; ciphers would be a new clue option. |
| Twins and Triplets | Monsters have two features (head and shirt colour), every combination once; place them all so side-by-side monsters share a feature. Inferred from two puzzles, not a stated rule. | — | Tile placement with an adjacency rule: being built under a name of ours. |
| Fracturns | Digits and decimal points in a small grid; each fraction clue seems to be read as a decimal along a line that the arrows turn, with loops giving repeating decimals (⅓ = 0.333…). One clue didn't fit this reading. | — | Unconfirmed; not built. |
| Pythagorean Paths | Join the dots into one path whose segment lengths are the listed values (√2, √8, …); sets limit moves like chess pieces. | — | New (lattice geometry). |

What this adds to the shortlist: **Fillomino with allowed sizes**, **Sum Blobs** and **Abstract Art**
are close to rules we have; **Hidato on hexagons** (Honeycomb Paths) needs a hex grid, which would
also open Hive.

## What we couldn't confirm

- **Puzzle Lab**: now seen (above); only Fracturns is still unconfirmed (no public description found).
  Before that: it has 17 types, up to 10 sets of up to 8 puzzles each, and unlocks at XP level 10. The Puzzles books'
  "find more in BA Online" notes suggest Spiral Galaxies, Shikaku, Fillomino, Fence 'Em In,
  Connect the Critters, Abstract Art and a skip-counting type, but that's inference.
- **Puzzles inside BA Online lessons**: nothing public beyond "interactive puzzles in lessons".
- **Rules of about 20 book types** marked I or ?: Polyominoes, Sumdoku, Difference Pyramids, Greater
  Than Sudoku, Ordered Paths, Skip-Counting Crosswords, Magic SUMmer, Digit Differences, Subtractiles,
  Expression Search, Mismo, Sym-Sums, 8s and 9s, Cross Sums, Connect the Critters, Skip-Counting
  Paths, Fence 'Em In, Times Out, Circle Sums, Product Placement, Dutch Loop (BA's version), Hive,
  Factor Blobs, Fraction Sumdoku, Paint the Town, Decimal Numbercross, Integer Tiles, Like Terms
  Corrals, F&M Grids, Shikaku Fractions, Cross-Sequences, Equivalink, Prime Power Grids. The Hive
  rule above is from memory, not a source.
- **Uniqueness**: BA's puzzles are generally written to have one answer, but some (X-Outs, Equation
  Paths, Dot Puzzles) may accept several; only the books' solutions would tell.
- **Frequency** is estimated from page counts in the contents (10–18 pages per type, about 30–50
  puzzles); there was nothing public on how many Practice-book problems use each type.
- No Reddit, forum or YouTube source added anything beyond the type names; searches found none
  that described the rules.

A logged-in look (a BA Online account at level 4–5, plus the five Puzzles books) would settle the
I and ? rows, name the 17 Puzzle Lab types, and show which of them are Mebane's classic genres.
