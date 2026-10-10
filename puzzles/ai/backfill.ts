// The AI creators' back catalogue (docs/ai-creators.md, "Backfilling"): every post each persona
// would have made over the last couple of months, made exactly as the weekly batch makes them
// (./make.ts: the same slots from schedule.ts, the same plan, candidates, scorer and Claude prompt),
// written to a JSON file that ./send-backfill.ts sends to the site (POST /admin/ai/backfill), which
// inserts each as published at its slot.
//
//   node puzzles/ai/backfill.ts --dry-run                   list every slot (date, time, difficulty, genre); no puzzles, no Claude
//   node puzzles/ai/backfill.ts --no-text                   make the puzzles, with placeholder titles; no Claude
//   node puzzles/ai/backfill.ts                             make the puzzles and their words (ANTHROPIC_API_KEY)
//
//   node puzzles/ai/backfill.ts --persona slate --curriculum --no-text --out puzzles/ai/out/slate.json
//                                                           a tutor's whole curriculum, from its first week through yesterday
//   node puzzles/ai/backfill.ts --persona slate --curriculum --rewrite-words --out puzzles/ai/out/slate.json
//                                                           new descriptions for posts already worded, keeping
//                                                           their puzzles (and their titles, if a tutor's pass ./lesson.ts)
//
// Flags: --persona <handle>[,<handle>...]; --curriculum (a tutor's days reach back to its
// curriculum's first week, app/app/ai/personas.ts `curriculumStart`; or, with a `history`, the whole
// curriculum told over the history's days, schedule.ts `historySlots`: a post already in the file
// for the same curriculum day moves to its new slot, keeping its puzzle); --days <n> (default 61: the n local days before today,
// through yesterday, in each persona's own time zone); --now <ISO time> (default now);
// --out <file> (default puzzles/ai/out/backfill.json); --jobs <n> (personas made at once,
// default a third of the CPUs); --candidates <n>, --candidate-ms, --budget-ms (as week.ts);
// --max-spend <dollars> (stop asking Claude for words past it).
//
// Resumable: the file is rewritten after every post, and a rerun skips every slot already in it
// (a slot is its persona and instant). A post made with --no-text gets its words on a later run
// without --no-text, keeping its puzzle. Within a persona: no puzzle twice, no title too like an
// earlier one (app/app/ai/titles.ts), and its posts are made oldest first, so a teaching sequence
// (Isola's symbol of the week, schedule.ts `seriesIndex`) and a pair's answer follow on.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { PERSONAS, type Persona } from "../../app/app/ai/personas.ts";
import { backfillRange, backfillSlots, historySlots, planFor, slotKey, type Slot } from "../../app/app/ai/schedule.ts";
import { clashingTitle } from "../../app/app/ai/titles.ts";
import { cluesOf, type Score } from "./score.ts";
import { deductionScorer } from "../difficulty/scorer.ts";
import { costOf, factsFor, makeFor, MODEL, newUsage, PRICE, sha256, sketchOf, systemFor, wordsFor, type Made } from "./make.ts";

const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(`--${k}`);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const dryRun = flag("dry-run"), noText = flag("no-text"), curriculum = flag("curriculum"), rewriteWords = flag("rewrite-words");
const only = arg("persona")?.split(",").map((h) => h.trim()).filter(Boolean);
const days = Number(arg("days", "61"));
const now = new Date(arg("now") ?? Date.now());
const outFile = arg("out", "puzzles/ai/out/backfill.json")!;
const jobs = Math.max(1, Number(arg("jobs", String(Math.max(1, Math.floor(cpus().length / 3))))));
const candidates = arg("candidates") ? Number(arg("candidates")) : undefined;
const BUDGET_MS = Number(arg("budget-ms", "150000")), CANDIDATE_MS = Number(arg("candidate-ms", "90000"));
/** stop asking Claude once the words have cost this much (dollars) */
const MAX_SPEND = Number(arg("max-spend", "Infinity"));

for (const h of only ?? []) if (!PERSONAS.some((p) => p.handle === h)) { console.error(`no persona "${h}"; one of ${PERSONAS.map((p) => p.handle).join(", ")}`); process.exit(1); }
if (!Number.isInteger(days) || days < 1 || days > 400) { console.error("--days: a whole number of days, 1 to 400"); process.exit(1); }
if (Number.isNaN(now.getTime())) { console.error("--now isn't a time"); process.exit(1); }
const writeText = !dryRun && !noText;
if (writeText && !process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY isn't set (or use --no-text or --dry-run)"); process.exit(1); }

const personas = PERSONAS.filter((p) => !p.paused && (!only || only.includes(p.handle)));
/** How many days back a persona's backfill reaches: --days, or with --curriculum a tutor's whole
 *  curriculum (its first Monday through yesterday). */
const daysOf = (p: Persona) => (curriculum && p.curriculumStart ? Math.ceil((now.getTime() - Date.parse(`${p.curriculumStart}T00:00:00Z`)) / 86400e3) + 1 : days);

/** One backfilled post, as the file keeps it (./send-backfill.ts sends these). */
export interface BackfillRecord {
  key: string;
  persona: string;
  publishedAt: string;
  date: string;
  weekday: string;
  /** the day's target difficulty */
  target: number;
  genre: string;
  mix?: string; rules?: string; moves?: string;
  size: [number, number];
  title: string;
  description: string;
  /** made with --no-text: the words are placeholders, still to be written */
  placeholder?: boolean;
  /** an earlier title this one is still too like after three tries */
  titleClash?: string;
  /** a tutor's post: the week's subject, the day's step, the curriculum week (from 1) */
  lesson?: { subject: string; focus: string; step: string; week: number };
  /** a tutor's words kept stating the rule, so plain ones stand in (./lesson.ts PLAIN_WORDS) */
  plainWords?: boolean;
  sketch: string;
  proof: { solutions: number; sketchHash: string; solver: string };
  score: Score;
  tries: number;
  /** how long making the puzzle took */
  ms: number;
}
export interface BackfillFile {
  kind: "inkit-ai-backfill";
  version: 1;
  updated: string;
  posts: BackfillRecord[];
  /** slots that came out with nothing good enough (tried again on a rerun) */
  failed: { key: string; persona: string; date: string; why: string }[];
}

// ---- the dry run: the slots, and what each would be ----

const localTime = (p: Persona, at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: p.schedule.timezone, hour: "2-digit", minute: "2-digit" }).format(at);
const told = (p: Persona) => curriculum && !!p.history;
const slotsOf = (p: Persona) => (told(p) ? historySlots(p).filter((s) => s.at.getTime() < now.getTime()) : backfillSlots(p, now, daysOf(p)));

if (dryRun) {
  const genres = new Map<string, number>(), counts: [string, number][] = [];
  let estIn = 0;
  for (const p of personas) {
    const slots = slotsOf(p), range = backfillRange(p, now, daysOf(p));
    const from = told(p) ? slots[0]?.at ?? range.from : range.from, to = told(p) ? slots.at(-1)?.at ?? range.to : range.to;
    counts.push([p.handle, slots.length]);
    console.log(`${p.name} (@${p.handle}): ${slots.length} posts, ${from.toISOString()} .. ${to.toISOString()} (${p.schedule.timezone}; ${p.difficulty.kind})`);
    for (const s of slots) {
      const { plan, mix, rules, moves, lesson } = planFor(p, s);
      const label = `${plan.genre}${mix ? `/${mix}` : ""}${rules ? `[${rules}]` : ""}${moves ? `{${moves}}` : ""}${lesson ? `  week ${lesson.week + 1}: ${lesson.subject.id}, ${lesson.step}${lesson.focus !== lesson.subject ? ` of ${lesson.focus.id}` : ""}` : ""}`;
      genres.set(plan.genre, (genres.get(plan.genre) ?? 0) + 1);
      console.log(`  ${s.date} ${s.weekday} ${told(p) ? `${s.at.toISOString().slice(0, 10)} ` : ""}${localTime(p, s.at)}  ${s.at.toISOString()}  difficulty ${s.difficulty.toFixed(2)}  ${label}`);
      estIn += estimateInputTokens(p, s, plan.genre, plan.sizes[Math.round(s.difficulty * (plan.sizes.length - 1))]);
    }
  }
  const total = counts.reduce((a, [, n]) => a + n, 0);
  console.log(`\nposts per persona: ${counts.map(([h, n]) => `${h} ${n}`).join(", ")}`);
  console.log(`total: ${total} posts over ${personas.map(daysOf).reduce((a, b) => Math.max(a, b), 0)} days at most`);
  console.log(`genres: ${[...genres].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(", ")}`);
  const OUT = 150;
  console.log(`Claude (${MODEL}, if run with words): ${total} calls, about ${Math.round(estIn / Math.max(1, total))} input and ${OUT} output tokens each (estimated from the prompt's length), about $${((estIn * PRICE.input + total * OUT * PRICE.output) / 1e6).toFixed(2)}`);
  process.exit(0);
}

/** The prompt's size for a slot, with a typical history (12 titles, 4 descriptions), at about 3.5
 *  characters a token, plus the structured-output schema. No call is made. */
function estimateInputTokens(p: Persona, s: Slot, genre: string, size: [number, number]) {
  const made = { spec: { genre, size, givens: [] } as unknown as GridSpec, score: { difficulty: s.difficulty, quality: 1, notes: [], measures: {} }, size, tries: 1 } as Made;
  const titles = Array.from({ length: 12 }, () => "x".repeat(24)), said = Array.from({ length: 4 }, () => "x".repeat(150));
  return Math.round((systemFor(p).length + factsFor(p, s, made, titles, said).length) / 3.5) + 120;
}

// ---- the file ----

function load(): BackfillFile {
  if (!existsSync(outFile)) return { kind: "inkit-ai-backfill", version: 1, updated: new Date().toISOString(), posts: [], failed: [] };
  const f = JSON.parse(readFileSync(outFile, "utf8")) as BackfillFile;
  if (f.kind !== "inkit-ai-backfill") throw new Error(`${outFile} isn't a backfill file`);
  return f;
}
const file = load();
const posts = new Map(file.posts.map((r) => [r.key, r]));
const failed = new Map(file.failed.map((r) => [r.key, r]));
mkdirSync(dirname(outFile), { recursive: true });
/** Written whole after every post, through a temporary file, so a stopped run leaves it readable. */
function save() {
  const out: BackfillFile = {
    kind: "inkit-ai-backfill", version: 1, updated: new Date().toISOString(),
    posts: [...posts.values()].sort((a, b) => a.persona.localeCompare(b.persona) || a.publishedAt.localeCompare(b.publishedAt)),
    failed: [...failed.values()],
  };
  writeFileSync(`${outFile}.tmp`, JSON.stringify(out, null, 1) + "\n");
  renameSync(`${outFile}.tmp`, outFile);
}

// ---- making ----

const specOf = (r: BackfillRecord): GridSpec => ({ ...JSON.parse(r.sketch.slice(r.sketch.indexOf("\n") + 1)), genre: r.genre as GridSpec["genre"] });
const shiftDate = (date: string, days: number) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };

const client = writeText ? new Anthropic() : null;
const usage = newUsage();
let made = 0, worded = 0, skipped = 0, failures = 0, moved = 0;

async function backfillPersona(p: Persona) {
  const log = (s: string) => console.log(`${p.handle.padEnd(16)} ${s.trimStart()}`);
  const slots = slotsOf(p);
  const mine = () => [...posts.values()].filter((r) => r.persona === p.handle).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  for (const slot of slots) {
    const key = slotKey(p.handle, slot.at);
    let rec: BackfillRecord | undefined = posts.get(key);
    if (told(p) && rec?.date !== slot.date) {
      // the same curriculum day at its old slot: moved here, its puzzle and words kept (a post
      // already at this instant stands for another day, and moves to its own slot in turn)
      const old = mine().find((r) => r.date === slot.date);
      if (rec) { posts.delete(key); posts.set(`${rec.key}#moving`, { ...rec, key: `${rec.key}#moving` }); }
      rec = old && { ...old, key, publishedAt: slot.at.toISOString(), weekday: slot.weekday, target: +slot.difficulty.toFixed(3) };
      if (old) { posts.delete(old.key); posts.set(key, rec!); moved++; }
    }
    // --rewrite-words only rewords: a slot not already in the file gets no puzzle
    if (rec ? (rec.placeholder || rewriteWords ? !writeText : true) : rewriteWords) { if (rec) save(); skipped++; continue; }
    if (!rec) {
      // ---- the puzzle: never one this persona already has ----
      const seen = new Set(mine().map((r) => r.sketch));
      let repeats = 0;
      const isNew = (spec: GridSpec) => { const fresh = !seen.has(sketchOf(spec)); if (!fresh) repeats++; return fresh; };
      const t0 = Date.now();
      // a tutor's Tuesday and Wednesday change the day before's board: that post, from this file
      const lesson = planFor(p, slot).lesson;
      const before = lesson?.step === "contrast" || lesson?.step === "second-contrast" ? mine().find((r) => r.date === shiftDate(slot.date, -1)) : undefined;
      const previous = before ? specOf(before) : null;
      const opts = { candidates, budgetMs: BUDGET_MS, candidateMs: CANDIDATE_MS, isNew, log, previous };
      let best = await makeFor(p, slot, opts);
      for (let k = 1; !best && repeats && k <= 2; k++) { repeats = 0; best = await makeFor(p, slot, { ...opts, salt: `/again${k}` }); }
      if (!best) { failures++; failed.set(key, { key, persona: p.handle, date: slot.date, why: "no candidate good enough" }); save(); log(`${slot.date}: no candidate good enough`); continue; }
      const sketch = sketchOf(best.spec);
      const solutions = (await solve(makePuzzle(best.spec), 2)).length;
      if (best.spec.genre === "panel" ? solutions < 1 : solutions !== 1) { failures++; failed.set(key, { key, persona: p.handle, date: slot.date, why: `${solutions} solutions` }); save(); log(`${slot.date}: ${solutions} solutions, skipped`); continue; }
      rec = {
        key, persona: p.handle, publishedAt: slot.at.toISOString(), date: slot.date, weekday: slot.weekday, target: +slot.difficulty.toFixed(3),
        genre: best.spec.genre!, mix: best.mix, rules: best.rules, moves: best.moves, size: best.spec.size as [number, number],
        title: `[${p.name}: ${best.spec.genre} ${slot.date}]`, description: "[to be written in the persona's voice]", placeholder: true,
        sketch, proof: { solutions, sketchHash: await sha256(sketch), solver: "clingo (src/engine/solve.ts)" },
        score: best.score, tries: best.tries, ms: Date.now() - t0,
        ...(lesson ? { lesson: { subject: lesson.subject.id, focus: lesson.focus.id, step: lesson.step, week: lesson.week + 1 } } : {}),
      };
      failed.delete(key);
      made++;
    }
    // ---- the words: in the persona's voice, no title too like an earlier one ----
    if (writeText && costOf(usage) >= MAX_SPEND) { log(`stopped: the words have cost $${costOf(usage).toFixed(2)} (--max-spend ${MAX_SPEND})`); posts.set(key, rec); save(); return; }
    if (writeText) {
      const at = rec.publishedAt, before = mine().filter((r) => r.publishedAt < at && !r.placeholder);
      const earlier = before.map((r) => r.title).slice(-12), said = before.map((r) => r.description).slice(-4);
      const others = mine().filter((r) => r.key !== key && !r.placeholder).map((r) => r.title);
      const m: Made = { spec: specOf(rec), score: rec.score, size: rec.size, mix: rec.mix, rules: rec.rules, moves: rec.moves, tries: rec.tries };
      // a tutor's words point at where the solve first needs the rule: the deduction path
      if (planFor(p, slot).lesson) await deductionScorer({ spec: m.spec, plan: planFor(p, slot).plan }, p, slot).catch(() => null);
      // --rewrite-words keeps a worded post's title when a tutor's checks pass it (no coordinates)
      const lesson = planFor(p, slot).lesson;
      const keep = rewriteWords && !rec.placeholder && !rec.plainWords && (!lesson || !(await import("./lesson.ts")).pointsTooMuch(rec.title, lesson.step, { title: true, sameDay: told(p) }).length) ? rec.title : undefined;
      let words = await wordsFor(client, usage, p, slot, m, earlier, said, keep && `The title is "${keep}": keep it exactly.`), clash = keep ? undefined : clashingTitle(words.title, others);
      if (keep) words = { ...words, title: keep };
      for (let k = 0; clash && k < 2; k++) {
        words = await wordsFor(client, usage, p, slot, m, earlier, said, `"${clash}" is already taken: choose a title with different words.`);
        clash = clashingTitle(words.title, others);
      }
      const { plain, ...text } = words as typeof words & { plain?: boolean };
      rec = { ...rec, ...text, placeholder: undefined, titleClash: clash, plainWords: plain || undefined };
      worded++;
    }
    const r = rec;
    posts.set(key, r);
    save();
    log(`${slot.date} ${localTime(p, slot.at)} ${r.genre}${r.mix ? `/${r.mix}` : ""}${r.rules ? `[${r.rules}]` : ""} ${r.size.join("x")} ${cluesOf(JSON.parse(r.sketch.slice(r.sketch.indexOf("\n") + 1))).length} clues  target ${r.target.toFixed(2)} got ${r.score.difficulty.toFixed(2)} q ${r.score.quality.toFixed(2)} (${(r.ms / 1000).toFixed(0)}s)  "${r.title}"${r.titleClash ? `  (too like "${r.titleClash}")` : ""}`);
  }
}

console.log(`backfill: ${personas.length} personas, the ${days} days before ${now.toISOString().slice(0, 10)}; ${writeText ? `with words (${MODEL})` : "placeholder words"}; ${jobs} at a time; ${outFile}\n`);
const queue = [...personas];
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { for (let p = queue.shift(); p; p = queue.shift()) await backfillPersona(p); }));
save();
console.log(`\n${made} puzzles made, ${worded} worded, ${moved} moved to new slots, ${skipped} already done${failures ? `, ${failures} failed (a rerun tries them again)` : ""}, in ${((Date.now() - t0) / 60000).toFixed(1)} min; ${posts.size} posts in ${outFile}` +
  (usage.calls ? `\nClaude (${MODEL}): ${usage.calls} calls, ${usage.input} in / ${usage.output} out tokens, about $${costOf(usage).toFixed(3)}` : ""));
if (failures) process.exitCode = 1;
