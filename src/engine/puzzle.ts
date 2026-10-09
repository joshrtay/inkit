// Genres (presets of marks + rules + style), turning a description into a Puzzle, and
// checking a whole board against every rule.
import { figureGrid, hexGrid, latticeGrid, squareGrid, type Grid } from "./geometry.ts";
import { regionsOf, type Regions } from "./derive.ts";
import { blockFor, sharesProblem, tileCount } from "./rules.ts";
import type { Board, Given, GridSpec, GridStyle, MarkKind, Problem, Puzzle, RuleSpec, Side } from "./types.ts";

/** `solutions`: how many a published puzzle may have: exactly one (most types), or any number but
 *  none ("some": panels, where any line that obeys the symbols solves it, as in the game). */
export interface Genre { marks: MarkKind[]; rules: RuleSpec[]; style: GridStyle; hearts?: number; solutions?: "one" | "some"; geometry?: GridSpec["geometry"] }

export const genres = {
  slitherlink: {
    marks: ["fence"],
    rules: [{ rule: "loop", of: "fence" }, { rule: "sides" }],
    style: { grid: "dots" },
  },
  nurikabe: {
    marks: ["shade"],
    rules: [{ rule: "size-clue" }, { rule: "one-each", of: "number" }, { rule: "connected" }, { rule: "no-pool" }],
    style: {},
  },
  // Simple Loop: one loop through every open cell, around rocks and walls (Wyatt's Round the Bend)
  "simple-loop": {
    marks: ["loop"],
    rules: [{ rule: "loop", of: "loop", cover: true }],
    style: {},
  },
  // Simple Path (a Hamiltonian path): one path from the way in to the way out through every
  // open cell, around rocks and walls
  "simple-path": {
    marks: ["loop"],
    rules: [{ rule: "path", cover: true }],
    style: {},
  },
  // Star Battle: n stars in every row, column and outlined area; stars never touch, not even
  // at a corner
  "star-battle": {
    marks: ["shade"],
    rules: [{ rule: "shaded-per-line", n: 1 }, { rule: "shaded-per-area", n: 1 }, { rule: "no-touch" }],
    style: { shaded: "star", empty: "dot" },
  },
  // Akari: light bulbs in white cells light their row and column up to a black cell; every white
  // cell is lit, no bulb shines on another, and a number on a black cell counts the bulbs beside it
  akari: {
    marks: ["shade"],
    rules: [{ rule: "lit" }, { rule: "adjacent-count" }],
    style: { shaded: "bulb", empty: "dot" },
  },
  // Shikaku: cut the grid into rectangles, each holding one number: its size
  shikaku: {
    marks: ["regions"],
    rules: [{ rule: "rectangles" }, { rule: "one-each", of: "number" }, { rule: "size-clue" }],
    style: { palette: ["#e2667a", "#4f9fdc", "#f2c23a", "#6cbf7e", "#a77bd6", "#f29a52"] },
  },
  // Numberlink: join each pair of equal numbers with a line through the cells; lines never branch,
  // cross or touch numbers they don't join. (Connectlink: with cover, every cell is used.)
  numberlink: {
    marks: ["loop"],
    rules: [{ rule: "links" }],
    style: {},
  },
  // Masyu: one loop through cell centres; it goes straight through white pearls and turns at
  // black ones (with the extra conditions on the neighbouring cells)
  masyu: {
    marks: ["loop"],
    rules: [{ rule: "loop", of: "loop" }, { rule: "pearls" }],
    style: {},
  },
  // Cave: shade cells so the white cells make one connected cave, every shaded group reaches the
  // edge, and each number counts the white cells it sees in a straight line (itself included)
  cave: {
    marks: ["shade"],
    rules: [{ rule: "unshaded-connected" }, { rule: "shaded-to-edge" }, { rule: "sight" }],
    style: { empty: "dot" },
  },
  // Aquarium: fill some cells of the outlined tanks with water, which settles level and from the
  // bottom up; numbers beside the rows and columns count the water cells
  aquarium: {
    marks: ["shade"],
    rules: [{ rule: "water" }, { rule: "line-totals" }],
    style: { shaded: "water", empty: "x" },
  },
  // Square Jam: split the grid into squares; four never meet at a point; a number is its square's side
  "square-jam": {
    marks: ["regions"],
    rules: [{ rule: "squares" }, { rule: "no-four-corners" }, { rule: "side-clue" }],
    style: { palette: ["#e2667a", "#4f9fdc", "#f2c23a", "#6cbf7e", "#a77bd6", "#f29a52"] },
  },
  // Wittgenstein Briquet: straight 1×3 blocks; numbers count block cells beside them; the cells left
  // over all connect
  "wittgenstein-briquet": {
    marks: ["shade"],
    rules: [{ rule: "bars", length: 3 }, { rule: "adjacent-count" }, { rule: "unshaded-connected" }],
    style: { empty: "x" },
  },
  // Hitori: shade repeated numbers away; shaded cells never share a side; the rest connect
  hitori: {
    marks: ["shade"],
    rules: [{ rule: "unique-unshaded" }, { rule: "no-adjacent" }, { rule: "unshaded-connected" }],
    style: { empty: "dot" },
  },
  // Minesweeper: every number counts the mines around it
  minesweeper: {
    marks: ["shade"],
    rules: [{ rule: "mine-count" }],
    style: { shaded: "mine", empty: "dot" },
  },
  // Spiral Galaxies: regions symmetric about their circles
  "spiral-galaxies": {
    marks: ["regions"],
    rules: [{ rule: "galaxies" }],
    style: { palette: ["#4f9fdc", "#f2c23a", "#e2667a", "#6cbf7e", "#a77bd6", "#f29a52"] },
  },
  // Thermo Sudoku: a sudoku whose thermometers rise from the bulb
  "thermo-sudoku": {
    marks: ["digit"],
    rules: [{ rule: "latin" }, { rule: "boxes" }, { rule: "thermo" }],
    style: {},
  },
  // Skyscrapers: a latin square of heights; numbers outside count the buildings seen
  skyscrapers: {
    marks: ["digit"],
    rules: [{ rule: "latin" }, { rule: "skyscrapers" }],
    style: {},
  },
  // Easy as ABC: each row and column has A, B and C once (other cells empty); letters outside are
  // the first one seen from that side
  "easy-as-abc": {
    marks: ["digit"],
    rules: [{ rule: "letters", count: 3 }, { rule: "first-seen" }],
    style: { symbols: "ABC" },
  },
  // Irregular Sudoku: a sudoku whose boxes are the outlined areas
  "irregular-sudoku": {
    marks: ["digit"],
    rules: [{ rule: "latin" }, { rule: "boxes" }],
    style: {},
  },
  // Nonogram: clues worked out from a picture (Wyatt's Picture Squares)
  nonogram: {
    marks: ["shade"],
    rules: [{ rule: "runs" }],
    style: { major: 5, empty: "x" },
  },
  sudoku: {
    marks: ["digit"],
    rules: [{ rule: "latin" }, { rule: "boxes" }],
    style: {},
  },
  // Number Line Maze: numbers on the corners count the walls touching them; the walls make a
  // perfect maze between two doors in the outside edge; then the player walks it
  maze: {
    marks: ["fence"],
    rules: [{ rule: "corner-count" }, { rule: "perfect-maze" }],
    style: { grid: "dots" },
  },
  // RYB: paint every piece of a figure red, yellow or blue; a piece's dots ask for
  // neighbours of their colors. A wrong color is turned away and costs a heart.
  coats: {
    marks: ["paint"],
    rules: [{ rule: "painted" }, { rule: "neighbor-dots" }],
    style: { palette: ["#ef5a6a", "#f7cf3d", "#3fb0e6"] },
    hearts: 3,
  },
  // Panel: line puzzles in the style of The Witness (panel.ts): a line along the grid lines from a
  // start circle to an end, cutting the grid into regions; the symbols say where it goes, and mix
  // freely. With symmetry (a puzzle's own panel-line rule) there are two mirrored lines.
  // Any line that obeys the symbols solves a panel, so a panel needs a solution, not exactly one.
  panel: { marks: ["fence"], rules: [{ rule: "panel-line" }, { rule: "panel-symbols" }], style: {}, solutions: "some" },
  // our region-division puzzles in the style of The Artisan of Glimmith: each puzzle lists its rules
  panes: {
    marks: ["regions"],
    rules: [],
    style: { palette: ["#e2667a", "#4f9fdc", "#f2c23a", "#6cbf7e", "#a77bd6", "#f29a52"] },
  },
  // Binary Puzzle (sold as Binairo and Takuzu, both trademarks): paint every cell one of two colors; each row and column is half and half, no
  // three in a row are one color, and no two rows (or columns) are the same
  "binary-puzzle": {
    marks: ["paint"],
    rules: [{ rule: "line-shares" }, { rule: "no-three-in-a-row" }, { rule: "unique-lines" }],
    style: { palette: ["#ef5a6a", "#3fb0e6"] },
  },
  // Abstract Art (Beast Academy's): paint every cell one of 2 or 3 colors so each row and column has its
  // share of each (a puzzle's own line-shares: half and half, a third each, a third and two thirds);
  // a puzzle may add no-three-in-a-row or unique-lines. The palette is the colors (2 or 3).
  "abstract-art": {
    marks: ["paint"],
    rules: [{ rule: "line-shares" }],
    style: { palette: ["#3fb0e6", "#f7cf3d"] },
  },
  // Number Fill-In: black cells, and across and down slots of 2 or more white cells; every number on
  // the list goes into one slot. Digits 0-9 are the symbols 1-10.
  "fill-in": {
    marks: ["digit"],
    rules: [{ rule: "fill-in" }],
    style: { symbols: "0123456789" },
  },
  // Hidoku (a number snake): fill every open cell with 1 to N so each number touches the next, at a
  // side or a corner. Without diagonals (a puzzle's own number-path rule) it's sides only.
  hidoku: { marks: ["digit"], rules: [{ rule: "number-path", diagonals: true }], style: {} },
  // Honeycomb Paths: the same on hexagons, each touching six others
  "honeycomb-paths": { marks: ["digit"], rules: [{ rule: "number-path" }], style: {}, geometry: "hex" },
  // Hive: fill every hexagon with the smallest number none of its neighbours has
  hive: { marks: ["digit"], rules: [{ rule: "smallest-missing" }], style: {}, geometry: "hex" },
  // Pythagorean Paths: join the dots on a lattice into one path of straight segments whose lengths are
  // the listed ones (√5 and so on), each used once; it never crosses itself
  "pythagorean-paths": { marks: ["loop"], rules: [{ rule: "distance-path" }], style: {}, geometry: "lattice" },
  // Fillomino: split the grid into regions; a number is its region's size, and regions of the same
  // size never share a side. A puzzle may also allow only some sizes (its own allowed-sizes rule).
  fillomino: {
    marks: ["regions"],
    rules: [{ rule: "size-clue" }, { rule: "neighbors-differ-size" }],
    style: { palette: ["#f2c23a", "#4f9fdc", "#e2667a", "#6cbf7e", "#a77bd6", "#f29a52"] },
  },
  // Sum Blobs (Beast Academy's): every cell has a number; split the grid into regions whose numbers each add
  // up to the target (the puzzle's own region-sum rule; 10 if it doesn't say)
  "sum-blobs": {
    marks: ["regions"],
    rules: [{ rule: "region-sum", is: 10 }],
    style: { palette: ["#6cbf7e", "#f2c23a", "#4f9fdc", "#e2667a", "#a77bd6", "#f29a52"] },
  },
  // Polyomino Packing: cut the board (rocks are holes, outside it) into the bank's pieces, each used
  // exactly once, turned or flipped any way
  "polyomino-packing": {
    marks: ["regions"],
    rules: [{ rule: "shape-bank", once: true }],
    style: { palette: ["#a77bd6", "#f2c23a", "#4f9fdc", "#e2667a", "#6cbf7e", "#f29a52"] },
  },
  // Connect the Critters (Beast Academy's): shade cells to place the bank's pieces, each once and only turned;
  // together they cover every critter and make one connected group
  "connect-the-critters": {
    marks: ["shade"],
    rules: [{ rule: "pieces" }, { rule: "cover-symbols" }, { rule: "connected" }],
    style: { empty: "dot" },
  },
  // Find the Cut Line (Beast Academy's): cut the board (rocks are holes) into two pieces (or three: the puzzle's own
  // region-count), each symmetric: a mirror image of itself, the same turned halfway round, or either
  "find-the-cut-line": {
    marks: ["regions"],
    rules: [{ rule: "region-count", is: 2 }, { rule: "symmetric-regions" }],
    style: { palette: ["#4f9fdc", "#e2667a", "#f2c23a", "#6cbf7e", "#a77bd6", "#f29a52"] },
  },
  // Twins and Triplets (Beast Academy's): place a set of tiles,
  // every shape in every colour once, one per open cell, so tiles side by side share a colour or a
  // shape. Tiles are digits (rules.ts tileOf); given ones are placed already.
  "twins-and-triplets": {
    marks: ["digit"],
    rules: [{ rule: "tiles", kinds: 2, colors: 3 }, { rule: "shared-feature" }],
    style: {},
  },
} satisfies Record<string, Genre>;

/** The colors an Abstract Art puzzle can use (its palette is the first 2 or 3). */
export const BALANCE_COLORS = ["#3fb0e6", "#f7cf3d", "#ef5a6a"];

/** Must a puzzle of this genre have exactly one solution (most), or just one or more (panels)? */
export const needsOneSolution = (genre: string | undefined) => (genre ? (genres as Record<string, Genre>)[genre]?.solutions : undefined) !== "some";

/** Every genre's name. The visual editor and the sketch reader list them all, so the build fails
 *  if a new genre isn't added there too. */
export type GenreName = keyof typeof genres;
export const GENRE_NAMES = Object.keys(genres) as GenreName[];

/** `unfinished`: a puzzle being edited may be missing what makes it playable (a maze's second door,
 *  an area painted in two pieces) and still be drawn; checking and playing it still fail. */
export function makePuzzle(spec: GridSpec, { unfinished = false }: { unfinished?: boolean } = {}): Puzzle {
  const genre = spec.genre ? (genres as Record<string, Genre>)[spec.genre] : undefined;
  if (spec.genre && !genre) throw new Error(`unknown genre "${spec.genre}"`);
  const fig = spec.figure ? figureGrid(spec.figure.pieces) : null;
  const geometry = spec.geometry ?? genre?.geometry ?? "square";
  const [rows0, cols0] = spec.size;
  // a lattice's links join its dots, so they're found first
  const pegCells = (spec.givens ?? []).flatMap((g) => (g.kind === "peg" && g.cell[0] >= 0 && g.cell[1] >= 0 && g.cell[0] < rows0 && g.cell[1] < cols0 ? [g.cell[0] * cols0 + g.cell[1]] : []));
  const grid = fig ? fig.grid : geometry === "hex" ? hexGrid(rows0, cols0) : geometry === "lattice" ? latticeGrid(rows0, cols0, pegCells) : squareGrid(rows0, cols0);
  const cellGivens = new Map<number, Given[]>(), borderGivens = new Map<number, Given[]>(), cornerGivens = new Map<number, Given[]>();
  const doors = new Map<number, "in" | "out">();
  const edgeClues: Puzzle["edgeClues"] = [], thermos: number[][] = [], galaxies: [number, number][] = [];
  const rowRuns = new Map<number, number[]>(), colRuns = new Map<number, number[]>();
  const rowTotals = new Map<number, number>(), colTotals = new Map<number, number>();
  const blocked = new Set<number>(), walls = new Set<number>(), gaps = new Set<number>();
  const lineGivens = new Map<number, Given[]>();
  const bank: [number, number][][] = [];
  const pegs: number[] = [];
  let lengths: number[] | null = null;
  const push = <K>(m: Map<K, Given[]>, k: K, g: Given) => m.set(k, [...(m.get(k) ?? []), g]);
  const givens = [...(spec.givens ?? []), ...pictureClues(spec)];
  for (const g of givens) {
    if (g.at === "cell") {
      if (g.cell[0] < 0 || g.cell[1] < 0 || g.cell[0] >= grid.rows || g.cell[1] >= grid.cols) throw new Error(`cell ${g.cell[0]},${g.cell[1]} is outside the ${fig ? "figure" : "grid"}`);
      push(cellGivens, grid.cell(...g.cell), g);
      if (g.kind === "block") blocked.add(grid.cell(...g.cell));
      if (g.kind === "palisade" && (!Number.isInteger(g.value) || g.value < 0 || g.value > 4)) throw new Error(`a palisade mark shows 0 to 4 borders (cell ${g.cell[0]},${g.cell[1]} has ${g.value})`);
      if (g.kind === "color" && (!Number.isInteger(g.value) || g.value < 1)) throw new Error(`a printed color is a palette color, 1 or more (cell ${g.cell[0]},${g.cell[1]} has ${g.value})`);
      if (g.kind === "number" && g.letter !== undefined && !/^[A-Z]$/.test(g.letter)) throw new Error(`a cipher letter is one capital letter (cell ${g.cell[0]},${g.cell[1]} has "${g.letter}")`);
      if (g.kind === "peg") {
        if (grid.kind !== "lattice") throw new Error("a dot on a lattice point needs a lattice (Pythagorean Paths)");
        if (pegs.includes(grid.cell(...g.cell))) throw new Error(`two dots on one point (${g.cell[0]},${g.cell[1]})`);
        pegs.push(grid.cell(...g.cell));
      }
    } else if (g.at === "border") {
      const e = grid.borderBetween(grid.cell(...g.cells[0]), grid.cell(...g.cells[1]));
      if (e < 0) throw new Error(`a ${g.kind} mark needs two neighbouring cells`);
      push(borderGivens, e, g);
      if (g.kind === "wall") walls.add(grid.borders[e].link);
      if (g.kind === "difference" && (!Number.isInteger(g.value) || g.value < 0)) throw new Error(`a difference is a whole number, 0 or more (it's ${g.value})`);
    } else if (g.at === "corner") {
      const [r, c] = g.corner;
      if (r < 0 || c < 0 || r > grid.rows || c > grid.cols) throw new Error(`corner ${r},${c} is outside the grid`);
      if (g.kind === "end" && r > 0 && c > 0 && r < grid.rows && c < grid.cols) throw new Error(`an end goes on the outside edge (corner ${r},${c} isn't)`);
      if (g.kind === "watchtower" && (!Number.isInteger(g.value) || g.value < 1 || g.value > 4)) throw new Error(`a watchtower counts 1 to 4 regions (corner ${r},${c} has ${g.value})`);
      push(cornerGivens, grid.corner(r, c), g);
    } else if (g.at === "aside" && g.kind === "lengths") {
      if (lengths) throw new Error("a puzzle has one list of lengths");
      if (!Array.isArray(g.value) || g.value.some((v) => !Number.isInteger(v) || v < 1)) throw new Error("the lengths are written as whole squares, 1 or more (5 is √5)");
      lengths = [...g.value];
    } else if (g.at === "aside") {
      if (!Array.isArray(g.value) || !g.value.length || !connectedShape(g.value)) throw new Error("a shape in the shape bank is one or more squares joined side to side");
      bank.push(normalShape(g.value));
    } else if (g.at === "line") {
      const e = lineBetween(grid, g.corners);
      if (e < 0) throw new Error(`a ${g.kind} goes on a stretch of grid line between two neighbouring corners`);
      push(lineGivens, e, g);
      if (g.kind === "gap") gaps.add(e);
    } else if (g.at === "edge") {
      const e = outsideBorder(grid, g.cell, g.side);
      if (e < 0) throw new Error(`a ${g.kind === "door" ? "door" : "clue outside the grid"} goes on the outside edge (row ${g.cell[0]}, column ${g.cell[1]}, ${g.side} isn't)`);
      if (g.kind === "door") doors.set(e, g.role);
      else edgeClues.push({ cell: grid.cell(...g.cell), side: g.side, kind: g.kind, value: g.value });
    } else if (g.at === "cells") {
      const cells = g.cells.map(([r, c]) => {
        if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) throw new Error(`cell ${r},${c} is outside the grid`);
        return grid.cell(r, c);
      });
      if (cells.length < 2 || g.cells.some(([r, c], k) => k > 0 && Math.max(Math.abs(r - g.cells[k - 1][0]), Math.abs(c - g.cells[k - 1][1])) !== 1))
        throw new Error("a thermometer runs through two or more cells, each next to the one before");
      thermos.push(cells);
    } else if (g.at === "point") {
      const [y, x] = g.point;
      if (y < 1 || x < 1 || y > 2 * grid.rows - 1 || x > 2 * grid.cols - 1) throw new Error(`a galaxy centre must be inside the grid (${y},${x})`);
      galaxies.push([y, x]);
    } else if (g.kind === "total") (g.at === "row" ? rowTotals : colTotals).set(g.index, g.value);
    else (g.at === "row" ? rowRuns : colRuns).set(g.index, g.value);
  }
  const marks = spec.marks ?? genre?.marks ?? [];
  if (fig && (marks.length !== 1 || marks[0] !== "paint")) throw new Error("a figure of pieces is played by painting them");
  // a puzzle's own rule replaces the genre's rule of the same name (e.g. 2 stars instead of 1)
  const own = new Set((spec.rules ?? []).map((s) => s.rule));
  const rules = [...(genre?.rules ?? []).filter((s) => !own.has(s.rule)), ...(spec.rules ?? [])];
  rules.forEach(blockFor);   // fails early on an unknown rule
  const tiles = rules.find((s) => s.rule === "tiles");   // Twins and Triplets: one digit per tile
  if (!unfinished && rules.some((s) => s.rule === "perfect-maze" || s.rule === "path")) {
    const roles = [...doors.values()];
    if (roles.filter((r) => r === "in").length !== 1 || roles.filter((r) => r === "out").length !== 1)
      throw new Error(`a ${rules.some((s) => s.rule === "path") ? "path" : "maze"} needs one way in and one way out on its outside edge`);
  }
  if (!unfinished && rules.some((s) => s.rule === "panel-line")) {
    const lines = rules.some((s) => s.rule === "panel-line" && s.symmetry) ? 2 : 1;
    const starts = givens.filter((x) => x.kind === "start").length, ends = givens.filter((x) => x.kind === "end").length;
    if (starts < lines || ends < lines) throw new Error(lines === 2 ? "a symmetry panel needs two start circles and two ends" : "a panel needs a start circle and an end");
  }
  const style: GridStyle = { ...genre?.style, ...spec.style };
  // a fill-in's digits are its symbols (0-9); its list is written in them
  const fillIn = rules.some((s) => s.rule === "fill-in");
  const symbols = style.symbols ?? "0123456789";
  const entries = (spec.entries ?? []).map((e) => [...String(e)].map((ch) => {
    const d = symbols.indexOf(ch);
    if (d < 0) throw new Error(`"${e}" on the list can't be written with ${symbols}`);
    return d + 1;
  }));
  if (!unfinished) for (const s of rules) if (s.rule === "line-shares") {
    const problem = sharesProblem(s, style, grid.rows, grid.cols);
    if (problem) throw new Error(problem);
  }
  if (grid.kind === "hex" || grid.kind === "lattice") {
    const used = givens.filter((g) => !(g.at === "cell" && ["number", "block", "peg"].includes(g.kind)) && !(g.at === "aside" && g.kind === "lengths"));
    if (used.length) throw new Error(`a ${grid.kind === "hex" ? "board of hexagons" : "lattice"} can't have a ${used[0].kind} clue`);
  }
  // a number path's numbers run 1 to the number of open cells
  const pathDigits = rules.some((s) => s.rule === "number-path") ? grid.cellCount - blocked.size : 0;
  // the smallest missing number is at most one more than a cell's neighbours
  const mexDigits = rules.some((s) => s.rule === "smallest-missing") ? 1 + Math.max(0, ...grid.cellLinks.map((ls) => ls.length)) : 0;
  return {
    spec, grid, cellGivens, borderGivens, cornerGivens, lineGivens, gaps, doors, rules, rowRuns, colRuns, rowTotals, colTotals, blocked, walls,
    digits: (rules.find((s) => s.rule === "letters")?.count as number | undefined) ?? (tiles ? tileCount(tiles) : fillIn ? symbols.length : (pathDigits || mexDigits || spec.size[1])),
    pegs, lengths,
    blanks: rules.some((s) => s.rule === "letters") || !!tiles, edgeClues, thermos, galaxies,
    bank, areas: areasOf(spec, grid, unfinished), figure: fig?.pieces ?? null, hearts: spec.hearts ?? genre?.hearts ?? 0, marks,
    style, entries,
  };
}

/** A shape's cells moved so its top-left is at 0,0 (duplicates dropped), in reading order. */
export function normalShape(cells: [number, number][]): [number, number][] {
  const r0 = Math.min(...cells.map((x) => x[0])), c0 = Math.min(...cells.map((x) => x[1]));
  const keys = [...new Set(cells.map(([r, c]) => `${r - r0},${c - c0}`))];
  return keys.map((k) => k.split(",").map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
/** Are a shape's cells joined side to side? */
export function connectedShape(cells: [number, number][]): boolean {
  const left = new Set(cells.map((x) => `${x[0]},${x[1]}`)), stack = [cells[0]];
  left.delete(`${cells[0][0]},${cells[0][1]}`);
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const [y, x] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) if (left.delete(`${y},${x}`)) stack.push([y, x]);
  }
  return left.size === 0;
}

/** The stretch of grid line (border) between two neighbouring corners, or -1. */
export function lineBetween(grid: Grid, [[r1, c1], [r2, c2]]: [[number, number], [number, number]]): number {
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1 || Math.min(r1, r2, c1, c2) < 0 || Math.max(r1, r2) > grid.rows || Math.max(c1, c2) > grid.cols) return -1;
  const a = grid.corner(r1, c1), b = grid.corner(r2, c2);
  return grid.cornerBorders[a].find((e) => grid.borders[e].corners.includes(b)) ?? -1;
}

/** The border on a cell's side, if it's on the outside edge of the grid (else -1). */
export function outsideBorder(grid: Grid, [r, c]: [number, number], side: Side): number {
  if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) return -1;
  const e = side === "top" ? r * grid.cols + c : side === "bottom" ? (r + 1) * grid.cols + c
    : (grid.rows + 1) * grid.cols + r * (grid.cols + 1) + (side === "left" ? c : c + 1);
  return grid.borders[e].cells.includes(-1) ? e : -1;
}

/** A puzzle's outlined areas: each cell's area, and each area's cells. */
function areasOf(spec: GridSpec, grid: Grid, unfinished = false): Puzzle["areas"] {
  if (!spec.areas) return null;
  const rows = spec.areas;
  if (spec.figure || rows.length !== grid.rows || rows.some((r) => [...r].length !== grid.cols))
    throw new Error(`the areas need ${grid.rows} rows of ${grid.cols} letters`);
  const index = new Map<string, number>(), of: number[] = [], cells: number[][] = [];
  rows.forEach((row) => [...row].forEach((ch) => {
    if (!index.has(ch)) { index.set(ch, cells.length); cells.push([]); }
    cells[index.get(ch)!].push(of.length); of.push(index.get(ch)!);
  }));
  // each letter must be one connected area
  if (!unfinished) for (const cs of cells) {
    const want = new Set(cs), seen = new Set([cs[0]]), stack = [cs[0]];
    while (stack.length) for (const l of grid.cellLinks[stack.pop()!]) for (const j of grid.links[l].cells) if (want.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
    if (seen.size !== cs.length) throw new Error(`area "${rows[grid.rc(cs[0])[0]][grid.rc(cs[0])[1]]}" is in more than one piece`);
  }
  return { of, cells };
}

/** A nonogram's row and column clues, worked out from its picture (unless given). */
function pictureClues(spec: GridSpec): Given[] {
  if (!spec.picture || spec.givens?.some((g) => g.at === "row" || g.at === "col")) return [];
  const on = spec.picture.rows.map((row) => [...row].map((ch) => ch !== "."));
  const runs = (line: boolean[]) => { const out: number[] = []; let n = 0; for (const x of [...line, false]) { if (x) n++; else if (n) { out.push(n); n = 0; } } return out.length ? out : [0]; };
  return [
    ...on.map((row, r): Given => ({ at: "row", index: r, kind: "runs", value: runs(row) })),
    ...on[0].map((_, c): Given => ({ at: "col", index: c, kind: "runs", value: runs(on.map((row) => row[c])) })),
  ];
}

/** Every broken rule on this board; an empty list means it's solved. */
export function check(p: Puzzle, b: Board): Problem[] {
  let reg: Regions | undefined;
  const regions = () => (reg ??= regionsOf(p, b));
  const out: Problem[] = [];
  // a digit puzzle's given digits stay as given
  if (p.marks.includes("digit")) {
    const changed = [...p.cellGivens].filter(([i, gs]) => gs.some((g) => g.kind === "number" && b.digit[i] !== g.value)).map(([i]) => i);
    if (changed.length) out.push({ message: "The printed digits can't change.", cells: changed });
  }
  // a paint puzzle's printed colors stay as printed
  if (p.marks.includes("paint")) {
    const changed = [...p.cellGivens].filter(([i, gs]) => gs.some((g) => g.kind === "color" && b.color[i] !== g.value)).map(([i]) => i);
    if (changed.length) out.push({ message: "The printed colors can't change.", cells: changed });
  }
  // a region puzzle's given walls are borders drawn already: different regions on either side
  if (p.marks.includes("regions") && p.walls.size) {
    const of = regions().of;
    const bad = [...p.walls].filter((l) => { const [a, c] = p.grid.links[l].cells; return of[a] === of[c]; });
    if (bad.length) out.push({ message: "A thick wall is a border: the cells on either side are in different regions.", borders: bad.map((l) => p.grid.links[l].border) });
  }
  return [...out, ...p.rules.flatMap((s) => blockFor(s).check(s, p, b, regions))];
}

/** The rules in plain words, for the "How to play" card. */
export const describe = (p: Puzzle) => p.rules.map((s) => blockFor(s).describe(s, p));
