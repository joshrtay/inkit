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
import { existsSync } from "node:fs";
import { bitsOf, fitLogit, loadMoves, type Move } from "./human-model.ts";
import { REFS_DIR } from "./janko.ts";

const dir = process.argv[2] ?? `${REFS_DIR}proof-menus/`;
const { moves, missed } = loadMoves(dir);

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
const B = [0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6], L = [0, 0.1, 0.2, 0.4, 0.7, 1, 1.5, 2];
console.log("genre        moves  missed   uniform  price  near  price+near  fitted  +kinds  (bits a move, held-out half; β, λ)");
for (const g of [...new Set(moves.map((m) => m.genre))].sort()) {
  const ms = moves.filter((m) => m.genre === g), tr = ms.filter((m) => !m.test), te = ms.filter((m) => m.test);
  if (te.length < 20) continue;
  const uni = te.reduce((s, m) => s + Math.log2(m.cands.length), 0) / te.length;
  const p = fitGrid(tr, B, [0]), n = fitGrid(tr, [0], L), pn = fitGrid(tr, B, L);
  const [miss, all] = missed[g];
  console.log(`${g.padEnd(12)} ${String(ms.length).padStart(5)}  ${(100 * miss / all).toFixed(0).padStart(5)}%  ${uni.toFixed(2).padStart(7)}  ${bits(te, p.beta, 0).toFixed(2).padStart(5)}  ${bits(te, 0, n.lambda).toFixed(2).padStart(4)}  ${bits(te, pn.beta, pn.lambda).toFixed(2).padStart(10)}  ${bitsOf(fitLogit(tr, false), te).toFixed(2).padStart(6)}  ${bitsOf(fitLogit(tr, true), te).toFixed(2).padStart(6)}  (β ${pn.beta}, λ ${pn.lambda})`);
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
