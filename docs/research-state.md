# Research: where things stand

> **Start here:** this file holds the results, open questions, sequence and queue;
> [research-ops.md](research-ops.md) holds what's running and how to check it, the cloud runbook,
> spending, what needs the user's approval, and the working rules. Read both before continuing.


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
| Do Janko's recordings hold solve times? | difficulty | check the files | **no**: moves only, no times. And the ~6,700 recorded solves are by 7 experienced solvers (Rainer 2,109; Steve C 1,125; Jürgen Helbig 996; Angela Janko 784; Otto Janko 711; Groffin 562; Emma 410), so "human order" means expert order, a third of it one person: report agreement per solver. inkit's own solve times are the human difficulty source |
| Can Opus or Fable label difficulty, hints, interest, sequences? | all | pilot against answer keys | done: hints yes; difficulty no; interest no at scale (Slitherlink a little); sequences unclear (research-llm-labels.md) |
| What makes a puzzle interesting, beyond one person's taste? | puzzles | public likes and ratings; inkit's own signals; a validated model judge | partly measured (Puzzle Square JP likes) |
| Which techniques is the solver missing? | puzzles, difficulty | per-genre techniques (Minesweeper chains, Hidoku distances, Galaxies symmetry, Shikaku rectangles) | done for ten genres (expert band, and each genre's basic ones in hard); pricing them open |
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

**Verdict: no-go, by the stop rule.**

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
- **What would reopen it:** atoms coded after their place (the givens free, since the decoder has
  the puzzle), a context model over the full choice set (the graph network), and the Janko sets
  when the original phase 1 reaches them. Rerun with
  `node --no-warnings puzzles/difficulty/mdl.ts fit --greedy --ctx [--rich]` and
  `mdl-readout.ts [--rich]`; both take seconds.
