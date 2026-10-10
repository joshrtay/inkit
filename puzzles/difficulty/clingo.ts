// clingo in this process, called synchronously: the deduction solver makes hundreds of small
// calls per puzzle, and clingo-wasm's worker (src/engine/solve.ts) costs a round trip each. The
// emscripten module is loaded once; each call is a fresh clingo run on the given program text
// (ASP or aspif, the ground format clingo reads and writes).
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

interface Module { ccall(name: string, ret: string, types: string[], args: unknown[]): number }

let mod: Module | null = null;
export const MAX_PROGRAM = 1_200_000;
let out: string[] = [], err: string[] = [];

/** Load clingo (once). */
export async function loadClingo(): Promise<void> {
  if (mod) return;
  const pkg = createRequire(import.meta.url).resolve("clingo-wasm/package.json");
  const { default: factory } = await import(pathToFileURL(join(dirname(pkg), "dist/clingo.js")).href);
  mod = await factory({ print: (l: string) => out.push(l), printErr: (l: string) => err.push(l) });
}

/** Run clingo on `program` with command-line `args`; its standard output, as lines. */
export function clingoRaw(program: string, args: string): { status: number; lines: string[]; errors: string[] } {
  if (!mod) throw new Error("call loadClingo() first");
  // the program goes on clingo-wasm's stack (about 2 MB); past that it crashes for good
  if (program.length > MAX_PROGRAM) throw new Error(`program too big for clingo-wasm (${Math.round(program.length / 1000)} kB)`);
  out = []; err = [];
  const status = mod.ccall("run", "number", ["string", "string"], [program, args]);
  return { status, lines: out, errors: err };
}

export interface ClingoJson {
  Result: "SATISFIABLE" | "UNSATISFIABLE" | "UNKNOWN" | "OPTIMUM FOUND";
  Call?: { Witnesses?: { Value: string[] }[] }[];
  Stats?: { Core?: { Choices?: number; Conflicts?: number } };
}

/** Run clingo and read its JSON answer (`models` 0 = all, or every refinement in cautious mode). */
export function clingoJson(program: string, models: number, options: string[] = []): ClingoJson {
  const { status, lines, errors } = clingoRaw(program, `--outf=2 ${options.join(" ")} ${models}`);
  if (status === 33 || status === 65 || status === 128) throw new Error(`clingo failed (${status}): ${errors.join("\n").slice(0, 500)}`);
  return JSON.parse(lines.join(""));
}

/** The ground program of an ASP program, in aspif. */
export function ground(program: string): string {
  const { status, lines, errors } = clingoRaw(program, "--output=intermediate");
  if (status === 33 || status === 65 || status === 128 || !lines.length) throw new Error(`clingo failed to ground (${status}): ${errors.join("\n").slice(0, 500)}`);
  return lines.join("\n");
}
