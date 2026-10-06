// The building blocks (docs/grid-engine.md). Each block does four jobs: check a board,
// encode itself for the solver (answer set programming, see solve.ts for the shared
// predicates it can use), describe itself in plain words, and say which derived
// structures it needs. A puzzle's rules are blocks with settings, e.g. { rule: "size", is: 4 }.
import type { Board, Problem, Puzzle, RuleSpec } from "./types.ts";
import { lineGraph, shadedGroups, shapeKey, type Regions } from "./derive.ts";

/** A nudge for the player: what to look at, and what it gives away. */
export interface Hint { message: string; area: number[]; cells: { cell: number; shade: 0 | 1 }[] }

export interface Block {
  /** plain words for the "How to play" card */
  describe(s: RuleSpec, p: Puzzle): string;
  /** problems on this board (none = the rule holds) */
  check(s: RuleSpec, p: Puzzle, b: Board, r: () => Regions): Problem[];
  /** clingo rules; may use the shared predicates from solve.ts */
  asp(s: RuleSpec, p: Puzzle): string;
  /** which shared encodings it needs */
  needs?: ("regions" | "shapes")[];
  /** an optional logical hint for the current board */
  hint?(s: RuleSpec, p: Puzzle, b: Board): Hint | null;
}

const numberClues = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) =>
  gs.filter((g) => g.kind === "number").map((g) => [i, g.value as number] as [number, number]));
const cornerClues = (p: Puzzle) => [...p.cornerGivens].flatMap(([v, gs]) =>
  gs.filter((g) => g.kind === "count").map((g) => [v, g.value as number] as [number, number]));
/** Each dotted cell with how many dots of each color it has. */
export const dotClues = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) => gs.filter((g) => g.kind === "dots").map((g) => {
  const need = new Map<number, number>();
  for (const c of g.value as number[]) need.set(c, (need.get(c) ?? 0) + 1);
  return [i, need] as [number, Map<number, number>];
}));
const neighbours = (p: Puzzle, i: number) => p.grid.cellLinks[i].map((l) => { const [a, c] = p.grid.links[l].cells; return a === i ? c : a; });
const PAINT_NAMES: Record<string, string> = { "#ef5a6a": "red", "#f7cf3d": "yellow", "#3fb0e6": "blue" };
/** A paint color's name: red / yellow / blue for Three Coats' pots, else "color n". */
export const colorName = (p: Puzzle, c: number) => PAINT_NAMES[(p.style.palette?.[c - 1] ?? ["#ef5a6a", "#f7cf3d", "#3fb0e6"][c - 1] ?? "").toLowerCase()] ?? `color ${c}`;
const colorList = (p: Puzzle) => {
  const names = Array.from({ length: p.style.palette?.length || 3 }, (_, k) => colorName(p, k + 1));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
};
/** color-count's settings: { red, yellow, blue } for Three Coats' pots, or { c1, c2, ... }. */
const countsOf = (s: RuleSpec, p: Puzzle) => Array.from({ length: p.style.palette?.length || 3 }, (_, k) => k + 1)
  .map((c) => [c, s[colorName(p, c)] ?? s[`c${c}`]] as [number, unknown]).filter(([, n]) => typeof n === "number") as [number, number][];
const lineKind = (s: RuleSpec): "fence" | "loop" => (s.of === "loop" ? "loop" : "fence");

export const blocks = {
  // ---- lines ----
  loop: {
    describe: (s, p) => s.cover
      ? `Draw one closed loop through the center of every ${p.blocked.size ? "white " : ""}cell. It goes straight or turns, never branches or crosses itself${p.blocked.size || p.walls.size ? ", and can't enter the dark cells or cross the thick walls" : ""}.`
      : "Draw one closed loop along the grid lines. It never branches or crosses itself.",
    check: (s, p, b) => checkLoop(p, b, lineKind(s), !!s.cover),
    asp: (s) => {
      const on = lineKind(s) === "fence" ? "fence" : "line", inc = lineKind(s) === "fence" ? "vb" : "lc";
      const node = lineKind(s) === "fence" ? "corner" : "cell";
      return `
ldeg(V,N) :- ${node}(V), N = #count{E: ${on}(E), ${inc}(V,E)}.
:- ldeg(V,N), N != 0, N != 2.
:- #count{E: ${on}(E)} = 0.
llit(V) :- ${on}(E), ${inc}(V,E).
llower(V) :- llit(V), llit(W), W < V.
lreach(V) :- llit(V), not llower(V).
lreach(W) :- lreach(V), ${on}(E), ${inc}(V,E), ${inc}(W,E).
:- llit(V), not lreach(V).
${s.cover ? ":- cell(I), not blocked(I), ldeg(I,N), N != 2." : ""}`;
    },
  },
  sides: {
    describe: () => "A number in a cell says how many of its four sides the loop runs along.",
    check(_s, p, b) {
      return numberClues(p).filter(([i, n]) => p.grid.cellBorders[i].filter((e) => b.fence[e] === 1).length !== n)
        .map(([i, n]) => ({ message: `This ${n} needs exactly ${n} side${n === 1 ? "" : "s"} of the loop.`, cells: [i] }));
    },
    asp: (_s, p) => numberClues(p).map(([i, n]) => `:- ${n} != #count{B: fence(B), cb(${i},B)}.`).join("\n"),
  },

  // ---- mazes ----
  "corner-count": {
    describe: () => "A number on a corner says how many walls touch it. The outside edge counts.",
    check(_s, p, b) {
      return cornerClues(p).filter(([v, n]) => p.grid.cornerBorders[v].filter((e) => b.fence[e] === 1).length !== n)
        .map(([v, n]) => ({ message: `This ${n} needs exactly ${n} wall${n === 1 ? "" : "s"} touching it.`, borders: p.grid.cornerBorders[v] }));
    },
    asp: (_s, p) => cornerClues(p).map(([v, n]) => `:- ${n} != #count{B: fence(B), vb(${v},B)}.`).join("\n"),
  },
  "perfect-maze": {
    describe: () => "Draw the walls of a maze. The outside edge is walled except the way in and the way out. Walls never close into a loop, and every wall joins the edge, so every square can be reached and there's only one way between any two.",
    check(_s, p, b) {
      const g = p.grid;
      const edge = g.borders.filter((e) => e.link < 0 && (b.fence[e.id] === 1) === p.doors.has(e.id)).map((e) => e.id);
      if (edge.length) return [{ message: "The outside edge is walled, except the way in and the way out.", borders: edge }];
      const given = [...p.walls].map((l) => g.links[l].border).filter((e) => b.fence[e] !== 1);
      if (given.length) return [{ message: "Keep the walls that were given.", borders: given }];
      // every square reachable: the open passages join all the cells
      const reached = new Set([0]), stack = [0];
      while (stack.length) {
        const i = stack.pop()!;
        for (const l of g.cellLinks[i]) {
          const { cells, border } = g.links[l], j = cells[0] === i ? cells[1] : cells[0];
          if (b.fence[border] !== 1 && !reached.has(j)) { reached.add(j); stack.push(j); }
        }
      }
      if (reached.size < g.cellCount) {
        const shut = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !reached.has(i));
        return [{ message: "Walls close in some squares: every square must be reachable.", cells: reached.size * 2 < g.cellCount ? [...reached] : shut }];
      }
      // no loop of passages: every wall is joined to the edge
      const root = Array.from({ length: g.cornerCount }, (_, v) => v);
      const find = (v: number): number => (root[v] === v ? v : (root[v] = find(root[v])));
      for (const e of g.borders) if (b.fence[e.id] === 1) root[find(e.corners[0])] = find(e.corners[1]);
      const onEdge = new Set(g.borders.filter((e) => e.link < 0).flatMap((e) => e.corners.map(find)));
      const loose = g.borders.filter((e) => b.fence[e.id] === 1 && !onEdge.has(find(e.corners[0]))).map((e) => e.id);
      if (loose.length) return [{ message: "Every wall must join the outside edge: these stand on their own, so there's more than one way around them.", borders: loose }];
      // a corner with no walls at all: the passages circle it
      const bare = Array.from({ length: g.cornerCount }, (_, v) => v).filter((v) => !onEdge.has(find(v)));
      if (bare.length) {
        const around = (v: number) => { const [r, c] = g.cornerRC(v); return [g.cell(r - 1, c - 1), g.cell(r - 1, c), g.cell(r, c - 1), g.cell(r, c)]; };
        return [{ message: "There's a way around this point: a wall must run from it to the edge.", cells: around(bare[0]) }];
      }
      return [];
    },
    asp(_s, p) {
      const g = p.grid, out: string[] = [];
      for (const e of g.borders) if (e.link < 0) out.push(p.doors.has(e.id) ? `:- fence(${e.id}).` : `:- not fence(${e.id}).`);
      for (const l of p.walls) out.push(`:- not fence(${g.links[l].border}).`);
      for (const l of g.links) out.push(`mlb(${l.id},${l.border}).`);
      out.push(`
mopen(L) :- mlb(L,B), not fence(B).
mreach(0).
mreach(J) :- mreach(I), adj(I,J,L), mopen(L).
:- cell(I), not mreach(I).
:- #count{L: mopen(L)} != ${g.cellCount - 1}.`);
      return out.join("\n");
    },
  },

  // ---- painting (Three Coats) ----
  painted: {
    describe: (_s, p) => `Paint every ${p.figure ? "piece" : "cell"} ${colorList(p)}.`,
    check(_s, p, b) {
      const bare = Array.from({ length: p.grid.cellCount }, (_, i) => i).filter((i) => !b.color[i]);
      return bare.length ? [{ message: `Paint every ${p.figure ? "piece" : "cell"}.`, cells: bare }] : [];
    },
    asp: () => "",   // the paint choice already gives every cell exactly one color
  },
  "neighbor-dots": {
    describe: (_s, p) => `Each colored dot in a ${p.figure ? "piece" : "cell"} asks for a neighbour of that color: two ${colorName(p, 1)} dots mean at least two ${colorName(p, 1)} neighbours. Neighbours share an edge; touching at a corner doesn't count.`,
    check(_s, p, b) {
      return dotClues(p).flatMap(([i, need]) => {
        const short = [...need].filter(([c, k]) => neighbours(p, i).filter((j) => b.color[j] === c).length < k);
        return short.length ? [{ message: `This piece needs more ${short.map(([c]) => colorName(p, c)).join(" and ")} neighbours.`, cells: [i] }] : [];
      });
    },
    asp: (_s, p) => dotClues(p).flatMap(([i, need]) =>
      [...need].map(([c, k]) => `:- #count{J: adj(${i},J,_), paint(J,${c})} < ${k}.`)).join("\n"),
  },
  "color-count": {
    describe: (s, p) => `Paint exactly ${countsOf(s, p).map(([c, n]) => `${n} ${colorName(p, c)}`).join(", ")}.`,
    check(s, p, b) {
      const off = countsOf(s, p).filter(([c, n]) => [...b.color].filter((x) => x === c).length !== n);
      return off.length ? [{ message: `Paint exactly ${off.map(([c, n]) => `${n} ${colorName(p, c)}`).join(" and ")}.` }] : [];
    },
    asp: (s, p) => countsOf(s, p).map(([c, n]) => `:- #count{I: paint(I,${c})} != ${n}.`).join("\n"),
  },

  // ---- nonograms ----
  runs: {
    describe: () => "The numbers beside each row and above each column are the runs of shaded cells in that line, in order: \u201c3 1\u201d means a run of 3, a gap, then a run of 1.",
    check(_s, p, b) {
      const out: Problem[] = [];
      for (const [kind, map] of [["row", p.rowRuns], ["col", p.colRuns]] as const) for (const [i, clue] of map) {
        const cells = lineCells(p, kind, i);
        if (!sameRuns(runsOf(cells.map((c) => b.shade[c] === 1)), clue)) out.push({ message: `${kind === "row" ? "Row" : "Column"} ${i + 1} doesn't match its numbers.`, cells });
      }
      return out;
    },
    asp(_s, p) {
      const out: string[] = [];
      let line = 0;
      for (const [kind, map] of [["row", p.rowRuns], ["col", p.colRuns]] as const) for (const [i, clue] of map) {
        const cells = lineCells(p, kind, i), L = line++, n = cells.length;
        cells.forEach((c, pos) => out.push(`lcell(${L},${pos},${c}).`));
        const blocks = clue.filter((x) => x > 0);
        if (!blocks.length) { out.push(`:- lcell(${L},_,I), shaded(I).`); continue; }
        let lo = 0;
        const total = blocks.reduce((a, x) => a + x, 0) + blocks.length - 1;
        blocks.forEach((len, k) => {
          const hi = n - (total - lo);
          out.push(`blen(${L},${k},${len}). 1 { st(${L},${k},S) : S = ${lo}..${hi} } 1.`);
          if (k > 0) out.push(`:- st(${L},${k - 1},S), st(${L},${k},T), T < S + ${blocks[k - 1]} + 1.`);
          lo += len + 1;
        });
      }
      out.push("cov(L,P) :- st(L,K,S), blen(L,K,N), P = S..S+N-1.");
      out.push(":- lcell(L,P,I), shaded(I), not cov(L,P).\n:- lcell(L,P,I), cov(L,P), not shaded(I).");
      return out.join("\n");
    },
    hint(_s, p, b) {
      // the first line whose clue alone gives away cells the player hasn't marked yet
      for (const [kind, map] of [["row", p.rowRuns], ["col", p.colRuns]] as const) for (const [i, clue] of map) {
        const cells = lineCells(p, kind, i);
        const known = cells.map((c) => (b.shade[c] === 1 ? 1 : b.shade[c] === 2 ? 0 : -1));
        const res = solveLine(clue, known);
        if (!res) continue;
        const fresh = res.flatMap((v, j) => (v !== -1 && known[j] === -1 ? [{ cell: cells[j], shade: v as 0 | 1 }] : []));
        if (fresh.length) return { message: `${kind === "row" ? "Row" : "Column"} ${i + 1}: its numbers give these cells away.`, area: cells, cells: fresh };
      }
      return null;
    },
  },

  // ---- digits ----
  latin: {
    describe: (_s, p) => `Fill every cell with a digit from 1 to ${p.digits}. Each row and each column has every digit once.`,
    check(_s, p, b) {
      const g = p.grid, out: Problem[] = [];
      const empty = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !b.digit[i]);
      if (empty.length) out.push({ message: "Fill every cell.", cells: empty });
      for (const [kind, count] of [["row", g.rows], ["col", g.cols]] as const) for (let i = 0; i < count; i++) {
        const dup = duplicates(lineCells(p, kind, i), b);
        if (dup.length) out.push({ message: `A digit repeats in ${kind === "row" ? "row" : "column"} ${i + 1}.`, cells: dup });
      }
      return out;
    },
    asp: () => ":- digit(I,D), digit(J,D), row(I,R), row(J,R), I < J.\n:- digit(I,D), digit(J,D), col(I,C), col(J,C), I < J.",
  },
  boxes: {
    describe: (s, p) => { const [h, w] = boxSize(s, p); return `Each ${h}×${w} box (heavy lines) has every digit once.`; },
    check(s, p, b) {
      return boxesOf(s, p).map((cells) => duplicates(cells, b)).filter((d) => d.length)
        .map((cells) => ({ message: "A digit repeats in a box.", cells }));
    },
    asp: (s, p) => boxesOf(s, p).map((cells, k) => cells.map((i) => `box(${i},${k}).`).join(" ")).join("\n")
      + "\n:- digit(I,D), digit(J,D), box(I,B), box(J,B), I < J.",
  },

  // ---- shading ----
  connected: {
    describe: () => "All the shaded cells connect into one group (side to side, not at corners).",
    check(_s, p, b) {
      const groups = shadedGroups(p.grid, b);
      return groups.length > 1 ? [{ message: "The shaded cells must all connect.", cells: groups.slice(1).flat() }] : [];
    },
    asp: () => `
slower(I) :- shaded(I), shaded(J), J < I.
sreach(I) :- shaded(I), not slower(I).
sreach(J) :- sreach(I), adj(I,J,_), shaded(J).
:- shaded(I), not sreach(I).`,
  },
  "no-pool": {
    describe: () => "No 2×2 block of cells is all shaded.",
    check(_s, p, b) {
      const g = p.grid, out: Problem[] = [];
      for (let r = 0; r + 1 < g.rows; r++) for (let c = 0; c + 1 < g.cols; c++) {
        const q = [g.cell(r, c), g.cell(r, c + 1), g.cell(r + 1, c), g.cell(r + 1, c + 1)];
        if (q.every((i) => b.shade[i] === 1)) out.push({ message: "No 2×2 block can be all shaded.", cells: q });
      }
      return out;
    },
    asp: () => `:- quad(A,B,C,D), shaded(A), shaded(B), shaded(C), shaded(D).`,
  },

  // ---- regions (or a shading puzzle's islands) ----
  size: {
    describe: (s) => s.is !== undefined ? `Every region has exactly ${s.is} cells.`
      : s.min !== undefined && s.max !== undefined ? `Every region has ${s.min} to ${s.max} cells.`
      : s.min !== undefined ? `Every region has at least ${s.min} cells.` : `Every region has at most ${s.max} cells.`,
    check(s, p, _b, r): Problem[] {
      return r().cells.filter((cs) => !sizeOk(cs.length, s)).map((cs) => ({ message: blocks.size.describe(s), cells: cs }));
    },
    asp: (s) => [
      s.is !== undefined && `:- size(R,N), N != ${s.is}.`,
      s.min !== undefined && `:- size(R,N), N < ${s.min}.`,
      s.max !== undefined && `:- size(R,N), N > ${s.max}.`,
    ].filter(Boolean).join("\n"),
    needs: ["regions"],
  },
  "size-clue": {
    describe: (_s, p) => p.marks.includes("shade")
      ? "Each number sits in an island of unshaded cells with that many cells."
      : "A number tells how many cells its region has.",
    check(_s, p, _b, r) {
      const reg = r();
      return numberClues(p).filter(([i, n]) => reg.of[i] < 0 || reg.cells[reg.of[i]].length !== n)
        .map(([i, n]) => ({ message: `This ${n} needs a group of exactly ${n} cell${n === 1 ? "" : "s"}.`, cells: reg.of[i] < 0 ? [i] : reg.cells[reg.of[i]] }));
    },
    asp: (_s, p) => numberClues(p).map(([i, n]) => `:- member(R,${i}), size(R,M), M != ${n}.\n:- not open(${i}).`).join("\n"),
    needs: ["regions"],
  },
  "one-each": {
    describe: (s) => `Every ${s.of === "symbol" ? "region holds exactly one symbol" : "group holds exactly one number"}.`,
    check(s, p, _b, r) {
      const kind = (s.of as string) ?? "number";
      return r().cells.filter((cs) => cs.filter((i) => p.cellGivens.get(i)?.some((g) => g.kind === kind)).length !== 1)
        .map((cs) => ({ message: kind === "number" ? "Each group needs exactly one number." : "Each region needs exactly one symbol.", cells: cs }));
    },
    asp: (s, p) => {
      const kind = (s.of as string) ?? "number";
      const facts = [...p.cellGivens].filter(([, gs]) => gs.some((g) => g.kind === kind)).map(([i]) => `kclue(${i}).`).join(" ");
      return `${facts}\n:- root(R), #count{I: member(R,I), kclue(I)} != 1.`;
    },
    needs: ["regions"],
  },
  twins: {
    describe: () => "The two regions touching a ◆ are different regions with the same shape (turned or flipped is fine).",
    check: (_s, p, _b, r) => pairCheck(p, r(), "twins", true),
    asp: (_s, p) => pairFacts(p, "twins", "tw") + `
cmp(R1,R2) :- tw(R1,R2).
:- tw(R,R).
:- tw(R1,R2), not same(R1,R2).`,
    needs: ["regions", "shapes"],
  },
  opposites: {
    describe: () => "The two regions touching a ◇ are different regions with different shapes.",
    check: (_s, p, _b, r) => pairCheck(p, r(), "opposites", false),
    asp: (_s, p) => pairFacts(p, "opposites", "op") + `
cmp(R1,R2) :- op(R1,R2).
:- op(R,R).
:- op(R1,R2), same(R1,R2).`,
    needs: ["regions", "shapes"],
  },
  "all-different": {
    describe: () => "No two regions have the same shape (turned or flipped counts as the same).",
    check(_s, p, _b, r) {
      const seen = new Map<string, number[]>(), out: Problem[] = [];
      for (const cs of r().cells) {
        const k = shapeKey(p.grid, cs);
        if (seen.has(k)) out.push({ message: "Two regions have the same shape.", cells: [...seen.get(k)!, ...cs] });
        else seen.set(k, cs);
      }
      return out;
    },
    asp: () => `
ad(R1,R2) :- root(R1), root(R2), R1 < R2.
cmp(R1,R2) :- ad(R1,R2).
:- ad(R1,R2), same(R1,R2).`,
    needs: ["regions", "shapes"],
  },
  compass: {
    describe: () => "A compass counts the cells of its own region that lie north, east, south and west of it.",
    check(_s, p, _b, r) {
      const reg = r(), g = p.grid, out: Problem[] = [];
      for (const [i, gs] of p.cellGivens) for (const giv of gs) {
        if (giv.kind !== "compass") continue;
        const cs = reg.cells[reg.of[i]] ?? [], [r0, c0] = g.rc(i);
        const count = { n: 0, e: 0, s: 0, w: 0 };
        for (const j of cs) { const [r1, c1] = g.rc(j); if (r1 < r0) count.n++; if (r1 > r0) count.s++; if (c1 > c0) count.e++; if (c1 < c0) count.w++; }
        const v = giv.value as Record<string, number | undefined>;
        if ((["n", "e", "s", "w"] as const).some((d) => v[d] !== undefined && v[d] !== count[d]))
          out.push({ message: "This compass doesn't match its region.", cells: cs });
      }
      return out;
    },
    asp(_s, p) {
      const lines: string[] = [];
      for (const [i, gs] of p.cellGivens) for (const giv of gs) {
        if (giv.kind !== "compass") continue;
        const v = giv.value as Record<string, number | undefined>;
        const cmpd = { n: "RJ < RI", s: "RJ > RI", e: "CJ > CI", w: "CJ < CI" } as const;
        for (const d of ["n", "e", "s", "w"] as const) if (v[d] !== undefined)
          lines.push(`:- member(R,${i}), row(${i},RI), col(${i},CI), ${v[d]} != #count{J: member(R,J), row(J,RJ), col(J,CJ), ${cmpd[d]}}.`);
      }
      return lines.join("\n");
    },
    needs: ["regions"],
  },
} satisfies Record<string, Block>;

/** Every rule block's name. The visual editor (app/app/components/PuzzleEditor.tsx) and the sketch
 *  reader list them all, so the build fails if a new block isn't added there too. */
export type RuleName = keyof typeof blocks;
export const RULE_NAMES = Object.keys(blocks) as RuleName[];

/** the cells of row / column i, in order */
const lineCells = (p: Puzzle, kind: "row" | "col", i: number) =>
  kind === "row" ? Array.from({ length: p.grid.cols }, (_, c) => p.grid.cell(i, c)) : Array.from({ length: p.grid.rows }, (_, r) => p.grid.cell(r, i));
export const runsOf = (line: boolean[]) => { const out: number[] = []; let n = 0; for (const x of [...line, false]) { if (x) n++; else if (n) { out.push(n); n = 0; } } return out.length ? out : [0]; };
const sameRuns = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Every cell a line's clue forces (1 shaded, 0 empty, -1 open), given what's known; null if impossible. */
export function solveLine(clue: number[], known: number[]): number[] | null {
  const blocks = clue.filter((x) => x > 0), n = known.length;
  let acc: number[] | null = null;
  const place = (k: number, from: number, line: number[]) => {
    if (k === blocks.length) {
      for (let j = from; j < n; j++) if (known[j] === 1) return;
      const full = line.slice(); for (let j = from; j < n; j++) full[j] = 0;
      acc = acc ? acc.map((v, j) => (v === full[j] ? v : -1)) : full;
      return;
    }
    for (let s = from; s + blocks[k] <= n; s++) {
      if (known[s - 1] === 1 && s > from) break;   // can't skip a known shaded cell
      let ok = true;
      for (let j = from; j < s; j++) if (known[j] === 1) ok = false;
      for (let j = s; j < s + blocks[k]; j++) if (known[j] === 0) ok = false;
      if (s + blocks[k] < n && known[s + blocks[k]] === 1) ok = false;
      if (!ok) continue;
      const next = line.slice();
      for (let j = from; j < s; j++) next[j] = 0;
      for (let j = s; j < s + blocks[k]; j++) next[j] = 1;
      if (s + blocks[k] < n) next[s + blocks[k]] = 0;
      place(k + 1, s + blocks[k] + 1, next);
    }
  };
  place(0, 0, new Array(n).fill(0));
  return acc;
}

/** cells holding a digit that also appears elsewhere in the group */
function duplicates(cells: number[], b: Board) {
  return cells.filter((i) => b.digit[i] && cells.some((j) => j !== i && b.digit[j] === b.digit[i]));
}
const boxSize = (s: RuleSpec, p: Puzzle): [number, number] => {
  if (Array.isArray(s.box)) return s.box as [number, number];
  const n = p.digits, h = [3, 2, 1].find((x) => n % x === 0 && x * x <= n && n / x >= x) ?? 1;   // 9 -> 3x3, 6 -> 2x3, 4 -> 2x2
  return [h, n / h];
};
function boxesOf(s: RuleSpec, p: Puzzle): number[][] {
  const [h, w] = boxSize(s, p), g = p.grid, out: number[][] = [];
  for (let br = 0; br < g.rows; br += h) for (let bc = 0; bc < g.cols; bc += w) {
    const cells: number[] = [];
    for (let r = br; r < br + h && r < g.rows; r++) for (let c = bc; c < bc + w && c < g.cols; c++) cells.push(g.cell(r, c));
    out.push(cells);
  }
  return out;
}
export const boxLines = (s: RuleSpec, p: Puzzle) => boxSize(s, p);

function sizeOk(n: number, s: RuleSpec) {
  return (s.is === undefined || n === s.is) && (s.min === undefined || n >= (s.min as number)) && (s.max === undefined || n <= (s.max as number));
}

/** twins / opposites: the regions on the two sides of each marked border */
function pairCheck(p: Puzzle, reg: Regions, kind: "twins" | "opposites", same: boolean): Problem[] {
  const out: Problem[] = [];
  for (const [e, gs] of p.borderGivens) {
    if (!gs.some((g) => g.kind === kind)) continue;
    const [a, c] = p.grid.borders[e].cells, ra = reg.of[a], rc = reg.of[c];
    const bad = ra === rc || (shapeKey(p.grid, reg.cells[ra]) === shapeKey(p.grid, reg.cells[rc])) !== same;
    if (bad) out.push({ message: same ? "The regions at a ◆ must be different regions with the same shape." : "The regions at a ◇ must be different regions with different shapes.", borders: [e], cells: [...reg.cells[ra], ...(ra === rc ? [] : reg.cells[rc])] });
  }
  return out;
}

function pairFacts(p: Puzzle, kind: string, pred: string) {
  const out: string[] = [];
  for (const [e, gs] of p.borderGivens) {
    if (!gs.some((g) => g.kind === kind)) continue;
    const [a, c] = p.grid.borders[e].cells;
    out.push(`${pred}(R1,R2) :- member(R1,${a}), member(R2,${c}).`);
  }
  return out.join("\n");
}

function checkLoop(p: Puzzle, b: Board, kind: "fence" | "loop", cover: boolean): Problem[] {
  const { edges, deg } = lineGraph(p, b, kind);
  const key = kind === "fence" ? "borders" : "links";
  if (!edges.length) return [{ message: "Draw the loop." }];
  if (kind === "loop") {
    const bad = edges.filter(([a, c, id]) => p.walls.has(id) || p.blocked.has(a) || p.blocked.has(c)).map(([, , id]) => id);
    if (bad.length) return [{ message: "The loop can't cross a wall or enter a dark cell.", links: bad }];
  }
  const branch = deg.map((d, v) => [d, v]).filter(([d]) => d !== 0 && d !== 2).map(([, v]) => v);
  if (branch.length) {
    const bad = edges.filter(([a, c]) => branch.includes(a) || branch.includes(c)).map(([, , id]) => id);
    return [{ message: "The loop can't branch or stop: every point on it joins exactly two lines.", [key]: bad }];
  }
  // one loop, not several
  const adj = new Map<number, number[]>();
  for (const [a, c] of edges) { adj.set(a, [...(adj.get(a) ?? []), c]); adj.set(c, [...(adj.get(c) ?? []), a]); }
  const start = edges[0][0], seen = new Set([start]), stack = [start];
  while (stack.length) for (const n of adj.get(stack.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  if (seen.size !== adj.size) return [{ message: "Make one loop, not several.", [key]: edges.filter(([a]) => !seen.has(a)).map(([, , id]) => id) }];
  if (cover) {
    const missing = Array.from({ length: p.grid.cellCount }, (_, i) => i).filter((i) => !p.blocked.has(i) && deg[i] !== 2);
    if (missing.length) return [{ message: "The loop must pass through every open cell.", cells: missing }];
  }
  return [];
}

export const blockFor = (s: RuleSpec): Block => {
  const block = (blocks as Record<string, Block>)[s.rule];
  if (!block) throw new Error(`unknown rule "${s.rule}"`);
  return block;
};
