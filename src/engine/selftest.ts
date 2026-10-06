// Engine self-test: on small grids, try every possible board, keep the ones the
// TypeScript checks accept, and compare with every solution clingo finds. Any difference
// means a rule's encoding and its check disagree.
//
//   node src/engine/selftest.ts [rounds] [seed]
import { makePuzzle, check } from "./puzzle.ts";
import { program, boardOf } from "./solve.ts";
import { regionsOf } from "./derive.ts";
import { solvePaint } from "./paint.ts";
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
    const free = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !p.cellGivens.has(i));
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
    for (let m = 0; m < k ** g.cellCount; m++) {
      const b = emptyBoard(g);
      let x = m;
      for (let i = 0; i < g.cellCount; i++) { b.color[i] = (x % k) + 1; x = Math.floor(x / k); }
      yield b;
    }
  } else if (p.marks.includes("digit")) {
    const fixed = new Map<number, number>();
    for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") fixed.set(i, x.value as number);
    const free = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !fixed.has(i));
    const total = p.digits ** free.length;
    for (let m = 0; m < total; m++) {
      const b = emptyBoard(g);
      for (const [i, v] of fixed) b.digit[i] = v;
      let x = m;
      for (const i of free) { b.digit[i] = (x % p.digits) + 1; x = Math.floor(x / p.digits); }
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
  const kind = pick(["akari", "akari", "shikaku", "shikaku", "star-battle", "star-battle", "irregular-sudoku", "simple-path", "simple-path", "coats", "coats", "maze", "maze", "panes", "panes", "panes", "nurikabe", "slitherlink", "simple-loop", "simple-loop", "nonogram", "nonogram", "sudoku", "sudoku"]);
  const cellOf = (i: number, cols: number): [number, number] => [Math.floor(i / cols), i % cols];
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
  if (kind === "akari") {
    const [rows, cols] = pick([[3, 3], [3, 4], [4, 4]]);
    const givens: NonNullable<GridSpec["givens"]> = [];
    for (let i = 0; i < rows * cols; i++) if (rand() < 0.25) {
      givens.push({ at: "cell", cell: cellOf(i, cols), kind: "block" });
      if (rand() < 0.5) givens.push({ at: "cell", cell: cellOf(i, cols), kind: "number", value: Math.floor(rand() * 3) });
    }
    return { genre: "akari", size: [rows, cols], givens };
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
    return rand() < 0.2 ? { genre: "panes", size: [rows, cols], rules: [{ rule: "rectangles" }] } : { genre: "shikaku", size: [rows, cols], givens };
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
  if (!rules.length) rules.push({ rule: "size", is: 2 });
  return { genre: "panes", size: [rows, cols], rules, givens };
}

const clingo = await import("clingo-wasm");
let failures = 0;
for (let n = 0; n < rounds; n++) {
  const spec = randomSpec();
  let p: Puzzle;
  try { p = makePuzzle(spec); } catch { continue; }   // e.g. two givens on one border
  const brute = new Set<string>();
  for (const b of allBoards(p)) if (!check(p, b).length) brute.add(key(p, b));
  const res = await clingo.run(program(p), 0) as { Result: string; Error?: string; Call?: { Witnesses?: { Value: string[] }[] }[] };
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
