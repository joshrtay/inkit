// The track cursor: how a drag turns into a line, for every line the player draws (a panel's line
// from corner to corner, loops through cell centres, loops along the grid lines). The line's head
// lives on a graph of tracks and moves continuously along it, as in The Witness (see
// docs/line-input.md): each pointer move puts the head at the nearest point of the tracks around
// it, sliding through junctions and round corners, eating the line when it moves back, and
// stopping partway at gaps, at its own line and at the mirror line. Pure: the player (game.ts)
// keeps a Cursor per drag and turns its path into marks.
import type { Grid } from "../../engine/geometry.ts";

export type XY = [number, number];

/** A graph of tracks: nodes at points on the board, joined by straight segments. */
export interface Track {
  readonly size: number;
  xy(n: number): XY;
  /** the nodes one segment away */
  next(n: number): number[];
  /** the board's id for the segment a–b (a border or a link), or -1 for an end's stub */
  edge(a: number, b: number): number;
  /** a segment the line can't cross (a panel's gap) */
  gap(a: number, b: number): boolean;
}

export interface Rules {
  /** "block": the line never touches itself (panels); "close": it may run into its own start to
   *  close a loop (loop strokes) */
  revisit: "block" | "close";
  /** the mirror image of a node, for a two-line panel */
  mirror?: (n: number) => number;
}

/** The line: the nodes it has reached, and how far its head is along the next segment. */
export interface Cursor {
  path: number[];
  /** the node the head is heading to, or -1 when it sits on the last node */
  toward: number;
  /** 0..1 along path's last node → toward */
  t: number;
}

/** How far into a segment the head can go: a gap, its own line, the mirror line. */
export const GAP_REACH = 0.3, BUMP_REACH = 0.72, MEET_REACH = 0.36;
/** Backing up wins over a turn that's this much nearer (a fraction of the segment), so a
 *  retrace eats the line rather than winding round beside it. */
export const BACK_BIAS = 0.25;
const EPS = 1e-6;

const last = <T>(a: T[]) => a[a.length - 1];
const sub = ([x1, y1]: XY, [x2, y2]: XY): XY => [x1 - x2, y1 - y2];
const lerp = ([x1, y1]: XY, [x2, y2]: XY, t: number): XY => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];

export const begin = (n: number): Cursor => ({ path: [n], toward: -1, t: 0 });

/** Has the line closed into a loop? */
export const closed = (c: Cursor) => c.path.length > 3 && c.path[0] === last(c.path);

/** How far the head at a (the line being `path`, ending at a) can go towards b: 1 all the way,
 *  less where it's stopped partway, 0 not at all. Backing up along the line is always 1. */
export function reach(track: Track, rules: Rules, path: number[], a: number, b: number): number {
  if (b === path[path.length - 2]) return 1;
  if (closed({ path, toward: -1, t: 0 })) return 0;
  if (!track.next(a).includes(b)) return 0;
  const m = rules.mirror;
  if (track.gap(a, b) || (m && track.gap(m(a), m(b)))) return GAP_REACH;
  if (path.includes(b)) return rules.revisit === "close" && b === path[0] && path.length > 3 ? 1 : BUMP_REACH;
  if (m) {
    if (m(a) === b) return MEET_REACH;                         // the two heads meet on this segment
    if (m(b) === b || path.includes(m(b))) return BUMP_REACH;  // the mirror head would touch a line
  }
  return 1;
}

/** Where the head is drawn. */
export function headXY(track: Track, c: Cursor): XY {
  const h = track.xy(last(c.path));
  return c.toward < 0 ? h : lerp(h, track.xy(c.toward), c.t);
}

/** The point of segment a→b, cut to `limit` of its length, nearest p: [fraction, distance]. */
function nearest(track: Track, a: number, b: number, limit: number, p: XY): [number, number] {
  const [ax, ay] = track.xy(a), [bx, by] = track.xy(b), dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  const s = Math.max(0, Math.min(limit, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
  return [s, Math.hypot(ax + dx * s - p[0], ay + dy * s - p[1])];
}

/** Move the head as near the pointer as the tracks let it. Each round looks at the segment the
 *  head is on, the other segments at the node behind it (turning, or backing up) and those past
 *  the node ahead (going through it), and takes the nearest point; it repeats until the head
 *  stays put, so a fast move crosses many junctions at once. Ties keep the head where it is. */
export function moveTo(track: Track, rules: Rules, cursor: Cursor, p: XY): Cursor {
  const c: Cursor = { path: [...cursor.path], toward: cursor.toward, t: cursor.t };
  for (let round = 0; round < 4 * track.size + 8; round++) {
    const head = last(c.path), prev = c.path[c.path.length - 2] ?? -1;
    let best: { kind: "on" | "turn" | "back" | "through"; to: number; s: number; d: number } | null = null;
    const consider = (kind: "on" | "turn" | "back" | "through", a: number, to: number, limit: number) => {
      if (limit <= 0) return;
      const [s, dist] = nearest(track, a, to, limit, p);
      const d = kind === "back" && s > EPS ? dist - BACK_BIAS * Math.hypot(...sub(track.xy(to), track.xy(a))) : dist;
      if (!best || d < best.d - EPS) best = { kind, to, s, d };
    };
    const ahead = c.toward >= 0 ? reach(track, rules, c.path, head, c.toward) : 0;
    if (c.toward >= 0) consider("on", head, c.toward, ahead);
    for (const n of track.next(head)) if (n !== c.toward) consider(n === prev ? "back" : "turn", head, n, reach(track, rules, c.path, head, n));
    if (c.toward >= 0 && ahead >= 1) {
      const through = [...c.path, c.toward];
      for (const n of track.next(c.toward)) if (n !== head) consider("through", c.toward, n, reach(track, rules, through, c.toward, n));
    }
    if (!best) break;
    const { kind, to, s } = best as { kind: string; to: number; s: number };
    if (kind === "back") {
      if (s <= EPS) { c.toward = -1; c.t = 0; break; }
      c.path.pop(); c.toward = head; c.t = 1 - s;
      if (c.t <= EPS) { c.toward = -1; c.t = 0; }
      continue;
    }
    if (kind === "through") { c.path.push(c.toward); c.toward = to; c.t = s; }
    else if (kind === "turn") { if (s <= EPS) { c.toward = -1; c.t = 0; break; } c.toward = to; c.t = s; }
    else c.t = s;
    if (c.t >= 1 - EPS) { c.path.push(c.toward); c.toward = -1; c.t = 0; continue; }
    if (c.t <= EPS) { c.toward = -1; c.t = 0; }
    if (kind === "on") break;
  }
  return c;
}

/** Move by a relative push (pointer lock, arrow keys): the head plus the push. */
export const moveBy = (track: Track, rules: Rules, c: Cursor, [dx, dy]: XY): Cursor => {
  const [x, y] = headXY(track, c);
  return moveTo(track, rules, c, [x + dx, y + dy]);
};

/** On release: a head past half a segment it can finish goes on to the node, otherwise back. */
export function settle(track: Track, rules: Rules, c: Cursor): Cursor {
  if (c.toward >= 0 && c.t >= 0.5 && reach(track, rules, c.path, last(c.path), c.toward) >= 1) return { path: [...c.path, c.toward], toward: -1, t: 0 };
  return { path: [...c.path], toward: -1, t: 0 };
}

/** The board ids of a path's segments (an end's stub has none). */
export const edgesOf = (track: Track, path: number[]) =>
  path.slice(1).map((n, k) => track.edge(path[k], n)).filter((e) => e >= 0);

/** What a stroke changed since the last move: segments it took back, and new ones, in order. */
export function diffPaths(track: Track, before: number[], after: number[]) {
  let k = 0;
  while (k < before.length && k < after.length && before[k] === after[k]) k++;
  return { removed: edgesOf(track, before.slice(Math.max(0, k - 1))).reverse(), added: edgesOf(track, after.slice(Math.max(0, k - 1))) };
}

/** The node nearest a point, and how far it is. */
export function nearestNode(track: Track, p: XY, among?: Iterable<number>) {
  let best = { n: -1, d: Infinity };
  for (const n of among ?? Array.from({ length: track.size }, (_, k) => k)) {
    const [x, y] = track.xy(n), d = Math.hypot(x - p[0], y - p[1]);
    if (d < best.d) best = { n, d };
  }
  return best;
}

// ---- the tracks of a grid ----

/** The grid lines as tracks, corner to corner. `open` says which borders are tracks at all;
 *  `gaps` can be entered a little but not crossed. Each of `ends` (corners on the edge) gets a
 *  stub out of the grid, `stub` long, as an extra node (cornerCount + k), so the head pushes out
 *  into it as in The Witness. */
export function cornerTrack(g: Grid, at: (v: number) => XY, opts: { open?: (e: number) => boolean; gaps?: Set<number>; ends?: number[]; stub?: number } = {}): Track & { endAt(n: number): number } {
  const ends = opts.ends ?? [], base = g.cornerCount, stub = opts.stub ?? 0;
  const open = opts.open ?? (() => true);
  const next: number[][] = Array.from({ length: base + ends.length }, () => []);
  for (const e of g.borders) if (open(e.id)) { const [a, b] = e.corners; next[a].push(b); next[b].push(a); }
  const outward = (v: number): XY => {
    const [r, c] = g.cornerRC(v);
    return r === 0 ? [0, -1] : r === g.rows ? [0, 1] : c === 0 ? [-1, 0] : [1, 0];
  };
  ends.forEach((v, k) => { next[v].push(base + k); next[base + k].push(v); });
  const between = (a: number, b: number) => (a < base && b < base ? g.cornerBorders[a].find((e) => g.borders[e].corners.includes(b)) ?? -1 : -1);
  return {
    size: next.length,
    xy(n) {
      if (n < base) return at(n);
      const v = ends[n - base], [x, y] = at(v), [dx, dy] = outward(v);
      return [x + dx * stub, y + dy * stub];
    },
    next: (n) => next[n],
    edge: between,
    gap: (a, b) => { const e = between(a, b); return e >= 0 && !!opts.gaps?.has(e); },
    endAt: (n) => (n >= base ? ends[n - base] : -1),
  };
}

/** The cell centres as tracks, joined across the links that are `open`. */
export function cellTrack(g: Grid, at: (i: number) => XY, open: (link: number) => boolean = () => true): Track {
  const next: number[][] = Array.from({ length: g.cellCount }, () => []);
  for (const l of g.links) if (open(l.id)) { const [a, b] = l.cells; next[a].push(b); next[b].push(a); }
  return {
    size: g.cellCount,
    xy: at,
    next: (n) => next[n],
    edge: (a, b) => { const e = g.borderBetween(a, b); return e >= 0 ? g.borders[e].link : -1; },
    gap: () => false,
  };
}

/** A corner track's mirror (a two-line panel), given the corners' mirror: an end's stub mirrors
 *  to the stub at the mirrored corner. */
export function trackMirror(track: Track & { endAt(n: number): number }, cornerCount: number, corner: (v: number) => number) {
  const stubOf = new Map<number, number>();
  for (let n = cornerCount; n < track.size; n++) stubOf.set(track.endAt(n), n);
  return (n: number) => (n < cornerCount ? corner(n) : stubOf.get(corner(track.endAt(n))) ?? n);
}
