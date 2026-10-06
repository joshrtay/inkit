import { makePuzzle } from "~site/engine/puzzle.ts";
import { blockFor } from "~site/engine/rules.ts";
import type { GridSpec } from "~site/engine/types.ts";
import type { Layout } from "./layout";

export function layoutOf(spec: GridSpec): Layout {
  const p = makePuzzle(spec);
  return {
    palette: p.marks.includes("regions") ? (p.style.palette ?? []) : [],
    digits: p.marks.includes("digit") ? p.digits : 0,
    hints: p.rules.some((s) => !!blockFor(s).hint),
    title: p.spec.picture?.title,
    nonogram: p.rowRuns.size > 0,
    ink: p.style.ink,
  };
}
