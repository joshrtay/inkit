# Opus as a predictor of people's moves

Does Claude Opus 5.5, reading a raw grid, predict a person's next move better than the graph network
does? If it does, an LLM is a candidate parent for the human-like branch (research-state.md, "the
human-like branch's parent is a test, not an assumption"). Run 2026-10-19; approved budget $60,
spent $16.50 (pilot included).

Code: puzzles/difficulty/opus-human.ts (sampling, asking, the clingo check, the report) and
puzzles/difficulty/opus_human_net.py (the network). Every state, prompt, reply, move and verdict is in
references/ml/opus-human/ (local only: the puzzles are Janko's).

## What was measured

- **The metric** is graph_policy.py's *agreement with people*: a single predicted move (a mark
  and its value, still open in the state) counts if it is among the person's next 3 moves. Those
  are the label marks the person settled, the first 3 still open, with the solution's value. **Top-1**
  means it is the very next one.
  - The network's reported "67% top guess" (research-state.md, "The network") is a different
    measure: whether the top guess is a correct move settled within the *solver's* next 3 rounds,
    on our corpus. It says nothing about people.
  - The network's agreement with people was 28% (the solver's 36%), on solver-round states of
    eight Janko types (research-cross-type.md §14).
- **The states:** 400 from the held-out side of the human-labelled records (graph-human-labels.ts,
  `split: "test"`, held out by puzzle). Seed `opus-human 2026-10-19`.
  - All 14 types, 28–29 each.
  - Within a type, round-robin over Janko's solvers. Puzzles are reused only when a type runs
    short: Hidoku has 9 test puzzles, Nonogram 14, Skyscrapers 21.
  - Two kinds of state:
    - *ordinary* (317): the person's own state, drawn from the middle 60% of their solve;
    - *stuck* (83): what our solver knew just before its first case split or search (as
      janko-stuck.ts), with up to a third of each type's states taken this way.
  - Our solver almost never needs a case split on Akari, Easy as ABC, Fillomino and Star Battle
    (1–2 each), and never on Nonogram and Skyscrapers, so stuck states come mostly from the
    other eight types.
- **Opus:** claude-opus-5-5, adaptive thinking at medium effort, one call per state. The prompt
  follows llm-move.ts: the rules, "the puzzle has exactly one solution", the grid as text with
  everything known drawn in, then "what single move will this person most likely make next? It
  must be a move you are certain of", answered as JSON with a one-line reason.
  - New text grids for the types llm-label.ts couldn't draw: Easy as ABC, Hidoku, Numberlink,
    Minesweeper, Nonogram, and Fillomino and Spiral Galaxies as walls and joins between cells.
  - Each move was checked with clingo: the rules plus the state plus the move are satisfiable, and
    the rules plus the state plus the opposite move are not. Each check runs in its own process,
    killed at 90 s.
- **The network:** the registered snapshot baseline-2026-10-14 (width 256, structure, attention).
  No network trained on Janko's move labels exists yet. Its top guess is the highest-scored open
  mark and value, as score() takes it, on the same states built on the same records.
  - All 14 types were in its training data, though Hidoku barely: 4 puzzles.
- **Our solver:** its next step from the state along its own path: the first step with a fact still
  open, and that step's first open fact. deduce.ts can't start from a given state, so this is our
  solver's *order*, not a fresh solve. Where its path doesn't reach (unfinished solves), it has no
  move (59 states), and that counts as a miss.

## Results

95% Wilson intervals in brackets. "Fair" rows: on the digit types (Easy as ABC, Hidoku,
Skyscrapers) the network and solver mostly name eliminations ("no 3 here"), which are never
people's labels (people write digits). Those rows give them their best *placement* instead: the
network's highest-scored digit set true, the solver's first open digit set true.

| States | n | Opus: in next 3 | Network | Solver | Random | Opus: top-1 | Network: top-1 | Solver: top-1 |
|---|---|---|---|---|---|---|---|---|
| **All** | 400 | **38% (33–43)** | 13% (10–16) | 14% (10–17) | 4% | **23% (19–27)** | 6% (4–9) | 7% (4–9) |
| **All, fair on digit types** | 400 | **38% (33–43)** | 19% (15–23) | 21% (17–25) | 4% | **23% (19–27)** | 10% (7–13) | 11% (8–14) |
| Ordinary | 317 | **39% (34–45)** | 12% (9–16) | 11% (8–15) | 3% | 23% (19–28) | 7% (4–10) | 5% (3–8) |
| Stuck | 83 | **33% (23–43)** | 16% (9–25) | 24% (16–34) | 5% | 22% (14–32) | 5% (2–12) | 12% (7–21) |
| The 11 non-digit types | 315 | **30% (25–35)** | 16% (13–21) | 17% (13–21) | 4% | 16% (13–21) | 8% (5–11) | 8% (6–12) |
| Digit types | 85 | **67% (57–76)** | 0% (0–4) | 1% (0–6) | 2% | 48% (38–59) | 0% (0–4) | 0% (0–4) |
| Digit types, fair | 85 | **67% (57–76)** | 29% (21–40) | 36% (27–47) | 2% | 48% (38–59) | 15% (9–24) | 19% (12–28) |

The "Solver" column is its first fact; any fact of its next step gives the same within a point
(14%, 12%, 24%; Hitori 48%).

**Paired on the same states** (exact sign test on the states where one hits and the other misses),
fair version:
- Opus against the network: 100 to 24 (p = 3e-12);
- Opus against the solver: 101 to 33 (p = 3e-9);
- on the 11 non-digit types alone: 62 to 18 against the network (p = 8e-7) and 68 to 26 against the
  solver (p = 2e-5).

By type (in the next 3; network and solver fair on the digit types; n = 28–29 each, intervals about
±17 points):

| Type | Opus | Network | Solver | Opus top-1 | Opus's move forced |
|---|---|---|---|---|---|
| Skyscrapers | **82%** | 43% | 57% | 43% | 100% |
| Hidoku | **71%** | 0% | 7% | 61% | 100% |
| Easy as ABC | 48% | 45% | 45% | 41% | 86% (4 already known) |
| Star Battle | **48%** | 34% | 31% | 21% | 93% |
| Hitori | 45% | 34% | 41% | 24% | 100% |
| Nurikabe | **39%** | 29% | 18% | 25% | 96% |
| Akari | **38%** | 14% | 10% | 14% | 97% |
| Minesweeper | 32% | 29% | 21% | 21% | 100% |
| Numberlink | **28%** | 0% | 3% | 17% | 100% |
| Nonogram | 25% | 7% | 21% | 11% | 96% |
| Slitherlink | 25% | 21% | 14% | 14% | 93% |
| Masyu | **24%** | 7% | 0% | 21% | 100% |
| Spiral Galaxies | 17% | 0% | **24%** | 10% | 86% |
| Fillomino | 10% | 3% | 0% | 0% | 69% (9 unproved at 90 s, all correct) |

By Janko solver (the person; all types; next 3; network and solver as in the first row, not the
fair version):

| Solver | n | Opus | Network | Solver |
|---|---|---|---|---|
| Jürgen Helbig | 86 | 42% | 13% | 21% |
| Steve C | 62 | 50% | 16% | 3% |
| Emma | 58 | 47% | 7% | 16% |
| Angela Janko | 54 | 17% | 4% | 17% |
| Rainer | 53 | 45% | 21% | 13% |
| Otto Janko | 51 | 24% | 12% | 8% |
| Groffin | 26 | 38% | 12% | 8% |
| Holger Zuck | 8 | 25% | 50% | 38% |

**Opus's moves:**
- 376 of 400 proved forced by clingo; 9 more correct (Fillomino, unproved at 90 s); 6 already
  in the grid (4 of them Easy as ABC "empty" cells); 7 wrong (2 Slitherlink, and 1 each of
  Nurikabe, Spiral Galaxies, Star Battle, Nonogram and Akari); 2 unparsed. So 96% are correct and
  new.
- Of the 233 correct moves that missed the person's next 3, 82 were marks the person never makes
  (a "no line", a cross): people rarely mark negatives. The rest were moves the person made later,
  a median 35% of the way through the moves they still had to make (a quarter of them in the first
  15%).

**Cost:** $15.43 for the 400 (the 20-state pilot, $1.07, was the first 20 of them), $0.039 a call
(572 tokens in, 1,814 out on average), median 10 s. Spiral Galaxies costs most ($0.11 a call on average, up to $0.33; one reply ran
to the 16,000-token limit), then Slitherlink and Masyu ($0.07).

## Verdict

**Yes, clearly.** Reading only the grid, Opus names the person's next move 38% of the time against
the network's 19% and our solver's 21%, even after both are given their best placement on the
digit types. Its exact top-1 is 23% against 10–11%. The gap holds:
- on ordinary states (39% against 12%) and stuck ones (33% against 16–24%);
- on 13 of 14 types nominally, though by a clear margin on only about half (within a few points on Easy as ABC, Hitori and Minesweeper);
- for every Janko solver with more than 8 states, except Angela Janko, where Opus and the solver
  tie at 17%;
- by p < 1e-8 paired.

It is not only the digit types: on the other 11, Opus is at 30% against 16–17% (p ≤ 2e-5). And
96% of its moves are correct and forced. It trails only on Spiral Galaxies
(the solver's order is ahead, 24% against 17%), and on Fillomino every predictor is near zero. Both are
region types whose text grids are hardest to read.

This argues for an LLM parent for the human-like branch, or at least for distilling Opus's choices
into the network as labels. That would cost about $0.04 a state, so $40 buys 1,000 labelled states,
with clingo keeping only forced moves.

Two things it doesn't settle:
- whether a network *fine-tuned on Janko's moves* (the planned test, not yet run) closes the gap;
- whether Opus is predicting *people*, or simply prefers the obvious positive moves that experts
  also make first. Its misses lean to negative marks that people never write, which suggests the
  latter is part of it.

## Caveats

- **Seven experts, not players.** Janko's ~6,700 recorded solves are by 7 experienced solvers, so
  "people" means expert order. Per-type samples of 28–29 carry ±17-point intervals.
- **The network's states are not its usual ones.** It was scored on the person's own states (and
  solver stuck states) of all 14 types. That explains why it is at 13% here and 28% on
  research-cross-type.md's solver-round states of eight types. The solver baseline is its order
  along its own path, not a solve from the person's state.
- **The metric counts negatives the same as positives**, and people rarely make negative marks.
  Any predictor that names crosses is penalised. Opus does so less than the network, which was
  trained on the solver's labels, where crosses are half the facts.
- **One reply per state** at medium effort. Opus's own variance and other efforts are unmeasured.
- **Leakage** looks small: Janko's puzzles are public, but shown as text grids at a mid-solve
  state; the person's recorded order isn't published with them.

## The two checks (2026-10-20)

The verdict above left two things open. Both are now run on the same 400 states. Code:
puzzles/difficulty/opus_human_tune.py (the fine-tune and its scoring), puzzles/cloud/tune-job.sh
and run-tune-job.sh (the GPU job), and `opus-human.ts checks` (both rescorings, → checks.md). The
tuned network is registered as human-tuned-2026-10-20 (models.json).

**1. A network fine-tuned on people's moves.** baseline-2026-10-14 was fine-tuned on the training
side of graphs-human-labels.jsonl: 2,669 Janko puzzles, 244,188 states, each state's targets the
person's next 3 moves.
- No test puzzle was trained on. All 400 states come from the test side, which is held out by
  puzzle, and a training record is also dropped if its content or name matches the test side or the
  human test set (none did).
- The epoch and learning rate were picked on 329 more training puzzles held back. Agreement there
  went from 9% to 47% (best at learning rate 3e-4, epoch 4; 1e-4 got 2 epochs before the time
  limit and reached 43%).
- One spot L4 for about 3 hours (on-demand L4s were sold out in every zone tried); 22 minutes an
  epoch.
- On the whole test side (1,192 puzzles, 6 states each), agreement with people went from 13% to
  47% (mean over types).

| States | n | Opus | Network | Network tuned on people | Solver |
|---|---|---|---|---|---|
| **All, fair on digit types** | 400 | 38% (33–43) | 19% (15–23) | **45% (40–50)** | 21% (17–25) |
| Top-1 | 400 | 23% (19–27) | 10% (7–13) | **27% (23–32)** | 11% (8–14) |
| Ordinary | 317 | 39% (34–45) | 20% (16–24) | **50% (44–55)** | 20% (16–24) |
| Stuck | 83 | **33% (23–43)** | 17% (10–26) | 27% (18–37) | 27% (18–37) |
| The 11 non-digit types | 315 | 30% (25–35) | 16% (13–21) | **46% (41–52)** | 17% (13–21) |
| Digit types | 85 | **67% (57–76)** | 29% (21–40) | 40% (30–51) | 36% (27–47) |

Paired, the tuned network beats Opus 93 to 66 (p = 0.04), the baseline 128 to 25 and the solver 137
to 42. It leads on 10 of 14 types, most on Numberlink (72% against 28%), Akari (66% against 38%) and
Fillomino (41% against 10%). Opus still leads on Hidoku (71% against 14%), Skyscrapers (82% against
57%) and Hitori (45% against 38%), and on the stuck states, which are our solver's states rather
than the person's.

Its guesses are less often right: 343 of 400 are correct by the solution (86%), against Opus's 391
(98%). It learned what people do next, mistakes and guesses included, and nothing in it keeps to
forced moves.

**2. Negative marks left out.** Here the person's next 3 are the first 3 *positive* label marks
they settled that are still open (crosses, "no line", unshaded cells and empty Easy as ABC cells
are dropped). Each predictor's guess is its best positive move: the networks' highest-scored mark
set true, and the solver's first open positive fact along its path. Opus gave one move per state,
and on 130 of the 395 states with a positive move to come it was negative.

| States | n | Opus | Network | Network tuned on people | Solver |
|---|---|---|---|---|---|
| **All** (Opus's negative moves count as misses) | 395 | 35% (31–40) | 31% (27–36) | **46% (41–51)** | 38% (34–43) |
| Only where Opus named a positive move | 265 | **53% (47–59)** | 32% (26–38) | 51% (45–57) | 31% (26–37) |
| The 11 non-digit types | 310 | 27% (22–32) | 29% (25–35) | **44% (39–50)** | 38% (33–43) |

- With negatives out, the gap between Opus and the solver closes: 35% against 38% (75 to 87, p =
  0.4). Most of Opus's edge over the untuned predictors was that they name crosses and people don't.
- The tuned network leads Opus 100 to 60 (p = 0.002).
- On the states where Opus did name a positive move, Opus and the tuned network tie (53% against
  51%, 60 to 54, p = 0.6), and both are far ahead of the solver (31%). That subset is Opus's own
  pick, so it flatters Opus. A fair test would ask Opus for its best positive move on the other 130
  states (about $5).

**Verdict: Opus no longer leads.** A network fine-tuned on Janko's moves for about a dollar or two
of spot GPU predicts the person's next move better than Opus: 45% against 38% as first measured,
and 46% against 35% with negatives left out. Opus keeps the digit types (Hidoku above all) and the
solver's stuck states, and its moves are almost always forced.

For the human-like branch, this makes the tuned network the parent, not an LLM. It is cheaper by
orders of magnitude per move, it is already ahead, and it runs inside the pipeline. Two things it
needs:
- **A correctness filter.** 14% of its top guesses are wrong. For a player model, rank only the
  moves our solver proves (or clingo forces), and keep the human ranking for the order.
- **Help on the digit types.** Hidoku at 14% is the clear gap. Distilling Opus's moves there into
  the network as labels (about $0.04 a state) is the cheap way to close it.

Caveats: the same seven expert solvers are on both sides of the split (held out by puzzle, not by
person), so this measures predicting *these* experts on new puzzles. The fine-tune was picked on a
held-back slice and never saw the 400 states, but only two learning rates were tried. Stuck states
are few (83).

## Why Hidoku (2026-10-20)

The tuned network's one clear gap was "the digit types", Hidoku above all. Checked on CPU, with no
retraining on GPU. Code: puzzles/difficulty/hidoku_relations.py (`rule`, `score`, `probe`).

**The gap is Hidoku alone.** On every test-side state (the 400 had 28–29 a type), the tuned
network agrees with people:

| Type | Test states | Tuned network | Opus on its 28–29 |
|---|---|---|---|
| Skyscrapers | 561 | 64% | 82% |
| Easy as ABC | 533 (a fifth) | 65% | 48% |
| Hidoku | 271 | **10%** | 71% |

So Skyscrapers and Easy as ABC need nothing special. Opus's Skyscrapers lead was 28 states.

**On Hidoku the network can't see the numbers.**
- Of its Hidoku top guesses, 13% are correct by the solution, and 41% name a number already placed
  elsewhere in the grid.
- The cause is the encoding (graph_policy.py). A digit mark's number is one input, n / 9 (up to
  5.4 on a 7 × 7). Messages pool marks into cells and cells into rule instances by mean and max.
  Nothing ties 23 to 22 and 24, or says that 23 is used once it's placed.
  - Hidoku's rule instances are each cell's 3 × 3 neighbourhood (the "touches the next number"
    constraint's footprint) and one whole-grid group. Neither says which numbers it is about.
  - structure.py's glance features cover shading, lines, sizes and sight clues, none of them
    digits.
  - In the human-labelled states, writing a digit settles that cell's other digits, but the same
    number stays open in every other cell. So a 7 × 7 state has ~1,500 open marks, most of them
    numbers already used.
- Hidoku is also nearly absent from training: 4 puzzles in the baseline's data, and 1,036 of the
  244,188 tuned states (40 puzzles; Janko's over 4,000 digit marks, 8 × 8 and up, are left out).

**What people do is simple.** A 30-line rule gets 62% on the same 271 states (61% on the training
side): place a number whose neighbour in the sequence leaves it one free cell, a gap of one (both
n − 1 and n + 1 placed) first. That is the move Opus names in its reasons ("5 must touch both 4
and 6; the only cell touching both is r5c5").

**The encoding, not the data, is the cause.** baseline-2026-10-14 fine-tuned on Hidoku's training
states only (1,036; lr 3e-4; same seed; agreement on the 271 test states after each epoch):

| Inputs | Epoch 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| As is | 8% | 15% | 9% | 17% |
| + 4 relation inputs per mark | 14% | 49% | **56%** | 50% |
| + those and the cells n could still take | 17% | 41% | 51% | 52% |

The relation inputs are: n − 1 placed next door, n + 1 placed next door, n placed anywhere, and the
cell filled. They start at zero weight, so each run starts as the baseline. With every training
state Hidoku's, the encoding as is still stays under 20%; four plain inputs take it to about 50%,
near the hand rule and not far from Opus's 71% (28 states).

Caveats: 271 states from 9 test puzzles, so per-epoch numbers move by several points (and no epoch
was picked on held-out data: all four are shown). One seed. Training on Hidoku alone isn't the
mixed fine-tune, so the full network's figure with these inputs is untested.

**So:** fix the encoding before buying Opus labels. Labels can't teach a network what its inputs
don't carry; the fine-tune had 1,036 Hidoku states and learned almost nothing. The general form,
not Hidoku's: for marks with a value, inputs relating a mark to marks of the same value (used
elsewhere) and of the next value (placed next door), for the types whose rule links a number to
the next (Hidoku, Honeycomb Paths).

### The fine-tune with relation inputs

Josh approved the GPU run. graph_policy.py's GRAPH_RELATIONS=1 gives every digit mark four more
inputs: the same number placed in a cell sharing a rule instance (used), n − 1 and n + 1 placed
next door (square grids with an "order" rule), and its cell filled. They are keyed on mark kind
and rule primitive, never on a type's name. load_net() pads older weights with zero columns, so a
loaded network is unchanged (checked: identical outputs). The fine-tune is the two checks' fine-tune
with the switch on: baseline-2026-10-14, the same 2,669 training puzzles, lr 3e-4, one spot L4
(run tune-20261020-1516, about 23 minutes an epoch). Epoch 4 was best on the held-back puzzles
(49.2%; epoch 5 48.0%). It is registered as relations-tuned-2026-10-20.

Every test-side state of the digit types (hidoku_relations.py `score`):

| Type | States | Tuned before | With relations |
|---|---|---|---|
| Hidoku | 271 | 10% | **56.5%** |
| Skyscrapers | 561 | 64% | 62% |
| Easy as ABC | 533 (a fifth) | 65% | 65% |

Its Hidoku top guesses are now correct 76% of the time (13% before), never name a number already
placed (41% before), and always sit next to n − 1 or n + 1.

Every type, the test side at 6 states a puzzle (opus_human_tune.py `heldout`; both networks on the
same states):

| Type | Tuned before | With relations |
|---|---|---|
| Hidoku | 7% | **50%** |
| Easy as ABC | 60% | 64% |
| Numberlink | 65% | 69% |
| Masyu | 44% | 49% |
| Slitherlink | 35% | 38% |
| Akari, Fillomino, Hitori | 57%, 44%, 50% | the same |
| Minesweeper | 61% | 59% |
| Nonogram, Spiral Galaxies | 21%, 32% | 20%, 31% |
| Star Battle | 54% | 51% |
| Nurikabe | 54% | 49% |
| Skyscrapers | 67% | 56% |
| **Mean over types** | 46.6% | **49.0%** |

- Hidoku's gap is closed as far as these numbers go: 56.5% against Opus's 71% (on its 28 states)
  and the hand rule's 62%.
- The mean gains 2.4 points, nearly all of it Hidoku. The rest move by a few points either way. At
  20–90 puzzles a type and one run each, most of that is noise.
- Skyscrapers may have lost a little: 64% to 62% on all 561 states (67% to 56% on the 126 sampled
  ones). Its "used" input repeats what its rows and columns already say, and it gets no
  next-door inputs (Skyscrapers has no order rule). This is untested; a second seed would tell.

**Verdict:** the encoding was the cause, and four inputs fix Hidoku without Opus labels. Use
relations-tuned-2026-10-20 as the human-like branch's parent in place of human-tuned-2026-10-20
(load it with GRAPH_RELATIONS=1). The correctness filter is still needed.
