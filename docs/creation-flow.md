# Creation flow: paint is the editor

A design for making puzzles on inkit with the sketchpad ("paint") as the one editor. Nothing here
is built yet. Mockups (static HTML in the site's look, drawings made by the real sketchpad, picture
and solver code via `make-boards.ts`) are in [creation-flow-mockups/](creation-flow-mockups/), one
PNG per screen.

**The idea in one line.** A creator starts from a photo or a blank page, draws in paint, sets the
puzzle type whenever they know it, and from then on paint only offers that type's tools. **Check**
says whether the drawing is a puzzle (the solution, or what's wrong), and **Publish** puts it on
its own game page. A deterministic converter turns the drawing into the puzzle. AI only reads
photos and, when asked, suggests a type.

## Decisions

The owner's answers to the first draft's open questions (October 2026):

1. **The saved drawing is the source of truth.** `games.sketch` is always the converter's output,
   re-made from the drawing on save and publish; nobody edits a sketch by hand any more (admins
   included: a hand edit would be overwritten by the next save).
2. **A published puzzle's page shows the engine's picture for play**, with the creator's drawing
   beside it as a small **"Drawn by @handle"** thumbnail (the drawing as drawn, minus the notes
   layer, which stays private). Clicking it enlarges it.
3. **Type suggestions are on demand only**: the **What type is this?** button in the type picker
   and in the "choose a type first" reminder. Nothing is suggested automatically.
4. **Strictly the type's tools**, with an **All tools** escape at the foot of the tool rail. What
   the type can't use, however it got there, is flagged "doesn't fit" and left out of the puzzle.
5. **A broken rule makes the verdict "No solution" at once**, while the digit is still being typed.
6. **Not designed for kids.** No kid-specific modes, wording or gates (the first draft's §1.10 is
   gone). Plain, specific wording is for everyone.
7. **RYB (Three Coats) waits.** It stays on `FigureEditor` until every grid type is in paint.

## 1. Screens

| # | Screen | Mockup |
|---|---|---|
| 1 | Start (`/new`) | `01-start.png` |
| 2 | Paint, just read from a photo: the panel with the photo and what to check | `02-paint-from-photo.png` |
| 3 | Paint, Sudoku: Check found broken rules; one selected, with its tip | `03-paint-sudoku.png` |
| 4 | Paint, Panel: Check found it solvable and shows a solution | `04-paint-panel.png` |
| 5 | Paint, Honeycomb Paths (hexagons), the panel minimised to a tab | `05-paint-honeycomb.png` |
| 6 | "What type is this?" (after the creator asked) | `06-type-picker.png` |
| 7 | Play and publish: the draft's own game page | `07-publish.png` |
| 8 | Paint on a phone | `08-phone-paint.png` |
| 9 | No type yet: Check and Publish greyed, the reminder, the Type button's bounce | `09-needs-type.png` |

### 1.1 The flow

```
/new ──photo──▶ reading ──▶ paint (/g/<id>/draw) ◀──────────── Back to paint ─┐
     └─blank──────────────▶   draw · choose Type · Check (panel) ── Publish ──▶ /g/<id>/publish
                                                                               (the draft's game page:
                                                                                play it, title, description,
                                                                                Publish) ──▶ /g/<id>
```

Paint is where the puzzle is made and checked; the game page is where it is played, named and
published. There are no forms in between.

### 1.2 Start (`/new`)
Two cards: **Start from a sketch** (choose or take a photo) and **Start blank** (an empty page),
and under them **Carry on with a draft** (the three latest drafts; the rest are on the profile's
Drafts tab). There is no puzzle-type selector: the type is chosen in paint. `?in=<studio>` keeps
working as now.

- Either choice creates the draft game straight away (state `draft`, no sketch yet) and goes to
  **`/g/<id>/draw`**, so there is one URL per puzzle from the first second and autosave has
  somewhere to go.
- **Photo**: shrink in the browser (as today), upload, show `ReadingScreen` while Claude reads,
  then land in paint with the reading drawn (1.4).

### 1.3 Paint: the layout
- **Top bar.** Left: back · title (edited in place, as the editor's title is today) · **Type**
  button (the type's picture and name, or a dashed "Not set") · save state. Right: undo, redo,
  clear · How to play (the guide pane at this type; "Puzzle types" when no type is set) ·
  **Check** · **Publish** (primary). Check and Publish are separate buttons.
- **Tool rail** (left): the type's tools only (table in §4.4); **All tools** at its foot (1.6).
- **Options bar** (top): the chosen tool's settings, type-aware (Text in Sudoku writes "Digits
  1–6" or **Notes**; notes are drawn in a lighter hand and never go in the puzzle).
- **The panel** (over the workspace's left side): one panel for **the photo, what to check, and
  Check's results** (1.5). It minimises to a small tab ("✓ Check 1") at the workspace's top-left
  corner, and a click on the tab restores it. It opens by itself after a photo is read and when
  Check is pressed; otherwise it stays as the creator left it.
- **Right side**, one job per section: **Stamps** (the type's only; a line saying so if it has
  none), **Colour** (only if the type's stamps take one, and only its colours), **Rules**
  ("Always: …" from `describe()`, then the type's settings, §3).
- **Status line** (bottom): hint · grid facts · **verdict chip** (live; a click is the same as
  Check) · **to-check chip** · Snap · zoom.
- **Grid**: the type fixes the look (Panel → Tracks, Honeycomb → Hexagons, Pythagorean → Dots);
  other looks are disabled with a one-line reason. Size limits from the engine are enforced by
  the steppers.

### 1.4 Paint, just read from a photo (screen 2)
The reader's result goes through the existing pipeline (reading → sketch → `makePuzzle`) and then
`from-puzzle.ts`'s `toDrawing` draws it in ink. What the creator wrote on the paper (title, type)
is drawn as written; the type it names is set and labelled "read from the photo" in the Type button
until the creator touches it.

The panel opens with two parts:
- **Your photo**: the photo, with **Lay it over** (50% opacity over the drawing, aligned to the
  grid), **Read again** (careful reader, as today's re-read) and **Trace over** (photo under the
  paper, drawing tools on top: the fallback when a read is poor).
- **To check**: each **doubt** (`games/doubts.ts`; they already carry a place) with its likely
  answers as one-tap buttons ("2" / "3", "Shaded" / "A smudge: erase") plus "Something else"
  (selects the item with the right tool); things that **don't fit** with Erase / Keep as a note.
  Answering applies the edit and ticks the item. Each item has a numbered pin on the paper.

Edge cases:
- **Read fails** (no puzzle found, API error): stay on the start screen with the error and two ways
  on: "Try another photo" or "Trace it yourself" (a blank page with the photo under it).
- **Read is unsure of the type**: draw what was read with no type set. The reading's `kindChoices`
  are kept, so **What type is this?** answers at once without another call; nothing opens by itself.
- **Partial read**: draw what was read; each gap is a doubt with no one-tap answer ("Couldn't read
  this row").
- **Something the drawing can't hold** (`from-puzzle` reports `gaps`): drawn as close as it can,
  listed in To check. (The converter work in §4 aims to make this list empty.)

### 1.5 Check (screens 3 and 4)
**Check** (top bar, or the verdict chip) runs the solver on the converted drawing and opens the
panel at its results. With a photo, the photo part folds to a one-line header above them.

- **Solvable** (screen 4): the verdict (green: "One solution"; panels: "Solvable") and **the
  solution as a preview** in the panel, drawn in the type's picture. A switch, **Draw it on the
  board**, lays it over the paper in a light wash (digits pencilled, lines and shading in blue);
  it never becomes part of the drawing. Panels add **Another** (the next solution the solver finds).
- **No solution** (screen 3): the verdict in red and **the list of errors**: each broken rule
  ("Two 5s in row 6", "Two 3s in one box"), numbered. Selecting one **highlights it on the canvas**
  (its squares ringed and joined, the others dimmed to dashed rings), with a **pointer and a tip**
  on the paper explaining it ("Each row holds 1 to 6 once, so one of these 5s is wrong. Change or
  erase one of them."). **Next error** steps through; Escape clears the selection.
- **Several solutions**: the verdict in red and, as its one "error", **a difference**: one square
  where two solutions differ, ringed, with both values pencilled ("4/3") and the tip "This square
  can be a 4 or a 3, and the rest still works. Add a clue that settles it." Next difference cycles.
  For line and region types the difference is drawn as the two solutions' lines or borders in two
  washes.
- **To check** sits under the results in the same panel (doubts and things that don't fit). They
  never change the verdict: what doesn't fit is left out of the puzzle.
- The results stay until the drawing changes; then the verdict chip updates live (clingo in a
  worker, 400 ms debounce, as `useLiveCheck`) and the panel says "Changed since Check" with a
  **Check again** button. The panel's error list refreshes on Check, not on every stroke, so it
  doesn't jump while the creator works.

### 1.6 Type mode, tools, and switching type
- **Tools**: only the type's (table in §4.4). Sudoku: Grid, Text, Eraser. **All tools** shows the
  rest (pen, line, wash, every stamp) for decoration or for drawing ahead of choosing a type; they
  appear below a divider. Anything they make that the type can't use is flagged **doesn't fit**
  (red dashed outline, pin, a To check item) and left out of the puzzle. A flagged item can be
  moved to the notes layer ("Keep as a note") to stop it counting as a problem.
- **No type set**: plain paint with every tool; Check and Publish are greyed (1.8).
- **Switching type** never deletes anything. The converter re-runs; items the new type can't use
  are flagged, with **Erase** and, where one exists, a **translation** ("Make these 3 stones
  pearls"). One button erases all that don't fit. The grid and every item's square carry over, and
  Rules settings with the same meaning (size, allowed sizes, symmetry). The grid's look changes to
  the type's (hex ↔ square keeps each item's row and column; a hex layout that can't hold an item
  flags it). The switch is one undo step. "Not set" is a valid choice.

### 1.7 "What type is this?" (screen 6)
The **type picker** opens from the Type button (and from the reminder, 1.8). It shows **All
types**, a searchable grid of the guide examples' pictures, and a **What type is this?** button.
Only that button asks Claude:

- For a photo, the reading's `kindChoices` answer at once. For a drawing, a call to the quick
  reader with the drawing's data (`objects()`, no image).
- The top three appear as cards: **your drawing as that type** (the converter's output in the
  type's picture) and the **solver's verdict** on it (screen 6 shows the real verdicts: Nurikabe
  one, Shikaku none, Fillomino several), and "Uses everything you drew" or "3 things won't fit".
- Footer: "You can change the type any time; nothing you drew is lost." Not now / Make it X.

### 1.8 No type yet: Check and Publish greyed (screen 9)
Until a type is chosen, **Check** and **Publish** are greyed (`aria-disabled`, not `disabled`, so
they still take a click and keep their tooltips). Clicking either:
- opens a **reminder** hanging from the Type button: "Choose a puzzle type first. Check and Publish
  need to know what kind of puzzle this is: its rules decide what counts as a solution." with
  **Choose a type** (opens the picker) and **What type is this?** (opens it and asks);
- and **bounces the Type button**: two hops, about 0.6 s in all, with a yellow ring while the
  reminder is open (no bounce with `prefers-reduced-motion`; the ring alone).
The reminder closes on the next click elsewhere. The verdict chip says "No type yet, so nothing to
check".

### 1.9 Play and publish: the draft's game page (`/g/<id>/publish`, screen 7)
**Publish** in paint goes to the puzzle's own game page, as it will look published: the site
shell, the back button (to paint), `GamePageView`'s head and the real player (`GameBoard` /
`MountGame`). The differences from a published page:

- **The title and the description are edited in place**, as the editor does today
  (`GameEditor`'s `.studio-title` input and textarea, without borders): the title is the page's
  `h1`, with a dashed underline on hover and a caret on click; the description sits beside the
  board (under it on narrow screens) with "Add a description…" as its placeholder. Both save as
  they change (the draft's autosave). There is no separate form.
- The head's meta line says "not published yet" and a **Draft** tag; **How to play** and **Back to
  paint** sit where the published page has How to play and Edit.
- A **publish bar** under the head: the verdict ("Exactly one solution", from the last Check, re-run
  if the drawing changed), "Play it here as players will; your solve isn't counted", and **Publish**.
  There is no collection picker: the puzzle goes to the creator's profile, or to the studio a
  `?in=` link carried.
- The player is the real one, with a host that saves to `sessionStorage` and never records a solve.
- The **Drawn by** thumbnail (decision 2) is shown as it will be published.

Publish is enabled only when the verdict passes (one solution; panels at least one) and the title
isn't empty (an empty title gets "Give it a title" under the `h1`, which takes focus). Unanswered
doubts and items that don't fit warn beside the button; they don't block. The server re-converts
the saved drawing and re-checks the hash, as the editor's publish does today (`check.hash`), so
the client can't publish a sketch that wasn't checked. After publishing the page simply becomes
`/g/<id>`: the same layout without the editing.

### 1.10 Drafts and autosave
- The drawing is saved to the server (debounced ~1.5 s after the last change, and on leaving), with
  `localStorage` as the offline buffer (today's `inkit:sketchpad` key, now per game:
  `inkit:draw:<id>`). The top bar shows Saving… / Saved / Offline, saved here.
- What is saved: the **drawing** (model.ts `Drawing`, new column `games.drawing`: the source of
  truth), the **type**, the **rule settings**, the **converted sketch** (`games.sketch`, always
  derived), the title and description, and doubt state.
- Opening a draft restores undo history only for this browser session (history isn't stored).
- Two tabs on one draft: last write wins; the losing tab shows "Changed elsewhere: reload".

### 1.11 Editing a published puzzle
**Edit** on `/g/<id>` opens paint with the saved drawing; games published before this have none,
so `toDrawing(spec)` makes one (and it's saved on the first change). The published puzzle doesn't
change while you draw: Publish says **Update**, and goes to the same game page with **Update** in
the publish bar; the update needs a passing verdict. Solves and likes stay (as today). Changing the
type of a published puzzle is allowed but warned ("Players' progress on it will reset").

### 1.12 Phones (screen 8)
The sketchpad's phone layout as it is (paper on top; status, options and tools stacked at the
bottom; Colour, Stamps and Rules in the bottom sheet behind the palette button, as three tabs).
The top bar keeps back, the Type button (name only), undo, redo, **Check** and **Publish**; the
title is edited on the game page. The panel opens as a bottom sheet over the tools and minimises
to the same tab, top-left on the canvas. A selected error's tip sits below the paper so it never
covers what it's about. The status line holds only the two chips; the tool hint moves into the
options bar.

## 2. Validation UX

Three kinds of message, one look each, all from the converter and the engine (no AI):

| Kind | Example | Mark on the paper | Blocks publish? |
|---|---|---|---|
| **Doubt** (from a photo read) | "Is this a 2 or a 3?" | amber outline + numbered amber pin | no (warns) |
| **Doesn't fit / not on the grid** | "A crest isn't part of Sudoku", "This line isn't on the grid", "Panels have no numbers" | red dashed outline + red pin | no: left out of the puzzle (warns) |
| **Error** (a broken rule, or two solutions' difference) | "Two 5s in row 6" | orange ring on each square involved, dotted line between | yes, through the verdict |

- **Where**: the marks are on the paper (an overlay layer like `.sp-ui`, never exported). The words
  are in the panel: To check (doubts, doesn't fit) and Check's results (errors). Selecting an item
  scrolls to its mark, highlights it and shows its **tip** beside it with a pointer. One tip at a
  time, so the paper stays readable.
- **When**: doubts and "doesn't fit" appear at once. **Errors count at once** (decision 5): a
  digit that breaks a rule, even before it is committed, rings its squares and turns the verdict
  chip to "No solution · 1 broken rule". The panel's list is Check's (1.5).
- **Dismissed by**: fixing the item (the mark goes); a doubt's answer buttons or its tick; "Leave it
  out" / "Keep as a note" for things that don't fit (they move to the notes layer, so they stop being
  problems). Errors can't be dismissed: they're facts.
- **Verdict chip** (status line), from `useLiveCheck` (clingo in a worker, 400 ms debounce):
  - Checking… (dashed) · **No solution** (red; "No solution · 2 broken rules" when the converter
    finds given-vs-given conflicts, without waiting for the solver)
  - **Several solutions** (red) · **One solution** (green) · Panels: **Solvable** (green)
  - With no type: "No type yet, so nothing to check".
  - A click on the chip is Check.
- For "several solutions" today's `countSolutions` returns only a count; it needs to return the two
  boards (cheap: clingo already finds them). For "solvable" it returns the first solution, which
  the panel draws.

## 3. The Rules panel, per type

Settings come from the engine: the genre's preset rules (`genres[g].rules`), the rule blocks'
settings (`RULES` in `editor/coverage.ts`), and the puzzle-level lists. The panel shows only what
the type uses, as segmented choices, switches and lists, never a free "Add a rule" (admins keep that
in a collapsed **Advanced** section, with the Look panel).

| Type | Settings shown |
|---|---|
| Sudoku | box shape (2×3 / 3×2 / drawn), diagonals, digits or letters |
| Irregular / Thermo Sudoku | as Sudoku, boxes from drawn areas; Thermo: nothing extra |
| Fillomino | allowed sizes (list) |
| Sum Blobs | the target |
| Number Fill-In | the number list (one chip per entry, add / remove) |
| Polyomino Packing, Connect the Critters, Panes | shape bank (drawn as shape stamps off the grid, mirrored here as a list) |
| Find the Cut Line | pieces, symmetry |
| Panel | symmetry (none / mirror / turn) |
| Star Battle | stars per row, column and area |
| Abstract Art | shares per colour |
| Twins and Triplets | tiles |
| Panes | its rules (each a switch) |

(RYB is left for later: decision 7.)

The lists live in one place each: a list that is also drawn (the shape bank, a fill-in's list)
is edited on the paper or in the panel and both show the same thing.

## 4. The converter

**Built (phase 1):** `app/app/sketchpad/to-puzzle.ts`, pure and unit-tested
(`tests/unit/to-puzzle.test.ts`):

```ts
convert(d: Drawing, genre: GenreName, settings?: Settings): { spec: GridSpec | null; used: Set<number>; problems: Problem[] }
// Settings = Pick<GridSpec, "rules" | "style" | "marks" | "hearts">: the Rules and Look panels, copied into the spec as they are
// Problem  = { kind, text, items: number[] (item ids: the mark's anchor), cells?: [row, col][] }
// kind: off-type | off-grid | ambiguous | grid | unsupported | incomplete | rule
ruleHints(puzzle): { text, cells }[]      // clue-vs-clue clashes ("Two 5s in row 6")
breaksRules(problems): boolean            // any "rule" problem: the verdict says No solution
normalSpec(spec): GridSpec                // one form for comparing puzzles
PROFILES: Record<GenreName, Profile | null>   // null: RYB, not in paint yet ("unsupported")
READERS: Record<Part, Reader | null>          // Part = Given["kind"] | areas | entries | picture | box-lines | major-lines
```

Both tables are typed against the engine's lists, so a new genre or clue kind fails
`npm --prefix app run typecheck` until it has a profile or a reader. `spec` is null only with no
grid or for RYB; otherwise it's always made, with what doesn't fit left out and flagged. The
engine's `makePuzzle` errors become `incomplete` problems (a maze's second door), and rule hints
become `rule` problems pointing at the clues' items and squares. Fixes ("make these pearls") are
not in phase 1; they come with the validation UI (phase 3).

It runs on every change in the browser (fast: a pass over items per reader), and on the server at
save and publish. `toDrawing` (from-puzzle.ts) is its inverse.

### 4.1 Steps
1. **Grid**: the grid's rows and columns → `size`; the type sets the geometry (hexagons, a
   lattice), and a grid drawn in another look is a `grid` problem. No grid → no puzzle.
2. **Place** each item by its anchor (cell, corner, edge, inset, ring outside the grid, loose,
   page). Loose and page items count as on a square's centre, a corner or a line's middle within
   0.25 of a square of it.
3. **Read**: each part the profile lists has a reader that takes the items it understands, in one
   fixed order (`READ_ORDER`: a door's arrow before walls, a sudoku's box lines before areas,
   numbers before symbols). Lines are resolved first (4.2) and readers take their parts.
4. **Areas** from the borders left (flood fill), for types with areas.
5. **What's left**: writing above the grid is the title (ignored, not a problem); anything else is
   `off-type` (on the grid, not this type's) or `off-grid`.
6. `makePuzzle(spec)` and the rule hints (4.6).

### 4.2 Resolving pen lines
Resample each stroke every ⅙ square and classify it by what it follows:

| The stroke follows | Becomes (by type) |
|---|---|
| grid lines, corner to corner | **area borders** (Star Battle, Aquarium, Irregular Sudoku, Sudoku "drawn" boxes, Fillomino givens' outlines), **walls** (Simple Loop, Simple Path, Maze, Panes) |
| square centres, square to square | **thermometer** (Thermo Sudoku; the bulb end is the stone), otherwise "lines aren't part of X" |
| an arrow across the frame | **door** (Maze, Simple Path) |
| closed straight-line shapes off any grid | **pieces** (RYB) |
| a panel's tracks | nothing: "the player draws the line; break a track with the eraser" |
| none of these | "this line isn't on the grid" |

A stroke that mixes (half on lines, half across squares) is split at the change and each part
classified; in a mixed stroke a part under ¾ square is ignored as a slip. A sample within 0.15 of
a grid line is on it; a stretch on a line shorter than ¾ square between stretches across squares is
a crossing (a thermometer turning at a corner), and a short wobble off a line between two
stretches on it is still on it. Lines on a hexagon grid aren't read.

As built: walls are any weight; areas take what box lines leave (so Sudoku: medium on the box
lines = box lines, which the boxes setting decides and which are flagged when they're elsewhere;
anything else along the lines = drawn areas). A nonogram's heavier line every 5 is consumed. A
thermometer's bulb is a stone at either end (no stone, or one at both ends, is `ambiguous`); a
border that closes nothing off is `ambiguous`; a door is a shaft from the middle of an outside
square's side straight out, with its head (short strokes) at the tip, and without a head it's
`ambiguous`. A stroke used in part is in `used`, and its other parts are still flagged. Weight matters only where the type
uses two (Sudoku: medium = box lines, bold = drawn areas). Snap is on by default, so most strokes
are already corner to corner.

### 4.3 Profiles: drawing item → clue kind
One profile per genre, typed `Record<GenreName, Profile | null>` so a new genre fails the type
check until it has one (the CLAUDE.md rule, moved from `BoardEditor`'s `TOOLS` to here). As built,
a profile is the list of parts it reads (clue kinds and `areas`, `entries`, `picture`, `box-lines`,
`major-lines`), the grid look, and what to say about lines it has no use for. Panel reads stones
as squares in their colour, crests as stars (orange when uncoloured); Panes reads a coloured stone
as a rose, a ★ stamp or non-numeric writing as a symbol; Twins and Triplets reads its tiles from
stone / crest / triangle stamps in red, yellow or blue (the `tiles` setting decides which exist);
Abstract Art and Binary Puzzle read a wash by its colour's name against the palette.

| Drawing item | Clue kind | Types |
|---|---|---|
| text, digit, in a square | `number` | Sudoku family, Nurikabe, Akari (on rock), Hitori, Shikaku, Fillomino, Hidoku, Honeycomb, Hive, Sum Blobs, Cave, Square Jam, Wittgenstein, Minesweeper, Numberlink, Slitherlink, Panes, Fill-In |
| text, letter, in a square | `number` with `letter` / symbols | Akari cipher, lettered Sudoku |
| text in the ring outside | `skyscraper` / `first` / `total` | Skyscrapers, Easy as ABC, Aquarium |
| small text on a corner | `count` / `watchtower` | Maze, Panes |
| small text on an edge | `difference` / `inequality` (`<` `>` `∧` `∨`) | Panes |
| small text at a square's sides | `compass` | Panes |
| text runs beside rows / above columns | `runs` | Nonogram |
| wash over squares | `color` (Binary, Abstract Art); the **picture** (Nonogram: runs worked out) | |
| stamp: shaded square | `block` | Akari, Simple Loop/Path, Fill-In, Hidoku, Honeycomb, Hive, Sum Blobs, Packing, Critters, Cut Line, Panes |
| stamp: stone | `pearl` (Masyu), `square` (Panel), `peg` (Pythagorean), `dots` (RYB), tile (Twins) | |
| stamp: star | `symbol ★` | Panes |
| stamp: circle | `galaxy` | Spiral Galaxies |
| stamp: diamonds | `twins` / `opposites` | Panes |
| stamps: start, end, hoshi, crest, triangle, shape, eraser | `start`, `end`, `hexagon`, `star`, `triangle`, `shape`, `eraser` | Panel |
| stamp: shape off the grid | `bank` | Packing, Critters, Panes |
| eraser gap on a track | `gap` | Panel |
| text under the grid | `lengths` (Pythagorean), the list (Fill-In) | |
| writing above the grid | ignored (it's the title); the type isn't read from it in paint | all |

Ambiguities are settled by the type, not guessed: a "3" in a Panel square is not a clue
("Panels have no numbers: make it 3 triangles?"), a black stone in Sudoku "isn't part of Sudoku".

### 4.4 Tools per type (paint's rail)
Derived from the profile: a tool shows if any item it makes maps to something. E.g. Sudoku: Grid,
Text, Eraser. Panel: Grid, Stamp, Eraser. Star Battle: Grid, Pen, Eraser. Masyu: Grid, Stamp,
Eraser. Nonogram: Grid, Wash, Text, Eraser. RYB: Line, Stamp, Eraser.

### 4.5 Tests
- **Round trip, puzzle side** (built): for every example (`src/games/*/*.json`, RYB aside) and
  synthetic specs for clue kinds no example uses, `convert(toDrawing(spec), genre, {rules, style})`
  gives `spec` again under `normalSpec`, with no problems, and every item but the title used. All
  37 non-RYB example folders pass. Normalising: givens in one order, pairs of cells or corners
  sorted where order doesn't matter (not an inequality's), shapes at 0,0, areas relettered in
  reading order, entries and lengths sorted, a nonogram's `picture` as the runs worked out from it
  (toDrawing writes the numbers, not the picture's washes; washes in a nonogram are read back as a
  picture, without the colours being the original hex values).
- **Not yet round-tripping**: RYB (no grid: closed straight-line shapes → pieces is new geometry);
  `dots` (RYB's). Thermometers, inequality signs and palisade marks have their own sketchpad items
  now (the Thermometer stamp, dragged from the bulb; the Inequality stamp on a line, with which way
  it points; the Palisade stamp with its inked sides), drawn as the boards draw them.
- **Problems, lines, switching type, rule hints** (built): off-type, off-grid, title, loose
  snapping, wrong look, no grid, RYB; resolveStroke on straight, diagonal, wobbly, overshooting and
  mixed strokes; thermometers with no bulb, dangling borders, headless doors, misplaced box lines;
  a Masyu read as Sudoku and as Panel, a Sudoku as Panel, an Akari as Hidoku; and the hints below.
- **Round trip, drawing side** (to do): for drawings made only of canonical items,
  `toDrawing(convert(d))` has the same items (ids and order aside).
- **Reader eval**: `npm run eval` scores reads through `convert(toDrawing(reading))`, so it measures
  what the creator will see.
- **E2E**: per type, draw the example with the mouse in paint, check the verdict, publish (as
  `editor.spec.ts` does with BoardEditor today).

### 4.6 Rule hints
`ruleHints(puzzle)` puts just the clues on a board and runs the engine's own `latin` and `boxes`
checks on it (keeping repeats, not "fill every cell"), worded as "Two 5s in row 6", "Two 2s in a
box" / "in an area"; plus, by hand: digits out of range ("7 is too big: the numbers here run 1 to
4"), thermometer clues that can't rise by their distance (the engine's check only compares
neighbours), letters repeated in a row or column (Easy as ABC), and repeats in a number path or a
tile set. Only digit types have hints so far; shading, region and line types can add theirs (an
Akari number larger than its open neighbours, say) in the same place.

## 5. Retired and reused

| Retired (after parity) | Reused |
|---|---|
| `BoardEditor.tsx`, `FigureEditor.tsx`, the editing half of `GameEditor.tsx` | `Sketchpad.tsx`, `sketchpad/model.ts`, `draw.ts`, `export.ts` |
| `/new/draw` (paint is `/g/<id>/draw`) and the "Upload / Draw" tabs | `from-puzzle.ts` (now product code, not only tests) |
| Sending the drawing's PNG to the reader (paint data is converted, not read) | `ReadingScreen`, `read-sketch.server.ts`, `photos.server.ts`, doubts (`games/doubts.ts`) |
| `editor/coverage.ts`'s per-tool tables (move to the profiles) | `useLiveCheck`, `count-solutions.client.ts` (extended to return two boards) |
| Most of `editor/ops.ts` (keep `SHAPES` and helpers paint uses) | `RulesPanel`'s settings rendering (restyled), `LookPanel` (admins), `GuidePane`, `PreviewScreen`, the publish action and hash check |

## 6. Build plan

1. **Converter, no UI** (largest risk first). (done: `sketchpad/to-puzzle.ts`) `convert` + profiles for every genre + round-trip
   tests green for all examples. Add the stamps/tools the round trip shows are missing (a real
   thermometer, inequality signs, palisade) instead of rough drawings.
2. (done: `routes/game-draw.tsx`, `components/Paint.tsx`, `sketchpad/kit.ts`, `games/paint-save.ts`,
   migration `0008_game_drawing`) **Type mode in paint** on `/g/<id>/draw`: Type chip, filtered tools and stamps,
   Rules panel, live convert + verdict chip. Server autosave (`games.drawing`, migration).
3. (done, in part: `sketchpad/check.ts`, the Check panel, marks and tips, "show a difference";
   not yet: the notes layer, "Keep as a note", translations like "make these pearls")
   **Validation**: overlay marks, notes, To check popover, fixes; rule hints from given conflicts;
   "show a difference".
4. (done: `routes/new.tsx`, `sketchpad/suggest.ts`, the panel's Photo section) **Start and photo
   path**: new `/new`; reading → `toDrawing` → paint with doubts as pins; photo card; type picker
   with suggestions (photo `kindChoices`; drawing-data suggestions).
5. (done: `routes/game-publish.tsx`, `sketchpad/picture.ts`) **Publish page** with the test-play.
6. **Edit published puzzles in paint**; e2e parity per type; then remove BoardEditor, FigureEditor,
   `/new/draw`.

Risks:
- **Fidelity**: types whose clues the sketchpad can only draw roughly (thermo, inequality,
  palisade, coloured nonogram pictures, roses). Mitigation: phase 1 adds real tools; the round trip
  is the gate.
- **RYB** has no grid: its converter (closed shapes → pieces) is new geometry. Could stay on
  FigureEditor longest.
- **Panes** has 13 clue kinds and its own rules: the biggest profile and panel.
- **Line ambiguity** on freehand strokes: mitigated by Snap on by default and by types that
  don't use lines hiding the pen.
- **Solver cost** on big puzzles (9 × 9 Sudoku and up; two-solution search): debounce, cancel stale
  runs, show Checking…; maybe a size limit for live checking.
- **Big grids on phones** (15 × 15 nonograms): zoom and pan must be good before paint is the only
  editor.
- **Losing BoardEditor features** people rely on (typing numbers with arrow keys, area painting):
  paint's Text already moves with arrows; areas need a quick "paint regions" mode for Star Battle-like
  types (bold borders by dragging across squares).

### As built (phases 2 and 3)
- Drafts only: a published game's `/draw` goes to its editor until phase 6. Publish in paint saves
  and opens the publish page (phase 5).
- The Check panel's list is live, like the verdict chip, rather than refreshed on Check: its numbers
  then always match the pins on the paper. Check opens it and selects the first broken rule.
- "Several solutions" lists every square where the solver's two solutions differ, each a
  difference with both values pencilled; for shading and lines, the squares that differ as one.
- A sudoku's box lines come with its grid (drawn from the Rules panel's box shape), so Sudoku's
  rail is Grid, Text, Eraser; Irregular Sudoku keeps the pen for its areas.
- Switching type isn't an undo step of its own (the grid's change of look is).

### As built (phases 4 and 5)
- `/new`: Start from a sketch, Start blank, and the three latest drafts. Start blank makes the draft
  (no type, no sketch, no drawing) and opens paint; a photo is read as before and its sketch drawn
  in ink (`paintFromSketch`), saved as the draft's drawing with the type it was read as (also when
  the reader wasn't sure of the type: its candidates answer What type is this?), then paint opens
  with the panel at the photo (`?read=1`). A failed read stays on `/new` with the error. Lay it
  over, Read again and Trace over aren't built yet.
- Doubts are lettered (A, B…) amber marks, so they don't share numbers with Check's list; each has
  its tip and a tick ("It's right", or the checkbox), saved as the editor's ticks are. One-tap
  answers ("2" / "3") aren't built.
- What type is this? for a drawing tries every type paint makes in its own grid look, ranks them
  (everything used first, then the verdict, exactly one first, then the fewest problems) and
  solves the best 8 in turn, 12 seconds at most, with Cancel. No call to Claude. It's in the
  picker and in the "choose a type first" reminder.
- The publish page: no collection picker; the draft stays where `/new` made it (the profile, or
  the `?in=` studio). The test-play's host saves nothing (not even to `sessionStorage`). Publish
  is the editor's rule: the server converts the saved drawing again and checks its hash against
  the one the browser's solver passed. Doubts left and things that don't fit warn in the bar.
- The description sits beside the board, under the "Drawn by" thumbnail, on the publish page and
  on a published page that has a drawing (open question 1, for now); games without a drawing keep
  it under the board. The thumbnail enlarges on a click.
- Drafts with no type show "No type yet" (`kindName("")`), with their drawing as the card's picture;
  drafts drawn in paint (or with no type) open in paint from the Drafts tab, `/new` and the game page.
- Tests: `tests/e2e/create.spec.ts` gives the photo's reading itself (the `given-reading` form field,
  honoured only in development), so no test calls Claude.

## 7. Open questions

The first draft's seven are answered (Decisions, at the top). Left from this revision:

1. **The description's place on published pages**: beside the board, as on the draft's game page
   (a small change to `GamePageView`), or under it as now (then the draft page puts it there too)?
2. **The "Drawn by" thumbnail**: always shown, or may a creator hide it (a tidy engine picture
   only)?
