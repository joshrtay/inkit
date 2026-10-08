// Boards that aren't drawn as a square grid of lines: hexagons in rows (Hex Hidoku, Missing
// Number), a lattice of points with dots on it (Distance Path), and number paths (Hidoku, whose
// numbers run past 9). The still picture (picture.ts sends them here) and the player (game.ts
// sends them here) share one drawing, in the boards' look (docs/style.md): the grid in pen, rocks
// in wash, printed numbers in ink and the player's in a lighter blue, a lattice's dots as stones
// and the path between them in bold pen.
//
// Playing: digits as in a sudoku (tap a cell, then a number; numbers past 9 are typed a digit at a
// time, so 1 then 2 is 12), with the path from each number to the next drawn faintly behind them;
// on a lattice, drag from dot to dot to draw a segment (dragging back over one takes it away), or
// tap a segment to take it away.
import type { GameHost } from "../../lib/game-api";
import { addInk, washDefs } from "../../lib/ink";
import { check } from "../../engine/puzzle.ts";
import { HEX_SIDE, linkBetween } from "../../engine/geometry.ts";
import { pathNeighbours, rootText, sqLength } from "../../engine/rules.ts";
import { emptyBoard, type Board, type Puzzle } from "../../engine/types.ts";
import { stoneSvg } from "./panel-draw";
import { celebrate, stamp, unstamp } from "./celebrate";

const S = 48, M = 26, LENGTHS_ROOM = 46;
type A = Record<string, string | number>;
const n1 = (v: number) => Math.round(v * 10) / 10;
const tag = (name: string, a: A, body = "") => `<${name}${Object.entries(a).map(([k, v]) => ` ${k}="${String(typeof v === "number" ? n1(v) : v).replace(/"/g, "&quot;")}"`).join("")}${body ? `>${body}</${name}>` : "/>"}`;
const text = (a: A, s: string) => tag("text", a, s.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`));

/** Is this puzzle drawn here rather than as a square grid of lines? */
export const isShaped = (p: Puzzle) => p.grid.kind === "hex" || p.grid.kind === "lattice" || p.rules.some((s) => s.rule === "number-path");

export type Room = Partial<Record<"top" | "left" | "right" | "bottom", number>>;

/** Where things are, in the picture's units: each cell's centre, the margins, and the cell under a point. */
export function shapedLayout(p: Puzzle, room: Room = {}) {
  const g = p.grid;
  const ML = Math.max(M, room.left ?? 0), MT = Math.max(M, room.top ?? 0), MR = Math.max(M, room.right ?? 0);
  const MB = Math.max(M, room.bottom ?? 0, p.lengths ? LENGTHS_ROOM : 0);
  const W = ML + g.width * S + MR, H = MT + g.height * S + MB;
  const at = (i: number): [number, number] => { const [x, y] = g.cellXY(i); return [ML + x * S, MT + y * S]; };
  /** the cell whose centre is nearest (x, y), if it's within `reach` cells of it; else -1 */
  const cellAt = (x: number, y: number, reach = g.kind === "hex" ? HEX_SIDE : 0.72) => {
    let best = -1, d = Infinity;
    for (let i = 0; i < g.cellCount; i++) { const [cx, cy] = at(i), e = Math.hypot(cx - x, cy - y); if (e < d) { d = e; best = i; } }
    return d <= reach * S ? best : -1;
  };
  return { S, ML, MT, MR, MB, W, H, at, cellAt };
}
export type ShapedLayout = ReturnType<typeof shapedLayout>;

/** A cell's outline: a hexagon, or a square. */
export function cellOutline(p: Puzzle, lay: ShapedLayout, i: number, inset = 0): string {
  const [x, y] = lay.at(i);
  if (p.grid.kind === "hex") {
    const r = HEX_SIDE * S - inset;
    return Array.from({ length: 6 }, (_, k) => { const a = ((-90 + 60 * k) * Math.PI) / 180; return `${n1(x + r * Math.cos(a))},${n1(y + r * Math.sin(a))}`; }).join(" ");
  }
  const h = S / 2 - inset;
  return `${n1(x - h)},${n1(y - h)} ${n1(x + h)},${n1(y - h)} ${n1(x + h)},${n1(y + h)} ${n1(x - h)},${n1(y + h)}`;
}

export interface ShapedOptions {
  /** the selected cell, and cells to highlight as wrong (the player) */
  sel?: number;
  wrong?: number[];
  /** pencil notes (the player) */
  pencil?: boolean;
  room?: Room;
}

/** The drawing, in layers (back to front). `b` adds the player's marks. */
export function shapedLayers(p: Puzzle, b: Board | null, lay: ShapedLayout, opts: ShapedOptions = {}) {
  const g = p.grid, out = { tint: "", wash: "", grid: "", trail: "", lines: "", givens: "", marks: "", below: "" };
  const given = new Map<number, number>();
  for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") given.set(i, x.value);
  const digit = (i: number) => b?.digit[i] || given.get(i) || 0;

  if (g.kind === "lattice") {
    // every point of the lattice a faint dot; the dots to join are stones, over the path
    for (let i = 0; i < g.cellCount; i++) { const [x, y] = lay.at(i); out.grid += tag("circle", { class: "dot lattice-point", cx: x, cy: y, r: 2.6 }); }
    for (const i of p.pegs) { const [x, y] = lay.at(i); out.givens += stoneSvg("black", x, y, S * 0.2, "pearl peg"); }
    if (b) for (const l of g.links) if (b.loop[l.id] === 1) {
      const [[x1, y1], [x2, y2]] = l.cells.map(lay.at);
      out.lines += tag("line", { class: `mark pen segment${opts.wrong?.includes(-1 - l.id) ? " wrong" : ""}`, x1, y1, x2, y2 });
    }
    // the lengths, under the board; each one the path uses is crossed off
    if (p.lengths) {
      const used = new Map<number, number>();
      if (b) for (const l of g.links) if (b.loop[l.id] === 1) { const d = sqLength(p, l.id); used.set(d, (used.get(d) ?? 0) + 1); }
      const items = [...p.lengths].sort((x, y) => x - y), gap = 46, x0 = lay.W / 2 - ((items.length - 1) * gap) / 2, y = lay.H - LENGTHS_ROOM / 2 - 2;
      items.forEach((d, k) => {
        const left = used.get(d) ?? 0;
        if (left) used.set(d, left - 1);
        out.below += text({ class: `clue length${left ? " done" : ""}`, x: x0 + k * gap, y }, rootText(d));
      });
    }
    return out;
  }

  // cells: rocks, the selection, mistakes
  for (const i of p.blocked) out.wash += tag("polygon", { class: "rock", points: cellOutline(p, lay, i, -0.5) });
  if (opts.sel !== undefined && opts.sel >= 0) out.tint += tag("polygon", { class: "sel", points: cellOutline(p, lay, opts.sel) });
  for (const i of opts.wrong ?? []) if (i >= 0) out.tint += tag("polygon", { class: "wrong-cell", points: cellOutline(p, lay, i, 3) });
  // the grid: inner sides faint, the outside edge in medium pen
  if (g.kind === "hex") {
    let frame = "";
    for (const e of g.borders) {
      const [[x1, y1], [x2, y2]] = e.corners.map((v) => { const [x, y] = g.cornerXY(v); return [lay.ML + x * S, lay.MT + y * S]; });
      if (e.link >= 0) out.grid += tag("line", { class: "gridline", x1, y1, x2, y2 });
      else frame += `M${n1(x1)} ${n1(y1)}L${n1(x2)} ${n1(y2)}`;
    }
    out.grid += tag("path", { class: "frame", d: frame, "stroke-linecap": "round" });
  } else {
    const { ML, MT } = lay;
    for (let r = 1; r < g.rows; r++) out.grid += tag("line", { class: "gridline", x1: ML, y1: MT + r * S, x2: ML + g.cols * S, y2: MT + r * S });
    for (let c = 1; c < g.cols; c++) out.grid += tag("line", { class: "gridline", x1: ML + c * S, y1: MT, x2: ML + c * S, y2: MT + g.rows * S });
    out.grid += tag("rect", { class: "frame", x: ML, y: MT, width: g.cols * S, height: g.rows * S });
  }
  // a number path: a faint trail from each number to the next one, where they touch
  const path = p.rules.find((s) => s.rule === "number-path");
  if (path) {
    const where = new Map<number, number>();
    for (let i = 0; i < g.cellCount; i++) if (digit(i)) where.set(digit(i), i);
    for (const [d, i] of where) {
      const j = where.get(d + 1);
      if (j === undefined || !pathNeighbours(path, p, i).includes(j)) continue;
      const [[x1, y1], [x2, y2]] = [lay.at(i), lay.at(j)];
      out.trail += tag("line", { class: "num-trail", x1, y1, x2, y2 });
    }
  }
  // numbers: printed ones in ink, the player's lighter; pencil notes small, in a ring
  for (let i = 0; i < g.cellCount; i++) {
    const [x, y] = lay.at(i), d = digit(i);
    if (d) out.marks += text({ class: given.has(i) ? "digit given" : "digit", x, y: y + 2 }, String(d));
    else if (b && opts.pencil && b.pencil[i]) {
      const notes = Array.from({ length: 15 }, (_, k) => k + 1).filter((k) => b.pencil[i] & (1 << k));
      notes.forEach((k, j) => {
        const a = -Math.PI / 2 + (2 * Math.PI * j) / Math.max(notes.length, 1), r = notes.length > 1 ? S * 0.26 : 0;
        out.marks += text({ class: "pencil", x: x + r * Math.cos(a), y: y + r * Math.sin(a) + 1 }, String(k));
      });
    }
  }
  return out;
}

/** The still picture. */
export function shapedSvg(p: Puzzle, b: Board | null | undefined, label: string, opts: ShapedOptions = {}): string {
  const lay = shapedLayout(p, opts.room), L = shapedLayers(p, b ?? null, lay, opts), wash = washDefs(lay.W);
  return `<svg class="board picture" viewBox="0 0 ${n1(lay.W)} ${n1(lay.H)}" role="img" aria-label="${label.replace(/"/g, "&quot;")}" style="--ratio:${n1(lay.W / lay.H)};--wash:url(#${wash.id})">` + wash.svg
    + tag("g", {}, L.tint) + tag("g", { class: "wash" }, L.wash) + tag("g", { class: "gridlines" }, L.grid) + tag("g", {}, L.trail)
    + tag("g", {}, L.lines) + tag("g", {}, L.givens) + tag("g", { class: "marks" }, L.marks) + tag("g", { class: "runs" }, L.below) + "</svg>";
}

// ---- the player ----

interface Saved { digit?: number[]; pencil?: number[]; loop?: number[] }
const NS = "http://www.w3.org/2000/svg";

export function createShaped(p: Puzzle, root: HTMLElement, host: GameHost) {
  const g = p.grid, lattice = g.kind === "lattice", lay = shapedLayout(p);
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T | null;
  const svg = q<SVGSVGElement>("svg.board")!;
  svg.setAttribute("viewBox", `0 0 ${n1(lay.W)} ${n1(lay.H)}`);
  addInk(svg, root);
  root.classList.add("shaped");
  const layer = (cls = "") => { const e = document.createElementNS(NS, "g"); if (cls) e.setAttribute("class", cls); svg.appendChild(e); return e; };
  const gTint = layer(), gWash = layer("wash"), gGrid = layer("gridlines"), gTrail = layer(), gLines = layer(), gHead = layer("line-head"), gGivens = layer(), gMarks = layer("marks"), gBelow = layer("runs");

  const board = emptyBoard(g), given = new Map<number, number>();
  for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") { given.set(i, x.value); board.digit[i] = x.value; }
  const saved = host.load<Saved>();
  if (saved) for (const k of ["digit", "pencil", "loop"] as const) saved[k]?.forEach((v, i) => { if (i < board[k].length && !(k === "digit" && given.has(i))) board[k][i] = v; });
  const pencilOk = !lattice && p.digits <= 15;
  if (!pencilOk) q("[data-pencil]")?.remove();

  const status = q<HTMLElement>(".status")!;
  const say = (t: string, tone: "" | "good" | "warn" | "good said" = "") => { status.className = `status ${tone}`.trim(); status.textContent = t; };
  let sel = -1, solved = false, reported = false, pencilMode = false, typed = "";
  let history: [keyof Board, number, number][][] = [], changes: [keyof Board, number, number][] = [];
  const put = (k: "digit" | "pencil" | "loop", i: number, v: number) => { if (board[k][i] === v) return; changes.push([k, i, board[k][i]]); board[k][i] = v; };

  function render() {
    const L = shapedLayers(p, board, lay, { sel: solved ? -1 : sel, pencil: pencilOk });
    gTint.innerHTML = L.tint; gWash.innerHTML = L.wash; gGrid.innerHTML = L.grid; gTrail.innerHTML = L.trail;
    gLines.innerHTML = L.lines; gGivens.innerHTML = L.givens; gMarks.innerHTML = L.marks; gBelow.innerHTML = L.below;
    root.classList.toggle("solved", solved);
  }
  function settle() {
    if (changes.length) { history.push(changes); changes = []; }
    const was = solved;
    solved = check(p, board).length === 0;
    if (solved && !was) {
      say("Solved!", "good said"); sel = -1;
      celebrate(root, [getComputedStyle(root).getPropertyValue("--paper-ink").trim() || "#26398f"]);
      if (!reported) { reported = true; host.solved({}); }
    } else if (!solved && was) { say(""); unstamp(root); }
    const out: Saved = {};
    for (const k of ["digit", "pencil", "loop"] as const) if (board[k].some((v, i) => v && !(k === "digit" && given.has(i)))) out[k] = [...board[k]];
    host.save(out);
    render();
  }
  const toBoard = (evt: PointerEvent): [number, number] => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [r.x, r.y];
  };

  // ---- digits ----
  const enter = (d: number) => {
    if (sel < 0 || solved || given.has(sel)) return;
    if (d === 0) { put("digit", sel, 0); put("pencil", sel, 0); }
    else if (pencilMode && pencilOk) { if (!board.digit[sel]) put("pencil", sel, board.pencil[sel] ^ (1 << d)); }
    else put("digit", sel, d);
    settle();
  };
  /** a digit key: numbers past 9 are typed a digit at a time (1 then 2 is 12) */
  const key = (k: number) => {
    const longer = typed ? Number(typed + k) : NaN;
    typed = p.digits > 9 && longer <= p.digits ? String(longer) : String(k);
    const v = Number(typed);
    if (v >= 1 && v <= p.digits) enter(v);
    if (v === 0 || v * 10 > p.digits) typed = "";
  };
  const select = (i: number) => { sel = i >= 0 && !given.has(i) && !p.blocked.has(i) ? i : -1; typed = ""; render(); };
  const pencilBtn = q<HTMLButtonElement>("[data-pencil]");
  const setPencil = (on: boolean) => { pencilMode = on; pencilBtn?.setAttribute("aria-pressed", String(on)); };
  pencilBtn?.addEventListener("click", () => setPencil(!pencilMode));
  root.querySelectorAll<HTMLButtonElement>("[data-digit]").forEach((b) => b.addEventListener("click", () => { typed = ""; enter(Number(b.dataset.digit)); }));
  root.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((b) => b.addEventListener("click", () => key(Number(b.dataset.key))));
  const onKey = (e: KeyboardEvent) => {
    const t = e.target;
    if (lattice || (t instanceof Element && t.closest("input, textarea, select, dialog"))) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (e.key in moves) {
      e.preventDefault();
      let [r, c] = sel >= 0 ? g.rc(sel) : [0, -1];
      const [dr, dc] = moves[e.key];
      for (let k = 0; k < g.cellCount; k++) {
        r = (r + dr + g.rows) % g.rows; c = (c + dc + g.cols) % g.cols;
        const i = g.cell(r, c);
        if (!given.has(i) && !p.blocked.has(i)) break;
      }
      select(g.cell(r, c));
    } else if (/^[0-9]$/.test(e.key)) key(Number(e.key));
    else if (e.key === "Backspace" || e.key === "Delete") { typed = ""; enter(0); }
    else if ((e.key === "p" || e.key === "P") && pencilOk) setPencil(!pencilMode);
  };
  document.addEventListener("keydown", onKey);

  // ---- a lattice's path: drag from dot to dot ----
  let drag: { at: number; moved: boolean; start: [number, number] } | null = null;
  const pegs = new Set(p.pegs);
  const pegAt = (x: number, y: number, reach = 0.4) => { const i = lay.cellAt(x, y, reach); return pegs.has(i) ? i : -1; };
  /** the drawn segment nearest (x, y), if it's close */
  const segmentAt = (x: number, y: number) => {
    let best = -1, d = 12;
    for (const l of g.links) {
      if (board.loop[l.id] !== 1) continue;
      const [[x1, y1], [x2, y2]] = l.cells.map(lay.at), dx = x2 - x1, dy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
      const e = Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
      if (e < d) { d = e; best = l.id; }
    }
    return best;
  };
  const head = (from: number, [x, y]: [number, number]) => {
    const [x1, y1] = lay.at(from);
    gHead.innerHTML = tag("line", { class: "pen", x1, y1, x2: x, y2: y }) + tag("circle", { class: "tip", cx: x, cy: y, r: 4.6 });
  };
  svg.addEventListener("pointerdown", (evt) => {
    if (solved) return;
    const [x, y] = toBoard(evt);
    if (!lattice) { select(lay.cellAt(x, y)); return; }
    const i = pegAt(x, y);
    if (i >= 0) {
      drag = { at: i, moved: false, start: [x, y] };
      try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
      head(i, [x, y]);
      return;
    }
    const l = segmentAt(x, y);
    if (l >= 0) { put("loop", l, 0); settle(); }
  });
  svg.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const [x, y] = toBoard(evt);
    if (Math.hypot(x - drag.start[0], y - drag.start[1]) > S * 0.3) drag.moved = true;
    const j = pegAt(x, y, 0.3);
    if (j >= 0 && j !== drag.at) {
      const l = linkBetween(g, drag.at, j);
      if (l >= 0) { put("loop", l, board.loop[l] === 1 ? 0 : 1); render(); try { navigator.vibrate?.(6); } catch { /* not allowed */ } }
      drag.at = j;
    }
    head(drag.at, [x, y]);
  });
  const end = () => { if (!drag) return; drag = null; gHead.replaceChildren(); settle(); };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);

  // ---- undo and reset ----
  q<HTMLButtonElement>("[data-undo]")?.addEventListener("click", () => {
    if (solved) return;
    const last = history.pop();
    if (!last) return;
    for (const [k, i, v] of last.reverse()) board[k][i] = v;
    changes = []; settle();
  });
  const reset = q<HTMLButtonElement>("[data-reset]");
  let confirming = false;
  reset?.addEventListener("click", () => {
    if (!confirming) {
      confirming = true; reset.dataset.confirm = "Clear the board? Tap again";
      setTimeout(() => { confirming = false; delete reset.dataset.confirm; }, 3000);
      return;
    }
    confirming = false; delete reset.dataset.confirm;
    board.digit.fill(0); board.pencil.fill(0); board.loop.fill(0);
    for (const [i, d] of given) board.digit[i] = d;
    history = []; changes = []; solved = false; reported = false; sel = -1;
    say(""); unstamp(root); settle();
  });

  solved = check(p, board).length === 0;
  reported = solved;
  if (solved) { say("Solved!", "good said"); stamp(root); }
  render();
  return () => document.removeEventListener("keydown", onKey);
}
