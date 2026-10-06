// The building blocks (docs/grid-engine.md). Each block does four jobs: check a board,
// encode itself for the solver (answer set programming, see solve.ts for the shared
// predicates it can use), describe itself in plain words, and say which derived
// structures it needs. A puzzle's rules are blocks with settings, e.g. { rule: "size", is: 4 }.
import type { Board, Problem, Puzzle, RuleSpec } from "./types.ts";
import { lineGraph, shadedGroups, shapeKey, type Regions } from "./derive.ts";

export interface Block {
  /** plain words for the "How to play" card */
  describe(s: RuleSpec, p: Puzzle): string;
  /** problems on this board (none = the rule holds) */
  check(s: RuleSpec, p: Puzzle, b: Board, r: () => Regions): Problem[];
  /** clingo rules; may use the shared predicates from solve.ts */
  asp(s: RuleSpec, p: Puzzle): string;
  /** which shared encodings it needs */
  needs?: ("regions" | "shapes")[];
}

const numberClues = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) =>
  gs.filter((g) => g.kind === "number").map((g) => [i, g.value as number] as [number, number]));
const lineKind = (s: RuleSpec): "fence" | "loop" => (s.of === "loop" ? "loop" : "fence");

export const blocks: Record<string, Block> = {
  // ---- lines ----
  loop: {
    describe: (s) => s.cover
      ? "Draw one closed loop through the center of every open cell. It never branches or crosses itself."
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
${s.cover ? ":- cell(I), not clue(I), ldeg(I,N), N != 2." : ""}`;
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
    check(s, p, _b, r) {
      return r().cells.filter((cs) => !sizeOk(cs.length, s)).map((cs) => ({ message: blocks.size.describe(s, p), cells: cs }));
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
};

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
    const missing = Array.from({ length: p.grid.cellCount }, (_, i) => i).filter((i) => !p.cellGivens.has(i) && deg[i] !== 2);
    if (missing.length) return [{ message: "The loop must pass through every open cell.", cells: missing }];
  }
  return [];
}

export const blockFor = (s: RuleSpec): Block => {
  const block = blocks[s.rule];
  if (!block) throw new Error(`unknown rule "${s.rule}"`);
  return block;
};
