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

### The fleet (run-gen-fleet.sh, `GEN_PLAN=human`)

16 spot n2-highcpu-32 for 4 hours, 512 vCPUs: six in us-central1, five in each of us-east4 and
us-west4. Every VM has its own arms (a genre's hard and expert on different VMs where they're
dear), all with GEN_HUMAN and GEN_BREAKIN=2.

| VMs | Band | Arms |
|---|---|---|
| 1 | hard, expert | Sudoku 9 |
| 2 | hard; expert | Slitherlink 10 |
| 2 | hard | Star Battle 10, 2 stars; Star Battle 10, 1 star (and expert) |
| 2 | hard; expert | Masyu 10, Cave 10 |
| 1 | hard, expert | Slitherlink, Masyu, Cave 8 |
| 1 | expert (Shikaku hard too) | Nurikabe 8, Hitori 8, Shikaku 8 |
| 2 | hard, expert | Galaxies 7, Hidoku 6, Fillomino 6; Fill-in 6, Minesweeper 8, Simple Path 7, Numberlink 7 |
| 1 | hard, expert | Skyscrapers 6, 7; Easy as ABC 6 (4 letters), 7 (5) |
| 3 | medium | the 10 × 10 genres; the others |
| 1 | easy | all that make easy |

**Expected,** assuming an n2 vCPU at half a Mac core: about 29 jobs × 3.5 hours per VM, 40,000–55,000
puzzles, 12,000–18,000 of them hard or expert, about 18,000 at 10 × 10. The dearest: 2-star Star
Battle (a few hundred) and Nurikabe and Shikaku expert (about a hundred each). **Cost:** 2,048
vCPU-hours, about $20 at $0.01 per vCPU-hour; disks and transfer under $1. With the GPU VM up (8
vCPUs), leave one VM out.

Without human-targets.json the mode runs on its defaults (equal quotas, DEFAULT_SYMMETRY, and
rarity balancing); with it, the quotas, symmetry shares and family steering follow it.
