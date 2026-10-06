// The square grid as a graph (see docs/grid-engine.md). Every element has a numeric id:
//   cells    r * cols + c
//   corners  r * (cols + 1) + c          (r in 0..rows, c in 0..cols)
//   borders  between two corners; each separates up to two cells (-1 = outside)
//   links    between two neighbouring cell centers; one per interior border
// Imports use explicit .ts extensions so Node can run the engine directly (build scripts).
export type RC = [number, number];

export interface Border {
  id: number;
  corners: [number, number];
  cells: [number, number];        // [above or left, below or right]; -1 outside the grid
  horizontal: boolean;
  link: number;                    // the link across it, or -1 on the outside
}

export interface Link {
  id: number;
  cells: [number, number];
  border: number;
}

export interface Grid {
  rows: number;
  cols: number;
  cellCount: number;
  cornerCount: number;
  borders: Border[];
  links: Link[];
  cell(r: number, c: number): number;
  rc(cell: number): RC;
  corner(r: number, c: number): number;
  cornerRC(corner: number): RC;
  cellBorders: number[][];         // a cell's 4 borders
  cellLinks: number[][];           // a cell's links to its neighbours
  cornerBorders: number[][];       // the borders meeting at a corner
  borderBetween(a: number, b: number): number;   // -1 if not neighbours
}

export function squareGrid(rows: number, cols: number): Grid {
  const cell = (r: number, c: number) => r * cols + c;
  const corner = (r: number, c: number) => r * (cols + 1) + c;
  const inside = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
  const borders: Border[] = [], links: Link[] = [];
  const cellBorders: number[][] = Array.from({ length: rows * cols }, () => []);
  const cellLinks: number[][] = Array.from({ length: rows * cols }, () => []);
  const cornerBorders: number[][] = Array.from({ length: (rows + 1) * (cols + 1) }, () => []);
  const between = new Map<string, number>();

  const add = (c1: number, c2: number, a: number, b: number, horizontal: boolean) => {
    const id = borders.length;
    let link = -1;
    if (a >= 0 && b >= 0) {
      link = links.length;
      links.push({ id: link, cells: [a, b], border: id });
      cellLinks[a].push(link); cellLinks[b].push(link);
      between.set(`${a},${b}`, id); between.set(`${b},${a}`, id);
    }
    borders.push({ id, corners: [c1, c2], cells: [a, b], horizontal, link });
    if (a >= 0) cellBorders[a].push(id);
    if (b >= 0) cellBorders[b].push(id);
    cornerBorders[c1].push(id); cornerBorders[c2].push(id);
  };
  for (let r = 0; r <= rows; r++)          // horizontal borders: cell above / below
    for (let c = 0; c < cols; c++)
      add(corner(r, c), corner(r, c + 1), inside(r - 1, c) ? cell(r - 1, c) : -1, inside(r, c) ? cell(r, c) : -1, true);
  for (let r = 0; r < rows; r++)           // vertical borders: cell left / right
    for (let c = 0; c <= cols; c++)
      add(corner(r, c), corner(r + 1, c), inside(r, c - 1) ? cell(r, c - 1) : -1, inside(r, c) ? cell(r, c) : -1, false);

  return {
    rows, cols, cellCount: rows * cols, cornerCount: (rows + 1) * (cols + 1), borders, links,
    cell, rc: (i) => [Math.floor(i / cols), i % cols], corner, cornerRC: (i) => [Math.floor(i / (cols + 1)), i % (cols + 1)],
    cellBorders, cellLinks, cornerBorders,
    borderBetween: (a, b) => between.get(`${a},${b}`) ?? -1,
  };
}

/** A figure of polygon pieces as a grid: each piece is a cell (row 0, column i), and pieces that
 *  share part of an edge are neighbours, with a border and a link between them. There are no
 *  corners, and borders have no corner ends. Corners closer than `snap` (a fraction of the
 *  figure's size) are moved together first, so hand-traced pieces meet. */
export function figureGrid(pieces: number[][][], snap = 0.015): { grid: Grid; pieces: number[][][] } {
  const all = pieces.flat();
  if (pieces.length < 1 || pieces.some((p) => p.length < 3)) throw new Error("every piece needs at least three corners");
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  // snap: each corner joins the first earlier corner within reach
  const kept: number[][] = [];
  const snapped = pieces.map((p) => p.map(([x, y]) => {
    const hit = kept.find(([a, b]) => Math.hypot(a - x, b - y) <= span * snap);
    if (hit) return hit;
    const pt = [x, y]; kept.push(pt); return pt;
  }));
  const tol = span * 0.004;
  const edges = snapped.map((p) => p.map((pt, i) => [pt, p[(i + 1) % p.length]]));
  const n = pieces.length, borders: Border[] = [], links: Link[] = [];
  const cellBorders: number[][] = Array.from({ length: n }, () => []), cellLinks: number[][] = Array.from({ length: n }, () => []);
  const between = new Map<string, number>();
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (!edges[a].some(([p, q]) => edges[b].some(([r, s]) => sharesEdge(p, q, r, s, tol)))) continue;
    const id = borders.length;
    borders.push({ id, corners: [-1, -1], cells: [a, b], horizontal: false, link: id });
    links.push({ id, cells: [a, b], border: id });
    cellBorders[a].push(id); cellBorders[b].push(id); cellLinks[a].push(id); cellLinks[b].push(id);
    between.set(`${a},${b}`, id); between.set(`${b},${a}`, id);
  }
  const grid: Grid = {
    rows: 1, cols: n, cellCount: n, cornerCount: 0, borders, links,
    cell: (_r, c) => c, rc: (i) => [0, i], corner: () => -1, cornerRC: () => [0, 0],
    cellBorders, cellLinks, cornerBorders: [], borderBetween: (a, b) => between.get(`${a},${b}`) ?? -1,
  };
  return { grid, pieces: snapped.map((p) => p.map((pt) => [...pt])) };
}

/** Do two segments lie on one line and overlap for more than a point? (Touching at a corner
 *  doesn't make neighbours.) */
function sharesEdge(a1: number[], a2: number[], b1: number[], b2: number[], tol: number) {
  const dx = a2[0] - a1[0], dy = a2[1] - a1[1], len = Math.hypot(dx, dy);
  if (len < 1e-9) return false;
  const cross = (p: number[]) => (dx * (p[1] - a1[1]) - dy * (p[0] - a1[0])) / len;
  if (Math.abs(cross(b1)) > tol || Math.abs(cross(b2)) > tol) return false;
  const along = (p: number[]) => (dx * (p[0] - a1[0]) + dy * (p[1] - a1[1])) / len;
  const lo = Math.max(0, Math.min(along(b1), along(b2))), hi = Math.min(len, Math.max(along(b1), along(b2)));
  return hi - lo > 2 * tol;
}
