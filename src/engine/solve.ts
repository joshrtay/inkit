// Build-time solver: turns a puzzle into an answer set program and asks clingo
// (clingo-wasm) for solutions. Every solution it finds is re-checked with the same
// TypeScript rules the browser uses, so an encoding that disagrees with its check is
// caught here. Used to prove a puzzle has exactly one solution.
//
// Shared predicates rule encodings may use:
//   cell(I) row(I,R) col(I,C) adj(I,J,L)  clue(I)           cells, neighbours (L = link), clue cells
//   corner(V) border(B) cb(I,B) vb(V,B)  link(L) lc(I,L)    fence and loop geometry
//   quad(A,B,C,D)                                          2x2 blocks
//   fence(B) line(L) shaded(I) cut(L)                      the marks (choices)
//   open(I) member(R,I) root(R) size(R,N)                  regions ("regions" need)
//   same(R1,R2) for pairs listed in cmp(R1,R2)             shapes ("shapes" need)
import { blockFor } from "./rules.ts";
import { check } from "./puzzle.ts";
import { emptyBoard, type Board, type Puzzle } from "./types.ts";

export function program(p: Puzzle): string {
  const g = p.grid, out: string[] = [];
  for (let i = 0; i < g.cellCount; i++) {
    const [r, c] = g.rc(i);
    out.push(`cell(${i}). row(${i},${r}). col(${i},${c}).`);
  }
  for (const l of g.links) out.push(`adj(${l.cells[0]},${l.cells[1]},${l.id}). adj(${l.cells[1]},${l.cells[0]},${l.id}). link(${l.id}). lc(${l.cells[0]},${l.id}). lc(${l.cells[1]},${l.id}).`);
  for (const i of p.cellGivens.keys()) out.push(`clue(${i}).`);
  if (p.marks.includes("fence")) {
    for (let v = 0; v < g.cornerCount; v++) out.push(`corner(${v}).`);
    for (const e of g.borders) out.push(`border(${e.id}). vb(${e.corners[0]},${e.id}). vb(${e.corners[1]},${e.id}).` + e.cells.filter((x) => x >= 0).map((x) => ` cb(${x},${e.id}).`).join(""));
  }
  for (let r = 0; r + 1 < g.rows; r++) for (let c = 0; c + 1 < g.cols; c++)
    out.push(`quad(${g.cell(r, c)},${g.cell(r, c + 1)},${g.cell(r + 1, c)},${g.cell(r + 1, c + 1)}).`);

  // the marks the player can make
  if (p.marks.includes("fence")) out.push("{fence(B)} :- border(B).");
  if (p.marks.includes("loop")) out.push("{line(L)} :- link(L).");
  if (p.marks.includes("shade")) out.push("{shaded(I)} :- cell(I), not clue(I).");
  if (p.marks.includes("regions")) out.push("{cut(L)} :- link(L).");

  const needs = new Set(p.rules.flatMap((s) => blockFor(s).needs ?? []));
  if (needs.has("regions") || needs.has("shapes")) {
    out.push(p.marks.includes("regions")
      ? "open(I) :- cell(I).\nconn(I,J) :- adj(I,J,L), not cut(L)."
      : "open(I) :- cell(I), not shaded(I).\nconn(I,J) :- adj(I,J,_), open(I), open(J).");
    out.push(`
reach(I,I) :- open(I).
reach(I,K) :- reach(I,J), conn(J,K).
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
  out.push("#show fence/1. #show line/1. #show shaded/1. #show cut/1.");
  return out.join("\n");
}

/** A solver answer as a board. Region puzzles come back as cuts only (no colors). */
export function boardOf(p: Puzzle, atoms: string[]): Board {
  const b = emptyBoard(p.grid);
  for (const a of atoms) {
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

interface ClingoResult { Result: string; Call?: { Witnesses?: { Value: string[] }[] }[]; Error?: string }

/** Up to `limit` solutions. Throws if clingo finds one that the rule checks reject. */
export async function solve(p: Puzzle, limit = 2): Promise<Board[]> {
  const clingo = await import("clingo-wasm");
  const res = (await clingo.run(program(p), limit)) as ClingoResult;
  if (res.Result === "ERROR") throw new Error(`clingo: ${res.Error}`);
  const boards = (res.Call?.[0]?.Witnesses ?? []).map((w) => boardOf(p, w.Value));
  for (const b of boards) {
    const problems = check(p, b);
    if (problems.length) throw new Error(`solver and checks disagree: ${problems.map((x) => x.message).join("; ")}`);
  }
  return boards;
}
