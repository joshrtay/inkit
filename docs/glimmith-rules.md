# The Artisan of Glimmith: rules and our engine

Our `panes` genre is a region-division puzzle in the style of *The Artisan of Glimmith*. This page
lists the game's rule sets in our own words and maps each one to the engine's Panes rule blocks
(`src/engine/rules.ts`). Use it to decide what the engine needs next, and as a reference when
using Glimmith puzzles to evaluate AI puzzle design. It describes rules only and copies no puzzles.
(The local reference set is in `references/glimmith/`, which is gitignored.)

Every Glimmith puzzle asks the same thing: **split the board into regions** (by painting or by
drawing borders) so that every rule on the puzzle's scrolls holds. Each window (area) introduces
one rule, and its puzzles mix that rule with earlier ones. Colors are cosmetic.

## Board geometry (not rules, but it matters)

- **Irregular outlines and holes.** Many boards aren't rectangles: notches, missing corners, and
  holes in the middle (the wooden table shows through). Holes are not part of any region, and their
  edges count as region borders. In our format these are `block` cells, and the engine treats them
  so: they're in no region (checks and encoding agree), and the edge of a hole is a cut, so it acts
  as a border for `rectangles` and the like. (23 of the 40 Boxy puzzles have holes or walls.)
- **Given walls.** Some boards have border segments drawn in from the start; they must be region
  borders. Our `wall` given on a border is one: in a region puzzle it's always a cut, with
  different regions on either side. A walled-off box with a
  white inside is a region; one with the table showing through is a hole.

## Rule sets

"Exact" means the block already says the same thing. "Close" means it's nearly right, with the
difference given. "Missing" means it needs a new block.

| Glimmith rule | What it means | Our engine |
|---|---|---|
| **Boxy** | Every region is a rectangle. | **Exact:** `rectangles`. |
| **Non-Boxy** | No region is a rectangle (squares, straight lines and single cells count as rectangles, so every region has at least 3 cells). | **Exact:** `no-rectangles` (a region's bounding box is never exactly full). |
| **Precision (N)** | Every region has exactly N cells. | **Exact:** `size` with `is: N`. |
| **Minimum (N)** / **Maximum (N)** / **Range (N–M)** | Every region has at least N / at most N / between N and M cells. | **Exact:** `size` with `min` / `max`. |
| **Area Number** | A number in a cell is the size of its region. Regions without a number are allowed, and so are several equal numbers in one region. | **Exact:** `size-clue` on its own. Don't add `one-each`: Boxy + Area Number is *not* shikaku unless Solitude is there too. |
| **Solitude** | Each region holds exactly one symbol. Any clue in a cell counts: numbers, roses, compasses, palisade marks, polyomino marks. | **Exact:** `one-each` with `of: "any"` (every clue in a cell but a hole counts). `of: number` / `of: symbol` count one kind only. |
| **Rose Windows** | Each region holds one of every kind of rose (one red, one blue, …), for the kinds the puzzle uses. | **Exact:** `one-of-each`, each rose a `symbol` whose value is its color (with one kind of rose, `one-each` `of: symbol` says the same). |
| **Mismatch** | No two regions have the same shape (turned or flipped counts as the same). | **Exact:** `all-different`. It's slow on big boards in general (a 10×14 one ran out of memory), but with `rectangles` or `squares` the encoding compares sides only, which solves quickly. |
| **Match** | Every region has the same shape (turned or flipped is fine). | **Exact:** `all-same` (every region the same size, and the same shape as the first). |
| **Mingle Shape** | Regions that share a border have different shapes. | **Exact:** `neighbors-differ` (with `rectangles` or `squares`, shapes are compared by their sides, which is fast). |
| **Size Separation** | Regions that share a border have different sizes. | **Exact:** `neighbors-differ-size`. |
| **Gemini** (symbol on a border) | The two regions on either side are different regions with the same shape. | **Exact:** `twins` (◆ on the border). |
| **Delta** (symbol on a border) | The two regions on either side have different shapes. | **Exact:** `opposites` (◇ on the border). |
| **Polyomino** (clue in a cell) | Shows the exact shape of its region, turned or flipped. Unclued regions are free. | **Exact:** `region-shape`, with a `shape` clue in the cell (its cells from 0,0; a panel's `rotate` / `negative` don't apply). Encoded as the shape's placements over the cell. |
| **Shape Bank** | Every region is one of the shapes listed on the scroll, turned or flipped, each usable any number of times. | **Exact:** `shape-bank`, each shape a `bank` clue (`{at: "aside", kind: "bank", value: cells}`), drawn under the board. The glimmith-solver's "soft bank" is a solving aid (cells outside the bank's shapes are one region), not a rule, so it's left out. |
| **Palisade** (clue in a cell) | A diamond mark shows which of the cell's four sides are region borders, up to rotation: none, one, two at a corner, two opposite, three, or all four. The board's outline and holes count as borders. | **Exact:** `cell-borders`, with a `palisade` clue (`value` 0-4, `opposite` for two opposite sides). |
| **Compass** (clue in a cell) | Its numbers count the cells of its own region that lie north, east, south and west of it. A blank direction is free. | **Exact:** `compass`. |
| **Loopy** | No point where exactly three border lines meet (no T-junctions), counting the board's outline and the edges of holes, so a border can't end on the edge. The borders form closed loops, and the regions can be two-coloured. | **Exact:** `no-t-junctions`. |
| **Bricky** | No point where four border lines meet, counting the outline and holes (at a notch in the board, two inner borders can't both end at the corner). | **Exact:** `no-four-corners` with `outline: true`. Without it the block keeps Square Jam's meaning (four regions never meet at an inner point). |
| **Watchtower** (number on a grid point) | That many different regions touch the point. | **Exact:** `regions-at-corner`, with a `watchtower` clue on the corner (1-4). Holes and the outside aren't regions, so they don't count. |
| **Difference** (number on a border) | That border separates two regions whose sizes differ by exactly that number. | **Exact:** `size-difference`, with a `difference` clue on the border. |
| **Inequality** (arrow on a border) | That border separates two regions, and the sign reads like < or > between the two regions' sizes (the pointed end is the smaller region). | **Exact:** `size-compare`, with an `inequality` clue on the border whose first cell is on the smaller (pointed) side. |

**Totals:** all 22 rule sets map exactly. Holes and given walls are handled.

### Readings where the sources leave room

The rule scrolls are short, so a few details follow the glimmith-solver's code (`solver.py`):

- **Loopy and Bricky at holes and the outline.** Lines are counted at every grid point, the outline's
  included: a stretch between two cells is a line when it's a border, a stretch between a cell and a
  hole (or the outside) always is, and a stretch between two holes never is. A point whose lines are
  all fixed by the board's shape (two cells meeting only diagonally between holes) is left alone,
  as in the solver, which has nothing to choose there. So Bricky allows a point where two holes meet
  diagonally; Square Jam's `no-four-corners` (without `outline`) doesn't.
- **Watchtower** counts the regions of the cells around the point that are on the board: one to four.
- **Solitude** counts clues in cells. Clues on borders and corners (◆, differences, signs,
  watchtowers) sit between regions and aren't in one. (The solver's bound on the number of regions
  counts every symbol, borders' too, which would let some regions have no clue; we take the scroll's
  "exactly one" at its word.)
- **Difference 0** is allowed: two different regions of the same size.
- **Polyomino and Shape Bank** shapes may be turned and flipped (all eight orientations, as in the solver).

## Windows

In the walkthroughs' order: Glimmith Bridge and Glimmith Overlook (the opening windows), Rose
Windows, Gemini & Delta, Shape Bank, Precision, Polyomino, Mingle Shape, Forest Trailhead
(also called Forest Entrance; it mixes the earlier rules), Area Number, Palisade, Match, Mismatch,
Range (with Minimum and Maximum), Solitude, Size Separation, Boxy, Non-Boxy, Castle Gate, Bricky,
Loopy, Inequality, Difference, Watchtower, Hedge Maze, Compass, Spiral Island, and Secluded Garden
(the extra crimson-plinth puzzles). The windows named after places (Castle Gate, Hedge Maze, Spiral
Island and the rest) combine rules from the other windows. I didn't confirm whether any of them
introduces a new rule.

## Notes for transcribing

- The rule scrolls are printed beside every puzzle, so a screenshot carries its own rules. The
  sketch reader picks them up well, but it maps them to blocks loosely. It used shikaku for
  Boxy + Area Number, "opposites" with no clues as a stand-in for Mingle Shape, `one-each` for
  multi-color Rose Windows, and made-up settings (`of: "each"`, `of: "shape"`, `ma: 4`) that the
  parser accepted without complaint. Now the parser turns away settings a rule doesn't take, and
  the reader is told the Glimmith mapping and to name a rule it can't express in a note instead.
- Palisade marks are small. A mark with three sides drawn (a U) is easy to misread as two (a ^),
  so look closely.
- A Polyomino mark's squares are drawn smaller when there are more of them, so a 1×4 can look like
  a 1×3.

## Sources

- In-game rule scrolls, read from walkthrough screenshots: [yekbot, Boxy walkthrough](https://www.yekbot.com/the-artisan-of-glimmith-boxy-walkthrough/) and [camzillasmom, Boxy window solutions](https://camzillasmom.com/the-artisan-of-glimmith-boxy-window-puzzle-solutions/).
- Window list: [yekbot, Walkthrough Guide](https://www.yekbot.com/the-artisan-of-glimmith-walkthrough-guide/).
- Rule wording for Precision, Minimum, Range, Polyomino, Palisade, Gemini, Delta, Mismatch, Rose Windows, Solitude and Compass: [9Puz, Artisan of Glimmith walkthrough](https://9puz.com/2382-artisan-of-glimmith-walkthrough/).
- Window introductions for Range, Size Separation, Match, Mismatch and Solitude: [camzillasmom](https://camzillasmom.com/?s=glimmith).
- Exact semantics of Loopy, Bricky, Watchtower, Difference, Inequality, Non-Boxy, Match, Size Separation, Polyomino, Palisade and the shape and soft banks: the encoding in [ham883/glimmith-solver](https://github.com/ham883/glimmith-solver) (MIT), `solver.py`.
- Loopy as "never make a T": [Steam discussion](https://steamcommunity.com/app/4160210/discussions/0/796716542888934780/).
