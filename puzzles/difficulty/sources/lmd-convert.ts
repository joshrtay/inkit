// Logic Masters puzzles in our types (references/lmd/puzzles.jsonl, from lmd.ts parse) as our
// engine's specs: each puzzle's puzz.link or Penpa+ link, read by the site's own importers
// (app/app/lib/import-link.ts), into references/lmd/specs/<genre>.jsonl; then each is solved
// (clingo, capped) to check it has exactly one solution. Links in the puzzle's own text come
// first; a commenter's link (often a Penpa+ transcription) is used only when it reads as the same
// type. SudokuPad, f-puzzles, images and PDFs aren't read here (counted; files are downloaded by
// the crawl for a later conversion step).
//
//   node --no-warnings --experimental-transform-types --import ./puzzles/difficulty/sources/app-alias.ts \
//     puzzles/difficulty/sources/lmd-convert.ts [--check] [--cap-s 60] [--max-cells 400]
//
// --check solves DEDUCE_JOBS at a time (set DEDUCE_JOBS=2 to keep the machine quiet).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir } from "./lmd-fetch.ts";

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === "--child") {
  const { makePuzzle } = await import("../../../src/engine/puzzle.ts");
  const { solve } = await import("../../../src/engine/solve.ts");
  const boards = await solve(makePuzzle(JSON.parse(readFileSync(0, "utf8"))), 2);
  process.stdout.write(boards.length === 0 ? "none" : boards.length > 1 ? "several" : "unique");
  process.exit(0);
}

// the site's importer, through a variable so this tsconfig (no app aliases) doesn't type-check it
const importLink = "../../../app/app/lib/import-link.ts";
const { readLink } = (await import(importLink)) as {
  readLink: (link: string, chosen?: string) => Promise<{ kind: string; genreName?: string; variant?: string; spec: { genre: string; size: [number, number] } }>;
};
const { mapPool } = await import("../pool.ts");

const args = process.argv.slice(2);
const opt = (name: string, d: number) => { const k = args.indexOf(name); return k >= 0 ? Number(args[k + 1]) : d; };
const check = args.includes("--check");
const capMs = opt("--cap-s", 60) * 1000, maxCells = opt("--max-cells", 400);

interface Row {
  id: string; url: string; title: string; author: string; date: string | null; genre: string | null;
  beauty: number | null; difficulty: number | null; difficultySource: string | null;
  solvers: number; watchers: number | null; lists: string[];
  links: { url: string; kind: string; inComment?: boolean; resolved?: string }[];
}

const dir = dataDir();
const rows: Row[] = readFileSync(join(dir, "puzzles.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ours = rows.filter((r) => r.genre);

const kinds: Record<string, Record<string, number>> = {};
const bump = (genre: string, k: string) => { (kinds[genre] ??= {})[k] = (kinds[genre][k] ?? 0) + 1; };
const out: any[] = [];
const why: Record<string, number> = {};

for (const r of ours) {
  const g = r.genre!;
  bump(g, "puzzles");
  const own = r.links.filter((l) => !l.inComment);
  const has = (k: string, ls = own) => ls.some((l) => l.kind === k);
  for (const k of ["puzzlink", "penpa", "sudokupad", "fpuzzles", "image", "pdf"]) if (has(k)) bump(g, k);
  if (!has("puzzlink") && !has("penpa") && (has("puzzlink", r.links) || has("penpa", r.links))) bump(g, "link in comment only");
  const candidates = [...own, ...r.links.filter((l) => l.inComment)].filter((l) => l.kind === "puzzlink" || l.kind === "penpa");
  let done = false;
  for (const l of candidates) {
    const link = l.resolved ?? l.url;
    let res;
    try { res = await readLink(link, g as never); } catch (e) { why[`throws`] = (why.throws ?? 0) + 1; continue; }
    if (res.kind !== "puzzle") { const k = `${l.inComment ? "comment " : ""}${res.kind}${res.kind === "unsupported" ? `: ${res.genreName}${res.variant ? ` ${res.variant}` : ""}` : ""}`; why[k] = (why[k] ?? 0) + 1; continue; }
    if (res.spec.genre !== g) { const k = `other genre (${res.spec.genre} for ${g})`; why[k] = (why[k] ?? 0) + 1; continue; }
    out.push({
      source: "lmd", sourceId: r.id, licence: "LMD terms: copyright with the author; private research use only",
      author: r.author, url: r.url, genre: g, spec: res.spec,
      beauty: r.beauty, beautyCount: null, difficulty: r.difficulty, difficultySource: r.difficultySource, difficultyCount: null,
      solvers: r.solvers, watchers: r.watchers,
      meta: { title: r.title, date: r.date, lists: r.lists, link, linkFrom: l.inComment ? "comment" : "puzzle" },
    });
    bump(g, l.inComment ? "converted (from a comment)" : "converted");
    done = true;
    break;
  }
  if (!done && candidates.length) bump(g, "link not converted");
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
  let n = 0;
  await mapPool(out, async (c) => {
    const [w, h] = c.spec.size;
    c.unique = w * h > maxCells ? "skipped (big)" : await one(c.spec);
    if (++n % 20 === 0) console.error(`checked ${n}/${out.length}`);
  });
}

mkdirSync(join(dir, "specs"), { recursive: true });
const by = new Map<string, any[]>();
for (const c of out) by.set(c.genre, [...(by.get(c.genre) ?? []), c]);
for (const [g, list] of by) writeFileSync(join(dir, "specs", `${g}.jsonl`), list.map((c) => JSON.stringify(c)).join("\n") + "\n");
const uniq: Record<string, Record<string, number>> = {};
for (const c of out) if (c.unique) { const u = (uniq[c.genre] ??= {}); const k = String(c.unique).startsWith("error") ? "error" : c.unique; u[k] = (u[k] ?? 0) + 1; }
const summary = { date: new Date().toISOString(), puzzles: rows.length, ourTypes: ours.length, kinds, notConverted: why, unique: uniq };
writeFileSync(join(dir, "convert.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
