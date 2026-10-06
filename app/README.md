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
