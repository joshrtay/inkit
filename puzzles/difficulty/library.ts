// Library learning over step programs under code v2 (Fable's review: "Stitch over step programs",
// first single steps). A step on a menu is a small program: the rules its explanation uses, each on
// its kind of unit ("lit@row", "adjacent-count@cells3"), the facts it decides ("2 on, 1 off", the
// kinds of mark), its window's size and its stage. An abstraction is that program with holes: some
// slots fixed, the rest free. Under code v2 an abstraction is a predicate over the menu: a step is
// coded as an abstraction from the library, then one of the menu's moves it matches,
//
//   bits = −log2 Σ over abstractions matching it of P(abstraction) / (the moves on the menu it matches)
//
// (for people's moves, the matching moves under a locality prior: nearness to the last move)
//
// the encoder taking the abstraction that codes the step shortest. The library always has the
// empty abstraction (any move: the uniform code). P is counted on the training half (add-half),
// and each abstraction pays for its definition once (which slots, then each fixed value given its
// slot's values). Learning is greedy: of the commonest abstractions of the training steps, add the
// one that most shortens the training bits plus definitions; repeat until none does. Held-out bits
// are scored on the other half of the puzzles, against the kinds-only code and uniform.
//
// Two sources: people's moves (human-menus.ts rows, a move is a mark; its program is its cheapest
// item's) and the solver's steps (proof-menus.ts rows, the first step after each position).
//
//   node --no-warnings puzzles/difficulty/library.ts [human|solver] [genre …] [--max 40] [--show 8]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { REFS_DIR } from "./janko.ts";

const argv = process.argv.slice(2), flag = (n: string, d: number) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? Number(argv[i + 1]) : d; };
const source = argv[0] === "solver" ? "solver" : "human", MAX = flag("max", 40), SHOW = flag("show", 8);
const named = argv.slice(1).filter((a, i, xs) => !a.startsWith("--") && !xs[i - 1]?.startsWith("--"));
// MENUS_OUT and MENUS_CORPUS as human-menus.ts takes them (the network's test puzzles)
const dir = process.env.MENUS_OUT ?? `${REFS_DIR}${source === "solver" ? "proof-menus-solver" : "proof-menus"}/`;
const corpusDir = process.env.MENUS_CORPUS ?? `${REFS_DIR}ml/human-corpus/`;
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };

// clues: the puzzle's givens in the step's window (their values where a type has few); rel: where
// the move is from the person's last move (touching, near, far; first at a position); after: the
// last move's kinds of rule (a two-step phrase). rel and after are people's moves only
// open: the fewest marks still open in a rule instance holding the move's mark (1: the move finishes
// it); around: how many marks are settled in the cells next to it. Both from the person's state, for
// puzzles with a graph record (graphs-human-labels.jsonl: its marks' cells and rule instances)
// scan: the move's place in reading order among the choices (first, in the first quarter, later):
// a person scanning the board top to bottom
const SLOTS = ["rules", "kinds", "facts", "marks", "size", "stage", "n", "clues", "rel", "after", "open", "around", "scan"] as const;
const MAX_FIXED = 3;  // an abstraction fixes at most this many slots
const EXACT = flag("exact", 400);  // candidates scored exactly each round (the rest by a quick estimate)
type Prog = string[];  // one value a slot
interface Move { test: boolean; cands: Prog[]; chosen: number; dist?: Float64Array }

const unit = (label: string) => {
  if (/^row \d+$/.test(label)) return "row";
  if (/^column \d+$/.test(label)) return "column";
  if (/^box \d+$/.test(label)) return "box";
  if (/^area /.test(label)) return "area";
  if (/^near /.test(label)) return "near";
  if (/^\d+ × \d+ at /.test(label)) return label.replace(/ at .*/, "").replace(" × ", "x");
  if (label === "the whole grid") return "grid";
  if (/^the line through/.test(label)) return "line";
  const cells = label.match(/r\d+c\d+/g);
  return cells ? `cells${Math.min(cells.length, 5)}` : "other";
};
type Givens = { r: number; c: number; edge: boolean; tok: string }[];
const cluesIn = (b: number[], gv: Givens | undefined) => {
  if (!gv) return "?";
  const n = new Map<string, number>();
  for (const g of gv) {
    const inside = g.edge ? (g.r >= b[0] && g.r <= b[2]) || (g.c >= b[1] && g.c <= b[3]) : g.r >= b[0] && g.r <= b[2] && g.c >= b[1] && g.c <= b[3];
    if (inside) n.set(g.tok, (n.get(g.tok) ?? 0) + 1);
  }
  if (n.size > 4) return "many";
  return [...n.entries()].sort().map(([t, k]) => (k > 1 ? `${k}×${t}` : t)).join(" ") || "none";
};
const prog = (it: { c: number; k: number; b: number[]; m: string[]; cl: string[] }, gv?: Givens, rel = "", after = "", state: string[] = ["", ""], scan = ""): Prog => {
  const rules = [...new Set(it.cl.map((x) => { const m = /^(.*?) \((.*)\)$/.exec(x); return m ? `${m[1]}@${unit(m[2])}` : x; }))].sort();
  const on = it.m.filter((f) => f.endsWith("=1")).length, off = it.m.length - on;
  const h = it.b[2] - it.b[0] + 1, w = it.b[3] - it.b[1] + 1;
  return [
    rules.join("+"),
    [...new Set(rules.map((r) => r.split("@")[0]))].join("+"),
    `${on} on ${off} off`,
    [...new Set(it.m.map((f) => f.split("(")[0]))].sort().join("+"),
    `${Math.min(h, w)}x${Math.max(h, w)}`,
    String(it.k),
    String(it.m.length <= 2 ? it.m.length : it.m.length <= 4 ? "3-4" : "5+"),
    cluesIn(it.b, gv),
    rel,
    after,
    ...state,
    scan,
  ];
};

// ---------- the moves ----------
// the graph records, for the state slots: each mark's rule instances (the marks in each) and the
// marks in the cells next to it, by the record's name and by its Janko id
const STATE = new Map<string, { index: Map<string, number>; groups: number[][]; groupsOf: number[][]; near: number[][]; initial: number[] }>();
if (source === "human" && existsSync(`${REFS_DIR}ml/graphs-human-labels.jsonl`))
  for (const line of readFileSync(`${REFS_DIR}ml/graphs-human-labels.jsonl`, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const d = JSON.parse(line), st = d.structure, cols = st.cols || 0;
    const index = new Map<string, number>(st.marks.map((m: any, i: number) => [m.name, i]));
    const byCell = new Map<number, number[]>();
    st.marks.forEach((m: any, i: number) => { for (const c of m.cells) (byCell.get(c) ?? byCell.set(c, []).get(c)!).push(i); });
    const groups: number[][] = st.groups.map((g: any) => { const cs = new Set(g.cells); return st.marks.flatMap((m: any, i: number) => (m.cells.every((c: number) => cs.has(c)) ? [i] : [])); });
    const groupsOf: number[][] = st.marks.map(() => []);
    groups.forEach((ms, g) => { for (const i of ms) groupsOf[i].push(g); });
    const near: number[][] = st.marks.map((m: any, i: number) => {
      const out = new Set<number>();
      for (const c of m.cells) {
        const r = cols ? Math.floor(c / cols) : 0, q = cols ? c % cols : c;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (cols && (q + dc < 0 || q + dc >= cols)) continue;
          for (const j of byCell.get((r + dr) * cols + q + dc) ?? []) if (j !== i) out.add(j);
        }
      }
      return [...out];
    });
    const initial = (d.initial ?? []).flatMap((x: string) => { const i = index.get(x.split("=")[0]); return i === undefined ? [] : [i]; });
    const rec = { index, groups, groupsOf, near, initial };
    STATE.set(d.name, rec);
    const m = /^janko ([^/]+)\/(.+)\.txt$/.exec(d.name);
    if (m) STATE.set(`janko:${m[1]}/${m[2]}`, rec);
  }
const byGenre = new Map<string, Move[]>();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl") && x !== "misses.jsonl")) {
  const genre = f.slice(0, -6);
  if (named.length && !named.includes(genre)) continue;
  const moves: Move[] = [];
  // the givens, as tokens: a kind, with its value where the type has at most 10 distinct values
  const specs = new Map<string, any>(), orders = new Map<string, string[]>(), ids = new Map<string, string[]>();
  for (const l of readFileSync(`${corpusDir}${genre}.jsonl`, "utf8").split("\n")) {
    const m = /^\{"key":"([^"]+)"/.exec(l);
    if (!m) continue;
    const d = JSON.parse(l);
    specs.set(m[1], d.spec.givens ?? []); ids.set(m[1], [m[1], ...(d.ids ?? [])]);
    if (d.humanOrder) orders.set(m[1], [...d.humanOrder].sort((a: any, b: any) => a[1] - b[1]).map((x: any) => x[0]));
  }
  const distinct = new Set([...specs.values()].flatMap((gs: any[]) => gs.map((g) => `${g.kind}:${g.value ?? ""}`)));
  const givens = (id: string): Givens | undefined => specs.get(id)?.filter((g: any) => Array.isArray(g.cell)).map((g: any) => ({ r: g.cell[0], c: g.cell[1], edge: g.at === "edge", tok: distinct.size <= 12 ? `${g.kind}${g.value !== undefined ? `:${g.value}` : ""}` : g.kind }));
  for (const line of readFileSync(dir + f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const d = JSON.parse(line);
    if (!d.positions) continue;
    const test = hash(`split:${d.id}`) < 0.5, gv = givens(d.id);
    const st = (ids.get(d.id) ?? []).map((i) => STATE.get(i)).find((x) => x), order = orders.get(d.id) ?? [];
    for (const p of d.positions) {
      // the person's state here: the record's initial marks and theirs before this position
      const known = new Set<number>(st?.initial ?? []);
      if (st) for (const mk of order.slice(0, p.at)) { const i = st.index.get(mk); if (i !== undefined) known.add(i); }
      const stateOf = (mark: string): string[] => {
        const i = st?.index.get(mark);
        if (!st || i === undefined) return ["?", "?"];
        let open = Infinity;
        for (const g of st.groupsOf[i]) { let n = 0; for (const j of st.groups[g]) if (!known.has(j)) n++; open = Math.min(open, n); }
        let around = 0;
        for (const j of st.near[i]) if (known.has(j)) around++;
        return [open === Infinity ? "none" : open >= 4 ? "4+" : String(open), around >= 4 ? "4+" : String(around)];
      };
      if (source === "solver") {
        const nx = p.next[0];
        if (!nx || nx.item < 0) continue;
        // the distinct moves (items with the same facts are one, as its cheapest item)
        const by = new Map<string, any>();
        for (const it of p.menu) { const k = [...it.m].sort().join(" "), had = by.get(k); if (!had || it.c < had.c) by.set(k, it); }
        const keys = [...by.keys()], chosen = keys.indexOf([...p.menu[nx.item].m].sort().join(" "));
        moves.push({ test, cands: keys.map((k) => prog(by.get(k), gv)), chosen });
      } else {
        // a mark, as its cheapest item; the choices are the marks set to the value the person set
        const marks = new Map<string, { it: any; value: string }>();
        for (const it of p.menu) for (const fact of it.m as string[]) {
          const [mark, value] = fact.split("="), had = marks.get(mark);
          if (!had || it.c < had.it.c) marks.set(mark, { it, value });
        }
        // each mark's place (its cheapest item's window centre), for the locality prior
        const at = (it: any) => [(it.b[0] + it.b[2]) / 2, (it.b[1] + it.b[3]) / 2];
        let prev: number[] | null = null, after = "none";
        for (const nx of p.next as { mark: string; known?: 1 }[]) {
          if (nx.known) continue;
          const target = marks.get(nx.mark);
          if (!target) { prev = null; after = "none"; continue; }
          const keys = [...marks.entries()].filter(([, v]) => v.value === target.value);
          const dist = Float64Array.from(keys, ([, v]) => { if (!prev) return 0; const [r, c] = at(v.it); return Math.hypot(r - prev[0], c - prev[1]); });
          const rel = (i: number) => (!prev ? "first" : dist[i] <= 1 ? "touch" : dist[i] <= 3 ? "near" : "far");
          const order = keys.map(([, v]) => { const [r, c] = at(v.it); return r * 1000 + c; }), sorted = [...order].sort((x, y) => x - y);
          const scan = (i: number) => { const k = sorted.indexOf(order[i]); return k === 0 ? "first" : k <= (keys.length - 1) / 4 ? "early" : "late"; };
          moves.push({ test, cands: keys.map(([k, v], i) => prog(v.it, gv, rel(i), after, stateOf(k), scan(i))), chosen: keys.findIndex(([k]) => k === nx.mark), dist });
          prev = at(target.it); after = prog(target.it)[1];
        }
      }
    }
  }
  byGenre.set(genre, moves);
}

// ---------- the code ----------
interface Abs { mask: number; vals: Prog; key: string }   // mask: which slots are fixed
const matches = (a: Abs, p: Prog) => { for (let s = 0; s < SLOTS.length; s++) if (a.mask & (1 << s) && a.vals[s] !== p[s]) return false; return true; };
const show = (a: Abs) => a.mask ? SLOTS.flatMap((s, i) => (a.mask & (1 << i) ? [`${s}=${a.vals[i]}`] : [])).join(", ") : "(any)";
const absOf = (p: Prog, mask: number): Abs => { const vals = p.map((v, s) => (mask & (1 << s) ? v : "")); return { mask, vals, key: `${mask}:${vals.join("|")}` }; };

/** for each move, an entry's bits given it's chosen: one of the menu's moves it matches, uniform or,
 *  for people's moves, under the locality prior (∝ exp(−λ · distance from the last move), λ fitted
 *  a genre on the empty abstraction); Infinity where it doesn't match */
const LAMBDA = { v: 0 };
const within = (m: Move, a: Abs) => {
  if (!matches(a, m.cands[m.chosen])) return Infinity;
  let z = 0;
  m.cands.forEach((c, i) => { if (matches(a, c)) z += Math.exp(-LAMBDA.v * (m.dist?.[i] ?? 0)); });
  return -Math.log2(Math.exp(-LAMBDA.v * (m.dist?.[m.chosen] ?? 0)) / z);
};
/** the code of a set under a library. Returns the training moves' bits, the entries' weights and,
 *  with a test set, the test moves' mean */
function codeLength(lib: Abs[], tr: Move[], te: Move[] | null, cache: Map<string, Float64Array>) {
  const per = (set: Move[], tag: string) => lib.map((a) => {
    const k = `${tag}${a.key}`;
    let v = cache.get(k);
    if (!v) { v = Float64Array.from(set, (m) => within(m, a)); cache.set(k, v); }
    return v;
  });
  // a mixture: P(move) = Σ P(entry) · P(move | entry), the entries' weights by EM on the training half
  // (it never codes longer than taking the best entry, and needs no choice of entry to be sent)
  const W = per(tr, "tr:"), L = lib.length;
  let use = new Array(L).fill(1 / L);
  const mix = (M: Float64Array[], i: number, w: number[]) => { let p = 0; for (let j = 0; j < L; j++) if (M[j][i] < Infinity) p += w[j] * 2 ** -M[j][i]; return p; };
  for (let it = 0; it < 15; it++) {
    const next = new Array(L).fill(0.5);
    for (let i = 0; i < tr.length; i++) { const p = mix(W, i, use); for (let j = 0; j < L; j++) if (W[j][i] < Infinity) next[j] += (use[j] * 2 ** -W[j][i]) / p; }
    const tot = next.reduce((x, y) => x + y, 0);
    use = next.map((u) => u / tot);
  }
  const bits = (set: Move[], M: Float64Array[]) => Float64Array.from(set, (_, i) => -Math.log2(mix(M, i, use)));
  const train = bits(tr, W), sum = train.reduce((x, y) => x + y, 0);
  return { train, sum, use, test: te ? bits(te, per(te, "te:")).reduce((a, b) => a + b, 0) / te.length : NaN };
}
const defBits = (a: Abs, values: Map<number, number>[]) => SLOTS.length + SLOTS.reduce((s, _, i) => s + (a.mask & (1 << i) ? Math.log2(values[i].size + 1) : 0), 0);

console.log(`${source}'s moves: bits a move on the held-out half (library: abstractions of step programs)`);
console.log("genre                 moves  uniform  near  kinds  library (size)  saving over near");
for (const [genre, moves] of [...byGenre.entries()].sort()) {
  const tr = moves.filter((m) => !m.test), te = moves.filter((m) => m.test);
  if (tr.length < 50 || te.length < 50) continue;
  const values = SLOTS.map((_, i) => { const m = new Map<number, number>(); for (const mv of tr) for (const c of mv.cands) m.set(c[i] as unknown as number, 0); return m as unknown as Map<number, number>; });
  const top: Abs = absOf(tr[0].cands[0], 0);
  LAMBDA.v = 0;
  const uniform = codeLength([top], tr, te, new Map()).test;
  if (tr[0].dist) {
    let best = Infinity;
    for (const l of [0, 0.1, 0.2, 0.4, 0.7, 1, 1.5, 2]) { LAMBDA.v = l; const b = codeLength([top], tr, null, new Map()).sum; if (b < best) { best = b; var lam = l; } }
    LAMBDA.v = lam!;
  }
  const cache = new Map<string, Float64Array>(), near = codeLength([top], tr, te, cache).test;
  const kinds = [top, ...new Map(tr.map((m) => { const a = absOf(m.cands[m.chosen], 2); return [a.key, a]; })).values()];
  const kindBits = codeLength(kinds, tr, te, cache).test;
  // --slots: each slot alone as the vocabulary (every value of it a symbol), against the prior alone
  if (argv.includes("--slots")) console.log(`  ${genre}: ` + SLOTS.map((name, i) => {
    const lib1 = [top, ...new Map(tr.map((m) => { const a = absOf(m.cands[m.chosen], 1 << i); return [a.key, a]; })).values()];
    return `${name} ${codeLength(lib1, tr, te, cache).test.toFixed(2)} (${lib1.length - 1})`;
  }).join(", "));
  // candidates: every abstraction of a training step, the commonest first
  const freq = new Map<string, { a: Abs; n: number }>();
  for (const m of tr) for (let mask = 1; mask < 1 << SLOTS.length; mask++) {
    if (mask & 1 && mask & 2) continue;  // the rules fix the kinds
    let fixed = 0; for (let x = mask; x; x &= x - 1) fixed++;
    if (fixed > MAX_FIXED) continue;
    const a = absOf(m.cands[m.chosen], mask), e = freq.get(a.key);
    if (e) e.n++; else freq.set(a.key, { a, n: 1 });
  }
  const pool = [...freq.values()].filter((e) => e.n >= 10).sort((a, b) => b.n - a.n).slice(0, 400).map((e) => e.a);
  const lib: Abs[] = [top], defs = () => lib.reduce((s, x) => s + defBits(x, values), 0);
  let cur = codeLength(lib, tr, null, cache), total = cur.sum + defs();
  const tried = new Set<string>();
  while (lib.length <= MAX) {
    // each candidate's gain, estimated with the library's costs fixed: the moves it codes shorter,
    // at a cost from the share it would take; the best few are then scored exactly
    const est = pool.filter((a) => !tried.has(a.key)).map((a) => {
      const W = cache.get(`tr:${a.key}`) ?? (cache.set(`tr:${a.key}`, Float64Array.from(tr, (m) => within(m, a))), cache.get(`tr:${a.key}`)!);
      let u = 0;
      for (let i = 0; i < tr.length; i++) if (W[i] < cur.train[i]) u++;
      const c = -Math.log2((u + 0.5) / (tr.length + 0.5 * (lib.length + 1)));
      let g = 0;
      for (let i = 0; i < tr.length; i++) if (W[i] + c < cur.train[i]) g += cur.train[i] - W[i] - c;
      return { a, g: g - defBits(a, values) };
    }).sort((x, y) => y.g - x.g).slice(0, EXACT);
    let best: { a: Abs; r: ReturnType<typeof codeLength>; t: number } | null = null;
    for (const { a } of est) {
      const r = codeLength([...lib, a], tr, null, cache), t = r.sum + defs() + defBits(a, values);
      if (t >= total) tried.add(a.key);  // no use now; with a larger library, none later
      else if (!best || t < best.t) best = { a, r, t };
    }
    if (!best) break;
    lib.push(best.a); cur = best.r; total = best.t;
  }
  const fin = codeLength(lib, tr, te, cache), held = fin.test, use = fin.use;
  console.log(`${genre.padEnd(20)} ${String(moves.length).padStart(6)}  ${uniform.toFixed(2).padStart(7)}  ${near.toFixed(2).padStart(4)}  ${kindBits.toFixed(2).padStart(5)}  ${held.toFixed(2).padStart(7)} (${String(lib.length - 1).padStart(2)})  ${`${(100 * (1 - held / near)).toFixed(1)}%`.padStart(6)}`);
  if (SHOW) for (const j of lib.map((_, j) => j).sort((a, b) => use[b] - use[a]).slice(0, SHOW)) console.log(`    ${(100 * use[j]).toFixed(1).padStart(5)}%  ${show(lib[j])}`);
}
