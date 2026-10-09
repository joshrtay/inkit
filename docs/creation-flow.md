# Creation flow: paint is the editor

A design for making puzzles on inkit with the sketchpad ("paint") as the one editor. Nothing here
is built yet. Mockups (static HTML in the site's look, drawings made by the real sketchpad, picture
and solver code via `make-boards.ts`) are in [creation-flow-mockups/](creation-flow-mockups/), one
PNG per screen.

**The idea in one line.** A creator starts from a photo or a blank page, draws in paint, sets the
puzzle type whenever they know it, and from then on paint only offers that type's tools, checks the
drawing as they go, and says how many solutions it has. A deterministic converter turns the drawing
into the puzzle. AI only reads photos and suggests types.

## 1. Screens

| # | Screen | Mockup |
|---|---|---|
| 1 | Start (`/new`) | `01-start.png` |
| 2 | Paint, just read from a photo | `02-paint-from-photo.png` |
| 3 | Paint, type mode: Sudoku | `03-paint-sudoku.png` |
| 4 | Paint, type mode: Panel | `04-paint-panel.png` |
| 5 | Paint, type mode: Honeycomb Paths (hexagons) | `05-paint-honeycomb.png` |
| 6 | "What type is this?" | `06-type-picker.png` |
| 7 | Check & publish | `07-publish.png` |
| 8 | Paint on a phone | `08-phone-paint.png` |

### 1.1 Start (`/new`)
Two cards: **Start from a sketch** (choose or take a photo) and **Start blank** (an empty page).
Under them an optional **Puzzle type** select ("Not sure yet" by default), sent with either choice,
and **Carry on with a draft** (the three latest drafts; the rest are on the profile's Drafts tab).
`?in=<studio>` keeps working as now.

- Either choice creates the draft game straight away (state `draft`, no sketch yet) and goes to
  **`/g/<id>/draw`**, so there is one URL per puzzle from the first second and autosave has
  somewhere to go.
- **Photo**: shrink in the browser (as today), upload, show `ReadingScreen` while Claude reads,
  then land in paint with the reading drawn (1.2).

### 1.2 Paint, just read from a photo
The reader's result goes through the existing pipeline (reading → sketch → `makePuzzle`) and then
`from-puzzle.ts`'s `toDrawing` draws it in ink. What the creator wrote on the paper (title, type)
is drawn as written.

- A **strip** at the top of the workspace says what happened: "Claude read your photo as Akari,
  8 × 8 and drew it in ink. 3 things to check." It closes for good.
- **Your photo** is a floating reference card on the workspace (header button **Photo** toggles
  it): look, **lay it over the drawing** (50% opacity, aligned to the grid), **Read again**
  (careful reader, as today's re-read), **Trace over** (photo under the paper, drawing tools on top:
  the fallback when a read is poor).
- Each **doubt** is a numbered amber pin on its square, line or row (doubts already carry a place:
  `games/doubts.ts`). The list is the **To check** popover from the status line; each doubt offers
  its likely answers as one-tap buttons ("2" / "3", "Shaded" / "A smudge: erase"), plus "Something
  else" (selects the item with the right tool). Answering applies the edit and ticks the doubt.
- The type comes from the reading and is labelled "read from the photo" until the creator touches it.

Edge cases:
- **Read fails** (no puzzle found, API error): stay on the start screen with the error and two ways
  on: "Try another photo" or "Trace it yourself" (a blank page with the photo under it).
- **Read is unsure of the type** (low confidence, or `kindChoices` with no clear winner): draw what
  was read with no type set, and open the type picker (1.6) with Claude's choices as suggestions.
- **Partial read** (some regions unreadable): draw what was read; each gap is a doubt with no
  one-tap answer ("Couldn't read this row").
- **Something the drawing can't hold** (`from-puzzle` reports `gaps`): drawn as close as it can,
  listed as doubts. (The converter work in §4 aims to make this list empty.)

### 1.3 Paint, type mode
Set from the header's **Type** chip at any time. Once set (screens 3 to 5):

- **Tools** (left rail): only the type's (table in §4.4). Sudoku: Grid, Text, Eraser.
- **Grid**: the type fixes the look (Panel → Tracks, Honeycomb → Hexagons, Pythagorean → Dots);
  the other looks are disabled with a one-line reason in the options bar. Size limits from the
  engine (e.g. Sudoku sizes with a box shape) are enforced by the steppers.
- **Options bar**: unchanged job (the chosen tool's settings), now type-aware: Text in Sudoku
  writes "Digits 1–6" or **Notes** (notes are drawn in a lighter hand and never go in the puzzle).
- **Right panel**, one job per section:
  - **Stamps**: only the type's stamps (Panel: start, end, hoshi, stone, crest, triangle, shape,
    eraser symbol; Akari: shaded square). Hidden if the type has none (with one line saying so).
  - **Colour**: only if the type's stamps take a colour, and only the colours the type allows.
  - **Rules**: "Always: …" (the genre's built-in rules, from `describe()`), then the type's
    settings and lists (§3).
- **Status line** (bottom): hint · grid facts · **verdict chip** · **to-check chip** · Snap · zoom.
- **Header**: back · name (editable in place) · save state | undo, redo, clear · Type chip ·
  How to play (the guide pane, opened at this type) · **Check & publish**.

### 1.4 Switching type mid-drawing
- Picking a type never deletes anything. The converter re-runs; items the new type can't use are
  marked **doesn't fit** (red dashed outline, pin) and listed in To check with **Erase** and, where
  one exists, a **translation** ("Make these 3 stones pearls"). One button erases all that don't fit.
- What carries over automatically: the grid and every item's square; Rules settings with the same
  meaning (size, allowed sizes, symmetry). The grid's look changes to the type's (hex ↔ square keeps
  each item's row and column; a hex layout that can't hold an item marks it).
- The switch is one undo step. "Not set" is a valid choice: back to plain paint with all tools.
- Items drawn before the type was set that the type can't use (a pen path on Honeycomb Paths:
  screen 5) get **Erase** or **Keep as a note** (moved to the notes layer: drawn, never converted).

### 1.5 Drafts and autosave
- The drawing is saved to the server (debounced ~1.5 s after the last change, and on leaving), with
  `localStorage` as the offline buffer (today's `inkit:sketchpad` key, now per game:
  `inkit:draw:<id>`). Header shows Saving… / Saved / Offline, saved here.
- What is saved: the **drawing** (model.ts `Drawing`, new column `games.drawing`), the **type**,
  the **rule settings**, the **converted sketch** (as today's `games.sketch`), and doubt state.
- Opening a draft restores undo history only for this browser session (history isn't stored).
- Two tabs on one draft: last write wins; the losing tab shows "Changed elsewhere: reload".

### 1.6 "What type is this?"
Opened from the Type chip, from "Check & publish" when no type is set, or after an unsure read.

- **Suggestions** (top 3): from the reading's `kindChoices` for photos; for drawings, a call to
  the quick reader with the drawing's data (`objects()`, no image needed) on demand (pressing the
  chip), never automatically on each stroke. Each card shows **your drawing as that type** (the
  converter's output in the type's picture) and the **solver's verdict** on it (screen 6 shows the
  real verdicts: Nurikabe one, Shikaku none, Fillomino several). "Uses everything you drew" or
  "3 things won't fit".
- **All types**: searchable grid of the guide examples' pictures (the existing guide list data).
- Footer: "You can change the type any time; nothing you drew is lost." Not now / Make it X.

### 1.7 Check & publish (`/g/<id>/publish`)
A page of its own (screen 7). Left: **Play it yourself**, the real player (`MountGame`) with a host
that saves to `sessionStorage` and never records a solve. Right: title, description, the **verdict
card**, facts (type, size, rules, clue count), two ticks ("Nothing on the page is left out of the
puzzle", "Played it through yourself", the second optional), where it goes, **Publish**.

- Publish is enabled only when the verdict passes (one solution; panels at least one) and the
  title isn't empty. Unanswered doubts and "doesn't fit" items warn, they don't block (the converter
  ignores what doesn't fit, and the ticks say so).
- The server re-converts the saved drawing and re-checks the hash, as the editor's publish does
  today (`check.hash`), so the client can't publish a sketch that wasn't checked.

### 1.8 Editing a published puzzle
`/g/<id>/edit` opens paint with the saved drawing; games published before this have none, so
`toDrawing(spec)` makes one (and it's saved on the first change). The published puzzle doesn't
change while you draw: the header button says **Check & update**, the publish page **Update**, and
the update needs a passing verdict. Solves and likes stay (as today). Changing the type of a
published puzzle is allowed but warned ("Players' progress on it will reset").

### 1.9 Phones (screen 8)
The sketchpad's phone layout as it is (paper on top; status, options and tools stacked at the
bottom; Colour, Stamps and Rules in the bottom sheet behind the palette button, as three tabs).
Type mode makes phones easier: Sudoku has three tools, Panel three. The header keeps back, undo,
redo, the Type chip (name only) and **Publish**; the name is edited on the publish page. Notes on
the canvas sit below the paper so they never cover what they're about. The status line holds only
the two chips; the tool hint moves into the options bar.

### 1.10 Kids
- **Start blank with a type** gives the smallest tool set; Rules use plain words ("Each row holds 1
  to 6 once"); hints are friendly and specific ("Two 5s in row 6"), never "invalid".
- Big targets (44 px on touch, as now), no AI needed to make a puzzle, no free text on the page
  except clues (notes stay private).
- Open question: an age gate or supervised publishing (see §7).

## 2. Validation UX

Three kinds of message, one look each, all from the converter and the engine (no AI):

| Kind | Example | Mark on the paper | Blocks publish? |
|---|---|---|---|
| **Doubt** (from a photo read) | "Is this a 2 or a 3?" | amber outline + numbered amber pin | no (warns) |
| **Doesn't fit / not on the grid** | "A crest isn't part of Sudoku", "This line isn't on the grid", "Panels have no numbers" | red dashed outline + red pin | no: left out of the puzzle (warns) |
| **Rule hint** | "Two 5s in row 6" | orange ring on each clue involved, dotted line between | it means no solution, so yes (via the verdict) |

- **Where**: the mark is on the paper (an overlay layer like `.sp-ui`, never exported). The words
  appear in a **note** beside the mark for the newest problem only (one at a time, so the paper
  stays readable), and all of them are in the **To check** popover from the status line chip
  ("3 to check"). Clicking a list item scrolls to and flashes its mark.
- **When**: doubts and "doesn't fit" appear at once; rule hints appear live, including **while
  typing** (the hint previews the digit before it's committed: screen 3). Notes fade after 6 s or
  on the next action; the mark and the list entry stay until fixed.
- **Dismissed by**: fixing the item (the mark goes); a doubt's answer buttons or its tick; "Leave it
  out" / "Keep as a note" for things that don't fit (they move to the notes layer, so they stop being
  problems). Rule hints can't be dismissed: they're facts.
- **Verdict chip** (status line), from `useLiveCheck` (clingo in a worker, 400 ms debounce):
  - Checking… (dashed) · **No solution** (red; if there are rule hints, "No solution: see the hint")
  - **Several solutions · show a difference** (red): solve for two, highlight one square where they
    differ with both values pencilled ("4/3"); **Next difference** cycles. For line and region
    types, the difference is drawn as the two solutions' lines or borders in two washes.
  - **One solution** (green) · Panels: **Solvable · show the line** (draws one solution's line).
  - With no type: "No type yet, so nothing to check".
- For "several solutions" today's `countSolutions` returns only a count; it needs to return the two
  boards (cheap: clingo already finds them).

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
| RYB | pieces (from closed shapes drawn with Line), dots per piece |
| Panes | its rules (each a switch) |

The lists live in one place each: a list that is also drawn (the shape bank, a fill-in's list)
is edited on the paper or in the panel and both show the same thing.

## 4. The converter

`app/app/sketchpad/convert.ts`, pure and unit-tested:

```ts
convert(d: Drawing, genre: GenreName, settings: RuleSettings):
  { spec: GridSpec | null; used: Set<number>; problems: Problem[] }   // Problem: { item ids, kind, text, fixes }
```

It runs on every change in the browser (fast: a pass over items), and on the server at save and
publish. `toDrawing` (from-puzzle.ts) is its inverse.

### 4.1 Steps
1. **Grid**: the grid's rows, columns and look → `size` (and `geometry` for hex / lattice).
   No grid → no puzzle (RYB excepted).
2. **Place** each item by its anchor (cell, corner, edge, inset, ring outside the grid, loose,
   page). Loose and page items are snapped if they're within 0.25 of a square of a place the type
   uses; otherwise they're "not on the grid".
3. **Map** each item through the type's **profile** (4.3) to a given, a setting, or a problem.
4. **Lines** (pen and straight) are resolved per type (4.2).
5. **Areas** from bold borders (flood fill) for types with areas.
6. `makePuzzle(spec)` and the engine's checks; given-vs-given conflicts become rule hints.

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
classified; a part under 1 square long is ignored as a slip. Weight matters only where the type
uses two (Sudoku: medium = box lines, bold = drawn areas). Snap is on by default, so most strokes
are already corner to corner.

### 4.3 Profiles: drawing item → clue kind
One profile per genre, typed `Record<Exclude<GenreName, never>, Profile>` so a new genre fails the
type check until it has one (the CLAUDE.md rule, moved from `BoardEditor`'s `TOOLS` to here).

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
- **Round trip, puzzle side**: for every example (`src/games/*/*.json`) and the synthetic specs in
  `sketchpad-coverage.test.ts`: `convert(toDrawing(spec)).spec` equals `spec` (normalised:
  givens sorted, defaults dropped). This replaces `EXPECTED_GAPS`' role: each gap left is a failing
  type until fixed.
- **Round trip, drawing side**: for drawings made only of canonical items, `toDrawing(convert(d))`
  has the same items (ids and order aside).
- **Line resolution**: hand-written strokes (wobbly, overshooting, mixed) per row of 4.2.
- **Problems**: one test per problem kind and per fix ("make it 3 triangles" yields a triangle).
- **Reader eval**: `npm run eval` scores reads through `convert(toDrawing(reading))`, so it measures
  what the creator will see.
- **E2E**: per type, draw the example with the mouse in paint, check the verdict, publish (as
  `editor.spec.ts` does with BoardEditor today).

## 5. Retired and reused

| Retired (after parity) | Reused |
|---|---|
| `BoardEditor.tsx`, `FigureEditor.tsx`, the editing half of `GameEditor.tsx` | `Sketchpad.tsx`, `sketchpad/model.ts`, `draw.ts`, `export.ts` |
| `/new/draw` (paint is `/g/<id>/draw`) and the "Upload / Draw" tabs | `from-puzzle.ts` (now product code, not only tests) |
| Sending the drawing's PNG to the reader (paint data is converted, not read) | `ReadingScreen`, `read-sketch.server.ts`, `photos.server.ts`, doubts (`games/doubts.ts`) |
| `editor/coverage.ts`'s per-tool tables (move to the profiles) | `useLiveCheck`, `count-solutions.client.ts` (extended to return two boards) |
| Most of `editor/ops.ts` (keep `SHAPES` and helpers paint uses) | `RulesPanel`'s settings rendering (restyled), `LookPanel` (admins), `GuidePane`, `PreviewScreen`, the publish action and hash check |

## 6. Build plan

1. **Converter, no UI** (largest risk first). `convert.ts` + profiles for every genre + round-trip
   tests green for all examples. Add the stamps/tools the round trip shows are missing (a real
   thermometer, inequality signs, palisade) instead of rough drawings.
2. **Type mode in paint** behind a flag on `/g/<id>/draw`: Type chip, filtered tools and stamps,
   Rules panel, live convert + verdict chip. Server autosave (`games.drawing`, migration).
3. **Validation**: overlay marks, notes, To check popover, fixes; rule hints from given conflicts;
   "show a difference".
4. **Start and photo path**: new `/new`; reading → `toDrawing` → paint with doubts as pins; photo
   card; type picker with suggestions (photo `kindChoices`; drawing-data suggestions).
5. **Publish page** with the test-play.
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

## 7. Open questions for the owner

1. **Is the drawing the source of truth?** Proposed: yes, stored next to the sketch; the sketch is
   always the converter's output. (Admin edits to a sketch by hand would be lost.)
2. **Notes and decoration**: may a published puzzle's page show the creator's own drawing (with its
   notes), or always the engine's picture?
3. **Type suggestions for drawings**: on demand only (proposed), or automatic once a drawing looks
   finished?
4. **Strict tool filtering**: show only the type's tools (proposed), or an "All tools" escape for
   decoration?
5. **Rule hints vs. the verdict**: a rule hint means no solution; should the verdict chip then say
   "No solution" (proposed) even while the hint is only a preview of a digit being typed?
6. **Kids**: an age gate, a supervised account, or publishing review for young creators?
7. **RYB**: in paint from the start, or kept on FigureEditor until last?
