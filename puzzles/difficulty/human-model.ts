// The human move model v1 (docs/research-trajectory.md, step 1): which mark a person settles next,
// out of everything the solver's windows find, as a conditional logit on the cheapest step deciding
// the mark (its price), the distance of that step from the person's last move, log of how many steps
// decide it, and a weight for each kind of step (its rules, "adjacent-count+lit"). Fitted on
// human-menus.ts's rows (the menus along Janko's recorded solves); human-choice.ts scores it on a
// held-out half, and deduce.ts's Options.simulate samples a person's solve from it.
//
// Run as a script, it fits every type on all its rows, and a generic model (no kinds) on all types
// pooled, for types without recordings, and writes puzzles/difficulty/human-model.json.
//
//   node --no-warnings puzzles/difficulty/human-model.ts [rows dir, default references/proof-menus]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { MoveModel } from "./deduce.ts";
import { REFS_DIR } from "./janko.ts";

export interface Cand { cost: number; dist: number; items: number; stage: number; kind: string }
export interface Move { genre: string; test: boolean; cands: Cand[]; chosen: number }

const hash = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return (h >>> 0) / 2 ** 32; };

/** People's moves from human-menus.ts's rows, each a choice among the menu's marks set to the value
 *  the person set (the kinds people record: Akari's records are bulbs), and per type the moves the
 *  menu didn't have and all moves */
export function loadMoves(dir: string) {
  const moves: Move[] = [], missed: Record<string, [number, number]> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl") && x !== "misses.jsonl")) {
    for (const line of readFileSync(dir + f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const d = JSON.parse(line);
      if (!d.positions) continue;
      const test = hash(`split:${d.id}`) < 0.5;  // salted: the fleet shards by the plain hash
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
          const keys = [...marks.entries()].filter(([, v]) => v.value === target.value);
          const cands = keys.map(([, v]) => ({ cost: v.cost, dist: prev ? Math.hypot(v.r - prev.r, v.c - prev.c) : 0, items: v.items, stage: v.stage, kind: v.kind }));
          moves.push({ genre: d.genre, test, cands, chosen: keys.findIndex(([k]) => k === nx.mark) });
          prev = { r: target.r, c: target.c };
        }
      }
    }
  }
  return { moves, missed };
}

/** A fitted conditional logit: price, distance, log of the steps deciding the mark, and (with kinds)
 *  a weight for each kind of step, the kinds seen fewer than 5 times in training sharing one
 *  ("other"); plain gradient descent on the mean bits, a little L2 */
export function fitLogit(tr: Move[], kinds: boolean): MoveModel {
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
  const r = (v: number) => +v.toFixed(4);
  return { cost: r(w[0]), dist: r(w[1]), items: r(w[2]), ...(kinds ? { kinds: Object.fromEntries([...index].map(([k, i]) => [k, r(kw[i])])), other: r(kw[0]) } : {}) };
}

/** Mean bits a move under a model, on moves read as loadMoves reads them */
export function bitsOf(model: MoveModel, te: Move[]) {
  const util = (c: Cand) => model.cost * c.cost + model.dist * c.dist + model.items * Math.log(c.items) + (model.kinds?.[c.kind] ?? model.other ?? 0);
  return te.reduce((s, m) => {
    const u = m.cands.map(util), mx = Math.max(...u), z = u.reduce((a, v) => a + Math.exp(v - mx), 0);
    return s - (u[m.chosen] - mx - Math.log(z)) / Math.LN2;
  }, 0) / te.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? `${REFS_DIR}proof-menus/`;
  const { moves } = loadMoves(dir);
  const out: Record<string, MoveModel & { moves: number }> = {};
  for (const g of [...new Set(moves.map((m) => m.genre))].sort()) {
    const ms = moves.filter((m) => m.genre === g);
    out[g] = { ...fitLogit(ms, true), moves: ms.length };
    console.log(`${g}: ${ms.length} moves, cost ${out[g].cost}, dist ${out[g].dist}, items ${out[g].items}, ${Object.keys(out[g].kinds ?? {}).length} kinds`);
  }
  // the generic model: every type's moves, weighted equally by type
  const per = Math.min(...Object.values(out).map((m) => m.moves));
  const pooled = Object.keys(out).flatMap((g) => moves.filter((m) => m.genre === g).sort((a, b) => hash(JSON.stringify(a.cands[a.chosen])) - hash(JSON.stringify(b.cands[b.chosen]))).slice(0, Math.max(per, 2000)));
  out.generic = { ...fitLogit(pooled, false), moves: pooled.length };
  console.log(`generic: ${pooled.length} moves, cost ${out.generic.cost}, dist ${out.generic.dist}, items ${out.generic.items}`);
  writeFileSync(new URL("./human-model.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
}
