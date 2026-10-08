// Any engine puzzle drawn with the sketchpad's own tools (/new/draw): a grid and its gaps, pen and
// straight lines in three weights, washes, the stamps and text, as a creator would draw it, with the
// type's name (and any rules beyond the type's own) written above the grid, as creators are told to
// ("Writing the type at the top of the sketch helps", /new). Pure: no DOM, no files.
// Used by tests/unit/sketchpad-coverage.test.ts (can every type be drawn?) and
// tests/e2e/reader.spec.ts (does the reader read each drawing back as the puzzle it came from?).
import { normalShape } from "~site/engine/puzzle.ts";
import { colorName, tileOf, tileSpec } from "~site/engine/rules.ts";
import type { Given, GridSpec, Puzzle, Side } from "~site/engine/types.ts";
import { kindName } from "~/games/kinds";
import * as m from "./model";
import { onDark, textSize } from "./draw";

// ---- the examples ----

/** Example folders (src/games/<folder>) whose genre has another name. */
export const FOLDER_GENRE: Record<string, string> = {
  "round-the-bend": "simple-loop", "picture-squares": "nonogram", "number-line-maze": "maze", "three-coats": "coats",
};

/** An example file's JSON as a grid-engine spec (old Number Line Maze and Three Coats files too; as puzzles/grid/guides.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function specOf(genre: string, d: any): GridSpec {
  if (d.grid) return { genre, ...d.grid };
  if (d.maze) {
    const q = d.maze, rows = q.clues.length - 1, cols = q.clues[0].length - 1;
    const entry = q.entry ?? { side: "top", at: q.entryCol }, exit = q.exit ?? { side: "right", at: q.exitRow };
    const door = (o: { side: Side; at: number }, role: "in" | "out"): Given => ({ at: "edge", kind: "door", role, side: o.side,
      cell: o.side === "top" ? [0, o.at] : o.side === "bottom" ? [rows - 1, o.at] : o.side === "left" ? [o.at, 0] : [o.at, cols - 1] });
    const wall = (pair: number[][]): Given => { const [[r1, c1], [r2]] = [...pair].sort((a, b) => a[0] - b[0] || a[1] - b[1]); return { at: "border", kind: "wall", cells: r1 === r2 ? [[r1 - 1, c1], [r1, c1]] : [[r1, c1 - 1], [r1, c1]] }; };
    const givens: Given[] = [door(entry, "in"), door(exit, "out"), ...(q.hints ?? []).map(wall),
      ...q.clues.flatMap((row: number[], r: number) => row.map((value, c): Given => ({ at: "corner", kind: "count", corner: [r, c], value })))];
    return { genre, size: [rows, cols], givens };
  }
  const pieces = d.ryb.pieces as { points: number[][]; clue?: string; hidden?: boolean }[];
  return { genre, size: [1, pieces.length], figure: { pieces: pieces.map((p) => p.points) },
    givens: pieces.flatMap((p, i): Given[] => (p.clue ? [{ at: "cell", cell: [0, i], kind: "dots", value: [...p.clue].map(Number), ...(p.hidden ? { hidden: true } : {}) }] : [])) };
}
// ---- what the toolbar can make ----

/** The shape pad's size (Sketchpad.tsx's PAD): any shape that fits it can be stamped. */
export const PAD = 5;
/** The stamp colours the colour panel offers (Sketchpad.tsx's PALETTE), and the stamps that take one (its COLORED). */
const STAMP_COLOURS = new Set<string>([...m.WASHES, "black", "white"]);
/** The colours a start or a dot on the line can be: ink, or a symmetry panel's two lines. */
const LINE_COLOURS = new Set<string>(["black", "blue", "yellow"]);

// ---- converting a puzzle into a drawing ----

export interface Converted {
  drawing: m.Drawing;
  /** elements with no faithful drawing */
  gaps: Set<string>;
  /** elements drawn, but only roughly (what the reader has to guess) */
  rough: Set<string>;
  /** the grid's square, and the writing's size in the exported 1600px PNG */
  S: number; textPx: number;
  /** writing that runs into other writing */
  crowded: number;
}

const EXPORT_PX = 1600;
/** Text is drawn centred at textSize = S/2; a handwritten character is about 0.6 of that wide. */
const textBox = (S: number, x: number, y: number, s: string) => {
  const h = S * 0.5, w = h * 0.6 * s.length;
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
};

/** The rules beyond the genre's, as they'd be written on the sketch ("size is 4", "panel-line symmetry left-right"). */
const ruleText = (spec: GridSpec) => (spec.rules ?? []).map(({ rule, ...s }) => [rule, ...Object.entries(s).map(([k, v]) => `${k} ${v}`)].join(" ")).join(", ");

/** A sudoku's box: the squarest a × b = n (as the engine picks it). */
function boxOf(n: number): [number, number] {
  let a = Math.floor(Math.sqrt(n));
  while (n % a) a--;
  return [a, n / a];
}

export function toDrawing(p: Puzzle, genre: string): Converted {
  const gaps = new Set<string>(), rough = new Set<string>();
  const spec = p.spec, [rows, cols] = spec.size;
  let d: m.Drawing = m.EMPTY;
  const before = () => d.items.length;
  /** Add a stamp; one that pushes another off its square (a square holds one stamp) is a gap. */
  const stamp = (s: m.Stamp, what: string) => {
    const n = before();
    d = m.stamp(d, s);
    if (d.items.length <= n) gaps.add(`two stamps in one place (${what})`);
  };
  const text = (at: m.Anchor, t: string) => { d = m.add(d, { kind: "text", at, text: t }); };
  const line = (from: m.Anchor, to: m.Anchor, weight: m.Weight) => { d = m.add(d, { kind: "line", weight, from, to }); };
  const G = (r: number, c: number): m.Anchor => ({ at: "grid", r, c });
  const colour = (c: string | undefined, usual: string, what: string, takes: boolean): m.SymbolColor | undefined => {
    if (!c || c === usual) return takes ? (c as m.SymbolColor | undefined) : undefined;
    if (!takes) gaps.add(`${what} in a colour (the stamp has none)`);
    else if (!STAMP_COLOURS.has(c)) gaps.add(`${what} in ${c}`);
    return takes ? (c as m.SymbolColor) : undefined;
  };

  // RYB: no grid; the figure's pieces as straight lines, scaled onto the page
  if (p.figure) {
    const pts = p.figure.flat(), x0 = Math.min(...pts.map((q) => q[0])), y0 = Math.min(...pts.map((q) => q[1]));
    const span = Math.max(Math.max(...pts.map((q) => q[0])) - x0, Math.max(...pts.map((q) => q[1])) - y0);
    const k = (m.PAGE - 80) / span, P = (q: number[]): m.Anchor => ({ at: "page", x: 40 + (q[0] - x0) * k, y: 60 + (q[1] - y0) * k });
    text({ at: "page", x: m.PAGE / 2, y: 24 }, kindName(genre));
    let smallest = Infinity;
    p.figure.forEach((piece, i) => {
      piece.forEach((q, j) => line(P(q), P(piece[(j + 1) % piece.length]), "medium"));
      // the piece's dots: coloured stones (1 red, 2 yellow, 3 blue) in a row at its middle
      const cx = piece.reduce((s, q) => s + q[0], 0) / piece.length, cy = piece.reduce((s, q) => s + q[1], 0) / piece.length;
      const inner = Math.min(...piece.map((q) => Math.hypot(q[0] - cx, q[1] - cy))) * k;   // roughly: room around the middle
      smallest = Math.min(smallest, inner);
      for (const g of p.cellGivens.get(i) ?? []) {
        if (g.kind !== "dots") continue;
        // hidden dots: stones with the "Hidden" option (a dashed outline)
        const c = P([cx, cy]) as { x: number; y: number };
        g.value.forEach((v, j) => d = m.add(d, { kind: "stamp", stamp: "stone", color: (["red", "yellow", "blue"] as const)[v - 1], ...(g.hidden ? { hidden: true } : {}), at: { at: "page", x: c.x + (j - (g.value.length - 1) / 2) * m.CELL * 0.6, y: c.y } }));
        // a stone with no grid is drawn at CELL's size (r = 0.28 × 48): three in a row need ~±40 units
        if (g.value.length * m.CELL * 0.6 / 2 > inner) rough.add("dots crowd a small piece (stones are a fixed size with no grid)");
      }
    });
    return { drawing: d, gaps, rough, S: m.CELL, textPx: textSize(d) * EXPORT_PX / m.PAGE, crowded: 0 };
  }

  // the margins the clues outside the grid need, in squares
  const runsLen = (mp: Map<number, number[]>) => Math.max(0, ...[...mp.values()].map((v) => v.length));
  const sides = new Set(p.edgeClues.map((e) => e.side));
  const mL = Math.max(sides.has("left") || p.rowTotals.size ? 1 : 0, runsLen(p.rowRuns) * 0.6 + (p.rowRuns.size ? 0.3 : 0));
  const mT = Math.max(sides.has("top") || p.colTotals.size ? 1 : 0, runsLen(p.colRuns) * 0.6 + (p.colRuns.size ? 0.3 : 0));
  const mR = sides.has("right") ? 1 : 0, mB = sides.has("bottom") ? 1 : 0;
  const bankRows = (p.bank.length ? 4 : 0) + (p.lengths ? 1 : 0);   // the shape bank, or a lattice's lengths, under the board
  const header = 1;                                   // the type's name and its rules, written above
  // a fill-in's list, written under the board: a line per length, wrapping at the board's width
  // (a number takes about 0.3 squares a digit, with 0.5 between numbers)
  const listLines: { text: string; x: number }[][] = [];
  for (const len of [...new Set(p.entries.map((e) => e.length))].sort((a, b) => a - b)) {
    let line: { text: string; x: number }[] = [], x = 0;
    for (const e of p.entries.filter((x) => x.length === len)) {
      const w = 0.3 * len;
      if (line.length && x + w > Math.max(cols, 4)) { listLines.push(line); line = []; x = 0; }
      line.push({ text: e.map((v) => (p.style.symbols ?? "0123456789")[v - 1]).join(""), x: x + w / 2 });
      x += w + 0.5;
    }
    listLines.push(line);
  }
  const listRows = listLines.length ? listLines.length * 0.8 + 0.4 : 0;
  const wide = cols + mL + mR, tall = rows + mT + mB + header + bankRows + listRows;
  const S = Math.min(m.PAGE * 0.96 / wide, m.PAGE * 0.96 / tall, m.PAGE / Math.max(rows, cols));
  if (rows > 30 || cols > 30) gaps.add("more than 30 rows or columns");
  if (S < m.MIN_SQUARE) gaps.add(`no room: squares would be ${S.toFixed(1)} < ${m.MIN_SQUARE}`);
  const grid = m.resizeGrid({ x: 0, y: 0, rows, cols, S: Math.max(S, m.MIN_SQUARE) }, rows, cols);
  d = m.setGrid(d, m.moveGrid(grid, (m.PAGE - wide * grid.S) / 2 + mL * grid.S, (m.PAGE - tall * grid.S) / 2 + (mT + header) * grid.S));
  // a panel's grid as its tracks (the grid tool's Tracks look), as a creator draws one
  if (genre === "panel") d = m.setGrid(d, { ...d.grid!, tracks: true });
  // hexagons and lattices: the grid tool's Hexagons and Dots looks
  if (p.grid.kind === "hex" || p.grid.kind === "lattice") d = m.setGrid(d, m.setLook(d.grid!, p.grid.kind === "hex" ? "hex" : "dots"));
  const g = d.grid!;
  if (g.rows !== rows || g.cols !== cols) gaps.add(`the grid can't be ${rows} × ${cols}`);
  // written above the grid: kept in its squares (as the sketchpad keeps anything placed near a grid), so it moves with it
  text(m.loose(g, { x: m.PAGE / 2, y: g.y - (mT + 0.5) * g.S }), [kindName(genre), ruleText(spec)].filter(Boolean).join(": "));

  // outlined areas (Star Battle, Aquarium, Irregular Sudoku): bold lines between different areas
  const boundaries = (same: (a: [number, number], b: [number, number]) => boolean, weight: m.Weight) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && !same([r, c], [r, c + 1])) line({ at: "corner", r, c: c + 1 }, { at: "corner", r: r + 1, c: c + 1 }, weight);
      if (r + 1 < rows && !same([r, c], [r + 1, c])) line({ at: "corner", r: r + 1, c }, { at: "corner", r: r + 1, c: c + 1 }, weight);
    }
  };
  if (spec.areas) boundaries(([a, b], [x, y]) => spec.areas![a][b] === spec.areas![x][y], "bold");
  // a sudoku's boxes
  if (p.rules.some((s) => s.rule === "boxes") && !spec.areas) {
    const own = p.rules.find((s) => s.rule === "boxes")?.box as [number, number] | undefined, [br, bc] = own ?? boxOf(cols);
    boundaries(([a, b], [x, y]) => Math.floor(a / br) === Math.floor(x / br) && Math.floor(b / bc) === Math.floor(y / bc), "medium");
  }
  // a nonogram's heavier line every 5
  const major = p.style.major;
  if (major) {
    for (let r = major; r < rows; r += major) line({ at: "corner", r, c: 0 }, { at: "corner", r, c: cols }, "medium");
    for (let c = major; c < cols; c += major) line({ at: "corner", r: 0, c }, { at: "corner", r: rows, c }, "medium");
  }
  /** a nonogram's numbers, each on its own, beside its row (right to left) or above its column (bottom up) */
  const runs = (at: "row" | "col", index: number, value: number[]) => (value.length ? value : [0]).forEach((n, k, all) => {
    const back = all.length - k - 1;
    text(at === "row" ? G(index + 0.5, -0.4 - back * 0.6) : G(-0.4 - back * 0.6, index + 0.5), String(n));
  });
  // a nonogram made from its picture: the numbers worked out from it, as a creator writes them (the
  // picture is the answer; a coloured picture's colours aren't drawn)
  if (spec.picture && !(spec.givens ?? []).some((x) => x.kind === "runs")) {
    rough.add("a coloured picture's colours (only its numbers are drawn)");
    for (const [i, v] of p.rowRuns) runs("row", i, v);
    for (const [i, v] of p.colRuns) runs("col", i, v);
  }

  const letters = p.style.symbols, tiles = tileSpec(p);
  // an Akari cipher's letter as written; a lettered puzzle's (or a fill-in's) digit as its symbol
  const cellText = (g0: Given) => (g0.kind === "number" && g0.letter ? g0.letter : letters && g0.kind === "number" ? letters[g0.value - 1] : String((g0 as { value: number }).value));
  const blocks = new Set([...p.blocked]);
  /** the middle of the border between two cells, as a loose point */
  const borderMid = ([[r1, c1], [r2, c2]]: [number, number][]) => G((r1 + r2) / 2 + 0.5, (c1 + c2) / 2 + 0.5);
  /** the grid line between two cells, as the sketchpad's edge anchor */
  const borderEdge = ([[r1, c1], [r2, c2]]: [number, number][]): m.EdgeAt => r1 === r2
    ? { at: "edge", r: r1, c: Math.max(c1, c2), side: "left" } : { at: "edge", r: Math.max(r1, r2), c: c1, side: "top" };
  const small = (at: m.Anchor, t: string) => { d = m.add(d, { kind: "text", at, text: t, small: true }); };
  const borderLine = ([[r1, c1], [r2, c2]]: [number, number][]): [m.Anchor, m.Anchor] => r1 === r2
    ? [{ at: "corner", r: r1, c: Math.max(c1, c2) }, { at: "corner", r: r1 + 1, c: Math.max(c1, c2) }]
    : [{ at: "corner", r: Math.max(r1, r2), c: c1 }, { at: "corner", r: Math.max(r1, r2), c: c1 + 1 }];
  const diamond = (r: number, c: number, h: number, weight: m.Weight) => {
    const pts = [G(r - h, c), G(r, c + h), G(r + h, c), G(r, c - h)];
    pts.forEach((a, k) => line(a, pts[(k + 1) % 4], weight));
  };
  const shapeOk = (cells: [number, number][], what: string) => {
    const n = normalShape(cells), h = Math.max(...n.map((x) => x[0])) + 1, w = Math.max(...n.map((x) => x[1])) + 1;
    if (h > PAD || w > PAD) gaps.add(`${what} bigger than the ${PAD} × ${PAD} shape pad`);
  };
  const lineColour = (c: string | undefined, what: string): m.SymbolColor | undefined => {
    if (c && !LINE_COLOURS.has(c)) gaps.add(`${what} in ${c}`);
    return c as m.SymbolColor | undefined;
  };

  for (const gv of spec.givens ?? []) {
    switch (gv.kind) {
      case "number": {
        const [r, c] = gv.cell;
        // a Twins and Triplets tile: its shape's stamp (stone, crest, triangle) in its colour
        if (tiles) {
          const t = tileOf(tiles, gv.value), at: m.Anchor = { at: "cell", r, c };
          stamp({ kind: "stamp", stamp: t.kind, color: t.color, ...(t.kind === "triangle" ? { count: 1 } : {}), at }, "tile");
          break;
        }
        text({ at: "cell", r, c }, cellText(gv));
        const it = d.items[d.items.length - 1] as Extract<m.Item, { kind: "text" }>;
        if (blocks.has(r * cols + c) && !onDark(d, it)) gaps.add("a number on a shaded square (ink on the dark rock)");
        break;
      }
      case "block": stamp({ kind: "stamp", stamp: "rock", at: { at: "cell", r: gv.cell[0], c: gv.cell[1] } }, "rock"); break;
      case "pearl": stamp({ kind: "stamp", stamp: "stone", color: gv.value, at: { at: "cell", r: gv.cell[0], c: gv.cell[1] } }, "pearl"); break;
      case "symbol": {
        const [r, c] = gv.cell, at: m.Anchor = { at: "cell", r, c };
        if (gv.value === "★") stamp({ kind: "stamp", stamp: "star", at }, "symbol");
        else if (STAMP_COLOURS.has(gv.value)) { rough.add("a coloured rose drawn as a stone"); stamp({ kind: "stamp", stamp: "stone", color: gv.value as m.SymbolColor, at }, "rose"); }
        else text(at, gv.value);
        break;
      }
      case "compass": {
        // a fine cross, and its numbers small at the square's sides
        const [r, c] = gv.cell, v = gv.value;
        line(G(r + 0.35, c + 0.5), G(r + 0.65, c + 0.5), "fine");
        line(G(r + 0.5, c + 0.35), G(r + 0.5, c + 0.65), "fine");
        for (const spot of ["n", "e", "s", "w"] as const) if (v[spot] !== undefined) small({ at: "inset", r, c, spot }, String(v[spot]));
        break;
      }
      case "palisade": {
        // a small diamond, its marked sides in medium pen, the rest fine
        rough.add("palisade: a small diamond of fine and medium lines");
        diamond(gv.cell[0] + 0.5, gv.cell[1] + 0.5, 0.3, "fine");
        break;
      }
      case "dots": break;   // figures only (above)
      case "wall": { const [a, b] = borderLine(gv.cells); line(a, b, "bold"); break; }
      case "twins": stamp({ kind: "stamp", stamp: "diamond", at: borderEdge(gv.cells) }, "twins"); break;
      case "opposites": stamp({ kind: "stamp", stamp: "open-diamond", at: borderEdge(gv.cells) }, "opposites"); break;
      case "inequality": {
        const [[r1, c1], [r2]] = gv.cells;
        rough.add("an inequality sign written as small text on a grid line");
        small(borderEdge(gv.cells), r1 === r2 ? (c1 < gv.cells[1][1] ? "<" : ">") : (r1 < r2 ? "∧" : "∨"));
        break;
      }
      case "difference": small(borderEdge(gv.cells), String(gv.value)); break;
      case "count": case "watchtower": small({ at: "corner", r: gv.corner[0], c: gv.corner[1] }, String(gv.value)); break;
      case "bank": break;   // below, beside the board
      case "door": {
        // an arrow across the outside edge, pointing in or out
        const { cell: [r, c], side } = gv, out = { top: [-1, 0], bottom: [1, 0], left: [0, -1], right: [0, 1] }[side];
        const mid = { r: r + 0.5 + out[0] * 0.5, c: c + 0.5 + out[1] * 0.5 }, far = { r: mid.r + out[0] * 0.8, c: mid.c + out[1] * 0.8 };
        const [tip, tail] = gv.role === "in" ? [mid, far] : [far, mid];
        line(G(tail.r, tail.c), G(tip.r, tip.c), "medium");
        const back = gv.role === "in" ? 1 : -1;
        for (const s of [-1, 1]) line(G(tip.r, tip.c), G(tip.r + out[0] * back * 0.25 + out[1] * s * 0.2, tip.c + out[1] * back * 0.25 + out[0] * s * 0.2), "medium");
        break;
      }
      case "first": case "skyscraper": {
        const { cell: [r, c], side } = gv, o = { top: [-1, 0], bottom: [1, 0], left: [0, -1], right: [0, 1] }[side];
        text({ at: "cell", r: r + o[0], c: c + o[1] }, gv.kind === "first" ? (letters ?? "ABCDEFGHIJ")[gv.value - 1] : String(gv.value));
        break;
      }
      case "thermo": {
        rough.add("a thermometer: a bold line and a white stone, not the board's wide pale tube");
        const [b0, ...rest] = gv.cells;
        stamp({ kind: "stamp", stamp: "stone", color: "white", at: { at: "cell", r: b0[0], c: b0[1] } }, "thermo bulb");
        d = m.add(d, { kind: "pen", weight: "bold", points: gv.cells.map(([r, c]) => ({ at: "cell", r, c }) as m.Anchor) });
        void rest;
        break;
      }
      case "galaxy": {
        const [y, x] = gv.point, at: m.Anchor = y % 2 && x % 2 ? { at: "cell", r: (y - 1) / 2, c: (x - 1) / 2 }
          : !(y % 2) && !(x % 2) ? { at: "corner", r: y / 2, c: x / 2 }
          : y % 2 ? { at: "edge", r: (y - 1) / 2, c: x / 2, side: "left" } : { at: "edge", r: y / 2, c: (x - 1) / 2, side: "top" };
        stamp({ kind: "stamp", stamp: "galaxy", at }, "galaxy");
        break;
      }
      case "runs": runs(gv.at, gv.index, gv.value); break;
      case "total": text(gv.at === "row" ? { at: "cell", r: gv.index, c: -1 } : { at: "cell", r: -1, c: gv.index }, String(gv.value)); break;
      // ---- panels ----
      case "start":
        stamp({ kind: "stamp", stamp: "start", color: lineColour(gv.color, "a start"), at: { at: "corner", r: gv.corner[0], c: gv.corner[1] } }, "start");
        break;
      case "end": stamp({ kind: "stamp", stamp: "end", at: { at: "corner", r: gv.corner[0], c: gv.corner[1] } }, "end"); break;
      case "hexagon": {
        const color = lineColour(gv.color, "a dot on the line");
        const at: m.Anchor = gv.at === "corner" ? { at: "corner", r: gv.corner[0], c: gv.corner[1] }
          : gv.corners[0][0] === gv.corners[1][0] ? { at: "edge", r: gv.corners[0][0], c: Math.min(gv.corners[0][1], gv.corners[1][1]), side: "top" }
          : { at: "edge", r: Math.min(gv.corners[0][0], gv.corners[1][0]), c: gv.corners[0][1], side: "left" };
        stamp({ kind: "stamp", stamp: "hoshi", color, at }, "hexagon");
        break;
      }
      case "gap": {
        // the eraser along a stretch of grid line
        const [[r1, c1], [r2, c2]] = gv.corners, n = d.items.length;
        d = m.gapEdge(d, r1 === r2 ? { at: "edge", r: r1, c: Math.min(c1, c2), side: "top" } : { at: "edge", r: Math.min(r1, r2), c: c1, side: "left" }, true);
        if (d.items.length <= n) gaps.add("two gaps on one line");
        break;
      }
      // a panel's squares are stones (docs/style.md): the stone stamp, in the square's colour
      case "square": stamp({ kind: "stamp", stamp: "stone", color: colour(gv.color, "", "a panel square", true), at: { at: "cell", r: gv.cell[0], c: gv.cell[1] } }, "square"); break;
      case "star": stamp({ kind: "stamp", stamp: "crest", color: colour(gv.color, "orange", "a star", true), at: { at: "cell", r: gv.cell[0], c: gv.cell[1] } }, "star"); break;
      case "triangle": stamp({ kind: "stamp", stamp: "triangle", count: gv.value, color: colour(gv.color, "orange", "triangles", true), at: { at: "cell", r: gv.cell[0], c: gv.cell[1] } }, "triangle"); break;
      case "shape": {
        shapeOk(gv.value, "a shape");
        stamp({ kind: "stamp", stamp: "shape", cells: normalShape(gv.value), color: colour(gv.color, gv.negative ? "blue" : "yellow", "a shape", true),
          ...(gv.negative ? { hollow: true } : {}), ...(gv.rotate ? { rotate: true } : {}), at: { at: "cell", r: gv.cell[0], c: gv.cell[1] } }, "shape");
        break;
      }
      case "eraser":
        stamp({ kind: "stamp", stamp: "eraser", color: colour(gv.color, "white", "an eraser", true), at: { at: "cell", r: gv.cell[0], c: gv.cell[1] } }, "eraser");
        break;
      // a printed color (Binary Puzzle, Abstract Art): the square washed in it
      case "color": {
        const name = colorName(p, gv.value);
        if ((m.WASHES as readonly string[]).includes(name)) d = m.washCell(d, { at: "cell", r: gv.cell[0], c: gv.cell[1] }, name as m.WashColor, true);
        else gaps.add(`a printed ${name} (no wash of that colour)`);
        break;
      }
      // a lattice: its dots are black stones on the points; the lengths written under it, roots as √n
      case "peg": stamp({ kind: "stamp", stamp: "stone", color: "black", at: { at: "cell", r: gv.cell[0], c: gv.cell[1] } }, "dot"); break;
      case "lengths": {
        const words = [...gv.value].sort((a, b) => a - b).map((v) => { const r = Math.round(Math.sqrt(v)); return r * r === v ? String(r) : `√${v}`; });
        text(G(rows + 0.7, cols / 2), words.join("  "));
        break;
      }
      default: gaps.add(`unknown clue kind ${(gv as Given).kind}`);
    }
  }
  // the shape bank: shapes off the grid, below it
  p.bank.forEach((cells, k) => {
    shapeOk(cells, "a bank shape");
    d = m.add(d, { kind: "stamp", stamp: "shape", cells: normalShape(cells), color: "yellow", at: m.loose(g, { x: g.x + (k * 2 + 1) * g.S, y: g.y + (rows + 2) * g.S }) });
  });
  // symmetry panels: written in the header, and the starts and dots in their lines' colours (above)
  // a fill-in's list, under the board
  listLines.forEach((line, k) => line.forEach(({ text: t, x }) =>
    text(m.loose(g, { x: g.x + x * g.S, y: g.y + (rows + 0.6 + k * 0.8) * g.S }), t)));

  // writing that runs into other writing
  const boxes = d.items.flatMap((it) => it.kind === "text" ? [textBox(g.S * (it.small ? 0.5 : 1), m.pointOf(g, it.at).x, m.pointOf(g, it.at).y, it.text)] : []);
  let crowded = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5) crowded++;
  }
  return { drawing: d, gaps, rough, S: g.S, textPx: textSize(d) * EXPORT_PX / m.PAGE, crowded };
}
