# Research trajectory: the best proof, not the solution

Written 2026-10-15 from the thread on the research plan. [research-state.md](research-state.md) holds
results and the queue; this file holds the direction those should now follow. Keep both current.

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

## The objective: a cost over proofs

The universal part of elegance is **description length**. We already compute a subset-minimal
explanation per step (deduce.ts, after Bogaerts et al. 2020). The proof-level cost extends that:

| Term | What it measures | Human-free? |
|---|---|---|
| Size | rule instances and facts used over the whole proof | yes |
| Reuse | the same lemma or shape applied again (symmetry in the puzzle shows up as repetition in the proof, which compresses) | yes |
| Locality | how far apart the facts each step relies on are, on the board and in the constraint graph | yes, with a working-memory reading |
| Splits | case analysis, counted and depth-weighted | yes |
| Peak | the hardest single step | yes, but its weight against size is a human question |
| Shape | one hinge then easy ("aha"), easy moves open at once, dead stretches | the human part |

The caveat is the one description length always carries: it is relative to the vocabulary of
techniques, and that vocabulary is what we are also discovering (the miner). Costs move when the
language grows; we have already seen it with the lemmas. So the cost model is versioned, and every
result names the version.

**Where people come in.** Not for finding elegant proofs. For weighting the terms and for
validation. Validation does not need move traces: 12,000 Puzzle Square JP puzzles carry likes, and
the standing fact is that our current path features scored −0.15 against them. Either the cost model
misses elegance or likes measure something else; the tests below find out which.

## Phases

### 0. Does greedy differ from optimal? (CPU, local data, days)

Best-first proof search with the existing step costs (sum, and separately max) on a few hundred
human puzzles that carry likes or ratings, against the greedy path.

- **Measure:** the cost gap greedy → optimal; how often the paths differ and where; the correlation
  of each path's cost with the source's difficulty rating and with likes (difficulty held fixed).
- **Go:** optimal proofs differ from greedy on a meaningful share, or correlate better. Then the
  search is worth learning to guide.
- **No-go:** greedy is near optimal. Then search isn't the problem; the cost model is, and phase 1
  runs alone.

### 1. The cost model (CPU, local data, a week or two)

Fit the terms above against what we have, each as a separate check so they can disagree:

- Puzzle Square JP likes with difficulty held fixed (12,000 puzzles, 4 types with likes);
- Fable's interest judgement on the 72-puzzle pilot set (0.34 against likes, the only signal beyond
  difficulty we have found);
- Janko's recorded expert order: do experts follow low-cost proofs? (per solver; seven people);
- Beast Academy's set order and Tatham's grades as difficulty checks on the cost's difficulty use.

Deliverable: cost model v1 with its weights and the correlation table, and a statement of which
terms carried the signal. If none beats the −0.15 baseline, say so and stop this line: elegance
isn't recoverable from our vocabulary, and the human-like branch moves up.

### 2. Learned proof search (GPU, one L4, weeks)

The graph network gains two heads: a policy (which step next, over the solver's candidate steps)
and a value (remaining proof cost under v1). Train on the optimal proofs from phases 0 and 1.
Then expert iteration in the proper sense: policy-guided best-first search finds cheaper proofs
than unguided search at the same budget; those proofs become the targets; retrain. Curriculum by
the gap between greedy and best known.

- **Measure:** proof cost at a fixed search budget, per round, on a fixed held-out set; and the
  share of the hard human tail finished (coverage, the old capability goal, now a by-product).
- **Fork point:** baseline-2026-10-14, registered as its child.
- **Stop rule:** under 3% proof-cost improvement at equal budget in a round ends it.

### 3. Products from the minimum proof (as each lands)

- **Difficulty** = proof cost: against every rating source on the scoreboard, to beat the current
  0.3–0.9 spread, with the weak types (Masyu, Shikaku, Hitori, Loopy) the test.
- **Hints** = the next step of the minimum proof, with the technique behind it.
- **Interest** = proof-shape features, validated against likes in phase 1.
- **Generation:** first, rejection-sample the constructive generator on a target proof shape
  (one hinge, no split, bounded locality); then the learned generator from human puzzles
  (research-state.md) with the same acceptance test. Opus's human-versus-generated judgement and
  the classifier stay as reviewers.

### 4. The human-like branch (after phase 2's first snapshot)

Trained on recorded moves (Janko's, then inkit's own). Test both parents, the baseline and the
proof-search snapshot, on agreement with people before choosing (Maia's precedent: human-move
prediction trained better from human games than from a strong engine). This branch is data-bound:
solve logging with consent on inkit is its critical path and belongs on the product plan now.

## What this replaces

- The capability loop as written (solve more within budget) is withdrawn as a goal. Its
  preparatory measurements (where solver time goes on the frontier; the no-network baseline B0)
  are still worth a day, because phase 2's search budget depends on verification cost.
- The intended-path experiment in research-state.md is phase 0 and 1 of this file.
- Setter strength (research-state.md) feeds phase 1 as a weight on whose puzzles count as elegant.

## Risks

1. **Greedy is already near optimal** (phase 0 no-go): then there is nothing for search to learn,
   and the trajectory collapses to the cost model.
2. **Likes don't measure elegance.** The −0.15 may be likes measuring exposure and setter fame. Then
   validation needs Fable's judgement at scale or inkit's own signals, both costlier.
3. **Vocabulary drift.** Every mined technique re-prices every proof. Version the cost model; re-run
   phase 1 when the vocabulary changes; never compare costs across versions.
4. **Search cost.** Best-first over proof states with clingo checks per step can be expensive on
   big boards; phase 0 says how expensive, and phase 2's value head exists to prune it.
5. **Elegance isn't universal after all.** Possible. Phase 1 is the test, and it is cheap.

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
