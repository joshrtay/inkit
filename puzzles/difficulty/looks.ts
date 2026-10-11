// How a puzzle looks before it's solved, the hand-made qualities the solver's path can't see: how
// sparse its clues are and how symmetric their layout (or, for region puzzles like Star Battle,
// the layout of the region walls). Nikoli-style setters value both.
//
//   cells      the grid's size
//   density    clue cells per cell (region puzzles: regions per cell)
//   rot        share of clues (or walls) whose half-turn twin is one too: 1 = half-turn symmetric
//   sym        the same, best over half turn, quarter turn and the mirrors: 1 = some exact symmetry
//   exact      1 when sym is 1
interface Grid { size: [number, number]; givens?: { at: string; cell?: [number, number] }[]; areas?: string[] }

export interface Looks { cells: number; density: number; rot: number; sym: number; exact: number }

type Pair = [number, number, number, number];
const key = (p: Pair) => { const a = `${p[0]},${p[1]}`, b = `${p[2]},${p[3]}`; return a < b ? `${a}|${b}` : `${b}|${a}`; };

export function looksOf(g: Grid): Looks {
  const [R, C] = g.size;
  // the features: a clue is a cell paired with itself, a wall the two cells it parts
  const feats: Pair[] = [];
  let count = 0;
  if (g.areas) {
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (c + 1 < C && g.areas[r][c] !== g.areas[r][c + 1]) feats.push([r, c, r, c + 1]);
      if (r + 1 < R && g.areas[r][c] !== g.areas[r + 1][c]) feats.push([r, c, r + 1, c]);
    }
    count = new Set(g.areas.join("")).size;
  } else {
    const seen = new Set<string>();
    for (const x of g.givens ?? []) if (x.at === "cell" && x.cell) { const k = `${x.cell[0]},${x.cell[1]}`; if (!seen.has(k)) { seen.add(k); feats.push([x.cell[0], x.cell[1], x.cell[0], x.cell[1]]); } }
    count = seen.size;
  }
  const have = new Set(feats.map(key));
  const share = (t: (r: number, c: number) => [number, number]) => {
    if (!feats.length) return 0;
    let n = 0;
    for (const [a, b, c, d] of feats) if (have.has(key([...t(a, b), ...t(c, d)] as Pair))) n++;
    return n / feats.length;
  };
  const rot = share((r, c) => [R - 1 - r, C - 1 - c]);
  const others = [share((r, c) => [r, C - 1 - c]), share((r, c) => [R - 1 - r, c])];
  if (R === C) others.push(share((r, c) => [c, R - 1 - r]), share((r, c) => [c, r]), share((r, c) => [C - 1 - c, R - 1 - r]));
  const sym = Math.max(rot, ...others);
  return { cells: R * C, density: +(count / (R * C)).toFixed(3), rot: +rot.toFixed(3), sym: +sym.toFixed(3), exact: sym === 1 ? 1 : 0 };
}
