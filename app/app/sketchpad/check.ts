// Check, in paint (docs/creation-flow.md §1.5, §2): the verdict on the drawing as a puzzle of its
// type, the list of what's wrong (numbered, with a tip each), and where each is on the paper.
//
//   verdictOf(...)   the verdict: the Check button's words and This puzzle's heading
//   checkList(...)   the numbered list (This puzzle hangs each under its line: checklist.ts): broken
//                    rules and differences first, then what to fix, then what doesn't fit
//   highlight(...)   where an item is on the paper: rings round its squares, outlines round its
//                    drawing items, a line joining them, and the point its pin and tip hang from
//   differences(...) where two solutions differ (for "Several solutions")
//
// Pure: no DOM; the solver's results come in as data (count-solutions.client.ts).
import { needsOneSolution, type GenreName } from "~site/engine/puzzle.ts";
import { symbolOf } from "~site/engine/rules.ts";
import { HEX_SIDE } from "~site/engine/geometry.ts";
import type { Board, Puzzle } from "~site/engine/types.ts";
import { kindName } from "~/games/kinds";
import * as m from "./model";
import type { Conversion, Problem } from "./to-puzzle";
import type { Doubt } from "~/games/doubts";

// ---- the verdict ----

/** What the solver said about one puzzle (`key`: which; a result for another is stale). */
export type Solved = { key: string; solutions: 0 | 1 | 2; boards: Board[] } | { key: string; error: string };

export type Verdict =
  | { kind: "no-type" } | { kind: "no-grid" } | { kind: "unsupported"; text: string }
  | { kind: "incomplete"; text: string }
  | { kind: "checking" }
  | { kind: "broken"; rules: number }
  | { kind: "none" } | { kind: "several" } | { kind: "one" } | { kind: "solvable" }
  | { kind: "error"; text: string };

/** The verdict: no type, no grid, a type paint can't make, a puzzle missing something, rules
 *  already broken (at once, without the solver: decision 5), or the solver's answer once it's in
 *  for this very puzzle (`key`), else Checking…. */
export function verdictOf(genre: GenreName | null, conv: Conversion | null, key: string, solved: Solved | null): Verdict {
  if (!genre) return { kind: "no-type" };
  if (!conv) return { kind: "checking" };
  const unsupported = conv.problems.find((p) => p.kind === "unsupported");
  if (unsupported) return { kind: "unsupported", text: unsupported.text };
  if (!conv.spec) return { kind: "no-grid" };
  const rules = conv.problems.filter((p) => p.kind === "rule").length;
  if (rules) return { kind: "broken", rules };
  const incomplete = conv.problems.find((p) => p.kind === "incomplete");
  if (incomplete) return { kind: "incomplete", text: incomplete.text };
  if (!solved || solved.key !== key) return { kind: "checking" };
  if ("error" in solved) return { kind: "error", text: solved.error };
  if (solved.solutions === 0) return { kind: "none" };
  if (solved.solutions === 1) return { kind: "one" };
  return needsOneSolution(genre) ? { kind: "several" } : { kind: "solvable" };
}

/** The verdict passes: the puzzle can be published (one solution; panels at least one). */
export const passes = (v: Verdict) => v.kind === "one" || v.kind === "solvable";

/** The Check button's words and tone: the verdict ("Check" with no type to check against). */
export function verdictWords(v: Verdict): { text: string; tone: "ok" | "bad" | "wait" | "none" } {
  switch (v.kind) {
    case "no-type": return { text: "Check", tone: "none" };
    case "no-grid": return { text: "No grid yet", tone: "none" };
    case "unsupported": return { text: "Not in paint yet", tone: "none" };
    case "incomplete": return { text: "Not a puzzle yet", tone: "bad" };
    case "checking": return { text: "Checking…", tone: "wait" };
    case "broken": return { text: "No solution", tone: "bad" };
    case "none": return { text: "No solution", tone: "bad" };
    case "several": return { text: "Several solutions", tone: "bad" };
    case "one": return { text: "One solution", tone: "ok" };
    case "solvable": return { text: "Solvable", tone: "ok" };
    case "error": return { text: "Couldn't check", tone: "bad" };
  }
}

/** This puzzle's line under its heading. */
export function verdictStory(v: Verdict, genre: GenreName | null): { title: string; text: string } {
  const name = genre ? kindName(genre) : "";
  switch (v.kind) {
    case "no-type": return { title: "No type yet", text: "Choose a puzzle type: its rules decide what counts as a solution." };
    case "no-grid": return { title: "No grid yet", text: "Draw a grid with the Grid tool: the puzzle is read off it." };
    case "unsupported": return { title: "Not in paint yet", text: v.text };
    case "incomplete": return { title: "Not a puzzle yet", text: v.text };
    case "checking": return { title: "Checking…", text: "The solver is looking for solutions." };
    case "broken": return { title: "No solution", text: `${v.rules === 1 ? "A rule is" : `${v.rules} rules are`} broken already, so nothing can solve it. Fix ${v.rules === 1 ? "it" : "them"} and the verdict updates.` };
    case "none": return { title: "No solution", text: `No way of filling it in obeys every ${name} rule. Take a clue out, or change one.` };
    case "several": return { title: "Several solutions", text: "It can be solved more than one way, so a player would have to guess. Add a clue that settles it." };
    case "one": return { title: "Exactly one solution", text: "It can be solved, one way only. Here it is." };
    case "solvable": return { title: "Solvable", text: "Any line that obeys the symbols solves a panel, so one is enough. Here is the first the solver found." };
    case "error": return { title: "Couldn't check", text: v.text };
  }
}

// ---- where two solutions differ ----

export interface Difference { cells: [number, number][]; values?: [string, string] }

/** Where two solutions differ: each square whose digit differs (with both digits), or else the
 *  squares whose shading or colour differ, or else those beside lines that differ, as one. */
export function differences(p: Puzzle, a: Board, b: Board): Difference[] {
  const g = p.grid, rc = (i: number) => g.rc(i) as [number, number];
  const out: Difference[] = [];
  for (let i = 0; i < g.cellCount; i++) if (a.digit[i] !== b.digit[i]) {
    const show = (d: number) => (d ? symbolOf(p, d) : "·");
    out.push({ cells: [rc(i)], values: [show(a.digit[i]), show(b.digit[i])] });
  }
  if (out.length) return out;
  const cells = new Set<number>();
  for (let i = 0; i < g.cellCount; i++) if ((a.shade[i] === 1) !== (b.shade[i] === 1) || a.color[i] !== b.color[i]) cells.add(i);
  if (!cells.size) {
    g.borders.forEach((bd, e) => { if ((a.fence[e] === 1) !== (b.fence[e] === 1) || a.cut[e] !== b.cut[e]) bd.cells.forEach((c) => c >= 0 && cells.add(c)); });
    g.links.forEach((l, k) => { if ((a.loop[k] === 1) !== (b.loop[k] === 1)) l.cells.forEach((c) => cells.add(c)); });
  }
  return cells.size ? [{ cells: [...cells].sort((x, y) => x - y).map(rc) }] : [];
}

// ---- the list ----

export type ItemKind = "rule" | "difference" | "fix" | "misfit";
export interface CheckItem {
  n: number;
  kind: ItemKind;
  /** a few words for the list ("Row 6") */
  place: string;
  /** what's wrong ("Two 5s in row 6") */
  text: string;
  /** the tip beside it on the paper: why, and what to do */
  tip: string;
  items: number[];
  cells: [number, number][];
  values?: [string, string];
  /** a broken rule's engine rule ("latin"…), when known */
  rule?: string;
}

const ORDER: Record<ItemKind, number> = { rule: 0, difference: 1, fix: 2, misfit: 3 };
const KIND_OF: Record<Problem["kind"], ItemKind> = { rule: "rule", incomplete: "fix", ambiguous: "fix", grid: "fix", "off-type": "misfit", "off-grid": "misfit", unsupported: "misfit" };

/** Why a broken rule is one, and what to do. */
function ruleTip(text: string, digits: string): string {
  if (/too big/.test(text)) return "Change it to one that fits, or erase it.";
  if (/thermometer/.test(text)) return "Digits rise from the bulb to the tip, at least one a square, so these can't all be right. Change or erase one of them.";
  const where = /in row/.test(text) ? "row" : /in column/.test(text) ? "column" : /in a box/.test(text) ? "box" : /in an area/.test(text) ? "area" : /in a line/.test(text) ? "line" : "";
  return where ? `Each ${where} holds ${digits} once, so one of these is wrong. Change or erase one of them.` : "Each one can appear only once, so one of these is wrong. Change or erase one of them.";
}
/** A place for the list: the row or column a rule names, else the first square. */
function placeOf(text: string, cells: [number, number][]): string {
  const rc = /in (row|column) (\d+)/.exec(text);
  if (rc) return `${rc[1][0].toUpperCase()}${rc[1].slice(1)} ${rc[2]}`;
  if (/in a box/.test(text)) return "A box";
  if (/in an area/.test(text)) return "An area";
  return cells.length ? `Row ${cells[0][0] + 1}, column ${cells[0][1] + 1}` : "The whole puzzle";
}

/** Check's list: what the converter found, and the solver's difference if any. */
export function checkList(conv: Conversion | null, opts: { digits?: string; differences?: Difference[] } = {}): CheckItem[] {
  if (!conv) return [];
  const raw: Omit<CheckItem, "n">[] = conv.problems.filter((p) => p.kind !== "unsupported").map((p) => {
    const kind = KIND_OF[p.kind], cells = p.cells ?? [];
    const tip = kind === "rule" ? ruleTip(p.text, opts.digits ?? "each digit")
      : p.kind === "off-type" ? "It's left out of the puzzle. Erase it, or keep it if it's only decoration."
      : p.kind === "off-grid" ? "It's left out of the puzzle. Move it onto the grid, or erase it."
      : p.kind === "ambiguous" ? "It's read the likelier way for now. Make it clear to be sure."
      : p.kind === "grid" ? "The type sets the grid's look: change it with the Grid tool."
      : "The puzzle needs this before it can be checked.";
    return { kind, place: kind === "misfit" ? (p.kind === "off-grid" ? "Not on the grid" : "Doesn't fit") : placeOf(p.text, cells), text: p.text, tip, items: p.items, cells, ...(p.rule ? { rule: p.rule } : {}) };
  });
  (opts.differences ?? []).forEach((d) => raw.push({
    kind: "difference", place: placeOf("", d.cells), cells: d.cells, items: [], values: d.values,
    text: d.values ? `This square can be a ${d.values[0]} or a ${d.values[1]}` : "The solutions differ here",
    tip: d.values ? `This square can be a ${d.values[0]} or a ${d.values[1]}, and the rest still works. Add a clue that settles it.`
      : "Two solutions differ here, and both obey every rule. Add a clue that settles it.",
  }));
  return raw.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]).map((x, i) => ({ ...x, n: i + 1 }));
}

// ---- on the paper ----

export interface Highlight {
  /** the squares involved, as outlines (rectangles' or hexagons' points, page units) */
  rings: m.XY[][];
  /** the drawing items involved: the box round each (page units) */
  boxes: { x: number; y: number; w: number; h: number }[];
  /** a dotted line joining the squares' centres, in order */
  join: m.XY[];
  /** where the numbered pin goes (the first mark's top-right) and where the tip points (the marks' top middle) */
  pin: m.XY | null;
  tip: m.XY | null;
  /** the marks' bounds */
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** A square's outline on the page. */
function ringOf(g: m.Grid, r: number, c: number): m.XY[] {
  const p = m.pointOf(g, { at: "cell", r, c }), S = g.S;
  if (g.shape === "hex") return Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return { x: p.x + HEX_SIDE * S * Math.cos(a), y: p.y + HEX_SIDE * S * Math.sin(a) };
  });
  const h = S / 2 - Math.min(3, S * 0.06);
  return [{ x: p.x - h, y: p.y - h }, { x: p.x + h, y: p.y - h }, { x: p.x + h, y: p.y + h }, { x: p.x - h, y: p.y + h }];
}

/** Where an item's ink is: the box round it. */
export function boxOf(d: m.Drawing, it: m.Item) {
  const g = d.grid, S = m.squareOf(d), at = (a: m.Anchor) => m.pointOf(g, a);
  const pts: m.XY[] = it.kind === "pen" || it.kind === "brush" ? it.points.map(at) : it.kind === "line" ? [at(it.from), at(it.to)]
    : it.kind === "gap" ? m.edgeEnds(it.at).map(at) : it.kind === "thermo" ? it.cells.map(([r, c]) => at({ at: "cell", r, c })) : [at(it.at)];
  const pad = it.kind === "wash" ? S / 2 : it.kind === "text" ? S * (it.small ? 0.2 : 0.36) : it.kind === "stamp" ? S * 0.4 : it.kind === "thermo" ? S * 0.42 : S * 0.15;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
}

/** Where a list item is on the paper. Errors ring their squares; what doesn't fit is boxed where
 *  it's drawn (its squares too, when it has no items). */
export function highlight(d: m.Drawing, item: Pick<CheckItem, "kind" | "items" | "cells">): Highlight {
  const g = d.grid;
  const ofItems = item.kind !== "rule" && item.kind !== "difference";
  const its = ofItems ? item.items.flatMap((id) => d.items.filter((x) => x.id === id)) : [];
  const boxes = its.map((it) => boxOf(d, it));
  const cells = g && (!ofItems || !boxes.length) ? item.cells : [];
  const rings = g ? cells.map(([r, c]) => ringOf(g, r, c)) : [];
  const join = g && rings.length > 1 ? cells.map(([r, c]) => m.pointOf(g, { at: "cell", r, c })) : [];
  return framed(rings, boxes, join);
}

/** The pin, tip and bounds of a mark made of these rings and boxes. */
function framed(rings: m.XY[][], boxes: Highlight["boxes"], join: m.XY[]): Highlight {
  const xs = [...rings.flat().map((p) => p.x), ...boxes.flatMap((b) => [b.x, b.x + b.w])];
  const ys = [...rings.flat().map((p) => p.y), ...boxes.flatMap((b) => [b.y, b.y + b.h])];
  if (!xs.length) return { rings, boxes, join, pin: null, tip: null, bounds: null };
  const bounds = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const first = rings[0] ?? [{ x: boxes[0].x, y: boxes[0].y }, { x: boxes[0].x + boxes[0].w, y: boxes[0].y }];
  const pin = { x: Math.max(...first.map((p) => p.x)), y: Math.min(...first.map((p) => p.y)) };
  // the tip hangs from the last square (the one most likely to be changed), or the marks' middle
  const last = rings[rings.length - 1];
  const tip = last ? { x: (Math.min(...last.map((p) => p.x)) + Math.max(...last.map((p) => p.x))) / 2, y: Math.min(...last.map((p) => p.y)) }
    : { x: (bounds.x0 + bounds.x1) / 2, y: bounds.y0 };
  return { rings, boxes, join, pin, tip, bounds };
}

/** Where one of the photo reader's doubts (games/doubts.ts) is on the paper: its square ringed, or
 *  a box round the rows, columns, block of squares or line of clues it's about. The whole puzzle
 *  has no mark. */
export function doubtHighlight(d: m.Drawing, doubt: Doubt): Highlight {
  const g = d.grid;
  if (!g || doubt.place === "whole" || !doubt.place) return { rings: [], boxes: [], join: [], pin: null, tip: null, bounds: null };
  const S = g.S, span = m.gridSpan(g), W = span.w * S, H = span.h * S, inset = Math.min(3, S * 0.06);
  const r0 = doubt.row ?? 0, r1 = doubt.row2 ?? r0, c0 = doubt.col ?? 0, c1 = doubt.col2 ?? c0;
  const rect = (x: number, y: number, w: number, h: number) => ({ x: x + inset, y: y + inset, w: w - 2 * inset, h: h - 2 * inset });
  const room = (v: number) => Math.max(S, Math.min(3 * S, v - 4));   // the clues beside the grid
  switch (doubt.place) {
    case "cell": return framed([ringOf(g, r0, c0)], [], []);
    case "row-clue": return framed([], [rect(g.x - room(g.x), g.y + r0 * S, room(g.x), S)], []);
    case "column-clue": return framed([], [rect(g.x + c0 * S, g.y - room(g.y), S, room(g.y))], []);
    case "rows": return framed([], [rect(g.x, g.y + r0 * S, W, (r1 - r0 + 1) * S)], []);
    case "columns": return framed([], [rect(g.x + c0 * S, g.y, (c1 - c0 + 1) * S, H)], []);
    case "area": return framed([], [rect(g.x + c0 * S, g.y + r0 * S, (c1 - c0 + 1) * S, (r1 - r0 + 1) * S)], []);
  }
}

/** The marks as SVG (the paper's overlay, never exported): `tone` "error" (orange rings, dotted
 *  join), "misfit" (red dashed boxes) or "doubt" (amber, the photo reader's); `n` the pin's label;
 *  `selected` draws it strongly. */
export function marksSvg(h: Highlight, tone: "error" | "misfit" | "doubt", n: number | string, selected: boolean, values?: [string, string]): string {
  const f = (v: number) => Math.round(v * 10) / 10;
  const cls = `sp-mark ${tone}${selected ? " selected" : ""}`;
  let out = "";
  if (h.join.length > 1) out += `<polyline class="sp-mark-join" points="${h.join.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}"/>`;
  for (const ring of h.rings) out += `<polygon class="sp-mark-ring" points="${ring.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}"/>`;
  for (const b of h.boxes) out += `<rect class="sp-mark-box" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" rx="4"/>`;
  if (values && h.rings[0]) {
    const r = h.rings[0], cx = r.reduce((s, p) => s + p.x, 0) / r.length, cy = r.reduce((s, p) => s + p.y, 0) / r.length;
    out += `<text class="sp-mark-values" x="${f(cx)}" y="${f(cy)}">${values.join("/")}</text>`;
  }
  if (h.pin) out += `<g class="sp-mark-pin"><circle cx="${f(h.pin.x)}" cy="${f(h.pin.y)}" r="9"/><text x="${f(h.pin.x)}" y="${f(h.pin.y)}">${n}</text></g>`;
  return `<g class="${cls}" data-n="${n}">${out}</g>`;
}

// ---- a solution, drawn on the paper ----

/** A solution over the drawing, in a light hand (while This puzzle's solution is pointed at): digits
 *  pencilled in the squares without a clue, shading washed, lines in blue. Never part of the
 *  drawing. Square grids and lattices; a honeycomb's digits and shading. */
export function solutionSvg(p: Puzzle, b: Board, g: m.Grid): string {
  const f = (v: number) => Math.round(v * 10) / 10, grid = p.grid;
  const centre = (i: number) => { const [r, c] = grid.rc(i); return m.pointOf(g, { at: "cell", r, c }); };
  let wash = "", ink = "";
  for (let i = 0; i < grid.cellCount; i++) {
    const [r, c] = grid.rc(i);
    if (b.shade[i] === 1 && !p.blocked.has(i)) wash += `<polygon class="sp-sol-shade" points="${ringOf(g, r, c).map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}"/>`;
    const given = (p.cellGivens.get(i) ?? []).some((x) => x.kind === "number");
    if (b.digit[i] && !given) { const q = centre(i); ink += `<text class="sp-sol-digit" x="${f(q.x)}" y="${f(q.y)}" style="font-size:${f(g.S * 0.42)}px">${symbolOf(p, b.digit[i])}</text>`; }
  }
  if (grid.kind !== "hex") {
    const corner = (v: number) => { const [r, c] = grid.cornerRC(v); return m.pointOf(g, { at: "corner", r, c }); };
    grid.borders.forEach((bd, e) => {
      if (b.fence[e] !== 1 && b.cut[e] !== 1) return;
      const [a, z] = bd.corners.map(corner);
      ink += `<line class="sp-sol-line" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(z.x)}" y2="${f(z.y)}"/>`;
    });
  }
  grid.links.forEach((l, k) => {
    if (b.loop[k] !== 1) return;
    const [a, z] = l.cells.map(centre);
    ink += `<line class="sp-sol-line" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(z.x)}" y2="${f(z.y)}"/>`;
  });
  return `<g class="sp-solution">${wash}${ink}</g>`;
}
