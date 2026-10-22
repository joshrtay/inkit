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
  const { makePuzzle, check } = await import("../../../src/engine/puzzle.ts");
  const { solve } = await import("../../../src/engine/solve.ts");
  const { emptyBoard } = await import("../../../src/engine/types.ts");
  const { spec, answer, at } = JSON.parse(readFileSync(0, "utf8"));
  const p = makePuzzle(spec), g = p.grid;
  // Thinky's stored answer as our board ("cR,C" cells and "xR,C" corners, from the puzzle's top left `at`)
  const cell = (key: string) => { const [r, c] = key.slice(1).split(",").map(Number); return g.cell(r - at[0], c - at[1]); };
  const corner = (key: string) => { const [r, c] = key.slice(1).split(",").map(Number); return g.corner(r - at[0], c - at[1]); };
  const b = emptyBoard(g);
  const keys = (o: unknown) => Object.keys((o as object) ?? {});
  const lines = keys(answer.lines).map((k) => k.split(":")), edges = keys(answer.edges).map((k) => k.split(":"));
  if (p.marks.includes("shade")) {
    // dark fills (light green marks a cell left white); else symbols (stars, bulbs, mines), but not
    // the x and o marks; else briquets drawn as lines, the cells they join
    const dark = keys(answer.shadedCells).filter((k) => /^(darkgrey|grey|black)$/.test(answer.shadedCells[k].fill));
    const marked = keys(answer.symbols).filter((k) => [answer.symbols[k]].flat().some((x: any) => x?.shape && !/^(x|dot)$/.test(x.shape) && x.subtype !== "ox"));
    for (const k of dark.length ? dark : marked.length ? marked : lines.flat()) if (k.startsWith("c")) b.shade[cell(k)] = 1;
  }
  if (p.marks.includes("digit")) {
    for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") b.digit[i] = x.value;
    for (const k of keys(answer.text)) {
      const t = String(answer.text[k][0]?.text ?? ""), sym = p.style.symbols;
      b.digit[cell(k)] = sym ? sym.indexOf(t.toUpperCase()) + 1 : Number(t);
    }
  }
  if (p.marks.includes("loop")) for (const [x, y] of lines) { const e = g.borderBetween(cell(x), cell(y)); if (e >= 0) b.loop[g.borders[e].link] = 1; }
  const borderOf = (x: string, y: string) => g.cornerBorders[corner(x)]?.find((e) => g.borders[e].corners.includes(corner(y))) ?? -1;
  if (p.marks.includes("fence")) for (const [x, y] of edges) { const e = borderOf(x, y); if (e >= 0) b.fence[e] = 1; }
  if (p.marks.includes("regions")) {
    for (const [x, y] of edges) { const e = borderOf(x, y); if (e >= 0) b.cut[e] = 1; }
    // regions drawn as shading: a border wherever the shading changes
    if (!edges.length) {
      const fill = new Map(keys(answer.shadedCells).map((k) => [cell(k), answer.shadedCells[k].fill]));
      g.borders.forEach((e, k) => { const [a, c] = e.cells; if (a >= 0 && c >= 0 && fill.get(a) === fill.get(c) ? false : a >= 0 && c >= 0) b.cut[k] = 1; });
    }
  }
  const problems = check(p, b);
  const boards = await solve(p, 2);
  process.stdout.write(JSON.stringify({ unique: boards.length === 0 ? "none" : boards.length > 1 ? "several" : "unique", thinky: problems.length ? `breaks: ${problems[0].message}` : "solves" }));
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
  "Simple Path": "simple-path", Connectlink: "numberlink",
};
/** Thinky's genres that are one of ours with a rule of its own: Connectlink is Numberlink whose lines fill the grid */
const OWN_RULES: Record<string, object[]> = { Connectlink: [{ rule: "links", cover: true }] };

const data = JSON.parse(readFileSync(input, "utf8")) as { puzzles: any[] };
const tally: Record<string, Record<string, number>> = {};
const bump = (g: string, what: string) => { (tally[g] ??= {})[what] = (tally[g][what] ?? 0) + 1; };
const out: { slug: string; title: string; thinkyGenre: string; difficulty: number; hints: number; spec: any; answer: unknown; at: [number, number]; unique?: string; thinky?: string }[] = [];
/** Thinky's own record of the puzzle (puzzleData: clues, the cells in play, the answer) */
const own = (p: any) => (typeof p.puzzleData === "string" ? JSON.parse(p.puzzleData.replace(/'/g, '"').replace(/\bNone\b/g, "null").replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false")) : p.puzzleData);

for (const p of data.puzzles) {
  const g = String(p.genre ?? "none");
  const genre = GENRES[g];
  if (!genre) { bump(g, p.source ? "not our type" : "no grid"); continue; }
  if (!String(p.source ?? "").includes("penpa")) { bump(g, "no Penpa link"); continue; }
  let r;
  try { r = await readLink(p.source, genre); } catch (e) { bump(g, `error: ${(e as Error).message.slice(0, 60)}`); continue; }
  if (r?.kind !== "puzzle") { bump(g, `not read (${r?.kind ?? "null"})`); continue; }
  bump(g, "converted");
  if (OWN_RULES[g]) r.spec = { ...r.spec, rules: OWN_RULES[g] } as typeof r.spec;
  let data: any = null;
  try { data = own(p); } catch { /* unreadable: no answer to compare */ }
  const cells: { row: number; col: number }[] = data?.cellList ?? [];
  const at: [number, number] = cells.length ? [Math.min(...cells.map((c) => c.row)), Math.min(...cells.map((c) => c.col))] : [0, 0];
  out.push({ slug: p.slug, title: p.title, thinkyGenre: g, difficulty: Number(p.difficulty), hints: (p.hints ?? []).length, spec: r.spec, answer: data?.solution ?? {}, at });
}

if (check) {
  const one = (x: (typeof out)[number]): Promise<string> => new Promise((resolve) => {
    const c = spawn(process.execPath, ["--no-warnings", self, "--child"], { stdio: ["pipe", "pipe", "pipe"] });
    let o = "", err = "";
    const timer = setTimeout(() => { c.kill("SIGKILL"); resolve("timeout"); }, capMs);
    c.stdout.on("data", (d) => { o += d; });
    c.stderr.on("data", (d) => { err += d; });
    c.on("close", () => { clearTimeout(timer); resolve(o || JSON.stringify({ unique: `error: ${err.trim().split("\n").pop() ?? "?"}` })); });
    c.stdin.end(JSON.stringify({ spec: x.spec, answer: x.answer, at: x.at }));
  });
  await mapPool(out, async (c) => {
    const r = await one(c);
    const res = r === "timeout" ? { unique: "timeout" } : JSON.parse(r);
    c.unique = res.unique; c.thinky = res.thinky;
    bump(c.thinkyGenre, `solve: ${c.unique}`);
    if (c.thinky) bump(c.thinkyGenre, c.thinky === "solves" ? "Thinky's answer solves it" : "Thinky's answer doesn't");
  });
}

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}converted.jsonl`, out.map((c) => JSON.stringify(c)).join("\n") + "\n");
const total = (what: string) => Object.values(tally).reduce((a, t) => a + (t[what] ?? 0), 0);
const summary = { puzzles: data.puzzles.length, converted: out.length, unique: total("solve: unique"), thinkySolves: total("Thinky's answer solves it"), byGenre: tally };
writeFileSync(`${outDir}summary.json`, JSON.stringify(summary, null, 1) + "\n");
console.log(JSON.stringify(summary, null, 1));
