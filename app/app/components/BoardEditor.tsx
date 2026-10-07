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
import { pictureLayout, pictureSvg } from "~site/game-types/grid/picture.ts";

type Spec = GridSpec;

/** A doubt's pin on the board: `n` is its number in the list. */
export interface Pin { n: number; row?: number; col?: number; active?: boolean }

/** Types with on-puzzle tools. */
const EDITORS = { nonogram: true } as const;
export const hasBoardEditor = (genre: string | undefined) => !!genre && genre in EDITORS;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
/** New paint colors, in the order they're offered. */
const NEW_COLORS = ["#26398f", "#d8443a", "#f0a020", "#2e8b57", "#7b4bb7", "#222222", "#8b5a2b", "#f28cb1", "#3fb0e6", "#9aa0a6"];
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
  const [ink, setInk] = useState(() => Object.keys(spec.picture?.palette ?? {}).find((k) => k !== ".") ?? "a");
  const [clueEdit, setClueEdit] = useState<{ at: "row" | "col"; index: number; x: number; y: number } | null>(null);
  const [flashing, setFlashing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const paint = useRef<{ value: string } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [pickNew, setPickNew] = useState(false);   // a color was just added: open its picker
  useEffect(() => {
    if (!pickNew) return;
    setPickNew(false);
    try { picker.current?.showPicker(); } catch { picker.current?.click(); }
  }, [pickNew]);

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
  const setPicture = (rowsNow: string[], pal = palette) => change({ ...spec, picture: { ...picture!, rows: rowsNow, palette: pal } });
  const cellAt = (evt: React.PointerEvent) => {
    const el = box.current?.querySelector("svg");
    if (!el || !lay) return null;
    const pt = el.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const { x, y } = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return { x, y, c: Math.floor((x - lay.ML) / lay.S), r: Math.floor((y - lay.MT) / lay.S), lay };
  };
  const paintCell = (r: number, c: number, value: string, continuing: boolean) => {
    if (!picture || r < 0 || c < 0 || r >= rows || c >= cols || picture.rows[r]?.[c] === value) return;
    onChange({ ...spec, picture: { ...picture, rows: picture.rows.map((row, y) => (y !== r ? row : row.slice(0, c) + value + row.slice(c + 1))) } }, continuing);
  };
  const down = (evt: React.PointerEvent) => {
    if ((evt.target as Element).closest(".be-clue")) return;
    evt.preventDefault();   // keeps focus where it is (a clue's box opened below would lose it)
    const hit = cellAt(evt);
    if (!hit) return;
    const { r, c, x, y, lay } = hit;
    if (r >= 0 && c >= 0 && r < rows && c < cols) {
      if (!picture) return;
      // the eraser clears; a color paints (or, on a square already that color, clears it)
      const value = ink === "." || picture.rows[r]?.[c] === ink ? "." : ink;
      paint.current = { value };
      paintCell(r, c, value, false);
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
    if (hit) paintCell(hit.r, hit.c, paint.current.value, true);
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
    change({ ...spec, givens: (spec.givens ?? []).filter((g) => g.at !== "row" && g.at !== "col"), picture: { rows: Array.from({ length: rows }, () => ".".repeat(cols)), palette: { ".": "#ffffff", a: "#26398f" } } });
    setInk("a");
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

  // a pin's spot, as fractions of the board: a cell's centre, or just past the end of a row (right
  // of the grid) or a column (below it), clear of the clues
  const pinAt = (p: Pin) => {
    if (!lay || (p.row === undefined && p.col === undefined)) return null;
    const x = p.col !== undefined ? lay.ML + (p.col + 0.5) * lay.S : lay.ML + cols * lay.S + 0.35 * lay.S;
    const y = p.row !== undefined ? lay.MT + (p.row + 0.5) * lay.S : lay.MT + rows * lay.S + 0.35 * lay.S;
    return { left: `${(x / lay.W) * 100}%`, top: `${(y / lay.H) * 100}%` };
  };

  const toolbar = (
    <div className="be-tools">
      <span className="be-group be-size">
        Rows <button type="button" className="be-btn" onClick={() => resize(-1, 0)} aria-label="Fewer rows">−</button><b>{rows}</b><button type="button" className="be-btn" onClick={() => resize(1, 0)} aria-label="More rows">+</button>
      </span>
      <span className="be-group be-size">
        Columns <button type="button" className="be-btn" onClick={() => resize(0, -1)} aria-label="Fewer columns">−</button><b>{cols}</b><button type="button" className="be-btn" onClick={() => resize(0, 1)} aria-label="More columns">+</button>
      </span>
      {picture && (
        <span className="be-group be-colors" role="group" aria-label="Paint color">
          {Object.keys(palette).filter((k) => k !== ".").map((k) => (
            <button key={k} type="button" className="be-pot" aria-pressed={ink === k} style={{ "--c": palette[k] } as React.CSSProperties} onClick={() => setInk(k)}
              aria-label={ink === k ? "Change this color (every square painted with it)" : "Paint with this color"}
              title={ink === k ? "Click to change this color everywhere it's used" : "Paint with this color"}>
              {ink === k && <input ref={picker} type="color" value={palette[k]} tabIndex={-1} aria-hidden="true" onChange={(e) => setPicture(picture.rows, { ...palette, [k]: e.target.value })} />}
            </button>
          ))}
          <button type="button" className="be-pot add" title="Add a color, then paint squares with it" aria-label="Add a color" onClick={() => {
            const k = [...LETTERS].find((l) => !(l in palette));
            if (!k) return;
            const used = new Set(Object.values(palette).map((c) => c.toLowerCase()));
            change({ ...spec, picture: { ...picture, palette: { ...palette, [k]: NEW_COLORS.find((c) => !used.has(c)) ?? "#d8443a" } } });
            setInk(k);
            setPickNew(true);
          }}>+</button>
          <button type="button" className="be-pot erase" aria-pressed={ink === "."} title="Eraser: clear squares" aria-label="Eraser" onClick={() => setInk(".")} />
        </span>
      )}
      <span className="be-group be-seg" role="group" aria-label="What the player gets">
        <button type="button" className="be-btn" aria-pressed={!!picture} onClick={() => !picture && toPicture()}
          title="Paint the picture; the numbers follow it">Picture</button>
        <button type="button" className="be-btn" aria-pressed={!picture} onClick={() => picture && toNumbers()}
          title="Type each row's and column's numbers yourself">Numbers only</button>
      </span>
    </div>
  );

  return (
    <div className={`board-editor${flashing ? " flashing" : ""}`}>
      {tools && createPortal(toolbar, tools)}
      <div className="be-board" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {svg ? <div className="grid-game pic" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="error">{problem}</p>}
        {pins.map((p) => {
          const at = pinAt(p);
          return at && <span key={p.n} className={`be-pin${p.active ? " active" : ""}`} style={at} aria-hidden="true">{p.n}</span>;
        })}
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
