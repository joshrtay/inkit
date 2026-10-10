// The AI creators' weekly batch (docs/ai-creators.md): for every persona (app/app/ai/personas.ts)
// and every post it makes in the coming week, make a few candidate puzzles with the generator
// (puzzles/grid/generate.ts), score them (./score.ts), keep the one closest to the day's
// difficulty, ask Claude for a title and description in the persona's voice, and queue it on the
// site as a scheduled draft (POST /admin/ai/schedule). The site's cron publishes each at its time.
//
//   node puzzles/ai/week.ts --dry-run                        make and print a week, write it to archive/ai-week/; no Claude, no site
//   node puzzles/ai/week.ts --dry-run --persona isola        one persona
//   node puzzles/ai/week.ts --site https://inkit.games       the real thing (GitHub Actions runs this on Sundays)
//
// Other flags: --from <ISO time> (default now), --days <n> (default 7), --out <dir>,
// --candidates <n> (overrides each persona's), --limit <n> (at most n posts in all),
// --candidate-ms / --budget-ms (time limits for one candidate and for one post's candidates).
// Env: ANTHROPIC_API_KEY (titles and descriptions), ADMIN_API_TOKEN (the site). Never printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import { PERSONAS, type Persona } from "../../app/app/ai/personas.ts";
import { slotsBetween, type Slot } from "../../app/app/ai/schedule.ts";
import { cluesOf, proxyScorer, type Scorer } from "./score.ts";
import { costOf, makeFor, MODEL, newUsage, sha256, sketchOf, wordsFor, type Made } from "./make.ts";

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
const scorer: Scorer = proxyScorer;

if (only && !PERSONAS.some((p) => p.handle === only)) { console.error(`no persona "${only}"; one of ${PERSONAS.map((p) => p.handle).join(", ")}`); process.exit(1); }
if (!dryRun && !process.env.ADMIN_API_TOKEN) { console.error("ADMIN_API_TOKEN isn't set (or use --dry-run)"); process.exit(1); }
if (!dryRun && !process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY isn't set (or use --dry-run)"); process.exit(1); }

// candidates, the scorer and Claude's words are in ./make.ts (shared with ./backfill.ts)
const client = dryRun ? null : new Anthropic();
const usage = newUsage();

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
    const best = await makeFor(p, slot, { candidates: candidatesOverride, budgetMs: BUDGET_MS, candidateMs: CANDIDATE_MS, scorer });
    if (!best) { failed++; console.log(`${p.handle} ${slot.date}: no candidate good enough`); continue; }
    const sketch = sketchOf(best.spec);
    const solutions = (await solve(makePuzzle(best.spec), 2)).length;
    if (best.spec.genre === "panel" ? solutions < 1 : solutions !== 1) { failed++; console.log(`${p.handle} ${slot.date}: ${solutions} solutions, skipped`); continue; }
    const words = await wordsFor(client, usage, p, slot, best, earlier, said.slice(-4));
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
const cost = costOf(usage);
console.log(`\n${made} posts${failed ? `, ${failed} failed` : ""}; written to ${outDir}${usage.calls ? `; Claude (${MODEL}): ${usage.calls} calls, ${usage.input} in / ${usage.output} out tokens, about $${cost.toFixed(3)}` : ""}`);
if (failed) process.exitCode = 1;
