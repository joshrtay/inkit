# Designing good panels

What makes a Witness-style panel good rather than merely valid, written as principles a designer
(a person, or a generator and evaluator) can apply and check. The symbols are the ones our engine
supports (`src/engine/panel.ts`, "Panels" in [grid-engine.md](grid-engine.md)): starts, ends,
gaps, dots (colored dots under symmetry), colored squares, stars, triangles, shapes (rotatable,
hollow), erasers, and left-right / up-down / turn symmetry. Each principle ends with **Check:**
a way to measure it with our tools. Sources are listed at the end; numbers in brackets point to
them.

## 1. A panel is a sentence: one idea, stated clearly

Blow's puzzles each explore one idea, are small enough that the player can hold every moving part
in mind, and carry few or no red herrings [1]. The aim is "I understand", not "I finally got it":
the solve shows that the player now understands the rule, not that they survived arbitrary steps
[1][3]. Brett Taylor calls anything that takes up working memory without helping the solve
*noise*, and says to cut it [9]. A good panel can be described in one short sentence ("the two
white squares in the corner can't share a region with the black one, so the line must squeeze
between them"). If it takes a paragraph, it is two panels.

**Check:** count the symbol *kinds* and the symbols. Every symbol must be needed: removing it
gives a second solution (step 4 of `panels.ts` already enforces this per group). Every *kind* must
be needed: drop all symbols of one kind and count the solutions (`solve(p, N)`); a kind whose
removal leaves the panel unique is decoration. Keep a panel to one new kind plus at most one or two
kinds the player already knows.

## 2. Sequences: introduce, confirm, combine, twist

The Witness teaches with no words. Each area is a short run of panels that grows one variation on
the line rule [16][12], starting with tiny boards that are easy to solve almost by accident and
growing until the rule has to be understood [3][13]. Blow front-loads the mechanics and puts the
difficulty in the *consequences* of rules the player already knows [1][4]. Mark Brown's anatomy of
a good puzzle names the parts: clear mechanics, a *catch* (two requirements that seem to
conflict), the *revelation* that resolves it, an *assumption* the designer leads the player to
and then breaks, and a gradual *curve* [2][9]. A sequence for one symbol therefore runs:

1. **Introduce:** a tiny panel (2×2 to 3×3) where the symbol is the only clue and the answer is
   nearly forced. It shows the symbol, and solving it shouldn't depend on guessing the rule yet.
2. **Confirm:** a panel where the "obvious" line (shortest, or hugging the edge) fails because of
   the symbol, so the player has to form the rule and test it. It helps to keep this separate
   from the introduction, so that a failure means "wrong rule" or "wrong line", not either.
3. **Combine:** the symbol with an earlier one, where neither alone settles the line.
4. **Twist:** a consequence the player hasn't seen: a star pairing with a *square* of its color, a
   hollow shape cancelling a cell, an eraser that has to remove the symbol that looked safest,
   a colored dot that only the mirror line can reach.

A known weakness of the real game: some teaching panels can be solved without grasping the rule,
and the misunderstanding only bites much later [13]. Some critics also find the run of puzzles
repetitive when the variations stop teaching anything new [11][12].

**Check:** tag each panel in a sequence with the kinds it uses and require that each panel adds
at most one kind. For an *introduce* or *confirm* panel, count the lines that solve the panel with
the new kind removed: if the intended line is also among the easy answers to the panel without
that kind (for example the shortest path), the player can solve it without learning the rule.
For *confirm*, test that the shortest start-to-end line and the edge-hugging lines all fail the
check.

## 3. Put the difficulty in an insight, not in search

Blow's goal is a stream of small epiphanies about something real and specific, not arbitrary
challenge [3][5]. The rules are fixed and visible, so the difficulty should come from seeing a
consequence of them (the catch) rather than from trying lines until one works. Blow and ten Bosch
describe their method as asking questions of a system and keeping the ones whose answers show its
core most cleanly, rather than combining elements for variety [7][8].

Pelánek's work on Sudoku ratings found two independent sources of difficulty: how hard each
logical step is, and how the steps depend on each other (a long chain, or several facts that must
be combined at once) [15]. A good panel has a *break-in*: one clear first deduction that opens
the rest, then a satisfying chain. A bad hard panel is hard because it is big. The Gridspech
developer's version: a few firm deductive anchors, then room for intuition, so that the player
afterwards feels they should have seen it, never that they had no way to see it [10].

**Check:** write a small "human" propagator for panels in TypeScript (or as clingo with
propagation only): local rules such as a dot forces its edge, a corner the line passes has
exactly two line edges, a triangle's count, gaps, a dead end, two different square colors that
touch force the edge between them. Run it to a fixpoint and record how many edges each round
settles. Measures: (a) does propagation alone solve it (no guessing needed)? (b) how many rounds
(chain length)? (c) if it stalls, how deep must a case split go (try each value of an undecided
edge, propagate, see if one side contradicts)? A panel that needs a split of depth ≥ 2 is a
guess-and-check panel. clingo's `--stats` (choices, conflicts) is a cruder proxy that's
available already.

## 4. Make the symbols interact

Combining a few elements in interesting ways beats many elements that each do one thing [9].
The best Witness interactions are where one rule changes the reading of another:

- **Stars and squares:** a star counts a square of its color as its partner, so a region can
  hold one orange star and one orange square, and squares of other colors still separate.
- **Shapes and hollow shapes:** a hollow piece subtracts, so a region can be smaller than the
  shapes it holds; a rotatable shape widens what fits.
- **Erasers:** the eraser cancels exactly one symbol, and only if the region needs it, so the
  player must find which symbol is the one that "can't" be satisfied.
- **Symmetry and colored dots:** a dot of one color must be taken by that color's line, so it
  also fixes the mirror line's position on the far side; dots can be placed where only the mirror
  line can reach.
- **Triangles with anything:** a triangle fixes how many sides of a cell are line, which pins
  down a region's border locally.

**Check:** synergy between kinds. Let F(S) be the set of edges propagation fixes using only the
symbols in S. For kinds A and B, the panel has an interaction if F(A ∪ B) is clearly larger
than F(A) ∪ F(B): the combination tells you something neither tells alone. Also check that each
kind alone leaves several solutions (`solve` with the other kind removed).

## 5. No red herrings; misdirection must still work for its living

The Witness keeps red herrings to a minimum [1]. But Blow does lead players toward an obvious
move and then reveal it as wrong [2], and that "assumption" is part of a good puzzle [9]. The
difference: a red herring is a symbol that does nothing; misdirection is a symbol that is
*needed* but suggests the wrong first move (the eraser that looks like it should go to the lonely
star, but must cancel a square; a shape that looks like it fits upright but must turn). Our
minimal-clue step already removes true red herrings.

**Check:** red herrings: the minimality test from §1. Misdirection: build the "naive" reading
(for example the line that satisfies every symbol except the eraser's target, or the
line that results from the most locally obvious placement) and confirm that it fails; then
check that the panel is still unique. Score panels where the first natural candidate
(the shortest path through all dots, the first shape placement found) fails.

## 6. Small boards, clean pictures

Blow keeps panels small enough to consider all parts at once [1]. Taylor and Tyroller both say a
puzzle should be no bigger or more complex than it needs to be, and Brown says the presentation
should contain only what the puzzle uses [9]. In practice: 3×3 to 4×4 to teach, 4×4 to 5×5 for
most panels, 6×6 and up only for a late "exam" panel that combines known ideas. Symbols should be
spaced out (empty cells are part of the picture), and a symbol-dense panel usually means the
generator compensated for weak clues with many.

**Check:** board size per role; symbol density (symbols / cells, aim roughly 0.2-0.5); gaps per
line; clustering (no 2×2 block packed with symbols unless the idea is about that block); one cell
holds at most one symbol (already true).

## 7. Starts, ends and gaps are structure

Starts and ends set the reading direction. Working backwards from an end (or from a corner the
line must reach) is often the break-in, so place them to create a question: a start in the middle
of the board, an end on a side, several ends so the player must pick one, two starts under
symmetry. Gaps are the bluntest clue: a panel solved mostly by gaps is a maze, not a logic panel.
Our generator removes gaps first for exactly this reason. Use gaps to shape the space (close off
an easy route, make a corridor) and leave the reasoning to the symbols.

**Check:** the share of the solution that gaps alone determine, F(gaps) / line length, should be
small; count the solutions with all gaps removed (if it is still one, the gaps were only
cosmetic). Count the simple start-to-end lines on the bare board (the size of the search space)
and how far the clues reduce it.

## 8. The solution should look intended

The answer is a drawn line, so it is seen. Good panels often have a line with a clear shape (a
spiral, a comb, a line that splits the board into regions of telling sizes), long enough to use
most of the board but not a back-and-forth sweep. Snyder argues that hand-made puzzles carry a
conversation between setter and solver, with themes and aesthetics a random generator doesn't
produce [14]; for us that means the generator should *aim* at a line and a key idea, not accept
whatever random line comes out.

**Check:** path length / number of corners (our generator asks for at least 60%), number of
turns, number of regions and their size spread, and whether the line or the symbol layout has a
symmetry. These are weak signals; use them as tie-breakers, not filters.

## 9. Judging difficulty

Difficulty is what the player experiences, so calibrate measures against people. Pelánek's
model-based metric correlated about 0.95 with human solving times for Sudoku, and a more general,
less Sudoku-specific one about 0.88 [15], so a similar model is worth building for panels:

- **Size of the step:** the hardest local rule needed (a dot is easy; erasers, hollow shapes and
  star/square pairing are hard).
- **Structure:** propagation rounds, how many independent starting points there are, and the
  case-split depth (§3).
- **Breadth:** the number of kinds the solver must use together.
- **Search space:** the log of the number of lines that satisfy the panel's local symbols only.

Worst-case hardness doesn't tell us much: Demaine et al. show finding the line is NP-complete
for nearly every symbol type, and Σ₂-complete with erasers [6]. Any one panel is small, so the
question is how hard *this* panel is for a person, not for the class. Their result does say
which symbols are the dangerous ones: erasers (where you have to rule out every way of not
using them) and shapes.

**Check:** log solve times and failed attempts from the site (`GameHost` already reports solves)
and fit the feature weights above to them.

## Using this for AI generation

`puzzles/grid/panels.ts` today draws a random long line, puts every true symbol in a pool, adds
gaps until the line is unique and removes whatever isn't needed. That gives valid, minimal
panels. To aim for good ones:

1. **Generate many, score, keep the best.** Run `makePanel` (or variants) hundreds of times per
   slot and score each result with the checks above: kinds needed (§1), propagation-solvable with
   no deep split (§3), synergy between kinds (§4), the naive line fails (§5), density and size
   (§6), gap share (§7), line shape (§8). Reject on hard failures (guessing needed, decorative
   kinds, gap-solved) and rank the rest.
2. **Build the evaluator once, in clingo and TypeScript.** Uniqueness and "remove X and count"
   use the existing `solve(p, 2)`. Propagation and case splits need a new deterministic
   propagator over the same `Puzzle` (the same rules as `check`, applied to a partial line).
   F(S) for synergy is that propagator on a subset of givens.
3. **Aim the generator at an idea.** Instead of a fully random line, choose the catch first (for
   example "a star must pair with a square", "the eraser must cancel the square that looks
   right", "the hollow shape lets two shapes share a region") and construct a line and a small
   region layout where it is forced; then add the fewest symbols around it, preferring symbols
   that the naive reading gets wrong. Clingo can search for such panels directly: add constraints
   such as "region R contains a star and a square of the same color and no other star" to the
   line search.
4. **Generate sequences, not single panels.** For each kind, produce an introduce / confirm /
   combine / twist run whose difficulty scores rise, with each panel adding at most one kind
   (§2). A language model can propose catches and sequence plans in words; the solver makes them
   real and the evaluator keeps them honest.
5. **Close the loop with players.** Fit the difficulty weights to solve times, and keep a small
   set of hand-made reference panels to check that the scorer ranks good panels above bad ones.

## Sources

1. Mark Brown, "How Jonathan Blow Designs a Puzzle", Game Maker's Toolkit (transcript):
   https://amara.org/videos/LaGKzzSXnuQl/en-gb/3101350
2. Mark Brown, "What Makes a Good Puzzle?", Game Maker's Toolkit: https://amara.org/v/C3BEg/
3. "Shared epiphany: Jonathan Blow reflects on The Witness", Gamereactor:
   https://www.gamereactor.eu/shared-epiphany-jonathan-blow-reflects-on-the-witness
4. "Bearing Witness" (Blow interview), Game Developer:
   https://www.gamedeveloper.com/business/bearing-i-witness-i-
5. "Jonathan Blow on designing The Witness", Game Developer (2011):
   https://gamedeveloper.com/design/feature-jonathan-blow-on-designing-i-the-witness-i-
   and "The Witness and the joy of intuition", Engadget:
   https://www.engadget.com/2014-06-12-the-witness-and-the-joy-of-intuition.html
6. Abel, Bosboom, Coulombe, Demaine et al., "Who witnesses The Witness? Finding witnesses in The
   Witness is hard and sometimes impossible" (FUN 2018; TCS 2020):
   https://erikdemaine.org/papers/Witness_TCS/ (preprint https://arxiv.org/abs/1804.10193)
7. Jonathan Blow, "Truth in Game Design", GDC Europe 2011:
   https://www.gamedeveloper.com/design/video-jon-blow-on-the-truth-in-game-design-
8. Marc ten Bosch on the IndieCade 2011 talk with Blow, "Designing to Reveal the Nature of the
   Universe": https://marctenbosch.com/news/?p=181
9. Juha-Matti Santala, notes on puzzle game design (summaries of GMTK, Brett Taylor's
   "Introduction to Puzzle Design", Jonas Tyroller and others):
   https://notes.hamatti.org/gaming/puzzle-game-design
10. krackocloud, "Puzzle design thoughts" (Gridspech devlog, on witnesslikes):
    https://krackocloud.itch.io/gridspech/devlog/463532/puzzle-design-thoughts
11. Josh Bycer, "How the Witness Stretches (and Snaps) Puzzle Design", Game Wisdom:
    https://game-wisdom.com/?p=18945
12. "Early thoughts on The Witness", Electron Dance:
    https://www.electrondance.com/early-thoughts-on-the-witness/
13. Digital Trends on the Witness's tutorial panels (via search summary):
    https://digitaltrends.com/?p=912967
14. "Number one" (profile of Thomas Snyder), Stanford Daily:
    https://stanforddaily.com/2010/03/30/sudoku/
15. Radek Pelánek, "Difficulty Rating of Sudoku Puzzles by a Computational Model" (FLAIRS 2011):
    https://www.fi.muni.cz/~xpelanek/publications/flairs-sudoku.pdf and "Difficulty Rating of
    Sudoku Puzzles: An Overview and Evaluation": https://arxiv.org/abs/1403.7373
16. Thinky Games, The Witness: https://thinkygames.com/games/the-witness/
