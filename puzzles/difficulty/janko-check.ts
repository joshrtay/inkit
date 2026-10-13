// Are Janko's puzzles read right (janko.ts)? For each type: how many files convert, how many of
// those the engine finds exactly one solution for, and how many of those equal Janko's solution;
// and how well the recorded moves are read (the share of touched marks whose last value is the
// solution's). Each solve runs in its own process, killed at the cap (big boards can take clingo
// a long time), DEDUCE_JOBS at a time. Results in references/janko/check-<type>.json (local only).
//
//   node puzzles/difficulty/janko-check.ts [type …] [--max-cells N] [--cap-s 120] [--rules-only]
import { spawn } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { check, makePuzzle } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import { boardOfTruth, JANKO_DIR, JANKO_TYPES, matches, READERS } from "./janko.ts";
import { mapPool } from "./pool.ts";

const self = fileURLToPath(import.meta.url);
type Verdict = "unique+match" | "unique+differs" | "none" | "several" | "timeout" | `error: ${string}`;

/** In a child: read one puzzle file, solve it, print the verdict. */
async function child(type: string, file: string) {
  const j = READERS[type](file)!;
  const p = makePuzzle(j.spec), boards = await solve(p, 2);
  const v: Verdict = boards.length === 0 ? "none" : boards.length > 1 ? "several" : matches(j, p.grid, boards[0]) ? "unique+match" : "unique+differs";
  process.stdout.write(v);
}

function checkOne(type: string, file: string, capMs: number): Promise<Verdict> {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [self, "--child", type, file], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { c.kill("SIGKILL"); resolve("timeout"); }, capMs);
    c.stdout.on("data", (d) => { out += d; });
    c.stderr.on("data", (d) => { err += d; });
    c.on("close", () => { clearTimeout(timer); resolve((out || `error: ${err.trim().split("\n").pop() ?? "?"}`) as Verdict); });
  });
}

if (process.argv[2] === "--child") await child(process.argv[3], process.argv[4]);
else {
  const args = process.argv.slice(2);
  const opt = (name: string, d: number) => { const k = args.indexOf(name); return k >= 0 ? Number(args[k + 1]) : d; };
  const maxCells = opt("--max-cells", Infinity), capMs = opt("--cap-s", 120) * 1000;
  const skip = new Set(["--max-cells", "--cap-s"].flatMap((o) => { const k = args.indexOf(o); return k >= 0 ? [k, k + 1] : []; }));
  const types = args.filter((a, i) => !skip.has(i) && !a.startsWith("--"));
  for (const type of types.length ? types : Object.keys(JANKO_TYPES)) {
    const dir = `${JANKO_DIR}${JANKO_TYPES[type].folder}/`;
    const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
    const read = files.flatMap((f) => { const j = READERS[type](dir + f); return j && j.spec.size[0] * j.spec.size[1] <= maxCells ? [{ f, j }] : []; });
    // Janko's solution against our rules (quick, so on every board: a check of the reading where
    // proving uniqueness takes clingo too long)
    const valid = read.filter(({ j }) => { const p = makePuzzle(j.spec); return check(p, boardOfTruth(j, p.grid)).length === 0; }).length;
    const t0 = Date.now();
    let done = 0;
    const verdicts = args.includes("--rules-only") ? [] : await mapPool(read, async ({ f }) => {
      const v = await checkOne(type, dir + f, capMs);
      if (++done % 50 === 0) console.error(`${type} ${done}/${read.length}`);
      return { f, v };
    });
    const count = (pred: (v: Verdict) => boolean) => verdicts.filter((x) => pred(x.v)).length;
    const unique = count((v) => v.startsWith("unique")), match = count((v) => v === "unique+match");
    const withMoves = read.filter(({ j }) => j.moves > 0);
    const agree = withMoves.reduce((a, { j }) => a + j.agree, 0) / (withMoves.length || 1);
    console.log(`${type}: ${files.length} files, ${read.length} convert${maxCells < Infinity ? ` (up to ${maxCells} cells)` : ""}, ${unique} unique, ${match} match Janko's solution; Janko's solution passes our rules on ${valid}` +
      ` (none ${count((v) => v === "none")}, several ${count((v) => v === "several")}, timed out ${count((v) => v === "timeout")}, errors ${count((v) => v.startsWith("error"))});` +
      ` ${withMoves.length} with moves read, last values agree ${(100 * agree).toFixed(1)}% (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    if (!args.includes("--rules-only")) writeFileSync(`${JANKO_DIR}check-${type}.json`, JSON.stringify({ files: files.length, convert: read.length, valid, unique, match, agree, bad: verdicts.filter((x) => x.v !== "unique+match") }, null, 1));
  }
}
