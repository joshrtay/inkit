# Elyot Grant on puzzle design

Elyot Grant ("Elliot" when spoken) founded Lunarch Studios in Toronto and is its CEO and game
director. Lunarch made Prismata (a puzzle-like strategy game), Jelly Is Sticky (a block-pushing
game; he made about half its levels), Islands of Insight (2024: an open-world puzzle MMO with
more than 10,000 handmade puzzles from 27 designers) and **The Artisan of Glimmith** (March
2026, published by 983 Interactive). Glimmith is the region-division game our Panes copy, made
by the team that built Islands of Insight's logic grids [4][8]. Grant also sets puzzles himself:
he has been published on Grandmaster Puzzles, was featured on Cracking the Cryptic, finished
29th at the 2019 World Puzzle Championship and has three math degrees from MIT [2a]. His main
public statements on design are a GDC 2021 talk, "30 Puzzle Design Lessons From The World's
Greatest Puzzle Communities", with a three-hour extended cut on YouTube [1][2]; a ThinkyCon
2024 talk on how Islands of Insight was produced [3]; a GDC 2025 talk on the same game [7];
and Glimmith's reveal video and Steam patch notes [4][5].

## His principles

1. **A puzzle is something that hides a eureka moment.** He defines a eureka moment as a sudden,
   pleasurable, fluent, confident feeling of understanding, and he treats it as the atom of
   puzzle design. Its opposite is *fiero*, the pride of beating something hard. Puzzles built
   only to be hard (or to "make the player feel smart") give fiero, and he thinks that falls
   short of what the medium can do. He sides with Blow: how beautiful a puzzle is depends on how
   much truth it reveals. His example is Conway's packing puzzle, which is unique for deep reasons, set
   against a box of Z-pentominoes that has four solutions and nothing to learn. [2a]
2. **Maximize sparkle and cut the chaff.** He takes *sparkle* from crossword setters: how
   strong and how dense a puzzle's eurekas are. *Chaff* is the filler steps that teach nothing.
   Surprise is the main source of sparkle, and his model is Sam Loyd's chess key move, which
   almost no strong player would try. [2a]
3. **Design from the front.** He builds logic puzzles by placing clues and solving at the
   same time, in the order the solver will meet them. He opens with a "hook" (an obvious
   first mark), then sets up a lemma, repeats it, twists it and ends on a payoff. After any edit
   he re-solves the whole grid to check the intended path is still intact. He demonstrates it
   live on an Akari puzzle. This, he argues, is what gives a hand-made puzzle a sense of talking with its
   setter, which computer-generated Sudoku lacks (he cites Nikoli's editor on this). [2c]
4. **Unique solution, reached by logic, with a key step that has to be found.** Deductive flow
   requires a unique answer, so solving the puzzle also proves it is the only answer. The
   key move must be the only one that works. A puzzle with a second solution is "cooked", and
   test solvers have to be deductive solvers so they can catch that. Every Islands of Insight
   grid has one solution that logic alone reaches, without guessing [3]. Glimmith shipped
   hotfixes for puzzles that turned out to have two solutions [5]. [2c][3]
5. **Know the solution path: break-ins, bushiness, flow vs gem.** He borrows the idea of
   mapping a puzzle's state graph from physical-puzzle designers and from Jarušek and Pelánek's
   Sokoban study: bottlenecks in the state graph are what make a puzzle hard. A *bushy* path,
   with several places to make progress, keeps solvers moving. A *linear* path can be more
   artful but leaves them stuck when they can't find the one way in. Lunarch sorts puzzles on two axes, number of
   steps and difficulty of the hardest step. Many easy steps make a *flow* puzzle, and one hard
   step makes a *gem*. Both suit games. Many hard steps make a *slog*, and too few of either make
   a tutorial. [2b][3]
6. **Earn the solver's trust, then use it.** *Aporia* is the moment a solver feels sure the
   puzzle is impossible, and it promises a surprise only if they trust that a solution exists.
   That trust depends on *square dealing*: rules that stay consistent, no one-off hidden tricks,
   no "oh really?" answers. One broken or cheap puzzle poisons the well for the rest. [2b]
7. **Match pertinence with salience.** Whatever matters to the solution should stand out, and
   whatever stands out should matter. He distinguishes kinds of red herring. *Dressings* are
   decoration that looks like a clue, and *distractors* are affordances the solver never needs.
   *Rabbit trails* are wrong approaches that can't be quickly disproved; he calls them the most
   demoralizing kind, so designers should seal them off or give a quick "no" signal. *Dead ends*
   are wrong approaches that fail fast, and they are fine. Confirmers, signs that you are on the
   right track, are strongly motivating. [2b]
8. **Seek depth in systems, then hybridize.** He prefers one rule system whose consequences
   players learn and build on over one-off gimmicks. He adopts Thomas Snyder's idea of a puzzle
   type's *capacity*, the number of puzzles it can hold before the ideas repeat: roughly 80-100 for Sudoku, about 1,000 or more for
   The Witness, more for Go. He adds capacity through variants and hybrids, because pairs and
   triples of rules produce eurekas that neither rule produces alone. Islands of Insight picked a
   set of shading rules chosen to interact without clashing, and one
   general rule, "don't make this pattern", turned out to express path and rectangle puzzles
   too [3]. Glimmith applies this to region division: more than 20 rules, adapted from genres
   such as Fillomino and Shikaku, mixed into hundreds of combinations [4]. [2b][3][4]
9. **Speak playfully; themes should do work.** Use motifs, setups and payoffs, a rewarding
   ending (a nonogram's picture, a puzzle-hunt answer word) and hidden secrets. The best themes
   feed the logic, like a Slitherlink built around a vertex of degree 17. He warns against
   cleverness the solver never notices, and against giving up solving quality to hit an
   ambitious construction goal. [2b][2c]
10. **The format changes everything.** Input, undo and note-taking change which puzzles are
    possible. Allowing notes deepens the eurekas a puzzle can hold. The Witness, where you draw
    the whole line in one go, has to stay small enough to solve in your head. Physics, puzzles
    with a lot of moving state, and linear progression all blur clarity or block progress, so
    he favours nonlinear structures where a stuck player can go elsewhere. [2c]
11. **Serve different appetites.** Some players want "low-dose" flow, repeating tricks they
    already know, and others want "high-dose" gems. Islands of Insight let players choose
    their own difficulty and found that a run of easy puzzles motivates players to tackle a hard one [3].
    Glimmith has almost no mandatory puzzles, and players can skip whole genres [4]. Rules are
    taught with pictures rather than text, and explicit tutorial panels come late so that players
    can find the deductions themselves [5]. Before launch he described balancing variety, pacing
    and difficulty so that players don't tire [6]. [3][4][5][6]
12. **Mostly handmade; generate and curate where it pays.** Grant reckons a high-quality handmade puzzle costs
    under about $50 at the margin, which makes it cheap compared with art and code [3]. Generators
    can be excellent or a waste of time. A generator that is 50% good is often enough, because
    testing a few more candidates is cheaper than improving it. His best generator analysed each
    puzzle's state graph and kept puzzles whose key move is an articulation point at which several
    pieces can move. A big library lets you put the very best puzzles where every player sees
    them. Their tooling recorded each solution "most obvious step first" to drive hints, timed
    solves to estimate difficulty, and ran a census by rule tag to find under-used rules. [3]
13. **Serendipity is searched for.** Great puzzles are often discovered rather than invented,
    but only by people who are actively looking. His example is a teammate's grid that a single
    clue forces all the way to the end. [2c]

## For inkit

**Where he agrees with [panel-design.md](panel-design.md):** "one idea, no noise" (§1) matches
sparkle and chaff and pertinence/salience (2, 7). "Insight, not search" (§3) matches eureka
versus fiero (1), and both documents rely on Blow. Interactions between symbols (§4) match
hybrid depth (8), and Snyder's setter-solver conversation (§8) matches design from the front
(3). The panel document's difficulty model (§9) also comes from Pelánek, the co-author of the
Sokoban study Grant cites. **What he adds:** forward design as a method; flow vs gem and bushy
vs linear paths; trust, aporia and square dealing; a taxonomy of red herrings (rabbit trails in
particular); type capacity; when a generator is good enough; curation from a large library;
hints from an ordered solve. He also qualifies §1: some players *like* repeating a known trick.

How each principle could apply to Panes and panels, and how to check it with our engine:

- **Uniqueness and deduction (4).** `solve(p, 2)` and the build already guarantee one
  solution. The missing piece is the propagator proposed in panel-design §3, written once over
  `Puzzle` for both Panes and panels. It would apply local rule consequences until nothing
  changes, then try case splits of increasing depth. Reject puzzles that need a split of depth
  2 or more (they amount to guessing).
- **Flow vs gem, break-ins, key step (1, 2, 5).** Run the propagator and record, for each round,
  how many cells or edges become decidable. Several decidable at the start means a bushy
  puzzle, a single one means a linear puzzle, and none means there's no break-in. A *gem* is a
  puzzle where propagation stalls once and a single depth-1 split unlocks the rest. That split is
  the key step. Check that it is unique (exactly one split succeeds) and score it. A *flow*
  puzzle is many rounds with no split. `new.ts` could tag each puzzle `flow` or `gem` and the
  game could sequence them in alternation.
- **Pertinence, rabbit trails (7).** Step 4 of `new.ts` already removes clues that aren't
  needed. Add a rule-level check: drop each Panes rule in the mix (size, twins, compass, …) or
  each panel symbol kind and count solutions. A rule that never matters is a dressing. For
  rabbit trails, find undecided cells where assuming the wrong value leads to a contradiction
  only after a long propagation, and penalize puzzles that have many of them.
- **Hybrid depth (8).** For a pair of Panes rules A and B, measure synergy as panel-design §4
  does: the propagator fixes more using A∪B than using A and B separately. Run a census over
  `src/games/panes/*.json` by rule tag to find pairs that are used too often or too rarely.
- **Forward design (3).** This is the biggest new idea for the editors. Running the propagator
  live in `BoardEditor` would let a creator place a clue and immediately see what it forces.
  That is Grant's "answer mode", which our one-solution check (`useOneSolutionCheck`) could
  grow into. A generator could also build forward: choose the key step first, then add clues in
  solving order (panel-design's "aim the generator at an idea").
- **Generate, then curate (12).** Run `new.ts` over many seeds per slot, score candidates on the
  measures above, and hand-pick the top few. Grant's numbers say that's cheaper than perfecting
  the generator. Record the propagator's step order as the hint sequence ("look here next").
  Calibrate the difficulty weights against solve times reported through `GameHost`.
- **Trust, format, themes (6, 9, 10).** A solved Panes window is a picture, which suits the
  rewarding-ending idea. Glimmith keeps colours aesthetic and separate from the logic, and so
  do we. Keep panels small enough to solve in your head, because the line is drawn in one go,
  and let Panes grow larger, because they allow marks. Never ship a puzzle that changes how a
  rule reads (the selftest's agreement between check and encoding protects this).

## Sources

1. GDC Vault, "30 Puzzle Design Lessons From The World's Greatest Puzzle Communities" (GDC 2021):
   https://gdcvault.com/play/1027306/30-Puzzle-Design-Lessons-From
2. Elyot Grant, "30 Puzzle Design Lessons, Extended Director's Cut", YouTube:
   (a) part 1 https://www.youtube.com/watch?v=oCHciE9CYfA ·
   (b) part 2 https://www.youtube.com/watch?v=iUi2vMZajco ·
   (c) part 3 https://www.youtube.com/watch?v=zsbfkMuaUxs
3. Elyot Grant, "How we put 10,000 handmade puzzles in Islands of Insight", ThinkyCon 2024:
   https://www.youtube.com/watch?v=Q2H1SjdkdBY (event page
   https://thinkygames.com/events/thinkycon/2024/talks/10000-handmade-puzzles/)
4. Lunarch Studios, "Lunarch's next game: The Artisan of Glimmith" (Grant's reveal video):
   https://www.youtube.com/watch?v=hseev7Js3oc
5. The Artisan of Glimmith Steam announcements (2026 patch notes):
   https://steamcommunity.com/app/4160210/announcements/
6. NME, "'Islands Of Insight' is an open-world puzzle game…" (Grant interview, eurekas, variety,
   pacing): https://www.nme.com/news/gaming-news/islands-of-insight-puzzles-adventure-open-world-3564541
7. GDC Vault, "Designing 10,000 Handcrafted Puzzles for 'Islands of Insight'" (GDC 2025):
   https://gdcvault.com/play/1035540/Designing-10-000-Handcrafted-Puzzles
8. Wikipedia, The Artisan of Glimmith: https://en.wikipedia.org/wiki/The_Artisan_of_Glimmith
