// The technique-mining harness, phase B: Opus 5.5 (with thinking) proposes window families for the
// stuck cases phase A's systematic search couldn't fix. Each round shows it a few stuck moments
// (the puzzle, what the solver knew, the fact it had to search for, and phase A's best families);
// it answers with families in the proposal language, which the miner tests on the whole stuck set,
// and, separately, ideas the language can't yet say (saved for review). It stops at the budget.
//
//   node puzzles/difficulty/miner-propose.ts [budgetDollars=10] [rounds=40]
//   (ANTHROPIC_API_KEY from app/.dev.vars; results in references/ml/miner-proposals.json)
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { FamilySpec } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { measure, name, stuckFile, type Stuck } from "./miner.ts";

const repo = new URL("../../", import.meta.url).pathname;
const budget = Number(process.argv[2]) || 10, rounds = Number(process.argv[3]) || 40;
const PRICE = { input: 4 / 1e6, output: 20 / 1e6 };   // Opus 5.5, dollars per token (October 2026)
const key = /^ANTHROPIC_API_KEY=(.*)$/m.exec(readFileSync(`${repo}app/.dev.vars`, "utf8"))?.[1]?.trim();
if (!key) throw new Error("no ANTHROPIC_API_KEY in app/.dev.vars");
const client = new Anthropic({ apiKey: key });
const set = JSON.parse(readFileSync(stuckFile, "utf8")) as Stuck[];
const phaseA = existsSync(`${repo}references/ml/miner-results.json`) ? JSON.parse(readFileSync(`${repo}references/ml/miner-results.json`, "utf8")) as { f: FamilySpec; removed: number; helped: number; time: number }[] : [];
const accepted = phaseA.filter((r) => r.removed > 0 && r.time < 2).slice(0, 3).map((r) => r.f);

/** A stuck moment as text: the rules, the grid with what's known, and the fact searched for. */
async function moment(s: Stuck): Promise<string | null> {
  const r = await deduceGuarded(s.spec, { budgetMs: 20000, families: accepted }, 90000).catch(() => null);
  if (!r) return null;
  const steps = r.path.filter((x) => !x.choice), k = steps.findIndex((x) => x.tier >= 2);
  if (k < 0) return null;
  const p = makePuzzle(s.spec), g = p.grid;
  const known = new Map<string, boolean>();
  for (const x of r.initial ?? []) { const [m, v] = x.split("="); known.set(m, v === "true"); }
  for (const st of steps.slice(0, k)) for (const f of st.facts) known.set(f.mark, f.value);
  const rows: string[] = [];
  if (g.kind === "square") for (let y = 0; y < g.rows; y++) {
    const cells: string[] = [];
    for (let x = 0; x < g.cols; x++) {
      const i = g.cell(y, x), givens = p.cellGivens.get(i) ?? [];
      const num = givens.find((q) => q.kind === "number") as { value?: number } | undefined;
      const sh = known.get(`shaded(${i})`), area = p.areas ? String.fromCharCode(97 + (p.areas.of[i] % 26)) : "";
      const digit = [...Array(9)].map((_, d) => d + 1).find((d) => known.get(`digit(${i},${d})`) === true);
      cells.push((p.blocked.has(i) || givens.some((q) => q.kind === "block") ? "#" : "") + (num?.value ?? "") + (digit ?? "") + (sh === true ? "*" : sh === false ? "-" : "") + area || ".");
    }
    rows.push(cells.map((c) => c.padEnd(4)).join(""));
  }
  const other = [...known].filter(([m]) => !/^(shaded|digit)\(/.test(m)).map(([m, v]) => `${m}=${v}`).slice(0, 80);
  return [
    `Type: ${s.genre}. Rules: ${p.rules.map((x) => x.rule + (x.n !== undefined ? ` ${x.n}` : "")).join(", ")}. Grid ${g.kind === "square" ? `${g.rows} × ${g.cols}` : g.kind}.`,
    `Grid now (a number is a clue, # blocked, * shaded/star, - known empty, a digit placed, a letter its area, . open):`,
    rows.join("\n"),
    other.length ? `Other known marks (first 80): ${other.join(" ")}` : "",
    `The solver found no step in its windows and had to search for: ${steps[k].facts.map((f) => `${f.mark} = ${f.value}`).join(", ")} (its search looked at: ${steps[k].where}; ${steps[k].because?.clues.slice(0, 8).join("; ")}).`,
  ].filter(Boolean).join("\n");
}

const LANGUAGE = `Our solver finds steps by checking small "windows": a set of cells whose rules are considered together; any fact forced inside a window is a step. Windows come in families described by a small language:
{"units": [kinds...], "relation": "pivot" | "pairwise" | "touch", "maxCells": optional number}
- kinds: "line" (a row or column), "region" (an outlined area or box), "block" (a 2 × 2 square), "clue" (the cells one clue's rule covers)
- "pivot": the last unit meets (shares a cell with) every other unit; "pairwise": every two units share a cell; "touch": each unit shares a cell or an edge with the next.
A window is the union of the units' cells. Example: {"units": ["region", "region", "line"], "relation": "pivot"} is "two areas and a row or column through both", which people use in Star Battle.
Families the solver already has: single units and neighbourhoods; pairs of overlapping windows; two neighbouring rows or columns; two regions with a line through both; counting (k units of one family whose remaining marks all fall in k units of another)${accepted.length ? `; and, from a systematic search: ${accepted.map(name).join("; ")}` : ""}.`;

const ASK = `Here are moments where the solver had to search because no window family saw a step. Think about how a skilled human would make progress at each: which cells and rules they would look at together. Then propose up to 3 new window families in the language that would capture such reasoning (general, not tied to one puzzle), and separately up to 2 ideas the language can't express (a new unit kind or relation), each in a sentence.
Reply with JSON only, at the end: {"families": [ {"units": [...], "relation": "...", "maxCells": n?, "why": "..."} ], "ideas": ["..."]}`;

const out: { round: number; proposals: unknown[]; ideas: string[]; cost: number }[] = [];
let spent = 0;
const order = [...set].sort(() => Math.random() - 0.5);
for (let round = 1; round <= rounds && spent < budget - 0.5; round++) {
  const cases: string[] = [];
  while (cases.length < 3 && order.length) { const s = order.pop()!; if (s.spec.size[0] > 10) continue; const m = await moment(s); if (m) cases.push(m); }
  if (!cases.length) break;
  const res = await client.messages.create({
    model: "claude-opus-5-5", max_tokens: 16000, thinking: { type: "adaptive" },
    messages: [{ role: "user", content: `${LANGUAGE}\n\n${ASK}\n\n${cases.map((c, i) => `Moment ${i + 1}:\n${c}`).join("\n\n")}` }],
  });
  const cost = res.usage.input_tokens * PRICE.input + res.usage.output_tokens * PRICE.output;
  spent += cost;
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  let parsed: { families?: (FamilySpec & { why?: string })[]; ideas?: string[] } = {};
  try { parsed = JSON.parse(/\{[\s\S]*\}\s*$/.exec(text.trim())?.[0] ?? "{}"); } catch { /* unparsed */ }
  const valid = (parsed.families ?? []).filter((f) => Array.isArray(f.units) && f.units.length >= 2 && f.units.length <= 4 && f.units.every((u) => ["line", "region", "block", "clue"].includes(u)) && ["pivot", "pairwise", "touch"].includes(f.relation));
  const tested = [];
  for (const f of valid) {
    const { all } = await measure(set, { units: f.units, relation: f.relation, ...(f.maxCells ? { maxCells: f.maxCells } : {}) });
    tested.push({ ...f, removed: all.before - all.after, helped: all.helped, time: +(all.ms1 / Math.max(1, all.ms0)).toFixed(2) });
    console.error(`  ${name(f)}: ${all.before - all.after} searches removed, ${all.helped} helped (${f.why ?? ""})`);
  }
  out.push({ round, proposals: tested, ideas: parsed.ideas ?? [], cost: +cost.toFixed(3) });
  writeFileSync(`${repo}references/ml/miner-proposals.json`, JSON.stringify(out, null, 1));
  console.error(`round ${round}: ${valid.length} families tested, ${(parsed.ideas ?? []).length} ideas; $${cost.toFixed(2)} (total $${spent.toFixed(2)} of $${budget})`);
}
console.log(`spent $${spent.toFixed(2)} over ${out.length} rounds`);
