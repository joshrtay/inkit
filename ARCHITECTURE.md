# Architecture

inkit (https://inkit.games) turns hand-drawn logic puzzles into games: a creator draws a puzzle on
paper and uploads a photo, Claude reads it into a draft, the creator checks and edits it on the
puzzle itself, and publishes it once it has exactly one solution. Players solve puzzles in the
browser, subscribe to creators, and like puzzles.

## Folder layout

| Path | What |
|---|---|
| `app/` | The site: React Router on Cloudflare Workers, with D1 (database), R2 (sketch photos) and Cloudflare Email |
| `src/engine/` | The grid puzzle engine: geometry, genres, rules, encoding to clingo, solving ([docs/grid-engine.md](docs/grid-engine.md)) |
| `src/game-types/grid/` | The in-browser player (`game.ts`, `figure.ts` for Three Coats) and the still-picture renderer (`picture.ts`) with its styles |
| `src/guides/` | The puzzle-type guides: rules with ✓/✗ pictures, origins, worked examples |
| `src/games/` | Example puzzles per type (JSON): the guides' worked examples and the site's seed data |
| `src/lib/` | The game interface (`game-api.ts`) and the watercolor wash filter (`ink.ts`) |
| `src/styles/global.css` | Shared look: paper, ink, fonts, light and dark |
| `puzzles/grid/` | Tools: `new.ts` makes a new example puzzle of any type (proved unique), `guides.ts` checks every guide picture and solves the examples |
| `docs/` | The grid engine in depth, including how the editor must keep up with it |

The root `package.json` covers the shared code (`npm run build` type-checks it, `npm run
selftest` checks the engine against brute force, `npm run guides`, `npm run new`) and makes the
site an npm workspace, so one `npm install` in the root installs both.

## The site (`app/`)

**The model** (`app/db/schema.ts`, Drizzle on D1): *creators* (handle, name, admin), *collections*
(every creator has a personal one at their handle; studios exist but are set aside for now),
*memberships*, *games* (a permanent `/g/<id>`, the sketch that is their "code", draft / published /
hidden, Claude's latest reading and doubts), *subscriptions*, *likes*, *solves* (a signed-in
player's, not the author's own: a check on the puzzle's card, counts on puzzles and profiles), and
the *Featured* shelf.
Rules the database can't express are in `app/lib/permissions.server.ts`.

**Sketches** (`app/games/sketch.ts`): a genre on the first line, then the puzzle as JSON (size,
givens, areas, picture, rules). The engine checks and plays it. Creators never see this text.

**Pages**: Subscriptions (the home feed), Explore (creators), Puzzle types (`/puzzles`, the
guides), profiles at `/<handle>` (Puzzles, Drafts for the owner, Subscriptions), games at
`/g/<id>`, Create (`/new`), Settings (`/settings`: profile, email, password, handle, appearance),
sign-in (Better Auth: email + password, Google), privacy and terms. The left nav
(`components/Shell.tsx`: Subscriptions, Explore, Profile, Create, and More at the bottom with
Settings, Puzzle types and Sign out) frames every page except the editor.

**Reading a drawing** (`app/lib/read-sketch.server.ts`): Claude reads the photo into a structured
reading (type, size, clues, rules, and doubts, each tied to a square, a line's clues, rows,
columns, an area or the whole puzzle). A quick reader (Claude Sonnet) goes first and a careful one
(Claude Opus) takes over when the reading looks shaky, and for every re-read. Only the puzzle's part of the photo is kept (Claude says where it is; `lib/photos.server.ts`
crops it). A re-read can carry
the creator's corrections, or a type they chose (with that type's guide). While it reads, the
reading screen (`components/ReadingScreen.tsx`) shows the photo being scanned, cycling words, and
one puzzle fact.

**The editor** (`/g/<id>/edit`, `components/GameEditor.tsx`): a page of its own, after Substack's
post editor. Top bar: back, save status, the one-solution check (live, clingo in the browser),
Preview and Publish. Toolbar: the puzzle type, then the type's tools. The page: title and
description, the puzzle edited in place (`components/BoardEditor.tsx`, tools per type), the drawing
in the left margin, Claude's doubts in the right margin as a checklist pinned to the board. Undo
and Reset sit bottom left. Drafts save themselves; publishing needs exactly one solution. Preview
shows the real page (`/g/<id>/preview`) at desktop or phone width. Three Coats keeps its figure
editor (`components/FigureEditor.tsx`); Panes, and admins, get a Rules panel; admins a Look panel.

**Deploying**: pushes to `main` deploy once GitHub's tests pass (type checks, unit and browser
tests, the engine self-test); see [docs/deploy.md](docs/deploy.md), which also covers rolling back.
The Worker serves inkit.games, and redirects wyattsgames.com (Wyatt's old site) to his profile.
Running it locally: see `app/README.md`. The sketch reader, its record of every read and its
evaluation: [docs/reader.md](docs/reader.md).

## The game interface

The player is plain TypeScript and SVG. Solving plays `celebrate.ts`: the ink bursts out of the
board, which goes gray, and gathers into a check that settles on the board's corner. It plugs into a page through `src/lib/game-api.ts`:

```ts
export type MountGame = (root: HTMLElement, host: GameHost) => void | (() => void);

interface GameHost {
  id: string;
  load<T>(): T | null;                // saved progress (this browser only)
  save(state: unknown): void;
  clear(): void;
  solved(result?: Record<string, unknown>): void;
}
```

The site's host (`app/app/lib/host.ts`) keeps progress in localStorage; the preview's host saves
nothing.

## Look

Ballpoint pen on white paper, after the game Inked: a faint cloudy paper texture, boards in ink
with a slight pen wobble, and watercolor washes for every fill (`addInk()` in `src/lib/ink.ts`).
Clues are handwritten (Kalam); the site is Nunito, with Kaushan Script for the logo. Dark is the
default, with Light and Match device in the More menu.
