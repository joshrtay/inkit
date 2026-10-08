// The sketchpad (/new/draw): draw a puzzle in the browser instead of on paper, in the boards' own
// look, and send it to the reader as a picture, as if it were a photo. The drawing is kept as
// objects (sketchpad/model.ts: a grid, and pen lines, washes, stamps and writing placed on it), so
// it undoes and erases a piece at a time; draw.ts draws it, export.ts makes the picture.
//
// The tools, general to specific: a grid (drag a rectangle; then its rows and columns), the pen
// (freehand; Shift for a straight line), straight lines, wash, stamps (the real stones and symbols),
// writing, and the eraser. The grid is a magnet: with Snap on, line ends go to its corners, stamps
// to its squares or points, washes fill whole squares. Mouse, pen and touch (pointer events).
import { useEffect, useMemo, useRef, useState } from "react";
import { addInk } from "~site/lib/ink.ts";
import * as m from "~/sketchpad/model";
import { gridSvg, itemSvg, stampSvg } from "~/sketchpad/draw";
import { exportPng } from "~/sketchpad/export";
import { SHAPES, turnShape, type RC } from "~/editor/ops";
import type { Anchor, Drawing, Grid, StampKind, SymbolColor, WashColor, Weight, XY } from "~/sketchpad/model";
import "~site/game-types/grid/styles.css";

type Tool = "grid" | "pen" | "line" | "wash" | "stamp" | "text" | "erase";
const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: "grid", label: "Grid", key: "g", hint: "Drag a rectangle for a grid; drag the grid to move it, its corner to resize it" },
  { id: "pen", label: "Pen", key: "p", hint: "Draw freehand (hold Shift for a straight line)" },
  { id: "line", label: "Line", key: "l", hint: "Drag a straight line; it keeps level or upright near the axes" },
  { id: "wash", label: "Wash", key: "w", hint: "Tap or drag across squares to wash them (again to clear); brush off the grid" },
  { id: "stamp", label: "Stamp", key: "s", hint: "Pick a stamp, then tap where it goes (again to take it off)" },
  { id: "text", label: "Text", key: "t", hint: "Tap a square and type a number or letter (Enter to finish, arrows to move on)" },
  { id: "erase", label: "Eraser", key: "e", hint: "Tap or drag over anything to rub it out" },
];
const WEIGHTS: { id: Weight; label: string }[] = [{ id: "fine", label: "Fine" }, { id: "medium", label: "Medium" }, { id: "bold", label: "Bold" }];
/** The stamps, grouped for the picker. */
const STAMP_GROUPS: { name: string; stamps: { id: StampKind; label: string }[] }[] = [
  { name: "Stones", stamps: [{ id: "stone", label: "Stone" }] },
  { name: "Marks", stamps: [{ id: "star", label: "Star" }, { id: "rock", label: "Shaded square" }, { id: "galaxy", label: "Circle" }, { id: "x", label: "X" }, { id: "dot", label: "Dot" }] },
  { name: "Panel symbols", stamps: [{ id: "hoshi", label: "Hoshi dot" }, { id: "start", label: "Start" }, { id: "end", label: "End" }, { id: "crest", label: "Crest" },
    { id: "triangle", label: "Triangles" }, { id: "shape", label: "Shape" }, { id: "eraser", label: "Eraser symbol" }] },
];
const COLORED = new Set<StampKind>(["stone", "crest", "triangle", "shape"]);
const capital = (w: string) => w[0].toUpperCase() + w.slice(1);
const SAVED = "inkit:sketchpad";
const WASH_SCALE = 400;
const STEPS: Record<string, RC> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** A stamp drawn small, for a button. */
const StampIcon = ({ s }: { s: m.Stamp | Omit<m.Stamp, "kind" | "at"> }) => (
  <span className="grid-game be-icon" aria-hidden="true"><svg viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: stampSvg(s, 16, 16, ICON_SIZE[s.stamp] ?? 40) }} /></span>
);
/** The square a stamp's button draws it in (a shaded square fills it; the rest sit in it). */
const ICON_SIZE: Partial<Record<StampKind, number>> = { rock: 20, stone: 36, star: 34, galaxy: 40, x: 40, dot: 48, end: 48 };

/** What the pointer is doing, from pointer-down to up (one undo step). */
type Gesture =
  | { kind: "grid-new"; from: XY }
  | { kind: "grid-move"; from: XY; grid: Grid }
  | { kind: "grid-stretch"; grid: Grid }
  | { kind: "pen"; points: XY[] }
  | { kind: "line"; from: XY }
  | { kind: "wash"; on: boolean; last: XY }
  | { kind: "brush"; points: XY[] }
  | { kind: "erase"; last: XY };

export interface SketchpadHandle {
  /** the drawing as a PNG (about 1600px across) */
  png(): Promise<Blob>;
  /** whether anything's drawn */
  empty: boolean;
}

export function Sketchpad({ handle, onChange }: {
  /** set to the sketchpad's exporter (the page's Download and Read buttons use it) */
  handle: React.MutableRefObject<SketchpadHandle | null>;
  /** after every change */
  onChange?: (d: Drawing) => void;
}) {
  const [history, setHistory] = useState(() => m.start());
  const [draft, setDraft] = useState<Drawing | null>(null);   // the drawing during a gesture
  const [tool, setTool] = useState<Tool>("grid");
  const [snapping, setSnapping] = useState(true);
  const [weight, setWeight] = useState<Weight>("bold");
  const [wash, setWash] = useState<WashColor>("blue");
  const [stampKind, setStampKind] = useState<StampKind>("stone");
  const [colors, setColors] = useState<Partial<Record<StampKind, SymbolColor>>>({ stone: "black", crest: "orange", triangle: "orange", shape: "yellow" });
  const [count, setCount] = useState(1);
  const [shapeAt, setShapeAt] = useState(0);
  const [turns, setTurns] = useState(0);
  const [hover, setHover] = useState<XY | null>(null);
  const [typing, setTyping] = useState<{ at: Anchor; value: string } | null>(null);
  const [preview, setPreview] = useState<Grid | null>(null);   // a grid being dragged out
  const svg = useRef<SVGSVGElement>(null);
  const defs = useRef<SVGSVGElement>(null);
  const root = useRef<HTMLDivElement>(null);
  /** the gesture under way: what it started from, and the drawing it's made so far */
  const gesture = useRef<{ g: Gesture; base: Drawing; now?: Drawing } | null>(null);

  const d = draft ?? history.now;
  const g = d.grid, S = m.squareOf(d);
  const cells = Array.from({ length: turns }).reduce<RC[]>((cs) => turnShape(cs), SHAPES[shapeAt].cells);
  const current = (at: Anchor): m.Stamp => ({
    kind: "stamp", stamp: stampKind, at,
    ...(COLORED.has(stampKind) ? { color: colors[stampKind] } : {}),
    ...(stampKind === "triangle" ? { count } : {}),
    ...(stampKind === "shape" ? { cells } : {}),
  });

  // the watercolour filter (in a hidden SVG of its own, so React's never has to make room for
  // it); and the drawing from last time
  useEffect(() => { if (defs.current && root.current) addInk(defs.current, root.current); }, []);
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
    empty: !history.now.grid && !history.now.items.length,
  };

  const change = (next: Drawing) => setHistory((h) => m.commit(h, next));
  /** A change made to the drawing as it is when it lands (not as this render saw it). */
  const edit = (f: (d: Drawing) => Drawing) => setHistory((h) => m.commit(h, f(h.now)));
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
      if (mod || e.altKey) return;
      const to = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (to) setTool(to.id);
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
        if (e.shiftKey) begin({ kind: "line", from: p });
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
        const at = (snapping && m.snap(bg, p, ["cell"])) || m.loose(bg, p);
        setTyping({ at, value: m.textAt(base, at)?.text ?? "" });
        break;
      }
      case "erase": {
        begin({ kind: "erase", last: p });
        const it = m.hit(base, p, reachOf(e));
        if (it) show(m.remove(base, [it.id]));
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
        for (const q of m.along(gg.last, p, 4)) { const it = m.hit(next, q, reachOf(e)); if (it) next = m.remove(next, [it.id]); }
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
    edit((dd) => m.write(dd, at, value));
    if (then) setTyping({ at: then, value: m.textAt(history.now, then)?.text ?? "" });
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
  const markup = (it: m.Item) => itemSvg(d, it);
  const ghost = (() => {
    if (!hover || gesture.current || typing) return "";
    if (tool === "stamp") { const at = m.stampAnchor(g, hover, stampKind, snapping), q = m.pointOf(g, at); return `<g class="ghost">${stampSvg(current(at), q.x, q.y, S, m.outward(g, at))}</g>`; }
    if ((tool === "text" || tool === "wash") && snapping) {
      const at = tool === "text" ? m.snap(g, hover, ["cell"]) : m.cellAt(g, hover);
      if (at) { const q = m.pointOf(g, at); return `<rect class="spot" x="${q.x - S / 2}" y="${q.y - S / 2}" width="${S}" height="${S}"/>`; }
    }
    return "";
  })();
  const toolHint = TOOLS.find((x) => x.id === tool)!.hint;

  return (
    <>
      <div className="studio-tools sp-tools">
        <div className="be-tools">
          <span className="be-group be-seg" role="group" aria-label="Tool">
            {TOOLS.map((x) => <button key={x.id} type="button" className="be-btn" aria-pressed={tool === x.id} title={`${x.hint} (${x.key.toUpperCase()})`}
              onClick={() => { setTool(x.id); setTyping(null); }}>{x.label}</button>)}
          </span>
          <span className="tool-sep" aria-hidden="true" />
          <span className="be-group">
            <button type="button" className="be-btn" aria-pressed={snapping} onClick={() => setSnapping(!snapping)}
              title="Line ends go to the grid's corners, stamps to its squares and points, washes fill squares">Snap</button>
            <button type="button" className="be-btn" onClick={undo} disabled={!history.past.length} title="Undo (⌘Z)">Undo</button>
            <button type="button" className="be-btn" onClick={redo} disabled={!history.future.length} title="Redo (⇧⌘Z)">Redo</button>
            <button type="button" className="be-btn" disabled={!history.now.items.length && !history.now.grid}
              onClick={() => { if (confirm("Clear the page? (Undo brings it back.)")) { setTyping(null); edit(m.clear); } }}>Clear</button>
          </span>
        </div>
        {/* the tool's own choices, on a line of their own so the page doesn't jump when the tool changes */}
        <div className="be-tools sp-options">
          {tool === "grid" && (g ? <>
            <span className="be-group be-size">Rows <button type="button" className="be-btn" onClick={() => resize(g.rows - 1, g.cols)} aria-label="Fewer rows">−</button><b>{g.rows}</b><button type="button" className="be-btn" onClick={() => resize(g.rows + 1, g.cols)} aria-label="More rows">+</button></span>
            <span className="be-group be-size">Columns <button type="button" className="be-btn" onClick={() => resize(g.rows, g.cols - 1)} aria-label="Fewer columns">−</button><b>{g.cols}</b><button type="button" className="be-btn" onClick={() => resize(g.rows, g.cols + 1)} aria-label="More columns">+</button></span>
            <button type="button" className="be-btn" onClick={() => edit(m.removeGrid)} title="Take the grid away (what's drawn stays)">Remove grid</button>
          </> : <button type="button" className="be-btn" onClick={addGrid} title="A 6 × 6 grid in the middle of the page (or drag one out)">Add a grid</button>)}

          {(tool === "pen" || tool === "line") && (
            <span className="be-group be-seg" role="group" aria-label="Pen">
              {WEIGHTS.map((w) => <button key={w.id} type="button" className="be-btn" aria-pressed={weight === w.id} onClick={() => setWeight(w.id)}>{w.label}</button>)}
            </span>
          )}

          {tool === "wash" && (
            <span className="be-group be-swatches" role="group" aria-label="Wash color">
              {m.WASHES.map((c) => <button key={c} type="button" className="be-swatch" aria-pressed={wash === c} aria-label={capital(c)} title={capital(c)} onClick={() => setWash(c)}>
                <span className="sp-swatch" style={{ background: `var(--wash-${c})` }} />
              </button>)}
            </span>
          )}

          {tool === "stamp" && <>
            {STAMP_GROUPS.map((grp) => (
              <span key={grp.name} className="be-group be-swatches" role="group" aria-label={grp.name}>
                {grp.stamps.map((s) => <button key={s.id} type="button" className="be-swatch" aria-pressed={stampKind === s.id} aria-label={s.label} title={s.label} onClick={() => setStampKind(s.id)}>
                  <StampIcon s={{ stamp: s.id, color: colors[s.id], ...(s.id === "triangle" ? { count: 1 } : {}), ...(s.id === "shape" ? { cells: SHAPES[2].cells } : {}) }} />
                </button>)}
              </span>
            ))}
            {COLORED.has(stampKind) && <>
              <span className="tool-sep" aria-hidden="true" />
              <span className="be-group be-swatches" role="group" aria-label={`${capital(stampKind)} color`}>
                {m.SYMBOL_COLORS.filter((c) => stampKind === "stone" || c !== "black").map((c) => (
                  <button key={c} type="button" className="be-swatch" aria-pressed={colors[stampKind] === c} aria-label={capital(c)} title={capital(c)} onClick={() => setColors({ ...colors, [stampKind]: c })}>
                    <StampIcon s={{ stamp: "stone", color: c }} />
                  </button>))}
              </span>
            </>}
            {stampKind === "triangle" && (
              <span className="be-group be-seg" role="group" aria-label="How many">
                {[1, 2, 3].map((n) => <button key={n} type="button" className="be-btn" aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}
              </span>
            )}
            {stampKind === "shape" && (
              <span className="be-group be-shapes" role="group" aria-label="Shape">
                {SHAPES.map((x, k) => <button key={x.name} type="button" className="be-swatch" aria-pressed={shapeAt === k} aria-label={x.name} title={x.name}
                  onClick={() => { setShapeAt(k); setTurns(0); }}><StampIcon s={{ stamp: "shape", cells: x.cells, color: colors.shape }} /></button>)}
                <button type="button" className="be-btn be-turn" onClick={() => setTurns((turns + 1) % 4)} title="Turn the shape a quarter turn">
                  <StampIcon s={{ stamp: "shape", cells, color: colors.shape }} />↻</button>
              </span>
            )}
          </>}
          {(tool === "text" || tool === "erase") && <span className="sp-say">{toolHint}</span>}
        </div>
      </div>

      <div className="grid-game sketchpad" ref={root}>
        <div className={`sp-paper tool-${tool}`}>
          {/* the wash filter, made for a board about WASH_SCALE units across (a 7 × 7 board's), so a
              stamp's watercolour comes out as it does on the board */}
          <svg className="sp-defs" viewBox={`0 0 ${WASH_SCALE} ${WASH_SCALE}`} ref={defs} aria-hidden="true" />
          <svg ref={svg} className="sp-board" viewBox={`0 0 ${m.PAGE} ${m.PAGE}`} role="img" aria-label="Your drawing"
            onMouseDown={(e) => e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)}
            data-items={d.items.length} data-grid={g ? `${g.rows}x${g.cols}` : ""}>
            <g className="sp-ink">
              <g dangerouslySetInnerHTML={{ __html: layers[0].map(markup).join("") }} />
              {g && <g dangerouslySetInnerHTML={{ __html: gridSvg(g) }} />}
              <g dangerouslySetInnerHTML={{ __html: layers[1].map(markup).join("") }} />
              <g dangerouslySetInnerHTML={{ __html: layers[2].map(markup).join("") }} />
              <g data-export="skip" dangerouslySetInnerHTML={{ __html: layers[3].map(markup).join("") }} />
            </g>
            <g className="sp-ui" data-export="skip">
              <g dangerouslySetInnerHTML={{ __html: ghost }} />
              {preview && <rect className="outline" x={preview.x} y={preview.y} width={preview.cols * preview.S} height={preview.rows * preview.S} />}
              {preview && <g className="ghost" dangerouslySetInnerHTML={{ __html: gridSvg(preview) }} />}
              {tool === "grid" && g && <circle className="handle" cx={g.x + g.cols * g.S} cy={g.y + g.rows * g.S} r={7} />}
            </g>
          </svg>
          {typing && typingAt && (
            <input ref={typed} className="sp-typing" aria-label="Text" value={typing.value} maxLength={12}
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
        {tool !== "text" && tool !== "erase" && <p className="hint sp-hint" aria-live="polite">{toolHint}</p>}
      </div>
    </>
  );
}
