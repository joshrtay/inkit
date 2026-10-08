// A still picture of a grid puzzle, with or without the player's marks: the same drawing as the
// player (game.ts, figure.ts) and the same CSS classes (styles.css), but as an SVG string, so it
// can be drawn anywhere (on the server, in a list, many to a page). Used by the puzzle guides.
//
// Wrap it in an element with the class "grid-game" (and the board's ink as --paper-ink) to style it.
import { regionsOf } from "../../engine/derive.ts";
import { boxLines, symbolOf } from "../../engine/rules.ts";
import type { Board, Puzzle } from "../../engine/types.ts";
import { piecesOf, roomiest } from "./pieces";
import { bankLayout, paneCluesSvg, palisadeSvg, symbolClueSvg } from "./region-clues.ts";
import { washDefs } from "../../lib/ink.ts";
import { lineColors, LINE_COLORS, panelInk, panelSymbols, panelTracks, stoneSvg } from "./panel-draw";

const S = 48, M = 26;
const LINK_COLORS = ["#3fb0e6", "#ef5a6a", "#7cc68f", "#f29a38", "#a77bd6", "#f07ab8", "#f7cf3d", "#4fb3a9", "#c98a5b"];
const PAINT = ["#ef5a6a", "#f7cf3d", "#3fb0e6"];
type A = Record<string, string | number>;
const tag = (name: string, a: A, body = "") => `<${name}${Object.entries(a).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`).join("")}${body ? `>${body}</${name}>` : "/>"}`;
const text = (a: A, s: string) => tag("text", a, s.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`));
const n1 = (v: number) => Math.round(v * 10) / 10;

export type Room = Partial<Record<"top" | "left" | "right" | "bottom", number>>;

/** Where a square-grid picture puts things, in its own units: the cell size and the margins
 *  around the grid (clues outside it sit in the margins). The editor uses it to tell what was tapped,
 *  and asks for `room` (at least this much margin) where clues can be added outside. */
export function pictureLayout(p: Puzzle, room0: Room = {}) {
  const g = p.grid;
  const maxRow = Math.max(0, ...[...p.rowRuns.values()].map((c) => c.length)), maxCol = Math.max(0, ...[...p.colRuns.values()].map((c) => c.length));
  const nonogram = p.rowRuns.size + p.colRuns.size > 0;
  const doorSide = (role: string) => {
    const e = [...p.doors].find(([, r]) => r === role)?.[0];
    if (e === undefined) return "";
    const bd = g.borders[e];
    return bd.horizontal ? (bd.cells[0] < 0 ? "top" : "bottom") : (bd.cells[0] < 0 ? "left" : "right");
  };
  const room = (side: "top" | "left" | "right" | "bottom") => Math.max(M, room0[side] ?? 0, doorSide("in") === side ? 50 : 0, doorSide("out") === side ? 54 : 0,
    (side === "left" && p.rowTotals.size) || (side === "top" && p.colTotals.size) ? 40 : 0, p.edgeClues.some((c) => c.side === side) ? 38 : 0,
    side === "bottom" ? bankLayout(p, S).height : 0);
  const ML = nonogram ? maxRow * 22 + 16 : room("left"), MT = nonogram ? maxCol * 22 + 12 : room("top");
  const MR = nonogram ? 6 : room("right"), MB = nonogram ? 6 : room("bottom");
  return { S, ML, MT, MR, MB, W: ML + g.cols * S + MR, H: MT + g.rows * S + MB };
}

export interface PictureOptions {
  /** a nonogram's hidden picture, in its colors (an editor shows what's being drawn) */
  picture?: boolean;
  /** cells to mark as not yet decided (the editor's "the numbers can't pin these down") */
  undecided?: number[];
  /** at least this much margin (an editor leaves room for clues outside the grid) */
  room?: Room;
}

/** The puzzle as an SVG string. `b` adds the player's marks (a solution, or a mistake). */
export function pictureSvg(p: Puzzle, b?: Board | null, label = "Puzzle", opts: PictureOptions = {}): string {
  if (p.marks.includes("paint")) return figureSvg(p, b, label);
  const g = p.grid, marks = p.marks, regionsPuzzle = marks.includes("regions"), digits = marks.includes("digit");
  const links = p.rules.some((s) => s.rule === "links"), maze = p.rules.some((s) => s.rule === "perfect-maze");
  const { ML, MT, MR, MB } = pictureLayout(p, opts.room);
  const X = (c: number) => ML + c * S, Y = (r: number) => MT + r * S;
  const center = (i: number): [number, number] => { const [r, c] = g.rc(i); return [X(c) + S / 2, Y(r) + S / 2]; };
  const cornerXY = (v: number): [number, number] => { const [r, c] = g.cornerRC(v); return [X(c), Y(r)]; };
  const borderXY = (e: number) => g.borders[e].corners.map(cornerXY) as [[number, number], [number, number]];
  const rect = (i: number, cls: string, inset = 0, extra: A = {}) => { const [r, c] = g.rc(i); return tag("rect", { class: cls, x: X(c) + inset, y: Y(r) + inset, width: S - 2 * inset, height: S - 2 * inset, ...extra }); };
  const line = (cls: string, [[x1, y1], [x2, y2]]: [[number, number], [number, number]], extra: A = {}) => tag("line", { class: cls, x1, y1, x2, y2, ...extra });
  const out = { tint: "", wash: "", rocks: "", grid: "", water: "", lines: "", givens: "", marks: "", runs: "", corners: "", over: "" };
  const panel = p.rules.find((s) => s.rule === "panel-line"), frame = { S, X, Y };

  // grid, rocks, areas
  if (marks.includes("loop")) for (let i = 0; i < g.cellCount; i++) { const [r, c] = g.rc(i); if ((r + c) % 2) out.tint += rect(i, "alt"); }
  for (const i of p.blocked) out.rocks += rect(i, "rock");
  if (panel) {
    // a panel: its tracks, start circles and ends; its dots and symbols go over the line
    out.grid += panelTracks(p, frame) + tag("rect", { class: "frame panel-frame", x: X(0), y: Y(0), width: g.cols * S, height: g.rows * S });
    out.over += panelSymbols(p, frame);
  } else if (p.style.grid === "dots") {
    for (let v = 0; v < g.cornerCount; v++) { const [x, y] = cornerXY(v); out.grid += tag("circle", { class: "dot", cx: x, cy: y, r: 2.6 }); }
  } else {
    const boxes = p.areas ? undefined : p.rules.find((s) => s.rule === "boxes"), [bh, bw] = boxes ? boxLines(boxes, p) : [0, 0];
    for (const e of g.borders) {
      if (e.link < 0) continue;
      const [r, c] = g.cornerRC(e.corners[0]);
      const major = e.horizontal ? (p.style.major && r % p.style.major === 0) || (bh && r % bh === 0) : (p.style.major && c % p.style.major === 0) || (bw && c % bw === 0);
      out.grid += line(major ? "gridline major" : "gridline", borderXY(e.id));
    }
    if (p.areas) for (const e of g.borders) if (e.link >= 0 && p.areas.of[e.cells[0]] !== p.areas.of[e.cells[1]]) out.grid += line("area-line", borderXY(e.id));
    const frame = tag("rect", { class: regionsPuzzle ? "frame lead" : "frame", x: X(0), y: Y(0), width: g.cols * S, height: g.rows * S });
    if (regionsPuzzle) out.lines += frame; else out.grid += frame;
  }

  // givens
  for (const l of p.walls) out.givens += line(maze ? "wall given" : "wall", borderXY(g.links[l].border));
  for (const [e, role] of p.doors) {
    const bd = g.borders[e], [[x1, y1], [x2, y2]] = borderXY(e), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const [ox, oy] = bd.horizontal ? [0, bd.cells[0] < 0 ? -1 : 1] : [bd.cells[0] < 0 ? -1 : 1, 0];
    const at = (d: number) => [mx + ox * d, my + oy * d];
    const [[ax, ay], [hx, hy]] = role === "in" ? [at(40), at(10)] : [at(10), at(42)];
    const ux = Math.sign(hx - ax), uy = Math.sign(hy - ay), bx = hx - 7 * ux, by = hy - 7 * uy;
    out.givens += tag("path", { class: "arrow", d: `M${ax} ${ay}L${hx} ${hy}M${bx - 6 * uy} ${by + 6 * ux}L${hx} ${hy}L${bx + 6 * uy} ${by - 6 * ux}` });
    if (marks.includes("loop")) { const [cx, cy] = center(bd.cells[0] < 0 ? bd.cells[1] : bd.cells[0]); out.tint += tag("line", { class: "stub", x1: cx, y1: cy, x2: mx, y2: my }); }
  }
  for (const [v, gs] of p.cornerGivens) for (const giv of gs) {
    if (giv.kind !== "count") continue;
    const [x, y] = cornerXY(v), have = b ? g.cornerBorders[v].filter((e) => b.fence[e] === 1).length : -1;
    out.corners += tag("g", { class: `num${have === giv.value ? " done" : have > giv.value ? " over" : ""}` }, tag("circle", { cx: x, cy: y, r: 13 }) + text({ x, y: y + 1 }, String(giv.value)));
  }
  for (const t of p.thermos) {
    out.tint += tag("polyline", { class: "thermo", points: t.map((i) => center(i).join(",")).join(" ") });
    const [bx, by] = center(t[0]);
    out.tint += tag("circle", { class: "thermo-bulb", cx: bx, cy: by, r: S * 0.36 });
  }
  for (const [y, x] of p.galaxies) out.givens += tag("circle", { class: "galaxy", cx: ML + (x * S) / 2, cy: MT + (y * S) / 2, r: 7 });
  for (const c of p.edgeClues) {
    const [cx, cy] = center(c.cell), d = S / 2 + 18;
    const [x, y] = c.side === "top" ? [cx, cy - d] : c.side === "bottom" ? [cx, cy + d] : c.side === "left" ? [cx - d, cy] : [cx + d, cy];
    out.givens += text({ class: "clue outside", x, y: y + 1 }, c.kind === "first" ? symbolOf(p, c.value) : String(c.value));
  }
  const givenDigit = new Set<number>();
  for (const [i, gs] of p.cellGivens) for (const giv of gs) {
    const [x, y] = center(i);
    if (giv.kind === "number" && digits) givenDigit.add(i);
    else if (giv.kind === "number") {
      if (links) out.givens += tag("circle", { class: "link-end", cx: x, cy: y, r: S * 0.3 });
      const onShade = b && b.shade[i] === 1;
      out.givens += text({ class: p.blocked.has(i) ? "clue on-rock" : onShade ? "clue on-shade" : "clue", x, y: y + 1 }, String(giv.value));
    } else if (giv.kind === "pearl") out.givens += stoneSvg(giv.value, x, y, S * 0.28, "pearl");   // pearls are stones
    else if (giv.kind === "symbol") out.givens += symbolClueSvg(giv.value, x, y);
    else if (giv.kind === "palisade") out.givens += palisadeSvg(giv.value, !!giv.opposite, x, y, S);
    else if (giv.kind === "compass") {
      let c = tag("path", { d: `M${x} ${y - 7}V${y + 7}M${x - 7} ${y}H${x + 7}` });
      const at = { n: [x, y - 14], s: [x, y + 15], e: [x + 15, y + 1], w: [x - 15, y + 1] } as const;
      for (const d of ["n", "e", "s", "w"] as const) { const v = giv.value[d]; if (v !== undefined) c += text({ class: "clue small", x: at[d][0], y: at[d][1] }, String(v)); }
      out.givens += tag("g", { class: "compass" }, c);
    }
  }
  for (const [e, gs] of p.borderGivens) for (const giv of gs) {
    if (giv.kind !== "twins" && giv.kind !== "opposites") continue;
    const [[x1, y1], [x2, y2]] = borderXY(e), x = (x1 + x2) / 2, y = (y1 + y2) / 2, d = 8;
    out.givens += tag("path", { class: `diamond ${giv.kind}`, d: `M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z` });
  }
  out.givens += paneCluesSvg(p, frame);
  for (const [i, clue] of p.rowRuns) clue.forEach((v, k) => { out.runs += text({ class: "clue run", x: ML - 14 - (clue.length - 1 - k) * 22, y: Y(i) + S / 2 + 1 }, String(v)); });
  for (const [i, clue] of p.colRuns) clue.forEach((v, k) => { out.runs += text({ class: "clue run", x: X(i) + S / 2, y: MT - 14 - (clue.length - 1 - k) * 22 }, String(v)); });
  const done = (cs: number[], k: number) => (b && cs.filter((i) => b.shade[i] === 1).length === k ? " done" : "");
  for (const [r, k] of p.rowTotals) out.runs += text({ class: `clue run total${done(Array.from({ length: g.cols }, (_, c) => g.cell(r, c)), k)}`, x: ML - 20, y: Y(r) + S / 2 + 1 }, String(k));
  for (const [c, k] of p.colTotals) out.runs += text({ class: `clue run total${done(Array.from({ length: g.rows }, (_, r) => g.cell(r, c)), k)}`, x: X(c) + S / 2, y: MT - 18 }, String(k));

  // an editor's view: a nonogram's picture in its colors, and cells the clues can't pin down
  if (opts.picture && p.spec.picture) {
    const { rows, palette } = p.spec.picture;
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch !== "." && r < g.rows && c < g.cols) out.wash += rect(g.cell(r, c), "pix", -0.5, { fill: palette[ch] ?? "#26398f" });
    }));
  }
  for (const i of opts.undecided ?? []) out.corners += rect(i, "undecided", 3);

  // the player's marks
  if (b) {
    if (p.style.shaded === "bulb") {
      const lit = new Set<number>();
      for (let i = 0; i < g.cellCount; i++) if (b.shade[i] === 1) {
        lit.add(i);
        const [r, c] = g.rc(i);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
          for (let y = r + dr, x = c + dc; y >= 0 && x >= 0 && y < g.rows && x < g.cols && !p.blocked.has(g.cell(y, x)); y += dr, x += dc) lit.add(g.cell(y, x));
      }
      for (const i of lit) out.wash += rect(i, "lit", -0.5);
    }
    // regions: each region a glass color (neighbours differ)
    const colors = regionsPuzzle ? glass(p, b) : [];
    for (let i = 0; i < g.cellCount; i++) {
      const [x, y] = center(i);
      if (regionsPuzzle && colors[i] > 0) out.wash += tag("rect", { x: x - S / 2 - 0.5, y: y - S / 2 - 0.5, width: S + 1, height: S + 1, fill: (p.style.palette ?? [])[colors[i] - 1] ?? "#ccc" });
      if (marks.includes("shade") && b.shade[i] === 1) {
        if (p.style.shaded === "star") out.marks += tag("path", { class: "star", d: starPath(x, y, S * 0.36) });
        else if (p.style.shaded === "mine") out.marks += tag("circle", { class: "mine", cx: x, cy: y, r: S * 0.2 })
          + tag("path", { class: "mine-spikes", d: `M${x - S * 0.3} ${y}H${x + S * 0.3}M${x} ${y - S * 0.3}V${y + S * 0.3}M${n1(x - S * 0.21)} ${n1(y - S * 0.21)}L${n1(x + S * 0.21)} ${n1(y + S * 0.21)}M${n1(x + S * 0.21)} ${n1(y - S * 0.21)}L${n1(x - S * 0.21)} ${n1(y + S * 0.21)}` });
        else if (p.style.shaded === "bulb") out.marks += tag("circle", { class: "bulb", cx: x, cy: y - 2, r: S * 0.22 }) + tag("rect", { class: "bulb-base", x: x - S * 0.1, y: y + S * 0.16, width: S * 0.2, height: S * 0.12, rx: 2 });
        else out.wash += rect(i, p.style.shaded === "water" ? "shaded water" : "shaded", -0.5);
      }
      if (marks.includes("shade") && b.shade[i] === 2) {
        if (p.style.empty === "x") out.marks += xMark(x, y, S * 0.18, "xmark cellx"); else out.marks += tag("circle", { class: "dotmark", cx: x, cy: y, r: 3.5 });
      }
      if (digits && b.digit[i]) out.marks += text({ class: givenDigit.has(i) ? "digit given" : "digit", x, y: y + 2 }, symbolOf(p, b.digit[i]));
    }
    const tint = panel?.symmetry ? lineColors(p, b) : () => undefined;
    if (panel) out.lines += panelInk(p, frame, b, panel.symmetry ? tint : undefined);
    for (const e of g.borders) {
      const t = tint(e.corners[0]);
      if (marks.includes("fence") && b.fence[e.id] === 1 && !(maze && p.walls.has(e.link))) out.lines += line("mark pen", borderXY(e.id), t ? { style: `stroke:${LINE_COLORS[t]}` } : {});
      if (marks.includes("fence") && b.fence[e.id] === 2) { const [[x1, y1], [x2, y2]] = borderXY(e.id); out.marks += xMark((x1 + x2) / 2, (y1 + y2) / 2); }
      if (regionsPuzzle && e.link >= 0 && (b.cut[e.id] === 1 || colors[e.cells[0]] !== colors[e.cells[1]])) out.lines += line("mark lead", borderXY(e.id));
    }
    if (marks.includes("loop")) {
      const tintOf = links ? linkTints(p, b) : new Map<number, string>();
      for (const l of g.links) {
        if (b.loop[l.id] !== 1) continue;
        const [x1, y1] = center(l.cells[0]), [x2, y2] = center(l.cells[1]);
        const t = tintOf.get(l.cells[0]) ?? tintOf.get(l.cells[1]), style = t ? `stroke:${t};fill:${t}` : "";
        out.water += tag("line", { class: "river", x1, y1, x2, y2, ...(style ? { style } : {}) })
          + tag("circle", { class: "joint", cx: x1, cy: y1, r: 6.5, ...(style ? { style } : {}) }) + tag("circle", { class: "joint", cx: x2, cy: y2, r: 6.5, ...(style ? { style } : {}) });
      }
    }
  } else {
    for (const i of givenDigit) { const [x, y] = center(i); out.marks += text({ class: "digit given", x, y: y + 2 }, symbolOf(p, (p.cellGivens.get(i) ?? []).find((x) => x.kind === "number")!.value as number)); }
  }

  const W = ML + g.cols * S + MR, H = MT + g.rows * S + MB, wash = washDefs(W);
  return `<svg class="board picture" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label.replace(/"/g, "&quot;")}" style="--ratio:${n1(W / H)};--wash:url(#${wash.id})">` + wash.svg
    + tag("g", {}, out.tint) + tag("g", { class: "wash" }, out.wash) + tag("g", { class: "wash" }, out.rocks) + tag("g", { class: "gridlines" }, out.grid)
    + tag("g", { class: "water" }, out.water) + tag("g", {}, out.lines) + tag("g", {}, out.givens) + tag("g", { class: "marks" }, out.marks)
    + tag("g", { class: "runs" }, out.runs) + tag("g", {}, out.corners) + tag("g", {}, out.over) + "</svg>";
}

/** A figure of pieces (Three Coats), painted or not. */
function figureSvg(p: Puzzle, b: Board | null | undefined, label: string): string {
  const pieces = piecesOf(p), palette = p.style.palette?.length ? p.style.palette : PAINT;
  const xs = pieces.flat().map((q) => q[0]), ys = pieces.flat().map((q) => q[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), pad = span * 0.04;
  const pts = (q: number[][]) => q.map((pt) => pt.map(n1).join(",")).join(" ");
  let fills = "", edges = "", dots = "";
  pieces.forEach((q, i) => {
    const c = b?.color[i] ?? 0;
    fills += tag("polygon", { class: c ? "piece painted" : "piece", points: pts(q), ...(c ? { style: `fill:${palette[c - 1]}` } : {}) });
    edges += tag("polygon", { class: "edge", points: pts(q) });
    const given = (p.cellGivens.get(i) ?? []).find((x) => x.kind === "dots");
    if (!given || given.kind !== "dots") return;
    const { x: cx, y: cy, room } = roomiest(q), m = given.value.length;
    const r = Math.max(span * 0.014, Math.min(span * 0.028, room / (m > 1 ? 2.4 : 1.6))), ring = m > 1 ? r * (m > 4 ? 1.9 : 1.45) : 0;
    // hidden dots show only once their piece is painted, as in the player
    dots += tag("g", { class: `dots${given.hidden ? " hideable" : ""}${c ? " shown" : ""}` }, given.value.map((col, j) => {
      const a = -Math.PI / 2 + (2 * Math.PI * j) / m;
      return tag("circle", { class: "paint-dot", cx: n1(cx + ring * Math.cos(a)), cy: n1(cy + ring * Math.sin(a)), r: n1(r), fill: palette[col - 1] ?? "#999" });
    }).join(""));
  });
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad].map(n1), wash = washDefs(vb[2]);
  return `<svg class="board picture" viewBox="${vb.join(" ")}" role="img" aria-label="${label}" style="--edge:${n1(span * 0.006)};--ratio:${n1(vb[2] / vb[3])};--wash:url(#${wash.id})">` + wash.svg
    + tag("g", { class: "wash" }, fills) + tag("g", {}, edges) + tag("g", {}, dots) + "</svg>";
}

/** Glass colors for a regions board: each region gets a palette color its neighbours don't have. */
function glass(p: Puzzle, b: Board): number[] {
  const palette = p.style.palette ?? [];
  if (b.color.some((c) => c > 0)) return [...b.color];
  const g = p.grid, reg = regionsOf(p, b), pick: number[] = [];
  if (reg.cells.length <= 1) return new Array<number>(g.cellCount).fill(0);
  reg.cells.forEach((cs, k) => {
    const near = new Set<number>();
    for (const i of cs) for (const l of g.cellLinks[i]) { const [a, c] = g.links[l].cells, rk = reg.of[a === i ? c : a]; if (rk !== k && pick[rk] !== undefined) near.add(pick[rk]); }
    let c = 1; while (near.has(c) && c < palette.length) c++;
    pick[k] = c;
  });
  return reg.of.map((k) => pick[k] ?? 0);
}

/** Numberlink: each cell on a line takes its pair's color. */
function linkTints(p: Puzzle, b: Board) {
  const g = p.grid, value = new Map<number, number>(), tint = new Map<number, string>();
  for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") value.set(i, x.value);
  for (const [start, v] of value) {
    const stack = [start], seen = new Set([start]);
    while (stack.length) {
      const i = stack.pop()!;
      tint.set(i, LINK_COLORS[(v - 1) % LINK_COLORS.length]);
      for (const l of g.cellLinks[i]) if (b.loop[l] === 1) { const j = g.links[l].cells.find((c) => c !== i)!; if (!seen.has(j) && !value.has(j)) { seen.add(j); stack.push(j); } }
    }
  }
  return tint;
}

const xMark = (x: number, y: number, d = 5, cls = "xmark") => tag("path", { class: cls, d: `M${n1(x - d)} ${n1(y - d)}L${n1(x + d)} ${n1(y + d)}M${n1(x + d)} ${n1(y - d)}L${n1(x - d)} ${n1(y + d)}` });
const starPath = (x: number, y: number, r: number) => Array.from({ length: 10 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / 5, d = k % 2 ? r * 0.42 : r;
  return `${k ? "L" : "M"}${n1(x + d * Math.cos(a))} ${n1(y + d * Math.sin(a))}`;
}).join("") + "Z";
