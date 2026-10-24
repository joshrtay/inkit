// Phase 1 of docs/research-trajectory.md: the cost model's terms (proof-cost.ts) on the proofs
// proof-paths.ts kept (references/proof/), each against what people did, as separate checks:
//
//   likes       Puzzle Square JP likes per solver, the site's difficulty held fixed (within type)
//   judges      the labeller pilot's places: Fable on 72 puzzles, Opus on 372 (difficulty held fixed)
//   experts     Janko's recorded solves: does the expert settle marks in the proof's order, against
//               the usual (greedy) path's; and does a step's cost or reach put it later than the
//               proof's own order would (per step, the proof position held fixed), per solver
//   difficulty  Beast Academy's order within sets and Tatham's grades; the site's difficulty
//
// Then cost model v1: the terms' weights fitted on the Puzzle Square JP sets (ridge regression on
// within-type ranks, the other target's control regressed out), judged out of fold and on the
// checks they weren't fitted on. Prints markdown; writes references/proof/fit.json.
//
//   node --no-warnings puzzles/difficulty/proof-cost-fit.ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spearman } from "./calibrate.ts";
import { JANKO_DIR, readType } from "./janko.ts";
import { COST_VERSION, stepSize, geometry, termsOf, TERMS, type Term, type Terms } from "./proof-cost.ts";
import { PROOF_DIR, type Proof } from "./proof-paths.ts";

// ---- statistics ----
const mean = (xs: number[]) => { const f = xs.filter(Number.isFinite); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN; };
const rank = (xs: number[]) => {
  const o = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(xs.length);
  for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; }
  return r;
};
const pearson = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
};
/** least squares residual of y on the columns of X (plus an intercept) */
function residual(y: number[], X: number[][]): number[] {
  if (!X.length) { const m = mean(y); return y.map((v) => v - m); }
  const k = X.length + 1, n = y.length, cols = [new Array(n).fill(1), ...X];
  const A = cols.map((ci) => cols.map((cj) => ci.reduce((s, v, i) => s + v * cj[i], 0)));
  const b = cols.map((ci) => ci.reduce((s, v, i) => s + v * y[i], 0));
  const beta = solve(A.map((r, i) => r.map((v, j) => v + (i === j && i > 0 ? 1e-9 : 0))), b);
  return y.map((v, i) => v - cols.reduce((s, c, j) => s + beta[j] * c[i], 0));
  function solve(M: number[][], v: number[]) {
    const a = M.map((r, i) => [...r, v[i]]);
    for (let c = 0; c < k; c++) {
      let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      [a[c], a[p]] = [a[p], a[c]];
      if (Math.abs(a[c][c]) < 1e-12) continue;
      for (let r = 0; r < k; r++) if (r !== c) { const f = a[r][c] / a[c][c]; for (let j = c; j <= k; j++) a[r][j] -= f * a[c][j]; }
    }
    return a.map((r, i) => (Math.abs(r[i]) < 1e-12 ? 0 : r[k] / r[i]));
  }
}
/** Spearman of a and b with the controls held fixed (ranks, residuals, Pearson) */
const partial = (a: number[], b: number[], controls: number[][] = []) => {
  const ok = a.map((_, i) => Number.isFinite(a[i]) && Number.isFinite(b[i]) && controls.every((c) => Number.isFinite(c[i])));
  const f = (xs: number[]) => xs.filter((_, i) => ok[i]);
  const C = controls.map((c) => rank(f(c)));
  return f(a).length < 6 ? NaN : pearson(residual(rank(f(a)), C), residual(rank(f(b)), C));
};
let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
/** the mean over groups of a statistic, with a bootstrap 95% interval (puzzles resampled within groups) */
function pooled<T>(groups: T[][], stat: (g: T[]) => number, reps = 400): { m: number; lo: number; hi: number } {
  const m = mean(groups.map(stat));
  const bs: number[] = [];
  for (let r = 0; r < reps; r++) bs.push(mean(groups.map((g) => stat(g.map(() => g[Math.floor(rand() * g.length)])))));
  bs.sort((a, b) => a - b);
  const f = bs.filter(Number.isFinite);
  return { m, lo: f[Math.floor(0.025 * f.length)], hi: f[Math.floor(0.975 * f.length)] };
}
const f2 = (x: number) => (Number.isFinite(x) ? (x >= 0 ? " " : "") + x.toFixed(2) : "  – ");
const ci = (s: { m: number; lo: number; hi: number }) => `${f2(s.m)} (${f2(s.lo)}, ${f2(s.hi)})${s.lo > 0 || s.hi < 0 ? " *" : ""}`;

// ---- the proofs ----
const load = (set: string): Proof[] => {
  const f = `${PROOF_DIR}${set}.jsonl`;
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
};
interface Row { p: Proof; t: Terms; estimate: number; cells: number }
const rows = (set: string): Row[] => load(set).flatMap((p) => { const t = termsOf(p); return t ? [{ p, t, estimate: p.profile!.estimate, cells: p.rows * p.cols }] : []; });
const sets = readdirSync(PROOF_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => f.replace(/\.jsonl$/, ""));
const out: string[] = [], json: Record<string, unknown> = { version: COST_VERSION };
const say = (s = "") => { out.push(s); console.log(s); };
const coverage = (set: string) => { const all = load(set), ok = all.filter((p) => termsOf(p)); return `${ok.length} of ${all.length} (cap ${all.filter((p) => p.cap).length})`; };

say(`# Phase 1: the cost model's terms against people\n\nCost model ${COST_VERSION}. Partial Spearman within type, mean of types, bootstrap 95% interval; * the interval excludes 0.\n`);

// ---- likes ----
const psjpSets = sets.filter((s) => s.startsWith("psjp-"));
const psjp = psjpSets.map((s) => rows(s).filter((r) => Number(r.p.meta.solvers) >= 20));
const perSolver = (r: Row) => Number(r.p.meta.likes) / Number(r.p.meta.solvers);
const diff = (r: Row) => Number(r.p.meta.difficulty);
const FEATURES: (Term | "estimate")[] = [...TERMS, "estimate"];
const val = (r: Row, k: Term | "estimate") => (k === "estimate" ? r.estimate : r.t[k]);
if (psjp.length) {
  say(`## Likes per solver, the site's difficulty held fixed (Puzzle Square JP, puzzles with 20 or more solvers)\n`);
  say(`Coverage: ${psjpSets.map((s) => `${s.slice(5)} ${coverage(s)}`).join("; ")}. "estimate" is our usual difficulty estimate on the same proof (the old baseline).\n`);
  say(`| term | ${psjpSets.map((s) => s.slice(5)).join(" | ")} | mean of types (95%) | + cells held fixed |`);
  say(`|---|${psjpSets.map(() => "---").join("|")}|---|---|`);
  const likes: Record<string, unknown> = {};
  for (const k of FEATURES) {
    const per = psjp.map((g) => partial(g.map((r) => val(r, k)), g.map(perSolver), [g.map(diff)]));
    const s = pooled(psjp, (g) => partial(g.map((r) => val(r, k)), g.map(perSolver), [g.map(diff)]));
    const s2 = pooled(psjp, (g) => partial(g.map((r) => val(r, k)), g.map(perSolver), [g.map(diff), g.map((r) => r.cells)]));
    likes[k] = { per, pooled: s, withCells: s2 };
    say(`| ${k} | ${per.map(f2).join(" | ")} | ${ci(s)} | ${ci(s2)} |`);
  }
  json.likes = likes;
  say(`\nCells alone: ${psjp.map((g) => f2(partial(g.map((r) => r.cells), g.map(perSolver), [g.map(diff)]))).join(", ")}; n ${psjp.map((g) => g.length).join(", ")}.\n`);
}

// ---- difficulty, the site's ----
if (psjp.length) {
  say(`## The site's difficulty (Spearman within type)\n`);
  say(`| term | ${psjpSets.map((s) => s.slice(5)).join(" | ")} | mean (95%) |`);
  say(`|---|${psjpSets.map(() => "---").join("|")}|---|`);
  for (const k of FEATURES) {
    const st = (g: Row[]) => partial(g.map((r) => val(r, k)), g.map(diff));
    say(`| ${k} | ${psjp.map(st).map(f2).join(" | ")} | ${ci(pooled(psjp, st))} |`);
  }
  say();
}

// ---- cost model v1: ridge on within-type ranks, out of fold ----
const KEEP: Term[] = ["sumPerMark", "peak", "sizePerMark", "reuse", "shapes", "span", "jump", "splitShare", "hinges", "gap", "peakAt", "aha", "dead", "openMean", "oneWay", "busywork", "usage", "steps"];
function design(g: Row[], control: number[][]) {
  // each term ranked within the type, the control regressed out, standardised
  const z = (xs: number[]) => { const m = mean(xs), s = Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1; return xs.map((x) => (x - m) / s); };
  const C = control.map(rank);
  return KEEP.map((k) => z(residual(rank(g.map((r) => (Number.isFinite(r.t[k]) ? r.t[k] : 0))), C)));
}
function ridge(X: number[][], y: number[], lambda: number): number[] {
  // (XᵀX + λI) β = Xᵀy, no intercept (everything centred)
  const k = X.length, A = X.map((a) => X.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
  for (let i = 0; i < k; i++) A[i][i] += lambda;
  const b = X.map((a) => a.reduce((s, v, i) => s + v * y[i], 0));
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r, i) => r[k] / r[i]);
}
/** fit on every type's rows together (each type's own ranks), out-of-fold predictions by 5 folds */
function fitV1(groups: Row[][], target: (r: Row) => number, control: (g: Row[]) => number[][], lambda: number) {
  const Xs = groups.map((g) => design(g, control(g)));
  const ys = groups.map((g) => { const C = control(g).map(rank); const y = residual(rank(g.map(target)), C); const s = Math.sqrt(mean(y.map((v) => v * v))) || 1; return y.map((v) => v / s); });
  const fold = groups.map((g) => g.map((_, i) => i % 5));
  const pred = groups.map((g) => new Array<number>(g.length).fill(NaN));
  for (let f = 0; f < 5; f++) {
    const X: number[][] = KEEP.map(() => []), y: number[] = [];
    groups.forEach((g, gi) => g.forEach((_, i) => { if (fold[gi][i] !== f) { KEEP.forEach((_, k) => X[k].push(Xs[gi][k][i])); y.push(ys[gi][i]); } }));
    const beta = ridge(X, y, lambda);
    groups.forEach((g, gi) => g.forEach((_, i) => { if (fold[gi][i] === f) pred[gi][i] = KEEP.reduce((s, _, k) => s + beta[k] * Xs[gi][k][i], 0); }));
  }
  const X: number[][] = KEEP.map(() => []), y: number[] = [];
  groups.forEach((g, gi) => g.forEach((_, i) => { KEEP.forEach((_, k) => X[k].push(Xs[gi][k][i])); y.push(ys[gi][i]); }));
  const beta = ridge(X, y, lambda);
  const oof = groups.map((g, gi) => partial(pred[gi], g.map(target), control(g)));
  return { beta: Object.fromEntries(KEEP.map((k, i) => [k, +beta[i].toFixed(3)])), oof };
}
/** a fitted score on new rows: the weights over the rows' own within-set ranks */
const scoreWith = (beta: Record<string, number>, g: Row[], control: number[][]) => {
  const X = design(g, control);
  return g.map((_, i) => KEEP.reduce((s, k, j) => s + (beta[k] ?? 0) * X[j][i], 0));
};
let v1: { interest?: Record<string, number>; difficulty?: Record<string, number> } = {};
if (psjp.length) {
  say(`## Cost model v1: weights (ridge on within-type ranks, λ chosen out of fold)\n`);
  for (const [name, target, control] of [["interest", perSolver, (g: Row[]) => [g.map(diff)]], ["difficulty", diff, (_: Row[]) => [] as number[][]]] as const) {
    let best: ReturnType<typeof fitV1> | null = null, bestL = 0;
    for (const L of [1, 10, 100, 1000]) { const r = fitV1(psjp, target, control, L); if (!best || mean(r.oof) > mean(best.oof)) { best = r; bestL = L; } }
    v1[name] = best!.beta;
    const top = Object.entries(best!.beta).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    say(`**${name}** (${name === "interest" ? "likes per solver, difficulty held fixed" : "the site's difficulty"}; λ ${bestL}): out of fold ${psjpSets.map((s, i) => `${s.slice(5)} ${f2(best!.oof[i])}`).join(", ")}; mean ${f2(mean(best!.oof))}.`);
    say(`Weights, largest first: ${top.map(([k, b]) => `${k} ${b > 0 ? "+" : ""}${b.toFixed(2)}`).join(", ")}.\n`);
  }
  json.v1 = v1;
}

// ---- judges: the labeller pilot ----
const pilot = rows("pilot");
if (pilot.length) {
  say(`## The labeller pilot's judges, the site's difficulty held fixed\n`);
  say(`Coverage ${coverage("pilot")}. Each judge's place within its batch of 10 (0 least enjoyed, 1 most); likes on the same puzzles for reference. v1 interest uses the weights fitted on the Puzzle Square JP sets (the pilot's puzzles left out of the fit only in that they are a different sample; the sets overlap little).\n`);
  const types = [...new Set(pilot.map((r) => String(r.p.meta.type)))].sort();
  const by = (judge: string) => types.map((t) => pilot.filter((r) => r.p.meta.type === t && Number.isFinite(Number(r.p.meta[`${judge}_place`]))));
  for (const judge of ["fable", "opus", "likes"]) {
    const groups = judge === "likes" ? by("opus") : by(judge);
    const y = (r: Row) => (judge === "likes" ? perSolver(r) : Number(r.p.meta[`${judge}_place`]));
    say(`**${judge === "likes" ? "Likes per solver (the 372)" : judge === "fable" ? "Fable (the pilot's 72)" : "Opus (372 at scale)"}**, n ${groups.map((g, i) => `${types[i]} ${g.length}`).join(", ")}\n`);
    say(`| term | ${types.join(" | ")} | mean (95%) |`);
    say(`|---|${types.map(() => "---").join("|")}|---|`);
    const feats: (Term | "estimate" | "v1" | "likes")[] = [...FEATURES, ...(v1.interest ? ["v1" as const] : []), ...(judge === "likes" ? [] : ["likes" as const])];
    for (const k of feats) {
      const st = (g: Row[]) => {
        if (g.length < 6) return NaN;
        const x = k === "v1" ? (v1.interest ? scoreWith(v1.interest, g, [g.map(diff)]) : g.map(() => NaN)) : k === "likes" ? g.map(perSolver) : g.map((r) => val(r, k));
        return partial(x, g.map(y), [g.map(diff)]);
      };
      say(`| ${k} | ${groups.map(st).map(f2).join(" | ")} | ${ci(pooled(groups.filter((g) => g.length >= 6), st))} |`);
    }
    say();
  }
}

// ---- experts: Janko ----
const jankoSets = sets.filter((s) => s.startsWith("janko-"));
if (jankoSets.length) {
  say(`## Janko's experts: do they follow the proof?\n`);
  say(`Per puzzle, Spearman of the order the expert settled marks with the proof's order (the cheapest-only proof; the usual greedy path from janko-order.ts's results, where kept). Per step, the expert's time for the step's marks against the step's terms with the proof position held fixed: positive means the expert left such steps for later than the proof does.\n`);
  say(`| type | puzzles | proof order | greedy order | step cost | step size | step reach | jump from the last step |`);
  say(`|---|---|---|---|---|---|---|---|`);
  const bySolver = new Map<string, { proof: number[]; greedy: number[]; cost: number[]; size: number[] }>();
  const allJ: Record<string, unknown> = {};
  for (const set of jankoSets) {
    const type = set.slice(6);
    const settled = new Map(readType(type).map(({ f, j }) => [f, j]));
    const greedyF = `${JANKO_DIR}order-${type}.json`;
    const greedy = new Map<string, number>(existsSync(greedyF) ? (JSON.parse(readFileSync(greedyF, "utf8")) as { f: string; rhoFine: number }[]).map((r) => [r.f, r.rhoFine]) : []);
    const res: { proof: number; greedy: number; cost: number; size: number; reach: number; jump: number; solver: string }[] = [];
    for (const { p } of rows(set)) {
      const j = settled.get(String(p.meta.file));
      if (!j) continue;
      const S = p.steps!.filter((s) => !s.ch);
      // each mark's place in the proof: its step's index, first time decided
      const at = new Map<string, number>();
      S.forEach((s, i) => s.m.forEach((m) => { const k = m.replace(/=\d$/, ""); if (!at.has(k)) at.set(k, i); }));
      const marks = [...j.settled.keys()].filter((m) => at.has(m));
      if (marks.length < 3) continue;
      const proofRho = spearman(marks.map((m) => j.settled.get(m)!), marks.map((m) => at.get(m)!));
      // per step: the expert's mean settle index over the step's marks they settled
      const st: { pos: number; t: number; c: number; size: number; reach: number; jump: number }[] = [];
      let last: ReturnType<typeof geometry> | null = null;
      S.forEach((s, i) => {
        const g = geometry(s, p.cols);
        const ts = s.m.map((m) => j.settled.get(m.replace(/=\d$/, ""))).filter((x): x is number => x !== undefined);
        if (ts.length) st.push({ pos: i, t: mean(ts), c: s.c, size: stepSize(s), reach: g.diag, jump: last && Number.isFinite(last.cx) ? Math.hypot(g.cx - last.cx, g.cy - last.cy) : 0 });
        last = g;
      });
      const pos = [st.map((x) => x.pos)];
      const r = { proof: proofRho, greedy: greedy.get(String(p.meta.file)) ?? NaN, cost: partial(st.map((x) => x.c), st.map((x) => x.t), pos), size: partial(st.map((x) => x.size), st.map((x) => x.t), pos), reach: partial(st.map((x) => x.reach), st.map((x) => x.t), pos), jump: partial(st.map((x) => x.jump), st.map((x) => x.t), pos), solver: String(p.meta.solver) };
      res.push(r);
      if (!bySolver.has(r.solver)) bySolver.set(r.solver, { proof: [], greedy: [], cost: [], size: [] });
      const b = bySolver.get(r.solver)!; b.proof.push(r.proof); b.greedy.push(r.greedy); b.cost.push(r.cost); b.size.push(r.size);
    }
    allJ[type] = res;
    const m = (k: keyof (typeof res)[number]) => f2(mean(res.map((r) => r[k] as number)));
    say(`| ${type} | ${res.length} of ${load(set).length} | ${m("proof")} | ${m("greedy")} | ${m("cost")} | ${m("size")} | ${m("reach")} | ${m("jump")} |`);
  }
  say(`\nBy solver (5 or more puzzles): ${[...bySolver].filter(([, v]) => v.proof.length >= 5).sort((a, b) => b[1].proof.length - a[1].proof.length).map(([s, v]) => `${s} ${v.proof.length}: proof ${f2(mean(v.proof))}, greedy ${f2(mean(v.greedy))}, step cost ${f2(mean(v.cost))}`).join("; ")}.\n`);
  json.janko = allJ;
}

// ---- difficulty: Beast Academy and Tatham ----
const ba = rows("ba");
if (ba.length) {
  say(`## Beast Academy: within each set, against its order (mean Spearman over sets with 3 or more solved); and against tier\n`);
  say(`Coverage ${coverage("ba")}.\n`);
  const types = [...new Set(ba.map((r) => String(r.p.meta.type)))].sort();
  const feats: (Term | "estimate" | "v1")[] = ["sum", "peak", "size", "sumPerMark", "splits", "steps", "estimate", ...(v1.difficulty ? ["v1" as const] : [])];
  say(`| term | ${types.map((t) => `${t} within sets | ${t} tier`).join(" | ")} |`);
  say(`|---|${types.map(() => "---|---").join("|")}|`);
  for (const k of feats) {
    const cells = types.flatMap((t) => {
      const g = ba.filter((r) => r.p.meta.type === t);
      const x = k === "v1" ? (v1.difficulty ? scoreWith(v1.difficulty, g, []) : g.map(() => NaN)) : g.map((r) => val(r, k));
      const within: number[] = [];
      for (const s of new Set(g.map((r) => String(r.p.meta.set)))) {
        const idx = g.map((r, i) => [r, i] as const).filter(([r]) => r.p.meta.set === s);
        if (idx.length >= 3) within.push(spearman(idx.map(([, i]) => x[i]), idx.map(([r]) => Number(r.p.meta.at))));
      }
      return [`${f2(mean(within))} (${within.length})`, f2(spearman(x, g.map((r) => Number(r.p.meta.tier))))];
    });
    say(`| ${k} | ${cells.join(" | ")} |`);
  }
  say();
}
const tat = rows("tatham");
if (tat.length) {
  say(`## Tatham's grades (Spearman within each game and size)\n`);
  say(`Coverage ${coverage("tatham")}.\n`);
  const keys = [...new Set(tat.map((r) => `${r.p.meta.game} ${r.p.meta.size}`))].sort();
  const feats: (Term | "estimate" | "v1")[] = ["sum", "peak", "size", "sumPerMark", "splits", "steps", "estimate", ...(v1.difficulty ? ["v1" as const] : [])];
  say(`| term | ${keys.join(" | ")} | mean |`);
  say(`|---|${keys.map(() => "---").join("|")}|---|`);
  for (const k of feats) {
    const per = keys.map((key) => {
      const g = tat.filter((r) => `${r.p.meta.game} ${r.p.meta.size}` === key);
      const x = k === "v1" ? (v1.difficulty ? scoreWith(v1.difficulty, g, []) : g.map(() => NaN)) : g.map((r) => val(r, k));
      return g.length >= 6 ? spearman(x, g.map((r) => Number(r.p.meta.grade))) : NaN;
    });
    say(`| ${k} | ${per.map(f2).join(" | ")} | ${f2(mean(per))} |`);
  }
  say(`\nn: ${keys.map((key) => `${key} ${tat.filter((r) => `${r.p.meta.game} ${r.p.meta.size}` === key).length}`).join(", ")}.\n`);
}

writeFileSync(`${PROOF_DIR}fit.json`, JSON.stringify(json, null, 1));
writeFileSync(`${PROOF_DIR}fit.md`, out.join("\n") + "\n");
