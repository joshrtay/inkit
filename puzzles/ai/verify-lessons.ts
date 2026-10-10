// Checks a tutor's backfilled lessons again, each on its own (./lesson.ts): every post against its
// day's step (the contrasts against the day before's post in the file), plus the deduction path's
// use of the subject. Prints the curriculum week by week with each day's verdict, then the weeks
// with a missing or failing post and why. Exits 1 if any fails.
//
//   node puzzles/ai/verify-lessons.ts --file puzzles/ai/out/slate.json
//   node puzzles/ai/verify-lessons.ts --dir puzzles/ai/out/slate --merge puzzles/ai/out/slate.json   several part files, joined first
// Flags: --until <date> (default yesterday); --failures <file> (the failing posts' dates, as JSON).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { PERSONAS } from "../../app/app/ai/personas.ts";
import { lessonFor, lessonSettings, slotsBetween } from "../../app/app/ai/schedule.ts";
import { deduce } from "../difficulty/deduce.ts";
import { checkLesson, usesSubject } from "./lesson.ts";
import type { BackfillFile, BackfillRecord } from "./backfill.ts";

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const handle = arg("persona", "slate")!;
const p = PERSONAS.find((x) => x.handle === handle);
if (!p?.curriculum) { console.error(`${handle} has no curriculum`); process.exit(1); }

let data: BackfillFile;
const dir = arg("dir");
if (dir) {
  const parts = readdirSync(dir).filter((f) => f.endsWith(".json") && (JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as { kind?: string }).kind === "inkit-ai-backfill").map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as BackfillFile);
  const posts = new Map<string, BackfillRecord>(), failed = new Map<string, BackfillFile["failed"][number]>();
  for (const part of parts) { for (const r of part.posts) posts.set(r.key, r); for (const f of part.failed) failed.set(f.key, f); }
  for (const k of posts.keys()) failed.delete(k);
  data = { kind: "inkit-ai-backfill", version: 1, updated: new Date().toISOString(), posts: [...posts.values()].sort((a, b) => a.persona.localeCompare(b.persona) || a.publishedAt.localeCompare(b.publishedAt)), failed: [...failed.values()] };
  const merge = arg("merge");
  if (merge) {
    // keep words already written in the merged file (a second run of the parts carries them over)
    try { const old = JSON.parse(readFileSync(merge, "utf8")) as BackfillFile; for (const r of old.posts) { const n = data.posts.find((x) => x.key === r.key); if (n && n.sketch === r.sketch && !r.placeholder) Object.assign(n, { title: r.title, description: r.description, placeholder: undefined, plainWords: r.plainWords, titleClash: r.titleClash }); } } catch { /* no file yet */ }
    writeFileSync(merge, JSON.stringify(data, null, 1) + "\n");
    console.log(`merged ${parts.length} files: ${data.posts.length} posts, ${data.failed.length} failed slots -> ${merge}`);
  }
} else data = JSON.parse(readFileSync(arg("file", "puzzles/ai/out/slate.json")!, "utf8")) as BackfillFile;

const mine = data.posts.filter((r) => r.persona === handle);
const byDate = new Map(mine.map((r) => [r.date, r]));
const specOf = (r: BackfillRecord): GridSpec => ({ ...JSON.parse(r.sketch.slice(r.sketch.indexOf("\n") + 1)), genre: r.genre as GridSpec["genre"] });
const shift = (date: string, n: number) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

const start = new Date(`${p.curriculumStart}T00:00:00Z`), last = arg("until") ?? new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
const slots = slotsBetween(p, start, new Date(Date.parse(`${last}T23:59:59Z`)));
const weeks = new Map<number, string[]>(), problems: string[] = [], fallbacks: string[] = [];
let ok = 0, bad = 0, missing = 0;
for (const slot of slots) {
  const lesson = lessonFor(p, slot)!, r = byDate.get(slot.date);
  const row = weeks.get(lesson.week) ?? [];
  const label = `W${lesson.week + 1} ${slot.date} ${lesson.focus.id} ${lesson.step}`;
  if (!r) { missing++; row.push("·"); problems.push(`${label}: missing (${data.failed.find((f) => f.date === slot.date && f.persona === handle)?.why ?? "not made"})`); weeks.set(lesson.week, row); continue; }
  const spec = specOf(r), prev = byDate.get(shift(slot.date, -1));
  const company = lessonSettings(p, lesson).with;
  // a post made by a fallback is checked as it was made (and counted)
  const notes = r.score.notes.join(" ");
  const fresh = notes.includes("a fresh board"), loose = /loose|two changes|fell back|no neat trap/.test(notes);
  if (fresh || loose) fallbacks.push(`${label}: ${fresh ? "a fresh board" : notes.includes("two changes") ? "two changes" : notes.includes("loose: ") ? notes.match(/loose: [^|;]*/)![0] : "a check, not a trap"}`);
  const c = await checkLesson(spec, lesson, { company, previous: prev ? specOf(prev) : undefined, fresh, loose });
  let why = c.ok ? "" : c.notes.at(-1)!;
  if (c.ok) {
    const { path } = await deduce(spec, { budgetMs: 10000 });
    for (const s of [lesson.focus, ...(lesson.step === "combine" && company ? [company] : [])]) if (!usesSubject(path, s)) why = `no step of the solve uses ${s.name}`;
  }
  if (why) { bad++; row.push("✗"); problems.push(`${label}: ${why}`); } else { ok++; row.push("✓"); }
  weeks.set(lesson.week, row);
}
for (const [w, row] of weeks) {
  const s = p.curriculum[((w % p.curriculum.length) + p.curriculum.length) % p.curriculum.length];
  console.log(`W${String(w + 1).padStart(2)} ${row.join(" ")}  ${s.id}${s.review ? ` (${s.review.join(", ")})` : ""}`);
}
console.log(`\n${ok} pass, ${bad} fail, ${missing} missing, of ${slots.length} slots (${p.curriculumStart} .. ${last})`);
if (fallbacks.length) console.log(`${fallbacks.length} made by a fallback:\n${fallbacks.map((x) => `  ${x}`).join("\n")}`);
if (problems.length) console.log(`problems:\n${problems.map((x) => `  ${x}`).join("\n")}`);
const out = arg("failures");
if (out) writeFileSync(out, JSON.stringify(problems.filter((x) => !x.includes("missing")).map((x) => x.split(" ")[1])) + "\n");
if (bad || missing) process.exitCode = 1;
