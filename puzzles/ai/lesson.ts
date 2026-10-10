// Slate's lessons (docs/research-tutorials.md §4.3, revised by docs/tutorial-sequences.md §6): the
// checks that prove each post does its day's job, the lesson scorer that wraps the deduction scorer
// with them, the contrasts derived from the day before's board, and the check that a title or
// description never states the rule.
//
// The checks, by step (app/app/ai/personas.ts LessonStep):
//   every day        one solution (a panel: at least one); the rule load stays at the subject's
//                    own (Friday's combination: plus its company's); the subject's symbols are on
//                    the board and needed (taken away, the answer or the number of answers
//                    changes), and some step of the deduction path uses them; the week's reading
//                    holds (`READINGS`: squares that make one cut, then a pocket)
//   Tuesday          Monday's board with one thing changed (a panel's start or end where one
//                    works), and a different answer
//   Wednesday        Tuesday's board with one of the subject's symbols moved or changed, and a
//                    different answer again
//   Thursday (trap)  every rival reading breaks (./rivals.ts), and one of them gives a neat wrong
//                    answer: exactly one answer, not the true one; a panel's obvious lines (the
//                    shortest, the ones hugging the edge) aren't the answer
//   Friday           combine: both subjects needed and used; review: an earlier subject, its first
//                    rival broken (so is every day of a review week)
// The smallest board comes from makeLesson, which tries the step's sizes in order.
import type { Board, Given, GridSpec } from "../../src/engine/types.ts";
import { genres as GENRES, makePuzzle, type Genre } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import { regionsOf } from "../../src/engine/derive.ts";
import { guides } from "../../src/guides/guides.ts";
import type { GenerateOptions } from "../grid/generate.ts";
import type { LessonStep, Persona, Subject } from "../../app/app/ai/personas.ts";
import { lessonFor, lessonSettings, lessonSizes, type Lesson, type Slot } from "../../app/app/ai/schedule.ts";
import { deductionPaths, deductionScorer } from "../difficulty/scorer.ts";
import { ruleLoad, type Score, type Scorer } from "./score.ts";
import { answers, boardKey, breaks, rivalKind, rivalProgram, RIVALS, type Rival, type RivalVerdict } from "./rivals.ts";

const STRUCTURE = new Set(["block", "wall", "gap", "start", "end", "door", "bank", "lengths"]);
const isHollow = (g: Given) => g.kind === "shape" && "negative" in g && !!g.negative;
const genreRules = (genre: string) => ((GENRES as Record<string, Genre>)[genre]?.rules ?? []).map((r) => r.rule);
const MIX_KIND: Record<string, string> = { squares: "square", dots: "hexagon", stars: "star", starsquare: "star", triangles: "triangle", shapes: "shape", solid: "shape", tilted: "shape", hollow: "hollow", erasers: "eraser", symmetry: "symmetry", rotation: "symmetry" };
const PANES_KINDS = ["twins", "opposites", "compass"];

/** The kind of symbol or mark a subject is about: a panel mix's first part, a Panes rule. */
export function kindOf(subject: Subject): string | null {
  if (subject.genre === "panel") return MIX_KIND[(subject.mix ?? "").split("+")[0]] ?? null;
  if (subject.genre === "panes") return (subject.rules ?? "").split(",").find((r) => PANES_KINDS.includes(r)) ?? null;
  if (subject.genre === "thermo-sudoku") return "thermo";
  return null;
}
export const rivalsOf = (subject: Subject): Rival[] => RIVALS[subject.rivals ?? subject.id] ?? [];

/** The givens a subject is about (what the contrasts change): its symbol or mark; for a whole
 *  type, its clues. */
export function subjectGiven(subject: Subject): (g: Given) => boolean {
  const k = kindOf(subject);
  if (k === "hollow") return isHollow;
  if (k === "symmetry") return (g) => g.kind === "hexagon";
  if (k) return (g) => g.kind === k;
  return (g) => !STRUCTURE.has(g.kind) && g.at !== "aside";
}

/** The givens a contrast may change: the subject's own; for a whole type, any clue or rock. */
export function editable(subject: Subject): (g: Given) => boolean {
  return kindOf(subject) ? subjectGiven(subject) : (g) => g.at !== "aside" && !["start", "end", "door", "bank", "lengths"].includes(g.kind);
}

/** The puzzle without the subject's rule, as a rival reading ("taken away"): its symbols or marks
 *  removed, or for a variant the type's plain rule; for a whole type, every clue removed. */
export function withoutSubject(subject: Subject): Rival {
  const strip = (keep: (g: Given) => boolean) => (s: GridSpec): GridSpec => ({ ...s, givens: (s.givens ?? []).filter(keep) });
  const k = kindOf(subject);
  if (subject.id === "panel:tilted") return RIVALS["panel:tilted"][0];   // without turning
  if (k === "hollow") return { id: "without", reading: "without hollow shapes", spec: strip((g) => !isHollow(g)) };
  if (k === "symmetry") return { id: "without", reading: "one line", spec: (s) => ({ ...s, rules: (s.rules ?? []).map((r) => (r.rule === "panel-line" ? { rule: "panel-line" } : r)) }) };
  if (k && subject.genre === "panes") return { id: "without", reading: `without ${k}`, spec: (s) => ({ ...strip((g) => g.kind !== k)(s), rules: (s.rules ?? []).filter((r) => r.rule !== k) }) };
  if (k) return { id: "without", reading: `without ${subject.name.toLowerCase()}`, spec: strip((g) => g.kind !== k) };
  if (subject.id === "irregular-sudoku") return RIVALS["irregular-sudoku"][0];
  if (subject.id.includes(":")) return rivalsOf(subject)[0];
  return { id: "without", reading: "without its clues", spec: (s) => ({ ...strip((g) => STRUCTURE.has(g.kind) || g.at === "aside")(s), picture: undefined }) };
}

/** What the deduction path's steps say when they use the subject (deduce.ts Step.uses). */
export function usesOf(subject: Subject): string[] {
  const k = kindOf(subject);
  if (k === "symmetry") return ["panel-line"];
  if (k === "hollow") return ["clue:shape"];
  if (k && subject.genre === "panel") return [`clue:${k}`];
  if (k) return [k, `clue:${k}`];
  if (subject.id === "irregular-sudoku") return ["boxes"];
  if (subject.id === "hidoku:sides") return ["number-path"];
  if (subject.id === "fillomino:sizes") return ["allowed-sizes"];
  if (subject.id === "akari:cipher") return ["adjacent-count"];
  return genreRules(subject.genre);
}

// ---- the week's reading ----

const regionCells = (spec: GridSpec, answer: Board) => regionsOf(makePuzzle(spec), answer);
const cellsOf = (spec: GridSpec, kind: (g: Given) => boolean) => { const g = makePuzzle(spec).grid; return (spec.givens ?? []).filter((x) => x.at === "cell" && kind(x)).map((x) => g.cell(...(x as { cell: [number, number] }).cell)); };
/** How many of a kind each region holds (by region). */
const perRegion = (spec: GridSpec, answer: Board, kind: (g: Given) => boolean) => { const reg = regionCells(spec, answer), n = new Map<number, number>(); for (const i of cellsOf(spec, kind)) n.set(reg.of[i], (n.get(reg.of[i]) ?? 0) + 1); return [...n.values()]; };

/** Each reading's test on a post and its answer: null when it holds, else why not. Readings of
 *  one symbol differ by what the answer looks like (one cut or a pocket, one pair or two). */
export const READINGS: Record<string, (spec: GridSpec, answer: Board) => string | null> = {
  "panel:squares": (s, b) => (regionCells(s, b).cells.length === 2 ? null : "not one cut"),
  "panel:pockets": (s, b) => (regionCells(s, b).cells.length >= 3 ? null : "no pocket"),
  "panel:detours": (s, b) => (obviousPanelLine(s, b) ? "the short way works" : null),
  "panel:stars": (s, b) => (perRegion(s, b, (g) => g.kind === "star").every((n) => n <= 2) ? null : "more than one pair in a region"),
  "panel:star-pairs": (s, b) => (perRegion(s, b, (g) => g.kind === "star").some((n) => n >= 4) ? null : "no region with two pairs"),
  "panel:shapes": (s, b) => (perRegion(s, b, (g) => g.kind === "shape").every((n) => n === 1) ? null : "a region with more than one piece"),
  "panel:two-shapes": (s, b) => (perRegion(s, b, (g) => g.kind === "shape").some((n) => n >= 2) ? null : "no region with two pieces"),
  "panel:tilted": (s) => ((s.givens ?? []).some((g) => g.kind === "shape" && "rotate" in g && g.rotate) ? null : "no tilted piece"),
  "panel:triangle-edges": (s, b) => {
    const p = makePuzzle(s), g = p.grid;
    return cellsOf(s, (x) => x.kind === "triangle").some((i) => g.cellBorders[i].some((e) => g.borders[e].link < 0 && b.fence[e] === 1)) ? null : "no triangle counting the edge";
  },
};

// ---- panels: the obvious lines ----

/** A panel's obvious lines are its answer: the line is as short as any from a start to an end,
 *  or it runs only along the outside edge. */
export function obviousPanelLine(spec: GridSpec, answer: Board): string | null {
  const p = makePuzzle(spec), g = p.grid;
  const used = g.borders.filter((e) => answer.fence[e.id] === 1);
  if (used.every((e) => e.link < 0)) return "it hugs the edge";
  const starts = [...p.cornerGivens].filter(([, gs]) => gs.some((x) => x.kind === "start")).map(([v]) => v);
  const ends = new Set([...p.cornerGivens].filter(([, gs]) => gs.some((x) => x.kind === "end")).map(([v]) => v));
  if (starts.length !== 1) return null;   // a mirror panel: its rivals do this job
  const dist = new Map([[starts[0], 0]]), queue = [starts[0]];
  while (queue.length) {
    const v = queue.shift()!;
    for (const e of g.cornerBorders[v]) {
      if (p.gaps.has(e)) continue;
      const w = g.borders[e].corners[0] === v ? g.borders[e].corners[1] : g.borders[e].corners[0];
      if (!dist.has(w)) { dist.set(w, dist.get(v)! + 1); queue.push(w); }
    }
  }
  const shortest = Math.min(...[...ends].map((v) => dist.get(v) ?? Infinity));
  return used.length <= shortest ? "it's as short as a line can be" : null;
}

// ---- the checks ----

export interface LessonCheck { ok: boolean; notes: string[]; rivals: RivalVerdict[] }
export type LessonAt = Pick<Lesson, "focus" | "step"> & { subject?: Subject };

/** Whether a puzzle does its step's job (see the top of this file). `company`: Friday's earlier
 *  subject; `previous`: the day before's puzzle, for the contrasts. The deduction path is read
 *  separately (`usesSubject`). */
export async function checkLesson(spec: GridSpec, lesson: LessonAt, opts: { company?: Subject; previous?: GridSpec; loose?: boolean; fresh?: boolean } = {}): Promise<LessonCheck> {
  const { focus, step } = lesson, notes: string[] = [], verdicts: RivalVerdict[] = [];
  const fail = (why: string): LessonCheck => ({ ok: false, notes: [...notes, `rejected: ${why}`], rivals: verdicts });
  const panel = spec.genre === "panel";
  let truth: Board[];
  try { truth = await solve(makePuzzle(spec), 2); } catch (e) { return fail(`doesn't solve (${(e as Error).message.slice(0, 80)})`); }
  if (panel ? truth.length < 1 : truth.length !== 1) return fail(`${truth.length} solutions`);
  if (truth.length > 1) notes.push("more than one line solves it");

  // one idea (two on Friday's combination)
  const load = ruleLoad(spec).load, cap = (focus.load ?? 1) + (step === "combine" ? opts.company?.load ?? 1 : 0) + 0.31;
  if (load > cap) return fail(`rule load ${load.toFixed(2)} over ${cap.toFixed(2)}`);
  if (kindOf(focus) && !(spec.givens ?? []).some(subjectGiven(focus)) && kindOf(focus) !== "symmetry") return fail(`no ${focus.name.toLowerCase()} on the board`);
  // the week's reading holds Monday to Wednesday; Thursday's trap may show the rule any way
  const reading = step === "introduce" || step === "contrast" || step === "second-contrast" ? READINGS[focus.id]?.(spec, truth[0]) : null;
  if (reading) return fail(`not this week's reading: ${reading}`);

  // the subject is needed (and on Friday, its company too)
  for (const s of [focus, ...(step === "combine" && opts.company ? [opts.company] : [])]) {
    const v = await breaks(spec, truth, withoutSubject(s));
    if (v.applies && !v.broken) return fail(`${s.name} not needed (${v.why} without it)`);
  }

  // the contrasts: one change from the day before, a different answer
  if (step === "contrast" || step === "second-contrast") {
    if (!opts.previous) return fail("no earlier board to change");
  }
  if ((step === "contrast" || step === "second-contrast") && opts.fresh) {
    if (!sameFrame({ ...opts.previous!, givens: [] }, { ...spec, givens: [] }) && JSON.stringify(opts.previous!.size) !== JSON.stringify(spec.size)) return fail("not the day before's size");
    const before = await solve(makePuzzle(opts.previous!), 2);
    if (before.some((b) => truth.some((t) => boardKey(t) === boardKey(b)))) return fail("the same answer as the day before's");
    notes.push("a fresh board the day before's size: no change to it gave a different answer");
  } else if (step === "contrast" || step === "second-contrast") {
    if (!opts.previous) return fail("no earlier board to change");
    // one change; a panel's start and end moved together count as one (The Witness's Tree Row 1 and 2)
    // (and two of its symbols trading places count as one move: Tree Row 3 and 4)
    // (an eased board's written-in digits that no longer fit may be rubbed out too: rubbedOut)
    const apart = givensApart(opts.previous, spec), ends = changedGivens(opts.previous, spec).every((g) => g.kind === "start" || g.kind === "end");
    const rubbed = focus.ease ? rubbedOut(opts.previous, spec) : null;
    if (!(apart === 1 || (apart === 2 && (ends || swapped(opts.previous, spec) || opts.loose)) || rubbed)) return fail(`${apart} changes from the day before's board`);
    if (apart === 2 && opts.loose && !ends && !swapped(opts.previous, spec)) notes.push("two changes: no single one gave a different answer");
    if (rubbed) notes.push(`${rubbed} written-in digits rubbed out with it`);
    if (step === "second-contrast" && !changedGivens(opts.previous, spec).every((g) => editable(focus)(g) || g.kind === "start" || g.kind === "end")) return fail(`the change isn't one of the ${focus.name.toLowerCase()}`);
    const before = await solve(makePuzzle(opts.previous), 2);
    if (before.some((b) => truth.some((t) => boardKey(t) === boardKey(b)))) return fail("the same answer as the day before's");
    notes.push(`one change from the day before's board (${describeChange(opts.previous, spec)}), a different answer`);
  }

  // the rivals
  const rivals = rivalsOf(focus);
  // (loose, when no board passes: weaker readings may stay unbroken, and that's noted)
  const must = (step === "trap" ? rivals : step === "review" || step === "combine" ? rivals.slice(0, 1) : []).filter((r) => !opts.loose || rivalKind(r) !== "weaker");
  for (const r of rivals) {
    const v = await breaks(spec, truth, r);
    verdicts.push(v);
    if (must.includes(r) && !v.broken && v.applies) return fail(`the rival "${r.reading}" isn't broken (${v.why})`);
  }
  if (opts.loose && verdicts.some((v) => v.applies && !v.broken)) notes.push(`loose: ${verdicts.filter((v) => v.applies && !v.broken).map((v) => v.id).join(", ")} unbroken`);
  if (rivals.length) notes.push(`rivals broken: ${verdicts.filter((v) => v.broken).map((v) => v.id).join(", ") || "none"} of ${rivals.map((r) => r.id).join(", ")}`);
  if (step === "trap") {
    // a trap: a rival reading that turns the true answer down and offers another (the neatest:
    // exactly one other)
    // exactly one other); only an "other" reading can (a weaker one still allows the true answer, a
    // stricter one allows nothing else), so a subject with none is checked, not trapped
    const traps = verdicts.filter((v) => v.applies && v.acceptsTruth === false && (v.count ?? 0) > 0);
    const neat = traps.find((v) => v.count === 1) ?? traps[0];
    if (neat) notes.push(`trap: "${neat.reading}" offers ${neat.count === 1 ? "one wrong answer" : "wrong answers"} and turns the true one down`);
    else if (rivals.some((r) => rivalKind(r) === "other") && !opts.loose) return fail("no rival reading offers a wrong answer in place of the true one");
    else if (rivals.some((r) => rivalKind(r) === "other")) notes.push("check: every reading breaks, but none sets a neat trap (the trap fell back)");
    else notes.push("check: every reading breaks (none of them could set a trap)");
    if (panel) { const obvious = obviousPanelLine(spec, truth[0]); if (obvious) return fail(`the obvious line is the answer: ${obvious}`); }
  }
  return { ok: true, notes, rivals: verdicts };
}

/** Whether some step of a deduction path uses the subject. */
export const usesSubject = (path: { uses: string[] }[], subject: Subject) => path.some((st) => st.uses.some((u) => usesOf(subject).includes(u)));

const sameFrame = (a: GridSpec, b: GridSpec) => JSON.stringify([a.size, a.rules ?? [], a.areas ?? null, a.entries ?? null]) === JSON.stringify([b.size, b.rules ?? [], b.areas ?? null, b.entries ?? null]);
/** The givens in `b` that aren't in `a` (or, for a removal, those of `a` that are gone). */
export function changedGivens(a: GridSpec, b: GridSpec): Given[] {
  const key = (g: Given) => JSON.stringify(g), A = new Set((a.givens ?? []).map(key)), B = new Set((b.givens ?? []).map(key));
  const added = (b.givens ?? []).filter((g) => !A.has(key(g)));
  return added.length ? added : (a.givens ?? []).filter((g) => !B.has(key(g)));
}
function describeChange(a: GridSpec, b: GridSpec) {
  const gone = (a.givens ?? []).filter((g) => !(b.givens ?? []).some((h) => JSON.stringify(h) === JSON.stringify(g)));
  const came = changedGivens(a, b).filter((g) => !gone.includes(g));
  if (a.picture && b.picture) return "one square of the picture";
  if (JSON.stringify(a.areas ?? null) !== JSON.stringify(b.areas ?? null)) return "a cell moved to the next area";
  if (JSON.stringify(a.entries ?? null) !== JSON.stringify(b.entries ?? null)) return "a number on the list changed";
  const kinds = [...new Set([...came, ...gone].map((g) => g.kind))];
  if (kinds.every((k) => k === "start" || k === "end")) return `the ${kinds.join(" and the ")} moved`;
  const kind = (came[0] ?? gone[0])?.kind ?? "clue";
  return gone.length && came.length ? `a ${kind} moved or changed` : came.length ? `a ${kind} added` : `a ${kind} removed`;
}

/** An eased board changed in one clue, with some of its written-in digits rubbed out (the ones the
 *  new answer doesn't have): how many were rubbed out, or null if it's not that. */
export function rubbedOut(a: GridSpec, b: GridSpec): number | null {
  if (!sameFrame(a, b)) return null;
  const key = (g: Given) => JSON.stringify(g), A = new Set((a.givens ?? []).map(key)), B = new Set((b.givens ?? []).map(key));
  const came = (b.givens ?? []).filter((g) => !A.has(key(g))), gone = (a.givens ?? []).filter((g) => !B.has(key(g)));
  if (came.length > 1 || !gone.every((g) => g.kind === "number")) return null;
  const extra = gone.length - (came.length ? 1 : 0) - (came.length || gone.length ? 0 : 0);
  return extra >= 1 && gone.length <= Math.ceil((a.givens ?? []).length / 2) ? extra : null;
}

/** A digit board's clues with the redundant ones taken out, one at a time in order, while it stays
 *  unique: an eased board's core (what it was before digits were written in). */
export async function coreOf(spec: GridSpec): Promise<GridSpec> {
  let cur = spec;
  for (const g of spec.givens ?? []) {
    if (g.kind !== "number") continue;
    const fewer = { ...cur, givens: (cur.givens ?? []).filter((x) => x !== g) };
    try { if ((await solve(makePuzzle(fewer), 2)).length === 1) cur = fewer; } catch { /* keep it */ }
  }
  return cur;
}

const placeOf = (g: Given) => JSON.stringify({ ...g, kind: undefined, color: undefined, value: undefined });
const posOf = (x: Given) => Object.fromEntries(Object.entries(x).filter(([k]) => ["at", "cell", "corner", "corners", "cells", "point", "side", "index"].includes(k)));
/** Two givens of a kind traded places (their values or colours swapped). */
export function swapped(a: GridSpec, b: GridSpec): boolean {
  const key = (g: Given) => JSON.stringify(g), A = new Set((a.givens ?? []).map(key)), B = new Set((b.givens ?? []).map(key));
  const gone = (a.givens ?? []).filter((g) => !B.has(key(g))), came = new Set((b.givens ?? []).filter((g) => !A.has(key(g))).map(key));
  if (gone.length !== 2 || came.size !== 2 || gone[0].kind !== gone[1].kind) return false;
  const [g, h] = gone;
  return came.has(key({ ...g, ...posOf(h) } as Given)) && came.has(key({ ...h, ...posOf(g) } as Given));
}

/** How many givens two specs differ by (a move counts once), or Infinity if more than the givens
 *  differ (another size, other rules). */
export function givensApart(a: GridSpec, b: GridSpec): number {
  if (a.areas && b.areas && JSON.stringify(a.areas) !== JSON.stringify(b.areas) && sameFrame({ ...a, areas: undefined }, { ...b, areas: undefined }) && JSON.stringify(a.givens ?? []) === JSON.stringify(b.givens ?? []))
    return a.areas.join("").split("").filter((ch, i) => ch !== b.areas!.join("")[i]).length;   // cells handed to another area
  if (a.entries && b.entries && JSON.stringify(a.entries) !== JSON.stringify(b.entries) && sameFrame({ ...a, entries: undefined }, { ...b, entries: undefined }) && JSON.stringify(a.givens ?? []) === JSON.stringify(b.givens ?? []))
    return a.entries.filter((e, i) => e !== b.entries![i]).length;   // numbers on the list changed
  if (!sameFrame(a, b)) return Infinity;
  if (JSON.stringify(a.picture ?? null) !== JSON.stringify(b.picture ?? null)) {
    const x = a.picture?.rows.join("") ?? "", y = b.picture?.rows.join("") ?? "";
    return x.length === y.length && JSON.stringify(a.givens ?? []) === JSON.stringify(b.givens ?? []) ? [...x].filter((ch, i) => (ch === ".") !== (y[i] === ".")).length : Infinity;
  }
  const key = (g: Given) => JSON.stringify(g);
  const A = (a.givens ?? []).map(key), B = (b.givens ?? []).map(key);
  return Math.max(A.filter((k) => !B.includes(k)).length, B.filter((k) => !A.includes(k)).length);
}

// ---- the contrasts: the day before's board, one thing changed ----

/** Every one-change edit of a board. `endpoint`: a panel's start or end moved (Tuesday); `symbol`:
 *  one of the subject's givens removed, moved, given another value or colour, or copied to an
 *  empty place (a nonogram: one square of the picture). */
export function contrastEdits(spec: GridSpec, subject: Subject, mode: "endpoint" | "symbol" = "symbol"): GridSpec[] {
  const out: GridSpec[] = [], givens = spec.givens ?? [], [rows, cols] = spec.size;
  const withGivens = (gs: Given[]): GridSpec => ({ ...spec, givens: gs });
  const taken = new Set(givens.map((g) => (g.at === "cell" ? `c${g.cell}` : g.at === "corner" ? `v${g.corner}` : g.at === "line" ? `l${JSON.stringify(g.corners)}` : g.at === "border" ? `b${JSON.stringify(g.cells)}` : "")));
  if (mode === "endpoint") {
    if (spec.genre !== "panel" || (spec.rules ?? []).some((r) => r.rule === "panel-line" && r.symmetry)) return [];
    // the start, the end, or both moved (an end sticks out of the edge)
    const spots = (kind: string): [number, number][] => { const o: [number, number][] = []; for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) if (kind === "start" || r === 0 || c === 0 || r === rows || c === cols) o.push([r, c]); return o; };
    const si = givens.findIndex((g) => g.kind === "start"), ei = givens.findIndex((g) => g.kind === "end");
    if (si < 0 || ei < 0) return [];
    const at = (g: Given) => JSON.stringify((g as { corner: [number, number] }).corner);
    const busy = new Set(givens.filter((g, j) => g.at === "corner" && j !== si && j !== ei).map(at));
    const S0 = (givens[si] as { corner: [number, number] }).corner, E0 = (givens[ei] as { corner: [number, number] }).corner;
    for (const s of [S0, ...spots("start")]) for (const e of [E0, ...spots("end")]) {
      const k = JSON.stringify(s), ke = JSON.stringify(e);
      if (k === ke || busy.has(k) || busy.has(ke) || (k === JSON.stringify(S0) && ke === JSON.stringify(E0))) continue;
      out.push(withGivens(givens.map((x, j) => (j === si ? { ...x, corner: s } as Given : j === ei ? { ...x, corner: e } as Given : x))));
    }
    // one end moved before both
    return out.sort((x, y) => givensApart(spec, x) - givensApart(spec, y));
  }
  const mine = editable(subject);
  if (spec.areas && !kindOf(subject)) {
    // a cell of an outlined area handed to the area beside it (both stay whole)
    const A = spec.areas, at = (r: number, c: number) => A[r]?.[c];
    const whole = (rowsA: string[], ch: string) => {
      const cells: [number, number][] = [];
      rowsA.forEach((row, r) => [...row].forEach((x, c) => { if (x === ch) cells.push([r, c]); }));
      if (!cells.length) return false;
      const seen = new Set([String(cells[0])]), stack = [cells[0]];
      while (stack.length) { const [r, c] = stack.pop()!; for (const [y, x] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) if (rowsA[y]?.[x] === ch && !seen.has(String([y, x]))) { seen.add(String([y, x])); stack.push([y, x]); } }
      return seen.size === cells.length;
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (const [y, x] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      const to = at(y, x), from = at(r, c);
      if (!to || to === from || to === "#" || from === "#") continue;
      const next = A.map((row, k) => (k === r ? row.slice(0, c) + to + row.slice(c + 1) : row));
      if (whole(next, from) && whole(next, to)) out.push({ ...spec, areas: next });
    }
  }
  if (spec.entries?.length && !kindOf(subject)) {
    // one number on the list changed by a digit
    spec.entries.forEach((e, i) => [...e].forEach((ch, j) => { for (const d of "0123456789") if (d !== ch) out.push({ ...spec, entries: spec.entries!.map((x, k) => (k === i ? x.slice(0, j) + d + x.slice(j + 1) : x)) }); }));
  }
  if (spec.picture) {
    const rowsP = spec.picture.rows, ink = Object.keys(spec.picture.palette ?? {}).find((k) => k !== ".") ?? "x";
    for (let r = 0; r < rowsP.length; r++) for (let c = 0; c < rowsP[r].length; c++) {
      const flipped = rowsP.map((row, y) => (y === r ? row.slice(0, c) + (row[c] === "." ? ink : ".") + row.slice(c + 1) : row));
      out.push({ ...spec, picture: { ...spec.picture, rows: flipped } });
    }
    return out;
  }
  const cells: [number, number][] = [], corners: [number, number][] = [], lines: [[number, number], [number, number]][] = [], borders: [[number, number], [number, number]][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!taken.has(`c${[r, c]}`)) cells.push([r, c]);
    if (c + 1 < cols && !taken.has(`b${JSON.stringify([[r, c], [r, c + 1]])}`)) borders.push([[r, c], [r, c + 1]]);
    if (r + 1 < rows && !taken.has(`b${JSON.stringify([[r, c], [r + 1, c]])}`)) borders.push([[r, c], [r + 1, c]]);
  }
  const points: [number, number][] = [], held = new Set(givens.filter((g) => g.at === "point").map((g) => String((g as { point: [number, number] }).point)));
  for (let y = 1; y < 2 * rows; y++) for (let x = 1; x < 2 * cols; x++) if (!held.has(String([y, x]))) points.push([y, x]);
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    if (!taken.has(`v${[r, c]}`)) corners.push([r, c]);
    if (c + 1 <= cols && !taken.has(`l${JSON.stringify([[r, c], [r, c + 1]])}`)) lines.push([[r, c], [r, c + 1]]);
    if (r + 1 <= rows && !taken.has(`l${JSON.stringify([[r, c], [r + 1, c]])}`)) lines.push([[r, c], [r + 1, c]]);
  }
  const placesFor = (g: Given): Given[] => g.at === "cell" ? cells.map((cell) => ({ ...g, cell }) as Given)
    : g.at === "corner" ? corners.map((corner) => ({ ...g, corner }) as Given)
    : g.at === "line" ? lines.map((cs) => ({ ...g, corners: cs }) as Given)
    : g.at === "border" ? borders.map((cs) => ({ ...g, cells: cs }) as Given)
    : g.at === "point" ? points.map((point) => ({ ...g, point }) as Given) : [];
  const values = (g: Given): Given[] => {
    const x = g as Given & { value?: unknown; color?: string };
    if (g.kind === "triangle") return [1, 2, 3].filter((v) => v !== x.value).map((value) => ({ ...g, value }) as Given);
    if (g.kind === "square") return ["black", "white", "blue"].filter((c) => c !== x.color).map((color) => ({ ...g, color }) as Given);
    if (g.kind === "star") return ["orange", "purple", "green", "black", "white"].filter((c) => c !== x.color).map((color) => ({ ...g, color }) as Given);
    if (typeof x.value === "number" && g.kind !== "color") return [x.value - 1, x.value + 1].filter((v) => v >= 0).map((value) => ({ ...g, value }) as Given);
    if (g.kind === "color" && typeof x.value === "number") return [1, 2, 3].filter((v) => v !== x.value).map((value) => ({ ...g, value }) as Given);
    return [];
  };
  givens.forEach((g, i) => {
    if (!mine(g)) return;
    const rest = givens.filter((_, j) => j !== i);
    for (const moved of placesFor(g)) out.push(withGivens([...rest, moved]));   // moved
    for (const changed of values(g)) out.push(withGivens([...rest, changed]));  // another value
    out.push(withGivens(rest));                                                // removed
  });
  givens.forEach((g, i) => givens.forEach((h, j) => {                         // two trading places
    if (j <= i || !mine(g) || !mine(h) || g.kind !== h.kind || g.at !== h.at || placeOf(g) === placeOf(h)) return;
    const g2 = { ...g, ...posOf(h) } as Given, h2 = { ...h, ...posOf(g) } as Given;
    if (JSON.stringify(g2) !== JSON.stringify(h) && JSON.stringify(g2) !== JSON.stringify(g)) out.push(withGivens(givens.map((x, k) => (k === i ? g2 : k === j ? h2 : x))));
  }));
  const seen = new Set<string>();
  for (const g of givens.filter(mine)) for (const copy of placesFor(g)) {     // one more
    const k = JSON.stringify(copy);
    if (!seen.has(k)) { seen.add(k); out.push(withGivens([...givens, copy])); }
  }
  return out;
}

// ---- Monday, eased: few unknowns ----

/** A digit puzzle with more of its answer written in, until at most a third of the open cells
 *  are empty (docs/tutorial-sequences.md §6.8: pencil types ease Monday with few unknowns). A
 *  digit that would make the subject's own rule unneeded (a thermometer's) is left out. */
export async function eased(spec: GridSpec, rand: () => number, subject?: Subject): Promise<GridSpec> {
  const p = makePuzzle(spec), truth = await solve(p, 2), [answer] = truth, g = p.grid;
  if (!answer || !p.marks.includes("digit")) return spec;
  const given = new Set([...p.cellGivens].filter(([, gs]) => gs.some((x) => x.kind === "number")).map(([i]) => i));
  const open = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !p.blocked.has(i) && answer.digit[i] > 0 && !given.has(i));
  const keep = Math.max(3, Math.ceil(0.33 * (open.length + given.size)));
  for (let i = open.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [open[i], open[j]] = [open[j], open[i]]; }
  let cur = spec, left = open.length;
  const strip = subject && !kindOf(subject) && !subject.id.includes(":") && subject.id !== "irregular-sudoku" ? null : subject && withoutSubject(subject);
  for (const i of open) {
    if (left <= keep) break;
    const next: GridSpec = { ...cur, givens: [...(cur.givens ?? []), { at: "cell", cell: g.rc(i) as [number, number], kind: "number", value: answer.digit[i] }] };
    if (strip) { const v = await breaks(next, truth, strip); if (v.applies && !v.broken) continue; }
    cur = next; left--;
  }
  return cur;
}

// ---- the scorer ----

/** The lesson scorer: the deduction scorer (difficulty from the solve path, quality from the proxy's
 *  checks), with quality 0 when the slot's lesson checks fail or no step of the path uses the
 *  subject. `previous` is the day before's board, for the contrasts. */
export function lessonScorer(previous?: GridSpec, loose = false, fresh = false): Scorer {
  return async (c, persona, slot) => {
    const lesson = lessonFor(persona, slot);
    if (!lesson) return deductionScorer(c, persona, slot);
    const company = lessonSettings(persona, lesson).with;
    const check = await checkLesson(c.spec, lesson, { company, previous, loose, fresh });
    if (!check.ok) return { difficulty: 0, quality: 0, notes: check.notes, measures: {} };
    const score = await deductionScorer(c, persona, slot);
    const path = deductionPaths.get(c.spec);
    const notes = [...check.notes, ...score.notes];
    for (const s of [lesson.focus, ...(lesson.step === "combine" && company ? [company] : [])]) {
      if (path && !usesSubject(path, s)) return { ...score, quality: 0, notes: [...notes, `rejected: no step of the solve uses ${s.name}`] };
    }
    if (!path) notes.push("deduction path unavailable: uses not checked");
    return { ...score, notes, measures: { ...score.measures, rivalsBroken: check.rivals.filter((v) => v.broken).length, rivals: check.rivals.length } };
  };
}

// ---- words: pointing, never telling ----

const STOP = new Set(("a an the of and or in on at to for with by is are be it its it's this that these those as from into each every any one two three four "
  + "if then than so no not never also there their they them you your what which when where who how all some more most other another own same").split(" "));
/** Words a post may use even though the rule's sentence has them: the things on the board a
 *  teacher points at, and the subject's own name. */
const POINTABLE = new Set(("line lines grid cell cells square squares corner corners edge edges side sides row rows column columns board start end circle "
  + "dot dots star stars triangle triangles shape shapes eraser erasers number numbers digit digits letter letters color colors colour colours "
  + "black white blue yellow orange purple green red box boxes bulb bulbs lamp lamps mine mines thermometer thermometers pearl pearls tank tanks "
  + "piece pieces dark top bottom left right first last").split(" "));
const stem = (w: string) => w.toLowerCase().replace(/'s$/, "").replace(/(ies)$/, "y").replace(/(es|s|ed|ing)$/, "");

/** The guide's sentences a subject teaches (src/guides/guides.ts). */
export function ruleSentences(subject: Subject): string[] {
  const rules = guides[subject.genre as keyof typeof guides]?.rules ?? [];
  const g = subject.guide;
  const pick = rules.filter((r) => (g?.starts ? r.text.startsWith(g.starts) : g?.checks ? (r.checks ?? []).some((c) => g.checks!.includes(c)) : true));
  return (pick.length ? pick : rules).map((r) => r.text);
}

/** The words that state a subject's rule: the content words of its guide sentences and of its
 *  rivals' readings, less the pointable things and the subject's own name. */
export function ruleWords(subject: Subject): Set<string> {
  const own = new Set(subject.name.toLowerCase().split(/\W+/).map(stem));
  const text = [...ruleSentences(subject), ...rivalsOf(subject).map((r) => r.reading)].join(" ");
  const words = text.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !POINTABLE.has(w));
  return new Set(words.map(stem).filter((w) => w.length > 2 && !own.has(w) && !POINTABLE.has(w)));
}

/** The rule's words a title or description uses (none is the only acceptable answer). */
export function tellsRule(text: string, subject: Subject): string[] {
  const banned = ruleWords(subject);
  return [...new Set(text.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean).filter((w) => !STOP.has(w) && !POINTABLE.has(w) && banned.has(stem(w))))];
}

/** A lesson's title: the week's subject, the day's numeral, then Claude's word or two. */
export const NUMERALS = ["I", "II", "III", "IV", "V"];
export const titlePrefix = (lesson: Pick<Lesson, "subject" | "day">) => `${lesson.subject.name} ${NUMERALS[lesson.day] ?? "V"} · `;

const STEP_WORDS = (before: string): Record<LessonStep, string> => ({
  introduce: "Monday: the first time this appears, on the smallest board. Nearly forced: the player can solve it before they understand it. The title and a few words are enough; often no pointer at all.",
  contrast: `Tuesday: ${before} with one thing changed (often the start or the end), and a different answer. Say that it's ${before}, and at most point at the change, never at why it matters.`,
  "second-contrast": `Wednesday: ${before} again with one more thing changed (usually a symbol moved), and a different answer again. Say that something moved, and little else.`,
  trap: "Thursday: a tidy answer waits for anyone holding the wrong idea, and it's wrong. Say almost nothing: a few words, or nothing beyond the title.",
  combine: "Friday: the new idea meets an earlier one. Name the earlier one as something coming back, never what it does.",
  review: "A review: an earlier idea comes back, with nothing new. Say almost nothing: name it as an old friend, in a few words.",
});

/** How Slate's notes point: once, at a thing, never at a position or a sequence of moves. */
export const noteRules = (max: number) => [
  "The description is a note, not instructions. At most one short pointer, at a thing on the board (the corner clue, the two letters, the pair of stars, the edge) or a question that turns the eye somewhere. Many days need no pointer at all.",
  "Never give coordinates or positions: no row or column numbers, no \"second from the left\", no \"left to right\" scans. Never give more than one instruction, never a sequence of steps (no \"then\"), never \"put your pencil\" or \"your finger\", and never say what goes where or what the answer is.",
  `At most ${max} words; fewer is better.`,
].join(" ");

/** The most words a lesson's description may have, by step: a trap and a review say almost nothing. */
export const NOTE_WORDS: Record<LessonStep, number> = { introduce: 20, contrast: 20, "second-contrast": 20, trap: 12, combine: 20, review: 12 };

const ORDINAL = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|\\d+(?:st|nd|rd|th)";
const NUMBER = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten";
const COORDINATES: [RegExp, string][] = [
  [new RegExp(`\\b(?:row|column|col)s?\\s*(?:#|no\\.?\\s*)?(?:${NUMBER})\\b`, "i"), "a row or column number"],
  [new RegExp(`\\b(?:${ORDINAL})\\s+(?:row|column|col)s?\\b`, "i"), "a numbered row or column"],
  [/\br\s?\d+\s?c\s?\d+\b/i, "a cell reference"],
  [/\(\s*\d+\s*,\s*\d+\s*\)/, "a cell reference"],
  [new RegExp(`\\b(?:${ORDINAL}|${NUMBER})\\b[\\w\\s-]{0,24}?\\b(?:from|in from)\\s+the\\s+(?:left|right|top|bottom)\\b`, "i"), "a counted position"],
  [/\b(?:left to right|right to left|top to bottom|bottom to top)\b/i, "a scan across the board"],
];
const STEP_VERBS = new Set(("look start begin find put go check draw move place try stand follow count read trace take shade fill mark work compare see watch notice "
  + "leave ignore turn walk keep use pick choose cross run note sit point step head finish end").split(" "));
const TELLING: [RegExp, string][] = [
  [/\byour (?:pencil|pen|finger)\b/i, "a hand-held move (your pencil, your finger)"],
  [/\b(?:the answer is|is the answer|must be|must go|has to be|have to be|goes here|goes there)\b/i, "what the answer is"],
  [/\bthe (?:line|path|loop|answer) (?:goes|passes|runs|turns|must|has to)\b/i, "what the answer is"],
];

/** Where a note gives the solve away rather than pointing (none is the only acceptable answer):
 *  coordinates, more than one instruction, a hand on the pencil, what holds, or too many words.
 *  `step` sets the length; titles are checked for coordinates only (`title`); `sameDay`: the
 *  board before went up the same day, so it isn't yesterday's. */
export function pointsTooMuch(text: string, step?: LessonStep, o: { title?: boolean; sameDay?: boolean } = {}): string[] {
  const out = new Set<string>();
  for (const [re, why] of COORDINATES) if (re.test(text)) out.add(why);
  // a back catalogue told a week a day (schedule.ts historySlots): the board before went up today
  if (o.sameDay && /\byesterday/i.test(text)) out.add("\"yesterday\" (the board before went up earlier today: say \"the last board\")");
  if (o.title) return [...out];
  for (const [re, why] of TELLING) if (re.test(text)) out.add(why);
  let steps = 0;
  for (const s of text.split(/[.!?;:]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    const words = s.replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean);
    const lead = ["then", "now", "first", "next", "and"].includes(words[0]) ? words[1] : words[0];
    if (lead && STEP_VERBS.has(lead)) steps++;
    for (let i = 1; i < words.length - 1; i++) if (words[i] === "then" && STEP_VERBS.has(words[i + 1])) steps++;
  }
  if (steps > 1) out.add("more than one instruction");
  const n = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length, max = NOTE_WORDS[step ?? "introduce"];
  if (n > max) out.add(`${n} words (at most ${max})`);
  return [...out];
}

const AREAS = [["the top left", "the top", "the top right"], ["the left side", "the middle", "the right side"], ["the bottom left", "the bottom", "the bottom right"]];
/** Where on a board some cells are, in words a teacher points with: a corner, an edge, the middle;
 *  null on a board so small that pointing gives the answer away, or for cells spread over it. */
export function areaOf(cells: number[], rows: number, cols: number): string | null {
  if (!cells.length || rows * cols <= 6) return null;
  const rs = cells.map((i) => Math.floor(i / cols)), cs = cells.map((i) => i % cols);
  const all = (xs: number[], v: number) => xs.every((x) => x === v);
  const v = all(rs, 0) ? "top" : all(rs, rows - 1) ? "bottom" : null, h = all(cs, 0) ? "left" : all(cs, cols - 1) ? "right" : null;
  if (v && h) return `the ${v}-${h} corner`;
  if (v || h) return `the ${v ?? h} edge`;
  const third = (x: number, n: number) => (x + 0.5) / n < 1 / 3 ? 0 : (x + 0.5) / n > 2 / 3 ? 2 : 1;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (Math.max(...rs) - Math.min(...rs) > rows / 2 || Math.max(...cs) - Math.min(...cs) > cols / 2) return null;
  const y = third(mean(rs), rows), x = third(mean(cs), cols);
  return AREAS[y][x];
}

/** The facts Claude writes a lesson's words from: the step, the subject, where to look. */
export function lessonFacts(p: Persona, lesson: Lesson, spec: GridSpec, path?: { cells: number[]; uses: string[] }[], notes: string[] = [], sameDay = false) {
  const joined = notes.join(" "), before = sameDay ? "the last board" : "yesterday's board";
  const change = joined.match(/one change from the day before's board \(([^)]*)\)/)?.[1];
  const what = joined.includes("a fresh board") ? `This board is a new one the same size as ${before} (no small change worked): don't call it ${before}.`
    : change ? `What changed from ${before}, for you only: ${change}. At most point at it, without positions.`
    : `It's a new board, not an earlier post: don't call it ${before} or last week's.`;
  const company = lessonSettings(p, lesson).with, [rows, cols] = spec.size;
  const first = path?.find((st) => st.uses.some((u) => usesOf(lesson.focus).includes(u)));
  const where = first?.cells.length && first.cells.length <= 4 && lesson.step !== "trap" && lesson.step !== "review" ? areaOf(first.cells, rows, cols) : null;
  const mine = (spec.givens ?? []).filter(subjectGiven(lesson.focus)).length;
  return [
    lesson.subject.review ? `This is a review week (week ${lesson.index + 1} of ${p.curriculum!.length}); today's subject comes back from earlier: ${lesson.focus.name}.`
      : `This week's subject: ${lesson.subject.name} (week ${lesson.index + 1} of ${p.curriculum!.length}).${lesson.focus !== lesson.subject ? ` Today reviews last week's: ${lesson.focus.name}.` : ""}`,
    `The rule, for you only: ${ruleSentences(lesson.focus).join(" ")}`,
    STEP_WORDS(before)[lesson.step],
    ...(sameDay ? ["The back catalogue goes up a week a day: the posts before this one went up earlier today. Never say yesterday; say \"the last board\"."] : []),
    what,
    ...(company ? [`Friday's company: ${company.name}, from an earlier week.`] : []),
    ...(mine && kindOf(lesson.focus) ? [`On the board: ${mine} of them.`] : []),
    ...(where ? [`Where the solve first needs it, if you point at all (never say what is true there): ${where}.`] : []),
    noteRules(NOTE_WORDS[lesson.step]),
    `The title must be exactly "${titlePrefix(lesson)}" followed by one or two words, never a position.`,
    `Never use these words, which state the rule: ${[...ruleWords(lesson.focus)].join(", ")}.`,
  ].join("\n");
}

/** Fallback words for a step, clean of any rule's words, when Claude's keep stating the rule. */
export const PLAIN_WORDS: Record<LessonStep, { word: string; description: string }> = {
  introduce: { word: "Begin", description: "A small board." },
  contrast: { word: "Again", description: "The last board. Something changed." },
  "second-contrast": { word: "Once More", description: "The last board. Something moved." },
  trap: { word: "Careful", description: "" },
  combine: { word: "Company", description: "An old friend is back." },
  review: { word: "Back", description: "An old friend is back." },
};

// ---- making a lesson's post ----

export interface LessonOptions {
  /** the day before's puzzle, for Tuesday's and Wednesday's contrasts (from the batch file or the
   *  week's run); otherwise it's made again with `remake` */
  previous?: GridSpec | null;
  remake?: (slot: Slot) => Promise<GridSpec | null>;
  isNew?: (spec: GridSpec) => boolean;
  candidateMs: number;
  /** candidates per board size */
  perSize?: number;
  log?: (s: string) => void;
}

export interface LessonMade { spec: GridSpec; score: Score; size: [number, number]; tries: number; fallback?: string }

/** A lesson's post: the smallest board that passes the step's checks (of the few that pass at that
 *  size, Monday's breaks the fewest rivals, then the closest to the day's difficulty), or for a
 *  contrast the best one-change edit of the day before's. Null, with the reasons logged, if
 *  nothing passes. */
export async function makeLesson(p: Persona, slot: Slot, o: LessonOptions, generate: (opts: GenerateOptions, ms: number) => Promise<GridSpec | null>, seedOf: (k: number) => number): Promise<LessonMade | null> {
  const lesson = lessonFor(p, slot)!, log = o.log ?? console.log;
  const { mix, rules, moves, cipher } = lessonSettings(p, lesson);
  const reasons = new Map<string, number>();
  const tally = (notes: string[]) => { const r = notes.find((n) => n.startsWith("rejected")) ?? "rejected"; const k = r.replace(/\d+(\.\d+)?/g, "#").slice(0, 90); reasons.set(k, (reasons.get(k) ?? 0) + 1); };
  const why = () => [...reasons].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join("; ");
  let tries = 0, k = 0;

  if (lesson.step === "contrast" || lesson.step === "second-contrast") {
    let previous = o.previous ?? null;
    if (!previous && o.remake) { const [y, m, d] = slot.date.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1, d - 1)); previous = await o.remake({ ...slot, date: date.toISOString().slice(0, 10), weekday: lesson.step === "contrast" ? "mon" : "tue" }); }
    if (!previous) { log(`  ${p.handle} ${slot.date}: no board from the day before to change`); return null; }
    const base = await solve(makePuzzle(previous), 2);
    const tryEdits = async (edits: GridSpec[], scorer = lessonScorer(previous!)) => {
      const passed: { spec: GridSpec; score: Score; apart: number; moved: boolean }[] = [];
      for (const spec of edits) {
        if (o.isNew && !o.isNew(spec)) continue;
        let sols: Board[];
        try { sols = await solve(makePuzzle(spec), 2); } catch { continue; }
        if (sols.length !== 1) continue;
        tries++;
        const score = await scorer({ spec, plan: { genre: lesson.focus.genre, weight: 1, sizes: [spec.size as [number, number]] } }, p, slot);
        if (score.quality < p.quality.minQuality) { tally(score.notes); continue; }
        const a = boardKey(sols[0]), b = base[0] ? boardKey(base[0]) : "";
        const moved = (spec.givens ?? []).length === (previous!.givens ?? []).length;
        passed.push({ spec, score, apart: [...a].filter((ch, i) => ch !== b[i]).length, moved });
      }
      // a move before an added or removed symbol; then the answer that differs most; then the fewer clues
      passed.sort((x, y) => Number(y.moved) - Number(x.moved) || y.apart - x.apart || (x.spec.givens?.length ?? 0) - (y.spec.givens?.length ?? 0));
      return passed[0];
    };
    // an eased board: change its core, then write back the digits that still fit the new answer
    const easedEdits = async () => {
      const core = await coreOf(previous!), reveals = (previous!.givens ?? []).filter((g) => !(core.givens ?? []).includes(g));
      const out: GridSpec[] = [];
      for (const e of contrastEdits(core, lesson.focus, "symbol")) {
        let sols: Board[];
        try { sols = await solve(makePuzzle(e), 2); } catch { continue; }
        if (sols.length !== 1) continue;
        const g = makePuzzle(e).grid;
        const fits = reveals.filter((r) => r.at === "cell" && sols[0].digit[g.cell(...r.cell)] === (r as { value: number }).value && !(e.givens ?? []).some((x) => x.at === "cell" && String(x.cell) === String(r.cell)));
        out.push({ ...e, givens: [...(e.givens ?? []), ...fits] });
      }
      return out;
    };
    let best = lesson.step === "contrast" ? await tryEdits(contrastEdits(previous, lesson.focus, "endpoint")) : undefined;
    if (!best && lesson.focus.ease) best = await tryEdits(await easedEdits());
    let fallback: string | undefined;
    if (!best) { best = await tryEdits(contrastEdits(previous, lesson.focus, "symbol")); if (best && lesson.step === "contrast" && previous.genre === "panel") fallback = "no endpoint move worked: a symbol changed instead"; }
    if (!best && lesson.step === "second-contrast") { best = await tryEdits(contrastEdits(previous, lesson.focus, "endpoint")); if (best) fallback = "no symbol move worked: an endpoint moved instead"; }
    if (!best) {
      // two changes, when no single one gives a different answer (some of the pairs, in order)
      const singles = contrastEdits(previous, lesson.focus, "symbol").filter((_, i) => i % 3 === 0).slice(0, 40);
      const pairs = singles.flatMap((e) => contrastEdits(e, lesson.focus, "symbol").filter((_, i) => i % 5 === 0).slice(0, 15));
      best = await tryEdits(pairs, lessonScorer(previous, true));
      if (best) fallback = "two changes: no single one gave a different answer";
    }
    if (!best) {
      // no change works: a fresh board the day before's size, with a different answer (noted)
      log(`  ${p.handle} ${slot.date} ${lesson.focus.id} ${lesson.step}: none of ${tries} changes passes (${why()}); a fresh board instead`);
      const fresh = await generateLoop([previous.size as [number, number]], lessonScorer(previous, false, true), lessonScorer(previous, true, true));
      if (fresh) return { ...fresh, fallback: "a fresh board: no change gave a different answer" };
      log(`  ${p.handle} ${slot.date} ${lesson.focus.id} ${lesson.step}: no fresh board either (${why()})`);
      return null;
    }
    return { spec: best.spec, score: fallback ? { ...best.score, notes: [...best.score.notes, fallback] } : best.score, size: best.spec.size as [number, number], tries, fallback };
  }

  return generateLoop(lessonSizes(lesson.focus, lesson.step, lesson.day), lessonScorer(), lessonScorer(undefined, true));

  /** Candidates at each size in turn (then the subject's other sizes, noted), keeping the first
   *  size where some pass. A candidate turned down only by the rivals is kept aside, and if none
   *  passes anywhere, the aside ones are scored loosely (weaker readings may stay unbroken, a trap
   *  may be only a check) and the one breaking the most readings is taken. */
  async function generateLoop(sizes: [number, number][], scorer: Scorer, loose: Scorer): Promise<LessonMade | null> {
    const aside: { spec: GridSpec; size: [number, number] }[] = [];
    const more = lesson.focus.sizes.filter(([r, c]) => !sizes.some(([a, b]) => a === r && b === c));
    const perSize = o.perSize ?? (lesson.step === "trap" ? 25 : 12);
    for (const [si, [rows, cols]] of [...sizes, ...more].entries()) {
      const passed: LessonMade[] = [];
      for (let n = 0; n < perSize && passed.length < (lesson.step === "introduce" ? 5 : 3); n++, k++) {
        let spec = await generate({ genre: lesson.focus.genre, rows, cols, seed: seedOf(k), mix, rules, moves, cipher }, o.candidateMs);
        if (!spec) continue;
        if (lesson.step === "introduce" && lesson.focus.ease) { let s = seedOf(k) || 1; spec = await eased(spec, () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31), lesson.focus); }
        if (o.isNew && !o.isNew(spec)) continue;
        tries++;
        const score = await scorer({ spec, plan: { genre: lesson.focus.genre, weight: 1, sizes: [[rows, cols]] } }, p, slot);
        if (score.quality < p.quality.minQuality) { tally(score.notes); if (/rejected: (the rival|no rival reading)/.test(score.notes.at(-1) ?? "")) aside.push({ spec, size: [rows, cols] }); continue; }
        passed.push({ spec, score, size: [rows, cols], tries: 0, ...(si >= sizes.length ? { fallback: `${rows}x${cols}, past the step's sizes` } : {}) });
      }
      if (passed.length) {
        // Monday shows before it teaches: the fewest rivals broken first (a player holding a wrong
        // reading can still win it); then the closest to the day's difficulty
        const broken = (m: LessonMade) => (lesson.step === "introduce" ? m.score.measures.rivalsBroken ?? 0 : 0);
        passed.sort((x, y) => broken(x) - broken(y) || Math.abs(x.score.difficulty - slot.difficulty) - Math.abs(y.score.difficulty - slot.difficulty) - 0.15 * (x.score.quality - y.score.quality));
        const best = { ...passed[0], tries };
        if (best.fallback) best.score = { ...best.score, notes: [...best.score.notes, best.fallback] };
        return best;
      }
    }
    let bestLoose: LessonMade | null = null;
    for (const { spec, size } of aside) {
      const score = await loose({ spec, plan: { genre: lesson.focus.genre, weight: 1, sizes: [size] } }, p, slot);
      if (score.quality >= p.quality.minQuality && (!bestLoose || (score.measures.rivalsBroken ?? 0) > (bestLoose.score.measures.rivalsBroken ?? 0))) bestLoose = { spec, score, size, tries, fallback: "loose: not every reading breaks" };
    }
    if (bestLoose) return bestLoose;
    log(`  ${p.handle} ${slot.date} ${lesson.focus.id} ${lesson.step}: none of ${tries} candidates passes (${why()})`);
    return null;
  }
}

/** For tests and reports: a rival's answers on a spec (none if it doesn't apply). */
export async function rivalAnswers(spec: GridSpec, r: Rival) { const rp = rivalProgram(spec, r); return rp ? answers(rp.prog, rp.p, 2) : []; }
