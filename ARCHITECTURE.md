# Architecture

Wyatt's Games is a static website of puzzle games, built with
[Astro](https://astro.build) and published to GitHub Pages at
https://joshrtay.github.io/wyattsgames/.

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
| RYB (`ryb`) | `ryb` | Polygon pieces with clue dots (1 red, 2 yellow, 3 blue) |

Types are declared in `src/games.ts` (`gameTypes`: name, card text, cover, listed).
Each instance is `src/games/<type path>/<n>.json`; the number is the file name. Adding
another game of an existing type needs no code, only a JSON file and its content.

Current instances: escape-room 1 (The Envelope); number-line-maze 1 (Warm-up, 5 × 5)
and 2 (The Big Maze, fitted to the game 2 sketch); ryb 1–3 (Triangle, Hexagon, Nine
Squares).

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
        │   (ryb levels are solved here; the build fails unless each has one solution)
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
| `src/layouts/Base.astro` | Every page's shell: `<head>`, fonts, global styles, airmail edges. |
| `src/layouts/GameShell.astro` | Frame for game pages: back link, title, game, then directions. |
| `src/styles/global.css` | Color and font tokens (light and dark), base styles, shared `.btn`, `.rules`. |
| `src/lib/game.ts` | The game interface (`GameHost`, `MountGame`, `createHost`). |
| `src/lib/paths.ts`, `src/lib/hash.ts` | `url()` (adds the `/wyattsgames/` base path); `sha256()`. |
| `public/<type>/` | Static files: type cover; `<n>/sheets/` PDFs and previews for escape rooms. |
| `puzzles/build.py` | Builds and checks puzzle content for every instance. |
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

### RYB (`ryb`)

```json
"ryb": { "pieces": [ { "points": [[0, 0], [10, 0], [10, 10], [0, 10]], "clue": "113", "hidden": true } ],
         "totals": { "1": 4, "2": 1 }, "hearts": 3 }
```

Based on FLEB's RYB (https://fleb.itch.io/ryb). A figure is cut into polygon pieces
(any coordinates; the board is scaled to fit). Paint every piece 1 red, 2 yellow or
3 blue. A clue is a string of dots: `"113"` means at least two neighbors are red and at
least one is blue; each dot needs its own neighbor. Neighbors share part of an edge,
computed from the polygons. A wrong color is rejected and costs a heart; correct
pieces lock in. `hidden` clues appear only once their piece is painted. Optional
`totals` show how many of each color are left to place.

`src/game-types/ryb/solver.ts` solves each level during the build; the build fails
unless there is exactly one solution. To make a level from a drawing, trace each
shape's corners into `points` and copy its numbers into `clue`.

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
The host id is `<type>-<n>-<hash of the instance data>`, so editing a puzzle gives
players a fresh start instead of old progress on a new board.

### Choosing a technology for a new game type

| Kind of game | Use |
|---|---|
| Grid and logic puzzles, turn-based | Plain TypeScript + SVG (like number-maze and ryb) |
| Puzzles with lots of UI state | A React island (`@astrojs/react`) |
| Real-time, animated or physics games | Phaser (full engine) or PixiJS (2D rendering) |
| Printable sheets | The escape room (`packet`) type |

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

**A new RYB level:** add `src/games/ryb/<n>.json` with the pieces, then `npm run build`.
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
