// The AI creators' weekly batch (docs/ai-creators.md): for every persona (app/app/ai/personas.ts)
// and every post it makes in the coming week, make a few candidate puzzles with the generator
// (puzzles/grid/generate.ts), score them (./score.ts), keep the one closest to the day's
// difficulty, ask Claude for a title and description in the persona's voice, and queue it on the
// site as a scheduled draft (POST /admin/ai/schedule). The site's cron publishes each at its time.
//
//   node puzzles/ai/week.ts --dry-run                        make and print a week, write it to archive/ai-week/; no Claude, no site
//   node puzzles/ai/week.ts --dry-run --persona pebble       one persona
//   node puzzles/ai/week.ts --site https://inkit.games       the real thing (GitHub Actions runs this on Sundays)
//
// Other flags: --from <ISO time> (default now), --days <n> (default 7), --out <dir>,
// --candidates <n> (overrides each persona's), --limit <n> (at most n posts in all),
// --candidate-ms / --budget-ms (time limits for one candidate and for one post's candidates).
// Env: ANTHROPIC_API_KEY (titles and descriptions), ADMIN_API_TOKEN (the site). Never printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { guides } from "../../src/guides/guides.ts";
import type { GenerateOptions } from "../grid/generate.ts";
import { PERSONAS, type GenrePlan, type Persona } from "../../app/app/ai/personas.ts";
import { difficultyOf, isoWeek, moonLit, pairRole, slotsBetween, tideStrength, type Slot } from "../../app/app/ai/schedule.ts";
import { cluesOf, proxyScorer, type Score, type Scorer } from "./score.ts";

const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(`--${k}`);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const dryRun = flag("dry-run");
const only = arg("persona");
const site = (arg("site", "http://localhost:5173") ?? "").replace(/\/$/, "");
const from = new Date(arg("from") ?? Date.now());
const days = Number(arg("days", "7"));
const outDir = arg("out", `archive/ai-week/${from.toISOString().slice(0, 10)}`)!;
const candidatesOverride = arg("candidates") ? Number(arg("candidates")) : undefined;
const limit = Number(arg("limit", "100000"));
/** stop making more candidates for a post after this long, and give up on any one after this long */
const BUDGET_MS = Number(arg("budget-ms", "150000")), CANDIDATE_MS = Number(arg("candidate-ms", "90000"));
const MODEL = "claude-sonnet-5-5";
const scorer: Scorer = proxyScorer;

if (only && !PERSONAS.some((p) => p.handle === only)) { console.error(`no persona "${only}"; one of ${PERSONAS.map((p) => p.handle).join(", ")}`); process.exit(1); }
if (!dryRun && !process.env.ADMIN_API_TOKEN) { console.error("ADMIN_API_TOKEN isn't set (or use --dry-run)"); process.exit(1); }
if (!dryRun && !process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY isn't set (or use --dry-run)"); process.exit(1); }

// ---- deterministic choices: the same persona and date always choose the same way ----
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const rng = (key: string) => { let s = hash(key) || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 2 ** 32; };
const pickWeighted = <T extends { weight: number }>(xs: T[], r: number) => { let x = r * xs.reduce((a, b) => a + b.weight, 0); for (const v of xs) if ((x -= v.weight) < 0) return v; return xs.at(-1)!; };

/** What to make for a slot: genre plan, size, mix or rules. A pair's two posts share the week's
 *  plan and rules; the second is the first's board turned on its side. */
function planFor(p: Persona, slot: Slot) {
  const role = pairRole(p, slot.weekday);
  const key = role === null ? `${p.handle}/${slot.date}` : `${p.handle}/${isoWeek(slot.date)}`;
  const r = rng(key);
  const plans = p.genres.filter((g) => !g.days || g.days.includes(slot.weekday));
  const plan = pickWeighted(plans.length ? plans : p.genres, r());
  const choice = { mix: plan.mixes ? plan.mixes[Math.floor(r() * plan.mixes.length)] : undefined, rules: plan.rules ? plan.rules[Math.floor(r() * plan.rules.length)] : undefined };
  return { plan, role, ...choice };
}

/** Candidate sizes, nearest the day's difficulty first. */
function sizesFor(plan: GenrePlan, difficulty: number, n: number, transpose: boolean, rules?: string): [number, number][] {
  // Panes with a fixed region size: only boards that size divides
  const region = Number(rules?.match(/(?:^|,)size=(\d+)/)?.[1] ?? 0);
  const fits = region ? plan.sizes.filter(([r, c]) => (r * c) % region === 0) : plan.sizes;
  const sizes = fits.length ? fits : plan.sizes;
  const base = Math.round(difficulty * (sizes.length - 1));
  const order = [0, 1, -1, 0, 2, -2, 0];
  const out: [number, number][] = [];
  for (let k = 0; out.length < n; k++) {
    const i = Math.min(sizes.length - 1, Math.max(0, base + order[k % order.length]));
    const [r, c] = sizes[i];
    out.push(transpose ? [c, r] : [r, c]);
  }
  return out;
}

const sketchOf = (spec: GridSpec) => { const { genre, ...body } = spec; return `${genre}\n${JSON.stringify(body)}`; };
const sha256 = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, "0")).join("");
const word = (d: number) => (d < 0.2 ? "very easy" : d < 0.4 ? "easy" : d < 0.6 ? "medium" : d < 0.8 ? "hard" : "very hard");

/** The generator in a worker thread, stopped if it takes longer than `ms` (a size it's slow at;
 *  the next candidate tries another). */
function generateWithin(opts: GenerateOptions, ms: number): Promise<GridSpec | null> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./generate-worker.ts", import.meta.url), { workerData: opts });
    const done = (spec: GridSpec | null) => { clearTimeout(timer); void worker.terminate(); resolve(spec); };
    const timer = setTimeout(() => { console.log(`  gave up on ${opts.genre} ${opts.rows}x${opts.cols} after ${ms / 1000}s`); done(null); }, ms);
    worker.once("message", (spec: GridSpec | null) => done(spec));
    worker.once("error", (e: Error) => { console.log(`  generator failed: ${e.message}`); done(null); });
  });
}

interface Made { spec: GridSpec; score: Score; size: [number, number]; mix?: string; rules?: string; tries: number }

/** Make candidates for a slot and keep the best: among those good enough, the closest to the
 *  target difficulty (quality breaks near-ties). */
async function makeFor(p: Persona, slot: Slot): Promise<Made | null> {
  const { plan, role, mix, rules } = planFor(p, slot);
  const n = candidatesOverride ?? p.quality.candidates;
  // a pair's second post is the first's board turned on its side: size it by the first day
  const sizeDifficulty = role === 1 ? difficultyOf(p.difficulty, slot.at, slot.date, p.pairs!.days[0]) : slot.difficulty;
  const sizes = sizesFor(plan, sizeDifficulty, n, role === 1, rules);
  const started = Date.now();
  let best: Made | null = null, bestKey = Infinity, tries = 0, lastNotes: string[] = [];
  for (let k = 0; k < n * 2 && tries < n; k++) {
    if (k > 0 && Date.now() - started > BUDGET_MS) break;
    const [rows, cols] = sizes[k % sizes.length];
    const spec = await generateWithin({ genre: plan.genre, rows, cols, seed: 1 + (hash(`${p.handle}/${slot.date}/${k}`) % 1e6), mix, rules }, CANDIDATE_MS);
    if (!spec) continue;
    tries++;
    const score = await scorer({ spec, plan }, p, slot);
    if (score.quality < p.quality.minQuality) { lastNotes = score.notes; continue; }
    const key = Math.abs(score.difficulty - slot.difficulty) - 0.15 * score.quality;
    if (key < bestKey) { best = { spec, score, size: [rows, cols], mix, rules, tries: 0 }; bestKey = key; }
  }
  if (best) best.tries = tries;
  else console.log(`  ${p.handle} ${slot.date}: ${tries} candidates (${plan.genre} ${sizes.map(([r, c]) => `${r}x${c}`).join(", ")}${rules ? ` [${rules}]` : ""}${mix ? ` /${mix}` : ""}), none good enough${lastNotes.length ? `: ${lastNotes.join("; ")}` : ""}`);
  return best;
}

// ---- Claude: the title and description ----

const Words = z.object({ title: z.string(), description: z.string() });
const client = dryRun ? null : new Anthropic();
const usage = { calls: 0, input: 0, output: 0 };

/** The facts Claude writes from: what the puzzle is, the day, and what it's already called this week. */
function factsFor(p: Persona, slot: Slot, made: Made, earlier: string[], said: string[]) {
  const g = guides[made.spec.genre as keyof typeof guides];
  const role = pairRole(p, slot.weekday);
  const [rows, cols] = made.spec.size;
  return [
    `Puzzle type: ${g?.name ?? made.spec.genre}${g?.summary ? ` (${g.summary})` : ""}`,
    `Board: ${rows} × ${cols}, ${cluesOf(made.spec).length} clues${made.mix ? `, symbol mix: ${made.mix}` : ""}${made.rules ? `, rules: ${made.rules}` : ""}`,
    `Difficulty for this creator: ${word(made.score.difficulty)} (the day's target was ${word(slot.difficulty)})`,
    `Posting: ${slot.weekday}, ${slot.date} (${p.schedule.summary})`,
    ...(p.difficulty.kind === "lunar" ? [`Moon: ${Math.round(moonLit(slot.at) * 100)}% lit`] : []),
    ...(p.difficulty.kind === "tides" ? [`Tides: ${tideStrength(slot.at) > 0.66 ? "spring tides" : tideStrength(slot.at) < 0.33 ? "neap tides" : "between springs and neaps"}`] : []),
    ...(role !== null && p.pairs ? [`This is ${p.pairs.names[role]}'s post of the week's pair${role === 1 ? ` (it answers ${p.pairs.names[0]}'s, titled "${earlier.at(-1) ?? "?"}": the same rules, board turned on its side)` : ""}.`] : []),
    ...(earlier.length ? [`Titles already used recently (don't repeat): ${earlier.join("; ")}`] : []),
    ...(said.length ? [`Its last descriptions (don't reuse their images or openings):\n${said.map((d) => `- ${d}`).join("\n")}`] : []),
  ].join("\n");
}

async function wordsFor(p: Persona, slot: Slot, made: Made, earlier: string[], said: string[]) {
  if (!client) return { title: `[${p.name}: ${made.spec.genre} ${slot.date}]`, description: "[written by Claude in the persona's voice]" };
  const system = [
    `You write the title and the short description for a logic puzzle posted on inkit.games by "${p.name}", an AI puzzle creator with a persona. Write in its voice.`,
    `Voice: ${p.voice.brief}`,
    `Titles: ${p.voice.titles}`,
    `Examples:\n${p.voice.examples.map((e) => `- ${e.title}: ${e.description}`).join("\n")}`,
    "Rules: the title is at most 40 characters; the description at most 160 characters. The page already shows the puzzle's rules, size and type, so don't restate the rules or recite the facts: say something in character, at most one light hint about where to begin. Never reveal the solution or claim things about the puzzle that the facts don't support. No emoji, no hashtags.",
  ].join("\n\n");
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: betaZodOutputFormat(Words) },
    // if the model declines, the API retries on another model in the same call
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: factsFor(p, slot, made, earlier, said) }],
  });
  usage.calls++; usage.input += response.usage.input_tokens; usage.output += response.usage.output_tokens;
  const w = response.parsed_output;
  if (!w) throw new Error(`Claude gave no title (stop: ${response.stop_reason})`);
  return { title: w.title.trim().slice(0, 120), description: w.description.trim().slice(0, 2000) };
}

// ---- the site ----

const headers = () => ({ authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`, "content-type": "application/json" });

/** Instants already taken per persona (queued or recently published), so a second run skips them. */
async function takenOnSite() {
  const res = await fetch(`${site}/admin/ai/schedule`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${site}/admin/ai/schedule: ${res.status}`);
  const { queued, published } = await res.json() as { queued: { handle: string; publishAt: string; title: string }[]; published: { handle: string; publishedAt: string; title: string }[] };
  const taken = new Set([...queued.map((g) => `${g.handle}@${new Date(g.publishAt).getTime()}`), ...published.map((g) => `${g.handle}@${new Date(g.publishedAt).getTime()}`)]);
  const titles = new Map<string, string[]>();
  for (const g of [...published, ...queued]) titles.set(g.handle, [...(titles.get(g.handle) ?? []), g.title]);
  return { taken, titles };
}

async function post(p: Persona, slot: Slot, made: Made, words: { title: string; description: string }, sketch: string, solutions: number) {
  const res = await fetch(`${site}/admin/ai/schedule`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      persona: p.handle, sketch, ...words, publishAt: slot.at.toISOString(),
      proof: { solutions, sketchHash: await sha256(sketch), solver: "clingo (src/engine/solve.ts)" },
      meta: { target: +slot.difficulty.toFixed(2), difficulty: +made.score.difficulty.toFixed(2), quality: +made.score.quality.toFixed(2), measures: made.score.measures },
    }),
  });
  const body = await res.json().catch(() => ({})) as { id?: string; created?: boolean; error?: string };
  if (!res.ok) throw new Error(`POST: ${res.status} ${body.error ?? ""}`);
  return body;
}

// ---- the week ----

const to = new Date(from.getTime() + days * 86400e3);
const { taken, titles } = dryRun ? { taken: new Set<string>(), titles: new Map<string, string[]>() } : await takenOnSite();
mkdirSync(outDir, { recursive: true });
console.log(`${dryRun ? "dry run: " : ""}posts from ${from.toISOString()} to ${to.toISOString()}${dryRun ? "" : ` for ${site}`}\n`);
const rows: string[] = [];
let made = 0, failed = 0;
for (const p of PERSONAS) {
  if (only && p.handle !== only) continue;
  if (p.paused) { console.log(`${p.handle}: paused`); continue; }
  const earlier = [...(titles.get(p.handle) ?? [])].slice(-12), said: string[] = [];
  for (const slot of slotsBetween(p, from, to)) {
    if (made >= limit) break;
    if (taken.has(`${p.handle}@${slot.at.getTime()}`)) { console.log(`${p.handle} ${slot.date}: already queued`); continue; }
    const t0 = Date.now();
    const best = await makeFor(p, slot);
    if (!best) { failed++; console.log(`${p.handle} ${slot.date}: no candidate good enough`); continue; }
    const sketch = sketchOf(best.spec);
    const solutions = (await solve(makePuzzle(best.spec), 2)).length;
    if (best.spec.genre === "panel" ? solutions < 1 : solutions !== 1) { failed++; console.log(`${p.handle} ${slot.date}: ${solutions} solutions, skipped`); continue; }
    const words = await wordsFor(p, slot, best, earlier, said.slice(-4));
    earlier.push(words.title); said.push(words.description);
    let queued = "dry run";
    if (!dryRun) {
      try { const r = await post(p, slot, best, words, sketch, solutions); queued = r.created ? `queued ${r.id}` : `already there (${r.id})`; }
      catch (e) { failed++; queued = `FAILED ${(e as Error).message}`; }
    }
    made++;
    const [r, c] = best.spec.size, s = best.score;
    const local = new Intl.DateTimeFormat("en-GB", { timeZone: p.schedule.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(slot.at);
    const line = `${p.handle.padEnd(16)} ${slot.date} ${local.padEnd(10)} ${best.spec.genre}${best.mix ? `/${best.mix}` : ""}${best.rules ? `[${best.rules}]` : ""} ${r}x${c} ${String(cluesOf(best.spec).length).padStart(2)} clues  target ${slot.difficulty.toFixed(2)} got ${s.difficulty.toFixed(2)} q ${s.quality.toFixed(2)}  (${best.tries} tried, ${((Date.now() - t0) / 1000).toFixed(0)}s)  "${words.title}"  ${queued}`;
    console.log(line + (s.notes.length ? `\n${" ".repeat(17)}${s.notes.join("; ")}` : "") + (dryRun ? "" : `\n${" ".repeat(17)}${words.description}`));
    rows.push(line);
    writeFileSync(join(outDir, `${slot.date}-${p.handle}.json`), JSON.stringify({ persona: p.handle, slot: { ...slot, at: slot.at.toISOString() }, ...words, sketch, solutions, score: s }, null, 1) + "\n");
  }
}
const cost = (usage.input * 2 + usage.output * 10) / 1e6;
console.log(`\n${made} posts${failed ? `, ${failed} failed` : ""}; written to ${outDir}${usage.calls ? `; Claude (${MODEL}): ${usage.calls} calls, ${usage.input} in / ${usage.output} out tokens, about $${cost.toFixed(3)}` : ""}`);
if (failed) process.exitCode = 1;
