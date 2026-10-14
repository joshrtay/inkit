// Can a language model label puzzles for our three products, given our solver's explanations in
// words rather than a raw grid to solve? Claude Opus 5.5 and Claude Fable 5.1 on four jobs, each
// scored against an answer key and set beside a baseline from our own solver:
//
//   sequences   Beast Academy's Puzzle Lab sets, shuffled: put them back in the teacher's order
//               (mean Spearman within sets; baseline: our estimate's order)
//   hints       positions from Janko's recorded solves: pick the step a person makes next from
//               the steps our solver could take, and write a three-level hint (the pick among the
//               person's next 3 moves; baseline: the cheapest step). At stuck moments, where our
//               solver had only a case split, the model names its own move instead
//   difficulty  Puzzle Square JP, batches of 10 of one type: rank easiest to hardest (Spearman
//               with the site's rating; baseline: our estimate)
//   interest    Puzzle Square JP likes, batches of 10: rank by how much solvers enjoy them
//               (Spearman with likes per solver, and with the site's difficulty held fixed;
//               baseline: our estimate and our interest measures)
//   judge       each model judges a sample of the other's hints against the solution
//   report      the tables, from what's saved
//
// Each puzzle is shown as a text grid plus a summary of our solver's path (deduce.ts): counts of
// steps by kind, the kind needed round by round, and the ten hardest steps in full (where it
// looked, what it found, which rules and clues forced it). Step costs and our estimate are never
// shown, so a model can't copy them.
//
//   node puzzles/difficulty/llm-label.ts <job> [--models opus,fable] [--dry]
//
// Local only: the key from app/.dev.vars (the main checkout's, from a worktree), never printed;
// every request, reply, parsed answer and its cost in references/ml/llm-label/ (puzzles from
// others' sites, so never committed). A running tally of dollars, from each reply's usage, stops
// every call that could take the total past LLM_CAP (default $15); each job × model has an equal
// share of it (LLM_CELL_CAP). A saved reply is reused, so a rerun costs nothing. Solver runs are
// cached in the same folder, DEDUCE_JOBS at a time (default 3 here).
//
// Other switches: LLM_PER_TYPE (puzzles per type, 20), LLM_ORDINARY and LLM_STUCK (hint positions
// per type, 3 and 2; kept in positions.json once chosen), LLM_JUDGE (hints judged per model, 8),
// LLM_MAX_TOKENS (16000), LLM_ONLY (a pattern: new requests only for items it matches; saved
// replies are always read). Results: docs/research-llm-labels.md.
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { convert, GENRE, loadSets, ORDER } from "./ba-convert.ts";
import { spearman } from "./calibrate.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import type { Profile, Step } from "./deduce.ts";
import { JANKO_DIR } from "./janko.ts";
import { deduceCached, studied } from "./janko-order.ts";
import { looksOf } from "./looks.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const main = repo.replace(/\.claude\/worktrees\/[^/]+\/$/, "");
const OUT = `${main}references/ml/llm-label/`;
const PSJP = `${main}references/psjp/`;
const args = process.argv.slice(2);
const job = args[0] ?? "report";
const dry = args.includes("--dry");
const wanted = (args.includes("--models") ? args[args.indexOf("--models") + 1] : "opus,fable").split(",");
const SOLVE_JOBS = Math.min(3, Number(process.env.DEDUCE_JOBS) || 3);

// ---- models, prices and the tally ----
export interface Model { key: string; label: string; id: string; price: { input: number; output: number } }
// dollars per token (October 2026: Opus 5.5 $4 / $20 per million, Fable 5.1 $10 / $50)
export const MODELS: Model[] = [
  { key: "opus", label: "Opus 5.5", id: "claude-opus-5-5", price: { input: 4 / 1e6, output: 20 / 1e6 } },
  { key: "fable", label: "Fable 5.1", id: "claude-fable-5-1", price: { input: 10 / 1e6, output: 50 / 1e6 } },
];
const models = MODELS.filter((m) => wanted.includes(m.key));
const CAP = Number(process.env.LLM_CAP) || 15;
const JOBS4 = ["sequences", "hints", "difficulty", "interest"];
const CELL_CAP = Number(process.env.LLM_CELL_CAP) || CAP / (JOBS4.length * MODELS.length);
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS) || 16000;

interface Ledger { spent: number; cells: Record<string, number>; calls: { job: string; model: string; item: string; input: number; output: number; dollars: number; ms: number; at: string }[] }
const ledgerFile = `${OUT}ledger.json`;
mkdirSync(OUT, { recursive: true });
const ledger: Ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, "utf8")) : { spent: 0, cells: {}, calls: [] };
let reserved = 0;
const saveLedger = () => writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));

let client: Anthropic | null = null;
export function api(): Anthropic {
  if (client) return client;
  const key = /^ANTHROPIC_API_KEY=(.*)$/m.exec(readFileSync(`${main}app/.dev.vars`, "utf8"))?.[1]?.trim();
  if (!key) throw new Error("no ANTHROPIC_API_KEY in app/.dev.vars");
  client = new Anthropic({ apiKey: key, timeout: 10 * 60 * 1000, maxRetries: 4 });
  return client;
}

interface Saved<T> { job: string; model: string; item: string; prompt: string; text: string; parsed: T | null; usage: { input: number; output: number }; dollars: number; stop: string }
/** The last JSON object in a reply that `ok` accepts (a reply may reason first, or quote JSON). */
export function lastJson<T>(text: string, ok: (j: any) => boolean): T | null {
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1))
    for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
      try { const j = JSON.parse(text.slice(start, end + 1)); if (j && ok(j)) return j as T; } catch { /* not this span */ }
    }
  return null;
}

/** One request, or its saved reply. Skipped (null) when it could take the job's share or the
 *  total past their caps, on a refusal, or when it fails after retries. */
async function ask<T>(jobName: string, m: Model, item: string, prompt: string, ok: (j: any) => boolean): Promise<Saved<T> | null> {
  const file = `${OUT}calls/${jobName}/${m.key}/${item.replace(/[^\w.-]+/g, "_")}.json`;
  if (existsSync(file)) {
    const s = JSON.parse(readFileSync(file, "utf8")) as Saved<T>;
    if (s.prompt === prompt) return s;
  }
  if (process.env.LLM_ONLY && !new RegExp(process.env.LLM_ONLY).test(item)) return null;
  if (dry) { console.log(`--- ${jobName} ${m.label} ${item} (${prompt.length} chars, about ${Math.round(prompt.length / 3.5)} tokens)\n${prompt}\n`); return null; }
  const cell = `${jobName}|${m.key}`;
  const inCost = (prompt.length / 3) * m.price.input, worst = inCost + MAX_TOKENS * m.price.output;
  if (ledger.spent + reserved + worst > CAP) { console.error(`${jobName} ${m.label} ${item}: skipped, the total would pass $${CAP}`); return null; }
  if ((ledger.cells[cell] ?? 0) + inCost + 4000 * m.price.output > CELL_CAP) { console.error(`${jobName} ${m.label} ${item}: skipped, this job's share ($${CELL_CAP.toFixed(2)}) is spent`); return null; }
  reserved += worst;
  const t0 = Date.now();
  try {
    const res = await api().messages.create({
      model: m.id, max_tokens: MAX_TOKENS, thinking: { type: "adaptive" }, output_config: { effort: "medium" },
      messages: [{ role: "user", content: prompt }],
    });
    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
    const dollars = usage.input * m.price.input + usage.output * m.price.output;
    ledger.spent += dollars; ledger.cells[cell] = (ledger.cells[cell] ?? 0) + dollars;
    ledger.calls.push({ job: jobName, model: m.key, item, ...usage, dollars: +dollars.toFixed(4), ms: Date.now() - t0, at: new Date().toISOString() });
    saveLedger();
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const parsed = res.stop_reason === "refusal" ? null : lastJson<T>(text, ok);
    const saved: Saved<T> = { job: jobName, model: m.key, item, prompt, text, parsed, usage, dollars, stop: res.stop_reason ?? "" };
    mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    writeFileSync(file, JSON.stringify(saved, null, 1));
    console.error(`${jobName} ${m.label} ${item}: ${parsed ? "parsed" : `unparsed (${res.stop_reason})`}, ${usage.input} in, ${usage.output} out, $${dollars.toFixed(3)} (total $${ledger.spent.toFixed(2)}), ${Math.round((Date.now() - t0) / 1000)} s`);
    return saved;
  } catch (e) {
    console.error(`${jobName} ${m.label} ${item}: failed (${(e as Error).message.slice(0, 120)})`);
    return null;
  } finally { reserved -= worst; }
}

// ---- our solver, cached ----
export type Solve = { path: Step[]; profile: Profile; answer?: string[]; initial?: string[] } | null;
export async function solveCached(spec: GridSpec): Promise<Solve> {
  const key = createHash("sha256").update(JSON.stringify([spec, 15000])).digest("hex").slice(0, 24);
  const dir = `${OUT}deduce/`, file = `${dir}${key}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  // the scoreboard's budget and cap, so our estimate here is the board's
  const r = await deduceGuarded(spec, { budgetMs: 15000 }, 120000).catch(() => null);
  const slim = r ? { profile: r.profile, answer: r.answer, initial: r.initial, path: r.path.map((s) => ({ ...s, cells: [], feat: undefined, shape: undefined, shapeText: undefined })) } : null;
  mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(slim));
  return slim as Solve;
}
const estimateOf = (r: Solve) => (r ? r.profile.estimate : 0.9);

// ---- seeded shuffles ----
export function rng(seed: string) {
  let h = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => { h |= 0; h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffled<T>(xs: T[], seed: string): T[] {
  const r = rng(seed), a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- the rules in words ----
export function rulesOf(spec: GridSpec): string {
  const p = makePuzzle(spec), n = (rule: string) => Number(p.rules.find((x) => x.rule === rule)?.n ?? 1);
  const genre = spec.genre;
  switch (genre) {
    case "sudoku": return `Sudoku: fill the grid with digits 1–${p.digits} so every row, column and 3×3 box has each digit once.`;
    case "akari": return "Akari (Light Up): place bulbs in white cells. A bulb lights its row and column until a black cell. Every white cell must be lit, no bulb may light another, and a number on a black cell is how many bulbs touch it on its four sides.";
    case "star-battle": return `Star Battle: place ${n("shaded-per-line")} star(s) in every row and column and ${n("shaded-per-area")} in every outlined area; stars never touch, not even diagonally.`;
    case "slitherlink": return "Slitherlink: draw one closed loop along the grid lines, never crossing or branching. A number in a cell is how many of its four sides the loop uses.";
    case "masyu": return "Masyu: draw one closed loop through cell centres, horizontally and vertically, never crossing or branching. It passes through every pearl. At a white pearl it goes straight, and turns in the cell before or after (or both). At a black pearl it turns, and goes straight through the next cell on both sides.";
    case "hitori": return "Hitori: shade some cells so no number appears twice unshaded in a row or column. Shaded cells never touch side by side, and all unshaded cells stay connected.";
    case "nurikabe": return "Nurikabe: shade cells to make one connected wall. Each number is in an island of unshaded cells of that size, with exactly one number per island. No 2×2 block is all wall.";
    case "fillomino": return "Fillomino: divide the white cells into regions, each holding a number equal to its size; regions of the same size never touch side by side. A given number belongs to a region of that size. Each puzzle lists the sizes its regions have: exactly one region of each.";
    case "spiral-galaxies": return "Spiral Galaxies: divide the grid along its lines into regions, each with exactly one dot at its centre and the same after a half turn about that dot.";
    case "cave": return "Cave: shade some cells so the unshaded cells form one connected cave and every group of shaded cells touches the edge of the grid. A number is in the cave and counts the cave cells it sees along its row and column, itself included, up to a shaded cell or the edge.";
    case "shikaku": return "Shikaku: divide the grid into rectangles, each holding exactly one number, which is its area in cells.";
    case "simple-loop": return "Simple Loop: draw one closed loop through the centres of every cell that isn't a rock (#), moving horizontally and vertically and visiting each cell once. The loop never crosses a wall between two cells.";
    case "skyscrapers": return `Skyscrapers: fill the grid with heights 1–${spec.size[0]} so each row and column has each height once. A number outside the grid is how many buildings are seen from that side, taller ones hiding shorter ones behind them.`;
    default: return `${genre}: rules ${p.rules.map((x) => x.rule).join(", ")}.`;
  }
}

/** The puzzle as text, with what's known drawn in (mark → value). */
export function drawGrid(spec: GridSpec, known: Map<string, boolean> = new Map()): string {
  const p = makePuzzle(spec), g = p.grid, R = g.rows, C = g.cols, genre = spec.genre ?? "";
  const num = (i: number) => (p.cellGivens.get(i) ?? []).find((x) => x.kind === "number") as { value?: number } | undefined;
  const block = (i: number) => p.blocked.has(i) || (p.cellGivens.get(i) ?? []).some((x) => x.kind === "block");
  const table = (cell: (i: number) => string, legend: string) => {
    const cells = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => cell(g.cell(r, c))));
    const w = Math.max(3, ...cells.flat().map((x) => x.length + 1));
    return [legend, "     " + Array.from({ length: C }, (_, c) => `c${c + 1}`.padEnd(w)).join(""), ...cells.map((row, r) => `r${String(r + 1).padEnd(4)}${row.map((x) => x.padEnd(w)).join("")}`)].join("\n");
  };
  const sh = (i: number) => known.get(`shaded(${i})`);
  if (genre === "sudoku") return table((i) => { const d = [...Array(p.digits)].map((_, k) => k + 1).find((k) => known.get(`digit(${i},${k})`)); return String(num(i)?.value ?? d ?? "."); }, "(a digit is given or placed; . is empty)");
  if (genre === "akari") return table((i) => (block(i) ? String(num(i)?.value ?? "#") : sh(i) === true ? "B" : sh(i) === false ? "-" : "."), "(# a black cell, a digit a numbered black cell, B a bulb, - a white cell known to have no bulb, . undecided)");
  if (genre === "star-battle") {
    const letter = (i: number) => String.fromCharCode(97 + (p.areas!.of[i] % 26));
    return table((i) => letter(i) + (sh(i) === true ? "*" : sh(i) === false ? "x" : ""), "(each cell shows its area's letter; * after it a star, x a cell known to have no star)");
  }
  if (genre === "hitori" || genre === "nurikabe") return table((i) => `${num(i)?.value ?? "."}${sh(i) === true ? "#" : sh(i) === false ? "o" : ""}`, genre === "hitori" ? "(each cell's number; # after it shaded, o known unshaded)" : "(a number is an island's clue, . an empty cell; # after it wall (shaded), o known island (unshaded))");
  if (genre === "fillomino") {
    const sizes = (p.rules.find((x) => x.rule === "allowed-sizes") as { sizes?: number[] } | undefined)?.sizes;
    return table((i) => (block(i) ? "#" : String(num(i)?.value ?? ".")), `${sizes ? `Region sizes: ${sizes.join(", ")}, one region of each. ` : ""}(a number is given, # a hole outside the puzzle, . empty)`);
  }
  if (genre === "spiral-galaxies") {
    const dots = new Set(p.galaxies.map(([y, x]) => `${y},${x}`));
    const rows: string[] = [];
    for (let y = 0; y <= 2 * R; y++) {
      let line = "";
      for (let x = 0; x <= 2 * C; x++) {
        const dot = dots.has(`${y},${x}`), edge = y === 0 || y === 2 * R || x === 0 || x === 2 * C;
        line += dot ? "o" : y % 2 === 0 && x % 2 === 0 ? "+" : y % 2 === 0 ? (edge ? "-" : " ") : x % 2 === 0 ? (edge ? "|" : " ") : ".";
      }
      rows.push(line);
    }
    return `(${R} rows × ${C} columns; + a grid corner, . a cell centre, o a dot: on a cell centre, a cell edge or a corner)\n${rows.join("\n")}`;
  }
  if (genre === "cave" || genre === "shikaku") return table((i) => `${num(i)?.value ?? "."}${sh(i) === true ? "#" : sh(i) === false ? "o" : ""}`, genre === "cave" ? "(a number is a clue in the cave, . an empty cell; # after it shaded, o known cave)" : "(a number is a rectangle's area, . an empty cell)");
  if (genre === "skyscrapers") {
    // the outside clues in a frame around the grid
    const outside = new Map<string, number>(), given = new Map<string, number>();
    for (const x of (spec.givens ?? []) as unknown as { at: string; side?: string; cell?: [number, number]; kind: string; value?: number }[]) {
      if (x.at === "edge" && x.cell) outside.set(`${x.side}${x.side === "top" || x.side === "bottom" ? x.cell[1] : x.cell[0]}`, x.value!);
      else if (x.at === "cell" && x.cell && x.kind === "number") given.set(`${x.cell[0]},${x.cell[1]}`, x.value!);
    }
    const o = (k: string) => String(outside.get(k) ?? " ");
    const placed = (r: number, c: number) => { const i = g.cell(r, c), d = [...Array(R)].map((_, k) => k + 1).find((k) => known.get(`digit(${i},${k})`)); return String(given.get(`${r},${c}`) ?? d ?? "."); };
    const rows = ["  " + [...Array(C)].map((_, c) => o(`top${c}`)).join(" "), "  " + "-".repeat(2 * C - 1)];
    for (let r = 0; r < R; r++) rows.push(`${o(`left${r}`)}|${[...Array(C)].map((_, c) => placed(r, c)).join(" ")}|${o(`right${r}`)}`);
    rows.push("  " + "-".repeat(2 * C - 1), "  " + [...Array(C)].map((_, c) => o(`bottom${c}`)).join(" "));
    return `(numbers outside the frame are the clues seen from that side, blank no clue; inside, a digit is given, . empty)\n${rows.join("\n")}`;
  }
  if (genre === "simple-loop") {
    // rocks, and the walls between cells
    const walls = new Set<string>();
    for (const x of (spec.givens ?? []) as unknown as { at: string; cells?: [number, number][]; kind: string }[])
      if (x.at === "border" && x.cells) walls.add(x.cells.map((c) => c.join(",")).sort().join("|"));
    const wall = (a: number[], b2: number[]) => walls.has([a.join(","), b2.join(",")].sort().join("|"));
    const rows: string[] = [];
    for (let r = 0; r < R; r++) {
      rows.push([...Array(C)].map((_, c) => (block(g.cell(r, c)) ? "#" : ".") + (c + 1 < C ? (wall([r, c], [r, c + 1]) ? "|" : " ") : "")).join(""));
      if (r + 1 < R && [...Array(C)].some((_, c) => wall([r, c], [r + 1, c]))) rows.push([...Array(C)].map((_, c) => (wall([r, c], [r + 1, c]) ? "-" : " ") + " ").join(""));
    }
    return `(# a rock, . a cell the loop visits; | a wall between two cells side by side, - a wall below the cell above it)\n${rows.join("\n")}`;
  }
  // loops: drawn, since a list of edge marks is unreadable
  const edge = (m: string) => (known.get(m) === true ? "on" : known.get(m) === false ? "off" : "open");
  if (genre === "slitherlink") {
    const bid = new Map<string, number>();
    for (const b of g.borders) bid.set(b.corners.slice().sort((a, b2) => a - b2).join(","), b.id);
    const at = (r1: number, c1: number, r2: number, c2: number) => bid.get([r1 * (C + 1) + c1, r2 * (C + 1) + c2].sort((a, b2) => a - b2).join(","));
    const sym = (id: number | undefined, on: string, off: string) => { const e = id === undefined ? "open" : edge(`fence(${id})`); return e === "on" ? on : e === "off" ? off : " ".repeat(on.length); };
    const rows: string[] = ["      " + [...Array(C)].map((_, c) => String((c + 1) % 10).padEnd(3)).join("")];
    for (let r = 0; r <= R; r++) {
      rows.push("    " + [...Array(C)].map((_, c) => `+${sym(at(r, c, r, c + 1), "--", "x ")}`).join("") + "+");
      if (r < R) rows.push(`r${r + 1}`.padEnd(4) + [...Array(C + 1)].map((_, c) => `${sym(at(r, c, r + 1, c), "|", "x")}${c < C ? ` ${num(g.cell(r, c))?.value ?? " "}` : ""}`).join(""));
    }
    return `(${R} rows × ${C} columns; rows labelled r1… down the left, columns numbered along the top (the last digit of the column number); + a corner, -- or | the loop, x an edge known to have no loop, blank undecided; numbers in cells)\n${rows.join("\n")}`;
  }
  if (genre === "masyu") {
    const lid = new Map<string, number>();
    for (const l of g.links) lid.set(l.cells.slice().sort((a, b2) => a - b2).join(","), l.id);
    const sym = (a: number, b2: number, on: string) => { const id = lid.get([a, b2].sort((x, y) => x - y).join(",")); const e = id === undefined ? "open" : edge(`line(${id})`); return e === "on" ? on : e === "off" ? "x" : " "; };
    const pearl = (i: number) => { const q = (p.cellGivens.get(i) ?? []).find((x) => x.kind === "pearl") as { value?: string } | undefined; return q ? (q.value === "black" ? "B" : "W") : "."; };
    const rows: string[] = ["    " + [...Array(C)].map((_, c) => String((c + 1) % 10)).join(" ")];
    for (let r = 0; r < R; r++) {
      rows.push(`r${r + 1}`.padEnd(4) + [...Array(C)].map((_, c) => pearl(g.cell(r, c)) + (c + 1 < C ? sym(g.cell(r, c), g.cell(r, c + 1), "-") : "")).join(""));
      if (r + 1 < R) rows.push("    " + [...Array(C)].map((_, c) => sym(g.cell(r, c), g.cell(r + 1, c), "|") + " ").join(""));
    }
    return `(${R} rows × ${C} columns; rows labelled r1… down the left, columns numbered along the top (the last digit of the column number); each cell W a white pearl, B a black pearl, . empty; between cells - or | the loop, x known to have no loop, blank undecided)\n${rows.join("\n")}`;
  }
  return JSON.stringify(spec);
}

// ---- the solver's path in words ----
const KIND = ["one row, column, area or clue", "two overlapping units together", "a case split (assume the opposite, reach a contradiction)", "a search (trial and error)"];
function stepLine(s: Step, k?: number): string {
  const facts = s.facts.map((f) => f.text), shown = facts.slice(0, 4).join(", ") + (facts.length > 4 ? ` and ${facts.length - 4} more` : "");
  const clues = s.because?.clues ?? [], why = clues.slice(0, 6).join("; ") + (clues.length > 6 ? `; and ${clues.length - 6} more` : "");
  return `${k !== undefined ? `step ${k + 1}, ` : ""}${KIND[s.tier]}: ${shown}. Looked at ${s.where}${why ? `; forced by ${why}` : ""}${s.because?.facts ? `, with ${s.because.facts} earlier facts` : ""}.`;
}
export function summary(r: Solve): string {
  if (!r) return "Our solver ran out of time on this one (a sign of a hard puzzle, or a large one).";
  const path = r.path.filter((s) => !s.choice), pr = r.profile;
  const perTier = [0, 0, 0, 0]; for (const s of path) perTier[s.tier]++;
  const rounds = new Map<number, number>(); for (const s of path) rounds.set(s.round ?? 0, Math.max(rounds.get(s.round ?? 0) ?? 0, s.tier));
  const stuck = [...new Set(path.filter((s) => s.open === 0).map((s) => s.round))].length;
  const hard = path.map((s, k) => [s, k] as const).sort((a, b) => b[0].cost - a[0].cost).slice(0, 10).sort((a, b) => a[1] - b[1]);
  return [
    `${pr.solved ? "Solved" : "Not finished within the time allowed"} in ${path.length} steps over ${rounds.size} rounds (a round: everything the solver could see at once). Steps by kind: ${perTier.map((n, t) => `${n} ${["single-unit", "two-unit", "case split", "search"][t]}`).join(", ")}. Rounds in which no single-unit step was available: ${stuck}. Rules held in mind: ${pr.ruleItems.join(", ")}.`,
    `The hardest kind of step each round needed, in order (0 single unit, 1 two units, 2 case split, 3 search): ${[...rounds.keys()].sort((a, b) => a - b).map((k) => rounds.get(k)).join("")}`,
    `Its ${hard.length} hardest steps, in solving order:`,
    ...hard.map(([s, k]) => `- ${stepLine(s, k)}`),
  ].join("\n");
}

// ---- ranking jobs: a batch of items, put in order ----
interface Rank { order: string[] }
const isRank = (ids: string[]) => (j: any) => Array.isArray(j.order) && j.order.length >= ids.length - 1 && j.order.every((x: unknown) => ids.includes(String(x)));
/** each id's place in the reply, 0 first to 1 last (missing ids in the middle) */
function places(ids: string[], order: string[]): Map<string, number> {
  const seen = [...new Set(order.map(String))].filter((x) => ids.includes(x));
  const out = new Map<string, number>(); seen.forEach((x, k) => out.set(x, k / Math.max(1, ids.length - 1)));
  for (const x of ids) if (!out.has(x)) out.set(x, 0.5);
  return out;
}
export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const rankOf = (v: number[]) => { const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(v.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : 0; };
const residual = (y: number[], x: number[]) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } const b = sxx ? sxy / sxx : 0; return y.map((v, i) => v - my - b * (x[i] - mx)); };
/** Spearman of a and b with c held fixed (as interest-analyze.ts) */
const partial = (a: number[], b: number[], c: number[]) => { const rc = rankOf(c); return pearson(residual(rankOf(a), rc), residual(rankOf(b), rc)); };
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const fmt$ = (x: number) => `$${x.toFixed(2)}`;
const dollarsOf = (jobName: string, m: string) => ledger.cells[`${jobName}|${m}`] ?? 0;
function writeResult(name: string, data: unknown) { writeFileSync(`${OUT}result-${name}.json`, JSON.stringify(data, null, 1)); }

// ==== sequences: Beast Academy's sets ====
async function sequences() {
  const sets = loadSets();
  const items: { set: string; type: string; specs: GridSpec[] }[] = [];
  for (const [t, order] of Object.entries(ORDER)) for (const [name] of order) {
    const s = sets.find((x) => x.t === +t && x.s === name);
    if (s && s.p.length >= 3) items.push({ set: name, type: GENRE[+t], specs: s.p.map((c) => convert(+t, c) as GridSpec) });
  }
  const solves = new Map<string, Solve[]>();
  for (const it of items) solves.set(it.set, await mapPool(it.specs, (s) => solveCached(s), SOLVE_JOBS));
  const rows: Record<string, unknown>[] = [];
  for (const m of models) await mapPool(items, async (it) => {
    const rs = solves.get(it.set)!;
    const ids = it.specs.map((_, k) => `P${k + 1}`);
    const shown = shuffled(it.specs.map((_, k) => k), `seq ${it.set}`);   // shown[j]: the set's puzzle shown as P(j+1)
    const blocks = shown.map((k, j) => `### P${j + 1}\n${drawGrid(it.specs[k])}\n\nHow our step-by-step solver solved it:\n${summary(rs[k])}`);
    const prompt = `These ${ids.length} ${it.type.replace("-", " ")} puzzles make up one lesson set in a puzzle curriculum for strong students aged 8 to 13. They have been shuffled.

Rules: ${rulesOf(it.specs[0])}

For each puzzle you get its grid and a summary of how a step-by-step logical solver solved it: what kinds of steps it needed and its hardest steps (where it looked, what it found, which rules and clues forced it). The solver's choices are not a human's, but they show what each puzzle demands.

Order the puzzles as an expert teacher would sequence them within the set, first to last, so that each builds on the ones before.

${blocks.join("\n\n")}

Think it through, then end your reply with JSON on its own line: {"order": ["P…", …]}, every id exactly once, first puzzle first.`;
    const r = await ask<Rank>("sequences", m, it.set, prompt, isRank(ids));
    if (!r?.parsed) return;
    const pl = places(ids, r.parsed.order);
    const truth = shown, modelPlace = shown.map((_, j) => pl.get(`P${j + 1}`)!);
    const est = shown.map((k) => estimateOf(rs[k]));
    const solvedIdx = shown.map((k, j) => [k, j] as const).filter(([k]) => rs[k]?.profile.solved);
    // a naive baseline: bigger grids later
    const cells = shown.map((k) => it.specs[k].size[0] * it.specs[k].size[1]);
    rows.push({ model: m.key, set: it.set, type: it.type, n: ids.length, rho: spearman(modelPlace, truth), ours: spearman(est, truth), size: spearman(cells, truth),
      solvedN: solvedIdx.length, rhoSolved: spearman(solvedIdx.map(([, j]) => modelPlace[j]), solvedIdx.map(([k]) => k)), oursSolved: spearman(solvedIdx.map(([, j]) => est[j]), solvedIdx.map(([k]) => k)) });
  }, 4);
  writeResult("sequences", rows);
  report();
}

// ==== difficulty and interest: Puzzle Square JP in batches of 10 ====
const psjpData = () => JSON.parse(readFileSync(`${PSJP}data.json`, "utf8")) as Record<string, { difficulty: number; favorite_n: number; answered_n: number; user: number }>;
interface Pz { type: string; id: string; spec: GridSpec; rated: number; likes: number; solvers: number }
function loadPz(type: string, f: string): Pz | null {
  const d = JSON.parse(readFileSync(`${PSJP}${type}/${f}`, "utf8")), meta = psjpData()[d.source?.psjp];
  if (!meta?.difficulty) return null;
  return { type, id: String(d.source.psjp), spec: { ...d.grid, genre: d.grid.genre ?? type }, rated: meta.difficulty, likes: meta.favorite_n, solvers: meta.answered_n };
}
async function rankBatches(jobName: "difficulty" | "interest", pz: Pz[], ask1: (type: string, n: number) => string) {
  const solves = await mapPool(pz, (x) => solveCached(x.spec), SOLVE_JOBS);
  const sol = new Map(pz.map((x, i) => [x.id, solves[i]]));
  const batches: { type: string; item: string; pz: Pz[] }[] = [];
  for (const type of [...new Set(pz.map((x) => x.type))]) {
    const mine = shuffled(pz.filter((x) => x.type === type), `${jobName} ${type}`);
    for (let k = 0; k * 10 < mine.length; k++) batches.push({ type, item: `${type}-${k + 1}`, pz: mine.slice(k * 10, k * 10 + 10) });
  }
  const out: { model: string; type: string; batch: string; id: string; place: number }[] = [];
  for (const m of models) await mapPool(batches, async (b) => {
    const ids = b.pz.map((_, j) => `P${j + 1}`);
    const blocks = b.pz.map((x, j) => `### P${j + 1}\n${drawGrid(x.spec)}\n\nHow our step-by-step solver solved it:\n${summary(sol.get(x.id)!)}`);
    const prompt = `${ask1(b.type, ids.length)}

Rules: ${rulesOf(b.pz[0].spec)}

For each puzzle you get its grid and a summary of how a step-by-step logical solver solved it: what kinds of steps it needed, round by round, and its hardest steps (where it looked, what it found, which rules and clues forced it). The solver's choices are not a human's, but they show what each puzzle demands.

${blocks.join("\n\n")}

Think it through, then end your reply with JSON on its own line: {"order": ["P…", …]}, every id exactly once, as asked above.`;
    const r = await ask<Rank>(jobName, m, b.item, prompt, isRank(ids));
    if (!r?.parsed) return;
    const pl = places(ids, r.parsed.order);
    b.pz.forEach((x, j) => out.push({ model: m.key, type: b.type, batch: b.item, id: x.id, place: pl.get(`P${j + 1}`)! }));
  }, 4);
  return { out, sol, batches };
}

async function difficulty() {
  const types = ["sudoku", "akari", "star-battle", "slitherlink", "masyu"], per = Number(process.env.LLM_PER_TYPE) || 20;
  const pz: Pz[] = [];
  for (const type of types) {
    // the scoreboard's spread sample: every k-th file
    const files = readdirSync(`${PSJP}${type}`).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    const step = Math.max(1, Math.floor(files.length / 20));
    for (const f of files.filter((_, i) => i % step === 0).slice(0, per)) { const x = loadPz(type, f); if (x) pz.push(x); }
  }
  const { out, sol, batches } = await rankBatches("difficulty", pz, (type, n) => `Here are ${n} ${type.replace("-", " ")} puzzles from a Japanese puzzle site, where solvers rate each puzzle's difficulty. Rank them from easiest to hardest for the site's solvers.`);
  writeResult("difficulty", { places: out, puzzles: pz.map((x) => ({ id: x.id, type: x.type, rated: x.rated, estimate: estimateOf(sol.get(x.id)!), cells: x.spec.size[0] * x.spec.size[1] })), batches: batches.map((b) => ({ item: b.item, ids: b.pz.map((x) => x.id) })) });
  report();
}

async function interest() {
  const per = Number(process.env.LLM_PER_TYPE) || 20;
  const pz: Pz[] = [];
  for (const type of ["sudoku", "akari", "masyu", "slitherlink"]) {
    // puzzles our interest run solved, with enough solvers for likes per solver to mean something,
    // spread over the site's difficulty
    const [head, ...lines] = readFileSync(`${PSJP}interest-${type}.csv`, "utf8").trim().split("\n");
    const cols = head.split(","), rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
    const ok = rows.filter((r) => r.solved === "true" && Number(r.solvers) >= 100).sort((a, b) => Number(a.siteDifficulty) - Number(b.siteDifficulty) || Number(a.id) - Number(b.id));
    const pick = ok.length <= per ? ok : Array.from({ length: per }, (_, k) => ok[Math.floor((k * ok.length) / per)]);
    const byId = new Map(readdirSync(`${PSJP}${type}`).filter((f) => /^\d+\.json$/.test(f)).map((f) => [String(JSON.parse(readFileSync(`${PSJP}${type}/${f}`, "utf8")).source?.psjp), f]));
    for (const r of pick) { const f = byId.get(r.id); const x = f && loadPz(type, f); if (x) pz.push(x); }
  }
  const { out, sol, batches } = await rankBatches("interest", pz, (type, n) => `Here are ${n} ${type.replace("-", " ")} puzzles from a Japanese puzzle site, where solvers can "like" a puzzle after solving it. Rank them by how much the site's solvers would enjoy them, judging each as a puzzle (its idea, its flow, how it looks), from least enjoyed to most enjoyed.`);
  writeResult("interest", { places: out, puzzles: pz.map((x) => ({ id: x.id, type: x.type, rated: x.rated, perSolver: x.likes / x.solvers, solvers: x.solvers, estimate: estimateOf(sol.get(x.id)!), cells: x.spec.size[0] * x.spec.size[1], looks: looksOf(x.spec) })), batches: batches.map((b) => ({ item: b.item, ids: b.pz.map((x) => x.id) })) });
  report();
}

// ==== hints: positions from Janko's recorded solves ====
const HINT_TYPES = ["star-battle", "akari", "hitori", "nurikabe", "slitherlink", "masyu"];
interface Position { item: string; type: string; f: string; kind: "ordinary" | "stuck"; spec: GridSpec; known: [string, boolean][]; cands: Step[]; next: { mark: string; value: boolean }[]; truth: [string, boolean][] }
const VALUE: Record<string, [string, string]> = { "star-battle": ["star", "no star"], akari: ["bulb", "no bulb"], hitori: ["shaded", "unshaded"], nurikabe: ["wall", "island"] };
async function positions(): Promise<Position[]> {
  const file = `${OUT}positions.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const perOrdinary = Number(process.env.LLM_ORDINARY) || 3, perStuck = Number(process.env.LLM_STUCK) || 2;
  const out: Position[] = [];
  for (const type of HINT_TYPES) {
    const puzzles = studied(type, 10, 80);
    const truthOf = new Map(puzzles.map(({ f, j }) => [f, j]));
    // stuck moments (janko-stuck.ts): small boards, spread through the list
    const stuck = (JSON.parse(readFileSync(`${JANKO_DIR}stuck-${type}.json`, "utf8")) as { f: string; spec: GridSpec; known: [string, number][]; humanNext: { mark: string; value: boolean }[] }[]).filter((x) => truthOf.has(x.f));
    for (const s of shuffled(stuck, `stuck ${type}`).slice(0, perStuck)) {
      const r = await deduceCached(s.spec);
      if (!r) continue;
      const steps = r.path.filter((x) => !x.choice), k = steps.findIndex((x) => x.tier >= 2);
      out.push({ item: `${type}-stuck-${s.f.replace(".txt", "")}`, type, f: s.f, kind: "stuck", spec: s.spec, known: s.known.map(([m, v]) => [m, !!v]), cands: steps.filter((x) => x.round === steps[k].round), next: s.humanNext, truth: [...truthOf.get(s.f)!.truth] });
    }
    // ordinary positions: the start of a round in the middle of the solve with 3 to 12 steps
    // open, and at least 3 marks the person still settled after it
    let taken = 0;
    for (const { f, j } of shuffled(puzzles, `ordinary ${type}`)) {
      if (taken >= perOrdinary) break;
      const r = await deduceCached(j.spec);
      if (!r?.profile.solved) continue;
      const steps = r.path.filter((x) => !x.choice), rounds = [...new Set(steps.map((x) => x.round ?? 0))].sort((a, b) => a - b);
      const middle = rounds.filter((x, i) => i >= rounds.length / 4 && i <= (3 * rounds.length) / 4);
      const ok = middle.filter((rd) => { const n = steps.filter((x) => x.round === rd).length; return n >= 3 && n <= 12; });
      if (!ok.length) continue;
      const rd = ok[Math.floor(rng(`round ${f}`)() * ok.length)];
      const known = new Map<string, boolean>();
      for (const x of r.initial ?? []) { const m = /^(.*)=(true|false)$/.exec(x); if (m) known.set(m[1], m[2] === "true"); }
      for (const s of steps.filter((x) => (x.round ?? 0) < rd)) for (const x of s.facts) known.set(x.mark, x.value);
      const open = [...j.settled.keys()].filter((m) => !known.has(m)).sort((a, b) => j.settled.get(a)! - j.settled.get(b)!);
      if (open.length < 3) continue;
      out.push({ item: `${type}-ordinary-${f.replace(".txt", "")}`, type, f, kind: "ordinary", spec: j.spec, known: [...known], cands: steps.filter((x) => x.round === rd).map((x) => ({ ...x, cells: [], feat: undefined, shapeText: undefined })), next: open.slice(0, 3).map((m) => ({ mark: m, value: j.truth.get(m)! })), truth: [...j.truth] });
      taken++;
    }
  }
  writeFileSync(file, JSON.stringify(out, null, 1));
  return out;
}

/** A move named by a model, as one of our marks: cell moves "r3c4", Slitherlink "r3c4 top",
 *  Masyu "r3c4-r3c5". */
function markOf(spec: GridSpec, move: { at?: string; value?: string }): [string, boolean] | null {
  const p = makePuzzle(spec), g = p.grid, genre = spec.genre ?? "", at = String(move.at ?? "").toLowerCase().trim(), value = String(move.value ?? "").toLowerCase().trim();
  const cell = (s: string) => { const q = /r(\d+)\s*c(\d+)/.exec(s); if (!q) return null; const [r, c] = [+q[1] - 1, +q[2] - 1]; return r >= 0 && c >= 0 && r < g.rows && c < g.cols ? [r, c] : null; };
  const on = value === "line" || value === VALUE[genre]?.[0];
  if (!on && value !== "no line" && value !== VALUE[genre]?.[1]) return null;
  if (genre === "slitherlink") {
    const rc = cell(at), side = /top|bottom|left|right/.exec(at)?.[0];
    if (!rc || !side) return null;
    const [r, c] = rc, C = g.cols + 1, k = (rr: number, cc: number) => rr * C + cc;
    const ends = { top: [k(r, c), k(r, c + 1)], bottom: [k(r + 1, c), k(r + 1, c + 1)], left: [k(r, c), k(r + 1, c)], right: [k(r, c + 1), k(r + 1, c + 1)] }[side]!.sort((a, b) => a - b).join(",");
    const b = g.borders.find((x) => x.corners.slice().sort((a, b2) => a - b2).join(",") === ends);
    return b ? [`fence(${b.id})`, on] : null;
  }
  if (genre === "masyu") {
    const [a, b] = at.split("-").map(cell);
    if (!a || !b) return null;
    const pair = [g.cell(a[0], a[1]), g.cell(b[0], b[1])].sort((x, y) => x - y).join(",");
    const l = g.links.find((x) => x.cells.slice().sort((x2, y) => x2 - y).join(",") === pair);
    return l ? [`line(${l.id})`, on] : null;
  }
  const rc = cell(at);
  return rc ? [`shaded(${g.cell(rc[0], rc[1])})`, on] : null;
}
const moveForm = (genre: string) => genre === "slitherlink" ? `{"at": "r3c4 top" (a cell and one of its sides: top, bottom, left, right), "value": "line" | "no line"}`
  : genre === "masyu" ? `{"at": "r3c4-r3c5" (two neighbouring cells), "value": "line" | "no line"}`
  : `{"at": "r3c4", "value": "${VALUE[genre][0]}" | "${VALUE[genre][1]}"}`;

interface HintReply { pick?: string; move?: { at?: string; value?: string }; hint: string[] }
async function hints() {
  const ps = await positions();
  const rows: Record<string, unknown>[] = [];
  for (const m of models) await mapPool(ps, async (pos) => {
    const known = new Map(pos.known);
    const head = `A person is solving this ${pos.type.replace("-", " ")} puzzle on a puzzle site.

Rules: ${rulesOf(pos.spec)} The puzzle has exactly one solution.

Where they are now:
${drawGrid(pos.spec, known)}`;
    const hintAsk = `Then write a three-level hint for that move, as a hint button would give it, each level revealing a little more: 1, where to look (without naming the move); 2, which idea or rule to apply there; 3, the move itself and why it's forced. Keep each level to one or two short sentences, in plain words for a player.`;
    let prompt: string, ok: (j: any) => boolean;
    if (pos.kind === "ordinary") {
      const ids = pos.cands.map((_, k) => `S${k + 1}`);
      prompt = `${head}

A step-by-step logical solver finds these steps available from here (each certain; what it looked at and which rules and clues force it):
${pos.cands.map((s, k) => `S${k + 1}: ${stepLine(s)}`).join("\n")}

Which of these steps would this person most likely make next? People tend to notice some patterns before others, and don't always take the step a computer finds simplest. ${hintAsk}

End your reply with JSON on its own line: {"pick": "S…", "hint": ["level 1", "level 2", "level 3"]}.`;
      ok = (j) => ids.includes(String(j.pick)) && Array.isArray(j.hint) && j.hint.length === 3;
    } else {
      prompt = `${head}

A step-by-step logical solver finds nothing simple here: its only way on is ${pos.cands.map((s) => stepLine(s)).join(" Or ")}

People in this spot often find a different move, one the solver's small windows miss. What move (certain, by logic, not a guess) would this person most likely make next? It need not be the solver's. ${hintAsk}

End your reply with JSON on its own line: {"move": ${moveForm(pos.type)}, "hint": ["level 1", "level 2", "level 3"]}. Rows count from the top and columns from the left, from 1.`;
      ok = (j) => j.move && typeof j.move === "object" && Array.isArray(j.hint) && j.hint.length === 3;
    }
    const r = await ask<HintReply>("hints", m, pos.item, prompt, ok);
    if (!r?.parsed) return;
    const next = new Set(pos.next.map((x) => x.mark)), truth = new Map(pos.truth);
    let chosen: string[] = [], correct = true, valid = true;
    if (pos.kind === "ordinary") chosen = pos.cands[Number(String(r.parsed.pick).slice(1)) - 1].facts.map((f) => f.mark);
    else {
      const mk = markOf(pos.spec, r.parsed.move ?? {});
      if (!mk) valid = false;
      else { chosen = [mk[0]]; correct = (truth.get(mk[0]) ?? false) === mk[1]; }
    }
    const cheapest = pos.cands.reduce((a, b) => (b.cost < a.cost ? b : a));
    const chance = mean(pos.cands.map((s) => (s.facts.some((f) => next.has(f.mark)) ? 1 : 0)));
    rows.push({ model: m.key, item: pos.item, type: pos.type, kind: pos.kind, cands: pos.cands.length, valid, correct, hit: valid && correct && chosen.some((x) => next.has(x)) ? 1 : 0,
      ours: cheapest.facts.some((f) => next.has(f.mark)) ? 1 : 0, chance, alreadyKnown: chosen.some((x) => known.has(x)), hint: r.parsed.hint, pick: r.parsed.pick ?? r.parsed.move });
  }, 4);
  writeResult("hints", rows);
  report();
}

/** Each model judges a sample of the other's hints: does it point to a correct, forced move? */
async function judge() {
  const ps = new Map((await positions()).map((p) => [p.item, p]));
  const hs = existsSync(`${OUT}result-hints.json`) ? JSON.parse(readFileSync(`${OUT}result-hints.json`, "utf8")) as { model: string; item: string; hint: string[]; kind: string; correct: boolean; valid: boolean }[] : [];
  const per = Number(process.env.LLM_JUDGE) || 8;
  const rows: Record<string, unknown>[] = [];
  for (const writer of [...MODELS].reverse()) {
    const judgeM = MODELS.find((x) => x.key !== writer.key)!;
    if (!models.includes(judgeM)) continue;
    const sample = shuffled(hs.filter((h) => h.model === writer.key), `judge ${writer.key}`).slice(0, per);
    await mapPool(sample, async (h) => {
      const pos = ps.get(h.item)!;
      const prompt = `You are checking a hint written for a player of this ${pos.type.replace("-", " ")} puzzle.

Rules: ${rulesOf(pos.spec)} The puzzle has exactly one solution.

The player's position:
${drawGrid(pos.spec, new Map(pos.known))}

The full solution, for checking (the player can't see it):
${drawGrid(pos.spec, new Map(pos.truth))}

The hint, in three levels:
1. ${h.hint[0]}
2. ${h.hint[1]}
3. ${h.hint[2]}

Judge it: (a) is the move in level 3 correct, per the solution? (b) is it forced by logic from the player's position, with the reason level 3 gives (or a sound one), rather than a guess? (c) do levels 1 and 2 point toward that move without giving it away? (d) is anything in the hint false?

End your reply with JSON on its own line: {"correct": true|false, "forced": true|false, "graded": true|false, "falseClaims": true|false, "note": "one sentence"}.`;
      const r = await ask<{ correct: boolean; forced: boolean; graded: boolean; falseClaims: boolean; note: string }>("judge", judgeM, `${writer.key}-${h.item}`, prompt, (j) => typeof j.correct === "boolean" && typeof j.forced === "boolean");
      if (r?.parsed) rows.push({ writer: writer.key, judge: judgeM.key, item: h.item, kind: h.kind, ...r.parsed, scoredCorrect: h.valid && h.correct });
    }, 2);
  }
  writeResult("judge", rows);
  report();
}

// ==== the report ====
function report() {
  const read = (name: string) => (existsSync(`${OUT}result-${name}.json`) ? JSON.parse(readFileSync(`${OUT}result-${name}.json`, "utf8")) : null);
  const lines: string[] = ["| Job | Model | Score | Baseline (our solver) | n | Dollars |", "|---|---|---|---|---|---|"];
  const detail: string[] = [];
  const seq = read("sequences") as { model: string; set: string; type: string; rho: number; ours: number; size: number; rhoSolved: number; oursSolved: number; solvedN: number; n: number }[] | null;
  if (seq) for (const m of MODELS) {
    const rs = seq.filter((r) => r.model === m.key);
    if (!rs.length) continue;
    const solvedSets = rs.filter((r) => r.solvedN >= 3);
    lines.push(`| Sequences: mean Spearman within Beast Academy sets | ${m.label} | ${f2(mean(rs.map((r) => r.rho)))} (on solved puzzles ${f2(mean(solvedSets.map((r) => r.rhoSolved)))}) | ${f2(mean(rs.map((r) => r.ours)))} (on solved ${f2(mean(solvedSets.map((r) => r.oursSolved)))}); grid size ${f2(mean(rs.map((r) => r.size)))} | ${rs.length} sets, ${rs.reduce((a, r) => a + r.n, 0)} puzzles | ${fmt$(dollarsOf("sequences", m.key))} |`);
    for (const type of [...new Set(rs.map((r) => r.type))]) { const t = rs.filter((r) => r.type === type); detail.push(`sequences ${m.label} ${type}: model ${f2(mean(t.map((r) => r.rho)))}, ours ${f2(mean(t.map((r) => r.ours)))}, grid size ${f2(mean(t.map((r) => r.size)))} over ${t.length} sets (${t.map((r) => `${r.set} ${f2(r.rho)}/${f2(r.ours)}`).join("; ")})`); }
  }
  const hs = read("hints") as { model: string; kind: string; type: string; hit: number; ours: number; chance: number; valid: boolean; correct: boolean; alreadyKnown: boolean }[] | null;
  const itemOf = (r: unknown) => (r as { item: string }).item;
  const both = new Set((hs ?? []).filter((r) => r.model === "opus").map(itemOf).filter((it) => hs!.some((r) => r.model === "fable" && itemOf(r) === it)));
  if (hs) for (const [m, matched] of MODELS.flatMap((x) => [[x, false], [x, true]] as const)) {
    const rs = hs.filter((r) => r.model === m.key && (!matched || both.has(itemOf(r))));
    if (!rs.length || (matched && rs.length === hs.filter((r) => r.model === m.key).length)) continue;
    if (!rs.length) continue;
    const o = rs.filter((r) => r.kind === "ordinary"), s = rs.filter((r) => r.kind === "stuck");
    const pct = (x: number) => `${Math.round(100 * x)}%`;
    lines.push(`| Hints, ordinary positions: pick among the person's next 3${matched ? " (positions both models did)" : ""} | ${m.label} | ${pct(mean(o.map((r) => r.hit)))} | ${pct(mean(o.map((r) => r.ours)))} cheapest step (random pick ${pct(mean(o.map((r) => r.chance)))}) | ${o.length} | ${matched ? "" : `${fmt$(dollarsOf("hints", m.key))} (both kinds)`} |`);
    lines.push(`| Hints, stuck moments: own move correct / among the next 3${matched ? " (positions both models did)" : ""} | ${m.label} | ${pct(mean(s.map((r) => (r.valid && r.correct ? 1 : 0))))} / ${pct(mean(s.map((r) => r.hit)))} | the solver's case split among the next 3: ${pct(mean(s.map((r) => r.ours)))} | ${s.length} | |`);
    if (!matched) for (const type of HINT_TYPES) { const t = rs.filter((r) => r.type === type); if (t.length) detail.push(`hints ${m.label} ${type}: ${t.map((r) => `${r.kind[0]}:${r.hit}/${r.ours}${r.kind === "stuck" ? (r.valid ? (r.correct ? "" : " wrong") : " invalid") : ""}${r.alreadyKnown ? " known" : ""}`).join(", ")}`); }
  }
  const jd = read("judge") as { writer: string; judge: string; correct: boolean; forced: boolean; graded: boolean; falseClaims: boolean; scoredCorrect: boolean }[] | null;
  if (jd) for (const m of MODELS) {
    const rs = jd.filter((r) => r.writer === m.key);
    if (!rs.length) continue;
    const share = (f: (r: typeof rs[0]) => boolean) => `${rs.filter(f).length}/${rs.length}`;
    lines.push(`| Hints judged by ${MODELS.find((x) => x.key === rs[0].judge)!.label}: correct, forced, well graded, no false claims | ${m.label} | ${share((r) => r.correct)}, ${share((r) => r.forced)}, ${share((r) => r.graded)}, ${share((r) => !r.falseClaims)} | judge agrees with the solution check on ${share((r) => r.correct === r.scoredCorrect)} | ${rs.length} | ${fmt$(dollarsOf("judge", rs[0].judge))} (judge) |`);
  }
  for (const [name, label] of [["difficulty", "Difficulty: Spearman with Puzzle Square JP's rating"], ["interest", "Interest: Spearman with likes per solver"]] as const) {
    const d = read(name) as { places: { model: string; type: string; batch: string; id: string; place: number }[]; puzzles: { id: string; type: string; rated: number; estimate: number; cells: number; perSolver?: number; looks?: { cells: number; density: number } }[]; batches: { item: string; ids: string[] }[] } | null;
    if (!d) continue;
    const pz = new Map(d.puzzles.map((x) => [x.id, x]));
    const key = (id: string) => (name === "difficulty" ? pz.get(id)!.rated : pz.get(id)!.perSolver!);
    for (const m of MODELS) {
      const pl = d.places.filter((x) => x.model === m.key);
      if (!pl.length) continue;
      const types = [...new Set(pl.map((x) => x.type))];
      const within: number[] = [], withinOurs: number[] = [], withinSize: number[] = [], pooled: number[] = [], pooledOurs: number[] = [], part: number[] = [], partOurs: number[] = [];
      for (const b of d.batches) {
        const xs = pl.filter((x) => x.batch === b.item);
        if (xs.length < 3) continue;
        within.push(spearman(xs.map((x) => x.place), xs.map((x) => key(x.id))));
        withinOurs.push(spearman(xs.map((x) => pz.get(x.id)!.estimate), xs.map((x) => key(x.id))));
        withinSize.push(spearman(xs.map((x) => pz.get(x.id)!.cells), xs.map((x) => key(x.id))));
      }
      const per: string[] = [];
      for (const type of types) {
        const xs = pl.filter((x) => x.type === type);
        const a = xs.map((x) => x.place), y = xs.map((x) => key(x.id)), est = xs.map((x) => pz.get(x.id)!.estimate), rated = xs.map((x) => pz.get(x.id)!.rated);
        pooled.push(spearman(a, y)); pooledOurs.push(spearman(est, y));
        if (name === "interest") { part.push(partial(a, y, rated)); partOurs.push(partial(est, y, rated)); }
        per.push(`${type} ${f2(spearman(a, y))}/${f2(spearman(est, y))}${name === "interest" ? ` beyond difficulty ${f2(partial(a, y, rated))}; model vs site difficulty ${f2(spearman(a, rated))}; sparse clues ${f2(partial(xs.map((x) => -(pz.get(x.id)!.looks?.density ?? 0)), y, rated))}, cells ${f2(partial(xs.map((x) => pz.get(x.id)!.looks?.cells ?? 0), y, rated))}` : ""} (n ${xs.length})`);
      }
      lines.push(`| ${label}, within batches of 10 (pooled by type) | ${m.label} | ${f2(mean(within))} (${f2(mean(pooled))}) | ${f2(mean(withinOurs))} (${f2(mean(pooledOurs))}) our estimate; grid size ${f2(mean(withinSize))} | ${pl.length} puzzles, ${types.length} types | ${fmt$(dollarsOf(name, m.key))} |`);
      if (name === "interest") lines.push(`| Interest beyond difficulty: partial Spearman, site difficulty held fixed (mean of types) | ${m.label} | ${f2(mean(part))} | ${f2(mean(partOurs))} our estimate | ${pl.length} | |`);
      detail.push(`${name} ${m.label}, per type, model/ours: ${per.join("; ")}`);
    }
  }
  const total = `Spent: ${fmt$(ledger.spent)} of ${fmt$(CAP)} over ${ledger.calls.length} calls (${Object.entries(ledger.cells).map(([k, v]) => `${k} ${fmt$(v)}`).join(", ")}).`;
  const text = [lines.join("\n"), "", ...detail.map((x) => `- ${x}`), "", total].join("\n");
  writeFileSync(`${OUT}report.md`, text);
  console.log(text);
}

const JOBS: Record<string, () => Promise<void> | void> = { sequences, hints, difficulty, interest, judge, report };
// run as a script, not when another script imports the helpers above (llm-human.ts)
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!JOBS[job]) throw new Error(`job: one of ${Object.keys(JOBS).join(", ")}`);
  await JOBS[job]();
}
