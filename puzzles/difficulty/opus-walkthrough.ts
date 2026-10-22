// What if Opus is asked to think like a person and walk through the whole solve, rather than name
// one next move (opus-human.ts)? A pilot on two sets:
//
// - janko: a sample of opus-human.ts's held-out Janko states (the person's own, mid-solve). Opus
//   writes the walkthrough from there to the end, in the order a strong human would most likely
//   take, each step with the cells it decides, why, the technique, and a coach's hint. Scored
//   against the person's own order (Janko's recording), beside the one-move prompt's answer on the
//   same state, the relations-tuned network's greedy order (walkthrough_net.py) and our solver's
//   order (deduce.ts, its path from the start with the facts already known left out);
// - psjp: Puzzle Square JP Akari and Slitherlink (10×10, ≥ 100 solvers), pairs from the same site
//   difficulty, one much liked per solver and one little liked. Opus walks through from the empty
//   grid. Its elegance score (1–10) is set against likes per solver, its difficulty against the
//   site's.
//
// Every step's moves are checked against the solution, which clingo confirms is the only one (so a
// move that matches it is forced by the rules and the state: opus-human.ts's clingo check, proved
// once per puzzle rather than once per move).
//
//   node --no-warnings puzzles/difficulty/opus-walkthrough.ts sample [--janko 20]   → walk-items.json (needs
//     references/psjp/ for the Puzzle Square JP pairs)
//   node --no-warnings puzzles/difficulty/opus-walkthrough.ts ask [--limit N]       → walk.jsonl (resumable)
//   node --no-warnings puzzles/difficulty/opus-walkthrough.ts unique                → walk-unique.jsonl (clingo)
//   node --no-warnings puzzles/difficulty/opus-walkthrough.ts solver                → walk-solver.jsonl (deduce)
//   GRAPH_RELATIONS=1 python puzzles/difficulty/walkthrough_net.py <model.pt>       → walk-net.jsonl
//   node --no-warnings puzzles/difficulty/opus-walkthrough.ts report                → walk-report.md, walk-samples.md
//   node --no-warnings puzzles/difficulty/opus-walkthrough.ts show <id>             (the prompt)
//
// Opus is asked through OpenRouter (anthropic/claude-opus-5.5, key in OPENROUTER_API_KEY), as
// opus-human.ts's `open` asks open models. WALK_CAP (dollars, default 20) stops the asking before
// the ledger would pass it. Everything goes to references/ml/opus-human/ (local only: the puzzles
// are Janko's and Puzzle Square JP's).
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { program } from "../../src/engine/encode.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { clingoJson, loadClingo } from "./clingo.ts";
import { deduceCached } from "./janko-order.ts";
import { shuffled } from "./llm-label.ts";
import { draw, type Item, jankoOf, loadItems, markOf, moveForm, type MV, NAME, readJsonl, rules, wilson } from "./opus-human.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const OUT = `${repo}references/ml/opus-human/`, PSJP = `${repo}references/psjp/`;
const argv = process.argv.slice(2), cmd = argv[0] ?? "report";
const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
const SEED = "opus-walkthrough 2026-10-22";
const MODEL = "anthropic/claude-opus-5.5", PRICE = { input: 4 / 1e6, output: 20 / 1e6 }, MAX_TOKENS = 32000;
const CAP = Number(process.env.WALK_CAP) || 20;
const key = (mv: MV | null | undefined) => (mv ? `${mv[0]}=${mv[1]}` : "");

interface WalkItem {
  id: string; set: "janko" | "psjp"; genre: string; known: MV[];
  // janko: the opus-human.ts state it comes from
  name?: string; person?: string;
  // psjp: the puzzle and the site's numbers
  file?: string; psjp?: string; difficulty?: number; likes?: number; solvers?: number; perSolver?: number; pair?: string; side?: "low" | "high";
}
const ITEMS = `${OUT}walk-items.json`;
const loadWalk = (): WalkItem[] => JSON.parse(readFileSync(ITEMS, "utf8")).items;
const specOf = (w: WalkItem): GridSpec => {
  if (w.set === "janko") return jankoOf(w.name!).j.spec;
  const d = JSON.parse(readFileSync(`${PSJP}${w.file}`, "utf8"));
  return { ...d.grid, genre: d.grid.genre ?? w.genre };
};
// a solution: Janko's own; Puzzle Square JP's from clingo (walk-unique.jsonl)
const truthOf = (() => {
  const cache = new Map<string, Map<string, boolean>>();
  return (w: WalkItem): Map<string, boolean> => {
    if (w.set === "janko") return jankoOf(w.name!).j.truth;
    if (!cache.has(w.id)) {
      const u = readJsonl(`${OUT}walk-unique.jsonl`).find((x) => x.id === w.id);
      cache.set(w.id, new Map((u?.atoms ?? []).map((a: string) => [a, true])));
    }
    return cache.get(w.id)!;
  };
})();
const valueOf = (w: WalkItem, m: string) => truthOf(w).get(m) ?? false;

// ======== sample ========
function sample() {
  const N = opt("--janko", 20);
  // ordinary states (the person's own), grids up to 100 cells, 8–60 of the person's moves still to come
  const recs = new Map<string, any>();
  const names = new Set(loadItems().map((it) => it.name));
  for (const l of readFileSync(`${repo}references/ml/graphs-human-labels.jsonl`, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.split === "test" && names.has(d.name)) recs.set(d.name, d);
  }
  const ok = loadItems().filter((it) => {
    const d = recs.get(it.name), cells = d.structure.rows * d.structure.cols, known = new Set(it.known.map(([m]) => m));
    const left = new Set((d.humanOrder as [string, number][]).map(([m]) => m).filter((m) => !known.has(m))).size;
    return it.kind === "ordinary" && cells <= 100 && left >= 8 && left <= 60;
  });
  // one per type first, then the rest from the shuffled remainder, at most two per type
  const order = shuffled(ok, `${SEED} janko`), picked: Item[] = [], per = new Map<string, number>();
  for (const pass of [1, 2]) for (const it of order) {
    if (picked.length >= N) break;
    if ((per.get(it.genre) ?? 0) < pass && !picked.includes(it)) { picked.push(it); per.set(it.genre, (per.get(it.genre) ?? 0) + 1); }
  }
  const janko: WalkItem[] = picked.map((it) => ({ id: it.id, set: "janko", genre: it.genre, known: it.known, name: it.name, person: it.person }));
  const pairs = existsSync(`${PSJP}data.json`) ? psjpPairs() : [];
  const psjp: WalkItem[] = pairs.map((p) => ({ id: `psjp-${p.type}-${p.id}`, set: "psjp", genre: p.type, known: [], file: p.file, psjp: p.id, difficulty: p.difficulty, likes: p.likes, solvers: p.solvers, perSolver: p.perSolver, pair: p.pair, side: p.side }));
  writeFileSync(ITEMS, JSON.stringify({ seed: SEED, items: [...janko, ...psjp] }, null, 1));
  console.log(`${janko.length} Janko states (${[...per].map(([g, n]) => `${g} ${n}`).join(", ")}), ${psjp.length} Puzzle Square JP puzzles → ${ITEMS}`);
}

// Puzzle Square JP pairs, from the interest CSVs (interest-analyze.ts): 10×10, solved by our interest
// run, ≥ 100 solvers; per type and site difficulty 1–3, the least and most liked per solver, then
// the next least and most liked
function psjpPairs() {
  const out: any[] = [];
  for (const type of ["akari", "slitherlink"]) {
    const byId = new Map<string, string>();
    for (const f of readdirSync(`${PSJP}${type}`).filter((f) => /^\d+\.json$/.test(f))) {
      const d = JSON.parse(readFileSync(`${PSJP}${type}/${f}`, "utf8"));
      if (d.grid.size[0] === 10 && d.grid.size[1] === 10) byId.set(String(d.source?.psjp), f);
    }
    const [head, ...lines] = readFileSync(`${PSJP}interest-${type}.csv`, "utf8").trim().split("\n");
    const cols = head.split(","), rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
    const ok = rows.filter((r) => r.solved === "true" && Number(r.solvers) >= 100 && byId.has(r.id));
    for (const level of [1, 2, 3]) {
      const rs = ok.filter((r) => Number(r.siteDifficulty) === level).sort((a, b) => Number(a.perSolver) - Number(b.perSolver) || Number(a.id) - Number(b.id));
      for (let k = 0; k < 2 && rs.length >= 4; k++)
        for (const [r, side] of [[rs[k], "low"], [rs[rs.length - 1 - k], "high"]] as const)
          out.push({ type, id: r.id, file: `${type}/${byId.get(r.id)}`, difficulty: level, likes: Number(r.likes), solvers: Number(r.solvers), perSolver: Number(r.perSolver), pair: `${type}-${level}-${k}`, side });
    }
  }
  return out;
}

// ======== the prompt ========
function promptOf(w: WalkItem): string {
  const spec = specOf(w), genre = w.genre, start = w.known.length === 0;
  const move = moveForm(genre).replace(/, "reason": "one line"\}.*$/, "}");
  return `${start ? "A person is about to solve" : "A person is partway through"} this ${NAME[genre] ?? genre.replace(/-/g, " ")} puzzle.

Rules: ${rules(spec)} The puzzle has exactly one solution.

${start ? "The empty grid" : "Where they are now"}:

${draw(spec, new Map(w.known))}

Think like an experienced human solver, not a computer. A person scans for the easiest certain deduction they can see, works locally, tends to follow on from what they just found, and never guesses or tries cases unless nothing simpler is left.

Write the walkthrough from ${start ? "the start" : "here"} to the finished grid, in the order such a person would most likely take, explained so it would teach someone how to solve it. Each step decides one or a few cells (only ones still undecided above${start ? "" : " or in your earlier steps"}), all from the same idea. For each step give:
- the moves, each certain from the rules, the clues and what is already decided;
- why, naming the clues and cells that force it;
- the technique, in a few words a solver would recognise;
- a hint a coach could give just before this step: a nudge toward where to look, without giving the answer.

Then judge the puzzle as a whole: its key ideas (the one or two moments that make it), its difficulty for a strong human solver (1 to 10), and its elegance (1 to 10: does the solve flow, is there a satisfying "aha", does every clue earn its place, is there little tedium), with a sentence on why.

Reply with JSON only, in this form:
{"steps": [{"moves": [${move}, …], "why": "…", "technique": "…", "hint": "…"}, …], "key_ideas": "…", "difficulty": <1-10>, "elegance": <1-10>, "elegance_why": "…"}
Rows and columns count from 1.`;
}

// the reply's JSON: the last object with "steps" in it (a fence or a stray sentence around it is fine)
function walkJson(text: string): any {
  const t = text.replace(/```(?:json)?/g, "");
  const s = t.indexOf("{");
  for (let end = t.lastIndexOf("}"); end > s && s >= 0; end = t.lastIndexOf("}", end - 1)) {
    try { const x = JSON.parse(t.slice(s, end + 1)); if (x && Array.isArray(x.steps)) return x; } catch { /* shorter */ }
  }
  return null;
}

// ======== ask ========
async function ask() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("no OPENROUTER_API_KEY");
  const file = `${OUT}walk.jsonl`, done = new Map(readJsonl(file).map((x) => [x.id, x]));
  let spent = [...done.values()].reduce((a, x) => a + (x.cost ?? 0), 0), reserved = 0;
  let todo = shuffled(loadWalk(), `${SEED} order`).filter((w) => !done.has(w.id));
  if (argv.includes("--only")) todo = todo.filter((w) => w.set === argv[argv.indexOf("--only") + 1]);
  if (argv.includes("--limit")) todo = todo.slice(0, opt("--limit", 2));
  console.error(`${done.size} done ($${spent.toFixed(2)}), ${todo.length} to ask, cap $${CAP}`);
  await mapPool(todo, async (w) => {
    const prompt = promptOf(w), worst = (prompt.length / 3) * PRICE.input + MAX_TOKENS * PRICE.output;
    if (spent + reserved + worst > CAP) { console.error(`${w.id}: skipped, the total would pass $${CAP}`); return; }
    reserved += worst;
    const t0 = Date.now();
    try {
      let res: Response | null = null;
      for (let a = 0; a < 5; a++) {
        res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, reasoning: { effort: "medium" }, messages: [{ role: "user", content: prompt }] }),
          signal: AbortSignal.timeout(20 * 60 * 1000),
        });
        if (res.status !== 429 && res.status < 500) break;
        await new Promise((r) => setTimeout(r, 4000 * 2 ** a));
      }
      const body = await res!.json() as any;
      if (!res!.ok) throw new Error(`${res!.status} ${JSON.stringify(body).slice(0, 200)}`);
      const cost = body.usage?.cost ?? ((body.usage?.prompt_tokens ?? 0) * PRICE.input + (body.usage?.completion_tokens ?? 0) * PRICE.output);
      spent += cost;
      const text = String(body.choices?.[0]?.message?.content ?? ""), parsed = walkJson(text);
      appendFileSync(file, JSON.stringify({ id: w.id, model: MODEL, usage: body.usage, cost, ms: Date.now() - t0, finish: body.choices?.[0]?.finish_reason, parsed, text, at: new Date().toISOString() }) + "\n");
      console.error(`${w.id}: ${parsed ? `${parsed.steps.length} steps` : "unparsed"}, ${body.usage?.completion_tokens} out, $${cost.toFixed(3)} (total $${spent.toFixed(2)}), ${Math.round((Date.now() - t0) / 1000)} s`);
    } catch (e) {
      console.error(`${w.id}: failed (${(e as Error).message.slice(0, 200)})`);
    } finally { reserved -= worst; }
  }, 4);
  console.log(`spent $${spent.toFixed(2)} over ${readJsonl(file).length} walkthroughs`);
}

// ======== unique: clingo proves each puzzle has one solution (and gives Puzzle Square JP's) ========
async function unique() {
  if (argv[1] === "--one") {
    await loadClingo();
    const w = loadWalk().find((x) => x.id === argv[2])!;
    const r = clingoJson(program(makePuzzle(specOf(w))), 2);
    const models = r.Call?.[0]?.Witnesses?.length ?? 0, atoms = (r.Call?.[0]?.Witnesses?.[0]?.Value ?? []) as string[];
    console.log(JSON.stringify({ id: w.id, models, atoms: w.set === "psjp" ? atoms : undefined }));
    return;
  }
  const { spawnSync } = await import("node:child_process");
  const file = `${OUT}walk-unique.jsonl`, done = new Set(readJsonl(file).map((x) => x.id));
  for (const w of loadWalk()) {
    if (done.has(w.id)) continue;
    const r = spawnSync(process.execPath, ["--no-warnings", "--max-old-space-size=4096", new URL(import.meta.url).pathname, "unique", "--one", w.id], { timeout: 300000, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 26 });
    let row: any = { id: w.id, models: null, error: r.signal ? "timeout" : r.stderr.slice(-200) };
    try { row = JSON.parse(r.stdout.trim().split("\n").at(-1)!); } catch { /* kept as the error */ }
    appendFileSync(file, JSON.stringify(row) + "\n");
    console.error(`${w.id}: ${row.models ?? row.error} solution(s)`);
  }
}

// ======== solver: our solver's order from the state on ========
async function solver() {
  const file = `${OUT}walk-solver.jsonl`, done = new Set(readJsonl(file).map((x) => x.id));
  const todo = loadWalk().filter((w) => w.set === "janko" && !done.has(w.id));
  const solves = await mapPool(todo, (w) => deduceCached(specOf(w)).catch(() => null), 2);
  todo.forEach((w, i) => {
    const sv = solves[i], known = new Set(w.known.map(([m]) => m)), seen = new Set<string>(), order: MV[] = [];
    for (const s of (sv?.path ?? []) as any[]) {
      if (s.choice) continue;
      for (const f of s.facts) if (!known.has(f.mark) && !seen.has(f.mark)) { seen.add(f.mark); order.push([f.mark, f.value]); }
    }
    appendFileSync(file, JSON.stringify({ id: w.id, finished: sv?.profile?.solved ?? null, order }) + "\n");
  });
  console.error(`${todo.length} solver orders`);
}

// ======== report ========
interface Scored { w: WalkItem; r: any; moves: { mv: MV | null; step: number; raw: any }[]; facts: MV[] }
function movesOf(w: WalkItem, r: any): Scored["moves"] {
  const spec = specOf(w), out: Scored["moves"] = [];
  (r.parsed?.steps ?? []).forEach((s: any, k: number) => { for (const m of s.moves ?? []) out.push({ mv: markOf(spec, m), step: k, raw: m }); });
  return out;
}
/** the person's order from the state: each mark they settled, first time, with the solution's value */
function humanOrder(w: WalkItem): MV[] {
  const known = new Set(w.known.map(([m]) => m)), seen = new Set<string>();
  const rec = humanRecs().get(w.name!);
  return (rec.humanOrder as [string, number][]).map(([m]) => m).filter((m) => !known.has(m) && !seen.has(m) && seen.add(m)).map((m): MV => [m, valueOf(w, m)]);
}
const humanRecs = (() => {
  let recs: Map<string, any> | null = null;
  return () => {
    if (recs) return recs;
    const names = new Set(loadWalk().filter((w) => w.set === "janko").map((w) => w.name));
    recs = new Map();
    for (const l of readFileSync(`${repo}references/ml/graphs-human-labels.jsonl`, "utf8").split("\n")) {
      if (!l.trim()) continue;
      const d = JSON.parse(l);
      if (d.split === "test" && names.has(d.name)) recs.set(d.name, d);
    }
    return recs;
  };
})();
/** Walk a predicted order from the state: at each move, is it among the person's next 3 from where
 *  the predictor is (their order with what's settled so far left out)? Only the first `upto` moves;
 *  a wrong move counts as a miss and isn't applied. `peopleKinds`: only moves on marks the person
 *  settles at some point (so negatives people don't write leave the count). */
function along(w: WalkItem, order: MV[], upto: number, peopleKinds = false) {
  const human = humanOrder(w), hset = new Set(human.map(([m]) => m)), known = new Set(w.known.map(([m]) => m));
  let hits = 0, n = 0;
  for (const mv of order) {
    if (n >= upto) break;
    if (known.has(mv[0])) continue;
    if (peopleKinds && !hset.has(mv[0])) { if (valueOf(w, mv[0]) === mv[1]) known.add(mv[0]); continue; }
    const next3 = human.filter(([m]) => !known.has(m)).slice(0, 3).map(key);
    n++;
    if (next3.includes(key(mv))) hits++;
    if (valueOf(w, mv[0]) === mv[1]) known.add(mv[0]);
  }
  return { hits, n };
}
/** Spearman between the predictor's and the person's positions, over marks both settle (right value) */
function spearman(w: WalkItem, order: MV[]): number {
  const human = humanOrder(w).map(key), pos = new Map(human.map((k, i) => [k, i]));
  const both = [...new Set(order.map(key))].filter((k) => pos.has(k));
  if (both.length < 4) return NaN;
  const rank = (xs: number[]) => { const o = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(xs.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const a = rank(both.map((_, i) => i)), b = rank(both.map((k) => pos.get(k)!)), n = both.length;
  return 1 - (6 * a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0)) / (n * (n * n - 1));
}
const pct = (k: number, n: number) => { if (!n) return "–"; const [a, b] = wilson(k, n); return `${Math.round((100 * k) / n)}% (${Math.round(100 * a)}–${Math.round(100 * b)})`; };
const mean = (xs: number[]) => { const ys = xs.filter((x) => Number.isFinite(x)); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : NaN; };
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
function spearmanXY(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); let i = 0; while (i < o.length) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const a = rank(xs), b = rank(ys), ma = mean(a), mb = mean(b);
  const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0), va = a.reduce((s, x) => s + (x - ma) ** 2, 0), vb = b.reduce((s, x) => s + (x - mb) ** 2, 0);
  return cov / Math.sqrt(va * vb);
}

function report() {
  const walks = new Map(readJsonl(`${OUT}walk.jsonl`).map((x) => [x.id, x]));
  const one = new Map(readJsonl(`${OUT}opus.jsonl`).map((x) => [x.id, x]));
  const net = new Map(readJsonl(`${OUT}walk-net.jsonl`).map((x) => [x.id, x]));
  const sol = new Map(readJsonl(`${OUT}walk-solver.jsonl`).map((x) => [x.id, x]));
  const uniq = new Map(readJsonl(`${OUT}walk-unique.jsonl`).map((x) => [x.id, x]));
  const items = new Map(loadItems().map((it) => [it.id, it]));
  const all = loadWalk().filter((w) => walks.has(w.id)).map((w): Scored => {
    const r = walks.get(w.id), moves = movesOf(w, r);
    return { w, r, moves, facts: moves.map((m) => m.mv).filter((x): x is MV => !!x) };
  });
  const out: string[] = [];
  const cost = all.reduce((a, s) => a + (s.r.cost ?? 0), 0);
  out.push(`# Opus walkthroughs: the pilot's numbers\n\n${all.length} walkthroughs, $${cost.toFixed(2)}; ${all.filter((s) => !s.r.parsed).length} unparsed, ${all.filter((s) => s.r.finish === "length").length} cut off at ${MAX_TOKENS} tokens.\n`);

  // ---- validity ----
  out.push("## Are the moves right?\n");
  out.push("A move is right when it matches the solution, which clingo proves is the only one (so it is forced by the rules and what was known). *Finished*: the walkthrough's right moves plus the state complete the grid.\n");
  out.push("| set | walkthroughs | moves | unreadable | already decided | right | wrong | walkthroughs with no wrong move | finished | median moves | median steps | unique (clingo) |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const set of ["janko", "psjp"] as const) {
    const ss = all.filter((s) => s.w.set === set);
    if (!ss.length) continue;
    let n = 0, unread = 0, already = 0, right = 0, wrong = 0, clean = 0, finished = 0;
    const lens: number[] = [], steps: number[] = [];
    for (const s of ss) {
      const known = new Map(s.w.known), truth = truthOf(s.w);
      let bad = 0;
      for (const m of s.moves) {
        n++;
        if (!m.mv) { unread++; continue; }
        if (known.has(m.mv[0])) { if (known.get(m.mv[0]) === m.mv[1]) already++; else { wrong++; bad++; } continue; }
        if (valueOf(s.w, m.mv[0]) === m.mv[1]) { right++; known.set(m.mv[0], m.mv[1]); } else { wrong++; bad++; }
      }
      if (!bad && s.r.parsed) clean++;
      // finished: every mark set true in the solution is known true (the rest follow)
      if ([...truth].filter(([, v]) => v).every(([m]) => known.get(m) === true) && s.r.parsed) finished++;
      lens.push(s.moves.length); steps.push(s.r.parsed?.steps?.length ?? 0);
    }
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const u = ss.filter((s) => uniq.get(s.w.id)?.models === 1).length;
    out.push(`| ${set} | ${ss.length} | ${n} | ${unread} | ${already} | ${pct(right, n)} | ${pct(wrong, n)} | ${clean} of ${ss.length} | ${finished} of ${ss.length} | ${med(lens)} | ${med(steps)} | ${u} of ${ss.length} |`);
  }
  out.push("");

  // ---- order: Janko ----
  const jk = all.filter((s) => s.w.set === "janko" && s.r.parsed);
  if (jk.length) {
    out.push("## Does the order follow the person's?\n");
    out.push(`On ${jk.length} Janko states. **First move**: the walkthrough's first move (or the one-move prompt's answer, or the network's top guess) is among the person's next 3. **Along the way, first 20 moves**: each move in the predicted order, from where that order has got to, counts if it is among the person's next 3 from there (opus-human.ts's measure, repeated along the sequence). *People's kinds*: only moves on marks the person also settles at some point (people rarely write "no bulb"). **Spearman**: positions in the predicted order against the person's, over the marks both settle.\n`);
    const net0 = (s: Scored) => (net.get(s.w.id)?.order ?? []) as MV[], sol0 = (s: Scored) => (sol.get(s.w.id)?.order ?? []) as MV[];
    const preds: [string, (s: Scored) => MV[] | null][] = [
      ["Opus walkthrough", (s) => s.facts],
      ["Opus one move (opus-human.ts)", (s) => { const m = one.get(s.w.id)?.mark; return m ? [m] : []; }],
      ["Network (relations-tuned), greedy", (s) => (net.has(s.w.id) ? net0(s) : null)],
      ["Solver's order", (s) => (sol.has(s.w.id) ? sol0(s) : null)],
    ];
    out.push("| predictor | n | first move in next 3 | along the way: in next 3 | along the way, people's kinds | Spearman with the person (mean) |", "|---|---|---|---|---|---|");
    for (const [name, f] of preds) {
      const rows = jk.map((s) => ({ s, o: f(s) })).filter((x) => x.o !== null) as { s: Scored; o: MV[] }[];
      if (!rows.length) continue;
      const first = rows.filter(({ s, o }) => o.length && humanOrder(s.w).slice(0, 3).map(key).includes(key(o.find((mv) => !new Map(s.w.known).has(mv[0])) ?? null))).length;
      const al = rows.map(({ s, o }) => along(s.w, o, 20)), alp = rows.map(({ s, o }) => along(s.w, o, 20, true));
      const sum = (xs: { hits: number; n: number }[]) => [xs.reduce((a, x) => a + x.hits, 0), xs.reduce((a, x) => a + x.n, 0)] as const;
      const [h1, n1] = sum(al), [h2, n2] = sum(alp);
      const multi = name.includes("one move") ? "–" : f2(mean(rows.map(({ s, o }) => spearman(s.w, o))));
      out.push(`| ${name} | ${rows.length} | ${pct(first, rows.length)} | ${name.includes("one move") ? "–" : pct(h1, n1)} | ${name.includes("one move") ? "–" : pct(h2, n2)} | ${multi} |`);
    }
    // random: the chance a move is in the next 3 is 3 over the open (mark, value) pairs
    out.push("");
    out.push("By type (Opus walkthrough; along the way, first 20 moves; and the one-move prompt on the same state):\n");
    out.push("| state | person | walkthrough: first move | along the way | people's kinds | Spearman | one move | steps | moves | wrong |", "|---|---|---|---|---|---|---|---|---|---|");
    for (const s of jk.sort((a, b) => a.w.genre.localeCompare(b.w.genre))) {
      const h3 = humanOrder(s.w).slice(0, 3).map(key), kn = new Map(s.w.known);
      const firstMv = s.facts.find((mv) => !kn.has(mv[0])) ?? null;
      const a = along(s.w, s.facts, 20), b = along(s.w, s.facts, 20, true), m1 = one.get(s.w.id)?.mark;
      const wrong = s.facts.filter((mv) => valueOf(s.w, mv[0]) !== mv[1]).length;
      out.push(`| ${s.w.id} | ${s.w.person} | ${h3.includes(key(firstMv)) ? "yes" : "no"} | ${a.hits}/${a.n} | ${b.hits}/${b.n} | ${f2(spearman(s.w, s.facts))} | ${m1 && h3.includes(key(m1)) ? "yes" : "no"} | ${s.r.parsed.steps.length} | ${s.moves.length} | ${wrong} |`);
    }
    out.push("");
    // techniques named
    const tech = new Map<string, number>();
    for (const s of jk) for (const st of s.r.parsed.steps) { const t = String(st.technique ?? "").toLowerCase().trim(); tech.set(t, (tech.get(t) ?? 0) + 1); }
    out.push(`Techniques named: ${tech.size} distinct over ${[...tech.values()].reduce((a, b) => a + b, 0)} steps. Most used: ${[...tech].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `${t} (${n})`).join("; ")}.\n`);
  }

  // ---- elegance: Puzzle Square JP ----
  const ps = all.filter((s) => s.w.set === "psjp" && s.r.parsed);
  if (ps.length) {
    out.push("## Does Opus's elegance score track likes?\n");
    out.push("Puzzle Square JP pairs from the same site difficulty and type, one much liked per solver and one little liked. *Pairs won*: the more liked puzzle got the higher elegance score (ties count half).\n");
    const pairs = new Map<string, Scored[]>();
    for (const s of ps) pairs.set(s.w.pair!, [...(pairs.get(s.w.pair!) ?? []), s]);
    let won = 0, n = 0;
    const rows: string[] = [];
    for (const [p, xs] of [...pairs].sort()) {
      if (xs.length !== 2) continue;
      const hi = xs.find((x) => x.w.side === "high")!, lo = xs.find((x) => x.w.side === "low")!;
      const eh = Number(hi.r.parsed.elegance), el = Number(lo.r.parsed.elegance);
      n++; won += eh > el ? 1 : eh === el ? 0.5 : 0;
      rows.push(`| ${p} | ${hi.w.psjp} (${hi.w.perSolver!.toFixed(2)}) | ${eh} | ${lo.w.psjp} (${lo.w.perSolver!.toFixed(2)}) | ${el} |`);
    }
    out.push(`Pairs won: ${won} of ${n}.\n`);
    out.push("| pair (type-difficulty-k) | liked: id (likes per solver) | elegance | less liked | elegance |", "|---|---|---|---|---|", ...rows, "");
    const el = ps.map((s) => Number(s.r.parsed.elegance)), di = ps.map((s) => Number(s.r.parsed.difficulty));
    out.push(`Over all ${ps.length}: Spearman of elegance with likes per solver ${f2(spearmanXY(el, ps.map((s) => s.w.perSolver!)))}; of Opus's difficulty with the site's ${f2(spearmanXY(di, ps.map((s) => s.w.difficulty!)))}. Elegance on Janko states (no ratings there): mean ${f2(mean(jk.map((s) => Number(s.r.parsed.elegance))))}.\n`);
  }
  writeFileSync(`${OUT}walk-report.md`, out.join("\n"));
  console.log(out.join("\n"));
  samples(all);
}

/** A few walkthroughs in full, for reading: the grid, then each step with its check. */
function samples(all: Scored[]) {
  const ids = argv.includes("--ids") ? argv[argv.indexOf("--ids") + 1].split(",") : [];
  const pick = ids.length ? all.filter((s) => ids.includes(s.w.id)) : all.filter((s) => s.r.parsed);
  const out: string[] = ["# Opus walkthroughs, in full\n"];
  for (const s of pick) {
    const spec = specOf(s.w), known = new Map(s.w.known), human = s.w.set === "janko" ? humanOrder(s.w) : [];
    const hpos = new Map(human.map((mv, i) => [key(mv), i + 1]));
    out.push(`## ${s.w.id}${s.w.person ? ` (solved by ${s.w.person} on Janko)` : ` (likes per solver ${s.w.perSolver?.toFixed(2)}, site difficulty ${s.w.difficulty})`}\n`);
    out.push("```", draw(spec, known), "```\n");
    s.r.parsed.steps.forEach((st: any, k: number) => {
      const ms = s.moves.filter((m) => m.step === k).map((m) => {
        if (!m.mv) return `${JSON.stringify(m.raw)} (unreadable)`;
        const ok = known.has(m.mv[0]) ? (known.get(m.mv[0]) === m.mv[1] ? "already decided" : "WRONG") : valueOf(s.w, m.mv[0]) === m.mv[1] ? "" : "WRONG";
        if (ok === "") known.set(m.mv[0], m.mv[1]);
        const hp = hpos.get(key(m.mv));
        return `${m.raw.at} ${m.raw.value}${ok ? ` (${ok})` : ""}${s.w.set === "janko" ? (hp ? ` [person's move ${hp}]` : " [person never marks it]") : ""}`;
      });
      out.push(`${k + 1}. **${st.technique}**: ${ms.join("; ")}`, `   - Why: ${st.why}`, `   - Hint: ${st.hint}`);
    });
    out.push("", `**Key ideas:** ${s.r.parsed.key_ideas}`, "", `**Difficulty** ${s.r.parsed.difficulty}/10, **elegance** ${s.r.parsed.elegance}/10: ${s.r.parsed.elegance_why}`, "");
  }
  writeFileSync(`${OUT}walk-samples.md`, out.join("\n"));
}

if (cmd === "sample") sample();
else if (cmd === "ask") await ask();
else if (cmd === "unique") await unique();
else if (cmd === "solver") await solver();
else if (cmd === "show") console.log(promptOf(loadWalk().find((w) => w.id === argv[1]) ?? loadWalk()[0]));
else report();
