# Wyatt's Games: the social site (work in progress)

A React Router app on Cloudflare Workers, with D1 (database) and R2 (thumbnails). It reuses
the current site's game engine and styles from `../src`, so games play the same.

**The model** (`app/db/schema.ts`): *creators* (handle, display name, admin, deleted),
*collections* (studios that own games; every creator has a personal one at their handle),
*memberships* (owner or contributor), *games* (a permanent `/g/<id>` address, the sketch that
is their "code", its format version, and draft / published / hidden), and the *Featured*
shelf. Rules the database can't express are in `app/lib/permissions.server.ts`.

**Sketches** (`app/games/sketch.server.ts`): a genre on the first line, optionally with a rule
list (`panes: size 4, twins`), then the puzzle as JSON (size, givens, ...). The grid engine
(`../src/engine`, see `../docs/grid-engine.md`) checks and plays it.

**Making games from a drawing** (`/new`): upload a photo of a hand-drawn puzzle. Claude
(`app/lib/read-sketch.server.ts`) reads it: a quick reader (Claude Sonnet 5.5) first, and a careful
one (Claude Opus 5.5, high effort) when the quick reading looks shaky (the reader wasn't sure, it
doesn't parse, or a sanity check fails) and for every re-read with corrections. It reads it into a structured description
(game type, size, the clues the player starts with, rules, notes about anything uncertain),
which becomes a draft. On its edit page the creator compares the reading with the photo
(`ConfirmDrawing.tsx`): confirm it, fix it in the visual clue editor (`GivensEditor.tsx`: grid
size, rocks, walls, numbers, diamonds, symbols, compasses, picture cells, Panes rules), or say what's
wrong and Claude reads it again with those corrections. Then the one-solution check, and publish. The photo is kept in R2 and shown at
`/g/<id>/sketch`. Needs `ANTHROPIC_API_KEY`.

**Editing a game** (`/g/<id>/edit`, `GameEditor.tsx`): the puzzle (beside its drawing, if it
has one), "Fix the clues" for the visual editor, title and description, the one-solution check
(clingo in the browser, `count-solutions.client.ts`), and save / publish. Publishing, or saving a
published game with changed clues, needs that check for the exact puzzle being saved. Authors
(while members) and owners edit; owners and admins take games down with a note (only admins
restore an admin's take-down); admins curate Featured. See `app/lib/games.server.ts`. Creators
never see the sketch text: Claude writes it from the drawing and the editor rewrites it.

**The visual puzzle editor** (`PuzzleEditor.tsx`) is the only way to change a puzzle, so it covers
everything the grid engine can express. Whenever the engine gains a genre, clue kind, rule, setting,
style option or mark, add it to the editor and to the sketch reader in the same change; their
coverage tables are typed against the engine, so the type check fails until you do (see
`../docs/grid-engine.md`, "The visual editor").

**Collections** (`/studios/new`, `/<slug>/settings`): anyone starts a studio as its owner;
owners rename it, add creators by handle as owners or contributors, change roles and remove
members; members leave (keeping their games' credit); owners delete studios (games go
offline). A collection always keeps an owner. See `app/lib/collections.server.ts`.

**Sign-in** (`app/lib/auth.server.ts`): Better Auth, email + password, and Google when
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set.

## Running it locally

```sh
npm install
cp .dev.vars.example .dev.vars      # then put a random BETTER_AUTH_SECRET in it
npm run db:migrate && python3 seed/make.py && npm run db:seed
npm run dev                         # http://localhost:5173
```

After changing `app/db/schema.ts`, run `npm run db:generate` and `npm run db:migrate`.
`npm run typecheck` checks everything. Nothing is deployed yet: that needs the D1 database
and R2 bucket created in Cloudflare, and the real `database_id` in `wrangler.jsonc`.
