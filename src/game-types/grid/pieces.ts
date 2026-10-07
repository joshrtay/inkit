// The geometry of a figure's pieces (Three Coats), shared by the player (figure.ts) and still
// pictures (picture.ts).
import type { Puzzle } from "../../engine/types.ts";

const inside = (pts: number[][], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const edgeDistance = (pts: number[][], x: number, y: number) => {
  let best = Infinity;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
  });
  return best;
};
/** The roomiest point inside a piece (farthest from its edges), for its dots. */
export function roomiest(pts: number[][]): { x: number; y: number; room: number } {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = { x: xs.reduce((a, b) => a + b) / xs.length, y: ys.reduce((a, b) => a + b) / ys.length, room: 0 };
  const N = 28;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const x = x0 + ((x1 - x0) * i) / N, y = y0 + ((y1 - y0) * j) / N;
    if (!inside(pts, x, y)) continue;
    const d = edgeDistance(pts, x, y);
    if (d > best.room) best = { x, y, room: d };
  }
  return best;
}

/** A puzzle's pieces: its figure, or its square cells. */
export const piecesOf = (p: Puzzle): number[][][] => p.figure ?? Array.from({ length: p.grid.cellCount }, (_, i) => {
  const [r, c] = p.grid.rc(i);
  return [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
});
