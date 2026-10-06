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
| Simple Loop (`round-the-bend`) | `grid` (genre `simple-loop`) | A grid size, rock cells and walls |
| Nonogram (`picture-squares`) | `grid` (genre `nonogram`) | A pixel-art picture drawn as letters, plus a color for each letter |
| Slitherlink, Nurikabe, Panes, Sudoku | `grid` (genre = path) | A grid size and its clues (see Grid engine genres) |

Types are declared in `src/games.ts` (`gameTypes`: name, card text, cover, listed).
Each instance is `src/games/<type path>/<n>.json`; the number is the file name. Adding
another game of an existing type needs no code, only a JSON file and its content.

Current instances: escape-room 1 (The Envelope); number-line-maze 1 (Warm-up, 5 × 5),
2 (The Big Maze, fitted to the game 2 sketch) and 3 (Side Doors, fitted to the maze3 sketch, both doors on the left); three-coats 1–3 (Triangle, Hexagon,
Nine Squares) and 4–6 traced from the game 2 shapes sketch (Square in a Kite, Envelope,
House); round-the-bend 1–4 from the game 2 grids sketch and 5–8 from the batch3 photos;
picture-squares 1–5 drawn here, 6–8 from the mosaic sketch (POP, BOB, a trophy) and
9 from a batch3 photo (a person). Game lists show the newest first.
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
        │   (ryb and grid-engine levels are solved here; the build fails unless each has one solution)
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
| `src/layouts/Base.astro` | Every page's shell: `<head>`, fonts, global styles, and the top nav (Wyatt's Games and the path to the page on the left, login on the right). |
| `src/layouts/GameShell.astro` | Frame for game pages: path in the top nav, the game, then directions. |
| `src/styles/global.css` | Color and font tokens (light and dark), base styles, shared `.btn`, `.rules`. |
| `src/lib/game.ts` | The game interface (`GameHost`, `MountGame`, `createHost`). |
| `src/engine/` | The grid engine: one engine for grid logic puzzles (Slitherlink, Nurikabe, Panes, ...). See [docs/grid-engine.md](docs/grid-engine.md). |
| `src/game-types/grid/` | Plays any grid-engine genre; genres are `gameTypes` entries with `id: "grid"` and a `genre`. |
| `puzzles/grid/new.ts` | Makes a grid-engine puzzle with exactly one solution (`node puzzles/grid/new.ts --genre ...`). |
| `src/lib/theme.ts` | Light / dark / match-device choice, saved in this browser; picked in the account menu. |
| `src/lib/ink.ts` | The watercolor filter for a board's SVG, at its scale (see Look). |
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
"maze": { "clues": [[2, 2, 3], ...], "entry": { "side": "left", "at": 0 }, "exit": { "side": "left", "at": 6 },
          "hints": [[[r, c], [r, c]], ...] }
```

Numbers sit on the corners of a grid of squares; lines between them are walls.
Phase 1: draw walls so each number has that many touching it, including the outside
edge, which is wall everywhere except the entrance and exit. Each is a gap on any
side (`top`, `right`, `bottom`, `left`) beside square `at`, counted along that side (a
column for top/bottom, a row for left/right). Older instances use `entryCol` (a top
gap) and `exitRow` (a right gap) instead; both forms work. Walls never loop and all
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

### Grid engine genres (`grid`)

Simple Loop, Nonogram, Slitherlink, Nurikabe, Panes and Sudoku are all
`id: "grid"` types: one engine, a `genre` each (`src/engine`, see
[docs/grid-engine.md](docs/grid-engine.md)). An instance's data is a `"grid"` object.

```json
"grid": { "size": [6, 7], "givens": [{ "at": "cell", "cell": [1, 1], "kind": "block" },
                                     { "at": "border", "cells": [[0, 4], [1, 4]], "kind": "wall" }] }
"grid": { "size": [10, 10], "picture": { "rows": [".....b....", "..."], "palette": { ".": "#e3f2f6", "b": "#6b4a2b" }, "title": "Apple" } }
```

- **Simple Loop** (`simple-loop`): one loop through the centre of every open cell; rocks are
  `block` cells and walls are `wall` borders. A clone of Inkwell's Loopy River under its own
  name. `puzzles/round-the-bend/from_sketch.py` makes levels from traced sketches (with
  `puzzles/lib/lazy_river.py`'s `fit()`), adding only the walls needed for one loop.
- **Nonogram** (`nonogram`): a nonogram whose clues are worked out from `picture`
  (one letter per cell, `.` empty); solving washes the picture in and a sign shows its
  `title`. Hint, clue ticking, and the auto-tick / auto-X helpers work as before. To make a
  level, draw the picture in letters and pick a color per letter.
- **Sudoku** (`sudoku`): given digits are `number` cells; boxes are sized from the grid
  (9: 3×3, 6: 2×3, 4: 2×2). Tap a cell, then the pad or the keyboard; pencil notes too.
- **Slitherlink**, **Nurikabe** and **Panes** (stained-glass regions in the style of The
  Artisan of Glimmith, each puzzle listing its own rules).

New puzzles for any genre: `node puzzles/grid/new.ts --genre <g> --size RxC --number <n>`.
The build proves each one has exactly one solution (clingo); saves for the two moved
genres started fresh when they moved onto the engine.

## Pages and layouts

- `Base.astro` is the outermost shell; shared styles come from `global.css`.
- `Base.astro`'s top bar has a fixed height (`--nav-h`) and shows the path to the page
  after the logo: pages fill its `crumbs` slot (type list: its name; game page: type
  link, title, number and check mark). On a phone the middle step is dropped.
- `GameShell.astro` wraps every game page: the game, then the `intro` and `directions`
  slots below. A board that fills the screen has the same `--frame` above and below it.
- A board is a `.sheet` of paper (global.css) sized to fill the screen from its `--ratio`
  (set by `addInk()`), `--nav-h` and `--frame`. Its controls sit on the paper in a
  `.paper-bar` strip: ink icon buttons (`.tool` with `Icon.astro`), handwritten word
  buttons (`.word`), and a `.status` note that only appears for a mistake (`.warn`) or a
  win (`.good`); running counts are never shown. Reset asks to confirm by setting
  `data-confirm` on its button. The board's own SVG has class `board`, so game code
  finds it with `svg.board` rather than the first SVG (the icons are SVGs too).
- All internal links and asset paths go through `url()` from `src/lib/paths.ts`.
- A type's styles are global but scoped under its root class (`.packet`,
  `.number-maze`, `.ryb`), because `game.ts` creates elements at runtime.

## Look

After the game Inked: ballpoint pen on white paper. The page is nearly white paper with a
faint cloudy texture (`public/paper.svg`) that darkens slightly toward the edges of the
screen (`--page` in `global.css`). Dark mode is a charcoal page with pale ink for
the text; game boards stay white paper. Dark is the default. Players pick Light, Dark or Match
device in the account menu (`src/lib/theme.ts`); it sets `data-theme` on `<html>`, and
an inline script in `Base.astro` applies the saved choice before the page draws. Only the puzzles are handwritten: numbers and clues on boards
use Kalam (`--hand`). The site is plain Nunito (headings in its heavy weight), with
Kaushan Script kept only for the logo.
- Each game type draws its boards in its own ink (`ink` in `src/games.ts`, set as
  `--paper-ink` on the page): blue for the escape room and mazes, black for Three
  Coats, green for Simple Loop, red for Nonogram.
- Every board's SVG gets a slight pen wobble (`#pen` filter in `Base.astro`).
- Every fill is watercolor, after the washes in Inked: pigment pools darker at the
  edges, the middle is mottled, faint brush streaks run through it and the edge bleeds.
  `addInk()` in `src/lib/ink.ts` adds the filter to a board at its own scale (a type's
  `game.ts` calls it after setting the viewBox); styles use `filter: var(--wash)` on a
  plain fill color. Put it on a whole layer, not each piece, when touching areas should
  pool into one wash (Nonogram' cells, Simple Loop's river).
- Printed sheets and home-page covers (`puzzles/covers.py`) use the same inks and fonts.

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
  `python3 puzzles/number-maze/fit.py scans/<file>.txt --number <n> --entry top:9 --exit right:13`
  (each gap as side:square).
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

## The social site (in progress, `app/`)

A separate app on the `social` branch: creators, collections (studios), memberships and games,
with sign-in, on Cloudflare Workers + D1 + R2. It reuses this site's grid engine, game code and
styles from `src/` (game code imports its interface types from `src/lib/game-api.ts`, which has
no storage or account code). See `app/README.md`.

