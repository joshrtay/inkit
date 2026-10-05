// Nonogram logic for Mosaic: clues from a picture, and a solver used by the build to
// prove each picture has exactly one solution. Line solving by placement enumeration,
// then branching on a cell when lines stop giving anything away.
export type Cell = 0 | 1 | -1;   // 0 empty, 1 filled, -1 unknown

/** Run lengths of filled cells; an empty line is [0]. */
export function runs(line: boolean[]): number[] {
  const out: number[] = [];
  let n = 0;
  for (const v of line) { if (v) n++; else if (n) { out.push(n); n = 0; } }
  if (n) out.push(n);
  return out.length ? out : [0];
}

/** Every way to place `clue` in a line of `len` that agrees with `known`. */
function placements(clue: number[], len: number, known: Cell[]): Cell[][] {
  const blocks = clue[0] === 0 ? [] : clue;
  const out: Cell[][] = [];
  const line: Cell[] = Array(len).fill(0);
  (function place(b: number, start: number) {
    if (b === blocks.length) {
      for (let i = start; i < len; i++) if (known[i] === 1) return;
      out.push(line.slice());
      return;
    }
    const size = blocks[b];
    const rest = blocks.slice(b + 1).reduce((s, x) => s + x + 1, 0);
    for (let s = start; s + size + rest <= len; s++) {
      if (s > start && known[s - 1] === 1) break;          // can't leave a known filled cell behind
      let ok = true;
      for (let i = s; i < s + size; i++) if (known[i] === 0) { ok = false; break; }
      if (!ok || known[s + size] === 1) continue;
      for (let i = s; i < s + size; i++) line[i] = 1;
      place(b + 1, s + size + 1);
      for (let i = s; i < s + size; i++) line[i] = 0;
    }
  })(0, 0);
  return out;
}

/** Cells forced in one line by its clue and what's known; null if no placement fits. */
export function solveLine(clue: number[], known: Cell[]): Cell[] | null {
  const opts = placements(clue, known.length, known);
  if (!opts.length) return null;
  return known.map((_, i) => (opts.every((o) => o[i] === 1) ? 1 : opts.every((o) => o[i] === 0) ? 0 : -1));
}

/** Up to `limit` solutions of the clues. */
export function solve(rows: number[][], cols: number[][], limit = 2): Cell[][][] {
  const H = rows.length, W = cols.length, sols: Cell[][][] = [];
  function propagate(g: Cell[][]): boolean {
    for (let changed = true; changed;) {
      changed = false;
      for (let r = 0; r < H; r++) {
        const res = solveLine(rows[r], g[r]);
        if (!res) return false;
        res.forEach((v, c) => { if (v !== -1 && g[r][c] === -1) { g[r][c] = v; changed = true; } });
      }
      for (let c = 0; c < W; c++) {
        const res = solveLine(cols[c], g.map((row) => row[c]));
        if (!res) return false;
        res.forEach((v, r) => { if (v !== -1 && g[r][c] === -1) { g[r][c] = v; changed = true; } });
      }
    }
    return true;
  }
  (function search(g: Cell[][]) {
    if (sols.length >= limit || !propagate(g)) return;
    const at = g.flatMap((row, r) => row.flatMap((v, c) => (v === -1 ? [[r, c]] : [])))[0];
    if (!at) { sols.push(g); return; }
    for (const v of [1, 0] as Cell[]) {
      const ng = g.map((row) => row.slice()); ng[at[0]][at[1]] = v; search(ng);
    }
  })(Array.from({ length: H }, () => Array<Cell>(W).fill(-1)));
  return sols;
}
