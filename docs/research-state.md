# Research: where things stand

> **Start here:** this file holds the results, open questions, sequence and queue;
> [research-ops.md](research-ops.md) holds what's running and how to check it, the cloud runbook,
> spending, what needs the user's approval, and the working rules. Read both before continuing.
> [research-review-2026-10-24.md](research-review-2026-10-24.md) is the latest critical review of
> all of it: which results are solid, which are artifacts or underpowered, and the next experiments
> ranked by value against cost.
> [research-coding-labs-2026-10-30.md](research-coding-labs-2026-10-30.md) maps how AI labs trained
> coding models (verifiers, sampling, RL, reward hacking) onto Inkit's checks, generator and play logs.


A snapshot of the research agenda (2026-10-13): the aim, what's built, what we've learned, what's
open, what's running and what's next. The design behind it is
[learning-design.md](learning-design.md); detailed results are in
[research-cross-type.md](research-cross-type.md) and the research-*.md files. Keep this file
current; the others keep the history.

## The aim

Players who can solve puzzles they've never seen, long after practice: the far horizon. For that,
the research must deliver three products, all built on one shared core:

- **The core: a model of how people solve.** Which moves a person can see from a position, how hard
  each is, which they reach for first, and where they stall.
- **Difficulty:** how hard a puzzle is for a person, and why.
- **Hints:** the move a person would find next, and the technique behind it, given in steps.
- **Interesting puzzles and sequences:** puzzles that hinge on an idea, and sets that build ideas in
  order.
- **A fast solver that reasons like a person** (added 2026-10-21): every puzzle, the hardest
  included, in under 10 s, without drifting far from human-style steps. Targets and the first step
  in [research-trajectory.md](research-trajectory.md), "Aim 4".

## What we have

### Tools

| Tool | What it does | Where |
|---|---|---|
| Deduction solver | Solves like a person: small windows of rules first, then bigger ones, then case splits; explains each step; prices it | puzzles/difficulty/deduce.ts |
| Step prices | A step's cost, corrected by expert step labels (Singles, Sudoku, Loopy) | price_steps.py, price_centre.py, step-prices.json |
| Lemmas | Premature loop (on); components (frontiers), parity (off: unpriced) | deduce.ts |
| Window families | Counting across units, line families, mined families (expert band only), pockets (opt-in) | deduce.ts, counting.ts |
| Step signatures | What a step uses (primitive@unit), its shape and family | signatures.ts, techniques-table.ts |
| Scoreboard | Every judge of difficulty in one command | scoreboard.ts |
| Mining harness | Finds stuck moments and proposes techniques (systematic, then Opus, now from people's moves) | miner.ts, miner-propose.ts |
| Generator | Puzzles solvable by reasoning alone, in bands (easy, medium, hard, expert), recording the techniques each requires | generate.ts, bands.ts, gen-set.ts |
| Graph network | Predicts next moves across all types from one graph of marks, cells and rules | graph_policy.py, graph-data.ts |
| Cloud | GPU jobs (one L4) and a CPU fleet (512 vCPUs), with results in a private bucket | puzzles/cloud |
| Link importer | Opens puzz.link and Penpa+ links in paint; records requests for types we don't have | app (merged, not deployed) |

### Data (local only; much of it others' and never published)

| Data | Size | Whose judgement | Use |
|---|---|---|---|
| Janko's puzzles with recorded solves | ~6,700 solves; 14 types read (janko.ts; the later six checked unique and equal to Janko's: janko-check.ts) | 7 experienced solvers' move order; no times | human order, hints, stuck moments |
| Human-labelled graph records | 4,190 Janko puzzles, 362,000 states, 14 types (graph-human-labels.ts: the person's moves as labels, no solve; 1,192 held out by puzzle) | the person's next 3 moves | network training and agreement, including puzzles our solver can't finish |
| Puzzle Square JP | ratings for 17 types, ~20 sampled per type on the board; likes for 4 types | the site | difficulty, taste |
| Puzzle Square JP from links | 1,905 puzzles, 20 types, 875 of them Akari (psjp-links.ts: data.json's puzz.link links read by the site's reader, unique by our solver, not in the rated set) | the site's difficulty, likes, solves | human training set |
| Human corpus (all sources merged) | 39,467 distinct puzzles, 22 types (human-corpus.ts): puzz.link's database 21,191, Puzzle Square JP 12,015, Janko 8,166, Nikoli 100, Logic Masters 5; 1,976 in two or more; 1,854 test puzzles left out | each source's labels kept side by side | the human training set (human-shard.ts, sharded in the cloud) |
| Tatham's generators | ~270 graded puzzles, 4 games | his solver (an algorithm) | difficulty |
| Beast Academy Puzzle Lab | 88 puzzles in ordered sets | curriculum designers | difficulty, sequences |
| Expert step labels | ~14,000 steps (Singles, Solo, Loopy) | expert solvers (algorithms) | step prices |
| Our examples and corpus | 8,780 puzzles, 173,000 positions | our solver | network training |
| Generated (fleet, running) | 42,000 at 80 minutes, aiming for 120,000+ | our solver, by band | network training, site shortlist |
| inkit solve times | growing with players | people solving | the long-term difficulty source |

**The honest gap:** almost none of the difficulty data is people solving. Samples of 5–20 puzzles
per type mean agreement figures can be off by 0.15.

## What we've learned

### Difficulty

| Judge | Agreement now | Notes |
|---|---|---|
| Puzzle Square JP Sudoku | 0.80 | the Sudoku technique solver reaches 0.87 |
| Puzzle Square JP Akari, Nonogram, Star Battle | 0.85, 0.83, 0.73 | |
| Puzzle Square JP Simple Loop | 0.63 | was −0.01 before the loop lemma |
| Puzzle Square JP Masyu, Shikaku, Hitori | 0.29, 0.34, 0.46 | weak |
| Tatham Light Up | 0.91 / 0.85 | |
| Tatham Solo | 0.80 | |
| Tatham Singles | 0.75 | |
| Tatham Loopy | 0.41–0.50 | |
| Beast Academy Spiral Galaxies, Fillomino | 0.70, 0.57 | |
| Beast Academy Akari | 0.23 | the order within sets runs backwards (−0.57) |

- **Learned step prices work where the labels fit:** Sudoku, Aquarium, Light Up, Loopy.
- **New reasoning tools change difficulty.** Each new tool (a lemma, a family) lets the solver skip
  searches that had been carrying the "this is hard" signal. A tool is only safe once its steps are
  priced. The loop lemma passed that test; the component lemma still flattens Hitori and Singles.

### The core: how people solve

- **The solver's order against people's (Janko):** 0.77 on Star Battle and Akari, 0.55 on
  Slitherlink, 0.52 on Hitori, 0.49 on Masyu, 0.46 on Nurikabe. Not yet usable for Fillomino (solver
  timeouts) or Galaxies (solved in one round).
- **Where the solver gets stuck, people often move elsewhere first.** The mining rounds proposed
  the same missing units again and again: the ends of a line piece, pockets and corridors,
  frontiers (a group and its ways out), vertices, the border.
- **The network:**
  - 67% top guess against 25% random (width 64, with positions, 16 epochs).
  - Positions help the each-once types most.
  - Attention and hide-and-fill pretraining don't help.
  - Width is untested: the wider runs had the wrong learning rate.
  - Whole-grid types stay under 40% (Nurikabe, Cave).
  - **Opus predicts people better** (research-opus-human-moves.md): on 400 held-out Janko states over
    all 14 types, its one move is in the person's next 3 moves 38% of the time, against 19% for this
    network and 21% for our solver (fair on digit types; top-1 23% against 10–11%), and 96% of its
    moves are correct. The "67% top guess" above is not a people measure: it is a correct move
    within the solver's next 3 rounds.
- **Transfer:** within families, yes; across them, barely.
  - The network's nearest move from another type shares its reasoning 29% of the time (chance 5%).
  - Left-out families still beat chance (lines and loops 30% against 14%), but four types fall to
    chance.

### Techniques and the periodic table

- **Shared across types: small shapes, not whole techniques.**
  - 2,223 step shapes; 89 appear in two or more types.
  - What's shared is one rule instance and the decided cell (a count along a line, each-once in a
    row, a loop at a corner).
- **Six families of types emerge from data** (an SVD of types × techniques):
  - lines and loops;
  - order;
  - regions by size;
  - counting;
  - sight and nearness;
  - each-once.

  These are the table's groups, and the natural unit for transfer tests and learning paths.

### Generation

- **The solver in the loop removes searching.** With the deduction solver inside the generator, no
  puzzle needs search, against 12 of 12 Slitherlink and Cave puzzles from the old generator.
- **About 100–150 puzzles per CPU-hour**, mostly easy unless aimed higher.
- **Per-genre techniques** (deduce.ts TECHNIQUES, off by default and unpriced): Shikaku's
  candidate rectangles, Minesweeper's clue pairs and chains, paths' loose ends and cuts, Galaxies'
  symmetry reach, Hidoku's distances and dead ends, Easy as ABC's X-wing, Fill-in's slots,
  Numberlink's owners, Fillomino's sizes and shapes. Expert has them all; hard has each genre's
  basic ones (bands.ts HARD_TECHNIQUES: mirror, slots, two-clue mines, ends, rects, distance,
  Numberlink's ends and owners, Fillomino's sizes), so those genres have a hard band. Galaxies' and
  Fill-in's helper atoms have footprints in every band (each window had held the whole puzzle).
- **Aiming above easy** (gen-set.ts aimHigher): Fill-in's entries from three digits, denser
  Minesweeper with no 0 shown, and for both, and Simple Loop at expert, another board while one
  stays too easy. Every band of Galaxies, Fill-in, Minesweeper, Simple Path, Hidoku, Numberlink and
  Fillomino now generates; the fleet's Galaxies and Fill-in puzzles were re-banded (gen-reband.ts).
- **Still short:** Simple Loop and Simple Path medium (puzzles jump from easy to hard), Galaxies
  easy (the generator makes none) and expert (most attempts time out), Shikaku expert (2 of 9),
  Nonogram (fixed pictures).
- **Generated isn't human-like** ([research-human-gap.md](research-human-gap.md)). A classifier
  tells human puzzles from generated ones at AUC 0.76 (Akari) to 1.00, and still 0.76–1.00 with
  size left out. In order, the gaps are:
  - small boards;
  - 1-star Star Battle only;
  - no symmetric clue layouts;
  - dense clues with small numbers;
  - no puzzle beyond expert (half of human Slitherlink, Masyu, Nurikabe and Hitori are);
  - solves with many easy moves open at once.

  The generator's targets are in human-targets.json, and each fleet puzzle has a human-likeness
  score.

### Labels from language models

- **Opus 5.5 reads a raw grid slowly:** it found correct moves at every breakthrough, at 7–15 seconds
  a call.
- **As a technique proposer, Opus did well:** its families removed searches the systematic search
  couldn't (line × 4 pivot; three blocks and a line).
- **The labeller pilot** ([research-llm-labels.md](research-llm-labels.md), $14.45), given the
  solver's explanations:
  - difficulty: no better than our estimate (0.59 against 0.59);
  - hints: every judged hint correct and well graded; at stuck moments Opus's own move was among
    the person's next 3 in 44% of cases, against 17% for our solver's case split;
  - interest: the only signal beyond difficulty so far (Fable 0.34, Opus 0.18; ours −0.15), on 72
    puzzles, to confirm at scale;
  - sequences: beat our estimate (0.59 against 0.16) but not sorting by grid size (0.69).
- **Opus tells human-made from generated** ([research-llm-labels.md](research-llm-labels.md),
  $2.68): 83% of 96 same-type pairs from the grid alone (the classifier: 0.95), 75% with our solve,
  which misleads it (it takes case splits as a generator's mark). Its reasons are mostly right and
  specific (symmetry, sparse clues, clue kinds, 2-star Star Battle); at chance on Hitori and
  Spiral Galaxies. A reviewer of generator changes, not a replacement for the classifier.

## Open questions, by product

| Question | Product | What would answer it | Status |
|---|---|---|---|
| Is data the network's limit? | core | learning curve on the generated set (10–100%) | **not volume**: human-made puzzles stay at 61% (key move 30%) from 10% to 100% of 133k generated; the generated data isn't human-like enough (research-cross-type.md §13) |
| Does size matter? | core | fair size test: learning rate scaled with width | **yes**: 69.4% (width 64), 73.5% (128), 76.0% (256), still rising; whole-grid types gain less |
| Does structure as input fix whole-grid types? | core, hints | give the network groups, their sizes and exits | **largely**: Hitori 67% → 83%, Slitherlink 65% → 79%, Nurikabe 48% → 60%, Cave 43% → 54%; all types 73.5% → 77.1% at width 128 (research-cross-type.md §11) |
| Do our tests measure the right thing? | all | human-made puzzles held out, agreement with people's next moves, key-move score, results by band and family, repeated seeds | building now |
| Can connectivity steps be priced? | difficulty | price group steps from Singles labels; centre with the lemma on | to do |
| Does the order of a solve carry difficulty? | difficulty | path features against ratings (solves as vectors, step 1) | after pricing |
| Do Janko's recordings hold solve times? | difficulty | check the files | **no**: moves only, no times. And the ~6,700 recorded solves are by 7 experienced solvers (Rainer 2,109; Steve C 1,125; Jürgen Helbig 996; Angela Janko 784; Otto Janko 711; Groffin 562; Emma 410), so "human order" means expert order, a third of it one person: report agreement per solver. inkit's own solve times are the human difficulty source. *(2026-10-22: Janko's folder index pages do rank puzzles by solving time, "leicht", 1–8, "schwer"; janko-full.ts now puts `meta.jankoLevel` (0–9) on all 14,229 converted Janko puzzles)* |
| Can Opus or Fable label difficulty, hints, interest, sequences? | all | pilot against answer keys | done: hints yes; difficulty no; interest no at scale (Slitherlink a little); sequences unclear (research-llm-labels.md) |
| What makes a puzzle interesting, beyond one person's taste? | puzzles | public likes and ratings; inkit's own signals; a validated model judge | partly measured (Puzzle Square JP likes) |
| Which techniques is the solver missing? | puzzles, difficulty | per-genre techniques (Minesweeper chains, Hidoku distances, Galaxies symmetry, Shikaku rectangles) | done for ten genres (expert band, and each genre's basic ones in hard); step 3 (2026-10-21) added Numberlink's routes and uniqueness and the `finish` set: 170 of 196 stalled puzzles finish by 300 s (was 139); pricing them open |
| Can a set be built from the family map, and judged? | puzzles | sequences checked against Beast Academy's order | to do |
| Why is Beast Academy's Akari backwards? | difficulty | look at their sets | open |
| Is the network the bottleneck for hard human puzzles? | core, difficulty | the frontier measurement and the no-network baseline B0 (see the cheap-solver experiment) | to do, before any loop round |
| Does a learned generator make human-like puzzles that lift the human test? | core, puzzles | train on specs, verify, judge downstream | after the human-like fleet |
| Does the intended path predict likes beyond difficulty? | hints, puzzles | min-peak path features against likes | to do (CPU) |
| How strong is each setter? | puzzles, core | the reputation formula on Puzzle Square JP's setters | to do (CPU) |

## Running now

- **Generation fleet:** 15 spot VMs, 480 vCPUs, until about 13:20 Pacific. A watchdog relaunches
  reclaimed machines; gather-gen.sh collects the results.
- **Expert-band trial:** the six genres that had no top band, now with the mined families.
- **Evaluation changes:** held-out human puzzles first.

## Decisions waiting on you

1. **Push main** (52+ commits): deploys the link importer. Everything else is research code.
2. **GPU quota:** the increase to 4 was declined automatically (CPUs to 512 were approved). Ask
   again smaller (1 → 2) with a short justification, or open a support case. A second option: the
   approved Vertex AI quota (one preemptible L4 for training in us-west2) is a separate pool.
3. **A budget alert** in Cloud Billing: optional insurance.

**Baseline before human data (2026-10-14):** width 256 with structure and the generated set scores 68% on human-made puzzles (key move 35%, agreement with people 28% against the solver's 36%), up from 61% / 30% / 22%; research-cross-type.md §14.

**The human corpus (2026-10-14), built, its cloud run ready but not launched** (gcloud needed
reauthentication). human-corpus.ts merges every source into references/ml/human-corpus/: one record
per puzzle by spec key (joined where a source id or puzz.link's Puzzle Square JP id says two specs
are one), every source's labels side by side (`labels.psjp`, `.puzzlink`, `.lmd`, `.janko`), the
test sets left out by id and spec. human-shard.ts checks uniqueness (clingo, 60 s) and solves
(deduce, 30 s budget, killed at 120 s), sharded over spot VMs (run-human-job.sh --corpus,
human-watch.sh, gather-human.sh → data/graphs-human-train.jsonl, records carrying `sources`,
`sourceLabels`, `setters`; graph_policy.py's guard also drops test puzzles by source id, and the
training mix shows each source).
- **Why the last human build ran long:** a few genres spend the whole cap on nearly every puzzle.
  A local sample (148 puzzles, 2 per genre and size band) took 33 Mac-core-seconds each on
  average, but a 10 × 10 Fillomino takes 180 s (uniqueness past 60 s, grounding near 2.3 GB, deduce
  killed at 120 s), Numberlink over 10 × 10 the same, Hidoku and Spiral Galaxies 40–120 s, none
  finishing; and a wall-clock budget on a cloud vCPU (half a Mac core) finishes less than on the
  Mac. The caps stay; a genre and size band under 20% finished after 10 tries is skipped
  (`solverFinished: false`, why "skipped"), and boards over 20 get the uniqueness check only.
  Estimate: about 140 Mac-core-hours (330 without skipping), about 9 VM-hours of n2-highcpu-32, so
  8 VMs for about 1¼ hours, under $3 (the 3-hour limit caps it at $7.70); about 28,000 finished.
- **Sources' difficulties where they overlap:** Puzzle Square JP against puzz.link ρ 0.68 (1,240
  puzzles; median over 9 genres 0.70: Spiral Galaxies 0.81, Simple Loop 0.80, Masyu 0.77, Akari
  0.70, Numberlink 0.70, Nurikabe 0.68, Shikaku 0.66, Slitherlink 0.63, Fillomino 0.50). Our
  estimate as a third column comes with the run (human-corpus-solved.md).

**Experiment: a cheap solver for hard human puzzles (capability, not human-likeness).** Can a
learned network plus an exact checker solve hard human puzzles step by step, with every move
provably forced, more cheaply than our deduction solver (30 s–2 min, often timing out) or
clingo's uniqueness search (also timing out on big boards)? Assessed 2026-10-15 (the thread's
write-up: research/capability-loop-assessment.md in the project files); the plan below carries
its corrections.
- **What it is:** expert iteration with a verifier (a policy proposes, clingo keeps the forced
  facts, the kept facts are supervised labels), not AlphaZero and not reinforcement learning: no
  search amplifies the policy, nothing estimates value, and the curriculum is a fixed pile (the
  ~11,000 human puzzles the solver doesn't finish). The reward is dense and sound, so plain
  supervised learning on verified facts is the right tool.
- **What it buys the aims:** solver coverage on the hard human tail (half of human Slitherlink,
  Masyu, Nurikabe and Hitori), so training states on the right distribution, difficulty estimates
  where the sources' ratings are and we have none, and hint candidates. It adds machine solve
  paths on human puzzles, not human data: it does not teach human order, and forced-first order
  is further from people than the solver's (28% against 36%).
- **Measure first (CPU fleet, no GPU):** on every unfinished human puzzle, the stall state;
  whether any open mark refutes by propagation alone; the conflicts the cheapest provable fact
  needs; the baseline network's top-5 and top-20 recall of forced-now facts. This says whether the
  network is the bottleneck: refuting one mark by propagation is milliseconds, and the deduction
  solver's time goes to explanations and windows, not proofs.
- **The bar: a no-network baseline (B0).** Refute every open mark by propagation, play the first
  forced one, repeat; when none is, case-split on the most constrained mark with a small conflict
  limit. No explanations, no windows. Its anytime curve (share of the hard set solved against
  CPU-seconds a puzzle) is what the network has to beat.
- **The loop, corrected:** the label is *forced now*, not "settled within three rounds"; every
  verified fact counts, from partial solves too (an unsolved puzzle fixed 70% of the way yields 70%
  of its facts); the Janko human moves on unfinished puzzles, clingo-verified, seed the frontier;
  the corpus and human labels stay in every round's mix and fallback-found facts are up-weighted,
  against self-distillation drift. Three rounds, with the stop rule set first (under 2 points of
  solved share at the same budget ends it). A split head (which mark to case-split on) only if the
  measurement shows most of the frontier needs search.
- **Judged on a fixed held-out set of hard human puzzles,** fixed before round 1, by source and
  difficulty band: anytime curves for B0, the deduction solver, clingo alone and each round;
  checks and dollars per puzzle. Agreement with people is reported but isn't the goal.
- **Forks from the registered snapshot** baseline-2026-10-14 (puzzles/difficulty/models.json;
  weights held in gs://inkit-research-ml/models/). Every network an experiment produces is
  registered with its parent. **The human-like branch's parent is a test, not an assumption:**
  fine-tune the baseline and the capability branch's later snapshot on Janko's moves and compare
  agreement (Maia's precedent: predicting human moves trained better from human games than from a
  strong engine). That branch is data-bound: seven Janko experts, no times; inkit's own solve logs
  are on its critical path.
- **Gate:** wait for §12's result (training on solver-labelled human puzzles) before GPU rounds. If
  it doesn't lift the human test, the limit is move labels, not puzzle coverage, and the loop
  waits.

**Experiment: a learned generator from human puzzles (the pile the loop can't deepen).** Train a
generative model of clue layouts on the human corpus, conditioned on genre, size and the source's
rating; sample; keep what clingo proves unique, the human-likeness classifier accepts and a
novelty check against the corpus passes.
- **Why:** it needs specs, not solve paths, so all 39,467 human puzzles count today, including the
  unfinished tail (the beyond-expert band the constructive generator can't make). The learning
  curve says likeness, not volume, limits the network, and the generator is the only source of
  more human-like puzzles. Generator and solver improving each other is where a self-improvement
  loop applies here.
- **Risks:** near-copies of others' puzzles on a public site (about 1,800 puzzles a genre,
  Akari-heavy, some genres a few hundred): a novelty check by content key and edit distance before
  anything is kept. Surface likeness without a setter's idea: the classifier sees symmetry and
  clue density, not a hinge. Low uniqueness yield and a CPU bill on big boards.
- **Judged downstream,** not on the classifier: does a network trained on its output lift the
  human test above the baseline's 68%, and does Opus still tell its puzzles from human ones.
- **Order:** the queued human-like constructive fleet first (built, about $20); this if the fleet
  doesn't close the classifier gap.

**Experiment: the intended path (what a human puzzle implies).** A setter builds around a path a
person can follow: no guessing, usually one hinge, every clue load-bearing. So a human puzzle is
evidence that a path with no case split and a low peak step cost exists, and the solver's failure
to find one points at a missing technique rather than at the puzzle.
- **Find it:** change the solver's round objective from "cheapest step each round" to "the path
  that minimises its hardest step, with no split" (deduce.ts); flag puzzles where none exists under
  budget as technique-missing (a sharper miner than stuck moments).
- **Use it:** hints follow the intended path, not the expert's recorded order; its features (peak
  cost, hinge count, clue usage, easy moves open at once) are interest candidates; it gives the
  generator a setting objective (puzzles with a one-hinge, no-split path) rather than a surface one.
- **Caution:** the path-feature interest estimate scored −0.15 against likes, so this
  operationalisation needs its own test. Elegance under our cost model is only as good as the
  prices. The implication holds for Nikoli, Logic Masters and curated Janko and weakly for open
  posting, which is what quality weighting is for. The intended path is not how people solve;
  the human-like branch still needs recorded moves.
- **Cheap test (CPU, local data):** on puzzles with likes or beauty, min-peak path features
  regressed on likes with difficulty held fixed. Predicting beyond difficulty where the old
  estimate didn't is the go signal.

**Setter strength: recorded, not computed (checked 2026-10-15).** Every corpus record carries a
setter where the source names one (Puzzle Square JP user, Logic Masters author, puzz.link's
collection name, which is a site or series, not a person; none for Janko or Nikoli). The only
per-setter signal with numbers is Puzzle Square JP's likes and solves (about 12,000 puzzles;
Logic Masters beauty covers 5). research-reputation.md's creator formula (a Bayesian-averaged like
rate per puzzle with difficulty held fixed, pooled per creator with shrinkage) runs unchanged on
those setters and hasn't been run: a CPU-only script against local data. Source-level priors
until then: Nikoli (editorial) and Janko (curated, expert-solved) strongest; Logic Masters strong
but nearly absent; Puzzle Square JP open posting, sorted by likes; the puzz.link database weakest
(mixed, its "setter" a collection). Label-free signals that pool per setter the same way: the
human-likeness score, and the intended-path elegance score if its test passes. Expect a coarse
ranking: a few clearly strong setters and a long undifferentiated middle.

**Queued after the human build lands: one puzzle catalog.**

- **One local table** (DuckDB or Parquet in references/, never published), one row per distinct
  puzzle, human and generated alike:
  - **identity:** key, genre, size, pointers to the spec and the graph record;
  - **origin:** human / ours / bot / unknown, with the evidence (source flag, setter, classifier
    score);
  - **source:** sources, setters, licence and verdict;
  - **difficulty:** each source's raw rating, plus a normalised percentile within source and
    genre, our estimate and our band;
  - **quality:** likes, beauty, the setter score and human-likeness;
  - **status:** unique, solver-finished, and the split (train / test / eval-only).
- **Every pipeline step updates it** (crawls, conversion, generation, cloud builds).
- **Checks** that fail loudly when a field like the generated flag goes missing.
- **A short field guide.**

**Queued after the first human-data run: quality weighting.**

1. **A quality estimate per human puzzle,** shrunk down a hierarchy: the puzzle's own rating (Puzzle
   Square JP likes per solver, Logic Masters beauty, both with difficulty held fixed); else its
   setter's; else its source's and type's; else its source's. The source and type levels are learned
   from data (ratings where present, the human-likeness classifier, and each source's effect on the
   human test), not assigned.
2. **Provenance:** separate "human-made?" from "good?". Doubtful sources (the puzzle-*.com sites,
   puzzlekit's unsourced puzzles) are checked by the classifier against our generated puzzles.
3. **Training weights by quality,** and "human-like" redefined as like good setters: the
   classifier's positive class and the generator's targets drawn from high-quality puzzles.
4. **Tests split by author.**
5. **Measure:** the run with and without the weighting.

## Sequence

Two things first, since every later result rests on them: the **evaluation changes** (the network
test is lenient and in-distribution) and **whether Janko's recordings hold solve times** (if so,
about 4,000 human difficulty labels).

Then three tracks in parallel. Each uses a different resource (the GPU, the CPUs, the API), so none
waits on another:

| Phase | GPU (one L4 until the quota rises) | CPU (Mac and fleet) | API | Decides |
|---|---|---|---|---|
| **0. Fix the ruler** | — | evaluation changes; gather the fleet, audit 1%, load data in pieces; check Janko's times | **labeller pilot** (done: hints yes; difficulty and interest no) | can a model's labels fill our data gaps? |
| **1. What limits the network?** | **fair size test** (running), then the **learning curve** at the chosen size | **connectivity pricing**; **per-genre techniques** (an agent) | — | size or data or neither; can the component lemma go on? |
| **2. Fix the weakest area** | **structure as input** for the whole-grid types; then **tuning on human moves** | **path order and difficulty** (once prices settle) | **labels at scale**, if the pilot passes | do hints and difficulty work on Nurikabe and the rest? |
| **3. Build the products** | distill into a small model (the encoder), if labels and network justify it | sequences from the family map, judged against Beast Academy; the site shortlist; new genres in the generator | hint wording | what ships |

**Why this order:**
- **Size before the learning curve:** the curve should use the right size.
- **Structure after both:** otherwise we can't tell what fixed Nurikabe.
- **The pilot now:** it needs only existing answer keys, and it decides how phase 2 gets its labels.
- **Connectivity pricing beside it, on CPU:** it unblocks the component lemma and hard Hitori and
  Nurikabe from the generator.
- **Path order after pricing:** it reads step costs.
- **Products last:** each needs the core to be good enough.

**Gates:**
- **Neither size nor data helps:** skip more generation and go to structure as input.
- **The pilot fails its answer keys:** labels must come from people, so inkit's own solve and like
  data moves up, and so do the site features that collect it.
- **Structure as input leaves Nurikabe under 40%:** rethink the network's input, not its size.

## Next, in order

Done from the earlier list: the fleet gathered, the evaluation changes, the size test and learning
curve, structure as input. Updated 2026-10-15.

1. **Land §12** (training on human puzzles, the `next` step): it gates the capability loop and
   decides whether coverage or move labels is the limit.
2. **Two CPU-only tests on local data, in parallel, no spend:** the frontier measurement and B0
   (is the network the bottleneck?); the intended-path test against likes; the Puzzle Square JP
   setter score. Each is a day or less and each decides a later line.
3. **The human-like constructive fleet** (about $20, built) once §12 is in, then the learned
   generator if the classifier gap stays.
4. **Capability loop rounds** only if §12 lifts the human test and the frontier measurement shows
   an addressable set B0 doesn't already take.
5. **Labels from models where the pilot passed:** hint text from solver steps; stuck-moment moves
   for the miner.
6. **Connectivity pricing** (CPU, alongside).
7. **Per-genre techniques** for the generator's missing bands and genres.
8. **For the site:** solve logging with consent (the human-like branch's data source), review the
   generated shortlist, learning paths from the family map.

## Spending to date

| Item | Approx. |
|---|---|
| Anthropic API: mining rounds | $2.50 of $10 approved |
| Anthropic API: labeller pilot and interest confirmation | $17.69 ($15 pilot, then ~$5.50 more approved) |
| Anthropic API: can Opus tell human-made puzzles | $2.68 of ~$3 approved (cap $4) |
| GPU runs (5) | ~$8 |
| CPU generation (first batch + fleet) | ~$16–21 when the fleet ends |

## Phase 0 of the trajectory: greedy against the cheapest proof (2026-10-15)

[research-trajectory.md](research-trajectory.md), phase 0. Cost model v0: today's step costs
(deduce.ts's costOf with step-prices.json), proof cost = their sum, and separately the max.

- **The search:** deduce.ts's `Options.search`. A state is what's known; from each, every
  stage's windows are checked (kept by what each window knows, so states share work). The
  moves:
  - the usual round (greedy);
  - only the cheapest steps;
  - every step up to the next few cost levels;
  - the cheapest steps plus one dearer step (a hinge taken early);
  - when stuck, the usual shallow case split (no tier-3 search).

  It is seeded by the greedy path and the cheapest-only path, then expands by g + ρ·open marks
  (ρ is greedy's cost per mark: an estimate, not a bound), pruning at the best proof so far, for
  150 expansions. The cheapest-only path is optimal for the max: deductions only grow as more is
  known. For the sum, the best found is an upper bound; the search never ran out of states.
- **The run:** proof-search-run.ts, a seeded 60 per type of Puzzle Square JP's liked puzzles,
  240 s budget, 3 jobs. Results are in references/psjp/proofsearch-<type>.csv;
  proof-search-analyze.ts reads them.
- **Coverage:** 134 of 300 usable: Slitherlink 36, Akari 23, Masyu 30, Simple Loop 45.
  Nurikabe was stopped at 0 of 15, since none solves by windows plus shallow splits. Many caps
  were the Mac sleeping, which stops a solve's clock and trips the guard. Run
  `proof-search-run.ts <type> 60 150 240000 420000 --retry` to redo the capped puzzles.

| | Slitherlink | Akari | Masyu | Simple Loop | pooled |
|---|---|---|---|---|---|
| best vs greedy, sum (median) | −36% | −11% | −19% | −46% | −31% |
| puzzles ≥5% cheaper | 100% | 83% | 97% | 100% | 96% |
| cheapest-only vs greedy (median) | −33% | −4% | −19% | −46% | −30% |
| search beyond cheapest-only (median, mean) | 1%, 4% | 9%, 11% | 0%, 0.5% | 0%, 0.2% | |
| greedy's peak above the min-peak | 28% | 48% | 13% | 40% | 32% |
| greedy's steps not in the best proof | 70% | 34% | 57% | 80% | 64% |

**Against people:** within-type Spearman, with bootstrap 95% intervals.

- **With site difficulty**, pooled: greedy sum 0.36, best sum 0.39 (difference +0.03, interval
  −0.05 to +0.11); greedy peak 0.44, min-peak 0.45.
- **The only reliable gain** is Simple Loop's sum, 0.18 → 0.32 (+0.14, interval 0.04 to 0.31).
  Greedy there takes 319 steps where the best proof takes 216.
- **With likes**, difficulty held fixed: no cost does better than chance, pooled or in any
  type (best − greedy −0.03, interval −0.11 to +0.05). On Masyu it is worse (−0.21, interval
  −0.47 to +0.01).

**Verdict:**

- **Go, by the letter.** Optimal proofs differ from greedy's on nearly every puzzle (31% cheaper
  pooled), so phase 1 proceeds.
- **Most of the gap isn't search.** It comes from greedy's SLACK: it takes every step within 1 of
  the cheapest, where waiting makes them cheaper. Taking only the cheapest steps closes it on its
  own.
- **Search beyond that matters on Akari only** (about 10%). Elsewhere it is 0–4%, near phase 2's
  3% stop rule.
- **Cheaper proofs don't track people better,** except Simple Loop's difficulty, and likes not
  at all. So the cost model (phase 1) is the problem, as the no-go branch put it.
- **For phase 2:** judge it against the cheapest-only path, not greedy, and start where the
  headroom is (Akari). Re-test search after phase 1's cost model v1: a better cost may open
  more room.

**Side finding:** the usual solve's totalCost double-counts. In one round, two windows can take
the same fact when its explanation was cached, so the same facts are paid twice (Akari 10041:
71 steps and 187.4 against 56 and 145.9 deduplicated). The search's paths deduplicate. The usual
path is left as it is, since its difficulty figures are built on it; fixing it is a separate
change.

## Phase 1 by compression: a learned language of moves (2026-10-15)

[research-trajectory.md](research-trajectory.md), phase 1 as revised: two-part description length
under a learned language, scored on held-out puzzles. Run beside the original phase 1 (the cost
model fit), on that run's proofs as they stood (references/proof/*.jsonl, the cheapest-only path
with shallow splits); nothing was solved again. Code: puzzles/difficulty/mdl.ts (the code and the
learner), mdl-readout.ts (against people). Results in references/proof/mdl/.

- **The code.** Atoms are the signature parts, primitive@unit (23 of them in these sets). A symbol
  is a multiset of atoms. A step is coded as how many symbols, which (given the genre, and with
  the context model the last step's first atom), where (the first place relative to the last
  step's window, the next symbol's relative to the one before, a compound's other atoms relative
  to its first under that symbol's own geometry) and the facts it decides. Every distribution is a
  Dirichlet process (prequential), so learning the parameters is paid for, and held-out bits are
  L(train + test) − L(train). A compound costs its definition once.
- **The learner.** Greedy library learning: the commonest pairs of symbols sharing a step become
  candidates; the one that most shortens train bits plus definitions is kept, until none does.
  The path step of the alternation: the steps of a round (all found from the same knowledge, so
  any order is a proof) are taken cheapest code first.
- **The corpus:** the human sets so far (Puzzle Square JP's pilot and Akari, Beast Academy), about
  720 puzzles and 50,000 steps, split in half by a hash of the puzzle. Tatham's (generated) are
  scored only.

**Held-out bits a step** (lower is better):

| | atoms | learned language | saving |
|---|---|---|---|
| solver's order, genre only | 27.93 | 27.86 | 0.3% |
| cheapest code first in a round | 27.13 | 27.06 | 0.3% |
| and the last step's atom as context | 26.62 | 26.56 | 0.2% |
| two passes of the alternation | 26.62 | 26.56 | 0.2% |
| richer atoms (the givens in a local unit, edges touched), Puzzle Square JP only | 34.05 | 33.64 | 1.2% |

- **Where the bits are** (atoms, context): places 12.7 a step, which facts 8.0, which symbols 2.9,
  how many 1.6, how many facts 1.4. The language can only touch the symbol and place terms.
- **What it learns** with plain atoms: 9 compounds, the obvious ones (an Akari number with the
  sight line through it, Simple Loop's premature-loop check with the loop). With richer atoms, 78,
  and they read as techniques: a pearl with the loop through it, by colour and edge; a Slitherlink
  3 on an edge; an Akari 1 in a corner with its line. Real, but each saves little.
- **The path and the context do more than the vocabulary:** ordering a round by code saves 2.9%,
  the last step's atom as context 1.9% more. Both belong to the context model (phase 2's policy).
- **The shape vocabulary** (each of signatures.ts's step shapes a symbol) codes worse than the
  atoms: 31.9 bits a step against 26.3, too many symbols for their geometry to be learned.

**Against people** (two folds, so each puzzle is scored by a code that never saw it; within-type
Spearman, 95% bootstrap intervals; Puzzle Square JP n 474):

| | difficulty | likes per solver, difficulty fixed |
|---|---|---|
| bits | 0.49 (0.42, 0.55) | 0.15 (0.06, 0.21) |
| "what" bits (surprise under the context model) | 0.56 (0.51, 0.63) | 0.16 (0.08, 0.22) |
| bits a step | 0.44 | 0.05 (−0.03, 0.14) |
| concentration (top two steps' share: the elegance statistic) | 0.13 | −0.04 (−0.10, 0.06) |
| step costs' sum (cost model v0) | 0.48 | 0.12 (0.02, 0.19) |
| step costs' peak | 0.53 | 0.08 |
| step count | 0.33 | 0.13 (0.04, 0.19) |

- **Likes:** the code's 0.15 is length: the step count alone gets 0.13 and bits a step 0.05. On
  this set the old costs get 0.12 too, so −0.15 (path features, Fable's 72) is not the bar here.
- **Fable's interest placing** (55 solved of the 72; it agrees with likes at 0.36): the
  concentration statistic runs the other way, −0.49 (−0.68, −0.18). Fable rates puzzles whose
  bits are spread out as more interesting. Opus's (291): −0.14.
- **Difficulty elsewhere:** Tatham's grade, "what" bits a step 0.63 against the peak cost's 0.61;
  Beast Academy's tier, bits 0.47 against the cost sum's 0.36. The same with richer atoms.
- **The cheap early check** (frequency prices against the learned step prices, Spearman over
  Tatham's steps): Loopy 0.51, Akari 0.35, Sudoku 0.21, Singles 0.15 (0.60 with all the bits).
  Partly the same quantity, not a replacement.

**Verdict at the time: no-go, by the stop rule. Withdrawn the same evening (below): the code, not the vocabulary, decided it.**

- **No language beats the atoms on held-out bits by a margin:** 0.2–0.3%, 1.2% with richer atoms.
  The proofs' bits are in where and what is decided, not in which compound of rules was used.
- **No readout beats the old costs against likes** once length is taken out, and the elegance
  statistic is flat against likes and reversed against Fable.
- **What survives:** "what" bits are a little better than the step costs on difficulty (0.56 against
  0.48–0.53), with no hand-set prices; the order within a round and the context carry real
  structure (5%), which is the policy's job, not the vocabulary's.
- **So, as the trajectory says:** elegance isn't recoverable from this vocabulary, and the
  human-like branch moves up. The expert-weighting mixture and the Fable analyst runs were not
  started: with a language this flat there is nothing for the classes to differ on.
- **Data (checked after, at about 1,000 puzzles):** with plain atoms the saving is flat in train
  size (0.33%, 0.35%, 0.36% at 130, 250, 520 train puzzles), so more proofs won't change it. With
  richer atoms it is still climbing, about 0.3–0.4 points a doubling (1.15%, 1.40%, 1.83% at 120,
  240, 480; 71, 100, 114 compounds), so that verdict is data-limited: on that trend 40,000 puzzles
  would give a few percent. The ceiling for any vocabulary is the symbol terms, about 17% of the
  bits. `mdl.ts fit --frac 0.25` trains on a share of the train half.
- **What would reopen it:** atoms coded after their place (the givens free, since the decoder has
  the puzzle), a context model over the full choice set (the graph network), and the Janko sets
  when the original phase 1 reaches them. Rerun with
  `node --no-warnings puzzles/difficulty/mdl.ts fit --greedy --ctx [--rich]` and
  `mdl-readout.ts [--rich]`; both take seconds.

### Phase 1, continued (2026-10-15, evening): the full corpus, Fable's review, code v2

**Proofs at scale.** proof-bulk.ts over the human corpus (39,467 puzzles; Nurikabe left out),
686 on the Mac, then a spot CPU fleet (puzzles/cloud/run-proof-job.sh, 6 × n2-highcpu-32, about
$8; one VM reclaimed and relaunched): 35,123 proofs in references/proof-bulk/ (local), about
2 million steps. 70% of steps are tier 0, 17% tier 1, 13% case splits (in 54% of puzzles); 51%
of puzzles fully solved, the rest partial proofs.

**The learning curve on it** (held-out saving over the atoms, greedy order and context, old code;
train puzzles from the train half of 26,829 with proofs; mdl.ts `--frac`):

| train puzzles | 430 | 1,600 | 6,500 | 13,000 |
|---|---|---|---|---|
| plain atoms | 0.36% (12 compounds) | 0.38% (13) | 0.47% (20) | 0.53% (28) |
| richer atoms | 1.49% (112) | 1.89% (183) | 2.18% (200) | 2.20% (200) |

The two largest richer runs stopped at the learner's 200-symbol cap (`--max`), so their flattening
is partly that. Log: references/proof/mdl/curve-full.log.

**Fable's review** (one call, $0.63; prompt and answer in references/proof/mdl/fable/; the answer
also in the project files as fable-on-higher-order-symbols.md):

- **The no-go was the code's.** 83% of the bits were in terms no vocabulary can reach, and two of
  them pay for what the decoder has: the facts a step decides follow from its explanation and the
  state, and the clue values in the richer atoms come with the puzzle (why richer atoms coded
  longer, 34 bits a step against 27). The symbol term was near its entropy already. Add to every
  MDL gate an audit of the share of bits the language could reach.
- **The code should be a choice from the menu:** the decoder has the puzzle and the state; a step
  is one of the steps available; a symbol is an executable predicate over (state, candidate step)
  with free variables, coded as −log P(symbol | context) + log2 of the matching candidates under a
  locality prior. That is a policy's output, so phase 1's language and phase 2's network are one
  object.
- **Techniques are bindings and chains,** not multisets of one step's rules: the 5% from order and
  context was the signal.
- **Ranking:** library learning with variables (Stitch, anti-unification) over step programs,
  extended to 2–4 chained steps; the next-step network as the ceiling and context model (the
  sparse-autoencoder reading later, if a gap remains); grammar induction as a screen; embeddings
  for choosing contrasts only; contrast batches for naming only.
- **Validation:** Sudoku's published technique list (any method must rediscover naked and hidden
  singles and pairs), and the Janko solve orders, not likes.

**The user's correction, adopted:** the proofs are the solver's, cheapest-first over the whole
board, not a person's chains, so a network that imitates them learns the solver. So: learn the
menu (what's available: machine-checkable, no style) from the solver, and the choice from people
(the 5,200 Janko puzzles with recorded orders; Maia's lesson); where there is no human order, the
target is the shortest-code path, not the cheapest-only one; case splits stay out of the
vocabulary. The Janko check moves to the first test.

**Menus along people's solves.** deduce.ts Options.menus (at each position, every step every
stage's windows find, none taken); human-menus.ts (8 positions a solve, the person's next 3 moves
looked up in the menu), run on a fleet (PROOF_JOB=menus; resumed after the first 3-hour limit).
First 655 puzzles (Akari, Easy as ABC; human-choice.ts, a conditional logit fitted on half the
puzzles, bits a move on the other half):

| | moves | not on the menu | uniform | price | nearness | both |
|---|---|---|---|---|---|---|
| Akari | 8,418 | 25% | 4.39 | 4.35 | 3.86 | 3.84 |
| Easy as ABC | 1,677 | 31% | 4.23 | 4.10 | 4.03 | 3.87 |

People's next move is predicted by nearness to their last move far more than by the solver's
price (rank among the choices: 0.15 and 0.21 by distance, 0.38 and 0.30 by price, 0.50 chance).

**Missed moves** (human-misses.ts; deduce.ts Options.from, until and closure): each move the menu
didn't have, followed from the person's position with every window deduction each round and no
splits, sorted as bookkeeping the recording leaves out (2–3 rounds, the chain all "no" facts), a
chain the person ran in their head (2–3 rounds otherwise: a phrase), further, or not without a
split (a missing technique or a guess). Results below.

### Phase 1 v2: the verdict (2026-10-20)

Run in the cloud thread "Phase 1b: learned move language, cloud" (branch claude/project-thread-i5qxx5).
Full tables: /mnt/project-files/research/phase1b-human-choice-2026-10-20.md.

**A bug, fixed before these numbers.** deduce.ts's `Options.menus` re-checks only windows whose
marks changed since the last position, and dropped the rest, so every menu after a solve's first
listed only what changed near the last position (three listings of the same position gave 26,
0, 0 items). Fixed 2026-10-20 (a skipped window keeps what it found, each fact listed once a
stage), and every menus run redone: people's solves on 2 × n2-standard-32 (run
menus-fixed-20261020), the solver's proofs on 2 more (solver-menus-fixed-20261020), about $5
together, and the network's test puzzles locally. The verdict below held; the numbers moved by a
few points. Nothing else used `Options.menus` (the Opus checks and the digit fix did not).

**Data.** Menus along people's solves: 2,998 puzzles of Akari, Easy as ABC, Hidoku, Hitori, Masyu
and Minesweeper, 4 positions each, with the `known` flag (marks the puzzle settles itself; rows
before 2026-10-16 lacked it, and Easy as ABC's 31% of moves off the menu was mostly those: really
2%). proof-menus.ts lists the menu at 16 points along the solver's own proofs (1,816 proofs, every
type). The human corpus leaves out the network's test puzzles, so every corpus puzzle with menus
is on the tuned network's training side; human-test-corpus.ts rebuilt its test puzzles from
Janko's files (714 of these six types) and their menus were listed locally.

**People's moves off the menu** (human-misses.ts, up to 150 a type): Akari and Masyu about two
thirds bookkeeping or a 2–3 step chain, Easy as ABC 76% chains; Hitori 93% and Hidoku 85% need a
case split (Numberlink 91% on the earlier, smaller sample), so the solver lacks techniques people
use there (connectivity in Hitori is the likely one). Fillomino's menus mostly fail (34 of 769
puzzles), so it was left out of the rerun.

**Code v2** (code-v2.ts): each solver step coded as a choice from its menu, facts, clues and
place free. A step costs 1–4 bits where the old code charged about 27, and every bit is within a
vocabulary's reach (against 17%): Fable's diagnosis of the old no-go holds. The solver's own kinds
of step are a poor vocabulary alone, and add nothing once its price is in; the price carries
25–50% of the bits (it takes the cheapest first).

**Library learning over step programs** (library.ts: a step as slots, the rules on their units,
the facts' values, kinds of mark, window size, stage, clue values, place from the last move, the
last move's kind, open marks in its rule instances, settled neighbours, reading order; an
abstraction fixes some slots; the library a mixture learned greedily, held-out bits). On the
solver's steps 12–34% (0% on the split-heavy region types), nearly all "stage 0", its own policy.
On people's moves 0–6% beyond the nearness prior, with generic abstractions; each added slot
alone is a real null.

**The network as the ceiling** (net_ceiling.py; human-tuned-2026-10-20 on its own test puzzles,
same moves and choices), bits a move held out, and **what reads it off** (net_probe.py: a
conditional logit on price, kind of step and board features, with nearness):

| type | moves | near | network+near | library | readable model | network's gain recovered |
|---|---|---|---|---|---|---|
| Akari | 1,515 | 3.11 | 2.41 | 3.08 | 2.98 | 19% |
| Easy as ABC | 633 | 4.47 | 4.47 (fails on digits) | 4.36 | 3.44 | (beats the network by 23%) |
| Hitori | 2,553 | 3.67 | 3.09 | 3.46 | 3.07 | 103% |
| Masyu | 1,642 | 3.52 | 3.25 | 3.52 | 3.44 | 30% |
| Minesweeper | 395 | 2.10 | 1.84 | 2.10 | 1.93 | 65% |

**Verdict.** Fable's stop rule doesn't fire (the network beats nearness by 8–23%), but what it finds
isn't a vocabulary. People's next move at the solver's grain is a graded policy: near the last
move, the easiest step (the solver's price), and some kinds of step before others (Akari: number
clues before light lines). Hard predicates (library.ts, and Stitch-style abstraction in general)
code graded preferences badly, which is why library learning found 0–6%. The weighted model
recovers all of the network's gain on Hitori and two thirds on Minesweeper, a fifth to a third on
Akari and Masyu; Akari's remaining four fifths is unexplained. The technique gap that does show is
the other way round: moves people make that the solver can't make without a split (Hitori, Hidoku,
Numberlink).

### Step 2: difficulty from the human model (2026-10-21)

The reassessed trajectory's decisive test. A simulated person (deduce.ts `Options.simulate`)
solves each rated puzzle from the start: each move samples a mark from everything every stage's
windows find, under the human move model (human-model.ts → human-model.json: the conditional logit
on price, distance from the last move, log of the steps deciding the mark, and kind of step,
fitted per type on the menus along Janko's solves; a generic model without kinds, pooled, for
types with no recordings), and takes the cheapest step deciding it; an empty menu takes the
solver's case split, or its search. sim-difficulty.ts runs two simulated people a puzzle on every
rated Puzzle Square JP puzzle of Akari, Masyu, Slitherlink, Simple Loop and Hitori (1,523) and
Tatham's graded Light Up, Singles and Loopy (920), beside the solver's own solve (run
sim-20261021: 3 × n2-standard-32, 47 minutes, about $4). Rows: references/sim-difficulty/,
gs://inkit-research-ml/results/sim-20261021/.

Spearman with the rating within type (psjp pooled n-weighted; paired bootstrap of the difference
from the solver's estimate):

| | simulated solve's step costs, summed | solver's estimate | solver's peak step | both, ranks averaged |
|---|---|---|---|---|
| Puzzle Square JP | 0.56 (+0.05, 0.005 to 0.09) | 0.51 | 0.51 | 0.61 (+0.10, 0.07 to 0.12) |
| Akari (519) | 0.52 | 0.71 | 0.70 | 0.67 |
| Masyu (618) | 0.53 | 0.32 | 0.40 | 0.53 |
| Slitherlink (272, generic model) | 0.61 | 0.48 | 0.36 | 0.59 |
| Simple Loop (79, generic model) | 0.74 | 0.68 | 0.60 | 0.76 |
| Hitori (29) | 0.70 | 0.64 | 0.49 | 0.68 |
| Tatham | 0.49 (−0.15, −0.20 to −0.09) | 0.64 | 0.61 | 0.63 (−0.01) |
| Light Up (360) | 0.51–0.55 | 0.85 | 0.84–0.86 | 0.76–0.78 |
| Loopy (320, generic model) | 0.40–0.41 | 0.37–0.43 | 0.35–0.39 | 0.44–0.48 |
| Singles (240) | 0.51–0.56 | 0.60–0.65 | 0.53–0.57 | 0.62–0.63 |

- **Against the bar** ("what" bits 0.56, the step costs' peak 0.53 on Puzzle Square JP): the
  simulated cost alone ties it (0.56) and beats the solver on the same puzzles by 0.05; with the
  solver's estimate, ranks averaged and nothing fitted, 0.61. It wins on the loop types and Masyu,
  where the solver's price is weakest, and loses on Akari and on Tatham's grades, which are
  defined by the techniques his own solver needs (the proof cost mirrors that).
- **Why Akari loses:** the Akari model's price weight is near zero (people there choose by
  nearness and kind of step, not by how easy a step is), so the sum over a sampled path is mostly
  path noise; the peak of the solver's path is what tracks the rating.
- **The model's own bits don't measure difficulty:** the entropy and surprisal of the choices run
  the wrong way (−0.07 pooled; hard puzzles offer fewer moves). The log-partition (how unattractive
  the best options are) does carry signal: 0.63 on Tatham's Loopy against 0.37–0.43, 0.47 on Masyu.
  Chosen after seeing the table, so it's a lead, not a result.
- **Verdict:** the human model's cost doesn't replace the proof cost, and the proof cost doesn't
  replace it: each wins where the other is weak, and together they clear the bar on Puzzle Square
  JP (0.61). So the minimum proof stays as one input, not the definition of difficulty. Next: a
  difficulty model fitted on both (held-out), the log-partition checked on fresh puzzles, and a
  price-aware Akari model (people's moves, and the peak of what they needed).

### Step 3: the missing techniques (2026-10-21)

Write-up: research/step3-missing-techniques-2026-10-21.md (project files). On the 196 hand-made
puzzles the solver stalled on, with Options.finish (each genre's techniques, unpriced, off by
default): 170 finish by 300 s (was 139), 76 by 60 s (was 55). Numberlink 15 of 16 (was 3), from two
new techniques, `routes` (where each pair's line can run; routes.ts) and `unique` (what one answer
rules out: no bend round a 2 × 2, no line beside or round its empty cells, no line touching itself;
kept out of the generator's bands). Hidoku 14 of 16 (was 0): its rounds were spent explaining
thousands of eliminations; technique facts now skip clingo and explanations run in smaller
batches (12 rounds in 67 s where it did 3–5 in 300 s), with every example's estimate unchanged.
Fillomino 11 (was 7) from sizes and shapes. Still stuck: Nurikabe and Spiral Galaxies.

Not on by default: Hitori's component lemma flattens Tatham's Singles as priced (0.71/0.80 to
0.58/0.44); citing the group's cells fixes Singles (0.70/0.84) but Puzzle Square JP Hitori still
falls (0.66 to 0.40). Next: refit the step prices with the techniques on, and with complete
explanations (trying the rules near a fact first gives much cheaper sets than the window-wide
reuse does now: Sudoku 2's hardest step 5.9 to 3.7).

### Step 2, continued: one difficulty model fitted on both (2026-10-21)

sim_fit.py fits one ridge regression on the same rows. The features are the simulated person's solve
(step costs summed and peak, the human model's entropy, surprisal and log-partition, distance, steps,
splits; the mean of the two samples) and the solver's (estimate, step costs summed and peak, steps,
splits). Each is log-scaled and standardised within its type, the rating is ranked within its type,
and one model covers every type. Held out two ways: half the puzzles of every type by hash, and a
whole game left out (both of its sizes). Spearman within type on held-out puzzles:

| | solver's estimate | simulated cost | ranks averaged | fitted: solver only | fitted: sim only | fitted: both | both, game held out |
|---|---|---|---|---|---|---|---|
| Puzzle Square JP (1,517) | 0.51 | 0.55 | 0.60 | 0.62 | 0.64 | **0.65** | 0.63 |
| Akari (519) | 0.71 | 0.52 | 0.67 | 0.70 | 0.66 | 0.71 | 0.72 |
| Masyu (618) | 0.32 | 0.53 | 0.53 | 0.57 | 0.64 | 0.61 | 0.58 |
| Slitherlink (272) | 0.48 | 0.61 | 0.59 | 0.54 | 0.59 | 0.59 | 0.57 |
| Simple Loop (79) | 0.68 | 0.74 | 0.76 | 0.72 | 0.77 | 0.77 | 0.77 |
| Hitori (29) | 0.64 | 0.70 | 0.68 | 0.55 | 0.58 | 0.59 | 0.60 |
| Tatham (920) | 0.64 | 0.49 | 0.62 | 0.67 | 0.61 | **0.69** | 0.67 |
| Light Up (360) | 0.85 | 0.51–0.55 | 0.76–0.78 | 0.83 | 0.64–0.71 | 0.81–0.84 | 0.81–0.85 |
| Loopy (320) | 0.37–0.43 | 0.40–0.41 | 0.44–0.48 | 0.48–0.57 | 0.56–0.58 | 0.55–0.62 | 0.52–0.55 |
| Singles (240) | 0.60–0.65 | 0.51–0.56 | 0.62–0.63 | 0.61–0.63 | 0.54–0.59 | 0.59–0.64 | 0.57–0.62 |

(Easy as ABC is left out: fewer than 20 puzzles. The ridge strength barely matters: 0.1 to 50 moves
the pooled figures by 0.01 or 0.02.)

- **Against the bar:** the model fitted on both clears it held out: 0.65 on Puzzle Square JP (0.63
  with the whole game unseen), against 0.53–0.56 and the solver's 0.51. On Tatham it reaches 0.69
  against the solver's 0.64. It is the best or near best on every type, so it doesn't trade
  Akari for Masyu as the unfitted ranks did.
- **What the simulation adds:** less than the headline suggests. Most of the gain is the fit
  itself: the solver's own features, weighted, already reach 0.62 (Masyu 0.32 → 0.57; its peak and
  step count carry what the estimate loses). Adding the simulated person gives +0.03 on Puzzle
  Square JP (paired bootstrap 0.025 to 0.045) and +0.02 on Tatham (0.00 to 0.04). These intervals
  resample puzzles, not the fit, so they're narrower than the truth. The gain sits on the loop
  types (Masyu, Slitherlink, Simple Loop, Loopy), where the simulated person alone beats the
  solver's features alone. On Akari, Light Up and Singles the solver's features are all it needs.
- **Weights** (fitted on everything): the solver's peak and summed step cost (+0.08 each), the
  simulated cost summed (+0.06), the solver's steps (−0.06), then the simulated surprisal (−0.04),
  distance (+0.04) and log-partition (+0.02). Saved as puzzles/difficulty/sim-fit.json.
- **Verdict:** a usable difficulty score now exists: about 0.65 within type on held-out puzzles, a
  clear step past the 0.53–0.56 bar. The simulated person earns a place on loop types and adds
  little elsewhere. Caveats: one rating source a set; and only five Puzzle Square JP types and three
  Tatham games, so "game held out" means generalising from at most seven others. Next: test the
  score on fresh puzzles of a type outside these (puzz.link ratings), and inkit's own solve logs
  once there are enough of them.

### Step 2, continued: the fitted model on new games and new raters (2026-10-21)

The model fitted on both, frozen as it was fitted on the eight games above, was scored on puzzles
it never saw (run sim-new2-20261021, 3 × n2-standard-32 for 2 hours, about $10 with a first launch
stopped at 12 minutes; 82% of 2,319 puzzles finished before the cap, a random slice of each type
because the run's order is hashed). There were three tests. The first was 8 more Puzzle Square JP
games (Numberlink was dropped after 60 puzzles: the simulated person stalls there). The second was
Tatham's Solo at five grades. The third was puzz.link's player ratings (1 to 5, from 5+ solves),
up to 100 puzzles a game, leaving out every puzzle Puzzle Square JP also rates. New games use the
generic human model (no recorded solves). Spearman within type, n-weighted; "solves finish" keeps
the types where both solves finish 80%+ of the time:

| | n | solver's estimate | simulated cost | fitted: solver only | fitted: sim only | fitted: both |
|---|---|---|---|---|---|---|
| Puzzle Square JP, new games (8) | 422 | 0.41 | 0.04 | 0.23 | 0.09 | 0.18 |
| … solves finish (Shikaku, Skyscrapers, Sudoku) | 144 | 0.59 | 0.30 | 0.61 | 0.41 | 0.60 |
| Tatham Solo (5 grades) | 266 | 0.80 | 0.34 | 0.80 | 0.46 | 0.75 |
| puzz.link, the fitted games (new raters) | 414 | 0.41 | 0.43 | 0.46 | 0.47 | 0.46 |
| puzz.link, new games (11) | 621 | 0.46 | 0.29 | 0.42 | 0.30 | 0.35 |
| … solves finish (6) | 391 | 0.56 | 0.40 | 0.54 | 0.39 | 0.50 |

Per type: `python3 puzzles/difficulty/sim_fit.py --new`. Rows in references/sim-difficulty/ and
gs://inkit-research-ml/results/sim-new2-20261021/gathered.

- **On new games, the fitted model doesn't transfer.** The solver's plain estimate is as good or
  better everywhere: 0.59 against 0.60 on the Puzzle Square JP games that finish, 0.80 against
  0.75 on Solo, 0.56 against 0.50 on puzz.link's. The simulated person's cost with the generic
  model is weak on new games (0.30–0.41), and the fit leans on it for the loop types it was fitted
  on. So the 0.63 "game held out" figure was optimistic: those held-out games were siblings (loop
  games among loop games).
- **On the same games with new raters, the gain holds but is small.** puzz.link's players on Akari,
  Masyu, Slitherlink, Simple Loop and Hitori: fitted 0.46, simulated cost alone 0.43, solver 0.41.
  puzz.link's five-level ratings agree with Puzzle Square JP's only 0.63 on shared puzzles, which
  caps what any score can reach here.
- **Where the solves stall, nothing measures difficulty.** Nurikabe (13% of puzzles finish both
  solves), Spiral Galaxies (14–23%), Numberlink (26%) and Fillomino (9 of 74 usable) give
  near-zero or negative agreement for every score, because a cut-off solve's cost is a floor. This
  is the solver bottleneck already known on region games, not a difficulty finding.
- **Verdict:** the fitted score is good on the games it was fitted on, with a real gain from the
  simulated person on loop games, and is not a general difficulty score. For a new game, the
  solver's estimate is the better default until that game has recorded human moves. Next, in
  order: fit per genre family (loop, number, region) rather than one model, and test whether a
  game's own human model (not the generic one) is what carries the sim's gain. That needs Janko
  recordings for the new games, which exist for Sudoku, Nurikabe, Shikaku and others. Region games
  wait on the solver.

### Rewards as policies: a first look (2026-10-21)

Question (thread "Where RL could help us"): different rewards should give different solvers; what
does each reward's best policy do? The rules are an exact simulator, so no RL is needed to see it:
reward-compare.ts runs each reward's greedy policy over the solver's menu (deduce.ts
`Options.simulate` with `pick: "max"`, `score`, `noSplits`). Policies: cheapest step (forced marks,
easiest first; deductions only grow, so also the lowest-peak path), the same with no case splits,
nearest step to the last move, the human model's likeliest move (human-model.json's step logit,
not the tuned network), and a sampled person. The trial on the 17 example puzzles in src/games came
first; the full run on Janko's and Puzzle Square JP's puzzles is below it.

Trial, 17 example puzzles (7 types):

| policy | solved | settled | steps | splits | cost sum | cost peak | distance a move | bits a move (human model) |
|---|---|---|---|---|---|---|---|---|
| cheapest | 94% | 99% | 29.8 | 4.1 | 114 | 7.4 | 1.44 | 2.10 |
| no splits | 47% | 72% | 19.9 | 0 | 61 | 4.1 | 1.47 | 2.23 |
| nearest | 94% | 100% | 30.4 | 4.1 | 131 | 8.6 | 0.94 | 2.13 |
| human, likeliest | 94% | 100% | 29.5 | 4.1 | 118 | 7.8 | 1.21 | 1.71 |
| human, sampled | 94% | 100% | 28.9 | 4.1 | 122 | 8.7 | 1.61 | 2.29 |

- Cheapest-first has the lowest peak (7.4 against 8.6–8.7), as it must, but not the lowest sum on
  Slitherlink and Star Battle, where the human model's likeliest path is cheaper overall (160 vs
  169, 67 vs 73): easiest-step-first is not cheapest-proof-first.
- Nearness buys 35% less travel for 15% more cost and a higher peak.
- No splits stalls on half the puzzles (Akari, Hitori, Masyu, Nurikabe), at 72% settled: the share
  a pure-logic reward would have to learn new technique to finish.
- Bits are scored by the human model itself, so "human, likeliest" wins them by construction.

**Full run** (Cloud Batch reward-janko-20261021 and reward-psjp-20261021, 12 × n2-standard-8 spot,
62 slot-hours, about $1–2; rows in gs://inkit-research-ml/data/reward-*-20261021/; tables from
`reward-compare.ts report`). 20 puzzles a
type: Janko's 14 types (up to 10 wide; 280 puzzles), Puzzle Square JP's 17 rated types (314). Each
policy gets 120 s; 9–13% of runs capped and 1–2% errored, and those are left out of the means.

| set | policy | solved | settled | steps | splits | cost sum | cost peak | distance | bits | rho with person |
|---|---|---|---|---|---|---|---|---|---|---|
| Janko | cheapest | 59% | 90% | 44.5 | 5.0 | 176 | 7.6 | 1.62 | 3.22 | 0.40 |
| Janko | no splits | 30% | 66% | 32.2 | 0 | 100 | 3.8 | 1.60 | 3.26 | 0.33 |
| Janko | nearest | 59% | 92% | 43.8 | 5.0 | 205 | 8.8 | 0.74 | 3.11 | 0.37 |
| Janko | human, likeliest | 59% | 92% | 44.4 | 5.1 | 191 | 8.1 | 0.99 | 2.70 | 0.39 |
| Janko | human, sampled | 60% | 98% | 40.3 | 5.2 | 185 | 9.3 | 1.57 | 3.34 | 0.37 |
| PSJP | cheapest | 64% | 89% | 64.4 | 12.9 | 238 | 7.8 | 1.76 | 3.07 | |
| PSJP | no splits | 27% | 62% | 39.5 | 0 | 123 | 4.3 | 1.73 | 3.18 | |
| PSJP | nearest | 65% | 92% | 64.5 | 12.8 | 274 | 8.8 | 0.83 | 2.87 | |
| PSJP | human, likeliest | 66% | 93% | 64.5 | 12.8 | 252 | 8.2 | 1.06 | 2.53 | |
| PSJP | human, sampled | 67% | 97% | 61.2 | 12.8 | 251 | 9.1 | 1.69 | 3.21 | |

- **Agreement with the person's order (Janko):** no reward's policy beats cheapest-first. On the
  168 puzzles where every policy finished, paired against cheapest (bootstrap 95%): human likeliest
  −0.01 (−0.05, +0.03), sampled −0.02 (−0.08, +0.03), nearest −0.04 (−0.09, +0.01), no splits −0.06
  (−0.09, −0.03). Nearness, which the human model weights most, makes the order no more human; it
  helps on Masyu and Slitherlink (0.49 and 0.44 against 0.44 and 0.36) and hurts on Star Battle,
  Easy as ABC and Minesweeper. Per type the spread is large: Minesweeper 0.68, Akari 0.61, Hitori
  0.60, but Nonogram 0.05 and Skyscrapers 0.06 for every policy, where the solver's step order
  itself is unlike people's. Rho is a whole-order measure; the human network's 45% top-3 on the
  next move (PR #2) is the sharper test and isn't contradicted by this.
- **Against the ratings (PSJP, mean within-type Spearman):** over all puzzles the costs barely
  track the rating (cost peak 0.20–0.26, cost sum 0.08–0.10), far below step 2's 0.55. The cause is
  the 120 s budget: a harder puzzle is less often finished (rating vs solved −0.40 to −0.46 for every
  policy), and an unfinished path has a short, cheap sum. On the puzzles each policy finished, cost
  sum is back to 0.45–0.55 and peak 0.41–0.58, step 2's level, with no policy clearly ahead (the
  sampled person highest on sum at 0.55, on the most types, 13). Solved rates by type: Masyu,
  Shikaku, Slitherlink, Cave, Hitori 18–20 of 20; Nonogram, Star Battle, Sudoku, Spiral Galaxies,
  Numberlink, Nurikabe 1–3 of 20 (as in the solver-speed doc).
- **How far pure logic gets is a difficulty signal.** The share no splits settles falls with the
  rating (−0.34 over 17 types; the other policies −0.06 to −0.24), the strongest single readout over
  all puzzles, and it is defined on
  every puzzle, including the ones the solver can't finish. It belongs among the stall features of
  the fitted difficulty model.
- **Verdict:** the reward changes the path (nearness cuts travel 50%, no splits stops at two
  thirds) but not how human the order is, and not how well the cost tracks the rating. Greedy
  rewards over the solver's own menu don't add a new solver; what's missing is in the menu (the
  deductions), as the frontier and solver-speed results said. Not worth a learned-RL version.

### Open models as human-move predictors (2026-10-21)

Can a small open-weight model stand in for Opus at predicting people's next move? Same 400
held-out Janko states and prompt as the Opus test (14 types, `opus-human.ts open`, OpenRouter,
one move per state), each in two text formats: `grid` (the drawing Opus saw) and `listed` (the
marks as a list of relations). Hit = the model's move is among the person's next 3.

| Model, format | in next 3 | ordinary | stuck | digit types | other types | top-1 | correct | answered | cost |
|---|---|---|---|---|---|---|---|---|---|
| Opus 5.5 (grid, PR #1) | **38%** | 39% | 33% | 67% | 30% | 23% | 98% | 100% | $15.43 |
| Tuned network (PR #2/#3) | **45–49%** | 50% | 27% | 40% | 46% | 27% | 86% | 100% | — |
| Gemma 4 31B, grid | 21% | 22% | 16% | 46% | 14% | 12% | 79% | 98% | $0.32 |
| Gemma 4 31B, listed | 26% | 27% | 22% | 45% | 21% | 15% | 83% | 99% | $0.41 |
| Qwen3.8 27B (low effort), grid | 22% | 24% | 15% | 54% | 13% | 14% | 57% | 61% | $8.97 |
| Qwen3.8 27B (low effort), listed | 27% | 30% | 17% | 46% | 22% | 16% | 75% | 79% | $6.61 |
| Qwen3.5 9B | — | | | | | | | 0 of 20 | $0.11 |

(95% intervals are about ±4–5 points overall, ±9 on stuck and digit states; tuned-network row is
PR #2's tuned model, with relations-tuned's 49% mean over types from PR #3.)

- **Open models fall well short of Opus:** best is 26–27% against Opus 38% and the network's 45%.
  Both are below Opus on every split, and below the network everywhere except digit types, where
  they get 45–54% against the PR #2 network's 40% (relations-tuned closed most of that gap: Hidoku
  10% → 56.5%).
- **Listed beats grid by about 5 points** for both models, all of it on non-digit types (Gemma
  14% → 21%, Qwen 13% → 22%). Small models misread the drawing; the relation list helps them.
- **Qwen 27B is capable but runs out of room.** On the states where it answered, it hits 34–36%,
  close to Opus, but it ran past the 16k-token limit on 36% (grid) and 20% (listed) of states, and
  the answered ones are probably the easier ones. At medium effort it answered more (pilot 17 of
  19) but cost ~$0.03 a call, over the budget for the full run.
- **Qwen 9B never answered:** 0 of 20 in four settings (default thinking, medium with 32k tokens,
  low, thinking off). It loops through the same checks until the limit.
- **Correctness is the bigger gap.** Gemma's moves are right 79–83% of the time, Qwen's 75% when
  listed, against Opus 98%. A wrong move can't be a human move, so a solver filter would help them,
  as it does the network.
- **Verdict:** none is a cheap substitute for Opus labels, and none approaches the tuned network,
  which stays the human-like parent. If open labels are wanted for digit types (Qwen 54% on grid
  digit states), Qwen 27B at medium effort in the listed format is the one to try; it would cost
  about $10 per 400 states. Total spend: $17.66 including pilots.

### The logic-settled share as a difficulty feature (2026-10-21)

The rewards comparison found that the share of a puzzle logic without case splits settles falls
with the rating. Is it a feature for the fitted difficulty model? `sim-difficulty.ts logic` runs
the no-split policy (cheapest step, stop at an empty menu) on the 4,468 puzzles with sim rows and
records the share of the marks open at the start that it settles (run sim-logic-20261021, 4 ×
n2-standard-32 spot, 40 minutes). Sudoku, Solo, Star Battle, Spiral Galaxies, Nonogram and
Skyscrapers mostly hit the 120 s budget (Solo all 266, after about 24 steps), so the share there
measured speed, not logic; they were rerun at 600 s (sim-logic-long-20261021, 50 minutes; Solo
and puzz.link Sudoku now finish 99–100%, Galaxies and Nonogram still cap 27–45%). Both runs cost
about $2. Rows: references/sim-logic/, references/sim-logic-long/ (which replaces the first
where present), gs://inkit-research-ml/results/sim-logic*-20261021/gathered.
`python3 puzzles/difficulty/sim_fit.py --new --logic`.

| | n | solver's estimate | fitted: solver only | fitted: both (solver + sim) | fitted: solver + logic | fitted: both + logic |
|---|---|---|---|---|---|---|
| Puzzle Square JP, fitted games (half held out) | 1,517 | 0.51 | 0.62 | 0.65 | 0.65 | 0.66 |
| Tatham, fitted games (half held out) | 920 | 0.64 | 0.67 | 0.69 | 0.68 | 0.69 |
| Puzzle Square JP, new games (8) | 421 | 0.41 | 0.24 | 0.19 | 0.32 | 0.23 |
| … solves finish (Shikaku, Skyscrapers, Sudoku) | 144 | 0.59 | 0.61 | 0.60 | 0.65 | 0.61 |
| Tatham Solo | 266 | 0.80 | 0.80 | 0.75 | 0.80 | 0.76 |
| puzz.link, the fitted games (new raters) | 414 | 0.41 | 0.46 | 0.46 | 0.50 | 0.48 |
| puzz.link, new games (11) | 617 | 0.48 | 0.43 | 0.36 | 0.44 | 0.38 |
| … solves finish (6) | 387 | 0.58 | 0.57 | 0.52 | 0.57 | 0.53 |

- **Beyond the solver's features: a little, on Puzzle Square JP only.** Solver + logic over solver
  alone: +0.032 (95% 0.018 to 0.045) on Puzzle Square JP, +0.006 (−0.001 to 0.014) on Tatham.
  Over solver + sim: +0.013 (0.005 to 0.021) and +0.001. Most of it is Masyu (0.57 to 0.65). The
  solver's features explain 57–63% of the share's variance on the fitted games (it tracks the
  solver's split count, −0.79 and −0.95), and what's left correlates −0.16 with the rating on
  Puzzle Square JP and +0.08 on Tatham. It does about what the simulated person did (+0.034), with
  one no-split pass instead of two human-model solves.
- **On new games it transfers better than the simulated person did, but doesn't beat the solver's
  estimate.** Solver + logic is the best fitted column on every new set: 0.32 against 0.19 for
  solver + sim on Puzzle Square JP's new games, 0.80 against 0.75 on Solo, 0.44 against 0.36 on
  puzz.link's. Where solves finish it matches or beats the plain solver estimate (0.65 against 0.59
  on Puzzle Square JP, 0.80 = 0.80 on Solo, 0.57 against 0.58 on puzz.link), and it gives the best
  score yet on puzz.link's new raters (0.50 against 0.41). Over all new games the plain estimate
  still wins (0.41, 0.48), because every fitted model goes negative on Numberlink and Nurikabe.
- **It does not rescue unfinished or region puzzles.** On the puzzles whose solves don't finish, the
  share agrees with the rating 0.02 (Puzzle Square JP, 285 puzzles) and −0.10 (puzz.link, 146).
  By type it is mixed in sign: Masyu +0.34 and Slitherlink +0.29, but Spiral Galaxies −0.24 to
  −0.41 and Nurikabe −0.31 to +0.06. Numberlink settles 0% on every puzzle, so it has nothing to
  say. On region games no-split logic barely starts (median share 0–15% on Nurikabe, Galaxies,
  Shikaku, Fillomino), so the share is a floor, the same problem as the costs.
- **Verdict:** keep it, as a cheap feature, not a new direction. Solver + logic should replace
  solver + sim as the fitted score: as good on the fitted games, better on new ones, and it drops
  the human model from the difficulty path. The plain solver estimate stays the default on games
  where solves stall. Region games still wait on the solver's missing techniques (step 3), not on
  a better feature.
- **Done (Josh agreed 2026-10-21):** puzzles/difficulty/sim-fit.json is now the solver + logic model
  (`sim_fit.py --logic --save`): solver estimate +0.04, cost sum +0.13, peak +0.05, steps −0.08,
  splits −0.02, logic share −0.06, on features standardised within type.
