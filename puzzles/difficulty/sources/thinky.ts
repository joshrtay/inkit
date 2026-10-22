// Thinky Dailies (a private scrape Josh made; gs://inkit-research-ml/private/refs/thinky-dailies/,
// never in the repo) as our engine's specs: each grid's Penpa+ link (its `source`), read by the
// site's own importer (app/app/lib/import-link.ts) as the genre Thinky names, then solved (clingo,
// capped) to check it has exactly one solution. Thinky ships no grid solutions, so the solve is
// what lets a model's moves be checked. Kept with each: the author's difficulty (1-5) and the
// number of hints in its ladder. Visual riddles and other non-grid puzzles are counted, not read.
//
//   node --no-warnings --experimental-transform-types --import ./puzzles/difficulty/sources/app-alias.ts \
//     puzzles/difficulty/sources/thinky.ts [--in <thinky-dailies.json>] [--out <dir>] [--check] [--cap-s 60]
//
// Writes <out>/converted.jsonl (slug, Thinky genre, difficulty, hints, spec, unique) and summary.json.
// Default --in and --out: references/thinky-dailies/.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REFERENCES } from "./common.ts";

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === "--child") {
  const { makePuzzle } = await import("../../../src/engine/puzzle.ts");
  const { solve } = await import("../../../src/engine/solve.ts");
  const boards = await solve(makePuzzle(JSON.parse(readFileSync(0, "utf8"))), 2);
  process.stdout.write(boards.length === 0 ? "none" : boards.length > 1 ? "several" : "unique");
  process.exit(0);
}

const importLink = "../../../app/app/lib/import-link.ts";
const { readLink } = (await import(importLink)) as {
  readLink: (link: string, chosen?: string) => Promise<{ kind: string; genreName?: string; genres?: string[]; spec: { genre: string; size: [number, number] } }>;
};
const { mapPool } = await import("../pool.ts");

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const input = arg("--in") ?? `${REFERENCES}thinky-dailies/thinky-dailies.json`;
const outDir = arg("--out") ?? `${REFERENCES}thinky-dailies/`;
const check = process.argv.includes("--check");
const capMs = Number(arg("--cap-s") ?? 60) * 1000;

/** Thinky's genre names for our types (variants such as "Square Jam (Fissures)" aren't ours) */
const GENRES: Record<string, string> = {
  Nurikabe: "nurikabe", Akari: "akari", Shikaku: "shikaku", "Star Battle": "star-battle", "Irregular Sudoku": "irregular-sudoku",
  Nonogram: "nonogram", "Square Jam": "square-jam", Cave: "cave", "Wittgenstein Briquet": "wittgenstein-briquet",
  "Thermo Sudoku": "thermo-sudoku", Aquarium: "aquarium", Masyu: "masyu", "Spiral Galaxies": "spiral-galaxies",
  "Easy as ABC": "easy-as-abc", Hitori: "hitori", Minesweeper: "minesweeper", Slitherlink: "slitherlink", Skyscrapers: "skyscrapers",
};

const data = JSON.parse(readFileSync(input, "utf8")) as { puzzles: any[] };
const tally: Record<string, Record<string, number>> = {};
const bump = (g: string, what: string) => { (tally[g] ??= {})[what] = (tally[g][what] ?? 0) + 1; };
const out: { slug: string; title: string; thinkyGenre: string; difficulty: number; hints: number; spec: any; unique?: string }[] = [];

for (const p of data.puzzles) {
  const g = String(p.genre ?? "none");
  const genre = GENRES[g];
  if (!genre) { bump(g, p.source ? "not our type" : "no grid"); continue; }
  if (!String(p.source ?? "").includes("penpa")) { bump(g, "no Penpa link"); continue; }
  let r;
  try { r = await readLink(p.source, genre); } catch (e) { bump(g, `error: ${(e as Error).message.slice(0, 60)}`); continue; }
  if (r?.kind !== "puzzle") { bump(g, `not read (${r?.kind ?? "null"})`); continue; }
  bump(g, "converted");
  out.push({ slug: p.slug, title: p.title, thinkyGenre: g, difficulty: Number(p.difficulty), hints: (p.hints ?? []).length, spec: r.spec });
}

if (check) {
  const one = (spec: unknown): Promise<string> => new Promise((resolve) => {
    const c = spawn(process.execPath, ["--no-warnings", self, "--child"], { stdio: ["pipe", "pipe", "pipe"] });
    let o = "", err = "";
    const timer = setTimeout(() => { c.kill("SIGKILL"); resolve("timeout"); }, capMs);
    c.stdout.on("data", (d) => { o += d; });
    c.stderr.on("data", (d) => { err += d; });
    c.on("close", () => { clearTimeout(timer); resolve(o || `error: ${err.trim().split("\n").pop() ?? "?"}`); });
    c.stdin.end(JSON.stringify(spec));
  });
  await mapPool(out, async (c) => { c.unique = await one(c.spec); bump(c.thinkyGenre, `solve: ${c.unique}`); });
}

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}converted.jsonl`, out.map((c) => JSON.stringify(c)).join("\n") + "\n");
const total = (what: string) => Object.values(tally).reduce((a, t) => a + (t[what] ?? 0), 0);
const summary = { puzzles: data.puzzles.length, converted: out.length, unique: total("solve: unique"), byGenre: tally };
writeFileSync(`${outDir}summary.json`, JSON.stringify(summary, null, 1) + "\n");
console.log(JSON.stringify(summary, null, 1));
