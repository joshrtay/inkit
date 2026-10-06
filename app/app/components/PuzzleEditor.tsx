// The visual puzzle editor: everything a grid puzzle (src/engine) can contain, edited by clicking
// instead of typing. It is the only way creators change a puzzle, so it must stay complete:
//
//   ** Whenever the engine gains something (a genre, a clue kind, a rule block or setting, a style
//   ** option, a mark), add it here too. The tables below are typed against the engine's own lists
//   ** (GenreName, Given["kind"], RuleName, keyof GridStyle, MarkKind, keyof GridSpec), so the build
//   ** fails until every new name has an entry. (See docs/grid-engine.md, "The visual editor".)
import { useState } from "react";
import { genres, type GenreName } from "~site/engine/puzzle.ts";
import { runsOf, type RuleName } from "~site/engine/rules.ts";
import type { Given, GridSpec, GridStyle, MarkKind, RuleSpec, Side } from "~site/engine/types.ts";
import { KIND_NAMES } from "~/games/kinds";

type RC = [number, number];
type ClueKind = Given["kind"];

// ---- coverage tables (one entry for every name the engine knows) ----

/** Every part of a puzzle description, and where this editor edits it. */
export const SPEC_PARTS: Record<keyof GridSpec, string> = {
  genre: "the game type menu", size: "Rows / Columns", givens: "the clue tools", rules: "Rules",
  style: "Look", picture: "the picture painter (Picture Squares)", marks: "Look › what the player draws",
};

/** Every clue kind: its tool label, and whether it sits in a cell, on a border, beside a line, on a
 *  corner, or in the outside edge. */
const CLUES: Record<ClueKind, { label: string; on: "cell" | "border" | "line" | "corner" | "edge" }> = {
  number: { label: "Number", on: "cell" },
  block: { label: "Rock", on: "cell" },
  symbol: { label: "Symbol", on: "cell" },
  compass: { label: "Compass", on: "cell" },
  wall: { label: "Wall", on: "border" },
  twins: { label: "◆ Same shape", on: "border" },
  opposites: { label: "◇ Different shape", on: "border" },
  runs: { label: "Clue numbers", on: "line" },
  count: { label: "Corner number", on: "corner" },
  door: { label: "Door", on: "edge" },
};

/** The clue tools each genre shows first (every other clue kind is under "More clues"). */
const GENRE_CLUES: Record<GenreName, ClueKind[]> = {
  slitherlink: ["number"],
  nurikabe: ["number"],
  river: ["block", "wall"],
  nonogram: ["runs"],
  sudoku: ["number"],
  panes: ["number", "symbol", "compass", "twins", "opposites", "block"],
  maze: ["count", "door", "wall"],
};

type Setting =
  | { key: string; label: string; type: "number" }
  | { key: string; label: string; type: "choice"; choices: string[] }
  | { key: string; label: string; type: "flag" }
  | { key: string; label: string; type: "pair" };

/** Every rule block, in plain words, with every setting it takes. */
const RULES: Record<RuleName, { label: string; settings: Setting[] }> = {
  loop: { label: "One loop", settings: [{ key: "of", label: "drawn", type: "choice", choices: ["fence", "loop"] }, { key: "cover", label: "through every open cell", type: "flag" }] },
  sides: { label: "Numbers count the loop's sides", settings: [] },
  runs: { label: "Row and column clue numbers", settings: [] },
  latin: { label: "Each digit once per row and column", settings: [] },
  boxes: { label: "Each digit once per box", settings: [{ key: "box", label: "box rows × columns", type: "pair" }] },
  connected: { label: "Shaded cells connect", settings: [] },
  "no-pool": { label: "No 2×2 shaded block", settings: [] },
  size: { label: "Region size", settings: [{ key: "is", label: "exactly", type: "number" }, { key: "min", label: "at least", type: "number" }, { key: "max", label: "at most", type: "number" }] },
  "size-clue": { label: "A number is its region's size", settings: [] },
  "one-each": { label: "One clue per region", settings: [{ key: "of", label: "of", type: "choice", choices: ["number", "symbol"] }] },
  twins: { label: "◆ joins same shapes", settings: [] },
  opposites: { label: "◇ joins different shapes", settings: [] },
  "all-different": { label: "All regions differ in shape", settings: [] },
  compass: { label: "Compasses count their region", settings: [] },
  "corner-count": { label: "Corner numbers count their walls", settings: [] },
  "perfect-maze": { label: "Walls make a maze between two doors", settings: [] },
};

/** Every style option. */
const STYLE: Record<keyof GridStyle, { label: string; type: "color" | "colors" | "number" | "choice"; choices?: string[] }> = {
  ink: { label: "Ink", type: "color" },
  wash: { label: "Shading / loop color", type: "color" },
  grid: { label: "Grid", type: "choice", choices: ["lines", "dots"] },
  major: { label: "Heavy line every", type: "number" },
  empty: { label: "Known-empty mark", type: "choice", choices: ["dot", "x"] },
  palette: { label: "Region colors", type: "colors" },
};

/** Every kind of mark a player can put down (a genre picks its own; Look can override). */
const MARKS: Record<MarkKind, string> = {
  fence: "lines along cell edges", loop: "lines through cell centers", shade: "shading", regions: "regions", digit: "digits",
};

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const S = 44, PAD = 24;
const same = (a: RC, b: RC) => a[0] === b[0] && a[1] === b[1];
const onBorder = (g: Given, a: RC, b: RC) => g.at === "border" && ((same(g.cells[0], a) && same(g.cells[1], b)) || (same(g.cells[0], b) && same(g.cells[1], a)));
const runsText = (v: number[] | undefined) => (v ?? [0]).join(" ");
const onEdge = ([r, c]: RC, side: Side, rows: number, cols: number) =>
  side === "top" ? r === 0 : side === "bottom" ? r === rows - 1 : side === "left" ? c === 0 : c === cols - 1;
const parseRuns = (t: string) => { const n = t.trim().split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => Number.isInteger(x) && x >= 0); return n.length ? n : [0]; };

export function PuzzleEditor({ spec, onChange }: { spec: GridSpec; onChange: (spec: GridSpec) => void }) {
  const genre = (spec.genre ?? "river") as GenreName;
  const [rows, cols] = spec.size;
  const givens = spec.givens ?? [];
  const firstTools = GENRE_CLUES[genre] ?? [];
  const cellTools = (Object.keys(CLUES) as ClueKind[]).filter((k) => CLUES[k].on !== "line");
  const [more, setMore] = useState(false);
  const shownTools = more ? cellTools : firstTools.filter((k) => CLUES[k].on !== "line");
  const picture = spec.picture;
  const [tool, setTool] = useState<ClueKind | "paint" | "erase">(picture ? "paint" : shownTools[0] ?? "erase");
  const [number, setNumber] = useState(1);
  const [role, setRole] = useState<"in" | "out">("in");
  const [symbol, setSymbol] = useState("★");
  const [compass, setCompass] = useState({ n: "", e: "", s: "", w: "" });
  const [ink, setInk] = useState(() => (picture ? Object.keys(picture.palette).find((k) => k !== ".") ?? "a" : "a"));
  const set = (patch: Partial<GridSpec>) => onChange({ ...spec, ...patch });
  const setGivens = (g: Given[]) => set({ givens: g });

  // ---- size: grow or shrink at the bottom / right; clues that fall off go ----
  function resize(dr: number, dc: number) {
    const r = Math.max(2, Math.min(30, rows + dr)), c = Math.max(2, Math.min(30, cols + dc));
    const inside = ([y, x]: RC) => y < r && x < c;
    const kept = givens.filter((g) => g.at === "cell" ? inside(g.cell) : g.at === "border" ? g.cells.every(inside)
      : g.at === "corner" ? g.corner[0] <= r && g.corner[1] <= c
        : g.at === "edge" ? inside(g.cell) && onEdge(g.cell, g.side, r, c) : g.index < (g.at === "row" ? r : c));
    set({
      size: [r, c], givens: kept,
      ...(picture ? { picture: { ...picture, rows: Array.from({ length: r }, (_, y) => (picture.rows[y] ?? "").padEnd(c, ".").slice(0, c)) } } : {}),
    });
  }

  // ---- clicking the grid: near a border edits the border, otherwise the cell ----
  function click(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const scale = (cols * S + 2 * PAD) / box.width;
    const x = (e.clientX - box.left) * scale - PAD, y = (e.clientY - box.top) * scale - PAD;
    // corners and the outside edge (mazes) can be clicked from just outside the grid too
    const vr = Math.round(y / S), vc = Math.round(x / S);
    const nearCorner = vr >= 0 && vc >= 0 && vr <= rows && vc <= cols && Math.hypot(x - vc * S, y - vr * S) < S * 0.3 ? [vr, vc] as RC : null;
    const edgeCell: RC = [Math.max(0, Math.min(rows - 1, Math.floor(y / S))), Math.max(0, Math.min(cols - 1, Math.floor(x / S)))];
    const dist: [Side, number][] = [["top", y], ["bottom", rows * S - y], ["left", x], ["right", cols * S - x]];
    const [side, away] = dist.reduce((a, b) => (b[1] < a[1] ? b : a));
    const nearEdge = away < S * 0.3 ? { cell: edgeCell, side } : null;
    const atEdge = (g: Given) => g.at === "edge" && nearEdge && same(g.cell, nearEdge.cell) && g.side === nearEdge.side;
    const atCorner = (g: Given) => g.at === "corner" && nearCorner && same(g.corner, nearCorner);
    if (tool === "count") {
      if (!nearCorner) return;
      const had = givens.find(atCorner);
      return setGivens([...givens.filter((g) => !atCorner(g)), ...(had && had.kind === "count" && had.value === number ? [] : [{ at: "corner", corner: nearCorner, kind: "count", value: number } as Given])]);
    }
    if (tool === "door") {
      if (!nearEdge) return;
      const had = givens.find(atEdge);
      const rest = givens.filter((g) => !atEdge(g) && !(g.at === "edge" && g.role === role));   // one way in, one way out
      return setGivens([...rest, ...(had && had.kind === "door" && had.role === role ? [] : [{ at: "edge", ...nearEdge, kind: "door", role } as Given])]);
    }
    if (tool === "erase" && (givens.some(atCorner) || givens.some(atEdge))) return setGivens(givens.filter((g) => !atCorner(g) && !atEdge(g)));
    const c = Math.floor(x / S), r = Math.floor(y / S);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    const fx = x / S - c, fy = y / S - r, edge = 0.22;
    const border: [RC, RC] | null =
      fx > 1 - edge && c + 1 < cols ? [[r, c], [r, c + 1]] : fx < edge && c > 0 ? [[r, c - 1], [r, c]]
        : fy > 1 - edge && r + 1 < rows ? [[r, c], [r + 1, c]] : fy < edge && r > 0 ? [[r - 1, c], [r, c]] : null;
    const cell: RC = [r, c];

    if (tool === "paint") {
      if (!picture) return;
      const rowsNow = picture.rows.map((row, y) => y !== r ? row : row.slice(0, c) + (row[c] === ink ? "." : ink) + row.slice(c + 1));
      return set({ picture: { ...picture, rows: rowsNow } });
    }
    if (tool === "erase") {
      if (border && givens.some((g) => onBorder(g, ...border))) return setGivens(givens.filter((g) => !onBorder(g, ...border)));
      return setGivens(givens.filter((g) => !(g.at === "cell" && same(g.cell, cell))));
    }
    if (CLUES[tool].on === "border") {
      if (!border) return;
      const had = givens.some((g) => onBorder(g, ...border) && g.kind === tool);
      return setGivens([...givens.filter((g) => !onBorder(g, ...border)), ...(had ? [] : [{ at: "border", cells: border, kind: tool } as Given])]);
    }
    const placed: Given =
      tool === "block" ? { at: "cell", cell, kind: "block" }
        : tool === "number" ? { at: "cell", cell, kind: "number", value: number }
          : tool === "symbol" ? { at: "cell", cell, kind: "symbol", value: symbol }
            : { at: "cell", cell, kind: "compass", value: Object.fromEntries(Object.entries(compass).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) };
    const here = givens.find((g) => g.at === "cell" && same(g.cell, cell));
    const identical = here && JSON.stringify(here) === JSON.stringify(placed);
    setGivens([...givens.filter((g) => !(g.at === "cell" && same(g.cell, cell))), ...(identical ? [] : [placed])]);
  }

  // ---- nonogram clue numbers (when there's no picture) ----
  const runsAt = (at: "row" | "col", index: number) =>
    (givens.find((g) => g.at === at && g.index === index) as Extract<Given, { kind: "runs" }> | undefined)?.value;
  const setRuns = (at: "row" | "col", index: number, text: string) =>
    setGivens([...givens.filter((g) => !(g.at === at && g.index === index)), { at, index, kind: "runs", value: parseRuns(text) }]);
  const nonogram = genre === "nonogram";
  function toPicture() {
    set({ givens: givens.filter((g) => g.at !== "row" && g.at !== "col"), picture: { rows: Array.from({ length: rows }, () => ".".repeat(cols)), palette: { ".": "#ffffff", a: "#26398f" } } });
    setTool("paint"); setInk("a");
  }
  function toNumbers() {
    const on = (picture?.rows ?? []).map((row) => [...row].map((ch) => ch !== "."));
    const lines: Given[] = picture ? [
      ...on.map((row, r): Given => ({ at: "row", index: r, kind: "runs", value: runsOf(row) })),
      ...Array.from({ length: cols }, (_, c): Given => ({ at: "col", index: c, kind: "runs", value: runsOf(on.map((row) => row[c] ?? false)) })),
    ] : [];
    const { picture: _gone, ...rest } = spec;
    onChange({ ...rest, givens: [...givens.filter((g) => g.at !== "row" && g.at !== "col"), ...lines] });
  }

  // ---- rules beyond the genre's own ----
  const extra = spec.rules ?? [];
  const setRules = (r: RuleSpec[]) => set({ rules: r.length ? r : undefined });
  const presets = (genres[genre]?.rules ?? []) as RuleSpec[];

  // ---- look ----
  const style = spec.style ?? {};
  const setStyle = (k: keyof GridStyle, v: unknown) => {
    const next = { ...style, [k]: v };
    if (v === undefined || v === "") delete next[k];
    set({ style: Object.keys(next).length ? next : undefined });
  };

  const W = cols * S + 2 * PAD, H = rows * S + 2 * PAD;
  const at = (r: number, c: number) => ({ x: PAD + c * S, y: PAD + r * S });
  const palette = picture?.palette ?? {};

  return (
    <div className="givens-editor">
      <div className="ge-bar">
        <label>Game type
          <select value={genre} onChange={(e) => set({ genre: e.target.value })}>
            {(Object.keys(GENRE_CLUES) as GenreName[]).map((g) => <option key={g} value={g}>{KIND_NAMES[g]}</option>)}
          </select>
        </label>
        <span className="ge-size">
          Rows <button type="button" onClick={() => resize(-1, 0)} aria-label="Fewer rows">−</button><b>{rows}</b><button type="button" onClick={() => resize(1, 0)} aria-label="More rows">+</button>
          Columns <button type="button" onClick={() => resize(0, -1)} aria-label="Fewer columns">−</button><b>{cols}</b><button type="button" onClick={() => resize(0, 1)} aria-label="More columns">+</button>
        </span>
      </div>

      {nonogram && (
        <div className="ge-bar">
          <span className="ge-tools" role="group" aria-label="Picture or numbers">
            <button type="button" aria-pressed={!!picture} onClick={() => !picture && toPicture()}>Draw the picture</button>
            <button type="button" aria-pressed={!picture} onClick={() => picture && toNumbers()}>Type clue numbers</button>
          </span>
          {picture && <label>Picture title <input className="wide" value={picture.title ?? ""} maxLength={60}
            onChange={(e) => set({ picture: { ...picture, title: e.target.value || undefined } })} /></label>}
        </div>
      )}

      {picture && (
        <div className="ge-bar">
          <span className="ge-tools" role="group" aria-label="Paint color">
            {Object.keys(palette).filter((k) => k !== ".").map((k) => (
              <span key={k} className="swatch-edit">
                <button type="button" aria-pressed={tool === "paint" && ink === k} aria-label={`Paint with color ${k}`}
                  onClick={() => { setTool("paint"); setInk(k); }} style={{ background: palette[k] }} />
                <input type="color" aria-label={`Color ${k}`} value={palette[k]} onChange={(e) => set({ picture: { ...picture, palette: { ...palette, [k]: e.target.value } } })} />
                <button type="button" className="x" aria-label={`Remove color ${k}`} onClick={() => {
                  const { [k]: _gone, ...rest } = palette;
                  set({ picture: { ...picture, palette: rest, rows: picture.rows.map((row) => row.replaceAll(k, ".")) } });
                }}>×</button>
              </span>
            ))}
            <button type="button" onClick={() => {
              const k = [...LETTERS].find((l) => !(l in palette));
              if (k) { set({ picture: { ...picture, palette: { ...palette, [k]: "#d8443a" } } }); setTool("paint"); setInk(k); }
            }}>+ Color</button>
          </span>
          <label>Background <input type="color" value={palette["."] ?? "#ffffff"} onChange={(e) => set({ picture: { ...picture, palette: { ...palette, ".": e.target.value } } })} /></label>
        </div>
      )}

      {!picture && (
        <div className="ge-bar">
          <span className="ge-tools" role="group" aria-label="Tool">
            {shownTools.map((t) => <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>{CLUES[t].label}</button>)}
            <button type="button" aria-pressed={tool === "erase"} onClick={() => setTool("erase")}>Erase</button>
            <button type="button" className="link" onClick={() => setMore(!more)}>{more ? "Fewer clues" : "More clues"}</button>
          </span>
          {tool === "door" && (
            <span className="ge-tools" role="group" aria-label="Door">
              <button type="button" aria-pressed={role === "in"} onClick={() => setRole("in")}>Way in</button>
              <button type="button" aria-pressed={role === "out"} onClick={() => setRole("out")}>Way out</button>
            </span>
          )}
          {(tool === "number" || tool === "count") && <label>Value <input type="number" min={0} max={30} value={number} onChange={(e) => setNumber(Number(e.target.value))} /></label>}
          {tool === "symbol" && <label>Symbol <input value={symbol} maxLength={2} onChange={(e) => setSymbol(e.target.value)} /></label>}
          {tool === "compass" && (
            <span className="ge-compass">{(["n", "e", "s", "w"] as const).map((k) =>
              <label key={k}>{k.toUpperCase()} <input type="number" min={0} max={30} value={compass[k]} onChange={(e) => setCompass({ ...compass, [k]: e.target.value })} /></label>)}
            </span>
          )}
        </div>
      )}
      <p className="hint">{tool === "paint" ? "Click cells to paint them; click again to clear." : tool === "erase" ? "Click a clue or a line mark to remove it." : tool === "count" ? "Click a corner where grid lines meet." : tool === "door" ? "Click the outside edge beside a cell." : !picture && CLUES[tool].on === "border" ? "Click the line between two cells." : "Click a cell; click again to remove."}</p>

      <div className={nonogram && !picture ? "ge-with-runs" : undefined}>
        {nonogram && !picture && (
          <div className="ge-col-runs" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }, (_, c) => <input key={c} aria-label={`Column ${c + 1} clue`} defaultValue={runsText(runsAt("col", c))} onBlur={(e) => setRuns("col", c, e.target.value)} />)}
          </div>
        )}
        <div className="ge-row-wrap">
          {nonogram && !picture && (
            <div className="ge-row-runs" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
              {Array.from({ length: rows }, (_, r) => <input key={r} aria-label={`Row ${r + 1} clue`} defaultValue={runsText(runsAt("row", r))} onBlur={(e) => setRuns("row", r, e.target.value)} />)}
            </div>
          )}
          <svg className="ge-grid" viewBox={`0 0 ${W} ${H}`} onClick={click} role="img" aria-label="Puzzle editor">
            {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
              const { x, y } = at(r, c);
              const ch = picture?.rows[r]?.[c];
              return <rect key={`${r}-${c}`} x={x} y={y} width={S} height={S} className="ge-cell" style={ch && ch !== "." ? { fill: palette[ch] ?? "#26398f" } : undefined} />;
            }))}
            {givens.map((g, i) => {
              if (g.at === "cell") {
                const { x, y } = at(...g.cell), cx = x + S / 2, cy = y + S / 2;
                if (g.kind === "block") return <rect key={i} x={x + 2} y={y + 2} width={S - 4} height={S - 4} className="ge-rock" />;
                if (g.kind === "compass") {
                  const v = g.value;
                  return <g key={i} className="ge-text small">
                    {v.n !== undefined && <text x={cx} y={y + 11}>{v.n}</text>}{v.s !== undefined && <text x={cx} y={y + S - 7}>{v.s}</text>}
                    {v.w !== undefined && <text x={x + 9} y={cy + 4}>{v.w}</text>}{v.e !== undefined && <text x={x + S - 9} y={cy + 4}>{v.e}</text>}
                    <circle cx={cx} cy={cy} r={3} />
                  </g>;
                }
                return <text key={i} x={cx} y={cy + 7} className="ge-text">{String(g.value)}</text>;
              }
              if (g.at === "border") {
                const [[r1, c1], [r2, c2]] = g.cells;
                const a = at(Math.max(r1, r2), Math.max(c1, c2));
                const line = r1 === r2 ? { x1: a.x, y1: a.y, x2: a.x, y2: a.y + S } : { x1: a.x, y1: a.y, x2: a.x + S, y2: a.y };
                if (g.kind === "wall") return <line key={i} {...line} className="ge-wall" />;
                const mx = (line.x1 + line.x2) / 2, my = (line.y1 + line.y2) / 2, d = 9;
                return <path key={i} d={`M${mx} ${my - d}L${mx + d} ${my}L${mx} ${my + d}L${mx - d} ${my}Z`} className={g.kind === "twins" ? "ge-diamond filled" : "ge-diamond"} />;
              }
              if (g.at === "corner") {
                const { x, y } = at(...g.corner);
                return <g key={i} className="ge-corner"><circle cx={x} cy={y} r={10} /><text x={x} y={y + 5}>{g.value}</text></g>;
              }
              if (g.at === "edge") {
                const { x, y } = at(...g.cell), [cx, cy] = [x + S / 2, y + S / 2];
                const [dx, dy] = g.side === "top" ? [0, -1] : g.side === "bottom" ? [0, 1] : g.side === "left" ? [-1, 0] : [1, 0];
                const [mx, my] = [cx + dx * S / 2, cy + dy * S / 2];
                const [ax, ay, hx, hy] = g.role === "in" ? [mx + dx * 20, my + dy * 20, mx + dx * 3, my + dy * 3] : [mx + dx * 3, my + dy * 3, mx + dx * 20, my + dy * 20];
                const ux = Math.sign(hx - ax), uy = Math.sign(hy - ay), bx = hx - 6 * ux, by = hy - 6 * uy;
                return <g key={i} className="ge-door">
                  <line x1={mx - Math.abs(dy) * S / 2} y1={my - Math.abs(dx) * S / 2} x2={mx + Math.abs(dy) * S / 2} y2={my + Math.abs(dx) * S / 2} className="ge-gap" />
                  <path d={`M${ax} ${ay}L${hx} ${hy}M${bx - 5 * uy} ${by + 5 * ux}L${hx} ${hy}L${bx + 5 * uy} ${by - 5 * ux}`} />
                </g>;
              }
              return null;
            })}
          </svg>
        </div>
      </div>

      <details className="ge-section" open={genre === "panes" || extra.length > 0}>
        <summary>Rules</summary>
        {presets.length > 0 && <p className="hint">{KIND_NAMES[genre]} always has: {presets.map((r) => RULES[r.rule as RuleName]?.label ?? r.rule).join("; ")}.</p>}
        <div className="ge-rules">
          {extra.map((r, i) => {
            const def = RULES[r.rule as RuleName];
            const update = (k: string, v: unknown) => setRules(extra.map((x, j) => {
              if (j !== i) return x;
              const next: RuleSpec = { ...x, [k]: v };
              if (v === undefined || v === "" || v === false) delete next[k];
              return next;
            }));
            return (
              <span key={i} className="chip">
                {def?.label ?? r.rule}
                {def?.settings.map((s) => (
                  <label key={s.key} className="setting">{s.label}
                    {s.type === "number" && <input type="number" min={0} max={99} value={r[s.key] === undefined ? "" : Number(r[s.key])}
                      onChange={(e) => update(s.key, e.target.value === "" ? undefined : Number(e.target.value))} />}
                    {s.type === "flag" && <input type="checkbox" checked={!!r[s.key]} onChange={(e) => update(s.key, e.target.checked)} />}
                    {s.type === "choice" && (
                      <select value={String(r[s.key] ?? "")} onChange={(e) => update(s.key, e.target.value || undefined)}>
                        <option value="">default</option>{s.choices.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    {s.type === "pair" && (
                      <input placeholder="e.g. 2 3" defaultValue={Array.isArray(r[s.key]) ? (r[s.key] as number[]).join(" ") : ""}
                        onBlur={(e) => { const p = e.target.value.trim().split(/[\s×x,]+/).map(Number).filter((n) => n > 0); update(s.key, p.length === 2 ? p : undefined); }} />
                    )}
                  </label>
                ))}
                <button type="button" aria-label={`Remove ${def?.label ?? r.rule}`} onClick={() => setRules(extra.filter((_, j) => j !== i))}>×</button>
              </span>
            );
          })}
          <select value="" aria-label="Add a rule" onChange={(e) => {
            const rule = e.target.value as RuleName;
            if (rule) setRules([...extra, rule === "size" ? { rule, is: 4 } : { rule }]);
          }}>
            <option value="">Add a rule…</option>
            {(Object.keys(RULES) as RuleName[]).map((r) => <option key={r} value={r}>{RULES[r].label}</option>)}
          </select>
        </div>
      </details>

      <details className="ge-section">
        <summary>Look</summary>
        <div className="ge-look">
          {(Object.keys(STYLE) as (keyof GridStyle)[]).map((k) => {
            const def = STYLE[k], v = style[k];
            return (
              <label key={k}>{def.label}
                {def.type === "color" && (
                  <span className="ge-inline">
                    <input type="color" value={typeof v === "string" ? v : "#26398f"} onChange={(e) => setStyle(k, e.target.value)} />
                    {v !== undefined && <button type="button" className="link" onClick={() => setStyle(k, undefined)}>default</button>}
                  </span>
                )}
                {def.type === "number" && <input type="number" min={0} max={30} value={v === undefined ? "" : Number(v)} onChange={(e) => setStyle(k, e.target.value === "" ? undefined : Number(e.target.value))} />}
                {def.type === "choice" && (
                  <select value={String(v ?? "")} onChange={(e) => setStyle(k, e.target.value || undefined)}>
                    <option value="">default</option>{def.choices!.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {def.type === "colors" && (
                  <span className="ge-inline">
                    {(Array.isArray(v) ? (v as string[]) : []).map((c, i, all) => (
                      <span key={i} className="swatch-edit">
                        <input type="color" value={c} aria-label={`Region color ${i + 1}`} onChange={(e) => setStyle(k, all.map((x, j) => (j === i ? e.target.value : x)))} />
                        <button type="button" className="x" aria-label={`Remove region color ${i + 1}`} onClick={() => setStyle(k, all.filter((_, j) => j !== i).length ? all.filter((_, j) => j !== i) : undefined)}>×</button>
                      </span>
                    ))}
                    <button type="button" onClick={() => setStyle(k, [...(Array.isArray(v) ? (v as string[]) : []), "#4f9fdc"])}>+ Color</button>
                  </span>
                )}
              </label>
            );
          })}
          <fieldset className="ge-marks">
            <legend>What the player draws <span className="hint">(the game type decides unless you change it)</span></legend>
            {(Object.keys(MARKS) as MarkKind[]).map((m) => {
              const current = spec.marks ?? (genres[genre]?.marks as MarkKind[] | undefined) ?? [];
              return (
                <label key={m} className="ge-inline">
                  <input type="checkbox" checked={current.includes(m)} onChange={(e) => {
                    const next = e.target.checked ? [...current, m] : current.filter((x) => x !== m);
                    const preset = (genres[genre]?.marks as MarkKind[] | undefined) ?? [];
                    set({ marks: next.length === preset.length && next.every((x) => preset.includes(x)) ? undefined : next });
                  }} /> {MARKS[m]}
                </label>
              );
            })}
          </fieldset>
        </div>
      </details>
    </div>
  );
}
