// The tutor's read of the player's board (puzzles/hints/tutor.ts) in a Web Worker: what's wrong on
// it and the moves open from it, which the tutor's model words (routes/game-tutor.ts).
import type { GridSpec } from "~site/engine/types.ts";
import type { BoardLike } from "~site/lib/hint-ladder";
import type { BoardRead } from "~site/lib/tutor";

/** Read a board; a newer call ends one still going. */
let current: Worker | null = null;
export function readBoardInWorker(spec: GridSpec, board: BoardLike, budgetMs = 30_000): Promise<BoardRead> {
  current?.terminate();
  const worker = new Worker(new URL("../../../puzzles/hints/tutor.worker.ts", import.meta.url), { type: "module" });
  current = worker;
  return new Promise((resolve, reject) => {
    const end = () => { worker.terminate(); if (current === worker) current = null; };
    worker.onmessage = (e: MessageEvent<{ kind: string; read?: BoardRead; message?: string }>) => {
      end();
      if (e.data.kind === "done") resolve(e.data.read!); else reject(new Error(e.data.message ?? "the solver failed"));
    };
    worker.onerror = (e) => { end(); reject(new Error(e.message || "the solver failed to start")); };
    // (just the board's layers: anything else on it may not copy to the worker)
    const layers = Object.fromEntries((["shade", "fence", "loop", "cut", "color", "digit"] as const).flatMap((k) => (board[k] ? [[k, Array.from(board[k]!)]] : [])));
    worker.postMessage({ spec, board: layers, budgetMs });
  });
}
