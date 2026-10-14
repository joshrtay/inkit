# Puzzle sources: manifest

One entry per human-made source we download for non-commercial research and model training.
Terms and verdicts: docs/research-puzzle-sources.md. Data lives in references/<source>/
(gitignored) and is never published; only code is committed here.

## lmd: Logic Masters Deutschland Rätselportal

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
# start or resume (cached pages are skipped), in the background
nohup node --no-warnings puzzles/difficulty/sources/lmd.ts crawl >> references/lmd/crawl.log 2>&1 &
node --no-warnings puzzles/difficulty/sources/lmd.ts status    # progress, pid, ETA
kill <pid>                                                     # stop (resume later with the same command)
node --no-warnings puzzles/difficulty/sources/lmd.ts parse     # cache → puzzles.jsonl, comments.jsonl
DEDUCE_JOBS=2 node --no-warnings --experimental-transform-types \
  --import ./puzzles/difficulty/sources/app-alias.ts puzzles/difficulty/sources/lmd-convert.ts --check
node --no-warnings puzzles/difficulty/sources/lmd-report.ts    # → references/lmd/report.md
```
