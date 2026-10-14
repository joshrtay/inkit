// Can Claude Opus 5.5 tell a human-made puzzle from one our generator made, and are its reasons
// specific and right? Pairs of one type, one from Janko or Puzzle Square JP and one from the fleet
// (Shikaku: the corpus's), the same size where the sources allow, in shuffled order. The model
// picks the one a person set, with a confidence (50–100) and its reasons in a sentence or two.
// Scored by type, against the human-gap classifier's AUCs (docs/research-human-gap.md: a pair's
// accuracy is the AUC's own meaning, so the two compare directly).
//
//   DEDUCE_JOBS=2 node puzzles/difficulty/llm-human.ts pairs     choose the pairs, solve them (cached)
//   node puzzles/difficulty/llm-human.ts ask [--dry]             each pair: grid + solver summary
//   node puzzles/difficulty/llm-human.ts grid [--dry]            a subset: the grids alone
//   node puzzles/difficulty/llm-human.ts leak [--dry]            a few human puzzles: known source?
//   node puzzles/difficulty/llm-human.ts report                  the tables, from what's saved
//
// Each puzzle is drawn and summarised by llm-label.ts's helpers (the grid as text; the solver's
// path: steps by kind, round by round, its ten hardest steps). No source, name or size field is
// shown beyond the grid itself. The key comes from the main checkout's app/.dev.vars, never
// printed. Every request, reply and dollar is in references/ml/llm-human/ (local only), with its
// own ledger; a call that could take the total past LLM_CAP (default $4) is skipped, and a saved
// reply is reused. LLM_PER_TYPE pairs per type (8), LLM_GRID_PER_TYPE for the grid-only subset (4).
// Results: docs/research-llm-labels.md, "Can Opus tell human-made puzzles?".
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { api, drawGrid, lastJson, mean, MODELS, rulesOf, shuffled, solveCached, summary, type Solve } from "./llm-label.ts";
import { looksOf } from "./looks.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const main = repo.replace(/\.claude\/worktrees\/[^/]+\/$/, "");
const REF = `${main}references/ml/`;
const OUT = `${REF}llm-human/`;
const FLEET = `${REF}gen-fleet-20261013-0921/generated/`;
const args = process.argv.slice(2);
const job = args[0] ?? "report";
const dry = args.includes("--dry");
const CAP = Number(process.env.LLM_CAP) || 4;
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS) || 3000;
const PER_TYPE = Number(process.env.LLM_PER_TYPE) || 8;
const GRID_PER_TYPE = Number(process.env.LLM_GRID_PER_TYPE) || 4;
const SOLVE_JOBS = Math.min(2, Number(process.env.DEDUCE_JOBS) || 2);
const opus = MODELS.find((m) => m.key === "opus")!;

const TYPES = ["akari", "hitori", "slitherlink", "star-battle", "masyu", "sudoku", "nurikabe", "cave", "shikaku", "spiral-galaxies", "simple-loop", "skyscrapers"];
const NAME: Record<string, string> = { akari: "Akari", hitori: "Hitori", slitherlink: "Slitherlink", "star-battle": "Star Battle", masyu: "Masyu", sudoku: "Sudoku", nurikabe: "Nurikabe", cave: "Cave", shikaku: "Shikaku", "spiral-galaxies": "Spiral Galaxies", "simple-loop": "Simple Loop", skyscrapers: "Skyscrapers" };

mkdirSync(OUT, { recursive: true });
const readJsonl = (f: string) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const sizeOf = (s: GridSpec) => `${s.size[0]}x${s.size[1]}`;

// ---- the ledger ----
interface Ledger { spent: number; calls: { job: string; item: string; input: number; output: number; dollars: number; ms: number; at: string }[] }
const ledgerFile = `${OUT}ledger.json`;
const ledger: Ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, "utf8")) : { spent: 0, calls: [] };
let reserved = 0;

interface Saved<T> { job: string; item: string; prompt: string; text: string; parsed: T | null; usage: { input: number; output: number }; dollars: number; stop: string }
async function ask<T>(jobName: string, item: string, prompt: string, ok: (j: any) => boolean): Promise<Saved<T> | null> {
  const file = `${OUT}calls/${jobName}/${item.replace(/[^\w.-]+/g, "_")}.json`;
  if (existsSync(file)) {
    const s = JSON.parse(readFileSync(file, "utf8")) as Saved<T>;
    if (s.prompt === prompt) return s;
  }
  if (dry) { console.log(`--- ${jobName} ${item} (${prompt.length} chars, about ${Math.round(prompt.length / 3.5)} tokens)\n${prompt}\n`); return null; }
  const worst = (prompt.length / 3) * opus.price.input + MAX_TOKENS * opus.price.output;
  if (ledger.spent + reserved + worst > CAP) { console.error(`${jobName} ${item}: skipped, the total would pass $${CAP}`); return null; }
  reserved += worst;
  const t0 = Date.now();
  try {
    const res = await api().messages.create({
      model: opus.id, max_tokens: MAX_TOKENS, thinking: { type: "adaptive" }, output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    });
    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
    const dollars = usage.input * opus.price.input + usage.output * opus.price.output;
    ledger.spent += dollars;
    ledger.calls.push({ job: jobName, item, ...usage, dollars: +dollars.toFixed(4), ms: Date.now() - t0, at: new Date().toISOString() });
    writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const parsed = res.stop_reason === "refusal" ? null : lastJson<T>(text, ok);
    const saved: Saved<T> = { job: jobName, item, prompt, text, parsed, usage, dollars, stop: res.stop_reason ?? "" };
    mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    writeFileSync(file, JSON.stringify(saved, null, 1));
    console.error(`${jobName} ${item}: ${parsed ? "parsed" : `unparsed (${res.stop_reason})`}, ${usage.input} in, ${usage.output} out, $${dollars.toFixed(3)} (total $${ledger.spent.toFixed(2)})`);
    return saved;
  } catch (e) {
    console.error(`${jobName} ${item}: failed (${(e as Error).message.slice(0, 120)})`);
    return null;
  } finally { reserved -= worst; }
}

// ---- the pairs ----
interface Side { source: string; name: string; spec: GridSpec }
interface Pair { id: string; genre: string; human: Side; gen: Side; matched: boolean; humanFirst: boolean }
const pairsFile = `${OUT}pairs.json`;

function choosePairs(): Pair[] {
  const humans = readJsonl(`${REF}human-gap/human-specs.jsonl`) as (Side & { genre: string })[];
  const pairs: Pair[] = [];
  for (const genre of TYPES) {
    const genFile = genre === "shikaku" ? `${REF}human-gap/gen-corpus/shikaku.jsonl` : `${FLEET}${genre}.jsonl`;
    const gens = readJsonl(genFile).map((d) => ({ source: "gen", name: d.key as string, spec: d.spec as GridSpec }));
    const genSizes = new Set(gens.map((g) => sizeOf(g.spec)));
    const mine = humans.filter((h) => h.genre === genre);
    // matched sizes first, Janko and Puzzle Square JP alternating, each shuffled
    const interleave = (xs: Side[]) => {
      const by = [...new Set(xs.map((h) => h.source))].sort().map((s) => shuffled(xs.filter((h) => h.source === s), `human ${genre} ${s}`));
      const outList: Side[] = [];
      for (let k = 0; by.some((b) => k < b.length); k++) for (const b of by) if (k < b.length) outList.push(b[k]);
      return outList;
    };
    let chosen = interleave(mine.filter((h) => genSizes.has(sizeOf(h.spec)))).slice(0, PER_TYPE);
    if (chosen.length < PER_TYPE) {
      // the rest: the smallest human puzzles up to 10 × 10, nearest the generator's sizes
      const rest = shuffled(mine.filter((h) => !genSizes.has(sizeOf(h.spec)) && Math.max(...h.spec.size) <= 10), `rest ${genre}`)
        .sort((a, b) => a.spec.size[0] * a.spec.size[1] - b.spec.size[0] * b.spec.size[1]);
      chosen = [...chosen, ...rest.slice(0, PER_TYPE - chosen.length)];
    }
    const area = (s: string) => s.split("x").map(Number).reduce((x, y) => x * y, 1);
    const largest = [...genSizes].sort((a, b) => area(b) - area(a))[0];
    const used = new Set<string>();
    chosen.forEach((h, k) => {
      const matched = genSizes.has(sizeOf(h.spec));
      const pool = shuffled(gens.filter((g) => sizeOf(g.spec) === (matched ? sizeOf(h.spec) : largest)), `gen ${genre} ${k}`);
      const g = pool.find((x) => !used.has(x.name))!;
      used.add(g.name);
      const id = `${genre}-${k + 1}`;
      pairs.push({ id, genre, human: { source: h.source, name: h.name, spec: h.spec }, gen: g, matched, humanFirst: shuffled([true, false], `order ${id}`)[0] });
    });
  }
  return pairs;
}

function loadPairs(): Pair[] {
  if (!existsSync(pairsFile)) throw new Error("run the pairs job first");
  return JSON.parse(readFileSync(pairsFile, "utf8"));
}
async function solves(pairs: Pair[]): Promise<Map<string, Solve>> {
  const specs = pairs.flatMap((p) => [p.human.spec, p.gen.spec]);
  const rs = await mapPool(specs, (s) => solveCached(s), SOLVE_JOBS);
  return new Map(specs.map((s, k) => [JSON.stringify(s), rs[k]]));
}

// ---- the question ----
interface Pick { human: string; confidence: number; reasons: string }
const isPick = (j: any) => (j.human === "A" || j.human === "B") && Number.isFinite(Number(j.confidence));

function promptOf(p: Pair, solved: Map<string, Solve> | null): string {
  const [a, b] = p.humanFirst ? [p.human, p.gen] : [p.gen, p.human];
  const ra = rulesOf(a.spec), rb = rulesOf(b.spec);
  const rules = ra === rb ? `Rules: ${ra}` : `Rules for A: ${ra}\nRules for B: ${rb}`;
  const block = (label: string, s: Side) => `### ${label}\n${drawGrid(s.spec)}${solved ? `\n\nHow our step-by-step solver solved it:\n${summary(solved.get(JSON.stringify(s.spec)) ?? null)}` : ""}`;
  return `Here are two ${NAME[p.genre]} puzzles, A and B. One was set by hand by a person, a published puzzle setter. The other was made by a computer generator. Which one did the person set?

${rules}

${solved ? "For each puzzle you get its grid and a summary of how a step-by-step logical solver solved it (the solver's choices are not a human's, but they show what the puzzle demands)." : "For each puzzle you get its grid."}

${block("A", a)}

${block("B", b)}

Keep your reply short: no more than two sentences of reasons. Confidence is your chance of being right, 50 to 100. End with JSON on its own line: {"human": "A" or "B", "confidence": 50-100, "reasons": "one or two sentences: the specific features that decided it"}`;
}

async function runAsk(jobName: "ask" | "grid") {
  const pairs = loadPairs();
  const solved = jobName === "ask" ? await solves(pairs) : null;
  const subset = jobName === "ask" ? pairs : TYPES.flatMap((t) => pairs.filter((p) => p.genre === t).slice(0, GRID_PER_TYPE));
  await mapPool(subset, async (p) => { await ask<Pick>(jobName, p.id, promptOf(p, solved), isPick); }, 4);
  await report();
}

// ---- leakage: does it know where a human puzzle came from? ----
interface Known { recognised: boolean; source: string; confidence: number }
const LEAK = ["akari", "sudoku", "slitherlink", "star-battle", "masyu", "nurikabe"];
async function leak() {
  const pairs = loadPairs();
  for (const genre of LEAK) {
    const p = pairs.find((x) => x.genre === genre)!;
    const prompt = `Here is a ${NAME[genre]} puzzle.

${drawGrid(p.human.spec)}

Do you recognise this exact puzzle? If you do, say where it was published (site, book or magazine, setter, number). If not, say so; don't guess from style alone. Answer in one sentence, then JSON on its own line: {"recognised": true or false, "source": "where, or empty", "confidence": 0-100}`;
    await ask<Known>("leak", p.id, prompt, (j) => typeof j.recognised === "boolean");
  }
  await report();
}

// ---- reading the reasons ----
// the differences the gap study measured, and a catch-all
const TAGS: [string, RegExp][] = [
  ["symmetry", /symmetr|rotational|half-turn|180|mirror/i],
  ["clue density and size of numbers", /dens|sparse|sparing|fewer (given|clue|number|pearl|block|dot|centre|center|digit)|more (given|clue|number|pearl|block|dot|centre|center|digit)|(many|few|number of) (clue|given|pearl|block|black cell|dot|centre|center|digit)|minimal|economical|large (number|clue|value|island|area|rectangle)|small (number|clue|value|island)|1s\b|big(ger)? (number|clue|island|rectangle)|lots of/i],
  ["stars and area evenness", /\bstars?\b.*(per|two|2|one|1)|(2|two)-star|area sizes|even(ly)? sized|region sizes|similar(ly)? sized|area shapes|region shapes|irregular (area|region)|areas? (are|is) (more )?(compact|balanced|uniform)/i],
  ["clue kinds", /\bwalls?\b|outside clue|clues? (inside|in the grid)|given digits|digits (in|inside)|interior|pre-?filled|white (pearl|circle)s?.*black|black (pearl|circle)s?.*white|ratio|mix of/i],
  ["size", /\b(larger|bigger|smaller) (grid|board|puzzle)|grid size|\d+\s?[x×]\s?\d+/i],
  ["narrow thread", /narrow|one (at a time|step at a time)|bottleneck|single (path|thread|break-?in)|break-?in|flow|progress|chain|cascade|many (easy|simple|trivial)|trivial|open (moves|steps)|rounds?|long run|tedious|mechanical|routine|repetitive|steady/i],
  ["case split", /case split|bifurcat|trial|contradiction|guess|assum|lookahead|look-ahead|uniqueness/i],
  ["theme or aesthetics", /theme|aesthetic|elegan|deliberate|design|intent|crafted|artistic|picture|pattern|motif|clean|tidy|pleasing|beautiful|composed|structure|clustered|scattered|random|haphazard|placement|arrangement|layout|distribution|spread|cluster/i],
];
const tagsOf = (s: string) => { const t = TAGS.filter(([, re]) => re.test(s)).map(([n]) => n); return t.length ? t : ["other"]; };

// ---- the report ----
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "–");
interface Row { id: string; genre: string; matched: boolean; correct: boolean; confidence: number; reasons: string; tags: string[]; humanSym: number; genSym: number; humanDensity: number; genDensity: number; humanSize: string; genSize: string; source: string }
function rowsOf(jobName: string, pairs: Pair[]): Row[] {
  const rows: Row[] = [];
  for (const p of pairs) {
    const f = `${OUT}calls/${jobName}/${p.id}.json`;
    if (!existsSync(f)) continue;
    const s = JSON.parse(readFileSync(f, "utf8")) as Saved<Pick>;
    if (!s.parsed) continue;
    const humanLabel = p.humanFirst ? "A" : "B";
    const hl = looksOf(p.human.spec as never), gl = looksOf(p.gen.spec as never);
    rows.push({ id: p.id, genre: p.genre, matched: p.matched, correct: s.parsed.human === humanLabel, confidence: Math.max(50, Math.min(100, Number(s.parsed.confidence))), reasons: String(s.parsed.reasons ?? ""), tags: tagsOf(String(s.parsed.reasons ?? "")),
      humanSym: hl.sym, genSym: gl.sym, humanDensity: hl.density, genDensity: gl.density, humanSize: sizeOf(p.human.spec), genSize: sizeOf(p.gen.spec), source: p.human.source });
  }
  return rows;
}

/** each pair's case-split steps, [human, generated], from the cached solves (none solved here) */
async function splitsOf(pairs: Pair[]): Promise<Map<string, [number, number]>> {
  const out = new Map<string, [number, number]>();
  const n = (r: Solve) => (r ? r.path.filter((s) => !s.choice && s.tier >= 2).length : NaN);
  for (const p of pairs) out.set(p.id, [n(await solveCached(p.human.spec)), n(await solveCached(p.gen.spec))]);
  return out;
}

async function report() {
  if (!existsSync(pairsFile)) return;
  const pairs = loadPairs();
  const splits = await splitsOf(pairs);
  const summ = existsSync(`${REF}human-gap/summary.json`) ? (JSON.parse(readFileSync(`${REF}human-gap/summary.json`, "utf8")).summary as { genre: string; cls: { all: { auc: number }; sizeFree: { auc: number } } }[]) : [];
  const auc = new Map(summ.map((s) => [s.genre, s.cls]));
  const full = rowsOf("ask", pairs), grid = rowsOf("grid", pairs);
  const acc = (rs: Row[]) => (rs.length ? rs.filter((r) => r.correct).length / rs.length : NaN);
  const L: string[] = ["| Type | Pairs (size-matched) | Opus: grid + solve | Size-matched | Grid only (pairs) | Classifier AUC, all (size-free) |", "|---|---|---|---|---|---|"];
  for (const t of TYPES) {
    const rs = full.filter((r) => r.genre === t), gs = grid.filter((r) => r.genre === t), c = auc.get(t);
    L.push(`| ${NAME[t]} | ${rs.length} (${rs.filter((r) => r.matched).length}) | ${pct(acc(rs))} | ${pct(acc(rs.filter((r) => r.matched)))} | ${pct(acc(gs))} (${gs.length}) | ${c ? `${c.all.auc.toFixed(2)} (${c.sizeFree.auc.toFixed(2)})` : "–"} |`);
  }
  L.push(`| All | ${full.length} (${full.filter((r) => r.matched).length}) | ${pct(acc(full))} | ${pct(acc(full.filter((r) => r.matched)))} | ${pct(acc(grid))} (${grid.length}) | ${mean(TYPES.map((t) => auc.get(t)?.all.auc ?? NaN).filter(Number.isFinite)).toFixed(2)} (${mean(TYPES.map((t) => auc.get(t)?.sizeFree.auc ?? NaN).filter(Number.isFinite)).toFixed(2)}) mean |`);
  // the same pairs, grid + solve against grid only
  const both = grid.map((g) => [g, full.find((f) => f.id === g.id)] as const).filter(([, f]) => f);
  L.push("", `On the ${both.length} pairs asked both ways: grid + solve ${pct(acc(both.map(([, f]) => f!)))}, grid only ${pct(acc(both.map(([g]) => g)))}; the two agree on ${both.filter(([g, f]) => g.correct === f!.correct).length}.`);
  // calibration
  L.push("", "| Confidence | Pairs | Accuracy |", "|---|---|---|");
  for (const [lo, hi] of [[50, 59], [60, 69], [70, 79], [80, 89], [90, 100]]) {
    const rs = full.filter((r) => r.confidence >= lo && r.confidence <= hi);
    L.push(`| ${lo}–${hi} | ${rs.length} | ${pct(acc(rs))} |`);
  }
  L.push("", `Mean confidence ${mean(full.map((r) => r.confidence)).toFixed(0)}; when right ${mean(full.filter((r) => r.correct).map((r) => r.confidence)).toFixed(0)}, when wrong ${mean(full.filter((r) => !r.correct).map((r) => r.confidence)).toFixed(0)}.`);
  // reasons
  L.push("", "| Reason (tagged) | Pairs citing it | Right when cited | Grid only: cited, right |", "|---|---|---|---|");
  for (const tag of [...TAGS.map(([n]) => n), "other"]) {
    const rs = full.filter((r) => r.tags.includes(tag)), gs = grid.filter((r) => r.tags.includes(tag));
    L.push(`| ${tag} | ${rs.length} | ${pct(acc(rs))} | ${gs.length}, ${pct(acc(gs))} |`);
  }
  // the symmetry claim checked against the grids: did the pick have the more symmetric layout?
  const sym = full.filter((r) => r.tags.includes("symmetry"));
  const symFact = sym.filter((r) => r.humanSym !== r.genSym);
  L.push("", `Symmetry: cited in ${sym.length}; in ${symFact.length} of them the two layouts differ in symmetry, and the human one is the more symmetric in ${symFact.filter((r) => r.humanSym > r.genSym).length}. The pick was the more symmetric one in ${symFact.filter((r) => (r.humanSym > r.genSym) === r.correct).length}.`);
  const dens = full.filter((r) => r.tags.includes("clue density and size of numbers") && r.humanDensity !== r.genDensity);
  L.push(`Clue density: cited in ${full.filter((r) => r.tags.includes("clue density and size of numbers")).length}; the human one is the sparser in ${dens.filter((r) => r.humanDensity < r.genDensity).length} of ${dens.length} where density differs; the pick was the sparser in ${dens.filter((r) => (r.humanDensity < r.genDensity) === r.correct).length}.`);
  // the solve's case splits: which side needed more, and how each variant did on those pairs
  if (splits.size) {
    const dir = (id: string) => { const s = splits.get(id)!; return s[0] > s[1] ? "human" : s[0] < s[1] ? "generated" : "neither"; };
    L.push("", "| More case-split steps in | Pairs | Grid + solve | Grid only |", "|---|---|---|---|");
    for (const d of ["human", "generated", "neither"]) {
      const ids = new Set(pairs.filter((p) => splits.has(p.id) && dir(p.id) === d).map((p) => p.id));
      L.push(`| ${d} | ${ids.size} | ${pct(acc(full.filter((r) => ids.has(r.id))))} | ${pct(acc(grid.filter((r) => ids.has(r.id))))} |`);
    }
    const cs = full.filter((r) => r.tags.includes("case split"));
    L.push("", `Case splits cited in ${cs.length}; the human one needed more in ${cs.filter((r) => dir(r.id) === "human").length}; right ${cs.filter((r) => r.correct).length}.`);
  }
  L.push("", "| Grid only: confidence | Pairs | Accuracy |", "|---|---|---|");
  for (const [lo, hi] of [[50, 59], [60, 69], [70, 79], [80, 89], [90, 100]]) {
    const rs = grid.filter((r) => r.confidence >= lo && r.confidence <= hi);
    L.push(`| ${lo}–${hi} | ${rs.length} | ${pct(acc(rs))} |`);
  }
  // leakage
  const leaks = LEAK.map((g) => pairs.find((p) => p.genre === g)!).map((p) => { const f = `${OUT}calls/leak/${p.id}.json`; return existsSync(f) ? [p, JSON.parse(readFileSync(f, "utf8")) as Saved<Known>] as const : null; }).filter((x) => x);
  if (leaks.length) {
    L.push("", "Leakage:");
    for (const [p, s] of leaks as [Pair, Saved<Known>][]) L.push(`- ${p.human.name}: ${s.parsed ? `${s.parsed.recognised ? "recognised" : "not recognised"}${s.parsed.source ? ` (${s.parsed.source})` : ""}, confidence ${s.parsed.confidence}` : "unparsed"}`);
  }
  L.push("", "Every reply, grid + solve:");
  for (const r of full) L.push(`- ${r.id} ${r.correct ? "right" : "WRONG"} ${r.confidence} [${r.tags.join("; ")}] (human ${r.humanSize} ${r.source}, gen ${r.genSize}): ${r.reasons}`);
  if (grid.length) { L.push("", "Grid only:"); for (const r of grid) L.push(`- ${r.id} ${r.correct ? "right" : "WRONG"} ${r.confidence} [${r.tags.join("; ")}]: ${r.reasons}`); }
  const byJob: Record<string, number> = {};
  for (const c of ledger.calls) byJob[c.job] = (byJob[c.job] ?? 0) + c.dollars;
  L.push("", `Spent: $${ledger.spent.toFixed(2)} of $${CAP} over ${ledger.calls.length} calls (${Object.entries(byJob).map(([k, v]) => `${k} $${v.toFixed(2)}`).join(", ")}).`);
  const text = L.join("\n");
  writeFileSync(`${OUT}report.md`, text + "\n");
  writeFileSync(`${OUT}result.json`, JSON.stringify({ full, grid }, null, 1));
  console.log(text);
}

if (job === "pairs") {
  const pairs = existsSync(pairsFile) ? loadPairs() : choosePairs();
  writeFileSync(pairsFile, JSON.stringify(pairs, null, 1));
  for (const t of TYPES) {
    const ps = pairs.filter((p) => p.genre === t);
    console.log(`${t}: ${ps.length} pairs, ${ps.filter((p) => p.matched).length} size-matched; human ${ps.map((p) => `${sizeOf(p.human.spec)} ${p.human.source}`).join(", ")}; gen ${[...new Set(ps.map((p) => sizeOf(p.gen.spec)))].join(", ")}`);
  }
  const r = await solves(pairs);
  console.log(`${[...r.values()].filter((x) => x).length} of ${r.size} solved within the cap`);
} else if (job === "ask" || job === "grid") await runAsk(job);
else if (job === "leak") await leak();
else if (job === "report") await report();
else console.error("usage: llm-human.ts pairs | ask | grid | leak | report [--dry]");
