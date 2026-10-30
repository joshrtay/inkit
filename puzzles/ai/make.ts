// Making one AI creator's post: candidates from the generator, the scorer's pick, and Claude's title
// and description in the persona's voice. Shared by the weekly batch (./week.ts) and the backfill
// (./backfill.ts), so both make the same puzzle for the same slot. See docs/ai-creators.md.
import { Worker } from "node:worker_threads";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { GridSpec } from "../../src/engine/types.ts";
import { guides } from "../../src/guides/guides.ts";
import { SYMMETRY_GENRES, type GenerateOptions, type Symmetry } from "../grid/generate.ts";
import type { GenrePlan, Persona } from "../../src/ai/personas.ts";
import { difficultyOf, lessonFor, localDate, moonLit, pairRole, planFor, tideStrength, type Slot } from "../../src/ai/schedule.ts";
import { cluesOf, proxyScorer, type Score, type Scorer } from "./score.ts";

/** The model that writes titles and descriptions, and its price per million tokens (input, output). */
export const MODEL = "claude-sonnet-5-5";
export const PRICE = { input: 2, output: 10 };

export const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };

/** Candidate sizes: the day's size first, then larger ones, never smaller. A smaller board can
 *  still score near the target (the estimate runs high on tiny boards), and picking those made the
 *  posts toys: a dry run's median was 4x4 (docs/plan-generator-and-hints.md, "G0 result"). makeFor
 *  falls back to the size below only when nothing at these sizes comes out. */
export function sizesFor(plan: GenrePlan, difficulty: number, n: number, transpose: boolean, rules?: string): [number, number][] {
  // Panes with a fixed region size: only boards that size divides
  const region = Number(rules?.match(/(?:^|,)size=(\d+)/)?.[1] ?? 0);
  const fits = region ? plan.sizes.filter(([r, c]) => (r * c) % region === 0) : plan.sizes;
  const sizes = fits.length ? fits : plan.sizes;
  const base = Math.round(difficulty * (sizes.length - 1));
  const order = [0, 1, 0, 2, 0, 1, 0];
  const out: [number, number][] = [];
  for (let k = 0; out.length < n; k++) {
    const i = Math.min(sizes.length - 1, Math.max(0, base + order[k % order.length]));
    const [r, c] = sizes[i];
    out.push(transpose ? [c, r] : [r, c]);
  }
  return out;
}

export const sketchOf = (spec: GridSpec) => { const { genre, ...body } = spec; return `${genre}\n${JSON.stringify(body)}`; };
export const sha256 = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, "0")).join("");
export const word = (d: number) => (d < 0.2 ? "very easy" : d < 0.4 ? "easy" : d < 0.6 ? "medium" : d < 0.8 ? "hard" : "very hard");

/** The generator in a worker thread, stopped if it takes longer than `ms` (a size it's slow at;
 *  the next candidate tries another). */
export function generateWithin(opts: GenerateOptions, ms: number, log: (s: string) => void = console.log): Promise<GridSpec | null> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./generate-worker.ts", import.meta.url), { workerData: opts });
    const done = (spec: GridSpec | null) => { clearTimeout(timer); void worker.terminate(); resolve(spec); };
    const timer = setTimeout(() => { log(`  gave up on ${opts.genre} ${opts.rows}x${opts.cols} after ${ms / 1000}s`); done(null); }, ms);
    worker.once("message", (spec: GridSpec | null) => done(spec));
    worker.once("error", (e: Error) => { log(`  generator failed: ${e.message}`); done(null); });
  });
}

/** The clue layout to ask the generator for, candidate k: people lay clues out symmetrically far
 *  more often than random removal does (G0: human Akari 95%, Slitherlink 45%, our posts 0%). A
 *  persona that prefers symmetry asks for it every time; the rest every other candidate, so the
 *  scorer picks between the two. */
export function symmetryFor(p: Persona, genre: string, k: number): Symmetry | undefined {
  if (!SYMMETRY_GENRES.includes(genre)) return undefined;
  return p.quality.symmetry === "prefer" || k % 2 === 1 ? "rot180" : undefined;
}

export interface Made {
  spec: GridSpec; score: Score; size: [number, number]; mix?: string; rules?: string; moves?: string; tries: number;
  /** set by the Opus designer (GenrePlan.designer): its one-line idea and what it cost */
  designed?: { idea: string; cost: number; checks: number };
}

export interface MakeOptions {
  /** candidates to make (default: the persona's) */
  candidates?: number;
  /** stop making more candidates for a post after this long, and give up on any one after this long */
  budgetMs: number;
  candidateMs: number;
  scorer?: Scorer;
  /** a candidate this rejects is skipped (the backfill: a puzzle the persona already posted) */
  isNew?: (spec: GridSpec) => boolean;
  /** added to the generator's seeds, for another try at the same slot ("" for the usual seeds) */
  salt?: string;
  log?: (s: string) => void;
  /** the client for the Opus designer (./designer.ts), for genre plans with `designer`; without it
   *  (dry runs, the backfill) those plans use the generator */
  designer?: Anthropic | null;
  /** a tutor's Tuesday or Wednesday: the day before's puzzle, which it changes (./lesson.ts);
   *  without it, that day's is made again */
  previous?: GridSpec | null;
}

/** How much quality weighs against distance from the target difficulty when picking a candidate. */
export const QUALITY_WEIGHT = 0.3;

/** Make candidates for a slot and keep the best: among those good enough, the closest to the
 *  target difficulty, less QUALITY_WEIGHT × quality. */
export async function makeFor(p: Persona, slot: Slot, o: MakeOptions): Promise<Made | null> {
  const log = o.log ?? console.log, scorer = o.scorer ?? proxyScorer;
  const { plan, role, mix, rules, moves, cipher, lesson } = planFor(p, slot);
  if (lesson) {
    // a tutor's post: the lesson's checks pick it (./lesson.ts), the smallest board first
    const { makeLesson } = await import("./lesson.ts");
    const made = await makeLesson(p, slot, {
      previous: o.previous, isNew: o.isNew, candidateMs: o.candidateMs, log, perSize: o.candidates,
      remake: async (day) => (await makeFor(p, { ...day, at: slot.at, difficulty: difficultyOf(p.difficulty, slot.at, day.date, day.weekday) }, { ...o, previous: undefined, isNew: undefined }))?.spec ?? null,
    }, (opts, ms) => generateWithin(opts, ms, log), (k) => 1 + (hash(`${p.handle}/${slot.date}/${k}${o.salt ?? ""}`) % 1e6));
    return made && { spec: made.spec, score: made.score, size: made.size, mix, rules, moves, tries: made.tries };
  }
  const n = o.candidates ?? p.quality.candidates;
  // a pair's second post is the first's board turned on its side: size it by the first day
  const sizeDifficulty = role === 1 ? difficultyOf(p.difficulty, slot.at, slot.date, p.pairs!.days[0]) : slot.difficulty;
  const sizes = sizesFor(plan, sizeDifficulty, n, role === 1, rules);
  if (plan.designer === "opus" && o.designer) {
    // Opus sets it at the day's size; if it gives up, or its puzzle is a repeat or fails the
    // persona's quality bar, the generator makes the post as usual
    const { design } = await import("./designer.ts");
    const [rows, cols] = sizes[0];
    const d = await design(o.designer, { genre: plan.genre, rows, cols, difficulty: slot.difficulty, log }).catch((e) => { log(`  designer failed: ${(e as Error).message}`); return null; });
    if (d?.spec && (!o.isNew || o.isNew(d.spec))) {
      const score = await scorer({ spec: d.spec, plan }, p, slot);
      if (score.quality >= p.quality.minQuality) return { spec: d.spec, score, size: [rows, cols], mix, rules, moves, tries: 1, designed: { idea: d.idea ?? "", cost: d.cost, checks: d.checks } };
      log(`  designer's puzzle below ${p.handle}'s quality bar (${score.quality.toFixed(2)}): ${score.notes.join("; ")}`);
    }
  }
  const started = Date.now();
  let best: Made | null = null, bestKey = Infinity, tries = 0, lastNotes: string[] = [];
  // nothing at the day's sizes: once more at the size below (a size the generator is slow at)
  const below = sizesFor(plan, Math.max(0, sizeDifficulty - 1 / Math.max(1, plan.sizes.length - 1)), 1, role === 1, rules)[0];
  for (let k = 0; k < n * 2 + 1 && tries < n; k++) {
    if (k > 0 && Date.now() - started > o.budgetMs) break;
    const fallback = k === n * 2;
    if (fallback && (best || tries > 0)) break;
    const [rows, cols] = fallback ? below : sizes[k % sizes.length];
    const symmetry = symmetryFor(p, plan.genre, k);
    const seed = 1 + (hash(`${p.handle}/${slot.date}/${k}${o.salt ?? ""}`) % 1e6);
    let spec = await generateWithin({ genre: plan.genre, rows, cols, seed, mix, rules, moves, cipher, symmetry }, o.candidateMs, log);
    // a symmetric layout can need more clues than the generator manages in time: the plain one then
    if (!spec && symmetry) spec = await generateWithin({ genre: plan.genre, rows, cols, seed, mix, rules, moves, cipher }, o.candidateMs, log);
    if (!spec) continue;
    if (o.isNew && !o.isNew(spec)) { lastNotes = ["a repeat of an earlier post"]; continue; }
    tries++;
    const score = await scorer({ spec, plan }, p, slot);
    if (score.quality < p.quality.minQuality) { lastNotes = score.notes; continue; }
    // quality counts for more than a near-tie since the bad-puzzle checks (puzzles/difficulty/quality.ts):
    // a candidate with an unused kind of clue (−0.3) gives way to a clean one up to 0.09 further off target
    const key = Math.abs(score.difficulty - slot.difficulty) - QUALITY_WEIGHT * score.quality;
    if (key < bestKey) { best = { spec, score, size: [rows, cols], mix, rules, moves, tries: 0 }; bestKey = key; }
  }
  if (best) best.tries = tries;
  else log(`  ${p.handle} ${slot.date}: ${tries} candidates (${plan.genre} ${sizes.map(([r, c]) => `${r}x${c}`).join(", ")}${rules ? ` [${rules}]` : ""}${mix ? ` /${mix}` : ""}), none good enough${lastNotes.length ? `: ${lastNotes.join("; ")}` : ""}`);
  return best;
}

// ---- Claude: the title and description ----

/** Words that make writing sound machine-made (docs/ai-creators.md, "Writing"). */
export const AI_TELLS = ["delve", "tapestry", "journey", "embark", "elevate", "seamless", "testament", "realm", "unleash", "vibrant", "intricate", "navigate", "unlock"];

export const Words = z.object({ title: z.string(), description: z.string() });
export interface Usage { calls: number; input: number; output: number }
export const newUsage = (): Usage => ({ calls: 0, input: 0, output: 0 });
export const costOf = (u: Usage) => (u.input * PRICE.input + u.output * PRICE.output) / 1e6;

/** The facts Claude writes from: what the puzzle is, the day, and what it's already called lately. */
export function factsFor(p: Persona, slot: Slot, made: Made, earlier: string[], said: string[]) {
  const g = guides[made.spec.genre as keyof typeof guides];
  const role = pairRole(p, slot.weekday);
  const [rows, cols] = made.spec.size;
  return [
    `Puzzle type: ${g?.name ?? made.spec.genre}${g?.summary ? ` (${g.summary})` : ""}`,
    `Board: ${rows} × ${cols}, ${cluesOf(made.spec).length} clues${made.mix ? `, symbol mix: ${made.mix}` : ""}${made.rules ? `, rules: ${made.rules}` : ""}${made.moves ? `, moves: ${made.moves}` : ""}`,
    ...(made.spec.picture?.title ? [`The hidden picture (never name it, at most hint at it): ${made.spec.picture.title}`] : []),
    ...(made.spec.givens?.some((g) => g.kind === "number" && "letter" in g && g.letter) ? ["Its numbers are written as letters: a cipher to crack."] : []),
    `Difficulty for this creator: ${word(made.score.difficulty)} (the day's target was ${word(slot.difficulty)})`,
    `Posting: ${slot.weekday}, ${slot.date} (${p.schedule.summary})`,
    ...(p.difficulty.kind === "lunar" ? [`Moon: ${Math.round(moonLit(slot.at) * 100)}% lit`] : []),
    ...(p.difficulty.kind === "tides" ? [`Tides: ${tideStrength(slot.at) > 0.66 ? "spring tides" : tideStrength(slot.at) < 0.33 ? "neap tides" : "between springs and neaps"}`] : []),
    ...(role !== null && p.pairs ? [`This is ${p.pairs.names[role]}'s post of the week's pair${role === 1 ? ` (it answers ${p.pairs.names[0]}'s, titled "${earlier.at(-1) ?? "?"}": the same rules, board turned on its side)` : ""}.`] : []),
    ...(earlier.length ? [`Titles already used recently (don't repeat): ${earlier.join("; ")}`] : []),
    ...(said.length ? [`Its last descriptions (don't reuse their images or openings):\n${said.map((d) => `- ${d}`).join("\n")}`] : []),
  ].join("\n");
}

/** The system prompt: the persona's voice, its examples, and the rules every post keeps. */
export function systemFor(p: Persona) {
  return [
    `You write the title and the short description for a logic puzzle posted on inkit.games by "${p.name}", an AI puzzle creator with a persona. Write in its voice.`,
    `Voice: ${p.voice.brief}`,
    `Titles: ${p.voice.titles}`,
    `Examples:\n${p.voice.examples.map((e) => `- ${e.title}: ${e.description}`).join("\n")}`,
    "Rules: the title is at most 40 characters; the description at most 160 characters. The page already shows the puzzle's rules, size and type, so don't restate the rules or recite the facts: say something in character, at most one light hint about where to begin. Never reveal the solution or claim things about the puzzle that the facts don't support. No emoji, no hashtags.",
    `Write like a person with habits, not like an assistant: concrete details, plain words, real opinions. Never use these words: ${AI_TELLS.join(", ")}. No "not just X but Y", no lists of three, no rhetorical questions, no em dashes${p.voice.brief.includes("dashes") ? " (except the voice's own dashes)" : ""}. Never quote or name a real author, book or brand, and never pretend to be a real person.`,
  ].join("\n\n");
}

/** Claude's title and description for a post (`extra`: one more line for the facts, such as a
 *  title to steer clear of). `client` null gives placeholders, with no call. */
export async function wordsFor(client: Anthropic | null, usage: Usage, p: Persona, slot: Slot, made: Made, earlier: string[], said: string[], extra?: string) {
  if (!client) return { title: `[${p.name}: ${made.spec.genre} ${slot.date}]`, description: "[written by Claude in the persona's voice]" };
  const lesson = lessonFor(p, slot);
  if (lesson) {
    // a tutor's words point and never state the rule or the solve: a title or description with
    // the rule's words, coordinates, a chain of steps or too many words is asked for again, then
    // replaced by plain ones (./lesson.ts)
    const L = await import("./lesson.ts");
    const { deductionPaths } = await import("../difficulty/scorer.ts");
    // a back catalogue told a week a day (schedule.ts historySlots): the slot stands for another date
    const sameDay = localDate(slot.at, p.schedule.timezone).date !== slot.date;
    const facts = L.lessonFacts(p, lesson, made.spec, deductionPaths.get(made.spec), made.score.notes, sameDay);
    const prefix = L.titlePrefix(lesson);
    let words = { title: "", description: "" }, rule: string[] = [], told: string[] = [];
    for (let k = 0; k < 3; k++) {
      const again = [
        rule.length ? `Your last try used the rule's words (${rule.join(", ")}): don't.` : "",
        told.length ? `Your last try gave the solve away (${told.join("; ")}): point once at a thing, or say less.` : "",
      ];
      words = await ask(client, usage, p, slot, made, earlier, said, [facts, extra, ...again].filter(Boolean).join("\n"));
      const word = words.title.startsWith(prefix) ? words.title.slice(prefix.length) : words.title.replace(/^.*·\s*/, "");
      words.title = `${prefix}${word.trim()}`;
      // (the prefix is the week's name, not Claude's: only its own words are checked)
      const own = words.title.slice(prefix.length);
      rule = L.tellsRule(`${own} ${words.description}`, lesson.focus);
      told = [...new Set([...L.pointsTooMuch(own, lesson.step, { title: true, sameDay }), ...L.pointsTooMuch(words.description, lesson.step, { sameDay })])];
      if (!rule.length && !told.length) return words;
    }
    const plain = L.PLAIN_WORDS[lesson.step];
    return { title: `${prefix}${plain.word}`, description: plain.description, plain: true as const };
  }
  return ask(client, usage, p, slot, made, earlier, said, extra);
}

async function ask(client: Anthropic, usage: Usage, p: Persona, slot: Slot, made: Made, earlier: string[], said: string[], extra?: string) {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: betaZodOutputFormat(Words) },
    // if the model declines, the API retries on another model in the same call
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemFor(p),
    messages: [{ role: "user", content: factsFor(p, slot, made, earlier, said) + (extra ? `\n${extra}` : "") }],
  });
  usage.calls++; usage.input += response.usage.input_tokens; usage.output += response.usage.output_tokens;
  const w = response.parsed_output;
  if (!w) throw new Error(`Claude gave no title (stop: ${response.stop_reason})`);
  return { title: w.title.trim().slice(0, 120), description: w.description.trim().slice(0, 2000) };
}
