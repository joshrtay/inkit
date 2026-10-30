// What makes a puzzle bad? The critical Logic Masters comments (those lmd-themes.ts tagged tedious,
// stuck or broken, or negative in tone) sorted into finer complaints with Claude Haiku 5.5, then each
// complaint set against beauty with the solvers' difficulty held fixed, as in lmd-themes.ts.
//
//   node --no-warnings puzzles/difficulty/lmd-faults.ts tag [--limit N]   → references/lmd/faults.jsonl (resumable)
//   node --no-warnings puzzles/difficulty/lmd-faults.ts report            → references/lmd/faults-report.md
//
// Needs references/lmd/themes.jsonl from lmd-themes.ts. One call per puzzle with its critical
// comments numbered. Key and cap as lmd-themes.ts (LMD_CAP, default 2 here). Local only.
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mapPool } from "./pool.ts";
import { dataDir } from "./sources/lmd-fetch.ts";

const dir = dataDir(), OUT = join(dir, "faults.jsonl");
const argv = process.argv.slice(2), cmd = argv[0] ?? "report";
const MODEL = "claude-haiku-5-5", PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 };
const CAP = Number(process.env.LMD_CAP) || 2, MAX_TOKENS = 6000;

// the complaints, drawn from reading 90 critical comments; the first group is the puzzle's design
const FAULTS: Record<string, string> = {
  guessing: "needed trial and error, bifurcation or guessing; no logical way forward was found",
  "no-start": "could not find where to start; the break-in is too obscure or hidden",
  wall: "one point mid-solve far harder than the rest; a sudden wall after an easier stretch",
  grind: "long bookkeeping, arithmetic, repetitive or mechanical work; too long for what it gives back",
  "hard-to-read": "the grid is hard to read or scan: clutter, colours, layout, fog of war",
  "rules-unclear": "the rules are ambiguous, underspecified, or differ between versions or languages",
  "not-unique": "several solutions, no solution, or it needs a uniqueness argument to finish",
  dull: "nothing interesting: a rule or clue that does nothing, an underwhelming idea, too plain or derivative",
  "rating-off": "the stated difficulty is wrong",
  "theme-off": "the title or theme does not fit the puzzle",
  "own-mistake": "the solver blames their own error or misreading, not the puzzle",
  platform: "a problem with the link, the online tool, the answer check or the solution code",
};
const DESIGN = ["guessing", "no-start", "wall", "grind", "hard-to-read", "rules-unclear", "not-unique", "dull", "rating-off", "theme-off"];
const KEYS = Object.keys(FAULTS);

interface Comment { id: string; author: string; date: string; text: string }
const readJsonl = (f: string) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
/** The last JSON object in a reply that `ok` accepts (as llm-label.ts's). */
function lastJson<T>(text: string, ok: (j: any) => boolean): T | null {
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1))
    for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
      try { const j = JSON.parse(text.slice(start, end + 1)); if (j && ok(j)) return j as T; } catch { /* not this span */ }
    }
  return null;
}

// each puzzle's comments by others than its author, with lmd-themes.ts's tags, and which are critical
function load() {
  const puzzles = new Map<string, any>(readJsonl(join(dir, "puzzles.jsonl")).filter((p) => p.page).map((p) => [p.id, p]));
  const byPuzzle = new Map<string, Comment[]>();
  for (const c of readJsonl(join(dir, "comments.jsonl")) as Comment[]) {
    if (!puzzles.has(c.id)) continue;
    if (!byPuzzle.has(c.id)) byPuzzle.set(c.id, []);
    byPuzzle.get(c.id)!.push(c);
  }
  const others = new Map<string, { c: Comment; t: any; critical: boolean }[]>();
  for (const r of readJsonl(join(dir, "themes.jsonl"))) {
    if (!r.parsed) continue;
    const p = puzzles.get(r.id)!;
    others.set(r.id, byPuzzle.get(r.id)!.map((c, i) => ({ c, t: r.parsed.comments[i] })).filter(({ c, t }) => t && c.author !== p.author)
      .map(({ c, t }) => ({ c, t, critical: Number(t.tone) < 0 || (t.themes ?? []).some((k: string) => ["tedious", "stuck", "broken"].includes(k)) })));
  }
  return { puzzles, others };
}

function promptOf(p: any, cs: Comment[]): string {
  return `Below are solvers' comments on a logic puzzle ("${p.title}", tags: ${(p.tags ?? []).join(", ") || "none"}) from the Logic Masters puzzle portal. Some are in German. Each may contain a complaint or a difficulty. For each comment, say which of these it reports (none, one or several), counting only what the comment itself says:

${KEYS.map((k) => `- ${k}: ${FAULTS[k]}`).join("\n")}

Also quote the few words (at most 15, in the original language) that state the complaint, or "" if there is none.

${cs.map((c, i) => `[${i + 1}] ${c.text.replace(/\s+/g, " ").slice(0, 1500)}`).join("\n")}

Reply with JSON only: {"comments": [{"i": 1, "faults": ["..."], "quote": "..."}, ...]} with one entry per comment, in order.`;
}

async function tag() {
  const key = process.env.INKIT_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no INKIT_ANTHROPIC_KEY or ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000 });
  const { puzzles, others } = load();
  const rows = readJsonl(OUT), done = new Set(rows.filter((r) => r.parsed).map((r) => r.id));
  let spent = rows.reduce((a, r) => a + (r.cost ?? 0), 0), reserved = 0;
  let todo = [...others.keys()].sort().filter((id) => !done.has(id) && others.get(id)!.some((x) => x.critical));
  if (argv.includes("--limit")) todo = todo.slice(0, Number(argv[argv.indexOf("--limit") + 1]));
  console.error(`${done.size} done ($${spent.toFixed(2)}), ${todo.length} to tag, cap $${CAP}`);
  let n = 0;
  await mapPool(todo, async (id) => {
    const cs = others.get(id)!.filter((x) => x.critical).map((x) => x.c), prompt = promptOf(puzzles.get(id), cs);
    const worst = (prompt.length / 3) * PRICE.input + MAX_TOKENS * PRICE.output;
    if (spent + reserved + worst > CAP) return;
    reserved += worst;
    try {
      const r = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] } as any);
      const text = r.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
      const cost = r.usage.input_tokens * PRICE.input + r.usage.output_tokens * PRICE.output;
      const parsed = lastJson<{ comments: any[] }>(text, (j) => Array.isArray(j.comments) && j.comments.length === cs.length);
      spent += cost;
      appendFileSync(OUT, JSON.stringify({ id, model: MODEL, dates: cs.map((c) => c.date + " " + c.author), usage: r.usage, cost, parsed, text: parsed ? undefined : text, at: new Date().toISOString() }) + "\n");
      if (++n % 25 === 0 || !parsed) console.error(`${n}/${todo.length}${parsed ? "" : ` ${id} unparsed`}, total $${spent.toFixed(3)}`);
    } catch (e) {
      console.error(`${id}: failed (${(e as Error).message.slice(0, 200)})`);
    } finally { reserved -= worst; }
  }, 8);
  console.log(`spent $${spent.toFixed(3)} over ${readJsonl(OUT).filter((r) => r.parsed).length} puzzles`);
}

// ---- report ----
function seeded(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
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

function report() {
  const { puzzles, others } = load();
  const tags = new Map<string, any[]>(readJsonl(OUT).filter((r) => r.parsed).map((r) => [r.id, r.parsed.comments]));
  const cost = readJsonl(OUT).reduce((a, r) => a + (r.cost ?? 0), 0);
  // each comment's complaints: the critical ones from faults.jsonl, the rest none
  const all: { id: string; faults: string[]; quote: string }[] = [];
  const per: { id: string; adj: number; n: number; solvers: number; count: Record<string, number> }[] = [];
  const levelBeauty = new Map<number, number[]>();
  for (const p of readJsonl(join(dir, "puzzles.jsonl")))
    if (p.beauty != null && p.difficulty != null && p.difficultySource !== "author") {
      if (!levelBeauty.has(p.difficulty)) levelBeauty.set(p.difficulty, []);
      levelBeauty.get(p.difficulty)!.push(p.beauty);
    }
  const pctile = (b: number, level: number) => { const xs = levelBeauty.get(level)!; return (xs.filter((x) => x < b).length + xs.filter((x) => x === b).length / 2) / xs.length; };
  for (const [id, xs] of others) {
    const t = tags.get(id) ?? [];
    let k = 0;
    const fs = xs.map((x) => (x.critical ? t[k++] : null)).map((f) => ({ faults: ((f?.faults ?? []) as string[]).filter((q) => KEYS.includes(q)), quote: f?.quote ?? "" }));
    if (xs.some((x) => x.critical) && !tags.has(id)) continue;
    for (const f of fs) all.push({ id, ...f });
    const p = puzzles.get(id);
    if (p.beauty == null || p.difficulty == null || p.difficultySource === "author" || xs.length === 0) continue;
    const count: Record<string, number> = {};
    for (const q of KEYS) count[q] = fs.filter((f) => f.faults.includes(q)).length;
    per.push({ id, adj: 100 * pctile(p.beauty, p.difficulty), n: xs.length, solvers: p.solvers, count });
  }
  const critical = all.filter((c) => c.faults.length).length;
  const out: string[] = [];
  out.push("# What makes a puzzle bad: Logic Masters complaints\n");
  out.push(`Generated ${new Date().toISOString().slice(0, 16)} from references/lmd/faults.jsonl (${MODEL}, $${cost.toFixed(2)}). Private: never publish.\n`);
  out.push(`${all.length} comments by others than the puzzle's author on ${others.size} puzzles; ${critical} report at least one complaint. ${per.length} puzzles have a solvers' difficulty and a beauty rating. *Beauty pct*: beauty as a percentile among the portal's rated puzzles of the same difficulty level (50 = typical).\n`);
  // puzzles with more comments are better liked and collect more complaints of every kind, so each
  // complaint's gap is also taken holding log comments and log solvers fixed (least squares)
  out.push("*Gap*: mean beauty pct where at least one comment names the complaint minus where none does. *Gap, held*: the same from least squares with log comments and log solvers held fixed (puzzles with more comments are better liked and collect more complaints of every kind). 95% bootstrap intervals, 1,000 resamples.\n");
  out.push("| complaint | comments | puzzles | beauty pct where named | gap | gap, held (95%) | what it means |\n|---|---|---|---|---|---|---|");
  const rand = seeded(11), rows: { line: string; v: number }[] = [];
  for (const q of KEYS) {
    const named = per.filter((p) => p.count[q] > 0), not = per.filter((p) => p.count[q] === 0);
    const gap = mean(named.map((p) => p.adj)) - mean(not.map((p) => p.adj));
    const X = per.map((p) => [1, Math.log(p.n), Math.log(Math.max(1, p.solvers)), p.count[q] > 0 ? 1 : 0]), y = per.map((p) => p.adj);
    const held = ols(X, y)[3], boots: number[] = [];
    for (let t = 0; t < 1000; t++) { const ix = X.map(() => Math.floor(rand() * X.length)); boots.push(ols(ix.map((i) => X[i]), ix.map((i) => y[i]))[3]); }
    boots.sort((a, b) => a - b);
    const nm = DESIGN.includes(q) ? q : `*${q}*`, sg = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}`;
    rows.push({ v: held, line: `| ${nm} | ${all.filter((c) => c.faults.includes(q)).length} | ${named.length} | ${mean(named.map((p) => p.adj)).toFixed(0)} | ${sg(gap)} | **${sg(held)}** (${sg(boots[25])} to ${sg(boots[974])}) | ${FAULTS[q]} |` });
  }
  for (const r of rows.sort((a, b) => a.v - b.v)) out.push(r.line);
  out.push("\n*Italics*: not the puzzle's design (the solver's own mistake, the site or tools).\n");
  out.push("## In their words\n");
  for (const q of KEYS) {
    const qs = all.filter((c) => c.faults.includes(q) && c.quote).map((c) => c.quote);
    const pick = qs.filter((_, i) => i % Math.max(1, Math.floor(qs.length / 5)) === 0).slice(0, 5);
    out.push(`- **${q}** (${qs.length}): ${pick.map((s) => `"${s}"`).join("; ")}`);
  }
  writeFileSync(join(dir, "faults-report.md"), out.join("\n") + "\n");
  console.log(out.join("\n"));
}

if (cmd === "tag") await tag();
else report();
