// The on-puzzle editor: the puzzle drawn as the player will see it, edited in place with the few
// tools its type needs, and checked as you go (one solution? which cells can't be pinned down?).
// Read-only it shows a reading to compare with the drawing.
//
// Each game type plugs in its own tools (EDITORS below). Types without their own tools yet use the
// older generic editor (PuzzleEditor) instead; see hasBoardEditor.
import { useEffect, useMemo, useRef, useState } from "react";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { runsOf, solveLine } from "~site/engine/rules.ts";
import type { GridSpec, Puzzle } from "~site/engine/types.ts";
import { pictureLayout, pictureSvg } from "~site/game-types/grid/picture.ts";

type Spec = GridSpec;
type Check = { state: "checking" } | { state: "one" } | { state: "none" } | { state: "many" } | { state: "error"; text: string };

/** Types with on-puzzle tools. */
const EDITORS = { nonogram: true } as const;
export const hasBoardEditor = (genre: string | undefined) => !!genre && genre in EDITORS;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
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

/** `actions`: buttons shown beside the one-solution status (like Done). */
export function BoardEditor({ spec, onChange, editing, actions }: { spec: Spec; onChange?: (s: Spec) => void; editing: boolean; actions?: React.ReactNode }) {
  const [history, setHistory] = useState<Spec[]>([]);
  const [check, setCheck] = useState<Check>({ state: "checking" });
  const [ink, setInk] = useState(() => Object.keys(spec.picture?.palette ?? {}).find((k) => k !== ".") ?? "a");
  const [clueEdit, setClueEdit] = useState<{ at: "row" | "col"; index: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const paint = useRef<{ value: string } | null>(null);

  let puzzle: Puzzle | null = null, problem = "";
  try { puzzle = makePuzzle(spec); } catch (e) { problem = (e as Error).message; }
  const undecided = useMemo(() => (puzzle && puzzle.rowRuns.size ? undecidedCells(puzzle) : []), [spec]); // eslint-disable-line react-hooks/exhaustive-deps
  const svg = useMemo(() => (puzzle ? pictureSvg(puzzle, null, "The puzzle", {
    picture: true, undecided: check.state === "many" || check.state === "one" ? undecided ?? [] : [],
  }) : ""), [spec, check.state, undecided]); // eslint-disable-line react-hooks/exhaustive-deps

  // the one-solution check, a moment after each change
  useEffect(() => {
    if (!puzzle) return;
    let live = true;
    setCheck({ state: "checking" });
    const t = setTimeout(async () => {
      const { countSolutions } = await import("~/games/count-solutions.client");
      const r = await countSolutions(spec).catch((e: Error) => ({ error: e.message }));
      if (!live) return;
      setCheck("error" in r ? { state: "error", text: r.error } : { state: r.solutions === 1 ? "one" : r.solutions === 0 ? "none" : "many" });
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [JSON.stringify(spec)]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (next: Spec) => { setHistory((h) => [...h.slice(-49), spec]); onChange?.(next); };
  const undo = () => { const last = history.at(-1); if (!last) return; setHistory((h) => h.slice(0, -1)); onChange?.(last); };

  // ---- nonogram: the picture (paint) or the numbers (type) ----
  const [rows, cols] = spec.size, picture = spec.picture;
  const palette = picture?.palette ?? {};
  const setPicture = (rowsNow: string[], pal = palette) => change({ ...spec, picture: { ...picture!, rows: rowsNow, palette: pal } });
  const cellAt = (evt: React.PointerEvent) => {
    const el = box.current?.querySelector("svg"), lay = puzzle && pictureLayout(puzzle);
    if (!el || !lay) return null;
    const pt = el.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const { x, y } = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return { x, y, c: Math.floor((x - lay.ML) / lay.S), r: Math.floor((y - lay.MT) / lay.S), lay };
  };
  const paintCell = (r: number, c: number, value: string) => {
    if (!picture || r < 0 || c < 0 || r >= rows || c >= cols || picture.rows[r]?.[c] === value) return;
    onChange?.({ ...spec, picture: { ...picture, rows: picture.rows.map((row, y) => (y !== r ? row : row.slice(0, c) + value + row.slice(c + 1))) } });
  };
  const down = (evt: React.PointerEvent) => {
    if (!editing || (evt.target as Element).closest(".be-clue")) return;
    evt.preventDefault();   // keeps focus where it is (a clue's box opened below would lose it)
    const hit = cellAt(evt);
    if (!hit) return;
    const { r, c, x, y, lay } = hit;
    if (r >= 0 && c >= 0 && r < rows && c < cols) {
      if (!picture) return;
      const value = picture.rows[r]?.[c] === ink ? "." : ink;
      setHistory((h) => [...h.slice(-49), spec]);
      paint.current = { value };
      paintCell(r, c, value);
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
    if (hit) paintCell(hit.r, hit.c, paint.current.value);
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

  const status = problem ? { cls: "bad", text: problem }
    : check.state === "checking" ? { cls: "", text: "Checking…" }
      : check.state === "one" ? { cls: "good", text: undecided?.length ? "✓ Exactly one solution (the marked cells need more than one line at a time to work out)." : "✓ Exactly one solution." }
        : check.state === "none" ? { cls: "bad", text: "No solution: the numbers contradict each other." }
          : check.state === "many" ? { cls: "bad", text: undecided?.length ? "More than one solution: the numbers can't pin down the marked cells." : "More than one solution." }
            : { cls: "bad", text: check.text };

  return (
    <div className={`board-editor${editing ? " editing" : ""}`}>
      {editing && (
        <div className="be-tools">
          <span className="be-group">
            <button type="button" className="be-btn" onClick={undo} disabled={!history.length} title="Undo">↶ Undo</button>
          </span>
          <span className="be-group be-size">
            Rows <button type="button" className="be-btn" onClick={() => resize(-1, 0)} aria-label="Fewer rows">−</button><b>{rows}</b><button type="button" className="be-btn" onClick={() => resize(1, 0)} aria-label="More rows">+</button>
            Columns <button type="button" className="be-btn" onClick={() => resize(0, -1)} aria-label="Fewer columns">−</button><b>{cols}</b><button type="button" className="be-btn" onClick={() => resize(0, 1)} aria-label="More columns">+</button>
          </span>
          {picture && (
            <span className="be-group" role="group" aria-label="Paint color">
              {Object.keys(palette).filter((k) => k !== ".").map((k) => (
                <button key={k} type="button" className="be-pot" aria-pressed={ink === k} aria-label={`Paint with color ${k}`} style={{ "--c": palette[k] } as React.CSSProperties} onClick={() => setInk(k)}>
                  {ink === k && <input type="color" value={palette[k]} aria-label="Change this color" onChange={(e) => setPicture(picture.rows, { ...palette, [k]: e.target.value })} />}
                </button>
              ))}
              <button type="button" className="be-btn" onClick={() => {
                const k = [...LETTERS].find((l) => !(l in palette));
                if (k) { setPicture(picture.rows, { ...palette, [k]: "#d8443a" }); setInk(k); }
              }}>+ Color</button>
            </span>
          )}
          <span className="be-group" role="group" aria-label="What the player gets">
            <button type="button" className="be-btn" aria-pressed={!!picture} onClick={() => !picture && toPicture()}
              title="Paint the picture; the numbers follow it">Picture</button>
            <button type="button" className="be-btn" aria-pressed={!picture} onClick={() => picture && toNumbers()}
              title="Type each row's and column's numbers yourself">Numbers only</button>
          </span>
        </div>
      )}
      <div className="be-board" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {svg ? <div className="grid-game pic" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="error">{problem}</p>}
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
      <div className="be-foot">
        {actions}
        <p className={`be-status ${status.cls}`} aria-live="polite">{status.text}</p>
      </div>
    </div>
  );
}
