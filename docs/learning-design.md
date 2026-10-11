# Developing problem solvers: a design direction

What inkit is for, beyond hosting puzzles: great puzzles and great sequences should develop great
problem solvers. Three goals:

1. **Teach techniques.** Each type has reusable ideas; players should meet them in order and master
   them.
2. **Use contrasting cases.** Show the same idea working and not working, or the same idea in two
   types, so players see the structure underneath.
3. **Keep it interesting.** A player who stops learns nothing; motivation is part of the design.

This doc says what's new to try, what to be sceptical of, and an order of work. It builds on
[research-interestingness.md](research-interestingness.md),
[research-sudoku-difficulty.md](research-sudoku-difficulty.md),
[research-tutorials.md](research-tutorials.md) and [sudoku-techniques.md](sudoku-techniques.md).

## Where the openings are

Little here needs a new algorithm. The opening is joining known pieces into a loop nobody has built
for logic puzzles.

1. **Technique discovery with verification.** A model proposes candidate rules as small programs; an
   exact verifier keeps only the sound and useful ones (the pattern of FunSearch and AlphaEvolve).
   We have both halves: the deduction solver's minimal explanations to mine (puzzles/difficulty),
   clingo to prove a rule holds in general, and an LLM to generalise and name. The result: verified
   technique ladders for every type, including the 11 with nothing documented. Butler, Torlak and
   Popović did this for Nonograms (2017); nobody has done it across dozens of types.
2. **A student as a solver with a limited toolkit.** Pelánek's best predictors were models of a
   person solving, not puzzle statistics. A student here is our solver allowed only the techniques
   that player has shown, with a cap on what they can hold in mind. It predicts where *this* player
   gets stuck, not just how hard a puzzle is on average.
3. **Contrasting cases on demand.** Variation theory (Marton: vary one thing, hold the rest),
   comparing worked examples (Rittle-Johnson and Star), contrasting cases before telling (Schwartz
   and Bransford) and analogical encoding (Gentner) all point the same way. With a solver in the loop
   we can generate minimal pairs: one clue moved, and the technique stops working. Or two types that
   hinge on the same idea. Hand-setters can't make these at scale; we can, and verify them.
4. **Sequencing for learning and motivation.** Learning is fastest at roughly 85% success (Wilson et
   al., "The Eighty Five Percent Rule", 2019). A student model plus a next-puzzle policy (a bandit,
   or modest reinforcement learning) rewarded for techniques mastered *and* for finishing, liking
   and coming back.

## What to be sceptical of

- **End-to-end reinforcement learning to design puzzles.** The real reward (did someone become a
  better problem solver?) is slow and noisy. Generation with a solver in the loop and explicit
  targets does more for less. Reinforcement learning fits sequencing, not design.
- **LLMs as the reasoner.** They explain, name, write hints and propose ideas; the solver decides
  what's true. Keep that split as models improve.
- **Far transfer.** Evidence that puzzles make people better problem solvers in general is weak
  (most brain-training studies failed). Near transfer is solid. Far transfer has a chance only when
  the abstract strategy is taught explicitly and practised across varied settings.

That last point sets the curriculum's unit: **the idea that crosses types**, not the type. Counting
and pigeonhole run through Sudoku, Star Battle, Binary Puzzle and Sum Blobs; "follow the only way"
through Masyu and Simple Path; contradiction through everything. Mining techniques across all types
can find these shared ideas; teaching each through contrasting cases across types is the
best-supported route to transfer.

## The goals, mapped to the pieces

| Goal | Pieces |
|---|---|
| Teach techniques | Ladders per type (documented, mined, verified); student models; Slate's weeks with every puzzle proved to need its technique |
| Contrasting cases | Generated minimal pairs (works / doesn't); cross-type pairs with one idea; worked example, then near miss, then practice |
| Keep it interesting | Interest measures (break-in, theme, flow, little busywork) checked against likes and returns; the ~85% zone; variety across types |

## Order of work

1. **Measure** (under way). Solve times (solves.ms); technique solvers (Sudoku done:
   puzzles/difficulty/sudoku, 0.87 with Puzzle Square JP's difficulty on 61 puzzles); the interest
   experiment (puzzles/difficulty/interest*.ts).
2. **Mine techniques.** First on types with known lists (Akari, Star Battle) to check it rediscovers
   them, then on the undocumented types. Build a map of ideas shared across types.
3. **Model students and make contrasting cases.** A restricted solver per player; a minimal-pair
   generator; Slate rebuilt around ideas rather than types.
4. **Adapt, once there are players.** Choose the next puzzle per player; measure learning
   (techniques gained per hour of play) and motivation together, and tune both.

## What would show it works

- Technique ladders that rediscover the documented lists for Sudoku, Akari and Star Battle.
- Difficulty from student models that predicts our players' solve times better than one score per
  puzzle does.
- Players who finish a contrasting-case sequence using the technique unprompted afterwards (seen
  in their solve paths), more than players who saw the same number of plain puzzles.
- Longer streaks and more returns at the targeted success rate than at harder or easier settings.
