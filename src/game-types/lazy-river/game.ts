// Lazy River game type: draw one loop through every white cell (a clone of Inkwell
// Games' Loopy River). Drag between cells to draw or erase; tap a border to mark an X
// where the river can't go. Undo, Check, Reset; checks itself once every cell is filled.
import type { MountGame } from "../../lib/game";
import { DOWN, LEFT, RIGHT, UP, type LazyRiverClientConfig } from "./types";

type Cell = [number, number];
interface Saved { lines: string[]; xs: string[] }
type Action = { kind: "line" | "x"; key: string; had: boolean }[];

const S = 44, PAD = 12;                       // cell size and border, in SVG units
const NS = "http://www.w3.org/2000/svg";
const DIRS: [number, number, number][] = [[-1, 0, UP], [0, 1, RIGHT], [1, 0, DOWN], [0, -1, LEFT]];

export const createLazyRiver = (config: LazyRiverClientConfig): MountGame => (root, host) => {
  const { grid, walls, solution } = config;
  const H = grid.length, W = grid[0].length;
  const white = (r: number, c: number) => r >= 0 && c >= 0 && r < H && c < W && grid[r][c] !== "#";
  const key = (a: Cell, b: Cell) => {
    const [p, q] = a[0] * W + a[1] < b[0] * W + b[1] ? [a, b] : [b, a];
    return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
  };
  const parse = (k: string) => k.split("|").map((s) => s.split(",").map(Number)) as [Cell, Cell];
  const bit = (a: Cell, b: Cell) => DIRS.find(([dr, dc]) => a[0] + dr === b[0] && a[1] + dc === b[1])![2];
  const walled = (a: Cell, b: Cell) => (walls[a[0]][a[1]] & bit(a, b)) !== 0;
  const passable = (a: Cell, b: Cell) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1 && white(...a) && white(...b) && !walled(a, b);
  const whiteCount = grid.join("").split("").filter((ch) => ch !== "#").length;

  const saved = host.load<Saved>();
  let lines = new Set(saved?.lines ?? []);
  let xs = new Set(saved?.xs ?? []);
  let history: Action[] = [];
  let solved = false, reported = false;
  const save = () => host.save({ lines: [...lines], xs: [...xs] } satisfies Saved);

  // ---- board ----
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const svg = q<SVGSVGElement>("svg");
  svg.setAttribute("viewBox", `0 0 ${W * S + 2 * PAD} ${H * S + 2 * PAD}`);
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };
  const x0 = (c: number) => PAD + c * S, y0 = (r: number) => PAD + r * S;
  const cx = (c: number) => x0(c) + S / 2, cy = (r: number) => y0(r) + S / 2;

  const gCells = el("g", {}), gGrid = el("g", {}), gWalls = el("g", {}), gMarks = el("g", {}), gRiver = el("g", {});
  const cellEls: Element[][] = [];
  for (let r = 0; r < H; r++) {
    cellEls.push([]);
    for (let c = 0; c < W; c++) {
      const cls = grid[r][c] === "#" ? "cell black" : `cell${(r + c) % 2 ? " alt" : ""}`;
      cellEls[r].push(el("rect", { class: cls, x: x0(c), y: y0(r), width: S, height: S }, gCells));
    }
  }
  for (let r = 0; r <= H; r++) el("line", { class: "gridline", x1: PAD, y1: y0(r), x2: PAD + W * S, y2: y0(r) }, gGrid);
  for (let c = 0; c <= W; c++) el("line", { class: "gridline", x1: x0(c), y1: PAD, x2: x0(c), y2: PAD + H * S }, gGrid);
  el("rect", { class: "frame", x: PAD, y: PAD, width: W * S, height: H * S }, gGrid);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (walls[r][c] & RIGHT) el("line", { class: "wall", x1: x0(c + 1), y1: y0(r), x2: x0(c + 1), y2: y0(r + 1) }, gWalls);
    if (walls[r][c] & DOWN) el("line", { class: "wall", x1: x0(c), y1: y0(r + 1), x2: x0(c + 1), y2: y0(r + 1) }, gWalls);
  }

  // ---- state helpers ----
  const degree = () => {
    const d = Array.from({ length: H }, () => Array<number>(W).fill(0));
    for (const k of lines) { const [a, b] = parse(k); d[a[0]][a[1]]++; d[b[0]][b[1]]++; }
    return d;
  };
  const status = q<HTMLElement>(".status");
  function say(text: string, tone: "" | "good" | "warn" = "") { status.className = `status ${tone}`.trim(); status.textContent = text; }

  function render(bad: Set<string> = new Set()) {
    gRiver.replaceChildren(); gMarks.replaceChildren();
    const d = degree();
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      cellEls[r][c].classList.toggle("bad", bad.has(`${r},${c}`) || d[r][c] > 2);
    }
    for (const k of lines) {
      const [a, b] = parse(k);
      el("line", { class: "river" + (solved ? " done" : ""), x1: cx(a[1]), y1: cy(a[0]), x2: cx(b[1]), y2: cy(b[0]) }, gRiver);
    }
    // a dot on each cell the river passes through, so joints look rounded
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
      if (d[r][c]) el("circle", { class: "joint" + (solved ? " done" : ""), cx: cx(c), cy: cy(r), r: 4.5 }, gRiver);
    for (const k of xs) {
      const [a, b] = parse(k);
      const mx = (cx(a[1]) + cx(b[1])) / 2, my = (cy(a[0]) + cy(b[0])) / 2, s = 5;
      el("path", { class: "xmark", d: `M${mx - s} ${my - s}L${mx + s} ${my + s}M${mx + s} ${my - s}L${mx - s} ${my + s}` }, gMarks);
    }
  }

  // ---- checking ----
  function check(auto: boolean) {
    const d = degree();
    const branch = new Set<string>(), cross = new Set<string>(), empty: string[] = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!white(r, c)) continue;
      if (d[r][c] === 3) branch.add(`${r},${c}`);
      if (d[r][c] === 4) cross.add(`${r},${c}`);
      if (d[r][c] < 2) empty.push(`${r},${c}`);
    }
    if (branch.size) { render(branch); return auto || say("The river should never branch.", "warn"); }
    if (cross.size) { render(cross); return auto || say("The river cannot cross itself.", "warn"); }
    if (empty.length) { render(); return auto || say("The river must flow through every white cell.", "warn"); }
    // every cell has two connections: one loop or several?
    const seen = new Set<string>();
    let at: Cell = parse([...lines][0])[0], prev: Cell | null = null;
    for (;;) {
      seen.add(at.join(","));
      const next = DIRS.map(([dr, dc]): Cell => [at[0] + dr, at[1] + dc])
        .find((n) => lines.has(key(at, n)) && !(prev && n[0] === prev[0] && n[1] === prev[1]))!;
      prev = at; at = next;
      if (seen.has(at.join(","))) break;
    }
    if (seen.size !== whiteCount) { render(); return say("The river must be one single loop.", "warn"); }
    const wrong = new Set<string>();
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      let bits = 0;
      for (const [dr, dc, b] of DIRS) if (lines.has(key([r, c], [r + dr, c + dc]))) bits |= b;
      if (white(r, c) && bits !== solution[r][c]) wrong.add(`${r},${c}`);
    }
    if (wrong.size) { render(wrong); return say("These cells are incorrect.", "warn"); }
    solved = true;
    render();
    say("You did it! The river flows through every cell.", "good");
    if (!reported) { reported = true; host.solved({ cells: whiteCount }); }
  }

  function progress() {
    const d = degree();
    let done = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (white(r, c) && d[r][c] === 2) done++;
    say(`${whiteCount - done} of ${whiteCount} cells still need the river.`);
    if (done === whiteCount) check(true);
  }

  // ---- input: drag to draw/erase, tap a border for an X ----
  const toBoard = (evt: PointerEvent) => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const cellAt = (p: DOMPoint): Cell | null => {
    const c = Math.floor((p.x - PAD) / S), r = Math.floor((p.y - PAD) / S);
    return r >= 0 && c >= 0 && r < H && c < W ? [r, c] : null;
  };
  let drag: { last: Cell; mode: "add" | "remove" | null; moved: boolean; start: DOMPoint; action: Action } | null = null;

  function setLine(k: string, on: boolean, action: Action) {
    if (lines.has(k) === on) return;
    action.push({ kind: "line", key: k, had: !on });
    if (on) { lines.add(k); if (xs.delete(k)) action.push({ kind: "x", key: k, had: true }); }
    else lines.delete(k);
  }

  svg.addEventListener("pointerdown", (evt) => {
    if (solved) return;
    const p = toBoard(evt), cell = cellAt(p);
    if (!cell) return;
    drag = { last: cell, mode: null, moved: false, start: p, action: [] };
    try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
  });
  svg.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const cell = cellAt(toBoard(evt));
    if (!cell || (cell[0] === drag.last[0] && cell[1] === drag.last[1])) return;
    if (passable(drag.last, cell)) {
      const k = key(drag.last, cell);
      drag.mode ??= lines.has(k) ? "remove" : "add";
      setLine(k, drag.mode === "add", drag.action);
      drag.moved = true;
      render(); progress();
    }
    drag.last = cell;
  });
  const endDrag = (evt: PointerEvent) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) {
      // a tap: X on the nearest border between two cells
      const p = toBoard(evt), cell = cellAt(p);
      if (cell) {
        const fx = (p.x - x0(cell[1])) / S, fy = (p.y - y0(cell[0])) / S;
        const near = [[fy, -1, 0], [1 - fx, 0, 1], [1 - fy, 1, 0], [fx, 0, -1]].sort((a, b) => a[0] - b[0])[0];
        const other: Cell = [cell[0] + near[1], cell[1] + near[2]];
        if (near[0] < 0.3 && passable(cell, other)) {
          const k = key(cell, other);
          const had = xs.has(k);
          d.action.push({ kind: "x", key: k, had });
          if (had) xs.delete(k); else { xs.add(k); if (lines.has(k)) setLine(k, false, d.action); }
          render(); progress();
        }
      }
    }
    if (d.action.length) { history.push(d.action); save(); }
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  // ---- buttons ----
  q<HTMLButtonElement>("[data-undo]").addEventListener("click", () => {
    const action = history.pop();
    if (!action || solved) return;
    for (const step of [...action].reverse()) {
      const set = step.kind === "line" ? lines : xs;
      if (step.had) set.add(step.key); else set.delete(step.key);
    }
    save(); render(); progress();
  });
  q<HTMLButtonElement>("[data-check]").addEventListener("click", () => { if (!solved) check(false); });
  const reset = q<HTMLButtonElement>("[data-reset]");
  let confirming = false;
  reset.addEventListener("click", () => {
    if (!confirming) {
      confirming = true; reset.textContent = "Clear the river?";
      setTimeout(() => { confirming = false; reset.textContent = "Reset"; }, 3000);
      return;
    }
    confirming = false; reset.textContent = "Reset";
    lines = new Set(); xs = new Set(); history = []; solved = false; reported = false;
    save(); render(); progress();
  });

  render();
  progress();
};

/** Mount every Lazy River board on the page (each carries its config and id as data attributes). */
export function mountAll(createHost: (id: string) => Parameters<MountGame>[1]) {
  document.querySelectorAll<HTMLElement>("[data-game-type=lazy-river]").forEach((root) => {
    createLazyRiver(JSON.parse(root.dataset.config!) as LazyRiverClientConfig)(root, createHost(root.dataset.gameId!));
  });
}
