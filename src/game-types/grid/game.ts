// Grid engine player: draws a puzzle of any grid genre on the paper and handles the
// gestures for its marks (docs/grid-engine.md, "Playing"):
//   fence / cut   drag along the lines from corner to corner; tap a line to cycle it
//   loop          drag from cell to cell; tap between two cells to cycle the link
//   shade         tap cycles shaded / empty mark / clear; dragging paints what the first cell got
//   color         pick a pot and paint cells (regions puzzles)
//   digit         tap a cell, then a number on the pad or the keyboard; pencil notes too
// A maze (doors in its edge) is drawn with fence; once its walls check out, the player walks it
// (walk.ts), and it's solved on the way out. Paint puzzles (figures of pieces) play in figure.ts.
// One gesture is one undo step. The same rule checks the build used decide when it's solved.
import type { MountGame } from "../../lib/game-api";
import { addInk } from "../../lib/ink";
import { check, makePuzzle } from "../../engine/puzzle.ts";
import { regionsOf } from "../../engine/derive.ts";
import { blockFor, boxLines, runsOf, symbolOf, type Hint } from "../../engine/rules.ts";
import { emptyBoard, type Board, type Problem } from "../../engine/types.ts";
import type { GridClientConfig } from "./types";
import { createWalk } from "./walk";
import { createFigure } from "./figure";

type Layer = keyof Board;
interface Saved extends Partial<Record<Layer, number[]>> { ticks?: string[]; trail?: number[] }
type Change = [Layer, number, number];          // layer, index, previous value

const S = 48, M = 26;                           // cell size and plain margin, in board units
const NS = "http://www.w3.org/2000/svg";
const PREFS = "wyattsgames:mosaic-prefs";       // nonogram helpers (same key as before the engine)

/** Line colors for Numberlink pairs, by number. */
const LINK_COLORS = ["#3fb0e6", "#ef5a6a", "#7cc68f", "#f29a38", "#a77bd6", "#f07ab8", "#f7cf3d", "#4fb3a9", "#c98a5b"];

/** A five-pointed star around (x, y). */
const starPath = (x: number, y: number, r: number) => Array.from({ length: 10 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / 5, d = k % 2 ? r * 0.42 : r;
  return `${k ? "L" : "M"}${(x + d * Math.cos(a)).toFixed(1)} ${(y + d * Math.sin(a)).toFixed(1)}`;
}).join("") + "Z";

export const createGrid = (config: GridClientConfig): MountGame => (root, host) => {
  const p = makePuzzle(config.spec), g = p.grid, marks = p.marks;
  if (marks.includes("paint")) return createFigure(p, root, host);   // painted pieces (Three Coats)
  const regionsPuzzle = marks.includes("regions"), digits = marks.includes("digit");
  const nonogram = p.rowRuns.size + p.colRuns.size > 0;
  const links = p.rules.some((s) => s.rule === "links");
  const palette = p.style.palette ?? [];
  const board = emptyBoard(g);
  const saved = host.load<Saved>();
  if (saved) for (const k of Object.keys(board) as Layer[]) saved[k]?.forEach((v, i) => { if (i < board[k].length) board[k][i] = v; });
  const ticks = new Set<string>(saved?.ticks ?? []);
  // a maze: its given walls start drawn, and neither they nor its doors can be changed
  const maze = p.rules.some((s) => s.rule === "perfect-maze");
  const givenWalls = maze ? [...p.walls].map((l) => g.links[l].border) : [];
  const locked = new Set([...p.doors.keys(), ...givenWalls]);
  const lockWalls = () => { for (const e of givenWalls) board.fence[e] = 1; for (const e of p.doors.keys()) board.fence[e] = 0; };
  lockWalls();
  const givenDigit = new Map<number, number>();
  for (const [i, gs] of p.cellGivens) for (const x of gs) if (digits && x.kind === "number") { givenDigit.set(i, x.value); board.digit[i] = x.value; }
  const prefs = (() => { try { return { autoX: false, autoTick: false, ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; } catch { return { autoX: false, autoTick: false }; } })();

  // ---- layout: nonogram clues take room on the left and top ----
  const maxRow = Math.max(0, ...[...p.rowRuns.values()].map((c) => c.length));
  const maxCol = Math.max(0, ...[...p.colRuns.values()].map((c) => c.length));
  // a maze's arrows take room beside its doors
  const doorSide = (role: "in" | "out") => {
    const e = [...p.doors].find(([, r]) => r === role)?.[0];
    if (e === undefined) return "";
    const b = g.borders[e];
    return b.horizontal ? (b.cells[0] < 0 ? "top" : "bottom") : (b.cells[0] < 0 ? "left" : "right");
  };
  // row / column totals (Aquarium) sit left of the rows and above the columns
  const totalsRoom = (side: string) => (side === "left" && p.rowTotals.size) || (side === "top" && p.colTotals.size) ? 40 : 0;
  // clues outside the grid (Skyscrapers, Easy as ABC) sit beside the row or column they look along
  const edgeRoom = (side: string) => (p.edgeClues.some((c) => c.side === side) ? 38 : 0);
  const room = (side: string) => Math.max(M, doorSide("in") === side ? 50 : 0, doorSide("out") === side ? 54 : 0, totalsRoom(side), edgeRoom(side));
  const shadeClues = p.rules.some((s) => blockFor(s).shadeClues);   // Hitori shades the numbers
  const label = (d: number) => symbolOf(p, d);
  const ML = nonogram ? maxRow * 22 + 16 : room("left"), MT = nonogram ? maxCol * 22 + 12 : room("top"), MR = nonogram ? 6 : room("right"), MB = nonogram ? 6 : room("bottom");
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const svg = q<SVGSVGElement>("svg.board");
  svg.setAttribute("viewBox", `0 0 ${ML + g.cols * S + MR} ${MT + g.rows * S + MB}`);
  addInk(svg, root);
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };
  const X = (c: number) => ML + c * S, Y = (r: number) => MT + r * S;
  const center = (i: number): [number, number] => { const [r, c] = g.rc(i); return [X(c) + S / 2, Y(r) + S / 2]; };
  const cornerXY = (v: number): [number, number] => { const [r, c] = g.cornerRC(v); return [X(c), Y(r)]; };
  const borderXY = (e: number) => g.borders[e].corners.map(cornerXY) as [[number, number], [number, number]];
  const cellRect = (i: number, cls: string, parent: Element, inset = 0) => { const [r, c] = g.rc(i); return el("rect", { class: cls, x: X(c) + inset, y: Y(r) + inset, width: S - 2 * inset, height: S - 2 * inset }, parent); };

  // ---- layers, back to front ----
  const gTint = el("g", {}), gReveal = el("g", { class: "reveal wash" }), gWash = el("g", { class: "wash" }), gRocks = el("g", { class: "wash" });
  const gGrid = el("g", { class: "gridlines" }), gWater = el("g", { class: "water" }), gLines = el("g", {}), gGivens = el("g", {});
  const gMarks = el("g", { class: "marks" }), gHint = el("g", {}), gErr = el("g", { class: "errors" });
  const gWalk = el("g", { class: "walk" }), gCorners = el("g", {});

  // ---- what never changes: grid, rocks, walls, clues ----
  if (marks.includes("loop")) for (let i = 0; i < g.cellCount; i++) { const [r, c] = g.rc(i); if ((r + c) % 2) cellRect(i, "alt", gTint); }
  for (const i of p.blocked) cellRect(i, "rock", gRocks);
  if (p.style.grid === "dots") {
    for (let v = 0; v < g.cornerCount; v++) { const [x, y] = cornerXY(v); el("circle", { class: "dot", cx: x, cy: y, r: 2.6 }, gGrid); }
  } else {
    const boxes = p.areas ? undefined : p.rules.find((s) => s.rule === "boxes"), [bh, bw] = boxes ? boxLines(boxes, p) : [0, 0];
    for (const e of g.borders) {
      if (e.link < 0) continue;
      const [[x1, y1], [x2, y2]] = borderXY(e.id), [r, c] = g.cornerRC(e.corners[0]);
      const major = e.horizontal ? (p.style.major && r % p.style.major === 0) || (bh && r % bh === 0) : (p.style.major && c % p.style.major === 0) || (bw && c % bw === 0);
      el("line", { class: major ? "gridline major" : "gridline", x1, y1, x2, y2 }, gGrid);
    }
    // outlined areas: a thick line wherever two areas meet
    if (p.areas) for (const e of g.borders) {
      if (e.link < 0 || p.areas.of[e.cells[0]] === p.areas.of[e.cells[1]]) continue;
      const [[x1, y1], [x2, y2]] = borderXY(e.id);
      el("line", { class: "area-line", x1, y1, x2, y2 }, gGrid);
    }
    el("rect", { class: regionsPuzzle ? "frame lead" : "frame", x: X(0), y: Y(0), width: g.cols * S, height: g.rows * S }, regionsPuzzle ? gLines : gGrid);
  }
  for (const l of p.walls) {
    const [[x1, y1], [x2, y2]] = borderXY(g.links[l].border);
    el("line", { class: maze ? "wall given" : "wall", x1, y1, x2, y2 }, gGivens);
  }
  // doors (mazes, paths): an arrow in at the way in, an arrow out at the way out; a path's line
  // starts and ends at them
  for (const [e, role] of p.doors) {
    const b = g.borders[e], [[x1, y1], [x2, y2]] = borderXY(e), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const [ox, oy] = b.horizontal ? [0, b.cells[0] < 0 ? -1 : 1] : [b.cells[0] < 0 ? -1 : 1, 0];
    const at = (d: number) => [mx + ox * d, my + oy * d];
    const [[ax, ay], [hx, hy]] = role === "in" ? [at(40), at(10)] : [at(10), at(42)];
    const ux = Math.sign(hx - ax), uy = Math.sign(hy - ay), bx = hx - 7 * ux, by = hy - 7 * uy;
    el("path", { class: "arrow", d: `M${ax} ${ay}L${hx} ${hy}M${bx - 6 * uy} ${by + 6 * ux}L${hx} ${hy}L${bx + 6 * uy} ${by - 6 * ux}` }, gGivens);
    if (marks.includes("loop")) {
      const inside = b.cells[0] < 0 ? b.cells[1] : b.cells[0], [cx, cy] = center(inside);
      el("line", { class: "stub", x1: cx, y1: cy, x2: mx, y2: my }, gTint);
    }
  }
  // numbers on corners (mazes): a circle each, green when it has its walls, red when over
  const cornerEls = new Map<number, [Element, number]>();
  for (const [v, gs] of p.cornerGivens) for (const giv of gs) {
    if (giv.kind !== "count") continue;
    const [x, y] = cornerXY(v), n = el("g", { class: "num" }, gCorners);
    el("circle", { cx: x, cy: y, r: 13 }, n);
    el("text", { x, y: y + 1 }, n).textContent = String(giv.value);
    cornerEls.set(v, [n, giv.value]);
  }
  const digitEls = new Map<number, SVGTextElement>();
  // thermometers: a pale tube from a round bulb, under the digits
  for (const t of p.thermos) {
    el("polyline", { class: "thermo", points: t.map((i) => center(i).join(",")).join(" ") }, gTint);
    const [bx, by] = center(t[0]);
    el("circle", { class: "thermo-bulb", cx: bx, cy: by, r: S * 0.36 }, gTint);
  }
  // galaxy centres
  for (const [y, x] of p.galaxies) el("circle", { class: "galaxy", cx: ML + (x * S) / 2, cy: MT + (y * S) / 2, r: 7 }, gGivens);
  // clues outside the grid, beside the row / column they look along
  for (const c of p.edgeClues) {
    const [cx, cy] = center(c.cell), d = S / 2 + 18;
    const [x, y] = c.side === "top" ? [cx, cy - d] : c.side === "bottom" ? [cx, cy + d] : c.side === "left" ? [cx - d, cy] : [cx + d, cy];
    el("text", { class: "clue outside", x, y: y + 1 }, gGivens).textContent = c.kind === "first" ? label(c.value) : String(c.value);
  }
  for (const [i, gs] of p.cellGivens) for (const giv of gs) {
    const [x, y] = center(i);
    if (giv.kind === "number" && !digits) {
      if (links) el("circle", { class: "link-end", cx: x, cy: y, r: S * 0.3 }, gGivens);
      const t = el("text", { class: p.blocked.has(i) ? "clue on-rock" : "clue", x, y: y + 1 }, gGivens) as SVGTextElement;
      t.textContent = String(giv.value);
      if (shadeClues) digitEls.set(i, t);
    }
    else if (giv.kind === "pearl") el("circle", { class: `pearl ${giv.value}`, cx: x, cy: y, r: S * 0.3 }, gGivens);
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
    if (giv.kind === "wall") continue;
    const [[x1, y1], [x2, y2]] = borderXY(e), x = (x1 + x2) / 2, y = (y1 + y2) / 2, d = 8;
    el("path", { class: `diamond ${giv.kind}`, d: `M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z` }, gGivens);
  }
  // nonogram clues, right-aligned beside each row and stacked above each column; tap to tick
  const gClues = el("g", { class: "runs" });
  const clueEls: [string, SVGTextElement][] = [];
  for (const [i, clue] of p.rowRuns) clue.forEach((n, k) => {
    const t = el("text", { class: "clue run", x: ML - 14 - (clue.length - 1 - k) * 22, y: Y(i) + S / 2 + 1, "data-tick": `r${i}:${k}` }, gClues) as SVGTextElement;
    t.textContent = String(n); clueEls.push([`r${i}:${k}`, t]);
  });
  for (const [i, clue] of p.colRuns) clue.forEach((n, k) => {
    const t = el("text", { class: "clue run", x: X(i) + S / 2, y: MT - 14 - (clue.length - 1 - k) * 22, "data-tick": `c${i}:${k}` }, gClues) as SVGTextElement;
    t.textContent = String(n); clueEls.push([`c${i}:${k}`, t]);
  });

  const totalEls: [number[], number, SVGTextElement][] = [];
  for (const [r, k] of p.rowTotals) {
    const t = el("text", { class: "clue run total", x: ML - 20, y: Y(r) + S / 2 + 1 }, gClues) as SVGTextElement;
    t.textContent = String(k); totalEls.push([Array.from({ length: g.cols }, (_, c) => g.cell(r, c)), k, t]);
  }
  for (const [c, k] of p.colTotals) {
    const t = el("text", { class: "clue run total", x: X(c) + S / 2, y: MT - 18 }, gClues) as SVGTextElement;
    t.textContent = String(k); totalEls.push([Array.from({ length: g.rows }, (_, r) => g.cell(r, c)), k, t]);
  }

  // ---- drawing the board ----
  const status = q<HTMLElement>(".status");
  let solved = false, reported = false, sel = -1, pencilMode = false;
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
  const xMark = (x: number, y: number, d = 5, cls = "xmark") => el("path", { class: cls, d: `M${x - d} ${y - d}L${x + d} ${y + d}M${x + d} ${y - d}L${x - d} ${y + d}` }, gMarks);
  const peers = (i: number) => {
    if (i < 0) return new Set<number>();
    const [r, c] = g.rc(i), boxes = p.rules.find((s) => s.rule === "boxes"), [bh, bw] = boxes ? boxLines(boxes, p) : [g.rows, g.cols];
    const out = new Set<number>();
    for (let j = 0; j < g.cellCount; j++) { const [r2, c2] = g.rc(j); if (r2 === r || c2 === c || (Math.floor(r2 / bh) === Math.floor(r / bh) && Math.floor(c2 / bw) === Math.floor(c / bw))) out.add(j); }
    return out;
  };

  function render() {
    gWash.replaceChildren(); gWater.replaceChildren(); gLines.querySelectorAll(".mark").forEach((n) => n.remove()); gMarks.replaceChildren();
    const colors = glassColors();
    // digits: selection, its row/column/box, and matching digits
    if (digits) {
      const near = peers(sel);
      for (let i = 0; i < g.cellCount; i++) {
        if (i === sel) cellRect(i, "sel", gMarks);
        else if (near.has(i)) cellRect(i, "peer", gMarks);
        else if (sel >= 0 && board.digit[sel] && board.digit[i] === board.digit[sel]) cellRect(i, "same", gMarks);
      }
    }
    // light bulbs light their row and column up to a black cell
    if (p.style.shaded === "bulb") {
      const lit = new Set<number>();
      for (let i = 0; i < g.cellCount; i++) if (board.shade[i] === 1) {
        lit.add(i);
        const [r, c] = g.rc(i);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
          for (let y = r + dr, x = c + dc; y >= 0 && x >= 0 && y < g.rows && x < g.cols && !p.blocked.has(g.cell(y, x)); y += dr, x += dc) lit.add(g.cell(y, x));
      }
      for (const i of lit) cellRect(i, "lit", gWash, -0.5);
    }
    for (let i = 0; i < g.cellCount; i++) {
      const [x, y] = center(i);
      if (marks.includes("shade") && board.shade[i] === 1) {
        if (p.style.shaded === "star") el("path", { class: "star", d: starPath(x, y, S * 0.36) }, gMarks);
        else if (p.style.shaded === "mine") {
          el("circle", { class: "mine", cx: x, cy: y, r: S * 0.2 }, gMarks);
          el("path", { class: "mine-spikes", d: `M${x - S * 0.3} ${y}H${x + S * 0.3}M${x} ${y - S * 0.3}V${y + S * 0.3}M${x - S * 0.21} ${y - S * 0.21}L${x + S * 0.21} ${y + S * 0.21}M${x + S * 0.21} ${y - S * 0.21}L${x - S * 0.21} ${y + S * 0.21}` }, gMarks);
        } else if (p.style.shaded === "bulb") {
          el("circle", { class: "bulb", cx: x, cy: y - 2, r: S * 0.22 }, gMarks);
          el("rect", { class: "bulb-base", x: x - S * 0.1, y: y + S * 0.16, width: S * 0.2, height: S * 0.12, rx: 2 }, gMarks);
        }
        else cellRect(i, p.style.shaded === "water" ? "shaded water" : "shaded", gWash, -0.5);
      }
      if (regionsPuzzle && colors[i] > 0) el("rect", { x: x - S / 2 - 0.5, y: y - S / 2 - 0.5, width: S + 1, height: S + 1, fill: palette[colors[i] - 1] ?? "#ccc" }, gWash);
      if (marks.includes("shade") && board.shade[i] === 2) {
        if (p.style.empty === "x") xMark(x, y, S * 0.18, "xmark cellx"); else el("circle", { class: "dotmark", cx: x, cy: y, r: 3.5 }, gMarks);
      }
      if (digits && board.digit[i]) {
        el("text", { class: givenDigit.has(i) ? "digit given" : "digit", x, y: y + 2 }, gMarks).textContent = label(board.digit[i]);
      } else if (digits && board.pencil[i]) {
        const per = Math.ceil(Math.sqrt(p.digits));
        for (let d = 1; d <= p.digits; d++) if (board.pencil[i] & (1 << d)) {
          const k = d - 1, px = x - S / 2 + (S / per) * ((k % per) + 0.5), py = y - S / 2 + (S / per) * (Math.floor(k / per) + 0.5);
          el("text", { class: "pencil", x: px, y: py + 1 }, gMarks).textContent = label(d);
        }
      }
    }
    for (const e of g.borders) {
      const [[x1, y1], [x2, y2]] = borderXY(e.id);
      if (marks.includes("fence") && board.fence[e.id] === 1 && !locked.has(e.id)) el("line", { class: "mark pen", x1, y1, x2, y2 }, gLines);
      if (marks.includes("fence") && board.fence[e.id] === 2) xMark((x1 + x2) / 2, (y1 + y2) / 2);
      if (regionsPuzzle && e.link >= 0) {
        const [a, b] = e.cells;
        if (board.cut[e.id] === 1 || colors[a] !== colors[b]) el("line", { class: "mark lead", x1, y1, x2, y2 }, gLines);
      }
    }
    // Numberlink: each line takes the color of the number it leaves from
    const lineColor = new Map<number, string>();
    if (links) {
      const value = new Map<number, number>();
      for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") value.set(i, x.value);
      for (const [start, v] of value) {
        const stack = [start], seen = new Set([start]);
        while (stack.length) { const i = stack.pop()!; lineColor.set(i, LINK_COLORS[(v - 1) % LINK_COLORS.length]); for (const l of g.cellLinks[i]) if (board.loop[l] === 1) { const j = g.links[l].cells.find((c) => c !== i)!; if (!seen.has(j) && !value.has(j)) { seen.add(j); stack.push(j); } } }
      }
    }
    if (marks.includes("loop")) for (const l of g.links) {
      const [x1, y1] = center(l.cells[0]), [x2, y2] = center(l.cells[1]);
      const tint = lineColor.get(l.cells[0]) ?? lineColor.get(l.cells[1]), style = tint ? `stroke:${tint};fill:${tint}` : "";
      if (board.loop[l.id] === 1) { el("line", { class: "river", x1, y1, x2, y2, style }, gWater); el("circle", { class: "joint", cx: x1, cy: y1, r: 6.5, style }, gWater); el("circle", { class: "joint", cx: x2, cy: y2, r: 6.5, style }, gWater); }
      if (board.loop[l.id] === 2) xMark((x1 + x2) / 2, (y1 + y2) / 2);
    }
    for (const [k, t] of clueEls) t.classList.toggle("done", ticks.has(k));
    for (const [i, t] of digitEls) t.classList.toggle("on-shade", board.shade[i] === 1);
    for (const [cs, k, t] of totalEls) t.classList.toggle("done", cs.filter((i) => board.shade[i] === 1).length === k);
    for (const [v, [n, want]] of cornerEls) {
      const have = g.cornerBorders[v].filter((e) => board.fence[e] === 1).length;
      n.classList.toggle("done", have === want); n.classList.toggle("over", have > want);
    }
    root.classList.toggle("solved", solved);
  }

  function showProblems(ps: Problem[]) {
    gErr.replaceChildren();
    for (const pr of ps) {
      for (const i of pr.cells ?? []) cellRect(i, "", gErr);
      for (const e of pr.borders ?? []) { const [[x1, y1], [x2, y2]] = borderXY(e); el("line", { x1, y1, x2, y2 }, gErr); }
      for (const l of pr.links ?? []) { const [x1, y1] = center(g.links[l].cells[0]), [x2, y2] = center(g.links[l].cells[1]); el("line", { x1, y1, x2, y2 }, gErr); }
    }
  }
  let errTimer = 0;
  const clearProblems = () => { gErr.replaceChildren(); gHint.replaceChildren(); clearTimeout(errTimer); };

  /** nonogram helpers: tick a line's numbers once it matches, and X out the rest of a ticked line */
  function assist() {
    if (!nonogram) return;
    for (const [kind, map] of [["r", p.rowRuns], ["c", p.colRuns]] as const) for (const [i, clue] of map) {
      const cells = kind === "r" ? Array.from({ length: g.cols }, (_, c) => g.cell(i, c)) : Array.from({ length: g.rows }, (_, r) => g.cell(r, i));
      const got = runsOf(cells.map((c) => board.shade[c] === 1));
      const matches = got.length === clue.length && got.every((x, k) => x === clue[k]);
      if (prefs.autoTick && matches && cells.every((c) => board.shade[c] !== 0)) clue.forEach((_, k) => ticks.add(`${kind}${i}:${k}`));
      if (prefs.autoX && matches && clue.every((_, k) => ticks.has(`${kind}${i}:${k}`))) for (const c of cells) if (board.shade[c] === 0) board.shade[c] = 2;
    }
  }

  function afterChange() {
    assist();
    const was = solved;
    if (maze) {
      // walls right: walk it; solved once out
      const ok = check(p, board).length === 0;
      if (ok && !walk!.active) walk!.start(saved?.trail);
      else if (!ok && walk!.active) walk!.stop();
      solved = walk!.done;
    } else solved = check(p, board).length === 0;
    if (solved && !was) win();
    else if (!solved && was) { root.classList.remove("revealed", "titled"); say(""); }
    else if (!solved && !walk?.active && status.classList.contains("good")) say("");
    render();
    const out: Saved = {};
    for (const k of Object.keys(board) as Layer[]) if (board[k].some((v) => v)) out[k] = [...board[k]];
    if (ticks.size) out.ticks = [...ticks];
    if (walk?.active && walk.trail.length > 1) out.trail = [...walk.trail];
    host.save(out);
  }
  const saveWalk = () => {
    const out = host.load<Saved>() ?? {};
    if (walk!.trail.length > 1) out.trail = [...walk!.trail]; else delete out.trail;
    host.save(out);
  };

  // the reveal: a nonogram's picture in color, then its title on the sign
  if (p.spec.picture) {
    const { rows, palette: colorsOf } = p.spec.picture;
    for (let i = 0; i < g.cellCount; i++) {
      const [r, c] = g.rc(i), delay = ((r + c) / (g.rows + g.cols)) * 1.1;
      el("rect", { class: "pix", x: X(c) - 0.5, y: Y(r) - 0.5, width: S + 1, height: S + 1, fill: colorsOf[rows[r][c]] ?? "#fff", style: `--delay:${delay.toFixed(2)}s` }, gReveal);
    }
  }
  const sign = root.querySelector<HTMLButtonElement>("[data-sign]");
  sign?.addEventListener("click", () => root.classList.add("titled"));
  function win() {
    say(p.spec.picture ? "Solved! Here's the picture." : maze ? `You're out! ${walk!.trail.length} squares from the way in to the way out.` : "Solved!", "good");
    clearProblems();
    if (p.spec.picture) root.classList.add("revealed");
    if (!reported) { reported = true; host.solved(p.spec.picture?.title ? { title: p.spec.picture.title } : maze ? { squares: walk!.trail.length } : {}); }
  }

  // ---- gestures ----
  let history: Change[][] = [];
  let changes: Change[] = [];
  const set = (layer: Layer, i: number, v: number) => {
    if (board[layer][i] === v) return;
    changes.push([layer, i, board[layer][i]]);
    board[layer][i] = v;
  };
  const commit = () => { if (changes.length) { history.push(changes); afterChange(); } else render(); changes = []; };
  const toBoard = (evt: PointerEvent) => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [r.x, r.y] as [number, number];
  };
  const cellAt = ([x, y]: [number, number]) => {
    const c = Math.floor((x - ML) / S), r = Math.floor((y - MT) / S);
    return r >= 0 && r < g.rows && c >= 0 && c < g.cols ? g.cell(r, c) : -1;
  };
  const nearestCorner = ([x, y]: [number, number]) => {
    const r = Math.max(0, Math.min(g.rows, Math.round((y - MT) / S))), c = Math.max(0, Math.min(g.cols, Math.round((x - ML) / S)));
    return { v: g.corner(r, c), d: Math.hypot(x - X(c), y - Y(r)) };
  };
  /** the border nearest a point, and how far it is */
  const nearestBorder = ([x, y]: [number, number]) => {
    const fx = (x - ML) / S, fy = (y - MT) / S;
    const hr = Math.round(fy), hc = Math.floor(fx), vr = Math.floor(fy), vc = Math.round(fx);
    const h = hr >= 0 && hr <= g.rows && hc >= 0 && hc < g.cols ? { e: hr * g.cols + hc, d: Math.abs(fy - hr) * S } : null;
    const v = vr >= 0 && vr < g.rows && vc >= 0 && vc <= g.cols ? { e: (g.rows + 1) * g.cols + vr * (g.cols + 1) + vc, d: Math.abs(fx - vc) * S } : null;
    return !h ? v : !v ? h : h.d <= v.d ? h : v;
  };
  const sharedBorder = (v1: number, v2: number) => g.cornerBorders[v1].find((e) => g.cornerBorders[v2].includes(e)) ?? -1;
  const linkOpen = (l: number) => !p.walls.has(l) && !g.links[l].cells.some((c) => p.blocked.has(c));
  const walk = maze ? createWalk(p, board.fence, S / 2, {
    svg, layer: gWalk, el, center, cellAt, toBoard, say,
    out: () => { if (!solved) { solved = true; win(); render(); } saveWalk(); },
  }) : null;

  type Drag =
    | { kind: "edges"; layer: "fence" | "cut"; last: number; tapBorder: number; mode: number | null; start: [number, number]; moved: boolean }
    | { kind: "links"; last: number; tapLink: number; mode: number | null; start: [number, number]; moved: boolean }
    | { kind: "cells"; layer: "shade" | "color"; value: number; last: number };
  let drag: Drag | null = null;

  /** toggle the edges between two corners (fence / cut) in the drag's mode */
  const dragEdge = (d: Extract<Drag, { kind: "edges" }>, to: number) => {
    const [r0, c0] = g.cornerRC(d.last), [r1, c1] = g.cornerRC(to);
    if (r0 !== r1 && c0 !== c1) return;   // only straight runs along the grid
    const steps = Math.abs(r1 - r0) + Math.abs(c1 - c0), dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
    let cur = d.last;
    for (let k = 0; k < steps; k++) {
      const [r, c] = g.cornerRC(cur), next = g.corner(r + dr, c + dc), e = sharedBorder(cur, next);
      if (e >= 0 && !locked.has(e) && (d.layer === "fence" || g.borders[e].link >= 0)) {
        d.mode ??= board[d.layer][e] === 1 ? 0 : 1;
        set(d.layer, e, d.mode);
      }
      cur = next;
    }
    d.last = to;
  };
  /** extend the loop from the last cell to this one, filling in cells skipped on a fast drag */
  const dragLink = (d: Extract<Drag, { kind: "links" }>, to: number) => {
    const [r0, c0] = g.rc(d.last), [r1, c1] = g.rc(to);
    if (r0 !== r1 && c0 !== c1) return;
    const steps = Math.abs(r1 - r0) + Math.abs(c1 - c0), dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
    for (let k = 0; k < steps; k++) {
      const [r, c] = g.rc(d.last), next = g.cell(r + dr, c + dc);
      const l = g.cellLinks[d.last].find((x) => g.links[x].cells.includes(next));
      if (l === undefined || !linkOpen(l)) return;
      d.mode ??= board.loop[l] === 1 ? 0 : 1;
      set("loop", l, d.mode);
      d.last = next;
    }
  };
  let brush = 1;

  svg.addEventListener("contextmenu", (e) => e.preventDefault());
  svg.addEventListener("pointerdown", (evt) => {
    if (solved || walk?.active) return;
    const pt = toBoard(evt), back = evt.button === 2;
    changes = []; clearProblems();
    const tick = (evt.target as Element).closest<SVGElement>("[data-tick]");
    if (tick) {                                         // tick a nonogram number on or off
      const k = tick.dataset.tick!;
      if (ticks.has(k)) ticks.delete(k); else ticks.add(k);
      afterChange();
      return;
    }
    if (digits) {
      const i = cellAt(pt);
      sel = i >= 0 && !givenDigit.has(i) ? i : -1;
      render();
      return;
    }
    const nb = nearestBorder(pt);
    if (marks.includes("fence") || (regionsPuzzle && nb && nb.d < S * 0.22 && g.borders[nb.e].link >= 0)) {
      drag = { kind: "edges", layer: marks.includes("fence") ? "fence" : "cut", last: nearestCorner(pt).v, tapBorder: nb ? nb.e : -1, mode: null, start: pt, moved: false };
    } else if (marks.includes("loop")) {
      const i = cellAt(pt);
      if (i < 0) return;
      const near = nb && nb.d < S * 0.2 ? g.borders[nb.e].link : -1;
      drag = { kind: "links", last: i, tapLink: near >= 0 && linkOpen(near) ? near : -1, mode: null, start: pt, moved: false };
    } else {
      const i = cellAt(pt);
      if (i < 0) return;
      if (marks.includes("shade")) {
        if (p.cellGivens.has(i) && !shadeClues) return;
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
      if (i < 0 || i === drag.last) return;
      // every cell between the last one and this one, so fast drags don't skip
      const [r0, c0] = g.rc(drag.last), [r1, c1] = g.rc(i), steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
      for (let s = 1; s <= steps; s++) {
        const j = g.cell(Math.round(r0 + ((r1 - r0) * s) / steps), Math.round(c0 + ((c1 - c0) * s) / steps));
        if (!(drag.layer === "shade" && p.cellGivens.has(j) && !shadeClues)) set(drag.layer, j, drag.value);
      }
      drag.last = i; render();
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
    if (drag.kind === "edges" && !drag.moved && drag.tapBorder >= 0 && !locked.has(drag.tapBorder)) {
      const e = drag.tapBorder;
      if (drag.layer === "fence") set("fence", e, (board.fence[e] + 1) % 3);
      else if (g.borders[e].link >= 0) set("cut", e, board.cut[e] ? 0 : 1);
    }
    if (drag.kind === "links" && !drag.moved && drag.tapLink >= 0) set("loop", drag.tapLink, (board.loop[drag.tapLink] + 1) % 3);
    drag = null;
    commit();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);

  // ---- digits: the pad, pencil notes and the keyboard ----
  const enter = (d: number) => {
    if (sel < 0 || solved) return;
    changes = []; clearProblems();
    if (d === 0) { set("digit", sel, 0); set("pencil", sel, 0); }
    else if (pencilMode) { if (!board.digit[sel]) set("pencil", sel, board.pencil[sel] ^ (1 << d)); }
    else set("digit", sel, d);   // re-entering a digit keeps it; erase clears
    commit();
  };
  const pencilBtn = root.querySelector<HTMLButtonElement>("[data-pencil]");
  const setPencil = (on: boolean) => { pencilMode = on; pencilBtn?.setAttribute("aria-pressed", String(on)); };
  root.querySelectorAll<HTMLButtonElement>("[data-digit]").forEach((b) => b.addEventListener("click", () => enter(Number(b.dataset.digit))));
  pencilBtn?.addEventListener("click", () => setPencil(!pencilMode));
  const onKey = (e: KeyboardEvent) => {
    const t = e.target;
    if (!digits || (t instanceof Element && t.closest("input, textarea, select, dialog"))) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (e.key in moves) {
      e.preventDefault();
      let [r, c] = sel >= 0 ? g.rc(sel) : [0, -1];
      const [dr, dc] = moves[e.key];
      do { r = (r + dr + g.rows) % g.rows; c = (c + dc + g.cols) % g.cols; } while (givenDigit.has(g.cell(r, c)) && g.cell(r, c) !== sel);
      sel = g.cell(r, c); render();
    } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= p.digits) enter(Number(e.key));
    else if (p.style.symbols && p.style.symbols.toLowerCase().includes(e.key.toLowerCase()) && e.key.length === 1) enter(p.style.symbols.toLowerCase().indexOf(e.key.toLowerCase()) + 1);
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") enter(0);
    else if (e.key === "p" || e.key === "P") setPencil(!pencilMode);
  };
  document.addEventListener("keydown", onKey);

  // ---- controls on the paper ----
  root.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((pot) => pot.addEventListener("click", () => {
    brush = Number(pot.dataset.color);
    root.querySelectorAll("[data-color]").forEach((x) => x.setAttribute("aria-pressed", String(x === pot)));
  }));
  q<HTMLButtonElement>("[data-undo]").addEventListener("click", () => {
    if (walk?.back()) { saveWalk(); return; }
    if (solved) return;
    const last = history.pop();
    if (!last) return;
    for (const [layer, i, v] of last.reverse()) board[layer][i] = v;
    clearProblems(); afterChange();
  });
  q<HTMLButtonElement>("[data-check]").addEventListener("click", () => {
    const ps = check(p, board);
    if (walk?.active && !solved) { say("The walls are right. Drag from the arrow in to the arrow out.", "good"); return; }
    if (!ps.length) { say("Solved!", "good"); return; }
    say(ps[0].message, "warn");
    showProblems(ps.filter((x) => x.message === ps[0].message));   // just what the note is about
    clearTimeout(errTimer);
    errTimer = window.setTimeout(() => { clearProblems(); if (status.classList.contains("warn")) say(""); }, 4000);
  });
  root.querySelector<HTMLButtonElement>("[data-hint]")?.addEventListener("click", () => {
    if (solved) return;
    clearProblems();
    let h: Hint | null = null;
    for (const s of p.rules) { h = blockFor(s).hint?.(s, p, board) ?? null; if (h) break; }
    if (!h) { say("No hints left: nothing one line alone gives away. Check for mistakes?", "warn"); return; }
    for (const i of h.area) cellRect(i, "hint-area", gHint);
    for (const { cell, shade } of h.cells) {
      const [x, y] = center(cell);
      if (shade) cellRect(cell, "hint-fill", gHint, 5); else el("path", { class: "hint-x", d: `M${x - 9} ${y - 9}L${x + 9} ${y + 9}M${x + 9} ${y - 9}L${x - 9} ${y + 9}` }, gHint);
    }
    say(h.message);
    status.className = "status good";
    errTimer = window.setTimeout(() => { gHint.replaceChildren(); if (status.textContent === h!.message) say(""); }, 4000);
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
    for (const [i, d] of givenDigit) board.digit[i] = d;
    lockWalls(); walk?.stop(); if (saved) delete saved.trail;
    ticks.clear(); history = []; solved = false; reported = false; sel = -1;
    root.classList.remove("revealed", "titled"); say(""); clearProblems(); afterChange();
  });
  root.querySelectorAll<HTMLInputElement>("[data-pref]").forEach((box) => {
    const k = box.dataset.pref as "autoX" | "autoTick";
    box.checked = prefs[k];
    box.addEventListener("change", () => {
      prefs[k] = box.checked;
      try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* play without saving */ }
      afterChange();
    });
  });

  if (maze) {
    if (check(p, board).length === 0) walk!.start(saved?.trail);
    solved = reported = walk!.done;
  } else {
    solved = check(p, board).length === 0;
    reported = solved;
  }
  if (solved) { say(p.spec.picture ? "Solved! Here's the picture." : maze ? "You're out!" : "Solved!", "good"); if (p.spec.picture) root.classList.add("revealed", "titled"); }
  render();
  return () => document.removeEventListener("keydown", onKey);
};

/** Mount every grid board on the page (each carries its config and id as data attributes). */
export function mountAll(createHost: (id: string) => Parameters<MountGame>[1]) {
  document.querySelectorAll<HTMLElement>("[data-game-type=grid]").forEach((root) => {
    const config = JSON.parse(root.dataset.config!) as GridClientConfig;
    createGrid(config)(root, createHost(root.dataset.gameId!));
  });
}
