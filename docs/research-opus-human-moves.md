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
