// Reading a hand-drawn sketch with Claude: the photo goes in, a structured reading comes out
// (game type, grid size, the clues the player starts with, rules, notes about anything
// uncertain), which becomes the game's sketch text. The creator then checks it against
// their drawing in the editor (and can ask for a re-read). See docs/reader.md.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { SYMBOL_COLORS, type Given, type GridSpec, type RuleSpec, type SymbolColor } from "~site/engine/types.ts";
import { SYMMETRIES } from "~site/engine/panel.ts";
import { GENRE_NAMES, genres, normalShape, type GenreName } from "~site/engine/puzzle.ts";
import { RULE_NAMES, type RuleName } from "~site/engine/rules.ts";
import { guides } from "~site/guides/guides.ts";
import { parseSketch } from "../games/sketch";
import { DOUBT_PLACES, type DoubtPlace } from "../games/doubts";
import { Invalid } from "./errors.server";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

// ---- what Claude is told, per genre / clue kind / rule ----
// Typed against the engine's own lists, so a new genre, clue kind or rule block fails the build
// until it's described here too (the visual editor has the same guard; see docs/grid-engine.md).

const GENRE_GUIDE: Record<GenreName, string> = {
  "simple-loop": `simple-loop (Simple Loop, also drawn as "Round the Bend" or "river"): draw one loop through every open cell. Shaded / crossed-out cells are
  rocks: {kind: "block"}. Thick lines between two cells are walls the loop can't cross: {kind: "wall", cell, other}.`,
  "simple-path": `simple-path (Simple Path, a Hamiltonian path): draw one path from an entrance to an exit through
  every open cell. Arrows (or gaps) at the outside edge mark the entrance and exit: {kind: "door", role: "in" / "out"}
  with the cell beside it and that side. Shaded cells are rocks {kind: "block"}; thick lines between cells are
  walls {kind: "wall", cell, other}.`,
  "star-battle": `star-battle (Star Battle): a square grid split into outlined areas by thick lines; usually no other
  clues. Give the areas as "areas" (one string per row, one letter per cell, same letter = same area). If it says
  "2 stars" (or similar), set the rules shaded-per-line and shaded-per-area with n: 2.`,
  akari: `akari (Akari / Light Up): black cells, some with a number 0-4. Each black cell is {kind: "block"}; a numbered
  black cell is both {kind: "block"} and {kind: "number", value} on the same cell. Leave out any bulbs drawn as the answer.`,
  numberlink: `numberlink (Numberlink / Connectlink / Flow): pairs of equal numbers (or letters / colors, numbered 1, 2, 3...)
  in cells, {kind: "number", value}. If the sketch says every cell must be used, add the rule links with cover: true.
  Leave out lines drawn as the answer.`,
  masyu: `masyu: white and black circles (pearls) in cells, {kind: "pearl", pearl: "white" / "black"}. Leave out the loop if
  it's drawn as the answer.`,
  "square-jam": `square-jam (Square Jam): numbers in cells, {kind: "number", value} (a square's side length). Leave out squares drawn as the answer.`,
  "wittgenstein-briquet": `wittgenstein-briquet (Wittgenstein Briquet): numbers 0-4 in cells, {kind: "number", value}. Leave out blocks drawn as the answer.`,
  hitori: `hitori: a number (or letter, numbered 1, 2, 3...) in every cell, {kind: "number", value}. Leave out shading drawn as the answer.`,
  minesweeper: `minesweeper: numbers 0-8 in some cells, {kind: "number", value}. Leave out mines drawn as the answer.`,
  "spiral-galaxies": `spiral-galaxies (Spiral Galaxies / Tentai Show): small circles at cell centres, on the middle of a line between two
  cells, or where four cells meet. Each is {kind: "galaxy", point: {row, col}} in half-cell steps: a cell's centre is
  row 2r+1, col 2c+1; the line below cell (r, c) is row 2r+2; a corner is an even row and an even column.`,
  "thermo-sudoku": `thermo-sudoku (Thermo Sudoku): a sudoku (usually 6x6 or 9x9) with printed digits {kind: "number", value} and
  thermometers drawn through cells: {kind: "thermo", path: [cells from the bulb to the tip]}.`,
  skyscrapers: `skyscrapers: an n x n grid with numbers outside it, beside rows and above / below columns: {kind: "skyscraper",
  value, cell: the cell next to the number, side: which side of that cell the number is on}. Printed digits inside are {kind: "number"}.`,
  "easy-as-abc": `easy-as-abc (Easy as ABC): letters outside the grid: {kind: "first", value: 1 for A, 2 for B..., cell: the cell next
  to it, side}. If it uses more or fewer letters than A-C, set the rule letters with count, and style symbols isn't needed.`,
  cave: `cave: numbers in cells, {kind: "number", value}. Leave out shading drawn as the answer.`,
  aquarium: `aquarium: a grid split into outlined tanks (thick lines), with a number beside some rows and above some
  columns. Give the tanks as "areas" (one string per row, one letter per cell) and each number in "runs" as a
  single-number list ({line: "row" / "col", index, runs: [n]}). Leave out water drawn as the answer.`,
  shikaku: `shikaku: numbers in cells, {kind: "number", value}; the grid gets cut into rectangles each holding exactly one
  number, its size. Only when every rectangle must hold one number: rectangles with size numbers where a region may have
  no number (Glimmith's Boxy + Area Number without Solitude) is panes with the rules rectangles and size-clue.
  Leave out rectangles drawn as the answer.`,
  "irregular-sudoku": `irregular-sudoku (Irregular / Jigsaw Sudoku): a sudoku whose boxes are irregular outlined areas.
  Give the printed digits {kind: "number", value} and the areas as "areas" (one string per row, one letter per cell).`,
  slitherlink: `slitherlink: numbers in cells count how many of the cell's four sides the loop uses: {kind: "number", value}.`,
  nurikabe: `nurikabe: numbered cells are islands of that size: {kind: "number", value}.`,
  nonogram: `nonogram (also "Picture Squares"): numbers beside each row and above each column. If the drawing shows the
  shaded picture, give it as "picture" (one letter per cell, "." for empty, a color per letter: the colors
  drawn, or a dark ink color for plain shading), and check it against the numbers; note any row or column
  where they disagree. If there's no picture, give the numbers as "runs".`,
  sudoku: `sudoku: the printed digits: {kind: "number", value}. The grid is 4x4, 6x6 or 9x9.`,
  maze: `maze (Number Line Maze): numbers sit where the grid lines cross (often drawn as numbers in little
  circles, joined by faint or dotted lines); the squares between them are the cells, so "rows" and "cols"
  count squares: one fewer than the numbers down and across. Each number is {kind: "count", value} with
  "cell" giving its corner (row 0..rows, col 0..cols). Two arrows at the outside edge mark the doors: the
  arrow pointing in is {kind: "door", role: "in"}, the one pointing out {kind: "door", role: "out"}, each
  with the cell it's beside and that cell's side. Walls drawn already (as hints) are {kind: "wall", cell, other};
  leave out walls that are clearly the solution.`,
  coats: `coats (Three Coats): a figure split into pieces (triangles, squares, any polygons), with colored dots
  in some pieces (red, yellow, blue; often written as numbers 1, 2, 3). There's no grid: give "figure", one
  polygon per piece, its corners in order as [x, y] on a 0..100 scale across the drawing (y down). Pieces
  that share an edge must use the same corner coordinates where they meet, and a corner sitting on another
  piece's edge must lie exactly on that edge. Each piece's dots are {kind: "dots", dots: [colors]} with
  cell {row: 0, col: the piece's index in "figure"}. Set rows to 1 and cols to the number of pieces.`,
  panes: `panes: split the grid into regions (also The Artisan of Glimmith's puzzles). The rules are written on the
  sketch (e.g. "panes: size 4, twins", or Glimmith's rule scrolls); list each one in "rules". Holes in the board (cells
  that aren't part of it: shaded, crossed out, or the table showing through) are {kind: "block"}; border lines drawn in
  from the start are {kind: "wall"} (both sides are different regions). Glimmith's rules: Boxy = rectangles;
  Precision N = size "is N"; Minimum / Maximum / Range = size "min N" / "max N"; Area Number = size-clue (on its own:
  regions without a number are fine; add one-each "of any" only if Solitude is there too); Solitude = one-each "of any"
  (every clue in a cell counts, whatever its kind: numbers, compasses, roses, palisade marks, shapes); Rose Windows =
  one-each "of symbol" with one kind of rose, one-of-each with roses of several colors (each rose a symbol whose value
  is its color); Mismatch = all-different; Match = all-same; Mingle Shape = neighbors-differ; Size Separation =
  neighbors-differ-size; Non-Boxy = no-rectangles; Gemini = twins (◆); Delta = opposites (◇); Compass = compass;
  Palisade = cell-borders, with a palisade clue in each marked cell; Polyomino = region-shape, with a shape clue in each
  cell that shows one; Shape Bank = shape-bank, with each shape of the bank (drawn on the scroll or beside the board) a
  bank clue; Bricky = no-four-corners "outline"; Loopy = no-t-junctions; Inequality = size-compare, with an inequality
  clue on each marked border; Difference = size-difference, with a difference clue on each numbered border; Watchtower
  = regions-at-corner, with a watchtower clue on each numbered corner. A Glimmith rule not listed here: never stand in
  another rule for it; leave it out of "rules" and add a note (place "whole") naming the rule.`,
  panel: `panel (Panel, line puzzles in the style of The Witness): a grid of squares; a line is drawn along the grid
  lines from a start circle (a big fat dot on a corner) to an end (a short stub sticking out of the outside edge at a
  corner). "rows" and "cols" count the squares (cells), not the lines: corners run from 0 to rows and 0 to cols.
  Starts, ends and corner dots sit on corners: their row and col are the corner's (0..rows, 0..cols). Dots halfway
  along a grid line, and gaps (a break in a grid line), sit between two neighbouring corners: give the corner at the
  top / left end and which way the line goes from it ("right" or "below"). Symbols in the squares (squares, stars,
  triangles, shapes, erasers) use the cell's row and col, and may mix freely. Two start circles and two ends placed as
  mirror images (often a blue and a yellow start) mean two lines drawn at once: add the rule panel-line with settings
  "symmetry left-right" (mirrored left to right), "symmetry up-down" (mirrored top to bottom) or "symmetry turn"
  (turned halfway round). Leave out a line drawn as the answer.`,
};

// how each clue kind fills a given's row, col and value (the value is always text; "" when unused)
const CLUE_GUIDE: Record<Exclude<ClueKind, "runs" | "total">, string> = {
  number: "a number (or a printed digit) in a cell: row, col; value the number, e.g. \"3\"",
  block: "a rock: a shaded or crossed-out cell: row, col; value \"\"",
  symbol: "a symbol (★, ●, a letter...) in a cell: row, col; value the symbol; for a colored one (a Glimmith rose) its color, one of red, orange, yellow, green, blue, purple, white, black",
  palisade: "a palisade mark in a cell (panes: a small diamond with some of its four sides drawn thick; each thick side is one of the cell's sides that is a region border): row, col; " +
    "value how many sides are drawn, and with two whether they meet at a corner or are opposite: \"0\", \"1\", \"2 corner\", \"2 opposite\", \"3\" or \"4\" (three sides make a U; look closely, it's easy to misread as two)",
  compass: "a compass in a cell: row, col; value its numbers by direction, any missing, e.g. \"n2 e1 w0\"",
  wall: "a thick wall on the border between two cells: row, col of the top / left cell; value \"right\" or \"below\" (where the other cell is)",
  twins: "a filled diamond ◆ on the border between two cells: row, col of the top / left cell; value \"right\" or \"below\"",
  opposites: "an empty diamond ◇ on the border between two cells: row, col of the top / left cell; value \"right\" or \"below\"",
  inequality: "a < or > sign on the border between two cells (panes, Glimmith's Inequality; its point is at the smaller region): row, col of the top / left cell; " +
    "value \"right\" or \"below\" (where the other cell is), then \"<\" if it points to the top / left cell or \">\" if it points to the other one, e.g. \"right <\", \"below >\" (a ^ is <, a v is >)",
  difference: "a number on the border between two cells (panes, Glimmith's Difference): row, col of the top / left cell; value \"right\" or \"below\" and the number, e.g. \"right 2\"",
  watchtower: "a number on a corner, where grid lines cross (panes, Glimmith's Watchtower: how many regions meet there): row, col = the corner (0..rows, 0..cols); value the number, 1 to 4",
  bank: "one shape of a shape bank (panes, Glimmith's Shape Bank: shapes drawn on the rule scroll or beside the board, not in a cell): row -1, col -1; value its blocks as row,col pairs with the top-left block at 0,0, e.g. \"0,0 0,1 1,0\"",
  count: "a number on a corner, where grid lines cross (mazes): row, col = the corner (0..rows, 0..cols); value the number",
  dots: "colored dots in a piece (Three Coats): row 0, col = the piece's index in figure; value the dot colors as digits, 1 red, 2 yellow, 3 blue, e.g. \"113\"; then \"hidden\" if they're drawn hidden (dashed outlines: they show once the piece is painted), e.g. \"2 hidden\"",
  pearl: "a circle in a cell (masyu): row, col; value \"white\" or \"black\"",
  first: "a letter outside the grid (easy-as-abc): row, col of the cell next to it; value its side of that cell and the letter's number (A = 1), e.g. \"left 2\"",
  skyscraper: "a number outside the grid (skyscrapers): row, col of the cell next to it; value its side of that cell and the number, e.g. \"top 3\"",
  thermo: "a thermometer (thermo-sudoku): row, col of its bulb; value every cell from the bulb to the tip as row,col pairs, e.g. \"2,0 2,1 1,1\"",
  galaxy: "a galaxy circle (spiral-galaxies): row, col = its centre in half-cell steps (a cell's centre is 2r+1, 2c+1; even numbers are on lines); value \"\"",
  door: "an arrow at the outside edge (mazes, simple-path): row, col of the cell beside it; value that cell's side and in or out, e.g. \"top in\"",
  // panels: corners are 0..rows, 0..cols; a stretch of grid line is a corner and "right" / "below"
  start: "a start circle (panels: a big fat dot on a corner): row, col = the corner (0..rows, 0..cols); value its color, \"blue\" or \"yellow\", with two mirrored lines when the starts are colored; else \"\"",
  end: "an end (panels: a short stub sticking out of the outside edge at a corner): row, col = the corner it sticks out of (on the outside edge); value \"\"",
  hexagon: "a dot the line must pass (panels: a small dot or hexagon on the grid lines): on a corner, row, col = the corner and value \"\"; " +
    "halfway along a grid line, row, col = the corner at its top / left end and value \"right\" or \"below\"; add \"blue\" or \"yellow\" if it's colored (two mirrored lines), e.g. \"right blue\" or \"blue\"",
  gap: "a gap (panels: a break in a grid line the line can't cross): row, col = the corner at the top / left end of that stretch of line; value \"right\" or \"below\"",
  square: `a colored square in a cell (panels): row, col; value its color, one of ${SYMBOL_COLORS.join(", ")} (an empty outline is white, plain ink black)`,
  star: `a star (sun) in a cell (panels; it pairs with exactly one other symbol of its color in its region, of any kind): row, col; value its color, one of ${SYMBOL_COLORS.join(", ")} (plain ink is black)`,
  triangle: "little triangles in a cell (panels): row, col; value how many, 1, 2 or 3, e.g. \"2\"; add a color only if they're clearly not orange (plain ink counts as orange), e.g. \"2 purple\"",
  shape: "a block shape in a cell (a polyomino drawn small, e.g. an L or a tetris piece; in panes, Glimmith's Polyomino, give only its blocks): row, col of the cell it's in; value its blocks as row,col pairs " +
    "with the top-left block at 0,0, then \"rotate\" if it's drawn tilted (it may be turned), and \"negative\" if it's drawn hollow / outlined (it takes away), " +
    "then a color only if it's clearly not the usual one (yellow, or blue for a hollow shape; plain ink counts as usual), " +
    "e.g. \"0,0 1,0 1,1\", \"0,0 0,1 rotate\", \"0,0 negative\" or \"0,0 1,0 red\"",
  eraser: "an eraser in a cell (panels: a Y-shaped mark, three short strokes from a centre): row, col; value \"\", or a color if it's clearly not white (plain ink counts as white)",
};

const RULE_GUIDE: Record<RuleName, string> = {
  loop: "the lines form one loop (comes with simple-loop and slitherlink)",
  path: "one path from the way in to the way out (comes with simple-path); cover: through every open cell",
  links: "join each pair of matching numbers with a line (comes with numberlink); cover: every cell used",
  pearls: "the loop goes straight through white pearls and turns on black ones (comes with masyu)",
  sides: "a number counts the loop's sides around it (comes with slitherlink)",
  runs: "row and column numbers are runs of shaded cells (comes with nonogram)",
  latin: "each digit once per row and column (comes with sudoku)",
  boxes: "each digit once per box (comes with sudoku); box: [rows, cols] if the boxes aren't the usual size",
  "shaded-per-line": "n shaded cells (stars) in every row and column (comes with star-battle, n 1)",
  "shaded-per-area": "n shaded cells (stars) in every outlined area (comes with star-battle, n 1)",
  "no-touch": "shaded cells (stars) never touch, not even diagonally (comes with star-battle)",
  lit: "bulbs light their row and column; every white cell lit, no two bulbs see each other (comes with akari)",
  "adjacent-count": "a number counts the shaded cells / bulbs right beside it (comes with akari)",
  rectangles: "every region is a rectangle (comes with shikaku; Glimmith's Boxy)",
  squares: "every region is a square (comes with square-jam)",
  "no-four-corners": "four regions never meet at a point (comes with square-jam); outline: no point where four border lines meet, counting the board's outline and holes (Glimmith's Bricky)",
  "side-clue": "a number is the side of its square (comes with square-jam)",
  galaxies: "regions are symmetric about their circles (comes with spiral-galaxies)",
  bars: "shaded cells are straight blocks of length (comes with wittgenstein-briquet, length 3)",
  "no-adjacent": "shaded cells never share a side (comes with hitori)",
  "unique-unshaded": "unshaded numbers differ in each row and column (comes with hitori)",
  "mine-count": "a number counts the mines in the 8 cells around it (comes with minesweeper)",
  letters: "each of count letters once per row and column, other cells empty (comes with easy-as-abc, count 3)",
  "first-seen": "a letter outside is the first one seen from that side (comes with easy-as-abc)",
  skyscrapers: "a number outside counts the buildings seen from there (comes with skyscrapers)",
  thermo: "digits rise from a thermometer's bulb to its tip (comes with thermo-sudoku)",
  "unshaded-connected": "the white cells form one connected group (comes with cave)",
  "shaded-to-edge": "every group of shaded cells touches the edge (comes with cave)",
  sight: "a number counts the white cells it sees in its row and column, itself included (comes with cave)",
  water: "shaded cells are water settling in the outlined tanks (comes with aquarium)",
  "line-totals": "numbers beside rows / above columns count shaded cells (comes with aquarium)",
  connected: "all shaded cells connect (comes with nurikabe)",
  "no-pool": "no 2×2 block of shaded cells (comes with nurikabe)",
  size: "every region has exactly N cells (is), or at least / at most (min / max)",
  "size-clue": "a numbered cell's region has that many cells; regions without a number are fine (Glimmith's Area Number). Rectangles + size-clue is not shikaku unless every region must also hold exactly one number (one-each)",
  "one-each": "every region holds exactly one number (\"of number\"), one symbol (\"of symbol\"), or one clue of any kind (\"of any\": Glimmith's Solitude)",
  "no-t-junctions": "no point where exactly three border lines meet, counting the board's outline and holes (Glimmith's Loopy)",
  "no-rectangles": "no region is a rectangle (Glimmith's Non-Boxy)",
  "all-same": "every region has the same shape (Glimmith's Match)",
  "neighbors-differ-size": "regions that share a border have different sizes (Glimmith's Size Separation)",
  "shape-bank": "every region is one of the bank's shapes, turned or flipped (Glimmith's Shape Bank; each shape a bank clue)",
  "region-shape": "a shape clue in a cell is its region's shape, turned or flipped (Glimmith's Polyomino)",
  "size-compare": "an inequality sign on a border points to the smaller of the two regions (Glimmith's Inequality)",
  "size-difference": "a difference number on a border: the two regions are different and their sizes differ by it (Glimmith's Difference)",
  "regions-at-corner": "a watchtower number on a corner counts the regions meeting there (Glimmith's Watchtower)",
  "one-of-each": "every region holds exactly one symbol of each kind: one of every color (Glimmith's Rose Windows with roses of several colors)",
  "neighbors-differ": "regions that share a border have different shapes (Glimmith's Mingle Shape)",
  "cell-borders": "a palisade mark shows how many of its cell's sides are region borders, at a corner or opposite (Glimmith's Palisade)",
  twins: "the two regions on either side of a ◆ have the same shape",
  opposites: "the two regions on either side of a ◇ have different shapes",
  "all-different": "no two regions share a shape",
  compass: "a compass clue counts its region's cells to the north, east, south and west",
  "corner-count": "a number on a corner counts the walls touching it (comes with maze)",
  painted: "every piece gets a color (comes with coats)",
  "neighbor-dots": "k dots of a color in a piece need at least k neighbours of that color (comes with coats)",
  "color-count": "exactly this many pieces of each color, when written on the sketch (red, yellow, blue)",
  "perfect-maze": "the walls make a maze: every square reachable, one way between any two (comes with maze)",
  "panel-line": "one line along the grid lines from a start circle to an end, never touching itself or crossing a gap (comes with panel); " +
    "symmetry left-right / up-down / turn: two lines at once, mirror images (list it, with its symmetry, when the panel has two mirrored starts and ends)",
  "panel-symbols": "the panel's symbols (dots, squares, stars, triangles, shapes, erasers) say where the line goes (comes with panel)",
};

// Every field is required (empty when unused): the API caps how many fields may be nullable or
// optional, so per-kind details are short text the server reads (see CLUE_GUIDE and ruleSettings).
const int = z.number().int();
const clueKinds = Object.keys(CLUE_GUIDE) as [Exclude<ClueKind, "runs" | "total">, ...Exclude<ClueKind, "runs" | "total">[]];
const Reading = z.object({
  readable: z.boolean().describe("false only if the image isn't a puzzle drawing at all; a messy or blurry puzzle is still readable"),
  problem: z.string().describe("when not readable: what's wrong, in one sentence for the creator; else \"\""),
  genre: z.enum(GENRE_NAMES as [GenreName, ...GenreName[]]),
  candidates: z.array(z.enum(GENRE_NAMES as [GenreName, ...GenreName[]])).describe(
    "every game type this same reading could be, most likely first (genre first): 1 if the type is written or certain, else up to 4"),
  title: z.string().describe("a title written on the sketch; else \"\""),
  bounds: z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() }).describe(
    "where the puzzle is in the photo, so only the puzzle is kept: its edges as fractions of the photo's width and height (0 at the left and top, 1 at the right and bottom). " +
    "Take in everything that belongs to the puzzle (the grid, clues and numbers outside it, its title and written rules) and nothing else: no hands, faces, desk or room. " +
    "0, 0, 1, 1 if the puzzle fills the photo"),
  rows: int, cols: int,
  rules: z.array(z.object({
    rule: z.enum(RULE_NAMES as [RuleName, ...RuleName[]]),
    settings: z.string().describe("its settings as words and numbers, e.g. \"is 4\", \"min 2 max 3\", \"of symbol\", \"box 2 3\", \"n 2\", \"count 4\", \"length 3\", \"red 2 blue 1\", \"cover\"; \"\" if none"),
  })).describe("rules written on the sketch beyond the ones the game type always has"),
  givens: z.array(z.object({
    kind: z.enum(clueKinds),
    row: int, col: int,
    value: z.string().describe("the clue's details, written as its kind says; \"\" if it has none"),
  })),
  runs: z.array(z.object({ line: z.enum(["row", "col"]), index: int, runs: z.array(int) }))
    .describe("nonogram (or aquarium) numbers written beside rows / above columns; empty when you give a picture instead"),
  pictureRows: z.array(z.string()).describe("nonogram, when the drawing shows the shaded picture: one string per row, one letter per cell, '.' empty; else []"),
  palette: z.array(z.object({ letter: z.string(), color: z.string().describe("a CSS hex color") })).describe("the picture's colors by letter; else []"),
  areas: z.array(z.string()).describe("outlined areas (star-battle, irregular-sudoku, aquarium): one string per row, one letter per cell; else []"),
  figure: z.array(z.array(z.array(z.number()))).describe("coats only: one polygon per piece, its corners as [x, y] on a 0..100 scale; else []"),
  sure: z.boolean().describe("true only if you could read the grid and every clue clearly"),
  notes: z.array(z.object({
    text: z.string().describe("what you weren't sure of and how you read it, e.g. \"looks like a 7 or a 2; read as 2\". Don't name rows or columns here: the place fields say where, and the creator sees it pinned there"),
    place: z.enum(DOUBT_PLACES as [DoubtPlace, ...DoubtPlace[]]).describe(
      "what the note is about: cell (one square), row-clue (the numbers beside one row), column-clue (the numbers above one column), " +
      "rows (whole rows), columns (whole columns), area (a block of squares), whole (the puzzle as a whole, or nowhere in particular)"),
    fromRow: int.describe("the row it's about (cell, row-clue), or the first row (rows, area), from 0 at the top like every row here; -1 if none"),
    toRow: int.describe("the last row (rows, area), from 0; else the same as fromRow"),
    fromCol: int.describe("the column it's about (cell, column-clue), or the first column (columns, area), from 0 at the left; -1 if none"),
    toCol: int.describe("the last column (columns, area), from 0; else the same as fromCol"),
  })).describe("anything you weren't sure of, one note per spot, for the creator to check; empty if everything was clear. " +
    "Each note is pinned on the puzzle where it says, so say exactly where: a smudged clue number is row-clue or column-clue (not the square next to it); " +
    "a doubt about part of the picture is cell or area; a doubt about a corner or a grid line (a panel's start, end, dot or gap) is the nearest cell inside the grid; a doubt about everything is whole."),
});
export type Reading = z.infer<typeof Reading>;

const SYSTEM = `You transcribe hand-drawn logic puzzles, mostly drawn by a kid on paper, into an exact
description that a puzzle engine can play. Read the drawing carefully: the grid, then every clue.

Coordinates: rows count from 0 at the top, columns from 0 at the left. "rows" and "cols" are the
number of cells. Count grid cells, not lines.

The game type may be written at the top of the sketch (e.g. "simple loop", "Round the Bend",
"slitherlink", "panes: size 4, twins"). Often it isn't: then work it out from what's drawn. Some
drawings fit several types with exactly the same clues (numbers in cells could be slitherlink,
nurikabe, shikaku, square-jam, cave, minesweeper or akari...): pick the most likely as "genre", and
list in "candidates" every type the same reading could be, most likely first (the creator chooses,
and the site checks which of them have exactly one solution). Only list types that use this exact
reading; if the type is written on the sketch, list just that one. The types:

${Object.values(GENRE_GUIDE).map((g) => `- ${g}`).join("\n")}

Clues ("givens"):
${Object.entries(CLUE_GUIDE).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Rules (list only the ones written on the sketch beyond what its game type always has, each with only the settings
it lists; a setting it doesn't list makes the puzzle fail to load):
${Object.entries(RULE_GUIDE).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

If a rule written on the sketch isn't one of these, don't put a different rule in its place (a stand-in changes
the puzzle): leave it out and add a note (place "whole") that names it and says what it means, e.g. "rule not supported:
Match (every region has the same shape)".

Only transcribe what the player starts with. If the drawing also shows the solution (a loop drawn
through the cells, filled-in digits, shaded answer cells in a nurikabe), use it to help you read the
grid, but leave it out. Never invent clues to make the puzzle work: transcribe what's drawn, and put
anything smudged, ambiguous or seemingly wrong in "notes" (with its row and column) so the creator can
confirm it.

These are kids' drawings: wobbly lines, uneven cells, scribbled shading, slightly blurry photos
are normal. Always give your best reading of a puzzle drawing, even a messy one, and set "sure" to
false if any part of it is a guess. Set "readable" to false only when the image isn't a puzzle
drawing at all (then say why in "problem").`;

/** Two readers: a quick one for the first look, and a careful one for drawings the quick one has
 *  trouble with (and for every re-read after the creator says what's wrong). */
const READERS = {
  quick: { model: "claude-sonnet-5-5", effort: "medium" },
  careful: { model: "claude-opus-5-5", effort: "high" },
} as const;
export type Reader = keyof typeof READERS;
type ClueKind = Given["kind"];

/** What a re-read is told: the earlier transcription, what the creator says is wrong, and the
 *  game type they say it is (if they chose one). */
export interface Previous { sketch: string; feedback: string; genre?: GenreName }

/** One reader's look at a drawing, for the record of reads (app/lib/reads.server.ts). */
export interface Attempt {
  reader: Reader; model: string; effort: string;
  ms: number; inputTokens?: number; outputTokens?: number; stopReason?: string | null;
  /** why the quick reader handed over to the careful one */
  trouble?: string[];
  error?: string;
}

/** Read a sketch photo. The quick reader goes first unless `careful`; if its reading looks shaky,
 *  the careful reader reads it again. `previous` asks for a corrected re-read. Each look is added
 *  to `log` as it happens (so a failed read is still recorded). */
export async function readSketch(env: Env, image: { data: string; type: ImageType },
  options: { previous?: Previous; careful?: boolean; log?: Attempt[]; drawing?: string } = {}) {
  const log = options.log ?? [];
  if (!env.ANTHROPIC_API_KEY) throw new Invalid("Reading sketches needs an Anthropic API key (ANTHROPIC_API_KEY) on the server.");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  if (!options.careful && !options.previous) {
    const quick = await readWith(client, "quick", image, options.previous, log, options.drawing);
    const trouble = troubleWith(quick);
    if (!trouble.length) return { ...quick, reader: "quick" as Reader };
    log[log.length - 1].trouble = trouble;
    console.log(`sketch reader: quick read had trouble (${trouble.join("; ")}${quick.reading.problem ? `: ${quick.reading.problem}` : ""}); reading carefully`);
  }
  const careful = await readWith(client, "careful", image, options.previous, log, options.drawing);
  if (!careful.reading.readable) throw new Invalid(careful.reading.problem || "That doesn't look like a puzzle Claude can read.");
  const genre = options.previous?.genre;
  if (genre && careful.reading.genre !== genre) {   // the creator said which type it is
    const reading = { ...careful.reading, genre, candidates: [genre] };
    return { reading, sketch: toSketch(reading), reader: "careful" as Reader };
  }
  return { ...careful, reader: "careful" as Reader };
}

/** Everything about one game type, for a reader told which type the drawing is. */
function typeBrief(genre: GenreName) {
  const g = guides[genre];
  return [
    `The creator says this drawing is a ${g.name} puzzle. Read it as one: set "genre" to "${genre}" and "candidates" to ["${genre}"].`,
    `${g.name}: ${g.summary}`,
    `Its rules:\n${g.rules.map((r) => `- ${r.text}`).join("\n")}`,
    `How to transcribe it: ${GENRE_GUIDE[genre]}`,
  ].join("\n\n");
}

/** For a drawing made in the sketchpad (/new/draw): what's on it, exactly, as its data. */
export function drawingBrief(drawing: string) {
  return [
    "This picture was drawn in inkit's sketchpad, not photographed, and here is exactly what is on it, as data. "
    + "Trust the data for the grid's size and for every stamp's and every piece of writing's kind, colour and place; use the picture to see what the pen lines and washes mean "
    + "(walls, region borders, a loop, a thermometer, a cage) and which type of puzzle it is.",
    "Places are given in squares from the grid's top-left corner: {at: \"cell\", r, c} is square (r, c)'s centre (r = -1 or rows, c = -1 or cols: just outside the grid, for clues beside it); "
    + "{at: \"corner\", r, c} is the point where lines meet (0..rows, 0..cols); {at: \"edge\", r, c, side} is the middle of square (r, c)'s top or left line; "
    + "{at: \"inset\", r, c, spot} is inside square (r, c) toward a side or corner (n, s, e, w, nw, ne, sw, se: where small writing goes, e.g. a corner sum or a compass's numbers); "
    + "{at: \"grid\", r, c} is a loose point in squares (fractions between); {at: \"page\", x, y} is off the grid, in page units. Rows and columns count from 0 here; in your transcription use the numbering your instructions give.",
    "Stamps are the boards' own symbols: stone (a Masyu pearl, or a panel's coloured square), star, rock (a shaded square), galaxy (a small circle), x, dot, hoshi (a panel's dot on the line), "
    + "start and end (a panel's line), crest (a panel's star), triangle (count 1-3), shape (a polyomino: its cells from 0,0; hollow = a negative shape; rotate = it may turn), eraser, "
    + "diamond (filled, on a line: the squares either side are twins) and open-diamond (on a line: opposites). A start or hoshi coloured blue or yellow belongs to one of a symmetry panel's two lines; "
    + "a hidden stone is a dot that stays hidden until its piece is painted. A grid with tracks: true is drawn as a panel's wide tracks (so it is a panel). A gap item is a break in a grid line (a panel's gap). Text marked small is written small to fit beside other things: a corner sum, a compass's numbers, a sign or number on a line.",
    `The drawing:\n${drawing}`,
  ].join("\n\n");
}

async function readWith(client: Anthropic, reader: Reader, image: { data: string; type: ImageType }, previous: Previous | undefined, log: Attempt[], drawing?: string) {
  const { model, effort } = READERS[reader];
  const attempt: Attempt = { reader, model, effort, ms: 0 };
  log.push(attempt);
  const ask = previous
    ? [
      `You transcribed this sketch before as:\n\n${previous.sketch}`,
      ...(previous.genre ? [typeBrief(previous.genre)] : []),
      ...(previous.feedback ? [`The creator compared it with their drawing and says:\n\n${previous.feedback}`] : []),
      previous.genre && !previous.feedback ? "Look at the drawing again and transcribe it as that type." : "Look at the drawing again and give the corrected transcription.",
    ].join("\n\n")
    : "Transcribe this puzzle sketch.";
  const started = Date.now();
  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort, format: betaZodOutputFormat(Reading) },
      // if the model declines, the API retries on another model in the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.type, data: image.data } },
          ...(drawing ? [{ type: "text" as const, text: drawingBrief(drawing) }] : []),
          { type: "text", text: ask },
        ],
      }],
    });
  } catch (e) {
    attempt.ms = Date.now() - started;
    attempt.error = e instanceof Error ? e.message.slice(0, 500) : String(e);
    if (e instanceof Anthropic.RateLimitError) throw new Invalid("The sketch reader is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.BadRequestError) throw new Invalid(`Claude couldn't take that image: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new Invalid(`Couldn't reach the sketch reader (${e.status ?? "network"}). Try again.`);
    throw e;
  }
  Object.assign(attempt, { ms: Date.now() - started, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, stopReason: response.stop_reason });
  console.log(`sketch reader: ${reader} (${model}, ${effort}) took ${((Date.now() - started) / 1000).toFixed(1)}s, ${response.usage.output_tokens} output tokens`);
  if (response.stop_reason === "refusal") throw new Invalid("Claude declined to read this image.");
  if (response.stop_reason === "max_tokens") throw new Invalid("The sketch was too much to read in one go. Try a closer photo of just the puzzle.");
  const reading = response.parsed_output;
  if (!reading) throw new Invalid("Claude's reading came back incomplete. Try again.");
  return { reading, sketch: reading.readable ? toSketch(reading) : "" };
}

/** Signs a reading is shaky enough to ask the careful reader: the reader wasn't sure, it isn't a
 *  playable puzzle, or a quick sanity check fails. */
function troubleWith({ reading, sketch }: { reading: Reading; sketch: string }): string[] {
  if (!reading.readable) return ["couldn't read it"];
  const out: string[] = [];
  if (!reading.sure) out.push("not sure of its reading");
  out.push(...sketchProblems(sketch));
  const rocks = reading.givens.filter((g) => g.kind === "block").length;
  if (reading.genre === "simple-loop" && (reading.rows * reading.cols - rocks) % 2) out.push("an odd number of open cells can't hold a loop");
  if (reading.genre === "coats" && !reading.figure?.length) out.push("no pieces in the figure");
  if (reading.genre === "sudoku" && (reading.rows !== reading.cols || ![4, 6, 9].includes(reading.rows))) out.push("not a 4x4, 6x6 or 9x9 sudoku");
  if (reading.genre === "nonogram" && reading.pictureRows.length && (reading.pictureRows.length !== reading.rows || reading.pictureRows.some((r) => r.length !== reading.cols))) {
    out.push("the picture doesn't fill the grid");
  }
  return out;
}

/** A reading as sketch text: the genre line, then the puzzle as JSON. */
export function toSketch(r: Reading): string {
  const givens: Given[] = r.givens.flatMap((g) => givenOf(g) ?? []);
  for (const run of r.runs) givens.push(r.genre === "aquarium"
    ? { at: run.line, index: run.index, kind: "total", value: run.runs[0] ?? 0 }
    : { at: run.line, index: run.index, kind: "runs", value: run.runs });
  const own = new Set(((genres as Record<string, { rules: RuleSpec[] }>)[r.genre]?.rules ?? []).map(sameRule));
  const rules: RuleSpec[] = r.rules.map(({ rule, settings }) => ({ rule, ...ruleSettings(settings) }))
    // a rule the type has anyway, as it has it (easy-as-abc's "letters count 3", Three Coats' "painted")
    .filter((s: RuleSpec) => !own.has(sameRule(s)))
    // a panel-line without a symmetry is what every panel has already (one line)
    .filter((s: RuleSpec) => s.rule !== "panel-line" || s.symmetry);
  const figure = r.genre === "coats" && r.figure.length ? { pieces: r.figure } : undefined;
  const body: Omit<GridSpec, "genre"> = {
    size: figure ? [1, figure.pieces.length] : [r.rows, r.cols],
    ...(figure ? { figure } : {}),
    ...(r.areas.length ? { areas: r.areas } : {}),
    ...(rules.length ? { rules } : {}),
    ...(givens.length ? { givens } : {}),
    ...(r.genre === "nonogram" && r.pictureRows.length && !r.runs.length
      ? { picture: { rows: r.pictureRows, palette: Object.fromEntries([[".", "#ffffff"], ...r.palette.map((p) => [p.letter, p.color])]), ...(r.title ? { title: r.title } : {}) } }
      : {}),
  };
  return `${r.genre}\n${JSON.stringify(body, null, 1)}`;
}

/** A rule with its settings in a fixed order, to compare. */
const sameRule = (s: RuleSpec) => JSON.stringify(Object.entries(s).sort(([a], [b]) => a.localeCompare(b)));

const SIDES = ["top", "right", "bottom", "left"] as const;
const num = (t: string) => { const m = t.match(/-?\d+/); return m ? Number(m[0]) : null; };

/** The stretch of grid line from corner row, col towards the right or below (or left / above). */
function lineFrom(row: number, col: number, v: string): [[number, number], [number, number]] | null {
  if (/\b(right|across)\b/.test(v)) return [[row, col], [row, col + 1]];
  if (/\b(below|down)\b/.test(v)) return [[row, col], [row + 1, col]];
  if (/\bleft\b/.test(v)) return [[row, col - 1], [row, col]];
  if (/\b(above|up)\b/.test(v)) return [[row - 1, col], [row, col]];
  return null;
}
const lineColor = (v: string) => (/\bblue\b/.test(v) ? { color: "blue" as const } : /\byellow\b/.test(v) ? { color: "yellow" as const } : {});

/** A panel symbol's color word in a clue's text, if any. */
const symbolColor = (v: string) => SYMBOL_COLORS.find((c) => new RegExp(`\\b${c}\\b`).test(v));
/** A triangle's, shape's or eraser's color, kept only when it isn't the one it has anyway. */
const unusual = (v: string, usual: SymbolColor): { color?: SymbolColor } => { const c = symbolColor(v); return c && c !== usual ? { color: c } : {}; };

/** One given from the reader's row, col and value text (null if the value can't be read). */
export function givenOf({ kind, row, col, value }: Reading["givens"][number]): Given | null {
  const cell: [number, number] = [row, col], v = value.trim().toLowerCase();
  const side = SIDES.find((s) => v.includes(s));
  switch (kind) {
    case "number": { const n = num(v); return n === null ? null : { at: "cell", cell, kind, value: n }; }
    case "count": { const n = num(v); return n === null ? null : { at: "corner", corner: cell, kind, value: n }; }
    case "block": return { at: "cell", cell, kind };
    case "symbol": {
      // a colored symbol (a rose) is its color's name
      const color = SYMBOL_COLORS.find((c) => v === c || v === `${c} rose` || v === `${c} symbol`);
      return value.trim() ? { at: "cell", cell, kind, value: color ?? value.trim() } : null;
    }
    case "palisade": {
      const n = num(v);
      return n === null || n < 0 || n > 4 ? null : { at: "cell", cell, kind, value: n, ...(n === 2 && /\b(opposite|straight|parallel)\b/.test(v) ? { opposite: true } : {}) };
    }
    case "compass": {
      const out: { n?: number; e?: number; s?: number; w?: number } = {};
      for (const m of v.matchAll(/([nesw])\s*=?\s*(\d+)/g)) out[m[1] as "n" | "e" | "s" | "w"] = Number(m[2]);
      return { at: "cell", cell, kind, value: out };
    }
    case "wall": case "twins": case "opposites": {
      const other: [number, number] = v.includes("below") || v.includes("down") ? [row + 1, col] : [row, col + 1];
      return { at: "border", cells: [cell, other], kind };
    }
    case "inequality": {
      const below = /\b(below|down)\b/.test(v), other: [number, number] = below ? [row + 1, col] : [row, col + 1];
      // the sign points to the smaller region: "<" (or "^") the top / left cell, ">" (or "v") the other
      const sign = v.replace(/\b(right|below|down|across)\b/g, "").match(/[<>^v]/)?.[0];
      if (!sign) return null;
      return { at: "border", cells: sign === "<" || sign === "^" ? [cell, other] : [other, cell], kind };
    }
    case "difference": {
      const n = num(v), other: [number, number] = /\b(below|down)\b/.test(v) ? [row + 1, col] : [row, col + 1];
      return n === null || n < 0 ? null : { at: "border", cells: [cell, other], kind, value: n };
    }
    case "watchtower": { const n = num(v); return n === null || n < 1 || n > 4 ? null : { at: "corner", corner: cell, kind, value: n }; }
    case "bank": {
      const blocks = [...v.matchAll(/(-?\d+)\s*,\s*(-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
      return blocks.length ? { at: "aside", kind, value: normalShape(blocks) } : null;
    }
    case "dots": {
      const d = [...v.replace(/hidden|dashed/g, "")].filter((c) => "123".includes(c)).map(Number);
      return d.length ? { at: "cell", cell, kind, value: d, ...(/\b(hidden|dashed)\b/.test(v) ? { hidden: true } : {}) } : null;
    }
    case "pearl": return { at: "cell", cell, kind, value: v.includes("black") ? "black" : "white" };
    case "first": case "skyscraper": { const n = num(v); return side && n !== null ? { at: "edge", cell, side, kind, value: n } : null; }
    case "door": return side ? { at: "edge", cell, side, kind, role: v.includes("out") ? "out" : "in" } : null;
    case "thermo": {
      const cells = [...v.matchAll(/(\d+)\s*,\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
      return cells.length > 1 ? { at: "cells", cells, kind } : null;
    }
    case "galaxy": return { at: "point", point: cell, kind };
    // panels
    case "start": return { at: "corner", corner: cell, kind, ...lineColor(v) };
    case "end": return { at: "corner", corner: cell, kind };
    case "hexagon": { const corners = lineFrom(row, col, v); return corners ? { at: "line", corners, kind, ...lineColor(v) } : { at: "corner", corner: cell, kind, ...lineColor(v) }; }
    case "gap": { const corners = lineFrom(row, col, v); return corners ? { at: "line", corners, kind } : null; }
    case "square": case "star": {
      // a color the panel can't show is read as black (the creator sees it and can change it)
      const color: SymbolColor = symbolColor(v) ?? "black";
      return { at: "cell", cell, kind, color };
    }
    case "triangle": { const n = num(v) ?? ([...v].filter((c) => "▲△▴▵".includes(c)).length || null); return n !== null && n >= 1 && n <= 3 ? { at: "cell", cell, kind, value: n, ...unusual(v, "orange") } : null; }
    case "shape": {
      const blocks = [...v.matchAll(/(-?\d+)\s*,\s*(-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
      if (!blocks.length) return null;
      const negative = /\b(negative|hollow|outlined)\b/.test(v);
      // the top-left block at 0,0, whatever the reader counted from
      const r0 = Math.min(...blocks.map((b) => b[0])), c0 = Math.min(...blocks.map((b) => b[1]));
      const cells = [...new Map(blocks.map(([r, c]) => [`${r - r0},${c - c0}`, [r - r0, c - c0] as [number, number]])).values()];
      return {
        at: "cell", cell, kind, value: cells,
        ...(/\b(rotate|rotated|rotates|tilted|turn|turns)\b/.test(v) ? { rotate: true } : {}),
        ...(negative ? { negative: true } : {}),
        ...unusual(v, negative ? "blue" : "yellow"),
      };
    }
    case "eraser": return { at: "cell", cell, kind, ...unusual(v, "white") };
  }
}

/** A rule's settings from text like "is 4", "min 2 max 3", "box 2 3", "of symbol", "cover". */
export function ruleSettings(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}, words = text.toLowerCase().replace(/[=:,]/g, " ").replace(/(\d)\s*[x×]\s*(\d)/g, "$1 $2").split(/\s+/).filter(Boolean);   // "box 2x3" is two numbers; "max" keeps its x
  for (let k = 0; k < words.length; k++) {
    const w = words[k], next = words[k + 1];
    if (w === "box") { const a = Number(words[k + 1]), b = Number(words[k + 2]); if (a > 0 && b > 0) out.box = [a, b]; k += 2; }
    else if (w === "cover") out.cover = true;
    else if (w === "outline") out.outline = true;
    else if (w === "symmetry" && next && (SYMMETRIES as string[]).includes(next)) { out.symmetry = next; k++; }
    else if ((SYMMETRIES as string[]).includes(w)) out.symmetry = w;
    else if (w === "of" && next) { out.of = next; k++; }
    else if (next !== undefined && !Number.isNaN(Number(next))) { out[w] = Number(next); k++; }
  }
  return out;
}

/** Bytes to base64 without blowing the stack on big images. */
export function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Does a reading parse as a playable puzzle? (Problems are shown to the creator to fix.) */
export const sketchProblems = (sketch: string) => {
  const p = parseSketch(sketch);
  return p.ok ? [] : p.errors;
};
