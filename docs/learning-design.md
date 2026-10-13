# Developing problem solvers: inkit's learning design

## The target

**A player who can solve puzzles they have never seen, long after they stopped practising.**

Learning has two horizons, and they pull against each other:

- **Near: this puzzle, next week.** Known, named material; practice, automaticity, accuracy. It
  shows quickly and fades (Bjork's *performance*).
- **Far: unforeseen puzzles, in the distant future**, including types that don't exist yet.
  Insight, reflection, leaps nobody cued (Bjork's *learning*; Bransford and Schwartz's preparation
  for future learning; Hatano's adaptive as against routine expertise).

What raises the near score (cued practice, telling the method, easy repetition) tends to cost the
far one; what serves the far one (struggle, mixed problems, reading a solution for its key idea)
looks slower. **inkit designs for the far horizon.** Near practice earns its place only by serving
it: automatic basics free attention for the hard step (Evan Chen's "spend at least 70% of practice
getting smarter, not faster"). Transfer is how the far horizon is measured, not the goal itself.

This merges three sources:

- **The original aim**: great puzzles and great sequences develop great problem solvers, through
  techniques, contrasting cases and interest. These stay, as the means to the far horizon.
- **Robustness** (the Math Academy critique): borrow structure for acquiring, never let it become
  the whole of practice.
- **Rusczyk and Evan Chen**: a course is a carefully sequenced problem set whose problems ask for
  real leaps; the set is both the scaffold and the bar. And the taste that set embodies (below)
  becomes ours.

### The taste we design for

Evan Chen's good problem, which is the far horizon's taste: a short, inviting statement; a
surprising truth; one main insight; a solution without heavy machinery; depth; room for partial
progress. Instructive, novel, memorable. Against it: computation or casework as the whole content,
one-trick and trivia problems, tricks recited from memory.

For puzzles, read off the solver's path: **one costly step that opens up the rest (a break-in)
beats long case splits; an idea used on purpose beats an obscure trick; a puzzle teaches the idea
it hinges on.** Our sequences, featured puzzles and generated puzzles aim at that.

Other tastes are real. On Puzzle Square JP, Masyu players like long runs of easy moves, sparse clues
and big grids, whatever the difficulty (see "Measuring difficulty and interest"). That pleasure is
flow and fluency, a near-horizon pleasure. inkit hosts it and recommends it to those who like it,
and it can serve as rest and practice; it doesn't steer the learning design.

Background: [research-evan-chen.md](research-evan-chen.md),
[research-interestingness.md](research-interestingness.md),
[research-sudoku-difficulty.md](research-sudoku-difficulty.md),
[research-tutorials.md](research-tutorials.md), [tutorial-sequences.md](tutorial-sequences.md),
[sudoku-techniques.md](sudoku-techniques.md).

## How we get there: three structures

The far horizon is hard to aim at directly: "puzzles nobody has seen" isn't something to practise
or measure. So we build structure that makes it concrete, and that is where inkit can do what no
one else can, because every rule is in a solver.

1. **A technique language** says what an idea is: a pattern the rules force a conclusion from,
   proved by clingo, at three levels (a concrete pattern; a family with variables; a schema across
   types). Ideas become objects we can prove, find, cost, picture and teach.
2. **A periodic table of ideas** maps them. Rows are schemas (pigeonhole, parity, only-way,
   connectivity, uniqueness, contradiction...), grouped like the table's families; columns are
   types; each cell holds that idea's family in that type, with its cost and prerequisites. It makes
   the far horizon concrete: an unseen puzzle is mostly known ideas in a new cell or a new
   combination, and transfer is recognising a row in a column you've never played. Gaps are
   predictions: an empty cell is a technique to mine, or a type to invent, as Mendeleev's gaps were
   elements.
3. **Problem sets** are paths through the table, hand-made: along a row (one idea, new types), down
   a column (deeper families in one type), or combining rows. Each leap is a step the table names
   and the solver proves needed. The sets carry Rusczyk's artistry; the table keeps them honest and
   shows what's covered and what isn't.

Everything else measures and serves these three: the solver and difficulty, interest and taste, the
learner model, the tutor. And the target gets tests we can run: a held-out cell of the table, and a
newly invented type built to need a row a player has practised elsewhere.

## Principles

1. **The sequence is the course.** A hand-made set, sequenced so each puzzle asks for a real leap,
   sets the bar. Adaptivity chooses *among* sets and schedules review; it never adapts the leap away.
2. **Acquire, then integrate.** New techniques are learned with structure: worked examples, short
   cued practice, contrasting cases. Most practice is then *uncued and mixed*: techniques and types
   interleaved, so recognising what applies is the work. Interleaving feels harder and builds exactly
   that discrimination (Rohrer and colleagues).
3. **Teach when an idea doesn't apply, not only when it does.** Near misses and minimal pairs show a
   technique's conditions. This is the main cure for brittleness.
4. **The curriculum's unit is the idea that crosses types**, not the type. Counting and pigeonhole
   run through Sudoku, Star Battle, Binary Puzzle and Sum Blobs; "follow the only way" through
   Masyu and Simple Path; contradiction through everything. Seeing one structure in different
   settings (analogical encoding, Gentner) is the best-supported route to transfer. Within a lesson,
   one theme, sorted by the main idea rather than the surface (as Evan Chen builds his).
5. **Struggle grows with skill.** Novices get direct instruction; worked examples beat unguided
   discovery at the start (cognitive load theory). As expertise grows, help drops (the expertise
   reversal effect): more "attempt first, then see the idea" (Kapur's productive failure), longer
   puzzles that need sustained effort.
6. **Two success rates.** Acquiring practice sits near 85% success, where learning is fastest
   (Wilson et al., 2019). A set's leaps sit lower on purpose: OTIS aims students at 60–75% of a
   set's points, and counts what they solved, not what they missed.
7. **Some techniques are discovered before they're named.** A puzzle built so its break-in forces
   the insight, with the name and explanation after (how The Witness teaches). Ownership resists
   brittleness.
8. **Basics become automatic**, because that frees attention for the hard step and lets the
   break-in be seen. Rule load and Pelánek's dependency measure are the warning signs of overload.
9. **General heuristics are techniques too**: most-constrained-first, contradiction, extremes,
   counting, small cases, working backwards. Named, taught and practised across types, at the top
   of the technique language.
10. **Give up well, then reflect.** Hints are self-serve and guilt-free after a real attempt. A
    solution is read for its one or two key ideas, not line by line, then: "how could I have found
    that?" Short prompts after key steps ("what made this cell forced?"), checked by the solver;
    replays of where a player got stuck.
11. **Making puzzles.** A puzzle that *needs* a given technique, checked by the solver, demands real
    understanding.
12. **Measure the far horizon.** New puzzles and new types, after a delay, uncued; techniques used
    unprompted in solve paths. A change that speeds up near progress but hurts these loses.
13. **Difficulty numbers are advice.** Coarse levels, framed as a guide; Evan Chen came to regret his
    own fine hardness scale for advanced students, since numbers feed ego.

## The system

Seven parts, each feeding the next.

### 1. Technique language, ladders and the periodic table

A technique is **a derived rule: a pattern from which the rules force a conclusion**. The engine
states every type's rules in ASP, so techniques can be stated and proved in the same terms, at three
levels:

1. **Concrete pattern**: a fixed local arrangement (Minesweeper's 1-2-1 along a wall: the outer
   cells are mines).
2. **Parameterised family**: the shape with variables ("fish of size k": a digit confined to the
   same k columns in k rows leaves the rest of those columns; X-Wing, Swordfish and Jellyfish are one
   entry).
3. **Cross-type schema**: the idea beneath ("k units that must each hold one thing, whose places fit
   in k other units, use those units up": pigeonhole, behind Sudoku's fish, Star Battle's region
   counting and Binary Puzzle's half-and-half).

Each entry has a premise (clues, marks and rule instances, with relative positions and quantifiers),
a conclusion, a proof (clingo checks the premise entails the conclusion in every instance up to a
size), and a name, picture and cost. Entries form a **prerequisite graph** (pointing pairs need
hidden singles; X-Wing builds on both), which is the ladder for each type and across types.

How entries are found:
- **Documented techniques**, coded directly (Sudoku done: puzzles/difficulty/sudoku).
- **Mined techniques**: the deduction solver's minimal explanations (puzzles/difficulty/deduce.ts)
  turned into position-free shapes; frequent, cheap shapes are candidates; clingo proves each in
  general. A model proposes candidate rules as programs and the verifier keeps the sound, useful
  ones (the FunSearch and AlphaEvolve pattern).
- **Schemas**: an LLM proposes the idea uniting families across types; clingo checks every instance.
  The LLM names and explains; it never decides what's true.

**The periodic table** arranges the schemas. A first draft of its families, to be checked by mining:

| Family | Rows (schemas) | Where they show |
|---|---|---|
| Counting | pigeonhole; parity; sums and bounds; area | Sudoku's fish and subsets, Star Battle's region counting, Binary Puzzle's half-and-half, Kakuro and Sum Blobs, Shikaku's sizes |
| Local forcing | only one place; only one way; exclusion by neighbours | singles in Sudoku, Masyu's pearls and corners, Akari's lit cells, Minesweeper's 1-2-1 |
| Topology | connectivity (no cut-off parts); loop closure (no early loops); no 2×2 | Nurikabe and Heyawake walls, Slitherlink and Masyu loops, Nurikabe pools |
| Reasoning about the puzzle | uniqueness; contradiction (try and fail); case split; extremes first | everything, at different costs |

Each cell records the family there, its cost by our solver, its prerequisites, and how often it
appears in published puzzles. Rows run across types, so the table is also the cross-type map;
columns are each type's ladder. A sparse row is a gap to mine; a type that sits only in one family
is a candidate for a new type that crosses families.

Of our 38 types about 16 have documented techniques, about 11 a few known tricks, and about 11
(mostly the Beast Academy types, Panes, the Number Line Maze) none: mining matters most there.

Precedents: Butler, Torlak and Popović synthesised Nonogram strategies as programs in a small
language (2017); Ludii (Browne) writes hundreds of games in one vocabulary of "ludemes";
PuzzleScript writes puzzle games as rewrite rules; Bogaerts et al.'s step-wise explanations are the
solver's cost model.

### 2. Measuring difficulty and interest

- **Difficulty** comes from solving like a person, not from computer effort. Pelánek's studies
  (human solving times, two sites, 1,800 puzzles) found backtracking and clue counts nearly useless
  (r 0.16–0.27); Sudoku Explainer's hardest step 0.70–0.86; adding technique counts, refutation
  length and dependency (how many easy moves are open) reached 0.84–0.95. So: the hardest step,
  plus effort across steps, plus refutation, plus dependency, plus rule load.
  - The Sudoku technique solver already reaches 0.87 against Puzzle Square JP's difficulty on 61
    puzzles; the general deduction solver 0.63.
  - Solve times are recorded from now on (solves.ms): our own human data, analysed Pelánek's way
    (log time, puzzle difficulty and player skill fitted separately, a held-out half).
- **Interest** is measured from how hard moments are placed (puzzles/difficulty/interest.ts:
  busywork, stuck rounds, break-in, the key step's place, flow, theme, variety), checked against
  likes per solver with difficulty held fixed (puzzles/difficulty/interest-analyze.ts). First result:
  on 55 Sudokus, nothing predicts likes beyond difficulty. Beside the path, how the puzzle looks
  (puzzles/difficulty/looks.ts: clue density, symmetry) and its author's other puzzles.
- **Taste differs by type.** On 235–295 puzzles each (beyond difficulty; chance reaches about ±0.12):

  | Type | Likes vs difficulty | What predicts likes beyond difficulty |
  |---|---|---|
  | Sudoku (55) | 0.51 | nothing |
  | Akari | 0.52 | bigger grids 0.20, sparse clues 0.15, length 0.16 |
  | Masyu | 0.02 | sparse clues 0.35, busywork 0.29, bigger grids 0.21, variety 0.20, author 0.37 |
  | Slitherlink | 0.27 | author 0.27, varied flow 0.20, length 0.17, getting stuck 0.15 |

  Symmetry predicts nothing (most Sudoku, Akari and Slitherlink are exactly symmetric by
  convention; most Masyu aren't). The author measure is biased downward (leaving a puzzle out of a
  small group pulls its mean the other way, hence Sudoku's −0.47), so positive values are real
  setter effects. Two readings: each type rewards a different pleasure (a hard step, or a long line
  that keeps going), or each type draws its own crowd. Puzzle Square JP has only totals; inkit's
  likes per player can tell them apart (a player's taste that holds across types is the crowd).

  **Predictions, written before the results**: Star Battle (counting, like Sudoku) — likes follow
  difficulty (0.4 or more) and little else beyond it. Nurikabe (islands grown across the grid) —
  a weaker link to difficulty (0.2–0.4), with length, pacing or sparse clues mattering beyond it.

### 3. Learner model

- **Mastery per technique**, from solve paths: which techniques a player used, how fast, and
  whether unprompted.
- **Review credited through the graph** (as Math Academy's FIRe does): a puzzle needing an X-Wing
  also reviews the singles inside it. The solver knows exactly what each solve exercised.
- **A student as a solver with a limited toolkit**: our solver allowed only the techniques a player
  has shown, with a cap on what they can hold in mind. It predicts where *this* player gets stuck,
  not only how hard a puzzle is on average (Pelánek's best predictors were models of people
  solving).

### 4. Making puzzles and sequences

- **Minimal pairs from the one-edit neighbourhood.** Sturtevant's lab tried every single edit to
  each Snakebird level and found single changes that doubled or tripled the solution (23 moves to
  50; 36 to 89), which players rated more interesting ("The Unexpected Consequence of Incremental
  Design Changes", AIIDE 2020). The same search, with our solver: every single-clue edit to a
  puzzle, keeping pairs where the key technique changes or the break-in moves. Contrasting cases on
  demand, verified.
- **Cross-type pairs**: two types that hinge on the same schema.
- **Discovery puzzles**: a break-in that forces the target insight before it's named.
- **Proved needs**: every puzzle in a lesson proved to need its technique (switch the technique off
  and the puzzle doesn't solve), and integration puzzles proved to mix several.
- **Design gradients for creators** (the same lab's follow-up): in paint, an overlay showing what a
  clue would do in each place: easier, harder, not unique, a different key step.

### 5. Sequences and sequencing

- **Hand-made sets come first.** A set is a sequence of puzzles, each asking for a leap the
  setter chose: one theme, sorted by its main idea, with its best puzzles marked and a target of
  most, not all, of it. The solver helps the setter (proving what each puzzle needs, finding minimal
  pairs, flagging a grind), but the sequence is authored. inkit's sets and Slate are where this
  lives.
- **Two modes.** Acquiring: short, cued, worked examples and contrasting cases, a technique at a
  time, in prerequisite order. Integrating: uncued, interleaved across techniques and types; most of
  the practice.
- **Adaptivity serves the sets.** Per player it chooses which set next, schedules review due
  through the graph, and picks rest and practice puzzles to the player's taste. It never shortens
  a set's leaps. Its reward is far-horizon progress (techniques used unprompted, new types solved),
  with finishing, liking and coming back as guards.
- **Slate** (the tutorial creator) moves from "a week per technique" (which is cued practice: "it's
  X-Wing week") to lessons per idea followed by mixed weeks.

### 6. Tutor and reflection

A tutor grounded in the solver: self-serve hints that point at where to look before what to
conclude, the key idea when a player gives up (not the whole path), "how could you have found
that?", prompts to explain a step, replays of where a player got stuck. An LLM words it; the solver checks every
claim. Tested against no hints and against fixed hints.

### 7. Making as learning

"Make a puzzle that needs a pointing pair", checked by the solver, with design gradients as
feedback. Problem posing is among the deepest ways to understand an idea, and inkit already has the
editor.

## Borrowing from Math Academy, and avoiding its pitfall

Justin Skycak's writing ([justinmath.com](https://justinmath.com/), *The Math Academy Way*) makes
the case for structure, and we borrow it for acquisition: a prerequisite graph, mastery before
moving on, spaced review credited through the graph, automaticity of the basics, direct instruction
for novices, short tasks with many repetitions.

The critique (Michael Pershan, Dan Meyer): it optimises for "becoming an absolute demon at math
exercises" and can leave brittle problem solvers. The mechanisms: cued practice (the lesson says
which method applies, so learners match labels, not situations), only short well-specified problems,
few general heuristics, no problem posing, and success measured as throughput.

Puzzles defend against this by nature (a puzzle never says which technique applies), but we could
recreate the pitfall ("X-Wing week" with five X-Wing puzzles is cued practice). Principles 1–5,
7 and 9–12 are the guard: authored leaps, uncued integration, near misses, growing struggle,
discovery, heuristics, reflection and making, and measures of the far horizon rather than
throughput. Whether we're more robust is an empirical question; part of phase 4 is how we find out.

The two horizons say why. Math Academy is excellent at the near one, and its measures are near
ones. Rusczyk's and Evan Chen's courses are built for the far one: the problem set's leaps are the
point, and they'd rather a student solve two-thirds of a hard set than all of an easy one.

## What to doubt

- **End-to-end reinforcement learning to design puzzles.** The real reward (a better problem
  solver) is slow and noisy; generation with a solver in the loop and explicit targets does more for
  less. Reinforcement learning fits sequencing, not design.
- **LLMs as the reasoner.** They explain, name, hint and propose; the solver decides what's true,
  however good models get.
- **Far transfer.** Evidence that puzzles make people better problem solvers in general is weak
  (most brain-training studies failed). Near transfer is solid. Far transfer has a chance only with
  ideas taught explicitly and practised across settings, which is why principle 4 sets the unit.
- **One score for interest.** Likes partly track difficulty (hard puzzles draw keener solvers), and
  taste differs by type; any interest measure must predict beyond difficulty, per type.
- **Adaptive engines.** Rusczyk argues against them: the art is in the set's leaps, which an engine
  tuned to a success rate smooths away. Hence principle 1.

## Plan

| Phase | Work | Status | Shows it's working | Stop or rethink if |
|---|---|---|---|---|
| 1. Measure | Solve times; technique solvers (Sudoku first); interest measures and the Puzzle Square JP experiment; Sudoku Explainer comparison (needs SukakuExplainer and Java, local only) | Solve times live in code; Sudoku solver done (0.87); interest runs under way | Technique solvers track human labels; interest measures predict likes beyond difficulty | Interest measures add nothing beyond difficulty on the larger sets: rethink the measures |
| 2. Techniques and the table | The technique language in code (premise, conclusion, proof, cost); mining on Akari and Star Battle (documented, to check), then the undocumented types; a first table: the counting and local-forcing families across ten types | Next | Mining rediscovers most documented techniques, plus verified new ones experts find meaningful; rows fill across types (the same schema proved in several) | Only trivial or uninterpretable patterns; rows stay one type wide |
| 3. Learners and sets | Hand-made sets as paths through the table (a row across types, a column's ladder), in Slate and sets, with the solver proving each leap and flagging grinds; mastery per technique; review credited through the graph; restricted-solver student models; minimal-pair generator; discovery puzzles; design gradients in paint | After 2 | Student models predict a player's own times and stuck points better than one score per puzzle (a few hundred active players) | No gain with enough data |
| 4. Adapt and test | Adaptivity in service of the sets (which set next, review, rest to taste); the solver-grounded tutor; making as learning; randomised comparisons | With players | Authored sets with leaps beat smooth adaptive practice on the far horizon: new puzzles and new types, uncued, weeks later; players keep coming back | No difference with a fair sample |

## Research horizon

Puzzles are unusually good research material: every move is logged and checkable, difficulty can be
computed exactly, and inkit can invent new types on demand. That supports a larger agenda, pursued
only as far as the signals justify:

1. **A model of how people reason through puzzles** that predicts individual moves (where they look,
   when they hesitate, which wrong deduction tempts them), built from bounded solvers fit to play
   logs.
2. **The periodic table, completed**: every type's techniques placed, linked to the mathematics
   underneath (pigeonhole, parity, invariants, extremal arguments, case analysis), and used to
   predict techniques and invent types from its gaps.
3. **Transfer experiments** with a test no one else can run: a newly invented type that needs an
   idea practised elsewhere.
4. **Machine-invented puzzle types**: search the space of rules for types that are learnable,
   interesting and exercise a target idea.
5. **Open science and the AI side**: a public dataset of human solving traces (with consent); a
   benchmark for learning a new type from a few examples as efficiently as people do; whether
   human-style curricula make AI reasoners learn faster (puzzles have checkable answers, which suits
   reinforcement learning with verifiable rewards).

| Signal | Means | Stop if |
|---|---|---|
| Transfer to an invented type, beyond a control group | The headline result | None after well-powered tries (near transfer is still the product) |
| Invented types players rate well and learn smoothly | Type invention is viable | They feel arbitrary; nobody plays twice |
| Human-style curricula improve an AI's sample efficiency on new types | Interest from AI labs, and funding | No gain over random order |

It needs players (thousands, for the experiments), consent and an ethics review for anything
published, collaborators (Pelánek on difficulty and adaptivity; the Butler, Torlak and Popović group
on strategy synthesis; Sturtevant's lab on exhaustive generation; learning scientists on contrasting
cases and transfer), and patience: the cheap signals come in weeks, the experiments in months.


### To pursue: chess puzzles as a sibling domain

Chess puzzles aren't constraint problems: the board changes with every move, and a solution must
work against every defence, so clingo and our windows don't apply; Stockfish (through
python-chess) would be the exact checker. The rest of the system carries over: a human-like
bounded search costed like our tiers for difficulty; a graph of squares and pieces with their
relations (attacks, defences, pins, lines of sight) in place of cells and rule instances; tactical
motifs (fork, pin, skewer, deflection) as technique signatures; the learner model, sequencing and
one-change contrasting pairs. Our "sight along a line" primitive (Akari, Skyscrapers) is a rook's
or bishop's line.

- **Why:** Lichess's puzzle database (CC0) has millions of puzzles, each rated from millions of
  attempts and labelled with its motifs: human difficulty data at a scale no grid type has, to test
  whether bounded search predicts difficulty; and a far-transfer test for the shared
  representation.
- **First experiment (cheap):** a depth- and breadth-limited search with tier-like costs on a
  sample of Lichess puzzles, against their ratings.
- **Stop if** bounded search can't beat a simple baseline (solution length, material) on the ratings.

### To pursue: a puzzle encoder for a language model

General language models read a grid as text, so they count by writing their counting out: in our
test (puzzles/difficulty/llm-move.ts) Opus 5.5 with thinking found a correct move at every
breakthrough, but each call took 7–15 seconds. Our small move-predicting network
(puzzles/difficulty/policy.py: convolutions plus pooling over each cell's rows, columns and areas)
sees the grid as structure and answers in about 2 ms; its top guess at stuck states is true about
90–99% of the time, but it can't say why.

The idea joins the two the way vision-language models join an image encoder to a language model,
and as Google's GraphToken (2024) did for graphs: train a small projector from the network's
per-cell features into a frozen open model (7–8 billion parameters, e.g. Gemma), so it reasons
about the puzzle in words while seeing its structure. If it works, it explains steps and gives
hints in a player's language at a fraction of a large model's cost and delay.

- **Pilot (a few hundred dollars of cloud compute):** template explanations written by the solver
  for Star Battle and Sudoku (free), projector and adapters trained on a frozen small model, then
  the move test against Opus: accuracy, cost, delay. Training is cheap (a run is roughly 5–10
  GPU-hours); good explanation data is the real cost.
- **When:** once the technique-mining harness shows explained breakthroughs are valuable, and the
  network has human-path training (Janko's recorded solves).
- **Stop if** it doesn't beat the network plus templates, or Opus, at a cost worth paying.

The encoder should be the type-free graph network (puzzles/difficulty/graph_policy.py: marks,
cells and rule instances as one graph), not the per-type one, so every type shares one space. Its
first cloud run (37 types, 8,780 puzzles, one L4): with each held-out type left out of training,
its top guess is still a move well above chance (Akari 54% against 29% random, Sudoku 40% against
20%).

Two directions, as in images: encode into the model whose output you want.
- **Puzzle into language** (the pilot above): the language model does the reasoning and the
  talking; the network is its eye, as a vision encoder is.
- **Language into puzzle:** a new type's written rules, embedded by a language model, condition
  the graph network, as text conditions an image generator. The output is moves, so the network
  stays the solver, and an unseen type gets its rules from their description rather than from
  training on its puzzles. This is the shorter road to new types.

Math is mostly not encoded this way: models read it as text (LaTeX, Lean), checked by a symbolic
prover, since it's already a written language with plenty to learn from. Graph encoders of formulas
exist in research (choosing lemmas for provers). A grid's meaning is in its layout, which is closer
to a picture than to a sentence.

## Sources

- Evan Chen's blog and site, summarised in [research-evan-chen.md](research-evan-chen.md); Richard
  Rusczyk on carefully sequenced problem sets (Art of Problem Solving, Beast Academy).
- Bjork on performance versus learning and desirable difficulties; Bransford and Schwartz,
  "Rethinking Transfer: A Simple Proposal with Multiple Implications" (1999), on preparation for
  future learning; Hatano and Inagaki on routine and adaptive expertise.

- Pelánek, "Difficulty Rating of Sudoku Puzzles: An Overview and Evaluation" (arXiv 1403.7373), and
  his work on human problem solving and the Problem Solving Tutor.
- Butler, Torlak and Popović, "Synthesizing Interpretable Strategies for Solving Puzzle Games" (FDG
  2017); Butler et al. on generating level progressions (Refraction).
- Sturtevant et al., "The Unexpected Consequence of Incremental Design Changes" (AIIDE 2020),
  [the Snakebird project](https://www.movingai.com/snakebird.html), and "The Impact of Visualizing
  Design Gradients for Human Designers" (arXiv 2110.04147).
- Bogaerts, Gamba, Guns and Claes, "Step-wise Explanations of Constraint Satisfaction Problems"
  (ECAI 2020).
- Browne et al., Ludii; PuzzleScript.
- Wilson et al., "The Eighty Five Percent Rule for Optimal Learning" (2019); Rohrer on interleaved
  practice; Kapur on productive failure; Kalyuga on the expertise reversal effect; Marton on
  variation theory; Rittle-Johnson and Star on comparison; Schwartz and Bransford, "A Time for
  Telling"; Gentner on analogical encoding.
- Skycak, [justinmath.com](https://justinmath.com/), *The Math Academy Way*, and
  ["Individualized Spaced Repetition in Hierarchical Knowledge Structures"](https://justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures);
  critiques summarised by Frank Hecker ([part 8](https://frankhecker.com/2025/02/15/math-academy-part-8/),
  [part 11](https://frankhecker.com/2025/02/18/math-academy-part-11/)).
