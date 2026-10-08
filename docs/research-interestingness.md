# Research agenda: telling whether a puzzle will interest people, with AI and solvers

The question: before anyone plays it, can we predict whether a puzzle will be *interesting* to
humans (an "aha", fair, not a slog), not just valid? Two instruments so far: **clingo** (exact,
tells us what's forced and when) and **a language model** (has taste and narrates like a person,
but is unreliable on grids). This agenda is about combining them, and testing what works.

See also: docs/panel-design.md and docs/design-grant.md (what makes puzzles good),
docs/glimmith-rules.md, and the local reference sets in `references/` (Witness panels,
Glimmith windows, acclaimed collections per type; never published).

## Lessons from ARC-AGI-3

ARC-AGI-3 (interactive grid games: infer the rules and the goal by acting) was hard for models
playing directly: the preview's unscaffolded models scored under 1%, and OpenAI reported GPT-5.6
Sol at 7.8%, tripled from earlier runs mostly by two API settings: **keeping the model's reasoning
between steps, and compaction** (ARC-AGI-3 report, arXiv 2603.24621; OpenAI, "How enabling two
settings tripled our ARC-AGI-3 scores", July 2026). The big scores came from **harnesses that make
the model write programs and hold them to evidence**:
- **Twin** (arXiv 2608.14490): a coding agent writes an executable world model of the game; the
  harness blocks any action until the program reproduces every observed transition; each mismatch
  is a counterexample that repairs it. 97.8% of levels, against 7.8% for direct play with the same
  model. The authors found building the world model easier than expected; *inferring the goal*
  was the hard part.
- **PRO-LONG** (arXiv 2607.20064): keep a complete structured log of everything seen and let a
  coding agent query it with programs, instead of summarising: +18 points, fewer tokens.
- Non-LLM explorers (state graphs, CNN + RL) beat unscaffolded models early on.

What carries over to puzzle evaluation:
1. **Don't let the model do what a program does better.** Track the grid in code; let the model
   propose and explain. (Our version of Twin: the model proposes, clingo disposes.)
2. **Counterexamples are signal.** Where the model's proposals fail against the verifier is where
   a person would be fooled: traps, red herrings, the hard step.
3. **Keep reasoning across steps, and keep the full log** (don't summarise the solve away); query
   it afterwards with programs.
4. **"Goal inference" is the hard part there; "the key idea" is ours.** Finding *what* the
   interesting step is matters more than replaying every step.

## Instruments

- **D: a deduction solver** (clingo, no AI): solves step by step, each step labelled by how much
  of the grid it needs to look at (window size) or how deep a contradiction it needs. Output: the
  solve path, a difficulty profile, entry points, clue usage, the hardest step.
- **M: model alone**: the model solves from the picture/sketch with extended thinking; we keep its
  reasoning (as returned; current models may summarise it) and its answer.
- **Hybrids** (the main bet):
  - **H1. Grounded narration.** D's exact solve path goes to the model, which narrates it as a
    solver would and marks where it would get stuck, what the clever moment is, and rates it.
    The model never tracks the grid; it judges.
  - **H2. Propose and verify.** The model solves by proposing one deduction at a time ("cell r,c
    is shaded because…"); clingo checks each against the puzzle (is it forced by what's known?).
    Logged: proposals rejected (tempting traps), steps where the model's first proposals fail and
    it needs several tries (bottlenecks, the "aha"), whether it ever needs to guess.
  - **H3. Techniques as programs.** After solving, the model writes each kind of step it used as
    a small rule program (in clingo or TypeScript) that our engine checks generalises. A puzzle
    whose solve needs a technique outside the standard library, or an unusual composition of
    known ones, is novel; one needing only the commonest technique repeatedly is rote.
  - **H4. Explanation compression.** Ask for the shortest explanation of the solution that a
    person could follow, then verify it with D (does following it solve the puzzle?). Short,
    verified explanations relative to puzzle size suggest elegance; long case analyses suggest a
    slog. (This echoes Schmidhuber's "interestingness is compression progress": the insight is
    the moment the rest becomes easy to describe.)
  - **H5. Surprise.** At each point of D's solve path, ask the model where the next deduction is
    and how sure it is. The key step is where the model's prediction is confidently wrong, yet
    D shows the move is forced: a measurable eureka.
  - **H6. Counterfactual fragility.** Remove, move or change one clue (D keeps the result valid
    or not); measure how the solve path changes. Elegant puzzles tend to be tight: each clue
    carries weight, and small changes break or trivialise them.

## Ground truth

Interest can't be measured from inside; each instrument is validated against:
1. **Acclaimed vs. ordinary**: the reference sets (Witness panels, Glimmith windows, acclaimed
   collections) against our generator's random output for the same types and sizes.
2. **Planted flaws**: puzzles we make bad on purpose: trial-and-error heavy (unique but needs
   guessing), red herrings (a clue that only matters at the end), trivial (one technique
   repeated), slogs (many hard steps). An instrument must flag these.
3. **People**: existing ratings rather than a panel of our own: Puzzle Square JP's like and solver
   counts per puzzle (bay-puz/psjp publishes them, MIT; the puzzles are puzz.link links we can
   convert), where likes per solver is a quality signal and solver counts a difficulty one; later,
   the site's own data: likes, solves, completion and abandonment, solve time.

## Tests

| # | Test | Passes if |
|---|---|---|
| T1 | **Discrimination**: each instrument's score separates acclaimed from random puzzles (per type) | AUC ≥ 0.75 on held-out puzzles |
| T2 | **Flaw detection**: each planted-flaw kind is flagged | ≥ 80% recall per kind, few false alarms on acclaimed |
| T3 | **Agreement with people**: correlation with Puzzle Square JP's likes per solver (same type, similar size) | Spearman ρ ≥ 0.4 |
| T4 | **Stability**: the same puzzle scored 3 times (model instruments) | spread small against differences between puzzles |
| T5 | **Grounding**: model claims checked by clingo (H2/H4) | report the error rate; instruments whose claims are often false are discounted |
| T6 | **Key-step location**: does the instrument find the step people name as the "aha" (from the panel, or the acclaimed puzzle's published commentary when there is one) | top-3 hit rate ≥ 60% |
| T7 | **Cost and speed** per puzzle | cheap enough to score every AI-creator candidate (target ≤ $0.05 for the scoring used in selection) |
| T8 | **Ablation**: D alone vs. M alone vs. each hybrid vs. a combined model on T1–T3 | which earns its cost |
| T9 | **Downstream**: AI-creator puzzles chosen by the best scorer vs. by today's proxy, A/B on the site | more likes and completions per puzzle |

## Order of work

1. **D, the deduction solver** (no AI cost): solve paths and profiles for every type; run it over
   the reference sets and our own puzzles. Also needed for flaw planting (T2) and H1/H2/H5/H6.
2. **Datasets**: per type, acclaimed vs. random vs. planted flaws, held-out splits; Puzzle Square
   JP's rated puzzles converted to our format.
3. **Pilot on one type** (Star Battle or Slitherlink: good acclaimed sources, mid-size grids):
   D, M, H1, H2, H4 on ~30 acclaimed + ~30 random + planted flaws, 3 samples each for model
   instruments; T1, T2, T4, T5, T7. Budget about $25.
4. **Expand** to the instruments and types that pass; fit a combined scorer; T3 on the Puzzle Square JP ratings; plug the scorer into the AI creators' candidate selection (puzzles/ai/week.ts's
   pluggable scoring); T9 on the site.

## Sources

- ARC-AGI-3: A New Challenge for Frontier Agentic Intelligence, arXiv 2603.24621.
- ARC Prize 2025 Technical Report, arXiv 2601.10904.
- OpenAI, "How enabling two settings tripled our ARC-AGI-3 scores" (July 2026).
- Twin: Playing an Unknown Game with a Test-Time Digital Twin, arXiv 2608.14490.
- PRO-LONG: Programmatic Memory Enables Long-Horizon Reasoning, arXiv 2607.20064.
- Graph-Based Exploration for ARC-AGI-3 Interactive Reasoning Tasks, arXiv 2512.24156.
- Pelánek, difficulty rating of Sudoku (see docs/panel-design.md).
- Schmidhuber, "Driven by compression progress" (2009): interestingness as compression progress.
