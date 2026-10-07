// Score the sketch reader against the evaluation set: read each case's photo the way the site
// does, and compare the reading with the puzzle it should be (app/games/diff.ts, the same score
// the live site keeps). Every run calls Claude for every case, so it costs money: without --yes
// it only says what it would do.
//
//   npx vite-node --config vitest.config.ts eval/run.ts [--yes] [--careful] [--limit N] [--kind nonogram] [--cases path.jsonl]
//
// Cases (eval/data/cases.jsonl, one per line): { id, photo: a file path, expected: a sketch }.
// eval/pull.ts fills it from the live site's published reads; add your own drawings by hand.
// Results go to eval/data/runs/<time>.json; ANTHROPIC_API_KEY comes from .dev.vars.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { readSketch, type Attempt } from "~/lib/read-sketch.server";
import { diffSketches, type PuzzleDiff } from "~/games/diff";
import { looseSpec } from "~/games/sketch";
import { flag, readVars } from "./util";

interface Case { id: string; photo: string; expected: string; kind?: string }
interface Result { id: string; kind: string; ok: boolean; error?: string; diff?: PuzzleDiff | null; ms: number; inputTokens: number; outputTokens: number; models: string[]; sketch?: string }

const path = flag("--cases") ?? "eval/data/cases.jsonl";
let cases: Case[] = readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
cases = cases.map((c) => ({ ...c, kind: c.kind ?? looseSpec(c.expected)?.genre ?? "?" }));
const kind = flag("--kind"), limit = Number(flag("--limit") ?? Infinity), careful = flag("--careful") === "true";
if (kind) cases = cases.filter((c) => c.kind === kind);
cases = cases.slice(0, limit);

console.log(`${cases.length} case${cases.length === 1 ? "" : "s"} from ${path}${kind ? ` (${kind})` : ""}, ${careful ? "careful reader only" : "quick reader, careful when it has trouble (as the site does)"}.`);
if (flag("--yes") !== "true") {
  console.log("Each case is one or two calls to Claude. Add --yes to run them.");
  process.exit(0);
}
const env = { ANTHROPIC_API_KEY: readVars().ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY } as Env;
if (!env.ANTHROPIC_API_KEY) throw new Error("Put ANTHROPIC_API_KEY in .dev.vars.");

const TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
const results: Result[] = [];
for (const c of cases) {
  const log: Attempt[] = [];
  const image = { data: readFileSync(c.photo).toString("base64"), type: TYPES[extname(c.photo).toLowerCase()] ?? "image/jpeg" };
  const started = Date.now();
  let result: Result;
  try {
    const { sketch } = await readSketch(env, image, { careful, log });
    result = { id: c.id, kind: c.kind!, ok: true, sketch, diff: diffSketches(sketch, c.expected), ms: 0, inputTokens: 0, outputTokens: 0, models: [] };
  } catch (e) {
    result = { id: c.id, kind: c.kind!, ok: false, error: (e as Error).message, ms: 0, inputTokens: 0, outputTokens: 0, models: [] };
  }
  Object.assign(result, {
    ms: Date.now() - started, models: log.map((a) => a.model),
    inputTokens: log.reduce((n, a) => n + (a.inputTokens ?? 0), 0), outputTokens: log.reduce((n, a) => n + (a.outputTokens ?? 0), 0),
  });
  results.push(result);
  const d = result.diff;
  console.log(`  ${c.id} (${c.kind}): ${!result.ok ? `failed: ${result.error}` : !d ? "not a puzzle" : d.exact ? "exact" : `match ${d.score.toFixed(2)}${d.sameKind ? "" : ", wrong type"}${d.sameSize ? "" : ", wrong size"}`} [${(result.ms / 1000).toFixed(1)}s, ${result.models.join(" → ")}]`);
}

// the summary: the same measures the live site keeps (app/lib/reads.server.ts)
const scored = results.filter((r) => r.diff), share = (n: number) => (scored.length ? `${Math.round((n / scored.length) * 100)}%` : "–");
const byKind = new Map<string, Result[]>();
for (const r of scored) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
const summary = {
  cases: results.length, failed: results.filter((r) => !r.ok).length,
  exact: share(scored.filter((r) => r.diff!.exact).length),
  meanScore: scored.length ? +(scored.reduce((n, r) => n + r.diff!.score, 0) / scored.length).toFixed(3) : null,
  kindRight: share(scored.filter((r) => r.diff!.sameKind).length), sizeRight: share(scored.filter((r) => r.diff!.sameSize).length),
  escalated: results.filter((r) => r.models.length > 1).length,
  seconds: +(results.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(1),
  inputTokens: results.reduce((n, r) => n + r.inputTokens, 0), outputTokens: results.reduce((n, r) => n + r.outputTokens, 0),
  byKind: Object.fromEntries([...byKind].map(([k, rs]) => [k, { cases: rs.length, exact: rs.filter((r) => r.diff!.exact).length, meanScore: +(rs.reduce((n, r) => n + r.diff!.score, 0) / rs.length).toFixed(3) }])),
};
console.log("\n", summary);
mkdirSync("eval/data/runs", { recursive: true });
const out = `eval/data/runs/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ options: { careful, kind, limit, cases: path }, summary, results }, null, 1));
console.log(`Results: ${out}`);
