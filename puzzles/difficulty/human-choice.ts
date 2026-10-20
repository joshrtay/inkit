// Which deduction does a person make next, out of everything available? (Phase 1 v2's first test.)
// From human-menus.ts's rows: at each position along a person's solve, the marks the menu can
// decide, and the person's next marks. A person's move is coded as a choice among the menu's marks
// (the facts are free: the decoder has the puzzle and the position), under a conditional logit
//
//   P(mark) ∝ exp(−β · cheapest price of a step deciding it − λ · distance from the last move)
//
// with β and λ fitted on half the puzzles and the bits reported on the other half, against the
// uniform choice (log2 of the menu's marks). Only marks of the kind a person records count as
// choices (Akari's records are bulbs: a no-bulb fact is never a recorded move). Moves the menu
// can't make are counted apart (the windows don't see them from there).
//
//   node --no-warnings puzzles/difficulty/human-choice.ts [rows dir, default references/proof-menus]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { REFS_DIR } from "./janko.ts";

const dir = process.argv[2] ?? `${REFS_DIR}proof-menus/`;
const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };
interface Cand { cost: number; dist: number; items: number; stage: number; kind: string }
interface Move { genre: string; test: boolean; cands: Cand[]; chosen: number }

const moves: Move[] = [], missed: Record<string, [number, number]> = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
  for (const line of readFileSync(dir + f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const d = JSON.parse(line);
    if (!d.positions) continue;
    const cols = d.cols as number, test = hash(`split:${d.id}`) < 0.5;  // salted: the fleet shards by the plain hash
    const cellOf = (mark: string) => { const m = /^(?:shaded|digit)\((\d+)/.exec(mark); return m ? +m[1] : null; };
    for (const p of d.positions) {
      // the menu's marks: each with its cheapest step, its windows' centre, how many steps decide it
      const marks = new Map<string, { cost: number; r: number; c: number; items: number; stage: number; value: string; kind: string }>();
      for (const it of p.menu) for (const fact of it.m as string[]) {
        const [mark, value] = fact.split("="), had = marks.get(mark);
        const r = (it.b[0] + it.b[2]) / 2, c = (it.b[1] + it.b[3]) / 2;
        // the step's kind: the rules its explanation uses ("loop+pearls"), the solver's own vocabulary
        const kind = [...new Set((it.cl as string[]).map((x) => x.split(" (")[0]))].sort().join("+");
        if (!had) marks.set(mark, { cost: it.c, r, c, items: 1, stage: it.k, value, kind });
        else { had.items++; if (it.c < had.cost) Object.assign(had, { cost: it.c, r, c, stage: it.k, kind }); }
      }
      let prev: { r: number; c: number } | null = null;
      const e = (missed[d.genre] ??= [0, 0]);
      for (const nx of p.next as { mark: string; item: number; known?: 1 }[]) {
        if (nx.known) continue;
        e[1]++;
        const target = marks.get(nx.mark);
        if (!target) { e[0]++; prev = null; continue; }
        // the choices: marks set to the value the person set (the kinds people record)
        const keys = [...marks.entries()].filter(([, v]) => v.value === target.value);
        const cands = keys.map(([, v]) => ({ cost: v.cost, dist: prev ? Math.hypot(v.r - prev.r, v.c - prev.c) : 0, items: v.items, stage: v.stage, kind: v.kind }));
        moves.push({ genre: d.genre, test, cands, chosen: keys.findIndex(([k]) => k === nx.mark) });
        prev = { r: target.r, c: target.c };
      }
    }
  }
}

const bits = (ms: Move[], beta: number, lambda: number) => {
  let s = 0;
  for (const m of ms) {
    const u = m.cands.map((c) => -beta * c.cost - lambda * c.dist), mx = Math.max(...u);
    const z = u.reduce((a, x) => a + Math.exp(x - mx), 0);
    s += -(u[m.chosen] - mx - Math.log(z)) / Math.LN2;
  }
  return s / ms.length;
};
const fitGrid = (ms: Move[], betas: number[], lambdas: number[]) => {
  let best = { beta: 0, lambda: 0, b: Infinity };
  for (const beta of betas) for (const lambda of lambdas) { const b = bits(ms, beta, lambda); if (b < best.b) best = { beta, lambda, b }; }
  return best;
};
// a fitted conditional logit: price, distance, how many steps decide the mark, and (with kinds) a
// weight for each kind of step, the kinds seen fewer than 5 times in training sharing one; plain
// gradient descent on the training half's mean bits, a little L2
const fitLogit = (tr: Move[], kinds: boolean) => {
  const count = new Map<string, number>();
  if (kinds) for (const m of tr) for (const c of m.cands) count.set(c.kind, (count.get(c.kind) ?? 0) + 1);
  const index = new Map([...count.entries()].filter(([, n]) => n >= 5).map(([k], i) => [k, i + 1]));
  const kw = new Float64Array(index.size + 1), w = new Float64Array(3);
  const x = (c: Cand) => [c.cost, c.dist, Math.log(c.items)];
  const ki = (c: Cand) => index.get(c.kind) ?? 0;
  const util = (c: Cand) => x(c).reduce((a, v, j) => a + w[j] * v, 0) + (kinds ? kw[ki(c)] : 0);
  const rate = 0.05;
  for (let it = 0; it < 300; it++) {
    const gw = new Float64Array(3), gk = new Float64Array(kw.length);
    for (const m of tr) {
      const u = m.cands.map(util), mx = Math.max(...u), e = u.map((v) => Math.exp(v - mx)), z = e.reduce((a, b) => a + b, 0);
      m.cands.forEach((c, i) => {
        const g = e[i] / z - (i === m.chosen ? 1 : 0), xs = x(c);
        for (let j = 0; j < 3; j++) gw[j] += g * xs[j];
        if (kinds) gk[ki(c)] += g;
      });
    }
    for (let j = 0; j < 3; j++) w[j] -= rate * (gw[j] / tr.length + 0.01 * w[j]);
    for (let k = 0; k < kw.length; k++) kw[k] -= 2 * rate * (gk[k] / tr.length + 0.01 * kw[k]);
  }
  return (te: Move[]) => te.reduce((s, m) => {
    const u = m.cands.map(util), mx = Math.max(...u), z = u.reduce((a, v) => a + Math.exp(v - mx), 0);
    return s - (u[m.chosen] - mx - Math.log(z)) / Math.LN2;
  }, 0) / te.length;
};
const B = [0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6], L = [0, 0.1, 0.2, 0.4, 0.7, 1, 1.5, 2];
console.log("genre        moves  missed   uniform  price  near  price+near  fitted  +kinds  (bits a move, held-out half; β, λ)");
for (const g of [...new Set(moves.map((m) => m.genre))].sort()) {
  const ms = moves.filter((m) => m.genre === g), tr = ms.filter((m) => !m.test), te = ms.filter((m) => m.test);
  if (te.length < 20) continue;
  const uni = te.reduce((s, m) => s + Math.log2(m.cands.length), 0) / te.length;
  const p = fitGrid(tr, B, [0]), n = fitGrid(tr, [0], L), pn = fitGrid(tr, B, L);
  const [miss, all] = missed[g];
  console.log(`${g.padEnd(12)} ${String(ms.length).padStart(5)}  ${(100 * miss / all).toFixed(0).padStart(5)}%  ${uni.toFixed(2).padStart(7)}  ${bits(te, p.beta, 0).toFixed(2).padStart(5)}  ${bits(te, 0, n.lambda).toFixed(2).padStart(4)}  ${bits(te, pn.beta, pn.lambda).toFixed(2).padStart(10)}  ${fitLogit(tr, false)(te).toFixed(2).padStart(6)}  ${fitLogit(tr, true)(te).toFixed(2).padStart(6)}  (β ${pn.beta}, λ ${pn.lambda})`);
}
if (!existsSync(dir)) console.error(`no rows in ${dir}`);
// diagnostics: where the chosen mark ranks among the choices by price and by distance (0 first, 1 last)
for (const g of [...new Set(moves.map((m) => m.genre))].sort()) {
  const ms = moves.filter((m) => m.genre === g && m.cands.length > 1);
  const pct = (key: "cost" | "dist", only?: (m: Move) => boolean) => {
    const xs = ms.filter((m) => !only || only(m)).map((m) => { const v = m.cands[m.chosen][key]; return m.cands.filter((c) => c[key] < v).length / (m.cands.length - 1); });
    return (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
  };
  console.log(`${g}: the person's move ranks ${pct("cost")} by price, ${pct("dist", (m) => m.cands.some((c) => c.dist > 0))} by distance (0.50 is chance)`);
}
