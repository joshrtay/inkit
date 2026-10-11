// Sudoku techniques, easiest first. Each finder looks for one application on a candidate grid and
// returns it as a Step (what it places or removes, the cells, digits and units it uses, a short
// description), or null. They don't change the board; the solve loop applies the step.
//
// Ratings follow Sudoku Explainer's scale (SE 1.2.1) where SE has the technique. SE has no
// Skyscraper, 2-String Kite, W-Wing or simple coloring by name: it finds them as chains, so they
// take its chain ratings (turbot fish and X-chains 6.6, forcing chains 7.0, plus a little for
// length, as SE does). Thermometer bounds aren't in SE at all; 2.0 puts them just under a naked
// single. The trial fallbacks: assume a candidate and propagate until something breaks; with
// singles only it rates as SE's Nishio level (7.5), with intersections and pairs too as its
// dynamic forcing chains (+) (9.0), each plus the length bonus; when neither finds anything, a
// search refutes it (10.0 and up, by the search's size).
import { solutions, thermoBounds } from "./brute.ts";
import { bit, boxOf, cellName, colOf, copyBoard, count, digitsOf, lowest, place, rowOf, type Board, type Shape, type Unit } from "./grid.ts";

export interface Step {
  technique: string;
  /** SE-style rating of this step */
  se: number;
  text: string;
  /** [cell, digit] */
  place: [number, number][];
  remove: [number, number][];
  /** the pattern's cells */
  cells: number[];
  digits: number[];
  units: string[];
  /** a chain's links, a coloring's cells, a trial's refutation length (the assumption and the singles after it) */
  length?: number;
}

export interface Context {
  /** the puzzle has exactly one solution (uniqueness techniques may be used) */
  unique: boolean;
}

export interface Technique {
  name: string;
  /** the rating its easiest application gets (chains add for length) */
  se: number;
  find: (b: Board, ctx: Context) => Step | null;
}

// ---------- helpers ----------

const nm = (s: Shape, c: number) => cellName(s, c);
const names = (s: Shape, cs: number[]) => cs.map((c) => nm(s, c)).join(", ");
const list = (ds: number[]) => ds.length < 2 ? `${ds[0]}` : `${ds.slice(0, -1).join(", ")} and ${ds[ds.length - 1]}`;
const removed = (s: Shape, rs: [number, number][]) => {
  const byDigit = new Map<number, number[]>();
  for (const [c, d] of rs) byDigit.set(d, [...(byDigit.get(d) ?? []), c]);
  return [...byDigit].map(([d, cs]) => `${d} from ${names(s, cs)}`).join("; ");
};
const empty = (b: Board, u: Unit) => u.cells.filter((c) => !b.value[c]);
const placedIn = (b: Board, u: Unit) => u.cells.reduce((m, c) => (b.value[c] ? m | bit(b.value[c]) : m), 0);
/** the empty cells of a unit that can hold d */
export const positions = (b: Board, u: Unit, d: number) => u.cells.filter((c) => !b.value[c] && b.cand[c] & bit(d));
const sees = (s: Shape, a: number, c: number) => s.sees[a * s.size + c] === 1;

function* combos<T>(items: T[], k: number, from = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = from; i <= items.length - (k - acc.length); i++) { acc.push(items[i]); yield* combos(items, k, i + 1, acc); acc.pop(); }
}

/** SE's chain length bonus: 0.1 for each step of the ceiling 4, 6, 8, 12, 16, 24, 32, ... the
 *  length passes. */
export function lengthBonus(length: number): number {
  let added = 0, ceil = 4, odd = false;
  const len = length - 2;
  while (len > ceil) { added += 0.1; ceil = odd ? Math.floor((ceil * 4) / 3) : Math.floor((ceil * 3) / 2); odd = !odd; }
  return +added.toFixed(1);
}

const step = (technique: string, se: number, text: string, parts: Partial<Step>): Step =>
  ({ technique, se: +se.toFixed(1), text, place: [], remove: [], cells: [], digits: [], units: [], ...parts });

// ---------- singles ----------

export function fullHouse(b: Board): Step | null {
  const s = b.shape, all = (1 << s.n) - 1;
  for (const u of s.units) {
    const e = empty(b, u);
    if (e.length !== 1) continue;
    const m = all & ~placedIn(b, u);
    if (count(m) !== 1 || !(b.cand[e[0]] & m)) continue;
    const d = lowest(m);
    return step("Full house", 1.0, `${nm(s, e[0])} is the last cell in ${u.name}: ${d}`, { place: [[e[0], d]], cells: [e[0]], digits: [d], units: [u.name] });
  }
  return null;
}

function hiddenSingle(b: Board, kinds: Unit["kind"][], se: number): Step | null {
  const s = b.shape;
  for (const u of s.units) {
    if (!kinds.includes(u.kind)) continue;
    const done = placedIn(b, u);
    for (let d = 1; d <= s.n; d++) {
      if (done & bit(d)) continue;
      const ps = positions(b, u, d);
      if (ps.length === 1) return step("Hidden single", se, `in ${u.name}, ${d} only fits ${nm(s, ps[0])}`, { place: [[ps[0], d]], cells: ps, digits: [d], units: [u.name] });
    }
  }
  return null;
}
export const hiddenSingleBox = (b: Board) => hiddenSingle(b, ["box"], 1.2);
export const hiddenSingleLine = (b: Board) => hiddenSingle(b, ["row", "col"], 1.5);

export function nakedSingle(b: Board): Step | null {
  const s = b.shape;
  for (let c = 0; c < s.size; c++) {
    if (b.value[c] || count(b.cand[c]) !== 1) continue;
    const d = lowest(b.cand[c]);
    return step("Naked single", 2.3, `${nm(s, c)} can only be ${d}`, { place: [[c, d]], cells: [c], digits: [d] });
  }
  return null;
}

/** Every single there is now: cell -> digit (Pelánek's simple moves). */
export function singleMoves(b: Board): Map<number, number> {
  const s = b.shape, out = new Map<number, number>();
  for (let c = 0; c < s.size; c++) if (!b.value[c] && count(b.cand[c]) === 1) out.set(c, lowest(b.cand[c]));
  for (const u of s.units) {
    const done = placedIn(b, u);
    for (let d = 1; d <= s.n; d++) {
      if (done & bit(d)) continue;
      const ps = positions(b, u, d);
      if (ps.length === 1 && !out.has(ps[0])) out.set(ps[0], d);
    }
  }
  return out;
}

// ---------- thermometers ----------

export function thermoStep(b: Board): Step | null {
  const s = b.shape;
  for (const t of s.thermos) {
    const nb = copyBoard(b);
    if (!thermoBounds(nb, t)) continue;   // a contradiction: left for the checks
    const rs: [number, number][] = [];
    for (const c of t) for (const d of digitsOf(b.cand[c] & ~nb.cand[c])) rs.push([c, d]);
    if (rs.length) return step("Thermo bounds", 2.0, `digits rise along the thermometer from ${nm(s, t[0])}: remove ${removed(s, rs)}`, { remove: rs, cells: t, digits: [...new Set(rs.map(([, d]) => d))] });
  }
  return null;
}

// ---------- intersections ----------

function lockedCandidates(b: Board, from: Unit["kind"][], to: Unit["kind"][], name: string, se: number): Step | null {
  const s = b.shape;
  for (const u of s.units) {
    if (!from.includes(u.kind)) continue;
    for (let d = 1; d <= s.n; d++) {
      const ps = positions(b, u, d);
      if (ps.length < 2) continue;
      for (const k of s.unitsOf[ps[0]]) {
        const v = s.units[k];
        if (v === u || !to.includes(v.kind) || !ps.every((c) => s.unitsOf[c].includes(k))) continue;
        const rs = positions(b, v, d).filter((c) => !u.cells.includes(c)).map((c): [number, number] => [c, d]);
        if (rs.length) return step(name, se, `in ${u.name}, ${d} is only in ${v.name}, so not elsewhere in ${v.name}: remove ${removed(s, rs)}`, { remove: rs, cells: ps, digits: [d], units: [u.name, v.name] });
      }
    }
  }
  return null;
}
export const pointing = (b: Board) => lockedCandidates(b, ["box"], ["row", "col"], "Pointing", 2.6);
export const claiming = (b: Board) => lockedCandidates(b, ["row", "col"], ["box"], "Claiming", 2.8);

/** Every place for d in a unit sees one cell, so that cell isn't d. With standard boxes this is
 *  only ever pointing or claiming; with irregular areas a cell can see an area's places through
 *  its row and its column together. */
export function seenByAllPlaces(b: Board): Step | null {
  const s = b.shape;
  for (const u of s.units) {
    for (let d = 1; d <= s.n; d++) {
      const ps = positions(b, u, d);
      if (ps.length < 2) continue;
      const rs = seenByAll(b, d, ps).filter(([c]) => !u.cells.includes(c));
      if (rs.length) return step("Pointing at a cell", 2.9, `every place for ${d} in ${u.name} sees ${names(s, rs.map(([c]) => c))}: remove ${removed(s, rs)}`, { remove: rs, cells: ps, digits: [d], units: [u.name] });
    }
  }
  return null;
}

// ---------- subsets ----------

const SUBSET = ["", "", "pair", "triple", "quad"];

export function nakedSubset(b: Board, k: number, se: number): Step | null {
  const s = b.shape;
  for (const u of s.units) {
    const e = empty(b, u);
    const small = e.filter((c) => count(b.cand[c]) <= k);
    if (e.length <= k) continue;
    for (const cs of combos(small, k)) {
      const m = cs.reduce((a, c) => a | b.cand[c], 0);
      if (count(m) !== k) continue;
      const rs: [number, number][] = [];
      for (const c of e) if (!cs.includes(c)) for (const d of digitsOf(b.cand[c] & m)) rs.push([c, d]);
      if (rs.length) return step(`Naked ${SUBSET[k]}`, se, `in ${u.name}, ${names(s, cs)} hold only ${list(digitsOf(m))}: remove ${removed(s, rs)}`, { remove: rs, cells: cs, digits: digitsOf(m), units: [u.name] });
    }
  }
  return null;
}

export function hiddenSubset(b: Board, k: number, se: number): Step | null {
  const s = b.shape;
  for (const u of s.units) {
    const done = placedIn(b, u);
    const ds: number[] = [];
    for (let d = 1; d <= s.n; d++) if (!(done & bit(d))) { const n = positions(b, u, d).length; if (n >= 1 && n <= k) ds.push(d); }
    if (empty(b, u).length <= k) continue;
    for (const set of combos(ds, k)) {
      const cs = [...new Set(set.flatMap((d) => positions(b, u, d)))].sort((x, y) => x - y);
      if (cs.length !== k) continue;
      const m = set.reduce((a, d) => a | bit(d), 0);
      const rs: [number, number][] = [];
      for (const c of cs) for (const d of digitsOf(b.cand[c] & ~m)) rs.push([c, d]);
      if (rs.length) return step(`Hidden ${SUBSET[k]}`, se, `in ${u.name}, ${list(set)} only fit ${names(s, cs)}: remove ${removed(s, rs)}`, { remove: rs, cells: cs, digits: set, units: [u.name] });
    }
  }
  return null;
}

// ---------- fish ----------

const FISH = ["", "", "X-Wing", "Swordfish", "Jellyfish"];

export function fish(b: Board, k: number, se: number): Step | null {
  const s = b.shape;
  for (let d = 1; d <= s.n; d++) {
    for (const [base, cover] of [["row", "col"], ["col", "row"]] as const) {
      const at = (c: number) => (cover === "col" ? colOf(s, c) : rowOf(s, c));
      const lines = s.units.filter((u) => u.kind === base).map((u) => ({ u, ps: positions(b, u, d) })).filter((l) => l.ps.length >= 2 && l.ps.length <= k);
      for (const set of combos(lines, k)) {
        const covers = [...new Set(set.flatMap((l) => l.ps.map(at)))].sort((x, y) => x - y);
        if (covers.length !== k) continue;
        const inBase = new Set(set.flatMap((l) => l.u.cells));
        const coverUnits = covers.map((i) => s.units.find((u) => u.kind === cover && at(u.cells[0]) === i)!);
        const rs = coverUnits.flatMap((u) => positions(b, u, d).filter((c) => !inBase.has(c)).map((c): [number, number] => [c, d]));
        if (rs.length) return step(FISH[k], se, `${d} in ${set.map((l) => l.u.name).join(", ")} is only in ${coverUnits.map((u) => u.name).join(", ")}: remove ${removed(s, rs)}`, { remove: rs, cells: set.flatMap((l) => l.ps), digits: [d], units: [...set.map((l) => l.u.name), ...coverUnits.map((u) => u.name)] });
      }
    }
  }
  return null;
}

// ---------- wings ----------

const seenByAll = (b: Board, d: number, from: number[]) => {
  const s = b.shape, out: [number, number][] = [];
  for (const c of s.peers[from[0]]) if (!b.value[c] && b.cand[c] & bit(d) && !from.includes(c) && from.every((f) => sees(s, c, f))) out.push([c, d]);
  out.sort((x, y) => x[0] - y[0]);
  return out;
};

export function xyWing(b: Board): Step | null {
  const s = b.shape;
  const bi = Array.from({ length: s.size }, (_, c) => c).filter((c) => !b.value[c] && count(b.cand[c]) === 2);
  for (const p of bi) {
    const wings = bi.filter((c) => c !== p && sees(s, c, p) && count(b.cand[c] & b.cand[p]) === 1);
    for (let i = 0; i < wings.length; i++) for (let j = i + 1; j < wings.length; j++) {
      const a = wings[i], c = wings[j];
      const x = b.cand[a] & b.cand[p], y = b.cand[c] & b.cand[p];
      const z = b.cand[a] & b.cand[c] & ~b.cand[p];
      if (x === y || count(z) !== 1) continue;
      const zd = lowest(z), rs = seenByAll(b, zd, [a, c]);
      if (rs.length) return step("XY-Wing", 4.2, `${nm(s, p)} (${list(digitsOf(b.cand[p]))}) with ${nm(s, a)} and ${nm(s, c)}: one of them is ${zd}, remove ${removed(s, rs)}`, { remove: rs, cells: [p, a, c], digits: digitsOf(b.cand[p] | z) });
    }
  }
  return null;
}

export function xyzWing(b: Board): Step | null {
  const s = b.shape;
  for (let p = 0; p < s.size; p++) {
    if (b.value[p] || count(b.cand[p]) !== 3) continue;
    const wings = b.shape.peers[p].filter((c) => !b.value[c] && count(b.cand[c]) === 2 && (b.cand[c] & ~b.cand[p]) === 0);
    for (let i = 0; i < wings.length; i++) for (let j = i + 1; j < wings.length; j++) {
      const a = wings[i], c = wings[j], z = b.cand[a] & b.cand[c];
      if (b.cand[a] === b.cand[c] || count(z) !== 1) continue;
      const zd = lowest(z), rs = seenByAll(b, zd, [p, a, c]);
      if (rs.length) return step("XYZ-Wing", 4.4, `${nm(s, p)} (${list(digitsOf(b.cand[p]))}) with ${nm(s, a)} and ${nm(s, c)}: one of the three is ${zd}, remove ${removed(s, rs)}`, { remove: rs, cells: [p, a, c], digits: digitsOf(b.cand[p]) });
    }
  }
  return null;
}

export function wWing(b: Board): Step | null {
  const s = b.shape;
  const bi = Array.from({ length: s.size }, (_, c) => c).filter((c) => !b.value[c] && count(b.cand[c]) === 2);
  for (let i = 0; i < bi.length; i++) for (let j = i + 1; j < bi.length; j++) {
    const w1 = bi[i], w2 = bi[j];
    if (b.cand[w1] !== b.cand[w2] || sees(s, w1, w2)) continue;
    for (const x of digitsOf(b.cand[w1])) {
      const y = lowest(b.cand[w1] & ~bit(x));
      const rs = seenByAll(b, y, [w1, w2]);
      if (!rs.length) continue;
      for (const u of s.units) {
        const ps = positions(b, u, x);
        if (ps.length !== 2 || ps.includes(w1) || ps.includes(w2)) continue;
        const [a, c] = ps;
        if ((sees(s, a, w1) && sees(s, c, w2)) || (sees(s, a, w2) && sees(s, c, w1)))
          return step("W-Wing", 7.0, `${nm(s, w1)} and ${nm(s, w2)} (${list(digitsOf(b.cand[w1]))}) joined by ${x} in ${u.name}: one of them is ${y}, remove ${removed(s, rs)}`, { remove: rs, cells: [w1, w2, a, c], digits: [x, y], units: [u.name], length: 5 });
      }
    }
  }
  return null;
}

// ---------- uniqueness ----------

const onThermo = (s: Shape, c: number) => s.thermos.some((t) => t.includes(c));

export function uniqueRectangle(b: Board, ctx: Context): Step | null {
  if (!ctx.unique) return null;
  const s = b.shape, n = s.n;
  for (let r1 = 0; r1 < n; r1++) for (let r2 = r1 + 1; r2 < n; r2++) for (let c1 = 0; c1 < n; c1++) for (let c2 = c1 + 1; c2 < n; c2++) {
    const cs = [r1 * n + c1, r1 * n + c2, r2 * n + c1, r2 * n + c2];
    // a thermometer could tell the two digits apart
    if (cs.some((c) => b.value[c] || onThermo(s, c))) continue;
    // swapping two digits around the rectangle keeps every box valid only when it touches two
    // boxes, each holding two of its corners in a row or a column (no boxes: always)
    const boxes = new Map<number, number[]>();
    for (const c of cs) { const k = boxOf(s, c); if (k >= 0) boxes.set(k, [...(boxes.get(k) ?? []), c]); }
    const swappable = boxes.size === 0 || (boxes.size === 2 && [...boxes.values()].every((g) => g.length === 2 && (rowOf(s, g[0]) === rowOf(s, g[1]) || colOf(s, g[0]) === colOf(s, g[1]))));
    if (!swappable) continue;
    const pairs = cs.filter((c) => count(b.cand[c]) === 2);
    if (pairs.length !== 3 || pairs.some((c) => b.cand[c] !== b.cand[pairs[0]])) continue;
    const m = b.cand[pairs[0]], other = cs.find((c) => !pairs.includes(c))!;
    if ((b.cand[other] & m) !== m) continue;
    const rs = digitsOf(m).map((d): [number, number] => [other, d]);
    return step("Unique rectangle", 4.5, `${names(s, pairs)} hold only ${list(digitsOf(m))}; ${nm(s, other)} can't too, or the puzzle would have two solutions: remove ${removed(s, rs)}`, { remove: rs, cells: cs, digits: digitsOf(m) });
  }
  return null;
}

// ---------- single-digit patterns ----------

/** the units where d has exactly two places: [unit, a, b] */
const strongLinks = (b: Board, d: number) => b.shape.units.flatMap((u) => { const ps = positions(b, u, d); return ps.length === 2 ? [[u, ps[0], ps[1]] as const] : []; });

export function skyscraper(b: Board): Step | null {
  const s = b.shape;
  for (let d = 1; d <= s.n; d++) {
    for (const [base, at] of [["row", (c: number) => colOf(s, c)], ["col", (c: number) => rowOf(s, c)]] as const) {
      const lines = strongLinks(b, d).filter(([u]) => u.kind === base);
      for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
        const [u1, a1, b1] = lines[i], [u2, a2, b2] = lines[j];
        for (const [base1, top1] of [[a1, b1], [b1, a1]]) for (const [base2, top2] of [[a2, b2], [b2, a2]]) {
          if (at(base1) !== at(base2) || at(top1) === at(top2)) continue;
          const rs = seenByAll(b, d, [top1, top2]).filter(([c]) => ![base1, base2].includes(c));
          if (rs.length) return step("Skyscraper", 6.6, `${d} in ${u1.name} and ${u2.name} has two places each, two of them in line: ${nm(s, top1)} or ${nm(s, top2)} is ${d}, remove ${removed(s, rs)}`, { remove: rs, cells: [base1, top1, base2, top2], digits: [d], units: [u1.name, u2.name], length: 3 });
        }
      }
    }
  }
  return null;
}

export function twoStringKite(b: Board): Step | null {
  const s = b.shape;
  for (let d = 1; d <= s.n; d++) {
    const links = strongLinks(b, d);
    const rows = links.filter(([u]) => u.kind === "row"), cols = links.filter(([u]) => u.kind === "col");
    for (const [ru, ra, rb] of rows) for (const [cu, ca, cb] of cols) {
      for (const [rIn, rEnd] of [[ra, rb], [rb, ra]]) for (const [cIn, cEnd] of [[ca, cb], [cb, ca]]) {
        if (new Set([rIn, rEnd, cIn, cEnd]).size !== 4) continue;
        const k = boxOf(s, rIn);
        if (k < 0 || boxOf(s, cIn) !== k) continue;
        const rs = seenByAll(b, d, [rEnd, cEnd]);
        if (rs.length) return step("2-String Kite", 6.6, `${d} in ${ru.name} and ${cu.name} has two places each, joined in ${s.units[k].name}: ${nm(s, rEnd)} or ${nm(s, cEnd)} is ${d}, remove ${removed(s, rs)}`, { remove: rs, cells: [rIn, rEnd, cIn, cEnd], digits: [d], units: [ru.name, cu.name, s.units[k].name], length: 3 });
      }
    }
  }
  return null;
}

export function simpleColoring(b: Board): Step | null {
  const s = b.shape;
  let best: Step | null = null;
  for (let d = 1; d <= s.n; d++) {
    const adj = new Map<number, Set<number>>();
    for (const [, a, c] of strongLinks(b, d)) {
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(c)) adj.set(c, new Set());
      adj.get(a)!.add(c); adj.get(c)!.add(a);
    }
    const color = new Map<number, number>();
    for (const start of adj.keys()) {
      if (color.has(start)) continue;
      const comp = [start];
      color.set(start, 0);
      let odd = false;
      for (let k = 0; k < comp.length; k++) for (const nb of adj.get(comp[k])!) {
        if (!color.has(nb)) { color.set(nb, 1 - color.get(comp[k])!); comp.push(nb); }
        else if (color.get(nb) === color.get(comp[k])) odd = true;
      }
      if (odd || comp.length < 3) continue;
      const se = 6.6 + lengthBonus(comp.length);
      if (best && best.se <= se) continue;
      const side = [comp.filter((c) => color.get(c) === 0), comp.filter((c) => color.get(c) === 1)];
      // wrap: two cells of one color see each other, so that color is false
      const bad = side.findIndex((g) => g.some((a) => g.some((c) => a !== c && sees(s, a, c))));
      if (bad >= 0) {
        const rs = side[bad].map((c): [number, number] => [c, d]);
        best = step("Simple coloring", se, `${d}'s chain of two-place links through ${names(s, comp)}: two cells of one color see each other, so that color is false: remove ${removed(s, rs)}`, { remove: rs, cells: comp, digits: [d], length: comp.length });
        continue;
      }
      // trap: a cell seeing both colors
      const rs: [number, number][] = [];
      for (let c = 0; c < s.size; c++) if (!b.value[c] && b.cand[c] & bit(d) && !color.has(c) && side[0].some((a) => sees(s, a, c)) && side[1].some((a) => sees(s, a, c))) rs.push([c, d]);
      if (rs.length) best = step("Simple coloring", se, `${d}'s chain of two-place links through ${names(s, comp)}: one color is true, and these cells see both: remove ${removed(s, rs)}`, { remove: rs, cells: comp, digits: [d], length: comp.length });
    }
  }
  return best;
}

// ---------- chains ----------

const MAX_X_LINKS = 13, MAX_XY_CELLS = 8;

/** The shortest X-chain for any digit: strong and weak links alternating, strong at both ends,
 *  so one end is d; d goes from cells seeing both ends. */
export function xChain(b: Board): Step | null {
  const s = b.shape;
  let best = null as { links: number; path: number[]; d: number; rs: [number, number][] } | null;
  for (let d = 1; d <= s.n; d++) {
    const nodes: number[] = [];
    for (let c = 0; c < s.size; c++) if (!b.value[c] && b.cand[c] & bit(d)) nodes.push(c);
    const strong = new Map<number, number[]>();
    for (const [, a, c] of strongLinks(b, d)) { strong.set(a, [...(strong.get(a) ?? []), c]); strong.set(c, [...(strong.get(c) ?? []), a]); }
    for (const a of nodes) {
      if (!strong.has(a)) continue;
      // state: cell, and whether it's "on" (reached by a strong link: true if a is false)
      const prev = new Map<string, string>(), key = (c: number, on: boolean) => `${c}${on ? "+" : "-"}`;
      let frontier: [number, boolean][] = [[a, false]];
      prev.set(key(a, false), "");
      for (let links = 1; links <= MAX_X_LINKS && frontier.length; links++) {
        const next: [number, boolean][] = [];
        for (const [c, on] of frontier) {
          const to = on ? s.peers[c].filter((p) => !b.value[p] && b.cand[p] & bit(d)) : (strong.get(c) ?? []);
          for (const t of to) {
            const k = key(t, !on);
            if (prev.has(k)) continue;
            prev.set(k, key(c, on));
            next.push([t, !on]);
            if (!on && t !== a && links >= 3 && (!best || links < best.links)) {
              const rs = seenByAll(b, d, [a, t]);
              if (rs.length) {
                const path: number[] = [];
                for (let k2: string = k; k2; k2 = prev.get(k2)!) path.unshift(parseInt(k2));
                best = { links, path, d, rs };
              }
            }
          }
        }
        frontier = next;
        if (best && links >= best.links) break;
      }
    }
  }
  if (!best) return null;
  const { links, path, d, rs } = best, a = path[0], z = path[path.length - 1];
  return step("X-Chain", 6.6 + lengthBonus(links), `${d} along ${names(s, path)} (${links} links): ${nm(s, a)} or ${nm(s, z)} is ${d}, remove ${removed(s, rs)}`, { remove: rs, cells: path, digits: [d], length: links });
}

/** The shortest XY-chain: bivalue cells, each joined to the next by a shared digit; if the first
 *  cell isn't x, the last one is. */
export function xyChain(b: Board): Step | null {
  const s = b.shape;
  const bi = Array.from({ length: s.size }, (_, c) => c).filter((c) => !b.value[c] && count(b.cand[c]) === 2);
  let best = null as { cells: number; path: number[]; x: number; rs: [number, number][] } | null;
  for (const a of bi) for (const x of digitsOf(b.cand[a])) {
    const other = (c: number, v: number) => lowest(b.cand[c] & ~bit(v));
    const prev = new Map<string, string>(), key = (c: number, v: number) => `${c}:${v}`;
    let frontier: [number, number][] = [[a, other(a, x)]];   // [cell, its digit if a isn't x]
    prev.set(key(a, other(a, x)), "");
    for (let cells = 2; cells <= MAX_XY_CELLS && frontier.length; cells++) {
      const next: [number, number][] = [];
      for (const [c, v] of frontier) for (const t of s.peers[c]) {
        if (b.value[t] || count(b.cand[t]) !== 2 || !(b.cand[t] & bit(v))) continue;
        const w = other(t, v), k = key(t, w);
        if (prev.has(k)) continue;
        prev.set(k, key(c, v));
        next.push([t, w]);
        if (w === x && t !== a && cells >= 3 && (!best || cells < best.cells)) {
          const rs = seenByAll(b, x, [a, t]);
          if (rs.length) {
            const path: number[] = [];
            for (let k2: string = k; k2; k2 = prev.get(k2)!) path.unshift(parseInt(k2));
            best = { cells, path, x, rs };
          }
        }
      }
      frontier = next;
      if (best && cells >= best.cells) break;
    }
  }
  if (!best) return null;
  const { cells, path, x, rs } = best, links = 2 * cells - 1;
  return step("XY-Chain", 7.0 + lengthBonus(links), `${x} at either end of the two-digit cells ${names(s, path)}: ${nm(s, path[0])} or ${nm(s, path[path.length - 1])} is ${x}, remove ${removed(s, rs)}`, { remove: rs, cells: path, digits: [x], length: links });
}

// ---------- trial ----------

/** Some unit has lost a digit, or some cell every candidate. */
function broken(b: Board): boolean {
  const s = b.shape, all = (1 << s.n) - 1;
  for (let c = 0; c < s.size; c++) if (!b.cand[c]) return true;
  for (const u of s.units) {
    let m = 0, placed = 0;
    for (const c of u.cells) {
      m |= b.cand[c];
      if (b.value[c]) { if (placed & bit(b.value[c])) return true; placed |= bit(b.value[c]); }
    }
    if (m !== all) return true;
  }
  return false;
}

/** The steps a trial may take after its assumption: singles only (level 1), or singles and then
 *  intersections and pairs (level 2). */
const TRIAL_HELPERS: ((b: Board) => Step | null)[] = [pointing, claiming, seenByAllPlaces, (b) => nakedSubset(b, 2, 3.0), (b) => hiddenSubset(b, 2, 3.4)];

/** Assume c = d and fill singles (and thermometer bounds; at level 2 also intersections and
 *  pairs) until something breaks. Returns the refutation's length (the assumption plus the
 *  steps after it), or 0 if nothing broke within `cap`. Level 3 searches instead: the length is
 *  the search's nodes. */
export function refute(b0: Board, c: number, d: number, cap: number, level: 1 | 2 | 3 = 1): number {
  const b = copyBoard(b0);
  place(b, c, d);
  if (level === 3) {
    const stats = { nodes: 0 };
    return solutions(b, 1, stats, cap).length || stats.nodes > cap ? 0 : stats.nodes + 1;
  }
  let length = 1;
  for (;;) {
    for (const t of b.shape.thermos) if (!thermoBounds(b, t)) return length;
    if (broken(b)) return length;
    if (length >= cap) return 0;
    const moves = singleMoves(b);
    if (moves.size) {
      const [cell, digit] = moves.entries().next().value!;
      place(b, cell, digit);
    } else {
      if (level < 2) return 0;
      let st: Step | null = null;
      for (const f of TRIAL_HELPERS) if ((st = f(b))) break;
      if (!st) return 0;
      apply(b, st);
    }
    length++;
  }
}

const TRIAL = [
  { name: "Forcing chain", se: 7.5, what: "singles" },
  { name: "Dynamic forcing chain", se: 9.0, what: "singles, intersections and pairs" },
  { name: "Trial and error", se: 10.0, what: "search" },
] as const;

/** The candidate with the shortest refutation at this level: assume it, and the steps after it
 *  break something. */
export function trial(b: Board, level: 1 | 2 | 3 = 1): Step | null {
  const s = b.shape;
  let best: { c: number; d: number; length: number } | null = null;
  const cap0 = level === 3 ? 100000 : s.size * 2;
  for (let c = 0; c < s.size; c++) {
    if (b.value[c] || count(b.cand[c]) < 2) continue;
    for (const d of digitsOf(b.cand[c])) {
      const length = refute(b, c, d, best ? best.length - 1 : cap0, level);
      if (length && (!best || length < best.length)) best = { c, d, length };
      if (best?.length === 1) break;
    }
  }
  if (!best) return null;
  const { c, d, length } = best, t = TRIAL[level - 1];
  const bonus = level === 3 ? Math.min(1, +(Math.log10(length) / 4).toFixed(1)) : lengthBonus(length);
  const how = level === 3 ? `a search of ${length - 1} step${length === 2 ? "" : "s"} finds no solution` : `${length - 1} step${length === 2 ? "" : "s"} of ${t.what} later something breaks`;
  return step(t.name, t.se + bonus, `if ${nm(s, c)} were ${d}, ${how}: remove ${d} from ${nm(s, c)}`, { remove: [[c, d]], cells: [c], digits: [d], length });
}

// ---------- the list ----------

export const TECHNIQUES: Technique[] = [
  { name: "Full house", se: 1.0, find: fullHouse },
  { name: "Hidden single", se: 1.2, find: hiddenSingleBox },
  { name: "Hidden single", se: 1.5, find: hiddenSingleLine },
  { name: "Thermo bounds", se: 2.0, find: thermoStep },
  { name: "Naked single", se: 2.3, find: nakedSingle },
  { name: "Pointing", se: 2.6, find: pointing },
  { name: "Claiming", se: 2.8, find: claiming },
  { name: "Pointing at a cell", se: 2.9, find: seenByAllPlaces },
  { name: "Naked pair", se: 3.0, find: (b) => nakedSubset(b, 2, 3.0) },
  { name: "X-Wing", se: 3.2, find: (b) => fish(b, 2, 3.2) },
  { name: "Hidden pair", se: 3.4, find: (b) => hiddenSubset(b, 2, 3.4) },
  { name: "Naked triple", se: 3.6, find: (b) => nakedSubset(b, 3, 3.6) },
  { name: "Swordfish", se: 3.8, find: (b) => fish(b, 3, 3.8) },
  { name: "Hidden triple", se: 4.0, find: (b) => hiddenSubset(b, 3, 4.0) },
  { name: "XY-Wing", se: 4.2, find: xyWing },
  { name: "XYZ-Wing", se: 4.4, find: xyzWing },
  { name: "Unique rectangle", se: 4.5, find: uniqueRectangle },
  { name: "Naked quad", se: 5.0, find: (b) => nakedSubset(b, 4, 5.0) },
  { name: "Jellyfish", se: 5.2, find: (b) => fish(b, 4, 5.2) },
  { name: "Hidden quad", se: 5.4, find: (b) => hiddenSubset(b, 4, 5.4) },
  { name: "Skyscraper", se: 6.6, find: skyscraper },
  { name: "2-String Kite", se: 6.6, find: twoStringKite },
  { name: "Simple coloring", se: 6.6, find: simpleColoring },
  { name: "X-Chain", se: 6.6, find: xChain },
  { name: "W-Wing", se: 7.0, find: wWing },
  { name: "XY-Chain", se: 7.0, find: xyChain },
  { name: "Forcing chain", se: 7.5, find: (b) => trial(b, 1) },
  { name: "Dynamic forcing chain", se: 9.0, find: (b) => trial(b, 2) },
  { name: "Trial and error", se: 10.0, find: (b) => trial(b, 3) },
];

/** The easiest step there is: the first technique in order that applies; when its step rates
 *  above a later technique's base (a long chain), the later ones are tried too and the lowest
 *  rating wins. */
export function nextStep(b: Board, ctx: Context, techniques = TECHNIQUES): Step | null {
  let best: Step | null = null;
  for (const t of techniques) {
    if (best && t.se >= best.se) break;
    const st = t.find(b, ctx);
    if (st && (!best || st.se < best.se)) best = st;
  }
  return best;
}

/** Apply a step to the board. */
export function apply(b: Board, st: Step) {
  for (const [c, d] of st.remove) b.cand[c] &= ~bit(d);
  for (const [c, d] of st.place) place(b, c, d);
}
