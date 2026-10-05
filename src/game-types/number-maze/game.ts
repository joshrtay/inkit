// Number maze game type. Numbers sit on the corners of a grid of squares; lines between
// them are walls. Phase 1: draw the walls so each number has that many touching it.
// Phase 2: drag a line through the open squares from the entrance to the exit.
// Plain TypeScript + SVG. Each instance supplies a NumberMazeConfig (see types.ts).
import type { MountGame } from "../../lib/game";
import type { NumberMazeConfig } from "./types";

type Pt = [number, number];                    // [row, col] of a number or a square
type Phase = "draw" | "walk";
interface Saved { walls: string[] }

const P = 40;                                   // distance between numbers
const ML = 22, MT = 46, MR = 52, MB = 22;       // margins (room for the arrows)
const NS = "http://www.w3.org/2000/svg";
const STEPS: Record<string, Pt> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** Build a mountable game for one maze. */
export const createNumberMaze = (maze: NumberMazeConfig): MountGame => (root, host) => {
  const clues = maze.clues;
  const H = clues.length, W = clues[0].length;  // numbers down / across
  const CW = W - 1, CH = H - 1;                 // squares across / down
  const entry: Pt = [0, maze.entryCol], exit: Pt = [maze.exitRow, CW - 1];
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;

  const key = (a: Pt, b: Pt) => {               // canonical key for the wall between two numbers
    const [p, r] = a[0] * W + a[1] < b[0] * W + b[1] ? [a, b] : [b, a];
    return `${p[0]},${p[1]}-${r[0]},${r[1]}`;
  };
  const keys = (list: number[][][]) => new Set(list.map(([a, b]) => key(a as Pt, b as Pt)));
  const parse = (k: string) => k.split("-").map((s) => s.split(",").map(Number)) as [Pt, Pt];
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  const onBorder = (r: number, c: number) => r === 0 || r === H - 1 || c === 0 || c === W - 1;

  // The border is given, except the entrance gap (top) and the exit gap (right).
  const gaps = new Set([key([0, entry[1]], [0, entry[1] + 1]), key([exit[0], W - 1], [exit[0] + 1, W - 1])]);
  const border = new Set<string>();
  for (let c = 0; c + 1 < W; c++) for (const r of [0, H - 1]) border.add(key([r, c], [r, c + 1]));
  for (let r = 0; r + 1 < H; r++) for (const c of [0, W - 1]) border.add(key([r, c], [r + 1, c]));
  for (const g of gaps) border.delete(g);
  const hints = keys(maze.hints);
  const given = new Set([...border, ...hints]);

  let walls = new Set([...(host.load<Saved>()?.walls ?? []), ...given]);
  for (const g of gaps) walls.delete(g);
  let history: [string, boolean][] = [];
  let phase: Phase = "draw";
  let trail: Pt[] = [entry];
  let drawn = false;
  const save = () => host.save({ walls: [...walls] } satisfies Saved);

  // ---- board geometry ----
  const svg = q<SVGSVGElement>("svg");
  const vbW = ML + CW * P + MR, vbH = MT + CH * P + MB;
  svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  q<HTMLElement>(".sheet").style.setProperty("--ratio", (vbW / vbH).toFixed(4));
  const vx = (c: number) => ML + c * P, vy = (r: number) => MT + r * P;          // a number's centre
  const sx = (c: number) => vx(c) + P / 2, sy = (r: number) => vy(r) + P / 2;    // a square's centre
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };

  const gSquares = el("g", {}), gWalls = el("g", {}), gGaps = el("g", {}), gTrail = el("g", {});
  const gNums = el("g", {}), gTop = el("g", {});

  // entrance arrow points down into the top gap; exit arrow points out of the right gap
  const ax = sx(entry[1]), ay = vy(0);
  el("path", { class: "arrow", d: `M${ax} ${ay - 36} V${ay - 10} M${ax - 6} ${ay - 17} L${ax} ${ay - 10} L${ax + 6} ${ay - 17}` }, gTop);
  const bx = vx(W - 1), by = sy(exit[0]);
  el("path", { class: "arrow", d: `M${bx + 10} ${by} H${bx + 38} M${bx + 31} ${by - 6} L${bx + 38} ${by} L${bx + 31} ${by + 6}` }, gTop);

  // squares (used in phase 2)
  const squareEls: Element[][] = [];
  for (let r = 0; r < CH; r++) {
    squareEls.push([]);
    for (let c = 0; c < CW; c++) {
      squareEls[r].push(el("rect", { class: "square", x: vx(c) + 3, y: vy(r) + 3, width: P - 6, height: P - 6, rx: 3 }, gSquares));
    }
  }
  // numbers
  const numEls: Element[][] = [];
  for (let r = 0; r < H; r++) {
    numEls.push([]);
    for (let c = 0; c < W; c++) {
      const g = el("g", { class: "num" }, gNums);
      el("circle", { cx: vx(c), cy: vy(r), r: 12 }, g);
      el("text", { x: vx(c), y: vy(r) + 1 }, g).textContent = String(clues[r][c]);
      numEls[r].push(g);
    }
  }
  // tap targets on every wall spot the player may change (not the border)
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (c + 1 < W && !(onBorder(r, c) && onBorder(r, c + 1) && (r === 0 || r === H - 1)))
      el("rect", { class: "gap", x: vx(c) + 12, y: vy(r) - 8, width: P - 24, height: 16, "data-k": key([r, c], [r, c + 1]) }, gGaps);
    if (r + 1 < H && !(c === 0 || c === W - 1))
      el("rect", { class: "gap", x: vx(c) - 8, y: vy(r) + 12, width: 16, height: P - 24, "data-k": key([r, c], [r + 1, c]) }, gGaps);
  }

  // ---- phase 1: drawing walls ----
  const status = q<HTMLElement>(".status"), meter = q<HTMLElement>(".meter span");
  const goWalk = q<HTMLButtonElement>("[data-go-walk]");
  const drawTab = q<HTMLButtonElement>("[data-phase=draw]"), walkTab = q<HTMLButtonElement>("[data-phase=walk]");

  function degrees() {
    const d = Array.from({ length: H }, () => Array<number>(W).fill(0));
    for (const k of walls) { const [a, b] = parse(k); d[a[0]][a[1]]++; d[b[0]][b[1]]++; }
    return d;
  }
  function structure(): "ok" | "loop" | "floating" {
    const parent = Array.from({ length: W * H }, (_, i) => i);
    const find = (x: number): number => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    for (const k of walls) {
      const [a, b] = parse(k);
      const x = find(a[0] * W + a[1]), y = find(b[0] * W + b[1]);
      if (x === y) return "loop";
      parent[x] = y;
    }
    const touching = new Set<number>();
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (onBorder(r, c)) touching.add(find(r * W + c));
    for (const k of walls) { const [a] = parse(k); if (!touching.has(find(a[0] * W + a[1]))) return "floating"; }
    return "ok";
  }

  function render() {
    gWalls.replaceChildren();
    for (const k of walls) {
      const [a, b] = parse(k);
      const cls = border.has(k) ? "wall border" : hints.has(k) ? "wall hint" : "wall";
      el("line", { class: cls, x1: vx(a[1]), y1: vy(a[0]), x2: vx(b[1]), y2: vy(b[0]) }, gWalls);
    }
    const d = degrees();
    let done = 0, over = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const g = numEls[r][c], need = clues[r][c];
      g.classList.toggle("done", d[r][c] === need);
      g.classList.toggle("over", d[r][c] > need);
      if (d[r][c] === need) done++;
      if (d[r][c] > need) over++;
    }
    meter.style.width = (100 * done / (W * H)).toFixed(1) + "%";
    if (phase !== "draw") return;
    status.className = "status";
    if (done === W * H) {
      const s = structure();
      drawn = s === "ok";
      if (drawn) { status.className = "status good"; status.textContent = "Every number is satisfied. The maze is built."; }
      else {
        status.className = "status warn";
        status.textContent = s === "loop"
          ? "Every number is satisfied, but some walls close into a loop. That would wall off part of the maze."
          : "Every number is satisfied, but some walls float free. Every wall has to connect to the border.";
      }
    } else {
      drawn = false;
      status.textContent = `${W * H - done} of ${W * H} numbers still need walls.` + (over ? ` ${over} ha${over === 1 ? "s" : "ve"} too many.` : "");
    }
    goWalk.hidden = !drawn;
    walkTab.disabled = !drawn;
  }

  function toggle(k: string, mode?: "add" | "remove") {
    if (given.has(k) || gaps.has(k)) return false;
    const has = walls.has(k);
    if ((mode === "add" && has) || (mode === "remove" && !has)) return false;
    history.push([k, has]);
    if (has) walls.delete(k); else walls.add(k);
    return true;
  }

  const toBoard = (evt: PointerEvent | MouseEvent) => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const numberAt = (evt: PointerEvent): Pt | null => {
    const p = toBoard(evt);
    const c = Math.round((p.x - ML) / P), r = Math.round((p.y - MT) / P);
    if (r < 0 || r >= H || c < 0 || c >= W) return null;
    return Math.hypot(p.x - vx(c), p.y - vy(r)) > 16 ? null : [r, c];
  };
  const squareAt = (evt: MouseEvent): Pt | null => {
    const p = toBoard(evt);
    const c = Math.floor((p.x - ML) / P), r = Math.floor((p.y - MT) / P);
    return r < 0 || r >= CH || c < 0 || c >= CW ? null : [r, c];
  };

  let drag: { last: Pt; mode: "add" | "remove" | null } | null = null;
  svg.addEventListener("pointerdown", (evt) => {
    if (phase !== "draw") return;
    const gap = (evt.target as Element).closest<SVGElement>(".gap");
    if (gap) { if (toggle(gap.dataset.k!)) { render(); save(); } return; }
    const n = numberAt(evt);
    if (!n) return;
    drag = { last: n, mode: null };
    try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
  });
  svg.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const n = numberAt(evt);
    if (!n || same(n, drag.last)) return;
    if (Math.abs(n[0] - drag.last[0]) + Math.abs(n[1] - drag.last[1]) === 1) {
      const k = key(drag.last, n);
      drag.mode ??= walls.has(k) ? "remove" : "add";
      if (toggle(k, drag.mode)) { render(); save(); }
    }
    drag.last = n;
  });
  const endDrag = () => { drag = null; };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  q<HTMLButtonElement>("[data-undo]").addEventListener("click", () => {
    if (phase === "walk") { if (trail.length > 1) { trail.pop(); renderWalk(); } return; }
    const last = history.pop();
    if (!last) return;
    const [k, had] = last;
    if (had) walls.add(k); else walls.delete(k);
    render(); save();
  });
  const clearBtn = q<HTMLButtonElement>("[data-clear]");
  let confirmClear = false;
  clearBtn.addEventListener("click", () => {
    if (phase === "walk") { trail = [entry]; tail = null; renderWalk(); return; }
    if (!confirmClear) {
      confirmClear = true; clearBtn.textContent = "Erase all walls?";
      setTimeout(() => { confirmClear = false; clearBtn.textContent = "Start over"; }, 3000);
      return;
    }
    confirmClear = false; clearBtn.textContent = "Start over";
    walls = new Set(given); history = []; render(); save();
  });

  // ---- phase 2: walk through the open squares ----
  function wallBetween(a: Pt, b: Pt) {          // the wall that separates neighbouring squares
    const [p, r] = a[0] * CW + a[1] < b[0] * CW + b[1] ? [a, b] : [b, a];
    return p[0] === r[0]
      ? key([p[0], r[1]], [p[0] + 1, r[1]])     // side by side: vertical wall
      : key([r[0], p[1]], [r[0], p[1] + 1]);    // stacked: horizontal wall
  }
  const openNeighbors = (s: Pt) => Object.values(STEPS)
    .map(([dr, dc]): Pt => [s[0] + dr, s[1] + dc])
    .filter((n) => n[0] >= 0 && n[0] < CH && n[1] >= 0 && n[1] < CW && !walls.has(wallBetween(s, n)));
  let token: Element | null = null;
  let walking = false;                          // a drag is in progress
  let tail: [number, number] | null = null;     // live end of the line under the finger
  let reported = false;

  const centre = ([r, c]: Pt): [number, number] => [sx(c), sy(r)];
  const head = () => trail[trail.length - 1];
  const isOut = () => same(head(), exit);
  const EXIT_POINT: [number, number] = [vx(W - 1) + 14, sy(exit[0])];

  function renderWalk() {
    gTrail.replaceChildren();
    const out = isOut();
    const pts: number[][] = [[sx(entry[1]), vy(0) - 8], ...trail.map(centre)];
    if (out) pts.push(EXIT_POINT);
    else if (tail) pts.push(tail);
    el("polyline", { class: "trail", points: pts.map((p) => p.join(",")).join(" ") }, gTrail);
    for (const row of squareEls) for (const s of row) s.classList.remove("reach");
    if (!out && !walking) for (const n of openNeighbors(head())) squareEls[n[0]][n[1]].classList.add("reach");
    const [tx, ty] = out ? EXIT_POINT : tail ?? centre(head());
    token ??= el("circle", { class: "token", r: 9 }, gTop);
    token.setAttribute("cx", String(tx));
    token.setAttribute("cy", String(ty));
    if (out) {
      status.className = "status good";
      status.textContent = `You're out! ${trail.length} squares from entrance to exit.`;
      if (!reported) { reported = true; host.solved({ squares: trail.length }); }
    } else {
      reported = false;
      status.className = "status";
      status.textContent = `${trail.length} square${trail.length === 1 ? "" : "s"} so far. Head for the arrow on the right edge.`;
    }
  }

  /** Shortest open route from one square to another, at most 4 steps (covers fast drags). */
  function route(from: Pt, to: Pt): Pt[] | null {
    const prev = new Map<string, Pt>();
    const seen = new Set([String(from)]);
    let frontier = [from];
    for (let d = 0; d < 4 && frontier.length; d++) {
      const next: Pt[] = [];
      for (const s of frontier) for (const n of openNeighbors(s)) {
        if (seen.has(String(n))) continue;
        seen.add(String(n)); prev.set(String(n), s);
        if (same(n, to)) {
          const steps: Pt[] = [];
          for (let u: Pt = n; !same(u, from); u = prev.get(String(u))!) steps.unshift(u);
          return steps;
        }
        next.push(n);
      }
      frontier = next;
    }
    return null;
  }
  /** Extend or pull back the trail so it ends at square `s`. */
  function goTo(s: Pt) {
    if (isOut() || same(s, head())) return false;
    const back = trail.findIndex((p) => same(p, s));
    if (back >= 0) { trail = trail.slice(0, back + 1); return true; }
    const steps = route(head(), s);
    if (!steps) return false;
    for (const n of steps) {            // the maze is a tree, so a route may first back up the trail
      if (trail.length > 1 && same(n, trail[trail.length - 2])) trail.pop();
      else trail.push(n);
      if (same(n, exit)) break;
    }
    return true;
  }
  /** Stretch the line from the last square toward the finger, along an open corridor only. */
  function stretchTo(p: DOMPoint) {
    tail = null;
    if (isOut()) return;
    const [hx, hy] = centre(head());
    let best: Pt | null = null, reach = 0;
    for (const n of openNeighbors(head())) {
      const dx = n[1] - head()[1], dy = n[0] - head()[0];
      const along = (p.x - hx) * dx + (p.y - hy) * dy;
      if (along > reach) { reach = along; best = [dx, dy]; }
    }
    if (best) tail = [hx + best[0] * Math.min(reach, P), hy + best[1] * Math.min(reach, P)];
  }

  svg.addEventListener("pointerdown", (evt) => {
    if (phase !== "walk" || isOut()) return;
    const s = squareAt(evt);
    if (!s) return;
    const onTrail = trail.some((p) => same(p, s));
    if (!onTrail && !route(head(), s)) return;
    goTo(s);
    walking = true;
    try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
    stretchTo(toBoard(evt));
    renderWalk();
  });
  svg.addEventListener("pointermove", (evt) => {
    if (!walking) return;
    const s = squareAt(evt);
    if (s) goTo(s);
    stretchTo(toBoard(evt));
    renderWalk();
  });
  const endWalk = () => {
    if (!walking) return;
    walking = false; tail = null;
    renderWalk();
  };
  svg.addEventListener("pointerup", endWalk);
  svg.addEventListener("pointercancel", endWalk);

  function moveTo(n: Pt) {                      // one step, for the arrow keys
    if (isOut()) return;
    if (trail.length > 1 && same(n, trail[trail.length - 2])) { trail.pop(); renderWalk(); return; }
    if (openNeighbors(head()).some((x) => same(x, n))) { trail.push(n); renderWalk(); }
  }
  const onKey = (evt: KeyboardEvent) => {
    if (phase !== "walk" || !(evt.key in STEPS)) return;
    evt.preventDefault();
    const [dr, dc] = STEPS[evt.key];
    moveTo([head()[0] + dr, head()[1] + dc]);
  };
  document.addEventListener("keydown", onKey);

  function setPhase(p: Phase) {
    phase = p;
    drawTab.setAttribute("aria-pressed", String(p === "draw"));
    walkTab.setAttribute("aria-pressed", String(p === "walk"));
    root.dispatchEvent(new CustomEvent("number-maze:phase", { detail: p, bubbles: true }));
    svg.classList.toggle("walking", p === "walk");
    goWalk.hidden = p === "walk" || !drawn;
    if (p === "walk") return renderWalk();
    gTrail.replaceChildren();
    token?.remove(); token = null;
    for (const row of squareEls) for (const s of row) s.classList.remove("reach");
    render();
  }
  drawTab.addEventListener("click", () => setPhase("draw"));
  walkTab.addEventListener("click", () => { if (drawn) setPhase("walk"); });
  goWalk.addEventListener("click", () => setPhase("walk"));

  render();
  return () => document.removeEventListener("keydown", onKey);
};

/** Mount every number-maze board on the page (each carries its config and id as data attributes). */
export function mountAll(createHost: (id: string) => Parameters<MountGame>[1]) {
  document.querySelectorAll<HTMLElement>("[data-game-type=number-maze]").forEach((root) => {
    const config = JSON.parse(root.dataset.config!) as NumberMazeConfig;
    createNumberMaze(config)(root, createHost(root.dataset.gameId!));
  });
}
