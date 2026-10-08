// Engine self-test: on small grids, try every possible board, keep the ones the
// TypeScript checks accept, and compare with every solution clingo finds. Any difference
// means a rule's encoding and its check disagree.
//
//   node src/engine/selftest.ts [rounds] [seed] [kind]   (kind: only that genre, or "panel")
import { makePuzzle, check } from "./puzzle.ts";
import { program, boardOf } from "./solve.ts";
import { regionsOf } from "./derive.ts";
import { solvePaint } from "./paint.ts";
import { blockFor, fillSlots } from "./rules.ts";
import { emptyBoard, type Board, type GridSpec, type Puzzle } from "./types.ts";

const rounds = Number(process.argv[2] ?? 40);
let seed = Number(process.argv[3] ?? 7);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const shuffle = <T>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };

/** A canonical string for a board, so the same solution compares equal either way. */
function key(p: Puzzle, b: Board): string {
  if (p.marks.includes("regions")) return regionsOf(p, b).of.join(",");
  if (p.marks.includes("shade")) return [...b.shade].map((x) => (x === 1 ? 1 : 0)).join("");
  if (p.marks.includes("loop")) return [...b.loop].map((x) => (x === 1 ? 1 : 0)).join("");
  if (p.marks.includes("digit")) return [...b.digit].join("");
  if (p.marks.includes("paint")) return [...b.color].join("");
  return [...b.fence].join("");
}

/** Every board for the puzzle's marks (cut sets / shadings / fences). */
function* allBoards(p: Puzzle): Generator<Board> {
  const g = p.grid;
  if (p.marks.includes("regions")) {
    const interior = g.links.map((l) => l.border);
    for (let m = 0; m < 1 << interior.length; m++) {
      const b = emptyBoard(g);
      interior.forEach((e, k) => { if (m & (1 << k)) b.cut[e] = 1; });
      yield b;
    }
  } else if (p.marks.includes("shade")) {
    const clues = p.rules.some((s) => blockFor(s).shadeClues);   // Hitori shades the numbers themselves
    const free = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => (clues ? !p.blocked.has(i) : !p.cellGivens.has(i)));
    for (let m = 0; m < 1 << free.length; m++) {
      const b = emptyBoard(g);
      free.forEach((i, k) => { if (m & (1 << k)) b.shade[i] = 1; });
      yield b;
    }
  } else if (p.marks.includes("loop")) {
    for (let m = 0; m < 1 << g.links.length; m++) {
      const b = emptyBoard(g);
      g.links.forEach((l, k) => { if (m & (1 << k)) b.loop[l.id] = 1; });
      yield b;
    }
  } else if (p.marks.includes("paint")) {
    const k = p.style.palette?.length || 3;
    // printed colors stay (Colour Balance, Binairo)
    const fixed = new Map<number, number>();
    for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "color") fixed.set(i, x.value);
    const free = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !fixed.has(i));
    for (let m = 0; m < k ** free.length; m++) {
      const b = emptyBoard(g);
      for (const [i, v] of fixed) b.color[i] = v;
      let x = m;
      for (const i of free) { b.color[i] = (x % k) + 1; x = Math.floor(x / k); }
      yield b;
    }
  } else if (p.marks.includes("digit")) {
    const base = p.blanks ? p.digits + 1 : p.digits, low = p.blanks ? 0 : 1;
    const fixed = new Map<number, number>();
    for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") fixed.set(i, x.value as number);
    // black cells (a fill-in's) stay empty
    const free = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !fixed.has(i) && !p.blocked.has(i));
    const total = base ** free.length;
    for (let m = 0; m < total; m++) {
      const b = emptyBoard(g);
      for (const [i, v] of fixed) b.digit[i] = v;
      let x = m;
      for (const i of free) { b.digit[i] = (x % base) + low; x = Math.floor(x / base); }
      yield b;
    }
  } else {
    for (let m = 0; m < 1 << g.borders.length; m++) {
      const b = emptyBoard(g);
      g.borders.forEach((e, k) => { if (m & (1 << k)) b.fence[e.id] = 1; });
      yield b;
    }
  }
}

/** Random outlined areas: k seeds that grow until every cell belongs to one. */
function randomAreas(rows: number, cols: number, k: number): string[] {
  const of = new Array<number>(rows * cols).fill(-1);
  shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, k).forEach((i, a) => (of[i] = a));
  while (of.includes(-1)) {
    const i = Math.floor(rand() * rows * cols);
    if (of[i] >= 0) continue;
    const [r, c] = [Math.floor(i / cols), i % cols];
    const near = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && x >= 0 && y < rows && x < cols && of[y * cols + x] >= 0);
    if (near.length) { const [y, x] = pick(near); of[i] = of[y * cols + x]; }
  }
  return Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).map((a) => "abcdefghij"[a]).join(""));
}

function randomSpec(): GridSpec {
  const kind = process.argv[4] ?? pick(["square-jam", "square-jam", "wittgenstein-briquet", "wittgenstein-briquet", "hitori", "hitori", "minesweeper", "minesweeper",
    "spiral-galaxies", "spiral-galaxies", "thermo-sudoku", "skyscrapers", "skyscrapers", "easy-as-abc", "easy-as-abc", "aquarium", "aquarium", "cave", "cave", "numberlink", "numberlink", "masyu", "masyu", "akari", "akari", "shikaku", "shikaku", "star-battle", "star-battle", "irregular-sudoku", "simple-path", "simple-path", "coats", "coats", "maze", "maze", "panes", "panes", "panes", "nurikabe", "slitherlink", "simple-loop", "simple-loop", "nonogram", "nonogram", "sudoku", "sudoku", "panel", "panel", "panel", "panel", "panel", "panel", "binairo", "binairo", "colour-balance", "colour-balance", "colour-balance", "fill-in", "fill-in", "fill-in"]);
  const cellOf = (i: number, cols: number): [number, number] => [Math.floor(i / cols), i % cols];
  if (kind === "panel") return randomPanel();
  if (kind === "simple-loop") {
    const [rows, cols] = pick([[3, 3], [3, 4], [2, 4]]);
    const givens: NonNullable<GridSpec["givens"]> = [];
    for (let i = 0; i < rows * cols; i++) if (rand() < 0.15) givens.push({ at: "cell", cell: cellOf(i, cols), kind: "block" });
    for (let k = 0; k < 2; k++) if (rand() < 0.5) {
      const r = Math.floor(rand() * rows), c = Math.floor(rand() * (cols - 1));
      givens.push({ at: "border", cells: [[r, c], [r, c + 1]], kind: "wall" });
    }
    return { genre: "simple-loop", size: [rows, cols], givens };
  }
  const num = (i: number, cols: number, v: number) => ({ at: "cell" as const, cell: cellOf(i, cols), kind: "number" as const, value: v });
  if (kind === "square-jam") {
    const [rows, cols] = pick([[3, 3], [2, 4], [3, 4]]);
    return { genre: "square-jam", size: [rows, cols], givens: [...shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, Math.floor(rand() * 4)).map((i) => num(i, cols, 1 + Math.floor(rand() * 2))), ...holesAndWalls(rows, cols)] };
  }
  if (kind === "wittgenstein-briquet") {
    const [rows, cols] = pick([[3, 3], [3, 4], [4, 4]]);
    return { genre: "wittgenstein-briquet", size: [rows, cols], givens: shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, Math.floor(rand() * 4)).map((i) => num(i, cols, Math.floor(rand() * 3))) };
  }
  if (kind === "hitori") {
    const [rows, cols] = pick([[3, 3], [3, 4]]);
    return { genre: "hitori", size: [rows, cols], givens: Array.from({ length: rows * cols }, (_, i) => num(i, cols, 1 + Math.floor(rand() * 3))) };
  }
  if (kind === "minesweeper") {
    const [rows, cols] = pick([[3, 3], [3, 4], [4, 4]]);
    return { genre: "minesweeper", size: [rows, cols], givens: shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, 1 + Math.floor(rand() * 4)).map((i) => num(i, cols, Math.floor(rand() * 4))) };
  }
  if (kind === "spiral-galaxies") {
    const [rows, cols] = pick([[2, 3], [3, 3], [2, 4]]);
    // rectangles are symmetric about their centres, so circles there always allow a solution;
    // sometimes one circle moves off centre
    const rects: [number, number, number, number][] = [];
    const split = (r: number, c: number, h: number, w: number) => {
      if (h * w > 1 && rand() < 0.6) {
        if (h > 1 && (w === 1 || rand() < 0.5)) { const k = 1 + Math.floor(rand() * (h - 1)); split(r, c, k, w); split(r + k, c, h - k, w); return; }
        if (w > 1) { const k = 1 + Math.floor(rand() * (w - 1)); split(r, c, h, k); split(r, c + k, h, w - k); return; }
      }
      rects.push([r, c, h, w]);
    };
    split(0, 0, rows, cols);
    const points = rects.map(([r, c, h, w]) => [2 * r + h, 2 * c + w] as [number, number]);
    if (rand() < 0.3) points[0] = [1 + Math.floor(rand() * (2 * rows - 1)), 1 + Math.floor(rand() * (2 * cols - 1))];
    return { genre: "spiral-galaxies", size: [rows, cols], givens: [...points.map((point) => ({ at: "point" as const, point, kind: "galaxy" as const })), ...holesAndWalls(rows, cols)] };
  }
  if (kind === "thermo-sudoku") {
    const solved = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
    const open = new Set(shuffle(Array.from({ length: 16 }, (_, i) => i)).slice(0, 4 + Math.floor(rand() * 3)));
    const givens: NonNullable<GridSpec["givens"]> = Array.from({ length: 16 }, (_, i) => i).filter((i) => !open.has(i)).map((i) => num(i, 4, solved[Math.floor(i / 4)][i % 4]));
    const start = pick([...open]), [r, c] = cellOf(start, 4), next: [number, number] = c + 1 < 4 ? [r, c + 1] : [r + 1 < 4 ? r + 1 : r - 1, c];
    givens.push({ at: "cells", cells: rand() < 0.5 ? [[r, c], next] : [next, [r, c]], kind: "thermo" });
    return { genre: "thermo-sudoku", size: [4, 4], givens };
  }
  if (kind === "skyscrapers") {
    const sides = ["top", "right", "bottom", "left"] as const, givens: NonNullable<GridSpec["givens"]> = [];
    for (let k = 0; k < 1 + Math.floor(rand() * 4); k++) {
      const side = pick([...sides]), at = Math.floor(rand() * 3);
      givens.push({ at: "edge", side, cell: side === "top" ? [0, at] : side === "bottom" ? [2, at] : side === "left" ? [at, 0] : [at, 2], kind: "skyscraper", value: 1 + Math.floor(rand() * 3) });
    }
    return { genre: "skyscrapers", size: [3, 3], givens };
  }
  if (kind === "easy-as-abc") {
    const sides = ["top", "right", "bottom", "left"] as const, givens: NonNullable<GridSpec["givens"]> = [];
    for (let k = 0; k < 1 + Math.floor(rand() * 4); k++) {
      const side = pick([...sides]), at = Math.floor(rand() * 3);
      givens.push({ at: "edge", side, cell: side === "top" ? [0, at] : side === "bottom" ? [2, at] : side === "left" ? [at, 0] : [at, 2], kind: "first", value: 1 + Math.floor(rand() * 2) });
    }
    return { genre: "easy-as-abc", size: [3, 3], rules: [{ rule: "letters", count: 2 }], givens, style: { symbols: "AB" } };
  }
  if (kind === "aquarium") {
    const [rows, cols] = pick([[3, 3], [3, 4], [4, 4]]);
    const givens: NonNullable<GridSpec["givens"]> = [];
    for (let r = 0; r < rows; r++) if (rand() < 0.3) givens.push({ at: "row", index: r, kind: "total", value: Math.floor(rand() * (cols + 1)) });
    for (let c = 0; c < cols; c++) if (rand() < 0.3) givens.push({ at: "col", index: c, kind: "total", value: Math.floor(rand() * (rows + 1)) });
    return { genre: "aquarium", size: [rows, cols], areas: randomAreas(rows, cols, 2 + Math.floor(rand() * 3)), givens };
  }
  if (kind === "cave") {
    const [rows, cols] = pick([[3, 3], [3, 4], [4, 4]]);
    const givens = shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, 1 + Math.floor(rand() * 3))
      .map((i) => ({ at: "cell" as const, cell: cellOf(i, cols), kind: "number" as const, value: 1 + Math.floor(rand() * (rows + cols - 1)) }));
    return { genre: "cave", size: [rows, cols], givens };
  }
  if (kind === "numberlink") {
    const [rows, cols] = pick([[3, 3], [2, 4], [3, 4]]);
    const spots = shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, pick([2, 4, 4, 5]));
    const givens = spots.map((i, k) => ({ at: "cell" as const, cell: cellOf(i, cols), kind: "number" as const, value: 1 + (k >> 1) }));
    return { genre: "numberlink", size: [rows, cols], givens, ...(rand() < 0.5 ? { rules: [{ rule: "links", cover: true }] } : {}) };
  }
  if (kind === "masyu") {
    const [rows, cols] = pick([[3, 3], [2, 4], [3, 4]]);
    const givens = shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, 1 + Math.floor(rand() * 3))
      .map((i) => ({ at: "cell" as const, cell: cellOf(i, cols), kind: "pearl" as const, value: rand() < 0.5 ? "white" as const : "black" as const }));
    return { genre: "masyu", size: [rows, cols], givens };
  }
  if (kind === "akari") {
    const [rows, cols] = pick([[3, 3], [3, 4], [4, 4]]);
    const givens: NonNullable<GridSpec["givens"]> = [];
    for (let i = 0; i < rows * cols; i++) if (rand() < 0.25) {
      givens.push({ at: "cell", cell: cellOf(i, cols), kind: "block" });
      // a number, or (a cipher) a letter standing for one
      if (rand() < 0.5) givens.push({ at: "cell", cell: cellOf(i, cols), kind: "number", value: Math.floor(rand() * 3), ...(rand() < 0.4 ? { value: 0, letter: pick(["A", "B", "C"]) } : {}) });
    }
    return { genre: "akari", size: [rows, cols], givens };
  }
  if (kind === "binairo" || kind === "colour-balance") {
    // Binairo (two colors, half and half, no three in a row, no two lines alike), or Colour Balance's
    // shares with two or three colors, sometimes with Binairo's other rules; a few printed colors
    const [rows, cols, parts] = kind === "binairo" ? pick([[4, 4, [1, 1]], [4, 4, [1, 1]], [2, 4, [1, 1]]] as [number, number, number[]][])
      : pick([[4, 4, [1, 1]], [2, 4, [1, 1]], [3, 3, [1, 2]], [3, 3, [1, 1, 1]], [3, 3, [2, 1]]] as [number, number, number[]][]);
    const k = parts.length, rules: NonNullable<GridSpec["rules"]> = [];
    if (kind === "colour-balance") {
      if (k !== 2 || parts[0] !== parts[1] || rand() < 0.3) rules.push({ rule: "line-shares", parts });
      if (rand() < 0.3) rules.push({ rule: "no-three-in-a-row" });
      if (rand() < 0.3) rules.push({ rule: "unique-lines" });
    }
    const givens = shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, Math.floor(rand() * (kind === "binairo" ? 3 : 4)))
      .map((i) => ({ at: "cell" as const, cell: cellOf(i, cols), kind: "color" as const, value: 1 + Math.floor(rand() * k) }));
    return { genre: kind, size: [rows, cols], rules, givens, ...(k === 3 ? { style: { palette: ["#3fb0e6", "#f7cf3d", "#ef5a6a"] } } : {}) };
  }
  if (kind === "fill-in") {
    // a few black cells, a random filling and its list (sometimes with a number changed), then most of
    // the digits printed so every board can be tried (10^3)
    const [rows, cols] = pick([[2, 2], [2, 3], [3, 3]]);
    const p0 = makePuzzle({ genre: "fill-in", size: [rows, cols], givens: Array.from({ length: rows * cols }, (_, i) => i).filter(() => rand() < 0.2).map((i) => ({ at: "cell", cell: cellOf(i, cols), kind: "block" })) });
    const white = Array.from({ length: rows * cols }, (_, i) => i).filter((i) => !p0.blocked.has(i));
    const digit = Array.from({ length: rows * cols }, () => 1 + Math.floor(rand() * 3));
    const entries = fillSlots(p0).map((s) => s.map((i) => "0123456789"[digit[i] - 1]).join(""));
    if (entries.length && rand() < 0.3) entries[0] = [...entries[0]].map(() => pick(["0", "1", "2"])).join("");
    if (rand() < 0.15) entries.pop();
    const open = new Set(shuffle([...white]).slice(0, 3));
    return { genre: "fill-in", size: [rows, cols], entries, givens: [...(p0.spec.givens ?? []),
      ...white.filter((i) => !open.has(i)).map((i) => ({ at: "cell" as const, cell: cellOf(i, cols), kind: "number" as const, value: digit[i] }))] };
  }
  if (kind === "shikaku") {
    const [rows, cols] = pick([[2, 3], [3, 3], [2, 4], [3, 4]]);
    // split the grid into rectangles at random, then a number in each (sometimes a wrong one)
    const rects: [number, number, number, number][] = [];
    const split = (r: number, c: number, h: number, w: number) => {
      if (h * w > 1 && rand() < 0.6) {
        if (h > 1 && (w === 1 || rand() < 0.5)) { const k = 1 + Math.floor(rand() * (h - 1)); split(r, c, k, w); split(r + k, c, h - k, w); return; }
        if (w > 1) { const k = 1 + Math.floor(rand() * (w - 1)); split(r, c, h, k); split(r, c + k, h, w - k); return; }
      }
      rects.push([r, c, h, w]);
    };
    split(0, 0, rows, cols);
    const givens = rects.map(([r, c, h, w]) => ({ at: "cell" as const, cell: [r + Math.floor(rand() * h), c + Math.floor(rand() * w)] as [number, number], kind: "number" as const, value: rand() < 0.9 ? h * w : 1 + Math.floor(rand() * 4) }));
    return rand() < 0.2 ? { genre: "panes", size: [rows, cols], rules: [{ rule: "rectangles" }], givens: holesAndWalls(rows, cols) } : { genre: "shikaku", size: [rows, cols], givens: [...givens, ...holesAndWalls(rows, cols)] };
  }
  if (kind === "star-battle") {
    const size = pick([3, 4]);
    return { genre: "star-battle", size: [size, size], areas: randomAreas(size, size, size) };
  }
  if (kind === "irregular-sudoku") {
    const areas = randomAreas(4, 4, 4);
    const givens = Array.from({ length: 16 }, (_, i) => i).filter(() => rand() < 0.6)
      .map((i) => ({ at: "cell" as const, cell: cellOf(i, 4), kind: "number" as const, value: 1 + Math.floor(rand() * 4) }));
    while (16 - givens.length > 7) { const i = Math.floor(rand() * 16); if (!givens.some((g) => g.cell[0] * 4 + g.cell[1] === i)) givens.push({ at: "cell", cell: cellOf(i, 4), kind: "number", value: 1 + Math.floor(rand() * 4) }); }
    return { genre: "irregular-sudoku", size: [4, 4], areas, givens };
  }
  if (kind === "simple-path") {
    const [rows, cols] = pick([[2, 3], [3, 3], [3, 4], [2, 4]]);
    const edge = (role: "in" | "out") => {
      const side = pick(["top", "right", "bottom", "left"] as const);
      const cell: [number, number] = side === "top" ? [0, Math.floor(rand() * cols)] : side === "bottom" ? [rows - 1, Math.floor(rand() * cols)]
        : side === "left" ? [Math.floor(rand() * rows), 0] : [Math.floor(rand() * rows), cols - 1];
      return { at: "edge" as const, kind: "door" as const, role, side, cell };
    };
    const givens: NonNullable<GridSpec["givens"]> = [edge("in"), edge("out")];
    for (let i = 0; i < rows * cols; i++) if (rand() < 0.12) givens.push({ at: "cell", cell: cellOf(i, cols), kind: "block" });
    if (rand() < 0.4) givens.push({ at: "border", cells: [[0, 0], [0, 1]], kind: "wall" });
    return { genre: "simple-path", size: [rows, cols], givens, ...(rand() < 0.2 ? { rules: [] } : {}) };
  }
  if (kind === "coats") {
    // a figure: a row of triangles over a row of squares, so pieces have 1-3 neighbours
    const pieces = [[[0, 0], [2, 0], [1, 1]], [[2, 0], [4, 0], [3, 1]], [[0, 0], [1, 1], [0, 2]], [[1, 1], [2, 0], [3, 1], [3, 2], [0, 2]], [[3, 1], [4, 0], [4, 2], [3, 2]], [[0, 2], [2, 2], [2, 3], [0, 3]]];
    const givens: NonNullable<GridSpec["givens"]> = [];
    for (let i = 0; i < pieces.length; i++) if (rand() < 0.5)
      givens.push({ at: "cell", cell: [0, i], kind: "dots", value: Array.from({ length: 1 + Math.floor(rand() * 2) }, () => 1 + Math.floor(rand() * 3)), ...(rand() < 0.3 ? { hidden: true } : {}) });
    const rules: GridSpec["rules"] = rand() < 0.4 ? [{ rule: "color-count", red: Math.floor(rand() * 4), blue: Math.floor(rand() * 3) }] : [];
    return { genre: "coats", size: [1, pieces.length], figure: { pieces }, givens, rules };
  }
  if (kind === "maze") {
    const [rows, cols] = pick([[2, 2], [2, 3], [3, 2]]);
    const sides = shuffle(["top", "right", "bottom", "left"] as const).slice(0, 2);
    const door = (side: (typeof sides)[number], role: "in" | "out") => ({
      at: "edge" as const, kind: "door" as const, role, side,
      cell: (side === "top" ? [0, Math.floor(rand() * cols)] : side === "bottom" ? [rows - 1, Math.floor(rand() * cols)]
        : side === "left" ? [Math.floor(rand() * rows), 0] : [Math.floor(rand() * rows), cols - 1]) as [number, number],
    });
    const givens: NonNullable<GridSpec["givens"]> = [door(sides[0], "in"), door(sides[1], "out")];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++)
      if (rand() < 0.3) givens.push({ at: "corner", corner: [r, c], kind: "count", value: 1 + Math.floor(rand() * 3) });
    if (rand() < 0.3) givens.push({ at: "border", cells: [[0, 0], [0, 1]], kind: "wall" });
    return { genre: "maze", size: [rows, cols], givens };
  }
  if (kind === "nonogram") {
    const [rows, cols] = pick([[3, 3], [3, 4], [2, 5]]);
    const rowsOf = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.5 ? "#" : ".")).join(""));
    return { genre: "nonogram", size: [rows, cols], picture: { rows: rowsOf, palette: { "#": "#000", ".": "#fff" } } };
  }
  if (kind === "sudoku") {
    // 3x3 latin squares (no boxes), or 4x4 with boxes and most cells given
    if (rand() < 0.5) {
      const givens = Array.from({ length: 9 }, (_, i) => i).filter(() => rand() < 0.25)
        .map((i) => ({ at: "cell" as const, cell: cellOf(i, 3), kind: "number" as const, value: 1 + Math.floor(rand() * 3) }));
      return { genre: "sudoku", size: [3, 3], givens };
    }
    const solved = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
    // keep at most 7 cells open so every board can be tried (4^7)
    const open = new Set(shuffle(Array.from({ length: 16 }, (_, i) => i)).slice(0, 4 + Math.floor(rand() * 4)));
    const givens = Array.from({ length: 16 }, (_, i) => i).filter((i) => !open.has(i))
      .map((i) => ({ at: "cell" as const, cell: cellOf(i, 4), kind: "number" as const, value: rand() < 0.9 ? solved[Math.floor(i / 4)][i % 4] : 1 + Math.floor(rand() * 4) }));
    return { genre: "sudoku", size: [4, 4], givens };
  }
  if (kind === "slitherlink") {
    const [rows, cols] = pick([[2, 2], [2, 3]]);
    const givens = Array.from({ length: rows * cols }, (_, i) => i).filter(() => rand() < 0.5)
      .map((i) => ({ at: "cell" as const, cell: [Math.floor(i / cols), i % cols] as [number, number], kind: "number" as const, value: Math.floor(rand() * 4) }));
    return { genre: "slitherlink", size: [rows, cols], givens };
  }
  if (kind === "nurikabe") {
    const [rows, cols] = pick([[3, 3], [3, 4], [2, 4]]);
    const cells = Array.from({ length: rows * cols }, (_, i) => i).filter(() => rand() < 0.25);
    return { genre: "nurikabe", size: [rows, cols], givens: cells.map((i) => ({ at: "cell" as const, cell: [Math.floor(i / cols), i % cols] as [number, number], kind: "number" as const, value: 1 + Math.floor(rand() * 4) })) };
  }
  const [rows, cols] = pick([[2, 3], [3, 3], [2, 4], [3, 4]]);
  const rules: GridSpec["rules"] = [];
  if (rand() < 0.6) rules.push(pick([{ rule: "size", is: pick([2, 3, 4]) }, { rule: "size", min: 2 }, { rule: "size", min: 2, max: 3 }]));
  const givens: NonNullable<GridSpec["givens"]> = [];
  const cellAt = (i: number): [number, number] => [Math.floor(i / cols), i % cols];
  const randomBorder = (): [[number, number], [number, number]] => {
    const r = Math.floor(rand() * rows), c = Math.floor(rand() * cols);
    return rand() < 0.5 && c + 1 < cols ? [[r, c], [r, c + 1]] : r + 1 < rows ? [[r, c], [r + 1, c]] : [[r, c - 1 < 0 ? 0 : c - 1], [r, c - 1 < 0 ? 1 : c]];
  };
  // half the time, one or two of Glimmith's later rules on their own (with a size, perhaps)
  if (rand() < 0.5) {
    glimmithRules(rows, cols, rules, givens, randomBorder);
    givens.push(...holesAndWalls(rows, cols));
    return { genre: "panes", size: [rows, cols], rules, givens };
  }
  if (rand() < 0.5) { rules.push({ rule: "twins" }); givens.push({ at: "border", cells: randomBorder(), kind: "twins" }); }
  if (rand() < 0.4) { rules.push({ rule: "opposites" }); givens.push({ at: "border", cells: randomBorder(), kind: "opposites" }); }
  if (rand() < 0.3) rules.push({ rule: "all-different" });
  if (rand() < 0.4) {
    rules.push({ rule: "size-clue" });
    givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "number", value: 1 + Math.floor(rand() * 4) });
  }
  if (rand() < 0.4) {
    rules.push({ rule: "compass" });
    const v: Record<string, number> = {};
    for (const d of ["n", "e", "s", "w"]) if (rand() < 0.5) v[d] = Math.floor(rand() * 3);
    givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "compass", value: v });
  }
  if (rand() < 0.3) {
    rules.push({ rule: "one-each", of: "symbol" });
    for (let k = 0; k < 2; k++) givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "symbol", value: "star" });
  }
  if (rand() < 0.3) rules.push({ rule: "rectangles" });
  if (rand() < 0.3) rules.push({ rule: "neighbors-differ" });
  if (rand() < 0.3) {
    rules.push({ rule: "one-of-each" });
    for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "symbol", value: pick(["red", "blue"]) });
  }
  if (rand() < 0.35) {
    rules.push({ rule: "cell-borders" });
    for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) {
      const value = Math.floor(rand() * 5);
      givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "palisade", value, ...(value === 2 && rand() < 0.5 ? { opposite: true } : {}) });
    }
  }
  if (rand() < 0.15) glimmithRules(rows, cols, rules, givens, randomBorder);
  // holes (rocks) and walls drawn in
  givens.push(...holesAndWalls(rows, cols));
  if (!rules.length) rules.push({ rule: "size", is: 2 });
  return { genre: "panes", size: [rows, cols], rules, givens };
}

/** Glimmith's later rules (each with its clues), a few at a time so some puzzles still have solutions. */
function glimmithRules(rows: number, cols: number, rules: NonNullable<GridSpec["rules"]>, givens: NonNullable<GridSpec["givens"]>, randomBorder: () => [[number, number], [number, number]]) {
  const cellAt = (i: number): [number, number] => [Math.floor(i / cols), i % cols];
  const options: (() => void)[] = [
    () => {
      rules.push({ rule: "one-each", of: "any" });
      for (let k = 0; k < 1 + Math.floor(rand() * 3); k++) givens.push(pick<NonNullable<GridSpec["givens"]>[number]>([
        { at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "symbol", value: "star" },
        { at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "number", value: 1 + Math.floor(rand() * 4) },
        { at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "compass", value: { e: Math.floor(rand() * 2) } },
      ]));
    },
    () => rules.push({ rule: "no-four-corners", outline: true }),
    () => rules.push({ rule: "no-t-junctions" }),
    () => rules.push({ rule: "no-rectangles" }),
    () => rules.push({ rule: "all-same" }),
    () => rules.push({ rule: "neighbors-differ-size" }),
    () => {
      rules.push({ rule: "shape-bank" });
      for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) givens.push({ at: "aside", kind: "bank", value: pick(SMALL_SHAPES) });
    },
    () => {
      rules.push({ rule: "region-shape" });
      for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "shape", value: pick(SMALL_SHAPES) });
    },
    () => { rules.push({ rule: "size-compare" }); givens.push({ at: "border", cells: randomBorder(), kind: "inequality" }); },
    () => { rules.push({ rule: "size-difference" }); givens.push({ at: "border", cells: randomBorder(), kind: "difference", value: Math.floor(rand() * 3) }); },
    () => {
      rules.push({ rule: "regions-at-corner" });
      for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) givens.push({ at: "corner", corner: [Math.floor(rand() * (rows + 1)), Math.floor(rand() * (cols + 1))], kind: "watchtower", value: 1 + Math.floor(rand() * 4) });
    },
  ];
  for (const add of shuffle(options).slice(0, 1 + Math.floor(rand() * 2))) add();
}
const SMALL_SHAPES: [number, number][][] = [[[0, 0]], [[0, 0], [0, 1]], [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [2, 1]]];

/** Sometimes a rock or two (holes in a region puzzle) and a wall drawn in. */
function holesAndWalls(rows: number, cols: number): NonNullable<GridSpec["givens"]> {
  const out: NonNullable<GridSpec["givens"]> = [];
  if (rand() < 0.3) for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) out.push({ at: "cell", cell: [Math.floor(rand() * rows), Math.floor(rand() * cols)], kind: "block" });
  if (rand() < 0.3) {
    const r = Math.floor(rand() * rows), c = Math.floor(rand() * cols);
    out.push(rand() < 0.5 && c + 1 < cols ? { at: "border", cells: [[r, c], [r, c + 1]], kind: "wall" } : r + 1 < rows ? { at: "border", cells: [[r, c], [r + 1, c]], kind: "wall" } : { at: "border", cells: [[r - 1, c], [r, c]], kind: "wall" });
  }
  return out;
}

/** A small random panel: starts, ends, gaps, dots and a few symbols (fences of a 2x2 or 2x3 grid
 *  are few enough to try them all). */
function randomPanel(): GridSpec {
  const [rows, cols] = pick([[2, 2], [2, 3], [2, 2]]);
  const sym = rand() < 0.2 ? pick(["left-right", "up-down", "turn"] as const) : null;
  const givens: NonNullable<GridSpec["givens"]> = [];
  const corner = (): [number, number] => [Math.floor(rand() * (rows + 1)), Math.floor(rand() * (cols + 1))];
  const edgeCorner = (): [number, number] => { const v = corner(); return rand() < 0.5 ? [pick([0, rows]), v[1]] : [v[0], pick([0, cols])]; };
  const mirror = ([r, c]: [number, number]): [number, number] => sym === "left-right" ? [r, cols - c] : sym === "up-down" ? [rows - r, c] : [rows - r, cols - c];
  const cell = (): [number, number] => [Math.floor(rand() * rows), Math.floor(rand() * cols)];
  const line = (): [[number, number], [number, number]] => { const [r, c] = corner(); return rand() < 0.5 ? [[r, Math.min(c, cols - 1)], [r, Math.min(c, cols - 1) + 1]] : [[Math.min(r, rows - 1), c], [Math.min(r, rows - 1) + 1, c]]; };
  const s1 = corner(), e1 = edgeCorner();
  givens.push({ at: "corner", corner: s1, kind: "start", ...(sym ? { color: "blue" as const } : {}) }, { at: "corner", corner: e1, kind: "end" });
  if (sym) givens.push({ at: "corner", corner: mirror(s1), kind: "start", color: "yellow" }, { at: "corner", corner: mirror(e1), kind: "end" });
  else if (rand() < 0.3) givens.push({ at: "corner", corner: corner(), kind: "start" }, { at: "corner", corner: edgeCorner(), kind: "end" });
  if (rand() < 0.4) givens.push({ at: "line", corners: line(), kind: "gap" });
  if (rand() < 0.4) givens.push(rand() < 0.5 ? { at: "corner", corner: corner(), kind: "hexagon", ...(sym && rand() < 0.5 ? { color: pick(["blue", "yellow"] as const) } : {}) } : { at: "line", corners: line(), kind: "hexagon" });
  const used = new Set<string>();
  const put = (x: NonNullable<GridSpec["givens"]>[number] & { at: "cell" }) => { if (used.has(String(x.cell))) return; used.add(String(x.cell)); givens.push(x); };
  // stars pair with any symbol of their color: orange with triangles, yellow with shapes, white with erasers
  const mix = pick(["squares", "stars", "triangles", "shapes", "shape-stars", "erasers", "erasers", "mixed"]);
  const n = 1 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const what = mix === "mixed" ? pick(["square", "star", "triangle"]) : mix === "squares" ? "square" : mix === "stars" ? pick(["star", "star", "square", "triangle"]) : mix === "triangles" ? "triangle"
      : mix === "shapes" ? "shape" : mix === "shape-stars" ? pick(["shape", "star"]) : pick(["square", "star", "triangle"]);
    if (what === "square") put({ at: "cell", cell: cell(), kind: "square", color: pick(["black", "white", "orange"] as const) });
    if (what === "star") put({ at: "cell", cell: cell(), kind: "star", color: mix === "shape-stars" ? "yellow" : pick(["orange", "black", "white"] as const) });
    if (what === "triangle") put({ at: "cell", cell: cell(), kind: "triangle", value: 1 + Math.floor(rand() * 3) });
    if (what === "shape") put({ at: "cell", cell: cell(), kind: "shape", value: pick([[[0, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0]], [[0, 0], [0, 1], [1, 0]]] as [number, number][][]), rotate: rand() < 0.4, negative: rand() < 0.25 });
  }
  if (mix === "erasers") for (let k = 0; k < pick([1, 1, 2, 3]); k++) put({ at: "cell", cell: cell(), kind: "eraser", ...(rand() < 0.2 ? { color: "orange" as const } : {}) });
  return { genre: "panel", size: [rows, cols], givens, ...(sym ? { rules: [{ rule: "panel-line", symmetry: sym }] } : {}) };
}

const clingo = await import("clingo-wasm");
let failures = 0;
for (let n = 0; n < rounds; n++) {
  const spec = randomSpec();
  let p: Puzzle;
  try { p = makePuzzle(spec); } catch { continue; }   // e.g. two givens on one border
  const brute = new Set<string>();
  for (const b of allBoards(p)) if (!check(p, b).length) brute.add(key(p, b));
  const res = await clingo.run(program(p), 0, ["--project=show"]) as { Result: string; Error?: string; Call?: { Witnesses?: { Value: string[] }[] }[] };
  if (res.Result === "ERROR") { console.log("clingo error", res.Error, JSON.stringify(spec)); failures++; continue; }
  const asp = new Set((res.Call?.[0]?.Witnesses ?? []).map((w) => key(p, boardOf(p, w.Value))));
  const same = brute.size === asp.size && [...brute].every((k) => asp.has(k));
  const quick = solvePaint(p, 1e6);
  if (quick && (quick.length !== brute.size || quick.some((c) => !brute.has(c.join(""))))) { failures++; console.log(`PAINT SOLVER MISMATCH checks=${brute.size} solvePaint=${quick.length}`, JSON.stringify(spec)); continue; }
  if (!same) { failures++; console.log(`MISMATCH checks=${brute.size} solver=${asp.size}`, JSON.stringify(spec)); }
  else console.log(`ok ${spec.genre} ${spec.size.join("x")} ${(p.rules.map((r) => r.rule)).join(",")}: ${brute.size} solution(s)`);
}
console.log(failures ? `${failures} failure(s)` : "all agree");
process.exit(failures ? 1 : 0);
