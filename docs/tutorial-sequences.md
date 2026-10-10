# How acclaimed puzzles sequence their tutorials

This document collects how acclaimed puzzle games and publishers order the first puzzles for a new
rule, and turns that into recommendations for Slate, the tutorial creator proposed in
[research-tutorials.md](research-tutorials.md) (§4). It is a companion to that document and to
[panel-design.md](panel-design.md).

It is written in our own words. It copies no puzzles, levels or art. The collected material lives
in `references/tutorial-sequences/` (local only, gitignored):
- one JSON file per source, with ordered steps, a purpose and a step type for each, board sizes,
  symbol counts and links;
- `witness-panels/` and `glimmith-puzzles/`, the panels and puzzles in our format, kept for
  analysis only.

**Step types** are the ones Slate uses: *introduce* (a new idea on its own), *contrast* (the same
board with one thing changed, and a different answer), *trap* (the obvious move fails), *check*
(you can't solve it without the idea), *combine* (with an earlier idea), and *review* (an earlier
idea again, with nothing new). They are our readings of each step, not the designers' labels.

## Sources

| source | what we have | order from |
|---|---|---|
| The Witness | 11 sequences, 97 panels in our format (squares, dots, symmetry, shapes, rotated shapes, stars, stars with squares, erasers) | [Archipelago's vanilla logic file](https://github.com/ArchipelagoMW/Archipelago/blob/main/worlds/witness/data/WitnessLogicVanilla.txt) (MIT), which lists every panel per area in unlock order; panel data from [ttws](https://github.com/barrycohen/ttws)'s Windmill codes, imported by `puzzles/grid/witness-import.ts` |
| The Artisan of Glimmith | 13 windows, 614 puzzles listed with tiers, 82 of the openers in our format | walkthrough order ([yekbot](https://www.yekbot.com/the-artisan-of-glimmith-walkthrough-guide/), [camzillasmom](https://camzillasmom.com/?s=glimmith)); rules mapped per [glimmith-rules.md](glimmith-rules.md) |
| Baba Is You, Patrick's Parabox, Cosmic Express, A Monster's Expedition, Stephen's Sausage Roll | first-world level lists as notes | wikis, walkthroughs, the designers' writing (links in each file) |
| GMPuzzles, Cracking the Cryptic, Logic Masters Deutschland, Nikoli, Puzzle Square JP | structure only: steps per rule, sizes, ramps | the publishers' own pages; PSJP from our local copy |
| Beast Academy | set structure only, from [beast-academy-puzzles.md](beast-academy-puzzles.md) | no login, no paid content |

Gaps:
- Witness triangles and hollow (negative) shapes have no converted panels. Triangles appear only
  on lone panels scattered around the island (none are in the ttws set), and the import lost the hollow flag.
- Some Witness panel names are matched to the data by sequence length and symbols. Those are
  marked "approx." in the file.
- Many Glimmith puzzles weren't read into our format, so their sizes are unknown. Their order and
  tier are known.

## 1. The Witness, in game order

Panels before the symbol first meets another one (from the vanilla list):

| symbol | where | panels alone | first board | sequence shape (sizes) |
|---|---|---|---|---|
| black/white squares | Outside Tutorial, Tree Row 1–9 | 9 | 2×1 | 2×1, 2×1, 3×1, 3×1, 2×2, 3×3, 3×3, 4×4, 4×4 |
| dots | Outside Tutorial, Shed Row 1–5 | 5 (8 with the panels after) | 2×2 | 2×2, 2×2, 3×3 ×4, 5×5 ×2 |
| symmetry | Glass Factory, Back Wall, Front, Melting | 11 | 3×3 | 3×3 → 8×5, then rotational from 3×3 again |
| shapes | Swamp, Entry + Intro Front 1–6 + Intro Back 1–8, then platform rows | 15 in the intro, 22 before hollow shapes | 2×1 | 2×1, 3×1, 3×1, 2×2, 3×3, 5×5, then 3×1 again with two pieces |
| stars | Treehouse, two doors + Yellow Bridge 1–9 + third door | 12 | 2×1 | 2×1, 4×4, 3×3, 4×4, then 2×2 again with four stars |
| erasers | Quarry Stoneworks | 0: always combined, since an eraser needs something to cancel | 1×2 | 6–8 per partner symbol: dots first, then coloured squares, then shapes in the Boathouse |
| coloured squares | Bunker | 1 (then alternates colour only and colour with black/white) | — | not converted |
| triangles | 15 lone "discarded" panels around the island, then the Caves | 1 each | tiny | no sequence; not converted |

What the panels show:

- **Contrast is the main tool, not the occasional one.** Of the 97 panels, we read 22 as contrast
  and 32 as check, against 18 introduce, 11 combine, 9 review and 5 trap. Contrast pairs come in
  runs:
  - Tree Row 1 and 2 have the same two squares with the endpoints moved.
  - Tree Row 3 and 4 have the same strip with the white square moved, so one cut becomes two.
  - Swamp Intro Back 3 to 7 is five 3×3 panels with the same two pieces, each moved one cell.
  - Quarry Lower Row 5 and 6 are the same dots board, first without an eraser and then with one.
- **The board resets at each sub-idea (a sawtooth).** Inside one symbol's sequence the board
  grows (2×1 → 4×4). When a new reading of the same symbol arrives, it drops back to the smallest
  size that shows it:
  - squares: one cut, then two cuts, then an enclosed region;
  - shapes: one piece, then two pieces, then two pieces joined;
  - stars: one pair, then two pairs;
  - symmetry: mirror, then rotation.

  Each symbol is really 2–4 mini-lessons of 3–5 panels each.
- **First boards are 1–2 cells**, and the first one can be solved by accident. A 2×1 (two cells)
  opens squares, shapes and stars. Dots open on 2×2, and symmetry opens on 3×3, the smallest board
  where a mirrored pair of lines makes sense. Panels grow past 4×4 only at a sequence's end.
- **Symbols per panel stay low.** In every introduce step the new symbol appears 1–4 times, with
  nothing else on the board but gaps.
- **Traps are built as a natural reading that the next board breaks.** Each is made by placing
  symbols where the rival reading gives a neat answer that's wrong:
  - six stars in two columns of three, where "one region per column" puts three in a region;
  - same-coloured squares beside stars, which break "stars pair only with stars";
  - a familiar dots board plus an eraser, where the old line fails because the eraser must cancel
    something.

  Traps come after 3–6 panels of the idea, never first.
- **Combining comes late and one partner at a time.** In the Treehouse, stars meet dots after 12
  panels, squares after about 30 (with another 12 stars-only panels in between), and shapes after
  about 50. Each partner gets its own row of 5–7 panels, and stars-only rows keep returning
  between them.
- **Review is by place, not by schedule.** Later areas (Town, Keep, Mountain, Caves, Challenge)
  bring symbols back mixed, often weeks of play later. The Mountain's rows are effectively a
  final exam.

## 2. The Artisan of Glimmith

Glimmith's windows are **pools, not lines**. Each shows 34–70 puzzles at once with a difficulty
tier from 1 to 7, and the player chooses. Tier counts are bell-shaped, peaking at tier 2–3.
Tier-1 puzzles per window: median 5 (range 1–15). The rule is stated as a picture scroll beside
every puzzle, so nothing is discovered wordlessly.

- **Global constraints arrive already combined.**
  - Constraint rules can't pin a board alone: Boxy (every region a rectangle), Mismatch,
    Solitude, Gemini & Delta, Range. Their first puzzle pairs the new rule with an earlier one.
    Boxy opens with Boxy plus an exact size on a 5×5. Mismatch opens with Mismatch plus an exact
    size, Solitude with Area Number, and Range with Area Number.
  - Only 17–31% of the Boxy, Mismatch and Range puzzles we read use the window's rule alone.
- **Clue rules start alone.** Area Number opens on a 4×4 with four numbers. Precision opens on a
  12-cell board. 51–77% of their read puzzles use that rule alone.
- **A gentle room before the deep one.** Hedge Maze comes before the Compass window:
  - Hedge Maze: 34 puzzles, 15 at tier 1, median 15 cells, 88% compass alone;
  - Compass window: 66 puzzles, 1 at tier 1, median 49 cells.
- **Pairing in turn.** A window's early puzzles pair its rule with each earlier rule in turn.
  Boxy's first nine pair it with exact size, Area Number, Mismatch, Rose Windows and Shape Bank.
- **Place windows are review.** Forest Trailhead, Castle Gate and Spiral Island introduce nothing
  and mix earlier rules.

## 3. Movement puzzle games (notes only)

The first-world sequences of Baba Is You, Patrick's Parabox, Cosmic Express, A Monster's
Expedition and Stephen's Sausage Roll are in the local files.

All five teach one idea per level and number their levels inside named areas. They keep several
levels open at once so a stuck player can go elsewhere. Across the 62 steps we recorded:
introduce 23, combine 9, contrast 9, trap 8, check 7, review 6. Confidence varies: Parabox's intro and
Baba's opening map are well sourced; Cosmic Express and A Monster's Expedition are partly
reconstructed (see each file's `confidence`).

- **Baba Is You.** The opening map has 8 levels.
  - Level 0: the rules are visible but needn't be touched.
  - Level 1: can't be won without breaking one rule and forming another.
  - Level 2: changes who "you" are.
  - After that, each level adds one property word and asks for one rule edit.
  - The trap is "Still Out Of Reach". Its title and its near-identical board prime the previous
    level's trick, which no longer works.
  - Ideas recur every 3–4 levels.
  - The Lake (the first world) introduces a new word every 1–2 levels and fills the gaps with
    reviews.
  - ([Teikari interview](https://gamepilgrim.com/2019/04/06/developer-interview-hempuli-oy/))
- **Patrick's Parabox.**
  - Levels 1–3 are plain pushing. Level 3 is a trap: a block against a wall can't be pushed
    directly.
  - Level 4 shows the enterable box in a level you can't fail.
  - Levels 5–8 add one consequence each.
  - Level 9 reverses it (push in, then back out) as a check.
  - That's 6 levels on one idea (4–9) before combining.
  - Each area's name is its idea. Hard levels are marked optional, so checks are opt-in.
  - ([tutorial analysis](https://siddarthrg.substack.com/p/tutorial-design-of-patricks-parabox),
    [GDC 2024](https://schedule.gdconf.com/session/system-centric-puzzle-design-in-patricks-parabox/899968))
- **Cosmic Express.** The first constellation teaches only the base rules, and its difficulty
  climbs steeply inside them. New pieces (more cars, slime, junctions, wormholes) are kept for
  later constellations, one each. Traps come from proximity: a passenger sits beside a box that
  is the right colour but the wrong one, or a board that looks symmetric needs different routes
  on each half. ([hints guide](https://gamepretty.com/cosmic-express-all-hints-guide-2021/))
- **A Monster's Expedition.** The prologue is a chain of tiny islands, one log fact each: fell,
  tip, roll, bridge, raft. Between them, some islands are puzzle-free rests. The prologue ends
  with a misdirect that rewards experimenting.
  ([Game Developer](https://www.gamedeveloper.com/game-platforms/the-relaxing-open-world-puzzle-design-of-i-a-monster-s-expedition-i-))
- **Stephen's Sausage Roll.** There is no ramp: cramped boards where most moves are fatal, each
  hinging on one movement fact. Traps are a quarter of its steps. Most are "the natural order
  leaves you stranded" (the walk home blocked, a sausage that can't be pulled back). Review is a
  named variant of an earlier level about 10 levels on.
  ([wurb](https://www.wurb.com/stack/?p=3136))

## 4. Pencil-puzzle publishers

None of them runs an introduce, contrast, trap, check, combine week. They state the rules and
ramp the difficulty.

- **GMPuzzles** publishes one genre a week, Monday to Saturday, two puzzles a day. One is a fixed
  easy warm-up and the other rises from easy on Monday to very hard on Saturday. A brand-new genre
  goes in the Sunday slot. Themed weeks carry one rule across different base genres (for example
  a "non-consecutive" week over Fillomino, Nanro and Sudoku), which is contrast across bases.
  *Intro to GMPuzzles* has 21 puzzles per genre in 12 genres. A 2024 Sunday puzzle withheld its
  rules and let an example teach them. ([schedule](https://gmpuzzles.com/blog/category/other-posts/schedule/page/29), [Intro to GMPuzzles](https://www.gmpuzzles.com/shelf/introtogmpuzzles.php))
- **Cracking the Cryptic's apps** have no scripted tutorial. Every puzzle is a full 9×9, unlocked
  by stars, with a written hint each. One pack puts 10 beginner puzzles first.
- **Logic Masters Deutschland's** beginners' list has 33 puzzles over 14 types, made to need no
  guessing. The usual block is three per type: very easy, very easy, then one step up ("1, 1, 3").
  A separate nine-step tutorial puts several lessons into one grid's solve path.
  ([beginners' list](https://logic-masters.de/Raetselportal/Suche/anfaenger.php?chlang=en))
- **Nikoli's** genre pages give three short rules, then a sample, a part-solved frame and the
  solution: the rule is shown working before the solver plays. Its first Sudoku book opens on a
  full 9×9 with only about 20 empty cells. ([Slitherlink page](https://www.nikoli.co.jp/en/puzzles/slitherlink/))
- **Puzzle Square JP** has no beginner sequence, only a 1–5 star rating ([puzsq.jp](https://puzsq.jp)). In our local copy of 3,163
  puzzles the median size is 10×10 at every difficulty, the easiest included.
- **Beast Academy** states rules with one worked example, then gives many puzzles per type: up to
  10 sets of up to 8 online, and 30–50 per type in a book. Each set is a short easy-to-hard ramp,
  and the next restarts a little higher (a sawtooth). Variants come late, as one changed rule on
  a known base.

So pencil publishers make the first puzzle easy by **few unknowns, not a small grid**. A game with
instant feedback (The Witness, Glimmith) uses a tiny board instead.

## 5. Patterns across sources

| question | The Witness | Glimmith | movement games | pencil publishers |
|---|---|---|---|---|
| steps per rule before combining | 5–22, median about 11 | 1–15 tier-1 puzzles, then pairs at once for constraint rules | 6 (Parabox), 1–2 per word (Baba) | 2–3 very easy, then a ramp of 6–50 |
| first board | 1–2 cells (3×3 for symmetry) | 12–16 cells | a level you can't fail | full size, few unknowns |
| most common step | contrast and check | check (pools of one tier) | introduce | check (ramp) |
| traps | after 3–6 panels: a board where the rival reading gives a neat wrong answer | rare; the scroll states the rule | a near-identical board where the last trick fails; the natural order strands you | the same technique, harder to see |
| combine | late, one partner per row of 5–7 | at once for constraint rules, each earlier rule in turn | from the second world on | late week or late book |
| review | by place, much later, mixed | place windows | every 3–4 levels (Baba), about 10 levels (Sausage Roll) | warm-up puzzle beside the ramp |

Step-type counts in The Witness's 97 sequenced panels: check 32, contrast 22, introduce 18,
combine 11, review 9, trap 5. Every symbol has more than one introduce step, because each new
reading of a symbol restarts at a small board.

## 6. Recommendations for Slate

1. **Five posts can't cover what The Witness spends 9–22 panels on, so teach one reading a
   week, not one symbol.** A Witness symbol is 2–4 mini-lessons of 3–5 panels each, and each
   lesson is a reading of the rule (squares: one cut, two cuts, an enclosure; stars: a pair, two
   pairs, a star with a same-coloured square). Make Slate's subject a **reading** and give a
   symbol 2–3 weeks. Suggested panel curriculum, in order, about 16 weeks:
   - squares: separation, then enclosure;
   - dots: on the line, then forcing a route;
   - stars: one pair, then two pairs per colour;
   - stars with squares (same colour counts);
   - shapes: one piece, then two pieces in one region;
   - rotated shapes;
   - hollow shapes;
   - triangles: count, then corners;
   - erasers with dots, then erasers with squares;
   - symmetry: mirror, then rotation.
2. **Contrast twice, then trap.** Contrast is The Witness's most common move.
   Consider making Wednesday a second contrast that moves a different thing (the endpoint on
   Tuesday, a symbol on Wednesday), with the trap folded into Thursday. Proposed week:
   - **Mon** meet: a 2×1 or 2×2, solvable by accident;
   - **Tue** contrast: the same symbols, endpoint moved;
   - **Wed** contrast: one symbol moved, one size up;
   - **Thu** check: the rival reading gives a neat wrong answer;
   - **Fri** combine or review.
3. **Monday's board should be smaller than the plan says.** The plan says 2×2–3×3. The Witness
   opens squares, shapes and stars on 2×1, and erasers on 1×2. Let `sizes` for Monday include
   1×2 and 2×1, with 1–2 symbols. Symmetry is the exception (start at 3×3).
4. **Traps go on Thursday, built from the week's rival.** Traps never come before panel 4 in any
   Witness sequence (Parabox and Sausage Roll trap earlier).
   Build each one as "the rival reading gives a neat, wrong answer": the six stars in
   two columns of three, or the old dots board plus an eraser. That's the rival-rules check in
   research-tutorials §4.4, required on Thursday.
5. **Friday: combine only after a symbol's last week.** The Witness waits 12–50 panels before
   combining. On Fridays inside a multi-week symbol, review last week's reading (the stars-pair
   week reviews squares, for instance). Combine on the symbol's final Friday, with one partner
   that a previous week taught.
6. **Constraint rules start combined (Glimmith).** Panes rules that can't pin a board alone
   (rectangles, all-different, one-each, twins/opposites, size ranges) should meet on Monday with
   an already-taught clue rule (size or size-clue), not alone. Clue rules (size-clue, compass,
   exact size) can start alone. Add a `partner` field to such subjects in the curriculum.
7. **Erasers have no alone week.** Like Glimmith's constraint rules, an eraser needs something to
   cancel. Run "erasers with dots" and then "erasers with squares" as separate weeks, each with
   Monday's impossible-without-it board (three dots that can't all be reached). Lower Row 5 and 6
   suggest a contrast: the same board without and with the eraser. That's a natural Tuesday.
8. **For base pencil genres, use few unknowns, not tiny boards.** Nurikabe, Akari and Sudoku
   weeks should keep a normal small size (5×5–6×6) with few empty cells on Monday, as Nikoli and
   LMD do (1, 1, step up). The tiny-board trick depends on instant feedback, which those genres
   only have at the end.
9. **Review by place: a mixed week every 4–6 weeks.** Witness areas and Glimmith's place windows
   are mixed review. Every fifth week or so, make one week a "place": no new subject, Monday to
   Friday mixes 2–3 earlier readings, easy to hard. That answers the spacing question (principle
   10) without a separate drill.
10. **Keep an easy warm-up in view.** GMPuzzles pairs a fixed easy puzzle with each day's ramp,
    and Glimmith's pools always have tier-1 puzzles. Slate's posts are single, so let its
    recommendation (Pebble's small daily panel) be that floor, rather than adding posts.

Changes this implies for the proposal in research-tutorials §4.2:
- subjects become readings, with `weeks` per symbol;
- Wednesday becomes a second contrast and Thursday takes the trap;
- Monday's `sizes` include 1×2 and 2×1;
- subjects get a `partner` field for rules that can't stand alone;
- a mixed review week every 4–6 weeks;
- the curriculum is about 16 panel weeks instead of 8.

## Links

- Archipelago, The Witness logic (vanilla):
  https://github.com/ArchipelagoMW/Archipelago/blob/main/worlds/witness/data/WitnessLogicVanilla.txt
- ttws, The Witness solver and panel list: https://github.com/barrycohen/ttws
- The Windmill (panel format): https://windmill.thefifthmatt.com/
- The Witness wiki, puzzle types: https://thewitness.fandom.com/wiki/Puzzle_Types
- Glimmith walkthroughs: https://www.yekbot.com/the-artisan-of-glimmith-walkthrough-guide/,
  https://camzillasmom.com/?s=glimmith; solver: https://github.com/ham883/glimmith-solver
- Movement games and pencil publishers: see the links in §3 and §4, and each source's file in
  `references/tutorial-sequences/`.
