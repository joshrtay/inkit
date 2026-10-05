# Architecture

Wyatt's Games is a static website of puzzle games, built with
[Astro](https://astro.build) and published to GitHub Pages at
https://wyattsgames.com/.

## Site structure: game types and numbered instances

| URL | Page |
|---|---|
| `/` | Home: a card for each listed game type |
| `/<type path>/` | That type's numbered games, e.g. `/number-line-maze/` |
| `/<type path>/<n>/` | Play one, e.g. `/number-line-maze/2/` |

The code separates **game types** (reusable) from **instances** (data):

| Type (URL path) | Code id | What an instance supplies |
|---|---|---|
| Escape Room (`escape-room`) | `packet` | Printable sheets (PDFs) and the final answer |
| Number Line Maze (`number-line-maze`) | `number-maze` | A grid of numbers, entrance, exit, any hint walls |
| Three Coats (`three-coats`) | `ryb` | Polygon pieces with clue dots (1 red, 2 yellow, 3 blue) |
| Round the Bend (`round-the-bend`) | `lazy-river` | A grid of white and black cells, plus walls |
| Picture Squares (`picture-squares`) | `mosaic` | A pixel-art picture drawn as letters, plus a color for each letter |

Types are declared in `src/games.ts` (`gameTypes`: name, card text, cover, listed).
Each instance is `src/games/<type path>/<n>.json`; the number is the file name. Adding
another game of an existing type needs no code, only a JSON file and its content.

Current instances: escape-room 1 (The Envelope); number-line-maze 1 (Warm-up, 5 × 5)
and 2 (The Big Maze, fitted to the game 2 sketch); three-coats 1–3 (Triangle, Hexagon,
Nine Squares) and 4–6 traced from the game 2 shapes sketch (Square in a Kite, Envelope,
House); round-the-bend 1–4 from the game 2 grids sketch; picture-squares 1–5 drawn here
and 6–8 from the mosaic sketch (POP, BOB, a trophy). Game lists show the newest first.
Old `/ryb/` links redirect to `/three-coats/` (`astro.config.mjs`).

## How the pieces fit

```
sketches (scans/, not in git)
        │
        ▼
src/games/<type>/<n>.json ── instance data ────────────────────────────┐
        │                                                              │
        ▼  npm run puzzles (puzzles/build.py)                          │
  escape-room: puzzles/<type>/<n>/*.py → HTML → Chrome → public/<type>/<n>/sheets/
  number-maze: puzzles/lib/number_maze.py proves one solution          │
                                                                       ▼
src/pages/[type]/[n]/index.astro → src/game-types/<id>/Game.astro (+ game.ts in the browser)
        │   (ryb, lazy-river and mosaic levels are solved here; the build fails unless each has one solution)
        ▼  npm run build (Astro) → dist/ → GitHub Actions → GitHub Pages
```

`npm run puzzles` (Python, on your machine) makes and checks puzzle content; its
output is committed. `npm run build` (Astro) type-checks and builds the site; GitHub
Actions runs it on every push to `main`.

## Folder layout

| Path | What lives there |
|---|---|
| `src/games.ts` | Game types, instance loading and their TypeScript types. |
| `src/games/<type>/<n>.json` | One instance: `type` (code id), `name`, optional `meta` and `intro`, and the type's data. |
| `src/game-types/<id>/` | A game type: `Game.astro` (page), `game.ts` (browser code), `styles.css`, `types.ts`. |
| `src/pages/index.astro` | Home: game type cards. |
| `src/pages/[type]/index.astro` | A type's numbered list. |
| `src/pages/[type]/[n]/index.astro` | Plays an instance with its type's `Game.astro`. |
| `src/layouts/Base.astro` | Every page's shell: `<head>`, fonts, global styles, and the top nav (Wyatt's Games on the left, login on the right). |
| `src/layouts/GameShell.astro` | Frame for game pages: back link, title, game, then directions. |
| `src/styles/global.css` | Color and font tokens (light and dark), base styles, shared `.btn`, `.rules`. |
| `src/lib/game.ts` | The game interface (`GameHost`, `MountGame`, `createHost`). |
| `src/lib/paths.ts`, `src/lib/hash.ts`, `src/lib/progress.ts` | `url()` (builds links from the site root); `sha256()`; which games the player has finished. |
| `src/components/Check.astro` | The animated check mark for finished games. |
| `src/lib/account.ts`, `src/components/Account.astro` | Player login (name + PIN) and cloud sync of progress. |
| `worker/` | Cloudflare Worker API for accounts and saves, backed by R2. |
| `public/<type>/` | Static files: type cover; `<n>/sheets/` PDFs and previews for escape rooms. |
| `puzzles/build.py` | Builds and checks puzzle content for every instance. |
| `puzzles/covers.py` | Renders every game type's cover image from real puzzles and sheets (`npm run build` first). |
| `puzzles/<type>/<n>/` | Sheet sources for one escape room: generator scripts and `sheets/*.html`. |
| `puzzles/lib/number_maze.py` | Number-maze logic: board, carving, solver, checker, sketch fitting. |
| `puzzles/number-maze/` | `new.py` (generate), `fit.py` (fit to a sketch), `check.py` (validate). |
| `scans/`, `archive/` | Original sketches, transcriptions and old copies. Ignored by git (the repo is public). |

## Game types

### Escape Room (`packet`)

```json
"packet": { "answer": "74992", "sheets": [ { "id": "page-1", "name": "Page 1", "kind": "algebra", "file": "equations", "note": "..." } ] }
```

A sheet viewer (list, preview, Prev/Next, Print (PDF) link, `#id` deep links) and an
answer check. Each sheet's PDF is `public/escape-room/<n>/sheets/<file>.pdf`, made by
scripts in `puzzles/escape-room/<n>/` or dropped in as PDFs; `npm run puzzles` makes
the previews. Only a SHA-256 hash of the answer reaches the browser.

### Number Line Maze (`number-maze`)

```json
"maze": { "clues": [[2, 2, 3], ...], "entryCol": 9, "exitRow": 13, "hints": [[[r, c], [r, c]], ...] }
```

Numbers sit on the corners of a grid of squares; lines between them are walls.
Phase 1: draw walls so each number has that many touching it, including the outside
edge, which is wall everywhere except the entrance (top, above square column
`entryCol`) and exit (right, beside square row `exitRow`). Walls never loop and all
connect to the edge: exactly a perfect maze. Only `hints` start drawn. Phase 2: drag
a line through the open squares from entrance to exit.

`puzzles/lib/number_maze.py`: `check()` proves one solution (or suggests hint walls),
`generate()` makes a random maze, `fit()` finds the valid maze closest to a sketch.

### Three Coats (`ryb`)

```json
"ryb": { "pieces": [ { "points": [[0, 0], [10, 0], [10, 10], [0, 10]], "clue": "113", "hidden": true } ],
         "totals": { "1": 4, "2": 1 }, "hearts": 3 }
```

Based on FLEB's RYB (https://fleb.itch.io/ryb); renamed because that name is taken. A figure is cut into polygon pieces
(any coordinates; the board is scaled to fit). Paint every piece 1 red, 2 yellow or
3 blue (instance files use the digits; players only ever see colors, and pick them
with buttons or the keys R, Y, B). A clue is a string of dots: `"113"` means at least
two neighbors are red and at least one is blue; each dot needs its own neighbor. Neighbors share part of an edge,
computed from the polygons. A wrong color is rejected and costs a heart; correct
pieces lock in. `hidden` clues appear only once their piece is painted. Optional
`totals` show how many of each color are left to place.

`src/game-types/ryb/solver.ts` solves each level during the build; the build fails
unless there is exactly one solution. To make a level from a drawing, trace each
shape's corners into `points` and copy its numbers into `clue`.
`puzzles/three-coats/from_sketch.py` does this for the game 2 shapes sketch (levels 4–6):
overlapping outlines become separate pieces (the House leaves out its drawn circles and
splits its left triangle so no two pieces share the same neighbors), every drawn dot is kept, and the fewest extra dots
are added, avoiding slivers, until there is one solution reachable without guessing.
Dots are drawn at each piece's roomiest interior point.

### Round the Bend (`lazy-river`)

```json
"river": { "grid": [".......", ".#.....", "..."], "walls": [[[0, 4], [1, 4]], ...] }
```

A clone of Inkwell Games' Loopy River (the classic Japanese "Simple Loop"), under its own name. Draw one
closed loop through the centre of every white cell (`.`): no branches, crossings or
separate loops; it skips black cells (`#`) and never crosses a wall (a pair of
neighbouring cells). Drag between cells to draw or erase, tap a border for an X;
Undo, Check and Reset; it checks itself once every cell is filled, against the one
solution found at build time (`src/game-types/lazy-river/solver.ts`; the build fails
unless there is exactly one loop). `puzzles/lib/lazy_river.py` has the same solver plus
`fit()`, which turns a traced sketch into a level by adding the fewest walls (and, if
no loop fits at all, toggling a black cell). `puzzles/round-the-bend/from_sketch.py` made
levels 1–4 from the game 2 grids sketch.

### Picture Squares (`mosaic`)

```json
"mosaic": { "title": "Apple", "picture": [".....b....", "..rrbrrr..", "..."],
            "palette": { ".": "#e3f2f6", "r": "#d8443a", "b": "#6b4a2b" } }
```

A clone of Inkwell Games' Mosaic, under its own name: a nonogram whose solution is a pixel-art picture.
Every non-`.` character of `picture` is a shaded cell; row and column clues are worked
out from it. Tap cycles empty -> shaded -> X (right-click the other way), drag paints
the first cell's new value, clue numbers can be ticked off; Undo, Hint (highlights a
line and ghosts what its clue gives away), Check (marks wrong cells) and Reset; two
optional helpers (auto-tick finished clues, auto-X ticked lines). Solving fades the grid
into the colored picture, and a sign reveals its `title`.
`src/game-types/mosaic/solver.ts` proves at build time that the clues have exactly one
solution. To make a level, draw the picture in letters and pick a color per letter.

## Pages and layouts

- `Base.astro` is the outermost shell; shared styles come from `global.css`.
- `GameShell.astro` wraps every game page. Slots: default (the game, the bulk of
  the screen), `intro` and `directions` (rule cards below). Its back link goes to the
  type's list.
- All internal links and asset paths go through `url()` from `src/lib/paths.ts`.
- A type's styles are global but scoped under its root class (`.packet`,
  `.number-maze`, `.ryb`), because `game.ts` creates elements at runtime.

## The game interface

Every game type's browser code plugs in the same way (`src/lib/game.ts`):

```ts
export type MountGame = (root: HTMLElement, host: GameHost) => void | (() => void);

interface GameHost {
  id: string;
  load<T>(): T | null;                // saved progress (this browser only)
  save(state: unknown): void;
  clear(): void;
  solved(result?: Record<string, unknown>): void;   // fires "game:solved" on document
}
```

`Game.astro` renders markup with `data-game-type`, `data-game-id` and `data-config`
(the instance's data as JSON); its script calls the type's `mountAll(createHost)`.

**Completion.** `GameShell` (given `progressId`, "<type path>/<n>") listens for
`game:solved`, records the game in `src/lib/progress.ts` (localStorage key
`wyattsgames:completed`) and animates a check mark beside the title
(`src/components/Check.astro`). The type list shows checks on finished games and the
home page shows "n of m solved" per type.
The host id is `<type>-<n>-<hash of the instance data>`, so editing a puzzle gives
players a fresh start instead of old progress on a new board.

### Choosing a technology for a new game type

| Kind of game | Use |
|---|---|
| Grid and logic puzzles, turn-based | Plain TypeScript + SVG (like number-maze and ryb) |
| Puzzles with lots of UI state | A React island (`@astrojs/react`) |
| Real-time, animated or physics games | Phaser (full engine) or PixiJS (2D rendering) |
| Printable sheets | The escape room (`packet`) type |

## Accounts and cloud saves

Players can log in with a name and a 4-digit PIN to keep progress across devices.
Deliberately light security: fine for puzzle progress, not for anything private.

- **API:** `worker/` is a Cloudflare Worker at `https://api.wyattsgames.com`
  (`POST /login`, `GET`/`PUT /progress`). Logging in with a new name creates the
  account. PINs are stored as salted SHA-256; 10 wrong PINs lock a name for 15
  minutes. Login returns a signed token (HMAC with the `TOKEN_SECRET` secret), valid
  for a year.
- **Storage:** R2 bucket `wyattsgames-saves`, one object per player:
  `users/<name>.json` with the PIN hash, completed games and every game save.
  Saves merge by time (newer wins); completed games merge as a union.
- **Site:** `src/lib/account.ts` (login, logout, pull, push) and
  `src/components/Account.astro` (button at the right of the top nav, plus the dialog).
  Progress is always written to localStorage first. When logged in, every save
  (`GameHost.save`) and completion is pushed to the account shortly after, and each
  page load pulls the account's progress. Logging in merges this browser's progress
  into the account. Finishing a game while logged out opens the dialog in a required
  mode (no "Not now"; "Continue without saving" appears only if the server can't be reached).
- **API address:** `PUBLIC_API_URL` (default `https://api.wyattsgames.com`);
  `.env.development` points local dev at `http://localhost:8787`.

Local development: run the Worker with `cd worker && npm run dev` (it simulates R2
on this machine; `worker/.dev.vars` holds a local `TOKEN_SECRET`), alongside `npm run dev`.

Deploying the Worker (once, then after Worker changes):

```bash
cd worker
npx wrangler login                                  # opens Cloudflare in the browser
npx wrangler r2 bucket create wyattsgames-saves     # first time only
npx wrangler secret put TOKEN_SECRET                # first time only: paste a long random string
npm run deploy                                      # also creates api.wyattsgames.com
```

## Recipes

**A new escape room:** make the sheets in `puzzles/escape-room/<n>/` (or PDFs in
`public/escape-room/<n>/sheets/`), add `src/games/escape-room/<n>.json` with the sheet
list and answer, then `npm run puzzles`.

**A new number maze**
- Generated: `python3 puzzles/number-maze/new.py --number 3 --size 9x13 --search 40`
- From a sketch: transcribe the numbers into a text file (one row per line, `?` for
  unreadable cells; keep it in `scans/`), then
  `python3 puzzles/number-maze/fit.py scans/<file>.txt --number <n> --entry-col C --exit-row R`.
  It keeps every readable number if any valid maze allows that; otherwise it finds the
  maze that changes the fewest and prints which changed. Try a few `--seed` values.
- Check a grid typed into JSON: `python3 puzzles/number-maze/check.py`.

**A new Three Coats level:** add `src/games/three-coats/<n>.json` with the pieces, then `npm run build`.
If it reports more than one solution, add dots, hide fewer clues, or add `totals`.

**A new game type**
1. Add `src/game-types/<id>/` with `Game.astro` (props `game`, `hostId`), `game.ts`
   (`MountGame` + `mountAll`), `styles.css` and `types.ts`.
2. Add it to `gameTypes` and the `Game` union in `src/games.ts`, and a branch in
   `src/pages/[type]/[n]/index.astro`.
3. If its content needs building or checking, add a branch in `puzzles/build.py`.

Then `npm run dev` to try it and `npm run build` to type-check before committing.
Set `listed: false` on a type until it's ready for the home page.

## Deploying

`.github/workflows/deploy.yml` builds with `withastro/action` and publishes with
`actions/deploy-pages` on every push to `main`. The repository's Pages source is set
to **GitHub Actions**.

**Domain.** `wyattsgames.com` is registered at Cloudflare, which also hosts its DNS.
The records are in `dns/wyattsgames.com.zone` (GitHub Pages addresses for the apex,
`www` → `joshrtay.github.io`, all DNS only, not proxied). The repository's Pages
custom domain is `wyattsgames.com` with HTTPS enforced; `www`, plain http and the old
`joshrtay.github.io/wyattsgames/` address all redirect there. Astro's `base` is `/`.
