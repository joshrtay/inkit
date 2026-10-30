// The Opus designer (./designer.ts) by hand: n puzzles of one type and size, a line each to --out.
//
//   INKIT_ANTHROPIC_KEY=... node --no-warnings puzzles/ai/opus-design.ts --genre akari --size 7x7 --n 5 [--difficulty 0.5] [--out file.jsonl] [--cap 15]
//
// Cost: Opus 5.5 at high effort; stops before a puzzle once DESIGN_CAP (or --cap) dollars are
// spent in this run (spent so far is read back from --out's lines, so a rerun keeps counting).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { design, DESIGN_GENRES } from "./designer.ts";

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const genre = arg("genre", "akari")!, [rows, cols] = arg("size", "7x7")!.split("x").map(Number);
const n = Number(arg("n", "5")), out = arg("out", `references/ml/gen-baseline/opus-${genre}.jsonl`)!;
const difficulty = Number(arg("difficulty", "0.5"));
const CAP = Number(arg("cap", process.env.DESIGN_CAP ?? "15"));
if (!(DESIGN_GENRES as readonly string[]).includes(genre)) { console.error(`--genre is one of ${DESIGN_GENRES.join(", ")}`); process.exit(1); }
const key = process.env.INKIT_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("no INKIT_ANTHROPIC_KEY"); process.exit(1); }
const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 600_000 });

let spent = existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).reduce((s, l) => s + (JSON.parse(l).cost ?? 0), 0) : 0;
for (let k = 0; k < n; k++) {
  if (spent >= CAP) { console.log(`stopped: $${spent.toFixed(2)} of $${CAP} spent`); break; }
  const d = await design(client, { genre, rows, cols, difficulty, ask: `Set puzzle ${k + 1}. Make its idea different from an ordinary ${genre}: pick one interaction of the rules and build around it.` });
  spent += d.cost;
  const line = { genre, size: [rows, cols], ok: !!d.spec, spec: d.spec ?? undefined, idea: d.idea ?? undefined, checks: d.checks, cost: d.cost, s: Math.round(d.ms / 1000), grid: d.grid ?? undefined, lastCheck: d.lastCheck };
  appendFileSync(out, JSON.stringify(line) + "\n");
  console.log(`${genre} ${k + 1}: ${d.spec ? "submitted" : "gave up"} after ${d.checks} checks, $${d.cost.toFixed(2)}, ${line.s}s${d.spec ? `\n${d.grid}\n  idea: ${d.idea}` : ""}`);
}
console.log(`spent $${spent.toFixed(2)} in all`);
