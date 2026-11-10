# Key ideas across math, chess and puzzles (pilot)

Can one vector space put a math proof, a grid deduction and a chess combination that rest on the
same idea next to each other? The pilot labels each item's key ideas at three levels and checks.

1. `sample.py`: 5,197 items: 2,500 math (MATH levels 3-5, NuminaMath contest problems), 500 text
   logic puzzles (NuminaMath logic_and_puzzles), 197 grid puzzles (Thinky dailies with their hint
   ladders; private), 2,000 Lichess puzzles (CC0; themes held out as a check).
2. `label.py`: a model (Haiku 5.5 by Message Batches, Sonnet 5.5 on 300 as a cross-check) gives
   1-3 ideas per item: a family from `families.py` (50), a one-sentence mechanism with no domain
   words, and the concrete step. Needs INKIT_ANTHROPIC_KEY.
3. `evaluate.py`: embeds problem text, step and mechanism (bge-small, as `puzzles/mathbank`) and
   measures how far the domains mix and whether cross-domain neighbours share a family.

Data and results: gs://inkit-research-ml/results/keyideas-pilot-2026-11-10/ (items, labels,
vectors, report.md, pairs.jsonl). The Lichess sample needs the first 200k rows of
database.lichess.org/lichess_db_puzzle.csv.zst; chess 1.10 parses it.
