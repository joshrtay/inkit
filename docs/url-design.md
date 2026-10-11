# URL design

How inkit's web addresses are made. Every new page, endpoint and query parameter follows these.
The routes are in `app/app/routes.ts`.

## Principles

1. **Shared things get short, permanent ids.** A puzzle is `/g/<id>`, a set `/s/<id>`. Titles
   never go in an address, so renaming something never breaks a link to it.
2. **Creators own the top level.** `/<handle>` is a person's profile (or a studio's). Everything
   else the site puts at the top level is reserved in `app/app/lib/names.server.ts`, and
   `tests/unit/reserved.test.ts` fails if a route in `routes.ts` isn't.
3. **Pages are nouns; steps on a thing hang off it.** `/g/<id>/draw`, `/g/<id>/publish`,
   `/<handle>/settings`.
4. **What only the site's own pages call lives under `/api/`**, so it never looks like a page or
   takes a page's name: `/api/feed`, `/api/sets`, `/api/sets/<id>`, `/api/bugs`, `/api/auth/*`.
   They answer with JSON. (A puzzle's like, solve and sketch, `/g/<id>/like|solve|sketch`, are
   actions on that page's own thing and stay with it.)
5. **The query string is a view of the page, never what the page is.** Filters, sort, search, a
   tab, the list you came from. Defaults are left out, and every page's canonical address has no
   query string.
6. **Each query parameter means one thing, everywhere** (the table below). A new one gets a row
   here before it's used.
7. **One address per page: lowercase words joined by hyphens, no slash at the end.** Anything else
   is sent there with a 301 (`app/app/lib/tidy-url.ts`, from `app/workers/app.ts`). File
   extensions only for files machines read (`/sitemap.xml`, `/robots.txt`, `/llms.txt`,
   `/puzzles/<kind>.md`).
8. **Links don't die.** Something that moves leaves a redirect behind (301 for a page, 308 for an
   endpoint, which keeps a POST's body); something deleted answers 410 Gone.

## The map

| Address | What |
|---|---|
| `/` | Signed in: the Subscriptions feed. Signed out: Explore (its canonical address) |
| `/explore` | Explore: shelves, or a search with `?q=` |
| `/explore/<kind>`, `/explore/all` | A type's puzzles (every type's: `all`), to browse |
| `/puzzles`, `/puzzles/<kind>` | The types and each one's rules, to learn. Learning and browsing are different pages on purpose; each links to the other |
| `/g/<id>` | A puzzle. Steps: `/draw` (paint), `/edit` (RYB's editor), `/publish`, `/preview` |
| `/s/<id>` | A set |
| `/<handle>` | A profile or a studio. `/<handle>/settings` |
| `/new` | Make a puzzle. `/studios/new`: make a studio |
| `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/account`, `/settings` | Accounts |
| `/privacy`, `/terms` | Legal |
| `/api/…` | What only the site's pages call (principle 4) |
| `/admin/…` | Admins' pages and JSON |

Old addresses that still work: `/feed` and `/bugs` (308 to `/api/…`), `/new/draw` (to `/new`),
`/new?in=<studio>` (to `/new?studio=<studio>`), wyattsgames.com (to `/wyatt`).

## Query parameters

| Name | Means | Where |
|---|---|---|
| `q` | search words (title and description; type names) | `/explore` |
| `in` | the list a puzzle was opened from: a type or `all`, `@<handle>`, `feed`, `today`, `quick`, `hard` (`lib/list-context.ts`) | `/g/<id>` |
| `set` | the set a puzzle was opened from | `/g/<id>` |
| `level` | difficulty: 1, 2 or 3 | type pages; with `in` |
| `sort` | `new` (the default) or `top` | type pages; with `in` |
| `period` | for `top`: `week`, `month` (the default) or `all` | type pages; with `in` |
| `quick` | `1`: about five minutes or less | type pages; with `in` |
| `unsolved` | `1`: only what the viewer hasn't solved | type pages; with `in` |
| `category` | a group of types (Shading, Lines, …), with `all` | `/explore/all`; with `in` |
| `n` | how many puzzles a type page shows (Show more) | type pages |
| `tab` | a profile's tab: `puzzles` (the default), `drafts`, `about`, `subscriptions`, `recommends`, `members` | `/<handle>` |
| `studio` | the studio to make a puzzle in | `/new` |
| `read` | open paint's reading panel (after a photo was read) | `/g/<id>/draw` |
| `next` | where to go after signing in | `/signin`, `/signup` |
| `before` | where the next page of the feed starts | `/api/feed` |
| `id`, `persona` | admin filters | `/admin/ai/schedule` |

Fragments name a place on a page and never change what it shows: `/explore#today`,
`/settings#recommendations`.
