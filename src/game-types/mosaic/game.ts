// Mosaic game type: a nonogram that reveals a pixel-art picture (a clone of Inkwell
// Games' Mosaic). Tap cycles a cell empty -> filled -> X; right-click cycles the other
// way; dragging paints the first cell's new value. Tap a clue number to tick it off.
// Undo, Hint, Check, Reset. Solving fades the grid into the colored picture.
import type { MountGame } from "../../lib/game";
import { addInk } from "../../lib/ink";
import { runs, solveLine, type Cell } from "./solver";
import type { MosaicClientConfig } from "./types";

type V = 0 | 1 | 2;                                 // 0 empty, 1 filled, 2 X
interface Saved { cells: V[][]; marks: { rows: boolean[][]; cols: boolean[][] } }
type Stroke = { r: number; c: number; from: V }[];
const PREFS = "wyattsgames:mosaic-prefs";
const NS = "http://www.w3.org/2000/svg";

const readPrefs = () => { try { return { autoX: false, autoTick: false, ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; } catch { return { autoX: false, autoTick: false }; } };

export const createMosaic = (config: MosaicClientConfig): MountGame => (root, host) => {
  const { width: W, height: H, rows, cols, mask, colors } = config;
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;

  const saved = host.load<Saved>();
  let cells: V[][] = saved?.cells?.length === H ? saved.cells : Array.from({ length: H }, () => Array<V>(W).fill(0));
  const marks = saved?.marks ?? { rows: rows.map((cl) => cl.map(() => false)), cols: cols.map((cl) => cl.map(() => false)) };
  let history: Stroke[] = [];
  let solved = false;
  const prefs = readPrefs();
  const save = () => host.save({ cells, marks } satisfies Saved);

  // ---- layout: clues to the left and above the grid ----
  const S = 32;
  const CW = Math.max(...rows.map((r) => r.length)) * 24 + 12;          // width of the row-clue area
  const CH = Math.max(...cols.map((c) => c.length)) * 18 + 10;          // height of the column-clue area
  const svg = q<SVGSVGElement>("svg.board");
  svg.setAttribute("viewBox", `0 0 ${CW + W * S + 4} ${CH + H * S + 4}`);
  addInk(svg, root);
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };
  const X = (c: number) => CW + c * S, Y = (r: number) => CH + r * S;

  const gClues = el("g", { class: "clues" }), gGrid = el("g", { class: "cells" }), gLines = el("g", {}), gHint = el("g", {});
  const cellEls: Element[][] = [], xEls: Element[][] = [];
  for (let r = 0; r < H; r++) {
    cellEls.push([]); xEls.push([]);
    for (let c = 0; c < W; c++) {
      const delay = ((r + c) / (W + H)) * 1.1;                        // diagonal wave on reveal
      cellEls[r].push(el("rect", { class: "cell", x: X(c), y: Y(r), width: S, height: S, style: `--reveal:${colors[r][c]};--delay:${delay.toFixed(2)}s` }, gGrid));
      const s = S * 0.2, cx = X(c) + S / 2, cy = Y(r) + S / 2;
      xEls[r].push(el("path", { class: "x", d: `M${cx - s} ${cy - s}L${cx + s} ${cy + s}M${cx + s} ${cy - s}L${cx - s} ${cy + s}` }, gGrid));
    }
  }
  for (let r = 0; r <= H; r++) el("line", { class: r % 5 === 0 ? "line major" : "line", x1: CW, y1: Y(r), x2: X(W), y2: Y(r) }, gLines);
  for (let c = 0; c <= W; c++) el("line", { class: c % 5 === 0 ? "line major" : "line", x1: X(c), y1: CH, x2: X(c), y2: Y(H) }, gLines);
  el("rect", { class: "frame", x: CW, y: CH, width: W * S, height: H * S }, gLines);

  const rowClueEls = rows.map((clue, r) => clue.map((n, k) => {
    const t = el("text", { class: "clue", x: CW - 14 - (clue.length - 1 - k) * 24, y: Y(r) + S / 2 + 1, "data-line": `r${r}`, "data-k": k }, gClues);
    t.textContent = String(n); return t;
  }));
  const colClueEls = cols.map((clue, c) => clue.map((n, k) => {
    const t = el("text", { class: "clue", x: X(c) + S / 2, y: CH - 8 - (clue.length - 1 - k) * 18, "data-line": `c${c}`, "data-k": k }, gClues);
    t.textContent = String(n); return t;
  }));

  // ---- helpers ----
  const status = q<HTMLElement>(".status");
  const say = (text: string, tone: "" | "good" | "warn" = "") => { status.className = `status ${tone}`.trim(); status.textContent = text; };
  const lineOf = (kind: "r" | "c", i: number) => (kind === "r" ? cells[i] : cells.map((row) => row[i]));
  const filled = (line: V[]) => line.map((v) => v === 1);
  const sameRuns = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

  function render(wrong: Set<string> = new Set()) {
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const v = cells[r][c];
      cellEls[r][c].setAttribute("class", "cell" + (v === 1 ? " filled" : "") + (wrong.has(`${r},${c}`) ? " wrong" : ""));
      xEls[r][c].setAttribute("class", "x" + (v === 2 ? " on" : "") + (wrong.has(`${r},${c}`) ? " wrong" : ""));
    }
    rowClueEls.forEach((els, r) => els.forEach((t, k) => t.classList.toggle("done", marks.rows[r][k])));
    colClueEls.forEach((els, c) => els.forEach((t, k) => t.classList.toggle("done", marks.cols[c][k])));
  }

  /** Optional helpers (settings): tick finished clues, and X out the rest of a ticked line. */
  function assist() {
    const lines: ["r" | "c", number, number[], boolean[]][] = [
      ...rows.map((clue, r): ["r", number, number[], boolean[]] => ["r", r, clue, marks.rows[r]]),
      ...cols.map((clue, c): ["c", number, number[], boolean[]] => ["c", c, clue, marks.cols[c]]),
    ];
    for (const [kind, i, clue, m] of lines) {
      const line = lineOf(kind, i);
      const matches = sameRuns(runs(filled(line)), clue);
      if (prefs.autoTick && matches && line.every((v) => v !== 0)) m.fill(true);
      if (prefs.autoX && matches && m.every(Boolean)) {
        line.forEach((v, j) => {
          if (v !== 0) return;
          const [r, c] = kind === "r" ? [i, j] : [j, i];
          cells[r][c] = 2;
        });
      }
    }
  }

  function afterChange() {
    assist();
    render();
    save();
    if (mask.every((row, r) => row.every((m, c) => m === (cells[r][c] === 1)))) win();
    else say("Shade the cells that the clues ask for.");
  }

  // ---- input ----
  const toBoard = (evt: PointerEvent) => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const cellAt = (evt: PointerEvent): [number, number] | null => {
    const p = toBoard(evt);
    const c = Math.floor((p.x - CW) / S), r = Math.floor((p.y - CH) / S);
    return r >= 0 && c >= 0 && r < H && c < W ? [r, c] : null;
  };
  let drag: { value: V; last: [number, number]; stroke: Stroke } | null = null;
  const paint = (r: number, c: number, value: V, stroke: Stroke) => {
    if (cells[r][c] === value) return;
    stroke.push({ r, c, from: cells[r][c] });
    cells[r][c] = value;
  };

  svg.addEventListener("contextmenu", (e) => e.preventDefault());
  svg.addEventListener("pointerdown", (evt) => {
    if (solved) return;
    const clue = (evt.target as Element).closest<SVGTextElement>(".clue");
    if (clue) {                                       // tick a clue number on or off
      const kind = clue.dataset.line![0], i = Number(clue.dataset.line!.slice(1)), k = Number(clue.dataset.k);
      const m = kind === "r" ? marks.rows[i] : marks.cols[i];
      m[k] = !m[k];
      afterChange();
      return;
    }
    const at = cellAt(evt);
    if (!at) return;
    const [r, c] = at, cur = cells[r][c];
    const value: V = evt.button === 2 ? (((cur + 2) % 3) as V) : (((cur + 1) % 3) as V);
    drag = { value, last: at, stroke: [] };
    paint(r, c, value, drag.stroke);
    render();
    try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
  });
  svg.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const at = cellAt(evt);
    if (!at || (at[0] === drag.last[0] && at[1] === drag.last[1])) return;
    // fill every cell between the last one and this one, so fast drags don't skip
    const [r0, c0] = drag.last, [r1, c1] = at;
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    for (let s = 1; s <= steps; s++) {
      paint(Math.round(r0 + ((r1 - r0) * s) / steps), Math.round(c0 + ((c1 - c0) * s) / steps), drag.value, drag.stroke);
    }
    drag.last = at;
    render();
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.stroke.length) history.push(drag.stroke);
    drag = null;
    afterChange();
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  // ---- buttons ----
  q<HTMLButtonElement>("[data-undo]").addEventListener("click", () => {
    const stroke = history.pop();
    if (!stroke || solved) return;
    for (const { r, c, from } of [...stroke].reverse()) cells[r][c] = from;
    afterChange();
  });

  q<HTMLButtonElement>("[data-check]").addEventListener("click", () => {
    if (solved) return;
    const wrong = new Set<string>();
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if ((cells[r][c] === 1 && !mask[r][c]) || (cells[r][c] === 2 && mask[r][c])) wrong.add(`${r},${c}`);
    }
    render(wrong);
    if (!wrong.size) say("No mistakes so far.", "good");
    else say(wrong.size === 1 ? "One cell is wrong." : `${wrong.size} cells are wrong.`, "warn");
  });

  q<HTMLButtonElement>("[data-hint]").addEventListener("click", () => {
    if (solved) return;
    gHint.replaceChildren();
    const mistakes = cells.some((row, r) => row.some((v, c) => (v === 1 && !mask[r][c]) || (v === 2 && mask[r][c])));
    if (mistakes) { say("Some cells are wrong. Press Check to find them first.", "warn"); return; }
    const known = (v: V): Cell => (v === 1 ? 1 : v === 2 ? 0 : -1);
    const candidates: ["r" | "c", number][] = [...rows.map((_, r): ["r", number] => ["r", r]), ...cols.map((_, c): ["c", number] => ["c", c])];
    for (const [kind, i] of candidates) {
      const line = lineOf(kind, i);
      const res = solveLine(kind === "r" ? rows[i] : cols[i], line.map(known));
      if (!res) continue;
      const fresh = res.flatMap((v, j) => (v !== -1 && line[j] === 0 ? [[j, v]] : []));
      if (!fresh.length) continue;
      // highlight the line and ghost the cells it gives away
      const [x, y, w, h] = kind === "r" ? [CW, Y(i), W * S, S] : [X(i), CH, S, H * S];
      el("rect", { class: "hint-line", x, y, width: w, height: h }, gHint);
      for (const [j, v] of fresh) {
        const [r, c] = kind === "r" ? [i, j] : [j, i];
        if (v === 1) el("rect", { class: "hint-fill", x: X(c) + 4, y: Y(r) + 4, width: S - 8, height: S - 8 }, gHint);
        else el("path", { class: "hint-x", d: `M${X(c) + 10} ${Y(r) + 10}L${X(c) + S - 10} ${Y(r) + S - 10}M${X(c) + S - 10} ${Y(r) + 10}L${X(c) + 10} ${Y(r) + S - 10}` }, gHint);
      }
      say(`${kind === "r" ? "Row" : "Column"} ${i + 1}: its clue gives these cells away.`);
      setTimeout(() => gHint.replaceChildren(), 4000);
      return;
    }
    say("No hints available. There's nothing left that one line alone gives away.");
  });

  const reset = q<HTMLButtonElement>("[data-reset]");
  let confirming = false;
  reset.addEventListener("click", () => {
    if (!confirming) {
      confirming = true; reset.dataset.confirm = "Clear the grid? Tap again";
      setTimeout(() => { confirming = false; delete reset.dataset.confirm; }, 3000);
      return;
    }
    confirming = false; delete reset.dataset.confirm;
    cells = Array.from({ length: H }, () => Array<V>(W).fill(0));
    marks.rows.forEach((m) => m.fill(false)); marks.cols.forEach((m) => m.fill(false));
    history = []; solved = false; root.classList.remove("revealed", "titled");
    afterChange();
  });

  // settings
  root.querySelectorAll<HTMLInputElement>("[data-pref]").forEach((box) => {
    const k = box.dataset.pref as "autoX" | "autoTick";
    box.checked = prefs[k];
    box.addEventListener("change", () => {
      prefs[k] = box.checked;
      try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* ignore */ }
      afterChange();
    });
  });

  // ---- the reveal ----
  const sign = q<HTMLButtonElement>("[data-sign]");
  function win() {
    if (solved) return;
    solved = true;
    gHint.replaceChildren();
    root.classList.add("revealed");
    say("Solved! Here's the picture.", "good");
    host.solved({ title: config.title });
  }
  sign.addEventListener("click", () => root.classList.add("titled"));

  render();
  if (mask.every((row, r) => row.every((m, c) => m === (cells[r][c] === 1)))) { solved = true; root.classList.add("revealed", "titled"); say("Solved! Here's the picture.", "good"); }
  else say("Shade the cells that the clues ask for.");
};

/** Mount every Mosaic board on the page (each carries its config and id as data attributes). */
export function mountAll(createHost: (id: string) => Parameters<MountGame>[1]) {
  document.querySelectorAll<HTMLElement>("[data-game-type=mosaic]").forEach((root) => {
    createMosaic(JSON.parse(root.dataset.config!) as MosaicClientConfig)(root, createHost(root.dataset.gameId!));
  });
}
