// Does the engine find exactly one solution for a sample of a source's converted puzzles? A check
// that the conversion reads the puzzles right (a misread clue usually gives none or several).
//
//   node puzzles/difficulty/sources/unique.ts <converted dir> [--per 20] [--cap-s 60] [--max-cells 400] [--only a,b]
//
// Takes an evenly spaced sample of each genre's file (small boards only, as clingo can take long on
// big ones), solves each in its own process killed at the cap, DEDUCE_JOBS at a time. Writes
// <dir>/../unique.json.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makePuzzle, needsOneSolution } from "../../../src/engine/puzzle.ts";
import { solve } from "../../../src/engine/solve.ts";
import { mapPool } from "../pool.ts";

const self = fileURLToPath(import.meta.url);
type Verdict = "unique" | "none" | "several" | "timeout" | `error: ${string}`;

if (process.argv[2] === "--child") {
  const spec = JSON.parse(process.argv[3]);
  const boards = await solve(makePuzzle(spec), 2);
  process.stdout.write(boards.length === 0 ? "none" : boards.length > 1 ? "several" : "unique");
} else {
  const args = process.argv.slice(2);
  const opt = (name: string, d: number) => { const k = args.indexOf(name); return k >= 0 ? Number(args[k + 1]) : d; };
  const dir = args[0].replace(/\/$/, ""), per = opt("--per", 20), capMs = opt("--cap-s", 60) * 1000, maxCells = opt("--max-cells", 400);
  const one = (spec: unknown): Promise<Verdict> => new Promise((resolve) => {
    const c = spawn(process.execPath, [self, "--child", JSON.stringify(spec)], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { c.kill("SIGKILL"); resolve("timeout"); }, capMs);
    c.stdout.on("data", (d) => { out += d; });
    c.stderr.on("data", (d) => { err += d; });
    c.on("close", () => { clearTimeout(timer); resolve((out || `error: ${err.trim().split("\n").pop() ?? "?"}`) as Verdict); });
  });
  const k = args.indexOf("--only"), only = k >= 0 ? new Set(args[k + 1].split(",")) : null;
  const outFile = `${dirname(dir)}/unique.json`;
  // a run over some genres keeps the others' earlier results
  const result: Record<string, any> = only && existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort()) {
    const genre = f.replace(/\.jsonl$/, "");
    if (only && !only.has(genre)) continue;
    const all = readFileSync(`${dir}/${f}`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const small = all.filter((c) => c.spec.size[0] * c.spec.size[1] <= maxCells);
    const step = Math.max(1, Math.floor(small.length / per));
    const sample = small.filter((_, i) => i % step === 0).slice(0, per);
    const verdicts = await mapPool(sample, async (c: any) => ({ id: c.sourceId, v: await one(c.spec) }));
    const count: Record<string, number> = {};
    for (const { v } of verdicts) { const k = v.startsWith("error") ? "error" : v; count[k] = (count[k] ?? 0) + 1; }
    result[genre] = { converted: all.length, sampled: sample.length, oneSolutionRequired: needsOneSolution(genre), ...count,
      notUnique: verdicts.filter((x) => x.v !== "unique" && x.v !== "timeout").map((x) => `${x.id}: ${x.v}`).slice(0, 10) };
    console.log(genre.padEnd(18), JSON.stringify(result[genre]));
  }
  writeFileSync(outFile, JSON.stringify(result, null, 1));
}
