// puzzlekit-dataset (github.com/SmilingWayne/puzzlekit-dataset; references/puzzlekit/repo, a
// release archive of one commit) as our puzzles. Local, non-commercial research only.
//
//   node puzzles/difficulty/sources/puzzlekit.ts
//
// The dataset has no licence of its own; each puzzle's rights follow where it came from
// (docs/research-puzzle-sources.md). Its `source` field is a janko.at page for most, another site
// (the puzzle-*.com family) for some, and empty for many. Phase 1 converts only the janko.at ones,
// carrying the page's Lizenz from references/janko-full/meta.jsonl when the full crawl has it;
// the rest are counted and left out.
//
// Format: assets/data/<Type>/<Type>_dataset_NNN.json, {data: {key: {problem, solution, source}}};
// a problem is a header line "rows cols [extra]" and then Janko's grid rows (base), the grid and
// then its areas (region types), or the clues around the grid, top, bottom, left, right (rim
// types). Writes references/puzzlekit/converted/<genre>.jsonl and summary.json.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GenreName } from "../../../src/engine/puzzle.ts";
import { REFERENCES, jankoMeta, licenceClass, writeByGenre, type Converted } from "./common.ts";
import { jankoRecord, toSpec, type GridRecord } from "./grids.ts";

const ROOT = `${REFERENCES}puzzlekit/`;
const DATA = `${ROOT}repo/assets/data/`;
export const COMMIT = "719109eebf3cf84d5c94e8381588891a046a3abd";

/** puzzlekit's types of our genres, and how its problem is laid out */
const TYPES: Record<string, { genre: GenreName; layout: "base" | "areas" | "areas-after" | "rim" | "solution" }> = {
  Akari: { genre: "akari", layout: "base" }, Hitori: { genre: "hitori", layout: "base" },
  Nurikabe: { genre: "nurikabe", layout: "base" }, Slitherlink: { genre: "slitherlink", layout: "base" },
  Fillomino: { genre: "fillomino", layout: "base" }, Masyu: { genre: "masyu", layout: "base" },
  Galaxies: { genre: "spiral-galaxies", layout: "base" }, Starbattle: { genre: "star-battle", layout: "areas" },
  Sudoku: { genre: "sudoku", layout: "base" }, JigsawSudoku: { genre: "irregular-sudoku", layout: "areas-after" },
  Skyscraper: { genre: "skyscrapers", layout: "rim" }, ABCEndView: { genre: "easy-as-abc", layout: "rim" },
  NumberLink: { genre: "numberlink", layout: "base" }, Hidoku: { genre: "hidoku", layout: "base" },
  Minesweeper: { genre: "minesweeper", layout: "base" }, Nonogram: { genre: "nonogram", layout: "solution" },
  Shikaku: { genre: "shikaku", layout: "base" }, Cave: { genre: "cave", layout: "base" },
  SimpleLoop: { genre: "simple-loop", layout: "base" },
};

const grid = (lines: string[]) => lines.map((l) => l.trim().split(/\s+/));

/** A puzzlekit problem (and solution) as a grid record. */
export function record(layout: string, problem: string, solution: string): GridRecord | null {
  const lines = problem.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const head = lines.shift()?.split(/\s+/) ?? [];
  const rows = Number(head[0]), cols = Number(head[1]);
  if (!(rows > 0 && cols > 0)) return null;
  const sol = solution?.trim() ? grid(solution.trim().split("\n").slice(1)) : undefined;
  const r: GridRecord = { rows, cols, depth: head[2], solution: sol };
  if (layout === "base") r.problem = grid(lines.slice(0, rows));
  else if (layout === "areas") r.areas = grid(lines.slice(0, rows));
  else if (layout === "areas-after") { r.problem = grid(lines.slice(0, rows)); r.areas = grid(lines.slice(rows, 2 * rows)); }
  else if (layout === "rim") {
    const [top, bottom, left, right] = grid(lines.slice(0, 4));
    r.clabels = [top, bottom]; r.rlabels = [left, right];
    if (lines.length >= 4 + rows) r.problem = grid(lines.slice(4, 4 + rows));
  }
  return r;
}

/** "https://www.janko.at/Raetsel/Sudoku/Chaos/001.a.htm" -> "Sudoku/Chaos/001" */
export const jankoId = (url: string) => /janko\.at\/Raetsel\/(.+)\/(\d+)\.a\.htm/.exec(url)?.slice(1).join("/") ?? null;

if (import.meta.url === `file://${process.argv[1]}`) {
  const meta = jankoMeta();
  // our first Janko copy (references/janko), for the overlap
  const jankoDir = `${REFERENCES}janko/`;
  const out: Converted[] = [];
  const summary: Record<string, any> = { commit: COMMIT, byType: {}, notOurs: {}, origins: {} };
  for (const type of readdirSync(DATA).sort()) {
    const files = readdirSync(`${DATA}${type}`).filter((f) => /_dataset(_\d+)?\.json$/.test(f)).sort();
    let n = 0;
    const origins: Record<string, number> = {};
    const rows: { key: string; v: any }[] = [];
    for (const f of files) {
      const d = JSON.parse(readFileSync(`${DATA}${type}/${f}`, "utf8"));
      for (const [key, v] of Object.entries<any>(d.data ?? {})) {
        n++;
        const src: string = v.source ?? "";
        const origin = /janko\.at/.test(src) ? "janko" : /^https?:\/\//.test(src) ? new URL(src).hostname.replace(/^www\./, "") : "unstated";
        origins[origin] = (origins[origin] ?? 0) + 1;
        rows.push({ key, v: { ...v, origin } });
      }
    }
    summary.origins[type] = { total: n, ...origins };
    const t = TYPES[type];
    if (!t) { summary.notOurs[type] = n; continue; }
    const s = { total: n, janko: 0, converted: 0, skipped: {} as Record<string, number>, inOurJanko: 0, sameAsOurJanko: 0, licence: {} as Record<string, number> };
    const skip = (why: string) => { s.skipped[why] = (s.skipped[why] ?? 0) + 1; };
    for (const { key, v } of rows) {
      if (v.origin !== "janko") { skip(`origin ${v.origin}: not in phase 1`); continue; }
      s.janko++;
      const id = jankoId(v.source);
      if (!id) { skip("janko url unreadable"); continue; }
      const r = record(t.layout, v.problem ?? "", v.solution ?? "");
      if (!r) { skip("no size"); continue; }
      const spec = toSpec(t.genre, r);
      if (typeof spec === "string") { skip(spec); continue; }
      // overlap with references/janko (same folder and number, and the same grid)
      const [folder, num] = [id.slice(0, id.lastIndexOf("/")), id.slice(id.lastIndexOf("/") + 1)];
      const local = [`${jankoDir}${folder}/${num}.txt`, `${jankoDir}${folder}/${num.padStart(4, "0")}.txt`, `${jankoDir}${folder}/${num.padStart(3, "0")}.txt`].find(existsSync);
      let author = "";
      if (local) {
        s.inOurJanko++;
        const text = readFileSync(local, "utf8");
        author = /^author (.*)$/m.exec(text)?.[1]?.trim() ?? "";
        const mine = toSpec(t.genre, jankoRecord(text));
        if (typeof mine !== "string" && JSON.stringify(mine) === JSON.stringify(spec)) s.sameAsOurJanko++;
      }
      const m = meta.get(id) ?? meta.get(`${folder}/${num.padStart(4, "0")}`) ?? meta.get(`${folder}/${num.padStart(3, "0")}`);
      const licence = m ? m.licence : "unknown (janko.at; see the full crawl)";
      s.licence[m ? licenceClass(m.licence) : "not yet crawled"] = (s.licence[m ? licenceClass(m.licence) : "not yet crawled"] ?? 0) + 1;
      out.push({
        source: "puzzlekit", sourceId: id, licence, author: m?.author || author, url: v.source, genre: t.genre, spec,
        meta: {
          origin: "janko", dataset: `puzzlekit-dataset@${COMMIT.slice(0, 7)}`, key, type,
          // Janko's Minesweeper states the total number of mines, which our genre has no rule for
          ...(t.genre === "minesweeper" && r.depth ? { totalMines: Number(r.depth) } : {}),
        },
      });
      s.converted++;
    }
    summary.byType[type] = { genre: t.genre, ...s };
  }
  summary.converted = writeByGenre(`${ROOT}converted`, out);
  summary.total = Object.values<any>(summary.origins).reduce((a, o) => a + o.total, 0);
  writeFileSync(`${ROOT}summary.json`, JSON.stringify(summary, null, 1));
  for (const [type, s] of Object.entries<any>(summary.byType)) console.log(type.padEnd(14), JSON.stringify(s));
  console.log("converted by genre", summary.converted);
}
