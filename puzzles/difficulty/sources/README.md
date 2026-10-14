# Human-made puzzle sources

Downloads and readers for other people's puzzles, for local, non-commercial research and model
training only. The rules are [docs/research-puzzle-sources.md](../../../docs/research-puzzle-sources.md);
follow it exactly. Puzzle data lives in `references/` (gitignored) or the private bucket and is
never published, seeded or committed. This folder holds code, and `manifest.json` holds counts.

| Source | Verdict | Local copy | Fetch | Reader |
|---|---|---|---|---|
| puzzlekit-dataset | go with care (an index; rights follow each puzzle's origin) | `references/puzzlekit/` | release archive of one commit | `puzzlekit.ts` |
| nikoli_100 (Hugging Face) | go (CC BY 4.0, credit Nikoli) | `references/nikoli-100/` | the dataset files | `nikoli.ts` |
| Janko, every type | go (CC BY-NC-SA puzzles) / go with care (the rest) | `references/janko-full/` | `janko_crawl.py` | `janko-full.ts` |
| Puzzle Square JP, public puzzles | go with care (CC0 examples: go) | `references/psjp-full/` | `psjp_crawl.py` | `psjp.ts` |
| puzz.link's database | go with care | `references/puzzlink-db/` | `puzzlink_db_crawl.py` | `puzzlink-db.ts` |
| LMI Puzzle Expo, per-puzzle figures | go with care (aggregates only) | `references/lmi-expo/` | `lmi_expo_crawl.py` | `lmi-expo.ts` |

Phase 1 was the first four; Logic Masters Deutschland, puzz.link's /db and the LMI Expo came next (below). Not yet: the WPF, GM Puzzles' own site, pzv.jp. Never:
the sources the report marks "ask first" or "avoid".

## Every converted puzzle

Each reader writes `references/<source>/converted/<genre>.jsonl`, one puzzle a line:

```
{ source, sourceId, licence, author, url, genre, spec, meta }
```

`spec` is the engine's `GridSpec`. `source` and `sourceId` trace it back, so a source can be dropped
later; `licence` is the licence or terms it's held under (for Janko, the page's `Lizenz:` value,
empty when the page names none). Each reader also writes `references/<source>/summary.json` with its
counts and what it left out and why.

## Crawling

Both crawlers use `polite.py`: one connection, a fixed gap between requests, the User-Agent
`inkit-research/1.0 (non-commercial research; contact josh@carina.fund)`, every response cached on
disk (gzipped, under the source's `cache/`), and a stop on any HTTP error but a 404, on a 429, or on
a network error. A 404 is noted and skipped; 20 in a row stop the crawl. A server error (5xx) is
retried once, a minute later, then stops it. Both are resumable: rerun
the same command and they continue from the cache and `state.json`. Never log in; never fetch
images; never use site copiers such as HTTrack (Janko's robots.txt blocks them).

```sh
# start (from the repo root; each runs for hours)
nohup python3 -I puzzles/difficulty/sources/janko_crawl.py > /dev/null 2>&1 &   # 3 s a request
nohup python3 -I puzzles/difficulty/sources/psjp_crawl.py  > /dev/null 2>&1 &   # 5 s a request

# progress: one line each, rewritten as they go (rate, what's left, PID)
cat references/janko-full/progress.txt references/psjp-full/progress.txt
tail references/janko-full/crawl.log references/psjp-full/crawl.log

# stop (resumable)
kill $(cat references/janko-full/crawl.pid)
kill $(cat references/psjp-full/crawl.pid)
```

- **Janko**: lists every type folder from `Raetsel/index.htm`, then each folder's `index.htm`, its
  `index-N.htm` pages and subfolders, then fetches each puzzle page (`NNNN.a.htm`). The puzzle's text
  (the page's `[begin] … [end]` block, Janko's file format) goes to `<Folder>/<NNNN>.txt`, so
  `janko.ts`'s readers also read it (`JANKO_DIR=…/references/janko-full/`); the footer's Autor,
  Quelle and Lizenz go to `meta.jsonl`. Our types and those close to them first.
- **Puzzle Square JP**: the site is a Next.js app whose puzzle page loads the puzzle through a
  Firebase function and offers its link (puzz.link, pzprxs, Penpa). The public REST API
  `/api/problem/date/<day>` (the one bay-puz/psjp reads) returns a whole day's puzzles with those
  links, so one request covers a day rather than one a puzzle. Days with our types first. Puzzles
  whose link is empty are image only and are skipped. `records.jsonl` keeps each puzzle's
  difficulty, variation, registered, user, and from bay-puz/psjp's `data.json`, favorite_n and
  answered_n.

## Converting and checking

```sh
node puzzles/difficulty/sources/puzzlekit.ts
node puzzles/difficulty/sources/nikoli.ts
node puzzles/difficulty/sources/janko-full.ts       # whatever the crawl has so far
node puzzles/difficulty/sources/psjp.ts             # likewise
node puzzles/difficulty/sources/unique.ts references/<source>/converted --per 20   # a uniqueness sample
node puzzles/difficulty/sources/manifest.ts         # refresh manifest.json's counts
```

- `grids.ts` reads Janko's grid format (which puzzlekit copies) into our specs, one reader per genre.
- `psjp.ts` reads links with the app's own reader (`app/app/lib/import-link.ts`), loaded through
  `app-alias.ts`, which resolves the app's import aliases for plain Node.
- `unique.ts` solves an evenly spaced sample of each genre (small boards; each solve in its own
  process with a time cap) and counts one solution, none, several or a timeout.

Known gaps: Skyscrapers with fewer heights than the size (empty cells), and a Minesweeper's total
mine count (`meta.totalMines`), are rules our genres lack: the first are skipped, the second kept
and flagged. Janko's Fillomino often runs past the solver's time cap.

## Logic Masters Deutschland (phase 2)


### lmd: Logic Masters Deutschland Rätselportal

| | |
|---|---|
| Source | [logic-masters.de/Raetselportal](https://logic-masters.de/Raetselportal/) |
| Terms | [Nutzungsbedingungen (2009)](https://logic-masters.de/nutzungsbedingungen.php): copyright stays with each author; no reuse in other publications without consent. We don't publish |
| Law | DE §44b (TDM; no machine-readable reservation: no tdmrep.json (404), no AI lines in robots.txt) and §60d (non-commercial research); US fair use |
| Verdict | go with care (research and training only; private) |
| robots.txt | read and obeyed each run: `Disallow` /Raetselportal/Benutzer/, /Raetselportal/Statistik/, /Raetselportal/Suche/erweitert.php; no crawl-delay |
| Crawl | anonymous (never logs in, no cookies); one connection; 4.5 s between requests; User-Agent `inkit-research/1.0 (non-commercial research; contact josh@carina.fund)`; every response cached (references/lmd/cache), never refetched; stops on any HTTP error, 429 or a page that looks like a block |
| Pages | Suche/einfach.php?sort=neu (the listing, 20 a page), Suche/spezial.php (the front page's hand-picked lists), Raetsel/zeigen.php?id=… (each puzzle, with its comments), the puzzles' images and PDFs on logic-masters.de (our types only), and one HEAD request per short link (tinyurl etc., and f-puzzles ids, which are TinyURL aliases) in our types, at the crawl's end |
| Visible without login | beauty (percentage, N/A until enough ratings), difficulty level 1–5 (solvers' when enough ratings, else the author's estimate), solvers, watchers, tags and labels, links, comments. **Not visible:** how many ratings each figure rests on |
| Code | lmd-fetch.ts (polite fetcher), lmd.ts (crawl, parse, status), lmd-convert.ts (puzz.link and Penpa+ links → specs, uniqueness), lmd-report.ts (first look), fpuzzles.ts (f-puzzles links read offline), app-alias.ts (lets Node import the site's link importers) |
| Output | references/lmd/puzzles.jsonl, comments.jsonl, specs/<genre>.jsonl (`source: "lmd"`), files/<id>/, shortlinks.json, report.md, state.json, crawl.log |
| Date | crawl started 14 October 2026 |
| Counts | 36,966 puzzles listed (14 Oct 2026), 32,667 with beauty, 32,648 with both ratings; puzzle pages crawling (about 45 h); see references/lmd/report.md and convert.json for the current totals |

Running it:

```sh
### start or resume (cached pages are skipped), in the background
nohup node --no-warnings puzzles/difficulty/sources/lmd.ts crawl >> references/lmd/crawl.log 2>&1 &
node --no-warnings puzzles/difficulty/sources/lmd.ts status    # progress, pid, ETA
kill <pid>                                                     # stop (resume later with the same command)
node --no-warnings puzzles/difficulty/sources/lmd.ts parse     # cache → puzzles.jsonl, comments.jsonl
DEDUCE_JOBS=2 node --no-warnings --experimental-transform-types \
  --import ./puzzles/difficulty/sources/app-alias.ts puzzles/difficulty/sources/lmd-convert.ts --check
node --no-warnings puzzles/difficulty/sources/lmd-report.ts    # → references/lmd/report.md
```

## puzz.link's database and the LMI Puzzle Expo (phase 2)

### puzzlink-db: puzz.link's database

| | |
|---|---|
| Source | [puzz.link/db](https://puzz.link/db), its own API: a PostgREST at `/db/api` (listing at `/db/api/`) |
| Terms | none; [puzz.link](https://puzz.link/): copyright "lies with their authors", the database "only shares puzzles that are available publicly, and links to their source" |
| Law | EU Art. 4 / DE §44b (no signals set); JP 30-4 for Japanese setters; US fair use |
| Verdict | go with care (research and training only; private) |
| robots.txt | read every run: Cloudflare's content-signal template with no user-agent, Disallow or signal lines (a Disallow or `ai-train=no` would stop the crawl) |
| Crawl | `polite.py`: one connection, 3 s between requests, the research User-Agent, every response cached, a stop on HTTP errors and 429s. Keyset pages of 5,000 on `sort_key`: 18 requests in all |
| Tables | `pzvs_anon` (every indexed puzz.link/pzv link: source name, type and URL, type, size, `solves`, `difficulty`, `generated`, tags) and `gmpuzzles_anon` (GM Puzzles' posts and their setters' time standards). **Never** `pzv_solves_anon` or `griddle_solves_anon` (per solve; 401 anyway) or anything needing a login |
| Fields | `difficulty` runs **-2..2** (five levels; null with too few solves), stored as is and as `difficulty5` (1..5). `solves` counts logged-in puzz.link users only. `source_name` is the setter's Twitter handle or the blog's name. Rows tagged `variant` (link `type/v:/…`) or `broken` aren't converted |
| Output | references/puzzlink-db/rows.jsonl, gmpuzzles.jsonl, converted/<genre>.jsonl (`source: "puzzlink-db"`, difficulty, solves and the post it came from in `meta`), summary.json (counts by type, the overlap with PSJP, Janko and LMD, and puzz.link's difficulty against PSJP's) |
| Date | 14 October 2026 |
| Counts | 80,848 rows (260 types), 75,478 with a difficulty, 74,936 with 5+ solves; 2,026 GM Puzzles posts; 21,503 converted in 20 of our genres. 7,440 are also in Puzzle Square JP (by link or PSJP id); Spearman of the two difficulties 0.63 (n 7,163) |

### lmi-expo: Logic Masters India's Puzzle Expo

| | |
|---|---|
| Source | [logicmastersindia.com/expo](https://logicmastersindia.com/expo/) (the logged-out index and search page) |
| Terms | none found; the home page: "any puzzle published on LMI Puzzle Expo is, and remains, the intellectual property of the author" |
| Law | India has no TDM exception; US fair use |
| Verdict | go with care for per-puzzle aggregates; per-solver timings, replays and comments never collected |
| robots.txt | read every run: none (404). If one appears, its Disallow lines for `*` are obeyed |
| Crawl | `polite.py` (its POST): logged out, one connection, 5 s between requests, the research User-Agent, every response cached, a stop on HTTP errors and 429s. The calls the pages make: `POST /live/misc-pp?action=apply-filters` (the search table, 100 a request) and `action=get-puzzle` (one puzzle's page). get-puzzle's answer also carries comments (solver handles) and the author's profile; they're cut away **before** the response is cached, so they never reach the disk |
| Visible without login | title, genre, author handle, rules, variant level, tags, started (`numViewed`) and solved counts, best time, top-10/50/100 average times, the average rating (once enough ratings) and its count. **Needs a login:** the puzzle itself (Penpa, `action=pqr`), so it isn't read; the "Timings & Replays" tab is never requested |
| Converting | only through the puzzle's "also posted at" link, when that post is one we already hold (indexed by puzz.link's database, or a Logic Masters page) |
| Output | references/lmi-expo/list.jsonl, puzzles.jsonl, converted/<genre>.jsonl (`source: "lmi-expo"`, the time figures in `meta`), summary.json |
| Date | 14 October 2026 |
| Counts | 1,568 puzzles in 704 genre names; see summary.json |

```sh
# fetch (resumable; progress one line, rewritten; stop with kill, rerun to resume)
nohup python3 -I puzzles/difficulty/sources/puzzlink_db_crawl.py > /dev/null 2>&1 &   # ~1 min
nohup python3 -I puzzles/difficulty/sources/lmi_expo_crawl.py > /dev/null 2>&1 &      # ~2.2 h
cat references/puzzlink-db/progress.txt references/lmi-expo/progress.txt
kill $(cat references/lmi-expo/crawl.pid)

# convert, join and compare
node --no-warnings puzzles/difficulty/sources/puzzlink-db.ts
DEDUCE_JOBS=2 node --no-warnings puzzles/difficulty/sources/lmi-expo.ts --estimate
node puzzles/difficulty/sources/manifest.ts
```
