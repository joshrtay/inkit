// A visual editor for a puzzle's starting clues, for fixing a reading that came out wrong:
// change the grid size, and click cells and borders to place or remove rocks, walls, numbers,
// diamonds, symbols, compasses or (nonograms) picture cells. Edits the GridSpec directly; the
// page turns it back into sketch text.
import { useState } from "react";
import type { Given, GridSpec, RuleSpec } from "~site/engine/types.ts";

type RC = [number, number];
type Tool =
  | { kind: "block" } | { kind: "wall" } | { kind: "twins" } | { kind: "opposites" }
  | { kind: "number" } | { kind: "symbol" } | { kind: "compass" } | { kind: "paint" } | { kind: "erase" };

const TOOLS: Record<string, Tool["kind"][]> = {
  river: ["block", "wall", "erase"],
  slitherlink: ["number", "erase"],
  nurikabe: ["number", "erase"],
  sudoku: ["number", "erase"],
  nonogram: ["paint"],
  panes: ["number", "symbol", "compass", "twins", "opposites", "block", "erase"],
};
const LABEL: Record<Tool["kind"], string> = {
  block: "Rock", wall: "Wall", twins: "◆ Same shape", opposites: "◇ Different shape", number: "Number",
  symbol: "Symbol", compass: "Compass", paint: "Paint", erase: "Erase",
};
const PANES_RULES = ["size", "size-clue", "one-each", "twins", "opposites", "all-different", "compass"];

const S = 44, PAD = 8;
const same = (a: RC, b: RC) => a[0] === b[0] && a[1] === b[1];
const sameBorder = (g: Given, a: RC, b: RC) => g.at === "border" && ((same(g.cells[0], a) && same(g.cells[1], b)) || (same(g.cells[0], b) && same(g.cells[1], a)));

export function GivensEditor({ spec, onChange }: { spec: GridSpec; onChange: (spec: GridSpec) => void }) {
  const genre = spec.genre ?? "river";
  const tools = TOOLS[genre] ?? ["number", "block", "erase"];
  const [tool, setTool] = useState<Tool["kind"]>(tools[0]);
  const [number, setNumber] = useState(1);
  const [symbol, setSymbol] = useState("★");
  const [compass, setCompass] = useState({ n: "", e: "", s: "", w: "" });
  const [rows, cols] = spec.size;
  const givens = spec.givens ?? [];
  const set = (g: Given[]) => onChange({ ...spec, givens: g });

  // ---- grid size: grow or shrink at the bottom / right, dropping clues that fall off ----
  function resize(dr: number, dc: number) {
    const r = Math.max(2, Math.min(30, rows + dr)), c = Math.max(2, Math.min(30, cols + dc));
    const inside = ([y, x]: RC) => y < r && x < c;
    const kept = givens.filter((g) => g.at === "cell" ? inside(g.cell) : g.at === "border" ? g.cells.every(inside) : g.index < (g.at === "row" ? r : c));
    const picture = spec.picture && {
      ...spec.picture,
      rows: Array.from({ length: r }, (_, y) => (spec.picture!.rows[y] ?? "").padEnd(c, ".").slice(0, c)),
    };
    onChange({ ...spec, size: [r, c], givens: kept, ...(picture ? { picture } : {}) });
  }

  // ---- clicking: near a border edits the border, otherwise the cell ----
  function click(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const scale = (cols * S + 2 * PAD) / box.width;
    const x = (e.clientX - box.left) * scale - PAD, y = (e.clientY - box.top) * scale - PAD;
    const c = Math.floor(x / S), r = Math.floor(y / S);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    const fx = x / S - c, fy = y / S - r, edge = 0.22;
    const border: [RC, RC] | null =
      fx > 1 - edge && c + 1 < cols ? [[r, c], [r, c + 1]] : fx < edge && c > 0 ? [[r, c - 1], [r, c]]
        : fy > 1 - edge && r + 1 < rows ? [[r, c], [r + 1, c]] : fy < edge && r > 0 ? [[r - 1, c], [r, c]] : null;
    const cell: RC = [r, c];

    if (tool === "wall" || tool === "twins" || tool === "opposites") {
      if (!border) return;
      const had = givens.some((g) => sameBorder(g, ...border) && g.kind === tool);
      return set([...givens.filter((g) => !sameBorder(g, ...border)), ...(had ? [] : [{ at: "border", cells: border, kind: tool } as Given])]);
    }
    if (tool === "erase") {
      if (border && givens.some((g) => sameBorder(g, ...border))) return set(givens.filter((g) => !sameBorder(g, ...border)));
      return set(givens.filter((g) => !(g.at === "cell" && same(g.cell, cell))));
    }
    if (tool === "paint") {
      if (!spec.picture) return;
      const letter = Object.keys(spec.picture.palette).find((k) => k !== ".") ?? "a";
      const rowsNow = spec.picture.rows.map((row, y) => y !== r ? row : row.slice(0, c) + (row[c] === "." ? letter : ".") + row.slice(c + 1));
      return onChange({ ...spec, picture: { ...spec.picture, rows: rowsNow } });
    }
    const placed: Given =
      tool === "block" ? { at: "cell", cell, kind: "block" }
        : tool === "number" ? { at: "cell", cell, kind: "number", value: number }
          : tool === "symbol" ? { at: "cell", cell, kind: "symbol", value: symbol }
            : { at: "cell", cell, kind: "compass", value: Object.fromEntries(Object.entries(compass).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) };
    const here = givens.find((g) => g.at === "cell" && same(g.cell, cell));
    const identical = here && JSON.stringify(here) === JSON.stringify(placed);
    set([...givens.filter((g) => !(g.at === "cell" && same(g.cell, cell))), ...(identical ? [] : [placed])]);
  }

  // ---- panes rules ----
  const rules = spec.rules ?? [];
  const setRules = (r: RuleSpec[]) => onChange({ ...spec, rules: r });

  const W = cols * S + 2 * PAD, H = rows * S + 2 * PAD;
  const at = (r: number, c: number) => ({ x: PAD + c * S, y: PAD + r * S });

  return (
    <div className="givens-editor">
      <div className="ge-bar">
        <span className="ge-size">
          Rows <button type="button" onClick={() => resize(-1, 0)} aria-label="Fewer rows">−</button><b>{rows}</b><button type="button" onClick={() => resize(1, 0)} aria-label="More rows">+</button>
          Columns <button type="button" onClick={() => resize(0, -1)} aria-label="Fewer columns">−</button><b>{cols}</b><button type="button" onClick={() => resize(0, 1)} aria-label="More columns">+</button>
        </span>
        <span className="ge-tools" role="group" aria-label="Tool">
          {tools.map((t) => <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>{LABEL[t]}</button>)}
        </span>
        {tool === "number" && <label>Value <input type="number" min={0} max={30} value={number} onChange={(e) => setNumber(Number(e.target.value))} /></label>}
        {tool === "symbol" && <label>Symbol <input value={symbol} maxLength={2} onChange={(e) => setSymbol(e.target.value)} /></label>}
        {tool === "compass" && (
          <span className="ge-compass">{(["n", "e", "s", "w"] as const).map((k) =>
            <label key={k}>{k.toUpperCase()} <input type="number" min={0} max={30} value={compass[k]} onChange={(e) => setCompass({ ...compass, [k]: e.target.value })} /></label>)}
          </span>
        )}
      </div>
      <p className="hint">{tool === "wall" || tool === "twins" || tool === "opposites" ? "Click the line between two cells." : tool === "erase" ? "Click a clue or a wall to remove it." : tool === "paint" ? "Click cells to shade or clear them." : "Click a cell; click again to remove."}</p>

      <svg className="ge-grid" viewBox={`0 0 ${W} ${H}`} onClick={click} role="img" aria-label="Clue editor">
        {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
          const { x, y } = at(r, c);
          const shaded = spec.picture?.rows[r]?.[c] && spec.picture.rows[r][c] !== ".";
          return <rect key={`${r}-${c}`} x={x} y={y} width={S} height={S} className={shaded ? "ge-cell painted" : "ge-cell"} />;
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
            const horizontal = r1 === r2;   // side by side: a vertical line between them
            const a = at(Math.max(r1, r2), Math.max(c1, c2));
            const line = horizontal ? { x1: a.x, y1: a.y, x2: a.x, y2: a.y + S } : { x1: a.x, y1: a.y, x2: a.x + S, y2: a.y };
            if (g.kind === "wall") return <line key={i} {...line} className="ge-wall" />;
            const mx = (line.x1 + line.x2) / 2, my = (line.y1 + line.y2) / 2, d = 9;
            return <path key={i} d={`M${mx} ${my - d}L${mx + d} ${my}L${mx} ${my + d}L${mx - d} ${my}Z`} className={g.kind === "twins" ? "ge-diamond filled" : "ge-diamond"} />;
          }
          return null;
        })}
      </svg>

      {genre === "panes" && (
        <div className="ge-rules">
          <span>Rules:</span>
          {rules.map((r, i) => (
            <span key={i} className="chip">
              {r.rule}{r.is !== undefined ? ` ${r.is}` : ""}{r.of ? ` (${r.of})` : ""}
              <button type="button" aria-label={`Remove ${r.rule}`} onClick={() => setRules(rules.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
          <select value="" aria-label="Add a rule" onChange={(e) => {
            const rule = e.target.value;
            if (!rule) return;
            setRules([...rules, rule === "size" ? { rule, is: 4 } : rule === "one-each" ? { rule, of: "number" } : { rule }]);
          }}>
            <option value="">Add a rule…</option>
            {PANES_RULES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {rules.some((r) => r.rule === "size") && (
            <label>Region size <input type="number" min={1} max={30} value={Number(rules.find((r) => r.rule === "size")!.is ?? 4)}
              onChange={(e) => setRules(rules.map((r) => r.rule === "size" ? { ...r, is: Number(e.target.value) } : r))} /></label>
          )}
        </div>
      )}
    </div>
  );
}
