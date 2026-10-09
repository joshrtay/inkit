// The visual editor's figure mode (RYB): a figure of polygon pieces instead of a grid.
//   Select        click a piece, then give it dots, hide them, or delete it
//   Draw a piece  click its corners (they snap to corners already there); click the first one to close it
//   Move corners  drag a corner; every piece that shares it follows
// Pieces sharing part of an edge are neighbours (src/engine/geometry.ts, figureGrid).
import { useRef, useState } from "react";
import type { Given, GridSpec } from "~site/engine/types.ts";

type Pt = [number, number];
const DEFAULT_PALETTE = ["#ef5a6a", "#f7cf3d", "#3fb0e6"];
const NAMES: Record<string, string> = { "#ef5a6a": "Red", "#f7cf3d": "Yellow", "#3fb0e6": "Blue" };

/** A starting figure: a grid of squares, 10 units each. */
export function squaresFigure(rows: number, cols: number): number[][][] {
  const out: number[][][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([[c * 10, r * 10], [c * 10 + 10, r * 10], [c * 10 + 10, r * 10 + 10], [c * 10, r * 10 + 10]]);
  return out;
}

export function FigureEditor({ spec, set }: { spec: GridSpec; set: (patch: Partial<GridSpec>) => void }) {
  const pieces = spec.figure?.pieces ?? [];
  const givens = spec.givens ?? [];
  const palette = spec.style?.palette?.length ? spec.style.palette : DEFAULT_PALETTE;
  const [tool, setTool] = useState<"select" | "draw" | "move">("select");
  const [sel, setSel] = useState(-1);
  const [drawing, setDrawing] = useState<Pt[]>([]);
  const [dragging, setDragging] = useState<Pt | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const all = pieces.flat();
  const xs = all.length ? all.map((p) => p[0]) : [0, 40], ys = all.length ? all.map((p) => p[1]) : [0, 40];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 10);
  const pad = span * 0.12;
  const [frozen, setFrozen] = useState<number[] | null>(null);   // the view holds still while dragging
  const fit = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  const box = frozen ?? fit;
  const snap = span * 0.035, unit = span / 100;
  const corners = [...new Map(all.map((p) => [`${p[0]},${p[1]}`, p as Pt])).values()];

  const toFigure = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const k = Math.max(box[2] / r.width, box[3] / r.height);   // the viewBox is letterboxed to fit
    const ox = (r.width - box[2] / k) / 2, oy = (r.height - box[3] / k) / 2;
    return [Math.round((box[0] + (e.clientX - r.left - ox) * k) * 10) / 10, Math.round((box[1] + (e.clientY - r.top - oy) * k) * 10) / 10];
  };
  const nearCorner = (p: Pt) => corners.find((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) <= snap);
  const cellOf = (g: Given) => (g.at === "cell" ? g.cell[1] : -1);
  const dotsOf = (i: number) => givens.find((g) => g.kind === "dots" && cellOf(g) === i) as Extract<Given, { kind: "dots" }> | undefined;
  const setDots = (i: number, value: number[], hidden: boolean) => set({
    givens: [...givens.filter((g) => !(g.kind === "dots" && cellOf(g) === i)), ...(value.length ? [{ at: "cell", cell: [0, i], kind: "dots", value, ...(hidden ? { hidden: true } : {}) } as Given] : [])],
  });
  const setPieces = (next: number[][][], nextGivens = givens) => set({ figure: { pieces: next }, size: [1, Math.max(1, next.length)], givens: nextGivens });

  function removePiece(i: number) {
    const kept = givens.filter((g) => cellOf(g) !== i).map((g) => (g.at === "cell" && g.cell[1] > i ? { ...g, cell: [0, g.cell[1] - 1] } as Given : g));
    setPieces(pieces.filter((_, j) => j !== i), kept);
    setSel(-1);
  }
  function click(e: React.MouseEvent<SVGSVGElement>) {
    if (tool !== "draw") return;
    const p = toFigure(e), at = nearCorner(p) ?? p;
    if (drawing.length >= 3 && Math.hypot(at[0] - drawing[0][0], at[1] - drawing[0][1]) <= snap) {
      setPieces([...pieces, drawing]); setDrawing([]); setSel(pieces.length); setTool("select");
      return;
    }
    if (drawing.some((d) => d[0] === at[0] && d[1] === at[1])) return;
    setDrawing([...drawing, at]);
  }
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (tool !== "move") return;
    const c = nearCorner(toFigure(e));
    if (!c) return;
    setDragging(c); setFrozen(box);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragging) return;
    const p = toFigure(e);
    setPieces(pieces.map((pc) => pc.map((q) => (q[0] === dragging[0] && q[1] === dragging[1] ? [...p] : q))));
    setDragging(p);
  }
  const up = () => {
    if (!dragging) return;
    // dropped onto another corner: they join
    const onto = corners.find((c) => (c[0] !== dragging[0] || c[1] !== dragging[1]) && Math.hypot(c[0] - dragging[0], c[1] - dragging[1]) <= snap);
    if (onto) setPieces(pieces.map((pc) => pc.map((q) => (q[0] === dragging[0] && q[1] === dragging[1] ? [...onto] : q))));
    setDragging(null); setFrozen(null);
  };

  const pts = (p: number[][]) => p.map((q) => q.join(",")).join(" ");
  const selDots = sel >= 0 ? dotsOf(sel) : undefined;

  return (
    <div className="fe">
      <div className="ge-bar">
        <span className="ge-tools" role="group" aria-label="Tool">
          <button type="button" aria-pressed={tool === "select"} onClick={() => { setTool("select"); setDrawing([]); }}>Select</button>
          <button type="button" aria-pressed={tool === "draw"} onClick={() => { setTool("draw"); setSel(-1); }}>Draw a piece</button>
          <button type="button" aria-pressed={tool === "move"} onClick={() => { setTool("move"); setDrawing([]); setSel(-1); }}>Move corners</button>
        </span>
        <span className="ge-tools">
          <button type="button" onClick={() => { if (confirm("Replace the figure with a 3 × 3 grid of squares?")) { setPieces(squaresFigure(3, 3), []); setSel(-1); } }}>Start from squares</button>
        </span>
      </div>
      <p className="hint">
        {tool === "draw" ? (drawing.length ? `${drawing.length} corner${drawing.length === 1 ? "" : "s"}. Click the first corner to finish the piece.` : "Click each corner of the new piece in turn. Corners snap to ones already there.")
          : tool === "move" ? "Drag a corner. Pieces that share it follow; drop it on another corner to join them."
            : "Click a piece to give it dots. Pieces that share part of an edge are neighbours."}
        {drawing.length > 0 && <> <button type="button" className="link" onClick={() => setDrawing([])}>Cancel</button></>}
      </p>

      <svg ref={svgRef} className="ge-grid fe-figure" viewBox={box.join(" ")} onClick={click} onPointerDown={down} onPointerMove={move} onPointerUp={up}
        role="img" aria-label="Figure editor" data-tool={tool}>
        {pieces.map((p, i) => (
          <polygon key={i} points={pts(p)} className={i === sel ? "fe-piece sel" : "fe-piece"} strokeWidth={unit * 0.6}
            onClick={() => tool === "select" && setSel(i === sel ? -1 : i)} />
        ))}
        {pieces.map((p, i) => {
          const d = dotsOf(i);
          if (!d) return null;
          const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length, r = unit * 2.2;
          return <g key={`d${i}`} opacity={d.hidden ? 0.45 : 1}>{d.value.map((c, j) =>
            <circle key={j} cx={cx + (j - (d.value.length - 1) / 2) * r * 2.4} cy={cy} r={r} fill={palette[c - 1] ?? "#999"} stroke="#26398f" strokeWidth={unit * 0.4} />)}</g>;
        })}
        {tool === "move" && corners.map((c) => <circle key={c.join()} cx={c[0]} cy={c[1]} r={unit * 1.6} className="fe-corner" />)}
        {drawing.length > 0 && <polyline points={pts(drawing)} className="fe-drawing" strokeWidth={unit * 0.8} />}
        {drawing.map((c, i) => <circle key={i} cx={c[0]} cy={c[1]} r={unit * (i === 0 ? 2.2 : 1.4)} className="fe-corner" />)}
      </svg>

      {sel >= 0 && sel < pieces.length && (
        <div className="ge-bar fe-piece-bar">
          <b>Piece {sel + 1}</b>
          <span className="ge-tools" role="group" aria-label="Add a dot">
            {palette.map((c, k) => (
              <button key={k} type="button" onClick={() => setDots(sel, [...(selDots?.value ?? []), k + 1], !!selDots?.hidden)}>
                + <i className="fe-swatch" style={{ background: c }} /> {NAMES[c.toLowerCase()] ?? `Color ${k + 1}`} dot
              </button>
            ))}
            {selDots && <button type="button" onClick={() => setDots(sel, selDots.value.slice(0, -1), !!selDots.hidden)}>Remove a dot</button>}
          </span>
          {selDots && <label className="ge-inline"><input type="checkbox" checked={!!selDots.hidden} onChange={(e) => setDots(sel, selDots.value, e.target.checked)} /> hidden until painted</label>}
          <button type="button" className="link" onClick={() => removePiece(sel)}>Delete piece</button>
        </div>
      )}
      <div className="ge-bar">
        <label>Hearts <input type="number" min={0} max={9} value={spec.hearts ?? ""} placeholder="3"
          onChange={(e) => set({ hearts: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
        <span className="hint">Mistakes allowed: a wrong color is turned away and costs a heart. 0 lets players paint freely and check at the end.</span>
      </div>
    </div>
  );
}
