// Training data for a fast move-predicting network (references/ml/policy.py): generated puzzles,
// each solved by the deduction solver; a record per puzzle holds its clues, what's known before
// the first step, and each round's settled facts (the cheapest moves available then) with the
// round's tier. A state is "known before round r"; its label is round r's facts.
//
//   node puzzles/difficulty/policy-data.ts <genre> <size> <count> [firstSeed] [stars]
//     → references/ml/data-<genre>-<size>[-<stars>star].jsonl (local only)
//   node puzzles/difficulty/policy-data.ts --rated <genre>
//     Puzzle Square JP's puzzles of that type instead (references/psjp, local only), as a test set
//     → references/ml/test-<genre>.jsonl
//   node puzzles/difficulty/policy-data.ts --openml <minRating> <count>
//     hard 9 × 9 Sudokus from OpenML's 3 million rated ones (CC0; references/datasets, local)
//     → references/ml/data-sudoku-9-openml.jsonl
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generate } from "../grid/generate.ts";
import { deduce } from "./deduce.ts";
import { mapPool } from "./pool.ts";

const self = fileURLToPath(import.meta.url);
/** A puzzle string ("1..5.37..6.3…", 81 characters) as our Sudoku. */
const sudokuSpec = (s: string) => ({ genre: "sudoku", size: [9, 9] as [number, number], givens: [...s].flatMap((ch, i) => (ch >= "1" && ch <= "9" ? [{ at: "cell" as const, cell: [Math.floor(i / 9), i % 9] as [number, number], kind: "number" as const, value: Number(ch) }] : [])) });

async function job(genre: string, size: number, seed: number, file?: string, stars?: number) {
  const spec = file?.startsWith("sudoku:") ? sudokuSpec(file.slice(7)) : file ? { ...JSON.parse(readFileSync(file, "utf8")).grid, genre } : await generate({ genre, rows: size, cols: size, seed, ...(stars ? { stars } : {}) });
  if (!spec) return null;
  const { path, profile, initial } = await deduce(spec, { budgetMs: 30000 });
  if (!profile.solved) return null;
  const rounds = new Map<number, { tier: number; facts: string[] }>();
  for (const s of path) {
    if (s.choice) continue;
    const r = rounds.get(s.round ?? 0) ?? { tier: s.tier, facts: [] };
    r.tier = Math.max(r.tier, s.tier);
    for (const f of s.facts) r.facts.push(`${f.mark}=${f.value}`);
    rounds.set(s.round ?? 0, r);
  }
  return { genre, size, seed, spec, estimate: profile.estimate, initial, rounds: [...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r) };
}

if (process.argv[2] === "--job") {
  const [genre, size, seed] = [process.argv[3], Number(process.argv[4]), Number(process.argv[5])];
  process.stdout.on("error", () => process.exit(0));
  job(genre, size, seed, process.argv[6] || undefined, Number(process.argv[7]) || undefined).then((r) => process.stdout.write(JSON.stringify(r)), () => process.stdout.write("null"));
} else {
  const rated = process.argv[2] === "--rated", openml = process.argv[2] === "--openml";
  const [genre, sizeArg, countArg, firstArg, starsArg] = openml ? ["sudoku", "9", process.argv[4], "1", ""] : process.argv.slice(rated ? 3 : 2);
  const stars = Number(starsArg) || 0;
  const repo = new URL("../../", import.meta.url).pathname;
  // OpenML: the puzzles rated at least minRating, a spread sample of `count`
  const openmlPuzzles: string[] = [];
  if (openml) {
    const min = Number(process.argv[3]);
    const rows = readFileSync(`${repo}references/datasets/openml-sudoku/sudoku-3m.arff`, "utf8").split("\n").filter((l) => /^\d+,/.test(l)).map((l) => l.split(",")).filter((x) => Number(x[4]) >= min);
    const step = Math.max(1, Math.floor(rows.length / Number(process.argv[4])));
    for (let i = 0; i < rows.length && openmlPuzzles.length < Number(process.argv[4]); i += step) openmlPuzzles.push(`sudoku:${rows[i][1]}`);
    console.error(`${rows.length} rated ${min} or more; taking ${openmlPuzzles.length}`);
  }
  const ratedFiles = openml ? openmlPuzzles : rated ? readdirSync(`${repo}references/psjp/${genre}`).filter((f) => /^\d+\.json$/.test(f)).map((f) => `${repo}references/psjp/${genre}/${f}`) : [];
  const size = Number(sizeArg) || 0, count = rated || openml ? ratedFiles.length : Number(countArg), first = rated || openml ? 0 : Number(firstArg) || 1;
  mkdirSync(`${repo}references/ml`, { recursive: true });
  const file = openml ? `${repo}references/ml/data-sudoku-9-openml.jsonl` : rated ? `${repo}references/ml/test-${genre}.jsonl` : `${repo}references/ml/data-${genre}-${size}${stars > 1 ? `-${stars}star` : ""}.jsonl`;
  if (first <= 1) writeFileSync(file, "");
  const live = new Set<ReturnType<typeof spawn>>();
  process.on("exit", () => { for (const c of live) c.kill("SIGKILL"); });
  let done = 0, kept = 0;
  await mapPool(Array.from({ length: count }, (_, i) => first + i), (seed) => new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [self, "--job", genre, String(size), String(seed), rated || openml ? ratedFiles[seed] : "", String(stars)], { stdio: ["ignore", "pipe", "ignore"] });
    live.add(child);
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 180000);
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", () => {
      live.delete(child); clearTimeout(timer); done++;
      if (out && out !== "null") { appendFileSync(file, out + "\n"); kept++; }
      if (done % 50 === 0 || done === count) console.error(`${done}/${count} (${kept} kept)`);
      resolve();
    });
  }));
  console.log(`${kept} puzzles in ${file}`);
}
