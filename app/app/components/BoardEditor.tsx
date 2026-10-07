// The on-puzzle editor: the puzzle drawn as the player will see it, edited in place with the few
// tools its type needs. The page around it (GameEditor) owns undo, the one-solution check and
// Claude's doubts; this draws the board, the cells the clues can't pin down, and a pin on each
// doubt's cell, and puts its tools in the page's toolbar.
//
// Each game type plugs in its own tools (EDITORS below). Types without their own tools yet use the
// older generic editor (PuzzleEditor) instead; see hasBoardEditor.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { runsOf, solveLine } from "~site/engine/rules.ts";
import type { GridSpec, Puzzle } from "~site/engine/types.ts";
import type { Doubt } from "~/games/doubts";
import { pictureLayout, pictureSvg } from "~site/game-types/grid/picture.ts";
import "~site/game-types/grid/styles.css";

type Spec = GridSpec;

/** A doubt's pin on the board: `n` is its number in the list; `active` while it's hovered there. */
export interface Pin extends Omit<Doubt, "text" | "done"> { n: number; active?: boolean }

/** Types with on-puzzle tools. */
const EDITORS = { nonogram: true } as const;
export const hasBoardEditor = (genre: string | undefined) => !!genre && genre in EDITORS;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const same = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();
const runsText = (v: number[] | undefined) => (v ?? [0]).join(" ");
const parseRuns = (t: string) => { const n = t.trim().split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => Number.isInteger(x) && x >= 0); return n.length ? n : [0]; };

/** A nonogram's cells that solving one line at a time can't decide (null: the clues contradict). */
function undecidedCells(p: Puzzle): number[] | null {
  const g = p.grid, known = new Array<number>(g.cellCount).fill(-1);
  const lines = [
    ...[...p.rowRuns].map(([r, clue]) => ({ clue, cells: Array.from({ length: g.cols }, (_, c) => g.cell(r, c)) })),
    ...[...p.colRuns].map(([c, clue]) => ({ clue, cells: Array.from({ length: g.rows }, (_, r) => g.cell(r, c)) })),
  ];
  for (let changed = true; changed;) {
    changed = false;
    for (const { clue, cells } of lines) {
      const res = solveLine(clue, cells.map((i) => known[i]));
      if (!res) return null;
      res.forEach((v, k) => { if (v !== -1 && known[cells[k]] === -1) { known[cells[k]] = v; changed = true; } });
    }
  }
  return known.flatMap((v, i) => (v === -1 ? [i] : []));
}

export function BoardEditor({ spec, onChange, tools, ambiguous, flash = 0, pins = [] }: {
  spec: Spec;
  /** `continuing`: part of the same stroke as the last change (one undo step for a whole drag) */
  onChange: (s: Spec, continuing?: boolean) => void;
  /** where the tools go (the page's toolbar) */
  tools: HTMLElement | null;
  /** the check found more than one solution: mark the cells the clues can't pin down */
  ambiguous: boolean;
  /** bumped to make the marked cells flash */
  flash?: number;
  pins?: Pin[];
}) {
  // the fill color (a picture's colors are kept by letter; a letter is found or added as it's used)
  const [ink, setInk] = useState(() => Object.entries(spec.picture?.palette ?? {}).find(([k]) => k !== ".")?.[1] ?? "#26398f");
  const [clueEdit, setClueEdit] = useState<{ at: "row" | "col"; index: number; x: number; y: number } | null>(null);
  const [flashing, setFlashing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const paint = useRef<{ value: string; palette: Record<string, string> } | null>(null);

  let puzzle: Puzzle | null = null, problem = "";
  try { puzzle = makePuzzle(spec); } catch (e) { problem = (e as Error).message; }
  const undecided = useMemo(() => (puzzle && puzzle.rowRuns.size ? undecidedCells(puzzle) ?? [] : []), [spec]); // eslint-disable-line react-hooks/exhaustive-deps
  const svg = useMemo(() => (puzzle ? pictureSvg(puzzle, null, "The puzzle", { picture: true, undecided: ambiguous ? undecided : [] }) : ""),
    [spec, ambiguous, undecided]); // eslint-disable-line react-hooks/exhaustive-deps
  const lay = puzzle && pictureLayout(puzzle);
  useEffect(() => {
    if (!flash) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 1300);
    return () => clearTimeout(t);
  }, [flash]);

  const change = (next: Spec) => onChange(next);

  // ---- nonogram: the picture (paint) or the numbers (type) ----
  const [rows, cols] = spec.size, picture = spec.picture;
  const palette = picture?.palette ?? {};
  const cellAt = (evt: React.PointerEvent) => {
    const el = box.current?.querySelector("svg");
    if (!el || !lay) return null;
    const pt = el.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const { x, y } = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return { x, y, c: Math.floor((x - lay.ML) / lay.S), r: Math.floor((y - lay.MT) / lay.S), lay };
  };
  const paintCell = (r: number, c: number, continuing: boolean) => {
    const stroke = paint.current;
    if (!picture || !stroke || r < 0 || c < 0 || r >= rows || c >= cols || picture.rows[r]?.[c] === stroke.value) return;
    const next = picture.rows.map((row, y) => (y !== r ? row : row.slice(0, c) + stroke.value + row.slice(c + 1)));
    // keep only the colors still in use
    const used = new Set(next.join(""));
    const pal = Object.fromEntries(Object.entries(stroke.palette).filter(([k]) => k === "." || used.has(k)));
    onChange({ ...spec, picture: { ...picture, rows: next, palette: pal } }, continuing);
  };
  const down = (evt: React.PointerEvent) => {
    if ((evt.target as Element).closest(".be-clue")) return;
    evt.preventDefault();   // keeps focus where it is (a clue's box opened below would lose it)
    const hit = cellAt(evt);
    if (!hit) return;
    const { r, c, x, y, lay } = hit;
    if (r >= 0 && c >= 0 && r < rows && c < cols) {
      if (!picture) return;
      // a fill tool: a square fills with the color, or clears if it's that color already
      const here = picture.rows[r]?.[c] ?? ".";
      let pal = palette, letter = Object.keys(pal).find((k) => k !== "." && same(pal[k], ink));
      if (!letter) { letter = [...LETTERS].find((l) => !(l in pal))!; pal = { ...pal, [letter]: ink }; }
      paint.current = { value: here === letter ? "." : letter, palette: pal };
      paintCell(r, c, false);
      (evt.target as Element).setPointerCapture?.(evt.pointerId);
      return;
    }
    // a row's or column's numbers (only when there's no picture: otherwise they follow it)
    if (!picture) {
      const rect = box.current!.getBoundingClientRect();
      if (x < lay.ML && r >= 0 && r < rows) setClueEdit({ at: "row", index: r, x: evt.clientX - rect.left, y: evt.clientY - rect.top });
      else if (y < lay.MT && c >= 0 && c < cols) setClueEdit({ at: "col", index: c, x: evt.clientX - rect.left, y: evt.clientY - rect.top });
    }
  };
  const move = (evt: React.PointerEvent) => {
    if (!paint.current) return;
    const hit = cellAt(evt);
    if (hit) paintCell(hit.r, hit.c, true);
  };
  const up = () => { paint.current = null; };

  const runsAt = (at: "row" | "col", index: number) => {
    const g = (spec.givens ?? []).find((g) => g.at === at && g.index === index && g.kind === "runs");
    return g && g.kind === "runs" ? g.value : undefined;
  };
  const setRuns = (at: "row" | "col", index: number, text: string) =>
    change({ ...spec, givens: [...(spec.givens ?? []).filter((g) => !(g.at === at && g.index === index)), { at, index, kind: "runs", value: parseRuns(text) }] });

  function resize(dr: number, dc: number) {
    const r = Math.max(2, Math.min(30, rows + dr)), c = Math.max(2, Math.min(30, cols + dc));
    change({
      ...spec, size: [r, c],
      ...(picture ? { picture: { ...picture, rows: Array.from({ length: r }, (_, y) => (picture.rows[y] ?? "").padEnd(c, ".").slice(0, c)) } } : {}),
      givens: (spec.givens ?? []).filter((g) => !((g.at === "row" && g.index >= r) || (g.at === "col" && g.index >= c))),
    });
  }
  function toPicture() {
    change({ ...spec, givens: (spec.givens ?? []).filter((g) => g.at !== "row" && g.at !== "col"), picture: { rows: Array.from({ length: rows }, () => ".".repeat(cols)), palette: { ".": "#ffffff" } } });
  }
  function toNumbers() {
    const on = (picture?.rows ?? []).map((row) => [...row].map((ch) => ch !== "."));
    const { picture: _gone, ...rest } = spec;
    change({ ...rest, givens: [
      ...(spec.givens ?? []).filter((g) => g.at !== "row" && g.at !== "col"),
      ...on.map((row, r) => ({ at: "row" as const, index: r, kind: "runs" as const, value: runsOf(row) })),
      ...Array.from({ length: cols }, (_, c) => ({ at: "col" as const, index: c, kind: "runs" as const, value: runsOf(on.map((row) => row[c] ?? false)) })),
    ] });
  }

  // where a doubt is on the board (in the board's own units): the box it's about, and a spot for
  // its pin just off that box (so the pin never covers what it points at)
  const target = (p: Pin) => {
    if (!lay) return null;
    const { S, ML, MT } = lay;
    const r0 = p.row ?? 0, r1 = p.row2 ?? r0, c0 = p.col ?? 0, c1 = p.col2 ?? c0;
    const gx = (c: number) => ML + c * S, gy = (r: number) => MT + r * S;
    switch (p.place) {
      case "cell": return { box: [gx(c0), gy(r0), S, S], pin: [gx(c0) + S, gy(r0)] };
      // a line's numbers are 22 apart, the last 14 before the grid (picture.ts): the pin goes just
      // before the first of them
      case "row-clue": {
        const left = ML - 14 - ((puzzle!.rowRuns.get(r0)?.length ?? 1) - 1) * 22 - 11;
        return { box: [left, gy(r0) + S * 0.12, ML - 4 - left, S * 0.76], pin: [left - 9, gy(r0) + S / 2] };
      }
      case "column-clue": {
        const top = MT - 14 - ((puzzle!.colRuns.get(c0)?.length ?? 1) - 1) * 22 - 13;
        return { box: [gx(c0) + S * 0.12, top, S * 0.76, MT - 4 - top], pin: [gx(c0) + S / 2, top - 9] };
      }
      case "rows": return { box: [ML, gy(r0), cols * S, (r1 - r0 + 1) * S], pin: [ML + cols * S, gy(r0) + ((r1 - r0 + 1) * S) / 2] };
      case "columns": return { box: [gx(c0), MT, (c1 - c0 + 1) * S, rows * S], pin: [gx(c0) + ((c1 - c0 + 1) * S) / 2, MT + rows * S] };
      case "area": return { box: [gx(c0), gy(r0), (c1 - c0 + 1) * S, (r1 - r0 + 1) * S], pin: [gx(c1 + 1), gy(r0)] };
      default: return null;
    }
  };
  const placed = pins.flatMap((p) => { const t = target(p); return t ? [{ p, ...t }] : []; });

  // general to specific: what the player gets, the size, then the color
  const toolbar = (
    <div className="be-tools">
      <span className="be-group be-seg" role="group" aria-label="What the player gets">
        <button type="button" className="be-btn" aria-pressed={!!picture} onClick={() => !picture && toPicture()}
          title="Paint the picture; the numbers follow it">Picture</button>
        <button type="button" className="be-btn" aria-pressed={!picture} onClick={() => picture && toNumbers()}
          title="Type each row's and column's numbers yourself">Numbers only</button>
      </span>
      <span className="be-group be-size">
        Rows <button type="button" className="be-btn" onClick={() => resize(-1, 0)} aria-label="Fewer rows">−</button><b>{rows}</b><button type="button" className="be-btn" onClick={() => resize(1, 0)} aria-label="More rows">+</button>
      </span>
      <span className="be-group be-size">
        Columns <button type="button" className="be-btn" onClick={() => resize(0, -1)} aria-label="Fewer columns">−</button><b>{cols}</b><button type="button" className="be-btn" onClick={() => resize(0, 1)} aria-label="More columns">+</button>
      </span>
      {picture && (
        <label className="be-group be-color" title="The color squares fill with (click a square again to clear it)">
          Color <span className="be-pot" style={{ "--c": ink } as React.CSSProperties}><input type="color" value={ink} onChange={(e) => setInk(e.target.value)} /></span>
        </label>
      )}
    </div>
  );

  return (
    <div className={`board-editor${flashing ? " flashing" : ""}`}>
      {tools && createPortal(toolbar, tools)}
      <div className="be-board" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {svg ? <div className="grid-game pic" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="error">{problem}</p>}
        {lay && placed.length > 0 && (
          <svg className="be-doubts" viewBox={`0 0 ${lay.W} ${lay.H}`} aria-hidden="true">
            {placed.filter(({ p }) => p.active).map(({ p, box: [x, y, w, h] }) => <rect key={p.n} x={x} y={y} width={w} height={h} rx={lay.S * 0.08} />)}
          </svg>
        )}
        {lay && placed.map(({ p, pin: [x, y] }) => (
          <span key={p.n} className={`be-pin${p.active ? " active" : ""}`} aria-hidden="true"
            style={{ left: `${(x / lay.W) * 100}%`, top: `${(y / lay.H) * 100}%` }}>{p.n}</span>
        ))}
        {clueEdit && (
          <form className="be-clue" style={{ left: clueEdit.x, top: clueEdit.y }} onSubmit={(e) => {
            e.preventDefault();
            setRuns(clueEdit.at, clueEdit.index, String(new FormData(e.currentTarget).get("runs")));
            setClueEdit(null);
          }}>
            <label>{clueEdit.at === "row" ? `Row ${clueEdit.index + 1}` : `Column ${clueEdit.index + 1}`}
              <input name="runs" autoFocus onFocus={(e) => e.currentTarget.select()} defaultValue={runsText(runsAt(clueEdit.at, clueEdit.index))} onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                onKeyDown={(e) => { if (e.key === "Escape") setClueEdit(null); }} />
            </label>
          </form>
        )}
      </div>
    </div>
  );
}
