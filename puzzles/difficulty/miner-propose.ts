// The technique-mining harness, phase B: Opus 5.5 (with thinking) proposes window families for the
// stuck cases phase A's systematic search couldn't fix. Each round shows it a few stuck moments
// (the puzzle, what the solver knew, the fact it had to search for, and phase A's best families);
// it answers with families in the proposal language, which the miner tests on the whole stuck set,
// and, separately, ideas the language can't yet say (saved for review). It stops at the budget.
//
//   node puzzles/difficulty/miner-propose.ts [budgetDollars=10] [rounds=40]
//   (ANTHROPIC_API_KEY from app/.dev.vars; results in references/ml/miner-proposals.json)
//
// MINER_SOURCE=janko:slitherlink,masyu,nurikabe takes the stuck moments from Janko's recorded
// solves instead (janko-stuck.ts → references/janko/stuck-<type>.json, local only), and shows the
// person's next moves from each, so the model sees what a person actually did there. Results then
// go to miner-proposals-janko.json.
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { FamilySpec } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { JANKO_DIR } from "./janko.ts";
import { measure, name, solve, stuckFile, type Stuck } from "./miner.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const budget = Number(process.argv[2]) || 10, rounds = Number(process.argv[3]) || 40;
const PRICE = { input: 4 / 1e6, output: 20 / 1e6 };   // Opus 5.5, dollars per token (October 2026)
const key = /^ANTHROPIC_API_KEY=(.*)$/m.exec(readFileSync(`${repo}app/.dev.vars`, "utf8"))?.[1]?.trim();
if (!key) throw new Error("no ANTHROPIC_API_KEY in app/.dev.vars");
const client = new Anthropic({ apiKey: key });
// the stuck set: the miner's own, or Janko's moments with the person's next moves
const source = process.env.MINER_SOURCE ?? "";
const human = new Map<string, { mark: string; value: boolean }[]>();
let set: Stuck[];
if (source.startsWith("janko:")) {
  set = [];
  for (const type of source.slice(6).split(",")) {
    const rows = JSON.parse(readFileSync(`${JANKO_DIR}stuck-${type}.json`, "utf8")) as { f: string; spec: Stuck["spec"]; humanNext: { mark: string; value: boolean }[] }[];
    const small = rows.filter((x) => x.spec.size[0] <= 10).slice(0, Number(process.env.MINER_LIMIT) || Infinity);
    // the baseline the miner compares against: today's solver on each
    const runs = await mapPool(small, (r) => solve(r.spec));
    small.forEach((r, i) => {
      const run = runs[i];
      if (!run || !run.solved || !run.search) return;
      set.push({ genre: r.spec.genre ?? type, name: r.f, spec: r.spec, ...run });
      human.set(r.f, r.humanNext);
    });
  }
  console.error(`${set.length} Janko stuck moments`);
} else set = JSON.parse(readFileSync(stuckFile, "utf8")) as Stuck[];
const outFile = `${repo}references/ml/miner-proposals${source.startsWith("janko:") ? "-janko" : ""}.json`;
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
  // a loop along grid lines or through cells: drawn, since a list of edge marks is unreadable
  const loopRows: string[] = [];
  if (g.kind === "square" && [...known.keys()].some((m) => /^(fence|line)\(/.test(m))) {
    const edge = (m: string) => (known.get(m) === true ? "on" : known.get(m) === false ? "off" : "open");
    const clueAt = (i: number) => {
      const q = (p.cellGivens.get(i) ?? [])[0] as { kind?: string; value?: unknown } | undefined;
      return !q ? " " : q.kind === "pearl" ? (q.value === "black" ? "B" : "W") : String(q.value ?? q.kind?.[0] ?? "?");
    };
    if ([...known.keys()].some((m) => m.startsWith("fence("))) {
      // corners +, an edge with a line -- or |, known empty x, open blank; clues in the cells
      const bid = new Map<string, number>();
      for (const b of g.borders) bid.set(b.corners.slice().sort((a, b2) => a - b2).join(","), b.id);
      const at = (r1: number, c1: number, r2: number, c2: number) => bid.get([r1 * (g.cols + 1) + c1, r2 * (g.cols + 1) + c2].sort((a, b2) => a - b2).join(","));
      const sym = (id: number | undefined, on: string) => { const e = id === undefined ? "open" : edge(`fence(${id})`); return e === "on" ? on : e === "off" ? "x" : " "; };
      for (let r = 0; r <= g.rows; r++) {
        loopRows.push([...Array(g.cols)].map((_, c) => `+${{ "--": "--", x: "x ", " ": "  " }[sym(at(r, c, r, c + 1), "--")]}`).join("") + "+");
        if (r < g.rows) loopRows.push([...Array(g.cols + 1)].map((_, c) => `${sym(at(r, c, r + 1, c), "|")}${c < g.cols ? ` ${clueAt(g.cell(r, c))}`.padEnd(2) : ""}`).join(""));
      }
    } else {
      // a loop through cells: each cell's clue (W/B pearl) or ., with links between cells: - or |
      // a line, x known empty, blank open
      const lid = new Map<string, number>();
      for (const l of g.links) lid.set(l.cells.slice().sort((a, b2) => a - b2).join(","), l.id);
      const sym = (a: number, b2: number, on: string) => { const id = lid.get([a, b2].sort((x, y) => x - y).join(",")); const e = id === undefined ? "open" : edge(`line(${id})`); return e === "on" ? on : e === "off" ? "x" : " "; };
      for (let r = 0; r < g.rows; r++) {
        loopRows.push([...Array(g.cols)].map((_, c) => { const i = g.cell(r, c), cl = clueAt(i); return (cl === " " ? "." : cl) + (c + 1 < g.cols ? sym(i, g.cell(r, c + 1), "-") : ""); }).join(""));
        if (r + 1 < g.rows) loopRows.push([...Array(g.cols)].map((_, c) => sym(g.cell(r, c), g.cell(r + 1, c), "|") + " ").join(""));
      }
    }
  }
  const other = loopRows.length ? [] : [...known].filter(([m]) => !/^(shaded|digit)\(/.test(m)).map(([m, v]) => `${m}=${v}`).slice(0, 80);
  const next = human.get(s.name);
  // a mark in words: rows and columns from 1, as the grid above
  const rc = (i: number) => { const [y, x] = [Math.floor(i / g.cols), i % g.cols]; return `r${y + 1}c${x + 1}`; };
  const say = (m: string, v: boolean) => {
    const q = /^(\w+)\((\d+)(?:,(\d+))?\)$/.exec(m);
    if (!q || g.kind !== "square") return `${m} = ${v}`;
    const id = +q[2];
    if (q[1] === "fence") { const cs = g.borders[id].cells; return `${v ? "a line" : "no line"} on the edge ${cs[0] < 0 ? `above/left of ${rc(cs[1])} (outside)` : cs[1] < 0 ? `below/right of ${rc(cs[0])} (outside)` : `between ${rc(cs[0])} and ${rc(cs[1])}`}`; }
    if (q[1] === "line") { const [a, b] = g.links[id].cells; return `${v ? "a line" : "no line"} between ${rc(a)} and ${rc(b)}`; }
    if (q[1] === "shaded") return `${rc(id)} ${v ? "shaded" : "unshaded"}`;
    if (q[1] === "digit") return `${rc(id)} ${v ? "is" : "isn't"} ${q[3]}`;
    return `${m} = ${v}`;
  };
  return [
    `Type: ${s.genre}. Rules: ${p.rules.map((x) => x.rule + (x.n !== undefined ? ` ${x.n}` : "")).join(", ")}. Grid ${g.kind === "square" ? `${g.rows} × ${g.cols}` : g.kind}.`,
    loopRows.length ? "" : `Grid now (a number is a clue, # blocked, * shaded/star, - known empty, a digit placed, a letter its area, . open):`,
    loopRows.length ? "" : rows.join("\n"),
    loopRows.length ? `The loop so far (${loopRows[0].startsWith("+") ? "corners +, a line -- or |, x known empty, blank open; clues in cells" : "cells with pearls W/B or ., a line - or |, x known empty, blank open"}):\n${loopRows.join("\n")}` : "",
    other.length ? `Other known marks (first 80): ${other.join(" ")}` : "",
    next?.length ? `A person solving this from here settled next: ${next.map((x) => say(x.mark, x.value)).join("; ")}.` : "",
    `The solver found no step in its windows and had to search for: ${steps[k].facts.map((f) => say(f.mark, f.value)).join("; ")} (its search looked at: ${steps[k].where}; ${steps[k].because?.clues.slice(0, 8).join("; ")}).`,
  ].filter(Boolean).join("\n");
}

const LANGUAGE = `Our solver finds steps by checking small "windows": a set of cells whose rules are considered together; any fact forced inside a window is a step. Windows come in families described by a small language:
{"units": [kinds...], "relation": "pivot" | "pairwise" | "touch", "maxCells": optional number}
- kinds: "line" (a row or column), "region" (an outlined area or box), "block" (a 2 × 2 square), "clue" (the cells one clue's rule covers), "reach" (the cells a size clue's region could still cover)
- "pivot": the last unit meets (shares a cell with) every other unit; "pairwise": every two units share a cell; "touch": each unit shares a cell or an edge with the next.
A window is the union of the units' cells. Example: {"units": ["region", "region", "line"], "relation": "pivot"} is "two areas and a row or column through both", which people use in Star Battle.
Families the solver already has: single units and neighbourhoods; pairs of overlapping windows; two neighbouring rows or columns; two regions with a line through both; three lines in a chain; three lines crossed by a fourth; counting (k units of one family whose remaining marks all fall in k units of another); loop parity (a closed loop crosses every straight cut an even number of times); a known group of connected cells and its ways out (it must leave through one of them)${accepted.length ? `; and, from a systematic search: ${accepted.map(name).join("; ")}` : ""}.`;

const ASK = `Here are moments where the solver had to search because no window family saw a step. Where a person's next moves from the same moment are given, start from them: what did they see? Think about how a skilled human would make progress at each: which cells and rules they would look at together. Then propose up to 3 new window families in the language that would capture such reasoning (general, not tied to one puzzle), and separately up to 2 ideas the language can't express (a new unit kind or relation), each in a sentence.
Reply with JSON only, at the end: {"families": [ {"units": [...], "relation": "...", "maxCells": n?, "why": "..."} ], "ideas": ["..."]}`;

// MINER_DRY=1: print the first moment as the model would see it, and stop (no API call)
if (process.env.MINER_DRY) { for (const x of set) { const m = await moment(x); if (m) { console.log(m); break; } } process.exit(0); }

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
  // the reply's answer: the last JSON object that parses and has "families" or "ideas" (a reply may
  // reason first, quote JSON in its reasoning, or add a line after)
  let parsed: { families?: (FamilySpec & { why?: string })[]; ideas?: string[] } = {};
  for (let end = text.lastIndexOf("}"); end >= 0 && !parsed.families && !parsed.ideas; end = text.lastIndexOf("}", end - 1)) {
    for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
      try { const j = JSON.parse(text.slice(start, end + 1)); if (j && (j.families || j.ideas)) { parsed = j; break; } } catch { /* not this span */ }
    }
  }
  const valid = (parsed.families ?? []).filter((f) => Array.isArray(f.units) && f.units.length >= 2 && f.units.length <= 4 && f.units.every((u) => ["line", "region", "block", "clue", "reach"].includes(u)) && ["pivot", "pairwise", "touch"].includes(f.relation));
  const tested = [];
  for (const f of valid) {
    const { all } = await measure(set, { units: f.units, relation: f.relation, ...(f.maxCells ? { maxCells: f.maxCells } : {}) });
    tested.push({ ...f, removed: all.before - all.after, helped: all.helped, time: +(all.ms1 / Math.max(1, all.ms0)).toFixed(2) });
    console.error(`  ${name(f)}: ${all.before - all.after} searches removed, ${all.helped} helped (${f.why ?? ""})`);
  }
  out.push({ round, proposals: tested, ideas: parsed.ideas ?? [], cost: +cost.toFixed(3) });
  writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.error(`round ${round}: ${valid.length} families tested, ${(parsed.ideas ?? []).length} ideas; $${cost.toFixed(2)} (total $${spent.toFixed(2)} of $${budget})`);
}
console.log(`spent $${spent.toFixed(2)} over ${out.length} rounds`);
