// Code v2 (Fable's review of phase 1 by compression): a step is coded as a choice from the menu of
// steps available where it was taken. The decoder has the puzzle and the state, so the facts a step
// decides, its clues and its place come free once it is picked; every bit is in the choice, and a
// vocabulary can reach all of them (the old code left 83% out of reach).
//
// From proof-menus.ts's rows (the menus along the solver's proofs): at each position, the solver's
// next step (the first after the position, found on the menu) is coded among the menu's distinct
// moves (items with the same facts are one move; each move takes its cheapest item's kind, price
// and stage). Codes, bits a step on the held-out half (a salted hash of the id):
//
//   uniform      log2 of the moves
//   kinds        a symbol per kind of step (the rules its explanation uses, "loop+pearls"):
//                −log2 P(kind | genre) + log2 (the moves of that kind), P counted on the training half
//                (add-one): Fable's code, a symbol then the matching candidates
//   price        a logit on the solver's price (the solver takes the cheapest first, so this is near
//                its policy: what's left is ties and the order within a round)
//   kinds+price  the logit with a weight a kind
//
//   node --no-warnings puzzles/difficulty/code-v2.ts [rows dir, default references/proof-menus-solver]
import { readdirSync, readFileSync } from "node:fs";
import { REFS_DIR } from "./janko.ts";

const dir = process.argv[2] ?? `${REFS_DIR}proof-menus-solver/`;
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };
interface Cand { cost: number; kind: string; stage: number }
interface Move { genre: string; test: boolean; cands: Cand[]; chosen: number; tier: number }

const moves: Move[] = [], found: Record<string, [number, number, number]> = {};  // on the menu, of, splits
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
  for (const line of readFileSync(dir + f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const d = JSON.parse(line);
    if (!d.positions) continue;
    const test = hash(`split:${d.id}`) < 0.5, e = (found[d.genre] ??= [0, 0, 0]);
    for (const p of d.positions) {
      const nx = p.next[0];
      if (!nx) continue;
      e[1]++;
      if (nx.t >= 2) e[2]++;
      if (nx.item < 0) continue;
      e[0]++;
      // the distinct moves: items with the same facts are one, at the cheapest item's price and kind
      const byFacts = new Map<string, Cand>();
      let chosenKey = "";
      p.menu.forEach((it: any, i: number) => {
        const key = [...it.m].sort().join(" "), kind = [...new Set((it.cl as string[]).map((x) => x.split(" (")[0]))].sort().join("+");
        if (i === nx.item) chosenKey = key;
        const had = byFacts.get(key);
        if (!had || it.c < had.cost) byFacts.set(key, { cost: it.c, kind, stage: it.k });
      });
      const keys = [...byFacts.keys()];
      moves.push({ genre: d.genre, test, cands: keys.map((k) => byFacts.get(k)!), chosen: keys.indexOf(chosenKey), tier: nx.t });
    }
  }
}

const kindBits = (tr: Move[], te: Move[]) => {
  const count = new Map<string, number>();
  for (const m of tr) { const k = m.cands[m.chosen].kind; count.set(k, (count.get(k) ?? 0) + 1); }
  const kinds = new Set([...count.keys(), ...te.map((m) => m.cands[m.chosen].kind)]);
  return te.reduce((s, m) => {
    const k = m.cands[m.chosen].kind, same = m.cands.filter((c) => c.kind === k).length;
    return s - Math.log2(((count.get(k) ?? 0) + 1) / (tr.length + kinds.size)) + Math.log2(same);
  }, 0) / te.length;
};
// a conditional logit on price (and a weight a kind), plain gradient descent, a little L2
const fitLogit = (tr: Move[], kinds: boolean) => {
  const count = new Map<string, number>();
  if (kinds) for (const m of tr) for (const c of m.cands) count.set(c.kind, (count.get(c.kind) ?? 0) + 1);
  const index = new Map([...count.entries()].filter(([, n]) => n >= 5).map(([k], i) => [k, i + 1]));
  const kw = new Float64Array(index.size + 1), w = new Float64Array(2);
  const x = (c: Cand) => [c.cost, c.stage];
  const ki = (c: Cand) => index.get(c.kind) ?? 0;
  const util = (c: Cand) => w[0] * x(c)[0] + w[1] * x(c)[1] + (kinds ? kw[ki(c)] : 0);
  for (let it = 0; it < 300; it++) {
    const gw = new Float64Array(2), gk = new Float64Array(kw.length);
    for (const m of tr) {
      const u = m.cands.map(util), mx = Math.max(...u), e = u.map((v) => Math.exp(v - mx)), z = e.reduce((a, b) => a + b, 0);
      m.cands.forEach((c, i) => { const g = e[i] / z - (i === m.chosen ? 1 : 0), xs = x(c); gw[0] += g * xs[0]; gw[1] += g * xs[1]; if (kinds) gk[ki(c)] += g; });
    }
    for (let j = 0; j < 2; j++) w[j] -= 0.05 * (gw[j] / tr.length + 0.01 * w[j]);
    for (let k = 0; k < kw.length; k++) kw[k] -= 0.1 * (gk[k] / tr.length + 0.01 * kw[k]);
  }
  return (te: Move[]) => te.reduce((s, m) => {
    const u = m.cands.map(util), mx = Math.max(...u), z = u.reduce((a, v) => a + Math.exp(v - mx), 0);
    return s - (u[m.chosen] - mx - Math.log(z)) / Math.LN2;
  }, 0) / te.length;
};

console.log("genre                 steps  on menu  splits  moves  uniform  kinds  price  kinds+price  (bits a step, held-out half)");
for (const g of [...new Set(moves.map((m) => m.genre))].sort()) {
  const ms = moves.filter((m) => m.genre === g), tr = ms.filter((m) => !m.test), te = ms.filter((m) => m.test);
  if (te.length < 20 || tr.length < 20) continue;
  const [on, all, splits] = found[g];
  const uni = te.reduce((s, m) => s + Math.log2(m.cands.length), 0) / te.length;
  const avg = te.reduce((s, m) => s + m.cands.length, 0) / te.length;
  console.log(`${g.padEnd(20)} ${String(all).padStart(6)}  ${`${Math.round((100 * on) / all)}%`.padStart(7)}  ${`${Math.round((100 * splits) / all)}%`.padStart(6)}  ${avg.toFixed(0).padStart(5)}  ${uni.toFixed(2).padStart(7)}  ${kindBits(tr, te).toFixed(2).padStart(5)}  ${fitLogit(tr, false)(te).toFixed(2).padStart(5)}  ${fitLogit(tr, true)(te).toFixed(2).padStart(11)}`);
}
