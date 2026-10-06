// Build-time solver: asks clingo (clingo-wasm) for a puzzle's solutions, using the program from
// ./encode.ts. Every solution it finds is re-checked with the same TypeScript rules the browser
// uses, so an encoding that disagrees with its check is caught here. Used to prove a puzzle has
// exactly one solution.
import { check } from "./puzzle.ts";
import { boardOf, program } from "./encode.ts";
import type { Board, Puzzle } from "./types.ts";
export { boardOf, maxRegion, program } from "./encode.ts";

interface ClingoResult { Result: string; Call?: { Witnesses?: { Value: string[] }[] }[]; Error?: string }

/** Up to `limit` solutions (different answers: helper atoms that aren't shown don't count). Throws if clingo finds one that the rule checks reject.
 *  Answers are cached on disk (node_modules/.cache/grid-engine), keyed by the program, so the
 *  preview server and repeat builds don't re-prove unchanged puzzles. */
export async function solve(p: Puzzle, limit = 2): Promise<Board[]> {
  const prog = program(p);
  const { createHash } = await import("node:crypto");
  const fs = await import("node:fs");
  const dir = "node_modules/.cache/grid-engine";
  const file = `${dir}/${createHash("sha256").update(`${limit}\n${prog}`).digest("hex").slice(0, 24)}.json`;
  let answers: string[][] | undefined;
  try { answers = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* not cached */ }
  if (!answers) {
    const clingo = await import("clingo-wasm");
    const res = (await clingo.run(prog, limit, ["--project=show"])) as ClingoResult;
    if (res.Result === "ERROR") throw new Error(`clingo: ${res.Error}`);
    answers = (res.Call?.[0]?.Witnesses ?? []).map((w) => w.Value);
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(answers)); } catch { /* read-only: fine */ }
  }
  const boards = answers.map((atoms) => boardOf(p, atoms));
  for (const b of boards) {
    const problems = check(p, b);
    if (problems.length) throw new Error(`solver and checks disagree: ${problems.map((x) => x.message).join("; ")}`);
  }
  return boards;
}
