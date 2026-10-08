// Making a grid-engine puzzle with exactly one solution, for puzzles/grid/new.ts (one example
// puzzle) and puzzles/ai/week.ts (the AI creators' weekly batch):
// 1. clingo picks a random finished board that obeys the genre's rules (a loop, a wall,
//    a set of panes), 2. every clue that's true of that board goes in a pool, 3. clues
//    that rule out the other solutions are added until only one is left, 4. clues that
//    aren't needed are taken out again.
import { makePuzzle, check, BALANCE_COLORS } from "../../src/engine/puzzle.ts";
import { program, boardOf, solve } from "../../src/engine/solve.ts";
import { regionsOf, shapeKey } from "../../src/engine/derive.ts";
import { fillSlots } from "../../src/engine/rules.ts";
import { emptyBoard, type Board, type Given, type GridSpec, type RuleSpec } from "../../src/engine/types.ts";
import { makePanel, PANEL_MIXES } from "./panels.ts";

export interface GenerateOptions {
  genre: string;
  rows: number;
  cols: number;
  /** the same seed gives the same puzzle */
  seed?: number;
  /** Panes: the rule mix, e.g. "size=4,twins,opposites,compass" */
  rules?: string;
  /** Panel: the symbol mix (PANEL_MIXES) */
  mix?: string;
  /** Star Battle: stars per row, column and area (only 1 for now) */
  stars?: number;
  /** Akari: a cipher, with letters for its numbers */
  cipher?: boolean;
}

/** A puzzle with exactly one solution (a panel: one line), or null if none was found in 40 tries. */
export async function generate(o: GenerateOptions): Promise<GridSpec | null> {
  const { genre, rows, cols } = o;
  let seed = o.seed ?? 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const shuffle = <T>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
  const clingo = await import("clingo-wasm");

  /** A random finished board for this puzzle's rules, plus extra constraints. */
  async function randomBoard(spec: GridSpec, extra: string): Promise<Board | null> {
    const p = makePuzzle(spec);
    const res = await clingo.run(program(p) + "\n" + extra, 1, ["--rand-freq=1", `--seed=${Math.floor(rand() * 1e6)}`, "--sign-def=rnd"]) as { Call?: { Witnesses?: { Value: string[] }[] }[] };
    const w = res.Call?.[0]?.Witnesses?.[0];
    return w ? boardOf(p, w.Value) : null;
  }

  const regionKey = (spec: GridSpec, b: Board) => regionsOf(makePuzzle(spec), b).of.join(",");
  /** Grow areas from seed cells (one area each) at random until they cover the grid; `cap` stops an
   *  area growing past that many cells. Returns letter rows, or null if it got stuck. */
  function growAreas(seeds: number[], cap = Infinity): string[] | null {
    const n = rows * cols, of = new Array<number>(n).fill(-1), size = seeds.map(() => 1);
    seeds.forEach((i, a) => (of[i] = a));
    const near = (i: number) => { const r = Math.floor(i / cols), c = i % cols; return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && x >= 0 && y < rows && x < cols).map(([y, x]) => y * cols + x); };
    for (let left = n - seeds.length; left > 0;) {
      // the smallest area that can still grow takes a random free neighbour
      const options = seeds.map((_, a) => a).filter((a) => size[a] < cap).sort((a, b) => size[a] - size[b] || rand() - 0.5);
      let grew = false;
      for (const a of options) {
        const free = shuffle(Array.from({ length: n }, (_, i) => i).filter((i) => of[i] === a).flatMap(near).filter((j) => of[j] < 0));
        if (!free.length) continue;
        of[free[0]] = a; size[a]++; left--; grew = true;
        if (cap === Infinity || rand() < 0.7) break;
      }
      if (!grew) return null;
    }
    return Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).map((a) => "abcdefghijklmnopqrstuvwxyz"[a]).join(""));
  }

  /** Equal areas for an irregular sudoku: the regular boxes, then many random swaps of two border
   *  cells between neighbouring areas (sizes stay equal; every area stays in one piece). */
  function jigsaw(): string[] {
    const n = rows * cols;
    let bh = Math.floor(Math.sqrt(rows)); while (rows % bh) bh--;
    const bw = rows / bh;
    const of = Array.from({ length: n }, (_, i) => Math.floor(Math.floor(i / cols) / bh) * (cols / bw) + Math.floor((i % cols) / bw));
    const near = (i: number) => { const r = Math.floor(i / cols), c = i % cols; return [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1].filter((j) => j >= 0); };
    const whole = (a: number) => {
      const cells = of.flatMap((x, i) => (x === a ? [i] : [])), seen = new Set([cells[0]]), stack = [cells[0]];
      while (stack.length) for (const j of near(stack.pop()!)) if (of[j] === a && !seen.has(j)) { seen.add(j); stack.push(j); }
      return seen.size === cells.length;
    };
    for (let t = 0; t < n * 40; t++) {
      const i = Math.floor(rand() * n), others = near(i).filter((j) => of[j] !== of[i]);
      if (!others.length) continue;
      const A = of[i], B = of[others[Math.floor(rand() * others.length)]];
      const back = shuffle(of.flatMap((x, j) => (x === B && j !== i && near(j).some((k) => of[k] === A) ? [j] : [])));
      if (!back.length) continue;
      const j = back[0];
      of[i] = B; of[j] = A;
      if (!whole(A) || !whole(B)) { of[i] = A; of[j] = B; }
    }
    return Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).map((a) => "abcdefghijklmnopqrstuvwxyz"[a]).join(""));
  }

  const boardKey = (spec: GridSpec, b: Board) => (genre === "binairo" || genre === "colour-balance" ? [...b.color].join(",") : genre === "fill-in" ? [...b.digit].join(",") : genre === "panes" ? regionKey(spec, b) : genre === "simple-path" || genre === "numberlink" || genre === "masyu" ? [...b.loop].map((x) => (x === 1 ? 1 : 0)).join("") : ["star-battle", "akari", "cave", "aquarium", "wittgenstein-briquet", "hitori", "minesweeper"].includes(genre) ? [...b.shade].map((x) => (x === 1 ? 1 : 0)).join("") : ["shikaku", "square-jam", "spiral-galaxies"].includes(genre) ? regionKey(spec, b) : ["thermo-sudoku", "skyscrapers", "easy-as-abc"].includes(genre) ? [...b.digit].join("") : genre === "irregular-sudoku" ? [...b.digit].join("") : genre === "nurikabe" ? [...b.shade].join("") : genre === "sudoku" ? [...b.digit].join("") : [...b.fence].join(""));

  /** Add pool clues until the target is the only solution, then drop clues that aren't needed. */
  async function narrow(base: GridSpec, target: Board, pool: Given[], poolOf?: (b: Board) => Given[]): Promise<GridSpec | null> {
    const spec: GridSpec = { ...base, givens: [...(base.givens ?? [])] };
    let tk = boardKey(spec, target);
    const added: Given[] = [];
    for (let round = 0; round < 120; round++) {
      const sols = await solve(makePuzzle(spec), 2);
      const alt = sols.find((s) => boardKey(spec, s) !== tk);
      if (!alt) break;
      const useful = shuffle(pool.filter((c) => !added.includes(c))).find((c) => {
        const p2 = makePuzzle({ ...spec, givens: [...spec.givens!, c] });
        return check(p2, alt).length > 0 && check(p2, target).length === 0;
      });
      if (!useful && poolOf) {
        // nothing true of the target rules out the other solution: aim for that one instead (it
        // fits every clue so far), with its own clues
        target = alt; tk = boardKey(spec, alt); pool = poolOf(alt);
        continue;
      }
      if (!useful) { if (process.env.DEBUG) console.error(`narrow: no pool clue rules out the other solution after ${added.length} clues`); return null; }
      added.push(useful); spec.givens!.push(useful);
    }
    const sols = await solve(makePuzzle(spec), 2);
    if (sols.length !== 1) return null;
    for (const c of shuffle([...added])) {        // minimize
      const fewer = { ...spec, givens: spec.givens!.filter((x) => x !== c) };
      if ((await solve(makePuzzle(fewer), 2)).length === 1) spec.givens = fewer.givens;
    }
    return spec;
  }

  const at = (i: number): [number, number] => [Math.floor(i / cols), i % cols];
  let result: GridSpec | null = null;

  for (let attempt = 0; attempt < 40 && !result; attempt++) {
    const near4 = (i: number) => { const r = Math.floor(i / cols), c = i % cols; return [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1].filter((j) => j >= 0); };
    const near8 = (i: number) => { const r = Math.floor(i / cols), c = i % cols, out: number[] = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && r + dr >= 0 && c + dc >= 0 && r + dr < rows && c + dc < cols) out.push((r + dr) * cols + c + dc); return out; };
    /** Every clue outside the grid, read off a finished digit board. */
    const edgePool = (b: Board, kind: "first" | "skyscraper"): Given[] => {
      const out: Given[] = [];
      const add = (side: "top" | "bottom" | "left" | "right", cell: number, ray: number[]) => {
        let value = 0;
        if (kind === "first") value = b.digit[ray.find((i) => b.digit[i]) ?? -1] ?? 0;
        else { let top = 0; for (const i of ray) if (b.digit[i] > top) { top = b.digit[i]; value++; } }
        if (value) out.push({ at: "edge", side, cell: at(cell), kind, value });
      };
      for (let r = 0; r < rows; r++) { const row = Array.from({ length: cols }, (_, c) => r * cols + c); add("left", row[0], row); add("right", row.at(-1)!, [...row].reverse()); }
      for (let c = 0; c < cols; c++) { const col = Array.from({ length: rows }, (_, r) => r * cols + c); add("top", col[0], col); add("bottom", col.at(-1)!, [...col].reverse()); }
      return out;
    };
    if (genre === "square-jam") {
      // squares no bigger than 3 x 3, so there are plenty of them
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, `:- root(R), size(R,N), N > 9.\n:- #count{R: root(R)} < ${Math.round(rows * cols / 5)}.`);
      if (!target) continue;
      const reg = regionsOf(makePuzzle(base), target);
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: Math.round(Math.sqrt(reg.cells[reg.of[i]].length)) }));
      result = await narrow(base, target, pool);
    } else if (genre === "wittgenstein-briquet" || genre === "minesweeper") {
      // a random answer (blocks with the rest connected / mines), then numbers in the other cells
      const n = rows * cols, base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const [lo, hi] = genre === "minesweeper" ? [0.15, 0.25] : [0.25, 0.4];
      const target = await randomBoard(base, `:- #count{I: shaded(I)} < ${Math.round(n * lo)}.\n:- #count{I: shaded(I)} > ${Math.round(n * hi)}.`);
      if (!target) continue;
      const around = genre === "minesweeper" ? near8 : near4;
      const pool: Given[] = Array.from({ length: n }, (_, i) => i).filter((i) => target.shade[i] !== 1)
        .map((i) => ({ at: "cell", cell: at(i), kind: "number", value: around(i).filter((j) => target.shade[j] === 1).length }));
      result = await narrow(base, target, pool);
    } else if (genre === "hitori") {
      // a shading (no two side by side, the rest connected); numbers from a latin square, then each
      // shaded cell copies a number left in its row or column so it has to go
      const n = rows * cols, shadeSpec: GridSpec = { size: [rows, cols], marks: ["shade"], rules: [{ rule: "no-adjacent" }, { rule: "unshaded-connected" }] };
      const target = await randomBoard(shadeSpec, `:- #count{I: shaded(I)} < ${Math.round(n * 0.2)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.32)}.`);
      if (!target) continue;
      const latin = await randomBoard({ genre: "sudoku", size: [rows, cols], rules: [{ rule: "boxes", box: [1, cols] }] }, "");
      if (!latin) continue;
      for (let t = 0; t < 30 && !result; t++) {
        const v = [...latin.digit];
        for (let i = 0; i < n; i++) if (target.shade[i] === 1) {
          const [r, c] = at(i), mates = [...Array.from({ length: cols }, (_, x) => r * cols + x), ...Array.from({ length: rows }, (_, y) => y * cols + c)].filter((j) => j !== i && target.shade[j] !== 1);
          v[i] = latin.digit[mates[Math.floor(rand() * mates.length)]];
        }
        const spec: GridSpec = { genre, size: [rows, cols], givens: v.map((value, i) => ({ at: "cell", cell: at(i), kind: "number", value })) };
        if ((await solve(makePuzzle(spec), 2)).length === 1) result = spec;
      }
    } else if (genre === "spiral-galaxies") {
      // grow symmetric regions: a centre on a cell, an edge or a corner, then pairs of mirrored cells
      for (let t = 0; t < 60 && !result; t++) {
        const owner = new Array<number>(rows * cols).fill(-1), points: [number, number][] = [];
        const free = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && owner[r * cols + c] < 0;
        for (let start = 0; start < rows * cols; start++) {
          const order = shuffle(Array.from({ length: rows * cols }, (_, i) => i).filter((i) => owner[i] < 0));
          if (!order.length) break;
          const [r, c] = at(order[0]);
          // centre options: the cell, its right / lower edge, its lower-right corner (if those cells are free)
          const opts: [number, number, number[]][] = [[2 * r + 1, 2 * c + 1, [order[0]]]];
          if (free(r, c + 1)) opts.push([2 * r + 1, 2 * c + 2, [order[0], order[0] + 1]]);
          if (free(r + 1, c)) opts.push([2 * r + 2, 2 * c + 1, [order[0], order[0] + cols]]);
          if (free(r, c + 1) && free(r + 1, c) && free(r + 1, c + 1)) opts.push([2 * r + 2, 2 * c + 2, [order[0], order[0] + 1, order[0] + cols, order[0] + cols + 1]]);
          const [py, px, core] = opts[Math.floor(rand() * opts.length)], k = points.length;
          points.push([py, px]); for (const i of core) owner[i] = k;
          const want = 2 + Math.floor(rand() * 8);
          for (let g = 0; g < 40 && owner.filter((o) => o === k).length < want; g++) {
            const mine = owner.flatMap((o, i) => (o === k ? [i] : []));
            const cand = shuffle(mine.flatMap(near4).filter((j) => owner[j] < 0));
            const pick = cand.find((j) => { const [y, x] = at(j), y2 = py - 1 - y, x2 = px - 1 - x; return free(y2, x2) && y2 * cols + x2 !== j; });
            if (pick === undefined) break;
            const [y, x] = at(pick); owner[pick] = k; owner[(py - 1 - y) * cols + (px - 1 - x)] = k;
          }
        }
        const spec: GridSpec = { genre, size: [rows, cols], givens: points.map((point) => ({ at: "point", point, kind: "galaxy" })) };
        if ((await solve(makePuzzle(spec), 2)).length === 1) result = spec;
      }
    } else if (genre === "thermo-sudoku") {
      // a full grid, thermometers traced up rising digits, then given digits until it's the only one
      const base0: GridSpec = { genre, size: [rows, cols], givens: [] };
      const full = await randomBoard(base0, "");
      if (!full) continue;
      const thermos: Given[] = [], used = new Set<number>();
      for (let t = 0; t < 40 && thermos.length < Math.round(rows * 0.7); t++) {
        let cur = Math.floor(rand() * rows * cols);
        if (used.has(cur)) continue;
        const path = [cur];
        while (path.length < 5) {
          const up = shuffle(near4(cur)).find((j) => !used.has(j) && !path.includes(j) && full.digit[j] > full.digit[cur]);
          if (up === undefined) break;
          path.push(up); cur = up;
        }
        if (path.length < 3) continue;
        path.forEach((i) => used.add(i));
        thermos.push({ at: "cells", cells: path.map(at), kind: "thermo" });
      }
      const base: GridSpec = { genre, size: [rows, cols], givens: thermos };
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: full.digit[i] }));
      result = await narrow(base, full, pool);
    } else if (genre === "skyscrapers" || genre === "easy-as-abc") {
      // a random answer, then clues outside (and, for Skyscrapers, a few digits if needed)
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const pool = [...edgePool(target, genre === "skyscrapers" ? "skyscraper" : "first"),
        ...(genre === "skyscrapers" ? Array.from({ length: rows * cols }, (_, i): Given => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] })) : [])];
      result = await narrow(base, target, pool);
    } else if (genre === "cave") {
      // a random cave (about half the grid shaded), then numbers in white cells until it's the only one
      const n = rows * cols, base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, `:- #count{I: shaded(I)} < ${Math.round(n * 0.38)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.55)}.`);
      if (!target) continue;
      const p0 = makePuzzle(base), g = p0.grid;
      const sees = (i: number) => {
        const [r, c] = g.rc(i); let k = 1;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (let y = r + dr, x = c + dc; y >= 0 && x >= 0 && y < rows && x < cols && target.shade[g.cell(y, x)] !== 1; y += dr, x += dc) k++;
        return k;
      };
      const pool: Given[] = Array.from({ length: n }, (_, i) => i).filter((i) => target.shade[i] !== 1).map((i) => ({ at: "cell", cell: at(i), kind: "number", value: sees(i) }));
      result = await narrow(base, target, pool);
    } else if (genre === "aquarium") {
      // random tanks, a random settled fill, then row / column totals until it's the only one
      const tanks = growAreas(shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, Math.round(rows * cols / 4)));
      if (!tanks) continue;
      const base: GridSpec = { genre, size: [rows, cols], areas: tanks, givens: [] };
      const n = rows * cols;
      const target = await randomBoard(base, `:- #count{I: shaded(I)} < ${Math.round(n * 0.35)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.6)}.`);
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pool: Given[] = [
        ...Array.from({ length: rows }, (_, r): Given => ({ at: "row", index: r, kind: "total", value: Array.from({ length: cols }, (_, c) => target.shade[g.cell(r, c)] === 1).filter(Boolean).length })),
        ...Array.from({ length: cols }, (_, c): Given => ({ at: "col", index: c, kind: "total", value: Array.from({ length: rows }, (_, r) => target.shade[g.cell(r, c)] === 1).filter(Boolean).length })),
      ];
      result = await narrow(base, target, pool);
    } else if (genre === "numberlink") {
      // Connectlink style: a random path through every cell (a Simple Path between two random edge
      // cells), cut into pieces of 3 to 7 cells; each piece's ends are a numbered pair
      const edgeCells = Array.from({ length: rows * cols }, (_, i) => i).filter((i) => { const [r, c] = at(i); return r === 0 || c === 0 || r === rows - 1 || c === cols - 1; });
      const [a, b] = shuffle(edgeCells).slice(0, 2);
      const sideOf = (i: number) => { const [r, c] = at(i); return r === 0 ? "top" : r === rows - 1 ? "bottom" : c === 0 ? "left" : "right"; };
      const pathSpec: GridSpec = { genre: "simple-path", size: [rows, cols], givens: [{ at: "edge", cell: at(a), side: sideOf(a), kind: "door", role: "in" }, { at: "edge", cell: at(b), side: sideOf(b), kind: "door", role: "out" }] };
      const walk = await randomBoard(pathSpec, "");
      if (!walk) continue;
      const g = makePuzzle(pathSpec).grid, order = [a];
      for (let prev = -1, cur = a; ;) {
        const l = g.cellLinks[cur].find((x) => walk.loop[x] === 1 && !g.links[x].cells.includes(prev));
        if (l === undefined) break;
        prev = cur; cur = g.links[l].cells.find((c) => c !== cur)!; order.push(cur);
      }
      for (let t = 0; t < 60 && !result; t++) {
        const givens: Given[] = [];
        let k = 0, v = 1;
        while (k < order.length) {
          let len = 3 + Math.floor(rand() * 5);
          if (order.length - (k + len) < 3) len = order.length - k;   // no piece shorter than 3
          givens.push({ at: "cell", cell: at(order[k]), kind: "number", value: v }, { at: "cell", cell: at(order[k + len - 1]), kind: "number", value: v });
          k += len; v++;
        }
        const spec: GridSpec = { genre, size: [rows, cols], rules: [{ rule: "links", cover: true }], givens };
        if ((await solve(makePuzzle(spec), 2)).length === 1) result = spec;
      }
    } else if (genre === "masyu") {
      // a random loop over most of the grid, then pearls that are true of it until it's the only one
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, `:- #count{I: cell(I), go(I,_)} < ${Math.round(rows * cols * 0.6)}.`);
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pearlsOf = (target: Board) => {
        const dirs = (i: number) => { const [r, c] = g.rc(i); return [[-1, 0], [0, 1], [1, 0], [0, -1]].filter(([dr, dc]) => r + dr >= 0 && c + dc >= 0 && r + dr < rows && c + dc < cols && target.loop[g.links[g.borders[g.borderBetween(i, g.cell(r + dr, c + dc))].link].id] === 1); };
        const straight = (i: number) => { const d = dirs(i); return d.length === 2 && d[0][0] === -d[1][0] && d[0][1] === -d[1][1]; };
        const next = (i: number, [dr, dc]: number[]) => { const [r, c] = g.rc(i); return g.cell(r + dr, c + dc); };
        const pool: Given[] = [];
        for (let i = 0; i < g.cellCount; i++) {
          const d = dirs(i);
          if (d.length !== 2) continue;
          if (straight(i) && !d.every((x) => straight(next(i, x)))) pool.push({ at: "cell", cell: at(i), kind: "pearl", value: "white" });
          if (!straight(i) && d.every((x) => dirs(next(i, x)).some((y) => y[0] === x[0] && y[1] === x[1]))) pool.push({ at: "cell", cell: at(i), kind: "pearl", value: "black" });
        }
        return pool;
      };
      result = await narrow(base, target, pearlsOf(target), pearlsOf);
    } else if (genre === "akari") {
      // black cells (symmetric, about a fifth), a random lighting, then numbers on black cells until
      // it's the only one
      const n = rows * cols, givens: Given[] = [];
      for (let i = 0; i < n; i++) {
        const j = n - 1 - i;
        if (j < i) break;
        if (rand() < 0.2) for (const k of new Set([i, j])) givens.push({ at: "cell", cell: at(k), kind: "block" });
      }
      const base: GridSpec = { genre, size: [rows, cols], givens };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pool: Given[] = givens.map((x) => {
        const i = g.cell(...(x as { cell: [number, number] }).cell);
        return { at: "cell", cell: at(i), kind: "number", value: g.cellLinks[i].filter((l) => target.shade[g.links[l].cells.find((c) => c !== i)!] === 1).length };
      });
      result = await narrow(base, target, pool);
      if (result && o.cipher) {
        // a cipher: each number becomes a letter (one letter per number), then more letters until
        // the lighting is the only one again; letters run A, B, C... in reading order
        const names = shuffle(["A", "B", "C", "D", "E"]);
        const letter = (x: Given): Given => (x.kind === "number" ? { at: "cell", cell: x.cell, kind: "number", value: 0, letter: names[x.value] } : x);
        const numbered = new Set(result.givens!.flatMap((x) => (x.kind === "number" ? [String(x.cell)] : [])));
        result = await narrow({ ...result, givens: result.givens!.map(letter) }, target, pool.filter((x) => x.at === "cell" && !numbered.has(String(x.cell))).map(letter));
        if (result) {
          const order = new Map<string, string>();
          const key = (x: Given) => (x.at === "cell" ? x.cell[0] * cols + x.cell[1] : 0);
          for (const x of [...result.givens!].sort((a, b) => key(a) - key(b))) if (x.kind === "number" && x.letter && !order.has(x.letter)) order.set(x.letter, "ABCDE"[order.size]);
          result.givens = result.givens!.map((x) => (x.kind === "number" && x.letter ? { ...x, letter: order.get(x.letter)! } : x));
        }
      }
    } else if (genre === "shikaku") {
      // a random cut into rectangles (2 to 8 cells), then one number per rectangle, placed at random
      // until only that cut fits
      const cutSpec: GridSpec = { size: [rows, cols], marks: ["regions"], rules: [{ rule: "rectangles" }, { rule: "size", min: 2, max: 8 }] };
      const target = await randomBoard(cutSpec, "");
      if (!target) continue;
      const rects = regionsOf(makePuzzle(cutSpec), target).cells;
      for (let t = 0; t < 40 && !result; t++) {
        const givens: Given[] = rects.map((cs) => ({ at: "cell", cell: at(cs[Math.floor(rand() * cs.length)]), kind: "number", value: cs.length }));
        const spec: GridSpec = { genre, size: [rows, cols], givens };
        if ((await solve(makePuzzle(spec), 2)).length === 1) result = spec;
      }
    } else if (genre === "star-battle") {
      // stars first (n per row and column, never touching), then areas grown around them, one per
      // star group, until only those stars fit
      const k = o.stars ?? 1;
      const base: GridSpec = { genre, size: [rows, cols], rules: [{ rule: "shaded-per-line", n: k }, { rule: "shaded-per-area", n: k }] };
      const stars = await randomBoard({ ...base, genre: undefined, marks: ["shade"], rules: [{ rule: "shaded-per-line", n: k }, { rule: "no-touch" }] }, "");
      if (!stars) continue;
      const starCells = shuffle(Array.from({ length: rows * cols }, (_, i) => i).filter((i) => stars.shade[i] === 1));
      // with k stars per area, areas start from k stars each: pair them up by nearness
      if (k > 1) throw new Error("only 1 star per area for now");
      const grown = growAreas(starCells.slice(0, rows));
      if (!grown) continue;
      // hill-climb: move one cell (never a star) into a neighbouring area, keeping every area in one
      // piece, while that doesn't add solutions, until one is left
      let of = grown.join("").split("");
      const count = async (o: string[]) => (await solve(makePuzzle({ genre, size: [rows, cols], areas: Array.from({ length: rows }, (_, r) => o.slice(r * cols, r * cols + cols).join("")) }), 40)).length;
      const connected = (o: string[], letter: string) => {
        const cells = o.flatMap((x, i) => (x === letter ? [i] : []));
        if (!cells.length) return false;
        const seen = new Set([cells[0]]), stack = [cells[0]];
        while (stack.length) { const i = stack.pop()!, r = Math.floor(i / cols), c = i % cols; for (const j of [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1]) if (j >= 0 && o[j] === letter && !seen.has(j)) { seen.add(j); stack.push(j); } }
        return seen.size === cells.length;
      };
      let now = await count(of);
      for (let step = 0; step < 3000 && now > 1; step++) {
        const i = Math.floor(rand() * rows * cols);
        if (stars.shade[i] === 1) continue;
        const r = Math.floor(i / cols), c = i % cols;
        const nb = [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1].filter((j) => j >= 0 && of[j] !== of[i]);
        if (!nb.length) continue;
        const next = [...of]; next[i] = of[nb[Math.floor(rand() * nb.length)]];
        if (!connected(next, of[i])) continue;
        const n = await count(next);
        if (n >= 1 && n <= now) { of = next; now = n; }
      }
      if (now === 1) result = { genre, size: [rows, cols], areas: Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).join("")) };
    } else if (genre === "irregular-sudoku") {
      // areas of n cells each, a random full grid, then given digits until it's the only one
      const areas = jigsaw();
      const base: GridSpec = { genre, size: [rows, cols], areas, givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      result = await narrow(base, target, pool);
    } else if (genre === "simple-path") {
      // doors on two different sides, a few rocks; a random path through it; then walls (which the
      // path never crosses) until it's the only one
      const sides = shuffle(["top", "right", "bottom", "left"] as const).slice(0, 2);
      const door = (side: (typeof sides)[number], role: "in" | "out"): Given => ({
        at: "edge", kind: "door", role, side,
        cell: side === "top" ? [0, Math.floor(rand() * cols)] : side === "bottom" ? [rows - 1, Math.floor(rand() * cols)]
          : side === "left" ? [Math.floor(rand() * rows), 0] : [Math.floor(rand() * rows), cols - 1],
      });
      const givens: Given[] = [door(sides[0], "in"), door(sides[1], "out")];
      const rocks = Math.floor(rows * cols * 0.08);
      for (const i of shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, rocks)) givens.push({ at: "cell", cell: at(i), kind: "block" });
      const base: GridSpec = { genre, size: [rows, cols], givens };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pool: Given[] = g.links.filter((l) => !target.loop[l.id] && !l.cells.some((c) => givens.some((x) => x.kind === "block" && x.at === "cell" && g.cell(...x.cell) === c)))
        .map((l) => ({ at: "border", cells: [at(l.cells[0]), at(l.cells[1])], kind: "wall" }));
      result = await narrow(base, target, pool);
    } else if (genre === "slitherlink") {
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, `:- #count{B: fence(B)} < ${Math.round(rows * cols * 0.9)}.`);
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pool: Given[] = Array.from({ length: g.cellCount }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: g.cellBorders[i].filter((e) => target.fence[e] === 1).length }));
      result = await narrow(base, target, pool);
    } else if (genre === "sudoku") {
      // a random full grid, then given digits until it's the only one
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      result = await narrow(base, target, pool);
    } else if (genre === "nurikabe") {
      // a wall first (connected, no pools, islands of 1..5), then one number per island
      const wallSpec: GridSpec = { size: [rows, cols], marks: ["shade"], rules: [{ rule: "connected" }, { rule: "no-pool" }, { rule: "size", min: 1, max: 5 }], givens: [] };
      const n = rows * cols;
      const target = await randomBoard(wallSpec, `:- #count{I: shaded(I)} < ${Math.round(n * 0.45)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.62)}.`);
      if (!target) continue;
      const islands = regionsOf(makePuzzle(wallSpec), target).cells;
      for (let t = 0; t < 12 && !result; t++) {
        const givens: Given[] = islands.map((cs) => ({ at: "cell", cell: at(cs[Math.floor(rand() * cs.length)]), kind: "number", value: cs.length }));
        const spec: GridSpec = { genre, size: [rows, cols], givens };
        if ((await solve(makePuzzle(spec), 2)).length === 1) result = spec;
      }
    } else if (genre === "panes") {
      const want = (o.rules ?? "size=4,twins,opposites").split(",").map((s) => s.trim()).filter(Boolean);
      const rules: RuleSpec[] = [];
      for (const w of want) {
        const [k, v] = w.split("=");
        if (k === "size") rules.push({ rule: "size", is: Number(v) });
        else if (k === "range") { const [lo, hi] = v.split("-").map(Number); rules.push({ rule: "size", min: lo, max: hi }); }
        else rules.push({ rule: k });
      }
      const shapeRules = rules.filter((r) => ["size", "all-different"].includes(r.rule));
      const base: GridSpec = { genre, size: [rows, cols], rules: shapeRules, givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const p = makePuzzle(base), g = p.grid, reg = regionsOf(p, target);
      const keys = reg.cells.map((cs) => shapeKey(g, cs));
      const pool: Given[] = [];
      for (const l of g.links) {
        const [a, b] = l.cells, ra = reg.of[a], rb = reg.of[b];
        if (ra === rb) continue;
        const cells: [[number, number], [number, number]] = [at(a), at(b)];
        if (keys[ra] === keys[rb] && rules.some((r) => r.rule === "twins")) pool.push({ at: "border", cells, kind: "twins" });
        if (keys[ra] !== keys[rb] && rules.some((r) => r.rule === "opposites")) pool.push({ at: "border", cells, kind: "opposites" });
      }
      for (let i = 0; i < g.cellCount; i++) {
        const cs = reg.cells[reg.of[i]], [r0, c0] = g.rc(i);
        if (rules.some((r) => r.rule === "compass")) {
          const v = { n: 0, e: 0, s: 0, w: 0 };
          for (const j of cs) { const [r1, c1] = g.rc(j); if (r1 < r0) v.n++; if (r1 > r0) v.s++; if (c1 > c0) v.e++; if (c1 < c0) v.w++; }
          pool.push({ at: "cell", cell: at(i), kind: "compass", value: v });
        }
        if (rules.some((r) => r.rule === "size-clue")) pool.push({ at: "cell", cell: at(i), kind: "number", value: cs.length });
      }
      const spec = await narrow({ ...base, rules }, target, pool);
      if (spec) {
        // only list the rules this puzzle ended up using
        const used = new Set<string>(spec.givens!.map((x) => (x.kind === "number" ? "size-clue" : x.kind)));
        spec.rules = rules.filter((r) => ["size", "all-different"].includes(r.rule) || used.has(r.rule));
        // a cell can hold only one clue: keep the first
        const seen = new Set<string>();
        spec.givens = spec.givens!.filter((x) => { const k = x.at === "cell" ? `c${x.cell}` : x.at === "border" ? `b${x.cells}` : x.at === "corner" ? `v${x.corner}` : x.at === "edge" ? `e${x.cell}${x.side}` : x.at === "cells" ? `t${x.cells}` : x.at === "point" ? `p${x.point}` : x.at === "line" ? `l${x.corners}` : x.at === "aside" ? `a${x.value}` : `${x.at}${x.index}${x.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
        if ((await solve(makePuzzle(spec), 2)).length === 1) result = spec;
      }
    } else if (genre === "panel") {
      const mix = (o.mix ?? "squares") as (typeof PANEL_MIXES)[number];
      if (!PANEL_MIXES.includes(mix)) throw new Error(`--mix is one of ${PANEL_MIXES.join(", ")}`);
      result = await makePanel(mix, rows, cols, rand);
    } else if (genre === "binairo" || genre === "colour-balance") {
      // a random painting, then printed colors until it's the only one. Colour Balance's --rules:
      // "parts=1:2" (the shares; three parts, three colors), and no-three-in-a-row, unique-lines
      const rules: RuleSpec[] = [];
      let colors = 2;
      for (const w of (genre === "colour-balance" ? o.rules ?? "" : "").split(",").map((x) => x.trim()).filter(Boolean)) {
        const [k, v] = w.split("=");
        if (k === "parts") { const parts = v.split(":").map(Number); colors = parts.length; rules.push({ rule: "line-shares", parts }); }
        else rules.push({ rule: k });
      }
      const base: GridSpec = { genre, size: [rows, cols], ...(rules.length ? { rules } : {}), ...(colors !== 2 ? { style: { palette: BALANCE_COLORS.slice(0, colors) } } : {}), givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "color", value: target.color[i] }));
      result = await narrow(base, target, pool);
    } else if (genre === "fill-in") {
      // black squares (the same turned halfway round), random digits (no number starting with 0), the
      // list read off them, smallest first; then printed digits if the list alone allows another way
      const n = rows * cols, black = new Set<number>();
      for (let i = 0; i < n; i++) { const j = n - 1 - i; if (j < i) break; if (rand() < 0.3) { black.add(i); black.add(j); } }
      const givens: Given[] = [...black].sort((a, b) => a - b).map((i) => ({ at: "cell", cell: at(i), kind: "block" }));
      const p0 = makePuzzle({ genre, size: [rows, cols], givens });
      const slots = fillSlots(p0), inSlot = new Set(slots.flat()), white = Array.from({ length: n }, (_, i) => i).filter((i) => !black.has(i));
      // every white square in a slot, numbers of 4 digits at most, and the white squares joined up
      if (white.some((i) => !inSlot.has(i)) || slots.length < 4 || slots.some((s) => s.length > 4)) continue;
      const seen = new Set([white[0]]), stack = [white[0]];
      while (stack.length) for (const j of near4(stack.pop()!)) if (!black.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
      if (seen.size !== white.length) continue;
      const lead = new Set(slots.map((s) => s[0])), target = emptyBoard(p0.grid);
      for (const i of white) target.digit[i] = lead.has(i) ? 2 + Math.floor(rand() * 9) : 1 + Math.floor(rand() * 10);
      const entries = slots.map((s) => s.map((i) => "0123456789"[target.digit[i] - 1]).join(""));
      if (new Set(entries).size !== entries.length) continue;
      entries.sort((a, b) => a.length - b.length || Number(a) - Number(b));
      const pool: Given[] = white.map((i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      result = await narrow({ genre, size: [rows, cols], givens, entries }, target, pool);
    } else throw new Error(`no generator for genre "${genre}"`);
  }
  return result;
}
