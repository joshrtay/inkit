// A first look at Logic Masters' ratings (references/lmd/puzzles.jsonl, specs/, convert.json) →
// references/lmd/report.md (local only): the spread of beauty and difficulty, how they relate,
// beauty against solvers and watchers, beauty by type, and how many puzzles of our types have
// both ratings and content we can convert.
//
//   node puzzles/difficulty/sources/lmd-report.ts
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./lmd-fetch.ts";

const dir = dataDir();
const rows: any[] = readFileSync(join(dir, "puzzles.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function pearson(a: number[], b: number[]): number {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const quant = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

const L: string[] = [];
const rated = rows.filter((r) => r.beauty !== null);
const solverDiff = rows.filter((r) => r.difficultySource === "solvers");
const both = rows.filter((r) => r.beauty !== null && r.difficultySource === "solvers");
const withPage = rows.filter((r) => r.page);
L.push(`# Logic Masters Rätselportal: a first look`, "",
  `Generated ${new Date().toISOString().slice(0, 16)} from references/lmd/puzzles.jsonl. Private: never publish.`, "",
  `- Puzzles listed: ${rows.length}; puzzle pages crawled so far: ${withPage.length} (rated puzzles first, in a fixed random order).`,
  `- With a beauty rating (shown once enough solvers have rated): ${rated.length} (${f2(rated.length / rows.length * 100)} %).`,
  `- With a solvers' difficulty level (red stars): ${solverDiff.length}; still the author's estimate (blue): ${rows.filter((r) => r.difficultySource === "author").length}.`,
  `- With both: ${both.length}.`,
  `- The number of ratings behind each figure isn't public; solvers (and watchers, on the puzzle page) are.`, "");

// beauty distribution
L.push("## Beauty", "", "| beauty % | puzzles |", "|---|---|");
for (let lo = 0; lo < 100; lo += 10) {
  const n = rated.filter((r) => r.beauty >= lo && (lo === 90 ? r.beauty <= 100 : r.beauty < lo + 10)).length;
  if (n) L.push(`| ${lo}–${lo === 90 ? 100 : lo + 9} | ${n} |`);
}
const bs = rated.map((r) => r.beauty);
L.push("", `Median ${quant(bs, 0.5)} %, quartiles ${quant(bs, 0.25)}–${quant(bs, 0.75)} %, mean ${f2(mean(bs))}.`, "");
const labels = new Map<string, number[]>();
for (const r of rated) labels.set(r.beautyLabel, [...(labels.get(r.beautyLabel) ?? []), r.beauty]);
L.push("The site's words for it: " + [...labels].sort((a, b) => Math.min(...a[1]) - Math.min(...b[1])).map(([k, v]) => `"${k}" ${Math.min(...v)}–${Math.max(...v)} % (${v.length})`).join("; ") + ".", "");

// difficulty distribution
L.push("## Difficulty (solvers' level, 1–5 stars)", "", "| level | puzzles | mean beauty | median solvers |", "|---|---|---|---|");
for (let lv = 0; lv <= 6; lv++) {
  const g = solverDiff.filter((r) => r.difficulty === lv);
  if (!g.length) continue;
  const gb = g.filter((r) => r.beauty !== null).map((r) => r.beauty);
  L.push(`| ${lv} | ${g.length} | ${gb.length ? f2(mean(gb)) : "–"} | ${quant(g.map((r) => r.solvers), 0.5)} |`);
}
L.push("", `Spearman ρ(beauty, difficulty) = ${f2(spearman(both.map((r) => r.beauty), both.map((r) => r.difficulty)))} on ${both.length} puzzles.`, "");

// solvers and watchers
L.push("## Beauty against solvers and watchers", "");
L.push(`Spearman ρ(beauty, solvers) = ${f2(spearman(rated.map((r) => r.beauty), rated.map((r) => r.solvers)))} on ${rated.length}.`);
const year = (r: any) => Number((r.date ?? "0").slice(0, 4));
const recent = rated.filter((r) => year(r) >= 2020);
L.push(`Since 2020 only (solver counts grow with age): ρ = ${f2(spearman(recent.map((r) => r.beauty), recent.map((r) => r.solvers)))} on ${recent.length}.`);
const partial = (xs: any[]) => {
  // beauty vs solvers within each difficulty level, pooled by level-wise ranks
  const out: number[] = [];
  for (let lv = 1; lv <= 5; lv++) {
    const g = xs.filter((r) => r.difficultySource === "solvers" && r.difficulty === lv);
    if (g.length > 30) out.push(spearman(g.map((r) => r.beauty), g.map((r) => r.solvers)));
  }
  return out;
};
L.push(`Within each difficulty level: ρ = ${partial(rated).map(f2).join(", ")} (levels 1–5).`);
const w = rated.filter((r) => r.watchers !== null);
if (w.length > 30) {
  L.push(`Beauty against watchers: ρ = ${f2(spearman(w.map((r) => r.beauty), w.map((r) => r.watchers)))}; watchers per solver: ρ = ${f2(spearman(w.map((r) => r.beauty), w.map((r) => r.watchers / Math.max(1, r.solvers))))} on ${w.length}.`);
}
L.push("", "| solvers | rated puzzles | mean beauty |", "|---|---|---|");
for (const [lo, hi] of [[0, 9], [10, 19], [20, 49], [50, 99], [100, 199], [200, 499], [500, 1e9]]) {
  const g = rated.filter((r) => r.solvers >= lo && r.solvers <= hi);
  if (g.length) L.push(`| ${lo}${hi < 1e9 ? `–${hi}` : "+"} | ${g.length} | ${f2(mean(g.map((r) => r.beauty)))} |`);
}
const minSolvers = Math.min(...rated.map((r) => r.solvers));
L.push("", `The fewest solvers of a rated puzzle: ${minSolvers}.`, "");

// beauty by year
L.push("## Beauty by year posted", "", "| year | rated | mean beauty | share rated |", "|---|---|---|---|");
const years = [...new Set(rows.map(year))].filter((y) => y > 2000).sort();
for (const y of years) {
  const all = rows.filter((r) => year(r) === y), g = all.filter((r) => r.beauty !== null);
  L.push(`| ${y} | ${g.length} | ${g.length ? f2(mean(g.map((r) => r.beauty))) : "–"} | ${f2(g.length / all.length)} |`);
}
L.push("");

// by type
const paged = rated.filter((r) => r.page && r.tags);
L.push("## Beauty by type (rated puzzles whose page is crawled)", "", `${paged.length} puzzles. A puzzle counts under each of its tags; "standard" means a puzzle we'd read as one of our genres (one type tag, no variant labels).`, "",
  "| tag | rated | mean beauty | median difficulty | standard (ours) |", "|---|---|---|---|---|");
const byTag = new Map<string, any[]>();
for (const r of paged) for (const t of r.tags.length ? r.tags : ["(no tag)"]) byTag.set(t, [...(byTag.get(t) ?? []), r]);
for (const [t, g] of [...byTag].sort((a, b) => b[1].length - a[1].length).slice(0, 45)) {
  const d = g.filter((r) => r.difficultySource === "solvers").map((r) => r.difficulty);
  L.push(`| ${t} | ${g.length} | ${f2(mean(g.map((r) => r.beauty)))} | ${d.length ? quant(d, 0.5) : "–"} | ${g.filter((r) => r.genre).length} |`);
}
L.push("");
const byGenre = new Map<string, any[]>();
for (const r of paged) if (r.genre) byGenre.set(r.genre, [...(byGenre.get(r.genre) ?? []), r]);
L.push("### Our genres", "", "| genre | rated | mean beauty | sd | ρ(beauty, difficulty) |", "|---|---|---|---|---|");
for (const [g, list] of [...byGenre].sort((a, b) => b[1].length - a[1].length)) {
  const b = list.map((r) => r.beauty), m = mean(b), sd = Math.sqrt(mean(b.map((x) => (x - m) ** 2)));
  const dd = list.filter((r) => r.difficultySource === "solvers");
  L.push(`| ${g} | ${list.length} | ${f2(m)} | ${f2(sd)} | ${dd.length > 10 ? f2(spearman(dd.map((r) => r.beauty), dd.map((r) => r.difficulty))) : "–"} |`);
}
L.push("");

// convertible
const conv = existsSync(join(dir, "convert.json")) ? JSON.parse(readFileSync(join(dir, "convert.json"), "utf8")) : null;
const specs = existsSync(join(dir, "specs")) ? readdirSync(join(dir, "specs")).filter((f) => f.endsWith(".jsonl")) : [];
L.push("## Our types: content", "");
if (conv) {
  L.push("Per genre, every crawled puzzle of ours (rated or not): what its own text links to, and what converted.", "",
    "| genre | puzzles | puzz.link | Penpa+ | SudokuPad | f-puzzles | image | PDF | converted | from a comment | rated and converted (both ratings) | unique |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [g, k] of Object.entries<any>(conv.kinds).sort((a, b) => b[1].puzzles - a[1].puzzles)) {
    const file = join(dir, "specs", `${g}.jsonl`);
    const list = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    const rb = list.filter((c) => c.beauty !== null && c.difficultySource === "solvers").length;
    const u = conv.unique?.[g] ? Object.entries(conv.unique[g]).map(([a, b]) => `${a} ${b}`).join(", ") : "–";
    L.push(`| ${g} | ${k.puzzles} | ${k.puzzlink ?? 0} | ${k.penpa ?? 0} | ${k.sudokupad ?? 0} | ${k.fpuzzles ?? 0} | ${k.image ?? 0} | ${k.pdf ?? 0} | ${(k.converted ?? 0) + (k["converted (from a comment)"] ?? 0)} | ${k["converted (from a comment)"] ?? 0} | ${rb} | ${u} |`);
  }
  L.push("", "Links that didn't convert: " + Object.entries<number>(conv.notConverted).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} (${v})`).join("; ") + ".", "");
} else L.push("Not converted yet (lmd-convert.ts).", "");
L.push(`Spec files: ${specs.join(", ") || "none"}.`, "");

writeFileSync(join(dir, "report.md"), L.join("\n"));
console.log(L.join("\n"));
