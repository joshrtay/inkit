// Send a backfill file (./backfill.ts) to the site: POST /admin/ai/backfill, a batch at a time.
// The site checks each post as it checks a scheduled one and inserts it as published at its slot;
// a post already there is skipped, so this can be run again safely (with --update-words, a post
// already there with the same puzzle takes the file's title and description). See docs/ai-creators.md.
//
//   node puzzles/ai/send-backfill.ts --dry-run                              the site checks everything and says what it would do; writes nothing
//   node puzzles/ai/send-backfill.ts --site https://inkit.games             the real thing
//
// Flags: --file <path> (default puzzles/ai/out/backfill.json); --site (default http://localhost:5173);
// --persona <handle>[,...]; --batch <n> (default 20); --allow-placeholders (send posts made with
// --no-text, with their placeholder words: for trying it locally, refused for any other site);
// --update-words (posts already sent get the file's words; their puzzles never change).
// Env: ADMIN_API_TOKEN (never printed).
import { readFileSync } from "node:fs";
import type { BackfillFile, BackfillRecord } from "./backfill.ts";

const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(`--${k}`);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const dryRun = flag("dry-run"), allowPlaceholders = flag("allow-placeholders"), updateWords = flag("update-words");
const file = arg("file", "puzzles/ai/out/backfill.json")!;
const site = (arg("site", "http://localhost:5173") ?? "").replace(/\/$/, "");
const only = arg("persona")?.split(",").map((h) => h.trim()).filter(Boolean);
const batch = Math.min(50, Math.max(1, Number(arg("batch", "20"))));
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(site);

if (!process.env.ADMIN_API_TOKEN) { console.error("ADMIN_API_TOKEN isn't set"); process.exit(1); }
if (allowPlaceholders && !local) { console.error("--allow-placeholders is for a local site only"); process.exit(1); }

const data = JSON.parse(readFileSync(file, "utf8")) as BackfillFile;
if (data.kind !== "inkit-ai-backfill") { console.error(`${file} isn't a backfill file`); process.exit(1); }
const chosen = data.posts.filter((r) => !only || only.includes(r.persona));
const placeholders = chosen.filter((r) => r.placeholder);
if (placeholders.length && !allowPlaceholders) {
  console.error(`${placeholders.length} posts still have placeholder words (made with --no-text): run backfill.ts without --no-text first, or leave them out with --persona`);
  process.exit(1);
}

const asPost = (r: BackfillRecord) => ({
  persona: r.persona, sketch: r.sketch, title: r.title, description: r.description, publishedAt: r.publishedAt, proof: r.proof,
  meta: { target: r.target, difficulty: +r.score.difficulty.toFixed(2), quality: +r.score.quality.toFixed(2), backfill: true },
});

console.log(`${dryRun ? "dry run: " : ""}${chosen.length} posts from ${file} to ${site}/admin/ai/backfill, ${batch} at a time`);
const totals: Record<string, number> = {};
let errors = 0;
for (let i = 0; i < chosen.length; i += batch) {
  const part = chosen.slice(i, i + batch);
  const res = await fetch(`${site}/admin/ai/backfill`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ posts: part.map(asPost), dryRun, updateWords }),
  });
  const body = await res.json().catch(() => ({})) as { error?: string; results?: { key?: string; id?: string | null; status: string; error?: string }[] };
  if (!res.ok || !body.results) { console.error(`POST ${site}/admin/ai/backfill: ${res.status} ${body.error ?? ""}`); process.exit(1); }
  for (const r of body.results) {
    totals[r.status] = (totals[r.status] ?? 0) + 1;
    if (r.status === "invalid" || r.status === "repeat") { errors++; console.log(`  ${r.key ?? "?"}: ${r.status}${r.error ? ` (${r.error})` : r.id ? ` of ${r.id}` : ""}`); }
    else console.log(`  ${r.key}: ${r.status}${r.id ? ` ${site}/g/${r.id}` : ""}`);
  }
}
console.log(`\n${Object.entries(totals).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing sent"}`);
if (errors) process.exitCode = 1;
