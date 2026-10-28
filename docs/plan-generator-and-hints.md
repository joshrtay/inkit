# Plan: a better generator and automatic hint ladders

2026-10-24. A dated snapshot. The living version is the Claude doc
<https://claude.ai/artifact/PGUWd2gQf4FXuFwcRTuS5v>, updated as research lands.

## Summary

Build hint ladders first, then the generator. Ladders have a measured win today (Opus ladders take a
weak model from 46-59% to 92-94% on hard stuck states, for 3-6 cents a stuck point), and the site
already logs every hint tap. The generator's main problems (puzzles that look machine-made, unfitted
quality weights, a proxy difficulty) need the fitted cost model and real play data before more tuning
pays off.

Both systems share one core: the solver as a reader that finds where a person gets stuck, checks every
claim, and prices each step. Both are judged in the end by inkit's own play logs, which started with
PR #26.

**Order of work**

1. **Ladder iteration loop (H3).** Not run (Josh, 2026-10-28). Replaced by the hybrid ladder:
   Thinky's whole-solve, general-to-specific shape, with H2's three hints at each stuck point.
2. **Ladders for AI posts.** Write and check a ladder for every new AI post at creation (about 50 a
   week, under $10 a week), stored with the puzzle.
3. **Hint A/B on inkit.** Today's hint button (which shows the answer cells on the first tap) against
   a location hint and the ladder.
4. **Generator scorer swap.** Fitted difficulty (PR #24) in place of the proxy, with a measured
   baseline of today's output.
5. **Generator search for shape.** Clue-set search toward human-like layouts, flow and one planted key
   step, judged by the human-likeness classifier and play logs.
6. **Ladders for creator puzzles,** written at creation like every puzzle's (a job after publish,
   beside the hourly assessment), editable by the creator.

**Decisions for Josh**

- Decided (Josh, 2026-10-24 20:46Z): every puzzle gets its ladder at creation time; the creator can
  edit it; players read the hints in the rules tab behind the question mark.
- Decided: the Thinky ladders shape the schema only; none of their text goes into prompts or onto
  the site.
- The A/B's control: keep today's bottom-out hint as the control (recommended), or retire it.
- Writer model: Opus (tested) or Sonnet high (cheaper, near Opus on whole solves, untested as a hint
  writer). Recommended: test Sonnet high inside H3.

No paid run starts without Josh's OK.

## What we know that shapes both systems

| Finding | Source | What it means here |
| --- | --- | --- |
| Opus 4-rung ladder: 92-94% success vs 46-59% no hint; rung 1 alone 61-67%; mean 1.7 rungs | Hint test H1, 30 hard puzz.link states, Haiku low student | The ladder is the format to ship. Rung 1 is already as good as a location hint. |
| H2 (100 states, Haiku and Sonnet low): ladder 90-98%, mostly by rung 2; rung 1 alone 60-73%. After a hand check reclassified hypotheticals as posits, not leaks, the whole ladder leaks 36% (grounded); per-rung leaks not yet counted | Hint test H2 | Leaks must be measured per rung. A late rung may leak; rungs 1-2 must not. |
| H2: best single fair hint is the library arm (seed nudge + Opus question): Haiku 74-75%, Sonnet 87%, +10 to +17 over the solver's "look at row 3"; grounded Opus location +12 over it, 6% leaks. The solver hint alone still adds +8 to +11 | H2 | A language model is worth its cost over the free solver hint. |
| H2 reversed H1 (n=30 noise): grounding on the solver's frontier helps the location hint (+12 vs +3 free); question and library about even | H2 | Write ladders grounded: give the writer the solver's frontier. The solver also checks every rung. |
| 3 cents per stuck point (grounded), 4-6 cents free, worst 22 cents; 5-25 cents a puzzle | H1 costs | 10,000 puzzles is $500-2,500 once; AI posts alone are under $10 a week. |
| Thinky authors' ladders: Sonnet low 47% to 77%, Haiku low 41% to 60% (part is a second try) | Benchmark thread, Thinky rerun | The bar a ladder of ours must clear, with fewer leaks. |
| Thinky rungs go general technique, then the region, then bookkeeping advice; written per puzzle, not per position | Thinky data (private) | Our rung order differs (where first). Test both orders; ours must work per position. |
| Sonnet high matches Opus high on Thinky solves at about 65% of the cost; effort matters more than size | Calibration benchmark | Sonnet high is the candidate cheaper writer and the student for checks. |
| Generated puzzles are told from human ones at AUC 0.76-1.00: small boards, dense small clues, no symmetry, many easy moves open at once, nothing beyond expert | research-human-gap.md | The generator's biggest gap is looks and solve shape, not uniqueness. |
| Critical comments cost beauty in order: dull (unused clue or rule) 23, not unique 16, guessing 12, rating off 11, grind 8 | LMD faults | quality.ts checks dull, guessing and grind; the weights are still unfitted. |
| At fixed difficulty, "flow" goes with beauty most (0.28), then rule interactions; aha is part of difficulty | LMD themes, solver aha test | The generator should aim for flow and rules that interact, not a single elegance number. |
| Fitted hand-written cost model: 0.66 on PSJP ratings vs 0.54 for today's estimate; on interest a no-go (likes follow size; clue usage 0.16) | PR #24 (merged 2026-10-24 21:38Z) | The generator's difficulty target should come from this model. |
| Cells alone reach 0.31 within type; raters agree 0.69, so there's room to about 0.83; Masyu has most room (0.53 vs raters 0.76) | Review ideas 2 | Report size-only beside every difficulty figure. Masyu (Lumen's genre) needs work. |
| Solver stalls on Nurikabe and Spiral Galaxies; splits are the solver's gap in Hitori, Hidoku, Numberlink, Fillomino | Step 3, quality.ts SPLIT_GAP | In those types the solver can't verify human-style rungs or price them. Ladders there need a fallback. |
| The site's hint button shows the rule area and the answer cells on the first tap, and logs it ("h") | src/game-types/grid/game.ts | Today's hint is a bottom-out hint. It is the A/B control and the ladder's free last rung. |
| Play logging is on by default with an opt-out; plays and play_events per random browser id | PR #26 | The consent question is settled (Josh, 2026-10-24). Logs stay internal; publish only aggregates. |

## Hint ladders

A ladder is written once per stuck point, checked by the solver, revised until a student finds the
step without an early rung giving it away, and served in the player rung by rung. Today's hint button
stays as the ladder's last rung.

### The rungs: a hybrid of H2 and Thinky

The hybrid ladder (Josh, 2026-10-28). It takes Thinky's overall shape: one ladder that walks the
whole solve, from general strategy to specific steps, in plain text. Inside that shape, each hard spot
uses the three hints H2 found work best. H3 is not being run (Josh).

| Part | Rung | Says | From | Must not |
| --- | --- | --- | --- | --- |
| Opening, once per puzzle | 0a. How to start | where people usually break in on this genre, written for this puzzle's clue kinds | Thinky (they open general) | name a cell |
| | 0b. A habit | one bookkeeping habit that keeps the solve easy ("cross off every cell a star rules out") | Thinky (bookkeeping tips come early, then fade) | name a cell |
| Each stuck point, in solve order | 1. Where | the region, row or clue group, opening with where in the solve it starts ("once the corners are done...") | H2: grounded location, +12 over the solver's hint | name a cell |
| | 2. The rule and a question | a reusable rule phrased as "whenever X, Y" (a library entry, tagged), then one question for this spot | H2: library nudge + question, the best single hint; Thinky: rules phrased to reuse | name a cell with its value |
| | 3. The step | the cell, its value, and why, in one or two sentences | H2 ladder's last rung | name more than the step's cells |
| End | Show me | today's engine hint button, drawn on the board | site | – |

What the Thinky ladders look like (rough keyword counts over 199 grid puzzles, structure only):

- **Length scales with difficulty.** Median 7 hints; 4 at author rating 1, 5 at 2, 8 at 3, 10 at 4,
  26 at 5. In ours this falls out naturally: easy puzzles have zero or one stuck point (2-5 hints),
  hard ones several (8-15).
- **General first, specific later.** Rule-like wording ("if", "whenever", "must") drops from about 60%
  of hints in the first fifth to 46% in the last.
- **Bookkeeping advice comes early.** It's in 16% of the first fifth and 7% of the last.
- **Short and plain.** About 35 words a hint; only 15% are questions.

Thinky traits kept: one ladder for the whole solve, general-to-specific order, an opening strategy
hint, early bookkeeping habits, rules phrased so a player can reuse them, plain text of about 35 words
or fewer, length that grows with difficulty.

Thinky traits dropped: hints that don't point anywhere for long stretches (H2: the grounded location
hint beats generic advice), and ladders that run to 20-39 hints (ours cap at three per stuck point,
since H2's students found the step by hint 2 most of the time).

Two things it adds for measuring learning later. Each rung 2 carries a technique tag (its library
entry), so the play log records which technique a player was shown and whether they later use it
unaided. The opening and habit hints name the genre's basics, so a player's first reveals show what
they didn't know yet.

**Does it teach?** It shows techniques; nothing yet shows it teaches them (H2 measured the next
move, not later unaided use). Three additions aim at teaching:

- **One name per technique.** The same technique gets the same name and wording on every puzzle, and
  links to its guide page on /puzzles. Needs genre techniques in the library (today it has 20
  genre-free patterns).
- **Fading.** Once a player has been shown a technique a few times (per the user-linked logs), rung 2
  shrinks to "this is a [name] spot", so they have to recall it.
- **Practice.** Slate's lessons and the generator's planted key step (G3) put that technique into the
  player's next puzzles.

The test: does a player shown a technique later make that kind of move unaided, sooner or more often.

Privacy: the Thinky data shapes only this schema and the counts above. None of its text goes into
prompts or onto the site; the writer's prompt describes the structure in our own words.

### The pipeline

1. **Find stuck points.** Run the reader (the solver up to the genre's easy ceiling) from the start.
   Each place it stops is a stuck point; its frontier is what one step or a short case split decides.
   A typical puzzle has one to a few.
2. **Write.** One ladder-only call per stuck point (cheaper than H1's all-kinds call), given the grid,
   the rules and optionally the frontier.
3. **Check with the solver.** Every claim in a rung must be true of the solution; rung 4's step must
   be on the frontier (sound and grounded, as in the walkthrough loop); rungs 1-2 must not leak
   (per-rung leak check, hand-validated before trusting it).
4. **Test with a student.** Haiku low tries the stuck state, rung by rung. Record the rung where it
   finds the step and any wrong move a rung causes.
5. **Revise.** Send failures back to the writer: the rung that leaked, the rung after which the student
   still stalled, or the false claim. At most two rounds; a ladder that still fails is dropped to rungs
   1 and 5 only.
6. **Store.** Keep the ladder with the puzzle (keyed by stuck point and its frontier cells), with its
   check results and cost.
7. **Serve.** In the rules tab (the question mark), below the rules: one list for the whole puzzle, in
   solve order (stuck point 1's rungs, then stuck point 2's), revealed in order one at a time on click
   (Josh, 20:48Z). Hints for stuck points the player has passed are skipped automatically: if a stuck
   point's key-step cells are already filled in correctly on their board, its rungs fold away (still
   readable) and the next click starts at the first unpassed one. Wrong key cells aren't skipped; the
   player is pointed at the mistake. Runs in the browser, no model call. Today's hint button stays as "show me". Each hint revealed is
   an action in the play log (Josh, 20:55Z): a new event kind in play-log.ts beside moves, "l" with
   {stuck point, rung, hint version, auto-skipped stuck points}, so the timeline shows which hints were
   exposed and when, in order with the moves; opening the rules tab is logged too, and a solve with
   hints counts as assisted in difficulty and solve stats.

### Matching a player to a stuck point

Josh's design removes most of this risk: the hints sit in a list the player browses, as Thinky does,
so the game never has to guess where the player is. What's left: a later stuck point's first rung should
say where in the solve it starts ("once the corners are done..."), so a player clicking ahead knows
when they've reached their spot. A free check: replay Janko human solves
and see whether each human stall falls on one of the reader's stuck points or between them (H4).

### Experiments, in order

| Step | What it answers | Cost | Gate to move on |
| --- | --- | --- | --- |
| H2 (done) | Library best single hint, grounded location best first rung, ladder 90-98% | $34 | Passed: ladder still the best arm |
| H3 ladder loop | Dropped (Josh, 2026-10-28): not run. The per-rung leak check stays as a free check in the pipeline | – | – |
| H4 coverage | Share of human positions a stored ladder covers | free CPU | 60% or more of hint-worthy positions covered, or an on-demand fallback chosen |
| H5 Thinky bar | Our ladders vs authors' on the Thinky puzzles the engine can read | about $5 | Our success at least the authors', with fewer leaks |
| A/B on inkit | Hints tab off (today's bottom-out button only) vs hints tab on; later, rung order and wording variants | under $10 a week for AI posts | Solve completion, time to next correct move, rungs used, quitting after a hint |

### What's needed in the product

- A hints field on the puzzle, written at creation for every puzzle (AI posts in the weekly batch;
  creator puzzles by a job after publish, so publishing never waits on it). It's a new puzzle field, so
  per CLAUDE.md it must reach the paint editor, the sketch reader, from-puzzle and the round-trip tests.
- A Hints section in the rules tab, revealed in order one at a time on click; creators can edit, reorder or delete
  hints in the editor. When a creator edits a hint, the solver silently re-checks it and logs the
  result, never shows it (Josh's rule: no judgment in the editor).
- An A/B assignment per browser player id, logged with the play.
- Puzzles the solver can't finish (stall types, SPLIT_GAP) still get hints, flagged as unverified in
  the log; the creator's edits are the fix there.

### Built (2026-10-28)

The site side is in: `src/lib/hint-ladder.ts` (the format, next hint, auto-skip, fading), the
*hint_ladders* table with author edits after publishing, the Hints section at the top of How to play
(`app/components/HintsPanel.tsx`), and each hint opened logged as a `HintLog`. The writer is
`puzzles/hints/`: stuck points from the deduction solver at the reader's ceiling (`stuck.ts`), free
solver-worded rungs, and the Opus writer behind `--writer opus` (`words.ts`; not run yet, about
$0.05-0.15 a puzzle). `write-site.ts` writes ladders for published puzzles through `/admin/hints`;
nothing runs it on a schedule yet. Fading counts exposures in the browser for now; counting them
from the account's play logs is a follow-up.

Later the same day (Josh): no puzzle publishes without a verified solve and hints, and the ladder is
written at creation by Sonnet, reviewed on the publish page. The deduction solver runs in the
creator's browser (a Web Worker with clingo-wasm; most examples take under 3 s, a few 10-65 s); where
it stalls, the creator solves the puzzle on the board and their moves become the key steps of those
stuck points (a creator's move is always a stuck point). The stuck points now use per-type reader
ceilings (`puzzles/hints/ceilings.json`, the 0.6 quantile of each type's non-split step costs) and
count every case split as one (the Masyu finding). Sonnet costs about $0.03 a puzzle; a
Sonnet-vs-Opus comparison on 20 puzzles (about $3) hasn't been run.

## The generator

Keep today's generate-and-select pipeline, but change what it selects for and how it shapes the clue
set. A learned generator stays off the list (the research review's stop list).

### Today

clingo picks a random finished board, adds true clues until the solution is unique, then removes clues
that aren't needed (`puzzles/grid/generate.ts`). Each persona makes a few candidates per post.
`proxyScorer` estimates difficulty from size, clue sparsity, clingo's search stats and rule load;
`checkedScorer` (PR #26) runs the deduction solver for 15 s, takes points off for guessing and grind,
and rejects dull puzzles. The pick is the candidate closest to the day's target, less 0.3 times its
quality.

What's wrong with it, measured:

- **Difficulty is a proxy.** The fitted cost model (PR #24) gets 0.66 against ratings; today's
  estimate 0.54; cells alone 0.31.
- **Quality weights are guesses.** quality.ts's penalties follow the LMD order but are unfitted.
- **It looks machine-made.** Random clue removal gives dense, small, asymmetric clue sets and solves
  with many easy moves open at once.
- **Few candidates.** Picking the best of a handful can't reach a narrow target on several measures at
  once.

### Stages

1. **G0 baseline (free CPU).** Score a week of current AI output and a matched set of human puzzles
   on: fitted difficulty with cells-only beside it, quality flags, human-likeness classifier score, and
   solve shape (frontier width over the solve, longest easy run, number of key steps). This is the
   yardstick for every later change.
2. **G1 scorer swap (free).** Fitted difficulty where the solve finishes; the solver estimate
   otherwise; size-only reported beside it. The persona targets get re-checked on G0's set so the days
   still lean easy.
3. **G2 shaped minimisation (free CPU).** Replace random clue removal with a local search over
   removals and swaps. Objective: hit the day's difficulty; no dull clues; symmetric layout where the
   persona wants it; clue values and density near human-targets.json; a narrow frontier (few easy moves
   open at once, the human-gap's flow measure). Hard constraints stay: one solution, no split outside
   SPLIT_GAP types.
4. **G3 a planted key step (free CPU).** Pick a technique the persona should feature this week, and
   require the path to need it once, at a stall, not at the start. Slate's lesson checks ("needed and
   used") already do this for one reading of a rule; generalise it. This targets flow and rule
   interaction, which LMD ties to beauty, without chasing an elegance score.
5. **G4 review (a few dollars).** Opus tells human from generated 83% of the time from the grid alone.
   Use it only as a reviewer of generator changes on about 100 pairs, never per post.
6. **G5 judge by play (product).** Per AI post: completion rate, solve time against estimate, hint
   taps, quits, likes. Run old and new generators side by side across personas for a few weeks. The
   quality weights get fitted here, on inkit's own data.

### Where it falls short

- **Coverage holes:** Simple Loop and Simple Path have no medium band, Galaxies no easy or expert,
  Shikaku few expert, Nonogram uses fixed pictures.
- **Stalling types:** Nurikabe and Galaxies stall the solver, so difficulty and quality there stay weak
  until pricing improves.
- **Masyu:** the Masyu study (PR #28) found the solver's estimate saturates: it's a soft-max of step
  costs capped at 0.9, so one case split hits the cap, and it gets only 0.19 against PSJP on 10x10.
  Case-split count alone gets 0.54-0.64, and a ridge on 26 solver readouts 0.63-0.76. G1 must not use
  the capped estimate for Masyu; add split count (fit once, test on fresh puzzles). The site also uses
  this estimate as a game's difficulty when its solve finishes, so the same fix matters there.

## Shared pieces, open gaps, research in flight

### Shared pieces

- **The reader** (deduce.ts with a ceiling): finds stuck points for ladders and the planted key step
  for the generator.
- **The fitted cost model:** the generator's difficulty target, and the ladder's measure of how big a
  stuck point's step is.
- **Play logs:** where players tap Hint is the strongest stall signal we will have. It feeds
  difficulty, tells the generator which puzzles grind, and judges both systems.
- **The model calls:** one key (INKIT_ANTHROPIC_KEY), Sonnet for titles today, Opus or Sonnet high for
  ladders.

### Open gaps

- **The ladder loop will not run** (Josh, 2026-10-28). Every ladder result is one shot; the play logs judge the hybrid.
- **Model students aren't people.** Haiku fails by misreading grids as often as by missing the idea,
  and succeeds when a rung leaks. Only the inkit A/B measures people.
- **No A/B machinery yet.** Logging is on, but there is no assignment per player, no rung-by-rung hint
  UI, and no analysis of the logs.
- **Leak check is crude.** It flags hypothetical questions as leaks. H2 hand-checks a sample.
- **Stuck-point matching is unproven** (H4 above).
- **Types the solver can't read** (SPLIT_GAP, stalls): rungs can be written but not verified as
  human-style. Ship rung 1 and rung 5 only there until checked by hand.
- **Fillomino and Hidoku** stuck-state building hangs, so they're outside every hint test so far.
- **Thinky data is private.** Their ladders can't be published or, as recommended, used as prompt
  examples for site content.
- **Play logs connected to users** (Josh, 2026-10-28), to measure learning later. This reverses the
  ARCHITECTURE.md rule. Decided (Josh, 05:12Z): signed-in plays link to the account, signed-out
  ones keep the browser id; each hint is logged with its ladder version, rung, technique and rule
  (PR #30). Earlier: on by default, opt-out in Settings, logs internal only. Anything
  built on per-player logs needs a check before publishing.
- **Likes are a weak target.** Interest from likes was a no-go (they follow size), so G5 should lean
  on completion, quits and hint taps.

### Research in flight, to fold in as it lands

| Thread | What's coming | Changes in this plan |
| --- | --- | --- |
| PR cleanup, benchmarks, walkthrough plan | Landed: H2 (hint-test-h2-2026-10-24.md) | Folded in above |
| Run review research ideas | Landed (PR #28): Masyu estimate saturates at its cap; split count and rounds carry the signal. Next there: the same check on Slitherlink, Simple Loop, Nurikabe | Masyu pricing for G1; cells-only column in G0 |
| Trajectory phase 1: cost model | Landed: PR #24 merged 21:38Z; G0 and G1 can start (free CPU) | G1's difficulty scorer |

### Costs and asks

| Item | Cost | Needs |
| --- | --- | --- |
| H5 Thinky bar | about $5 | Josh's OK |
| Ladders for AI posts | under $10 a week | Josh's OK |
| G4 Opus review of generator changes | about $3 a round | Josh's OK |
| Ladders for all published puzzles | $500-2,500 once per 10,000 puzzles | after the A/B |
| H4, G0-G3 | free CPU | – |
