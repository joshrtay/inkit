// Phase 1 of docs/research-trajectory.md, by compression: learn a language of moves that
// minimises the description length of human puzzles' proofs, and score it on puzzles it never saw.
//
// The proofs are the original phase 1's (references/proof/*.jsonl, written by proof-paths.ts):
// each puzzle's cheapest-only path, step by step. Nothing is solved here.
//
// Atoms are the step signatures' parts, a primitive on a unit kind (signatures.ts: "sight@line",
// "count@local"), each with its place on the board. A symbol is a multiset of atoms: a step is
// coded as the symbols that cover its atoms, each symbol's places, and the facts it decides.
//
//   step bits = k (how many symbols) + each symbol given the genre − log2(orderings of the multiset)
//             + places: a symbol's first atom relative to the last step's window (locality), the
//               next symbol's relative to the one before, and a compound's other atoms relative to
//               its first under that symbol's own geometry (what a technique fixes)
//             + facts: how many, given the step's first symbol, and which and what (the same in
//               every language)
//
// Every distribution is a Dirichlet process over its outcomes (a fixed base, concentration A), so
// the code is prequential: parameters are paid for as they are learned, and the code length of a
// set depends only on the counts. The held-out bits of the test half are L(train + test) − L(train).
// The language pays for each compound once: its definition, two symbols below it.
//
// Learning is greedy library learning: count which pairs of symbols share a step, try the most
// common as a new symbol (re-parsing the steps it fits), keep the one that shortens train bits plus
// definitions most, and repeat until none does.
//
//   node --no-warnings puzzles/difficulty/mdl.ts fit [--sets ba,pilot,psjp-akari] [--max 200]
//   node --no-warnings puzzles/difficulty/mdl.ts readout     per-puzzle code lengths, against people
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { PRIMITIVE, unitKind } from "./signatures.ts";

const REFS = process.env.REFS_DIR ?? `${import.meta.dirname}/../../references/`;
export const PROOF_DIR = `${REFS}proof/`;
export const MDL_DIR = `${REFS}proof/mdl/`;
const A = 1;            // concentration of every Dirichlet process
const LOG2 = Math.log2;

// ---------- the corpus ----------

/** a unit's place: its bounding box, 0-based; null where it spans the board (a row's columns) */
export interface Geo { r0: number | null; c0: number | null; h: number | null; w: number | null; cr: number; cc: number }
export interface Inst { atom: string; g: Geo }
export interface PStep { insts: Inst[]; nFacts: number; factBits: number; win: Geo; round: number; cost: number; shape?: string }
export interface Puzzle {
  key: string; id: string; set: string; genre: string; rows: number; cols: number;
  meta: Record<string, unknown>; solved: boolean; steps: PStep[]; human: boolean;
}

const cellRC = (s: string) => { const m = /r(\d+)c(\d+)/.exec(s)!; return [+m[1] - 1, +m[2] - 1]; };
const box = (cells: [number, number][]): Geo => {
  const rs = cells.map((c) => c[0]), cs = cells.map((c) => c[1]);
  const r0 = Math.min(...rs), c0 = Math.min(...cs), h = Math.max(...rs) - r0 + 1, w = Math.max(...cs) - c0 + 1;
  return { r0, c0, h, w, cr: r0 + (h - 1) / 2, cc: c0 + (w - 1) / 2 };
};

/** a rule instance's label ("row 3", "near r1c2–r3c4", "r1c1 r1c2", "box 5") as a place */
export function place(label: string, rows: number, cols: number, win: Geo): Geo {
  let m: RegExpExecArray | null;
  if ((m = /^row (\d+)$/.exec(label))) return { r0: +m[1] - 1, c0: null, h: 1, w: null, cr: +m[1] - 1, cc: (cols - 1) / 2 };
  if ((m = /^column (\d+)$/.exec(label))) return { r0: null, c0: +m[1] - 1, h: null, w: 1, cr: (rows - 1) / 2, cc: +m[1] - 1 };
  if ((m = /^box (\d+)$/.exec(label))) {
    const bh = Math.floor(Math.sqrt(rows)), bw = Math.round(cols / bh), k = +m[1] - 1, per = Math.round(cols / bw);
    const r0 = Math.floor(k / per) * bh, c0 = (k % per) * bw;
    return { r0, c0, h: bh, w: bw, cr: r0 + (bh - 1) / 2, cc: c0 + (bw - 1) / 2 };
  }
  if ((m = /^(\d+) × (\d+) at (r\d+c\d+)$/.exec(label))) {
    const [r0, c0] = cellRC(m[3]), h = +m[1], w = +m[2];
    return { r0, c0, h, w, cr: r0 + (h - 1) / 2, cc: c0 + (w - 1) / 2 };
  }
  if (label === "the whole grid") return { r0: null, c0: null, h: null, w: null, cr: (rows - 1) / 2, cc: (cols - 1) / 2 };
  const cells = label.match(/r\d+c\d+/g);
  if (cells) return box(cells.map((c) => cellRC(c) as [number, number]));
  return win; // an area, or anything else without coordinates: where the step looked
}

const factValues: Record<string, number> = { digit: 9 };
/** the bits for which facts in the window and what they are: the same in every language */
const factBits = (facts: string[], win: number) =>
  facts.reduce((s, f) => s + LOG2(Math.max(2, 2 * win)) + LOG2(factValues[f.split("(")[0]] ?? 2), 0);

/** a cell's given as a short token (Akari "2" or "b" for a bare block, Slitherlink "3", Masyu "w"/"b") */
type Givens = Map<number, string>;
const PSJP_SPECS = new Map<string, Givens>();
function psjpGivens(genre: string, id: string, cols: number): Givens | undefined {
  if (!PSJP_SPECS.has(`${genre}:`)) {
    PSJP_SPECS.set(`${genre}:`, new Map());
    const f = `${REFS}psjp-full/converted/${genre}.jsonl`;
    if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const d = JSON.parse(line), g: Givens = new Map(), w = d.spec.size?.[1] ?? cols;
      for (const x of d.spec.givens ?? []) {
        if (x.at !== "cell") continue;
        const k = x.cell[0] * w + x.cell[1];
        const tok = x.kind === "pearl" ? x.value[0] : x.kind === "number" ? String(x.value) : x.kind === "block" ? "b" : "";
        if (tok && (!g.has(k) || g.get(k) === "b")) g.set(k, tok);
      }
      PSJP_SPECS.set(`${genre}:${d.sourceId}`, g);
    }
  }
  return PSJP_SPECS.get(`${genre}:${id}`);
}

/** with richer atoms, a local unit also carries the givens inside it and how many edges it touches */
export const RICH = { on: false };
function enrich(atom: string, g: Geo, givens: Givens | undefined, rows: number, cols: number) {
  if (!RICH.on || !givens || g.r0 == null || g.c0 == null || g.h == null || g.w == null || g.h * g.w > 16) return atom;
  const toks: string[] = [];
  for (let r = g.r0; r < g.r0 + g.h; r++) for (let c = g.c0; c < g.c0 + g.w; c++) { const t = givens.get(r * cols + c); if (t) toks.push(t); }
  const edges = +(g.r0 === 0) + +(g.c0 === 0) + +(g.r0 + g.h === rows) + +(g.c0 + g.w === cols);
  toks.sort();
  return `${atom}[${toks.length > 4 ? `${toks.slice(0, 4).join("")}+` : toks.join("")}${edges ? `|e${Math.min(edges, 2)}` : ""}]`;
}

/** a raw step from proof-paths.ts as atoms with places */
function toStep(s: any, rows: number, cols: number, givens?: Givens): PStep {
  const cells: [number, number][] = (s.x as number[]).map((i) => [Math.floor(i / cols), i % cols]);
  const win = cells.length ? box(cells) : place("the whole grid", rows, cols, null as never);
  const insts: Inst[] = [];
  for (const c of s.cl as string[]) {
    const m = /^(.+?) \((.*)\)$/.exec(c);
    if (!m) continue;
    const g = place(m[2], rows, cols, win);
    insts.push({ atom: enrich(`${PRIMITIVE[m[1]] ?? m[1]}@${unitKind(m[2])}`, g, givens, rows, cols), g });
  }
  // no explanation (the explainer gave up, or a cell with one option left): the window itself
  if (!insts.length) insts.push({ atom: s.cl?.[0] === "(not found)" ? `unexplained@t${s.t}` : "cell-only", g: win });
  insts.sort((a, b) => a.atom < b.atom ? -1 : a.atom > b.atom ? 1 : (a.g.cr - b.g.cr) || (a.g.cc - b.g.cc));
  return { insts, nFacts: s.m.length, factBits: factBits(s.m, s.x.length), win, round: s.r, cost: s.c, shape: s.sh };
}

const HUMAN_SETS = new Set(["ba", "pilot", "psjp-akari", "psjp-slitherlink", "psjp-masyu", "psjp-simple-loop"]);
const isHuman = (set: string) => HUMAN_SETS.has(set) || set.startsWith("janko") || set.startsWith("psjp");

/** every proof on disk, one row per puzzle (a puzzle in two sets is kept once) */
export function loadCorpus(sets?: string[]): Puzzle[] {
  const files = readdirSync(PROOF_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -6))
    .filter((s) => !sets || sets.includes(s)).sort();
  const seen = new Set<string>(), out: Puzzle[] = [];
  for (const set of files) {
    for (const line of readFileSync(`${PROOF_DIR}${set}.jsonl`, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const d = JSON.parse(line);
      if (!d.steps?.length) continue;
      const src = d.meta?.psjp ?? (set.startsWith("psjp") ? d.id : null);
      const key = src != null ? `psjp:${d.genre}:${src}` : `${set}:${d.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key, id: String(d.id), set, genre: d.genre, rows: d.rows, cols: d.cols, meta: d.meta ?? {}, solved: d.solved,
        steps: d.steps.map((s: any) => toStep(s, d.rows, d.cols, src != null ? psjpGivens(d.genre, String(src), d.cols) : undefined)), human: isHuman(set),
      });
    }
  }
  return out;
}

/** a puzzle's half: 0 trains, 1 is held out (a hash of its key, so it never moves) */
export function half(key: string): 0 | 1 {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2) as 0 | 1;
}

/** a second, independent hash of a puzzle's key: 0–99 */
const bucket = (key: string) => {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i) * 2654435761) >>> 0;
  return Math.floor(((h ^ (h >>> 15)) >>> 0) / 2 ** 32 * 100);
};

// ---------- prequential code: Dirichlet processes keyed by context ----------

const geoBase = (d: number | string) => d === "*" ? 0.2 : 0.8 * (1 / 3) * 0.5 ** Math.abs(d as number);
const sizeBase = (d: number | string) => d === "*" ? 0.2 : 0.8 * 0.5 ** (d as number);
/** the base of a place token "dr,dc,h,w": independent offsets and sizes */
function placeBase(tok: string) {
  const [dr, dc, h, w] = tok.split(",").map((x) => x === "*" ? "*" : +x);
  return geoBase(dr) * geoBase(dc) * sizeBase(h) * sizeBase(w);
}
const countBase = (tok: string) => 0.5 ** +tok;         // k ≥ 1
const factCountBase = (tok: string) => 0.5 ** (+tok + 1); // k ≥ 0

interface Table { N: number; n: Map<string, number>; base: (x: string) => number }

/** the code: every table, and the running log-probability of everything observed */
export class Code {
  tables = new Map<string, Table>();
  lp = 0;            // log2 probability of all observations (negative: −bits)
  extra = 0;         // the multiset orderings and the fact bits (not table-coded)
  symBase = 1;       // 1 / |language|: the base of the symbol tables
  byPart = new Map<string, number>(); // bits by kind of table (k, s, f, a, i, n)
  table(key: string, base: (x: string) => number) {
    let t = this.tables.get(key);
    if (!t) this.tables.set(key, (t = { N: 0, n: new Map(), base }));
    return t;
  }
  /** add (sign 1) or remove (sign −1) one observation; returns its log2 probability */
  obs(key: string, base: (x: string) => number, x: string, sign: 1 | -1) {
    const t = this.table(key, base);
    if (sign < 0) { const c = t.n.get(x)! - 1; if (c) t.n.set(x, c); else t.n.delete(x); t.N--; }
    const p = LOG2(((t.n.get(x) ?? 0) + A * t.base(x)) / (t.N + A));
    if (sign > 0) { t.n.set(x, (t.n.get(x) ?? 0) + 1); t.N++; }
    this.lp += sign * p;
    const part = key.slice(0, key.indexOf("|"));
    this.byPart.set(part, (this.byPart.get(part) ?? 0) - sign * p);
    return p;
  }
  bits() { return -this.lp + this.extra; }
}

// ---------- the language and the parse ----------

/** a symbol: a multiset of atoms, sorted; atoms are the symbols of size one */
export interface Sym { id: number; atoms: string[]; key: string; parent?: [number, number] }

export class Language {
  syms: Sym[] = [];
  byKey = new Map<string, Sym>();
  byAtom = new Map<string, Sym[]>(); // compounds holding an atom, largest first
  shapes = false;
  add(atoms: string[], parent?: [number, number], name?: string) {
    const sorted = [...atoms].sort(), key = name ?? sorted.join(" + ");
    const had = this.byKey.get(key);
    if (had) return had;
    const s: Sym = { id: this.syms.length, atoms: sorted, key, parent };
    this.syms.push(s); this.byKey.set(key, s);
    if (sorted.length > 1 && !name) for (const a of new Set(sorted)) {
      const l = this.byAtom.get(a) ?? []; l.push(s); l.sort((x, y) => y.atoms.length - x.atoms.length || x.id - y.id); this.byAtom.set(a, l);
    }
    return s;
  }
  remove(s: Sym) {
    this.byKey.delete(s.key);
    for (const a of new Set(s.atoms)) this.byAtom.set(a, (this.byAtom.get(a) ?? []).filter((x) => x !== s));
    (s as { dead?: boolean }).dead = true;
  }
  live() { return this.syms.filter((s) => !(s as { dead?: boolean }).dead); }
  /** the bits to define the compounds: each is two symbols below it, plus a bit for its arity */
  defBits() {
    const n = this.live().length;
    return this.live().filter((s) => s.atoms.length > 1).length * (2 * LOG2(n) + 1);
  }
}

/** one symbol's use in a step: the instances in its slots (slot 0 the anchor) */
export interface Occ { sym: Sym; insts: Inst[] }

const dist2 = (a: Geo, b: Geo) => (a.cr - b.cr) ** 2 + (a.cc - b.cc) ** 2;

/** cover a step's atoms with symbols, largest first; each symbol's other slots take the instance
 *  nearest its anchor */
export function parse(step: PStep, lang: Language): Occ[] {
  if (lang.shapes && step.shape && step.insts.length > 1) {
    // the hand-made vocabulary: each step shape (signatures.ts) is one symbol, its atoms in canonical order
    const key = `${step.shape}: ${step.insts.map((i) => i.atom).join(" + ")}`;
    const sym = lang.byKey.get(key) ?? lang.add(step.insts.map((i) => i.atom), undefined, key);
    return [{ sym, insts: step.insts }];
  }
  const left = [...step.insts], out: Occ[] = [];
  const has = (atoms: string[]) => {
    const need = new Map<string, number>();
    for (const a of atoms) need.set(a, (need.get(a) ?? 0) + 1);
    for (const [a, k] of need) if (left.filter((i) => i.atom === a).length < k) return false;
    return true;
  };
  while (left.length) {
    const first = left[0];
    let pick: Sym | undefined;
    if (left.length > 1) for (const s of lang.byAtom.get(first.atom) ?? []) if (s.atoms.length <= left.length && has(s.atoms)) { pick = s; break; }
    if (!pick) {
      left.shift();
      out.push({ sym: lang.byKey.get(first.atom) ?? lang.add([first.atom]), insts: [first] });
      continue;
    }
    // slot 0: the first instance (canonical order) of the symbol's first atom held by `first`
    const slots: Inst[] = [first];
    left.splice(0, 1);
    const rest = [...pick.atoms]; rest.splice(rest.indexOf(first.atom), 1);
    for (const a of rest) {
      let bi = -1, bd = Infinity;
      left.forEach((i, k) => { if (i.atom === a && dist2(i.g, first.g) < bd) { bd = dist2(i.g, first.g); bi = k; } });
      slots.push(left.splice(bi, 1)[0]);
    }
    out.push({ sym: pick, insts: slots });
  }
  return out;
}

const rel = (g: Geo, ref: { cr: number; cc: number }) =>
  `${g.r0 == null ? "*" : g.r0 - Math.round(ref.cr)},${g.c0 == null ? "*" : g.c0 - Math.round(ref.cc)},${g.h ?? "*"},${g.w ?? "*"}`;
const lfact = (n: number) => { let s = 0; for (let i = 2; i <= n; i++) s += LOG2(i); return s; };

/** observe (or un-observe) one step coded with its parse; returns its bits */
/** what a step's code may condition on beyond the genre: nothing, or the last step's first atom */
export const CTX = { prev: false, prevPlace: false, anchor: false };

export function codeStep(code: Code, genre: string, step: PStep, focus: { cr: number; cc: number }, occs: Occ[], sign: 1 | -1, prevAtom = "") {
  const before = code.bits();
  const g = CTX.prev ? `${genre}|${prevAtom}` : genre;
  code.obs(`k|${g}`, countBase, String(occs.length), sign);
  // the symbols as a multiset: coded in order, less the orderings that say the same
  const mult = new Map<number, number>();
  for (const o of occs) mult.set(o.sym.id, (mult.get(o.sym.id) ?? 0) + 1);
  let orderings = lfact(occs.length);
  for (const m of mult.values()) orderings -= lfact(m);
  code.extra -= sign * orderings;
  const symBase = () => code.symBase;
  let prev: Occ | null = null;
  for (const o of occs) {
    code.obs(`s|${prev ? genre : g}`, symBase, String(o.sym.id), sign);
    const a0 = o.insts[0];
    if (!prev) code.obs(`f|${CTX.prevPlace ? g : genre}|${a0.atom}`, placeBase, rel(a0.g, focus), sign);
    else code.obs(`a|${genre}|${prev.insts[0].atom}|${a0.atom}`, placeBase, rel(a0.g, prev.insts[0].g), sign);
    for (let i = 1; i < o.insts.length; i++) code.obs(`i|${o.sym.id}|${i}`, placeBase, rel(o.insts[i].g, a0.g), sign);
    prev = o;
  }
  code.obs(`n|${genre}|${occs[0]?.sym.id}`, factCountBase, String(step.nFacts), sign);
  code.extra += sign * step.factBits;
  return sign * (code.bits() - before);
}

// ---------- coding a corpus ----------

/** a puzzle as coded: its steps in the order taken, each step's parse, what it was coded after, its bits */
export interface Coded { p: Puzzle; steps: PStep[]; occs: Occ[][]; focus: { cr: number; cc: number }[]; prev: string[]; bits: number[]; what: number[] }

/** code puzzles, adding to `code`; each step's bits are its cost given all before it. With `greedy`,
 *  the steps of a round (all found from the same knowledge, so any order is a proof) are taken
 *  cheapest-code first: the path step of the alternation, with the code as it stands */
export function codeCorpus(code: Code, lang: Language, ps: Puzzle[], greedy = false): Coded[] {
  return ps.map((p) => {
    const c: Coded = { p, steps: [], occs: [], focus: [], prev: [], bits: [], what: [] };
    let f = { cr: (p.rows - 1) / 2, cc: (p.cols - 1) / 2 }, prevAtom = "";
    const take = (s: PStep, o: Occ[]) => {
      c.steps.push(s); c.occs.push(o); c.focus.push(f); c.prev.push(prevAtom);
      const w0 = (code.byPart.get("s") ?? 0) + (code.byPart.get("k") ?? 0);
      c.bits.push(codeStep(code, p.genre, s, f, o, 1, prevAtom));
      c.what.push((code.byPart.get("s") ?? 0) + (code.byPart.get("k") ?? 0) - w0);
      f = CTX.anchor ? s.insts[0].g : s.win; prevAtom = s.insts[0].atom;
    };
    for (let i = 0; i < p.steps.length;) {
      let j = i;
      while (j < p.steps.length && p.steps[j].round === p.steps[i].round) j++;
      const round = p.steps.slice(i, j).map((s) => ({ s, o: parse(s, lang) }));
      while (round.length) {
        let k = 0;
        if (greedy && round.length > 1) {
          let best = Infinity;
          round.forEach((r, x) => {
            const b = codeStep(code, p.genre, r.s, f, r.o, 1, prevAtom);
            codeStep(code, p.genre, r.s, f, r.o, -1, prevAtom);
            if (b < best) { best = b; k = x; }
          });
        }
        const [r] = round.splice(k, 1);
        take(r.s, r.o);
      }
      i = j;
    }
    return c;
  });
}

// ---------- library learning ----------

interface Fit { lang: Language; code: Code; coded: Coded[]; log: string[] }

export function atomsOf(ps: Puzzle[]) {
  const lang = new Language();
  for (const p of ps) for (const s of p.steps) for (const i of s.insts) lang.byKey.get(i.atom) ?? lang.add([i.atom]);
  return lang;
}

/** the steps each atom appears in, to find a candidate's steps quickly */
function stepIndex(coded: Coded[]) {
  const ix = new Map<string, [number, number][]>();
  coded.forEach((c, pi) => c.steps.forEach((s, si) => {
    for (const a of new Set(s.insts.map((i) => i.atom))) { const l = ix.get(a) ?? []; l.push([pi, si]); ix.set(a, l); }
  }));
  return ix;
}

const contains = (step: PStep, atoms: string[]) => {
  const have = new Map<string, number>();
  for (const i of step.insts) have.set(i.atom, (have.get(i.atom) ?? 0) + 1);
  for (const a of atoms) { const k = have.get(a) ?? 0; if (!k) return false; have.set(a, k - 1); }
  return true;
};

/** re-parse the steps a change touches, updating the code; returns the bits saved (positive: shorter) */
function reparse(code: Code, lang: Language, coded: Coded[], where: [number, number][]) {
  const before = code.bits();
  for (const [pi, si] of where) {
    const c = coded[pi], s = c.steps[si];
    codeStep(code, c.p.genre, s, c.focus[si], c.occs[si], -1, c.prev[si]);
    c.occs[si] = parse(s, lang);
    c.bits[si] = codeStep(code, c.p.genre, s, c.focus[si], c.occs[si], 1, c.prev[si]);
  }
  return before - code.bits();
}

/** the total for a language: corpus bits with |L| as it is, plus definitions */
function setSymBase(code: Code, lang: Language) {
  // every distinct symbol in each genre's table paid the base once: re-price those terms
  const n = lang.live().length, old = code.symBase, now = 1 / n;
  if (old === now) return;
  for (const [key, t] of code.tables) if (key.startsWith("s|")) {
    // recompute this table's log-probability under the new base (exchangeable: order doesn't matter)
    // closed form: Π over symbols of (A·b)(A·b+1)…(A·b+m−1) / (A)(A+1)…(A+N−1); only the base moves
    let lpOld = 0, lpNew = 0;
    for (const [, m] of t.n) for (let j = 0; j < m; j++) { lpOld += LOG2(j + A * old); lpNew += LOG2(j + A * now); }
    code.lp += lpNew - lpOld;
    code.byPart.set("s", (code.byPart.get("s") ?? 0) - (lpNew - lpOld));
  }
  code.symBase = now;
}

export interface FitOpts { max: number; top: number; minCount: number; greedy: boolean; em: number }

/** the alternation: code the paths (taken cheapest-code first with `greedy`) under the language,
 *  learn the language on those paths, and again `em` times */
export function fit(train: Puzzle[], opts: FitOpts, say = console.log): Fit {
  const lang = atomsOf(train);
  let f: Fit | null = null;
  for (let it = 0; it < Math.max(1, opts.em); it++) {
    const code = new Code();
    code.symBase = 1 / lang.live().length;
    const coded = codeCorpus(code, lang, train, opts.greedy);
    say(`pass ${it + 1}: ${lang.live().length} symbols, train ${train.length} puzzles, ${coded.reduce((s, c) => s + c.bits.length, 0)} steps, ${(code.bits() + lang.defBits()).toFixed(0)} bits`);
    f = learn(lang, code, coded, opts, say, f?.log ?? []);
  }
  return f!;
}

function learn(lang: Language, code: Code, coded: Coded[], opts: FitOpts, say: (s: string) => void, log: string[]): Fit {
  const ix = stepIndex(coded);
  const total = () => code.bits() + lang.defBits();
  const tried = new Set<string>();
  for (let round = 0; round < opts.max; round++) {
    // candidates: two symbols used in one step
    const pairs = new Map<string, { atoms: string[]; n: number; ids: [number, number] }>();
    for (const c of coded) for (const occs of c.occs) {
      if (occs.length < 2) continue;
      const seen = new Set<string>();
      for (let i = 0; i < occs.length; i++) for (let j = i + 1; j < occs.length; j++) {
        const [x, y] = occs[i].sym.id <= occs[j].sym.id ? [occs[i].sym, occs[j].sym] : [occs[j].sym, occs[i].sym];
        const atoms = [...x.atoms, ...y.atoms].sort(), key = atoms.join(" + ");
        if (seen.has(key) || lang.byKey.has(key)) continue;
        seen.add(key);
        const e = pairs.get(key) ?? { atoms, n: 0, ids: [x.id, y.id] as [number, number] }; e.n++; pairs.set(key, e);
      }
    }
    const cands = [...pairs.entries()].filter(([k, e]) => e.n >= opts.minCount && !tried.has(k)).sort((a, b) => b[1].n - a[1].n).slice(0, opts.top);
    if (!cands.length) break;
    let best: { key: string; gain: number; atoms: string[]; ids: [number, number]; n: number } | null = null;
    for (const [key, e] of cands) {
      const rare = e.atoms.reduce((r, a) => (ix.get(a)?.length ?? 0) < (ix.get(r)?.length ?? 0) ? a : r, e.atoms[0]);
      const where = (ix.get(rare) ?? []).filter(([pi, si]) => contains(coded[pi].steps[si], e.atoms));
      const before = total();
      const s = lang.add(e.atoms, e.ids);
      setSymBase(code, lang);
      reparse(code, lang, coded, where);
      const gain = before - total();
      lang.remove(s);
      setSymBase(code, lang);
      reparse(code, lang, coded, where);
      lang.syms.pop(); // it was the last added; drop it so ids stay dense
      if (gain <= 0) tried.add(key);
      if (!best || gain > best.gain) best = { key, gain, atoms: e.atoms, ids: e.ids, n: e.n };
    }
    if (!best || best.gain <= 0) { say(`round ${round}: nothing shortens the total`); break; }
    const s = lang.add(best.atoms, best.ids);
    setSymBase(code, lang);
    const rare = best.atoms.reduce((r, a) => (ix.get(a)?.length ?? 0) < (ix.get(r)?.length ?? 0) ? a : r, best.atoms[0]);
    reparse(code, lang, coded, (ix.get(rare) ?? []).filter(([pi, si]) => contains(coded[pi].steps[si], best!.atoms)));
    // a symbol nothing uses any more doesn't pay for its definition
    const used = new Set<number>();
    for (const c of coded) for (const o of c.occs) for (const x of o) used.add(x.sym.id);
    for (const d of lang.live()) if (d.atoms.length > 1 && !used.has(d.id)) { lang.remove(d); setSymBase(code, lang); }
    const line = `round ${round}: #${s.id} ${s.key} (${best.n} steps), −${best.gain.toFixed(0)} bits → ${total().toFixed(0)}`;
    log.push(line); say(line);
  }
  return { lang, code, coded, log };
}

/** a puzzle's code under a fitted code, which is left as it was */
export function score(f: Fit, p: Puzzle, greedy: boolean): Coded {
  for (const s of p.steps) for (const i of s.insts) if (!f.lang.byKey.has(i.atom)) { f.lang.add([i.atom]); setSymBase(f.code, f.lang); }
  const [c] = codeCorpus(f.code, f.lang, [p], greedy);
  for (let i = c.steps.length - 1; i >= 0; i--) codeStep(f.code, p.genre, c.steps[i], c.focus[i], c.occs[i], -1, c.prev[i]);
  return c;
}

/** bits of `test` given the code fitted on train: L(train + test) − L(train) */
export function heldOut(f: Fit, test: Puzzle[], greedy = false) {
  const before = f.code.bits(), parts0 = new Map(f.code.byPart), extra0 = f.code.extra;
  // test atoms the train half never saw join the language
  for (const p of test) for (const s of p.steps) for (const i of s.insts) if (!f.lang.byKey.has(i.atom)) { f.lang.add([i.atom]); }
  setSymBase(f.code, f.lang);
  const before2 = f.code.bits();
  const coded = codeCorpus(f.code, f.lang, test, greedy);
  const bits = f.code.bits() - before2 + (before2 - before);
  const parts: Record<string, number> = { extra: f.code.extra - extra0 };
  for (const [k, v] of f.code.byPart) parts[k] = v - (parts0.get(k) ?? 0);
  return { bits, coded, parts };
}

// ---------- the command ----------

function main() {
  const [cmd = "fit", ...args] = process.argv.slice(2);
  const opt = (name: string, d: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
  if (cmd === "fit") {
    const sets = opt("sets", "") ? opt("sets", "").split(",") : undefined;
    RICH.on = args.includes("--rich");
    const all = loadCorpus(sets).filter((p) => p.human);
    // --frac: train on a share of the train half (by a second hash), for a learning curve
    const frac = +opt("frac", "1");
    const train = all.filter((p) => half(p.key) === 0 && (frac >= 1 || bucket(p.key) < frac * 100)), test = all.filter((p) => half(p.key) === 1);
    const steps = (ps: Puzzle[]) => ps.reduce((s, p) => s + p.steps.length, 0);
    console.log(`human puzzles: ${all.length} (train ${train.length}, ${steps(train)} steps; test ${test.length}, ${steps(test)} steps)`);
    const o: FitOpts = { max: +opt("max", "200"), top: +opt("top", "30"), minCount: +opt("min", "5"), greedy: args.includes("--greedy"), em: +opt("em", "1") };
    CTX.prev = args.includes("--ctx"); CTX.prevPlace = args.includes("--ctx-place"); CTX.anchor = args.includes("--anchor");
    console.log(`order: ${o.greedy ? "cheapest code first within a round" : "the solver's"}; context: ${CTX.prev ? "genre and the last step's first atom" : "genre"}`);
    if (args.includes("--shapes")) {
      // the shape vocabulary against the atoms: every shape a symbol, defined once
      const f = fit(train, { ...o, max: 0, em: 1 }, () => {});
      const g = fit(train, { ...o, max: 0, em: 1 }, () => {});
      const a = heldOut(f, test, o.greedy).bits;
      const lang = atomsOf(train); lang.shapes = true;
      const code = new Code();
      for (const p of train) for (const st of p.steps) parse(st, lang);
      code.symBase = 1 / lang.live().length;
      const coded = codeCorpus(code, lang, train, o.greedy);
      const h = heldOut({ lang, code, coded, log: [] }, test, o.greedy);
      console.log({ atoms: a / steps(test), shapes: h.bits / steps(test), shapeSymbols: lang.live().length, defBitsPerTestStep: lang.defBits() / steps(test), parts: h.parts });
      void g; return;
    }
    const base = fit(train, { ...o, max: 0, em: 1 }, () => {});
    const h0 = heldOut(base, test, o.greedy), b0 = h0.bits;
    console.log("atoms, held-out bits by part:", Object.fromEntries(Object.entries(h0.parts).map(([k, v]) => [k, Math.round(v)])));
    const f = fit(train, o);
    const h1 = heldOut(f, test, o.greedy), b1 = h1.bits;
    console.log("language, held-out bits by part:", Object.fromEntries(Object.entries(h1.parts).map(([k, v]) => [k, Math.round(v)])));
    const nt = steps(test);
    const summary = {
      at: new Date().toISOString(), order: o.greedy ? "greedy" : "solver", context: CTX.prev ? "prev" : "genre", em: o.em, sets: sets ?? "all human", train: train.length, test: test.length, testSteps: nt,
      atoms: { heldOutBits: b0, perStep: b0 / nt },
      language: { symbols: f.lang.live().length, compounds: f.lang.live().filter((s) => s.atoms.length > 1).length, defBits: f.lang.defBits(), heldOutBits: b1, perStep: b1 / nt },
      saving: 1 - b1 / b0,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!existsSync(MDL_DIR)) mkdirSync(MDL_DIR, { recursive: true });
    writeFileSync(`${MDL_DIR}language-${opt("tag", "v1")}.json`, JSON.stringify({ ...summary, log: f.log, symbols: f.lang.live().filter((s) => s.atoms.length > 1).map((s) => s.key) }, null, 1));
  }
}

if (import.meta.main ?? process.argv[1]?.endsWith("mdl.ts")) main();
