// A shortlist of generated puzzles (gen-set.ts) that might be worth putting on the site, each with
// its reasons. It only ranks: nothing is published, and nothing goes to src/games.
//
//   node puzzles/difficulty/gen-best.ts [perGenreAndBand]     default 5
//     GEN_DIR the generated set (default references/ml/generated)
//   → references/ml/shortlist.jsonl and shortlist.md (local only)
//
// Puzzles are compared within their genre (ranks, 0 worst to 1 best), and the shortlist takes the
// best of each (genre, band), so every band has its picks. The measures, and why:
//   sparse     few clue cells per cell (looks.ts): likes beyond difficulty followed sparse clues in
//              Akari (0.15) and Masyu (0.35) on Puzzle Square JP (docs/learning-design.md)
//   economy    few clues for the steps they give (steps per clue)
//   technique  a technique the puzzle can't be solved without (bands.ts requiredOf), the rarer in
//              its genre the better: a technique used on purpose
//   length     steps (Akari 0.16, Slitherlink 0.17)
//   size       cells (Akari 0.20, Masyu 0.21)
//   flow       varied flow, the spread of easy moves open per round (Slitherlink 0.20)
//   variety    kinds of explanation among the non-trivial steps (Masyu 0.20)
//   breakIn    what the key step unlocks
//   busywork   share of trivial steps: liked in Masyu (0.29), counted against elsewhere
// Weights per genre where Puzzle Square JP said something, otherwise the default.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { BAND_LIST } from "./bands.ts";

export interface Generated {
  key: string; genre: string; size: number; band: string; status: string; seed: number;
  spec: unknown; clues: number; steps: number; cells: number; estimate: number; required: string[];
  interest: { busywork: number; flowSpread: number; variety: number; breakIn: number; stuck: number };
  looks: { density: number; sym: number };
}

type Weights = Record<string, number>;
const DEFAULT: Weights = { sparse: 1, economy: 1, technique: 1.5, length: 0.5, size: 0.3, flow: 0.5, variety: 0.7, breakIn: 0.5, busywork: -0.5 };
export const WEIGHTS: Record<string, Weights> = {
  akari: { ...DEFAULT, sparse: 1.2, length: 1, size: 1 },
  masyu: { ...DEFAULT, sparse: 2, busywork: 1, size: 1, variety: 1 },
  slitherlink: { ...DEFAULT, flow: 1.2, length: 1, breakIn: 0.3 },
  sudoku: { ...DEFAULT, sparse: 0.5, technique: 2 },
};

/** Ranks of `xs` scaled to 0..1 (ties share their mean rank; one value: 0.5). */
export function ranks01(xs: number[]): number[] {
  if (xs.length < 2) return xs.map(() => 0.5);
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 / (xs.length - 1); i = j + 1; }
  return r;
}

const WORDS: Record<string, (p: Generated) => string> = {
  sparse: (p) => `sparse clues (${p.looks.density} per cell)`,
  economy: (p) => `${(p.steps / Math.max(1, p.clues)).toFixed(1)} steps per clue`,
  technique: (p) => `needs ${p.required.join(", ")}`,
  length: (p) => `${p.steps} steps`,
  size: (p) => `${p.cells} cells`,
  flow: () => "varied flow",
  variety: (p) => `${p.interest.variety} kinds of step`,
  breakIn: () => "a key step that opens it up",
  busywork: (p) => `${Math.round(p.interest.busywork * 100)}% easy steps`,
};

/** Each puzzle's score within its genre, and its best reasons. */
export function scoreGenre(ps: Generated[]): { p: Generated; score: number; reasons: string[] }[] {
  if (!ps.length) return [];
  const w = WEIGHTS[ps[0].genre] ?? DEFAULT;
  // how rare each required technique is in the genre
  const reqCount = new Map<string, number>();
  for (const p of ps) for (const t of p.required) reqCount.set(t, (reqCount.get(t) ?? 0) + 1);
  const raw: Record<string, number[]> = {
    sparse: ps.map((p) => -p.looks.density),
    economy: ps.map((p) => p.steps / Math.max(1, p.clues)),
    technique: ps.map((p) => p.required.reduce((a, t) => a + 1 / Math.sqrt(reqCount.get(t)!), 0)),
    length: ps.map((p) => p.steps), size: ps.map((p) => p.cells),
    flow: ps.map((p) => p.interest.flowSpread), variety: ps.map((p) => p.interest.variety),
    breakIn: ps.map((p) => p.interest.breakIn), busywork: ps.map((p) => p.interest.busywork),
  };
  const r = Object.fromEntries(Object.entries(raw).map(([k, xs]) => [k, ranks01(xs)]));
  return ps.map((p, i) => {
    const parts = Object.keys(raw).map((k) => ({ k, v: (w[k] ?? 0) * (r[k][i] - 0.5), rank: r[k][i] }));
    const score = parts.reduce((a, x) => a + x.v, 0);
    // reasons: what lifts it most (a measure where it ranks in its genre's top third)
    const reasons = parts.filter((x) => x.v > 0 && (x.k === "technique" ? p.required.length > 0 : x.rank >= 0.67)).sort((a, b) => b.v - a.v).slice(0, 4).map((x) => WORDS[x.k](p));
    return { p, score: +score.toFixed(3), reasons };
  });
}

const isMain = !!process.argv[1] && process.argv[1].endsWith("gen-best.ts");
if (isMain) {
  const repo = new URL("../../", import.meta.url).pathname;
  const dir = process.env.GEN_DIR ?? `${repo}references/ml/generated`, per = Number(process.argv[2]) || 5;
  if (!existsSync(dir)) { console.error(`nothing in ${dir}: run gen-set.ts first`); process.exit(1); }
  const out: (ReturnType<typeof scoreGenre>[number] & { rank: number })[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl") && x !== "attempts.jsonl").sort()) {
    const seen = new Set<string>();
    // every puzzle made, whatever band it was aimed at (an "easier" one is a good puzzle of its band)
    const ps = readFileSync(`${dir}/${f}`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Generated)
      .filter((p) => p.spec && (p.status === "ok" || p.status === "easier"))
      .filter((p) => { const k = JSON.stringify(p.spec); if (seen.has(k)) return false; seen.add(k); return true; });
    const scored = scoreGenre(ps);
    for (const band of BAND_LIST.map((b) => b.name)) {
      scored.filter((x) => x.p.band === band).sort((a, b) => b.score - a.score).slice(0, per).forEach((x, i) => out.push({ ...x, rank: i + 1 }));
    }
  }
  writeFileSync(`${repo}references/ml/shortlist.jsonl`, out.map((x) => JSON.stringify({ key: x.p.key, genre: x.p.genre, size: x.p.size, band: x.p.band, rank: x.rank, score: x.score, reasons: x.reasons, estimate: x.p.estimate, required: x.p.required, spec: x.p.spec })).join("\n") + "\n");
  const md = ["# Shortlist of generated puzzles", "", "Ranked within genre and band (gen-best.ts); nothing here is published.", "",
    "| Genre | Size | Band | # | Score | Estimate | Reasons | Key |", "|---|---|---|---|---|---|---|---|",
    ...out.map((x) => `| ${x.p.genre} | ${x.p.size} | ${x.p.band} | ${x.rank} | ${x.score} | ${x.p.estimate} | ${x.reasons.join("; ") || "-"} | ${x.p.key} |`)];
  writeFileSync(`${repo}references/ml/shortlist.md`, md.join("\n") + "\n");
  console.log(`${out.length} puzzles shortlisted: references/ml/shortlist.md, shortlist.jsonl`);
}
