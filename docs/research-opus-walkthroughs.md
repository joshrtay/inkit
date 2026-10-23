# Opus walkthroughs: asking for the whole human-style solve

2026-10-22. Code: `puzzles/difficulty/opus-walkthrough.ts` (sample, ask, unique, solver, report) and
`puzzles/difficulty/walkthrough_net.py` (the network's greedy order). Results, prompts and the full
walkthroughs are local-only, in `references/ml/opus-human/walk*` and the bucket
(`gs://inkit-research-ml/private/refs/ml/opus-human/`), because the puzzles are Janko's and Puzzle
Square JP's.

## The question

The earlier test (`research-opus-human-moves.md`) asked Opus for one next move per state. Josh
asked: what if Opus is told to think like a human and write out the whole reasoning sequence, the
way that would teach a person? The prompt asks for the walkthrough from the current state to the
finished grid, in the order an experienced person would most likely take, each step with its
moves, why, the technique and a coach's hint, and then the puzzle's key ideas, difficulty and
elegance (1–10).

## What ran

- 20 held-out Janko states (the person's own, mid-solve, 8–60 of their moves still to come), 14
  types, at most 2 a type, from `opus-human.ts`'s 400 items so the one-move answer on the same
  state is known. Scored against the person's recorded order, beside the relations-tuned network
  (`relations-tuned-2026-10-20`, greedy) and our solver's order.
- Puzzle Square JP pairs (10×10, ≥ 100 solvers, same site difficulty, one much liked per solver
  and one little liked), walked from the empty grid, for elegance against likes. 15 of the 24 have
  a walkthrough (8 Akari, 7 Slitherlink); see "Cost and what's missing".
- Opus 5.5, reasoning effort medium: the Janko states and the first 6 Akari through OpenRouter, the
  rest straight from Anthropic (same model and price). Every move is checked against the
  solution, which clingo proves unique.

## Results

**The moves are right.** 99% of 722 moves on Janko states match the solution (1% wrong; 18 of 20
walkthroughs have no wrong move; 15 of 20 finish the grid). Puzzle Square JP from the empty grid:
98% of 1,959 moves right and none wrong (the rest restate cells already decided); all 15 that
wrote a walkthrough finish the grid, Slitherlink included.

**The order follows people better than the one-move prompt, the network and the solver.** On the
same 20 states (95% Wilson intervals):

| predictor | first move in the person's next 3 | along the way (first 20 moves): in next 3 | along the way, only marks people make | Spearman with the person's order |
|---|---|---|---|---|
| Opus walkthrough | **50%** (30–70) | **36%** (31–42) | **47%** (41–52) | **0.55** |
| Opus one move | 30% (15–52) | – | – | – |
| Network (relations-tuned), greedy | 45% (26–66) | 32% (27–36) | 40% (35–46) | 0.35 |
| Solver's order | 5% (1–24) | 13% (9–17) | 44% (39–50) | 0.28 |

"Along the way" repeats the one-move measure along the sequence: each predicted move counts if it
is among the person's next 3 from where the predicted order has got to. "Only marks people make"
drops moves on marks the person never writes (people rarely mark "no bulb" or every Fillomino
wall), which is where much of the gap to people comes from.

Paired on the first move, the walkthrough is right everywhere the one-move prompt is, and on 4
more states (10 vs 6; sign test p = 0.125). That is a hint, not a result: 20 states.

By type, the walkthrough is close to the person on Hidoku (13 of 13 along the way, Spearman
0.96), Nurikabe (0.97 on order; 17 of 20 on people's marks), Easy as ABC and Skyscrapers. It
misses on Nonogram (0 and 2 of 20; Spearman −0.22 and 0.09) and Numberlink (−0.21), and on
Fillomino and Slitherlink the moves it writes first are walls and lines the person never marks.

**Elegance: no sign that Opus sees what people like; difficulty, yes.** On the 15 Puzzle Square JP
puzzles (8 Akari, 7 Slitherlink), Spearman of Opus's difficulty with the site's is 0.80 (Akari
0.92, Slitherlink 0.63). Its elegance with likes per solver is only 0.31 (Akari 0.32, Slitherlink
0.14), down from 0.70 on the first 6 Akari. Elegance tracks the site's difficulty more than likes
(Akari 0.64, Slitherlink 0.78), and the scores barely spread: 4 to 7, 13 of 15 at 6 or 7. The
pairs, which hold type and difficulty fixed, are the real test: of the 4 complete pairs Opus
wins none outright, ties three (7–7, 6–6, 7–7) and gets one the wrong way (4 for the liked Akari
1572, 5 for 1890), 1.5 of 4 counting ties as half. So asked cold, Opus's elegance is roughly
"harder is nicer"; it doesn't
separate a much-liked puzzle from a little-liked one of the same difficulty. Small n (4 pairs),
but nothing here argues for using it as an elegance signal.

**Techniques are not a vocabulary.** 151 distinct technique names over 205 steps; the top ones
repeat 3–5 times ("only one way to light a cell", "seal a completed island", "forced
continuation"). Using them as labels would need clustering.

## Four walkthroughs

Short excerpts; the full ones (with grids) are in `walk-samples.md` in the bucket.

- **Hidoku (Jürgen Helbig), the best case.** Opus's 13 moves are exactly the person's 13 in nearly
  the same order. It starts at 15 ("seven of its eight neighbours are filled, so 16 must go in
  r2c4"), cascades to 3 and 2, then uses one idea three times: a cell with only one empty
  neighbour must be the end of a chain, which pins 27, 24 and 17. Hints like "the bottom-left
  corner has very few empty neighbours: what kind of number can sit there?" are what a coach would
  say. Elegance 7: "the endpoint idea comes back neatly three times".
- **Nurikabe (Otto Janko), right order, different bookkeeping.** Opus first writes walls around
  the 1s and seals every finished island, which the person never marks. From there it matches
  the person's moves 1 to 22 almost in order: the 5 has only one way out, the 4 on the right edge
  likewise, a cell touching two islands is wall, a trapped wall needs its escape. Its one wrong
  move (r7c2 island) is in the last, counting step.
- **Nonogram (Angela Janko), the failure.** Every move is right and the reasoning is clean ("row 4
  already shows two complete-looking blocks"), but Opus works top-down from row 4 while the person
  went bottom-up: Opus's first step is the person's moves 12, 20 and 27 and its last is the
  person's move 1. On line puzzles, which line a person looks at first is a habit the prompt can't
  see.
- **Akari from the empty grid (Puzzle Square JP 1572).** Two steps clear every neighbour of the 16
  zeros, then a chain of "only one cell can light it" steps, each with a hint ("r1c2, squeezed
  between two clues: where could its light come from?"). It finishes with no wrong move. This is
  the hint text Aim 4's hints step needs, at about $0.20 a puzzle.

## Cost and what's missing

$18.12 in all. The pilot: $3.57 for the 20 Janko states (14 seconds to 3.5 minutes each,
$0.03–0.51), $1.25 for 6 Akari, and $1.29 lost on two empty-grid Slitherlinks that spent all
32,000 tokens thinking. The elegance set's finish (`INKIT_ANTHROPIC_KEY`, `WALK_TOKENS=64000`,
`WALK_CAP=20`): $11.98 for 2 more Akari ($0.28–0.47) and 11 Slitherlinks, of which 7 wrote a
walkthrough ($0.60–1.18, 4–8 minutes each) and 4 again thought through the whole 64,000 tokens and
wrote nothing ($5.14 lost). Not asked: 4 Akari and 1 Slitherlink, which the cap skipped (it
reserves the full token allowance per call). The four Akari would cost about $1.50 at
`WALK_TOKENS=32000`; the unparsed Slitherlinks would need a lower effort or a larger allowance and
look poor value.

## What it suggests

- Asking for the whole walkthrough is a better human-order predictor than asking for one move,
  and it beats the tuned network on these 20 states, while staying 99% correct. Worth a bigger
  test (100–200 states, about $25–50) before it changes the plan: the intervals still overlap the
  network's.
- It is the strongest source so far for hints and explanations, which the network doesn't give.
- Don't use Opus's elegance score as a proxy for what people like: it follows difficulty.
- Empty-grid 10×10 Slitherlink is expensive at effort medium (about $1 each, a third run out of
  tokens); walkthroughs from mid-solve states are much cheaper.
- The gap to people is mostly bookkeeping (what people bother to mark) and line-puzzle habits,
  not wrong reasoning.
