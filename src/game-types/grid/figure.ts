// The grid player for paint puzzles (RYB): a figure of pieces (or a square grid's cells
// as square pieces), painted with the pots on the paper (or the keys R / Y / B, 1-9).
//   hearts > 0   a wrong color is turned away and costs a heart; pieces painted right lock in
//   hearts = 0   paint freely (the same color again clears), undo, and check
// Hidden dots show once their piece is painted.
import type { GameHost } from "../../lib/game-api";
import { addInk } from "../../lib/ink";
import { check } from "../../engine/puzzle.ts";
import { colorName } from "../../engine/rules.ts";
import { solvePaint } from "../../engine/paint.ts";
import { paletteSize } from "../../engine/encode.ts";
import { emptyBoard, type Puzzle } from "../../engine/types.ts";
import { piecesOf, roomiest } from "./pieces";
import { celebrate, stamp, unstamp } from "./celebrate";
import { boardKey, FLASH_MS, flashes, flashStart, flashStep, flashTargets, isDone } from "./flash.ts";

interface Saved { color?: number[]; hearts?: number }
const NS = "http://www.w3.org/2000/svg";

export function createFigure(p: Puzzle, root: HTMLElement, host: GameHost) {
  const pieces = piecesOf(p), n = pieces.length, k = paletteSize(p);
  const palette = p.style.palette?.length ? p.style.palette : ["#ef5a6a", "#f7cf3d", "#3fb0e6"];
  const answer = p.hearts > 0 ? solvePaint(p, 1)?.[0] : undefined;
  const maxHearts = answer ? p.hearts : 0;     // hearts need the answer
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T | null;
  const svg = q<SVGSVGElement>("svg.board")!;
  const xs = pieces.flat().map((pt) => pt[0]), ys = pieces.flat().map((pt) => pt[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), pad = span * 0.04;
  svg.setAttribute("viewBox", `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + 2 * pad} ${Math.max(...ys) - Math.min(...ys) + 2 * pad}`);
  svg.style.setProperty("--edge", String(span * 0.006));
  addInk(svg, root);
  root.classList.add("figure");
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const e = document.createElementNS(NS, tag);
    for (const a in attrs) e.setAttribute(a, String(attrs[a]));
    parent.appendChild(e);
    return e;
  };

  const saved = host.load<Saved>();
  let color = saved?.color?.length === n ? [...saved.color] : new Array<number>(n).fill(0);
  if (answer) color = color.map((c, i) => (c === answer[i] ? c : 0));   // only right pieces stay locked in
  let hearts = maxHearts ? Math.min(maxHearts, saved?.hearts ?? maxHearts) : 0;
  let brush = 1, reported = false, solved = false;
  let history: [number, number][] = [];

  // ---- the figure ----
  const gPieces = el("g", { class: "wash" }), gFlash = el("g", { class: "flash-layer" }), gEdges = el("g", {}), gErr = el("g", { class: "errors" }), gDots = el("g", {});
  const ptsOf = (pts: number[][]) => pts.map((pt) => pt.join(",")).join(" ");
  const shapes = pieces.map((pts, i) => el("polygon", { class: "piece", points: ptsOf(pts), "data-i": i }, gPieces));
  for (const pts of pieces) el("polygon", { class: "edge", points: ptsOf(pts) }, gEdges);
  const dotGroups = pieces.map((pts, i) => {
    const g = el("g", { class: "dots", "data-flash": `cell:${i}` }, gDots);
    const dots = (p.cellGivens.get(i) ?? []).flatMap((x) => (x.kind === "dots" ? x.value : []));
    const hidden = (p.cellGivens.get(i) ?? []).some((x) => x.kind === "dots" && x.hidden);
    if (hidden) g.classList.add("hideable");
    if (!dots.length) return g;
    const { x: cx, y: cy, room } = roomiest(pts), m = dots.length;
    const r = Math.max(span * 0.014, Math.min(span * 0.028, room / (m > 1 ? 2.4 : 1.6)));
    const ring = m > 1 ? r * (m > 4 ? 1.9 : 1.45) : 0;
    dots.forEach((c, j) => {
      const a = -Math.PI / 2 + (2 * Math.PI * j) / m;
      el("circle", { class: "paint-dot", cx: cx + ring * Math.cos(a), cy: cy + ring * Math.sin(a), r, fill: palette[c - 1] ?? "#999" }, g);
    });
    return g;
  });

  // ---- the paper: pots, hearts, status ----
  const status = q<HTMLElement>(".status")!;
  const say = (text: string, tone: "" | "good" | "warn" | "good said" = "") => { status.className = `status ${tone}`.trim(); status.textContent = text; };
  const pots = [...root.querySelectorAll<HTMLButtonElement>("[data-color]")];
  if (maxHearts) pots.filter((b) => b.dataset.color === "0").forEach((b) => b.remove());   // locked pieces can't be cleared
  pots.forEach((b) => { const c = Number(b.dataset.color); if (c) { b.title = `${colorName(p, c)} (${colorName(p, c)[0].toUpperCase()})`; b.setAttribute("aria-label", b.title); } });
  const pick = (c: number) => { brush = c; pots.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.color) === c))); };
  pots.forEach((b) => b.addEventListener("click", () => pick(Number(b.dataset.color))));
  const heartsEl = q<HTMLElement>("[data-hearts]");
  if (!maxHearts) { q("[data-hearts]")?.remove(); }
  else q("[data-undo]")?.remove();

  function render() {
    shapes.forEach((s, i) => {
      (s as SVGElement).style.fill = color[i] ? palette[color[i] - 1] ?? "#999" : "";
      s.classList.toggle("painted", !!color[i]);
      dotGroups[i].classList.toggle("shown", !!color[i]);
    });
    if (heartsEl) {
      heartsEl.replaceChildren(...Array.from({ length: maxHearts }, (_, j) => {
        const s = document.createElement("span");
        s.className = "heart" + (j < hearts ? "" : " lost"); s.textContent = "♥";
        return s;
      }));
      heartsEl.setAttribute("aria-label", `${hearts} of ${maxHearts} hearts left`);
    }
    root.classList.toggle("solved", solved);
  }
  const save = () => host.save({ color, ...(maxHearts ? { hearts } : {}) } satisfies Saved);
  // ---- the failure flash (flash.ts): every piece painted but wrong, the pieces that break the
  // rules pulse red. Only when painting freely: with hearts a wrong color is turned away.
  let flashOn: Set<string> | null = null, flashTimer = 0, flashState = flashStart();
  const clearFlash = () => { clearTimeout(flashTimer); flashOn = null; gFlash.replaceChildren(); svg.querySelectorAll(".flash").forEach((x) => x.classList.remove("flash")); };
  function flash(targets: string[]) {
    clearFlash();
    flashOn = new Set(targets);
    for (const t of targets) { const [kind, i] = t.split(":"); if (kind === "cell" && pieces[Number(i)]) el("polygon", { class: "flash-wash wash", points: ptsOf(pieces[Number(i)]) }, gFlash); }
    svg.querySelectorAll("[data-flash]").forEach((x) => { if (flashes(x.getAttribute("data-flash"), flashOn!)) x.classList.add("flash"); });
    flashTimer = window.setTimeout(clearFlash, FLASH_MS);
  }
  function settle() {
    const was = solved, problems = answer ? [] : check(p, paintBoard());
    solved = answer ? color.every((c, i) => c === answer[i]) : problems.length === 0;
    if (solved && !was) {
      say("Every piece is painted. Solved!", "good said");
      celebrate(root, [getComputedStyle(root).getPropertyValue("--paper-ink").trim() || "#222", ...palette]);
      if (!reported) { reported = true; host.solved(maxHearts ? { mistakes: maxHearts - hearts } : {}); }
    } else if (!solved && was) { say(""); unstamp(root); }
    save(); render();
    if (!answer) {
      const board = paintBoard(), step = flashStep(flashState, { done: !solved && isDone(p, board), solved, busy: false, key: boardKey(board) });
      flashState = step.state;
      if (step.fire) { const targets = flashTargets(p, board, problems); if (targets.length) flash(targets); }
    }
  }
  const paintBoard = () => { const b = emptyBoard(p.grid); b.color.set(color); return b; };

  svg.addEventListener("click", (evt) => {
    const t = (evt.target as Element).closest<SVGPolygonElement>(".piece");
    if (!t || solved) return;
    const i = Number(t.dataset.i);
    gErr.replaceChildren(); clearFlash();
    if (maxHearts) {
      if (hearts <= 0 || color[i]) return;            // out of hearts, or already locked in
      if (answer![i] === brush) { color[i] = brush; settle(); return; }
      hearts--;
      t.classList.remove("wrong"); void t.getBoundingClientRect(); t.classList.add("wrong");
      say(hearts > 0 ? `Not ${colorName(p, brush)}. ${hearts} heart${hearts === 1 ? "" : "s"} left.` : "Out of hearts. Reset to try again.", "warn");
      save(); render();
      return;
    }
    const v = color[i] === brush ? 0 : brush;
    history.push([i, color[i]]); color[i] = v;
    settle();
  });
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as Element | null)?.closest?.("input, textarea, select, dialog")) return;
    const key = e.key.toLowerCase();
    const named = Array.from({ length: k }, (_, j) => j + 1).find((c) => colorName(p, c)[0] === key && colorName(p, c) !== `color ${c}`);
    const c = named ?? (/^[1-9]$/.test(key) && Number(key) <= k ? Number(key) : 0);
    if (c) pick(c);
  };
  document.addEventListener("keydown", onKey);

  q<HTMLButtonElement>("[data-undo]")?.addEventListener("click", () => {
    const last = history.pop();
    if (!last || solved) return;
    color[last[0]] = last[1]; gErr.replaceChildren(); clearFlash(); settle();
  });
  const reset = q<HTMLButtonElement>("[data-reset]");
  let confirming = false;
  reset?.addEventListener("click", () => {
    if (!confirming && color.some(Boolean)) {
      confirming = true; reset.dataset.confirm = "Clear the figure? Tap again";
      setTimeout(() => { confirming = false; delete reset.dataset.confirm; }, 3000);
      return;
    }
    confirming = false; delete reset.dataset.confirm;
    color = new Array<number>(n).fill(0); hearts = maxHearts; history = []; solved = false; reported = false;
    gErr.replaceChildren(); clearFlash(); say(""); unstamp(root); settle();
  });

  pick(1);
  solved = answer ? color.every((c, i) => c === answer[i]) : check(p, paintBoard()).length === 0;
  reported = solved;
  if (solved) { say("Every piece is painted. Solved!", "good said"); stamp(root); }
  else if (maxHearts && hearts <= 0) say("Out of hearts. Reset to try again.", "warn");
  flashState = flashStart({ done: isDone(p, paintBoard()), solved, busy: false, key: boardKey(paintBoard()) });   // no flash for a board as saved
  render();
  return () => { clearFlash(); document.removeEventListener("keydown", onKey); };
}
