// Turning a puzzle into an answer set program for clingo, and clingo's answers back into a
// board. No Node APIs, so the browser can use it too (the social site's editor proves puzzles
// there); src/engine/solve.ts runs it at build time.
//
// Shared predicates rule encodings may use:
//   cell(I) row(I,R) col(I,C) adj(I,J,L)  clue(I)           cells, neighbours (L = link), clue cells
//   corner(V) border(B) cb(I,B) vb(V,B)  link(L) lc(I,L)    fence and loop geometry
//   quad(A,B,C,D)                                          2x2 blocks
//   inarea(I,A)                                            outlined areas (when the puzzle has them)
//   fence(B) line(L) shaded(I) cut(L) paint(I,C)           the marks (choices)
//   open(I) member(R,I) root(R) size(R,N)                  regions ("regions" need; a panel's are cut by its line)
//   same(R1,R2) for pairs listed in cmp(R1,R2)             shapes ("shapes" need)
import { blockFor } from "./rules.ts";
import { linesCut } from "./derive.ts";
import { emptyBoard, type Board, type Puzzle } from "./types.ts";

export function program(p: Puzzle): string {
  const g = p.grid, out: string[] = [];
  for (let i = 0; i < g.cellCount; i++) {
    const [r, c] = g.rc(i);
    out.push(`cell(${i}). row(${i},${r}). col(${i},${c}).`);
  }
  for (const l of g.links) out.push(`adj(${l.cells[0]},${l.cells[1]},${l.id}). adj(${l.cells[1]},${l.cells[0]},${l.id}). link(${l.id}). lc(${l.cells[0]},${l.id}). lc(${l.cells[1]},${l.id}).`);
  for (const i of p.cellGivens.keys()) out.push(`clue(${i}).`);
  for (const i of p.blocked) out.push(`blocked(${i}).`);
  if (p.areas) p.areas.of.forEach((a, i) => out.push(`inarea(${i},${a}).`));
  for (const l of p.walls) out.push(`wall(${l}).`);
  if (p.marks.includes("fence")) {
    for (let v = 0; v < g.cornerCount; v++) out.push(`corner(${v}).`);
    for (const e of g.borders) out.push(`border(${e.id}). vb(${e.corners[0]},${e.id}). vb(${e.corners[1]},${e.id}).` + e.cells.filter((x) => x >= 0).map((x) => ` cb(${x},${e.id}).`).join(""));
  }
  for (let r = 0; r + 1 < g.rows; r++) for (let c = 0; c + 1 < g.cols; c++)
    out.push(`quad(${g.cell(r, c)},${g.cell(r, c + 1)},${g.cell(r + 1, c)},${g.cell(r + 1, c + 1)}).`);

  // the marks the player can make
  if (p.marks.includes("fence")) out.push("{fence(B)} :- border(B).");
  if (p.marks.includes("loop")) out.push("{line(L)} :- link(L), not wall(L).\n:- line(L), lc(I,L), blocked(I).");
  // shading: not on clue cells, unless a rule shades the clues themselves (Hitori)
  if (p.marks.includes("shade")) out.push(p.rules.some((s) => blockFor(s).shadeClues) ? "{shaded(I)} :- cell(I), not blocked(I)." : "{shaded(I)} :- cell(I), not clue(I).");
  if (p.marks.includes("regions")) out.push("{cut(L)} :- link(L).");
  if (p.marks.includes("paint")) out.push(`pc(1..${paletteSize(p)}).\n1 { paint(I,C) : pc(C) } 1 :- cell(I).`);
  if (p.marks.includes("digit")) {
    out.push(`d(1..${p.digits}).\n${p.blanks ? "" : "1 "}{ digit(I,D) : d(D) } 1 :- cell(I).`);
    for (const [i, gs] of p.cellGivens) for (const giv of gs) if (giv.kind === "number") out.push(`digit(${i},${giv.value}).`);
  }

  const needs = new Set(p.rules.flatMap((s) => blockFor(s).needs ?? []));
  if (needs.has("regions") || needs.has("shapes")) {
    // When no region can have more than N cells, two cells of one region are at most N-1
    // steps apart: only those pairs need reach/off atoms, which keeps grounding small.
    const n = maxRegion(p), bound = n < g.cellCount;
    if (bound) for (let i = 0; i < g.cellCount; i++) for (let j = 0; j < g.cellCount; j++) {
      const [r1, c1] = g.rc(i), [r2, c2] = g.rc(j);
      if (Math.abs(r1 - r2) + Math.abs(c1 - c2) <= n - 1) out.push(`near(${i},${j}).`);
    }
    if (linesCut(p)) for (const l of g.links) out.push(`lb(${l.id},${l.border}).`);
    out.push(p.marks.includes("regions")
      ? "open(I) :- cell(I).\nconn(I,J) :- adj(I,J,L), not cut(L)."
      : linesCut(p) ? "open(I) :- cell(I).\nconn(I,J) :- adj(I,J,L), lb(L,B), not fence(B)."
      : "open(I) :- cell(I), not shaded(I).\nconn(I,J) :- adj(I,J,_), open(I), open(J).");
    out.push(`
reach(I,I) :- open(I).
reach(I,K) :- reach(I,J), conn(J,K)${bound ? ", near(I,K)" : ""}.${bound ? "\n:- reach(I,J), conn(J,K), not near(I,K).   % no region is that big" : ""}
smaller(I) :- reach(I,J), J < I.
root(I) :- open(I), not smaller(I).
member(R,I) :- root(R), reach(R,I).
size(R,N) :- root(R), N = #count{I: member(R,I)}.`);
    if (p.marks.includes("regions")) out.push(":- cut(L), adj(I,J,L), reach(I,J).   % a cut must separate two regions");
  }
  if (needs.has("shapes")) out.push(`
t(0..7).
off(R,I,A,B) :- member(R,I), row(R,R0), col(R,C0), row(I,R1), col(I,C1), A = R1-R0, B = C1-C0.
tr(R,0,A,B) :- off(R,_,A,B).   tr(R,1,A,-B) :- off(R,_,A,B).   tr(R,2,-A,B) :- off(R,_,A,B).   tr(R,3,-A,-B) :- off(R,_,A,B).
tr(R,4,B,A) :- off(R,_,A,B).   tr(R,5,B,-A) :- off(R,_,A,B).   tr(R,6,-B,A) :- off(R,_,A,B).   tr(R,7,-B,-A) :- off(R,_,A,B).
cmpr(R) :- cmp(R,_).   cmpr(R) :- cmp(_,R).
mx(R,T,X) :- cmpr(R), t(T), X = #min{A: tr(R,T,A,_)}, X < #sup.
my(R,T,Y) :- mx(R,T,X), Y = #min{B: tr(R,T,X,B)}.
norm(R,T,A-X,B-Y) :- tr(R,T,A,B), mx(R,T,X), my(R,T,Y).
diff(R1,R2,T) :- cmp(R1,R2), t(T), norm(R1,T,A,B), not norm(R2,0,A,B).
same(R1,R2) :- cmp(R1,R2), size(R1,N), size(R2,N), t(T), not diff(R1,R2,T).`);

  for (const s of p.rules) out.push(`% ${s.rule}\n${blockFor(s).asp(s, p)}`);
  out.push("#show fence/1. #show line/1. #show shaded/1. #show cut/1. #show digit/2. #show paint/2.");
  return out.join("\n");
}

/** How many paint colors a paint puzzle has (its palette; three if it doesn't say). */
export const paletteSize = (p: Puzzle) => p.style.palette?.length || 3;

/** The most cells any region can have, from the rules (the grid size if they don't say). */
export function maxRegion(p: Puzzle): number {
  let n = p.grid.cellCount;
  for (const s of p.rules) if (s.rule === "size") n = Math.min(n, (s.is ?? s.max ?? n) as number);
  // every region holds exactly one number and is that size: no bigger than the biggest number
  if (p.rules.some((s) => s.rule === "size-clue") && p.rules.some((s) => s.rule === "one-each" && (s.of ?? "number") === "number")) {
    const nums = [...p.cellGivens.values()].flat().filter((g) => g.kind === "number").map((g) => g.value as number);
    if (nums.length) n = Math.min(n, Math.max(...nums));
  }
  return n;
}

/** A solver answer as a board. Region puzzles come back as cuts only (no colors). */
export function boardOf(p: Puzzle, atoms: string[]): Board {
  const b = emptyBoard(p.grid);
  for (const a of atoms) {
    const dm = /^(digit|paint)\((\d+),(\d+)\)$/.exec(a);
    if (dm) { (dm[1] === "digit" ? b.digit : b.color)[Number(dm[2])] = Number(dm[3]); continue; }
    const m = /^(\w+)\((\d+)\)$/.exec(a);
    if (!m) continue;
    const i = Number(m[2]);
    if (m[1] === "fence") b.fence[i] = 1;
    else if (m[1] === "line") b.loop[i] = 1;
    else if (m[1] === "shaded") b.shade[i] = 1;
    else if (m[1] === "cut") b.cut[p.grid.links[i].border] = 1;
  }
  return b;
}
