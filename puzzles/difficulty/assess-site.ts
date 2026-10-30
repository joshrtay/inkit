// Assess every newly published puzzle on the site (assess.ts): the deduction solver's difficulty
// and the bad-puzzle checks. The Worker can't run the solver, so this asks the site for the games
// with no assessment yet (GET /admin/assessments), runs the solver on each here, and sends the
// results back (POST). Runs hourly in GitHub Actions (.github/workflows/assess.yml); a game
// published just now gets its solver difficulty within the hour, and its rough estimate until then.
//
//   ADMIN_API_TOKEN=... node --no-warnings puzzles/difficulty/assess-site.ts [--site https://inkit.games] [--max 200] [--minutes 40] [--dry-run]
//
// --max caps the games per run and --minutes the time (a run that stops is picked up by the next).
// --dry-run assesses and prints, sending nothing.
import type { GridSpec } from "../../src/engine/types.ts";
import { assess, ASSESS_VERSION, SITE_BUDGET, type Assessment } from "./assess.ts";

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const site = (arg("site", "http://localhost:5173") ?? "").replace(/\/$/, "");
const max = Number(arg("max", "200")), stopAt = Date.now() + 60e3 * Number(arg("minutes", "40"));
const dryRun = argv.includes("--dry-run");
if (!process.env.ADMIN_API_TOKEN) { console.error("ADMIN_API_TOKEN isn't set"); process.exit(1); }
const headers = { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`, "content-type": "application/json" };

// the site's sketch reader (its aliases resolved for Node: app-resolve.mjs); a dynamic import, so
// the root type-check doesn't follow it into the site's code
const resolver = "./app-resolve.mjs";
await import(resolver);
const { parseSketch } = (await import(new URL("../../app/app/games/sketch.ts", import.meta.url).href)) as
  { parseSketch: (sketch: string, version?: number) => { ok: true; spec: GridSpec } | { ok: false; errors: string[] } };
/** A grid puzzle's spec, or null (it doesn't parse, or it's RYB's figure, which the solver can't read). */
const readSketch = (sketch: string, version: number) => { const p = parseSketch(sketch, version); return p.ok && !p.spec.figure ? p.spec : null; };

interface Pending { id: string; kind: string; sketch: string; sketchVersion: number; sketchHash: string }

async function pending(limit: number): Promise<Pending[]> {
  const res = await fetch(`${site}/admin/assessments?version=${ASSESS_VERSION}&limit=${limit}`, { headers });
  if (!res.ok) throw new Error(`GET /admin/assessments: ${res.status}`);
  return ((await res.json()) as { games: Pending[] }).games;
}

async function send(results: { id: string; sketchHash: string; assessment: Assessment }[]) {
  if (dryRun || !results.length) return;
  const res = await fetch(`${site}/admin/assessments`, { method: "POST", headers, body: JSON.stringify({ results }) });
  const body = await res.json().catch(() => ({})) as { stored?: number; skipped?: string[]; error?: string };
  if (!res.ok) throw new Error(`POST /admin/assessments: ${res.status} ${body.error ?? ""}`);
  if (body.skipped?.length) console.log(`  skipped (changed since): ${body.skipped.join(", ")}`);
}

let done = 0, failed = 0;
const tried = new Set<string>();
while (done + failed < max && Date.now() < stopAt) {
  // a game that can't be read is left for a person to look at; ask past the ones tried already
  const games = (await pending(Math.min(50, max - done - failed + tried.size))).filter((g) => !tried.has(g.id));
  if (!games.length) break;
  const batch: { id: string; sketchHash: string; assessment: Assessment }[] = [];
  for (const g of games) {
    if (Date.now() >= stopAt || done + failed >= max) break;
    tried.add(g.id);
    const spec = readSketch(g.sketch, g.sketchVersion);
    if (!spec) { failed++; console.log(`${g.id} ${g.kind}: the sketch doesn't read as a grid puzzle; skipped`); continue; }
    const a = await assess(spec, SITE_BUDGET);
    console.log(`${g.id} ${g.kind.padEnd(18)} ${a.solved ? "solved" : "unfinished"} estimate ${a.estimate ?? "-"} quality ${a.quality} (${(a.ms / 1000).toFixed(1)} s)${a.flags.length ? `  ${a.flags.join("; ")}` : ""}`);
    batch.push({ id: g.id, sketchHash: g.sketchHash, assessment: a });
    done++;
    if (batch.length >= 10) await send(batch.splice(0));
  }
  await send(batch);
}
console.log(`\n${done} assessed${failed ? `, ${failed} skipped` : ""}${dryRun ? " (dry run: nothing sent)" : ""}`);
process.exit(0);
