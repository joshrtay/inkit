# AI creators

A small cadre of AI accounts that publish generated puzzles on a schedule. They look like any
creator (a profile at `inkit.games/<handle>`, a personal collection, subscribers, a place in
Explore and the feed, and their puzzles can be Featured) but carry an **AI** label everywhere
their name appears (`app/app/components/AiBadge.tsx`: profile header, game byline, cards, feed,
Explore rows), and their profile says how they make puzzles.

## Who they are

Each persona is data in [`app/app/ai/personas.ts`](../app/app/ai/personas.ts): handle (also its
id), name, bio, a "How I make puzzles" statement in its own voice (shown on the profile), the
genres it makes with generator settings (sizes from easiest to hardest; panel mixes, which can be
combined, "squares+stars"; rule settings for Panes, Abstract Art and the piece types; Hidoku and
Pythagorean Paths moves; Akari ciphers; `sequence` to take mixes in order), whether it keeps one
type all week (`oneTypeAWeek`), its schedule (weekdays or prime-numbered dates; a clock time or
sunrise at a place; a time zone), a difficulty scheme, its quality targets (solve profile gem /
flow / steady, clue density, symmetry preference, every kind needed, panel gap share and colours,
how many candidates per post) and a voice brief for Claude.

Difficulty schemes (`difficultyOf` in `schedule.ts`): `weekday` (a table), `lunar` (the moon's
phase), `tides` (the spring-neap fortnight), `steady` (with a fixed wobble), `month` (rising
through it), `season` (per hemisphere), `school-year` (September to June, a summer level),
`daylight` (the length of the day at a latitude, hardest at midwinter) and `digits` (the date's
month and day digits added up).

| Handle | Name | Makes | Posts | Difficulty | Writes like |
|---|---|---|---|---|---|
| `isola` | Isola | Panels, a teaching sequence: one new symbol a week, alone on Monday (3 × 3) and Wednesday, beside one older one on Friday (4 × 4) | Mon/Wed/Fri 18:30 Rome | weekday | a fabulist's inventories of an imaginary island |
| `pebble` | Pebble | tiny grids (≤ 5×5): Go-stone panels, Slitherlink, Star Battle, Hidoku, Easy as ABC, Square Jam | daily at sunrise in Kyoto | season | haiku economy |
| `night-clerk` | The Night Clerk | Sudoku, Thermo, Irregular | nightly 23:47 Los Angeles | steady, big wobble | hard-boiled noir |
| `granny-rect` | Granny Rect | one type a week (Shikaku, Square Jam, Spiral Galaxies, Aquarium, Easy as ABC), easy Monday to proper Friday | Mon–Fri 11:05 UK | weekday ramp | a recipe card |
| `lumen` | Lumen | Masyu, Slitherlink, Simple Loop, Simple Path | Mon/Wed/Fri/Sun 21:30 Auckland | lunar | attentive nature notes |
| `captain-tally` | Captain Tally | big grids: Nurikabe, Cave, Minesweeper, Star Battle | Tue/Sat 08:00 Halifax | tides | a ship's log |
| `bramble-and-burr` | Bramble & Burr | Panes rule mixes, in pairs | Tue (Bramble), Fri (Burr) 16:00 UK | Tuesday prickly, Friday kind | modernist repetition |
| `six-fifty-two` | The 6:52 | bite-size Sudoku, Binary Puzzle, Skyscrapers, Numberlink, Star Battle, Minesweeper | weekdays 06:40 Chicago | weekday, low | short declaratives |
| `quillwort` | Dr. Quillwort | Fillomino, Polyomino Packing, Connect the Critters, Find the Cut Line | Mon/Wed/Fri 10:30 Pacific | Wednesday's rare one | a field guide |
| `ottoline` | Ottoline | Binary Puzzle, Abstract Art, Akari ciphers, Pythagorean Paths | prime-numbered dates, 14:00 Lisbon | month | plain-spoken, darkly kind |
| `higgledy` | Higgledy | Sum Blobs, Hidoku, Honeycomb Paths, Hive, Number Fill-In | Mon/Tue/Thu 15:45 Toronto | school year | light comic verse |
| `ennor` | Ennor | Nikoli classics: Nurikabe, Shikaku, Hitori, Akari; few clues, symmetric | Wed/Sun 07:30 Faroe | steady | quiet clarity |
| `hester-vane` | Hester Vane | Nonograms of house-and-garden pictures (`puzzles/grid/pictures.ts`) | Thu/Sun 16:00 New York | daylight | dashes and slant rhyme |
| `freddie-plume` | The Hon. Freddie Plume | weekend-hard Star Battle, Aquarium, Wittgenstein Briquet, Spiral Galaxies | Sat/Sun 10:30 UK | Saturday hard, Sunday harder | comic country-house simile |
| `percival-hum` | Percival Hum | Skyscrapers, Easy as ABC, Numberlink, Minesweeper | Tue/Thu 16:42 Dublin | digits of the date | digressive deadpan |

Together they make every genre in `GENERATOR_GENRES` (the test asks for at least 80%), and no two
make the same mix. Twins and Triplets stays out while it's a work in progress (`WIP_KINDS`).

### Writing

Each persona writes in a recognisable *style*, never anyone's words, name or persona; names are
invented and nothing imitates a real setter, author or brand. The profile text and the voice
briefs avoid the tells of machine writing: no "delve", "tapestry", "journey", "embark",
"elevate", "seamless", "testament to", no "not just X but Y", no lists of three, no rhetorical
questions, and no em dashes except Hester Vane's, which are the point. The unit test checks the
words, the question marks and the dashes; week.ts's prompt tells Claude the same. Verse breaks
its lines with " / ", which the profile shows as line breaks.

### Icons

Each persona has an SVG mark in [`app/app/ai/icons.ts`](../app/app/ai/icons.ts) (`PERSONA_ICONS`,
keyed by handle), shown by `Avatar` (with `ai` set) wherever the account's avatar appears: the
profile, Explore, the feed. The AI label stays beside the name. The marks are drawn in a 48-unit
box with the four pen weights and the colour tokens only (pen ink, sumi, shell, washes, seal
red), each on a ground of its own so it reads on the light page and the dark one. The contact
sheet, [`docs/ai-creators-sheet.html`](ai-creators-sheet.html), shows them all at 24, 40 and 96 px,
light and dark; rebuild it with `node puzzles/ai/sheet.ts`.

Accounts: `creators` rows with `is_ai` set, id `ai-<handle>`, an `.invalid` email and no
password, so they can't sign in; each has a personal collection (`c-ai-<handle>`) whose title
and description are the persona's name and bio. The admin endpoint creates or updates them
(`ensurePersona` in `app/app/lib/ai.server.ts`) every time it queues a post, and refuses if a
person already has the handle. Locally, `app/seed/make.py` adds them.

## The weekly pipeline

1. **GitHub Actions** (`.github/workflows/ai-week.yml`, Sundays 22:00 UTC, or by hand) runs
   [`puzzles/ai/week.ts`](../puzzles/ai/week.ts) against inkit.games.
2. For every persona that isn't paused and every post in the next 7 days (`slotsBetween` in
   [`app/app/ai/schedule.ts`](../app/app/ai/schedule.ts), in the persona's time zone), it picks a
   genre and settings (seeded by the persona and date, so a rerun picks the same; a pair shares
   the week's rule mix, the second on the transposed board), and the day's target difficulty.
3. It makes several candidates with the generator (`puzzles/grid/generate.ts`, the same code
   as `npm run new`; each already minimal: no clue can be removed), scores each with the
   pluggable scorer ([`puzzles/ai/score.ts`](../puzzles/ai/score.ts)), drops those below the
   persona's quality bar, and keeps the one closest to the target.
4. It proves the puzzle has one solution (clingo, `solve(p, 2)`; a panel needs a line), asks
   Claude Sonnet 5.5 for a title and a short description in the persona's voice (given the type,
   size, clue count, difficulty, day, moon or tide, and the titles it used lately), and POSTs it to
   `/admin/ai/schedule` with the sketch's hash and solution count as proof.
5. The endpoint checks the token, the persona, the sketch (it must parse, and be a genre the
   persona makes), the proof (bound to this exact sketch), and the time, then stores a **draft**
   with `publish_at` set. A post for the same persona at the same time is skipped, so the batch
   can run twice safely.
6. The Worker's **cron** (`triggers` in `app/wrangler.jsonc`, every minute; `scheduled` in
   `app/workers/app.ts`) publishes drafts whose `publish_at` has come (`publishDue`): state
   published, `published_at` set to the scheduled time, `publish_at` cleared. That's one indexed
   query a minute; nothing heavy runs on the Worker.

Dry run, to see a week without Claude or the site (writes JSON to `archive/ai-week/<date>/`):

```sh
node puzzles/ai/week.ts --dry-run                    # everyone
node puzzles/ai/week.ts --dry-run --persona isola    # one
```

Against the local site: put an `ADMIN_API_TOKEN` (32+ characters) in `app/.dev.vars`, run
`npm --prefix app run dev`, then `ADMIN_API_TOKEN=... ANTHROPIC_API_KEY=... node puzzles/ai/week.ts --persona pebble`
(default `--site` is `http://localhost:5173`). The local cron doesn't fire on its own; run it with
`curl "http://localhost:5173/cdn-cgi/handler/scheduled"`.

## Backfilling

So that each persona starts with a couple of months behind it, `puzzles/ai/backfill.ts` makes
every post it would have made over the last 61 days, through yesterday in its own time zone
(`backfillSlots` in `schedule.ts`: the live `slotsBetween`, so the slots are the same ones, with
sunrise, prime dates, the moon and clock changes included). Each post uses that date's difficulty
and is made the way the weekly batch makes it (`puzzles/ai/make.ts`, shared with `week.ts`: the
plan, the candidates, the scorer and Claude's prompt). Posts are made oldest first within a
persona, so a teaching sequence (Isola's symbol of the week) and a pair's answer follow on. No
puzzle is used twice by one persona, and a title too like an earlier one (`app/app/ai/titles.ts`)
is sent back to Claude, at most twice. The batch is written to `puzzles/ai/out/backfill.json`
(gitignored) after every post, so a stopped run carries on where it left off.

```sh
node puzzles/ai/backfill.ts --dry-run                 # the slots per persona: date, time, difficulty, genre; the Claude estimate
node puzzles/ai/backfill.ts --no-text --jobs 6        # the puzzles only, placeholder words, no Claude
ANTHROPIC_API_KEY=... node puzzles/ai/backfill.ts --jobs 6   # the words (keeps puzzles already made)
ADMIN_API_TOKEN=... node puzzles/ai/send-backfill.ts --site https://inkit.games --dry-run
ADMIN_API_TOKEN=... node puzzles/ai/send-backfill.ts --site https://inkit.games
```

Other flags: `--persona a,b`, `--days n`, `--now <ISO>`, `--out <file>`; the sender takes
`--file`, `--batch` and, for a local site only, `--allow-placeholders`. It sends to
`POST /admin/ai/backfill` (admin token), which checks each post as a scheduled one is checked
(`checkBackfillPost` in `request.ts`: an AI persona, the sketch, its genre, the proof of one
solution for this sketch) and also that the time is in the past and is one of the persona's
posting times. It inserts the post as published with its created, updated and published times
all at the slot, and moves the account's and collection's created time back to its first post.
A post whose slot (persona and instant) is already taken is skipped, so sending twice is safe; the
same puzzle at another slot is refused. The feed, the profile and the sitemap order by the
published time, so backfilled posts sit in the past rather than at the top.

## Scoring

`Scorer` is `(candidate, persona, slot) => { difficulty, quality, notes, measures }`. Today's
`proxyScorer` estimates difficulty in two parts. The **logic** comes from board size (within the
persona's range), clue sparsity and clingo's search statistics (choices, conflicts). The **rule
load** (`ruleLoad`) is how many rules or kinds of symbol a solver has to hold in mind, which makes
a puzzle hard for newcomers even when every step is easy: a panel's distinct symbol kinds
(squares, stars, triangles, shapes, hollow shapes, erasers, dots, symmetry) plus 0.15 for each
symbol colour beyond two; each rule a Panes puzzle lists; a Sudoku's added constraints
(thermometers, irregular areas, diagonals); otherwise the distinct clue kinds plus any rule
beyond the genre's own, a third colour or a cipher; 1 for a plain genre. `withRuleLoad` joins
them, `1 − (1 − logic)(1 − 0.7 · min(1, (load − 1) / 3))`: one rule leaves the logic alone, and
four or more put even an easy board at 0.7 or above. The measures and notes record `logic`,
`ruleLoad` and `ruleTerm`. Quality comes from the persona's targets: clue density, clue-layout
symmetry, the solve profile as far as clingo can tell, panel gap share and colours, the caps on
rule load (`maxRuleLoad`) and crowding (`maxSymbolShare`, symbols per cell), and "every kind
needed" (drop all clues of one kind; if it's still unique, that kind was decoration).

Targets lean easy (the owner's rule: err on the easy side). No persona's day is above 0.7 (Freddie
Plume's Sunday, the hardest), and every one but Freddie has days at 0.2 or below. Isola's Monday
is one symbol on a 3 × 3, Wednesday the same symbol on a 3 × 4 or 4 × 4, Friday that symbol beside
one earlier symbol, almost always on a 4 × 4. To check by eye, `npx tsx puzzles/ai/difficulty-sheet.ts`
writes [`docs/ai-creators-difficulty.html`](ai-creators-difficulty.html) from a backfill file:
each persona's easiest and hardest puzzle, with its target, score and rule load. A step-by-step deduction solver (difficulty profile, flow vs gem, entry
points, clue usage: panel-design §3 and §9, design-grant "for inkit") and later a learned scorer
will replace it; they read the same persona targets.

## Costs

About 50 posts a week. Claude: one call per post at low effort, roughly 600 input and 150 output
tokens, so a few cents a week at Sonnet 5.5's $2 / $10 per million tokens (the script prints the
week's tokens and cost). GitHub Actions: generation is the slow part (big Panes, Shikaku and 6×6
panels take up to a minute or two per candidate); a week takes well under the job's 5-hour limit.
The Worker's cron costs one D1 query a minute.

## Adding a persona

Add an entry to `PERSONAS` (a handle no person has: check `inkit.games/<handle>` first) and its
icon to `PERSONA_ICONS`, with
genres the generator makes and sizes it makes in reasonable time (try
`node puzzles/ai/week.ts --dry-run --persona <handle>`). Run `npm --prefix app test` (the
persona checks) and `python3 app/seed/make.py` for local data. The account appears on the
site the first time the batch queues a post for it.

## Pausing one

Set `paused: true` on the persona: the batch stops making its posts and its profile says it's
paused. Posts already queued still go up; to take them off the queue:

```sh
curl -X DELETE -H "Authorization: Bearer $ADMIN_API_TOKEN" "https://inkit.games/admin/ai/schedule?persona=<handle>"
```

They stay as drafts (visible to admins in the persona's Drafts tab). `GET /admin/ai/schedule`
lists everything queued and the last week's posts. To pause them all, disable the workflow in
GitHub (Actions → AI creators' week → Disable).
