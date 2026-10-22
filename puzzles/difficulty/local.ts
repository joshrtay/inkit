// Local encodings of the rectangle puzzles for the deduction solver (deduce.ts), the way people
// solve them: each region is one of a few shapes, listed up front. The engine encodes regions in
// general ("which cells reach which", src/engine/rules.ts), which grounds to every pair of cells
// and ties every step to the whole grid; here every rule touches only the cells near it, so the
// solver's small windows can see the steps, and the ground program is a few kB.
//
//   Shikaku     a number's region is a rectangle of that area holding it and no other number
//   Square Jam  every region is a square; a number gives its square's side; four regions never
//               meet at a point
//   Nurikabe    each unshaded cell belongs to one number within reach (nurikabeProgram): no
//               region pairs, so the whole grid grounds to some kB, where the engine's gives MBs
//   Fillomino   each cell has a size and belongs to its region's first cell within that size's
//               reach (fillominoProgram): the engine's counts every region at every size
//
// The marks are the engine's own (cut(L): a border drawn on link L), so the solver's facts are the
// same, and it checks each one against the engine's answer: an encoding that disagreed would stop
// it ("deduced a wrong fact"). Puzzles with anything else (holes, walls, other clues or rules) are
// left to the engine's encoding.
import type { Puzzle } from "../../src/engine/types.ts";

/** A local encoding: `text`, with every rule tagged rbk(k) by the engine rule block it stands for
 *  (the solver groups and costs steps by those, as it does the engine's, switching the tags on as
 *  externals); `plain`, the same with the tags simply true, to solve as it is. */
export interface Local {
  text: string; plain: string;
  /** with `picks`: the candidate shapes, each shown as pick(id): the number it's for (Square Jam:
   *  the number inside, or -1), its cells, the links inside it (uncut) and round it (cut) */
  shapes?: { clue: number; cells: number[]; inside: number[]; border: number[] }[];
  /** helper atoms named by their cell first (sz(I,V)): shown, to take cell I as their footprint */
  cellAtoms?: string[];
  /** the tag of rules that only say what the helper atoms mean (Fillomino's regions and sizes): no
   *  rule's, so they're in every explanation for free, as the engine's region definitions are */
  free?: number;
}

const numberClues = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) => gs.flatMap((g) => (g.kind === "number" && g.letter === undefined ? [[i, g.value] as [number, number]] : [])));

/** `picks`: also show each candidate shape's pick atom and list the shapes (for the generator's
 *  rectangle technique, deduce.ts). */
export function localProgram(p: Puzzle, genre: string | undefined, picks = false, finishing = false): Local | null {
  const names = p.rules.map((r) => r.rule).join(",");
  if (process.env.DEDUCE_LOCAL !== "0" && genre === "nurikabe" && names === "size-clue,one-each,connected,no-pool" && p.rules[1].of === "number") return nurikabeProgram(p);
  // (Fillomino's with the finish set, or DEDUCE_LOCAL=fillomino: judged only there, 2026-10-22's guard)
  if ((process.env.DEDUCE_LOCAL === "fillomino" || (finishing && process.env.DEDUCE_LOCAL !== "0")) && genre === "fillomino" && names === "size-clue,neighbors-differ-size") return fillominoProgram(p);
  const shikaku = genre === "shikaku" && names === "rectangles,one-each,size-clue";
  const jam = genre === "square-jam" && names === "squares,no-four-corners,side-clue";
  if (!shikaku && !jam) return null;
  const g = p.grid;
  if (g.kind !== "square" || p.figure || p.blocked.size || p.walls.size) return null;
  const clues = numberClues(p);
  // only number clues, one per cell
  const givens = [...p.cellGivens.values()].flat();
  if (givens.length !== clues.length || givens.some((x) => x.kind !== "number")) return null;
  const clueAt = new Map(clues);

  const linkOf = new Map<string, number>();
  g.links.forEach((l, k) => linkOf.set(`${Math.min(l.cells[0], l.cells[1])},${Math.max(l.cells[0], l.cells[1])}`, k));
  const link = (a: number, b: number) => linkOf.get(`${Math.min(a, b)},${Math.max(a, b)}`);

  // the candidate shapes: [top, left, height, width]
  const shapes: [number, number, number, number][] = [], shapeClue: number[] = [];
  const cellsIn = ([t, l, h, w]: [number, number, number, number]) => {
    const out: number[] = [];
    for (let y = t; y < t + h; y++) for (let x = l; x < l + w; x++) out.push(g.cell(y, x));
    return out;
  };
  if (shikaku) {
    for (const [i, v] of clues) {
      const [r, c] = g.rc(i);
      for (let h = 1; h <= v; h++) {
        if (v % h) continue;
        const w = v / h;
        for (let t = r - h + 1; t <= r; t++) for (let l = c - w + 1; l <= c; l++) {
          if (t < 0 || l < 0 || t + h > g.rows || l + w > g.cols) continue;
          const s: [number, number, number, number] = [t, l, h, w];
          if (cellsIn(s).every((k) => k === i || !clueAt.has(k))) { shapes.push(s); shapeClue.push(i); }
        }
      }
    }
  } else {
    for (let s = 1; s <= Math.min(g.rows, g.cols); s++) for (let t = 0; t + s <= g.rows; t++) for (let l = 0; l + s <= g.cols; l++) {
      const sq: [number, number, number, number] = [t, l, s, s];
      if (cellsIn(sq).every((k) => !clueAt.has(k) || clueAt.get(k) === s)) { shapes.push(sq); shapeClue.push(cellsIn(sq).find((k) => clueAt.has(k)) ?? -1); }
    }
  }

  const k0 = 0;                       // the shape rule (rectangles / squares)
  const tag = (k: number) => `rbk(${k})`;
  const out: string[] = [`{cut(L)} :- link(L).`, ...g.links.map((_, k) => `link(${k}).`)];
  const covers: number[][] = Array.from({ length: g.cellCount }, () => []);
  const within: number[][] = g.links.map(() => []);
  const listed: NonNullable<Local["shapes"]> = [];
  shapes.forEach((s, id) => {
    const cs = cellsIn(s), inside = new Set(cs), body: string[] = [], ins: number[] = [], border: number[] = [];
    for (const a of cs) {
      covers[a].push(id);
      for (const lk of g.cellLinks[a]) {
        const [x, y] = g.links[lk].cells, b = x === a ? y : x;
        if (inside.has(b)) { if (a < b) { body.push(`not cut(${lk})`); within[lk].push(id); ins.push(lk); } }
        else { body.push(`cut(${lk})`); border.push(lk); }
      }
    }
    listed.push({ clue: shapeClue[id], cells: cs, inside: ins, border });
    // the shape is a region when its inside is uncut and its border cut
    out.push(`pick(${id}) :- ${[...body, tag(k0)].join(", ")}.`);
  });
  // every cell is in a region, and an uncut link joins two cells of one region
  for (let a = 0; a < g.cellCount; a++) out.push(covers[a].length ? `:- ${covers[a].map((id) => `not pick(${id})`).join(", ")}, ${tag(k0)}.` : `:- ${tag(k0)}.`);
  g.links.forEach((_, lk) => out.push(within[lk].length ? `:- not cut(${lk}), ${within[lk].map((id) => `not pick(${id})`).join(", ")}, ${tag(k0)}.` : `:- not cut(${lk}), ${tag(k0)}.`));
  if (jam) {
    // four regions never meet at a point: the four links around it aren't all cut
    for (let y = 0; y + 1 < g.rows; y++) for (let x = 0; x + 1 < g.cols; x++) {
      const [A, B, C, D] = [g.cell(y, x), g.cell(y, x + 1), g.cell(y + 1, x), g.cell(y + 1, x + 1)];
      out.push(`:- cut(${link(A, B)}), cut(${link(C, D)}), cut(${link(A, C)}), cut(${link(B, D)}), ${tag(1)}.`);
    }
  }
  out.push("#show cut/1.");
  if (picks) out.push("#show pick/1.");
  const text = out.join("\n");
  return { text, plain: `${text}\nrbk(0..${Math.max(0, p.rules.length - 1)}).`, ...(picks ? { shapes: listed } : {}) };
}

/** Nurikabe (rules size-clue, one-each number, connected, no-pool, in that order: blocks 0–3). An
 *  unshaded cell is owned by one number close enough to reach it (own(I,C), shown, so its footprint
 *  is its cell); neighbours both unshaded have one owner (one-each); a number owns its size, joined
 *  to it (r(I,C), recursive: its footprint the number's reach) (size-clue); the shaded cells are
 *  joined to the first of them (connected); no 2 × 2 is all shaded (no-pool). */
function nurikabeProgram(p: Puzzle): Local | null {
  const g = p.grid;
  if (g.kind !== "square" || p.figure || p.blocked.size || p.walls.size) return null;
  const clues = numberClues(p);
  const givens = [...p.cellGivens.values()].flat();
  if (givens.length !== clues.length || givens.some((x) => x.kind !== "number") || !clues.length) return null;
  const clueAt = new Map(clues), n = g.cellCount;
  const near = (i: number) => g.cellLinks[i].map((lk) => { const [x, y] = g.links[lk].cells; return x === i ? y : x; });
  const dist = (a: number, b: number) => { const [ra, ca] = g.rc(a), [rb, cb] = g.rc(b); return Math.abs(ra - rb) + Math.abs(ca - cb); };
  const tag = (k: number) => `rbk(${k})`;
  const out: string[] = [];
  // the candidates: a number reaches a cell within its size less one (and not another number's)
  const cand: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    if (clueAt.has(i)) { cand[i].push(i); continue; }
    for (const [c, v] of clues) if (dist(i, c) <= v - 1) cand[i].push(c);
  }
  for (let i = 0; i < n; i++) {
    if (clueAt.has(i)) { out.push(`own(${i},${i}).`); continue; }
    out.push(`{shaded(${i})}.`);
    // unshaded: owned by exactly one of its candidates (none: shaded)
    if (cand[i].length) {
      out.push(`{${cand[i].map((c) => `own(${i},${c})`).join(";")}} :- not shaded(${i}).`);
      out.push(`:- not shaded(${i}), ${cand[i].map((c) => `not own(${i},${c})`).join(", ")}, ${tag(1)}.`);
      for (let a = 0; a < cand[i].length; a++) for (let b = a + 1; b < cand[i].length; b++) out.push(`:- own(${i},${cand[i][a]}), own(${i},${cand[i][b]}), ${tag(1)}.`);
    }
    else out.push(`:- not shaded(${i}), ${tag(0)}.`);
  }
  const owns = (i: number, c: number) => cand[i].includes(c);
  const shadeLit = (i: number, v: boolean) => (clueAt.has(i) ? (v ? null : "") : v ? `shaded(${i})` : `not shaded(${i})`);
  for (let i = 0; i < n; i++) for (const j of near(i)) {
    if (j < i) continue;
    // two unshaded neighbours: one owner (a pair of numbers side by side can't be)
    for (const c of cand[i]) {
      const ji = shadeLit(j, false);
      if (owns(j, c)) out.push(`:- own(${i},${c}), ${ji ? `${ji}, ` : ""}not own(${j},${c}), ${tag(1)}.`);
      else out.push(`:- own(${i},${c}), ${ji ? `${ji}, ` : ""}${tag(1)}.`);
    }
    for (const c of cand[j]) {
      const ij = shadeLit(i, false);
      if (owns(i, c)) out.push(`:- own(${j},${c}), ${ij ? `${ij}, ` : ""}not own(${i},${c}), ${tag(1)}.`);
      else out.push(`:- own(${j},${c}), ${ij ? `${ij}, ` : ""}${tag(1)}.`);
    }
  }
  // a number's island: its size, joined to it
  for (const [c, v] of clues) {
    const mine = [...Array(n).keys()].filter((i) => owns(i, c));
    out.push(`:- not ${v} #count{${mine.map((i) => `${i}:own(${i},${c})`).join(";")}} ${v}, ${tag(0)}.`);
    out.push(`r(${c},${c}).`);
    for (const j of mine) for (const i of near(j)) if (owns(i, c) && j !== c) out.push(`r(${j},${c}) :- r(${i},${c}), own(${j},${c}).`);
    for (const j of mine) if (j !== c) out.push(`:- own(${j},${c}), not r(${j},${c}), ${tag(0)}.`);
  }
  // the shaded cells, joined to the first of them
  const free = [...Array(n).keys()].filter((i) => !clueAt.has(i));
  free.forEach((i, k) => {
    if (k > 0) { const h = free[k - 1]; out.push(`pre(${i}) :- shaded(${h}).`, `pre(${i}) :- pre(${h}).`); }
    out.push(k > 0 ? `sea(${i}) :- shaded(${i}), not pre(${i}).` : `sea(${i}) :- shaded(${i}).`);
    for (const j of near(i)) if (!clueAt.has(j)) out.push(`sea(${j}) :- sea(${i}), shaded(${j}).`);
    out.push(`:- shaded(${i}), not sea(${i}), ${tag(2)}.`);
  });
  // no 2 × 2 all shaded
  for (let y = 0; y + 1 < g.rows; y++) for (let x = 0; x + 1 < g.cols; x++) {
    const q = [g.cell(y, x), g.cell(y, x + 1), g.cell(y + 1, x), g.cell(y + 1, x + 1)];
    if (q.some((i) => clueAt.has(i))) continue;
    out.push(`:- ${q.map((i) => `shaded(${i})`).join(", ")}, ${tag(3)}.`);
  }
  out.push("#show shaded/1.", "#show own/2.");
  const text = out.join("\n");
  return { text, plain: `${text}\nrbk(0..3).` };
}

/** Fillomino (rules size-clue, neighbors-differ-size: blocks 0–1). Each cell has a size sz(I,V)
 *  and an owner own(I,C), its region's first cell (C ≤ I, close enough for some size); an uncut link joins
 *  cells of one owner and size, a cut parts owners; an owner's cells are joined to it and number
 *  its size. Those say what a region and its size are (the engine's regions and size/2).
 *  A number is its cell's size (size-clue); neighbours of one size aren't cut (neighbors-differ-size).
 *  A region with no number is no bigger than the numberless cells joined to it, which bounds the
 *  sizes (where the engine's counts every region to the whole grid). */
function fillominoProgram(p: Puzzle): Local | null {
  const g = p.grid;
  if (g.kind !== "square" || p.figure || p.blocked.size || p.walls.size) return null;
  const clues = numberClues(p);
  const givens = [...p.cellGivens.values()].flat();
  if (givens.length !== clues.length || givens.some((x) => x.kind !== "number")) return null;
  const clueAt = new Map(clues), n = g.cellCount, tag = (k: number) => `rbk(${k})`;
  const ends = (lk: number) => g.links[lk].cells as [number, number];
  const near = (i: number) => g.cellLinks[i].map((lk) => { const [x, y] = ends(lk); return x === i ? y : x; });
  const dist = (a: number, b: number) => { const [ra, ca] = g.rc(a), [rb, cb] = g.rc(b); return Math.abs(ra - rb) + Math.abs(ca - cb); };
  // the sizes a cell can have: a number's, within its reach; or, numberless, up to its numberless group
  const group = new Int32Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (clueAt.has(i) || group[i]) continue;
    const cs = [i], seen = new Set(cs);
    for (let k = 0; k < cs.length; k++) for (const d of near(cs[k])) if (!clueAt.has(d) && !seen.has(d)) { seen.add(d); cs.push(d); }
    for (const c of cs) group[c] = cs.length;
  }
  const vals: number[][] = Array.from({ length: n }, (_, i) => {
    if (clueAt.has(i)) return [];
    const vs = new Set<number>();
    for (let v = 1; v <= group[i]; v++) vs.add(v);
    for (const [c, v] of clues) if (dist(i, c) <= v - 1) vs.add(v);
    return [...vs].sort((a, b) => a - b);
  });
  // a number's cell: its number, or (size-clue aside) any size a neighbour can have
  for (const [c, v] of clues) vals[c] = [...new Set([v, ...near(c).flatMap((d) => vals[d])])].sort((a, b) => a - b);
  const has = (i: number, v: number) => vals[i].includes(v);
  // the owners a cell can have: an earlier (or the same) cell sharing a size it reaches
  const cand: number[][] = Array.from({ length: n }, (_, i) => [...Array(i + 1).keys()].filter((c) => vals[i].some((v) => has(c, v) && dist(i, c) <= v - 1)));
  // too many owner and size choices ground past what clingo-wasm holds (on the guard, a few ran out
  // of memory or past its program size): the engine's encoding, then (the 16 hard dev Fillominos, up
  // to 8 × 8, have at most 3,362, the largest grounding to 1.2 MB)
  if (cand.reduce((a, c) => a + c.length, 0) + vals.reduce((a, v) => a + v.length, 0) > 3500) return null;
  // facts, and rules over them (clingo grounds them: written out, an 8 × 8 is past clingo-wasm's size)
  const out: string[] = [`{cut(L)} :- link(L).`];
  g.links.forEach((_, lk) => { const [a, b] = ends(lk); out.push(`link(${lk}). lk(${lk},${a},${b}). lk(${lk},${b},${a}).`); });
  for (let i = 0; i < n; i++) out.push(`cl(${i}). ${vals[i].map((v) => `val(${i},${v}).`).join(" ")} ${cand[i].map((c) => `cand(${i},${c}).`).join(" ")}`);
  for (const [c, v] of clues) out.push(`num(${c},${v}).`);
  // (what a region and its size are: free, rbk(2), as the engine's region rules are definitions;
  // tagged size-clue, they made every step dear, a group for each unit they touched, 2026-10-22's guard)
  const T = tag(2);
  out.push(`1 {sz(I,V) : val(I,V)} 1 :- cl(I).
1 {own(I,C) : cand(I,C)} 1 :- cl(I).
:- own(I,C), I != C, not own(C,C), ${T}.
% uncut: one size, one owner; cut: two owners (an owned cell's size is its owner's, joined by uncut links)
:- lk(L,A,B), not cut(L), sz(A,V), not sz(B,V), ${T}.
:- lk(L,A,B), not cut(L), own(A,C), not own(B,C), ${T}.
:- lk(L,A,B), cut(L), own(A,C), own(B,C), ${T}.
% an owner's cells: joined to it, and as many as its size
r(C,C) :- own(C,C).
r(J,C) :- r(I,C), lk(L,I,J), not cut(L), own(J,C).
:- own(J,C), not r(J,C), ${T}.
:- own(C,C), #sum{1,I : own(I,C); -V,s : sz(C,V)} != 0, ${T}.
% size-clue: a number is its cell's size
:- num(C,V), not sz(C,V), ${tag(0)}.
% neighbors-differ-size
:- lk(L,A,B), cut(L), sz(A,V), sz(B,V), ${tag(1)}.`);
  out.push("#show cut/1.", "#show sz/2.", "#show own/2.");
  const text = out.join("\n");
  return { text, plain: `${text}\nrbk(0..2).`, cellAtoms: ["sz", "own"], free: 2 };
}
