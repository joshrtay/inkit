# Generating puzzles at the full CPU quota

A plan for one large run of the technique-aware generator (puzzles/difficulty/gen-set.ts, bands.ts):
puzzles solvable by reasoning alone, in difficulty bands, each with the techniques it requires. For
the graph network's training data and a shortlist for the site (gen-best.ts). Written 2026-10-13.

## What we know from the first batch

gen-20261013-0906: one spot n2-highcpu-16, 14 jobs.

- **Throughput:** 155 puzzles in its first ~6 minutes. An attempt takes 2–210 CPU-seconds (fill-in
  and minesweeper the cheapest; 9 × 9 Sudoku, irregular Sudoku, Nurikabe and Square Jam the
  dearest). Nearly every attempt yields a puzzle, about 100–150 per CPU-hour overall. Aiming hard
  costs more: fewer per CPU-hour, since many attempts come out easier.
- **Mix:** 62% easy, 20% medium, 14% hard, 4% expert. A puzzle that comes out easier than its
  target is kept under its real band, so hard runs also make medium and easy puzzles.
- **Coverage:**
  - Every band: 19 genres.
  - Expert only: Hitori, Nurikabe and Square Jam.
  - Not yet: Shikaku, Numberlink, Nonogram and Fillomino.
- **Size:** about 13 KB of training data per puzzle.
- **Cost:** spot CPUs are about $0.01 per vCPU-hour.

## Quota

- **All regions:** 512 vCPUs. The first batch uses 16 until it ends.
- **Per region:** us-central1, us-east4 and us-west4 allow 200 each, with N2 200 in each; other US
  regions allow 100.
- **Spot:** the preemptible quota is 0, so spot VMs draw on the regular quota.

## The fleet

There are 15 spot n2-highcpu-32 VMs (32 vCPUs and 32 GB each, about 29 jobs) for 4 hours, five
in each of us-central1, us-east4 and us-west4: 480 vCPUs, 496 with the first batch. That is
about 1,900 vCPU-hours.

Each VM gets its own arms (genre, size, band), so no two make the same puzzle; seeds are fixed per
arm (gen-set.ts seedOf). Puzzles per arm are set high (2,000), so the 4-hour limit ends each VM,
not the arm count.

| VMs | Share | Band | Genres | Why |
|---|---|---|---|---|
| 6 | 40% | hard | all 19, split six ways by cost | what the network and the site most lack |
| 2 | 13% | hard and expert, bigger sizes | Slitherlink 7 and 8, Masyu 8, Star Battle 10, Akari 10, Skyscrapers 7, Cave 7 | longer chains and whole-grid reasoning |
| 2 | 13% | expert | the loop, connection and size types; Hitori, Nurikabe, Square Jam | the network's weakest types (Nurikabe 39%, Cave 38%) |
| 3 | 20% | medium | all 19 | the middle of a curriculum |
| 2 | 13% | easy, plus the cheap genres' medium | all 19 | cheap; plenty already |

Splitting a band across VMs balances by measured cost per attempt, so each VM's arms take about
the same CPU time.

## What to expect

These are estimates from the first batch, not measurements at scale.

- **Puzzles:** 120,000–180,000, of which 40,000–60,000 are hard or expert.
- **Cost:** $15–20 for the CPUs; storage and transfer are negligible.
- **Training data:** 1.5–2.5 GB.
- **Spot VMs can be reclaimed.** A reclaimed VM loses at most 5 minutes (results sync every 5),
  and a rerun with `resume=<run>` carries on from it.

## Before launching

1. **A fleet launcher** (puzzles/cloud/run-gen-fleet.sh): the table above as data, creating each
   VM with its arms (GEN_GENRES, GEN_BANDS) through run-gen-job.sh, and recording the run names.
2. **Zones:** spread the VMs across zones within each region, and retry another zone on a
   stockout.

## After

3. **Gathering** (puzzles/cloud/gather-gen.sh): copy every run's generated/*.jsonl and
   graphs-gen.jsonl from the bucket, de-duplicate by key, and summarise by genre and band (gen-set
   --summary).
4. **An audit:** re-prove uniqueness and the band for a random 1% locally; report any that fail.
5. **Training at this size:** graph_policy.py holds every puzzle in memory, which is fine for 9,000
   and not for 150,000. Load in shards, sample states per epoch, and train on the GPU VM from the
   bucket.
6. **The learning curve first:** train on 10%, 25%, 50% and 100% of the new set (plus the existing
   9,000) and plot accuracy, overall and for the whole-grid types. If it's still rising at 100%, a
   second run of the same size is worth its $15–20. If it's flat, data isn't the limit; spend on
   giving the network the rules instead.
7. **The site shortlist:** gen-best.ts over the gathered set, ranked by interest, required
   techniques and clue economy; a few hundred for review. Nothing is published without review.

## Not in this run

- **Shikaku, Numberlink, Nonogram and Fillomino:** the generator can't yet make them by reasoning.
  Shikaku needs rectangle reasoning the windows lack. They need solver work first.
- **GPUs:** quota is still 1, with the increase pending. The learning curve waits for the
  current width-256 run to finish.

## A human-like run (planned, not launched)

A network trained on our generated puzzles does much worse on human-made ones. Ours are small (5 ×
5 to 8 × 8) with the simplest settings; Janko's and Puzzle Square JP's are usually 10 × 10, often
2-star Star Battle, with symmetric clue layouts and a deliberate break-in. The generator now has
options for each, and gen-set.ts a mode that aims at them.

### The options

- **Settings per arm** (gen-set.ts GEN_GENRES `genre:sizes[:bands[:settings]]`): `stars=2` (Star
  Battle, generate.ts `stars`), `letters=4` (Easy as ABC: that many letters, generate.ts
  `letters`; the engine's `letters` rule and symbols), `sym=rot180|mirror|none|human`. An arm with
  settings has them in its key (`star-battle|10|hard|stars=2`), so its seeds are its own; arms
  without are keyed as before.
- **Symmetric clue layouts** (generate.ts `symmetry`): clues are added and taken out in twin pairs
  (both or neither) through the whole unique-and-accept reduction, so the final layout is
  half-turn or left-right symmetric. For the genres made by adding clues to cells
  (SYMMETRY_GENRES: Sudoku, Irregular Sudoku, Akari, Slitherlink, Cave, Minesweeper, Wittgenstein
  Briquet, Masyu, Square Jam, Binary, Hive). Akari's black squares follow the symmetry; Cave's,
  Minesweeper's and Briquet's answers are shaded symmetrically, or the clues that tell the answer
  apart often have no twin. Not for the genres made whole (Nurikabe, Shikaku, Hitori, Galaxies,
  Numberlink), the clueless (Star Battle's areas) or edge-clued ones.
- **Human mode** (GEN_HUMAN=1; targets from puzzles/difficulty/human-targets.json, GEN_TARGETS):
  HUMAN_GENRES as the default arms; `sym=human` on every arm it applies to, each job's symmetry
  drawn by its seed from the genre's target shares (DEFAULT_SYMMETRY, 60% half turn, 10% mirror,
  30% none, without targets); quotas by the targets' size and setting shares (an arm gets perArm ×
  its share over its genre's commonest arm); extra jobs to the arms whose puzzles bring the step
  families the genre is most short of against the human mix (pickArmHuman; rarity, as before, for
  genres without a mix).
- **Break-in** (interest.ts breakInScore, 0 to 1): the costliest step in the first three quarters,
  how far it stands above the path's median, the share of the next ten steps (after its burst) no
  dearer than the median, less later rivals, halved at the very start or late. With GEN_BREAKIN=k
  (3 by default in human mode), a hard or expert job makes up to k candidates (seed, seed + 1e8,
  ...) within GEN_BREAKIN_MS (240 s) and keeps the one in the target band with the best score;
  one scoring 0.6 ends the search. Every puzzle records `breakInScore`, and `symmetry` when drawn.

Defaults are unchanged: without GEN_HUMAN, settings or GEN_BREAKIN, gen-set makes the same
puzzles from the same seeds, and generate.ts without `symmetry` or `letters` the same puzzles
(checked against the old generator, with and without `accept`).

### The rest of the gap (docs/research-human-gap.md)

Five more options, from the gap report's list. All are off by default; human mode and the fleet
plan turn them on.

- **A "beyond" band** (bands.ts, after expert): what expert can't solve, solved with everything
  expert has plus at most BEYOND_SPLITS (3) case splits, each refuted by propagation alone
  (deduce's tier 2: clingo unsatisfiable with no choices), and no search. deduce.ts gained
  `maxSplitSteps` (case splits allowed in a solve), and `maxTier: 2` now stops before tier 3 and
  spends no clingo time on deep candidates; in quick mode a split is settled unexplained, like the
  windows' facts, and named "splits" (a technique: every beyond puzzle requires it). bandOf tries
  every band, so a puzzle is beyond only when expert fails. gen-set's beyond jobs check with a
  20-second budget (8 below). The explained solve kept for the record allows splits uncapped
  (another order may need one more), still no search. gen-set makes beyond only when asked: in
  GEN_BANDS, in a genre's own bands (`hitori:8:expert+beyond`), or in human mode for the genres
  whose targets put BEYOND_MIN (30%) or more of human puzzles there; a beyond arm's quota is its
  genre's times the targets' beyond share over hard's or expert's (beyondWeight, 0.25 to 2).
  human-gap.ts keeps its own meaning of beyond (expert can't, measured with the defaults).
- **A narrow thread** (interest.ts threadOf, threadScores; GEN_THREAD=1): among a job's break-in
  candidates (GEN_BREAKIN), all are made (no early stop), and the kept one has the best break-in
  plus thread score: half the fewest open easy moves per round per cell among the candidates over
  its own, half the fewest facts per step over its own (so 1 for the narrowest). It is read off the
  explained solve the job makes anyway: no extra solving. GEN_CANDS=file writes every candidate's
  record, the kept one marked, for measuring.
  - Why not rank by the classifier's size-free score instead: its features are mostly in the job's
    record, but `required` would need requiredOf for every candidate (a dozen more quick solves
    each), and the spec features (symmetry above all) would have to be ported from Python and kept
    in step. Within a job, the model is near saturation for the new arms (0.9–1.0 for 10 × 10
    beyond Masyu and Slitherlink), and it rewards whatever separated the old fleet from human
    puzzles, which moves with every fleet. It stays the offline yardstick:
    `human_gap.py score <records>` scores new puzzles by their genre's size-free fleet model.
- **Sparser clues, bigger numbers** (generate.ts `sparse`; arm setting `sparse`): Nurikabe, one
  island per 8–14 cells and few of size 1 (still at most 5 cells: bigger islands make every
  uniqueness check several times slower), each number moved within the islands the other answer
  shades until unique, not placed at random again; Shikaku, rectangles up to 12 cells, one per 6
  cells at most; Spiral Galaxies, galaxies grown to 4–13 cells and layouts with more than one per 4
  cells drawn again; the genres made by adding numbers (Cave), the biggest numbers added first and
  the smallest taken out first.
- **The clue kinds people use:** Skyscrapers with outside clues only (`outsideOnly`, setting
  `outside`): when no outside clue tells two answers apart, the other answer becomes the target.
  Simple Loop with rocks only (`blocksOnly`, setting `blocks`): a random loop over 80–94% of the
  grid, rocks on the rest, then rocks moved while no more loops fit (a loop visits as many dark
  squares as light ones, so moves keep the balance: a rock to a square of its colour, or a dark and
  a light square together), until one is left, then dark-and-light pairs of rocks taken out while
  it stays one (about one rock per 6–8 squares at 10 × 10; human puzzles median one per 8).
- **Star Battle:** 3 stars (`stars=3`; the engine's rules take any number; areas grown one per
  star, then grouped three at a time). 10 × 10 can't hold 30 stars that don't touch (each 2 × 2
  block holds one at most); human 3-star puzzles are 14 × 14, and ours at 14 take about two
  minutes for the board alone, so no band comes out in a 10-minute job: not in the fleet. Even
  areas (`evenAreas`, setting `even`): the hill-climb that makes the areas unique never lets their
  size spread (standard deviation over mean) pass EVEN_SPREAD (0.5) or what it already is. At 0.4
  no 2-star hard puzzle came out (0 of 4); at 0.5, 4 of 4, spread 0.42 (human puzzles' 0.45).

Defaults still unchanged: generate.ts without the new options takes the same random draws, and
gen-set without GEN_THREAD, beyond or the new settings runs the same jobs.

### Measured (a Mac, DEDUCE_JOBS=2, 10-minute cap)

Two attempts per arm at hard and expert, one at easy and medium. Seconds per attempt; the band
a puzzle came out in when it missed.

| Arm | Hard | Expert | Easy, medium |
|---|---|---|---|
| Sudoku 9 | 49 s, 2/2 | 86 s, 0/2 (medium, hard) | 18, 31 s |
| Slitherlink 10 | 93 s, 2/2 | 174 s, 0/2 (hard, medium) | 16, 42 s |
| Masyu 10 | 113 s, 0/2 (medium) | 151 s, 1/2 | 42 s; none at medium |
| Cave 10 | 47 s, 3/4 | 145 s, 0/4 (hard) | 34 s medium |
| Akari 10 | 14 s, 0/4 (easy, medium) | the same | 3, 7 s |
| Star Battle 10, 2 stars | ~330 s, 1/2 (one ran out) | 0/4 (time) | none easy; 93 s medium |
| Skyscrapers 6, 7 | 21 s, 2/4 (easy) | 0/4 (easy) | 13, 20 s |
| Easy as ABC 6 (4 letters), 7 (5) | 10 s 2/2; 39 s 1/2 | 24 s 1/2; 38 s 0/2 | 15 s |
| Hitori 8 (10: no unique board) | | 11 s, 2/2 | |
| Nurikabe 8 (10: time) | | 310 s, 1/2 | |
| Shikaku 8 (10: time) | 43 s, 2/2 | 590 s, 1/2 | |
| Spiral Galaxies 7 | 20 s, 2/2 | 0/4 (time) | none easy; 118 s medium |
| Fill-in 6 | 12 s, 2/2 | 70 s, 2/2 | |
| Minesweeper 8 | 188 s, 0/2 (medium) | 32 s, 2/2 | 3 s |
| Simple Path 7 | 9 s, 2/2 | 17 s, 2/2 | |
| Hidoku 6 | 99 s, 2/2 | 200 s, 1/2 | 26, 158 s |
| Numberlink 7 | 6 s, 2/2 | none (6 and 7) | |
| Fillomino 6 | 35 s, 2/2 | 110 s, 2/2 | |

- **Symmetry:** all 19 puzzles drawn symmetric came out exactly symmetric (looks.ts), and an audit
  of all 85 puzzles made (gen-audit.ts, which now checks symmetry too) found every one unique, in
  its band and symmetric where drawn.
- **Break-in, 3 candidates against 1** (the same seeds, 18 hard jobs): mean score 0.34 → 0.40
  (Sudoku 0.17 → 0.60 on one seed), and two jobs that had come out easier hit hard; about twice
  the time (Slitherlink 10 93 → 258 s, Sudoku 49 → 104 s), and one Hidoku job ran out. The fleet
  uses 2.

### Measured: the rest of the gap (a Mac, DEDUCE_JOBS=2, 10-minute cap)

Human mode. Most arms ran with 3 candidates per job and GEN_THREAD (and GEN_CANDS, which explains
every candidate: dearer than the fleet's 2), so seconds are per job of 3; the arms marked 1 ran one
candidate. All 42 puzzles made passed gen-audit.ts: unique, in their band, symmetric where drawn.

| Arm | Made | Seconds per job | What came out |
|---|---|---|---|
| Masyu 10 beyond | 4/4 | 444 | 2–3 splits each; every candidate made (9) was beyond |
| Slitherlink 10 beyond | 4/4 | 385 | 2–3 splits; 10 of 10 candidates beyond |
| Cave 10 beyond, sparse | 4/5 (1 timeout) | 302 | 11 of 11 beyond; 0.28–0.34 clues per cell |
| Hitori 8 beyond | 3/4 (1 no unique board) | 55 | 4 of 4 beyond |
| Masyu 8, Slitherlink 8 beyond (1) | 1/1, 1/1 | 121, 60 | |
| Nurikabe 8 beyond: sparse; plain (1) | 0/7; 0/2 | timeouts; no board | none |
| Nurikabe 8 expert, sparse (3; 1) | 0/2; 0/1 | timeouts | none |
| Masyu 10 hard; Slitherlink 10 hard | 2/2; 2/2 | 248; 287 | (3 of 13 candidates came out medium) |
| Simple Loop 10, rocks only: hard; expert | 2/2; 2/2 | 67; 444 | 12–18 rocks (human median 12 at 10 × 10) |
| Skyscrapers 6, outside only, hard | 2/2 | 327 | 9 outside clues, 0.25 per cell (human 0.25) |
| Shikaku 8 hard, sparse | 2/2 | 163 | 0.17 clues per cell (human 0.16; ours were 0.31), up to 12 |
| Spiral Galaxies 7 hard, sparse | 2/2 | 50 | 0.22–0.24 per cell (human 0.22; ours 0.42) |
| Cave 10 hard, sparse | 2/2 | 141 | 0.26–0.30 per cell, numbers 2–13 |
| Star Battle 10, 2 stars, even: hard (1) | 4/4 | 167–526 | spread 0.42 (at EVEN_SPREAD 0.4: 0/4) |
| Star Battle 10, 2 stars, even: medium (1) | 1/2 | 49 | |
| Star Battle 14, 3 stars, even: medium (3); easy (1) | 0/2; 0/1 | timeouts | |

- **Beyond:** where it works, every attempt that made a puzzle made a beyond one (34 of 34
  candidates), with 2 or 3 case splits. Time per candidate is about that of expert at the same
  size. Nurikabe doesn't come out at all yet, plain or sparse.
- **Sparse:** Shikaku and Spiral Galaxies reach the human density. Nurikabe's sparse boards are
  unique without the solver in the loop (about 50 s, 0.13 clues per cell, one 1 in eight) but
  none reached expert or beyond in 10 minutes. Cave's numbers grow, but its density hardly moves
  at 10 × 10 (0.26–0.34 against 0.20): it's the band's accept that keeps clues, not the order.
- **Human-likeness** (`human_gap.py score`: each genre's size-free fleet model, fitted on the human
  sample against the whole fleet): the new arms score far above the fleet. Means over all
  candidates: Simple Loop 1.00 (fleet median 0.001), Skyscrapers 0.99 (0.001), Spiral Galaxies
  1.00 (0.004), Masyu beyond 1.00 and hard 0.31 (0.015), Slitherlink beyond 0.98 and hard 0.48
  (0.04), Cave beyond 0.88 and hard 0.16 (0.0003), Shikaku 0.26 (0.013), Hitori beyond 0.30
  (0.07). That is the settings (size, symmetry, clue kinds, density, beyond), not the selection.
- **The preferences don't raise it.** In 30 jobs with 2–3 candidates each, the kept candidate
  scored higher than the others' mean in 16, lower in 13 (mean −0.23 in logit); by the thread
  alone −0.66, by the break-in alone −0.11: noise around zero. The thread preference does what it
  says (the kept candidate has 21% fewer open easy moves per round per cell than the others, and
  2% fewer facts per step), but the model doesn't reward it: within a size and band, its weight
  on open moves is small and of either sign (Slitherlink +0.56, Hitori −0.56, Masyu −0.16), and
  what moves its score between candidates is symmetry, the share of case splits and the step
  count. The fleet keeps GEN_THREAD for what it measures directly, not for the score.

### The fleet (run-gen-fleet.sh, `GEN_PLAN=human`)

16 spot n2-highcpu-32 for 4 hours, 512 vCPUs: six in us-central1, five in each of us-east4 and
us-west4. Every VM has its own arms (a genre's hard and expert on different VMs where they're
dear), all with GEN_HUMAN, GEN_BREAKIN=2 and GEN_THREAD=1 (both candidates always made at hard
and above, the better break-in plus thread kept). gen-job.sh and gen-fleet-watch.sh pass
GEN_THREAD through.

| VMs | Band | Arms |
|---|---|---|
| 1 | hard, expert | Sudoku 9 |
| 2 | hard; expert and beyond | Slitherlink 10 |
| 2 | hard | Star Battle 10, 2 stars, even; Star Battle 9, 2 stars, even, and 10, 1 star, even (and expert) |
| 2 | hard; expert | Masyu 10, Cave 10 (sparse) |
| 1 | beyond | Masyu 10, Cave 10 (sparse), Slitherlink 8, Masyu 8 |
| 1 | expert, beyond (Shikaku hard, expert) | Nurikabe 8 (and sparse, on trial), Hitori 8, Shikaku 8 (sparse) |
| 2 | hard, expert | Galaxies 7 (sparse), Simple Loop 10 (rocks only), Hidoku 6, Fillomino 6; Fill-in 6, Minesweeper 8, Simple Path 7, Numberlink 7 |
| 1 | hard, expert | Skyscrapers 6, 7 (outside only); Easy as ABC 6 (4 letters), 7 (5); Slitherlink, Masyu, Cave (sparse) 8 |
| 3 | medium | the 10 × 10 genres; the others (with the new settings) |
| 1 | easy | all that make easy |

**Expected,** assuming an n2 vCPU at half a Mac core and 2 candidates per job (about two thirds of
the 3-candidate times above): about 32 job slots × 3.5 hours per VM.
- **Hard, expert and beyond VMs (12):** 150–300 Mac-seconds per job at 10 × 10, so 300–600 on
  the fleet, about 6–12 jobs per slot-hour, 700–1,300 attempts per VM, three quarters made:
  8,000–12,000 puzzles.
- **Beyond:** about 1,500–2,500 (the beyond VM about 600, Slitherlink's expert-and-beyond VM
  about 300, Hitori 8 the rest; Nurikabe probably none).
- **Medium and easy VMs (4):** 30–100 Mac-seconds per job: 10,000–15,000 puzzles.
- **In all:** 18,000–27,000 puzzles, about half of the last plan's 40,000–55,000: both
  candidates are always made, and the arms are 10 × 10 and beyond. The dearest: 2-star Star Battle
  in even areas (a few hundred), Simple Loop 10 at expert (a few hundred).
- **Cost:** unchanged, 2,048 vCPU-hours, about $20 at $0.01 per vCPU-hour; disks and transfer
  under $1. With the GPU VM up (8 vCPUs), leave h-medium-c out (15 VMs, 480 vCPUs).
- **Wasted at most:** an arm stops after 6 attempts with nothing made, so the Nurikabe trials
  cost about an hour of one job slot each.

Without human-targets.json the mode runs on its defaults (equal quotas, DEFAULT_SYMMETRY, and
rarity balancing); with it, the quotas, symmetry shares and family steering follow it.
