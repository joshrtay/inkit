# Research: where things stand

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
| Janko's puzzles with recorded solves | ~6,700 solves, 12 types (8 read so far) | 7 experienced solvers' move order; no times | human order, hints, stuck moments |
| Puzzle Square JP | ratings for 17 types, ~20 sampled per type on the board; likes for 4 types | the site | difficulty, taste |
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

## Open questions, by product

| Question | Product | What would answer it | Status |
|---|---|---|---|
| Is data the network's limit? | core | learning curve on the generated set (10–100%) | after the fleet |
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

1. **Gather the fleet;** audit 1%; make training load data in pieces.
2. **Evaluation changes:** human-made test set, next-move agreement, key-move score, results by
   band and family, seeds.
3. **On the GPU, back to back:** the fair size test and the learning curve.
4. **Labels from models where the pilot passed:** hint text from solver steps; stuck-moment moves
   for the miner. (Interest at scale didn't hold: 0.06 beyond difficulty on 372 puzzles, Slitherlink
   0.27; interest needs people's signals.)
5. **Connectivity pricing** (CPU, alongside).
6. **Structure as network input** for the whole-grid types.
7. **Per-genre techniques** for the generator's missing bands and genres.
8. **For the site:** review the generated shortlist; build learning paths from the family map.

## Spending to date

| Item | Approx. |
|---|---|
| Anthropic API: mining rounds | $2.50 of $10 approved |
| Anthropic API: labeller pilot and interest confirmation | $17.69 ($15 pilot, then ~$5.50 more approved) |
| GPU runs (5) | ~$8 |
| CPU generation (first batch + fleet) | ~$16–21 when the fleet ends |
