// Plays a game in the page with the shared grid game (../src/game-types/grid). The game
// builds its board inside a container of plain HTML (its paper, controls and SVG), exactly as
// on the current site, so the engine is reused as-is. React only provides the spot; the game
// owns everything inside it.
import { useEffect, useRef } from "react";
import { createGrid } from "~site/game-types/grid/game";
import "~site/game-types/grid/styles.css";
import { tool } from "./icons";
import { createHost } from "~/lib/host";
import type { Layout, Playable } from "~/games/layout";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The same markup as the current site's grid Game.astro. */
function markup(l: Layout) {
  const pots = l.palette.length
    ? `<div class="pots" role="group" aria-label="Glass color">${l.palette.map((c, i) =>
        `<button class="pot" data-color="${i + 1}" type="button" aria-pressed="${i === 0}" aria-label="Color ${i + 1}" style="--c: ${esc(c)}"><i></i></button>`).join("")
      }<button class="pot erase" data-color="0" type="button" aria-pressed="false" aria-label="Clear color" title="Clear color"><i></i></button></div>`
    : "";
  const pad = l.digits
    ? `<div class="paper-bar pad" role="group" aria-label="Digits"><div class="group">${Array.from({ length: l.digits }, (_, i) =>
        `<button class="word num" data-digit="${i + 1}" type="button">${i + 1}</button>`).join("")}</div>
       <div class="group"><button class="word" data-pencil type="button" aria-pressed="false" title="Pencil notes (P)">pencil</button>
       <button class="word" data-digit="0" type="button" title="Erase (Backspace)">erase</button></div></div>`
    : "";
  const sign = l.title
    ? `<button class="sign" data-sign type="button" aria-label="Show what the picture is"><span class="q">?</span><span class="title">It&rsquo;s ${/^[aeiou]/i.test(l.title) ? "an" : "a"} ${esc(l.title)}!</span></button>`
    : "";
  const prefs = l.nonogram
    ? `<div class="prefs"><label><input type="checkbox" data-pref="autoTick" /> Tick off clues when a line is finished</label>
       <label><input type="checkbox" data-pref="autoX" /> X out the rest of a line once all its clues are ticked</label></div>`
    : "";
  return `<div class="grid-game"${l.ink ? ` style="--paper-ink: ${esc(l.ink)}"` : ""}>
    <div class="sheet"${l.digits ? ' style="--below: 46px"' : ""}>
      <div class="paper-bar"><div class="group">${pots}</div><div class="status" aria-live="polite"></div>
        <div class="group">${tool("undo", "Undo", "undo")}${l.hints ? tool("hint", "Hint", "hint") : ""}${tool("check", "Check", "check")}${tool("reset", "Reset", "reset")}</div></div>
      <svg class="board" role="img" aria-label="Puzzle grid"></svg>${pad}${sign}
    </div>${prefs}</div>`;
}

/** `saveId` keeps the player's progress in this browser; without it (the editor's preview), nothing is saved. */
export function GameBoard({ play, saveId, onSolved }: { play: Playable; saveId?: string; onSolved?: () => void }) {
  const spot = useRef<HTMLDivElement>(null);
  const solved = useRef(onSolved);
  solved.current = onSolved;

  useEffect(() => {
    if (!spot.current) return;
    const holder = document.createElement("div");
    holder.innerHTML = markup(play.layout);
    const root = holder.firstElementChild as HTMLElement;
    spot.current.appendChild(root);
    const host = createHost(saveId ?? "", () => solved.current?.(), !saveId);
    const cleanup = createGrid({ spec: play.spec })(root, host);
    return () => { cleanup?.(); root.remove(); };
  }, [play, saveId]);

  return <div ref={spot} className="game-spot" />;
}
