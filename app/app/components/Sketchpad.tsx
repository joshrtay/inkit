// The sketchpad (/new/draw): draw a puzzle in the browser instead of on paper, in the boards' own
// look, and send it to the reader as a picture, as if it were a photo. The drawing is kept as
// objects (sketchpad/model.ts: a grid, and pen lines, washes, stamps and writing placed on it), so
// it undoes and erases a piece at a time; draw.ts draws it, export.ts makes the picture.
//
// The tools, general to specific: a grid (drag a rectangle; then its rows and columns), the pen
// (freehand; Shift or the straight-line lock for a straight line), straight lines, wash, stamps (the
// real stones and symbols, any shape from the shape pad), writing (normal, or small on corners and lines),
// and the eraser (which also breaks a grid line: a panel's gap). The grid is a magnet: with Snap on, line ends go
// to its corners, stamps to its squares or points, washes fill whole squares. Mouse, pen and touch
// (pointer events).
//
// The chrome is a paint app's, each part with one job and nothing in two places: the page's header
// holds what acts on the whole drawing (undo, redo, clear: the page gives a slot for them, beside
// its Download and Read); the tools in a strip on the left (a bottom bar on a phone); only the
// chosen tool's own settings along the top; Colour and Stamps on the right (a bottom sheet on a
// phone), the one place to choose either; and a status line under the paper for the hint and the
// workspace (the grid's size, Snap, zoom with Cmd/Ctrl + − 0).
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addInk } from "~site/lib/ink.ts";
import * as m from "~/sketchpad/model";
import { gridSvg, itemSvg, penVars, stampSvg } from "~/sketchpad/draw";
import { exportPng } from "~/sketchpad/export";
import { SHAPES, type RC } from "~/editor/ops";
import type { Anchor, Drawing, Grid, StampKind, SymbolColor, WashColor, Weight, XY } from "~/sketchpad/model";
import { SpIcon, type SpIconName } from "./SketchpadIcons";
import "~site/game-types/grid/styles.css";

type Tool = "grid" | "pen" | "line" | "wash" | "stamp" | "text" | "erase";
/** The tools, in the palette's groups (a thin line between groups). */
const TOOLS: { id: Tool; label: string; key: string; hint: string; group: number }[] = [
  { id: "grid", label: "Grid", key: "g", group: 0, hint: "Drag a rectangle for a grid; drag the grid to move it, its corner to resize it" },
  { id: "pen", label: "Pen", key: "p", group: 1, hint: "Draw freehand (hold Shift for a straight line)" },
  { id: "line", label: "Line", key: "l", group: 1, hint: "Drag a straight line; it keeps level or upright near the axes" },
  { id: "wash", label: "Wash", key: "w", group: 2, hint: "Tap or drag across squares to wash them (again to clear); brush off the grid" },
  { id: "stamp", label: "Stamp", key: "s", group: 2, hint: "Tap where the stamp goes (again to take it off)" },
  { id: "text", label: "Text", key: "t", group: 2, hint: "Tap a square and type a number or letter (Enter to finish, arrows to move on); small text goes on corners, lines and a square's sides" },
  { id: "erase", label: "Eraser", key: "e", group: 3, hint: "Tap or drag over anything to rub it out; along a grid line to break it (again to mend it)" },
];
/** The pen's weights, with the board's widths (docs/style.md) for the buttons' previews. */
const WEIGHTS: { id: Weight; label: string; width: number }[] = [
  { id: "fine", label: "Fine", width: 1.6 }, { id: "medium", label: "Medium", width: 2.6 }, { id: "bold", label: "Bold", width: 5.5 }];
/** The stamps, grouped for the picker. */
/** The stamps, in one list (many are shared between puzzle types, so they aren't grouped by type):
 *  stones, then marks, then the line puzzles' symbols. */
const STAMPS: { id: StampKind; label: string; tip?: string }[] = [
  // a panel's squares are stones too (docs/style.md), so the stone, in any colour, draws them
  { id: "stone", label: "Stone", tip: "Stone (pearls, a panel's squares, paint dots)" },
  { id: "star", label: "Star" }, { id: "rock", label: "Shaded square" }, { id: "galaxy", label: "Circle" }, { id: "x", label: "X" }, { id: "dot", label: "Dot" },
  { id: "diamond", label: "Filled diamond", tip: "Filled diamond, on a line (twins)" }, { id: "open-diamond", label: "Empty diamond", tip: "Empty diamond, on a line (opposites)" },
  { id: "hoshi", label: "Hoshi dot" }, { id: "start", label: "Start" }, { id: "end", label: "End" }, { id: "crest", label: "Crest" },
  { id: "triangle", label: "Triangles" }, { id: "shape", label: "Shape" }, { id: "eraser", label: "Eraser symbol" },
];
const STAMP_LABEL = Object.fromEntries(STAMPS.map((s) => [s.id, s.label])) as Record<StampKind, string>;
const COLORED = new Set<StampKind>(["stone", "crest", "triangle", "shape", "eraser", "start", "hoshi"]);
/** A symmetry panel's starts and dots: ink, or one of its two lines' colours. */
const LINE_STAMPS = new Set<StampKind>(["start", "hoshi"]);
/** The colour panel: the watercolours, then the two stones' colours. */
const PALETTE = [...m.WASHES, "black", "white"] as const;
type Colour = typeof PALETTE[number];
const paint = (c: Colour) => (c === "black" ? "var(--sumi)" : c === "white" ? "var(--shell)" : `var(--wash-${c})`);
const capital = (w: string) => w[0].toUpperCase() + w.slice(1);
const SAVED = "inkit:sketchpad";
const WASH_SCALE = 400;
const STEPS: Record<string, RC> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
/** Zoom, as a multiple of fitting the paper to the workspace. */
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** A stamp drawn small, for a button. */
const StampIcon = ({ s }: { s: m.Stamp | Omit<m.Stamp, "kind" | "at"> }) => (
  <span className="grid-game be-icon" aria-hidden="true"><svg viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: stampSvg(s, 16, 16, ICON_SIZE[s.stamp] ?? 40) }} /></span>
);
/** The square a stamp's button draws it in (a shaded square fills it; the rest sit in it). */
const ICON_SIZE: Partial<Record<StampKind, number>> = { rock: 20, stone: 36, star: 34, galaxy: 40, x: 40, dot: 48, end: 48, diamond: 44, "open-diamond": 44 };
/** The shape pad's size, in squares. */
const PAD = 5;
const cellsKey = (cells: RC[]) => JSON.stringify(m.normalCells(cells));

/** A chrome button with an icon, its name for screen readers, and a tooltip (name and shortcut). */
function IconButton({ icon, label, tip, pressed, className = "", ...rest }: {
  icon: SpIconName; label: string; tip?: string; pressed?: boolean; className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button type="button" className={`sp-btn sp-tip ${className}`} aria-label={label} data-tip={tip ?? label}
      aria-pressed={pressed} {...rest}><SpIcon name={icon} /></button>
  );
}

/** The shape stamp's pad: PAD × PAD squares to make any shape, tapped on and off (arrows move
 *  between them). The shape is its squares moved up to the top-left. */
function ShapePad({ cells, color, onChange }: { cells: RC[]; color: string; onChange: (cells: RC[]) => void }) {
  const on = new Set(cells.map(([r, c]) => `${r},${c}`));
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent) => {
    const step = STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    const r = Math.min(PAD - 1, Math.max(0, Math.floor(focus / PAD) + step[0])), c = Math.min(PAD - 1, Math.max(0, (focus % PAD) + step[1]));
    setFocus(r * PAD + c);
    refs.current[r * PAD + c]?.focus();
  };
  return (
    <span className="sp-pad sp-tip" role="group" aria-label="Shape pad" data-tip="Tap squares to make any shape" onKeyDown={onKey} style={{ "--sp-pad-on": color } as React.CSSProperties}>
      {Array.from({ length: PAD * PAD }, (_, k) => {
        const r = Math.floor(k / PAD), c = k % PAD;
        return <button key={k} ref={(el) => { refs.current[k] = el; }} type="button" className="sp-pad-cell" tabIndex={k === focus ? 0 : -1}
          aria-label={`Row ${r + 1}, column ${c + 1}`} aria-pressed={on.has(`${r},${c}`)}
          onClick={() => { setFocus(k); onChange(m.toggleCell(cells, r, c)); }} />;
      })}
    </span>
  );
}

/** What the pointer is doing, from pointer-down to up (one undo step). */
type Gesture =
  | { kind: "grid-new"; from: XY }
  | { kind: "grid-move"; from: XY; grid: Grid }
  | { kind: "grid-stretch"; grid: Grid }
  | { kind: "pen"; points: XY[] }
  | { kind: "line"; from: XY }
  | { kind: "wash"; on: boolean; last: XY }
  | { kind: "brush"; points: XY[] }
  /** rubbing out: things (not gaps), or breaking grid lines (along level or upright ones), or mending them */
  | { kind: "erase"; last: XY; mode: "items" | "gap" | "mend"; side?: m.EdgeAt["side"] };

export interface SketchpadHandle {
  /** the drawing as a PNG (about 1600px across) */
  png(): Promise<Blob>;
  /** the drawing as data (model.ts objects()), as JSON: sent to the reader with the picture */
  data(): string;
  /** whether anything's drawn */
  empty: boolean;
}

export function Sketchpad({ handle, onChange, actions }: {
  /** set to the sketchpad's exporter (the page's Download and Read buttons use it) */
  handle: React.MutableRefObject<SketchpadHandle | null>;
  /** after every change */
  onChange?: (d: Drawing) => void;
  /** where in the page's header undo, redo and clear go */
  actions?: HTMLElement | null;
}) {
  const [history, setHistory] = useState(() => m.start());
  const [draft, setDraft] = useState<Drawing | null>(null);   // the drawing during a gesture
  const [tool, setTool] = useState<Tool>("grid");
  const [snapping, setSnapping] = useState(true);
  const [weight, setWeight] = useState<Weight>("bold");
  const [wash, setWash] = useState<WashColor>("blue");
  const [stampKind, setStampKind] = useState<StampKind>("stone");
  const [colors, setColors] = useState<Partial<Record<StampKind, SymbolColor>>>({ stone: "black", crest: "orange", triangle: "orange", shape: "yellow", eraser: "white", start: "black", hoshi: "black" });
  const [count, setCount] = useState(1);
  const [pad, setPad] = useState<RC[]>(SHAPES[2].cells);   // the shape pad's squares, where they are on it
  const [hollow, setHollow] = useState(false);
  const [mayTurn, setMayTurn] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [small, setSmall] = useState(false);
  const [hover, setHover] = useState<XY | null>(null);
  const [typing, setTyping] = useState<{ at: Anchor; value: string; small: boolean } | null>(null);
  const [preview, setPreview] = useState<Grid | null>(null);   // a grid being dragged out
  const [straight, setStraight] = useState(false);   // the pen draws straight lines, as with Shift
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<number | null>(null);   // the paper's width that fits the workspace
  const [sheet, setSheet] = useState(false);   // the side panel, open as a sheet (phones)
  const [mod, setMod] = useState("Ctrl+");
  const toolButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const side = useRef<HTMLElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const defs = useRef<SVGSVGElement>(null);
  const root = useRef<HTMLDivElement>(null);
  /** the gesture under way: what it started from, and the drawing it's made so far */
  const gesture = useRef<{ g: Gesture; base: Drawing; now?: Drawing } | null>(null);

  const d = draft ?? history.now;
  const g = d.grid, S = m.squareOf(d);
  const cells = m.normalCells(pad);
  const current = (at: Anchor): m.Stamp => ({
    kind: "stamp", stamp: stampKind, at,
    ...(COLORED.has(stampKind) ? { color: colors[stampKind] } : {}),
    ...(stampKind === "triangle" ? { count } : {}),
    ...(stampKind === "shape" ? { cells, ...(hollow ? { hollow } : {}), ...(mayTurn ? { rotate: true } : {}) } : {}),
    ...(stampKind === "stone" && hidden ? { hidden } : {}),
  });

  // the watercolour filter (in a hidden SVG of its own, so React's never has to make room for
  // it); and the drawing from last time
  useEffect(() => { if (defs.current && root.current) addInk(defs.current, root.current); }, []);
  useEffect(() => { if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘"); }, []);
  // the paper fits the workspace (zoom 1), whatever the window's size
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFit(Math.max(220, Math.floor(Math.min(el.clientWidth, el.clientHeight) - 40))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { const saved = m.revive(JSON.parse(localStorage.getItem(SAVED) ?? "null")); if (saved) setHistory(m.start(saved)); } catch { /* nothing saved */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;   // not over the saved drawing before it's read
    try { localStorage.setItem(SAVED, JSON.stringify(history.now)); } catch { /* private mode: not kept */ }
    onChange?.(history.now);
  }, [history.now, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = useRef(history.now);
  latest.current = history.now;
  handle.current = {
    png: () => exportPng(svg.current!, latest.current),
    data: () => JSON.stringify(m.objects(latest.current)),
    empty: !history.now.grid && !history.now.items.length,
  };

  const change = (next: Drawing) => setHistory((h) => m.commit(h, next));
  /** A change made to the drawing as it is when it lands (not as this render saw it). */
  const edit = (f: (d: Drawing) => Drawing) => setHistory((h) => m.commit(h, f(h.now)));
  const zoomBy = (step: 1 | -1) => setZoom((z) => ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + step))] ?? 1);
  const undo = () => { setTyping(null); setHistory(m.undo); };
  const redo = () => { setTyping(null); setHistory(m.redo); };

  // ---- keys: undo and redo, and a letter for each tool ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomBy(1); return; }
      if (mod && (e.key === "-" || e.key === "_")) { e.preventDefault(); zoomBy(-1); return; }
      if (mod && e.key === "0") { e.preventDefault(); setZoom(1); return; }
      if (e.key === "Escape") { setSheet(false); return; }
      if (mod || e.altKey) return;
      const to = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (to) { setTool(to.id); setTyping(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Where a pointer is on the page. */
  const toPage = (e: { clientX: number; clientY: number }): XY => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * m.PAGE) / r.width, y: ((e.clientY - r.top) * m.PAGE) / r.height };
  };
  const reachOf = (e: React.PointerEvent) => (e.pointerType === "touch" ? 14 : 8);

  // ---- drawing with the pointer ----
  /** The gesture's drawing so far, on screen. */
  const show = (next: Drawing) => { if (gesture.current) gesture.current.now = next; setDraft(next); };
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (typing) { commitTyping(); if (tool !== "text") return; }
    const p = toPage(e), base = history.now, bg = base.grid;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that's already gone */ }
    const begin = (gg: Gesture) => { gesture.current = { g: gg, base }; };
    switch (tool) {
      case "grid":
        if (bg && m.onHandle(bg, p, reachOf(e) + 4)) begin({ kind: "grid-stretch", grid: bg });
        else if (bg && m.inGrid(bg, p)) begin({ kind: "grid-move", from: p, grid: bg });
        else begin({ kind: "grid-new", from: p });
        break;
      case "pen":
        if (e.shiftKey || straight) begin({ kind: "line", from: p });
        else { begin({ kind: "pen", points: [p] }); show(m.add(base, { kind: "pen", weight, points: m.penStroke(bg, [p], false) })); }
        break;
      case "line": begin({ kind: "line", from: p }); break;
      case "wash": {
        const cell = snapping ? m.cellAt(bg, p) : null;
        if (cell) {
          const on = m.washOf(base, cell)?.color !== wash;
          begin({ kind: "wash", on, last: p });
          show(m.washCell(base, cell, wash, on));
        } else begin({ kind: "brush", points: [p] });
        break;
      }
      case "stamp": { const s = current(m.stampAnchor(bg, p, stampKind, snapping)); edit((dd) => m.stamp(dd, s)); break; }
      case "text": {
        e.preventDefault();
        const at = m.textAnchor(bg, p, small, snapping), there = m.textAt(base, at);
        setTyping({ at, value: there?.text ?? "", small: there ? !!there.small : small });
        break;
      }
      case "erase": {
        // on a gap: mend it; on a bare grid line (or a washed square's edge): break it; else rub out
        const reach = reachOf(e), it = m.hit(base, p, reach), edge = m.edgeAt(bg, p, reach);
        const onLine = edge && (!it || ((it.kind === "wash" || it.kind === "brush") && m.edgeAt(bg, p, reach / 2)));
        if (it?.kind === "gap") { begin({ kind: "erase", last: p, mode: "mend" }); show(m.remove(base, [it.id])); }
        else if (onLine) { begin({ kind: "erase", last: p, mode: "gap", side: edge.side }); show(m.gapEdge(base, edge, true)); }
        else { begin({ kind: "erase", last: p, mode: "items" }); if (it) show(m.remove(base, [it.id])); }
        break;
      }
    }
  }

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const p = toPage(e);
    setHover(p);
    const gs = gesture.current;
    if (!gs) return;
    const { g: gg, base } = gs, now = gs.now ?? base;
    switch (gg.kind) {
      case "grid-new": setPreview(m.gridFromDrag(gg.from, p)); break;
      case "grid-move": show(m.setGrid(base, m.moveGrid(gg.grid, p.x - gg.from.x, p.y - gg.from.y))); break;
      case "grid-stretch": show(m.setGrid(base, m.stretchGrid(gg.grid, p))); break;
      case "pen": {
        if (e.shiftKey) { gs.g = { kind: "line", from: gg.points[0] }; move(e); return; }
        const more = (e.nativeEvent.getCoalescedEvents?.() ?? []).map(toPage);
        gg.points.push(...(more.length ? more : [p]));
        show(m.add(base, { kind: "pen", weight, points: m.penStroke(base.grid, gg.points, false) }));
        break;
      }
      case "line": show(m.add(base, { kind: "line", weight, ...m.straightLine(base.grid, gg.from, p, snapping) })); break;
      case "wash": {
        // every square the pointer passed over since last time, however quick the drag
        let next = now;
        for (const q of m.along(gg.last, p, S / 4)) { const cell = m.cellAt(base.grid, q); if (cell) next = m.washCell(next, cell, wash, gg.on); }
        gg.last = p;
        show(next);
        break;
      }
      case "brush": {
        const more = (e.nativeEvent.getCoalescedEvents?.() ?? []).map(toPage);
        gg.points.push(...(more.length ? more : [p]));
        show(m.add(base, { kind: "brush", color: wash, points: m.penStroke(base.grid, gg.points, false) }));
        break;
      }
      case "erase": {
        let next = now;
        const reach = reachOf(e);
        for (const q of m.along(gg.last, p, 4)) {
          if (gg.mode === "gap") { const edge = m.edgeAt(base.grid, q, reach, gg.side); if (edge) next = m.gapEdge(next, edge, true); continue; }
          const it = m.hit(next, q, reach, gg.mode === "mend" ? (x) => x.kind === "gap" : (x) => x.kind !== "gap");
          if (it) next = m.remove(next, [it.id]);
        }
        gg.last = p;
        show(next);
        break;
      }
    }
  }

  function up(e: React.PointerEvent<SVGSVGElement>) {
    const gs = gesture.current;
    gesture.current = null;
    if (!gs) return;
    const p = toPage(e), { g: gg, base } = gs;
    let next = gs.now ?? base;
    switch (gg.kind) {
      case "grid-new": {
        const grid = m.gridFromDrag(gg.from, p);
        next = grid ? m.setGrid(base, grid) : base;
        setPreview(null);
        break;
      }
      case "pen": next = m.add(base, { kind: "pen", weight, points: m.penStroke(base.grid, gg.points, snapping) }); break;
      case "brush": next = m.add(base, { kind: "brush", color: wash, points: m.penStroke(base.grid, gg.points, false) }); break;
      case "line": {
        const line = m.straightLine(base.grid, gg.from, p, snapping), a = m.pointOf(base.grid, line.from), b = m.pointOf(base.grid, line.to);
        next = Math.hypot(a.x - b.x, a.y - b.y) < 2 ? base : m.add(base, { kind: "line", weight, ...line });
        break;
      }
    }
    setDraft(null);
    change(next);
  }

  // ---- writing ----
  function commitTyping(then?: Anchor | null) {
    if (!typing) return;
    const { at, value } = typing;
    edit((dd) => m.write(dd, at, value, typing.small));
    if (then) setTyping({ at: then, value: m.textAt(history.now, then)?.text ?? "", small: typing.small });
    else setTyping(null);
  }
  const typingAt = typing && m.pointOf(g, typing.at);
  const typed = useRef<HTMLInputElement>(null);
  useEffect(() => { typed.current?.focus(); typed.current?.select(); }, [typing?.at]);

  // ---- the grid's rows and columns ----
  const resize = (rows: number, cols: number) => edit((dd) => (dd.grid ? m.setGrid(dd, m.resizeGrid(dd.grid, rows, cols)) : dd));
  const addGrid = () => edit((dd) => m.setGrid(dd, { x: 64, y: 64, rows: 6, cols: 6, S: 72 }));

  // ---- what's drawn ----
  const layers = useMemo(() => m.LAYERS.map((kinds) => d.items.filter((it) => kinds.includes(it.kind))), [d]);
  const gaps = useMemo(() => m.gapsOf(d), [d]);
  const markup = (it: m.Item) => itemSvg(d, it);
  const ghost = (() => {
    if (!hover || gesture.current || typing) return "";
    if (tool === "stamp") { const at = m.stampAnchor(g, hover, stampKind, snapping), q = m.pointOf(g, at); return `<g class="ghost">${stampSvg(current(at), q.x, q.y, S, m.outward(g, at))}</g>`; }
    if (tool === "text" && small && snapping && g) {
      const q = m.pointOf(g, m.textAnchor(g, hover, true, true));
      return `<circle class="spot" cx="${q.x}" cy="${q.y}" r="${Math.max(5, S * 0.16)}"/>`;
    }
    if ((tool === "text" || tool === "wash") && snapping) {
      const at = tool === "text" ? m.snap(g, hover, ["cell"]) : m.cellAt(g, hover);
      if (at) { const q = m.pointOf(g, at); return `<rect class="spot" x="${q.x - S / 2}" y="${q.y - S / 2}" width="${S}" height="${S}"/>`; }
    }
    if (tool === "erase" && !m.hit(d, hover, 8)) {
      // the stretch of grid line the eraser would break
      const edge = m.edgeAt(g, hover, 8);
      if (edge) { const [a, b] = m.edgeEnds(edge).map((x) => m.pointOf(g, x)); return `<line class="spot-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; }
    }
    return "";
  })();
  const toolHint = TOOLS.find((x) => x.id === tool)!.hint;
  const toolLabel = TOOLS.find((x) => x.id === tool)!.label;

  // ---- colour: the chosen stamp's, if it has one and the stamp tool's out; else the wash's ----
  const forStamp = tool === "stamp" && COLORED.has(stampKind);
  const colour: Colour = forStamp ? (colors[stampKind] ?? "black") : wash;
  const colourFor = forStamp ? `${STAMP_LABEL[stampKind]} colour` : "Wash colour";
  const allowed = (c: Colour) => (!forStamp ? (m.WASHES as readonly string[]).includes(c)
    : LINE_STAMPS.has(stampKind) ? c === "black" || c === "blue" || c === "yellow"
    : c !== "pink" && (stampKind === "stone" || stampKind === "eraser" || c !== "black"));
  const pickColour = (c: Colour) => { if (forStamp) setColors({ ...colors, [stampKind]: c as SymbolColor }); else setWash(c as WashColor); };

  // ---- the side panel: always there on a wide screen, a bottom sheet on a phone ----
  const phone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
  const pickStamp = (k: StampKind) => { setStampKind(k); setTool("stamp"); setTyping(null); if (phone()) setSheet(false); };

  // ---- the tool palette: a toolbar, arrows move along it ----
  const onToolKey = (e: React.KeyboardEvent) => {
    const k = toolButtons.current.findIndex((b) => b === document.activeElement), n = TOOLS.length;
    if (k < 0) return;
    const to = e.key === "ArrowDown" || e.key === "ArrowRight" ? (k + 1) % n : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (k + n - 1) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    toolButtons.current[to]?.focus();
  };
  const shift = mod === "⌘" ? "⇧⌘" : "Ctrl+Shift+";

  const snapToggle = (
    <button type="button" className="sp-btn sp-toggle sp-tip" aria-pressed={snapping} onClick={() => setSnapping(!snapping)}
      data-tip="Snap to the grid: line ends to its corners, stamps to its squares and points, washes fill squares"><SpIcon name="magnet" /><span>Snap</span></button>
  );
  const stepper = (name: string, value: number, set: (n: number) => void) => (
    <span className="sp-field"><span className="sp-label">{name}</span>
      <span className="sp-stepper">
        <button type="button" className="sp-btn" onClick={() => set(value - 1)} aria-label={`Fewer ${name.toLowerCase()}`}>−</button>
        <output aria-label={name}>{value}</output>
        <button type="button" className="sp-btn" onClick={() => set(value + 1)} aria-label={`More ${name.toLowerCase()}`}>+</button>
      </span>
    </span>
  );

  return (
    <div className="sp-work">
      {/* ---- the chosen tool's options, along the top ---- */}
      <div className="sp-opts" role="group" aria-label={`${toolLabel} options`}>
        <span className="sp-opts-tool" aria-hidden="true"><SpIcon name={tool} />{toolLabel}</span>
        <span className="sp-opts-sep" aria-hidden="true" />
        <span className="sp-opts-body">
          {tool === "grid" && (g ? <>
            {stepper("Rows", g.rows, (n) => resize(n, g.cols))}
            {stepper("Columns", g.cols, (n) => resize(g.rows, n))}
            <span className="sp-seg sp-tip" role="group" aria-label="Grid look" data-tip="Pen lines, a panel's wide tracks, a honeycomb, or a lattice of points">
              {([["Lines", "lines"], ["Tracks", "tracks"], ["Hexagons", "hex"], ["Dots", "dots"]] as const).map(([name, look]) => <button key={name} type="button" className="sp-btn sp-text-btn" aria-pressed={m.lookOf(g) === look}
                onClick={() => edit((dd) => (dd.grid ? m.setGrid(dd, m.setLook(dd.grid, look)) : dd))}>{name}</button>)}
            </span>
            <button type="button" className="sp-btn sp-text-btn sp-tip" onClick={() => edit(m.removeGrid)} data-tip="Take the grid away (what's drawn stays)">Remove grid</button>
          </> : <button type="button" className="sp-btn sp-text-btn sp-tip" onClick={addGrid} data-tip="A 6 × 6 grid in the middle of the page (or drag one out)">Add a grid</button>)}

          {(tool === "pen" || tool === "line") && (
            <span className="sp-seg" role="group" aria-label="Pen weight">
              {WEIGHTS.map((w) => <button key={w.id} type="button" className="sp-btn sp-weight sp-tip" aria-label={w.label} data-tip={`${w.label} pen`} aria-pressed={weight === w.id} onClick={() => setWeight(w.id)}>
                <svg viewBox="0 0 30 14" aria-hidden="true"><line x1="4" y1="7" x2="26" y2="7" style={{ strokeWidth: w.width }} /></svg>
              </button>)}
            </span>
          )}
          {tool === "pen" && (
            <button type="button" className="sp-btn sp-toggle sp-tip" aria-pressed={straight} onClick={() => setStraight(!straight)} data-tip="Straight lines (or hold Shift)">
              <SpIcon name="straight" /><span>Straight</span></button>
          )}

          {tool === "text" && (
            <span className="sp-seg" role="group" aria-label="Text size">
              <button type="button" className="sp-btn sp-tip" aria-pressed={!small} onClick={() => setSmall(false)} data-tip="Normal: a clue in a square">Normal</button>
              <button type="button" className="sp-btn sp-tip sp-small-btn" aria-pressed={small} onClick={() => setSmall(true)}
                data-tip="Small: on a corner, a line, or a square's side or corner">Small</button>
            </span>
          )}

          {tool === "stamp" && <>
            {stampKind === "stone" && (
              <button type="button" className="sp-btn sp-toggle sp-tip" aria-pressed={hidden} onClick={() => setHidden(!hidden)} data-tip="Hidden until painted (a dashed outline)">
                <StampIcon s={{ stamp: "stone", color: colors.stone, hidden: true }} /><span>Hidden</span></button>
            )}
            {stampKind === "triangle" && (
              <span className="sp-seg" role="group" aria-label="How many">
                {[1, 2, 3].map((n) => <button key={n} type="button" className="sp-btn sp-num" aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}
              </span>
            )}
            {stampKind === "shape" && <>
              <span className="sp-shapes" role="group" aria-label="Shape">
                {SHAPES.map((x) => <button key={x.name} type="button" className="sp-btn sp-thumb sp-tip" aria-pressed={cellsKey(x.cells) === cellsKey(pad)} aria-label={x.name} data-tip={x.name}
                  onClick={() => setPad(x.cells)}><StampIcon s={{ stamp: "shape", cells: x.cells, color: colors.shape }} /></button>)}
              </span>
              <ShapePad cells={pad} color={paint(colors.shape ?? "yellow")} onChange={setPad} />
              <span className="sp-seg" role="group" aria-label="Turn or flip">
                <IconButton icon="rotate" label="Turn the shape" tip="Turn a quarter turn" onClick={() => setPad(m.turnCells(pad))} />
                <IconButton icon="flip" label="Flip the shape" tip="Flip (its mirror image)" onClick={() => setPad(m.flipCells(pad))} />
              </span>
              <button type="button" className="sp-btn sp-toggle sp-tip" aria-pressed={hollow} onClick={() => setHollow(!hollow)} data-tip="Hollow: a negative shape, outlined">
                <StampIcon s={{ stamp: "shape", cells: [[0, 0], [0, 1], [1, 0]], color: colors.shape, hollow: true }} /><span>Hollow</span></button>
              <button type="button" className="sp-btn sp-toggle sp-tip" aria-pressed={mayTurn} onClick={() => setMayTurn(!mayTurn)} data-tip="May turn: drawn tilted">
                <StampIcon s={{ stamp: "shape", cells: [[0, 0], [0, 1], [1, 0]], color: colors.shape, rotate: true }} /><span>May turn</span></button>
            </>}
          </>}
        </span>
        <span className="sp-opts-end sp-phone-only">
          <IconButton icon="palette" label="Colour and stamps" onClick={() => setSheet(true)} />
        </span>
      </div>
      {actions && createPortal(<span className="sp-doc">
          <IconButton icon="undo" label="Undo" tip={`Undo (${mod}Z)`} onClick={undo} disabled={!history.past.length} />
          <IconButton icon="redo" label="Redo" tip={`Redo (${shift}Z)`} onClick={redo} disabled={!history.future.length} />
          <IconButton icon="clear" label="Clear" tip="Clear the page" disabled={!history.now.items.length && !history.now.grid}
            onClick={() => { if (confirm("Clear the page? (Undo brings it back.)")) { setTyping(null); edit(m.clear); } }} />
        </span>, actions)}

      {/* ---- the tools, down the left (along the bottom on a phone) ---- */}
      <div className="sp-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical" onKeyDown={onToolKey}>
        {TOOLS.map((x, k) => <Fragment key={x.id}>
          {k > 0 && TOOLS[k - 1].group !== x.group && <span className="sp-sep" aria-hidden="true" />}
          <button ref={(el) => { toolButtons.current[k] = el; }} type="button" className="sp-btn sp-tool sp-tip" aria-label={x.label}
            aria-keyshortcuts={x.key.toUpperCase()} aria-pressed={tool === x.id} tabIndex={tool === x.id ? 0 : -1} data-tip={`${x.label} (${x.key.toUpperCase()})`}
            onClick={() => { setTool(x.id); setTyping(null); }}><SpIcon name={x.id} /></button>
        </Fragment>)}
      </div>

      {/* ---- the paper, on the workspace ---- */}
      <div className="grid-game sketchpad sp-canvas" ref={root}>
        <div className={`sp-paper tool-${tool}`} style={fit ? { width: Math.round(fit * zoom) } : undefined}>
          {/* the wash filter, made for a board about WASH_SCALE units across (a 7 × 7 board's), so a
              stamp's watercolour comes out as it does on the board */}
          <svg className="sp-defs" viewBox={`0 0 ${WASH_SCALE} ${WASH_SCALE}`} ref={defs} aria-hidden="true" />
          <svg ref={svg} className="sp-board" viewBox={`0 0 ${m.PAGE} ${m.PAGE}`} role="img" aria-label="Your drawing" style={penVars(S) as React.CSSProperties}
            onMouseDown={(e) => e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)}
            data-items={d.items.length} data-grid={g ? `${g.rows}x${g.cols}` : ""}>
            <g className="sp-ink">
              <g dangerouslySetInnerHTML={{ __html: layers[0].map(markup).join("") }} />
              {g && <g dangerouslySetInnerHTML={{ __html: gridSvg(g, gaps) }} />}
              <g dangerouslySetInnerHTML={{ __html: layers[1].map(markup).join("") }} />
              <g dangerouslySetInnerHTML={{ __html: layers[2].map(markup).join("") }} />
              <g data-export="skip" dangerouslySetInnerHTML={{ __html: layers[3].map(markup).join("") }} />
            </g>
            <g className="sp-ui" data-export="skip">
              <g dangerouslySetInnerHTML={{ __html: ghost }} />
              {preview && <rect className="outline" x={preview.x} y={preview.y} width={preview.cols * preview.S} height={preview.rows * preview.S} />}
              {preview && <g className="ghost" dangerouslySetInnerHTML={{ __html: gridSvg(preview) }} />}
              {tool === "grid" && g && <rect className="grid-hit" x={g.x} y={g.y} width={m.gridSpan(g).w * g.S} height={m.gridSpan(g).h * g.S} />}
              {tool === "grid" && g && <circle className="handle" cx={m.handleOf(g).x} cy={m.handleOf(g).y} r={7} />}
            </g>
          </svg>
          {typing && typingAt && (
            <input ref={typed} className={`sp-typing${typing.small ? " small" : ""}`} aria-label="Text" value={typing.value} maxLength={12}
              style={{ left: `${(typingAt.x / m.PAGE) * 100}%`, top: `${(typingAt.y / m.PAGE) * 100}%`, width: `${Math.max(2.2, typing.value.length + 1.2)}em` }}
              onChange={(e) => setTyping({ ...typing, value: e.target.value })}
              onBlur={() => commitTyping()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitTyping(); }
                else if (e.key === "Escape") setTyping(null);
                else if (STEPS[e.key] && typing.at.at === "cell" && (e.key.startsWith("ArrowU") || e.key.startsWith("ArrowD") || !typing.value || e.currentTarget.selectionStart === (e.key === "ArrowLeft" ? 0 : typing.value.length))) {
                  e.preventDefault();
                  const [dr, dc] = STEPS[e.key];
                  commitTyping({ at: "cell", r: typing.at.r + dr, c: typing.at.c + dc });
                }
              }} />
          )}
        </div>
      </div>

      {/* ---- the status line ---- */}
      <div className="sp-status">
        <span className="sp-status-hint" aria-live="polite">{toolHint}</span>
        <span className="sp-status-facts">{g ? `${g.rows} × ${g.cols} grid` : "No grid"}</span>
        {snapToggle}
        <span className="sp-zoom" role="group" aria-label="Zoom">
          <IconButton icon="zoomOut" label="Zoom out" tip={`Zoom out (${mod}−)`} onClick={() => zoomBy(-1)} disabled={zoom <= ZOOMS[0]} />
          <button type="button" className="sp-btn sp-zoom-fit sp-tip" aria-label="Zoom to fit" data-tip={`Fit the page (${mod}0)`} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <IconButton icon="zoomIn" label="Zoom in" tip={`Zoom in (${mod}+)`} onClick={() => zoomBy(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} />
        </span>
      </div>

      {/* ---- Colour and Stamps, on the right (a bottom sheet on a phone) ---- */}
      {sheet && <div className="sp-scrim" aria-hidden="true" onClick={() => setSheet(false)} />}
      <aside ref={side} className={`sp-side${sheet ? " open" : ""}`} aria-label="Colour and stamps">
        <div className="sp-sheet-head">
          <strong>Colour and stamps</strong>
          <IconButton icon="close" label="Close" onClick={() => setSheet(false)} />
        </div>
        <section id="sp-colour" className="sp-panel" aria-labelledby="sp-colour-h">
          <h2 id="sp-colour-h" className="sp-panel-h">Colour</h2>
          <div className="sp-current">
            <span className="sp-fg" style={{ background: paint(colour) }} aria-hidden="true" />
            <span className="sp-current-text"><span>{colourFor}</span><b>{capital(colour)}</b></span>
          </div>
          <div className="sp-swatches" role="group" aria-label={colourFor}>
            {PALETTE.map((c) => <button key={c} type="button" className="sp-swatch sp-tip" aria-label={capital(c)} data-tip={capital(c)}
              aria-pressed={colour === c} disabled={!allowed(c)} onClick={() => { pickColour(c); if (phone()) setSheet(false); }}>
              <span style={{ background: paint(c) }} /></button>)}
          </div>
        </section>
        <section id="sp-stamps" className="sp-panel" aria-labelledby="sp-stamps-h">
          <h2 id="sp-stamps-h" className="sp-panel-h">Stamps</h2>
          <div className="sp-stamps" role="group" aria-label="Stamps">
            {STAMPS.map((st) => <button key={st.id} type="button" className="sp-stamp sp-tip" aria-label={st.label} data-tip={st.tip ?? st.label}
              aria-pressed={stampKind === st.id} onClick={() => pickStamp(st.id)}>
              <StampIcon s={{ stamp: st.id, color: colors[st.id], ...(st.id === "triangle" ? { count: 1 } : {}), ...(st.id === "shape" ? { cells: SHAPES[2].cells } : {}) }} />
            </button>)}
          </div>
        </section>
      </aside>
    </div>
  );
}
