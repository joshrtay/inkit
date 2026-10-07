# Deploying inkit

inkit.games is one Cloudflare Worker (named `wyattsgames`, from before the rename) with a D1
database (`wyattsgames-db`), an R2 bucket for photos (`wyattsgames-media`) and Cloudflare Email.
The Worker also answers for wyattsgames.com and www.wyattsgames.com, redirecting both to
inkit.games/wyatt.

## How a change goes live

Push to `main`. GitHub (`.github/workflows/deploy-inkit.yml`) then:

1. **Tests** (every push and pull request, any branch): the shared code's type check and the
   engine self-test, the site's type check, unit tests, and the browser tests against a local copy
   of the site.
2. **Deploys** (pushes to `main` only, once the tests pass): applies new D1 migrations to the live
   database, then builds and deploys the Worker.

Migrations run before the new code, so they must work with the code that's still live for the
minute in between: add tables and columns freely; don't drop or rename one in the same change as
the code that stops using it (stop using it first, then drop it in a later change).

The repo needs the secret `CLOUDFLARE_API_TOKEN` (a token allowed to edit Workers, Workers
Routes and D1 on the account) and the variable `CLOUDFLARE_ACCOUNT_ID`.

## The Worker's secrets

Set with `npx wrangler secret put <NAME>` in `app/` (never committed):

| Secret | |
|---|---|
| `BETTER_AUTH_SECRET` | signs sessions |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `ANTHROPIC_API_KEY` | the sketch reader |
| `ADMIN_API_TOKEN` | the admin endpoints (`/admin/...`), for scripts and Claude |

## Rolling back

- **Code:** `npx wrangler deployments list` shows recent versions; `npx wrangler rollback
  [<version-id>]` puts an earlier one back (in `app/`). Then revert the commit on `main`, or the
  next push deploys it again.
- **Data:** D1 keeps 30 days of history. `npx wrangler d1 time-travel info wyattsgames-db`
  shows a point to go back to; `npx wrangler d1 time-travel restore wyattsgames-db --timestamp=<when>`
  restores the whole database to it (everything after is lost, so export first:
  `npx wrangler d1 export wyattsgames-db --remote --output=backup.sql`).
- **Photos** in R2 are never deleted by the site, so they survive a rollback.

## Deploying by hand

From `app/`, signed in with `npx wrangler login`: `npm run db:migrate:remote`, then `npm run
deploy`. Prefer pushing to `main`, so the tests run first.
