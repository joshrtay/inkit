// The grid as a graph (see docs/grid-engine.md). Every element has a numeric id:
//   cells    r * cols + c
//   corners  r * (cols + 1) + c          (r in 0..rows, c in 0..cols)
//   borders  between two corners; each separates up to two cells (-1 = outside)
//   links    between two neighbouring cell centers; one per interior border
// Four shapes: the square grid; a honeycomb of hexagons in rows (hexGrid: six neighbours, corners
// and borders worked out from the hexagons); a lattice of points (latticeGrid: each cell is a point,
// and links join the dots on it); and a figure of polygon pieces (figureGrid).
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

/** The grid's shape: squares, hexagons in rows, points of a lattice, or a figure of pieces. */
export type GridKind = "square" | "hex" | "lattice" | "figure";

export interface Grid {
  kind: GridKind;
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
  /** where a cell's centre and a corner are, in cell widths from the top-left (not for figures) */
  cellXY(cell: number): [number, number];
  cornerXY(corner: number): [number, number];
  /** the board's width and height in cell widths */
  width: number;
  height: number;
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
    kind: "square", rows, cols, cellCount: rows * cols, cornerCount: (rows + 1) * (cols + 1), borders, links,
    cell, rc: (i) => [Math.floor(i / cols), i % cols], corner, cornerRC: (i) => [Math.floor(i / (cols + 1)), i % (cols + 1)],
    cellBorders, cellLinks, cornerBorders,
    borderBetween: (a, b) => between.get(`${a},${b}`) ?? -1,
    cellXY: (i) => [(i % cols) + 0.5, Math.floor(i / cols) + 0.5], cornerXY: (v) => [v % (cols + 1), Math.floor(v / (cols + 1))],
    width: cols, height: rows,
  };
}

/** A hexagon's side, in cell widths (a hexagon is 1 wide, point to point 2 sides tall). */
export const HEX_SIDE = 1 / Math.sqrt(3);
/** Hexagons in rows, pointy side up, every other row (1, 3...) shifted half a hexagon right, so a
 *  hexagon touches six others: two in its row and two in each row beside it. Cells are
 *  r * cols + c as in the square grid; corners are the hexagons' corners (shared where they meet,
 *  numbered in the order found), and borders the hexagons' sides. Corners have no row and column:
 *  `corner` and `cornerRC` aren't used. */
export function hexGrid(rows: number, cols: number): Grid {
  const s = HEX_SIDE, cell = (r: number, c: number) => r * cols + c;
  const centre = (r: number, c: number): [number, number] => [c + 0.5 + (r % 2) * 0.5, s + r * 1.5 * s];
  // the corners, clockwise from the top: top, upper right, lower right, bottom, lower left, upper left
  const ANGLES = [-90, -30, 30, 90, 150, 210].map((a) => (a * Math.PI) / 180);
  const points: [number, number][] = [], pointId = new Map<string, number>();
  const pointAt = (x: number, y: number) => {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    let id = pointId.get(k);
    if (id === undefined) { id = points.length; pointId.set(k, id); points.push([x, y]); }
    return id;
  };
  const cellCorners = Array.from({ length: rows * cols }, (_, i) => {
    const [x, y] = centre(Math.floor(i / cols), i % cols);
    return ANGLES.map((a) => pointAt(x + s * Math.cos(a), y + s * Math.sin(a)));
  });
  const borders: Border[] = [], links: Link[] = [];
  const cellBorders: number[][] = Array.from({ length: rows * cols }, () => []), cellLinks: number[][] = Array.from({ length: rows * cols }, () => []);
  const cornerBorders: number[][] = points.map(() => []);
  const sideOf = new Map<string, number>(), between = new Map<string, number>();
  cellCorners.forEach((cs, i) => cs.forEach((v, k) => {
    const w = cs[(k + 1) % 6], key = v < w ? `${v},${w}` : `${w},${v}`;
    const e = sideOf.get(key);
    if (e === undefined) {
      const id = borders.length;
      sideOf.set(key, id);
      borders.push({ id, corners: [v, w], cells: [i, -1], horizontal: false, link: -1 });
      cellBorders[i].push(id); cornerBorders[v].push(id); cornerBorders[w].push(id);
    } else {
      const b = borders[e], other = b.cells[0], link = links.length;
      b.cells = [other, i]; b.link = link;
      links.push({ id: link, cells: [other, i], border: e });
      cellBorders[i].push(e); cellLinks[other].push(link); cellLinks[i].push(link);
      between.set(`${other},${i}`, e); between.set(`${i},${other}`, e);
    }
  }));
  return {
    kind: "hex", rows, cols, cellCount: rows * cols, cornerCount: points.length, borders, links,
    cell, rc: (i) => [Math.floor(i / cols), i % cols], corner: () => -1, cornerRC: () => [0, 0],
    cellBorders, cellLinks, cornerBorders,
    borderBetween: (a, b) => between.get(`${a},${b}`) ?? -1,
    cellXY: (i) => centre(Math.floor(i / cols), i % cols), cornerXY: (v) => points[v],
    width: cols + (rows > 1 ? 0.5 : 0), height: 2 * s + (rows - 1) * 1.5 * s,
  };
}

/** The six neighbours of a hexagon in hexGrid's rows (fewer at the edges), as [row, col]. */
export function hexNeighbours(rows: number, cols: number, r: number, c: number): [number, number][] {
  const odd = r % 2;
  return ([[r, c - 1], [r, c + 1], [r - 1, c - 1 + odd], [r - 1, c + odd], [r + 1, c - 1 + odd], [r + 1, c + odd]] as [number, number][])
    .filter(([y, x]) => y >= 0 && x >= 0 && y < rows && x < cols);
}

/** A lattice of rows × cols points, each a cell (r * cols + c, at the middle of where a square
 *  would be), with dots on some of them. Every two dots are joined by a link (a straight segment
 *  between them), unless the segment would run through another dot. There are no corners or
 *  borders: a link's border is -1. */
export function latticeGrid(rows: number, cols: number, dots: number[]): Grid {
  const cell = (r: number, c: number) => r * cols + c, rc = (i: number): RC => [Math.floor(i / cols), i % cols];
  const on = new Set(dots), list = [...on].sort((a, b) => a - b), links: Link[] = [];
  const cellLinks: number[][] = Array.from({ length: rows * cols }, () => []);
  const between = new Map<string, number>();
  for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
    const a = list[x], b = list[y], [r1, c1] = rc(a), [r2, c2] = rc(b);
    // the lattice points strictly between them, every gcd-th step
    const g = gcd(Math.abs(r2 - r1), Math.abs(c2 - c1)), dr = (r2 - r1) / g, dc = (c2 - c1) / g;
    let through = false;
    for (let k = 1; k < g; k++) if (on.has(cell(r1 + dr * k, c1 + dc * k))) through = true;
    if (through) continue;
    const id = links.length;
    links.push({ id, cells: [a, b], border: -1 });
    cellLinks[a].push(id); cellLinks[b].push(id);
    between.set(`${a},${b}`, id); between.set(`${b},${a}`, id);
  }
  return {
    kind: "lattice", rows, cols, cellCount: rows * cols, cornerCount: 0, borders: [], links,
    cell, rc, corner: () => -1, cornerRC: () => [0, 0],
    cellBorders: Array.from({ length: rows * cols }, () => []), cellLinks, cornerBorders: [],
    borderBetween: () => -1,
    cellXY: (i) => [(i % cols) + 0.5, Math.floor(i / cols) + 0.5], cornerXY: () => [0, 0],
    width: cols, height: rows,
  };
}
/** The link between two cells (any grid), or -1. */
export const linkBetween = (g: Grid, a: number, b: number) => g.cellLinks[a].find((l) => g.links[l].cells.includes(b)) ?? -1;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

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
    kind: "figure", rows: 1, cols: n, cellCount: n, cornerCount: 0, borders, links,
    cell: (_r, c) => c, rc: (i) => [0, i], corner: () => -1, cornerRC: () => [0, 0],
    cellBorders, cellLinks, cornerBorders: [], borderBetween: (a, b) => between.get(`${a},${b}`) ?? -1,
    cellXY: () => [0, 0], cornerXY: () => [0, 0], width: 0, height: 0,
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
