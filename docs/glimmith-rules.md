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
  edges count as region borders. In our format these are `block` cells. **Gap:** the Panes
  encoding (`src/engine/encode.ts`, `open(I) :- cell(I).` when the mark is `regions`) puts blocked
  cells into regions, while the checks (`regionsOf` in `derive.ts`) leave them out, so `solve()`
  either fails with "solver and checks disagree" or finds wrong answers. 23 of the 40 Boxy puzzles
  have holes or walls. The fix (tested locally) is
  `open(I) :- cell(I), not blocked(I).`, `conn(I,J) :- adj(I,J,L), not cut(L), open(I), open(J).`,
  and `cut(L) :- adj(I,J,L), blocked(I).`, so the edge of a hole acts as a border for `rectangles`.
- **Given walls.** Some boards have border segments drawn in from the start; they must be region
  borders. Our `wall` given on a border exists, but for Panes nothing makes it a cut. **Gap:** add
  `:- wall(L), not cut(L).`, and have the checks treat a wall as a border. A walled-off box with a
  white inside is a region; one with the table showing through is a hole.

## Rule sets

"Exact" means the block already says the same thing. "Close" means it's nearly right, with the
difference given. "Missing" means it needs a new block.

| Glimmith rule | What it means | Our engine |
|---|---|---|
| **Boxy** | Every region is a rectangle. | **Exact:** `rectangles`. |
| **Non-Boxy** | No region is a rectangle (so every region has at least 3 cells). | **Missing:** a `no-rectangles` block (the negation of `rectangles`: some 2×2 corner pattern inside each region, or no region's bounding box is full). |
| **Precision (N)** | Every region has exactly N cells. | **Exact:** `size` with `is: N`. |
| **Minimum (N)** / **Maximum (N)** / **Range (N–M)** | Every region has at least N / at most N / between N and M cells. | **Exact:** `size` with `min` / `max`. |
| **Area Number** | A number in a cell is the size of its region. Regions without a number are allowed, and so are several equal numbers in one region. | **Exact:** `size-clue` on its own. Don't add `one-each`: Boxy + Area Number is *not* shikaku unless Solitude is there too. |
| **Solitude** | Each region holds exactly one symbol (newer versions of the game say "exactly one"). Any clue counts: numbers, roses, palisade marks, polyomino marks. | **Close:** `one-each` (`of: number` or `of: symbol`) counts one kind of given. That's exact when all the clues are one kind (Boxy + Solitude + Area Number = our shikaku). A mix of clue kinds needs `of: any`. |
| **Rose Windows** | Each region holds one of every kind of rose (one red, one blue, …), for the kinds the puzzle uses. | **Close:** with one kind of rose, `one-each` `of: symbol` is exact. With two or more kinds it's **missing**: it needs exactly one of *each* symbol value per region (for example a `per-value` setting on `one-each`, or a `rose` clue with a color). |
| **Mismatch** | No two regions have the same shape (turned or flipped counts as the same). | **Exact:** `all-different`. It's slow, though: on a 10×14 board the solver ran out of memory (clingo-wasm) or ran for more than 10 minutes (native). With `rectangles`, comparing the sorted sides of each rectangle is enough and solves instantly. |
| **Match** | Every region has the same shape. | **Missing:** an `all-same` block (`same` for every pair of regions; cheap with `size` known). |
| **Mingle Shape** | Regions that share a border have different shapes. | **Missing:** a `neighbors-differ` block (`opposites` applied to every pair of neighbouring regions). With `rectangles`, compare the sides. |
| **Size Separation** | Regions that share a border have different sizes. | **Missing:** a `neighbors-differ-size` block. |
| **Gemini** (symbol on a border) | The two regions on either side are different regions with the same shape. | **Exact:** `twins` (◆ on the border). |
| **Delta** (symbol on a border) | The two regions on either side have different shapes. | **Exact:** `opposites` (◇ on the border). |
| **Polyomino** (clue in a cell) | Shows the exact shape of its region, turned or flipped. Unclued regions are free. | **Missing for panes:** the `shape` given exists (for panels), but no Panes rule reads it. It needs a `region-shape` block: the region's normalized shape equals the clue under the 8 symmetries. |
| **Shape Bank** | Every region is one of the shapes listed on the scroll (one helper solver also has a "soft bank" that allows one exception). | **Missing:** a `bank` rule setting with a list of polyominoes. One Boxy puzzle's bank allowed only the 2×2 square, so it worked as `squares` + `size 4`. |
| **Palisade** (clue in a cell) | A diamond mark shows which of the cell's four sides are region borders, up to rotation: none, one, two at a corner, two opposite, or three. The board's outline and holes count as borders. | **Missing:** a new clue kind (the wall pattern: 0, 1, 2-corner, 2-opposite, 3, 4) and a block that counts the cell's cut sides. It's easy in ASP; see `references/glimmith/scripts/check.ts`. |
| **Compass** (clue in a cell) | Its numbers count the cells of its own region that lie north, east, south and west of it. A blank direction is free. | **Exact:** `compass`. |
| **Loopy** | No point where exactly three border lines meet (no T-junctions), counting the board's outline, so a border can't end on the edge. The borders form closed loops, and the regions can be two-coloured. | **Missing:** a corner rule (`:- exactly 3 of the 4 lines at a grid point are borders`, with the outline counted as borders). |
| **Bricky** | No point where four border lines meet, counting the outline (at a notch in the board, two inner borders can't both end at the corner). | **Close:** `no-four-corners` forbids four regions meeting at an interior point but doesn't count the outline. |
| **Watchtower** (number on a grid point) | That many different regions touch the point. | **Missing:** a corner clue (we have `count` on corners for mazes, but it counts walls). It needs a `regions-at-corner` block. |
| **Difference** (number on a border) | That border separates two regions whose sizes differ by exactly that number. | **Missing:** a border clue and a block. |
| **Inequality** (arrow on a border) | That border separates two regions, and the sign reads like < or > between the two regions' sizes (the pointed end is the smaller region). | **Missing:** a border clue and a block. |

**Totals:** of 22 rule sets, 8 map exactly (Boxy, Precision, Minimum/Maximum/Range, Area Number,
Mismatch, Gemini, Delta, Compass), 3 closely (Solitude, Rose Windows, Bricky), and 11 need new
blocks (Non-Boxy, Match, Mingle Shape, Size Separation, Polyomino, Shape Bank, Palisade, Loopy,
Watchtower, Difference, Inequality). The board geometry (holes, given walls) also needs the encoding
fix above.

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
  parser accepted without complaint.
- Palisade marks are small. A mark with three sides drawn (a U) is easy to misread as two (a ^),
  so look closely.
- A Polyomino mark's squares are drawn smaller when there are more of them, so a 1×4 can look like
  a 1×3.

## Sources

- In-game rule scrolls, read from walkthrough screenshots: [yekbot, Boxy walkthrough](https://www.yekbot.com/the-artisan-of-glimmith-boxy-walkthrough/) and [camzillasmom, Boxy window solutions](https://camzillasmom.com/the-artisan-of-glimmith-boxy-window-puzzle-solutions/).
- Window list: [yekbot, Walkthrough Guide](https://www.yekbot.com/the-artisan-of-glimmith-walkthrough-guide/).
- Rule wording for Precision, Minimum, Range, Polyomino, Palisade, Gemini, Delta, Mismatch, Rose Windows, Solitude and Compass: [9Puz, Artisan of Glimmith walkthrough](https://9puz.com/2382-artisan-of-glimmith-walkthrough/).
- Window introductions for Range, Size Separation, Match, Mismatch and Solitude: [camzillasmom](https://camzillasmom.com/?s=glimmith).
- Exact semantics of Loopy, Bricky, Watchtower, Difference, Inequality, Non-Boxy, Palisade and the shape and soft banks: the encoding in [ham883/glimmith-solver](https://github.com/ham883/glimmith-solver) (MIT), `solver.py`.
- Loopy as "never make a T": [Steam discussion](https://steamcommunity.com/app/4160210/discussions/0/796716542888934780/).
