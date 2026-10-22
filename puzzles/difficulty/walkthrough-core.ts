// The refinement loop's pure parts (docs/research-walkthrough-loop.md): the walkthrough format
// (insights, not moves), reading Opus's reply, what the solver's check found (the audit), the
// feedback each paradigm gives, the human-order measures, and the insight library with its
// description length. walkthrough-loop.ts runs the solver and Opus around them; the unit tests are
// walkthrough-core.test.ts.
import { gzipSync } from "node:zlib";

export type MV = [string, boolean];
/** A: errors only (the teacher). B: errors plus the valid steps nearest to what Opus tried. C: errors
 *  plus the whole menu at every insight (the drift control). */
export type Paradigm = "A" | "B" | "C";

/** A move as Opus writes it (opus-human.ts's moveForm: "r3c4" and "bulb", "r3c4 top" and "line", …). */
export interface RawMove { at: string; value: string }

/** One insight: a piece of reasoning that unlocks part of the grid. Its `concludes` are the marks it
 *  decides directly; everything that follows from them by easy steps is left to the reader. */
export interface Insight {
  /** the logic, said so it would teach (not "r3c4 is a bulb" but why it must be) */
  idea: string;
  /** the clues and lines it uses: "r2c4", "row 3", "column 5" */
  clues: string[];
  concludes: RawMove[];
  /** a short name a solver would recognise */
  technique: string;
  /** a coach's nudge before it, without the answer */
  hint: string;
  /** the library entry it instantiates (library arms only), or a new entry it proposes */
  uses?: string;
  new_entry?: { name: string; template: string; when: string; concludes: string };
}
export interface Walk { insights: Insight[]; key_ideas?: string; difficulty?: number; elegance?: number; elegance_why?: string }

/** The reply's JSON: the last object holding "insights" (a fence or a sentence around it is fine). */
export function parseWalk(text: string): Walk | null {
  const t = text.replace(/```(?:json)?/g, "");
  const s = t.indexOf("{");
  for (let end = t.lastIndexOf("}"); end > s && s >= 0; end = t.lastIndexOf("}", end - 1)) {
    try {
      const x = JSON.parse(t.slice(s, end + 1));
      if (x && Array.isArray(x.insights)) return normalise(x);
    } catch { /* shorter */ }
  }
  return null;
}
function normalise(x: any): Walk {
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const insights = (x.insights as any[]).filter((i) => i && typeof i === "object").map((i): Insight => ({
    idea: str(i.idea), technique: str(i.technique), hint: str(i.hint),
    clues: Array.isArray(i.clues) ? i.clues.map(str) : [],
    concludes: Array.isArray(i.concludes) ? i.concludes.filter((m: any) => m && typeof m === "object").map((m: any) => ({ at: str(m.at), value: str(m.value) })) : [],
    ...(i.uses ? { uses: str(i.uses) } : {}),
    ...(i.new_entry && typeof i.new_entry === "object" ? { new_entry: { name: str(i.new_entry.name), template: str(i.new_entry.template), when: str(i.new_entry.when), concludes: str(i.new_entry.concludes) } } : {}),
  }));
  return { ...x, insights };
}

// ---------- cells ----------
/** The cells a list of references names, on a rows × cols grid (cell = r·cols + c): "r2c4",
 *  "r2c4-r2c5", "r3c4 top", "row 3", "column 5" / "col 5", "rows 2-3". Unreadable ones are skipped. */
export function cellsOfRefs(refs: string[], rows: number, cols: number): number[] {
  const out = new Set<number>();
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;
  for (const ref of refs) {
    const s = ref.toLowerCase();
    let any = false;
    for (const q of s.matchAll(/r(\d+)\s*c(\d+)/g)) { const [r, c] = [+q[1] - 1, +q[2] - 1]; if (inside(r, c)) { out.add(r * cols + c); any = true; } }
    if (any) continue;
    const line = /\b(rows?|columns?|cols?)\s+(\d+)(?:\s*(?:-|–|to|and)\s*(\d+))?/.exec(s);
    if (!line) continue;
    const a = +line[2] - 1, b = line[3] ? +line[3] - 1 : a;
    for (let k = Math.min(a, b); k <= Math.max(a, b); k++) {
      if (line[1].startsWith("row")) { if (k >= 0 && k < rows) for (let c = 0; c < cols; c++) out.add(k * cols + c); }
      else if (k >= 0 && k < cols) for (let r = 0; r < rows; r++) out.add(r * cols + k);
    }
  }
  return [...out].sort((x, y) => x - y);
}
/** How far apart two sets of cells are: the smallest king's-move distance between them (0 if they
 *  share a cell; Infinity if either is empty). */
export function gap(a: number[], b: number[], cols: number): number {
  let best = Infinity;
  for (const x of a) for (const y of b) {
    const d = Math.max(Math.abs(Math.floor(x / cols) - Math.floor(y / cols)), Math.abs((x % cols) - (y % cols)));
    if (d < best) best = d;
  }
  return best;
}

// ---------- the solver's side ----------
/** A step on the solver's menu at some state: what it decides, where, its cost, its smallest reason
 *  (the rule instances, and their cells) and its kind (the rules it holds, deduce.ts's `uses`). */
export interface MenuStep { facts: { mark: string; value: boolean; text: string }[]; cells: number[]; cost: number; where: string; clues: string[]; clueCells: number[]; kind: string; tier: number }

/** The k steps nearest to some cells (cheaper first among equals). */
export function nearest(menu: MenuStep[], cells: number[], cols: number, k = 3): MenuStep[] {
  if (!cells.length) return [...menu].sort((a, b) => a.cost - b.cost).slice(0, k);
  const c = (s: MenuStep) => (Number.isFinite(s.cost) ? s.cost : Infinity);
  return menu.map((s) => ({ s, d: gap(s.cells, cells, cols) })).sort((a, b) => a.d - b.d || c(a.s) - c(b.s)).slice(0, k).map((x) => x.s);
}
/** Do the cited cells match the solver's smallest reason? recall: the reason's cells cited;
 *  precision: cited cells inside the reason. One minimal reason of possibly several, so a soft
 *  measure, reported but never an error. */
export function citation(cited: number[], reason: number[]): { recall: number; precision: number } | null {
  if (!cited.length || !reason.length) return null;
  const c = new Set(cited), r = new Set(reason);
  return { recall: [...r].filter((x) => c.has(x)).length / r.size, precision: [...c].filter((x) => r.has(x)).length / c.size };
}

/** What the check found for one insight, in order (each judged where the reader has got to: the
 *  state, everything earlier insights decided, and every easy step after them). */
export interface InsightCheck {
  k: number;
  unreadable: RawMove[];
  /** contradicts the solution (which clingo proves is the only one) */
  wrong: { at: string; value: string }[];
  /** known already, or reached by the reader's easy steps before this insight */
  already: string[];
  /** follows here by one solver step: the cheapest such step's cost and reason */
  forced: { text: string; cost: number; clues: string[]; kind: string }[];
  /** true, and no single step decides it here, but assuming it the other way contradicts the rules
   *  by propagation alone (a short case split: human trial, allowed) */
  split: string[];
  /** true, but neither a step nor a short case split decides it here: a leap over something unsaid */
  notYet: string[];
  /** whether any single step was open at this point (a case split while simpler steps were open is
   *  noted, not counted as an error) */
  simpler: boolean;
  /** every readable mark it concludes was already reached: below the reader's level, not an insight */
  trivial: boolean;
  /** its cited cells against the cheapest forcing step's reason (mean over forced marks) */
  citation: { recall: number; precision: number } | null;
  /** marks the reader settled by easy steps between the previous insight and this one */
  readerMarks: number;
  /** the menu where this insight is applied, and the insight's cells (for B's and C's feedback) */
  menu?: MenuStep[];
  cells?: number[];
}
export interface Audit {
  checks: InsightCheck[];
  /** where the reader stops after the last insight, or null when it finishes the grid */
  stall: { open: number; total: number; grid: string; menu?: MenuStep[] } | null;
  /** the whole predicted order: the reader's easy marks, each insight's marks, …, the reader's tail */
  order: MV[];
  ceiling: number;
}
export const sound = (a: Audit) => a.checks.every((c) => !c.wrong.length && !c.unreadable.length);
export const sufficient = (a: Audit) => a.stall === null;
export const minimal = (a: Audit) => a.checks.every((c) => !c.trivial);
export const grounded = (a: Audit) => a.checks.every((c) => !c.notYet.length);
/** the share of an audit's concluded marks that need a case split where they stand */
export const splitShare = (a: Audit) => { const n = a.checks.reduce((s, c) => s + c.forced.length + c.split.length + c.notYet.length, 0); return n ? a.checks.reduce((s, c) => s + c.split.length, 0) / n : 0; };
/** Nothing left to fix: sound, sufficient, minimal, and every insight follows where it stands. */
export const clean = (a: Audit) => sound(a) && sufficient(a) && minimal(a) && grounded(a);

/** The feedback a paradigm gives on an audit. A says only what's wrong; B adds, at each problem,
 *  the valid steps nearest to it; C adds the whole menu at every insight and at the stall. */
export function feedback(a: Audit, paradigm: Paradigm, cols: number, menuCap = 15): string {
  const out: string[] = [];
  const stepLine = (s: MenuStep) => s.kind === "case split"
    ? `  - ${s.facts.map((f) => f.text).join(", ")}: assuming the opposite leads to a contradiction (a short case split)`
    : `  - ${s.facts.map((f) => f.text).join(", ")}: from ${s.clues.join(", ") || s.where} (${s.kind || "rules"}; cost ${s.cost.toFixed(1)})`;
  for (const c of a.checks) {
    const n = c.k + 1, notes: string[] = [];
    if (c.unreadable.length) notes.push(`I can't read ${c.unreadable.map((m) => `"${m.at} ${m.value}"`).join(", ")} as a cell and value.`);
    if (c.wrong.length) notes.push(`${c.wrong.map((m) => `${m.at} ${m.value}`).join(", ")} ${c.wrong.length > 1 ? "are" : "is"} not right: it breaks the rules somewhere.`);
    if (c.notYet.length) notes.push(`${c.notYet.join(", ")} ${c.notYet.length > 1 ? "are" : "is"} true, but doesn't follow yet from what is decided at this point: some reasoning is missing before it.`);
    if (c.split.length && c.simpler) notes.push(`${c.split.join(", ")} only follow${c.split.length > 1 ? "" : "s"} here by trying the other way and reaching a contradiction, while simpler deductions were open: if that is the reasoning, say what the contradiction is; otherwise look for the simpler route.`);
    if (c.trivial) notes.push("everything it concludes, a reader finds alone with easy steps before this point: it isn't an insight, leave it to the reader.");
    else if (c.already.length) notes.push(`${c.already.join(", ")} ${c.already.length > 1 ? "were" : "was"} already decided by easy steps before it.`);
    const trouble = c.wrong.length > 0 || c.notYet.length > 0;
    if (notes.length) out.push(`Insight ${n}: ${notes.join(" ")}`);
    if (paradigm === "B" && trouble && c.menu?.length) {
      out.push(`  Near it, these do follow at that point:`, ...nearest(c.menu, c.cells ?? [], cols).map(stepLine));
    }
    if (paradigm === "C" && c.menu?.length) {
      if (!notes.length) out.push(`Insight ${n}: fine.`);
      out.push(`  Everything that follows by one step at that point, cheapest first:`, ...[...c.menu].sort((x, y) => x.cost - y.cost).slice(0, menuCap).map(stepLine));
    }
  }
  if (a.stall) {
    out.push(`After the last insight, a reader taking only easy steps gets stuck with ${a.stall.open} of ${a.stall.total} marks still open:`, "", a.stall.grid, "", "An insight is missing there (or earlier).");
    const lastCells = [...a.checks].reverse().find((c) => c.cells?.length)?.cells ?? [];
    if (paradigm === "B" && a.stall.menu?.length) out.push("Near your last insight, these do follow there:", ...nearest(a.stall.menu, lastCells, cols).map(stepLine));
    if (paradigm === "C" && a.stall.menu?.length) out.push("Everything that follows by one step there, cheapest first:", ...[...a.stall.menu].sort((x, y) => x.cost - y.cost).slice(0, menuCap).map(stepLine));
  }
  if (!out.length) return "The check found nothing wrong: every insight is right, follows where it stands, is more than an easy step, and with the easy steps it finishes the grid.";
  return out.join("\n");
}

/** Has a revision changed anything the check sees? (Same insights, same marks concluded in order.) */
export function sameWalk(a: Walk, b: Walk): boolean {
  const sig = (w: Walk) => JSON.stringify(w.insights.map((i) => i.concludes.map((m) => `${m.at.toLowerCase().replace(/\s+/g, "")}=${m.value.toLowerCase().trim()}`).sort()));
  return sig(a) === sig(b);
}

// ---------- human order ----------
const key = (mv: MV | null | undefined) => (mv ? `${mv[0]}=${mv[1]}` : "");
/** Is the first predicted move still open among the person's next 3? */
export function firstIn3(human: MV[], order: MV[], known: Set<string>): boolean {
  const first = order.find(([m]) => !known.has(m));
  return !!first && human.filter(([m]) => !known.has(m)).slice(0, 3).map(key).includes(key(first));
}
/** opus-walkthrough.ts's "along the way": each of the first `upto` predicted moves counts if it is
 *  among the person's next 3 from where the prediction has got to (a wrong move is a miss and isn't
 *  applied). `peopleKinds` skips moves on marks the person never settles. */
export function along(human: MV[], order: MV[], known0: Set<string>, value: (m: string) => boolean, upto = 20, peopleKinds = false) {
  const hset = new Set(human.map(([m]) => m)), known = new Set(known0);
  let hits = 0, n = 0;
  for (const mv of order) {
    if (n >= upto) break;
    if (known.has(mv[0])) continue;
    if (peopleKinds && !hset.has(mv[0])) { if (value(mv[0]) === mv[1]) known.add(mv[0]); continue; }
    n++;
    if (human.filter(([m]) => !known.has(m)).slice(0, 3).map(key).includes(key(mv))) hits++;
    if (value(mv[0]) === mv[1]) known.add(mv[0]);
  }
  return { hits, n };
}
/** Spearman between predicted and human positions, over marks both settle (NaN under 4). */
export function spearman(human: MV[], order: MV[]): number {
  const pos = new Map(human.map((mv, i) => [key(mv), i]));
  const both = [...new Set(order.map(key))].filter((k) => pos.has(k)), n = both.length;
  if (n < 4) return NaN;
  const rank = (xs: number[]) => { const o = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(xs.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const b = rank(both.map((k) => pos.get(k)!));
  return 1 - (6 * b.reduce((s, x, i) => s + (i - x) ** 2, 0)) / (n * (n * n - 1));
}

// ---------- the insight library ----------
export interface Entry {
  id: string; genre: string; name: string;
  /** the sentence, with slots in braces: "a {n} in a corner forces both of its outer edges" */
  template: string;
  when: string; concludes: string;
  /** where it was used: item and insight, with the insight's own text */
  examples: { item: string; k: number; idea: string }[];
  born: number;
}
/** `free`: insights written without an entry (they count in the description length too). */
export interface Library { entries: Entry[]; free: (Entry["examples"][number] & { genre: string })[]; next: number; puzzles: number; log: string[] }
export const emptyLibrary = (): Library => ({ entries: [], free: [], next: 1, puzzles: 0, log: [] });

/** A seed entry (walkthrough-seed.json): a genre-free pattern from existing reasoning language. */
export interface SeedEntry { name: string; template: string; when: string; concludes: string; primitives?: string[]; source?: string }
/** A library holding the seed's entries for one genre (ids S1, S2, …: kept apart from Opus's L ids;
 *  their text counts in the description length like any entry's). */
export function seedLibrary(genre: string, seed: SeedEntry[]): Library {
  const lib = emptyLibrary();
  lib.entries = seed.map((e, i) => ({ id: `S${i + 1}`, genre, name: e.name, template: e.template, when: e.when, concludes: e.concludes, examples: [], born: -1 }));
  lib.log.push(`seeded with ${seed.length} entries`);
  return lib;
}

/** The library as the prompt shows it: the genre's entries, most used first, at most `cap`. */
export function libraryBlock(lib: Library, genre: string, cap = 40): string {
  const es = lib.entries.filter((e) => e.genre === genre).sort((a, b) => b.examples.length - a.examples.length || a.born - b.born).slice(0, cap);
  if (!es.length) return "";
  return es.map((e) => `- ${e.id} "${e.name}": ${e.template} (when: ${e.when}; concludes: ${e.concludes}; used ${e.examples.length}×${e.examples[0] ? `, e.g. "${e.examples[0].idea}"` : ""})`).join("\n");
}

/** Take in a finished walkthrough: each insight that names an entry adds an example to it; each new
 *  entry is added (named by the next id) and the insight counted as its first example. Unknown ids
 *  are logged and the insight counted as free. Returns the new library (the old one isn't changed). */
export function absorb(lib0: Library, walk: Walk, item: string, genre: string): Library {
  const lib: Library = structuredClone(lib0);
  walk.insights.forEach((ins, k) => {
    const hit = ins.uses ? lib.entries.find((e) => e.id === ins.uses && e.genre === genre) : undefined;
    if (hit) { hit.examples.push({ item, k, idea: ins.idea }); return; }
    if (ins.uses && !ins.new_entry) lib.log.push(`${item} insight ${k + 1}: unknown entry ${ins.uses}`);
    if (ins.new_entry?.template) {
      lib.entries.push({ id: `L${lib.next++}`, genre, ...ins.new_entry, examples: [{ item, k, idea: ins.idea }], born: lib.puzzles });
    } else lib.free.push({ genre, item, k, idea: ins.idea });
  });
  lib.puzzles++;
  return lib;
}

/** A refactor, as Opus proposes it: merge entries into one (a generalisation is a merge with a
 *  slot), split one (each example goes to the part that lists it, the rest to the first part),
 *  rename or reword one, drop one (its examples become library-free). */
export type RefactorOp =
  | { op: "merge"; ids: string[]; into: { name: string; template: string; when: string; concludes: string } }
  | { op: "split"; id: string; into: { name: string; template: string; when: string; concludes: string; examples: string[] }[] }
  | { op: "reword"; id: string; name?: string; template?: string; when?: string; concludes?: string }
  | { op: "drop"; id: string };

export function applyRefactor(lib0: Library, genre: string, ops: RefactorOp[]): { lib: Library; skipped: string[] } {
  const lib: Library = structuredClone(lib0), skipped: string[] = [];
  const find = (id: string) => lib.entries.find((e) => e.id === id && e.genre === genre);
  for (const o of ops) {
    if (o.op === "merge") {
      const es = o.ids.map(find);
      if (es.some((e) => !e) || es.length < 2) { skipped.push(`merge ${o.ids.join("+")}`); continue; }
      lib.entries = lib.entries.filter((e) => !es.includes(e));
      lib.entries.push({ id: `L${lib.next++}`, genre, ...o.into, examples: es.flatMap((e) => e!.examples), born: lib.puzzles });
    } else if (o.op === "split") {
      const e = find(o.id);
      if (!e || o.into.length < 2) { skipped.push(`split ${o.id}`); continue; }
      const parts = o.into.map((p) => ({ id: `L${lib.next++}`, genre, name: p.name, template: p.template, when: p.when, concludes: p.concludes, examples: [] as Entry["examples"], born: lib.puzzles, claims: new Set(p.examples) }));
      for (const x of e.examples) (parts.find((p) => p.claims.has(`${x.item}#${x.k + 1}`)) ?? parts[0]).examples.push(x);
      lib.entries = [...lib.entries.filter((y) => y !== e), ...parts.map(({ claims: _c, ...p }) => p)];
    } else if (o.op === "reword") {
      const e = find(o.id);
      if (!e) { skipped.push(`reword ${o.id}`); continue; }
      for (const f of ["name", "template", "when", "concludes"] as const) if (o[f]) e[f] = o[f]!;
    } else if (o.op === "drop") {
      const e = find(o.id);
      if (!e) { skipped.push(`drop ${o.id}`); continue; }
      lib.free.push(...e.examples.map((x) => ({ genre, ...x })));
      lib.entries = lib.entries.filter((y) => y !== e);
    }
  }
  lib.log.push(`refactor at ${lib.puzzles}: ${ops.length - skipped.length} of ${ops.length} applied`);
  return { lib, skipped };
}

/** Bits to write a text: its gzip size (header taken off), a stand-in for a code length. */
const GZ_HEADER = gzipSync("").length;
export const bits = (s: string) => (s ? 8 * Math.max(0, gzipSync(s).length - GZ_HEADER) : 0);
/** Bits to write `s` once `given` is known: the compressed growth from adding it. */
export const bitsGiven = (s: string, given: string) => Math.max(0, bits(`${given}\n${s}`) - bits(given));

/** The two-part description length of a genre's insights: the library (each entry's text), plus
 *  each insight written with it (which entry, log2 of the choices, then its own text given the
 *  entry's template) or without one (its text alone, and the "no entry" choice). The refactor
 *  score: lower is better. */
export function descriptionLength(lib: Library, genre: string): { library: number; insights: number; total: number } {
  const es = lib.entries.filter((e) => e.genre === genre), choose = Math.log2(es.length + 1);
  const library = es.reduce((s, e) => s + bits([e.name, e.template, e.when, e.concludes].join("\n")), 0);
  let insights = lib.free.filter((x) => x.genre === genre).reduce((s, x) => s + choose + bits(x.idea), 0);
  for (const e of es) for (const x of e.examples) insights += choose + bitsGiven(x.idea, e.template);
  return { library, insights, total: library + insights };
}
