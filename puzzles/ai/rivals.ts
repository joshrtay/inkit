// Rival rules: the plausible wrong readings of each subject in Slate's curriculum
// (app/app/ai/personas.ts SLATE_CURRICULUM; docs/research-tutorials.md §4.4). A rival is the true
// puzzle's program with one rule read differently: a rule dropped or swapped for another engine
// block, the puzzle's own spec changed, or a few lines of its ASP rewritten. Only the lesson checks
// (./lesson.ts) use them, never the engine the site runs.
//
// A post *breaks* a rival when, read that way, it has no answer, a different one, or more than one:
// a player holding that reading can't reliably draw the true answer. Wednesday's post must break a
// subject's first rival (the most common misreading); Thursday's must break them all.
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { boardOf, program } from "../../src/engine/solve.ts";
import type { Board, Given, GridSpec, Puzzle, RuleSpec } from "../../src/engine/types.ts";

export interface Rival {
  id: string;
  /** the misreading, in plain words (notes, and the words a post must not use) */
  reading: string;
  /** how it relates to the true rule: weaker (it allows everything the rule does, and more: rules
   *  dropped or loosened), stricter (it allows only some of it: constraints added), or other.
   *  Only an "other" reading can offer a wrong answer while turning the true one down, which is
   *  what a trap needs (./lesson.ts). Default: weaker for drops only, stricter for additions
   *  only, else other */
  kind?: "weaker" | "stricter" | "other";
  /** the spec read differently (shapes that all turn, a hollow shape taken as solid, ...) */
  spec?: (s: GridSpec) => GridSpec;
  /** rules left out */
  drop?: string[];
  /** rules read as another engine block */
  swap?: Record<string, RuleSpec>;
  /** the program's text rewritten; returning it unchanged means the rival doesn't apply here */
  asp?: (prog: string, p: Puzzle) => string;
  /** rules added */
  add?: RuleSpec[];
  /** more ASP */
  extra?: (p: Puzzle) => string;
}

// ---- helpers ----

/** Replace one exact line (or text) everywhere; unchanged if it isn't there. */
const swapText = (...pairs: [string | RegExp, string | ((...m: string[]) => string)][]) => (prog: string) =>
  pairs.reduce((t, [from, to]) => (typeof from === "string" ? t.split(from).join(to as string) : t.replace(from, to as (...m: string[]) => string)), prog);
const mapGivens = (f: (g: Given) => Given | null) => (s: GridSpec): GridSpec => ({ ...s, givens: (s.givens ?? []).map(f).filter((g): g is Given => !!g) });
const setRule = (name: string, change: (r: RuleSpec) => RuleSpec | null) => (s: GridSpec): GridSpec => {
  const own = s.rules ?? [];
  const has = own.some((r) => r.rule === name);
  const rules = (has ? own : [...own, { rule: name }]).map((r) => (r.rule === name ? change(r) : r)).filter((r): r is RuleSpec => !!r);
  return { ...s, rules };
};
const lineCells = (p: Puzzle, kind: "row" | "col", i: number) => kind === "row" ? Array.from({ length: p.grid.cols }, (_, c) => p.grid.cell(i, c)) : Array.from({ length: p.grid.rows }, (_, r) => p.grid.cell(r, i));
const rayIn = (p: Puzzle, cell: number, side: string) => {
  const g = p.grid, [r, c] = g.rc(cell);
  return side === "left" ? Array.from({ length: g.cols }, (_, x) => g.cell(r, x)) : side === "right" ? Array.from({ length: g.cols }, (_, x) => g.cell(r, g.cols - 1 - x))
    : side === "top" ? Array.from({ length: g.rows }, (_, y) => g.cell(y, c)) : Array.from({ length: g.rows }, (_, y) => g.cell(g.rows - 1 - y, c));
};

// the panel symbols' constraint lines (src/engine/panel.ts panelSymbols.asp)
const SQ = ":- live(X), live(Y), sq(X,C), sq(Y,D), C != D, inreg(X,R), inreg(Y,R).";
const ST = ":- live(X), st(X,C), inreg(X,R), #count{Y: live(Y), colored(Y,C), inreg(Y,R)} != 2.";
const TRI = ":- live(X), tri(X,N), scell(X,I), N != #count{B: fence(B), cb(I,B)}.";
const HEXV = ":- live(X), hexv(X,_).", HEXB = ":- live(X), hexb(X,_).";
const SHAPE_EXACT = ":- hasshape(R), member(R,C), #count{X: place(X,P), pc(X,P,C), inreg(X,R)} != 1.";
const PLACE = "1 { place(X,P): pl(X,P) } 1 :- live(X), shp(X).";
const ERASE = "1 { erase(E,X): inreg(X,R), bad0(X); pairs(E,F): er(F), inreg(F,R), F != E } 1 :- er(E), inreg(E,R).";
const ERASE_LIVE = "live(X) :- inreg(X,_), not er(X), not gone(X).";
const symmetry = (sym: string | null) => (s: GridSpec) => setRule("panel-line", (r) => (sym ? { ...r, symmetry: sym } : { rule: "panel-line" }))(s);
const LOOP_ONE = ":- llit(V), not lreach(V).";

/** Each subject's rivals, most common first (Wednesday breaks the first; Thursday all). */
export const RIVALS: Record<string, Rival[]> = {
  // ---- panel symbols ----
  "panel:dots": [
    { id: "avoid", reading: "the line stays off the dots", asp: swapText([HEXV, ":- hexv(X,V), vis(V)."], [HEXB, ":- hexb(X,B), fence(B)."]) },
    { id: "one", kind: "weaker", reading: "the line passes at least one dot", asp: swapText([HEXV, ":- #count{X: hexv(X,V), vis(V); X: hexb(X,B), fence(B)} = 0."], [HEXB, ""]) },
  ],
  "panel:squares": [
    { id: "together", reading: "squares of one color all end up together", asp: swapText([SQ, ":- live(X), live(Y), sq(X,C), sq(Y,C), inreg(X,R), inreg(Y,S), R != S."]) },
    { id: "alone", reading: "every square ends up on its own", asp: swapText([SQ, ":- live(X), live(Y), sq(X,_), sq(Y,_), X < Y, inreg(X,R), inreg(Y,R)."]) },
    { id: "touch", reading: "the line touches every square", asp: swapText([SQ, ":- live(X), sq(X,_), scell(X,I), #count{B: fence(B), cb(I,B)} = 0."]) },
  ],
  "panel:stars": [
    { id: "any-symbol", reading: "a star pairs with any one symbol", asp: swapText([ST, ":- live(X), st(X,C), inreg(X,R), #count{Y: live(Y), inreg(Y,R)} != 2."]) },
    { id: "at-least", kind: "weaker", reading: "a star needs at least one partner", asp: swapText([ST, ":- live(X), st(X,C), inreg(X,R), #count{Y: live(Y), colored(Y,C), inreg(Y,R)} < 2."]) },
    { id: "together", reading: "stars of one color all end up together", asp: swapText([ST, ":- live(X), live(Y), st(X,C), st(Y,C), inreg(X,R), inreg(Y,S), R != S."]) },
  ],
  "panel:triangles": [
    { id: "at-least", kind: "weaker", reading: "the line runs along at least that many sides", asp: swapText([TRI, ":- live(X), tri(X,N), scell(X,I), N > #count{B: fence(B), cb(I,B)}."]) },
    { id: "corners", reading: "a triangle counts the corners the line touches", asp: swapText([TRI, "cc(I,V) :- cb(I,B), vb(V,B).\n:- live(X), tri(X,N), scell(X,I), N != #count{V: vis(V), cc(I,V)}."]) },
    { id: "at-most", kind: "weaker", reading: "the line runs along at most that many sides", asp: swapText([TRI, ":- live(X), tri(X,N), scell(X,I), N < #count{B: fence(B), cb(I,B)}."]) },
  ],
  "panel:triangle-edges": [
    { id: "no-edge", reading: "the board's edge doesn't count as a side", asp: swapText([TRI, ":- live(X), tri(X,N), scell(X,I), N != #count{B: fence(B), cb(I,B), cb(J,B), J != I}."]) },
    { id: "at-least", reading: "the line runs along at least that many sides", asp: swapText([TRI, ":- live(X), tri(X,N), scell(X,I), N > #count{B: fence(B), cb(I,B)}."]) },
    { id: "corners", reading: "a triangle counts the corners the line touches", asp: swapText([TRI, "cc(I,V) :- cb(I,B), vb(V,B).\n:- live(X), tri(X,N), scell(X,I), N != #count{V: vis(V), cc(I,V)}."]) },
  ],
  "panel:shapes": [
    { id: "contain", kind: "weaker", reading: "the region only has to hold the shapes", asp: swapText([SHAPE_EXACT, ":- hasshape(R), member(R,C), #count{X: place(X,P), pc(X,P,C), inreg(X,R)} > 1."]) },
    { id: "turn", kind: "weaker", reading: "every shape may be turned", spec: mapGivens((g) => (g.kind === "shape" ? { ...g, rotate: true } as Given : g)) },
    { id: "in-place", kind: "stricter", reading: "a shape lies over its own square", asp: swapText([PLACE, `${PLACE}\n:- place(X,P), scell(X,I), not pc(X,P,I).`]) },
  ],
  "panel:tilted": [
    { id: "fixed", kind: "stricter", reading: "a tilted piece keeps its way round", spec: mapGivens((g) => (g.kind === "shape" && "rotate" in g && g.rotate ? { ...g, rotate: undefined } as Given : g)) },
    { id: "contain", reading: "the region only has to hold the shapes", asp: swapText([SHAPE_EXACT, ":- hasshape(R), member(R,C), #count{X: place(X,P), pc(X,P,C), inreg(X,R)} > 1."]) },
    { id: "in-place", reading: "a shape lies over its own square", asp: swapText([PLACE, `${PLACE}\n:- place(X,P), scell(X,I), not pc(X,P,I).`]) },
  ],
  "panel:hollow": [
    { id: "solid", reading: "a hollow shape is one more solid shape", spec: mapGivens((g) => (g.kind === "shape" && "negative" in g && g.negative ? { ...g, negative: undefined } as Given : g)) },
    { id: "ignore", reading: "hollow shapes don't count", spec: mapGivens((g) => (g.kind === "shape" && "negative" in g && g.negative ? null : g)) },
  ],
  "panel:erasers": [
    { id: "optional", kind: "weaker", reading: "an eraser may have nothing to cancel", asp: swapText([ERASE, ERASE.replace(/^1 \{/, "0 {")]) },
    { id: "clears", reading: "an eraser clears its whole region", asp: swapText([ERASE, ""], [ERASE_LIVE, "erreg(R) :- er(E), inreg(E,R).\nlive(X) :- inreg(X,R), not er(X), not erreg(R)."]) },
    { id: "anything", reading: "an eraser cancels any one symbol, wrong or not", asp: swapText([ERASE, ERASE.replace("inreg(X,R), bad0(X);", "inreg(X,R), not er(X);")]) },
  ],
  // erasers with dots: only a dot off the line sits in a region, so "clears it all" and "any
  // symbol" read the same as the rule; what's left to get wrong is whether it must cancel at all
  "panel:erasers-dots": [
    { id: "optional", kind: "weaker", reading: "an eraser may have nothing to cancel", asp: swapText([ERASE, ERASE.replace(/^1 \{/, "0 {")]) },
  ],
  "panel:mirrors": [
    { id: "turn", reading: "the second line is the first turned halfway round", spec: symmetry("turn") },
    { id: "up-down", reading: "the lines mirror top to bottom", spec: symmetry("up-down") },
    { id: "one", reading: "only one line needs drawing", spec: symmetry(null) },
  ],
  "panel:turns": [
    { id: "mirror", reading: "the second line is the first's mirror image", spec: symmetry("left-right") },
    { id: "up-down", reading: "the lines mirror top to bottom", spec: symmetry("up-down") },
    { id: "one", reading: "only one line needs drawing", spec: symmetry(null) },
  ],

  // ---- Panes rules ----
  "panes:twins": [
    { id: "joins", reading: "the mark joins its two cells", asp: swapText([":- tw(R,R).\n:- tw(R1,R2), not same(R1,R2).", ":- tw(R1,R2), R1 != R2."]) },
    { id: "splits", kind: "weaker", reading: "the mark only splits its two cells", asp: swapText([":- tw(R1,R2), not same(R1,R2).", ""]) },
  ],
  "panes:opposites": [
    { id: "same", reading: "the mark asks for the same shape", asp: swapText([":- op(R1,R2), same(R1,R2).", ":- op(R1,R2), not same(R1,R2)."]) },
    { id: "splits", reading: "the mark only splits its two cells", asp: swapText([":- op(R1,R2), same(R1,R2).", ""]) },
    { id: "joins", reading: "the mark joins its two cells", asp: swapText([":- op(R,R).\n:- op(R1,R2), same(R1,R2).", ":- op(R1,R2), R1 != R2."]) },
  ],
  "panes:compass": [
    { id: "straight", reading: "the numbers count straight out from it", asp: swapText([/(RJ [<>] RI)\}/g, "$1, CJ = CI}"], [/(CJ [<>] CI)\}/g, "$1, RJ = RI}"]) },
    { id: "board", reading: "the numbers count every cell that way, in any pane", asp: swapText([/member\(R,J\), row\(J,RJ\)/g, "cell(J), row(J,RJ)"]) },
  ],

  // ---- Sudoku ----
  sudoku: [
    { id: "no-boxes", reading: "only rows and columns", drop: ["boxes"] },
    { id: "no-columns", kind: "weaker", reading: "only rows and boxes", asp: swapText([":- digit(I,D), digit(J,D), col(I,C), col(J,C), I < J.", ""]) },
    { id: "boxes-only", reading: "only the boxes", drop: ["latin"] },
  ],
  "thermo-sudoku": [
    { id: "steps", kind: "stricter", reading: "digits go up by one along a thermometer", asp: swapText([/digit\((\d+),X\), digit\((\d+),Y\), Y <= X\./g, "digit($1,X), digit($2,Y), Y != X+1."]) },
    { id: "falls", reading: "digits fall from the bulb", asp: swapText([/digit\((\d+),X\), digit\((\d+),Y\), Y <= X\./g, "digit($1,X), digit($2,Y), Y >= X."]) },
    { id: "differ", kind: "weaker", reading: "digits on a thermometer just differ", asp: swapText([/digit\((\d+),X\), digit\((\d+),Y\), Y <= X\./g, "digit($1,X), digit($2,Y), Y = X."]) },
  ],
  "irregular-sudoku": [
    { id: "squares", reading: "the boxes are the usual squares", spec: (s) => ({ ...s, areas: undefined }) },
    { id: "no-areas", reading: "only rows and columns", drop: ["boxes"] },
  ],

  // ---- the other types: their own rules, read wrong ----
  minesweeper: [
    { id: "four", reading: "a number counts the four cells beside it", swap: { "mine-count": { rule: "adjacent-count" } } },
  ],
  "simple-loop": [
    { id: "skip", kind: "weaker", reading: "the loop may skip cells", swap: { loop: { rule: "loop", of: "loop" } } },
    { id: "loops", kind: "weaker", reading: "several loops will do", asp: swapText([LOOP_ONE, ""]) },
  ],
  "simple-path": [
    { id: "skip", kind: "weaker", reading: "the path may skip cells", swap: { path: { rule: "path" } } },
  ],
  numberlink: [
    { id: "skip", kind: "weaker", reading: "cells may stay empty", swap: { links: { rule: "links" } } },
    { id: "any-pair", kind: "weaker", reading: "any number may join any other", asp: swapText([":- lab(I,V), lab(I,W), V < W.", ""]) },
  ],
  nonogram: [
    { id: "totals", reading: "a number counts the shaded cells in its line", drop: ["runs"], extra: (p) => (["row", "col"] as const).flatMap((kind) => [...(kind === "row" ? p.rowRuns : p.colRuns)].map(([i, clue]) =>
      `${lineCells(p, kind, i).map((c) => `tl(${kind === "row" ? 0 : 1},${i},${c}).`).join(" ")}\n:- #count{I: shaded(I), tl(${kind === "row" ? 0 : 1},${i},I)} != ${clue.reduce((a, b) => a + b, 0)}.`)).join("\n") },
  ],
  shikaku: [
    { id: "any-shape", reading: "pieces needn't be rectangles", drop: ["rectangles"] },
    { id: "numberless", reading: "some pieces have no number", drop: ["one-each"] },
  ],
  "binary-puzzle": [
    { id: "threes", reading: "three in a row is fine", drop: ["no-three-in-a-row"] },
    { id: "repeats", reading: "two rows may be the same", drop: ["unique-lines"] },
    { id: "shares", reading: "rows needn't be half and half", drop: ["line-shares"] },
  ],
  "abstract-art": [
    { id: "whole", reading: "the whole grid is half and half, not each line", drop: ["line-shares"], extra: (p) => `:- #count{I: paint(I,1)} != ${p.grid.cellCount / 2}.` },
    { id: "rows", kind: "weaker", reading: "only the rows are half and half", asp: (prog, p) => prog.replace(/^:- #count\{I: sl\((\d+),I\), paint\(I,\d+\)\} != \d+\.$/gm, (m, k) => (Number(k) >= p.grid.rows ? "" : m)) },
  ],
  "abstract-art:thirds": [
    { id: "halves", reading: "each line is half and half", swap: { "line-shares": { rule: "line-shares", parts: [1, 1] } } },
    { id: "whole", reading: "a third of the whole grid, not of each line", drop: ["line-shares"], extra: (p) => `:- #count{I: paint(I,1)} != ${p.grid.cellCount / 3}.` },
  ],
  akari: [
    { id: "shine", kind: "weaker", reading: "bulbs may shine on each other", asp: swapText([":- shaded(I), shaded(J), sees(I,J), I < J.", ""]) },
    { id: "diagonal", reading: "a number counts diagonal bulbs too", swap: { "adjacent-count": { rule: "mine-count" } } },
  ],
  "akari:cipher": [
    { id: "alphabet", reading: "A is 1, B is 2, and so on", extra: () => ":- ltr(L), not lval(L,L+1)." },
    { id: "share", kind: "weaker", reading: "two letters may stand for the same number", asp: swapText([":- lval(L,N), lval(M,N), L < M.", ""]) },
  ],
  hitori: [
    { id: "touch", reading: "shaded cells may touch", drop: ["no-adjacent"] },
    { id: "split", reading: "the white cells may split up", drop: ["unshaded-connected"] },
  ],
  nurikabe: [
    { id: "pools", reading: "a 2×2 of wall is fine", drop: ["no-pool"] },
    { id: "split", reading: "the wall may split up", drop: ["connected"] },
    { id: "numberless", reading: "an island may have no number", drop: ["one-each"] },
  ],
  slitherlink: [
    { id: "corners", reading: "a number counts the corners the loop passes", asp: swapText([/^:- (\d+) != #count\{B: fence\(B\), cb\((\d+),B\)\}\.$/gm, ":- $1 != #count{V: slv(V), slc($2,V)}."]), extra: () => "slv(V) :- fence(B), vb(V,B).\nslc(I,V) :- cb(I,B), vb(V,B)." },
    { id: "loops", reading: "several loops will do", asp: swapText([LOOP_ONE, ""]) },
  ],
  masyu: [
    { id: "neighbours", kind: "weaker", reading: "white goes straight and black turns, nothing more", asp: swapText([":- black(I), go(I,D), nb(I,D,J,_), not go(J,D).", ""], [":- white(I), go(I,D), nb(I,D,J,_), go(I,E), nb(I,E,K,_), D < E, straight(J), straight(K).", ""]) },
    { id: "on-loop", kind: "weaker", reading: "pearls only sit on the loop", asp: swapText([":- black(I), straight(I).", ""], [":- black(I), go(I,D), nb(I,D,J,_), not go(J,D).", ""], [":- white(I), not straight(I).", ":- white(I), not onl(I)."], [":- white(I), go(I,D), nb(I,D,J,_), go(I,E), nb(I,E,K,_), D < E, straight(J), straight(K).", ""]) },
  ],
  skyscrapers: [
    { id: "first", reading: "the number is the first height you meet", spec: mapGivens((g) => (g.kind === "skyscraper" ? { ...g, kind: "first" } as Given : g)), swap: { skyscrapers: { rule: "first-seen" } } },
    { id: "repeats", reading: "a height may repeat in a line", drop: ["latin"] },
  ],
  "easy-as-abc": [
    { id: "first-cell", reading: "the letter outside is in the first cell", drop: ["first-seen"], extra: (p) => p.edgeClues.filter((c) => c.kind === "first").map((c) => `:- not digit(${rayIn(p, c.cell, c.side)[0]},${c.value}).`).join("\n") },
    { id: "full", kind: "stricter", reading: "every cell gets a letter", extra: () => ":- cell(I), not digit(I,_)." },
  ],
  "star-battle": [
    { id: "corners", kind: "weaker", reading: "stars may touch at a corner", swap: { "no-touch": { rule: "no-adjacent" } } },
    { id: "areas", reading: "the outlined areas don't matter", drop: ["shaded-per-area"] },
  ],
  "square-jam": [
    { id: "four", reading: "four squares may meet at a point", drop: ["no-four-corners"] },
    { id: "area", reading: "the number is the square's area", swap: { "side-clue": { rule: "size-clue" } } },
  ],
  aquarium: [
    { id: "level", reading: "water needn't settle level", drop: ["water"] },
    { id: "full", kind: "stricter", reading: "a tank is full or empty", extra: () => ":- inarea(I,A), inarea(J,A), shaded(I), not shaded(J)." },
  ],
  cave: [
    { id: "self", reading: "a number doesn't count its own cell", asp: swapText([/#count\{J: see\((\d+),J\)\} != (\d+)\./g, (_m, i, n) => `#count{J: see(${i},J)} != ${Number(n) + 1}.`]) },
    { id: "edge", reading: "the shaded cells needn't reach the edge", drop: ["shaded-to-edge"] },
    { id: "split", reading: "the cave may come in pieces", drop: ["unshaded-connected"] },
  ],
  "spiral-galaxies": [
    { id: "any-shape", kind: "weaker", reading: "a region only has to hold its circle", asp: swapText([":- gal(I,G), nomir(I,G).", ""], [":- gal(I,G), mir(I,G,J), not gal(J,G).", ""]) },
  ],
  fillomino: [
    { id: "touch", reading: "regions of one size may touch", drop: ["neighbors-differ-size"] },
    { id: "numbered", kind: "stricter", reading: "every region has a number in it", add: [{ rule: "one-each", of: "number" }] },
  ],
  "fillomino:sizes": [
    { id: "any-size", reading: "regions may be any size", drop: ["allowed-sizes"] },
    { id: "touch", reading: "regions of one size may touch", drop: ["neighbors-differ-size"] },
  ],
  "sum-blobs": [
    { id: "at-most", kind: "weaker", reading: "a blob adds up to at most the target", asp: swapText([/#sum\{V,I: member\(R,I\), rsv\(I,V\)\} != (\d+)\./g, "#sum{V,I: member(R,I), rsv(I,V)} > $1."]) },
  ],
  hidoku: [
    { id: "sides", kind: "stricter", reading: "a number touches the next at a side only", swap: { "number-path": { rule: "number-path" } } },
  ],
  "hidoku:sides": [
    { id: "corners", kind: "weaker", reading: "a corner is enough", swap: { "number-path": { rule: "number-path", diagonals: true } } },
  ],
  "honeycomb-paths": [
    { id: "skip", kind: "weaker", reading: "a number touches the next or the one after", asp: swapText([/#count\{J: pn\(I,J\), digit\(J,D\+1\)\} = 0\./g, "#count{J: pn(I,J), digit(J,D+1); J: pn(I,J), digit(J,D+2)} = 0."]) },
  ],
  hive: [
    { id: "differ", kind: "weaker", reading: "a number just differs from its neighbours", asp: swapText([":- digit(I,D), d(E), E < D, not mhas(I,E).", ""]) },
  ],
  "fill-in": [
    { id: "backwards", kind: "weaker", reading: "a number may read backwards", asp: swapText(
      ["digit(I,D) :- put(E,S), scell(S,K,I), edig(E,K,D).", "{ rev(E) } :- ent(E,_).\ndigit(I,D) :- put(E,S), not rev(E), scell(S,K,I), edig(E,K,D).\ndigit(I,D) :- put(E,S), rev(E), slot(S,L), scell(S,K,I), edig(E,L-1-K,D)."],
      [":- put(E,S), scell(S,K,I), edig(E,K,D), not digit(I,D).", ":- put(E,S), not rev(E), scell(S,K,I), edig(E,K,D), not digit(I,D).\n:- put(E,S), rev(E), slot(S,L), scell(S,K,I), edig(E,L-1-K,D), not digit(I,D)."]) },
  ],
  "polyomino-packing": [
    { id: "repeat", kind: "weaker", reading: "a piece may be used more than once", swap: { "shape-bank": { rule: "shape-bank" } } },
  ],
  "connect-the-critters": [
    { id: "apart", reading: "the pieces needn't join up", drop: ["connected"] },
    { id: "cover", reading: "the critters needn't be covered", drop: ["cover-symbols"] },
  ],
  "connect-the-critters:flip": [
    { id: "no-flip", kind: "stricter", reading: "pieces only turn", swap: { pieces: { rule: "pieces" } } },
    { id: "apart", reading: "the pieces needn't join up", drop: ["connected"] },
  ],
  "find-the-cut-line": [
    { id: "mirror", kind: "stricter", reading: "each piece is a mirror image of itself", swap: { "symmetric-regions": { rule: "symmetric-regions", symmetry: "mirror" } } },
    { id: "size", reading: "the pieces just need the same size", drop: ["symmetric-regions"], extra: () => ":- size(R,N), size(S,M), N != M." },
  ],
  "find-the-cut-line:mirror": [
    { id: "turn", reading: "each piece looks the same turned halfway round", swap: { "symmetric-regions": { rule: "symmetric-regions", symmetry: "turn" } } },
    { id: "any", kind: "weaker", reading: "any symmetry will do", swap: { "symmetric-regions": { rule: "symmetric-regions" } } },
  ],
  "wittgenstein-briquet": [
    { id: "split", reading: "the white cells may split up", drop: ["unshaded-connected"] },
    { id: "diagonal", reading: "a number counts diagonal cells too", swap: { "adjacent-count": { rule: "mine-count" } } },
  ],
  "pythagorean-paths": [
    { id: "queen", kind: "stricter", reading: "segments run only along rows, columns and diagonals", swap: { "distance-path": { rule: "distance-path", moves: "queen" } } },
  ],
  "abstract-art:no-three": [
    { id: "threes", reading: "three in a row is fine", drop: ["no-three-in-a-row"] },
  ],
};

/** A rival's relation to the true rule (see Rival.kind). */
export const rivalKind = (r: Rival): "weaker" | "stricter" | "other" =>
  r.kind ?? (r.drop && !r.swap && !r.add && !r.asp && !r.extra && !r.spec ? "weaker" : (r.add || r.extra) && !r.drop && !r.swap && !r.asp && !r.spec ? "stricter" : "other");

// ---- reading a puzzle under a rival ----

/** The rival's program for a puzzle, or null when the rival doesn't apply to it (its rewrite
 *  finds nothing to change). */
export function rivalProgram(spec: GridSpec, r: Rival): { prog: string; p: Puzzle } | null {
  const s = r.spec ? r.spec(structuredClone(spec)) : spec;
  // a change of spec that changes nothing (no clues to take away) doesn't apply
  const norm = (x: GridSpec) => JSON.stringify({ ...x, givens: x.givens ?? [] });
  if (r.spec && !r.drop && !r.swap && !r.add && !r.asp && !r.extra && norm(s) === norm(spec)) return null;
  let p: Puzzle;
  try { p = makePuzzle(s); } catch { return { prog: ":- .", p: makePuzzle(spec) }; }   // not a puzzle read that way: no answer
  let rules = p.rules;
  if (r.drop) { const before = rules.length; rules = rules.filter((x) => !r.drop!.includes(x.rule)); if (rules.length === before && !r.extra) return null; }
  if (r.swap) rules = rules.map((x) => r.swap![x.rule] ?? x);
  if (r.add) rules = [...rules, ...r.add];
  p = { ...p, rules };
  let prog = program(p);
  if (r.asp) { const next = r.asp(prog, p); if (next === prog) return null; prog = next; }
  if (r.extra) prog += `\n${r.extra(p)}`;
  return { prog, p };
}

/** A board as a key: the marks a solver's answer is made of. */
export const boardKey = (b: Board) => [...[b.fence, b.loop, b.shade, b.cut].map((a) => [...a].map((x) => (x === 1 ? 1 : 0)).join("")), [...b.color].join(","), [...b.digit].join(",")].join("|");

/** Up to `limit` answers of a program (no checks: a rival's answers break the true rules). */
export async function answers(prog: string, p: Puzzle, limit = 2): Promise<Board[]> {
  const clingo = await import("clingo-wasm");
  const res = (await clingo.run(prog, limit, ["--project=show"])) as { Result: string; Error?: string; Call?: { Witnesses?: { Value: string[] }[] }[] };
  if (res.Result === "ERROR") throw new Error(`clingo: ${res.Error}`);
  return (res.Call?.[0]?.Witnesses ?? []).map((w) => boardOf(p, w.Value));
}

export interface RivalVerdict {
  id: string; reading: string; broken: boolean; applies: boolean; why: string;
  /** read this way, the true answer still holds */
  acceptsTruth?: boolean;
  /** read this way, how many answers (at most 2) */
  count?: number;
}

/** The program's constraints that pin a board's marks (the puzzle's own kinds of mark). */
export function pinned(p: Puzzle, b: Board): string {
  const out: string[] = [], g = p.grid;
  if (p.marks.includes("fence")) g.borders.forEach((e) => out.push(b.fence[e.id] === 1 ? `:- not fence(${e.id}).` : `:- fence(${e.id}).`));
  if (p.marks.includes("loop")) g.links.forEach((l) => out.push(b.loop[l.id] === 1 ? `:- not line(${l.id}).` : `:- line(${l.id}).`));
  if (p.marks.includes("shade")) for (let i = 0; i < g.cellCount; i++) out.push(b.shade[i] === 1 ? `:- not shaded(${i}).` : `:- shaded(${i}).`);
  if (p.marks.includes("regions")) g.links.forEach((l) => out.push(b.cut[l.border] === 1 ? `:- not cut(${l.id}).` : `:- cut(${l.id}).`));
  if (p.marks.includes("digit")) for (let i = 0; i < g.cellCount; i++) out.push(b.digit[i] ? `:- not digit(${i},${b.digit[i]}).` : `:- digit(${i},_).`);
  if (p.marks.includes("paint")) for (let i = 0; i < g.cellCount; i++) if (b.color[i]) out.push(`:- not paint(${i},${b.color[i]}).`);
  return out.join("\n");
}

/** Does the post break this rival: read that way, no answer, a different one, or more than one? */
export async function breaks(spec: GridSpec, truth: Board[], r: Rival): Promise<RivalVerdict> {
  const rp = rivalProgram(spec, r);
  if (!rp) return { id: r.id, reading: r.reading, broken: false, applies: false, why: "doesn't apply" };
  const got = await answers(rp.prog, rp.p, 2);
  const want = new Set(truth.map(boardKey)), have = got.map(boardKey);
  const same = have.length === want.size && have.every((k) => want.has(k));
  const acceptsTruth = truth.length ? (await answers(`${rp.prog}\n${pinned(rp.p, truth[0])}`, rp.p, 1)).length > 0 : false;
  return { id: r.id, reading: r.reading, broken: !same, applies: true, acceptsTruth, count: got.length,
    why: !got.length ? "no answer that way" : same ? "the same answer that way" : have.length > 1 ? "more than one answer that way" : "a different answer that way" };
}
