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

## The more ambitious version: a laboratory for learning to reason

Puzzles are unusually good research material: every move is logged and checkable, difficulty can be
computed exactly, and inkit can invent new puzzle types on demand. That supports a larger agenda.

1. **A model of how people reason through puzzles** that predicts individual moves (where someone
   looks next, when they hesitate, which wrong deduction tempts them), built from bounded solvers
   (limited techniques, limited working memory, visual search) fit to play logs.
2. **A periodic table of reasoning moves**: one formal language for techniques across all types
   (below), discovered by mining and verified by the solver, linked to the mathematics underneath
   (pigeonhole, parity, invariants, extremal arguments, case analysis).
3. **Transfer experiments.** Randomised comparisons (contrasting cases or plain practice; interleaved
   or blocked; told or discovered), with a transfer test no one else can run: a newly invented
   puzzle type that needs an idea practised elsewhere.
4. **Machine-invented puzzle types**: search the space of rules for types that are learnable,
   interesting and exercise a target idea.
5. **A solver-grounded tutor**: Socratic hints and prompts to reflect on strategy, every claim
   checked by the solver, tested against no hints and fixed hints.
6. **Open science and the AI side**: a public dataset of human solving traces (with consent); a
   benchmark for learning a new puzzle type from a few examples as efficiently as people do; and
   whether human-style curricula make AI reasoners learn faster (puzzles have checkable answers,
   which suits reinforcement learning with verifiable rewards).

### What would suggest it's worth pursuing (cheapest first)

| Signal | Means | Stop if |
|---|---|---|
| Mining rediscovers most of Sudoku's, Akari's and Star Battle's documented techniques, plus verified new ones experts find meaningful | The technique language is real | Only trivial or uninterpretable patterns |
| The same move shapes recur across types, non-trivially | There's a shared vocabulary to teach and transfer | Every type's techniques stay unrelated |
| Student models predict a player's own times and stuck points clearly better than one score per puzzle (a few hundred active players) | Personal models are worth building | No gain with enough data |
| Contrasting-case sequences beat plain practice on held-out puzzles, randomised | The teaching method works | No difference with a fair sample |
| Transfer to an invented type, beyond a control group | The headline result | None after well-powered tries (near transfer is still the product) |
| Invented types players rate well and learn smoothly | Type invention is viable | They feel arbitrary; nobody plays twice |
| Human-style curricula improve an AI's sample efficiency on new types | Interest from AI labs, and funding | No gain over random order |

It needs players (thousands, for the experiments), consent and an ethics review for anything
published, collaborators (Pelánek on difficulty and adaptivity; the Butler, Torlak and Popović group
on strategy synthesis; learning scientists on contrasting cases and transfer), and patience: the
cheap signals come in weeks, the experiments in months.

## A formal language for techniques

The engine states every type's rules in ASP, so a technique is **a derived rule: a pattern that the
rules force a conclusion from**. Three levels:

1. **Concrete pattern**: a fixed local arrangement (Minesweeper's 1-2-1 along a wall: the outer
   cells are mines).
2. **Parameterised family**: the shape with variables ("fish of size k": a digit confined to the
   same k columns in k rows leaves the rest of those columns; X-Wing, Swordfish and Jellyfish are
   one entry).
3. **Cross-type schema**: the idea beneath ("k units that must each hold one thing, whose places fit
   in k other units, use those units up": pigeonhole, behind Sudoku's fish, Star Battle's region
   counting and Binary Puzzle's half-and-half).

Each entry has a premise (clues, marks and rule instances, with relative positions and quantifiers),
a conclusion, a proof (clingo checks the premise entails the conclusion in every instance up to a
size), and a name, picture and cost. Mining the solver's explanations fills levels 1 and 2; an LLM
proposes level-3 schemas and clingo checks every instance. Level 3 is the periodic table, and the
cross-type curriculum's unit.

Precedents: Butler, Torlak and Popović synthesised Nonogram strategies as programs in a small
language (2017); Ludii (Browne) writes hundreds of games in one formal vocabulary of "ludemes";
PuzzleScript writes puzzle games as rewrite rules; Bogaerts et al.'s step-wise explanations are
the cost model the solver already uses.

## From the Snakebird work (Sturtevant's lab, University of Alberta)

[The Snakebird project](https://www.movingai.com/snakebird.html) enumerated every single edit
(one obstacle added or removed) to each designed level and found edits that doubled or tripled the
shortest solution (23 moves to 50; 36 to 89); in a user study, players rated the modified levels
more interesting and challenging ("The Unexpected Consequence of Incremental Design Changes",
AIIDE 2020). Lessons:

- **The one-edit neighbourhood of a designed puzzle is rich, and designers don't see it.** It's the
  generator for contrasting cases: try every single-clue edit, run the solver, keep pairs that
  differ the way we want (the key technique changes, the break-in moves).
- **Design gradients for creators**: their follow-up showed designers what each edit would do. In
  paint: an overlay saying where a clue would make it easier, break uniqueness, or change the key
  step.
- **Solution length isn't human difficulty** in general (it fits movement puzzles; Pelánek found it
  fails for Sokoban). Our step and explanation costs are the right kind of measure, still to be
  checked against people.
- **Exhaustive study of The Witness's small panels** (the same lab) bears directly on Panels.
