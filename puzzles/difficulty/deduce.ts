// The deduction solver ("instrument D" in docs/research-interestingness.md): solves a grid puzzle
// step by step, roughly as a person would, and says how hard each step was to see.
//
// It works on the engine's own encoding (src/engine/encode.ts), ground once by clingo. Every
// ground constraint touches some cells (its footprint: the cells of the marks it mentions,
// directly or through helper atoms) and belongs to a rule instance (a "group": a rule applied to
// one row, box, area or clue, or to the whole grid). A *window* is a set of cells; its program
// keeps the constraints inside it plus whatever defines their atoms. Dropping constraints only
// relaxes the puzzle, so what holds in every answer of a window's program (clingo's cautious
// consequences), given what's known, is a sound deduction.
//
// Finding facts (cheapest first; the tiers only find candidates):
//   0  one window: a row, column, box or area, a 3×3 neighbourhood, one clue's own footprint
//   1  two overlapping tier-0 windows (a box and a row: Sudoku's pointing pairs)
//   2  a case split on the whole board: assume a mark the other way, and propagation alone
//      contradicts it (clingo: unsatisfiable with zero choices)
//   3  search: the fact needing the fewest conflicts to prove
//
// Costing them (Bogaerts, Gamba, Guns and Claes, "Step-wise explanations of constraint
// satisfaction problems", ECAI 2020): each fact's explanation is a subset-minimal set of rule
// instances and earlier facts that entails it, found by deletion in a Lua script inside clingo.
// A step's cost counts the distinct rule and clue kinds, the instances and the earlier facts
// (costOf). Each round takes the cheapest steps; the profile combines step costs by soft-max
// (softmax) and adds rule load (estimateOf).
import { makePuzzle, genres } from "../../src/engine/puzzle.ts";
import { program } from "../../src/engine/encode.ts";
import { blockFor } from "../../src/engine/rules.ts";
import type { Given, GridSpec, Puzzle } from "../../src/engine/types.ts";
import { outputLine, parseAspif, ruleLine, type Ground, type Rule } from "./aspif.ts";
import { clingoJson, clingoRaw, ground, loadClingo } from "./clingo.ts";

export type Tier = 0 | 1 | 2 | 3;

export interface Fact { mark: string; value: boolean; text: string }

export interface Step {
  tier: Tier;
  /** what was looked at: "row 3", "box 2 + row 3", "assume r2c4 shaded", ... */
  where: string;
  cells: number[];
  facts: Fact[];
  /** the rule blocks (and clue kinds) the window holds */
  uses: string[];
  /** a free choice (a puzzle with several answers, where nothing more is forced) */
  choice?: boolean;
  /** how hard it was to see: the size of its smallest explanation (see costOf) */
  cost: number;
  /** that explanation: the rule instances, the kinds held in mind, the earlier facts used */
  because?: { clues: string[]; kinds: string[]; facts: number; capped: boolean };
}

export interface Profile {
  solved: boolean;
  steps: number;
  hardestTier: Tier;
  perTier: [number, number, number, number];
  /** tier-0 steps available at the start */
  entryPoints: number;
  /** the longest run of consecutive hard steps (cost 5 or more) */
  hardStretch: number;
  /** the costliest step's explanation cost */
  maxCost: number;
  /** steps per cost band (BANDS) */
  bands: Record<string, number>;
  /** the steps' costs combined by soft-max (see softmax, SOFTMAX_K) */
  dSteps: number;
  totalCost: number;
  /** distinct rules and clue kinds the solve used */
  ruleLoad: number;
  ruleItems: string[];
  /** facts (marks settled) */
  facts: number;
  rounds: number;
  ms: number;
  clingoCalls: number;
  /** caps hit, unsupported parts */
  notes: string[];
  /** 0 (trivial) .. 1 (very hard): see estimateOf */
  estimate: number;
}

export interface Options {
  /** stop deducing after this long (the profile says so; default 20 s) */
  budgetMs?: number;
  /** tier-1 windows at most (smallest first) */
  maxPairWindows?: number;
  /** marks tried as tier-2 case splits per clingo call (most constrained first) */
  maxSplits?: number;
  /** tier-3 candidates compared per round */
  maxDeep?: number;
}

/** clingo's conflict limits: a case split (tier 2) must need no search at all; tier 3's search is capped */
const SPLIT_LIMIT = 50, DEEP_LIMIT = 3000;
/** Step cost = 1 per distinct rule or clue kind held in mind + GROUP_COST per rule instance (a
 *  row, a box, a clue) + FACT_COST per earlier fact used + a case split's surcharge. */
export const GROUP_COST = 0.5, FACT_COST = 0.2, TIER_COST = [0, 0, 2, 4] as const;
/** Each round takes every step within SLACK of the cheapest. */
const SLACK = 1;
/** clingo solves allowed per explanation (deletion stops there, keeping a larger set) */
const MUS_SOLVES = 400;

const MARK = /^(shaded|digit|paint|line|cut|fence)\((\d+)(?:,(\d+))?\)$/;

// ---------- bit sets over cells ----------
type Bits = Uint32Array;
const bitsOf = (n: number, cells: Iterable<number>) => { const b = new Uint32Array((n + 31) >>> 5); for (const c of cells) b[c >>> 5] |= 1 << (c & 31); return b; };
const subset = (a: Bits, b: Bits) => { for (let k = 0; k < a.length; k++) if ((a[k] & ~b[k]) !== 0) return false; return true; };
const orInto = (a: Bits, b: Bits) => { let changed = false; for (let k = 0; k < a.length; k++) { const v = (a[k] | b[k]) >>> 0; if (v !== a[k]) { a[k] = v; changed = true; } } return changed; };
const cellsOf = (b: Bits) => { const out: number[] = []; for (let k = 0; k < b.length; k++) { let w = b[k]; while (w) { const t = w & -w; out.push((k << 5) + 31 - Math.clz32(t)); w ^= t; } } return out; };

interface Window { label: string; cells: number[]; bits: Bits; size: number }

/** The engine's program with every rule of a rule block tagged by an external atom rbk(K), so
 *  the ground rules can be traced back to their block. */
function taggedProgram(p: Puzzle): string {
  let prog = program(p), from = 0;
  p.rules.forEach((s, k) => {
    const text = `% ${s.rule}\n${blockFor(s).asp(s, p)}`;
    const at = prog.indexOf(text, from);
    if (at < 0) return;   // not found (shouldn't happen): left untagged
    const tagged = `% ${s.rule}\n${tagRules(blockFor(s).asp(s, p), k)}`;
    prog = prog.slice(0, at) + tagged + prog.slice(at + text.length);
    from = at + tagged.length;
  });
  return `${prog}\n#external rbk(0..${Math.max(0, p.rules.length - 1)}).\n#show rbk/1.`;
}

/** Add `rbk(k)` to the body of every rule in an ASP text (facts and directives stay). */
export function tagRules(asp: string, k: number): string {
  const text = asp.replace(/%[^\n]*/g, "");
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (ch === "." && depth === 0 && text[i + 1] !== "." && text[i - 1] !== "." && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      out.push(text.slice(start, i).trim()); start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean).map((st) => {
    if (st.startsWith("#")) return `${st}.`;
    const neck = topLevelNeck(st);
    if (neck >= 0) return `${st}; rbk(${k}).`;
    return st.includes("{") ? `${st} :- rbk(${k}).` : `${st}.`;
  }).join("\n");
}
function topLevelNeck(st: string) {
  let depth = 0;
  for (let i = 0; i + 1 < st.length; i++) {
    const ch = st[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (ch === ":" && st[i + 1] === "-" && depth === 0) return i;
  }
  return -1;
}

/** The cells a given touches (for counting the clue kinds a step used). */
function givenCells(p: Puzzle, g: Given): number[] {
  const G = p.grid, inside = (r: number, c: number) => r >= 0 && c >= 0 && r < G.rows && c < G.cols;
  const cell = (r: number, c: number) => (inside(r, c) ? [G.cell(r, c)] : []);
  switch (g.at) {
    case "cell": case "edge": return cell(g.cell[0], g.cell[1]);
    case "cells": return g.cells.flatMap(([r, c]) => cell(r, c));
    case "border": return g.cells.flatMap(([r, c]) => cell(r, c));
    case "corner": { const [r, c] = g.corner; return [...cell(r - 1, c - 1), ...cell(r - 1, c), ...cell(r, c - 1), ...cell(r, c)]; }
    case "line": return g.corners.flatMap(([r, c]) => [...cell(r - 1, c - 1), ...cell(r - 1, c), ...cell(r, c - 1), ...cell(r, c)]);
    case "row": return Array.from({ length: G.cols }, (_, c) => G.cell(g.index, c));
    case "col": return Array.from({ length: G.rows }, (_, r) => G.cell(r, g.index));
    case "point": { const [y, x] = g.point; return [...cell(Math.floor((y - 1) / 2), Math.floor((x - 1) / 2)), ...cell(Math.ceil((y - 1) / 2), Math.ceil((x - 1) / 2))]; }
    default: return [];
  }
}
/** Clue kinds that are structure rather than something to reason with. */
const STRUCTURE = new Set(["start", "end", "block", "gap", "wall", "door", "bank", "lengths", "peg"]);

/** Solve `spec` step by step. */
export async function deduce(spec: GridSpec, opts: Options = {}): Promise<{ path: Step[]; profile: Profile }> {
  const t0 = Date.now(), budget = opts.budgetMs ?? 20000;
  const maxPairs = opts.maxPairWindows ?? 1500, maxSplits = opts.maxSplits ?? 300, maxDeep = opts.maxDeep ?? 12;
  await loadClingo();
  const p = makePuzzle(spec), g = p.grid, n = g.cellCount, notes: string[] = [];
  let calls = 0;
  const dbg = (what: string) => { if (process.env.DEDUCE_DEBUG) console.error(`${Date.now() - t0} ms: ${what}`); };
  const G: Ground = parseAspif(ground(taggedProgram(p)));
  dbg(`ground: ${G.rules.length} rules`);
  calls++;

  // ---- blocks: strip the rbk tags ----
  const tagAtom = new Map<number, number>();
  for (const [name, lit] of G.outputs) { const m = /^rbk\((\d+)\)$/.exec(name); if (m && lit > 0) tagAtom.set(lit, +m[1]); }
  for (const r of G.rules) {
    if (!tagAtom.size) break;
    const k = r.body.findIndex((l) => tagAtom.has(l));
    if (k >= 0) { r.block = tagAtom.get(r.body[k])!; r.body.splice(k, 1); if (r.bound !== null) r.weights.splice(k, 1); }
  }
  const rules = G.rules;

  // ---- marks: the shown atoms ----
  const markName: string[] = [], markAtom: number[] = [], markCells: number[][] = [];
  const known: number[] = [];   // -1 unknown, 0 false, 1 true
  const atomMark = new Map<number, number>();
  for (const [name, lit] of G.outputs) {
    const m = MARK.exec(name);
    if (!m) continue;
    const id = +m[2];
    const cells = m[1] === "line" || m[1] === "cut" ? g.links[id].cells.slice()
      : m[1] === "fence" ? g.borders[id].cells.filter((c) => c >= 0) : [id];
    markName.push(name); markAtom.push(lit); markCells.push(cells);
    known.push(lit === 0 ? 1 : -1);
    if (lit > 0) atomMark.set(lit, markName.length - 1);
  }
  const M = markName.length;

  dbg("marks");
  // ---- footprints ----
  const fp: (Bits | null)[] = new Array(G.maxAtom + 1).fill(null);
  for (let m = 0; m < M; m++) if (markAtom[m] > 0) fp[markAtom[m]] = bitsOf(n, markCells[m]);
  const defs: number[][] = Array.from({ length: G.maxAtom + 1 }, () => []);
  const usedIn: number[][] = Array.from({ length: G.maxAtom + 1 }, () => []);
  const constraints: number[] = [];
  rules.forEach((r, k) => {
    if (!r.head.length && !r.choice) constraints.push(k);
    for (const h of r.head) defs[h].push(k);
    for (const l of r.body) usedIn[Math.abs(l)].push(k);
  });
  {
    const queue: number[] = [];
    rules.forEach((r, k) => { if (r.head.length) queue.push(k); });
    const inQ = new Uint8Array(rules.length).fill(1);
    while (queue.length) {
      const k = queue.pop()!; inQ[k] = 0;
      const r = rules[k];
      let acc: Bits | null = null;
      for (const l of r.body) { const f = fp[Math.abs(l)]; if (f) { acc ??= new Uint32Array(f.length); orInto(acc, f); } }
      if (!acc) continue;
      for (const h of r.head) {
        if (!fp[h]) fp[h] = new Uint32Array(acc.length);
        if (orInto(fp[h]!, acc)) for (const k2 of usedIn[h]) if (!inQ[k2] && rules[k2].head.length) { inQ[k2] = 1; queue.push(k2); }
      }
    }
  }
  dbg("footprints");
  const empty = new Uint32Array((n + 31) >>> 5);
  const cfp = constraints.map((k) => {
    const acc = new Uint32Array(empty.length);
    for (const l of rules[k].body) { const f = fp[Math.abs(l)]; if (f) orInto(acc, f); }
    return acc;
  });
  // constraints by their first cell; constraints touching no cell hold in every window
  const byCell: number[][] = Array.from({ length: n }, () => []), everywhere: number[] = [];
  cfp.forEach((b, j) => { const cs = cellsOf(b); if (cs.length) byCell[cs[0]].push(j); else everywhere.push(j); });

  dbg("constraints");
  // ---- the answer (to aim case splits at, and to check every deduction against) ----
  calls++;
  const first = clingoJson(program(p), 1);
  if (first.Result !== "SATISFIABLE") throw new Error("the puzzle has no solution");
  const answer = new Uint8Array(M), markOf = new Map(markName.map((x, m) => [x, m]));
  for (let m = 0; m < M; m++) if (markAtom[m] === 0) answer[m] = 1;
  for (const v of first.Call?.[0]?.Witnesses?.[0]?.Value ?? []) { const m = markOf.get(v); if (m !== undefined) answer[m] = 1; }
  const severalAnswers = (genres as Record<string, { solutions?: string }>)[spec.genre ?? ""]?.solutions === "some";

  const knownLines = (map: (a: number) => number, marks: Iterable<number>) => {
    const out: string[] = [];
    for (const m of marks) if (known[m] >= 0 && markAtom[m] > 0) out.push(`1 0 0 0 1 ${known[m] ? -map(markAtom[m]) : map(markAtom[m])}`);
    return out;
  };

  dbg("answer");
  // ---- windows ----
  const win = (label: string, cells: Iterable<number>): Window => { const cs = [...new Set(cells)].sort((a, b) => a - b); return { label, cells: cs, bits: bitsOf(n, cs), size: cs.length }; };
  const rc = (i: number) => { const [r, c] = g.rc(i); return `r${r + 1}c${c + 1}`; };
  const t0w: Window[] = [], units: Window[] = [];
  const unit = (w: Window) => { units.push(w); t0w.push(w); };
  if (g.kind === "square" && !p.figure) {
    for (let r = 0; r < g.rows; r++) unit(win(`row ${r + 1}`, Array.from({ length: g.cols }, (_, c) => g.cell(r, c))));
    for (let c = 0; c < g.cols; c++) unit(win(`column ${c + 1}`, Array.from({ length: g.rows }, (_, r) => g.cell(r, c))));
    for (let r = 0; r + 2 < Math.max(g.rows, 3); r++) for (let c = 0; c + 2 < Math.max(g.cols, 3); c++) {
      const cs: number[] = [];
      for (let y = r; y < r + 3; y++) for (let x = c; x < c + 3; x++) if (y < g.rows && x < g.cols) cs.push(g.cell(y, x));
      t0w.push(win(`around ${rc(g.cell(Math.min(r + 1, g.rows - 1), Math.min(c + 1, g.cols - 1)))}`, cs));
    }
  } else {
    for (let i = 0; i < n; i++) t0w.push(win(`around ${rc(i)}`, [i, ...g.cellLinks[i].map((l) => (g.links[l].cells[0] === i ? g.links[l].cells[1] : g.links[l].cells[0]))]));
  }
  p.areas?.cells.forEach((cs, a) => unit(win(`area ${String.fromCharCode(97 + (a % 26))}`, cs)));
  {
    const boxes = new Map<number, number[]>();
    for (const m of program(p).matchAll(/\bbox\((\d+),(\d+)\)\./g)) { const k = +m[2]; if (!boxes.has(k)) boxes.set(k, []); boxes.get(k)!.push(+m[1]); }
    for (const [k, cs] of boxes) unit(win(`box ${k + 1}`, cs));
  }
  // each clue's or rule's own footprint, when it's local
  const cap0 = Math.max(g.rows, g.cols, 9);
  {
    const seen = new Set<string>();
    for (const b of cfp) {
      const cs = cellsOf(b);
      if (cs.length < 2 || cs.length > cap0) continue;
      const key = cs.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      t0w.push(win(cs.length <= 3 ? cs.map(rc).join(" ") : `near ${rc(cs[0])}–${rc(cs.at(-1)!)}`, cs));
    }
  }
  const prune = (ws: Window[]) => {
    const byKey = new Map<string, Window>();
    for (const w of ws) if (!byKey.has(w.cells.join(","))) byKey.set(w.cells.join(","), w);
    const list = [...byKey.values()].sort((a, b) => b.size - a.size);
    const kept: Window[] = [];
    for (const w of list) if (!kept.some((k) => k.size > w.size && subset(w.bits, k.bits))) kept.push(w);
    return kept.sort((a, b) => a.size - b.size);
  };
  const T0 = prune(t0w);
  dbg("tier-0 windows");
  // tier 1: two overlapping tier-0 windows
  let T1: Window[] = [];
  {
    const cap1 = 2 * Math.max(g.rows, g.cols, 5);
    const seen = new Set(T0.map((w) => w.cells.join(",")));
    const pairs: Window[] = [];
    for (let a = 0; a < T0.length; a++) for (let b = a + 1; b < T0.length; b++) {
      const A = T0[a], B = T0[b];
      let meet = false;
      for (let k = 0; k < A.bits.length && !meet; k++) if (A.bits[k] & B.bits[k]) meet = true;
      if (!meet) continue;
      const u = A.bits.slice(); orInto(u, B.bits);
      const cs = cellsOf(u);
      if (cs.length > cap1) continue;
      const key = cs.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ label: `${A.label} + ${B.label}`, cells: cs, bits: u, size: cs.length });
    }
    pairs.sort((x, y) => x.size - y.size);
    if (pairs.length > maxPairs) notes.push(`tier 1: kept the ${maxPairs} smallest of ${pairs.length} window pairs`);
    T1 = pairs.slice(0, maxPairs);
  }

  dbg("tier-1 windows");

  // ---- explanation units: each constraint belongs to a rule instance (a rule applied to a row,
  // a box, an area, one clue, or the whole grid); a cell's own bookkeeping ("one digit per
  // cell") is free ----
  const consOf = new Int32Array(rules.length).fill(-1);
  constraints.forEach((k, j) => { consOf[k] = j; });
  interface Group { kind: string; label: string; cells: number[] }
  const groups: Group[] = [], groupOf = new Int32Array(constraints.length).fill(-1);
  {
    const byKey = new Map<string, number>();
    // a constraint inside several units (a pair of cells in both a row and a box) goes to the
    // unit holding most of its rule's constraints (the box, for the box rule)
    const count = new Map<string, number>(), within = (j: number) => units.filter((w) => subset(cfp[j], w.bits));
    constraints.forEach((k, j) => { if (cellsOf(cfp[j]).length) for (const w of within(j)) { const key = `${rules[k].block}|${w.label}`; count.set(key, (count.get(key) ?? 0) + 1); } });
    constraints.forEach((k, j) => {
      const cs = cellsOf(cfp[j]), block = rules[k].block;
      if (block < 0 && cs.length <= 1) return;
      const kind = block >= 0 ? p.rules[block].rule : "regions";
      const u = cs.length ? within(j).sort((a, b) => (count.get(`${block}|${b.label}`) ?? 0) - (count.get(`${block}|${a.label}`) ?? 0) || a.size - b.size)[0] : undefined;
      const label = u ? u.label : cs.length === 0 || cs.length > cap0 ? "the whole grid" : cs.length <= 3 ? cs.map(rc).join(" ") : `near ${rc(cs[0])}–${rc(cs.at(-1)!)}`;
      const key = `${kind}|${u ? u.label : cs.length > cap0 ? "*" : cs.join(",")}`;
      let gi = byKey.get(key);
      if (gi === undefined) { gi = groups.length; byKey.set(key, gi); groups.push({ kind, label, cells: u ? u.cells : cs }); }
      groupOf[j] = gi;
    });
  }
  // ---- a window's program: its constraints and what defines their atoms ----
  interface Prog { rules: number[]; marks: number[]; blocks: Set<number> }
  const progCache = new Map<Window, Prog>();
  const progOf = (w: Window): Prog => {
    const hit = progCache.get(w);
    if (hit) return hit;
    const cons: number[] = [...everywhere];
    for (const c of w.cells) for (const j of byCell[c]) if (subset(cfp[j], w.bits)) cons.push(j);
    const ruleSet = new Set<number>(), atoms = new Set<number>(), stack: number[] = [];
    const addRule = (k: number) => { if (ruleSet.has(k)) return; ruleSet.add(k); for (const a of rules[k].head) stack.push(a); for (const l of rules[k].body) stack.push(Math.abs(l)); };
    for (const j of cons) addRule(constraints[j]);
    while (stack.length) { const a = stack.pop()!; if (atoms.has(a)) continue; atoms.add(a); for (const k of defs[a]) addRule(k); }
    const marks: number[] = [];
    for (const a of atoms) { const m = atomMark.get(a); if (m !== undefined) marks.push(m); }
    const blocks = new Set<number>();
    for (const k of ruleSet) if (rules[k].block >= 0) blocks.add(rules[k].block);
    const out = { rules: [...ruleSet], marks, blocks };
    // only windows with a constraint can deduce anything
    if (!cons.length) out.marks = [];
    progCache.set(w, out);
    return out;
  };

  // ---- clue kinds by cell, for rule load ----
  const kindsAt: Set<string>[] = Array.from({ length: n }, () => new Set());
  const allGivens: Given[] = spec.givens ?? [];
  for (const gv of allGivens) if (!STRUCTURE.has(gv.kind)) for (const c of givenCells(p, gv)) kindsAt[c].add(gv.kind);


  // ---- describing facts ----
  const factText = (m: number, v: boolean): string => {
    const mm = MARK.exec(markName[m])!, id = +mm[2];
    switch (mm[1]) {
      case "shaded": return `${rc(id)} ${v ? "shaded" : "unshaded"}`;
      case "digit": return `${rc(id)} ${v ? "=" : "≠"} ${mm[3]}`;
      case "paint": return `${rc(id)} ${v ? "is" : "isn't"} color ${mm[3]}`;
      case "fence": { const cs = g.borders[id].cells; return `${v ? "line" : "no line"} on the edge of ${cs.filter((c) => c >= 0).map(rc).join("/")}${cs.includes(-1) ? " (outside)" : ""}`; }
      case "line": return `${v ? "line" : "no line"} ${rc(g.links[id].cells[0])}–${rc(g.links[id].cells[1])}`;
      default: return `${v ? "cut" : "no cut"} ${rc(g.links[id].cells[0])}|${rc(g.links[id].cells[1])}`;
    }
  };

  // ---- the solve ----
  const path: Step[] = [];
  const decidedAt = new Int32Array(M).fill(-1);   // the round each mark was settled in
  const evaluatedAt = new Map<Window, number>();
  let round = 0, undecided = known.filter((v) => v < 0).length, outOfTime = false;
  const settle = (m: number, v: boolean) => {
    if (known[m] >= 0) return false;
    if ((v ? 1 : 0) !== answer[m] && !severalAnswers) throw new Error(`deduced a wrong fact: ${factText(m, v)}`);
    known[m] = v ? 1 : 0; decidedAt[m] = round; undecided--;
    return true;
  };

  /** Cautious consequences of each (changed) window; returns the windows' new facts. */
  const runWindows = (ws: Window[]): Map<Window, [number, boolean][]> => {
    const todo = ws.filter((w) => {
      const pr = progOf(w);
      if (!pr.marks.some((m) => known[m] < 0)) return false;
      const last = evaluatedAt.get(w);
      return last === undefined || pr.marks.some((m) => decidedAt[m] >= last);
    });
    const found = new Map<Window, [number, boolean][]>();
    // clingo-wasm takes the program on its stack, which holds about 2 MB: calls stay well under
    const CHUNK = 500_000;   // characters per clingo call
    let lines: string[] = [], chars = 0, members: Window[] = [], next = 1;
    const flush = () => {
      if (!members.length) return;
      calls++;
      const tc = Date.now();
      const res = clingoJson(["asp 1 0 0", ...lines, "0"].join("\n"), 0, ["--enum-mode=cautious", "--quiet=1"]);
      dbg(`round ${round}: ${members.length} windows, ${chars} chars, ${res.Call?.[0]?.Witnesses?.length} models, ${Date.now() - tc} ms`);
      if (res.Result === "UNSATISFIABLE") throw new Error("a window has no answer: the known facts are wrong");
      const last = res.Call?.[0]?.Witnesses?.at(-1)?.Value ?? [];
      for (const v of last) {
        const mt = /^([tf])\((\d+),(\d+)\)$/.exec(v);
        if (!mt) continue;
        const w = members[+mt[2]], m = +mt[3];
        if (known[m] >= 0) continue;
        if (!found.has(w)) found.set(w, []);
        found.get(w)!.push([m, mt[1] === "t"]);
      }
      lines = []; chars = 0; members = []; next = 1;
    };
    for (const w of todo) {
      evaluatedAt.set(w, round);
      const pr = progOf(w), idx = members.length, local = new Map<number, number>();
      members.push(w);
      const map = (a: number) => { let x = local.get(a); if (x === undefined) { x = next++; local.set(a, x); } return x; };
      const mine: string[] = [];
      for (const k of pr.rules) mine.push(ruleLine(rules[k], map));
      mine.push(...knownLines(map, pr.marks));
      for (const m of pr.marks) if (known[m] < 0) {
        const a = map(markAtom[m]), neg = next++;
        mine.push(`1 0 1 ${neg} 0 1 ${-a}`, outputLine(`t(${idx},${m})`, a), outputLine(`f(${idx},${m})`, neg));
      }
      const size = mine.reduce((x, l) => x + l.length + 1, 0);
      if (size > CHUNK) { members.pop(); notes.push(`${w.label}: too big to check`); continue; }
      lines.push(...mine); chars += size;
      if (chars > CHUNK) flush();
    }
    flush();
    return found;
  };

  // ---- explanations ----
  // A fact's explanation is a smallest set of rule instances (groups) and earlier facts that
  // entails it (Bogaerts, Gamba, Guns and Claes, "Step-wise explanations of constraint
  // satisfaction problems", ECAI 2020): assume the fact's negation with the set switched on, and
  // clingo finds no answer. Within a window, a Lua script shrinks the window's whole set by
  // deletion (groups before facts, since facts are cheaper), in halving chunks, to a
  // subset-minimal one.
  const ALL: Window = win("the whole grid", Array.from({ length: n }, (_, i) => i));
  interface Expl { groups: number[]; facts: number[]; capped: boolean }
  const explain = (jobs: { w: Window; facts: [number, boolean][] }[]): Map<Window, (Expl | null)[]> => {
    const out = new Map<Window, (Expl | null)[]>();
    let text: string[] = [], tables: string[] = [], members: { w: Window; facts: [number, boolean][] }[] = [];
    const flush = () => {
      if (!members.length) return;
      calls++;
      const lua = `#script (lua)
local function S(n, W, x) return clingo.Function(n, {clingo.Number(W), clingo.Number(x)}) end
function main(prg)
  prg:ground({{"base", {}}})
  local wins = {${tables.join(",")}}
  for _, w in ipairs(wins) do
    local W = w[1]
    local elems = {}
    for _, G in ipairs(w[2]) do elems[#elems + 1] = {"g", G, S("g", W, G)} end
    for _, m in ipairs(w[3]) do elems[#elems + 1] = {"k", m, S("k", W, m)} end
    local on = {clingo.Function("e", {clingo.Number(W)}), true}
    local solves = 0
    local function unsat(t, set)
      local a = {on, {t, true}}
      for _, i in ipairs(set) do a[#a + 1] = {elems[i][3], true} end
      solves = solves + 1
      return prg:solve({assumptions = a}).unsatisfiable == true
    end
    local cache = {}
    for _, m in ipairs(w[4]) do
      local t = S("t", W, m)
      local found, capped = nil, false
      for _, c in ipairs(cache) do if unsat(t, c) then found = c break end end
      if not found then
        local set = {}
        for i = 1, #elems do set[i] = i end
        if unsat(t, set) then
          local size = math.max(1, math.floor(#set / 2))
          while true do
            local i = 1
            while i <= #set do
              if solves > ${MUS_SOLVES} then capped = true break end
              local rest = {}
              for j = 1, #set do if j < i or j >= i + size then rest[#rest + 1] = set[j] end end
              if #rest < #set and unsat(t, rest) then set = rest else i = i + size end
            end
            if size == 1 or capped then break end
            size = math.max(1, math.floor(size / 2))
          end
          found = set
          cache[#cache + 1] = set
        end
      end
      if found then
        local parts = {}
        for _, i in ipairs(found) do parts[#parts + 1] = elems[i][1] .. elems[i][2] end
        print("E " .. W .. " " .. m .. " " .. (capped and "1" or "0") .. " " .. table.concat(parts, ","))
      else print("X " .. W .. " " .. m) end
    end
  end
end
#end.
`;
      const te = Date.now();
      const { lines, status, errors } = clingoRaw(lua + text.join("\n"), "--outf=3");
      dbg(`explain: ${members.length} windows, ${members.reduce((a, j) => a + j.facts.length, 0)} facts, ${text.reduce((a, l) => a + l.length, 0)} chars, ${Date.now() - te} ms`);
      if (status === 33 || status === 65 || status === 128) throw new Error(`clingo failed (${status}): ${errors.join("\n").slice(0, 300)}`);
      for (const l of lines) {
        const x = /^([EX]) (\d+) (\d+)(?: (\d) ?(.*))?$/.exec(l);
        if (!x) continue;
        const job = members[+x[2]], m = +x[3], k = job.facts.findIndex(([mm]) => mm === m);
        if (!out.has(job.w)) out.set(job.w, job.facts.map(() => null));
        if (x[1] === "X") continue;
        const parts = (x[5] ?? "").split(",").filter(Boolean);
        out.get(job.w)![k] = { groups: parts.filter((q) => q[0] === "g").map((q) => +q.slice(1)), facts: parts.filter((q) => q[0] === "k").map((q) => +q.slice(1)), capped: x[4] === "1" };
      }
      text = []; tables = []; members = [];
    };
    let chars = 0;
    for (const job of jobs) {
      const W = members.length, pr = progOf(job.w), mine: string[] = [];
      const A = (a: number) => `a(${W},${a})`;
      const L = (l: number) => (l < 0 ? `not ${A(-l)}` : A(l));
      const gs = new Set<number>();
      for (const k of pr.rules) {
        const r = rules[k], j = consOf[k];
        const body = r.bound === null ? r.body.map(L) : [`#sum{${r.body.map((l, q) => `${r.weights[q]},${q}:${L(l)}`).join(";")}} >= ${r.bound}`];
        if (j >= 0) {
          const gi = groupOf[j];
          if (gi >= 0) gs.add(gi);
          mine.push(`:- ${[...body, gi >= 0 ? `g(${W},${gi})` : `e(${W})`].join(", ")}.`);
        } else if (r.choice) {
          if (r.head.length) mine.push(`{${r.head.map(A).join(";")}} :- ${[...body, `e(${W})`].join(", ")}.`);
        } else mine.push(body.length ? `${r.head.map(A).join(";")} :- ${body.join(", ")}.` : `${r.head.map(A).join(";")}.`);
      }
      const kn = pr.marks.filter((m) => known[m] >= 0 && markAtom[m] > 0);
      for (const m of kn) mine.push(`:- ${known[m] ? "not " : ""}${A(markAtom[m])}, k(${W},${m}).`);
      for (const [m, v] of job.facts) mine.push(`:- ${v ? "" : "not "}${A(markAtom[m])}, t(${W},${m}).`);
      // free externals: switched on by assumptions, otherwise the solver may leave them off
      mine.push(`#external e(${W}). [free]`, ...[...gs].map((gi) => `#external g(${W},${gi}). [free]`), ...kn.map((m) => `#external k(${W},${m}). [free]`), ...job.facts.map(([m]) => `#external t(${W},${m}). [free]`));
      const size = mine.reduce((x, l) => x + l.length + 1, 0);
      if (size > 900_000) { notes.push(`${job.w.label}: too big to explain`); continue; }
      if (chars + size > 900_000) { flush(); chars = 0; return explainRest(jobs.slice(jobs.indexOf(job)), out); }
      members.push(job); text.push(...mine); chars += size;
      tables.push(`{${W},{${[...gs].join(",")}},{${kn.join(",")}},{${job.facts.map(([m]) => m).join(",")}}}`);
    }
    flush();
    return out;
  };
  const explainRest = (jobs: { w: Window; facts: [number, boolean][] }[], acc: Map<Window, (Expl | null)[]>) => {
    for (const [w, e] of explain(jobs)) acc.set(w, e);
    return acc;
  };

  // ---- costs ----
  const puzzleKinds = new Set([...groups.map((x) => x.kind), ...kindsAt.flatMap((ks) => [...ks].map((k) => `clue:${k}`))]).size;
  const kindsOf = (e: Expl) => {
    const ks = new Set<string>();
    for (const gi of e.groups) { ks.add(groups[gi].kind); for (const c of groups[gi].cells) for (const k of kindsAt[c]) ks.add(`clue:${k}`); }
    return [...ks].sort();
  };
  // A case split's explanation is a chain of small steps under the assumption, not one look at
  // everything at once: its rule instances count a quarter each (a crude stand-in for costing
  // the nested steps, as Bogaerts et al. do). An explanation that couldn't be found (too big)
  // costs the surcharge plus every kind the puzzle has, plus 2.
  const costOf = (e: Expl | null, tier: Tier) => {
    if (!e) return TIER_COST[tier] + puzzleKinds + 2;
    const per = tier >= 2 ? GROUP_COST / 2 : GROUP_COST;
    return per * e.groups.length + kindsOf(e).length + FACT_COST * e.facts.length + TIER_COST[tier];
  };

  /** Turn windows' facts into candidate steps: each fact goes to the smallest window that found
   *  it, and facts with the same explanation make one step. */
  const explained = new Map<string, { stamp: number; e: Expl | null }>();
  const candidates = (found: Map<Window, [number, boolean][]>, tier: Tier): (Step & { w: Window })[] => {
    const ws = [...found.keys()].sort((a, b) => a.size - b.size);
    const claimed = new Set<number>(), jobs: { w: Window; facts: [number, boolean][] }[] = [];
    const stamp = (w: Window) => progOf(w).marks.reduce((a, m) => Math.max(a, decidedAt[m]), -1);
    for (const w of ws) {
      const facts = found.get(w)!.filter(([m]) => !claimed.has(m));
      for (const [m] of facts) claimed.add(m);
      // explained before, with nothing new known in the window since: the same explanation
      const fresh = facts.filter(([m]) => explained.get(`${w.label}|${m}`)?.stamp !== stamp(w));
      if (fresh.length) jobs.push({ w, facts: fresh });
    }
    const ex = explain(jobs), steps: (Step & { w: Window })[] = [];
    for (const { w, facts } of jobs) ex.get(w)?.forEach((e, k) => explained.set(`${w.label}|${facts[k][0]}`, { stamp: stamp(w), e }));
    for (const w of ws) {
      const facts = found.get(w)!.filter(([m]) => known[m] < 0 && claimed.has(m) && jobs.every((j) => j.w === w || !j.facts.some(([x]) => x === m)));
      if (!facts.length) continue;
      const es = facts.map(([m]) => explained.get(`${w.label}|${m}`)?.e ?? null), byKey = new Map<string, Step & { w: Window }>();
      facts.forEach(([m, v], k) => {
        const e = es[k];
        const key = e ? `${e.groups.join(",")}|${e.facts.join(",")}` : "none";
        let st = byKey.get(key);
        if (!st) {
          const kinds = e ? kindsOf(e) : [...new Set(groups.map((x) => x.kind))];
          st = { w, tier, where: w === ALL ? "the whole grid" : w.label, cells: w.cells, facts: [], uses: kinds, cost: +costOf(e, tier).toFixed(2),
            because: e ? { clues: e.groups.map((gi) => `${groups[gi].kind} (${groups[gi].label})`), kinds, facts: e.facts.length, capped: e.capped } : { clues: ["(not found)"], kinds, facts: 0, capped: true } };
          byKey.set(key, st);
        }
        st.facts.push({ mark: markName[m], value: v, text: factText(m, v) });
      });
      steps.push(...byKey.values());
    }
    return steps;
  };

  /** A fact found by a case split or search: explained in the smallest neighbourhood that
   *  entails it (the tier-0 windows through its cells, then those touching them, and so on),
   *  falling back to the whole grid. */
  const wideStep = (m: number, v: boolean, tier: Tier) => {
    let bits = bitsOf(n, markCells[m]);
    for (let level = 0; level < 4; level++) {
      const next = bits.slice();
      for (const w of T0) { let meet = false; for (let k = 0; k < bits.length && !meet; k++) if (w.bits[k] & bits[k]) meet = true; if (meet) orInto(next, w.bits); }
      if (cellsOf(next).length === n) break;
      bits = next;
      const w: Window = { label: `around ${markCells[m].map(rc).join("/")} (${level + 1} deep)`, cells: cellsOf(bits), bits, size: cellsOf(bits).length };
      if (!progOf(w).marks.includes(m)) continue;
      const e = explain([{ w, facts: [[m, v]] }]).get(w)?.[0];
      if (e) return candidates(new Map([[w, [[m, v]]]]), tier)[0];
    }
    return candidates(new Map([[ALL, [[m, v]]]]), tier)[0];
  };

  /** Take the cheapest candidate steps (within SLACK of the cheapest); the rest wait for a later
   *  round, when more is known and they may come cheaper. */
  const take = (steps: (Step & { w: Window })[]) => {
    if (!steps.length) return 0;
    const min = Math.min(...steps.map((s) => s.cost));
    let count = 0;
    for (const s of steps) {
      if (s.cost > min + SLACK) { evaluatedAt.delete(s.w); continue; }
      const { w: _w, ...step } = s;
      path.push(step); count++;
    }
    for (const s of steps) if (s.cost <= min + SLACK) for (const f of s.facts) settle(markOf.get(f.mark)!, f.value);
    return count;
  };

  dbg("setup");
  // single cells first, silently: a given's own cell (a printed digit rules out the others)
  {
    const singles = Array.from({ length: n }, (_, i) => win(rc(i), [i]));
    const found = runWindows(singles);
    for (const fs of found.values()) for (const [m, v] of fs) settle(m, v);
  }

  let entryPoints = -1;
  const order = (): number[] => {
    // case-split candidates: marks next to the most settled ones first
    const score = new Float64Array(M);
    const near = new Float64Array(n);
    for (let m = 0; m < M; m++) if (known[m] >= 0) for (const c of markCells[m]) near[c]++;
    const cand: number[] = [];
    for (let m = 0; m < M; m++) if (known[m] < 0) {
      let s = 0;
      for (const c of markCells[m]) { s += near[c]; for (const l of g.cellLinks[c] ?? []) { const [a, b] = g.links[l].cells; s += 0.25 * near[a === c ? b : a]; } }
      score[m] = s; cand.push(m);
    }
    return cand.sort((a, b) => score[b] - score[a]);
  };

  /** One clingo call (a Lua script over the engine's program): for each candidate mark, assume
   *  it the other way from the answer and see what it takes to refute. The first `deepCount`
   *  candidates get a real search (tier 3); the rest only propagation (tier 2). */
  const hardRound = (cand: number[], deepCount: number) => {
    calls++;
    const lit = (m: number, v: boolean) => `{clingo.parse_term("${markName[m]}"), ${v}}`;
    const knowns: string[] = [];
    for (let m = 0; m < M; m++) if (known[m] >= 0 && markAtom[m] > 0) knowns.push(lit(m, known[m] === 1));
    const cands = cand.map((m) => `{${m}, ${lit(m, answer[m] !== 1)}}`);
    const lua = `#script (lua)
function main(prg)
  prg:ground({{"base", {}}})
  local known = {${knowns.join(",")}}
  local cands = {${cands.join(",")}}
  local ch0, co0 = 0, 0
  local function try(c, limit)
    prg.configuration.solve.solve_limit = limit
    local a = {}
    for i, k in ipairs(known) do a[i] = k end
    a[#a + 1] = c[2]
    local r = prg:solve({assumptions = a})
    local s = prg.statistics.accu.solving.solvers
    local ch, co = s.choices - ch0, s.conflicts - co0
    ch0, co0 = s.choices, s.conflicts
    return r, ch, co
  end
  for i, c in ipairs(cands) do
    local r, ch, co = try(c, i <= ${deepCount} and "${DEEP_LIMIT}" or "${SPLIT_LIMIT}")
    print(string.format("C %d %s %s %d %d", c[1], tostring(r.satisfiable), tostring(r.unsatisfiable), ch, co))
  end
end
#end.
`;
    const { lines, status, errors } = clingoRaw(lua + program(p), "--outf=3 --stats --forget-on-step=varScores,signs,lemmaScores,lemmas");
    if (status === 33 || status === 65 || status === 128) throw new Error(`clingo failed (${status}): ${errors.join("\n").slice(0, 300)}`);
    return lines.flatMap((l) => {
      const x = /^C (\d+) (\w+) (\w+) (\d+) (\d+)$/.exec(l);
      return x ? [{ m: +x[1], sat: x[2] === "true", unsat: x[3] === "true", choices: +x[4], cost: +x[4] + +x[5] }] : [];
    });
  };
  let pool: number[] = [], deep: { m: number; cost: number }[] = [], sat: number[] = [];

  while (undecided > 0) {
    if (Date.now() - t0 > budget) { outOfTime = true; break; }
    round++;
    let f = runWindows(T0);
    if (f.size) { const c = candidates(f, 0); if (entryPoints < 0) entryPoints = c.length; take(c); continue; }
    if (entryPoints < 0) entryPoints = 0;
    f = runWindows(T1);
    if (f.size) { take(candidates(f, 1)); continue; }

    // tier 2: assume a mark the other way; propagation alone must contradict it. What's
    // refutable this way stays so as more is known, so one clingo call fills a pool to draw on.
    pool = pool.filter((m) => known[m] < 0);
    const cand = order().slice(0, maxSplits);
    if (!pool.length) {
      const res = hardRound(cand, Math.min(cand.length, maxDeep));
      pool = res.filter((x) => x.unsat && x.choices === 0).map((x) => x.m);
      deep = res.filter((x) => x.unsat && x.choices > 0).sort((a, b) => a.cost - b.cost);
      sat = res.filter((x) => x.sat).map((x) => x.m);
    }
    if (pool.length) {
      const rank = new Map(cand.map((m, k) => [m, k]));
      pool.sort((a, b) => rank.get(a)! - rank.get(b)!);
      const m = pool.shift()!, v = answer[m] === 1;
      take([{ ...wideStep(m, v, 2), where: `assume ${factText(m, !v)}: a contradiction` }]);
      continue;
    }

    // tier 3: the fact that takes the least search to prove
    deep = deep.filter((x) => known[x.m] < 0);
    const best = deep.length ? deep[0].m : -1, bestCost = deep.length ? deep[0].cost : 0;
    deep = [];
    const free = sat.find((m) => known[m] < 0) ?? -1;
    if (best >= 0) {
      const v = answer[best] === 1;
      take([{ ...wideStep(best, v, 3), where: `search (${bestCost} choices and conflicts)` }]);
    } else if (free >= 0 && severalAnswers) {
      // nothing is forced: several answers remain, and the solver picks a way (as a player would)
      const v = answer[free] === 1;
      path.push({ tier: 0, where: "a free choice", cells: markCells[free], facts: [{ mark: markName[free], value: v, text: factText(free, v) }], uses: [], choice: true, cost: 0 });
      settle(free, v);
    } else if (cand.length) {
      notes.push("stuck: no candidate could be proved within the caps");
      break;
    }
  }
  if (outOfTime) notes.push(`out of time after ${budget} ms with ${undecided} marks open`);

  const profile = profileOf(path, undecided === 0, entryPoints < 0 ? 0 : entryPoints, round, Date.now() - t0, calls, [...new Set(notes)]);
  return { path, profile };
}

/** How step costs combine: a soft-max, D = (1/k)·log Σ exp(k·cost). One step costing Δ more than
 *  a medium one weighs as much as e^(kΔ) medium steps; two equal hard steps add log(2)/k over
 *  one; easy steps barely count. Costs run about 2 (one rule, one clue) to 3–4 (medium: two or
 *  three rule instances and a few earlier facts) to 5+ (hard: several kinds and many instances
 *  together, or a case split). */
export const SOFTMAX_K = 1.5;
/** Cost bands for the profile: [from, label] */
export const BANDS = [[0, "easy"], [3, "medium"], [5, "hard"], [7, "very hard"]] as const;

export const softmax = (costs: number[], k = SOFTMAX_K) => {
  if (!costs.length) return 0;
  const top = Math.max(...costs);
  return top + Math.log(costs.reduce((a, c) => a + Math.exp(k * (c - top)), 0)) / k;
};

/** Summarise a solve path. */
export function profileOf(path: Step[], solved: boolean, entryPoints: number, rounds: number, ms: number, clingoCalls: number, notes: string[], k = SOFTMAX_K): Profile {
  const real = path.filter((s) => !s.choice);
  const perTier: [number, number, number, number] = [0, 0, 0, 0];
  for (const s of real) perTier[s.tier]++;
  const hardestTier = (real.length ? Math.max(...real.map((s) => s.tier)) : 0) as Tier;
  const costs = real.map((s) => s.cost);
  const maxCost = costs.length ? Math.max(...costs) : 0;
  const bands: Record<string, number> = Object.fromEntries(BANDS.map(([, l]) => [l, 0]));
  for (const c of costs) bands[[...BANDS].reverse().find(([from]) => c >= from)![1]]++;
  const hard = (c: number) => c >= BANDS[2][0];
  let run = 0, hardStretch = 0;
  for (const c of costs) { run = hard(c) ? run + 1 : 0; hardStretch = Math.max(hardStretch, run); }
  const items = new Set<string>();
  for (const s of real) for (const u of s.uses) items.add(u);
  const ruleItems = [...items].sort();
  const p: Profile = {
    solved, steps: real.length, maxCost, bands, dSteps: +softmax(costs, k).toFixed(2),
    totalCost: +costs.reduce((a, c) => a + c, 0).toFixed(1), hardestTier, perTier, entryPoints, hardStretch,
    ruleLoad: ruleItems.length, ruleItems, facts: path.reduce((a, s) => a + s.facts.length, 0),
    rounds, ms, clingoCalls, notes, estimate: 0,
  };
  p.estimate = estimateOf(p);
  return p;
}

/** One 0..1 number: f(D_steps) + w·rule load. D_steps of 3 (only easy and medium steps) maps to
 *  0 and 11 to 1; rule load counts from 2 kinds (one rule and one clue kind) to 7. Unsolved (out
 *  of time) counts as hard. */
export const LOAD_WEIGHT = 0.25;
export function estimateOf(p: Pick<Profile, "dSteps" | "ruleLoad" | "solved">): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const x = (1 - LOAD_WEIGHT) * clamp((p.dSteps - 3) / 8) + LOAD_WEIGHT * clamp((p.ruleLoad - 2) / 5);
  return +clamp(p.solved ? x : Math.max(x, 0.9)).toFixed(3);
}
