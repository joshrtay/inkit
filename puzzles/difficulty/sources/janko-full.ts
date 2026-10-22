// Janko's puzzles from the full crawl (references/janko-full, janko_crawl.py) as our puzzles, each
// with its page's Lizenz. Local, non-commercial research only.
//
//   node puzzles/difficulty/sources/janko-full.ts
//
// Every folder's files are counted by Janko's puzzle name and licence; those of our genres
// (grids.ts's JANKO_GENRES) are converted. The .txt files keep Janko's format, so janko.ts's
// readers (with recorded moves) also read them: JANKO_DIR=<references>/janko-full/.
// Writes references/janko-full/converted/<genre>.jsonl and summary.json.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { REFERENCES, jankoMeta, licenceClass, writeByGenre, type Converted } from "./common.ts";
import { field, JANKO_GENRES, jankoRecord, toSpec } from "./grids.ts";

const ROOT = `${REFERENCES}janko-full/`;

/** Janko's difficulty for a folder's puzzles: the table whose rows run "leicht", 1 … 8, "schwer",
 *  ranked by solving time alone (not grid size); each row lists puzzle numbers. Small folders show
 *  it on index.htm under "Sortiert nach Schwierigkeit"; large ones show a teaser there and the full
 *  table on another index-N.htm, so the table with the most puzzles wins. Puzzle number → its level
 *  ("leicht" 0, 1 … 8, "schwer" 9) and its place within the row (the row's order isn't numeric, so it
 *  may be a finer ranking: unconfirmed). The newest puzzles aren't ranked yet. */
function jankoLevels(folder: string): Map<string, { level: number; place: number }> {
  let best = new Map<string, { level: number; place: number }>();
  const dir = `${ROOT}cache/Raetsel/${folder}/`;
  if (!existsSync(dir)) return best;
  for (const f of readdirSync(dir)) {
    if (!/^index(-\d+)?\.htm\.gz$/.test(f)) continue;
    const page = gunzipSync(readFileSync(`${dir}${f}`)).toString("utf8");
    for (const table of page.split(/<table/).slice(1).map((t) => t.slice(0, t.indexOf("</table>")))) {
      const rows = table.split(/<tr>/).slice(1).map((row) => ({ label: row.match(/<td[^>]*>\s*([^<]*?)\s*<\/td>/)?.[1], row }));
      if (rows[0]?.label !== "leicht" || !rows.some((r) => r.label === "schwer")) continue;
      const map = new Map<string, { level: number; place: number }>();
      for (const { label, row } of rows) {
        const level = label === "leicht" ? 0 : label === "schwer" ? 9 : /^\d$/.test(label ?? "") ? Number(label) : null;
        if (level === null) continue;
        [...row.matchAll(/href="([^"/]+)\.a\.htm"/g)].forEach((m, place) => map.set(m[1], { level, place }));
      }
      if (map.size > best.size) best = map;
    }
  }
  return best;
}
const levels = new Map<string, Map<string, { level: number; place: number }>>();
const meta = jankoMeta();
const out: Converted[] = [];
const byPuzzle: Record<string, { files: number; converted: number; genre?: string; skipped: Record<string, number>; licence: Record<string, number> }> = {};
const licences: Record<string, number> = {};

function walk(dir: string, folder: string) {
  for (const f of readdirSync(dir).sort()) {
    const path = `${dir}${f}`;
    if (statSync(path).isDirectory()) { if (f !== "cache" && f !== "converted") walk(`${path}/`, folder ? `${folder}/${f}` : f); continue; }
    if (!f.endsWith(".txt") || !folder) continue;
    const text = readFileSync(path, "utf8"), n = f.replace(/\.txt$/, ""), id = `${folder}/${n}`;
    const puzzle = field(text, "puzzle").toLowerCase() || "?";
    const m = meta.get(id);
    const lc = m ? licenceClass(m.licence) : "no page metadata";
    licences[lc] = (licences[lc] ?? 0) + 1;
    const s = (byPuzzle[puzzle] ??= { files: 0, converted: 0, skipped: {}, licence: {} });
    s.files++; s.licence[lc] = (s.licence[lc] ?? 0) + 1;
    const genre = JANKO_GENRES[puzzle];
    if (!genre) continue;
    s.genre = genre;
    if (!levels.has(folder)) levels.set(folder, jankoLevels(folder));
    const lv = levels.get(folder)!.get(n);
    const rec = jankoRecord(text);
    const spec = toSpec(genre, rec);
    if (typeof spec === "string") { s.skipped[spec] = (s.skipped[spec] ?? 0) + 1; continue; }
    s.converted++;
    out.push({
      source: "janko", sourceId: id, licence: m?.licence ?? "", author: m?.author || field(text, "author"),
      url: `https://www.janko.at/Raetsel/${id}.a.htm`, genre, spec,
      meta: { puzzle, solver: field(text, "solver"), quelle: m?.quelle ?? field(text, "source"), title: m?.title ?? "",
        ...(field(text, "mines") ? { totalMines: Number(field(text, "mines")) } : {}),
        ...(lv ? { jankoLevel: lv.level, jankoLevelPlace: lv.place } : {}),
        // Janko's own [solution] grid, as his file writes it
        ...(rec.solution ? { solution: rec.solution } : {}) },
    });
  }
}

if (!existsSync(ROOT)) throw new Error(`no ${ROOT}: run janko_crawl.py first`);
walk(ROOT, "");
const counts = writeByGenre(`${ROOT}converted`, out);
const summary = { files: Object.values(byPuzzle).reduce((a, s) => a + s.files, 0), converted: counts, licences, byPuzzle };
writeFileSync(`${ROOT}summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ files: summary.files, licences, converted: counts }, null, 1));
for (const [p, s] of Object.entries(byPuzzle).sort()) if (s.genre) console.log(p.padEnd(14), JSON.stringify(s));
