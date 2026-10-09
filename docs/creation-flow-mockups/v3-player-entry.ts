// The real grid player (src/game-types/grid/game.ts), bundled for the v3 publish mockups so the
// board in them plays exactly as on the site. The paper's markup is GameBoard.tsx's (copied: it
// isn't exported); the host is the publish page's: it saves nothing and records no solve.
// Build from the repo root:
//   npx esbuild docs/creation-flow-mockups/v3-player-entry.ts --bundle --format=iife --minify --outfile=docs/creation-flow-mockups/v3-player.js
import { createGrid } from "../../src/game-types/grid/game.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { tool } from "../../app/app/components/icons.ts";
import type { Layout } from "../../app/app/games/layout.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** GameBoard.tsx's markup, for a digit puzzle (no pots, no picture sign). */
function markup(l: Layout) {
  const keys = Array.from({ length: l.digits }, (_, i) => `<button class="word num" data-digit="${i + 1}" type="button">${esc(l.symbols?.[i] ?? String(i + 1))}</button>`).join("");
  const pad = l.digits
    ? `<div class="paper-bar pad" role="group" aria-label="Digits"><div class="group">${keys}</div>
       <div class="group"><button class="word" data-pencil type="button" aria-pressed="false" title="Pencil notes (P)">pencil</button>
       <button class="word" data-digit="0" type="button" title="Erase (Backspace)">erase</button></div></div>`
    : "";
  return `<div class="grid-game"${l.ink ? ` style="--paper-ink: ${esc(l.ink)}"` : ""}>
    <div class="sheet"${l.digits ? ' style="--below: 46px"' : ""}>
      <div class="paper-bar"><div class="group"></div><div class="status" aria-live="polite"></div>
        <div class="group">${tool("undo", "Undo", "undo")}${tool("reset", "Reset", "reset")}</div></div>
      <svg class="board" role="img" aria-label="Puzzle grid"></svg>${pad}
    </div></div>`;
}

(window as unknown as { MKPlay: unknown }).MKPlay = (spot: HTMLElement, play: { spec: GridSpec; layout: Layout }, progress: unknown, onSolved: () => void) => {
  spot.innerHTML = markup(play.layout);
  const root = spot.firstElementChild as HTMLElement;
  // the publish page's host: a test-play, nothing saved, no solve recorded (only the page told)
  createGrid({ spec: play.spec })(root, { id: "draft", load: <T>() => progress as T, save() {}, clear() {}, solved: onSolved });
};
