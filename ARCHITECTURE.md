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
| `src/game-types/grid/` | The in-browser player (`game.ts`, `figure.ts` for RYB) and the still-picture renderer (`picture.ts`) with its styles |
| `src/guides/` | The puzzle-type guides: rules with ✓/✗ pictures, origins, worked examples |
| `src/games/` | Example puzzles per type (JSON): the guides' worked examples and the site's seed data |
| `src/lib/` | The game interface (`game-api.ts`) and the watercolor wash filter (`ink.ts`) |
| `src/styles/global.css` | Shared look: paper, ink, fonts, light and dark |
| `puzzles/grid/` | Tools: `new.ts` makes a new example puzzle of any type (proved unique; the making is `generate.ts`), `guides.ts` checks every guide picture and solves the examples |
| `puzzles/ai/` | The AI creators' weekly batch: `week.ts` makes, scores (`score.ts`), titles and queues each persona's posts ([docs/ai-creators.md](docs/ai-creators.md)) |
| `puzzles/difficulty/` | The deduction solver: solves a puzzle step by step on the engine's own encoding, costs each step by its smallest explanation, and estimates difficulty (`deduce.ts`); `deductionScorer` for the AI creators (`scorer.ts`), a CLI (`cli.ts`) and calibration runs (`calibrate.ts`) |
| `.github/bug-fix/` | The AI bug fixer's gate, guard and prompt, run by `.github/workflows/bug-fix.yml` ([docs/bug-pipeline.md](docs/bug-pipeline.md)) |
| `docs/` | The grid engine in depth, including how the editors (paint, RYB's) must keep up with it; the creation flow |

The root `package.json` covers the shared code (`npm run build` type-checks it, `npm run
selftest` checks the engine against brute force, `npm run guides`, `npm run new`) and makes the
site an npm workspace, so one `npm install` in the root installs both.

## The site (`app/`)

**The model** (`app/db/schema.ts`, Drizzle on D1): *creators* (handle, name, admin), *collections*
(every creator has a personal one at their handle; studios exist but are set aside for now),
*memberships*, *games* (a permanent `/g/<id>`, the sketch that is their "code", draft / published /
hidden / deleted, Claude's latest reading and doubts; only a draft can be changed, and a published
one only deleted, a soft delete that hides it everywhere), *subscriptions*, *likes*, *solves* (a signed-in
player's, not the author's own: a check on the puzzle's card, counts on puzzles and profiles), and
the *Featured* shelf.
Rules the database can't express are in `app/lib/permissions.server.ts`.
**AI creators** (`app/ai/personas.ts`, [docs/ai-creators.md](docs/ai-creators.md)) are creators
with `is_ai` set, labelled AI wherever they're named; a weekly batch queues their puzzles as
drafts with `publish_at`, and the Worker's cron publishes each at its time.

**Sketches** (`app/games/sketch.ts`): a genre on the first line, then the puzzle as JSON (size,
givens, areas, picture, rules). The engine checks and plays it. Creators never see this text.

**Pages**: Subscriptions (the home feed), Explore (creators), Puzzle types (`/puzzles`, the
guides), profiles at `/<handle>` (Puzzles, Drafts for the owner, Subscriptions), games at
`/g/<id>`, Create (`/new`: start from a photo or a blank page, or carry on with a draft; both
open paint), Settings (`/settings`: profile, email, password, handle, appearance),
sign-in (Better Auth: email + password, Google), privacy and terms.
**For search engines and agents** (`app/lib/seo.ts`, pure and unit-tested): every public page's
canonical, Open Graph and JSON-LD come from `pageMeta()`; private pages, drafts and editors are
`noindex`. `/robots.txt` (AI crawlers welcome), `/sitemap.xml` (published games and profiles from
D1), `/llms.txt`, `/llms-full.txt`, and each guide as Markdown at `/puzzles/<type>.md` (served by
`workers/app.ts`). The left nav
(`components/Shell.tsx`: Subscriptions, Explore, Profile, Create, and More at the bottom with
Settings, Puzzle types and Sign out) frames every page except the editors (paint, its publish page, RYB's editor).

**Reading a drawing** (`app/lib/read-sketch.server.ts`): Claude reads the photo into a structured
reading (type, size, clues, rules, and doubts, each tied to a square, a line's clues, rows,
columns, an area or the whole puzzle). A quick reader (Claude Sonnet) goes first and a careful one
(Claude Opus) takes over when the reading looks shaky, and for every re-read. Only the puzzle's part of the photo is kept (Claude says where it is; `lib/photos.server.ts`
crops it). A re-read can carry
the creator's corrections, or a type they chose (with that type's guide). While it reads, the
reading screen (`components/ReadingScreen.tsx`) shows the photo being scanned, cycling words, and
one puzzle fact.

**RYB's editor** (`/g/<id>/edit`, `components/GameEditor.tsx`): RYB (Three Coats, a figure of
pieces rather than a grid) is the one type paint can't draw yet, so it keeps the old editor, a page
of its own after Substack's post editor: back, save status, the one-solution check, Preview and
Publish; the type, the title and description, the figure edited in `components/FigureEditor.tsx`, the
photo in the left margin and Claude's doubts in the right. Every other type's `/edit` goes to paint.

**Paint** (`/g/<id>/draw`, `components/Paint.tsx`; [docs/creation-flow.md](docs/creation-flow.md), "v3 layout"): the
editor for every type but RYB, for drafts only (a published puzzle can't be changed): a puzzle drawn in the sketchpad
with a puzzle type. The drawing (`games.drawing`, with its type and
rule settings) is the source of truth; `sketchpad/to-puzzle.ts` converts it into the sketch on
every save. Each part of the screen answers one question. The top bar: back, Type ▾ (opens the
drawer at Types) and the save state (no title: it's named on the publish page), undo, redo and …
(Clear, Download), the Check button and Publish. Check is pressed, not automatic: choosing a type
checks nothing and marks nothing on the paper (but a photo's doubts); pressed, the solver (clingo
in the browser) runs, the verdict shows on the button, the problems are marked, and it stays live
until the type changes. Publish checks first if need be, and goes on when the verdict passes. The
tool rail and the palette (`Sketchpad.tsx`: the chosen tool's settings, floating over the
workspace's top left) filter by type (`sketchpad/kit.ts`). The workspace is open paper
(`sketchpad/view.ts`): it pans and zooms (wheel, Space or the middle button, two fingers, pinch),
and Fit shows the puzzle itself, clear of the palette. Tooltips (`data-tip`) are one layer for the
whole site, in the top layer (`components/Tooltips.tsx`, placed by `lib/place.ts`). The drawer on
the right (a bottom sheet on a phone; folds to a strip): This puzzle, the type's rules from its
guide as a checklist (`sketchpad/checklist.ts`) with each broken rule's problems under it
(`sketchpad/check.ts`'s list and marks) and its settings on it (`PaintRules.tsx`), the solution
line, Your drawing, and the solution (pointed at, drawn on the board); and Types (`TypePicker.tsx`:
search, "What type is this?", which tries the drawing as every type with no AI,
`sketchpad/suggest.ts`, the list, each type's guide; a type clicked shows its guide, its ✓ or
"Use …" chooses it). A draft with no title is called by its type and size (`games/kinds.ts`'s `draftName`). A photo's reading is drawn in ink
(`games/paint-save.ts`'s `paintFromSketch`, via `toDrawing`), with Claude's doubts as amber marks and
the photo first in This puzzle (Tell Claude what's wrong reads it again); so is any puzzle made
before paint, the first time it's opened. Types with areas also paint them (the Areas tool drags
squares into an area and redraws its borders). Publish goes to `/g/<id>/publish` (`routes/game-publish.tsx`), still
in paint's top bar: the title and description edited in place on the dark page above the board, and
the real player on the paper (saving nothing, recording no solve); the server converts the drawing
again and publishes only the sketch the browser's solver passed (`games.server.ts`'s `putSketch`,
shared with RYB's editor). **A published puzzle can't be changed, only deleted**
([docs/creation-flow.md](docs/creation-flow.md), decision 8): its `/draw`, `/publish` and `/edit`
go to its page, which has no Edit; its author gets a red Delete (a soft delete: state `deleted`),
and the … menu holds moderation only: Take down, Restore and Featured. Confirmations and the
take-down note use the site's dialog (`components/ConfirmDialog.tsx`, `useConfirm()`), never the
browser's `confirm()` or `prompt()`. Published pages show the drawing as a "Drawn by"
thumbnail (`sketchpad/picture.ts`).

**Bug reports** ([docs/bug-pipeline.md](docs/bug-pipeline.md)): for signed-in people the browser
keeps the last two minutes as an rrweb recording in memory (`lib/bugs/capture.ts`; inputs masked,
private pages skipped, off in Settings), with recent console errors and failed fetches. "Report a
bug" (More menu, paint's … menu; `components/BugReport.tsx`) sends it only on Send, with the page's
state (`lib/bugs/state.ts`: route, build SHA, the puzzle). `POST /bugs` stores the row in D1
(`bug_reports`) and the files in R2 (`bugs/<id>/`), and a gatekeeper Claude call with no tools
(`lib/bugs/gatekeeper.server.ts`) returns a verdict and a neutral restatement. Admins review them at
`/admin/bugs` (with the replay) and can file a GitHub issue that holds no user text; the owner's
`ai-fix` label on it runs `.github/workflows/bug-fix.yml`, which opens a draft PR behind a path and
size guard.

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
with a slight pen wobble, and watercolor washes for every fill (`addInk()` in `src/lib/ink.ts`),
with a Japanese accent: stones, star points, crests. The rules (pen vs. watercolour, the pen
weights, the colour tokens, the symbol family) are in [docs/style.md](docs/style.md).
Clues are handwritten (Kalam); the site is Nunito, with Kaushan Script for the logo. Dark is the
default, with Light and Match device in the More menu.
