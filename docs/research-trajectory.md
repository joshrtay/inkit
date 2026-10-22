# Research trajectory: the best proof, not the solution

Written 2026-10-15 from the thread on the research plan, reassessed 2026-10-20 after phase 1b (the next section); the objective and phase 1 revised the same day (the revision is phase 1b; the original cost-model fit continues as 1a) after the discussion of an intrinsic target (description length under a learned language), the analyst role for the model, and probabilistic expert weighting. [research-state.md](research-state.md) holds
results and the queue; this file holds the direction those should now follow. Keep both current.

## Reassessment after phase 1b (2026-10-20): the human model becomes the core

Proposed; the sections below it are the 2026-10-15 plan, kept for the record. Evidence: phase 0
and phase 1 v2 in [research-state.md](research-state.md), docs/research-opus-human-moves.md.

**What the results say about this plan's two load-bearing bets.**

- *Search over proofs matters.* Phase 0: the cheapest-only path closes most of the gap to the
  cheapest proof; search helps a little (most on Akari). The cost model, not the search, was the
  bottleneck. Weak.
- *A learned language of moves defines technique and elegance.* Phase 1 v2: with the code fixed
  (each step a choice from its menu, every bit reachable), no vocabulary beyond the solver's own
  kinds of step compresses the solver's proofs, and on people's moves library learning finds 0–6%
  beyond nearness. What predicts people is graded, not symbolic: near the last move, the easiest
  step, some kinds before others. Weak, at the solver's step grain.

Neither result touches the products; they change the route. Difficulty, hints and interest are
all questions about what a person does, and we now have a measured model of that: the
human-tuned network (its top guess is in the person's next 3 moves 45% of the time, against
Opus 38% and the solver 21%; 46%, 35% and 38% with negative marks left out) and a small readable model (nearness, price, kind of step) that recovers all of its gain on
Hitori, two thirds on Minesweeper and a fifth to a third on Akari and Masyu. The minimum proof was a
stand-in for "the path a good solver takes"; the human model is that path directly.

**The proposed order.**

1. **Human move model v1** (days, CPU, mostly built). Per type: a conditional logit on nearness,
   the solver's price, kind of step and board features, blended with the tuned network; scored in
   bits a move and agreement on held-out Janko states. Deliverable: one model and its table.
2. **Difficulty from the human model** (days, CPU). Simulate a person: from the start, sample moves
   from the model over the solver's menu, take a case split where the menu is empty, and sum the
   cost (bits a move, splits, the distance travelled). Test against Puzzle Square JP's and
   puzz.link's ratings and Tatham's grades. The bar is what's on the scoreboard: "what" bits 0.56,
   the cost model's peak 0.53. This is the decisive experiment: if the human model's cost doesn't
   beat the proof cost on difficulty, the minimum proof comes back.
   *Result (2026-10-21, research-state.md):* neither replaces the other. The simulated cost
   ties the bar on Puzzle Square JP (0.56; the solver 0.51 on the same puzzles) and wins on the
   loop types and Masyu; the proof cost wins on Akari and Tatham's grades; ranks averaged, 0.61.
3. **Close the techniques people use and the solver lacks** (CPU, an agent). The missed moves name
   them: Hitori (93% of misses need a split; connectivity is the suspect), Hidoku (85%),
   Numberlink (91%). Measure: the share of people's moves on the menu, per type. This feeds 1, 2 and
   hints, and it is the one place a technique vocabulary showed up in the data.
4. **Hints** = the human model's likely next move, filtered to correct moves (the tuned network's
   guesses are 86% correct, so the filter matters). Product work, once 1 is in.
5. **The human-like branch's data:** solve logging with consent on inkit stays on the product plan;
   Janko's recordings are 14 types and one expert a puzzle.

**Paused, with what would reopen each.**

- *Phase 2, learned proof search:* reopens if step 2 loses to the proof cost on difficulty.
- *Phase 1b's language machinery* (EM over shortest-code paths, the expert mixture, the analyst):
  reopens at a coarser grain (steps cut from people's bursts of moves, Fable's fallback) if a
  readable model is needed beyond step 1's.
- *Elegance by compression:* no signal so far (likes against the old path features −0.15, the
  concentration statistic flat). If it comes back, it is as a readout of the human model (the
  moves a solution forces that the model finds unlikely), checked against likes and Fable's
  interest placing.

**Open questions this leaves.** Akari's unexplained four fifths of the network's gain; digit
types, where the network fails and the readable model beats it (Easy as ABC 23% over nearness);
whether nearness is people's habit or partly Janko's recording.

## Aim 4: a fast solver that still reasons like a person (proposed 2026-10-21)

Proposed by Josh in the project thread. The first three products (difficulty, hints, interesting
puzzles and sets) all run the deduction solver, and today it is too slow on the hard tail to run
when a puzzle is uploaded, inside the simulated person, or at generation scale: 73% of the human
corpus finishes by 30 s, 89% by 300 s (research/solver-speed-2026-10-21.md, project files), and
step 3's techniques took the 196 stalled puzzles from 139 to 170 finished by 300 s
(step3-missing-techniques-2026-10-21.md). The aim: **solve even the hardest puzzles in under 10
seconds, without the path drifting far from how a person reasons.** This partly reopens the
capability loop withdrawn below, but with a different measure: time to a human-style proof, not
the share solved at any cost.

**The tension.** The two halves pull against each other. clingo's search solves a whole puzzle in a
median of about 2 s (the uniqueness check) and is the least human thing we have: it decides marks
nobody could explain. The deduction solver is human-shaped because each step is a small window
proved by a minimal explanation, and that is exactly where its time goes (Hidoku's rounds were
~100 s of explaining eliminations, ~5 s of finding them). Every way to go faster sits somewhere on
a line from "same proof, less work" to "let clingo decide":

1. **Same path, faster** (no divergence by construction): fewer clingo calls (a persistent process,
   incremental solving), windows not rechecked until their marks change, cheaper explanations
   (step 3's batching; the rules near a fact first). Test: identical paths on the example puzzles
   and the dev set.
2. **The techniques people use and the solver lacks** (both goals agree): a technique replaces a
   case split, and is faster. Nurikabe and Spiral Galaxies are the obvious next ones (both still
   split every round); Fillomino's tail too. These change the path, toward people.
3. **Scheduling and fallbacks** (speed for divergence): try the shallow split pool sooner instead of
   running every window first; past a time budget with no progress, take a tier-3 search step or
   let clingo settle a mark outright, labelled as such. This is what may be needed to hit 10 s on
   the last few percent, and the guards below are what meter it.

The order of work follows the line: 1 and 2 first, 3 only for what they leave.

**Definitions.**

- **Hardest corpus.** The human corpus build human-20261014-2153, unique puzzles with side ≤ 20
  (27,978). The *hard pool* is the puzzles it didn't finish within 30 s (about 7,500, 27%).
  *Dev set:* the 196 already sampled from it (solver-speed-300-1021); step 3 was tuned on them, so
  their numbers are optimistic. *Test set:* a fresh sample of 400 from the same pool, stratified by
  genre (equal counts per genre where the pool allows, so Nurikabe and Hidoku weigh as much as
  Masyu), fixed seed, drawn once and only scored at a gate. Boards over 20 (413) are a separate
  stretch band, reported but not in the target.
- **Hardware and clock.** One vCPU of an n2-standard-32 (Cloud Batch, 32 solves a machine as in the
  build; spot allowed, it runs about 10% slower), single-threaded. Wall clock from the spec to the
  finished path, explanations and clingo included. Parallelism inside a solve doesn't count toward
  the target; report it separately if it's tried.
- **Human-style divergence**, three measures on the same runs:
  - *Opaque share:* the share of marks settled by tier-3 search or a clingo fallback (marks no
    window or shallow split explains). Tier-2 shallow splits (assume a mark, propagation
    contradicts it) are human-like trial and counted separately as the *split share*.
  - *Agreement with people:* on held-out Janko states, the share where the solver's next step is in
    the person's next 3 moves (today: solver 21%, human-tuned network 45%); and the human move
    model's bits a move along the solver's path, against the 300 s solver's path on the same puzzle.
  - *Difficulty unchanged:* the scoreboard's Spearman against Puzzle Square JP and Tatham with the
    fast solver's proofs, against today's. Difficulty is a readout of the path, so a path that moves
    shows up here. The rule (Josh, 2026-10-21): scored with a budget of 200 clingo calls (not wall
    clock, so it repeats exactly), neither mean more than 0.02 lower (one-sided since 2026-10-22, Josh: a
    gain passes, but a type above its interval's high end counts as a gain only once held-out PSJP
    puzzles confirm it: guard-report.ts lists those, scoreboard `--psjp-shift`), and no type worse than the low end of its
    own bootstrap interval (one-sided: a type that agrees better is no failure). At gates, 60 puzzles a
    type (`--psjp 60`, about 3× the usual cost); between gates 20 and the means. Nurikabe gets a
    bigger call budget, since at 200 none of its 20 finish and every one rates 0.9: 1,000 calls (with
    the local encoding 56 of 60 finish there).

**Targets** (on the test set, the clock above).

| | today (dev set, 196) | milestone M1 | aim |
|---|---|---|---|
| finished ≤ 10 s | 0% (none finish by 30 s, by construction) | 90% | 100% |
| finished ≤ 60 s | 39% | 100% | 100% |
| unfinished at 300 s (gave up, died or still going) | 13% | 0 | 0 |
| whole corpus (side ≤ 20) ≤ 10 s | ~62% of attempts in the build | 97% | 99% |
| opaque share of marks | to measure | ≤ 2% | ≤ 1%, and none on puzzles that finish today without it |
| split share of marks | to measure | ≤ 1.25 × the 300 s solver's | ≤ the 300 s solver's |
| agreement with people (top 3) | 21% | ≥ 21% | ≥ 21% |
| bits a move vs the 300 s path | 0 | ≤ +5% | ≤ +5% |
| difficulty Spearman vs today | 0 | within 0.02 | within 0.02 |

The speed rows are about a 10–30× speedup on the hard tail (step 3's median finishes there are
40–185 s). The divergence rows are guards, not goals: a change that meets the speed target by
breaking one is reported with the trade, and the choice of how much opacity to buy is Josh's.

**First step: freeze the test set and profile where the time goes.** Draw the 400-puzzle test set
from the build's status in the bucket (CPU, free). Extend deduce's `timing` (today build and clingo
time) to split each round's time into window finding, explanation, shallow splits and tier-3
search, and log the opaque and split shares. Run the dev set with `finish` on and a 60 s budget on
Cloud Batch (4 spot n2-standard-32 for about 10 minutes, under $2, needs Josh's OK), plus the
divergence baselines on the scoreboard and the Janko states (CPU). Deliverable: per genre, where
the seconds go and which lever (1, 2 or 3) each genre needs, with a rough speedup bound for
levers 1 and 2. **Gate:** if 1 and 2 can plausibly reach M1, build them first; if the profile says
only fallbacks can, bring the trade (how much opaque share for how many seconds) to Josh before
building them.

**The steps after it, one at a time** (Josh, 2026-10-21: pursue all of these, in turn). Each is
measured on the dev set against the targets above, and each starts only after the one before it has
been read.

1. **Engineering, same path** (lever 1): a persistent, incremental clingo process; cheaper
   explanations. Proof unchanged, checked by identical paths.
2. **Learned window ranking** (lever 1, with the network): a head on the graph network
   (relations-tuned-2026-10-20 as parent) ranks the windows and marks to check next; the solver
   checks the top few and sweeps everything only when they find nothing. clingo still proves every
   step, so it stays sound. Labels are free: every logged round says which windows produced a fact.
   Trained on people's moves too, so it should move the path toward people, not away.
3. **Predicted explanations** (lever 1): a head guesses the set of rules and facts a step needs,
   and one clingo call confirms it (deletion from there if it's too big, the full search if it's
   wrong). Same proof, if the guess is checked to be minimal.
4. **Predicted case splits** (lever 3, cheaper): a classifier on which marks propagation refutes,
   from the logged tier-2 rounds, so a split round tries 20 candidates, not 300.
5. **Techniques written by a model** (lever 2): Opus or Fable writes candidate Nurikabe and Spiral
   Galaxies techniques as clingo rules; kept only if each is proved sound (no answer of any test
   puzzle breaks it, and clingo shows it follows from the rules) and it cuts splits on the dev set.
   Open-weight models only if it takes thousands of tries. Not inside the solve: one model call is
   seconds, the budget 10.
6. **Offline RL on the schedule**, last and only if 2–4 leave a gap: the order of checks as a
   policy, reward minus time with the divergence guards as penalties, from the logged runs.

**The profile (2026-10-21, run solver-speed-profile-1021; research/solver-timing-profile-2026-10-21.md
in project files).** The dev set with `finish` on and a 60 s budget: 3% finished by 10 s, 14% by
30 s, 50% by 60 s. Median per puzzle: setup 1.4 s, window checks 14.5 s, explanations 9.0 s, case
split rounds 0.4 s. Four groups:

- *Window-bound* (window checks 70–95% of the time, tiers 0–1 settle ≥ 92% of facts): Akari, Star
  Battle, Sudoku, Skyscrapers, Easy as ABC, Irregular Sudoku, Wittgenstein Briquet.
- *Explain-bound:* Hidoku (42 s, 66%), Simple Loop (74%), Masyu (59%), Cave (49%).
- *Split-bound:* Nurikabe (split rounds 54 s; tier 2 settles 70% of facts, tier 3 23%) and
  Fillomino (23 s; 27% and 12%); both also spend ~9 s in setup. Cave gets 41% of its facts from
  tier 3, so it is far from human-style as well as slow.
- *Spiral Galaxies:* none finished by 60 s, its time split between windows and explanations.

So step 1 starts with the window checks (most genres, and the median), then explanations; the
split-bound genres need steps 4 and 5 (Nurikabe settles 93% of its facts by splits or search, so a
faster split is still not human-style). The 14 example puzzles had pointed at explanations; the
dev set says windows, which is why the profile came before any building.

**Step 1 so far (2026-10-21; runs solver-speed-profile-1021b and 1021c, same settings).** Two
changes, each with the proof unchanged (identical paths on every example puzzle that finishes and on
30 dev-set puzzles, and identical as far as both go where one runs out of budget):

- *Window checks* (bf8eebe): clingo's cautious mode drops facts from the running intersection one
  answer at a time, and by default each answer is the nearest to the last, so a call over a few
  hundred windows took ~3,600 answers. Random signs, no saved phases and a restart after each
  answer: ~6. Star Battle finished by 30 s 0% → 93%, Akari 20% → 100%.
- *Explanations* (1b6fcfd): the windows' rules are ground already, but were written as ASP text that
  clingo parsed and ground again on every call (about half the time). They now go through clingo's
  backend as number tables. Explain median 12.3 → 7.1 s.

| dev set, 196 | finished ≤ 10 s | ≤ 30 s | ≤ 60 s | median total |
|---|---|---|---|---|
| before (1021) | 3% | 14% | 50% | 60.3 s |
| window checks (1021b) | 7% | 32% | 60% | 44.5 s |
| and explanations (1021c) | 9% | 41% | 62% | 37.0 s |
| and Spiral Galaxies' cell atoms (1021d) | 9% | 42% | 70% | 33.4 s |
| and islands, joins (1021e, 16 solves a VM) | 10% | 48% | 73% | 31.2 s |
| and core wide, Nurikabe encoding, listing fix, answers supplied (1022a) | 21% | 64% | 86% | 23.0 s |

1022a (4a27191): Nurikabe went from 0/19/31% to 69/100/100% by 10/30/60 s (median 60.9 s → 7.0 s). Supplied answers cut setup everywhere (median 1.5 s → 0.9 s), so part of the gain in untouched types is that. Time over 10 s now sits in Fillomino (18%, splits median 44 s, 50% by 60 s), Hidoku (16%, explaining 36 s), Spiral Galaxies (11%), Cave (10%) and Numberlink (9%).

Native clingo was not faster than the WebAssembly build on these calls (1.26 s against 1.39 s), and
clingo-wasm exposes only a one-shot `run`, so a persistent grounded control isn't available without
rebuilding it. What's left, by genre: Sudoku (16 × 16), Skyscrapers and Irregular Sudoku spend
20–45 s checking many large windows that find nothing, which is step 2's case; Cave, Masyu, Simple
Loop, Slitherlink, Hidoku and Spiral Galaxies spend 15–37 s explaining, which is step 3's; Nurikabe,
Fillomino and Cave are split-bound (steps 4 and 5). Setup on some Nurikabes is dominated by clingo
finding the answer (up to 47 s on one 10 × 10; no configuration fixes it), which a puzzle that comes
with its answer (every published and inkit puzzle has one) would skip.

**Step 2, first read (2026-10-21, local).** Traces of 35 dev-set solves (2 a genre, not the ones
measured below): only 0.7% (Akari) to 20% (Masyu) of window checks find a fact, outside Hidoku and
Fillomino. A logistic model on what a trace row knows (size, open and changed marks, whether the
window found something last time, its kind) ranks them with held-out AUC 0.88 (gradient boosting
with the genre 0.90). `Options.rankWindows` (DEDUCE_RANK; off by default) checks a stage's likeliest
30% first and the rest only when those find nothing. On 20 other dev puzzles of ten genres, 60 s
budget: 487 → 425 s in all (13%), most on the Sudokus (Irregular Sudoku 37 → 16 s and 17 → 11 s,
Sudoku 46 → 30 s), 0–15% elsewhere; every puzzle still finishes; case splits and search unchanged;
the difficulty estimate moved by more than 0.02 on 3 of 20 (Irregular Sudoku 0.57 → 0.64, Nonogram
0.29 → 0.26, Easy as ABC 0.75 → 0.80). So after step 1 window checks are no longer the main cost,
and a better ranker (the network) can't buy much: it stays off, and step 3 comes next.

**Step 3, first read (2026-10-21).** Two findings. *Spiral Galaxies* wasn't slow, it was blind:
its helper atoms had no footprint, so every window held the whole puzzle and each was too big to
check (1,134 skipped a round), leaving only case splits. The finish set now turns on `cellAtoms` for
it (b2d30d0): finished by 60 s 6% → 94% (1021d), median explain 47 → 11 s; at 300 s all 16 finish,
the fifteen 10 × 10s in 10–24 s and the one 17 × 17 in 150 s (109 s explaining); facts 73% tier 0,
8% tier 1, 19% tier 2, none from search. Other genres stayed within a puzzle of 1021c.
*Core-seeded explanations* (`DEDUCE_CORE`, 4152705; off by default): deletion starts from clasp's
unsat core instead of the whole window, 10–20% faster on most of 16 explain-bound dev puzzles (one
Masyu 26 → 14 s), estimates within 0.02 but one (Hidoku 0.71 → 0.69); the sets differ, so it waits,
with `rankWindows`, for a refit of the prices on the new paths.

**Step 4, first read (2026-10-21, local): case splits hide search.** A split round is one clingo
call that assumes each candidate the wrong way in turn (about 80 on a 10 × 10 Nurikabe; the first 12
searched up to 3,000 conflicts, the rest up to 50) and counts a candidate as tier 2 when it's refuted
with no choices. Rounds are about 2 s and 70% of a Nurikabe's time, but mostly fixed cost (grounding
about 0.5 s, the 12 searches about 0.5 s): trying only the nearest 20 first was slower, because a miss
costs a second call and the pool kept for later rounds is lost. The bigger finding: clingo keeps what
each candidate's search taught it, so later candidates are refuted "with no choices" thanks to the
earlier searches. Checked alone, in a fresh call (`DEDUCE_SPLIT_FRESH`, a debug check on each split
taken; 3 dev puzzles a genre, 4 for Nurikabe), the share of tier-2 splits that still need search:

| genre | splits taken | need search alone |
|---|---|---|
| Simple Loop | 37 | 92% |
| Hitori | 41 | 54% |
| Nurikabe | 124 | 52% |
| Cave | 50 | 40% |
| Masyu | 31 | 29% |
| Slitherlink | 22 | 5% |
| Fillomino | 47 | 2% |
| Spiral Galaxies | 73 | 0% |

So the split share and the opaque share (the divergence guards) undercount search on those first
five genres, and their difficulty estimates price some search as a split. The honest version (a
split is tier 2 only if a fresh call refutes it with no choices; the rest are search) would move
them toward tier 3 until step 5's techniques replace it. It changes estimates, so it waits for the
same refit as `rankWindows` and `DEDUCE_CORE`; Aim 4's guards should count it from now on.

**Step 5, first techniques (2026-10-21, local; written by Claude here, not by a model in a loop).**
Two techniques a person uses, each a sound constraint from what's known (any wrong fact throws, and
none did), in the finish set:

- *islands* (Nurikabe): where each island can still grow, through cells not shaded and not beside
  another numbered island, at most its number less its size away. A cell no island reaches is
  shaded; an island short of its number keeps a way out. On the 16 dev Nurikabes (60 s, three solves
  on four cores): 8 finish, against 1 without (one 10 × 10, 45 → 9 s); on the first 8, splits that
  still need search alone go from 54% to 18% of those taken, and there are fewer of them.
- *joins* (any shaded or unshaded area that must be connected: Hitori, Cave, Nurikabe's sea): an
  open cell whose loss would part two known cells of the area goes their way. Small gains: 8 dev
  Hitoris 131 → 109 s in all (one 25 → 9 s), 8 Caves 272 → 245 s and one more finishes.

On the whole dev set (1021e, 16 solves to a VM): Nurikabe finished by 60 s 0% → 31% (5 of 16), its
facts by tier 7/69/24% → 62/26/12% (windows now settle most), though split rounds are still a 41 s
median and setup 10 s; Hitori median 22.4 → 13.8 s, 88% by 30 s; Cave 7% → 21% by 30 s. Genres the
change didn't touch moved by under a second at half the load, so the load effect is small there;
Spiral Galaxies' 2.2× (42.8 s median here, about 16 s alone at a 300 s budget) is still unexplained
and needs checking before the gate's timing rule is fixed.

**The difficulty guard (2026-10-21, cloud; research/aim4/guard-check-2026-10-21.md in project
files).** The scoreboard's Puzzle Square JP and Tatham sections with each parked change, mean
Spearman against the baseline's 0.57 / 0.71: `rankWindows` 0.3, −0.00 / +0.00 (passes: it's now on
with `finish`); `DEDUCE_CORE`, −0.01 / −0.02 (at the line; Singles 8 × 8 −0.15: stays off);
islands and joins, +0.00 / −0.18 (fails, all of it joins on Hitori: Singles 0.75 → 0.22 at 6 × 6,
as the component lemma did before, so joins leaves Hitori's finish set until it's priced; islands
alone leaves Tatham unchanged and lifts Puzzle Square JP Nurikabe 0.00 → 0.13). No wrong facts
anywhere. A repeat of the baseline on another VM moved loop genres by up to 0.17 from timing alone,
so single-type moves there are noise.

**Where explaining goes on loop genres (2026-10-21, local).** On a 14 × 14 Simple Loop all but a
second of 30 s explaining is the case splits' explanations: the first neighbourhood never entails
the split and the second is already the whole grid (about 1 s each, 27 of them); Masyu likewise (9
of 9 s). Growing the neighbourhood a ring at a time doesn't help (the refutations are global: the
loop). Core-seeded deletion only there (`DEDUCE_CORE=wide`, windows' explanations untouched): that
Simple Loop finishes (61 s, unfinished → 44 s), Cave 21 → 19 s, Masyu 16 → 15 s, Hidoku unchanged
(it has no splits). Under the gate rule it passes (means +0.002 / +0.004, no type below its
interval; the Singles 8 × 8 −0.15 that plain `DEDUCE_CORE` had comes from these explanations too,
but stays inside its interval), so it's on with `finish`.

**Nurikabe can't be judged yet.** Under the gate rule islands changes nothing outside Nurikabe, and
Nurikabe's verdict is an artifact: the 200-call baseline finishes 1 of 60 (every other one rates
0.9), and the puzzles islands lets finish carry case splits explained over the whole grid, which on
Nurikabe is a 7.6 MB program even at 8 × 8 (the engine's connectivity encoding), past the 1.2 MB
our clingo-wasm wrapper takes (clingo.ts MAX_PROGRAM), so those steps go unexplained and price at the fallback (rating about 0.95). Explaining them
needs a smaller encoding of the island rules for explanations (a local encoding, as Fillomino and
Shikaku have) or native clingo; until then Nurikabe is left out of the guard.

**A local encoding for Nurikabe.** local.ts now encodes Nurikabe the way people think of it: each
unshaded cell belongs to one number within reach (own(I,C)), neighbours both unshaded share an
owner, a number owns its size and each owned cell joins it, the shaded cells join, no 2 × 2 is all
shaded. It never pairs regions, so a whole-grid program is 40–130 kB where the engine's is 4–7.6 MB,
and it gives the engine's answers (unique on all 16 dev Nurikabes). With finish and the answer
supplied, all 16 dev Nurikabes finish in 0.9–11.3 s (13 by 10 s; before: 9 of 16 by 60 s), every
step explained. The two examples solve in 0.25–0.37 s (engine encoding 1–2.5 s) with no search
steps (engine: 1 and 3): owner atoms let propagation see what the engine's reach encoding needed
search for, so ratings move (example 1: 0.76 → 0.49 with finish). Whether they move the right
way is the guard's call (Nurikabe on PSJP at 200 calls). DEDUCE_LOCAL=0 turns it off.

The guard sample showed a gain (Nurikabe rho −0.24 → +0.22 at 200 calls), but it did not hold on
180 held-out PSJP Nurikabes: engine +0.09 against local −0.02 at 200 calls, +0.07 against +0.02 at
1,000. The guard sample's −0.24 was an artifact of the sample. So the encoding is a speed and
finishing win (157 against 59 of the 180 finish, none too big to explain, a quarter of the time),
not a difficulty gain. Nurikabe's agreement is held back by stall pricing instead: an unfinished
solve rates 0.9, below finished Nurikabes (0.95–1.0 whatever their rating), though the unfinished
are the hardest. Finished-only rho is 0.36–0.46, and ranking stalls above every finish gives 0.45
(local) and 0.35 (engine) held out. That is post hoc on one type, so changing stall pricing needs
its own guard run on every type and a held-out check.

**A local encoding for Fillomino.** The engine counts every region at every size (size/2 over all
roots, 2.5 MB ground at 6 × 6, 14 MB at 8 × 8), so whole-grid steps were too big to explain and
windows saw nothing: every step was a case split or search. local.ts now gives each cell a size and
an owner (its region's first cell, close enough for some size); uncut links join cells of one size
and owner, and an owner's cells are joined to it and number its size. A numberless region is no
bigger than the numberless cells joined to it, which bounds the sizes. Ground: 170–420 kB at 6 × 6,
1.2 MB at 8 × 8; the same unique answers on all 16 dev Fillominos and the examples (unit test). With
finish and the answer supplied, all 16 finish in 4–29 s (1022a: half by 60 s); splits 37–63 s fall to
0.1–13 s, and windows now find steps (tier 0 a third to a half of the facts). Prices are the open
question: explained steps carry many size-clue groups (the region rules are tagged size-clue; left
untagged, each was a group of its own), so 9 of 16 rate at the ceiling, and the 8 × 8s still have
whole-grid splits too big to explain, which price below explained ones.

The guard failed it (Fillomino agreement 0.12 on the guard sample, below the engine's interval;
0.29 against 0.37 held out; 16 of 31 held-out finishes at 0.88–0.90 whatever the rating), so it is
off by default (DEDUCE_LOCAL=fillomino turns it on) until its steps are priced. Narrowing the owner
atoms' footprint (own(I,C) on cells I and C) made windows faster on some puzzles but the 16 slower
in all (232 s → 268 s) and stalled one, so it was dropped.

**Stalls on top.** An unsolved estimate was 0.9 or its path's, below the solves that price above
0.9, though the unfinished are the hardest. Ranking every unfinished solve above every finished one
passed the guard on every type and moved only Nurikabe on the default solver (held out 0.12 → 0.29,
above its interval: a confirmed gain; means PSJP +0.034 held out, Tatham 0). Proposed in the price
(245a137, pending Josh's yes):
a solve stops at 0.9 and an unsolved one is 0.91 and up by its path so far (estimateOf; the
scoreboard's capped runs 0.91).

The same run found a listing bug in every genre: a fact another window claimed was also listed by
any larger window that found it, unexplained, whenever the claimer's explanation was cached, and
those unexplained duplicates were taken at times (priced at the fallback). A window now lists a
claimed fact only with an explanation of its own (deduce.ts candidates).

**Estimates depend on the clock.** The paths are deterministic (every other type repeated exactly);
what isn't is the budget. The scoreboard gives each solve 15 s of wall clock, and an unsolved puzzle
rates at least 0.9, so a slow puzzle near the line (Masyu and Simple Loop are explain-bound) rates
0.9 on a busy machine and its true estimate on a quiet one. `budgetCalls` (DEDUCE_BUDGET_CALLS, also
read by the scoreboard) stops after a number of clingo calls instead, with the wall clock only as a
90 s guard: the same example puzzles give identical results alone and with three other solves
running. Calls vary in cost (one tier-3 search can take 10 s), so the count wants calibrating
against the 15 s board before it replaces it, and a finer unit (clingo's conflicts and choices)
may be needed if a few puzzles still reach the guard. Calibrated (2026-10-21, cloud): at 100, 200
and 400 calls all 544 estimates were identical at 16 and 32 solves to a VM (the two 15 s baselines
differed on 3). At 200 the means match the 15 s board exactly (Puzzle Square JP 0.57, Tatham 0.71;
100 is 0.07 lower, 400 slightly lower); 19 Puzzle Square JP solves (Nurikabe, Numberlink, Spiral
Galaxies) reach the 90 s guard, but they rate 0.9 either way. So the guard uses 200 calls, with
its per-type baseline taken again at 200 (types differ from the 15 s board by up to 0.2, Shikaku
−0.19, Simple Loop +0.22).
At 200 calls (exact repeats), per type with n ≥ 10, no setting stays within 0.02 everywhere:
`rankWindows` moves Masyu −0.24, Slitherlink +0.17, Spiral Galaxies +0.15, Numberlink −0.14;
`DEDUCE_CORE` Masyu −0.22, Singles 8 × 8 −0.15; islands changes only Nurikabe (+0.10, three new
solves); joins on Cave −0.03. Means stay within 0.02 for all. But at n = 20 a type's Spearman has
about ±0.2 sampling error, so a 0.02 per-type rule flags any change of path, not harm; and Nurikabe
can't be judged at 200 calls (the baseline solves none of 20, so all rate 0.9). The per-type rule
needs rewriting: bigger samples, or one-sided (no type worse than its bootstrap interval).

**Puzzles that come with their answer.** Setup solves the puzzle once with clingo to know the answer
(case splits are aimed with it, and every fact is checked against it). On Nurikabe that's slow: for
the 16 dev puzzles a median of about 6 s and up to 58 s. Every published puzzle comes with its
answer, so a solve given `answer` now takes it instead (a wrong one shows as a wrong fact), and
`speed-answers.ts` finds them once for a sample (solver-speed.ts hands them on with
SPEED_ANSWERS=1). On four dev Nurikabes setup fell 50 → 3.6 s, 30 → 4.4 s, 11 → 2.3 s and 5.2 →
2.0 s, with the same estimates; the one that finishes went 14.6 → 11.7 s.

Simple Loop is different: few splits (most of its time is explaining), so the existing rules for
it don't buy much. `cuts` (a part of the grid with few ways out) made 5 of 8 dev puzzles slower,
and the `parity` lemma was mixed (one more finishes, 24 → 9 s on another, three slower), so neither
goes in its finish set.

A third islands rule, a cell an island can't reach its number without (without it, too few cells
are within reach), with answers supplied: 9 of 16 dev Nurikabes finish in 60 s (two hard ones newly,
a 6 × 7 with five clues in 54 s), and the quick ones get quicker (12 → 7 s, 16 → 11 s).

What's left on Nurikabe is search a person would struggle with too (a 6 × 7 with five clues, two of
them 6 and 8, takes about 7 s a fact by tier 3), plus puzzles with big islands (sizes 6–9).

**Timing needs a fixed load.** The same Spiral Galaxies ran a median 2.2× slower with 32 solves to a
VM (1021d) than with 16 over 128 vCPUs: full-VM runs overstate one solve's time, here by up to about
2×. Before the gate the "one vCPU, wall clock" rule gets a fixed load (say 16 solves on an
n2-standard-32) or a calibration against a few puzzles timed alone.

**Open questions.** Whether the 300 s solver is the right reference for "human-style" (it is
cheapest-first, and people aren't: 21% against the tuned network's 45%); a later version could
measure divergence against the human move model's own path. Whether hints need a different
target: a hint is one next step from a position, which wants about a second, not a full solve in
10.

## The reframe

Solving is not the game. clingo solves every puzzle we have; a policy that solves faster is a
capability nobody needs, and the capability loop (research-state.md) was optimising it. The game is
**finding the best proof**: each puzzle has many valid deduction paths, and a person, a setter and a
hint all care about which one. Define a cost over paths and the task becomes "find the minimum-cost
proof". That is a real search problem (our solver is greedy: cheapest step each round, which is
not the cheapest path), and it is the one place the AlphaZero machinery applies here properly:

- **search** over proof steps, guided by a learned policy;
- **value**: the estimated remaining cost of a proof from a position;
- **training target**: the cheaper proofs the search finds;
- **curriculum**: the puzzles whose best known proof is still expensive, or far from greedy's.

Every product hangs off the minimum proof. Difficulty is its cost. A hint is its next step. Interest
is its shape. Generation targets puzzles whose minimum proof has a wanted shape. And the human-like
model is a separate question (how people actually move), which this trajectory feeds but does not
answer.

## The objective: description length under a learned language of moves

The target is intrinsic. Take the engine's shared primitives (a primitive applied to a unit: the
step signatures, 2,223 shapes, 89 shared across types) as the atoms. A **language** is a dictionary
of symbols built on them: each symbol a reusable compound of symbols below it, with arguments
(which row, which cells). The objective over the whole human corpus is two-part description length:

    total bits = Σ over symbols of its definition (its body coded in the symbols below it)
               + Σ over paths, Σ over steps of  −log P(symbol | context) + cost of its arguments given the symbol and context

The language that minimises the total is the technique vocabulary; a path's elegance is its code
length under that language. Nothing human is in the definition. The precedent is library learning
in program induction (DreamCoder's wake-sleep: find programs, abstract what recurs into the
library, find shorter programs under the new library).

**What falls out of it.**

- **Techniques** are, by definition, sub-proofs that recur often enough that naming them shortens
  the corpus. The miner was hunting for these by hand. An abstraction earns its place when uses
  times savings per use exceeds its definition.
- **Cost and surprise are one quantity under two models.** Marginal (how often the symbol appears
  at all) is how hard the move is; a step price is a Shannon code, −log frequency, which is what
  the learned prices were approximating. Conditional (how likely it is *here*) is surprise: a common
  symbol in an unexpected place is the aha. Surprise is a readout of the fitted model, never a term
  in the objective (rewarding unpredictability rewards noise).
- **The context model is the graph network.** It predicts the next move given the state; its
  probability of a path is the path's code length (arithmetic coding). So the proof-search policy
  is the compressor, and training it by maximum likelihood on shortest-code paths is one step of
  the alternation below.
- **Locality is a consequence, not a term.** Arguments predictable from where the solver was just
  looking are nearly free; distant ones cost bits.
- **Elegance as distinct from difficulty** is a shape statistic of where the bits fall along a
  path: short total, concentrated in one or two steps. A testable claim, not a definition.
- **Personal difficulty and curriculum.** MDL pays for the language once; a person pays to learn
  it. A learner who knows a subset of the symbols has a personal code length for every path, and
  the order in which symbols unlock short codes is the curriculum (learning-design.md).

**The caveat** description length always carries: the language is relative to the corpus it
compresses. Compress human-made puzzles' proofs, not the generator's; that is where "a human
puzzle implies an elegant path exists" enters, as the prior. The cost model is versioned, every
result names the version, and costs are never compared across versions.

**Where people come in.** Not in the definition. As the external check that code length and
surprise track what people call hard and elegant: likes with difficulty held fixed, ratings,
Janko's expert order, Fable's interest judgement on the pilot set. The standing fact to beat is
that the old path features scored −0.15 against likes.

## Phases

### 0. Does greedy differ from optimal? (CPU, local data, days)

Best-first proof search with the existing step costs (sum, and separately max) on a few hundred
human puzzles that carry likes or ratings, against the greedy path.

- **Measure:** the cost gap greedy → optimal; how often the paths differ and where; the correlation
  of each path's cost with the source's rating and with likes (difficulty held fixed).
- **Go:** optimal proofs differ from greedy on a meaningful share, or correlate better.
- **No-go:** greedy is near optimal. Then search isn't the problem and phases 1a and 1b run alone.
- **Also log the choice set:** the full menu of available steps each round, not only the step
  played. Elegance is about which path was taken among those that existed, and the menu is cheap
  to record while solving.

### 1a. Fit the hand-written cost model (CPU, local data; running)

The original phase 1, kept running in parallel with 1b as a baseline. Six hand-chosen terms over
the proof (size, reuse, locality, splits, peak, shape), fit on about 2,300 puzzles against the
external checks, each a separate test so they can disagree: Puzzle Square JP likes with difficulty
held fixed; Fable's interest judgement on the 72-puzzle pilot set (0.34 against likes); Janko's
expert order, per solver; Beast Academy's set order and Tatham's grades for the cost's difficulty
use. Deliverable: cost model v1 with its weights, the correlation table, and which terms carried
the signal. If 1b's learned language doesn't beat it on the same checks, the hand-written terms
stay.

### 1b. Learn the language (CPU, then the GPU for the context model; weeks)

The intrinsic version of phase 1, run in its own thread ("Phase 1b: learned move language")
alongside 1a.

Alternate, EM-style, until the held-out total stops falling:

1. **Fix the language, find paths:** best-first search for each puzzle's shortest-code path.
2. **Fix the paths, refit the language:** re-estimate symbol frequencies and the context model;
   abstract recurring sub-proofs into new symbols where that shortens the total; drop symbols that
   no longer pay for their definition. A step's minimal explanation isn't unique, so pick the
   shortest-code one jointly with the language.
3. **Score on held-out puzzles.** Fit on half, score bits on the other half; on training data alone
   a symbol per puzzle "compresses" everything and the language cost only partly guards against it.

**The model as analyst.** Forty thousand traces are millions of rows; no context window reads
them. Fable works over a trace table (the puzzle catalog in research-state.md, plus a traces table
with the choice sets) as an analyst: hypothesis, query, aggregate, refine. Its two jobs here are
proposing candidate abstractions and names for them (contrasting pairs, greedy against optimum
and liked against unliked at equal difficulty, are what to show it when it should *name* a
difference) and proposing features that predict the external checks. The compression test and the
held-out half decide what stays. Split the puzzles before it starts; every pattern it reports
carries its effect size on the half it didn't explore. This generalises the mining harness from
stuck moments to whole traces.

**Probabilistic expert weighting.** Expert-set puzzles should shape the language more, and we're
rarely sure a puzzle is expert-set. A mixture model fit by EM inside the same loop: each puzzle
has a hidden class (expert-set, amateur-human, generated), each class its own symbol frequencies
and context model over the shared language. The prior per puzzle comes from provenance (source,
setter, likes, the human-likeness classifier); the posterior updates by how well each class's code
compresses its path. Each puzzle weights the expert language by its posterior. Setters are the
level above: a setter's quality is the pooled posterior of their puzzles, shrunk for small counts,
and feeds back as the prior for their others. This is research-state.md's quality-weighting
hierarchy made Bayesian with the language as the likelihood. Guards: anchor the ends (Nikoli,
curated Janko and high-beauty Logic Masters pinned as expert; the generated set pinned as not),
so it's semi-supervised and can't drift to "puzzles like the current favourites"; score code
length relative to what difficulty predicts, or use the shape statistic, so "expert" can't collapse
to "easy"; keep the provenance prior informative but not decisive. Check on held-out setters of
known standing and against Opus's human-versus-generated reading; one source's house style
dominating the expert class is drift.

**Deliverable:** language v1 with its symbols, held-out bits against the atoms-only baseline, the
correlation table against the external checks, and the per-puzzle and per-setter posteriors.
**Cheap early check:** frequency-derived prices against the learned step prices on Singles, Sudoku
and Loopy. **Stop:** if no language beats the atoms on held-out bits by a margin, or none of the
readouts beats −0.15 against likes, say so; elegance isn't recoverable from our vocabulary, and the
human-like branch moves up.

### 2. Learned proof search (GPU, one L4, weeks)

The graph network gains two heads: a policy (which step next, over the solver's candidate steps;
it is also language v1's context model) and a value (remaining code length under v1). Train on
the shortest-code proofs from phase 1b (or 1a's cheapest paths, if 1a wins).
Then expert iteration in the proper sense: policy-guided best-first search finds cheaper proofs
than unguided search at the same budget; those proofs become the targets; retrain. Curriculum by
the gap between greedy and best known.

- **Measure:** proof cost at a fixed search budget, per round, on a fixed held-out set; and the
  share of the hard human tail finished (coverage, the old capability goal, now a by-product).
- **Fork point:** baseline-2026-10-14, registered as its child.
- **Stop rule:** under 3% proof-cost improvement at equal budget in a round ends it.
- **Human check, every round:** report agreement with people (graph_policy.py: the top guess in
  the person's next 3 moves) on held-out Janko states beside proof cost. Proof cost is a reward we
  define ourselves, and search will drive it down whether or not it tracks people. A round where
  proof cost falls and agreement falls also ends it.

### 3. Products from the minimum proof (as each lands)

- **Difficulty** = proof cost: against every rating source on the scoreboard, to beat the current
  0.3–0.9 spread, with the weak types (Masyu, Shikaku, Hitori, Loopy) the test.
- **Hints** = the next step of the minimum proof, with the technique behind it.
- **Interest** = proof-shape features, validated against likes in phases 1a and 1b.
- **Generation:** first, rejection-sample the constructive generator on a target proof shape
  (one hinge, no split, bounded locality); then the learned generator from human puzzles
  (research-state.md) with the same acceptance test. Opus's human-versus-generated judgement and
  the classifier stay as reviewers.

### 4. The human-like branch (after phase 2's first snapshot)

Trained on recorded moves (Janko's, then inkit's own). Test both parents, the baseline and the
proof-search snapshot, on agreement with people before choosing (Maia's precedent: human-move
prediction trained better from human games than from a strong engine). This branch is data-bound:
solve logging with consent on inkit is its critical path and belongs on the product plan now.

**A third candidate parent: an LLM.** On 400 held-out Janko states over all 14 types, Opus's one
move was in the person's next 3 moves 38% of the time, against 19% for baseline-2026-10-14 and
21% for our solver (paired sign tests p ≤ 3e-9; docs/research-opus-human-moves.md). The baseline
was never trained on human moves, so the fair comparison is against the network fine-tuned on
Janko's moves; run that first. Also score every predictor with negative marks (crosses, "no line")
excluded, since part of Opus's edge may be that it names the positive moves experts write first.
If Opus still leads, either distil its clingo-checked choices into the network as labels (about
$40 per 1,000 states) or move the puzzle encoder for a language model (learning-design.md) up.

## What this replaces

- The capability loop as written (solve more within budget) is withdrawn as a goal. Its
  preparatory measurements (where solver time goes on the frontier; the no-network baseline B0)
  are still worth a day, because phase 2's search budget depends on verification cost.
- The intended-path experiment in research-state.md is phases 0, 1a and 1b of this file.
- Setter strength and quality weighting (research-state.md) become phase 1b's mixture model.
- The miner becomes the analyst over the trace table.

## Risks

1. **Greedy is already near optimal** (phase 0 no-go): then there is nothing for search to learn,
   and the trajectory collapses to the cost model.
2. **Likes don't measure elegance.** The −0.15 may be likes measuring exposure and setter fame. Then
   validation needs Fable's judgement at scale or inkit's own signals, both costlier.
3. **Vocabulary drift.** Every mined technique re-prices every proof. Version the cost model; re-run
   phase 1b when the vocabulary changes; never compare costs across versions.
4. **Search cost.** Best-first over proof states with clingo checks per step can be expensive on
   big boards; phase 0 says how expensive, and phase 2's value head exists to prune it.
5. **Elegance isn't universal after all.** Possible. Phases 1a and 1b are the test, and they are cheap.
6. **The analyst finds patterns that aren't there.** The held-out split and effect sizes are the
   guard; without them expect twenty confident findings and three real ones.
7. **The expert class drifts** to one source's house style or to "easy". The anchors and the
   difficulty-relative scoring are the guard; check the posteriors against known setters.

## Which model to run it with

The work splits into three kinds, and they want different models:

- **Framing, cost-model design, reading results critically, deciding gates:** Fable 5.1
  (`claude-fable-5-1`, $10 / $50 per million tokens). It is the right model for the parts where
  the question is whether the experiment measures what we think, and those parts are short.
- **The engineering:** best-first search inside deduce.ts, the two heads on graph_policy.py, the
  fleet scripts, the fitting code. Opus 5.5 (`claude-opus-5-5`, $4 / $20) at effort high or
  xhigh. Long agentic sessions in a 2,000-line solver with clingo underneath is what it is for,
  at 40% of Fable's price.
- **Grind:** data munging, correlation tables, re-runs, plots. Sonnet 5.5 (`claude-sonnet-5-5`,
  $2 / $10).

In practice: write each phase's brief with Fable, hand the build to Opus, and bring the results
back to Fable for the go/no-go. The ML model itself stays the graph network; it gains heads, not a
new architecture.
