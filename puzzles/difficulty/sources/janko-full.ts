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
import { REFERENCES, jankoMeta, licenceClass, writeByGenre, type Converted } from "./common.ts";
import { field, JANKO_GENRES, jankoRecord, toSpec } from "./grids.ts";

const ROOT = `${REFERENCES}janko-full/`;
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
    const spec = toSpec(genre, jankoRecord(text));
    if (typeof spec === "string") { s.skipped[spec] = (s.skipped[spec] ?? 0) + 1; continue; }
    s.converted++;
    out.push({
      source: "janko", sourceId: id, licence: m?.licence ?? "", author: m?.author || field(text, "author"),
      url: `https://www.janko.at/Raetsel/${id}.a.htm`, genre, spec,
      meta: { puzzle, solver: field(text, "solver"), quelle: m?.quelle ?? field(text, "source"), title: m?.title ?? "",
        ...(field(text, "mines") ? { totalMines: Number(field(text, "mines")) } : {}) },
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
