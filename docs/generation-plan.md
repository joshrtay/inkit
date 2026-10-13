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
