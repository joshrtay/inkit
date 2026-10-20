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
import { readdirSync, readFileSync } from "node:fs";
import { REFS_DIR } from "./janko.ts";

const argv = process.argv.slice(2), flag = (n: string, d: number) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? Number(argv[i + 1]) : d; };
const source = argv[0] === "solver" ? "solver" : "human", MAX = flag("max", 40), SHOW = flag("show", 8);
const named = argv.slice(1).filter((a, i, xs) => !a.startsWith("--") && !xs[i - 1]?.startsWith("--"));
const dir = `${REFS_DIR}${source === "solver" ? "proof-menus-solver" : "proof-menus"}/`;
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };

const SLOTS = ["rules", "kinds", "facts", "marks", "size", "stage", "n"] as const;
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
const prog = (it: { c: number; k: number; b: number[]; m: string[]; cl: string[] }): Prog => {
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
  ];
};

// ---------- the moves ----------
const byGenre = new Map<string, Move[]>();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl") && x !== "misses.jsonl")) {
  const genre = f.slice(0, -6);
  if (named.length && !named.includes(genre)) continue;
  const moves: Move[] = [];
  for (const line of readFileSync(dir + f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const d = JSON.parse(line);
    if (!d.positions) continue;
    const test = hash(`split:${d.id}`) < 0.5;
    for (const p of d.positions) {
      if (source === "solver") {
        const nx = p.next[0];
        if (!nx || nx.item < 0) continue;
        // the distinct moves (items with the same facts are one, as its cheapest item)
        const by = new Map<string, any>();
        for (const it of p.menu) { const k = [...it.m].sort().join(" "), had = by.get(k); if (!had || it.c < had.c) by.set(k, it); }
        const keys = [...by.keys()], chosen = keys.indexOf([...p.menu[nx.item].m].sort().join(" "));
        moves.push({ test, cands: keys.map((k) => prog(by.get(k))), chosen });
      } else {
        // a mark, as its cheapest item; the choices are the marks set to the value the person set
        const marks = new Map<string, { it: any; value: string }>();
        for (const it of p.menu) for (const fact of it.m as string[]) {
          const [mark, value] = fact.split("="), had = marks.get(mark);
          if (!had || it.c < had.it.c) marks.set(mark, { it, value });
        }
        // each mark's place (its cheapest item's window centre), for the locality prior
        const at = (it: any) => [(it.b[0] + it.b[2]) / 2, (it.b[1] + it.b[3]) / 2];
        let prev: number[] | null = null;
        for (const nx of p.next as { mark: string; known?: 1 }[]) {
          if (nx.known) continue;
          const target = marks.get(nx.mark);
          if (!target) { prev = null; continue; }
          const keys = [...marks.entries()].filter(([, v]) => v.value === target.value);
          const dist = Float64Array.from(keys, ([, v]) => { if (!prev) return 0; const [r, c] = at(v.it); return Math.hypot(r - prev[0], c - prev[1]); });
          moves.push({ test, cands: keys.map(([, v]) => prog(v.it)), chosen: keys.findIndex(([k]) => k === nx.mark), dist });
          prev = at(target.it);
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
  // candidates: every abstraction of a training step, the commonest first
  const freq = new Map<string, { a: Abs; n: number }>();
  for (const m of tr) for (let mask = 1; mask < 1 << SLOTS.length; mask++) {
    if (mask & 1 && mask & 2) continue;  // the rules fix the kinds
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
    }).filter((e) => e.g > 0).sort((x, y) => y.g - x.g).slice(0, 20);
    let best: { a: Abs; r: ReturnType<typeof codeLength>; t: number } | null = null;
    for (const { a } of est) {
      const r = codeLength([...lib, a], tr, null, cache), t = r.sum + defs() + defBits(a, values);
      if (t < total && (!best || t < best.t)) best = { a, r, t };
      else tried.add(a.key);
    }
    if (!best) break;
    lib.push(best.a); cur = best.r; total = best.t;
  }
  const fin = codeLength(lib, tr, te, cache), held = fin.test, use = fin.use;
  console.log(`${genre.padEnd(20)} ${String(moves.length).padStart(6)}  ${uniform.toFixed(2).padStart(7)}  ${near.toFixed(2).padStart(4)}  ${kindBits.toFixed(2).padStart(5)}  ${held.toFixed(2).padStart(7)} (${String(lib.length - 1).padStart(2)})  ${`${(100 * (1 - held / near)).toFixed(1)}%`.padStart(6)}`);
  if (SHOW) for (const j of lib.map((_, j) => j).sort((a, b) => use[b] - use[a]).slice(0, SHOW)) console.log(`    ${(100 * use[j]).toFixed(1).padStart(5)}%  ${show(lib[j])}`);
}
