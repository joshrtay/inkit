// A plain search solver: counts solutions (up to a limit) and returns the first. Used to know
// whether a puzzle is unique (unique rectangles need it) and, in tests, to check that no
// technique removes a true candidate. Propagates singles and thermometer bounds, then branches
// on the cell with the fewest candidates.
import { bit, copyBoard, count, highest, lowest, place, type Board } from "./grid.ts";

/** Narrow each thermometer's cells to digits above the cell before and below the cell after.
 *  Returns false on an empty cell. */
export function thermoBounds(b: Board, t: number[]): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 1; k < t.length; k++) {
      const lo = lowest(b.cand[t[k - 1]]) + 1;   // t[k] > the smallest digit t[k-1] can be
      const keep = b.cand[t[k]] & ~((1 << (lo - 1)) - 1);
      if (keep !== b.cand[t[k]]) { if (b.value[t[k]]) return false; b.cand[t[k]] = keep; changed = true; }
      if (!keep) return false;
    }
    for (let k = t.length - 2; k >= 0; k--) {
      const hi = highest(b.cand[t[k + 1]]) - 1;  // t[k] < the largest digit t[k+1] can be
      const keep = b.cand[t[k]] & ((1 << Math.max(0, hi)) - 1);
      if (keep !== b.cand[t[k]]) { if (b.value[t[k]]) return false; b.cand[t[k]] = keep; changed = true; }
      if (!keep) return false;
    }
  }
  return true;
}

/** Fill every single (and thermometer bound) there is; false on a contradiction. */
function propagate(b: Board): boolean {
  const s = b.shape;
  for (let again = true; again;) {
    again = false;
    for (const t of s.thermos) if (!thermoBounds(b, t)) return false;
    for (let c = 0; c < s.size; c++) {
      if (b.value[c]) continue;
      const m = b.cand[c];
      if (!m) return false;
      if ((m & (m - 1)) === 0) { place(b, c, lowest(m)); again = true; }
    }
    for (const u of s.units) {
      let seen = 0, once = 0, twice = 0;
      for (const c of u.cells) { const m = b.value[c] ? bit(b.value[c]) : b.cand[c]; twice |= once & m; once |= m; seen |= m; }
      if (seen !== (1 << s.n) - 1) return false;
      let single = once & ~twice;
      for (const c of u.cells) {
        if (b.value[c]) { single &= ~bit(b.value[c]); continue; }
        const m = b.cand[c] & single;
        if (m) {
          if (m & (m - 1)) return false;   // two digits that only fit here
          place(b, c, lowest(m)); single &= ~m; again = true;
        }
      }
    }
    // two equal digits in a unit
    for (const u of s.units) { let m = 0; for (const c of u.cells) if (b.value[c]) { if (m & bit(b.value[c])) return false; m |= bit(b.value[c]); } }
  }
  return true;
}

/** Up to `limit` solutions, as digit lists. `stats.nodes` counts the search's nodes; it gives up
 *  (returning what it has) after `maxNodes`. */
export function solutions(start: Board, limit = 2, stats = { nodes: 0 }, maxNodes = Infinity): number[][] {
  const out: number[][] = [];
  const go = (b: Board) => {
    if (out.length >= limit || stats.nodes++ > maxNodes || !propagate(b)) return;
    let best = -1, bestCount = 99;
    for (let c = 0; c < b.shape.size; c++) if (!b.value[c]) { const k = count(b.cand[c]); if (k < bestCount) { best = c; bestCount = k; } }
    if (best < 0) { out.push(b.value.slice()); return; }
    for (let m = b.cand[best]; m && out.length < limit; m &= m - 1) {
      const nb = copyBoard(b);
      place(nb, best, lowest(m));
      go(nb);
    }
  };
  go(copyBoard(start));
  return out;
}
