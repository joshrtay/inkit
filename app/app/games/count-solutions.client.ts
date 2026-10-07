// Runs in the creator's browser: does a sketch's puzzle have exactly one solution?
// The same proof the puzzle tools run (src/engine/solve.ts, puzzles/grid/new.ts), but with the
// browser build of clingo, in a Web Worker, so typing in the editor never freezes the page.
// (Solving is too heavy for a Worker request on Cloudflare's free plan.)
import { boardOf, program } from "~site/engine/encode.ts";
import { check, makePuzzle } from "~site/engine/puzzle.ts";
import type { GridSpec } from "~site/engine/types.ts";

export type Count = { solutions: 0 | 1 | 2 } | { error: string };

export async function countSolutions(spec: GridSpec): Promise<Count> {
  const clingo = await import("clingo-wasm");
  const p = makePuzzle(spec);
  const res = await clingo.run(program(p), 2, ["--project=show"]);
  if (res.Result === "ERROR") return { error: `The solver failed: ${"Error" in res ? res.Error : "unknown error"}` };
  const answers = ("Call" in res ? res.Call?.[0]?.Witnesses ?? [] : []).map((w) => w.Value);
  for (const atoms of answers) {
    const problems = check(p, boardOf(p, atoms));
    if (problems.length) return { error: `The solver and the rules disagree (${problems[0].message}). This is a bug; please report it.` };
  }
  return { solutions: Math.min(answers.length, 2) as 0 | 1 | 2 };
}
