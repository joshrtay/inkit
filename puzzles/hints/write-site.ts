// Write hint ladders (src/lib/hint-ladder.ts) for the site's puzzles: asks the site for the published
// puzzles with none yet (GET /admin/hints), finds where a player gets stuck in each (stuck.ts), words
// the hints (words.ts) and sends them back (POST). Like the assessments' batch (assess-site.ts):
// the Worker can't run the solver.
//
//   ADMIN_API_TOKEN=... node --no-warnings puzzles/hints/write-site.ts [--site https://inkit.games] [--max 50] [--minutes 40]
//       [--writer solver|opus] [--dry-run]
//   node --no-warnings puzzles/hints/write-site.ts --example akari/1[,sudoku/1,…] [--writer solver|opus]
//       (the repo's examples: prints each ladder, sends nothing)
//
// --writer solver (the default) is free. --writer opus asks Opus once per puzzle (about $0.05-0.15
// each): it needs INKIT_ANTHROPIC_KEY and stops once HINTS_CAP dollars (default 5) are spent.
// --ceiling: the reader's (default: the solver's "medium" band).
import { readFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { type Ladder, styleProblems } from "../../src/lib/hint-ladder.ts";
import { DEFAULT_CEILING, stuckPoints } from "./stuck.ts";
import { askOpus, ladderFromReply, opusPrompt, parseReply, solverLadder } from "./words.ts";

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const writer = arg("writer", "solver"), ceiling = Number(arg("ceiling", String(DEFAULT_CEILING)));
const CAP = Number(process.env.HINTS_CAP) || 5;
if (writer !== "solver" && writer !== "opus") { console.error("--writer is solver or opus"); process.exit(1); }
let spent = 0;

/** One puzzle's ladder, and what fell short (rungs that fell back to the solver's words, style). */
async function ladderFor(spec: GridSpec): Promise<{ ladder: Ladder; notes: string[] }> {
  const stuck = await stuckPoints(spec, { ceiling });
  if (writer === "solver") { const ladder = solverLadder(spec, stuck); return { ladder, notes: styleProblems(ladder) }; }
  if (spent >= CAP) throw new Error(`spent $${spent.toFixed(2)} of HINTS_CAP $${CAP}`);
  const { text, cost } = await askOpus(opusPrompt(spec, stuck));
  spent += cost;
  const { ladder, problems } = ladderFromReply(spec, stuck, parseReply(text));
  return { ladder, notes: [...problems.map((p) => `fell back: ${p}`), ...styleProblems(ladder)] };
}

const print = (name: string, l: Ladder, notes: string[]) => {
  console.log(`\n== ${name}: ${l.version}, ${l.points.length} stuck points`);
  for (const r of l.opening) console.log(`  [${r.kind}] ${r.text}`);
  l.points.forEach((p, k) => {
    console.log(`  -- point ${k + 1} (${p.marks.length} marks to tell it's passed)`);
    for (const r of p.rungs) console.log(`  [${r.kind}${r.technique ? `: ${r.technique}` : ""}] ${r.text}${r.area?.length ? `  (outlines ${r.area.length})` : ""}`);
  });
  for (const n of notes) console.log(`  ! ${n}`);
};

const examples = arg("example");
if (examples) {
  for (const name of examples.split(",")) {
    const file = new URL(`../../src/games/${name.replace(/\.json$/, "")}.json`, import.meta.url);
    const d = JSON.parse(readFileSync(file, "utf8"));
    const spec: GridSpec = { ...d.grid, genre: d.grid.genre ?? name.split("/")[0] };
    const { ladder, notes } = await ladderFor(spec);
    print(name, ladder, notes);
  }
  if (writer === "opus") console.log(`\nspent $${spent.toFixed(3)}`);
  process.exit(0);
}

// ---- the site ----
const site = (arg("site", "http://localhost:5173") ?? "").replace(/\/$/, "");
const max = Number(arg("max", "50")), stopAt = Date.now() + 60e3 * Number(arg("minutes", "40"));
const dryRun = argv.includes("--dry-run");
if (!process.env.ADMIN_API_TOKEN) { console.error("ADMIN_API_TOKEN isn't set"); process.exit(1); }
const headers = { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`, "content-type": "application/json" };

// the site's sketch reader (its aliases resolved for Node), as assess-site.ts does
const resolver = "../difficulty/app-resolve.mjs";
await import(resolver);
const { parseSketch } = (await import(new URL("../../app/app/games/sketch.ts", import.meta.url).href)) as
  { parseSketch: (sketch: string, version?: number) => { ok: true; spec: GridSpec } | { ok: false; errors: string[] } };
const readSketch = (sketch: string, version: number) => { const p = parseSketch(sketch, version); return p.ok && !p.spec.figure ? p.spec : null; };

interface Pending { id: string; kind: string; sketch: string; sketchVersion: number; sketchHash: string }
async function pending(limit: number): Promise<Pending[]> {
  const res = await fetch(`${site}/admin/hints?limit=${limit}`, { headers });
  if (!res.ok) throw new Error(`GET /admin/hints: ${res.status}`);
  return ((await res.json()) as { games: Pending[] }).games;
}
async function send(results: { id: string; sketchHash: string; ladder: Ladder }[]) {
  if (dryRun || !results.length) return;
  const res = await fetch(`${site}/admin/hints`, { method: "POST", headers, body: JSON.stringify({ results }) });
  const body = await res.json().catch(() => ({})) as { stored?: number; skipped?: string[]; error?: string };
  if (!res.ok) throw new Error(`POST /admin/hints: ${res.status} ${body.error ?? ""}`);
  if (body.skipped?.length) console.log(`  skipped (changed since, or its author's own): ${body.skipped.join(", ")}`);
}

let done = 0, failed = 0;
const tried = new Set<string>();
while (done + failed < max && Date.now() < stopAt) {
  const games = (await pending(Math.min(50, max - done - failed + tried.size))).filter((g) => !tried.has(g.id));
  if (!games.length) break;
  const batch: { id: string; sketchHash: string; ladder: Ladder }[] = [];
  for (const g of games) {
    if (Date.now() >= stopAt || done + failed >= max) break;
    tried.add(g.id);
    const spec = readSketch(g.sketch, g.sketchVersion);
    if (!spec) { failed++; console.log(`${g.id} ${g.kind}: not a grid puzzle the solver reads; skipped`); continue; }
    try {
      const { ladder, notes } = await ladderFor(spec);
      if (dryRun) print(`${g.id} ${g.kind}`, ladder, notes);
      else console.log(`${g.id} ${g.kind.padEnd(18)} ${ladder.points.length} stuck points${notes.length ? `  (${notes.length} notes)` : ""}`);
      batch.push({ id: g.id, sketchHash: g.sketchHash, ladder });
      done++;
    } catch (e) { failed++; console.log(`${g.id} ${g.kind}: ${(e as Error).message}`); if (/HINTS_CAP/.test((e as Error).message)) break; }
  }
  await send(batch);
  if (writer === "opus" && spent >= CAP) break;
}
console.log(`${done} written, ${failed} skipped${writer === "opus" ? `, $${spent.toFixed(2)} spent` : ""}${dryRun ? " (dry run: nothing sent)" : ""}`);
