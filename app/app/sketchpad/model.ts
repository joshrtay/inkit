// The sketchpad's drawing (routes/new-draw.tsx): a grid, and what's drawn on and around it, kept as
// objects rather than pixels, so it can be undone, erased a piece at a time and, one day, read
// straight into a puzzle without the photo. Everything on the grid is kept in the grid's own
// squares: a cell, a corner, the middle of a line, or a loose point in squares from its top-left
// corner. So moving or resizing the grid carries it along, and a converter can read "a black
// stone in row 2, column 3" off it directly. What's off the grid is kept in page units.
//
// Pure: no DOM. draw.ts turns it into SVG; export.ts turns that into the picture the reader gets.

/** The page is PAGE × PAGE units: about a board's own scale, so the pen weights look the same. */
export const PAGE = 560;
/** A square as the boards draw it (picture.ts): the size of a stamp with no grid to size it by. */
export const CELL = 48;
/** The smallest square a grid can have. */
export const MIN_SQUARE = 14;
const MAX_LINES = 30;

export interface XY { x: number; y: number }
/** The grid: its top-left corner on the page, its rows and columns, and the size of a square. */
/** `tracks`: drawn as a panel's tracks (wide pale strokes with round ends) instead of pen lines. */
export interface Grid { x: number; y: number; rows: number; cols: number; S: number; tracks?: boolean }

/** Where something is. On the grid (rows and columns from its top-left corner): a square's
 *  centre; a corner where lines meet (0..rows, 0..cols); the middle of a square's top or left
 *  line (the bottom and right lines are the next square's: r up to rows for "top", c up to cols
 *  for "left"); or a loose point, in squares (fractions between). Off the grid: page units.
 *  Squares can be one ring outside the grid (r = -1 or rows), for clues written beside it. */
export type Anchor =
  | { at: "cell"; r: number; c: number }
  | { at: "corner"; r: number; c: number }
  | { at: "edge"; r: number; c: number; side: "top" | "left" }
  | { at: "inset"; r: number; c: number; spot: Spot }
  | { at: "grid"; r: number; c: number }
  | { at: "page"; x: number; y: number };
export type CellAt = Extract<Anchor, { at: "cell" }>;
export type EdgeAt = Extract<Anchor, { at: "edge" }>;
/** A place inside a square, toward one of its sides or corners (an "inset" anchor): where small
 *  writing goes, as a corner sum (nw) or a compass's numbers (n, e, s, w). */
export const SPOTS = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1], nw: [-1, -1], ne: [-1, 1], sw: [1, -1], se: [1, 1] } as const;
export type Spot = keyof typeof SPOTS;
/** How far an inset is from its square's centre, in squares: toward a side, and toward a corner (each way). */
const INSET_SIDE = 0.3, INSET_CORNER = 0.27;

/** The pen's weights (docs/style.md): fine for small marks, medium for outlines, bold for lines. */
export type Weight = "fine" | "medium" | "bold";
/** The watercolour tokens a wash can be. */
export const WASHES = ["red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
export type WashColor = typeof WASHES[number];
/** The colours a stone or a panel symbol can be (panel-draw.ts's PANEL_COLORS). */
export const SYMBOL_COLORS = ["black", "white", "red", "orange", "yellow", "green", "blue", "purple"] as const;
export type SymbolColor = typeof SYMBOL_COLORS[number];

/** The stamps, and what each snaps to: a square's centre, or a point of the grid. */
export const STAMP_SNAP = {
  stone: ["cell"], star: ["cell"], rock: ["cell"], x: ["cell", "edge"], dot: ["cell", "edge"],
  galaxy: ["cell", "corner", "edge"],
  // Panes' border marks: ◆ (the squares either side are twins) and ◇ (opposites)
  diamond: ["edge"], "open-diamond": ["edge"],
  hoshi: ["corner", "edge"], start: ["corner"], end: ["corner"],
  crest: ["cell"], triangle: ["cell"], shape: ["cell"], eraser: ["cell"],
} satisfies Record<string, Snap[]>;
export type StampKind = keyof typeof STAMP_SNAP;

export type Item =
  /** freehand pen */
  | { id: number; kind: "pen"; weight: Weight; points: Anchor[] }
  /** a straight pen line */
  | { id: number; kind: "line"; weight: Weight; from: Anchor; to: Anchor }
  /** a washed square */
  | { id: number; kind: "wash"; color: WashColor; at: CellAt }
  /** a freehand brush of wash */
  | { id: number; kind: "brush"; color: WashColor; points: Anchor[] }
  /** `color` for stones and panel symbols; `count` a triangle's; `cells` a shape's (from 0,0),
   *  `hollow` (a negative shape, drawn dashed) and `rotate` (it may turn: drawn tilted); `hidden`
   *  a stone that isn't shown until it's painted (Three Coats' hidden dots: a dashed outline) */
  | { id: number; kind: "stamp"; stamp: StampKind; at: Anchor; color?: SymbolColor; count?: number; cells?: [number, number][];
      hollow?: boolean; rotate?: boolean; hidden?: boolean }
  /** a number, letter or word, handwritten; `small`: half size (corner sums, compass and border numbers) */
  | { id: number; kind: "text"; at: Anchor; text: string; small?: boolean }
  /** a break in a grid line (a panel's gap): the line between two corners, left out */
  | { id: number; kind: "gap"; at: EdgeAt };
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
/** An item before it's added (add() gives it its id). */
export type NewItem = WithoutId<Item>;
export type Stamp = Extract<NewItem, { kind: "stamp" }>;

export interface Drawing { grid: Grid | null; items: Item[]; next: number }
export const EMPTY: Drawing = { grid: null, items: [], next: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- where things are ----

/** Where an anchor is on the page. (Grid anchors with no grid: as if the grid were at the page's corner.) */
export function pointOf(g: Grid | null, a: Anchor): XY {
  if (a.at === "page") return { x: a.x, y: a.y };
  const { x, y, S } = g ?? { x: 0, y: 0, S: CELL };
  const at = (r: number, c: number) => ({ x: x + c * S, y: y + r * S });
  switch (a.at) {
    case "cell": return at(a.r + 0.5, a.c + 0.5);
    case "inset": {
      const [dr, dc] = SPOTS[a.spot], k = dr && dc ? INSET_CORNER : INSET_SIDE;
      return at(a.r + 0.5 + dr * k, a.c + 0.5 + dc * k);
    }
    case "corner": case "grid": return at(a.r, a.c);
    case "edge": return a.side === "top" ? at(a.r, a.c + 0.5) : at(a.r + 0.5, a.c);
  }
}

/** The size things are drawn at: the grid's square, or a board's. */
export const squareOf = (d: Drawing) => d.grid?.S ?? CELL;

export type Snap = "cell" | "corner" | "edge" | "inset";

/** The nearest place of these kinds to `p` on the grid: any square's centre (in the grid or the
 *  ring just outside it) if squares are wanted, else a corner or the middle of a line no more than
 *  `reach` squares away. Null: off the grid, or too far from any point. */
export function snap(g: Grid | null, p: XY, to: readonly Snap[], reach = 0.5): Anchor | null {
  if (!g) return null;
  const r = (p.y - g.y) / g.S, c = (p.x - g.x) / g.S;
  const found: { a: Anchor; d: number }[] = [];
  const consider = (a: Anchor) => found.push({ a, d: dist(pointOf(g, a), p) / g.S });
  if (to.includes("cell")) {
    const cr = Math.floor(r), cc = Math.floor(c);
    if (cr >= -1 && cr <= g.rows && cc >= -1 && cc <= g.cols) consider({ at: "cell", r: cr, c: cc });
  }
  if (to.includes("corner")) {
    const vr = Math.round(r), vc = Math.round(c);
    if (vr >= 0 && vr <= g.rows && vc >= 0 && vc <= g.cols) consider({ at: "corner", r: vr, c: vc });
  }
  if (to.includes("edge")) {
    const tr = Math.round(r), tc = Math.floor(c), lr = Math.floor(r), lc = Math.round(c);
    if (tr >= 0 && tr <= g.rows && tc >= 0 && tc < g.cols) consider({ at: "edge", r: tr, c: tc, side: "top" });
    if (lr >= 0 && lr < g.rows && lc >= 0 && lc <= g.cols) consider({ at: "edge", r: lr, c: lc, side: "left" });
  }
  if (to.includes("inset")) {
    const cr = Math.floor(r), cc = Math.floor(c);
    if (cr >= 0 && cr < g.rows && cc >= 0 && cc < g.cols) for (const spot of Object.keys(SPOTS) as Spot[]) consider({ at: "inset", r: cr, c: cc, spot });
  }
  const best = found.sort((a, b) => a.d - b.d)[0];
  if (!best) return null;
  return best.a.at === "cell" || best.a.at === "inset" || best.d <= reach ? best.a : null;
}

/** A point kept as it is: in the grid's squares when there's a grid (however far from it), so it
 *  moves and grows with it, as clues in the margin should; on the page when there isn't. */
export function loose(g: Grid | null, p: XY): Anchor {
  if (g) return { at: "grid", r: round3((p.y - g.y) / g.S), c: round3((p.x - g.x) / g.S) };
  return { at: "page", x: round3(p.x), y: round3(p.y) };
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Where a stamp goes: snapped (when snapping is on and the tap is on the grid), else loose. */
export function stampAnchor(g: Grid | null, p: XY, stamp: StampKind, snapping: boolean): Anchor {
  return (snapping && snap(g, p, STAMP_SNAP[stamp])) || loose(g, p);
}

/** Where writing goes: a square's centre (snapping), or for small writing the nearest of a
 *  square's centre, sides and corners, a corner of the grid or the middle of a line. */
export function textAnchor(g: Grid | null, p: XY, small: boolean, snapping: boolean): Anchor {
  return (snapping && snap(g, p, small ? ["cell", "inset", "corner", "edge"] : ["cell"])) || loose(g, p);
}

/** The grid line under `p` (within `reach` page units of it): the stretch between two corners.
 *  `side`: only level lines ("top") or only upright ones ("left"). */
export function edgeAt(g: Grid | null, p: XY, reach: number, side?: EdgeAt["side"]): EdgeAt | null {
  if (!g) return null;
  const r = (p.y - g.y) / g.S, c = (p.x - g.x) / g.S, rr = Math.round(r), rc = Math.round(c);
  const found: { a: EdgeAt; d: number }[] = [];
  if (side !== "left" && rr >= 0 && rr <= g.rows && c >= 0 && c < g.cols) found.push({ a: { at: "edge", r: rr, c: Math.floor(c), side: "top" }, d: Math.abs(r - rr) * g.S });
  if (side !== "top" && rc >= 0 && rc <= g.cols && r >= 0 && r < g.rows) found.push({ a: { at: "edge", r: Math.floor(r), c: rc, side: "left" }, d: Math.abs(c - rc) * g.S });
  const best = found.filter((f) => f.d <= reach).sort((a, b) => a.d - b.d)[0];
  return best?.a ?? null;
}
/** A grid line's two ends, as corners. */
export function edgeEnds(e: EdgeAt): [Anchor, Anchor] {
  return [{ at: "corner", r: e.r, c: e.c }, e.side === "top" ? { at: "corner", r: e.r, c: e.c + 1 } : { at: "corner", r: e.r + 1, c: e.c }];
}

export function sameAnchor(a: Anchor, b: Anchor): boolean {
  if (a.at !== b.at) return false;
  if (a.at === "page") return near(a.x, (b as typeof a).x) && near(a.y, (b as typeof a).y);
  const o = b as Exclude<Anchor, { at: "page" }>;
  return near(a.r, o.r) && near(a.c, o.c) && (a.at !== "edge" || a.side === (o as typeof a).side)
    && (a.at !== "inset" || a.spot === (o as typeof a).spot);
}

/** Which way an end sticks out from a corner: away from the grid on its edge; up otherwise. */
export function outward(g: Grid | null, a: Anchor): XY {
  if (!g || a.at !== "corner") return { x: 0, y: -1 };
  if (a.r === 0) return { x: 0, y: -1 };
  if (a.r === g.rows) return { x: 0, y: 1 };
  if (a.c === 0) return { x: -1, y: 0 };
  if (a.c === g.cols) return { x: 1, y: 0 };
  return { x: 0, y: -1 };
}

// ---- lines ----

/** A line from `a` toward `b`, made exactly level or upright when it's within `deg` of it. */
export function lockAxis(a: XY, b: XY, deg = 8): XY {
  const angle = Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  if (angle <= deg || angle >= 180 - deg) return { x: b.x, y: a.y };
  if (Math.abs(angle - 90) <= deg) return { x: a.x, y: b.y };
  return b;
}

/** A line's end: the nearest grid corner when snapping and one is close, else where it is. */
export function lineEnd(g: Grid | null, p: XY, snapping: boolean, reach = 0.35): Anchor {
  return (snapping && snap(g, p, ["corner"], reach)) || loose(g, p);
}

/** A straight line from `a` to `b`: level or upright near the axes, its ends on grid corners. */
export function straightLine(g: Grid | null, a: XY, b: XY, snapping: boolean): { from: Anchor; to: Anchor } {
  const from = lineEnd(g, a, snapping), start = pointOf(g, from);
  return { from, to: lineEnd(g, lockAxis(start, b), snapping) };
}

/** Points every `step` or so from `a` to `b` (not `a`, but `b`): what a quick drag passed over. */
export function along(a: XY, b: XY, step: number): XY[] {
  const n = Math.max(1, Math.ceil(dist(a, b) / step));
  return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n }));
}

/** A freehand stroke's points with the jitter taken out (no two closer than `min`). */
export function simplify(points: XY[], min = 1.5): XY[] {
  const out: XY[] = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1], p) >= min) out.push(p);
  const last = points[points.length - 1];
  if (last && out.length > 1 && out[out.length - 1] !== last) out[out.length - 1] = last;
  return out;
}

/** A freehand stroke, kept: smoothed, its ends on grid corners when snapping and they're close. */
export function penStroke(g: Grid | null, points: XY[], snapping: boolean): Anchor[] {
  const pts = simplify(points);
  if (!pts.length) return [];
  const out = pts.map((p) => loose(g, p));
  if (snapping && pts.length > 1) {
    const first = snap(g, pts[0], ["corner"], 0.3), last = snap(g, pts[pts.length - 1], ["corner"], 0.3);
    if (first) out[0] = first;
    if (last) out[out.length - 1] = last;
  }
  return out;
}

/** An SVG path through the points, smoothed (curves through the midpoints). */
export function smoothPath(pts: XY[]): string {
  const f = (v: number) => Math.round(v * 10) / 10, P = (p: XY) => `${f(p.x)} ${f(p.y)}`;
  if (!pts.length) return "";
  if (pts.length === 1) return `M${P(pts[0])}l0.01 0`;
  let d = `M${P(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    d += `Q${P(pts[i])} ${P(m)}`;
  }
  return d + `L${P(pts[pts.length - 1])}`;
}

// ---- shapes (the shape stamp's pad) ----

export type Cells = [number, number][];
/** A shape's squares moved up against 0,0, in reading order, each once. */
export function normalCells(cells: Cells): Cells {
  if (!cells.length) return [];
  const r0 = Math.min(...cells.map((x) => x[0])), c0 = Math.min(...cells.map((x) => x[1]));
  const keys = [...new Set(cells.map(([r, c]) => `${r - r0},${c - c0}`))];
  return keys.map((k) => k.split(",").map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
/** A quarter turn clockwise. */
export const turnCells = (cells: Cells): Cells => normalCells(cells.map(([r, c]) => [c, -r]));
/** Its mirror image, left to right. */
export const flipCells = (cells: Cells): Cells => normalCells(cells.map(([r, c]) => [r, -c]));
/** A square of the pad on or off (never the last one off). */
export function toggleCell(cells: Cells, r: number, c: number): Cells {
  const has = cells.some((x) => x[0] === r && x[1] === c);
  if (has && cells.length === 1) return cells;
  return has ? cells.filter((x) => x[0] !== r || x[1] !== c) : [...cells, [r, c]];
}

// ---- the grid ----

/** A grid over a dragged rectangle, its rows and columns given or worked out from the drag (squares
 *  about a board's size), its squares square. Null: the drag is too small to be a grid. */
export function gridFromDrag(a: XY, b: XY, rows?: number, cols?: number): Grid | null {
  const x0 = clamp(Math.min(a.x, b.x), 0, PAGE), y0 = clamp(Math.min(a.y, b.y), 0, PAGE);
  const w = clamp(Math.max(a.x, b.x), 0, PAGE) - x0, h = clamp(Math.max(a.y, b.y), 0, PAGE) - y0;
  if (w < MIN_SQUARE || h < MIN_SQUARE) return null;
  const nc = cols ?? clamp(Math.round(w / CELL), 1, MAX_LINES), nr = rows ?? clamp(Math.round(h / CELL), 1, MAX_LINES);
  const S = Math.max(MIN_SQUARE, Math.min(w / nc, h / nr));
  return fit({ x: x0, y: y0, rows: nr, cols: nc, S });
}

/** The grid kept on the page: squares made smaller if it can't fit, then moved onto it. */
function fit(g: Grid): Grid {
  const S = Math.min(g.S, PAGE / g.cols, PAGE / g.rows);
  return { ...g, S, x: clamp(g.x, 0, PAGE - g.cols * S), y: clamp(g.y, 0, PAGE - g.rows * S) };
}

/** More or fewer rows and columns, squares the same size (smaller if it would leave the page). */
export const resizeGrid = (g: Grid, rows: number, cols: number): Grid =>
  fit({ ...g, rows: clamp(rows, 1, MAX_LINES), cols: clamp(cols, 1, MAX_LINES) });
export const moveGrid = (g: Grid, dx: number, dy: number): Grid => fit({ ...g, x: g.x + dx, y: g.y + dy });
/** The grid stretched by its bottom-right corner to `p` (its squares stay square). */
export const stretchGrid = (g: Grid, p: XY): Grid =>
  fit({ ...g, S: Math.max(MIN_SQUARE, Math.min((p.x - g.x) / g.cols, (p.y - g.y) / g.rows)) });
/** Whether `p` is on the grid's bottom-right corner (its handle for stretching). */
export const onHandle = (g: Grid, p: XY, reach = 12) => dist(p, { x: g.x + g.cols * g.S, y: g.y + g.rows * g.S }) <= reach;
export const inGrid = (g: Grid | null, p: XY) => !!g && p.x >= g.x && p.y >= g.y && p.x <= g.x + g.cols * g.S && p.y <= g.y + g.rows * g.S;
/** The square at `p`, if it's in the grid itself. */
export function cellAt(g: Grid | null, p: XY): CellAt | null {
  if (!g || !inGrid(g, p)) return null;
  return { at: "cell", r: clamp(Math.floor((p.y - g.y) / g.S), 0, g.rows - 1), c: clamp(Math.floor((p.x - g.x) / g.S), 0, g.cols - 1) };
}

export const setGrid = (d: Drawing, grid: Grid): Drawing => ({ ...d, grid });

/** No grid: what was on it stays where it is, now on the page. */
export function removeGrid(d: Drawing): Drawing {
  const g = d.grid;
  if (!g) return d;
  const keep = (a: Anchor): Anchor => { const p = pointOf(g, a); return { at: "page", x: round3(p.x), y: round3(p.y) }; };
  const items = d.items.flatMap((it): Item[] => {
    switch (it.kind) {
      case "pen": case "brush": return [{ ...it, points: it.points.map(keep) }];
      case "line": return [{ ...it, from: keep(it.from), to: keep(it.to) }];
      case "wash": case "gap": return [];   // a washed square, a gap in a line: the grid's
      case "stamp": case "text": return [{ ...it, at: keep(it.at) }];
    }
  });
  return { ...d, grid: null, items };
}

// ---- changing the drawing ----

export function add(d: Drawing, item: NewItem): Drawing {
  return { ...d, items: [...d.items, { ...item, id: d.next } as Item], next: d.next + 1 };
}
export function remove(d: Drawing, ids: Iterable<number>): Drawing {
  const gone = new Set(ids);
  if (![...gone].some((id) => d.items.some((it) => it.id === id))) return d;
  return { ...d, items: d.items.filter((it) => !gone.has(it.id)) };
}
export const clear = (d: Drawing): Drawing => (d.items.length || d.grid ? { ...EMPTY, next: d.next } : d);

const sameStamp = (a: Stamp, b: Stamp) => a.stamp === b.stamp && a.color === b.color && a.count === b.count
  && JSON.stringify(a.cells) === JSON.stringify(b.cells) && !a.hollow === !b.hollow && !a.rotate === !b.rotate && !a.hidden === !b.hidden;

/** Stamp something: the same stamp tapped again comes off; a different one in the same place
 *  (a square holds one stamp, as a point does) takes its spot. */
export function stamp(d: Drawing, s: Stamp): Drawing {
  const there = d.items.find((it): it is Extract<Item, { kind: "stamp" }> => it.kind === "stamp" && sameAnchor(it.at, s.at) && s.at.at !== "grid" && s.at.at !== "page");
  if (there && sameStamp(there, s)) return remove(d, [there.id]);
  return add(there ? remove(d, [there.id]) : d, s);
}

/** Wash a square in a colour (`on`), or take its wash off; a washed square has one colour. */
export function washCell(d: Drawing, at: CellAt, color: WashColor, on: boolean): Drawing {
  const there = d.items.find((it): it is Extract<Item, { kind: "wash" }> => it.kind === "wash" && sameAnchor(it.at, at));
  if (!on) return there ? remove(d, [there.id]) : d;
  if (there?.color === color) return d;
  return add(there ? remove(d, [there.id]) : d, { kind: "wash", color, at });
}
/** The wash on a square, if any. */
export const washOf = (d: Drawing, at: CellAt) =>
  d.items.find((it): it is Extract<Item, { kind: "wash" }> => it.kind === "wash" && sameAnchor(it.at, at));

/** Write in a place, replacing what was written there; nothing written takes it away. */
export function write(d: Drawing, at: Anchor, text: string, small = false): Drawing {
  const there = textAt(d, at), t = text.trim();
  if (there && there.text === t && !there.small === !small) return d;
  const without = there ? remove(d, [there.id]) : d;
  return t ? add(without, { kind: "text", at, text: t, ...(small ? { small: true } : {}) }) : without;
}

/** Break a grid line (`on`), or mend it. */
export function gapEdge(d: Drawing, at: EdgeAt, on: boolean): Drawing {
  const there = gapAt(d, at);
  if (on === !!there) return d;
  return there ? remove(d, [there.id]) : add(d, { kind: "gap", at });
}
export const gapAt = (d: Drawing, at: EdgeAt) =>
  d.items.find((it): it is Extract<Item, { kind: "gap" }> => it.kind === "gap" && sameAnchor(it.at, at));
/** The grid lines left out. */
export const gapsOf = (d: Drawing): EdgeAt[] => d.items.flatMap((it) => (it.kind === "gap" ? [it.at] : []));
export const textAt = (d: Drawing, at: Anchor) =>
  d.items.find((it): it is Extract<Item, { kind: "text" }> => it.kind === "text" && sameAnchor(it.at, at));

// ---- what's under a point (the eraser) ----

/** The layers, bottom to top (draw.ts draws them in this order; the grid goes over the washes). */
export const LAYERS: Item["kind"][][] = [["gap", "wash", "brush"], ["pen", "line"], ["stamp"], ["text"]];
const layerOf = (k: Item["kind"]) => LAYERS.findIndex((l) => l.includes(k));

function segDist(p: XY, a: XY, b: XY) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1) : 0;
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
const pathDist = (p: XY, pts: XY[]) => pts.length === 1 ? dist(p, pts[0]) : Math.min(...pts.slice(1).map((b, i) => segDist(p, pts[i], b)));

/** How far `p` is from an item's ink (0 inside a washed square). */
export function distanceTo(d: Drawing, it: Item, p: XY): number {
  const g = d.grid, S = squareOf(d), at = (a: Anchor) => pointOf(g, a);
  switch (it.kind) {
    case "pen": return pathDist(p, it.points.map(at));
    case "brush": return Math.max(0, pathDist(p, it.points.map(at)) - 6);   // half a wash stroke
    case "line": return segDist(p, at(it.from), at(it.to));
    case "wash": { const c = at(it.at); return Math.max(0, Math.abs(p.x - c.x) - S / 2, Math.abs(p.y - c.y) - S / 2); }
    case "stamp": return Math.max(0, dist(p, at(it.at)) - S * 0.3);
    case "text": return Math.max(0, dist(p, at(it.at)) - S * (it.small ? 0.15 : 0.3));
    case "gap": { const [a, b] = edgeEnds(it.at); return segDist(p, at(a), at(b)); }
  }
}

/** The item under `p` (within `reach`): the top one, and of those the nearest. */
export function hit(d: Drawing, p: XY, reach = 8, only?: (it: Item) => boolean): Item | null {
  let best: { it: Item; layer: number; d: number } | null = null;
  for (const it of d.items) {
    if (only && !only(it)) continue;
    const dd = distanceTo(d, it, p);
    if (dd > reach) continue;
    const layer = layerOf(it.kind);
    if (!best || layer > best.layer || (layer === best.layer && dd <= best.d)) best = { it, layer, d: dd };
  }
  return best?.it ?? null;
}

// ---- undo ----

export interface History { past: Drawing[]; now: Drawing; future: Drawing[] }
const KEEP = 200;
export const start = (d: Drawing = EMPTY): History => ({ past: [], now: d, future: [] });
/** A change, as one step to undo. */
export function commit(h: History, next: Drawing): History {
  if (next === h.now) return h;
  return { past: [...h.past, h.now].slice(-KEEP), now: next, future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) };
}

// ---- the drawing as data ----

/** The drawing as plain data: the grid, and each thing on it with where it is (grid anchors in
 *  squares from the grid's top-left), in the order drawn. What a converter into a puzzle reads. */
export function objects(d: Drawing) {
  return {
    page: PAGE,
    grid: d.grid && { rows: d.grid.rows, cols: d.grid.cols, x: d.grid.x, y: d.grid.y, square: d.grid.S, ...(d.grid.tracks ? { tracks: true } : {}) },
    items: d.items.map(({ id: _id, ...rest }) => rest),
  };
}

/** A saved drawing read back, if it's one (anything else: null). */
export function revive(v: unknown): Drawing | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<Drawing>;
  if (!Array.isArray(o.items) || typeof o.next !== "number") return null;
  const g = o.grid;
  if (g && !(["x", "y", "rows", "cols", "S"] as const).every((k) => typeof g[k] === "number")) return null;
  return { grid: g ?? null, items: o.items as Item[], next: o.next };
}
