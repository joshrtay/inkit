# The walkthrough loop: refining Opus's explanations with the solver before training on them

2026-10-22. Proposed; the harness is built and dry-run, nothing paid has run. Code:
`puzzles/difficulty/walkthrough-loop.ts` (the loop, the solver's checks, the commands),
`puzzles/difficulty/walkthrough-core.ts` (the format, the feedback, the measures, the library;
tested in `walkthrough-core.test.ts`), `puzzles/difficulty/walkthrough-known.json` (named techniques
for the rediscovery check), `puzzles/difficulty/walkthrough-seed.json` (the seed library), and a `ceiling` option in `deduce.ts`. It builds on the walkthrough
pilot (`research-opus-walkthroughs.md`, `opus-walkthrough.ts`).

## The idea

The pilot asked Opus for a whole human-style walkthrough and found it a better predictor of
people's order than the one-move prompt, the tuned network and the solver (first move in the
person's next 3: 50% against 30%, 45% and 5%, on 20 states, so the intervals overlap), with 99% of
its moves right. Josh's idea is not to train on those walkthroughs as they come, but to iterate:
Opus writes one, probes the solver to see whether it should change, revises, and so on until the
walkthrough is complete and elegant, and only then is it used.

Three things have to be pinned down for that to be an experiment rather than a prompt: what a good
explanation is (so "complete and elegant" can be checked), how Opus and the solver talk, and how
much the solver may say before the walkthrough stops being Opus's (human-like) and becomes the
solver's. A fourth question rides on it: can Opus build up reusable insights across puzzles? That
one gets its own controlled test.

**The order of work** (Josh, 2026-10-22): the library test runs first. A reusable, minimal set of
insights has to exist before it's worth tuning how the solver talks to Opus, and the library test
needs only the audit and one fixed paradigm (A), not A/B/C's answer. It also shows early whether
the loop converges at all. A/B/C then runs with the best library frozen into the prompt (or none,
if the library test fails), so its walkthroughs are written in the library's terms.

## What a good explanation is

An explanation is a short list of **insights, not moves**. An insight is one piece of reasoning (a
technique applied to a few named clues) that unlocks part of the grid. It names the key cells it
decides; everything that follows from those by easy steps is left to the reader. "Explain logic,
not moves" then becomes checkable, because the harness has a reader: our solver limited to steps
up to a cost **ceiling**, applying every easy deduction (one clue, one row, one region at a time)
and nothing harder.

Each property is a check the harness runs (the audit, `audit` in `walkthrough-loop.ts`). The reader
starts from the state and fills in every easy step, then the first insight is judged where it has
got to, its right marks are added, the reader runs again, and so on; after the last insight the
reader must finish the grid.

| property | what it means | how it is checked |
|---|---|---|
| **Sound** | every mark an insight concludes is right | against the solution, which clingo proves is the only one |
| **Grounded** | each insight follows where it stands, not by a leap over something unsaid | some single solver step decides the mark there (a window, `deduce.ts` menus), or a short case split does (assume the other way: clingo's propagation alone, with no choices, contradicts it; the solver's own tier 2). Within one insight, a later mark is judged with the earlier ones known, so a short chain is fine. Neither: a *leap* |
| **Sufficient** | the insights plus the easy steps solve the puzzle | the reader finishes after the last insight; if not, the grid where it stops |
| **Minimal** | no insight is just an easy step | an insight is *trivial* if the reader had already reached every mark it concludes |
| **Cited** | the reason names the right clues | the cited cells against the cells of the cheapest forcing step's smallest reason (recall and precision). Soft: there can be several minimal reasons, so this is reported, never an error |
| **Human-ordered** | insights come in the order people find them | on Janko states and puzzles: the whole predicted order (reader's marks, insight's marks, …) and the insights' own marks against the person's recording, with the pilot's measures (first move in the next 3, along the way, Spearman) |
| **Reusable** | the techniques recur across puzzles | the library test below |

A walkthrough is **clean** when it is sound, grounded, sufficient and minimal. Compactness is
reported beside it: insights per puzzle, marks per insight, words. A case split is allowed (people
try cases when nothing simpler is left) but flagged in the feedback when simpler steps were open at
that point, and the share of marks that needed one is reported.

**The ceiling is the one real knob.** Per genre, it is the q-quantile of step costs on the solver's
cheapest-first path over the set's puzzles (`calibrate`, default q = 0.6: insights are then
roughly the dearest 40% of steps). A low ceiling is a beginner reader who needs more spelled out;
a high one an expert who needs only the key moments. That makes it the dial for hint difficulty
later. Because the reader is only the solver, every finished walkthrough can be re-audited at other
ceilings for free (`report --ceiling-q 0.4,0.6,0.8`), so the conclusions can be checked for
sensitivity without asking Opus again.

**What the check can't see.** It checks the marks and the cited clues, not the prose. A right mark
with a wrong reason passes unless its citation is off. So a blind read is part of the plan: Josh
reads 10 walkthroughs per arm, shuffled, and marks each insight as teaching logic or just naming a
move. And the check is only as good as the solver's techniques: where the solver needs search, a
human insight it lacks looks like a leap. `calibrate` reports per genre how much of the solver's
own path needs search; genres far above 10% (Nurikabe, Spiral Galaxies, parts of Fillomino on the
default techniques) are reported separately, with the genre's extra techniques (`deduce.ts` FINISH)
on by default for the reader and the menus (`LOOP_FINISH=0` turns them off).

## The harness

Opus can't run clingo, so a script sits between them: it sends the puzzle, reads back structured
insights, runs the solver and returns what it found as text.

**The format.** Each insight is JSON with `idea` (the reasoning, said so it would teach), `clues`
("r2c4", "row 3"), `concludes` (the key moves, in the pilot's move form, e.g.
`{"at": "r3c4", "value": "bulb"}`), `technique` and `hint` (a coach's nudge before it). The moves
make it checkable; the idea and hint make it a hint; the clues make the reason checkable.

**The solver's probes.** Three, all on the existing solver:

- *Reader*: `deduce` from what is known with the new `ceiling` option: cheapest first, every step
  at or under the ceiling, stopping where everything left costs more. (Deductions only grow as more
  is known, so the cheapest-first path takes every easy step before it stops.)
- *Menu*: `deduce`'s `menus` option at a state: every single step available, each with its cost,
  its smallest reason (the rule instances, mapped to their cells) and its kind.
- *Case split*: clingo on the whole program with what's known and the mark assumed the other way;
  unsatisfiable with no choices means a short case split settles it.

**Two harnesses** (Josh wants both tried):

1. **Fixed critique rounds** (`refine --mode rounds`). Opus writes a whole walkthrough (the
   *draft*, shared by every paradigm so they're paired), the harness audits it and sends one report,
   Opus revises the whole walkthrough, in the same conversation. It stops when the audit is clean,
   when a revision changes nothing the check can see, or after 4 revisions. Cheap, predictable, easy
   to compare round to round.
2. **Tool use** (`refine --mode tools`). Opus gets the solver as tools and calls them while it
   writes: `check_walkthrough`, `does_it_follow` (one move after some insights), `where_reader_stops`,
   and, depending on the paradigm, `nearby_steps` and `all_steps`. Each takes the insights so far, so
   Opus can explore ("would this follow if I said that first?"), the way a person tests ideas. At
   most 30 calls. It costs more, runs are less repeatable, and Opus may lean on the solver; that is
   what comparing the two modes measures.

## Three paradigms, as theories

The question is how much solver help can be given before the walkthrough's human shape is lost.
Each paradigm is a feedback policy; the same audit underlies all three (`feedback` in
`walkthrough-core.ts`).

| | A. Teacher (errors only) | B. Nearest solver alternatives | C. Control: full menu |
|---|---|---|---|
| Opus hears | which marks are wrong, which don't follow yet, which insights are trivial, where the reader stops (with the grid) | A's messages, plus at each wrong or ungrounded insight and at the stall the 3 valid steps nearest to what Opus was attempting (nearest by king's-move distance to its cells and cited clues) | A's messages, plus the whole menu at every insight and at the stall, cheapest first (15 shown) |
| Tools | check, does it follow, where the reader stops (answers only "follows", "wrong", "not yet") | A's, plus `nearby_steps` | B's, plus `all_steps` |
| Theory | All content comes from Opus, so its human-likeness is kept; the solver only falsifies, as a teacher marks a script | Opus chooses where to look (the human part) and the solver says what is true there. Phase 1's strongest predictor of people's next move was nearness, so feedback that stays near Opus's attention should keep the order human | Opus sees every cheap alternative, so it will tend to adopt the solver's cheapest-first order |
| Prediction | alignment with people holds at the draft's level; soundness and sufficiency rise; most rounds | fewer rounds, tighter walkthroughs (fewer, better-grounded insights), alignment within noise of A | cleanest and fastest, but alignment drops toward the solver's order (solver: 5% first move, 13% along the way) |

Reading the results: if B matches A on alignment and beats it on clean rate and rounds, nearness is
a safe amount of help. If C matches B on alignment too, nearness isn't what protects the human
shape (the menu doesn't pull Opus off its order), and the cheapest feedback that converges wins. If
every arm loses alignment against the draft, refinement itself costs human-likeness, and the right
thing to train on is the draft with only errors removed.

## The insight library: its own controlled test

**The hypothesis.** As it works through a sequence of puzzles, Opus can build a library of insight
sentences ("a 3 in a corner forces both outer edges"), reuse them, and refactor them, and this
makes explanations shorter, more consistent and more reusable without making them less human.

**Why the Phase 1 null doesn't settle it.** Phase 1 asked whether people's *move choices* need any
vocabulary beyond the solver's step kinds plus nearness; they didn't. That is the single-step grain.
An insight spans several steps, and a sentence can say graded, conditional things that Phase 1's
hard-rule library couldn't. The closest prior work is library learning in natural language (LILO,
Voyager's skill library) rather than DreamCoder or Stitch over programs. The test below also
measures directly whether the learned library is anything more than the solver's step kinds
renamed.

**Why it needs its own test.** Inside the A/B/C runs the library would be confounded with the
feedback (a better library might just mean better refinement) and with puzzle order (later puzzles
might simply be easier). So the library test holds everything else fixed: one paradigm, one puzzle
sequence, one ceiling, the same rounds, and varies only the library.

**Reasoning language that already exists: the seed.** People have named a lot of reasoning
already, and the test should find out whether that is enough before crediting Opus with
inventing anything:

- *Puzzles*: Sudoku's technique ladder (singles, locked subsets, pointing and claiming, X-Wing and
  fish, chains), with ratings built on it (Sudoku Explainer, HoDoKu); Nikoli's and the puzzle
  communities' technique pages per genre; Tatham's solvers, which grade deductions by level; our
  own guides (`src/guides/guides.ts`), with rules and worked examples per genre.
- *Logic and constraint solving*: unit propagation, Hall's theorem (a locked subset is k places for
  k values), implication chains (Sudoku's alternating inference chains are strong and weak links in
  an implication graph), proof by cases, proof by contradiction, uniqueness arguments.
- *Mathematical problem solving*: Pólya's heuristics, and Engel's strategies (invariants and parity,
  pigeonhole, the extremal principle, colouring, double counting).
- *Our solver*: the type-free rule primitives (`signatures.ts`: count, each-once, pattern,
  connect, size, sum, sight, order), which Phase 1 showed already cover single moves.

`walkthrough-seed.json` turns these into 20 **genre-free** entries (only place, only option,
saturated, satisfied, locked subset, intersection, cover and rows, forbidden pattern, must connect,
cut off, out of reach, no early loop, dead end, parity, extremes first, counting both ways, chain,
try and fail, both cases agree, one solution), each with its source and the primitives it rests on.
The seed is genre-free on purpose: genre techniques people have named (corner 3, adjacent 3s, clue
N) stay out of it, so the rediscovery check still asks whether Opus can turn general reasoning
into the genre techniques people use. The seed's text counts in the description length like any
entry's, so a seeded library has to earn its own bits.

**The arms** (`library <genre> --arm …`), per genre:

- **none**: no library. The control.
- **grow**: the library is in the prompt (the genre's entries, most used first, up to 40); Opus is
  asked to use an entry when it really fits (`uses`) and otherwise to write in its own words and
  propose an entry (`new_entry`) if the pattern could come back. After each puzzle its final
  walkthrough is absorbed (examples added, new entries created). Every 10 puzzles Opus refactors:
  merges near-duplicates (a generalisation is a merge with a slot), splits overloaded entries, rewords,
  drops rarely used ones. A refactor is kept only if it doesn't increase the description length.
- **frozen**: grow's library as it stood after the last training puzzle, fixed, on the held-out
  puzzles. This is the transfer test: does a library learned on some puzzles help on new ones?
- **seed-only**: the seed, fixed, on the held-out puzzles. Is existing reasoning language enough
  by itself?
- **seeded**: grow, but starting from the seed. What does Opus add to existing language, and does
  it specialise the general patterns into genre techniques?
- **seeded-frozen**: seeded's library after training, fixed, on the held-out puzzles.

The comparisons that answer the questions: seed-only against none (does existing language help?),
frozen against none (does a learned one?), seeded-frozen against seed-only and against frozen (is
existing language plus learning better than either?). A fixed library still records which entries
were used and which insights proposed a new one, so the description length and the share of
insights the library couldn't express are comparable across arms.

**The sequence.** Whole Janko puzzles from the empty grid (side ≤ 8), so the person's whole
recorded order is there for alignment and the walkthroughs cover whole solves. Per genre, 25
training puzzles from the training split in order of the person's solve length (short first, a rough
curriculum), then 10 held-out puzzles from the test split. Genres with techniques people have
named and a solver that rarely needs search: Akari, Slitherlink, Skyscrapers (Nurikabe if the
calibration says its check is good enough). The paradigm is A by default, because it leaves all
the content to Opus; if A/B/C has run first, the winner.

**An entry**: id, name, a sentence template with slots, when it applies, what it concludes, and
its examples (each the insight text that used it, with puzzle and position).

**The score: two-part description length.** Library bits (each entry's text) plus each insight
written with it: log2 of the number of choices to say which entry, then the insight's own text
given the entry's template (compressed size of template + text, less the template's own), or its
text alone for an insight using no entry. gzip stands in for a code length. This is
elegance-by-compression again, at the insight grain, where it has a fairer chance than at the step
grain.

**Measures.**

- On the held-out puzzles, frozen and grow against none: clean rate, rounds to clean, insights and
  words per puzzle, alignment (along the way, Spearman), split share.
- Over the training sequence: reuse rate (share of insights naming an entry), library size, and
  description length per insight, by sequence position.
- *Renaming test*: the description length of the same insights with the solver's step kinds as the
  library (each insight filed under its cheapest forcing step's kind). If the learned library is no
  shorter, it is the step kinds renamed.
- *Rediscovery*: `report lib` writes a sheet with each genre's entries (shuffled, without arm or
  puzzle) beside the techniques solvers have already named (`walkthrough-known.json`: Akari's
  saturated clue, Slitherlink's corner and adjacent 3s, Skyscrapers' clue 1 and clue N, Nurikabe's
  unreachable cell, …). Josh, or a model that doesn't see the arms, matches them. Recall: known
  techniques found. Precision: entries that match a known technique or are new and hold up (every
  insight filed under them audited clean).

**How it could fail, and how we'd know.**

1. *It renames the solver's step kinds*: the description length is no better than the kinds
   library's.
2. *Rich get richer*: Opus forces entries onto reasoning they don't describe. Watch, as the library
   grows, the audit flags on insights that name an entry against those that don't, and alignment on
   the held-out puzzles.
3. *It's Opus's taste, not people's concepts*: few rediscoveries; the entries read as one model's
   phrasing.
4. *Bloat*: library size grows in step with puzzles (no reuse); refactors rarely kept.
5. *Refactor drift*: the score falls but meaning is lost in merges. The examples stay attached to
   entries, so a spot check reads the merged entry against its examples.

## Sample sizes

The pilot's 20 states gave first-move intervals of about ±20 points: too noisy to separate arms.

- **Library (first): 3 genres × (25 training + 10 held-out)**. Thirty paired held-out puzzles per
  comparison detect only large effects on clean rate (about 20 points); the library's own measures
  (reuse, description length over the sequence, rediscovery) carry more of the weight. If the first
  genre shows signal, the held-out set grows to 25 per genre.
- **A/B/C: 100 Janko states** (14 types, about 7 each, ≤ 100 cells, 8–60 of the person's moves still
  to come; `sample abc`). Every arm revises the same draft on the same states, so comparisons are
  paired by state with a bootstrap. First-move rates get about ±10 points; the along-the-way hit
  rate, pooled over about 2,000 moves but clustered by state, roughly ±4 points on a paired
  difference. The first 30 states run as stage 1 and their spread sets the final n.

## Costs

From the pilot: one walkthrough of a Janko state cost about $0.18 at effort medium ($3.57 for
20); a 10 × 10 Akari from the empty grid $0.21. A revision round sends the conversation again and
writes a whole walkthrough, so about $0.20–0.30. Estimates (to be replaced by stage 1's ledger):

| stage | what | estimate |
|---|---|---|
| 0 | dry run on the repo's example puzzles, the solver standing in for Opus | free (done) |
| 1 | library, first genre (Akari): grow and seeded over 25 training + 10 held-out puzzles; none, frozen, seed-only and seeded-frozen on the 10 held-out | ~$90 |
| 2 | library, two more genres | ~$180 |
| 3 | A/B/C, 30 states, the best library frozen in: draft, then rounds A, B, C (about 2 revisions each) | ~$50 |
| 4 | the other 70 states, same arms | ~$120 |
| 5 | tool use, A and the better of B and C, 50 states | ~$80 |

About $520 if every stage runs (dropping seeded-frozen saves about $8 a genre); each stage needs Josh's OK. `LOOP_CAP` (default $25) stops any one
command before its ledger would pass it. The cloud environment has no Anthropic key yet (the
OpenRouter credit ran out during the pilot); tool use needs the Anthropic key.

## Stop rules

- **The loop must converge** (checked in stage 1, on the library runs, with paradigm A): half the
  puzzles clean within 4 revisions. If not, the check or the prompt is wrong; fix before spending
  more.
- **After stage 3** (A/B/C's first 30 states): refinement must buy something, at least one arm 15
  points above the draft on clean rate. If not, stop; the drafts are as good as it gets.
- **The human-shape guard** (any stage). An arm whose along-the-way rate is below the draft's by
  more than 3 points, with the paired interval excluding zero, has lost the human shape; its
  walkthroughs aren't used for training, whatever their clean rate.
- **Tool use** runs only if rounds pass stage 3.
- **Library, after the first genre** (stage 1): stop the learned arms if reuse in the last third of
  the sequence is under 20%, or the description length per insight isn't falling, or the learned
  library saves under 5% against both no library and the step-kinds library (Phase 1's stop rule,
  carried over). If seed-only does as well as frozen and seeded-frozen, existing language is
  enough: keep the seed, skip library learning, and go on to A/B/C with the seed.
- **Library success**: a library arm beats none on the held-out puzzles (fewer words or insights at
  an equal or better clean rate, alignment within the guard), and at least 3 entries per genre that
  Opus made match named techniques blind, with no unsound entry among the most used. The winning
  arm's library is the one A/B/C uses.

## What gets trained on the result, later

Not part of this plan's spending, but what it feeds:

1. **The human move model.** Clean walkthroughs that pass the guard give a whole human-like order
   per puzzle (the reader's marks between the insights). Test: adding them to the relations-tuned
   network's fine-tune data raises agreement with people on held-out Janko states.
2. **Hints.** Each insight's hint and idea is a hint ladder at the ceiling's level.
3. **Techniques for the solver** (Aim 4 step 5 from the other side). Library entries are candidate
   techniques; one that compiles to a clingo rule, is proved sound and cuts case splits joins the
   solver.

## The code

    node --no-warnings puzzles/difficulty/walkthrough-loop.ts dry                      (free, the whole loop with a stand-in)
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts sample lib --genres akari,slitherlink,skyscrapers --train 25 --test 10
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts calibrate lib
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts library akari --arm grow (paid; then seeded, none, frozen, seed-only, seeded-frozen)
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts report lib
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts sample abc --n 100
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts calibrate abc
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts draft abc --limit 30     (paid)
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts refine abc --arm A       (paid; B, C; --mode tools)
    node --no-warnings puzzles/difficulty/walkthrough-loop.ts report abc --ceiling-q 0.4,0.8

Everything goes to `references/ml/walkloop/` (local only: the puzzles are Janko's) and the bucket.

**The dry run** (`dry`) runs every paradigm's rounds on the repo's example puzzles with a stand-in
for Opus built from the solver's own path. Its first draft is spoilt on purpose (a trivial insight
first, the second insight dropped, one wrong move), so the audit has something to find, and its
revision is the solver's walkthrough. On Akari, Slitherlink and Skyscrapers examples each paradigm
goes from a flagged draft to clean in one revision, B's and C's feedback list the right steps, the
library's refactor shortens its description length, and the tools answer. The Nurikabe example
shows the coverage limit above: the solver's windows find nothing from its start, so the stand-in
can't finish it without search.

## Open questions

- Janko alignment is one expert a puzzle; it can say an arm drifted, not that it matches people in
  general.
- The audit can't tell a leap from a human technique the solver lacks; per-genre search shares
  bound how much that matters.
- Opus both writes the library and refactors it. The description-length guard stops refactors
  that make it longer, not ones that change what an entry means.
- On small grids clingo's propagation refutes most true marks outright, so a leap there tends to
  show up as "only follows by a case split while simpler steps were open" (a note) rather than as
  ungrounded (an error). If stage 1 shows many such notes, the rule should tighten to: a case split
  counts as grounded only where no single step was open.
- Prompt caching would cut the repeated input in revision rounds (the conversation is resent each
  round); worth adding before stage 2.
