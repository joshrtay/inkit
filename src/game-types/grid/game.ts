// Grid engine player: draws a puzzle of any grid genre on the paper and handles the
// gestures for its marks (docs/grid-engine.md, "Playing"):
//   fence / cut   drag along the lines from corner to corner; tap a line to cycle it
//   loop          drag from cell to cell; tap between two cells to cycle the link
//   shade         tap cycles shaded / dot / empty; dragging paints what the first cell got
//   color         pick a pot and paint cells (regions puzzles)
// One gesture is one undo step. The same rule checks the build used decide when it's solved.
import type { MountGame } from "../../lib/game";
import { addInk } from "../../lib/ink";
import { check, makePuzzle } from "../../engine/puzzle.ts";
import { regionsOf } from "../../engine/derive.ts";
import { emptyBoard, type Board, type Problem } from "../../engine/types.ts";
import type { GridClientConfig } from "./types";

type Layer = keyof Board;
type Saved = Partial<Record<Layer, number[]>>;
type Change = [Layer, number, number];          // layer, index, previous value

const S = 48, M = 26;                           // cell size and margin, in board units
const NS = "http://www.w3.org/2000/svg";

export const createGrid = (config: GridClientConfig): MountGame => (root, host) => {
  const p = makePuzzle(config.spec), g = p.grid, marks = p.marks;
  const regionsPuzzle = marks.includes("regions");
  const palette = p.style.palette ?? [];
  const board = emptyBoard(g);
  const saved = host.load<Saved>();
  if (saved) for (const k of Object.keys(board) as Layer[]) saved[k]?.forEach((v, i) => { if (i < board[k].length) board[k][i] = v; });

  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const svg = q<SVGSVGElement>("svg.board");
  svg.setAttribute("viewBox", `0 0 ${g.cols * S + 2 * M} ${g.rows * S + 2 * M}`);
  addInk(svg, root);
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };
  const X = (c: number) => M + c * S, Y = (r: number) => M + r * S;
  const center = (i: number): [number, number] => { const [r, c] = g.rc(i); return [X(c) + S / 2, Y(r) + S / 2]; };
  const cornerXY = (v: number): [number, number] => { const [r, c] = g.cornerRC(v); return [X(c), Y(r)]; };
  const borderXY = (e: number) => g.borders[e].corners.map(cornerXY) as [[number, number], [number, number]];

  // ---- layers, back to front ----
  const gWash = el("g", { class: "wash" }), gGrid = el("g", {}), gLines = el("g", {}), gGivens = el("g", {});
  const gMarks = el("g", {}), gErr = el("g", { class: "errors" });

  // the grid itself
  if (p.style.grid === "dots") {
    for (let v = 0; v < g.cornerCount; v++) { const [x, y] = cornerXY(v); el("circle", { class: "dot", cx: x, cy: y, r: 2.6 }, gGrid); }
  } else {
    for (const e of g.borders) {
      if (e.link < 0) continue;
      const [[x1, y1], [x2, y2]] = borderXY(e.id);
      el("line", { class: "gridline", x1, y1, x2, y2 }, gGrid);
    }
    el("rect", { class: regionsPuzzle ? "frame lead" : "frame", x: M, y: M, width: g.cols * S, height: g.rows * S }, regionsPuzzle ? gLines : gGrid);
  }

  // the clues
  for (const [i, gs] of p.cellGivens) for (const giv of gs) {
    const [x, y] = center(i);
    if (giv.kind === "number") el("text", { class: "clue", x, y: y + 1 }, gGivens).textContent = String(giv.value);
    else if (giv.kind === "symbol") el("text", { class: "clue symbol", x, y: y + 1 }, gGivens).textContent = "✦";
    else if (giv.kind === "compass") {
      const c = el("g", { class: "compass" }, gGivens);
      el("path", { d: `M${x} ${y - 7}V${y + 7}M${x - 7} ${y}H${x + 7}` }, c);
      const at = { n: [x, y - 14], s: [x, y + 15], e: [x + 15, y + 1], w: [x - 15, y + 1] } as const;
      for (const d of ["n", "e", "s", "w"] as const) {
        const v = giv.value[d];
        if (v !== undefined) el("text", { class: "clue small", x: at[d][0], y: at[d][1] }, c).textContent = String(v);
      }
    }
  }
  for (const [e, gs] of p.borderGivens) for (const giv of gs) {
    const [[x1, y1], [x2, y2]] = borderXY(e), x = (x1 + x2) / 2, y = (y1 + y2) / 2, d = 8;
    el("path", { class: `diamond ${giv.kind}`, d: `M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z` }, gGivens);
  }

  // ---- drawing the board ----
  const status = q<HTMLElement>(".status");
  let solved = false, reported = false;
  const say = (text: string, tone: "" | "good" | "warn" = "") => { status.className = `status ${tone}`.trim(); status.textContent = text; };

  /** colors to show: the player's paint, or (once solved) a coloring of the panes they cut */
  function glassColors(): number[] {
    const colors = [...board.color];
    if (!regionsPuzzle || !solved || colors.some((c) => c > 0)) return colors;
    const reg = regionsOf(p, board), pick: number[] = [];
    reg.cells.forEach((cs, k) => {
      const near = new Set<number>();
      for (const i of cs) for (const l of g.cellLinks[i]) {
        const [a, b] = g.links[l].cells, n = a === i ? b : a, rk = reg.of[n];
        if (rk !== k && pick[rk] !== undefined) near.add(pick[rk]);
      }
      let c = 1; while (near.has(c) && c < palette.length) c++;
      pick[k] = c;
    });
    return reg.of.map((k) => pick[k] ?? 0);
  }

  function render() {
    gWash.replaceChildren(); gLines.querySelectorAll(".mark").forEach((n) => n.remove()); gMarks.replaceChildren();
    const colors = glassColors();
    for (let i = 0; i < g.cellCount; i++) {
      const [r, c] = g.rc(i);
      if (marks.includes("shade") && board.shade[i] === 1) el("rect", { class: "shaded", x: X(c), y: Y(r), width: S, height: S }, gWash);
      if (regionsPuzzle && colors[i] > 0) el("rect", { x: X(c) - 0.5, y: Y(r) - 0.5, width: S + 1, height: S + 1, fill: palette[colors[i] - 1] ?? "#ccc" }, gWash);
      if (marks.includes("shade") && board.shade[i] === 2) { const [x, y] = center(i); el("circle", { class: "dotmark", cx: x, cy: y, r: 3.5 }, gMarks); }
    }
    for (const e of g.borders) {
      const [[x1, y1], [x2, y2]] = borderXY(e.id);
      if (marks.includes("fence") && board.fence[e.id] === 1) el("line", { class: "mark pen", x1, y1, x2, y2 }, gLines);
      if (marks.includes("fence") && board.fence[e.id] === 2) xMark((x1 + x2) / 2, (y1 + y2) / 2);
      if (regionsPuzzle && e.link >= 0) {
        const [a, b] = e.cells;
        if (board.cut[e.id] === 1 || colors[a] !== colors[b]) el("line", { class: "mark lead", x1, y1, x2, y2 }, gLines);
      }
    }
    if (marks.includes("loop")) for (const l of g.links) {
      const [x1, y1] = center(l.cells[0]), [x2, y2] = center(l.cells[1]);
      if (board.loop[l.id] === 1) el("line", { class: "mark river", x1, y1, x2, y2 }, gLines);
      if (board.loop[l.id] === 2) xMark((x1 + x2) / 2, (y1 + y2) / 2);
    }
    root.classList.toggle("solved", solved);
  }
  const xMark = (x: number, y: number, d = 5) => el("path", { class: "xmark", d: `M${x - d} ${y - d}L${x + d} ${y + d}M${x + d} ${y - d}L${x - d} ${y + d}` }, gMarks);

  function showProblems(ps: Problem[]) {
    gErr.replaceChildren();
    for (const pr of ps) {
      for (const i of pr.cells ?? []) { const [r, c] = g.rc(i); el("rect", { x: X(c), y: Y(r), width: S, height: S }, gErr); }
      for (const e of pr.borders ?? []) { const [[x1, y1], [x2, y2]] = borderXY(e); el("line", { x1, y1, x2, y2 }, gErr); }
      for (const l of pr.links ?? []) { const [x1, y1] = center(g.links[l].cells[0]), [x2, y2] = center(g.links[l].cells[1]); el("line", { x1, y1, x2, y2 }, gErr); }
    }
  }
  let errTimer = 0;
  const clearProblems = () => { gErr.replaceChildren(); clearTimeout(errTimer); };

  function afterChange() {
    const ps = check(p, board);
    const was = solved;
    solved = ps.length === 0;
    if (solved && !was) say("Solved!", "good");
    else if (!solved && status.classList.contains("good")) say("");
    render();
    if (solved && !reported) { reported = true; host.solved({}); }
    const out: Saved = {};
    for (const k of Object.keys(board) as Layer[]) if (board[k].some((v) => v)) out[k] = [...board[k]];
    host.save(out);
  }

  // ---- gestures ----
  let history: Change[][] = [];
  let changes: Change[] = [];
  const set = (layer: Layer, i: number, v: number) => {
    if (board[layer][i] === v) return;
    changes.push([layer, i, board[layer][i]]);
    board[layer][i] = v;
  };
  const toBoard = (evt: PointerEvent) => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [r.x, r.y] as [number, number];
  };
  const cellAt = ([x, y]: [number, number]) => {
    const c = Math.floor((x - M) / S), r = Math.floor((y - M) / S);
    return r >= 0 && r < g.rows && c >= 0 && c < g.cols ? g.cell(r, c) : -1;
  };
  const nearestCorner = ([x, y]: [number, number]) => {
    const r = Math.max(0, Math.min(g.rows, Math.round((y - M) / S))), c = Math.max(0, Math.min(g.cols, Math.round((x - M) / S)));
    return { v: g.corner(r, c), d: Math.hypot(x - X(c), y - Y(r)) };
  };
  /** the border nearest a point, and how far it is */
  const nearestBorder = ([x, y]: [number, number]) => {
    const fx = (x - M) / S, fy = (y - M) / S;
    const hr = Math.round(fy), hc = Math.floor(fx), vr = Math.floor(fy), vc = Math.round(fx);
    const h = hr >= 0 && hr <= g.rows && hc >= 0 && hc < g.cols ? { e: hr * g.cols + hc, d: Math.abs(fy - hr) * S } : null;
    const v = vr >= 0 && vr < g.rows && vc >= 0 && vc <= g.cols ? { e: (g.rows + 1) * g.cols + vr * (g.cols + 1) + vc, d: Math.abs(fx - vc) * S } : null;
    return !h ? v : !v ? h : h.d <= v.d ? h : v;
  };
  const sharedBorder = (v1: number, v2: number) => g.cornerBorders[v1].find((e) => g.cornerBorders[v2].includes(e)) ?? -1;

  type Drag =
    | { kind: "edges"; layer: "fence" | "cut"; last: number; tapBorder: number; mode: number | null; start: [number, number]; moved: boolean }
    | { kind: "links"; last: number; tapLink: number; mode: number | null; start: [number, number]; moved: boolean }
    | { kind: "cells"; layer: "shade" | "color"; value: number; last: number };
  let drag: Drag | null = null;

  /** toggle the edge between two corners (fence / cut) in the drag's mode */
  const dragEdge = (d: Extract<Drag, { kind: "edges" }>, to: number) => {
    const [r0, c0] = g.cornerRC(d.last), [r1, c1] = g.cornerRC(to);
    if (r0 !== r1 && c0 !== c1) return;   // only straight runs along the grid
    const steps = Math.abs(r1 - r0) + Math.abs(c1 - c0), dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
    let cur = d.last;
    for (let k = 0; k < steps; k++) {
      const [r, c] = g.cornerRC(cur), next = g.corner(r + dr, c + dc), e = sharedBorder(cur, next);
      if (e >= 0 && (d.layer === "fence" || g.borders[e].link >= 0)) {
        d.mode ??= board[d.layer][e] === 1 ? 0 : 1;
        set(d.layer, e, d.mode);
      }
      cur = next;
    }
    d.last = to;
  };
  const dragLink = (d: Extract<Drag, { kind: "links" }>, to: number) => {
    const l = g.cellLinks[d.last].find((x) => g.links[x].cells.includes(to));
    if (l === undefined) return;
    d.mode ??= board.loop[l] === 1 ? 0 : 1;
    set("loop", l, d.mode);
    d.last = to;
  };
  let brush = 1;

  svg.addEventListener("contextmenu", (e) => e.preventDefault());
  svg.addEventListener("pointerdown", (evt) => {
    if (solved) return;
    const pt = toBoard(evt), back = evt.button === 2;
    changes = []; clearProblems();
    const nb = nearestBorder(pt);
    if (marks.includes("fence") || (regionsPuzzle && nb && nb.d < S * 0.22 && g.borders[nb.e].link >= 0)) {
      drag = { kind: "edges", layer: marks.includes("fence") ? "fence" : "cut", last: nearestCorner(pt).v, tapBorder: nb ? nb.e : -1, mode: null, start: pt, moved: false };
    } else if (marks.includes("loop")) {
      const i = cellAt(pt);
      if (i < 0) return;
      const near = nb && nb.d < S * 0.2 ? g.borders[nb.e].link : -1;
      drag = { kind: "links", last: i, tapLink: near, mode: null, start: pt, moved: false };
    } else {
      const i = cellAt(pt);
      if (i < 0) return;
      if (marks.includes("shade")) {
        if (p.cellGivens.has(i)) return;
        const v = (board.shade[i] + (back ? 2 : 1)) % 3;
        drag = { kind: "cells", layer: "shade", value: v, last: i };
        set("shade", i, v);
      } else if (regionsPuzzle) {
        const v = board.color[i] === brush ? 0 : brush;
        drag = { kind: "cells", layer: "color", value: v, last: i };
        set("color", i, v);
      }
    }
    if (!drag) return;
    try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
    render();
  });
  svg.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const pt = toBoard(evt);
    if (drag.kind === "cells") {
      const i = cellAt(pt);
      if (i >= 0 && i !== drag.last && !(drag.layer === "shade" && p.cellGivens.has(i))) { set(drag.layer, i, drag.value); drag.last = i; render(); }
      return;
    }
    if (!drag.moved && Math.hypot(pt[0] - drag.start[0], pt[1] - drag.start[1]) < S * 0.3) return;
    drag.moved = true;
    if (drag.kind === "edges") {
      const { v, d } = nearestCorner(pt);
      if (d < S * 0.42 && v !== drag.last) { dragEdge(drag, v); render(); }
    } else {
      const i = cellAt(pt);
      if (i >= 0 && i !== drag.last) { dragLink(drag, i); render(); }
    }
  });
  const end = () => {
    if (!drag) return;
    if (drag.kind === "edges" && !drag.moved && drag.tapBorder >= 0) {
      const e = drag.tapBorder;
      if (drag.layer === "fence") set("fence", e, (board.fence[e] + 1) % 3);
      else if (g.borders[e].link >= 0) set("cut", e, board.cut[e] ? 0 : 1);
    }
    if (drag.kind === "links" && !drag.moved && drag.tapLink >= 0) set("loop", drag.tapLink, (board.loop[drag.tapLink] + 1) % 3);
    drag = null;
    if (changes.length) { history.push(changes); afterChange(); }
    changes = [];
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);

  // ---- controls on the paper ----
  root.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((pot) => pot.addEventListener("click", () => {
    brush = Number(pot.dataset.color);
    root.querySelectorAll("[data-color]").forEach((x) => x.setAttribute("aria-pressed", String(x === pot)));
  }));
  q<HTMLButtonElement>("[data-undo]").addEventListener("click", () => {
    const last = history.pop();
    if (!last) return;
    for (const [layer, i, v] of last.reverse()) board[layer][i] = v;
    clearProblems(); afterChange();
  });
  q<HTMLButtonElement>("[data-check]").addEventListener("click", () => {
    const ps = check(p, board);
    if (!ps.length) { say("Solved!", "good"); return; }
    say(ps[0].message, "warn");
    showProblems(ps.filter((x) => x.message === ps[0].message));   // just what the note is about
    clearTimeout(errTimer);
    errTimer = window.setTimeout(() => { clearProblems(); if (status.classList.contains("warn")) say(""); }, 4000);
  });
  const reset = q<HTMLButtonElement>("[data-reset]");
  let confirming = false;
  reset.addEventListener("click", () => {
    if (!confirming) {
      confirming = true; reset.dataset.confirm = "Clear the board? Tap again";
      setTimeout(() => { confirming = false; delete reset.dataset.confirm; }, 3000);
      return;
    }
    confirming = false; delete reset.dataset.confirm;
    for (const k of Object.keys(board) as Layer[]) board[k].fill(0);
    history = []; solved = false; reported = false; say(""); clearProblems(); afterChange();
  });

  solved = check(p, board).length === 0;
  reported = solved;
  if (solved) say("Solved!", "good");
  render();
};

/** Mount every grid board on the page (each carries its config and id as data attributes). */
export function mountAll(createHost: (id: string) => Parameters<MountGame>[1]) {
  document.querySelectorAll<HTMLElement>("[data-game-type=grid]").forEach((root) => {
    const config = JSON.parse(root.dataset.config!) as GridClientConfig;
    createGrid(config)(root, createHost(root.dataset.gameId!));
  });
}
