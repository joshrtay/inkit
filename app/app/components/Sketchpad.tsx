// The sketchpad, paint's paper and tools (components/Paint.tsx, /g/<id>/draw): draw a puzzle in the
// browser instead of on paper, in the boards' own look. The drawing is kept as objects
// (sketchpad/model.ts: a grid, and pen lines, washes, stamps and writing placed on it), so it undoes
// and erases a piece at a time; draw.ts draws it, export.ts makes its picture (Download).
//
// The tools, general to specific: a grid (drag a rectangle; then its rows and columns), the pen
// (freehand; Shift or the straight-line lock for a straight line), straight lines, Areas (squares
// dragged into an area, for a type with areas: the page redraws its borders), wash, stamps (the
// real stones and symbols, any shape from the shape pad; a drag from a square stamps the squares it
// crosses), writing (normal, or small on corners and lines; loose writing tapped is edited in place),
// and the eraser (which also breaks a grid line: a panel's gap). The grid is a magnet: with Snap on, line ends go
// to its corners, stamps to its squares or points, washes fill whole squares. Mouse, pen and touch
// (pointer events).
//
// The chrome is a paint app's, each part with one job and nothing in two places (docs/creation-flow.md,
// "v3 layout"): the page's header holds what acts on the whole drawing (undo, redo, and … with Clear
// and Download: the page gives a slot for them); the tools in a rail on the left (a bottom bar on a
// phone); the palette, floating in one fixed place over the workspace's top left, with only the
// chosen tool's settings (Stamp's stamps and colours, Wash's colour, the pen's weights …) (a strip
// above the tools on a phone); the page's own drawer on the right (`drawer`); and a status line
// under the paper for the hint, Snap and zoom (Cmd/Ctrl + − 0).
//
// The workspace is open paper (sketchpad/view.ts): it pans (the wheel; a drag with Space held or
// the middle button; two fingers) and zooms (Ctrl or Cmd with the wheel, a pinch, the buttons); Fit
// shows the puzzle itself as big as the room beside the palette allows, and a new grid is fitted
// as it's made. The drawing keeps its page units, so drawings saved before still open as they were.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { addInk } from "~site/lib/ink.ts";
import * as m from "~/sketchpad/model";
import { gridSvg, itemSvg, penVars, stampSvg, textSize } from "~/sketchpad/draw";
import { exportPng } from "~/sketchpad/export";
import { SHAPES, type RC } from "~/editor/ops";
import { colourAllowed, TOOL_ORDER, type Kit, type Look } from "~/sketchpad/kit";
import { paintAreas } from "~/sketchpad/to-puzzle";
import * as cam from "~/sketchpad/view";
import { place, rectOf } from "~/lib/place";
import type { Anchor, Drawing, Grid, StampKind, SymbolColor, WashColor, Weight, XY } from "~/sketchpad/model";
import { SpIcon, type SpIconName } from "./SketchpadIcons";
import { useConfirm } from "./ConfirmDialog";
import { ReportBugItem } from "./BugReport";
import "~site/game-types/grid/styles.css";

type Tool = Kit["tools"][number];
/** The tools, in the palette's groups (a thin line between groups). */
const TOOLS: { id: Tool; label: string; key: string; hint: string; group: number }[] = [
  { id: "grid", label: "Grid", key: "g", group: 0, hint: "Drag a rectangle for a grid; drag the grid to move it, its corner to resize it" },
  { id: "pen", label: "Pen", key: "p", group: 1, hint: "Draw freehand (hold Shift for a straight line)" },
  { id: "line", label: "Line", key: "l", group: 1, hint: "Drag a straight line; it keeps level or upright near the axes" },
  { id: "region", label: "Areas", key: "a", group: 1, hint: "Drag from a square across others to put them in its area (with New area, in an area of their own); the borders follow" },
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
  { id: "thermo", label: "Thermometer", tip: "Thermometer: drag from the bulb through the squares" },
  { id: "inequality", label: "Inequality", tip: "A < sign on a line, pointing at the smaller side" },
  { id: "palisade", label: "Palisade mark", tip: "Palisade: how many of the square's sides are borders" },
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
const WASH_SCALE = 400;
const STEPS: Record<string, RC> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
/** A zoom button's step. */
const ZOOM_STEP = 1.25;
/** The paper's texture (public/paper.svg), its tile in page units. */
const GRAIN = 512;

/** A stamp drawn small, for a button. */
const StampIcon = ({ s }: { s: m.Stamp | Omit<m.Stamp, "kind" | "at"> }) => (
  <span className="grid-game be-icon" aria-hidden="true"><svg viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: stampSvg(s, 16, 16, ICON_SIZE[s.stamp] ?? 40) }} /></span>
);
/** The square a stamp's button draws it in (a shaded square fills it; the rest sit in it). */
const ICON_SIZE: Partial<Record<StampKind, number>> = { rock: 20, stone: 36, star: 34, galaxy: 40, x: 40, dot: 48, end: 48, diamond: 44, "open-diamond": 44, inequality: 60, palisade: 60, thermo: 44 };
/** The shape pad's size, in squares. */
const PAD = 5;
const cellsKey = (cells: RC[]) => JSON.stringify(m.normalCells(cells));

/** A chrome button with an icon, its name for screen readers, and a tooltip (name and shortcut). */
function IconButton({ icon, label, tip, pressed, className = "", ...rest }: {
  icon: SpIconName; label: string; tip?: string; pressed?: boolean; className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button type="button" className={`sp-btn ${className}`} aria-label={label} data-tip={tip ?? label}
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
    <span className="sp-pad" role="group" aria-label="Shape pad" data-tip="Tap squares to make any shape" onKeyDown={onKey} style={{ "--sp-pad-on": color } as React.CSSProperties}>
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
  /** a stamp tapped, then dragged across squares: each square gets it (on), or loses it */
  | { kind: "stamps"; on: boolean; seen: string[]; last: XY }
  /** squares dragged into an area: the first square's (letter), or a new one (null) */
  | { kind: "region"; letter: string | null; cells: [number, number][]; areas: string[]; last: XY }
  /** a thermometer, dragged from its bulb through the squares */
  | { kind: "thermo"; cells: [number, number][] }
  /** rubbing out: things (not gaps), or breaking grid lines (along level or upright ones), or mending them */
  | { kind: "erase"; last: XY; mode: "items" | "gap" | "mend"; side?: m.EdgeAt["side"] };

/** How the type's look is said ("Panel is played on tracks"). */
const LOOK_WORDS: Record<Look, string> = { lines: "with lines", tracks: "on tracks", hex: "on hexagons", dots: "on dots" };

export interface SketchpadHandle {
  /** whether anything's drawn */
  empty: boolean;
  /** a change to the drawing from outside (one undo step) */
  edit(f: (d: Drawing) => Drawing): void;
}

export function Sketchpad({ handle, onChange, actions, initial, kit = null, typeName = "", overlay = "", underlay = "", tip, drawer, onPaper, areas = null, filename = "puzzle-drawing.png" }: {
  /** set to the sketchpad's handle: the page changes the drawing through it */
  handle: React.MutableRefObject<SketchpadHandle | null>;
  /** after every change */
  onChange?: (d: Drawing) => void;
  /** where in the page's header undo, redo and clear go */
  actions?: HTMLElement | null;
  /** the drawing to start from (the page keeps it) */
  initial?: Drawing;
  /** the puzzle type's tools, stamps, colours and grid look (null: no type, every tool) */
  kit?: Kit | null;
  /** the type's name, for what's flagged as not its */
  typeName?: string;
  /** marks on the paper (SVG markup in page units; never exported) */
  overlay?: string;
  /** drawn with the grid, as ink (a sudoku's box lines) */
  underlay?: string;
  /** a tip on the paper, pointing at a page point, beside the box (page units) of what it's about */
  tip?: { at: XY; box?: { x0: number; y0: number; x1: number; y1: number } | null; node: ReactNode } | null;
  /** the page's drawer, on the right (a bottom sheet and its handle on a phone) */
  drawer?: ReactNode;
  /** the … menu's Download: the picture's file name */
  filename?: string;
  /** a press on the paper (before the tool acts), at a page point */
  onPaper?: (p: XY) => void;
  /** the type's areas (to-puzzle.ts's areasOf / withAreas), for the Areas tool: none, no Areas tool */
  areas?: { of(d: Drawing): string[] | null; set(d: Drawing, areas: string[]): Drawing } | null;
}) {
  const [history, setHistory] = useState(() => m.start(initial ?? m.EMPTY));
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
  const [flip, setFlip] = useState(false);   // an inequality pointing right or down
  const [sides, setSides] = useState(2);     // a palisade's inked sides
  const [opposite, setOpposite] = useState(false);
  const [newArea, setNewArea] = useState(false);   // the Areas tool makes an area of its own
  const [small, setSmall] = useState(false);
  const [hover, setHover] = useState<XY | null>(null);
  const [typing, setTyping] = useState<{ at: Anchor; value: string; small: boolean } | null>(null);
  const [preview, setPreview] = useState<Grid | null>(null);   // a grid being dragged out
  const [straight, setStraight] = useState(false);   // the pen draws straight lines, as with Shift
  // ---- the view: which part of the open paper shows, and how big (sketchpad/view.ts) ----
  const [view, setViewState] = useState<cam.View | null>(null);   // null until the workspace is measured
  const [size, setSize] = useState({ w: 0, h: 0 });                 // the workspace, in pixels
  const viewNow = useRef<cam.View | null>(null);
  /** the view is Fit's (so it fits again when the workspace changes size) */
  const fitted = useRef(true);
  const setView = (v: cam.View, fit = false) => { viewNow.current = v; fitted.current = fit; setViewState(v); };
  const [panReady, setPanReady] = useState(false);   // Space held: a drag pans
  const spaceHeld = useRef(false);
  /** a drag that pans (Space or the middle button), or two fingers moving and pinching */
  const panning = useRef<{ from: XY; start: cam.View } | null>(null);
  const touches = useRef(new Map<number, XY>());
  const pinching = useRef<{ start: cam.View; mid: XY; dist: number } | null>(null);
  // the … menu, open under the header's … or over the phone strip's (it's drawn in the top layer)
  const [menu, setMenu] = useState<"head" | "strip" | null>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const { confirm } = useConfirm();
  const [mod, setMod] = useState("Ctrl+");
  const toolButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const paletteRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const defs = useRef<SVGSVGElement>(null);
  const root = useRef<HTMLDivElement>(null);
  /** the gesture under way: what it started from, and the drawing it's made so far */
  const gesture = useRef<{ g: Gesture; base: Drawing; now?: Drawing } | null>(null);

  // ---- the type's kit: its tools and stamps, and the rest behind "All tools" ----
  const [everything, setEverything] = useState(false);
  const own = (t: Tool) => !kit || kit.tools.includes(t);
  const ownStamp = (k: StampKind) => !kit || kit.stamps.includes(k);
  // the Areas tool needs the type's areas to paint
  const usable = TOOLS.filter((x) => x.id !== "region" || areas);
  const tools = !kit ? usable : [...usable.filter((x) => own(x.id)), ...(everything ? usable.filter((x) => !own(x.id)) : [])];
  const stamps = !kit ? STAMPS : [...STAMPS.filter((x) => ownStamp(x.id)), ...(everything ? STAMPS.filter((x) => !ownStamp(x.id)) : [])];
  const notOurs = `Not part of ${typeName || "this type"}`;
  // a tool or stamp the type doesn't use, once it's hidden, gives way to the type's first
  useEffect(() => {
    if (!tools.some((x) => x.id === tool)) { setTool(tools.find((x) => x.id !== "grid" && x.id !== "erase")?.id ?? "grid"); setTyping(null); }
    if (stamps.length && !stamps.some((x) => x.id === stampKind)) setStampKind(stamps[0].id);
  }, [kit, everything]); // eslint-disable-line react-hooks/exhaustive-deps
  /** a new grid in the type's look */
  const inLook = (grid: Grid | null) => (grid && kit && m.lookOf(grid) !== kit.look ? m.setLook(grid, kit.look) : grid);

  const d = draft ?? history.now;
  const g = d.grid, S = m.squareOf(d);
  const cells = m.normalCells(pad);
  const current = (at: Anchor): m.Stamp => ({
    kind: "stamp", stamp: stampKind, at,
    ...(COLORED.has(stampKind) ? { color: colors[stampKind] } : {}),
    ...(stampKind === "triangle" ? { count } : {}),
    ...(stampKind === "shape" ? { cells, ...(hollow ? { hollow } : {}), ...(mayTurn ? { rotate: true } : {}) } : {}),
    ...(stampKind === "stone" && hidden ? { hidden } : {}),
    ...(stampKind === "inequality" && flip ? { flip } : {}),
    ...(stampKind === "palisade" ? { count: sides, ...(sides === 2 && opposite ? { opposite } : {}) } : {}),
  });

  // the watercolour filter (in a hidden SVG of its own, so React's never has to make room for
  // it); and the drawing from last time
  useEffect(() => { if (defs.current && root.current) addInk(defs.current, root.current); }, []);
  useEffect(() => { if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘"); }, []);
  // the … menu, in the top layer (over the drawer, the palette and the sheet), placed under its
  // button (over it at a phone's foot), kept on screen
  useLayoutEffect(() => {
    const el = menuRef.current, button = el?.parentElement?.querySelector("button");
    if (!el || !button) return;
    try { el.showPopover?.(); } catch { /* shown */ }
    const at = place(rectOf(button.getBoundingClientRect()), { w: el.offsetWidth, h: el.offsetHeight },
      { x: 0, y: 0, w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }, "bottom", { gap: 6, align: "end" });
    el.style.left = `${Math.round(at.x)}px`;
    el.style.top = `${Math.round(at.y)}px`;
  }, [menu]);
  // the … menu closes on a click outside it
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => { if (!(e.target as Element).closest(".sp-menu-wrap")) setMenu(null); };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [menu]);
  // the workspace's size: the first time, the drawing is fitted; after, a fitted view fits again,
  // and one the creator moved keeps its middle where it was
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = { w: 0, h: 0 };
    const ro = new ResizeObserver(() => {
      const now = { w: el.clientWidth, h: el.clientHeight };
      if (now.w === last.w && now.h === last.h) return;
      const v = viewNow.current;
      if (!v || fitted.current) fitTo(latest.current, now);
      else setView({ ...v, x: v.x - (now.w - last.w) / 2 / v.k, y: v.y - (now.h - last.h) / 2 / v.k });
      last = now;
      setSize(now);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the wheel pans; with Ctrl or Cmd (a trackpad's pinch too) it zooms at the pointer
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const v = viewNow.current;
      if (!v) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setView(cam.zoomAt(v, v.k * Math.exp(-e.deltaY * unit * 0.0025), e.clientX - r.left, e.clientY - r.top));
      else setView(cam.panBy(v, -(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, -(e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Space held: a drag pans, whatever the tool: with the pointer over the paper (else not while
  // typing, or on a button Space presses)
  const overPaper = useRef(false);
  useEffect(() => {
    const free = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("input, textarea, select, [contenteditable]")) return false;
      return overPaper.current || t === document.body || !!t.closest?.(".sp-canvas");
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !free(e)) return;
      e.preventDefault();
      if (!spaceHeld.current) { spaceHeld.current = true; setPanReady(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") { spaceHeld.current = false; setPanReady(false); } };
    const away = () => { spaceHeld.current = false; setPanReady(false); };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", away);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", away); };
  }, []);
  useEffect(() => { onChange?.(history.now); }, [history.now]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = useRef(history.now);
  latest.current = history.now;
  handle.current = {
    empty: !history.now.grid && !history.now.items.length,
    edit: (f) => edit(f),
  };

  const change = (next: Drawing) => setHistory((h) => m.commit(h, next));
  /** A change made to the drawing as it is when it lands (not as this render saw it). */
  const edit = (f: (d: Drawing) => Drawing) => setHistory((h) => m.commit(h, f(h.now)));
  /** The room the drawing fits into: the workspace, with a small margin; and the palette, where it
   *  floats over it (in the workspace's pixels), for Fit to keep clear of. */
  const roomOf = (sz: { w: number; h: number }): cam.Room => ({ ...sz, left: 8, top: 8, right: 8, bottom: 8 });
  const paletteOver = (): cam.Box | null => {
    const el = root.current, pal = paletteRef.current;
    if (!el || !pal) return null;
    const a = el.getBoundingClientRect(), b = pal.getBoundingClientRect();
    const over = b.width > 0 && b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top;
    // its column, top to bottom: it grows and shrinks with the tool, and shouldn't cover the puzzle when it does
    return over ? { x: b.left - a.left, y: 0, w: b.width + (b.top - a.top), h: a.height } : null;
  };
  /** Fit: the puzzle (the grid and what's drawn, with a margin) as big as the room allows, clear of the palette. */
  function fitTo(dd: Drawing, sz = { w: root.current?.clientWidth ?? 0, h: root.current?.clientHeight ?? 0 }) {
    if (!sz.w || !sz.h) return;
    setView(cam.fitClear(cam.fitBox(dd), roomOf(sz), paletteOver()), true);
  }
  const zoomBy = (step: 1 | -1) => {
    const v = viewNow.current;
    if (!v) return;
    const cx = size.w / 2, cy = size.h / 2;
    setView(cam.zoomAt(v, step > 0 ? v.k * ZOOM_STEP : v.k / ZOOM_STEP, cx, cy));
  };
  const undo = () => { setTyping(null); setHistory(m.undo); };
  const redo = () => { setTyping(null); setHistory(m.redo); };

  // ---- keys: undo and redo, and a letter for each tool ----
  const toolsNow = useRef(tools);
  toolsNow.current = tools;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomBy(1); return; }
      if (mod && (e.key === "-" || e.key === "_")) { e.preventDefault(); zoomBy(-1); return; }
      if (mod && e.key === "0") { e.preventDefault(); fitTo(latest.current); return; }
      if (e.key === "Escape") { setMenu(null); return; }
      if (mod || e.altKey) return;
      const to = toolsNow.current.find((x) => x.key === e.key.toLowerCase());
      if (to) { setTool(to.id); setTyping(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Where a pointer is in the workspace (pixels from its top-left), and on the page. */
  const toLocal = (e: { clientX: number; clientY: number }): XY => {
    const r = root.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toPage = (e: { clientX: number; clientY: number }): XY => {
    const q = toLocal(e), v = viewNow.current;
    return v ? cam.toPage(v, q.x, q.y) : q;
  };
  /** How near counts as on something: a few screen pixels, in page units. */
  const reachOf = (e: React.PointerEvent) => (e.pointerType === "touch" ? 14 : 8) / (viewNow.current?.k ?? 1);
  /** Two fingers' middle and how far apart they are. */
  const fingers = () => {
    const [a, b] = [...touches.current.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  /** The gesture under way, dropped (two fingers came down: they move the view instead). */
  const dropGesture = () => { gesture.current = null; setDraft(null); setPreview(null); };

  // ---- drawing with the pointer ----
  /** The gesture's drawing so far, on screen. */
  const show = (next: Drawing) => { if (gesture.current) gesture.current.now = next; setDraft(next); };
  function down(e: React.PointerEvent<SVGSVGElement>) {
    // two fingers move and pinch the view (what the first began is dropped)
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, toLocal(e));
      if (touches.current.size >= 2) {
        dropGesture();
        if (touches.current.size === 2 && viewNow.current) pinching.current = { start: viewNow.current, ...fingers() };
        return;
      }
    }
    // a drag with Space held, or with the middle button: the paper follows
    if ((e.button === 1 || (spaceHeld.current && e.button === 0)) && viewNow.current) {
      panning.current = { from: { x: e.clientX, y: e.clientY }, start: viewNow.current };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* gone */ }
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (typing) { commitTyping(); if (tool !== "text") return; }
    const p = toPage(e), base = history.now, bg = base.grid;
    onPaper?.(p);
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
      case "region": {
        const cell = m.cellAt(bg, p), now = areas?.of(base);
        if (!cell || !now) break;
        const gg: Gesture = { kind: "region", letter: newArea ? null : now[cell.r][cell.c], cells: [[cell.r, cell.c]], areas: now, last: p };
        begin(gg);
        show(painted(base, gg));
        break;
      }
      case "wash": {
        const cell = snapping ? m.cellAt(bg, p) : null;
        if (cell) {
          const on = m.washOf(base, cell)?.color !== wash;
          begin({ kind: "wash", on, last: p });
          show(m.washCell(base, cell, wash, on));
        } else begin({ kind: "brush", points: [p] });
        break;
      }
      case "stamp": {
        if (stampKind === "thermo") {
          const cell = m.cellAt(bg, p);
          if (cell) { begin({ kind: "thermo", cells: [[cell.r, cell.c]] }); show(base); }
          break;
        }
        const at = m.stampAnchor(bg, p, stampKind, snapping), next = m.stamp(base, current(at));
        // in a square, a drag carries on: across squares, stamping them (or, if the tap took it off, clearing them)
        begin({ kind: "stamps", on: next.items.length >= base.items.length, seen: at.at === "cell" ? [`${at.r},${at.c}`] : [], last: p });
        show(next);
        break;
      }
      case "text": {
        e.preventDefault();
        // loose writing tapped is edited where it is (a list under the grid, say); else a new place
        const hit = m.hit(base, p, reachOf(e), (x) => x.kind === "text" && (x.at.at === "grid" || x.at.at === "page"));
        const at = hit?.kind === "text" ? hit.at : m.textAnchor(bg, p, small, snapping), there = m.textAt(base, at);
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
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, toLocal(e));
    const pin = pinching.current;
    if (pin) { if (touches.current.size >= 2) setView(cam.pinch(pin.start, pin, fingers())); return; }
    const pan = panning.current;
    if (pan) { setView(cam.panBy(pan.start, e.clientX - pan.from.x, e.clientY - pan.from.y)); return; }
    const p = toPage(e);
    setHover(p);
    const gs = gesture.current;
    if (!gs) return;
    const { g: gg, base } = gs, now = gs.now ?? base;
    switch (gg.kind) {
      case "grid-new": setPreview(inLook(m.gridFromDrag(gg.from, p))); break;
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
      case "stamps": {
        if (!gg.seen.length) break;   // not in a square: a stamp, not a drag
        let next = now;
        for (const q of m.along(gg.last, p, S / 4)) {
          const at = m.stampAnchor(base.grid, q, stampKind, snapping);
          if (at.at !== "cell" || gg.seen.includes(`${at.r},${at.c}`)) continue;
          gg.seen.push(`${at.r},${at.c}`);
          const t = m.stamp(next, current(at)), took = t.items.length < next.items.length;
          if (took !== gg.on) next = t;   // stamping on: not where it's already; clearing: only where it is
        }
        gg.last = p;
        show(next);
        break;
      }
      case "region": {
        for (const q of m.along(gg.last, p, S / 4)) {
          const cell = m.cellAt(base.grid, q);
          if (cell && !gg.cells.some(([r, c]) => r === cell.r && c === cell.c)) gg.cells.push([cell.r, cell.c]);
        }
        gg.last = p;
        show(painted(base, gg));
        break;
      }
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
      case "thermo": {
        // the squares passed through, each next to the last (near a square's middle, so a diagonal isn't taken by accident)
        for (const q of m.along(m.pointOf(base.grid, { at: "cell", r: gg.cells[gg.cells.length - 1][0], c: gg.cells[gg.cells.length - 1][1] }), p, S / 4)) {
          const cell = m.cellAt(base.grid, q), mid = cell && m.pointOf(base.grid, cell);
          if (cell && mid && Math.hypot(mid.x - q.x, mid.y - q.y) < S * 0.38) gg.cells = m.thermoStep(gg.cells, cell.r, cell.c);
        }
        show(gg.cells.length > 1 ? m.add(base, { kind: "thermo", cells: gg.cells }) : base);
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
    touches.current.delete(e.pointerId);
    if (pinching.current) { if (touches.current.size < 2) pinching.current = null; return; }
    if (panning.current) { panning.current = null; return; }
    const gs = gesture.current;
    gesture.current = null;
    if (!gs) return;
    const p = toPage(e), { g: gg, base } = gs;
    let next = gs.now ?? base;
    switch (gg.kind) {
      case "grid-new": {
        const grid = inLook(m.gridFromDrag(gg.from, p));
        next = grid ? m.setGrid(base, grid) : base;
        setPreview(null);
        if (grid) fitTo(next);   // a new grid: the view fits it
        break;
      }
      case "pen": next = m.add(base, { kind: "pen", weight, points: m.penStroke(base.grid, gg.points, snapping) }); break;
      case "brush": next = m.add(base, { kind: "brush", color: wash, points: m.penStroke(base.grid, gg.points, false) }); break;
      case "thermo": next = m.thermo(base, gg.cells); break;
      case "line": {
        const line = m.straightLine(base.grid, gg.from, p, snapping), a = m.pointOf(base.grid, line.from), b = m.pointOf(base.grid, line.to);
        next = Math.hypot(a.x - b.x, a.y - b.y) < 2 ? base : m.add(base, { kind: "line", weight, ...line });
        break;
      }
    }
    setDraft(null);
    change(next);
  }

  /** The drawing with the squares dragged into their area (and its borders redrawn); as it was if nothing moved. */
  function painted(base: Drawing, gg: Extract<Gesture, { kind: "region" }>): Drawing {
    const next = paintAreas(gg.areas, gg.cells, gg.letter);
    return next.join("/") === gg.areas.join("/") || !areas ? base : areas.set(base, next);
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
  /** A 6 × 6 grid in the middle of the view, fitted. */
  const addGrid = () => {
    const v = viewNow.current, pal = paletteOver(), S = 72;
    const left = pal ? pal.x + pal.w : 0, mid = v ? cam.toPage(v, (left + size.w) / 2, size.h / 2) : { x: m.PAGE / 2, y: m.PAGE / 2 };
    const next = m.setGrid(history.now, inLook({ x: Math.round(mid.x - 3 * S), y: Math.round(mid.y - 3 * S), rows: 6, cols: 6, S })!);
    change(next);
    fitTo(next);
  };

  // ---- what's drawn ----
  const layers = useMemo(() => m.LAYERS.map((kinds) => d.items.filter((it) => kinds.includes(it.kind))), [d]);
  const gaps = useMemo(() => m.gapsOf(d), [d]);
  const markup = (it: m.Item) => itemSvg(d, it);
  const ghost = (() => {
    if (!hover || gesture.current || typing) return "";
    if (tool === "stamp" && stampKind === "thermo") {
      const at = m.cellAt(g, hover);
      if (at) { const q = m.pointOf(g, at); return `<circle class="spot" cx="${q.x}" cy="${q.y}" r="${S * 0.36}"/>`; }
      return "";
    }
    if (tool === "stamp") { const at = m.stampAnchor(g, hover, stampKind, snapping), q = m.pointOf(g, at); return `<g class="ghost">${stampSvg(current(at), q.x, q.y, S, m.outward(g, at), at.at === "edge" ? at.side : undefined)}</g>`; }
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
  // ---- on the workspace, in pixels: the box being typed in, the paper's grain, the tip ----
  const typingScreen = typingAt && view ? cam.toScreen(view, typingAt) : null;
  const typingPx = typing ? Math.max(11, textSize(d, typing.small) * (view?.k ?? 1)) : undefined;
  const grain = view ? {
    "--grain-x": `${(-view.x * view.k).toFixed(1)}px`, "--grain-y": `${(-view.y * view.k).toFixed(1)}px`, "--grain": `${Math.max(96, GRAIN * view.k).toFixed(1)}px`,
  } as React.CSSProperties : undefined;
  // the tip beside what it's about: above it if there's room, else below or beside, kept on the workspace
  const tipKey = tip ? `${tip.at.x},${tip.at.y}` : "";
  useLayoutEffect(() => {
    const el = tipRef.current, v = view;
    if (!el || !tip || !v || !size.w) return;
    const b = tip.box, a = b ? cam.toScreen(v, { x: b.x0, y: b.y0 }) : cam.toScreen(v, tip.at), z = b ? cam.toScreen(v, { x: b.x1, y: b.y1 }) : a;
    const at = place({ x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y }, { w: el.offsetWidth, h: el.offsetHeight }, { x: 0, y: 0, w: size.w, h: size.h }, "top", { gap: 12, margin: 10 });
    el.style.left = `${Math.round(at.x)}px`;
    el.style.top = `${Math.round(at.y)}px`;
    el.dataset.side = at.side;
    el.style.setProperty("--arrow", `${Math.round(at.arrow)}px`);
  });
  // a tip about something out of view: the view moves to it
  useEffect(() => {
    const v = viewNow.current;
    if (!tip || !v || !size.w) return;
    const q = cam.toScreen(v, tip.at);
    if (q.x < 0 || q.y < 0 || q.x > size.w || q.y > size.h) setView({ ...v, x: tip.at.x - size.w / 2 / v.k, y: tip.at.y - size.h / 2 / v.k });
  }, [tipKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toolHint = TOOLS.find((x) => x.id === tool)!.hint;
  const toolLabel = TOOLS.find((x) => x.id === tool)!.label;

  // ---- colour: the chosen stamp's, if it has one and the stamp tool's out; else the wash's ----
  const forStamp = tool === "stamp" && COLORED.has(stampKind);
  const colour: Colour = forStamp ? (colors[stampKind] ?? "black") : wash;
  const colourFor = forStamp ? `${STAMP_LABEL[stampKind]} colour` : "Wash colour";
  const allowed = (c: Colour) => (!forStamp ? (m.WASHES as readonly string[]).includes(c)
    : LINE_STAMPS.has(stampKind) ? c === "black" || c === "blue" || c === "yellow"
    : c !== "pink" && (stampKind === "stone" || stampKind === "eraser" || c !== "black")) && (!forStamp || everything || colourAllowed(kit, stampKind, c));
  const pickColour = (c: Colour) => { if (forStamp) setColors({ ...colors, [stampKind]: c as SymbolColor }); else setWash(c as WashColor); };

  const pickStamp = (k: StampKind) => { setStampKind(k); setTool("stamp"); setTyping(null); };
  const download = async () => {
    setMenu(null);
    const png = await exportPng(svg.current!, latest.current);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  // ---- the tool palette: a toolbar, arrows move along it ----
  const onToolKey = (e: React.KeyboardEvent) => {
    const k = toolButtons.current.findIndex((b) => b === document.activeElement), n = tools.length;
    if (k < 0) return;
    const to = e.key === "ArrowDown" || e.key === "ArrowRight" ? (k + 1) % n : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (k + n - 1) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    toolButtons.current[to]?.focus();
  };
  const shift = mod === "⌘" ? "⇧⌘" : "Ctrl+Shift+";

  const snapToggle = (
    <button type="button" className="sp-btn sp-toggle" aria-pressed={snapping} onClick={() => setSnapping(!snapping)}
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

  const swatches = (label: string) => (
    <div className="sp-swatches" role="group" aria-label={label} data-tip-side="top">
      {PALETTE.map((c) => <button key={c} type="button" className="sp-swatch" aria-label={capital(c)} data-tip={capital(c)}
        aria-pressed={colour === c} disabled={!allowed(c)} onClick={() => pickColour(c)}>
        <span style={{ background: paint(c) }} /></button>)}
    </div>
  );
  const row = (label: ReactNode, body: ReactNode, key?: string) => <div className="sp-pal-row" key={key}><span className="sp-pal-label">{label}</span>{body}</div>;
  const weights = (
    <span className="sp-seg" role="group" aria-label="Pen weight">
      {WEIGHTS.map((w) => <button key={w.id} type="button" className="sp-btn sp-weight" aria-label={w.label} data-tip={`${w.label} pen`} aria-pressed={weight === w.id} onClick={() => setWeight(w.id)}>
        <svg viewBox="0 0 30 14" aria-hidden="true"><line x1="4" y1="7" x2="26" y2="7" style={{ strokeWidth: w.width }} /></svg>
      </button>)}
    </span>
  );
  // what the chosen tool can set; a tool with nothing to set says what it does
  const options: ReactNode = (() => {
    switch (tool) {
      case "grid": return g ? <>
        {row("Size", <span className="sp-pal-steppers">{stepper("Rows", g.rows, (n) => resize(n, g.cols))}{stepper("Columns", g.cols, (n) => resize(g.rows, n))}</span>)}
        {!kit ? row("Look", (
          <span className="sp-seg" role="group" aria-label="Grid look">
            {([["Lines", "lines"], ["Tracks", "tracks"], ["Hexagons", "hex"], ["Dots", "dots"]] as const).map(([name, look]) => <button key={name} type="button" className="sp-btn sp-text-btn" aria-pressed={m.lookOf(g) === look}
              onClick={() => edit((dd) => (dd.grid ? m.setGrid(dd, m.setLook(dd.grid, look)) : dd))}>{name}</button>)}
          </span>
        )) : <p className="sp-pal-note">{typeName} is played {LOOK_WORDS[kit.look]}: the type sets the look.</p>}
        <button type="button" className="sp-btn sp-text-btn" onClick={() => edit(m.removeGrid)} data-tip="Take the grid away (what's drawn stays)">Remove grid</button>
      </> : <>
        <p className="sp-pal-note">Drag a rectangle on the paper, or start with one.</p>
        <button type="button" className="sp-btn sp-text-btn" onClick={addGrid} data-tip="A 6 × 6 grid in the middle of the view (or drag one out)">Add a grid</button>
      </>;
      case "pen": return <>{row("Weight", weights)}
        <button type="button" className="sp-btn sp-toggle" aria-pressed={straight} onClick={() => setStraight(!straight)} data-tip="Straight lines (or hold Shift)">
          <SpIcon name="straight" /><span>Straight</span></button></>;
      case "line": return row("Weight", weights);
      case "region": return <>
        <button type="button" className="sp-btn sp-toggle" aria-pressed={newArea} onClick={() => setNewArea(!newArea)} data-tip="The squares you drag make an area of their own">
          <SpIcon name="region" /><span>New area</span></button>
        <p className="sp-pal-note">{newArea ? "Drag across squares: they make a new area." : "Drag from a square across others: they join its area."} The borders are drawn for you.</p>
      </>;
      case "wash": return row(<>Colour · {capital(colour)}</>, swatches("Wash colour"));
      case "text": return row("Size", (
        <span className="sp-seg" role="group" aria-label="Text size">
          <button type="button" className="sp-btn" aria-pressed={!small} onClick={() => setSmall(false)} data-tip="Normal: a clue in a square">Normal</button>
          <button type="button" className="sp-btn sp-small-btn" aria-pressed={small} onClick={() => setSmall(true)}
            data-tip="Small: on a corner, a line, or a square's side or corner">Small</button>
        </span>
      ));
      case "stamp": return <>
        {!stamps.length ? <p className="sp-pal-note">{typeName} has no stamps: its clues are {own("text") ? "written with Text" : "drawn with the pen"}.</p>
          : row(kit ? `${typeName}'s ${stamps.length === 1 ? "stamp" : "stamps"}` : "Stamps", (
            <div className="sp-stamps" role="group" aria-label="Stamps" data-tip-side="top">
              {stamps.map((st) => <button key={st.id} type="button" className={`sp-stamp${ownStamp(st.id) ? "" : " sp-off"}`} aria-label={st.label}
                data-tip={ownStamp(st.id) ? st.tip ?? st.label : `${st.label}: ${notOurs.toLowerCase()}`}
                aria-pressed={stampKind === st.id} onClick={() => pickStamp(st.id)}>
                <StampIcon s={{ stamp: st.id, color: colors[st.id], ...(st.id === "triangle" ? { count: 1 } : {}), ...(st.id === "shape" ? { cells: SHAPES[2].cells } : {}) }} />
              </button>)}
            </div>
          ))}
        {stampKind === "triangle" && row("Triangles", (
          <span className="sp-seg" role="group" aria-label="How many">
            {[1, 2, 3].map((n) => <button key={n} type="button" className="sp-btn sp-num" aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}
          </span>
        ))}
        {stampKind === "stone" && (
          <button type="button" className="sp-btn sp-toggle" aria-pressed={hidden} onClick={() => setHidden(!hidden)} data-tip="Hidden until painted (a dashed outline)">
            <StampIcon s={{ stamp: "stone", color: colors.stone, hidden: true }} /><span>Hidden</span></button>
        )}
        {stampKind === "inequality" && row("Points", (
          <span className="sp-seg" role="group" aria-label="Points at">
            <button type="button" className="sp-btn sp-num" aria-pressed={!flip} onClick={() => setFlip(false)} data-tip="Points left or up">&lt; ∧</button>
            <button type="button" className="sp-btn sp-num" aria-pressed={flip} onClick={() => setFlip(true)} data-tip="Points right or down">&gt; ∨</button>
          </span>
        ))}
        {stampKind === "palisade" && <>
          {row("Borders", (
            <span className="sp-seg" role="group" aria-label="Borders">
              {[0, 1, 2, 3, 4].map((n) => <button key={n} type="button" className="sp-btn sp-num" aria-pressed={sides === n} onClick={() => setSides(n)}>{n}</button>)}
            </span>
          ))}
          {sides === 2 && <button type="button" className="sp-btn sp-toggle" aria-pressed={opposite} onClick={() => setOpposite(!opposite)} data-tip="The two borders opposite, not at a corner">
            <StampIcon s={{ stamp: "palisade", count: 2, opposite: true }} /><span>Opposite</span></button>}
        </>}
        {stampKind === "thermo" && <p className="sp-pal-note">Drag from the bulb through the squares; tap a bulb to take its thermometer off.</p>}
        {stampKind === "shape" && row("Shape", <>
          <span className="sp-shapes" role="group" aria-label="Shape">
            {SHAPES.map((x) => <button key={x.name} type="button" className="sp-btn sp-thumb" aria-pressed={cellsKey(x.cells) === cellsKey(pad)} aria-label={x.name} data-tip={x.name}
              onClick={() => setPad(x.cells)}><StampIcon s={{ stamp: "shape", cells: x.cells, color: colors.shape }} /></button>)}
          </span>
          <span className="sp-pal-inline">
            <ShapePad cells={pad} color={paint(colors.shape ?? "yellow")} onChange={setPad} />
            <span className="sp-seg" role="group" aria-label="Turn or flip">
              <IconButton icon="rotate" label="Turn the shape" tip="Turn a quarter turn" onClick={() => setPad(m.turnCells(pad))} />
              <IconButton icon="flip" label="Flip the shape" tip="Flip (its mirror image)" onClick={() => setPad(m.flipCells(pad))} />
            </span>
          </span>
          <span className="sp-pal-inline">
            <button type="button" className="sp-btn sp-toggle" aria-pressed={hollow} onClick={() => setHollow(!hollow)} data-tip="Hollow: a negative shape, outlined">
              <StampIcon s={{ stamp: "shape", cells: [[0, 0], [0, 1], [1, 0]], color: colors.shape, hollow: true }} /><span>Hollow</span></button>
            <button type="button" className="sp-btn sp-toggle" aria-pressed={mayTurn} onClick={() => setMayTurn(!mayTurn)} data-tip="May turn: drawn tilted">
              <StampIcon s={{ stamp: "shape", cells: [[0, 0], [0, 1], [1, 0]], color: colors.shape, rotate: true }} /><span>May turn</span></button>
          </span>
        </>)}
        {forStamp && row(<>Colour · {capital(colour)}</>, swatches(colourFor))}
      </>;
      case "erase": return <p className="sp-pal-note">{toolHint}.</p>;
    }
  })();
  const offNote = kit && !own(tool)
    ? <p className="sp-pal-note sp-pal-off">{typeName} doesn&rsquo;t use the {toolLabel.toLowerCase()}: what you draw is decoration, flagged and left out of the puzzle.</p> : null;
  // undo, redo and … (Clear, Download): in the page's header; on a phone, in the palette's strip
  const docActions = (where: "head" | "strip") => (
    <span className="sp-doc">
      <IconButton icon="undo" label="Undo" tip={`Undo (${mod}Z)`} onClick={undo} disabled={!history.past.length} />
      <IconButton icon="redo" label="Redo" tip={`Redo (${shift}Z)`} onClick={redo} disabled={!history.future.length} />
      <span className="sp-menu-wrap">
        <IconButton icon="more" label="More" tip="Clear, Download" aria-haspopup="menu" aria-expanded={menu === where} onClick={() => setMenu(menu === where ? null : where)} />
        {menu === where && (
          <span ref={menuRef} className="sp-menu" role="menu" aria-label="More" popover="manual">
            <button type="button" role="menuitem" disabled={!history.now.items.length && !history.now.grid}
              onClick={async () => {
                const ask = confirm({ title: "Clear the page?", body: <p>Everything on it goes. Undo brings it back.</p>, action: "Clear", danger: true });
                setMenu(null);
                if (await ask) { setTyping(null); edit(m.clear); }
              }}><SpIcon name="clear" />Clear the page</button>
            <button type="button" role="menuitem" disabled={!history.now.items.length && !history.now.grid} onClick={() => void download()}><SpIcon name="download" />Download a picture</button>
            <ReportBugItem onClick={() => setMenu(null)} />
          </span>
        )}
      </span>
    </span>
  );

  return (
    <div className={`sp-work pal-open${drawer ? " has-drawer" : ""}`}>
      {actions && createPortal(docActions("head"), actions)}

      {/* ---- the tools, down the left (along the bottom on a phone) ---- */}
      <div className="sp-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical" onKeyDown={onToolKey} data-tip-side="right">
        {tools.map((x, k) => <Fragment key={x.id}>
          {k > 0 && (own(tools[k - 1].id) !== own(x.id) ? <span className="sp-sep sp-sep-off" aria-hidden="true" /> : tools[k - 1].group !== x.group && <span className="sp-sep" aria-hidden="true" />)}
          <button ref={(el) => { toolButtons.current[k] = el; }} type="button" className={`sp-btn sp-tool${own(x.id) ? "" : " sp-off"}`} aria-label={x.label}
            aria-keyshortcuts={x.key.toUpperCase()} aria-pressed={tool === x.id} tabIndex={tool === x.id ? 0 : -1}
            data-tip={own(x.id) ? `${x.label} (${x.key.toUpperCase()})` : `${x.label}: ${notOurs.toLowerCase()}`}
            onClick={() => { setTool(x.id); setTyping(null); }}><SpIcon name={x.id} /></button>
        </Fragment>)}
        {kit && <button type="button" className="sp-btn sp-all" aria-pressed={everything} onClick={() => setEverything(!everything)}
          data-tip={everything ? `Only ${typeName}'s tools` : "Every tool, for decoration or drawing ahead: what the type can't use is flagged"}>
          <span aria-hidden="true">⋯</span><span>{everything ? "Fewer" : "All tools"}</span></button>}
      </div>

      {/* ---- the palette: the chosen tool's settings, always open, floating over the workspace's top
           left (a strip above the tools on a phone) ---- */}
      <section ref={paletteRef} className={`sp-palette tool-${tool}`} aria-label={`${toolLabel} options`}>
        <header className="sp-pal-head">
          <SpIcon name={tool} /><strong>{toolLabel}</strong>
        </header>
        <div className="sp-pal-body">{offNote}{options}</div>
        <span className="sp-pal-doc">{docActions("strip")}</span>
      </section>

      {/* ---- the paper: the whole workspace, open in every direction ---- */}
      <div className="grid-game sketchpad sp-canvas" ref={root} style={grain}
        onPointerEnter={(e) => { if (e.pointerType !== "touch") overPaper.current = true; }} onPointerLeave={() => { overPaper.current = false; }}>
        <div className={`sp-paper tool-${tool}${panReady || panning.current ? " pan" : ""}`}>
          {/* the wash filter, made for a board about WASH_SCALE units across (a 7 × 7 board's), so a
              stamp's watercolour comes out as it does on the board */}
          <svg className="sp-defs" viewBox={`0 0 ${WASH_SCALE} ${WASH_SCALE}`} ref={defs} aria-hidden="true" />
          <svg ref={svg} className="sp-board" viewBox={view ? cam.viewBox(view, size.w, size.h) : `0 0 ${m.PAGE} ${m.PAGE}`} preserveAspectRatio="xMinYMin meet"
            role="img" aria-label="Your drawing" style={penVars(S) as React.CSSProperties}
            onMouseDown={(e) => e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)}
            onAuxClick={(e) => e.preventDefault()}
            data-items={d.items.length} data-grid={g ? `${g.rows}x${g.cols}` : ""}
            data-grid-box={g ? [g.x, g.y, m.gridSpan(g).w * g.S, m.gridSpan(g).h * g.S].map((v) => Math.round(v * 10) / 10).join(",") : ""} data-view={view ? `${view.x.toFixed(1)},${view.y.toFixed(1)},${view.k.toFixed(4)}` : ""}>
            <g className="sp-ink">
              <g dangerouslySetInnerHTML={{ __html: layers[0].map(markup).join("") }} />
              {g && <g dangerouslySetInnerHTML={{ __html: gridSvg(g, gaps) + underlay }} />}
              <g dangerouslySetInnerHTML={{ __html: layers[1].map(markup).join("") }} />
              <g dangerouslySetInnerHTML={{ __html: layers[2].map(markup).join("") }} />
              <g data-export="skip" dangerouslySetInnerHTML={{ __html: layers[3].map(markup).join("") }} />
            </g>
            <g className="sp-ui" data-export="skip">
              {overlay && <g className="sp-marks" dangerouslySetInnerHTML={{ __html: overlay }} />}
              <g dangerouslySetInnerHTML={{ __html: ghost }} />
              {preview && <rect className="outline" x={preview.x} y={preview.y} width={preview.cols * preview.S} height={preview.rows * preview.S} />}
              {preview && <g className="ghost" dangerouslySetInnerHTML={{ __html: gridSvg(preview) }} />}
              {tool === "grid" && g && <rect className="grid-hit" x={g.x} y={g.y} width={m.gridSpan(g).w * g.S} height={m.gridSpan(g).h * g.S} />}
              {tool === "grid" && g && <circle className="handle" cx={m.handleOf(g).x} cy={m.handleOf(g).y} r={7 / (view?.k ?? 1)} />}
            </g>
          </svg>
          {tip && view && (
            <div ref={tipRef} className="sp-paper-tip" role="note">{tip.node}</div>
          )}
          {typing && typingAt && typingScreen && (
            <input ref={typed} className={`sp-typing${typing.small ? " small" : ""}`} aria-label="Text" value={typing.value} maxLength={12}
              style={{ left: typingScreen!.x, top: typingScreen!.y, width: `${Math.max(2.2, typing.value.length + 1.2)}em`, fontSize: typingPx }}
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

      {/* ---- the status line: how it's viewed ---- */}
      <div className="sp-status" data-tip-side="top">
        <span className="sp-status-hint" aria-live="polite">{toolHint}</span>
        {snapToggle}
        <span className="sp-zoom" role="group" aria-label="Zoom">
          <IconButton icon="zoomOut" label="Zoom out" tip={`Zoom out (${mod}−)`} onClick={() => zoomBy(-1)} disabled={!view || view.k <= cam.MIN_K} />
          <button type="button" className="sp-btn sp-zoom-fit" aria-label="Zoom to fit" data-tip={`Fit the puzzle (${mod}0)`} onClick={() => fitTo(latest.current)}>{view ? Math.round(view.k * 100) : 100}%</button>
          <IconButton icon="zoomIn" label="Zoom in" tip={`Zoom in (${mod}+)`} onClick={() => zoomBy(1)} disabled={!view || view.k >= cam.MAX_K} />
        </span>
      </div>

      {drawer}
    </div>
  );
}
