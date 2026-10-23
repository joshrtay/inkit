// What do solvers say makes a puzzle good? Logic Masters' comments (references/lmd/comments.jsonl,
// 8,903 on the 1,266 crawled puzzle pages) tagged by theme with Claude Haiku 5.5, then each theme's
// share of a puzzle's comments set against its beauty rating with the solvers' difficulty held
// fixed (beauty as a percentile within its difficulty level).
//
//   node --no-warnings puzzles/difficulty/lmd-themes.ts tag [--limit N]   → references/lmd/themes.jsonl (resumable)
//   node --no-warnings puzzles/difficulty/lmd-themes.ts report            → references/lmd/themes-report.md
//
// One call per puzzle with all its comments numbered. The key is INKIT_ANTHROPIC_KEY (or
// ANTHROPIC_API_KEY); LMD_CAP (dollars, default 5) stops the tagging before the tally would pass it.
// Local only: the comments are Logic Masters' users'.
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mapPool } from "./pool.ts";
import { dataDir } from "./sources/lmd-fetch.ts";

const dir = dataDir(), OUT = join(dir, "themes.jsonl");
const argv = process.argv.slice(2), cmd = argv[0] ?? "report";
const MODEL = "claude-haiku-5-5", PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 };
const CAP = Number(process.env.LMD_CAP) || 5, MAX_TOKENS = 8000;

// the codebook: what a comment says about the puzzle (several can apply)
const THEMES: Record<string, string> = {
  aha: "a clever key deduction, break-in or surprising moment (aha, the trick, the key idea, a lovely step)",
  flow: "the solve flowed or fell into place; smooth, steady, every step leads to the next",
  rules: "the rules or constraints interact in an interesting or novel way; a clever use of a rule or variant",
  look: "the theme, title, story, picture or look of the grid",
  hard: "it was hard, tricky, challenging or took a long time",
  easy: "it was easy, gentle, quick or a good introduction",
  tedious: "tedium, bookkeeping, grind, guessing, bifurcation or a slog",
  stuck: "got stuck, frustrated, confused, or needed help or a hint",
  learning: "learned or practised a technique; good for beginners or for teaching",
  broken: "an error, unclear rules, a missing or second solution, or a problem with the puzzle's page or link",
  praise: "praise or enjoyment with no reason given (nice, fun, great, loved it)",
  social: "thanks, replies to other people, news or chat with nothing about the puzzle itself",
};
const KEYS = Object.keys(THEMES);

interface Comment { id: string; author: string; date: string; text: string }
interface Puzzle { id: string; title: string; author: string; beauty: number | null; difficulty: number | null; difficultySource: string; solvers: number; tags: string[] | null }
/** The last JSON object in a reply that `ok` accepts (as llm-label.ts's, without its side effects). */
function lastJson<T>(text: string, ok: (j: any) => boolean): T | null {
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1))
    for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
      try { const j = JSON.parse(text.slice(start, end + 1)); if (j && ok(j)) return j as T; } catch { /* not this span */ }
    }
  return null;
}
const readJsonl = (f: string) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

function load() {
  const puzzles = new Map<string, Puzzle>(readJsonl(join(dir, "puzzles.jsonl")).filter((p) => p.page).map((p) => [p.id, p]));
  const byPuzzle = new Map<string, Comment[]>();
  for (const c of readJsonl(join(dir, "comments.jsonl")) as Comment[]) {
    if (!puzzles.has(c.id)) continue;
    if (!byPuzzle.has(c.id)) byPuzzle.set(c.id, []);
    byPuzzle.get(c.id)!.push(c);
  }
  return { puzzles, byPuzzle };
}

function promptOf(p: Puzzle, cs: Comment[]): string {
  return `Below are solvers' comments on a logic puzzle ("${p.title}", tags: ${(p.tags ?? []).join(", ") || "none"}) from the Logic Masters puzzle portal. Some are in German. For each comment, say which of these themes it expresses about the puzzle (none, one or several):

${KEYS.map((k) => `- ${k}: ${THEMES[k]}`).join("\n")}

Also give its tone toward the puzzle (-1 negative, 0 neutral or mixed, 1 positive), and quote the few words (at most 12, in the original language) that best show why it likes or dislikes the puzzle, or "" if it gives no reason.

${cs.map((c, i) => `[${i + 1}] ${c.text.replace(/\s+/g, " ").slice(0, 1500)}`).join("\n")}

Reply with JSON only: {"comments": [{"i": 1, "themes": ["..."], "tone": 1, "why": "..."}, ...]} with one entry per comment, in order.`;
}

async function tag() {
  const key = process.env.INKIT_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no INKIT_ANTHROPIC_KEY or ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey: key, maxRetries: 3, timeout: 180_000 });
  const { puzzles, byPuzzle } = load();
  const rows = readJsonl(OUT), done = new Set(rows.filter((r) => r.parsed).map((r) => r.id));
  let spent = rows.reduce((a, r) => a + (r.cost ?? 0), 0), reserved = 0;
  let todo = [...byPuzzle.keys()].sort().filter((id) => !done.has(id));
  if (argv.includes("--limit")) todo = todo.slice(0, Number(argv[argv.indexOf("--limit") + 1]));
  console.error(`${done.size} done ($${spent.toFixed(2)}), ${todo.length} to tag, cap $${CAP}`);
  let n = 0;
  await mapPool(todo, async (id) => {
    const cs = byPuzzle.get(id)!, prompt = promptOf(puzzles.get(id)!, cs);
    const worst = (prompt.length / 3) * PRICE.input + MAX_TOKENS * PRICE.output;
    if (spent + reserved + worst > CAP) return;
    reserved += worst;
    try {
      const r = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] } as any);
      const text = r.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
      const cost = r.usage.input_tokens * PRICE.input + r.usage.output_tokens * PRICE.output;
      const parsed = lastJson<{ comments: any[] }>(text, (j) => Array.isArray(j.comments) && j.comments.length === cs.length);
      spent += cost;
      appendFileSync(OUT, JSON.stringify({ id, model: MODEL, usage: r.usage, cost, stop: r.stop_reason, parsed, text: parsed ? undefined : text, at: new Date().toISOString() }) + "\n");
      if (++n % 10 === 0 || !parsed) console.error(`${n}/${todo.length}${parsed ? "" : ` ${id} unparsed`}, total $${spent.toFixed(3)}`);
    } catch (e) {
      console.error(`${id}: failed (${(e as Error).message.slice(0, 200)})`);
    } finally { reserved -= worst; }
  }, 8);
  console.log(`spent $${spent.toFixed(3)} over ${readJsonl(OUT).filter((r) => r.parsed).length} puzzles`);
}

// ---- report ----
function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(xs.length);
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
  return da && db ? num / Math.sqrt(da * db) : NaN;
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
// 95% interval from Fisher's z (approximate for Spearman)
function interval(r: number, n: number): string {
  const z = Math.atanh(r), se = 1.06 / Math.sqrt(n - 3);
  return `${Math.tanh(z - 1.96 * se).toFixed(2)} to ${Math.tanh(z + 1.96 * se).toFixed(2)}`;
}
const pct = (x: number) => `${Math.round(100 * x)}%`;
// least squares by the normal equations (Gauss-Jordan); X has an intercept column
function ols(X: number[][], y: number[]): number[] {
  const k = X[0].length, A = Array.from({ length: k }, (_, i) => [...Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)), X.reduce((s, r, n) => s + r[i] * y[n], 0)]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((row, i) => row[k] / A[i][i]);
}
function seeded(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function report() {
  const { puzzles, byPuzzle } = load();
  const tagged = new Map(readJsonl(OUT).filter((r) => r.parsed).map((r) => [r.id, r.parsed.comments]));
  const cost = readJsonl(OUT).reduce((a, r) => a + (r.cost ?? 0), 0);
  // per comment: themes, tone, why; the puzzle's author's own comments are left out
  const all: { id: string; themes: string[]; tone: number; why: string; text: string }[] = [];
  const per: { id: string; beauty: number; level: number; solvers: number; n: number; share: Record<string, number>; tone: number; sudoku: boolean }[] = [];
  for (const [id, tags] of tagged) {
    const p = puzzles.get(id)!, cs = byPuzzle.get(id)!;
    const own = cs.map((c, i) => ({ c, t: tags[i] })).filter(({ c, t }) => t && c.author !== p.author);
    for (const { c, t } of own) all.push({ id, themes: (t.themes ?? []).filter((k: string) => KEYS.includes(k)), tone: Number(t.tone) || 0, why: t.why ?? "", text: c.text });
    if (p.beauty == null || p.difficulty == null || p.difficultySource === "author" || own.length === 0) continue;
    const share: Record<string, number> = {};
    for (const k of KEYS) share[k] = own.filter(({ t }) => (t.themes ?? []).includes(k)).length / own.length;
    per.push({ id, beauty: p.beauty, level: p.difficulty, solvers: p.solvers, n: own.length, share, tone: own.reduce((a, { t }) => a + (Number(t.tone) || 0), 0) / own.length, sudoku: (p.tags ?? []).includes("Sudoku") });
  }
  // beauty as a percentile within its difficulty level (all rated puzzles of the portal, not just these)
  const levelBeauty = new Map<number, number[]>();
  for (const p of readJsonl(join(dir, "puzzles.jsonl")))
    if (p.beauty != null && p.difficulty != null && p.difficultySource !== "author") {
      if (!levelBeauty.has(p.difficulty)) levelBeauty.set(p.difficulty, []);
      levelBeauty.get(p.difficulty)!.push(p.beauty);
    }
  const pctile = (b: number, level: number) => { const xs = levelBeauty.get(level)!; return (xs.filter((x) => x < b).length + xs.filter((x) => x === b).length / 2) / xs.length; };
  const adj = per.map((p) => pctile(p.beauty, p.level));

  const out: string[] = [];
  out.push("# What solvers say: Logic Masters comments by theme\n");
  out.push(`Generated ${new Date().toISOString().slice(0, 16)} from references/lmd/themes.jsonl (${MODEL}, $${cost.toFixed(2)}). Private: never publish.\n`);
  out.push(`${tagged.size} puzzles tagged; ${all.length} comments not by the puzzle's author. ${per.length} puzzles have a solvers' difficulty and a beauty rating. *Beauty, level held*: the puzzle's beauty as a percentile among all the portal's rated puzzles of its difficulty level.\n`);
  out.push("## How often each theme comes up\n");
  out.push("| theme | comments | share | what it means |\n|---|---|---|---|");
  for (const k of KEYS) { const m = all.filter((c) => c.themes.includes(k)).length; out.push(`| ${k} | ${m} | ${pct(m / all.length)} | ${THEMES[k]} |`); }
  out.push(`\nTone: ${pct(all.filter((c) => c.tone > 0).length / all.length)} positive, ${pct(all.filter((c) => c.tone === 0).length / all.length)} neutral or mixed, ${pct(all.filter((c) => c.tone < 0).length / all.length)} negative.\n`);

  const block = (title: string, rows: typeof per, adjs: number[]) => {
    out.push(`## ${title}\n`);
    out.push(`${rows.length} puzzles. Spearman of the theme's share of a puzzle's comments with beauty (raw, and with the difficulty level held), and the mean beauty percentile where at least one comment names the theme against where none does.\n`);
    out.push("| theme | puzzles naming it | ρ with beauty | ρ, level held (95%) | beauty pct, named | not named |\n|---|---|---|---|---|---|");
    const lines = [...KEYS, "tone", "comments per solver"].map((k) => {
      const xs = rows.map((p) => (k === "tone" ? p.tone : k === "comments per solver" ? p.n / Math.max(1, p.solvers) : p.share[k]));
      const r = spearman(xs, adjs), raw = spearman(xs, rows.map((p) => p.beauty));
      const named = adjs.filter((_, i) => xs[i] > 0), not = adjs.filter((_, i) => !(xs[i] > 0));
      const m = (a: number[]) => (a.length ? (100 * a.reduce((s, x) => s + x, 0) / a.length).toFixed(0) : "–");
      const isTheme = KEYS.includes(k);
      return { r, line: `| ${k} | ${isTheme ? named.length : "–"} | ${raw.toFixed(2)} | **${r.toFixed(2)}** (${interval(r, rows.length)}) | ${isTheme ? m(named) : "–"} | ${isTheme ? m(not) : "–"} |` };
    });
    for (const { line } of lines.sort((a, b) => b.r - a.r)) out.push(line);
    out.push("");
  };
  block("Which themes go with beauty", per, adj);

  // all at once: which themes add something given the others, how many comments and how many solvers
  {
    const names = [...KEYS, "log comments", "log solvers"];
    const raw = per.map((p) => [...KEYS.map((k) => p.share[k]), Math.log(p.n), Math.log(Math.max(1, p.solvers))]);
    const mu = names.map((_, j) => raw.reduce((s, r) => s + r[j], 0) / raw.length);
    const sd = names.map((_, j) => Math.sqrt(raw.reduce((s, r) => s + (r[j] - mu[j]) ** 2, 0) / raw.length) || 1);
    const X = raw.map((r) => [1, ...r.map((x, j) => (x - mu[j]) / sd[j])]), y = adj.map((a) => 100 * a);
    const b = ols(X, y), rand = seeded(7), boots: number[][] = [];
    for (let t = 0; t < 1000; t++) { const ix = X.map(() => Math.floor(rand() * X.length)); boots.push(ols(ix.map((i) => X[i]), ix.map((i) => y[i]))); }
    const q = (xs: number[], f: number) => xs.sort((a, c) => a - c)[Math.floor(f * (xs.length - 1))];
    const fit = X.map((r) => r.reduce((s, x, j) => s + x * b[j], 0)), my = y.reduce((s, v) => s + v, 0) / y.length;
    const r2 = 1 - y.reduce((s, v, i) => s + (v - fit[i]) ** 2, 0) / y.reduce((s, v) => s + (v - my) ** 2, 0);
    out.push("## All at once\n");
    out.push(`Least squares of the beauty percentile (level held, 0–100) on every theme's share, log comments and log solvers, each scaled to one standard deviation: points of beauty percentile per standard deviation, holding the others fixed, with 95% bootstrap intervals (1,000 resamples). R² ${r2.toFixed(2)}, ${per.length} puzzles.\n`);
    out.push("| term | points per SD | 95% |\n|---|---|---|");
    const rows = names.map((nm, j) => ({ nm, v: b[j + 1], lo: q(boots.map((x) => x[j + 1]), 0.025), hi: q(boots.map((x) => x[j + 1]), 0.975) })).sort((a, c) => c.v - a.v);
    for (const r of rows) out.push(`| ${r.nm} | ${r.v >= 0 ? "+" : ""}${r.v.toFixed(1)} | ${r.lo.toFixed(1)} to ${r.hi.toFixed(1)} |`);
    out.push("");
  }
  const keep = per.map((p, i) => [p, adj[i]] as const).filter(([p]) => p.n >= 5);
  block("Puzzles with at least 5 comments", keep.map(([p]) => p), keep.map(([, a]) => a));
  const ns = per.map((p, i) => [p, adj[i]] as const).filter(([p]) => !p.sudoku);
  if (ns.length >= 20) block("Not Sudoku", ns.map(([p]) => p), ns.map(([, a]) => a));

  out.push("## What people say, by theme\n");
  out.push("Up to six reasons quoted for each theme, from comments that name it.\n");
  for (const k of KEYS) {
    const qs = all.filter((c) => c.themes.includes(k) && c.why).map((c) => c.why);
    const pick = qs.filter((_, i) => i % Math.max(1, Math.floor(qs.length / 6)) === 0).slice(0, 6);
    out.push(`- **${k}**: ${pick.map((q) => `"${q}"`).join("; ") || "–"}`);
  }
  writeFileSync(join(dir, "themes-report.md"), out.join("\n") + "\n");
  console.log(out.join("\n"));
}

if (cmd === "tag") await tag();
else report();
