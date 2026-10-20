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
