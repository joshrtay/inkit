# Lists of puzzles: research

How other sites make lists you can share and step through, and what inkit could build.
The goal: very light lists, with "‹ 3 of 41 ›" on the puzzle page and Next after a solve.

Researched October 2026, signed out, public pages only. Raw notes are in `references/lists/`
(local only). Where a page blocked fetching (Letterboxd, Reddit help) the notes say "from
memory" and should be checked before we rely on them.

## Part 1. What other sites do

### YouTube

- **Stored playlist:** `/playlist?list=PL…` is the landing page. Playing it:
  `/watch?v=<video>&list=PL…&index=<n>`. The panel beside the video shows the list, "3 / 41",
  shuffle and loop. Autoplay moves to the next item.
- **Position:** `index` is a 1-based number in the URL, but `v` is what actually plays. If the
  list changed since the link was made, `v` wins and the index is corrected. Two things in the
  URL, one of them a hint.
- **Temporary list:** `/watch_videos?video_ids=a,b,c` still works signed out. Tested today:
  it answers `303` to `/watch?v=a&list=TLGGQbVhu-4ufWExMDEwMjAyNg`. The same ids give the same
  list id; a different order gives a different one. The id is `TLGG` + base64 of 8 bytes (a hash
  of the ordered ids) + the date as text (`10102026`). So the short code is derived from the
  contents plus the day, not a random row. The list is titled "Untitled List", has its own
  `/playlist?list=TLGG…` page, and can be saved to an account. Older guides mention a limit
  around 50 ids.
- **Live or snapshot:** stored playlists are edited by hand. Deleted or private videos stay in
  the list as "[Deleted video]" placeholders and are skipped in play. Mixes (`list=RD…`) are
  generated and infinite.
- **Well done:** the list travels with every watch URL, so any video link shared from inside a
  playlist brings the list along. **Badly:** placeholders for deleted videos clutter old lists;
  `index` and `v` can disagree.

Sources: [labnol on watch_videos](https://www.labnol.org/internet/create-youtube-playlists/28827/),
[player parameters](https://developers.google.com/youtube/player_parameters),
probe in `references/lists/youtube-temp-playlist.txt`.

### GitHub issues and PRs

- **URL:** `/issues?q=is:issue+state:open+label:bug+sort:created-asc`. The whole view is the
  `q` text. Dropdowns (Author, Label, Sort) edit that text; the text box shows the result.
  Typing gives suggestions for qualifiers and values.
- **Syntax:** `key:value`, `-` to exclude, space = AND, `OR`, parentheses up to 5 deep (2025).
  Commas inside one qualifier mean OR (`label:"bug","wip"`). `sort:` is part of the query.
- **Changing the grammar is costly.** People bookmark and share queries, so the 2025 rewrite
  had to parse every old query the same way. They dark-shipped it and compared result counts
  on 1% of searches. One meaning still changed: a space between `repo:` qualifiers went from OR
  to AND.
- **Saved views:** the issues dashboard can save a query under a name. Sharing is just the URL.
- **Next/prev:** none. You go back to the list.

Sources: [GitHub blog, nested queries](https://github.blog/developer-skills/application-development/github-issues-search-now-supports-nested-queries-and-boolean-operators-heres-how-we-rebuilt-it/),
[filtering docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests).

### Linear

- Filters live in the URL as temporary state. "Save view" (Alt+V) stores them as a named view,
  scoped to you, a team, or the workspace. A saved view is live: whatever matches now.
- A copied link to a view does not grant access; the view must be shared first.
- Hand-picked: put comma-separated issue ids after `/issues/` to open just those issues. This is
  `id:a,b,c` as a path.
- Projects views match by filter; initiatives are curated by hand. They keep both kinds and
  name them differently.

Source: [Linear custom views](https://linear.app/docs/custom-views).

### Gmail

- Operators: `from:`, `label:`, `has:`, `before:2024/04/18`, `after:`, `older_than:1y`,
  `newer_than:2d`, `OR`, `-`, `()`. URL: `#search/<query>`.
- The search options dropdown (the slider icon) is a form that writes the query text. After it
  runs, the box shows the text. That is the "chips write into the query" pattern.
- "Create filter" turns a search into a stored rule. The stored thing is the query text plus
  actions.
- `before:` fixes the end of a time window. Combined with a date it freezes the set, which is
  the same idea as our `before:`.

Source: [Gmail search operators](https://support.google.com/mail/answer/7190).

### Apple Music Smart Playlists, Spotify

- **Smart Playlist:** rules (field, comparison, value), "match all/any", a Limit (count, time,
  size) with an order for the limit (most recently added, random, most played), and a "Live
  updating" checkbox. Unchecked, it is a snapshot taken when saved. The checkbox is the whole
  live-vs-snapshot decision, made explicit, once.
- **Regular playlist:** ordered, hand-edited, may repeat a song.
- **Spotify:** user playlists are stored and ordered; the API exposes a `snapshot_id` that
  changes on every add, remove or reorder. Generated lists (Discover Weekly, Daily Mix,
  Radio) have the same `open.spotify.com/playlist/<id>` URLs but are rebuilt on a schedule and
  are personal. Radio is infinite, seeded by one song.

Sources: [Apple, smart playlists](https://support.apple.com/guide/music/mus1712973f4/mac),
[Spotify forum on snapshot_id](https://community.spotify.com/t5/Spotify-for-Developers/snapshot-id-not-updated-for-https-api-spotify-com-v1-users-user/td-p/5172191).

### Reddit

- **URL-only union:** `/r/puzzles+sudoku+nonograms` is a live feed of those subs, no storage.
- **Custom feeds** (multireddits, renamed 2019): stored, named, public or private, at
  `/user/<name>/m/<feed>` (from memory). Others can follow one, and see changes when the owner
  adds a sub, or copy it to edit their own.

Sources: [VentureBeat on multireddits](https://venturebeat.com/technology/reddit-multireddit-feature),
[2019 announcement](https://teddit.bsalzberg.com/r/announcements/comments/bpfyx1/introducing_custom_feeds_plus_a_community_contest/entnog1).

### Letterboxd

(Pages return 403 to fetches. From memory; check before relying on it.)

- **Filters as path:** `/films/genre/horror/decade/1980s/by/rating/`. Each filter is a path
  segment, so the URL reads like a sentence and search engines index it. The same segments
  work on a list: `/<user>/list/<slug>/genre/horror/by/rating/`.
- **Stored lists:** title, notes, optional numbering ("ranked"), per-item notes. Landing page
  `/<user>/list/<slug>/`. Lists appear on the profile's Lists tab, in friends' activity, and
  can be liked and commented on.
- **Progress:** a signed-in member sees how many films of a list they've watched, as a count
  and percent. A third-party extension (Letterboxd Toolkit) adds rings for big canonical lists,
  which suggests people want this a lot.
- No play-through; a list is a page of posters.

### Lichess puzzles

- **Theme as path:** `/training/fork`, `/training/mateIn2`, `/training/endgame`,
  `/training/Sicilian_Defense`. Index pages `/training/themes`, `/training/openings`. A single
  puzzle: `/training/<puzzleId>`.
- **Next:** there is no position. The server picks the next puzzle from the theme near your
  rating, avoiding ones you've done. The list is infinite and personal.
- **Dashboard** (`/training/dashboard/30`): your results by theme over N days. "To replay"
  serves the puzzles you failed in that window. So a history-derived list exists, but you cannot
  loop over a fixed set (forum users ask for it).
- **Studies** (`/study/<id>/<chapterId>`): hand-made, ordered chapters with a chapter list
  beside the board and prev/next. This is the curated, ordered kind.

Sources: [lichess.org/training/themes](https://lichess.org/training/themes),
[dashboard forum thread](https://lichess.org/forum/general-chess-discussion/puzzle-dashboard-2).

### Codewars, LeetCode

- **Codewars collections** (`/collections/<slug>`): "groups of kata that can be trained on in a
  sequence." All public. Creating one needs 20 honor (reputation). Only the owner adds; a
  "Collect" button on every kata adds it to one of yours or makes a new one. Bookmarks are the
  private kind. The listing sorts by Most Items, among others.
- **Codewars search:** `/kata/search/?q=&r[]=-8&tags=Puzzles&beta=false&order_by=popularity+desc`.
  Form fields in the query string; not a typed syntax.
- **LeetCode:** problemset filters in the URL (`/problemset/?topicSlugs=…&difficulty=EASY`).
  Curated lists at `/problem-list/<slug>/`, user lists at `/list/<code>/`, private by default,
  public by link, forkable. Study plans add a schedule and progress per day.

Sources: [codewars.com/collections](https://www.codewars.com/collections),
[LeetCode, My List](https://support.leetcode.com/hc/en-us/articles/360011883774).

### puzz.link and Logic Masters

- **puzz.link:** the puzzle itself is in the URL: `puzz.link/p?akari/10/10/ic5.h.rch…` (type,
  width, height, packed clues). Lists of puzzles are just pages of such links (blogs, the
  puzz.link list site). No list feature at all.
- **Logic Masters portal:** tags (420+, set by admins, users can't add) for types and variants.
  Search is a form; there are fixed lists (by type, by author, "nice puzzles"). No next/prev
  between puzzles from a search.

Sources: [robx/pzprjs](https://github.com/robx/pzprjs),
[LMD tags help](https://logic-masters.de/Raetselportal/Hilfe/tags.php?chlang=en),
[LMD search help](https://logic-masters.de/Raetselportal/Hilfe/suchen.php?chlang=en).

### Algolia InstantSearch routing

- The standard pattern: UI state ↔ a small "route state" ↔ URL. `stateToRoute` renames and
  drops defaults; `routeToState` parses back on load and on Back/Forward.
- Advice: put the main facet in the path (`/search/Cell+Phones/?query=galaxy&brands=Apple`),
  the rest in the query string, and keep search pages out of the index except chosen ones.
- Only changed values go in the URL, so default views have clean URLs.

Source: [Algolia routing guide](https://www.algolia.com/doc/guides/building-search-ui/going-further/routing-urls/js).

### Others

- **Hacker News:** `/front?day=2024-01-01` is the front page as it was that day, with links to
  the previous and next day, month and year. A frozen-by-date list with stepping. `from?site=x`
  is a live list of one site's stories, linked from every story's domain.
- **Bluesky custom feeds:** a feed is a stored record (name, description, owner) that points to
  a service. Paging uses an opaque cursor the service makes up; the docs suggest
  timestamp + id, like our feed's `before=`.
  ([docs](https://docs.bsky.app/docs/starter-templates/custom-feeds))
- **Are.na:** a block can be "connected" to many channels. Channels are open (anyone adds),
  closed (anyone sees, owner adds) or private. Shows how cheap "add to list" can be when the
  item already exists. ([help](https://help.are.na/docs/getting-started/channels))

## Part 2. Building blocks

Each is one piece. Systems in Part 3 combine them.

| # | Block | What it is | Seen at |
|---|---|---|---|
| 1 | Context param | puzzle URL carries where you came from: `?from=explore/akari` | YouTube `&list=`, Lichess theme path |
| 2 | Ids in URL | `?list=a,b,c` or `id:a,b,c`, order = list order | YouTube `watch_videos`, Linear `/issues/A,B` |
| 3 | Index in URL | `&index=3` | YouTube |
| 4 | Cursor next | next = first row after the current one's sort key; no index | inkit feed `before=`, Bluesky |
| 5 | Rank count | "3 of 41" by counting rows before the current one | (none show it for searches) |
| 6 | Typed search syntax | `akari easy by:wyatt sort:new` | GitHub, Gmail |
| 7 | Chips ↔ text | buttons and menus edit the text; the text is the truth | Gmail search options, GitHub filter bar |
| 8 | Filters as path | `/explore/akari/easy` | Letterboxd, Lichess, Algolia advice |
| 9 | Freeze by date | `before:2026-10-10` makes a live query stable | Gmail, HN `front?day=` |
| 10 | Id snapshot | `id:a,b,c` hand-picked or frozen | Linear |
| 11 | Short code | long list → `/l/x7k2m`, ideally derived from contents | YouTube `TLGG…` |
| 12 | Stored titled list | title, note, owner, landing page | Letterboxd, Codewars, LeetCode |
| 13 | Smart list | stored query, live | Apple Smart Playlist, Linear view, Reddit feed |
| 14 | Live/snapshot switch | one checkbox decides | Apple "Live updating" |
| 15 | Progress | "12 of 41 solved", percent | Letterboxd, LeetCode study plans |
| 16 | Play-through bar | "‹ 3 of 41 ›" above the puzzle, list drawer | YouTube panel, Lichess studies |
| 17 | Next after solve | the solve celebration offers Next (or goes on its own) | YouTube autoplay, Lichess |
| 18 | List landing page | a page of the list's cards with Start | YouTube `/playlist`, Codewars |
| 19 | Add-to-list button | on every puzzle, pick or make a list | Codewars Collect, YouTube Save |
| 20 | Lists tab on profile | | Letterboxd, Codewars |
| 21 | Lists in feed | a new public list shows in subscribers' feed | Letterboxd activity |
| 22 | Follow / copy a list | | Reddit, LeetCode fork |
| 23 | Generated list | daily set, "unsolved in your types", replay misses | Lichess, Spotify |

Notes that apply to any of them:

- **Deleted puzzles:** skip them and count only live ones. Don't show placeholders (YouTube's
  "[Deleted video]" is the bad example). If the current puzzle is gone, the page already 404s.
- **Moving data:** `sort:top` orders by likes, which keep changing, so its "3 of 41" drifts even
  with `before:`. Only `sort:new` (by `published_at, id`) and `id:` lists are truly fixed.
- **Search engines:** a puzzle with `?list=` should keep `<link rel=canonical>` at `/g/<id>`.
- **Repeats:** don't allow the same puzzle twice in an `id:` list. Then position is found from
  the id and no index is needed.

## Part 3. Four systems

Lightest first. Each later one contains the one before it.

### A. Back to where you came from (URL only)

**User:** opens a puzzle from Explore, a type page, a profile, a search or the feed. The puzzle
page shows "‹ 3 of 41 ›" for that place. After a solve, Next. Sharing the URL shares the list.
No new UI to learn.

**URLs:**
- `/g/abc?from=explore/akari?sort=new&level=1` (the page's own URL, encoded), or flatter:
  `/g/abc?from=akari&level=1`
- `/g/abc?from=@wyatt`, `/g/abc?from=q:star+battle`, `/g/abc?from=feed`
- hand-picked: `/g/abc?ids=abc,def,ghi`

**Server:** no tables. One function `neighbors(filter, gameId)` that reuses `listPuzzles`'s
filter: previous and next by keyset on the sort key, plus two `count(*)`s for "3 of 41". The
feed needs the viewer (signed out, it falls back to no bar). `game.tsx` reads the param.

**Pros:** small; uses what exists; every Explore link becomes a list.
**Cons:** live, so a shared link shifts as puzzles are published; ids lists are long and
untitled; one param format per source page.
**Like:** YouTube's `&list=`, Lichess themes, Reddit `/r/a+b`.

### B. Search is the list

**User:** one search box (Explore, type pages, profiles) that takes words and a few operators.
Chips and menus (type, level, quick, unsolved, sort, by) write into the box; typing in the box
moves the chips. The results page has "Play these" which opens the first puzzle with the bar.
"Share" copies a link with `before:<today>` added, so friends get the same 41.

**Syntax (small on purpose):** words; a type name (`akari`); `easy`/`medium`/`hard`; `quick`;
`unsolved`; `by:wyatt`; `sort:new|top`; `before:2026-10-10`; `id:abc,def,ghi`. No OR, no
parentheses. Unknown words stay plain words.

**URLs:**
- `/explore?q=akari+easy+by:wyatt`
- `/g/abc?q=akari+easy+by:wyatt+before:2026-10-10`
- `/g/abc?q=id:abc,def,ghi` (hand-picked)

**Server:** no tables. A pure, unit-tested `query.ts` (parse and print, round-trip), a query
builder that replaces `search()` and `listPuzzles()`'s split, and `neighbors()` from A. Type
pages and profiles become views of the same query (`/explore/akari` = `q=akari`).

**Pros:** one concept everywhere; shareable and freezable; the URL reads like what it is; no
storage or moderation.
**Cons:** syntax is a new thing to learn and to keep stable forever (GitHub's lesson); no
titles; `id:` links for long lists get long (10 chars per puzzle; 41 puzzles is ~450 chars,
fine; 200 is ~2.2k, still fine); younger players won't type operators, so chips must do it all.
**Like:** GitHub issues, Gmail, Linear's temporary filters, HN `front?day=`.

### C. Search plus saved lists

**User:** everything in B. From any search, or from a hand-picked set, "Save as list" asks for a
title (and an optional note), then gives `/l/x7k2m`. The list page shows the title, author,
cards, "12 of 41 solved" for the signed-in viewer, and Start. A list is either live (the query)
or fixed (ids), decided by whether the query has `before:`/`id:`, so there is no checkbox. The
profile gets a Lists tab. A long `id:` link can be shortened to `/l/<code>` without a title, like
YouTube's `TLGG` lists.

**URLs:** `/l/x7k2m` (landing), `/g/abc?l=x7k2m` (playing it).

**Server:** one table, `lists (id, owner_id null, title null, note, query text, created_at,
deleted_at)`. Untitled short links have no owner and dedupe by a hash of the query text, so the
same ids give the same code. Routes: `l/:id` page, a save action, delete. Puzzle page reads `l`
and runs the stored query. Progress = `solvedAmong` over the list's ids. Hand-picked lists are
still a query (`id:…`), so there is no items table. Editing a fixed list = edit its id text (or a
small add/remove UI that rewrites it).

**Pros:** titles, a short link, a page worth sharing, progress; still one engine (the query);
one table.
**Cons:** now there's content to moderate (titles, notes); dead lists accumulate; a live saved
list can change under the people who play it.
**Like:** Linear saved views, Apple Smart Playlists + regular playlists, LeetCode lists,
Letterboxd lists.

### D. Playlists like YouTube

**User:** a "Save to list" button on every puzzle (like Codewars Collect). Lists are ordered by
hand, with drag to reorder, a note per puzzle, maybe collaborators. Lists can be followed and
show in the feed; new public lists appear in subscribers' feeds; lists can be copied. Autoplay
Next after a solve.

**URLs:** `/l/<id>`, `/g/abc?l=<id>&i=3`, `/@wyatt/lists`.

**Server:** `lists` plus `list_items (list_id, game_id, pos, note)`, follows on lists, feed rows
for list publishes, reorder API, permission checks for collaborators, cleanup when puzzles are
deleted.

**Pros:** what people know from YouTube and Spotify; good for teachers and themed sets with
commentary per puzzle.
**Cons:** the most work; second ordering system beside search; more UI on every puzzle page;
moderation; most of it duplicates what an `id:` list in C already does.
**Like:** YouTube playlists, Codewars collections, Lichess studies, Spotify.

## Recommendation

Build **B**, with A as its first step, and add C's table only when people start sharing long
`id:` links or asking for titles. Skip D.

Why: inkit already has the pieces of B. Explore search, type pages and the feed are each a
filtered, ordered list; the feed already pages by `(published_at, id)`. Making the puzzle page
understand one query string gives next/back everywhere at once, with no storage. `before:` and
`id:` cover "share exactly these" without a table. C's table is small when it comes, because the
stored thing is just query text.

Keep the syntax tiny and never change the meaning of a word once shipped (GitHub). Chips are
the main UI; typing is for people who want it.

### Phases

1. **Next/back from where you came.** Puzzle cards on Explore, type pages, profiles and search
   link to `/g/<id>?q=<that page's query>`. The puzzle page shows "‹ 3 of 41 ›" and, after a
   solve, Next. `neighbors()` by keyset plus a count. Canonical stays `/g/<id>`. Deleted puzzles
   are skipped. Feed later (it needs the viewer).
2. **The query.** `app/app/lib/query.ts`: parse/print with tests; type pages and profile tabs
   become views of it; chips on Explore write into the box. Add `before:` and `id:`. "Share
   these" adds `before:<today>`.
3. **Hand-picked.** Select puzzles on any results page (or "Add to a new list" on a puzzle,
   kept in the URL) to make an `id:` link. Show solved progress on the bar: "3 of 41 · 12 solved".
4. **Saved lists (only if wanted).** The `lists` table, `/l/<code>`, titles, the Lists tab on
   profiles. Untitled short links dedupe by hash.
5. Later, if asked: lists in the feed, follow a list, a daily or "unsolved in types you play"
   generated list.

## Surprises

- YouTube's anonymous playlists still work signed out, and the `TLGG…` id is a hash of the
  ordered ids plus the date. A short link without a stored list row is possible.
- GitHub had to dark-launch a parser rewrite to avoid breaking old shared queries, and still
  changed one meaning. A query language is an API.
- Lichess, the closest to inkit, has no fixed lists for puzzles at all, only themes and
  "replay what you missed", and its users ask for a way to loop a set.
- Apple settles live vs snapshot with one checkbox. In B and C it falls out of the query
  (`before:`/`id:` means fixed), so no checkbox is needed.
- `sort:top` can't be frozen by date because likes keep changing. Freeze those as `id:`.
