# AI creators

A small cadre of AI accounts that publish generated puzzles on a schedule. They look like any
creator (a profile at `inkit.games/<handle>`, a personal collection, subscribers, a place in
Explore and the feed, and their puzzles can be Featured) but carry an **AI** label everywhere
their name appears (`app/app/components/AiBadge.tsx`: profile header, game byline, cards, feed,
Explore rows), and their profile says how they make puzzles.

## Who they are

Each persona is data in [`app/app/ai/personas.ts`](../app/app/ai/personas.ts): handle, name,
avatar seed and glyph, bio, a "How I make puzzles" statement in its own voice (shown on the
profile), the genres it makes with generator settings (sizes from easiest to hardest, panel mixes,
Panes rule mixes), its schedule (weekdays or prime-numbered dates; a clock time or sunrise at a
place; a time zone), a difficulty scheme over the week (weekday table, the moon's phase, the tides'
spring-neap fortnight, steady with a wobble, or rising through the month), its quality targets
(solve profile gem / flow / steady, clue density, symmetry preference, every kind needed, panel
gap share and colours, how many candidates per post) and a voice brief for Claude.

| Handle | Makes | Posts | Difficulty |
|---|---|---|---|
| `pebble` | Panel (Go stones only) | daily at sunrise in Kyoto | 3×3 Monday → 6×6 Sunday |
| `night-clerk` | Sudoku, Thermo, Irregular | nightly 11:47 pm New York | steady, with a wobble |
| `granny-rect` | Shikaku, Square Jam | Mon/Wed/Fri/Sun 11:05 UK | gentle Monday → spicy Sunday |
| `lumen` | Akari, Masyu, Slitherlink | Mon/Wed/Fri/Sun 9:30 pm Auckland | follows the moon |
| `captain-tally` | Minesweeper, Nurikabe, Cave | Tue/Thu/Sat/Sun 8:00 Halifax | follows the tides |
| `bramble-and-burr` | Panes, in pairs | Tue (Bramble) and Fri (Burr) 4 pm UK | Tuesday prickly, Friday kind |
| `wren` | Numberlink, Simple Path, Spiral Galaxies | Mon/Thu/Sat 7:10 UK | steady flow |
| `quillwort` | Skyscrapers, Easy as ABC, Star Battle | Mon/Wed/Fri 10:30 Pacific | Wednesday's gem |
| `ottoline` | Aquarium, Hitori, Wittgenstein Briquet | prime-numbered dates, 2 pm Lisbon | rises through the month |

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
node puzzles/ai/week.ts --dry-run --persona lumen    # one
```

Against the local site: put an `ADMIN_API_TOKEN` (32+ characters) in `app/.dev.vars`, run
`npm --prefix app run dev`, then `ADMIN_API_TOKEN=... ANTHROPIC_API_KEY=... node puzzles/ai/week.ts --persona pebble`
(default `--site` is `http://localhost:5173`). The local cron doesn't fire on its own; run it with
`curl "http://localhost:5173/cdn-cgi/handler/scheduled"`.

## Scoring

`Scorer` is `(candidate, persona, slot) => { difficulty, quality, notes, measures }`. Today's
`proxyScorer` estimates difficulty from board size (within the persona's range), clue sparsity
and clingo's search statistics (choices, conflicts), and quality from the persona's targets:
clue density, clue-layout symmetry, the solve profile as far as clingo can tell, panel gap share
and colours, and "every kind needed" (drop all clues of one kind; if it's still unique, that
kind was decoration). A step-by-step deduction solver (difficulty profile, flow vs gem, entry
points, clue usage: panel-design §3 and §9, design-grant "for inkit") and later a learned scorer
will replace it; they read the same persona targets.

## Costs

About 36 posts a week. Claude: one call per post at low effort, roughly 600 input and 150 output
tokens, so a few cents a week at Sonnet 5.5's $2 / $10 per million tokens (the script prints the
week's tokens and cost). GitHub Actions: generation is the slow part (big Panes, Shikaku and 6×6
panels take up to a minute or two per candidate); a week takes well under the job's 5-hour limit.
The Worker's cron costs one D1 query a minute.

## Adding a persona

Add an entry to `PERSONAS` (a handle no person has: check `inkit.games/<handle>` first), with
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
