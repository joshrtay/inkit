# Research: how strong is each setter? (Puzzle Square JP)

The question from research-state.md: does research-reputation.md's creator formula, run on Puzzle
Square JP's setters, give a setter score worth keeping? **Yes.** The score is stable, it predicts a
setter's later puzzles, and it goes into the puzzle catalog as its own table. Run 2026-10-15 on the
site dump of 2026-10-07. CPU only, about a second.

Script: `puzzles/difficulty/setter-score.ts`. Tables: `references/catalog/` (local only; others'
puzzles and accounts, never published).

## Method

The data is bay-puz/psjp's `data.json`: 75,002 puzzles, each with its type (`kind`), whether it's a
variant (`variation`), the setter's own difficulty level 1–5, the setter's account id, likes
(`favorite_n`) and solves (`answered_n`). The 74,952 puzzles with at least one solve count. Likes
are capped at solves.

- **Par:** the pooled like rate (likes ÷ solves) of the puzzle's cell, type × variant × level. A
  cell with under 20 puzzles falls back to type × variant, then to the whole site. Holding the level
  fixed this way is what "difficulty held fixed" means here.
- **Per puzzle:** `q = (likes + 10·par) / (solves + 10)`, a Bayesian average that needs about ten
  solves before a puzzle moves far from par. Its standing is `rel = ln(q / par)`, a log ratio, so
  types and levels with different like rates compare.
- **Per setter:** `score = Σ rel / (puzzles + 5)`, a second shrinkage toward par, so a setter needs
  about five puzzles to stand out. `multiple = exp(score)` reads as "likes at this multiple of par".
  `low` and `high` are two standard errors either side.
- **Weights:** every like counts once. research-reputation.md weighs each solver by trust and
  closeness to the setter, but the site gives counts, not who liked.

## Results

| Check | Result |
|---|---|
| Setters | 868; 470 with 10+ puzzles |
| Split-half (each setter's puzzles alternately by date) | Spearman 0.91 (470 setters, 5+ each); 0.96 (261, 20+ each) |
| Earlier predicts later (score before the cut, each later puzzle's `rel`) | 0.41 (cut 2024-01-01, 23,163 puzzles, 177 setters); 0.43 (cut 2025) |
| Share of puzzle variance that is the setter's (ICC) | 0.22 with level held; 0.17 with level and year held; 0.25 with nothing held |
| Ranking against nothing held / level and year held | 0.93 / 0.85 |
| Setters clearly above / below par (10+ puzzles, range clear of 1) | 136 / 191 |
| Middle 80% of setters | 0.81× to 1.22× par; the best about 1.4–1.7× |
| Score against number of puzzles | 0.01: volume isn't quality. The three most prolific (6,300, 5,300, 2,900 puzzles) sit at 0.78–0.96× |
| Like rate by level, 1 to 5 | 0.117, 0.146, 0.159, 0.161, 0.166 |

What it means: setters differ, steadily, by more than chance. The forward check is the one to
trust: split-half alternates neighbouring puzzles, which share an era and an audience, so 0.91 flatters.

## Caveats

- **Likes, not quality.** Setters whose puzzles draw more solves per puzzle score lower (−0.30
  across setters; only 0.07 per puzzle against log solves). A wider audience likes less, so part
  of a low score may be reach, not quality.
- **Year drift.** The site's like rates move with time. Holding the year as well changes the
  ranking a little (0.85) and lowers the setter share to 0.17; the forward check holds for the 2024
  cut (0.41) and drops for 2025 (0.34). Not held by default, because a setter's era is partly who
  they are; the summary carries both.
- **No solve check on likes, no solver weights, no collusion check.** All are in the reputation
  doc's design and impossible with counts.
- **Only Puzzle Square JP.** Logic Masters' beauty ratings cover 5 corpus puzzles; puzz.link's
  "setter" is a collection; Janko and Nikoli name none. Those keep research-state.md's source-level
  priors.

## The tables (field guide)

JSON lines, which DuckDB reads directly (`read_json_auto('references/catalog/psjp-setters.jsonl')`).
Recompute rather than edit: the raw counts are in the puzzle table, and the score follows the
formula's parameters (stored in the summary).

**`psjp-setters.jsonl`**, one row per setter (868):

| Field | Meaning |
|---|---|
| `setter` | `psjp:<account id>`, the same form as the human corpus's `setters` |
| `user` | the account id |
| `puzzles`, `solves`, `likes` | totals over their puzzles with a solve |
| `score` | pooled, shrunk log ratio to par (0 = par) |
| `multiple`, `low`, `high` | `exp(score)` and two standard errors either side |
| `genres` | their three most-set types, with counts |

**`psjp-puzzles.jsonl`**, one row per puzzle (74,952):

| Field | Meaning |
|---|---|
| `psjp` | the site's puzzle id |
| `key` | the human corpus's spec key, where the puzzle is in it (11,990), else null |
| `setter` | `psjp:<account id>` |
| `kind`, `type`, `variation`, `level` | the site's type id, its English name, variant flag, setter's level 1–5 |
| `registered` | when it was posted |
| `likes`, `solves` | as on the site (likes capped at solves) |
| `par`, `q`, `rel` | the cell's like rate, the puzzle's shrunk like rate, `ln(q / par)` |

**`psjp-setters.summary.json`**: the parameters (`m`, `m2`, `minCell`, the dump's date) and every
check above.

## In the catalog

Join by `setter` and by `key`. A puzzle's own `rel` is its quality evidence; the setter's `score`
is the prior when it has few solves, the second level of the quality hierarchy in research-state.md
("its setter's; else its source's and type's"). Tests split by author can use `setter` as is.

## Rerun

```bash
node puzzles/difficulty/setter-score.ts
```

Reads `references/psjp/data.json` and `kind.json` (and the human corpus, for `key`); a fresh dump
from bay-puz/psjp just needs a rerun.
