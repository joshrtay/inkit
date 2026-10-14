// LMI Puzzle Expo's per-puzzle figures (references/lmi-expo/puzzles.jsonl, from lmi_expo_crawl.py)
// against our genres and our solver. Local, non-commercial research only: the rights stay with each
// author (docs/research-puzzle-sources.md, section 7, "go with care" for aggregates).
//
//   node puzzles/difficulty/sources/lmi-expo.ts                    convert and count
//   DEDUCE_JOBS=2 node puzzles/difficulty/sources/lmi-expo.ts --estimate [--cap-s 120]
//                                                                  and solve each converted puzzle
//
// The Expo's own puzzle data (Penpa) is served only to logged-in users, so it isn't read. A puzzle
// converts only when its "also posted at" link (originalPost) leads to a puzzle we already hold
// the text of: a post indexed by puzz.link's database (references/puzzlink-db/rows.jsonl, by the
// post's URL) or a Logic Masters page (references/lmd/puzzles.jsonl, its puzz.link or Penpa link).
// Each is read with the app's link reader and kept only if it reads as the Expo's genre.
//
// Writes references/lmi-expo/converted/<genre>.jsonl (source "lmi-expo", with the time figures) and
// summary.json: our genres' puzzles, how many have time figures, how many convert, and with
// --estimate, Spearman's rho of the top-50 average time against the solver's estimate (per genre
// where n >= 10, and overall).
import "./app-alias.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { GenreName } from "../../../src/engine/puzzle.ts";
import { spearman } from "../calibrate.ts";
import { deduceGuarded } from "../deduce-guarded.ts";
import { mapPool } from "../pool.ts";
import { REFERENCES, writeByGenre, type Converted } from "./common.ts";
import type { Spec } from "./grids.ts";

const IMPORT_LINK = "../../../app/app/lib/import-link.ts";
const { readLink } = (await import(IMPORT_LINK)) as {
  readLink: (text: string, chosen?: GenreName) => Promise<{ kind: "puzzle"; spec: Spec } | { kind: "unsupported"; variant?: string } | { kind: "choose" | "unreadable" }>;
};
const ROOT = `${REFERENCES}lmi-expo/`;
export const TERMS = "LMI Puzzle Expo: the puzzle is the author's intellectual property; public per-puzzle figures; private research use only";
const args = process.argv.slice(2);
const estimate = args.includes("--estimate");
const capMs = Number(args[args.indexOf("--cap-s") + 1] || 120) * 1000;

/** The Expo's genre names (lower case) that are exactly ours. */
const GENRES: Record<string, GenreName> = {
  "classic sudoku": "sudoku", "irregular sudoku": "irregular-sudoku", "thermo sudoku": "thermo-sudoku", "star battle": "star-battle",
  masyu: "masyu", nurikabe: "nurikabe", slitherlink: "slitherlink", skyscrapers: "skyscrapers", "easy as abc": "easy-as-abc",
  hitori: "hitori", "simple loop": "simple-loop", fillomino: "fillomino", akari: "akari", cave: "cave", "square jam": "square-jam",
  shikaku: "shikaku", numberlink: "numberlink", "spiral galaxies": "spiral-galaxies", minesweeper: "minesweeper", aquarium: "aquarium",
  nonogram: "nonogram", hidoku: "hidoku", "wittgenstein briquet": "wittgenstein-briquet",
} as Record<string, GenreName>;

const readJsonl = (f: string) => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
const secs = (t: unknown) => { const m = /^(\d+):(\d\d):(\d\d)$/.exec(String(t ?? "")); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
const normUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

const puzzles = readJsonl(`${ROOT}puzzles.jsonl`);
// the posts we hold the text of
const plByPost = new Map<string, string[]>();
for (const r of readJsonl(`${REFERENCES}puzzlink-db/rows.jsonl`)) if (r.source_url) {
  const k = normUrl(r.source_url);
  plByPost.set(k, [...(plByPost.get(k) ?? []), `https://puzz.link/p?${r.pzv_override ?? r.pzv}`]);
}
const lmdById = new Map<string, any>();
for (const r of readJsonl(`${REFERENCES}lmd/puzzles.jsonl`)) lmdById.set(r.id, r);

const tally: Record<string, Record<string, number>> = {};
const bump = (g: string, k: string) => { (tally[g] ??= {})[k] = (tally[g][k] ?? 0) + 1; };
const out: (Converted & { top50?: number | null })[] = [];

for (const p of puzzles) {
  const genre = GENRES[String(p.genre ?? "").trim().toLowerCase()];
  if (!genre) continue;
  const stats = p.stats ?? {};
  bump(genre, "puzzles");
  if (p.variantLevel && p.variantLevel !== "standard") bump(genre, `variant level: ${p.variantLevel}`);
  const top50 = secs(stats.avgTop50 ?? p.avgTop50), best = secs(stats.bestTime ?? p.bestTime);
  if (best != null) bump(genre, "with a best time");
  if (top50 != null) bump(genre, "with a top-50 average");
  if ((stats.numSolved ?? p.numSolved ?? 0) >= 10) bump(genre, "10+ solvers");
  if (!p.originalPost) { bump(genre, "no other post (Penpa needs a login)"); continue; }
  bump(genre, "also posted elsewhere");
  const post = String(p.originalPost);
  let links: string[] = plByPost.get(normUrl(post)) ?? [];
  let via = "puzzlink-db";
  const lmdId = /logic-masters\.de\/.*[?&]id=([0-9A-Za-z]+)/.exec(post)?.[1];
  if (!links.length && lmdId && lmdById.has(lmdId)) {
    links = (lmdById.get(lmdId).links ?? []).filter((l: any) => l.kind === "puzzlink" || l.kind === "penpa").map((l: any) => l.resolved ?? l.url);
    via = "lmd";
  }
  if (!links.length) { bump(genre, "other post not held"); continue; }
  let spec: Spec | undefined, link = "";
  for (const l of links) {
    let res;
    try { res = await readLink(l, genre); } catch { continue; }
    if (res.kind === "puzzle" && res.spec.genre === genre) { spec = res.spec as Spec; link = l; break; }
  }
  if (!spec) { bump(genre, "other post's link not read as this genre"); continue; }
  bump(genre, `converted (via ${via})`);
  out.push({
    source: "lmi-expo", sourceId: p.ppid, licence: TERMS, author: p.author ?? "", url: p.url, genre, spec, top50,
    meta: {
      title: p.titletheme ?? null, expoGenre: p.genre, variantLevel: p.variantLevel ?? null, published: p.lastEditedAt ?? null,
      solved: stats.numSolved ?? p.numSolved ?? null, started: stats.numViewed ?? p.numViewed ?? null,
      bestTime: stats.bestTime ?? p.bestTime ?? null, avgTop10: stats.avgTop10 ?? p.avgTop10 ?? null, avgTop50: stats.avgTop50 ?? p.avgTop50 ?? null,
      avgTop100: stats.avgTop100 ?? p.avgTop100 ?? null, avgRatings: stats.avgRatings ?? null, numRated: stats.numRated ?? p.numRated ?? null,
      seconds: { best, top10: secs(stats.avgTop10 ?? p.avgTop10), top50, top100: secs(stats.avgTop100 ?? p.avgTop100) },
      originalPost: post, link, via,
    },
  });
}

let rhos: Record<string, { n: number; rho: number | null }> | undefined;
if (estimate) {
  let n = 0;
  await mapPool(out, async (c) => {
    try {
      const r = await deduceGuarded(c.spec as never, { budgetMs: Math.min(60000, capMs / 2) }, capMs);
      (c.meta as any).estimate = r?.profile.solved ? r.profile.estimate : null;
      (c.meta as any).solved = r ? r.profile.solved : "timeout";
    } catch (e) { (c.meta as any).solved = `error: ${(e as Error).message.slice(0, 80)}`; }
    if (++n % 10 === 0) console.error(`solved ${n}/${out.length}`);
  });
  const ok = out.filter((c) => c.top50 != null && typeof (c.meta as any).estimate === "number");
  const r = (cs: typeof ok) => ({ n: cs.length, rho: cs.length >= 3 ? Number(spearman(cs.map((c) => c.top50!), cs.map((c) => (c.meta as any).estimate)).toFixed(3)) : null });
  rhos = { all: r(ok) };
  for (const g of new Set(ok.map((c) => c.genre))) { const cs = ok.filter((c) => c.genre === g); if (cs.length >= 10) rhos[g] = r(cs); }
}

const counts = writeByGenre(`${ROOT}converted`, out.map(({ top50: _, ...c }) => c));
const all = { puzzles: puzzles.length, ourGenres: Object.values(tally).reduce((a, t) => a + t.puzzles, 0),
  withTop50: Object.values(tally).reduce((a, t) => a + (t["with a top-50 average"] ?? 0), 0) };
const summary = { date: new Date().toISOString(), ...all, converted: counts, byGenre: tally, top50VsEstimate: rhos ?? "run with --estimate" };
writeFileSync(`${ROOT}summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
