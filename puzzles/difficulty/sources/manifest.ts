// The per-source manifest (manifest.json, committed: code facts and counts, never puzzles): each
// source's licence or terms, verdict (docs/research-puzzle-sources.md), crawl settings, and counts
// read from the local summaries and crawl state under references/.
//
//   node puzzles/difficulty/sources/manifest.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { REFERENCES } from "./common.ts";

const read = (path: string) => (existsSync(`${REFERENCES}${path}`) ? JSON.parse(readFileSync(`${REFERENCES}${path}`, "utf8")) : null);
const today = new Date().toISOString().slice(0, 10);
const UA = "inkit-research/1.0 (non-commercial research; contact josh@carina.fund)";

const pk = read("puzzlekit/summary.json"), nk = read("nikoli-100/summary.json");
const jf = read("janko-full/summary.json"), js = read("janko-full/state.json");
const ps = read("psjp-full/summary.json"), pst = read("psjp-full/state.json");
const pl = read("puzzlink-db/summary.json"), plst = read("puzzlink-db/state.json"), lm = read("lmi-expo/summary.json");
const sum =(o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

const manifest = {
  updated: today,
  note: "Local, non-commercial research and model training only. Puzzle data stays in references/ (gitignored) or the private bucket; never published. Every converted puzzle carries source, sourceId, licence and author.",
  sources: [
    {
      source: "puzzlekit", name: "puzzlekit-dataset", url: "https://github.com/SmilingWayne/puzzlekit-dataset",
      licence: "none on the dataset (puzzlekit's code is MIT); each puzzle's rights follow its origin",
      verdict: "go with care (as an index); only its janko.at puzzles converted in phase 1",
      fetch: "one release archive of commit 719109eebf3cf84d5c94e8381588891a046a3abd (2026-09-22) from codeload.github.com",
      local: "references/puzzlekit/", reader: "puzzles/difficulty/sources/puzzlekit.ts",
      counts: pk && { puzzles: pk.total, converted: sum(pk.converted), byGenre: pk.converted,
        leftOut: "origins other than janko.at: the puzzle-*.com sites and records with no source (see summary.json)" },
    },
    {
      source: "nikoli-100", name: "SakanaAI/sudoku-bench-nikoli (nikoli_100)", url: "https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli",
      licence: "CC BY 4.0; credit Nikoli", verdict: "go",
      fetch: "the parquet file and README at revision 9034906b4ec06ab1e08daf110c6b562ef72859fd, and the same rows from Hugging Face's dataset viewer API",
      local: "references/nikoli-100/", reader: "puzzles/difficulty/sources/nikoli.ts",
      counts: nk && { puzzles: nk.rows, converted: sum(nk.converted), byGenre: nk.converted },
    },
    {
      source: "janko", name: "Janko (www.janko.at/Raetsel/), every type", url: "https://www.janko.at/Raetsel/",
      licence: "per puzzle, its page's Lizenz: Creative Commons 3.0 BY-NC-SA (go), or the author's permission, Freeware or none stated (go with care)",
      verdict: "go / go with care",
      crawl: { tool: "puzzles/difficulty/sources/janko_crawl.py (own fetcher; robots.txt blocks site copiers)", delaySeconds: 3, connections: 1, userAgent: UA,
        cache: "every response, gzipped", stopsOn: "HTTP errors other than 404 (a 5xx after one retry a minute later), 429s, network errors; 20 missing pages in a row",
        robots: "obeyed: /Forum/, /Blog/, /Shariff/ never requested" },
      local: "references/janko-full/ (references/janko/ untouched)", reader: "puzzles/difficulty/sources/janko-full.ts",
      counts: js && { folders: Object.keys(js.folders).length, listed: sum(Object.fromEntries(Object.entries<string[]>(js.folders).map(([k, v]) => [k, v.length]))),
        fetched: sum(js.done), converted: jf ? sum(jf.converted) : 0, byGenre: jf?.converted, licences: jf?.licences },
    },
    {
      source: "psjp", name: "Puzzle Square JP, public puzzles", url: "https://puzsq.logicpuzzle.app/",
      licence: "guideline: rights stay with each poster; no reposting; no load on the system. Its CC0 example puzzles are free to use",
      verdict: "go with care (CC0 examples: go)",
      crawl: { tool: "puzzles/difficulty/sources/psjp_crawl.py", endpoint: "/api/problem/date/<day> (public, no login): a day's puzzles with their puzz.link, pzprxs or Penpa link",
        delaySeconds: 5, connections: 1, userAgent: UA, cache: "every response, gzipped", stopsOn: "HTTP errors other than 404 (a 5xx after one retry a minute later), 429s, network errors",
        login: "never; nothing needed one", images: "never downloaded" },
      local: "references/psjp-full/", reader: "puzzles/difficulty/sources/psjp.ts (the app's link reader, app/app/lib/import-link.ts)",
      counts: pst && { days: pst.days.length, daysFetched: pst.done.length, puzzles: ps?.records ?? pst.puzzles, withLink: ps?.withLink ?? pst.with_link,
        converted: ps ? sum(ps.converted) : 0, byGenre: ps?.converted },
    },
    {
      source: "puzzlink-db", name: "puzz.link's database (pzvs_anon, gmpuzzles_anon)", url: "https://puzz.link/db",
      licence: "none; puzz.link: copyright \"lies with their authors\", the database \"only shares puzzles that are available publicly\"",
      verdict: "go with care",
      crawl: { tool: "puzzles/difficulty/sources/puzzlink_db_crawl.py", endpoint: "/db/api/pzvs_anon and /db/api/gmpuzzles_anon (public PostgREST), keyset pages of 5,000 on sort_key",
        delaySeconds: 3, connections: 1, userAgent: UA, cache: "every response, gzipped", stopsOn: "HTTP errors other than 404 (a 5xx after one retry a minute later), 429s, network errors",
        robots: "read every run (Cloudflare's content-signal template, no signals set)", never: "the per-solve tables (pzv_solves_anon, griddle_solves_anon: 401) and anything needing a login" },
      local: "references/puzzlink-db/", reader: "puzzles/difficulty/sources/puzzlink-db.ts (the app's link reader)",
      counts: pl && { rows: pl.rows, withDifficulty: pl.withDifficulty, fivePlusSolves: pl.fivePlusSolves, gmPuzzles: plst?.tables?.gmpuzzles_anon?.rows,
        converted: pl.convertedTotal, byGenre: pl.converted, overlap: pl.overlap, difficultyVsPsjp: pl.difficultyVsPsjp?.all },
    },
    {
      source: "lmi-expo", name: "Logic Masters India, Puzzle Expo (per-puzzle figures)", url: "https://logicmastersindia.com/expo/",
      licence: "none found; \"any puzzle published on LMI Puzzle Expo is, and remains, the intellectual property of the author\"",
      verdict: "go with care for per-puzzle aggregates; per-solver timings and replays never collected",
      crawl: { tool: "puzzles/difficulty/sources/lmi_expo_crawl.py", endpoint: "POST /live/misc-pp?action=apply-filters (the search table, 100 a request) and action=get-puzzle (one puzzle's page), logged out",
        delaySeconds: 5, connections: 1, userAgent: UA, cache: "every response, gzipped, cut to the kept fields before it's written (comments and profiles never stored)",
        stopsOn: "HTTP errors other than 404 (a 5xx after one retry a minute later), 429s, network errors", robots: "read every run (none: 404)",
        login: "never; the Penpa puzzle data (action=pqr) needs one, so puzzles convert only through a post we already hold" },
      local: "references/lmi-expo/", reader: "puzzles/difficulty/sources/lmi-expo.ts",
      counts: lm && { puzzles: lm.puzzles, ourGenres: lm.ourGenres, withTop50: lm.withTop50, converted: sum(lm.converted), byGenre: lm.converted, top50VsEstimate: lm.top50VsEstimate },
    },
  ],
};
writeFileSync(new URL("./manifest.json", import.meta.url), JSON.stringify(manifest, null, 1) + "\n");
console.log(JSON.stringify(manifest.sources.map((s) => ({ source: s.source, counts: s.counts })), null, 1));
