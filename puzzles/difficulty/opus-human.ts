// Does Opus predict people's next moves better than the graph network? Held-out Janko states only
// (graph-human-labels.ts's "test" side, by puzzle), all 14 types, spread over Janko's solvers, two
// kinds of state:
//
// - ordinary: one of the person's own states (state k of the human-labelled record: what they had
//   settled before their k-th move), k drawn from the middle 60% of their solve;
// - stuck: where our solver's only way on was a case split or search (as janko-stuck.ts: what the
//   solver knew just before its first tier-2 step).
//
// The measure is graph_policy.py's agreement with people: a single predicted move (a mark and its
// value, open in the state) counts if it is among the person's next 3 moves (of the label marks
// they settled, the first 3 still open, with the solution's value); top-1 if it is the very next.
// Three predictors on the same states: Opus (one move and a one-line reason, the llm-move.ts prompt
// with the person framed as in llm-label.ts's hints), the baseline network (opus_human_net.py) and
// our solver (its next step from the state along its own path: the first step with a fact still
// open, and that step's first open fact).
//
//   node --no-warnings puzzles/difficulty/opus-human.ts sample [--n 400]      → items.json (seeded)
//   node --no-warnings puzzles/difficulty/opus-human.ts ask [--limit N]       → opus.jsonl (resumable, capped)
//   node --no-warnings puzzles/difficulty/opus-human.ts check                 → forced.jsonl (clingo)
//   references/ml/.venv/bin/python puzzles/difficulty/opus_human_net.py       → net.jsonl
//   node --no-warnings puzzles/difficulty/opus-human.ts report                → report.md
//   python puzzles/difficulty/opus_human_tune.py score <model> net-<base|tuned>.jsonl   (or tune-job.sh)
//   node --no-warnings puzzles/difficulty/opus-human.ts checks                → checks.md (the tuned
//     network beside the rest, and every predictor with negative marks left out)
//   node --no-warnings puzzles/difficulty/opus-human.ts show <id> [listed]    (the prompt, for checking)
//   node --no-warnings puzzles/difficulty/opus-human.ts open <model,…> [grid|listed …] [--limit N]
//                                                                          → open-<model>-<format>.jsonl
//   node --no-warnings puzzles/difficulty/opus-human.ts openreport            → open-report.md
//
// `open` asks open-weight models the same question through an OpenAI-compatible API (OPEN_API_BASE,
// default OpenRouter; key in OPEN_API_KEY or OPENROUTER_API_KEY), in two text formats: `grid` (the
// drawing Opus saw) and `listed` (the drawing plus every cell, link or side spelled out one per line
// with its clue and state: is the trouble small models have with grids the format or the model?).
// OPEN_CAP_CALLS (default 3000) stops it. openreport scores them as report() scores Opus.
//
// Everything goes to references/ml/opus-human/ (local only: the puzzles are Janko's). OPUS_CAP
// (dollars, default 60) stops the asking before the ledger would pass it.
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { program } from "../../src/engine/encode.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { clingoJson, loadClingo } from "./clingo.ts";
import { JANKO_DIR, JANKO_TYPES, type Janko, READERS } from "./janko.ts";
import { deduceCached } from "./janko-order.ts";
import { drawGrid, rng, rulesOf, shuffled } from "./llm-label.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const main = repo.replace(/\.claude\/worktrees\/[^/]+\/$/, "");
const OUT = `${repo}references/ml/opus-human/`;
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2), cmd = argv[0] ?? "report";
const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
const SEED = "opus-human 2026-10-19";
const MODEL = "claude-opus-5-5", PRICE = { input: 4 / 1e6, output: 20 / 1e6 }, MAX_TOKENS = 16000;
const CAP = Number(process.env.OPUS_CAP) || 60;

type MV = [string, boolean];
interface Item {
  id: string; genre: string; type: string; name: string; file: string; person: string; kind: "ordinary" | "stuck";
  k: number; rounds: number; known: MV[]; next: MV[]; solverStep: MV[]; solverFirst: MV | null; solverPlace: MV | null; solverFinished: boolean | null;
}

// ---- reading a held-out puzzle ----
const typeOf = new Map(Object.entries(JANKO_TYPES).map(([t, v]) => [v.folder, t]));
function jankoOf(name: string): { type: string; file: string; j: Janko } {
  const m = /^janko ([^/]+)\/(.+)$/.exec(name)!;
  const type = typeOf.get(m[1])!, file = `${JANKO_DIR}${m[1]}/${m[2]}`;
  return { type, file, j: READERS[type](file)! };
}
const parseFact = (f: string | [string, boolean]): MV => (typeof f === "string" ? [f.slice(0, f.lastIndexOf("=")), f.endsWith("=true")] : f);

// ======== sample ========
async function sample() {
  const N = opt("--n", 400);
  const recs: any[] = [];
  for (const l of readFileSync(`${repo}references/ml/graphs-human-labels.jsonl`, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.split !== "test") continue;
    recs.push({ name: d.name, genre: d.genre, solver: d.solver, initial: d.initial, rounds: d.rounds.map((r: any) => r.facts.map((f: any) => [f[0], f[1]])), humanOrder: d.humanOrder, solverFinished: d.solverFinished });
  }
  const genres = [...new Set(recs.map((r) => r.genre))].sort();
  const counts = new Map(genres.map((g) => [g, recs.filter((r) => r.genre === g).length]));
  // equal shares by type, the remainder to the types with the most puzzles
  const base = Math.floor(N / genres.length), extra = N - base * genres.length;
  const quota = new Map(genres.map((g) => [g, base]));
  for (const g of [...genres].sort((a, b) => counts.get(b)! - counts.get(a)!).slice(0, extra)) quota.set(g, base + 1);
  const r = rng(SEED);
  const items: Item[] = [];
  for (const g of genres) {
    // round-robin over Janko's solvers (each shuffled), puzzles reused (another state) only once all are used
    const bySolver = new Map<string, any[]>();
    for (const x of recs.filter((x) => x.genre === g)) bySolver.set(x.solver || "?", [...(bySolver.get(x.solver || "?") ?? []), x]);
    const lists = [...bySolver.keys()].sort().map((s) => shuffled(bySolver.get(s)!, `${SEED} ${g} ${s}`));
    const order: any[] = [];
    for (let round = 0; round < Math.max(...lists.map((L) => L.length)); round++) for (const L of lists) if (round < L.length) order.push(L[round]);
    const picks = Array.from({ length: quota.get(g)! }, (_, i) => order[i % order.length]);
    // our solver on each (cached; 30 s budget, killed at 2 min)
    const solves = await mapPool(picks, async (x) => deduceCached(jankoOf(x.name).j.spec).catch(() => null), 2);
    const wantStuck = Math.round(quota.get(g)! / 3);
    let stuck = 0;
    picks.forEach((x, idx) => {
      const { type, file, j } = jankoOf(x.name), sv = solves[idx];
      const steps = (sv?.path ?? []).filter((s: any) => !s.choice);
      const label = (known: Map<string, boolean>) => (x.humanOrder as [string, number][]).map(([m]) => m).filter((m, i, a) => a.indexOf(m) === i && !known.has(m)).slice(0, 3).map((m): MV => [m, j.truth.get(m)!]);
      let kind: Item["kind"] = "ordinary", k = 0, known = new Map<string, boolean>();
      const ks = steps.findIndex((s: any) => s.tier >= 2);
      if (stuck < wantStuck && ks >= 0) {
        const kn = new Map<string, boolean>();
        for (const f of sv!.initial ?? []) { const [m, v] = parseFact(f); kn.set(m, v); }
        for (const s of steps.slice(0, ks)) for (const f of s.facts) kn.set(f.mark, f.value);
        if (label(kn).length) { kind = "stuck"; k = ks; known = kn; stuck++; }
      }
      if (kind === "ordinary") {
        const R = x.rounds.length, lo = Math.floor(0.2 * R), hi = Math.max(lo + 1, Math.ceil(0.8 * R));
        // a puzzle drawn twice gets a different state
        const used = new Set(items.filter((it) => it.name === x.name && it.kind === "ordinary").map((it) => it.k));
        for (let t = 0; t < 50; t++) { k = lo + Math.floor(r() * (hi - lo)); if (!used.has(k)) break; }
        for (const f of x.initial ?? []) { const [m, v] = parseFact(f); known.set(m, v); }
        for (const rd of x.rounds.slice(0, k)) for (const [m, v] of rd) if (!known.has(m)) known.set(m, v);
      }
      // the solver's next step from here along its own path
      const open = (m: string) => !known.has(m);
      const step = steps.find((s: any) => s.facts.some((f: any) => open(f.mark)));
      const stepFacts: MV[] = step ? step.facts.filter((f: any) => open(f.mark)).map((f: any) => [f.mark, f.value]) : [];
      // digit types: its first placement still open (a digit set true), as people's labels there are
      const place = /^digit\(/.test(x.humanOrder[0]?.[0] ?? "") ? steps.flatMap((s: any) => s.facts).find((f: any) => f.value && open(f.mark)) : undefined;
      items.push({
        id: `${g}-${kind}-${x.name.replace(/^janko /, "").replace(/[^\w]+/g, "_")}-${k}`, genre: g, type, name: x.name, file, person: x.solver || "?", kind, k, rounds: x.rounds.length,
        known: [...known], next: label(known), solverStep: stepFacts, solverFirst: stepFacts[0] ?? null, solverPlace: place ? [place.mark, true] : null, solverFinished: x.solverFinished,
      });
    });
    console.error(`${g}: ${picks.length} states (${stuck} stuck), ${bySolver.size} solvers, ${new Set(picks.map((x) => x.name)).size} puzzles`);
  }
  // a puzzle drawn twice can land on the same state: ids kept distinct
  const seenId = new Map<string, number>();
  for (const it of items) { const n = seenId.get(it.id) ?? 0; seenId.set(it.id, n + 1); if (n) it.id += `-${n + 1}`; }
  writeFileSync(`${OUT}items.json`, JSON.stringify({ seed: SEED, n: items.length, items }, null, 1));
  console.log(`${items.length} items → ${OUT}items.json`);
}

// ======== the puzzle in words ========
const NAME: Record<string, string> = { "easy-as-abc": "Easy as ABC", "spiral-galaxies": "Spiral Galaxies", "star-battle": "Star Battle" };
const VALUES: Record<string, [string, string]> = {
  "star-battle": ["star", "no star"], akari: ["bulb", "no bulb"], hitori: ["shaded", "unshaded"], nurikabe: ["wall", "island"],
  minesweeper: ["mine", "no mine"], nonogram: ["filled", "empty"],
  masyu: ["line", "no line"], numberlink: ["line", "no line"], slitherlink: ["line", "no line"],
  fillomino: ["wall", "same region"], "spiral-galaxies": ["wall", "same region"],
};
function rules(spec: GridSpec): string {
  const p = makePuzzle(spec), R = spec.size[0], C = spec.size[1];
  switch (spec.genre) {
    case "fillomino": return "Fillomino: divide the grid into regions; each region's size equals every number in it, a given number belongs to a region of that size, and two regions of the same size never touch side by side.";
    case "easy-as-abc": { const D = (p.rules.find((x) => x.rule === "letters") as any)?.count ?? 3; return `Easy as ABC: place the letters ${"ABCDEFG".slice(0, D).split("").join(", ")} so every row and column has each exactly once; the other cells stay empty. A letter outside the grid is the first letter seen from that side.`; }
    case "hidoku": return `Hidoku: fill every cell with the numbers 1 to ${R * C}, each once, so consecutive numbers are in neighbouring cells (side by side or diagonally).`;
    case "numberlink": return "Numberlink: join each pair of equal numbers with one line through cell centres, moving horizontally and vertically. Lines never branch, cross or share a cell, and never pass through another number. Not every cell need be used.";
    case "minesweeper": return "Minesweeper: some empty cells hide mines. A number is how many of its eight neighbours (sides and corners) hold mines; a numbered cell has no mine.";
    case "nonogram": return "Nonogram: fill cells so each row's and column's runs of filled cells match its clue, in order (the numbers to the left of a row, and above a column, read top to bottom); runs are separated by at least one empty cell.";
    case "skyscrapers": return `Skyscrapers: fill the grid with heights 1–${R} so each row and column has each height once. A number outside the grid is how many buildings are seen from that side, taller ones hiding shorter ones behind them.`;
    default: return rulesOf(spec);
  }
}

function draw(spec: GridSpec, known: Map<string, boolean>): string {
  const p = makePuzzle(spec), g = p.grid, R = g.rows, C = g.cols, genre = spec.genre!;
  const num = (i: number) => (p.cellGivens.get(i) ?? []).find((x) => x.kind === "number") as { value?: number } | undefined;
  const sh = (i: number) => known.get(`shaded(${i})`);
  const table = (cell: (i: number) => string, legend: string, left?: string[], top?: string[]) => {
    const cells = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => cell(g.cell(r, c))));
    const w = Math.max(3, ...cells.flat().map((x) => x.length + 1));
    const lw = left ? Math.max(...left.map((x) => x.length)) + 2 : 0;
    const head = [...(top ?? []), "     " + " ".repeat(lw) + Array.from({ length: C }, (_, c) => `c${c + 1}`.padEnd(w)).join("")];
    return [legend, ...head, ...cells.map((row, r) => `r${String(r + 1).padEnd(4)}${left ? left[r].padStart(lw - 2) + "  " : ""}${row.map((x) => x.padEnd(w)).join("")}`)].join("\n");
  };
  const digitAt = (i: number, D: number) => [...Array(D)].map((_, k) => k + 1).find((d) => known.get(`digit(${i},${d})`) === true);
  if (genre === "minesweeper") return table((i) => (num(i) ? String(num(i)!.value) : sh(i) === true ? "*" : sh(i) === false ? "o" : "."), "(a number is a clue (no mine there), * a known mine, o a cell known to have no mine, . undecided)");
  if (genre === "nonogram") {
    const rowsG = (spec.givens ?? []).filter((x: any) => x.at === "row").sort((a: any, b: any) => a.index - b.index).map((x: any) => (x.value as number[]).join(" "));
    const colsG = (spec.givens ?? []).filter((x: any) => x.at === "col").sort((a: any, b: any) => a.index - b.index).map((x: any) => x.value as number[]);
    const tops = colsG.map((v, c) => `c${c + 1}: ${v.join(" ")}`).join("; ");
    return table((i) => (sh(i) === true ? "#" : sh(i) === false ? "x" : "."), `Column clues, top to bottom: ${tops}\n(row clues to the left of each row; # a filled cell, x a cell known empty, . undecided)`, rowsG);
  }
  if (genre === "hidoku") return table((i) => String(num(i)?.value ?? digitAt(i, R * C) ?? "."), "(a number is given or placed; . is empty)");
  if (genre === "easy-as-abc") {
    const D = (p.rules.find((x) => x.rule === "letters") as any)?.count ?? 3, L = (d: number) => "ABCDEFG"[d - 1];
    const edge = new Map<string, number>();
    for (const x of (spec.givens ?? []) as any[]) if (x.at === "edge") edge.set(`${x.side}${x.side === "top" || x.side === "bottom" ? x.cell[1] : x.cell[0]}`, x.value);
    const o = (k: string) => (edge.has(k) ? L(edge.get(k)!) : " ");
    const cell = (r: number, c: number) => { const i = g.cell(r, c), n = num(i)?.value, d = n ?? digitAt(i, D); if (d) return L(d); return [...Array(D)].every((_, k) => known.get(`digit(${i},${k + 1})`) === false) ? "-" : "."; };
    const rows = ["      " + [...Array(C)].map((_, c) => o(`top${c}`)).join(" "), "      " + "-".repeat(2 * C - 1)];
    for (let r = 0; r < R; r++) rows.push(`r${String(r + 1).padEnd(2)} ${o(`left${r}`)}|${[...Array(C)].map((_, c) => cell(r, c)).join(" ")}|${o(`right${r}`)}`);
    rows.push("      " + "-".repeat(2 * C - 1), "      " + [...Array(C)].map((_, c) => o(`bottom${c}`)).join(" "));
    return `(${R} rows × ${C} columns, columns c1… left to right; letters outside the frame are the clues seen from that side, blank none; inside, a letter is given or placed, - a cell known empty, . undecided)\n${rows.join("\n")}`;
  }
  if (genre === "numberlink") {
    const lid = new Map(g.links.map((l) => [l.cells.slice().sort((a, b) => a - b).join(","), l.id] as [string, number]));
    const sym = (a: number, b: number, on: string) => { const id = lid.get([a, b].sort((x, y) => x - y).join(",")); const v = id === undefined ? undefined : known.get(`line(${id})`); return v === true ? on : v === false ? "x" : " "; };
    const w = Math.max(1, ...[...Array(R * C)].map((_, i) => String(num(i)?.value ?? ".").length));
    const rows = ["    " + [...Array(C)].map((_, c) => String(c + 1).padEnd(w + 1)).join("")];
    for (let r = 0; r < R; r++) {
      rows.push(`r${r + 1}`.padEnd(4) + [...Array(C)].map((_, c) => String(num(g.cell(r, c))?.value ?? ".").padEnd(w) + (c + 1 < C ? sym(g.cell(r, c), g.cell(r, c + 1), "-") : "")).join(""));
      if (r + 1 < R) rows.push("    " + [...Array(C)].map((_, c) => sym(g.cell(r, c), g.cell(r + 1, c), "|").padEnd(w + 1)).join(""));
    }
    return `(${R} rows × ${C} columns; rows r1… down the left, columns numbered along the top; each cell a number or . empty; between cells - or | the line, x known to have no line, blank undecided)\n${rows.join("\n")}`;
  }
  if (genre === "fillomino" || genre === "spiral-galaxies") {
    // a lattice: cell centres, the edges between cells, corners; dots (Spiral Galaxies) where they sit
    const lid = new Map(g.links.map((l) => [l.cells.slice().sort((a, b) => a - b).join(","), l.id] as [string, number]));
    const cut = (a: number, b: number) => known.get(`cut(${lid.get([a, b].sort((x, y) => x - y).join(","))})`);
    const dots = new Set(p.galaxies.map(([y, x]) => `${y},${x}`));
    const lines: string[] = ["     " + [...Array(C)].map((_, c) => ` ${String(c + 1).padEnd(3)}`).join("")];
    for (let y = 0; y <= 2 * R; y++) {
      let s = y % 2 ? `r${(y + 1) / 2}`.padEnd(5) : "     ";
      for (let x = 0; x <= 2 * C; x++) {
        const dot = dots.has(`${y},${x}`), r = (y - 1) / 2, c = (x - 1) / 2;
        if (y % 2 === 0 && x % 2 === 0) s += dot ? "o" : "+";
        else if (y % 2 === 0) { // the edge above cell (y/2, c)
          const v = y === 0 || y === 2 * R ? true : cut(g.cell(y / 2 - 1, c), g.cell(y / 2, c));
          s += dot ? " o " : v === true ? "---" : v === false ? " = " : "   ";
        } else if (x % 2 === 0) { // the edge left of cell (r, x/2)
          const v = x === 0 || x === 2 * C ? true : cut(g.cell(r, x / 2 - 1), g.cell(r, x / 2));
          s += dot ? "o" : v === true ? "|" : v === false ? "=" : " ";
        } else s += dot ? " o " : ` ${String(num(g.cell(r, c))?.value ?? ".").padEnd(2)}`.slice(0, 3);
      }
      lines.push(s);
    }
    const legend = genre === "fillomino" ? "a number is given, . an empty cell" : "o a dot (on a cell centre, an edge or a corner), . a cell";
    return `(${R} rows × ${C} columns; rows r1… down the left, columns numbered along the top; + a corner; ${legend}; between two cells, --- or | a wall known (different regions), = known to be the same region, blank undecided)\n${lines.join("\n")}`;
  }
  return drawGrid(spec, known);
}

function moveForm(genre: string): string {
  if (genre === "slitherlink") return `{"at": "r3c4 top" (a cell and one of its sides: top, bottom, left, right), "value": "line" | "no line", "reason": "one line"}`;
  if (["masyu", "numberlink", "fillomino", "spiral-galaxies"].includes(genre)) { const [a, b] = VALUES[genre]; return `{"at": "r3c4-r3c5" (two cells side by side), "value": "${a}" | "${b}", "reason": "one line"}`; }
  if (genre === "skyscrapers" || genre === "hidoku") return `{"at": "r3c4", "value": "<number>", "reason": "one line"}: a number to write in an empty cell`;
  if (genre === "easy-as-abc") return `{"at": "r3c4", "value": "<letter>" | "empty", "reason": "one line"}`;
  const [a, b] = VALUES[genre];
  return `{"at": "r3c4", "value": "${a}" | "${b}", "reason": "one line"}`;
}

/** A move named by the model, as one of our marks. */
function markOf(spec: GridSpec, move: { at?: unknown; value?: unknown }): MV | null {
  const p = makePuzzle(spec), g = p.grid, genre = spec.genre!, at = String(move.at ?? "").toLowerCase().trim(), value = String(move.value ?? "").toLowerCase().trim();
  const cell = (s: string) => { const q = /r(\d+)\s*c(\d+)/.exec(s); if (!q) return null; const [r, c] = [+q[1] - 1, +q[2] - 1]; return r >= 0 && c >= 0 && r < g.rows && c < g.cols ? g.cell(r, c) : null; };
  if (genre === "skyscrapers" || genre === "hidoku" || genre === "easy-as-abc") {
    const i = cell(at);
    if (i === null) return null;
    if (genre === "easy-as-abc") {
      if (value === "empty" || value === "-") return [`digit(${i},1)`, false];
      const d = /^[a-g]$/.test(value) ? value.charCodeAt(0) - 96 : NaN;
      return Number.isFinite(d) ? [`digit(${i},${d})`, true] : null;
    }
    const d = parseInt(value);
    return d >= 1 ? [`digit(${i},${d})`, true] : null;
  }
  const [yes, no] = VALUES[genre];
  const on = value === yes, off = value === no;
  if (!on && !off) return null;
  if (genre === "slitherlink") {
    const q = /r(\d+)\s*c(\d+)/.exec(at), side = /top|bottom|left|right/.exec(at)?.[0];
    if (!q || !side) return null;
    const [r, c] = [+q[1] - 1, +q[2] - 1], W = g.cols + 1, k = (rr: number, cc: number) => rr * W + cc;
    const ends = ({ top: [k(r, c), k(r, c + 1)], bottom: [k(r + 1, c), k(r + 1, c + 1)], left: [k(r, c), k(r + 1, c)], right: [k(r, c + 1), k(r + 1, c + 1)] } as Record<string, number[]>)[side].sort((a, b) => a - b).join(",");
    const b = g.borders.find((x) => x.corners.slice().sort((a, b2) => a - b2).join(",") === ends);
    return b ? [`fence(${b.id})`, on] : null;
  }
  if (["masyu", "numberlink", "fillomino", "spiral-galaxies"].includes(genre)) {
    const [a, b] = at.split("-").map(cell);
    if (a == null || b == null) return null;
    const l = g.links.find((x) => x.cells.slice().sort((x2, y) => x2 - y).join(",") === [a, b].sort((x, y) => x - y).join(","));
    return l ? [`${genre === "fillomino" || genre === "spiral-galaxies" ? "cut" : "line"}(${l.id})`, on] : null;
  }
  const i = cell(at);
  return i === null ? null : [`shaded(${i})`, on];
}

/** The state spelled out, one line per cell (or per link, or per cell side): its clue and what is
 *  known, so a model reads relations rather than counting columns in a drawing. */
function listed(spec: GridSpec, known: Map<string, boolean>): string {
  const p = makePuzzle(spec), g = p.grid, R = g.rows, C = g.cols, genre = spec.genre!;
  const name = (i: number) => `r${Math.floor(i / C) + 1}c${(i % C) + 1}`;
  const area = (i: number) => (p.areas ? `area ${String.fromCharCode(65 + p.areas.of[i])}` : "");
  const clue = (i: number) => [area(i), ...(p.cellGivens.get(i) ?? []).map((x: any) => (x.value !== undefined ? `clue ${Array.isArray(x.value) ? x.value.join(" ") : x.value}` : x.kind))].filter(Boolean).join(", ");
  const isBlock = (i: number) => (p.cellGivens.get(i) ?? []).some((x: any) => x.kind === "block");
  const state = (m: string, [a, b]: [string, string]) => { const v = known.get(m); return v === true ? a : v === false ? b : "undecided"; };
  const lines: string[] = [];
  if (["masyu", "numberlink", "fillomino", "spiral-galaxies"].includes(genre)) {
    for (let i = 0; i < R * C; i++) { const c = clue(i); if (c) lines.push(`${name(i)}: ${c}`); }
    const vals = VALUES[genre], mk = genre === "fillomino" || genre === "spiral-galaxies" ? "cut" : "line";
    for (const l of g.links) { const [a, b] = l.cells.slice().sort((x, y) => x - y); lines.push(`${name(a)}-${name(b)}: ${state(`${mk}(${l.id})`, vals)}`); }
  } else if (genre === "slitherlink") {
    const W = C + 1;
    for (let i = 0; i < R * C; i++) { const c = clue(i); if (c) lines.push(`${name(i)}: ${c}`); }
    for (const bd of g.borders) {
      const [a, b] = bd.corners.slice().sort((x, y) => x - y), r = Math.floor(a / W), c = a % W;
      const where = b - a === 1 ? (r < R ? `r${r + 1}c${c + 1} top` : `r${r}c${c + 1} bottom`) : (c < C ? `r${r + 1}c${c + 1} left` : `r${r + 1}c${c} right`);
      lines.push(`${where}: ${state(`fence(${bd.id})`, VALUES.slitherlink)}`);
    }
  } else if (["skyscrapers", "hidoku", "easy-as-abc"].includes(genre)) {
    const D = genre === "hidoku" ? R * C : genre === "easy-as-abc" ? (p.rules.find((x) => x.rule === "letters") as any)?.count ?? 3 : R;
    const show = (d: number) => (genre === "easy-as-abc" ? "ABCDEFG"[d - 1] : String(d));
    for (let i = 0; i < R * C; i++) {
      if (isBlock(i)) { lines.push(`${name(i)}: ${clue(i)}`); continue; }
      const given = ((p.cellGivens.get(i) ?? []).find((x: any) => x.kind === "number") as any)?.value;
      if (given !== undefined) { lines.push(`${name(i)}: given ${show(given)}`); continue; }
      const c = clue(i), placed = [...Array(D)].map((_, k) => k + 1).find((d) => known.get(`digit(${i},${d})`) === true);
      const out = [...Array(D)].map((_, k) => k + 1).filter((d) => known.get(`digit(${i},${d})`) === false);
      lines.push(`${name(i)}: ${c ? c + "; " : ""}${placed ? `holds ${show(placed)}` : out.length === D && genre === "easy-as-abc" ? "empty" : out.length ? `not ${out.map(show).join(", ")}` : "undecided"}`);
    }
  } else {
    const vals = VALUES[genre] ?? ["shaded", "unshaded"];
    for (let i = 0; i < R * C; i++) { const c = clue(i); lines.push(`${name(i)}: ${c ? c + "; " : ""}${isBlock(i) ? "(no move here)" : state(`shaded(${i})`, vals)}`); }
  }
  return `Every ${["masyu", "numberlink", "fillomino", "spiral-galaxies", "slitherlink"].includes(genre) ? "clue, then every edge" : "cell"}, one per line (r = row, c = column, from 1):\n${lines.join("\n")}`;
}

function promptOf(it: Item, format: "grid" | "listed" = "grid"): string {
  const { j } = jankoOf(it.name);
  return `A person is solving this ${NAME[it.genre] ?? it.genre.replace(/-/g, " ")} puzzle.

Rules: ${rules(j.spec)} The puzzle has exactly one solution.

Where they are now:

${draw(j.spec, new Map(it.known))}${format === "listed" ? `\n\n${listed(j.spec, new Map(it.known))}` : ""}

What single move will this person most likely make next? It must be a move you are certain of, deduced by logic (no guessing), and still undecided in the grid above. End your reply with JSON: ${moveForm(it.genre)}. Rows and columns count from 1.`;
}

// ======== ask ========
const loadItems = (): Item[] => JSON.parse(readFileSync(`${OUT}items.json`, "utf8")).items;
const readJsonl = (f: string) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
function lastJson(text: string): any {
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1))
    for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
      try { const x = JSON.parse(text.slice(start, end + 1)); if (x && typeof x === "object" && "at" in x) return x; } catch { /* not this span */ }
    }
  return null;
}
async function ask() {
  const key = /^ANTHROPIC_API_KEY=(.*)$/m.exec(readFileSync(`${main}app/.dev.vars`, "utf8"))?.[1]?.trim();
  if (!key) throw new Error("no ANTHROPIC_API_KEY in app/.dev.vars");
  const client = new Anthropic({ apiKey: key, timeout: 10 * 60 * 1000, maxRetries: 4 });
  const file = `${OUT}opus.jsonl`;
  const done = new Map(readJsonl(file).map((x) => [x.id, x]));
  let spent = [...done.values()].reduce((a, x) => a + (x.dollars ?? 0), 0), reserved = 0;
  // the pilot: the first --limit items in an order spread over types and kinds
  let todo = shuffled(loadItems(), `${SEED} order`).filter((it) => !done.has(it.id));
  if (argv.includes("--limit")) todo = todo.slice(0, Math.max(0, opt("--limit", 20) - done.size));
  console.error(`${done.size} done ($${spent.toFixed(2)}), ${todo.length} to ask, cap $${CAP}`);
  await mapPool(todo, async (it) => {
    const prompt = promptOf(it);
    const worst = (prompt.length / 3) * PRICE.input + MAX_TOKENS * PRICE.output;
    if (spent + reserved + worst > CAP) { console.error(`${it.id}: skipped, the total would pass $${CAP}`); return; }
    reserved += worst;
    const t0 = Date.now();
    try {
      const res = await client.messages.create({
        model: MODEL, max_tokens: MAX_TOKENS, thinking: { type: "adaptive" }, output_config: { effort: "medium" },
        messages: [{ role: "user", content: prompt }],
      });
      const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
      const dollars = usage.input * PRICE.input + usage.output * PRICE.output;
      spent += dollars;
      const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      const parsed = res.stop_reason === "refusal" ? null : lastJson(text);
      const mark = parsed ? markOf(jankoOf(it.name).j.spec, parsed) : null;
      appendFileSync(file, JSON.stringify({ id: it.id, model: MODEL, stop: res.stop_reason, usage, dollars: +dollars.toFixed(5), ms: Date.now() - t0, parsed, mark, text, at: new Date().toISOString() }) + "\n");
      console.error(`${it.id}: ${mark ? mark.join("=") : `unparsed (${res.stop_reason})`}, ${usage.input} in, ${usage.output} out, $${dollars.toFixed(3)} (total $${spent.toFixed(2)}), ${Math.round((Date.now() - t0) / 1000)} s`);
    } catch (e) {
      console.error(`${it.id}: failed (${(e as Error).message.slice(0, 160)})`);
    } finally { reserved -= worst; }
  }, 4);
  console.log(`spent $${spent.toFixed(2)} over ${readJsonl(file).length} calls`);
}

// ======== check: is Opus's move forced by the rules and the state? (clingo) ========
// Each move in its own process, killed at 90 s (clingo-wasm ignores --time-limit, and a big
// Fillomino's refutation can run for hours): "timeout" then.
function verdictOf(it: Item, mark: MV): string {
  const { j } = jankoOf(it.name), [m, v] = mark, known = new Map(it.known);
  if (known.has(m)) return known.get(m) === v ? "already known" : "contradicts the state";
  const base = program(makePuzzle(j.spec)) + "\n" + [...known].map(([a, b]) => (b ? `:- not ${a}.` : `:- ${a}.`)).join("\n");
  const sat = (extra: string) => { try { return clingoJson(`${base}\n${extra}`, 1).Result === "SATISFIABLE"; } catch { return null; } };
  const withMove = sat(v ? `:- not ${m}.` : `:- ${m}.`);
  if (withMove === null) return "clingo error";
  if (!withMove) return "wrong";
  const against = sat(v ? `:- ${m}.` : `:- not ${m}.`);
  return against === null ? "clingo error" : against ? "not forced" : "forced";
}
async function check() {
  if (argv[1] === "--one") { await loadClingo(); const it = loadItems().find((x) => x.id === argv[2])!; console.log(JSON.stringify({ verdict: verdictOf(it, JSON.parse(argv[3])) })); return; }
  const { spawnSync } = await import("node:child_process");
  const items = new Map(loadItems().map((it) => [it.id, it]));
  const file = `${OUT}forced.jsonl`, done = new Set(readJsonl(file).map((x) => x.id));
  for (const o of readJsonl(`${OUT}opus.jsonl`)) {
    if (done.has(o.id) || !o.mark) continue;
    const it = items.get(o.id)!, { j } = jankoOf(it.name), [m, v] = o.mark as MV;
    const r = spawnSync(process.execPath, ["--no-warnings", "--max-old-space-size=3072", new URL(import.meta.url).pathname, "check", "--one", o.id, JSON.stringify(o.mark)], { timeout: 90000, killSignal: "SIGKILL", encoding: "utf8" });
    let verdict = "timeout";
    try { verdict = JSON.parse(r.stdout.trim().split("\n").at(-1)!).verdict; } catch { if (r.status !== null && !r.signal) verdict = "clingo error"; }
    const correct = (j.truth.get(m) ?? false) === v;
    appendFileSync(file, JSON.stringify({ id: o.id, mark: o.mark, verdict, correct }) + "\n");
    console.error(`${o.id}: ${o.mark.join("=")} ${verdict}${correct ? "" : " (not the solution's)"}`);
  }
}

// ======== report ========
const wilson = (k: number, n: number) => {
  if (!n) return [NaN, NaN];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [c - h, c + h];
};
const pct = (k: number, n: number) => { if (!n) return "–"; const [a, b] = wilson(k, n); return `${Math.round((100 * k) / n)}% (${Math.round(100 * a)}–${Math.round(100 * b)})`; };
function report() {
  const items = loadItems();
  const opus = new Map(readJsonl(`${OUT}opus.jsonl`).map((x) => [x.id, x]));
  const net = new Map(readJsonl(`${OUT}net.jsonl`).map((x) => [x.id, x]));
  const forced = new Map(readJsonl(`${OUT}forced.jsonl`).map((x) => [x.id, x]));
  const key = (mv: MV | null) => (mv ? `${mv[0]}=${mv[1]}` : "");
  type Row = { it: Item; o: any; n: any; f: any };
  const rows: Row[] = items.filter((it) => opus.has(it.id)).map((it) => ({ it, o: opus.get(it.id), n: net.get(it.id), f: forced.get(it.id) }));
  const hit = (mv: MV | null, it: Item) => !!mv && it.next.some((x) => key(x) === key(mv));
  const top1 = (mv: MV | null, it: Item) => !!mv && key(it.next[0]) === key(mv);
  const score = (rs: Row[]) => {
    const n = rs.length, withNet = rs.filter((r) => r.n);
    const c = (f: (r: Row) => boolean, xs = rs) => xs.filter(f).length;
    return {
      n, nNet: withNet.length,
      opus3: c((r) => hit(r.o.mark, r.it)), opus1: c((r) => top1(r.o.mark, r.it)),
      net3: c((r) => hit(r.n.top, r.it), withNet), net1: c((r) => top1(r.n.top, r.it), withNet),
      solver3: c((r) => hit(r.it.solverFirst, r.it)), solver1: c((r) => top1(r.it.solverFirst, r.it)),
      solverStep: c((r) => r.it.solverStep.some((x) => hit(x, r.it))),
      random: rs.reduce((a, r) => a + (r.n?.random ?? 0), 0) / Math.max(1, withNet.length),
      forced: c((r) => r.f?.verdict === "forced"), checked: c((r) => !!r.f), valid: c((r) => !!r.o.mark),
    };
  };
  const line = (label: string, rs: Row[]) => {
    const s = score(rs);
    return `| ${label} | ${s.n} | **${pct(s.opus3, s.n)}** | ${pct(s.net3, s.nNet)} | ${pct(s.solver3, s.n)} | ${pct(s.solverStep, s.n)} | ${Number.isFinite(s.random) && s.nNet ? `${Math.round(100 * s.random)}%` : "–"} | ${pct(s.opus1, s.n)} | ${pct(s.net1, s.nNet)} | ${pct(s.solver1, s.n)} | ${pct(s.forced, s.n)} |`;
  };
  const head = "| States | n | Opus: in next 3 | Network: in next 3 | Solver (first fact): in next 3 | Solver (any fact of its step) | Random (network's chance) | Opus: top-1 | Network: top-1 | Solver: top-1 | Opus's move forced |\n|---|---|---|---|---|---|---|---|---|---|---|";
  const groups = <K extends string>(f: (it: Item) => K) => { const m = new Map<K, Row[]>(); for (const r of rows) m.set(f(r.it), [...(m.get(f(r.it)) ?? []), r]); return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)); };
  const out: string[] = [head, line("**all**", rows)];
  for (const [k, rs] of groups((it) => it.kind)) out.push(line(k, rs));
  const DIGITS = new Set(["easy-as-abc", "hidoku", "skyscrapers"]);
  out.push(line("digit types (Easy as ABC, Hidoku, Skyscrapers)", rows.filter((r) => DIGITS.has(r.it.genre))), line("the other 11 types", rows.filter((r) => !DIGITS.has(r.it.genre))));
  // on digit types the network and the solver mostly name eliminations, which are never people's
  // labels: the same rows with their best placement as the guess
  const asPlace = (rs: Row[]) => rs.map((r) => ({ ...r, n: r.n && { ...r.n, top: r.n.place ?? r.n.top }, it: { ...r.it, solverFirst: r.it.solverPlace ?? r.it.solverFirst, solverStep: r.it.solverPlace ? [r.it.solverPlace] : r.it.solverStep } }));
  out.push(line("digit types, network's and solver's best placement", asPlace(rows.filter((r) => DIGITS.has(r.it.genre)))), line("**all, with placements on digit types**", asPlace(rows)));
  out.push("", head);
  for (const [k, rs] of groups((it) => it.genre)) out.push(line(k, rs));
  out.push("", head);
  for (const [k, rs] of groups((it) => it.person).sort((a, b) => b[1].length - a[1].length)) out.push(line(k, rs));
  // paired: where Opus and the network disagree on a hit
  const both = rows.filter((r) => r.n);
  const oOnly = both.filter((r) => hit(r.o.mark, r.it) && !hit(r.n.top, r.it)).length, nOnly = both.filter((r) => !hit(r.o.mark, r.it) && hit(r.n.top, r.it)).length;
  const verdicts = new Map<string, number>(); for (const r of rows) { const v = r.f?.verdict ?? (r.o.mark ? "unchecked" : "no valid move"); verdicts.set(v, (verdicts.get(v) ?? 0) + 1); }
  const dollars = rows.reduce((a, r) => a + r.o.dollars, 0), inTok = rows.reduce((a, r) => a + r.o.usage.input, 0), outTok = rows.reduce((a, r) => a + r.o.usage.output, 0);
  const ms = rows.map((r) => r.o.ms).sort((a, b) => a - b);
  // exact two-sided sign test on the discordant states
  const signP = (a: number, b: number) => { const n = a + b, k = Math.min(a, b); let p = 0, c = 1; for (let i = 0; i <= k; i++) { p += c / 2 ** n; c = (c * (n - i)) / (i + 1); } return Math.min(1, 2 * p); };
  const sOnly = both.filter((r) => hit(r.o.mark, r.it) && !hit(r.it.solverFirst, r.it)).length, svOnly = both.filter((r) => !hit(r.o.mark, r.it) && hit(r.it.solverFirst, r.it)).length;
  out.push("", `Paired: Opus hit and the network missed on ${oOnly} states, the reverse on ${nOnly} (sign test p = ${signP(oOnly, nOnly).toPrecision(2)}); Opus against the solver's first fact ${sOnly} and ${svOnly} (p = ${signP(sOnly, svOnly).toPrecision(2)}).`,
    `Opus's moves: ${[...verdicts].map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Cost: $${dollars.toFixed(2)} over ${rows.length} calls ($${(dollars / Math.max(1, rows.length)).toFixed(3)} a call; ${Math.round(inTok / Math.max(1, rows.length))} tokens in, ${Math.round(outTok / Math.max(1, rows.length))} out on average); median ${(ms[Math.floor(ms.length / 2)] / 1000).toFixed(0)} s a call.`);
  const text = out.join("\n");
  writeFileSync(`${OUT}report.md`, text);
  console.log(text);
}

// ======== the two checks: a network tuned on people's moves, and no negative marks ========
// `checks`: every predictor (Opus, the baseline network, the network fine-tuned on Janko's move
// labels by opus_human_tune.py, our solver) scored twice on the same 400 states:
// - as report() does (in the person's next 3; network and solver fair on the digit types);
// - with negative marks left out ("no line", a cross, an unshaded cell, an empty Easy as ABC cell:
//   any mark set false): the person's next 3 are the first 3 positive label marks they settled still
//   open, and each predictor's guess is its best positive move (the network's highest-scored mark set
//   true, the solver's first open positive fact along its path). Opus gave one move: a negative one
//   counts as a miss, and a second row keeps only the states where Opus named a positive move.
// Reads net-base.jsonl and net-tuned.jsonl (opus_human_tune.py score) beside opus.jsonl.
async function checks() {
  const items = loadItems();
  const opus = new Map(readJsonl(`${OUT}opus.jsonl`).map((x) => [x.id, x]));
  const nets = { base: new Map(readJsonl(`${OUT}net-base.jsonl`).map((x) => [x.id, x])), tuned: new Map(readJsonl(`${OUT}net-tuned.jsonl`).map((x) => [x.id, x])) };
  if (!nets.base.size || !nets.tuned.size) throw new Error("net-base.jsonl and net-tuned.jsonl are needed (opus_human_tune.py score)");
  const recs = new Map<string, any>();
  for (const l of readFileSync(`${repo}references/ml/graphs-human-labels.jsonl`, "utf8").split("\n")) {
    if (!l.includes('"split":"test"')) continue;
    const d = JSON.parse(l); recs.set(d.name, d.humanOrder);
  }
  const key = (mv: MV | null | undefined) => (mv ? `${mv[0]}=${mv[1]}` : "");
  const DIGITS = new Set(["easy-as-abc", "hidoku", "skyscrapers"]);
  type Row = { it: Item; next: MV[]; posNext: MV[]; opus: MV | null; base: any; tuned: any; solverPos: MV | null };
  const rows: Row[] = [];
  const solves = await mapPool(items, async (it) => deduceCached(jankoOf(it.name).j.spec).catch(() => null), 2);
  items.forEach((it, i) => {
    const { j } = jankoOf(it.name), known = new Map(it.known), open = (m: string) => !known.has(m);
    const order = (recs.get(it.name) as [string, number][]).map(([m]) => m).filter((m, k, a) => a.indexOf(m) === k && open(m));
    const posNext = order.filter((m) => j.truth.get(m) === true).slice(0, 3).map((m): MV => [m, true]);
    const steps = (solves[i]?.path ?? []).filter((s: any) => !s.choice);
    const sp = steps.flatMap((s: any) => s.facts).find((f: any) => f.value && open(f.mark));
    rows.push({ it, next: it.next, posNext, opus: opus.get(it.id)?.mark ?? null, base: nets.base.get(it.id), tuned: nets.tuned.get(it.id), solverPos: sp ? [sp.mark, true] : null });
  });
  const hitIn = (mv: MV | null | undefined, set: MV[]) => !!mv && set.some((x) => key(x) === key(mv));
  // the guesses: as report() (fair: the best placement on digit types), and positive only
  const fair = (r: Row) => {
    const d = DIGITS.has(r.it.genre);
    return { opus: r.opus, base: d ? r.base.place ?? r.base.top : r.base.top, tuned: d ? r.tuned.place ?? r.tuned.top : r.tuned.top, solver: d ? r.it.solverPlace ?? r.it.solverFirst : r.it.solverFirst };
  };
  const positive = (r: Row) => ({ opus: r.opus?.[1] ? r.opus : null, base: r.base.pos, tuned: r.tuned.pos, solver: r.solverPos });
  const P = ["opus", "base", "tuned", "solver"] as const;
  const tally = (rs: Row[], guess: (r: Row) => Record<(typeof P)[number], MV | null>, target: (r: Row) => MV[]) => {
    const n = rs.length, hits = Object.fromEntries(P.map((p) => [p, rs.filter((r) => hitIn(guess(r)[p], target(r))).length])) as Record<(typeof P)[number], number>;
    const top1 = Object.fromEntries(P.map((p) => [p, rs.filter((r) => target(r).length && key(target(r)[0]) === key(guess(r)[p])).length])) as Record<(typeof P)[number], number>;
    return { n, hits, top1 };
  };
  const signP = (a: number, b: number) => { const n = a + b, k = Math.min(a, b); let p = 0, c = 1; for (let i = 0; i <= k; i++) { p += c / 2 ** n; c = (c * (n - i)) / (i + 1); } return Math.min(1, 2 * p); };
  const paired = (rs: Row[], guess: (r: Row) => Record<(typeof P)[number], MV | null>, target: (r: Row) => MV[], a: (typeof P)[number], b: (typeof P)[number]) => {
    const x = rs.filter((r) => hitIn(guess(r)[a], target(r)) && !hitIn(guess(r)[b], target(r))).length, y = rs.filter((r) => !hitIn(guess(r)[a], target(r)) && hitIn(guess(r)[b], target(r))).length;
    return `${x} to ${y} (p = ${signP(x, y).toPrecision(2)})`;
  };
  const head = "| States | n | Opus | Network | Network tuned on people | Solver | Opus top-1 | Network top-1 | Tuned top-1 | Solver top-1 |\n|---|---|---|---|---|---|---|---|---|---|";
  const line = (label: string, rs: Row[], guess: (r: Row) => Record<(typeof P)[number], MV | null>, target: (r: Row) => MV[]) => {
    const s = tally(rs, guess, target);
    return `| ${label} | ${s.n} | ${P.map((p) => pct(s.hits[p], s.n)).join(" | ")} | ${P.map((p) => pct(s.top1[p], s.n)).join(" | ")} |`;
  };
  const withPos = rows.filter((r) => r.posNext.length);
  const opusPos = withPos.filter((r) => r.opus?.[1]);
  const groups = (rs: Row[]) => { const m = new Map<string, Row[]>(); for (const r of rs) m.set(r.it.genre, [...(m.get(r.it.genre) ?? []), r]); return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)); };
  const nNegNext = rows.reduce((a, r) => a + r.next.filter((x) => !x[1]).length, 0), nNext = rows.reduce((a, r) => a + r.next.length, 0);
  const negBy = (p: (typeof P)[number]) => rows.filter((r) => { const g = fair(r)[p]; return g && !g[1]; }).length;
  const out: string[] = [
    "## As before (in the person's next 3; network and solver fair on the digit types)", "", head,
    line("**all**", rows, fair, (r) => r.next),
    ...["ordinary", "stuck"].map((k) => line(k, rows.filter((r) => r.it.kind === k), fair, (r) => r.next)),
    line("the 11 non-digit types", rows.filter((r) => !DIGITS.has(r.it.genre)), fair, (r) => r.next),
    line("digit types", rows.filter((r) => DIGITS.has(r.it.genre)), fair, (r) => r.next),
    "", `Paired (exact sign test, states where one hits and the other misses): Opus against the tuned network ${paired(rows, fair, (r) => r.next, "opus", "tuned")}; tuned against the baseline ${paired(rows, fair, (r) => r.next, "tuned", "base")}; tuned against the solver ${paired(rows, fair, (r) => r.next, "tuned", "solver")}.`,
    "", head, ...groups(rows).map(([g, rs]) => line(g, rs, fair, (r) => r.next)),
    "", `Negative marks: ${nNegNext} of the people's ${nNext} next-3 moves; of the guesses, Opus ${negBy("opus")}, the network ${negBy("base")}, the tuned network ${negBy("tuned")}, the solver ${negBy("solver")} of ${rows.length}.`,
    `Correct by the solution (the guess as scored above): ${P.map((p) => `${{ opus: "Opus", base: "the network", tuned: "the tuned network", solver: "the solver" }[p]} ${rows.filter((r) => { const g = fair(r)[p]; return g && jankoOf(r.it.name).j.truth.get(g[0]) === g[1]; }).length}`).join(", ")} of ${rows.length}.`,
    "", "## Negative marks left out (the person's next 3 positive moves; each predictor's best positive move)", "", head,
    line("**all with a positive move to come** (Opus's negatives count as misses)", withPos, positive, (r) => r.posNext),
    line("**only where Opus named a positive move**", opusPos, positive, (r) => r.posNext),
    ...["ordinary", "stuck"].map((k) => line(k, withPos.filter((r) => r.it.kind === k), positive, (r) => r.posNext)),
    line("the 11 non-digit types", withPos.filter((r) => !DIGITS.has(r.it.genre)), positive, (r) => r.posNext),
    line("the 11 non-digit types, only where Opus named a positive move", opusPos.filter((r) => !DIGITS.has(r.it.genre)), positive, (r) => r.posNext),
    "", `Paired: Opus against the tuned network ${paired(withPos, positive, (r) => r.posNext, "opus", "tuned")} (on Opus's positive states ${paired(opusPos, positive, (r) => r.posNext, "opus", "tuned")}); Opus against the solver ${paired(withPos, positive, (r) => r.posNext, "opus", "solver")} (${paired(opusPos, positive, (r) => r.posNext, "opus", "solver")}); tuned against the baseline ${paired(withPos, positive, (r) => r.posNext, "tuned", "base")}.`,
    "", head, ...groups(withPos).map(([g, rs]) => line(g, rs, positive, (r) => r.posNext)),
    "", `States with no positive move to come: ${rows.length - withPos.length}. Opus named a negative move on ${withPos.length - opusPos.length} of the ${withPos.length}.`,
  ];
  const text = out.join("\n");
  writeFileSync(`${OUT}checks.md`, text);
  console.log(text);
}

// ======== open: open-weight models through an OpenAI-compatible API ========
const slug = (m: string) => m.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
async function askOpen() {
  const key = process.env.OPEN_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("no OPEN_API_KEY or OPENROUTER_API_KEY");
  const base = process.env.OPEN_API_BASE ?? "https://openrouter.ai/api/v1", cap = Number(process.env.OPEN_CAP_CALLS) || 3000;
  const models = (argv[1] ?? "").split(",").filter(Boolean);
  const formats = (argv.slice(2).filter((a) => a === "grid" || a === "listed") as ("grid" | "listed")[]);
  if (!models.length) throw new Error("name the models: open <model,…> [grid|listed …]");
  let calls = 0;
  for (const model of models) for (const format of formats.length ? formats : ["grid", "listed"] as const) {
    const file = `${OUT}open-${slug(model)}-${format}.jsonl`, done = new Set(readJsonl(file).map((x) => x.id));
    let todo = shuffled(loadItems(), `${SEED} order`).filter((it) => !done.has(it.id));
    if (argv.includes("--limit")) todo = todo.slice(0, Math.max(0, opt("--limit", 20) - done.size));
    console.error(`${model} ${format}: ${done.size} done, ${todo.length} to ask`);
    await mapPool(todo, async (it) => {
      if (++calls > cap) return;
      const t0 = Date.now();
      try {
        let res: Response | null = null;
        for (let a = 0; a < 5; a++) {
          res = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, max_tokens: 12000, messages: [{ role: "user", content: promptOf(it, format) }] }), signal: AbortSignal.timeout(10 * 60 * 1000) });
          if (res.status !== 429 && res.status < 500) break;
          await new Promise((r) => setTimeout(r, 2000 * 2 ** a));
        }
        const body = await res!.json() as any;
        if (!res!.ok) throw new Error(`${res!.status} ${JSON.stringify(body).slice(0, 160)}`);
        const text = String(body.choices?.[0]?.message?.content ?? ""), parsed = lastJson(text);
        const mark = parsed ? markOf(jankoOf(it.name).j.spec, parsed) : null;
        appendFileSync(file, JSON.stringify({ id: it.id, model, format, usage: body.usage, cost: body.usage?.cost, ms: Date.now() - t0, finish: body.choices?.[0]?.finish_reason, parsed, mark, text, at: new Date().toISOString() }) + "\n");
        console.error(`${model} ${format} ${it.id}: ${mark ? mark.join("=") : "unparsed"}, ${Math.round((Date.now() - t0) / 1000)} s`);
      } catch (e) { console.error(`${model} ${format} ${it.id}: failed (${(e as Error).message.slice(0, 160)})`); }
    }, 8);
  }
}
function openReport() {
  const items = new Map(loadItems().map((it) => [it.id, it]));
  const key = (mv: MV | null) => (mv ? `${mv[0]}=${mv[1]}` : "");
  const DIGITS = new Set(["easy-as-abc", "hidoku", "skyscrapers"]);
  const runs: [string, any[]][] = [["opus (grid)", readJsonl(`${OUT}opus.jsonl`)], ...readdirSync(OUT).filter((f) => f.startsWith("open-") && f.endsWith(".jsonl")).sort().map((f) => [f.slice(5, -6), readJsonl(OUT + f)] as [string, any[]])];
  const out = ["| model and format | n | in next 3: all | ordinary | stuck | digit types | other types | top-1 | correct (the solution's) | valid move | cost |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const [name, rs0] of runs) {
    const rs = rs0.filter((r) => items.has(r.id)).map((r) => ({ r, it: items.get(r.id)! }));
    if (!rs.length) continue;
    const hit = (x: { r: any; it: Item }) => !!x.r.mark && x.it.next.some((n) => key(n) === key(x.r.mark));
    const pc = (xs: typeof rs) => pct(xs.filter(hit).length, xs.length);
    const correct = rs.filter((x) => x.r.mark && (jankoOf(x.it.name).j.truth.get(x.r.mark[0]) ?? false) === x.r.mark[1]).length;
    const cost = rs.reduce((a, x) => a + (x.r.cost ?? x.r.dollars ?? 0), 0);
    out.push(`| ${name} | ${rs.length} | **${pc(rs)}** | ${pc(rs.filter((x) => x.it.kind === "ordinary"))} | ${pc(rs.filter((x) => x.it.kind === "stuck"))} | ${pc(rs.filter((x) => DIGITS.has(x.it.genre)))} | ${pc(rs.filter((x) => !DIGITS.has(x.it.genre)))} | ${pct(rs.filter((x) => !!x.r.mark && key(x.it.next[0]) === key(x.r.mark)).length, rs.length)} | ${pct(correct, rs.length)} | ${pct(rs.filter((x) => !!x.r.mark).length, rs.length)} | $${cost.toFixed(2)} |`);
  }
  const text = out.join("\n");
  writeFileSync(`${OUT}open-report.md`, text);
  console.log(text);
}

if (cmd === "sample") await sample();
else if (cmd === "open") await askOpen();
else if (cmd === "openreport") openReport();
else if (cmd === "checks") await checks();
else if (cmd === "ask") await ask();
else if (cmd === "check") await check();
else if (cmd === "show") console.log(promptOf(loadItems().find((it) => it.id === argv[1]) ?? loadItems()[0], argv[2] === "listed" ? "listed" : "grid"));
else report();
