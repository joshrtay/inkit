// Plays a game in the page with the shared grid game (../src/game-types/grid). The game
// builds its board inside a container of plain HTML (its paper, controls and SVG), so the player
// is plain TypeScript, independent of React. React only provides the spot; the game owns
// everything inside it.
import { clearTimer, loadTimer, pause, saveTimer, startTimer, tick } from "./solve-timer";
import { useEffect, useRef } from "react";
import { createGrid } from "~site/game-types/grid/game";
import "~site/game-types/grid/styles.css";
import { tool } from "./icons";
import { createHost } from "~/lib/host";
import { createPlayLog, FLUSH_MS, sendBatch, shareAllowed } from "~/lib/play-log";
import type { Layout, Playable } from "~/games/layout";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The markup the grid player builds its board in (the description, top left, is filled in after). */
function markup(l: Layout) {
  // the colors go under the board, like the digit pad: the colors on the left, clearing on the right
  const pots = l.palette.length
    ? `<div class="paper-bar pad colors" role="group" aria-label="Color"><div class="group pots">${l.palette.map((c, i) =>
        `<button class="pot" data-color="${i + 1}" type="button" aria-pressed="${i === 0}" aria-label="Color ${i + 1}" style="--c: ${esc(c)}"><i></i></button>`).join("")
      }</div><div class="group"><button class="pot erase" data-color="0" type="button" aria-pressed="false" aria-label="Clear color" title="Clear color"><i></i></button></div></div>`
    : "";
  // numbers past 9 (a number path) are typed a digit at a time: 1 then 2 is 12
  const keys = l.digits > 9
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((k) => `<button class="word num" data-key="${k}" type="button">${k}</button>`).join("")
    : Array.from({ length: l.digits }, (_, i) => `<button class="word num" data-digit="${i + 1}" type="button">${esc(l.symbols?.[i] ?? String(i + 1))}</button>`).join("");
  const pad = l.digits
    ? `<div class="paper-bar pad" role="group" aria-label="Digits"><div class="group">${keys}</div>
       <div class="group"><button class="word" data-pencil type="button" aria-pressed="false" title="Pencil notes (P)">pencil</button>
       <button class="word" data-auto type="button" aria-pressed="false" title="Auto-notes: every square's possible digits, kept up (A)">auto</button>
       <button class="word" data-digit="0" type="button" title="Erase (Backspace)">erase</button></div></div>`
    : "";
  const sign = l.title
    ? `<button class="sign" data-sign type="button" aria-label="Show what the picture is"><span class="q">?</span><span class="title">It&rsquo;s ${/^[aeiou]/i.test(l.title) ? "an" : "a"} ${esc(l.title)}!</span></button>`
    : "";
  const below = l.digits || l.palette.length ? ' style="--below: 46px"' : "";
  return `<div class="grid-game"${l.ink ? ` style="--paper-ink: ${esc(l.ink)}"` : ""}>
    <div class="sheet"${below}>
      <div class="paper-bar"><p class="paper-desc"></p><div class="status" aria-live="polite"></div>
        <div class="group">${l.hearts ? '<div class="hearts" data-hearts role="img"></div>' : ""}${tool("rules", "How to play", "rules")}${tool("undo", "Undo", "undo")}${l.hints ? tool("hint", "Hint", "hint") : ""}${tool("reset", "Reset", "reset")}</div></div>
      <p class="paper-tip" hidden><span></span> <button class="tip-open" type="button">How to play</button><button class="tip-close" type="button" aria-label="Dismiss">×</button></p>
      <svg class="board" role="img" aria-label="Puzzle grid"></svg>${pad}${pots}${sign}
    </div></div>`;
}

/** Line the paper's rows up with the puzzle's border: its left and right edges, as shares of the
 *  board's width (--edge-l, --edge-r; styles.css). */
function alignToBorder(root: HTMLElement) {
  const svg = root.querySelector<SVGSVGElement>(".sheet > svg.board"), frame = svg?.querySelector(".frame");
  const s = svg?.getBoundingClientRect(), f = frame?.getBoundingClientRect();
  if (!s?.width || !f?.width) return;
  root.style.setProperty("--edge-l", ((f.left - s.left) / s.width).toFixed(4));
  root.style.setProperty("--edge-r", ((s.right - f.right) / s.width).toFixed(4));
  // the paper's width, for what sits under it (the list bar: GamePageView)
  const sheet = root.querySelector(".sheet");
  if (sheet) root.parentElement?.parentElement?.style.setProperty("--sheet-w", `${Math.round(sheet.getBoundingClientRect().width)}px`);
}

/** `saveId` keeps the player's progress in this browser; without it (the editor's preview), nothing
 *  is saved. `description`: the creator's line about it, on the paper. `onRules`: the paper's ?
 *  (How to play), shown only when given. `tip`: a first-time note under it ("New to Akari?"),
 *  with its dismissal. */
export function GameBoard({ play, saveId, onSolved, description = "", onRules, tip, logGame }: {
  play: Playable; saveId?: string; onSolved?: (ms: number | null) => void; description?: string;
  onRules?: () => void; tip?: { text: string; onDismiss: () => void } | null;
  /** a published puzzle's id: its play is logged unless the player turned that off (lib/play-log.ts) */
  logGame?: string;
}) {
  const spot = useRef<HTMLDivElement>(null);
  const solved = useRef(onSolved);
  solved.current = onSolved;
  const rules = useRef(onRules);
  rules.current = onRules;
  const tipRef = useRef(tip);
  tipRef.current = tip;
  // the page's data is reloaded after any action on it (a like, the solve being saved), which hands
  // over an equal but new puzzle: rebuilding then would cut the solve's celebration short
  const key = JSON.stringify(play);
  const current = useRef(play);
  current.current = play;

  useEffect(() => {
    if (!spot.current) return;
    const holder = document.createElement("div");
    const play = current.current;
    holder.innerHTML = markup(play.layout);
    const root = holder.firstElementChild as HTMLElement;
    spot.current.appendChild(root);
    // playing time (components/solve-timer.ts): moves on the board, nothing while the tab is hidden
    let timer = saveId ? loadTimer(saveId) : startTimer();
    const move = () => { timer = tick(timer, Date.now()); if (saveId) saveTimer(saveId, timer); };
    // solve logging, unless the player turned it off (lib/play-log.ts); started at the first event
    let plays: ReturnType<typeof createPlayLog> | null = null;
    const log = logGame ? (kind: string, data?: unknown) => {
      if (!shareAllowed()) { plays = null; return; }
      plays ??= createPlayLog(logGame, sendBatch);
      plays.log(kind, data);
    } : undefined;
    const hide = () => {
      if (document.hidden) { timer = pause(timer); if (plays && shareAllowed()) { plays.log("a"); plays.flush(true); } }
      else if (plays && shareAllowed()) plays.log("b");
    };
    const every = logGame ? window.setInterval(() => { if (plays && shareAllowed()) plays.flush(); }, FLUSH_MS) : 0;
    // (keys go to the page: the board reads them there)
    root.addEventListener("pointerdown", move); addEventListener("keydown", move);
    document.addEventListener("visibilitychange", hide);
    const host = createHost(saveId ?? "", () => {
      const ms = timer.total > 0 ? Math.round(timer.total) : null;
      if (saveId) clearTimer(saveId);
      solved.current?.(ms);
    }, !saveId, log);
    const cleanup = createGrid({ spec: play.spec })(root, host);
    const ask = root.querySelector<HTMLButtonElement>("[data-rules]");
    if (ask) { ask.hidden = !rules.current; ask.addEventListener("click", () => rules.current?.()); }
    root.querySelector(".paper-tip .tip-open")?.addEventListener("click", () => rules.current?.());
    root.querySelector(".paper-tip .tip-close")?.addEventListener("click", () => tipRef.current?.onDismiss());
    const board = root.querySelector(".sheet > svg.board");
    const fit = new ResizeObserver(() => alignToBorder(root));
    if (board) fit.observe(board);
    return () => { if (every) clearInterval(every); plays?.flush(true); fit.disconnect(); removeEventListener("keydown", move); document.removeEventListener("visibilitychange", hide); cleanup?.(); root.remove(); };
  }, [key, saveId, logGame]);

  // the description changes without rebuilding the board (the publish page edits it as you play)
  useEffect(() => {
    const p = spot.current?.querySelector<HTMLElement>(".paper-desc");
    if (p) { p.textContent = description; p.title = description; }
  }, [description, key, saveId]);

  // the first-time note, shown or not without rebuilding the board
  useEffect(() => {
    const note = spot.current?.querySelector<HTMLElement>(".paper-tip");
    if (!note) return;
    note.hidden = !tip;
    const text = note.querySelector("span");
    if (text) text.textContent = tip?.text ?? "";
  }, [tip?.text, !!tip, key, saveId]);

  return <div ref={spot} className="game-spot" />;
}
