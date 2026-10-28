// The publish page's hint solve (puzzles/hints/solve.worker.ts): the deduction solver in a Web Worker
// in the creator's browser, which finds the puzzle's stuck points for its hint ladder, taking the
// creator's own moves where it can't go on by itself. (The solver is too heavy for a Worker request.)
import type { GridSpec } from "~site/engine/types.ts";
import type { KeyMark } from "~site/lib/hint-ladder";
import type { Stuck } from "~site/lib/hint-words";

export type HintSolve = { stuck: Stuck } | { error: string };

/** Solve for stuck points; `creator`: the creator's board marks in the order they made them, taken
 *  where the solver stalls; `onProgress` gets the share of the puzzle settled so far. A newer call
 *  (or `stop`) ends a run still going. */
let current: Worker | null = null;
export function stopHintSolve() { current?.terminate(); current = null; }
export function hintSolve(spec: GridSpec, { creator = [] as KeyMark[], budgetMs = 90_000, onProgress = (_: number) => {} } = {}): Promise<HintSolve> {
  stopHintSolve();
  const worker = new Worker(new URL("../../../puzzles/hints/solve.worker.ts", import.meta.url), { type: "module" });
  current = worker;
  return new Promise((resolve) => {
    const end = (r: HintSolve) => { worker.terminate(); if (current === worker) current = null; resolve(r); };
    worker.onmessage = (e: MessageEvent<{ kind: string; share?: number; stuck?: Stuck; message?: string }>) => {
      if (e.data.kind === "progress") onProgress(e.data.share ?? 0);
      else if (e.data.kind === "done") end({ stuck: e.data.stuck! });
      else end({ error: e.data.message ?? "the solver failed" });
    };
    worker.onerror = (e) => end({ error: e.message || "the solver failed to start" });
    worker.postMessage({ spec, creator, budgetMs });
  });
}
