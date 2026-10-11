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

### 1. Technique language and ladders

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
| 2. Techniques | Mining on Akari and Star Battle (documented, to check), then the undocumented types; the cross-type map of schemas | Next | Mining rediscovers most documented techniques, plus verified new ones experts find meaningful; non-trivial shapes recur across types | Only trivial or uninterpretable patterns; types stay unrelated |
| 3. Learners and sets | Hand-made sets per idea (Slate and sets), with the solver proving each leap and flagging grinds; mastery per technique; review credited through the graph; restricted-solver student models; minimal-pair generator; discovery puzzles; design gradients in paint | After 2 | Student models predict a player's own times and stuck points better than one score per puzzle (a few hundred active players) | No gain with enough data |
| 4. Adapt and test | Adaptivity in service of the sets (which set next, review, rest to taste); the solver-grounded tutor; making as learning; randomised comparisons | With players | Authored sets with leaps beat smooth adaptive practice on the far horizon: new puzzles and new types, uncued, weeks later; players keep coming back | No difference with a fair sample |

## Research horizon

Puzzles are unusually good research material: every move is logged and checkable, difficulty can be
computed exactly, and inkit can invent new types on demand. That supports a larger agenda, pursued
only as far as the signals justify:

1. **A model of how people reason through puzzles** that predicts individual moves (where they look,
   when they hesitate, which wrong deduction tempts them), built from bounded solvers fit to play
   logs.
2. **A periodic table of reasoning moves**: the technique language across all types, linked to the
   mathematics underneath (pigeonhole, parity, invariants, extremal arguments, case analysis).
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
