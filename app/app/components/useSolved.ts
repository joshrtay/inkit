// Paint's live check: the solver (clingo in the browser, count-solutions.client.ts) on the
// converted drawing, 400 ms after the last change, a newer run stopping an older one. The result
// carries the puzzle it's for (`key`), so a stale one is never shown (sketchpad/check.ts's
// verdictOf reads it).
import { useEffect, useState } from "react";
import type { GridSpec } from "~site/engine/types.ts";
import type { Solved } from "~/sketchpad/check";

/** `spec`: the puzzle to check, or null for nothing to check (no type, no grid, rules already broken). */
export function useSolved(spec: GridSpec | null, key: string): Solved | null {
  const [solved, setSolved] = useState<Solved | null>(null);
  useEffect(() => {
    if (!spec) return;
    let live = true;
    const t = setTimeout(async () => {
      const { findSolutions } = await import("~/games/count-solutions.client");
      const r = await findSolutions(spec).catch((e: Error) => ({ error: e.message }));
      if (!live || ("error" in r && r.error === "stopped")) return;
      setSolved("error" in r ? { key, error: r.error } : { key, solutions: r.solutions, boards: r.boards });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [key, !!spec]); // eslint-disable-line react-hooks/exhaustive-deps
  return solved;
}
