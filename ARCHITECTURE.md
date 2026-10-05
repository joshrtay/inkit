# Architecture

Wyatt's Games is a static website of puzzle games, built with
[Astro](https://astro.build) and published to GitHub Pages at
https://joshrtay.github.io/wyattsgames/.

## Game types and game instances

The site separates **game types** (reusable code) from **game instances** (data):

| Game type | What an instance supplies | Code |
|---|---|---|
| `packet` | A list of printable sheets (PDFs) and the final answer | `src/game-types/packet/` |
| `number-maze` | A grid of numbers (plus entrance, exit, any hint walls) | `src/game-types/number-maze/` |

Each instance is one JSON file, `src/games/<slug>.json`. The file name is the URL
(`/wyattsgames/<slug>/`). A single page template, `src/pages/[slug]/index.astro`,
renders every instance with its type's `Game.astro`. Adding another game of an
existing type needs no code, only a JSON file and its content.

Current instances:

| Instance | Type | Listed |
|---|---|---|
| `escape-room-packet` | packet | yes |
| `line-maze` | number-maze (11 × 17) | no (game 2, in progress) |
| `line-maze-practice` | number-maze (5 × 5) | no (for testing) |

## How the pieces fit

```
sketches (scans/, not in git)
        │
        ▼
src/games/<slug>.json ── instance data ──────────────────────────┐
        │                                                        │
        ▼  npm run puzzles (puzzles/build.py)                    │
  packet:      puzzles/<slug>/*.py → HTML → Chrome → public/<slug>/sheets/*.pdf + .png
  number-maze: puzzles/lib/number_maze.py proves one solution    │
                                                                 ▼
src/pages/[slug]/index.astro → src/game-types/<type>/Game.astro (+ game.ts in the browser)
        │
        ▼  npm run build (Astro) → dist/ → GitHub Actions → GitHub Pages
```

`npm run puzzles` (Python, on your machine) makes and checks puzzle content; its
output is committed. `npm run build` (Astro) builds the site; GitHub Actions runs
it on every push to `main`.

## Folder layout

| Path | What lives there |
|---|---|
| `src/games/<slug>.json` | One game instance: type, name, card text, and the type's data. |
| `src/games.ts` | Loads every instance and defines their TypeScript types. |
| `src/game-types/<type>/` | A game type: `Game.astro` (page), `game.ts` (browser code), `styles.css`, `types.ts`. |
| `src/pages/index.astro` | Home page: a card for each listed instance. |
| `src/pages/[slug]/index.astro` | Builds a page for every instance. |
| `src/layouts/Base.astro` | Every page's shell: `<head>`, fonts, global styles, airmail edges. |
| `src/layouts/GameShell.astro` | Frame for game pages: back link, title, game, then directions. |
| `src/styles/global.css` | Color and font tokens (light and dark), base styles, shared `.btn`, `.rules`. |
| `src/lib/game.ts` | The game interface (`GameHost`, `MountGame`, `createHost`). |
| `src/lib/paths.ts` | `url()` helper that adds the `/wyattsgames/` base path. |
| `public/<slug>/` | Static files per instance: cover, sheet PDFs and previews. |
| `puzzles/build.py` | Builds and checks puzzle content for every instance. |
| `puzzles/lib/number_maze.py` | Number-maze logic: board, maze carving, solver, checker. |
| `puzzles/number-maze/` | `new.py` creates a maze instance; `check.py` validates grids. |
| `puzzles/<slug>/` | Sheet sources for one packet instance: generator scripts and `sheets/*.html`. |
| `scans/`, `archive/` | Original sketches and old copies. Ignored by git (the repo is public). |

## Instance files

Shared fields (see `GameBase` in `src/games.ts`): `type`, `name`, `blurb`, `meta`,
`listed`, and optional `cover` (path in `public/`, 1200 × 750), `coverAlt`,
`eyebrow`, `intro`.

**packet** adds:

```json
"packet": {
  "answer": "74992",
  "sheets": [
    { "id": "page-1", "name": "Page 1", "kind": "algebra", "file": "equations", "note": "..." }
  ]
}
```

Each sheet's PDF lives at `public/<slug>/sheets/<file>.pdf`. Only a SHA-256 hash of
the answer is sent to the browser; answers are compared as digits, ignoring commas
and spaces.

**number-maze** adds:

```json
"maze": { "clues": [[2, 2, 3], ...], "entryCol": 9, "exitRow": 14, "hints": [[[r, c], [r, c]], ...] }
```

`clues` is the grid of numbers on the corners of the squares (rows top to bottom).
The outer border is drawn automatically, with an entrance gap above square column
`entryCol` and an exit gap beside square row `exitRow`. `hints` are walls drawn for
the player.

## Game types

### packet

A sheet viewer (list, preview, Prev/Next, Print (PDF) link, `#id` deep links) and an
answer check. Sheets are made outside the site: either by scripts in
`puzzles/<slug>/` (as for the escape room packet), or as PDFs dropped straight into
`public/<slug>/sheets/`. `npm run puzzles` creates the preview PNGs either way.

### number-maze

Numbers sit on the corners of a grid of squares; lines between them are walls.
Phase 1: draw walls so each number has that many touching it (border included),
with no wall loops and every wall connected to the border. These are exactly the
conditions for a perfect maze. Phase 2: drag a line through the open squares from
the entrance to the exit. The page shows the board as large as the screen allows,
with the directions below.

`puzzles/lib/number_maze.py` holds the shared logic. `check()` proves an instance
has exactly one solution (and, if not, suggests hint walls). `generate()` carves a
random perfect maze and adds hint walls until the numbers allow only it.

## Pages and layouts

- `Base.astro` is the outermost shell; shared styles come from `global.css`.
- `GameShell.astro` wraps every game page. Slots: default (the game, the bulk of
  the screen), `intro` (under the title) and `directions` (rule cards below).
- All internal links and asset paths go through `url()` from `src/lib/paths.ts`.
- A type's styles are global but scoped under its root class (`.packet`,
  `.number-maze`), because `game.ts` creates elements at runtime that Astro's
  scoped styles would not reach.

## The game interface

Every game type's browser code plugs into the site the same way (`src/lib/game.ts`):

```ts
export type MountGame = (root: HTMLElement, host: GameHost) => void | (() => void);

interface GameHost {
  id: string;                         // the instance slug
  load<T>(): T | null;                // saved progress (this browser only)
  save(state: unknown): void;
  clear(): void;
  solved(result?: Record<string, unknown>): void;   // fires "game:solved" on document
}
```

`Game.astro` renders the markup with `data-game-type`, `data-game-id` and
`data-config` (the instance's data as JSON). Its script calls the type's
`mountAll(createHost)`, which mounts every root of that type on the page. Games
save only through the host and call `host.solved(...)` when finished.

### Choosing a technology for a new game type

| Kind of game | Use |
|---|---|
| Grid and logic puzzles, turn-based | Plain TypeScript + SVG (like number-maze) |
| Puzzles with lots of UI state | A React island (`@astrojs/react`) |
| Real-time, animated or physics games | Phaser (full engine) or PixiJS (2D rendering) |
| Printable sheets | The packet type |

Whatever it uses, a type's `game.ts` exports a `MountGame` and a `mountAll`.

## Recipes

**A new packet game**
1. Make the sheets: scripts and HTML in `puzzles/<slug>/`, or PDFs in `public/<slug>/sheets/`.
2. Add `src/games/<slug>.json` with `"type": "packet"`, the sheet list and the answer.
3. Add a cover at `public/<slug>/cover.jpg`, then run `npm run puzzles`.

**A new number maze**
- Generated: `python3 puzzles/number-maze/new.py --slug my-maze --size 9x13 --search 40`
- From a hand-made grid: write `src/games/<slug>.json` with the `maze` data, then
  run `python3 puzzles/number-maze/check.py src/games/<slug>.json` and add any hint
  walls it suggests until it reports one solution.

**A new game type**
1. Add `src/game-types/<type>/` with `Game.astro`, `game.ts` (`MountGame` + `mountAll`),
   `styles.css` and `types.ts`.
2. Add the type to `Game` and `GAME_TYPES` in `src/games.ts`, and a branch in
   `src/pages/[slug]/index.astro`.
3. If its content needs building or checking, add a branch in `puzzles/build.py`.

Then `npm run dev` to try it and `npm run build` to type-check before committing.
Set `"listed": false` until a game is ready for the home page.

## Deploying

`.github/workflows/deploy.yml` builds with `withastro/action` and publishes with
`actions/deploy-pages` on every push to `main`. The repository's Pages source is set
to **GitHub Actions**.
