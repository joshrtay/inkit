// Runs in the creator's browser: how many solutions does a sketch's puzzle have (0, 1, or 2 for more)?
// The same proof the puzzle tools run (src/engine/solve.ts, puzzles/grid/new.ts), but with the
// browser build of clingo, in a Web Worker, so typing in the editor never freezes the page.
// (Solving is too heavy for a Worker request on Cloudflare's free plan.)
import { boardOf, program } from "~site/engine/encode.ts";
import { check, makePuzzle } from "~site/engine/puzzle.ts";
import type { Board, GridSpec } from "~site/engine/types.ts";

export type Count = { solutions: 0 | 1 | 2 } | { error: string };
export type Found = { solutions: 0 | 1 | 2; boards: Board[] } | { error: string };

export async function countSolutions(spec: GridSpec): Promise<Count> {
  const r = await findSolutions(spec);
  return "error" in r ? r : { solutions: r.solutions };
}

/** A run under way (clingo runs one at a time, in its worker). */
let running: Promise<unknown> | null = null;
let stale = false;

/** Up to two solutions, as boards: the first to show, and a second to find where they differ. A
 *  newer call stops a run that's still going (paint checks on every change; only the latest counts). */
export async function findSolutions(spec: GridSpec): Promise<Found> {
  const clingo = await import("clingo-wasm");
  if (running) {
    // stop the old run (its worker is replaced), so this one doesn't wait behind it
    stale = true;
    await clingo.restart().catch(() => undefined);
    await running.catch(() => undefined);
  }
  stale = false;
  const p = makePuzzle(spec);
  const run = clingo.run(program(p), 2, ["--project=show"]);
  running = run;
  let res;
  try { res = await run; } catch (e) { if (stale) return { error: "stopped" }; throw e; } finally { if (running === run) running = null; }
  if (stale) return { error: "stopped" };
  if (res.Result === "ERROR") return { error: `The solver failed: ${"Error" in res ? res.Error : "unknown error"}` };
  const answers = ("Call" in res ? res.Call?.[0]?.Witnesses ?? [] : []).map((w) => w.Value);
  const boards = answers.map((atoms) => boardOf(p, atoms));
  for (const b of boards) {
    const problems = check(p, b);
    if (problems.length) return { error: `The solver and the rules disagree (${problems[0].message}). This is a bug; please report it.` };
  }
  return { solutions: Math.min(answers.length, 2) as 0 | 1 | 2, boards };
}

/** Stop the run under way, if any (its caller gets "stopped"): "What type is this?"'s Cancel. */
export async function stopSolving() {
  if (!running) return;
  stale = true;
  const clingo = await import("clingo-wasm");
  await clingo.restart().catch(() => undefined);
}
