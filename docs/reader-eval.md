# The reader on sketchpad drawings

How well the sketch reader (`app/app/lib/read-sketch.server.ts`) reads puzzles drawn in the
sketchpad (/new/draw). For each puzzle type its first example (`src/games/<type>/1.json`) is drawn
with the sketchpad's own tools (`app/app/sketchpad/from-puzzle.ts`, with the type's name and any
extra rules written above the grid, as creators are told to), read with "Read my drawing" on the
local site, and the draft compared with the example: the type, the size, the givens (each clue at
its place: missing, extra, or a wrong value there), outlined areas, the rules and their settings,
and whether the read puzzle has the example's solution (and only it; a panel just has to accept
the example's line). Made by `app/tests/e2e/reader.spec.ts` (`npm --prefix app run test:reader`;
it calls Claude, so it costs money); the data is in `app/tests/e2e/reader-results.json`.

Last run: 2026-10-08. Models: claude-sonnet-5-5, claude-opus-5-5. Tokens (latest reads): 492,028 in, 15,990 out.
Spent on these runs in all: $1.46 (3 runs; list prices: Sonnet 5.5 $2 / $10, Opus 5.5 $4 / $20 per million tokens in / out).

## Now

26 types: **26 read exactly** (100%); type right 26, size right 26, same solution 26; givens 223/223 right (100%) with 0 extra; 0 failed reads. Cost $1.23.

| Type | Type read | Size | Givens right (+extra) | Areas, rules | Solution | Reader, cost | Misses |
|---|---|---|---|---|---|---|---|
| akari | ✓ | ✓ | 18/18 | ✓ | same | sonnet-5-5 $0.041 | exact |
| aquarium | ✓ | ✓ | 5/5 | ✓✓ | same | sonnet-5-5 $0.059 | exact |
| cave | ✓ | ✓ | 9/9 | ✓ | same | sonnet-5-5 $0.038 | exact |
| easy-as-abc | ✓ | ✓ | 5/5 | ✓ | same | sonnet-5-5 $0.037 | exact |
| hitori | ✓ | ✓ | 25/25 | ✓ | same | sonnet-5-5 $0.043 | exact |
| irregular-sudoku | ✓ | ✓ | 6/6 | ✓✓ | same | sonnet-5-5 $0.053 | exact |
| masyu | ✓ | ✓ | 9/9 | ✓ | same | sonnet-5-5 $0.038 | exact |
| minesweeper | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.039 | exact |
| number-line-maze | ✓ | ✓ | 27/27 | ✓ | same | sonnet-5-5 $0.045 | exact |
| numberlink | ✓ | ✓ | 8/8 | ✓ | same | sonnet-5-5 $0.038 | exact |
| nurikabe | ✓ | ✓ | 5/5 | ✓ | same | sonnet-5-5 $0.037 | exact |
| panel | ✓ | ✓ | 13/13 | ✓ | same | sonnet-5-5 → opus-5-5 $0.129 | exact |
| panes | ✓ | ✓ | 3/3 | ✓ | same | sonnet-5-5 $0.037 | exact |
| picture-squares | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.038 | exact |
| round-the-bend | ✓ | ✓ | 1/1 | ✓ | same | sonnet-5-5 $0.036 | exact |
| shikaku | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.039 | exact |
| simple-path | ✓ | ✓ | 5/5 | ✓ | same | sonnet-5-5 $0.038 | exact |
| skyscrapers | ✓ | ✓ | 4/4 | ✓ | same | sonnet-5-5 → opus-5-5 $0.116 | exact |
| slitherlink | ✓ | ✓ | 11/11 | ✓ | same | sonnet-5-5 $0.039 | exact |
| spiral-galaxies | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.043 | exact |
| square-jam | ✓ | ✓ | 4/4 | ✓ | same | sonnet-5-5 $0.037 | exact |
| star-battle | ✓ | ✓ | 0/0 | ✓✓ | same | sonnet-5-5 $0.050 | exact |
| sudoku | ✓ | ✓ | 4/4 | ✓ | same | sonnet-5-5 $0.038 | exact |
| thermo-sudoku | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.042 | exact |
| three-coats | ✓ | ✓ | 4/4 | ✓ | same | sonnet-5-5 $0.040 | exact |
| wittgenstein-briquet | ✓ | ✓ | 7/7 | ✓ | same | sonnet-5-5 $0.038 | exact |

## Fixes after the first read

- **Nonograms** (picture-squares): `from-puzzle.ts` drew nothing but the grid for a puzzle made from
  its picture; it now writes the row and column numbers worked out from the picture, as a creator would.
- **Rules the type has anyway** (easy-as-abc's "letters count 3", Three Coats' "painted" and
  "neighbor-dots"): the reader listed them; `toSketch` now leaves out a rule the type already has
  with the same settings.
- **Three Coats' hidden dots**: the clue guide had no way to say a dot is hidden; it now says to add
  "hidden", and `givenOf` reads it.
- **Panels** are drawn on the grid's Tracks look (wide pale tracks), as a creator would draw one.

The drawing has the type's name written above it, and the reader gets the drawing's data with its
picture (`drawingBrief`), so this measures the reader at its best; a photo of a hand drawing is harder.

## First read

Before any fixes to the drawing, the brief or the reader's guide: 26 types: **23 read exactly** (88%); type right 26, size right 26, same solution 25; givens 210/223 right (94%) with 0 extra; 0 failed reads. Cost $1.22.

| Type | Type read | Size | Givens right (+extra) | Areas, rules | Solution | Reader, cost | Misses |
|---|---|---|---|---|---|---|---|
| akari | ✓ | ✓ | 18/18 | ✓ | same | sonnet-5-5 $0.041 | exact |
| aquarium | ✓ | ✓ | 5/5 | ✓✓ | same | sonnet-5-5 $0.059 | exact |
| cave | ✓ | ✓ | 9/9 | ✓ | same | sonnet-5-5 $0.038 | exact |
| easy-as-abc | ✓ | ✓ | 5/5 | ✗ | same | sonnet-5-5 $0.038 | rules extra: {count:3,rule:"letters"} |
| hitori | ✓ | ✓ | 25/25 | ✓ | same | sonnet-5-5 $0.043 | exact |
| irregular-sudoku | ✓ | ✓ | 6/6 | ✓✓ | same | sonnet-5-5 $0.053 | exact |
| masyu | ✓ | ✓ | 9/9 | ✓ | same | sonnet-5-5 $0.038 | exact |
| minesweeper | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.039 | exact |
| number-line-maze | ✓ | ✓ | 27/27 | ✓ | same | sonnet-5-5 $0.045 | exact |
| numberlink | ✓ | ✓ | 8/8 | ✓ | same | sonnet-5-5 $0.038 | exact |
| nurikabe | ✓ | ✓ | 5/5 | ✓ | same | sonnet-5-5 $0.037 | exact |
| panel | ✓ | ✓ | 13/13 | ✓ | same | sonnet-5-5 $0.046 | exact |
| panes | ✓ | ✓ | 3/3 | ✓ | same | sonnet-5-5 $0.037 | exact |
| picture-squares | ✓ | ✓ | 0/10 | ✓ | many | sonnet-5-5 → opus-5-5 $0.113 | missing: runs row 0 [1,1]; runs row 1 [5]; runs row 2 [5]; runs row 3 [3]… |
| round-the-bend | ✓ | ✓ | 1/1 | ✓ | same | sonnet-5-5 $0.036 | exact |
| shikaku | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.039 | exact |
| simple-path | ✓ | ✓ | 5/5 | ✓ | same | sonnet-5-5 $0.038 | exact |
| skyscrapers | ✓ | ✓ | 4/4 | ✓ | same | sonnet-5-5 → opus-5-5 $0.116 | exact |
| slitherlink | ✓ | ✓ | 11/11 | ✓ | same | sonnet-5-5 $0.039 | exact |
| spiral-galaxies | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.043 | exact |
| square-jam | ✓ | ✓ | 4/4 | ✓ | same | sonnet-5-5 $0.037 | exact |
| star-battle | ✓ | ✓ | 0/0 | ✓✓ | same | sonnet-5-5 $0.050 | exact |
| sudoku | ✓ | ✓ | 4/4 | ✓ | same | sonnet-5-5 $0.038 | exact |
| thermo-sudoku | ✓ | ✓ | 10/10 | ✓ | same | sonnet-5-5 $0.042 | exact |
| three-coats | ✓ | ✓ | 1/4 | ✗ | same | sonnet-5-5 $0.040 | wrong: dots cell 0,1: {hidden:true,value:[2]} read as {value:[2]}; dots cell 0,2: {hidden:true,value:[2]} read as {value:[2]}; dots cell 0,3: {hidden:true,value:[2]} read as {value:[2]}; rules extra: {rule:"painted"} {rule:"neighbor-dots"} |
| wittgenstein-briquet | ✓ | ✓ | 7/7 | ✓ | same | sonnet-5-5 $0.038 | exact |
