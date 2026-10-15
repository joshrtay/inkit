// How strong is each Puzzle Square JP setter? research-reputation.md's creator standing, run on the
// site's own numbers (data.json from bay-puz/psjp: per puzzle its kind, variation, setter-chosen
// difficulty 1–5, setter id, likes favorite_n and solves answered_n).
//
// Per puzzle, a Bayesian-averaged like rate with the difficulty held fixed:
//   q_i = (likes_i + m·μ_c) / (solves_i + m),  m = 10 solves,
//   μ_c = pooled like rate of the puzzle's cell c = kind × variation × difficulty
//         (a cell under MIN_CELL puzzles falls back to kind × variation, then to the whole site),
//   r_i = ln(q_i / μ_c): how far above its cell's par the puzzle is, as a log ratio, so genres and
//         levels with different like rates compare.
// Per setter, pooled with a second shrinkage toward par (m2 = 5 puzzles):
//   S_u = Σ r_i / (n_u + m2),  reported as exp(S_u), the setter's like rate as a multiple of par.
// Every solver weighs 1 (the site gives counts, not who liked), and likes are capped at solves.
//
// Checks: split-half reliability (each setter's puzzles alternately by date), whether a setter's
// earlier score predicts their later puzzles, the share of puzzle variance that is the setter's,
// how far holding difficulty fixed moves the ranking, and the same with the registration year
// also held fixed (the site's like rates drift as it grows).
//
//   node puzzles/difficulty/setter-score.ts
//   → references/psjp/setter-scores.json (local only), a summary on stdout
import { readFileSync, writeFileSync } from "node:fs";
import { REFS_DIR } from "./janko.ts";

const M = 10, M2 = 5, MIN_CELL = 20;
const dir = `${REFS_DIR}psjp/`;

interface Raw { kind: number; difficulty: number; variation: number; registered: string; user: number; favorite_n: number; answered_n: number; id: string }
interface P { id: string; user: number; genre: string; level: number; year: string; date: string; likes: number; solves: number }

const data = JSON.parse(readFileSync(`${dir}data.json`, "utf8")) as Record<string, Raw>;
const kinds = JSON.parse(readFileSync(`${dir}kind.json`, "utf8")) as Record<string, { name_e: string }>;
const ps: P[] = Object.values(data).filter((p) => p.answered_n > 0).map((p) => ({
  id: p.id, user: p.user, genre: `${p.kind}/${p.variation}`, level: p.difficulty, year: p.registered.slice(0, 4),
  date: p.registered, likes: Math.min(p.favorite_n, p.answered_n), solves: p.answered_n,
}));

// ---- par per cell, with fallbacks ----
type CellOf = (p: P) => string[];
function parFor(cellOf: CellOf): (p: P) => number {
  const tally = new Map<string, { l: number; s: number; n: number }>();
  for (const p of ps) for (const c of cellOf(p)) {
    const t = tally.get(c) ?? { l: 0, s: 0, n: 0 };
    t.l += p.likes; t.s += p.solves; t.n++; tally.set(c, t);
  }
  return (p) => {
    for (const c of cellOf(p)) { const t = tally.get(c)!; if (t.n >= MIN_CELL || c === "all") return t.l / t.s; }
    return NaN;
  };
}
const byLevel: CellOf = (p) => [`${p.genre}/${p.level}`, p.genre, "all"];
const byLevelYear: CellOf = (p) => [`${p.genre}/${p.level}/${p.year}`, `${p.genre}/${p.level}`, p.genre, "all"];
const flat: CellOf = () => ["all"];

const residual = (par: (p: P) => number) => (p: P) => {
  const mu = par(p);
  return Math.log((p.likes + M * mu) / (p.solves + M) / mu);
};

// ---- per setter ----
function score(items: P[], r: (p: P) => number) {
  const by = new Map<number, number[]>();
  for (const p of items) { const xs = by.get(p.user) ?? []; xs.push(r(p)); by.set(p.user, xs); }
  const out = new Map<number, { n: number; s: number; se: number }>();
  for (const [u, xs] of by) {
    const sum = xs.reduce((a, b) => a + b, 0), mean = sum / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
    out.set(u, { n: xs.length, s: sum / (xs.length + M2), se: (xs.length > 1 ? sd : 0.5) / Math.sqrt(xs.length + M2) });
  }
  return out;
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}
function pearson(a: number[], b: number[]) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db);
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

const rLevel = residual(parFor(byLevel)), rYear = residual(parFor(byLevelYear)), rFlat = residual(parFor(flat));
const main = score(ps, rLevel);

// split-half: each setter's puzzles by date, alternately
const sorted = [...ps].sort((a, b) => a.date.localeCompare(b.date));
const seen = new Map<number, number>(), halfA: P[] = [], halfB: P[] = [];
for (const p of sorted) { const k = seen.get(p.user) ?? 0; (k % 2 ? halfB : halfA).push(p); seen.set(p.user, k + 1); }
function splitHalf(r: (p: P) => number, minEach: number) {
  const a = score(halfA, r), b = score(halfB, r), xs: number[] = [], ys: number[] = [];
  for (const [u, sa] of a) { const sb = b.get(u); if (sb && sa.n >= minEach && sb.n >= minEach) { xs.push(sa.s); ys.push(sb.s); } }
  const rho = spearman(xs, ys);
  return { setters: xs.length, spearman: r3(rho), fullLengthSpearmanBrown: r3(2 * rho / (1 + rho)) };
}

// earlier predicts later: score from puzzles before the cut, judged on each later puzzle
function forward(cut: string, minBefore: number, r = rLevel) {
  const before = score(ps.filter((p) => p.date < cut), r), xs: number[] = [], ys: number[] = [];
  for (const p of ps) if (p.date >= cut) { const s = before.get(p.user); if (s && s.n >= minBefore) { xs.push(s.s); ys.push(r(p)); } }
  return { cut, laterPuzzles: xs.length, setters: new Set(ps.filter((p) => p.date >= cut && (before.get(p.user)?.n ?? 0) >= minBefore).map((p) => p.user)).size, spearman: r3(spearman(xs, ys)) };
}

// share of puzzle-level variance between setters (one-way ANOVA ICC, setters with ≥ 5 puzzles)
function icc(r: (p: P) => number) {
  const by = new Map<number, number[]>();
  for (const p of ps) { const xs = by.get(p.user) ?? []; xs.push(r(p)); by.set(p.user, xs); }
  const groups = [...by.values()].filter((xs) => xs.length >= 5);
  const all = groups.flat(), N = all.length, k = groups.length, grand = all.reduce((a, b) => a + b, 0) / N;
  let ssb = 0, ssw = 0;
  for (const g of groups) { const m = g.reduce((a, b) => a + b, 0) / g.length; ssb += g.length * (m - grand) ** 2; for (const x of g) ssw += (x - m) ** 2; }
  const msb = ssb / (k - 1), msw = ssw / (N - k), n0 = (N - groups.reduce((a, g) => a + g.length ** 2, 0) / N) / (k - 1);
  return r3((msb - msw) / (msb + (n0 - 1) * msw));
}

function rankAgreement(r: (p: P) => number, minN: number) {
  const other = score(ps, r), xs: number[] = [], ys: number[] = [];
  for (const [u, s] of main) if (s.n >= minN) { xs.push(s.s); ys.push(other.get(u)!.s); }
  return r3(spearman(xs, ys));
}

// how difficulty and like rate relate (why hold it fixed)
const levels: Record<number, { puzzles: number; likeRate: number; medianSolves: number }> = {};
for (const lv of [1, 2, 3, 4, 5]) {
  const xs = ps.filter((p) => p.level === lv), sv = xs.map((p) => p.solves).sort((a, b) => a - b);
  levels[lv] = { puzzles: xs.length, likeRate: r3(xs.reduce((a, p) => a + p.likes, 0) / xs.reduce((a, p) => a + p.solves, 0)), medianSolves: sv[sv.length >> 1] };
}

const setters = [...main].map(([user, s]) => {
  const mine = ps.filter((p) => p.user === user), g = new Map<string, number>();
  for (const p of mine) g.set(p.genre, (g.get(p.genre) ?? 0) + 1);
  const top = [...g].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${kinds[k.split("/")[0]]?.name_e ?? k}${k.endsWith("/0") ? "" : " (variant)"} ${n}`);
  return { user, puzzles: s.n, score: r3(s.s), multiple: r3(Math.exp(s.s)), low: r3(Math.exp(s.s - 2 * s.se)), high: r3(Math.exp(s.s + 2 * s.se)),
    solves: mine.reduce((a, p) => a + p.solves, 0), likes: mine.reduce((a, p) => a + p.likes, 0), genres: top };
}).sort((a, b) => b.score - a.score);

const sized = setters.filter((s) => s.puzzles >= 10);
const summary = {
  puzzles: ps.length, setters: setters.length, settersWith10: sized.length, m: M, m2: M2, minCell: MIN_CELL,
  levels,
  splitHalf: { atLeast5Each: splitHalf(rLevel, 5), atLeast20Each: splitHalf(rLevel, 20) },
  forward: [forward("2024-01-01", 10), forward("2025-01-01", 10)],
  forwardYearHeld: [forward("2024-01-01", 10, rYear), forward("2025-01-01", 10, rYear)],
  // popular puzzles draw a wider, less liking audience: the residual against log solves
  residualVsLogSolves: r3(spearman(ps.map(rLevel), ps.map((p) => Math.log(p.solves)))),
  setterShareOfVariance: { levelHeld: icc(rLevel), levelAndYearHeld: icc(rYear), nothingHeld: icc(rFlat) },
  rankAgreementWithMain: { levelAndYearHeld: rankAgreement(rYear, 10), nothingHeld: rankAgreement(rFlat, 10) },
  clearlyAbove: sized.filter((s) => s.low > 1).length, clearlyBelow: sized.filter((s) => s.high < 1).length,
  top: sized.slice(0, 15), bottom: sized.slice(-5),
};
writeFileSync(`${dir}setter-scores.json`, JSON.stringify({ ...summary, all: setters }, null, 1));
console.log(JSON.stringify(summary, (k, v) => k === "genres" ? v.join(", ") : v, 1));
