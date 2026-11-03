# Math problem bank

Search 908,715 competition-style math problems by meaning, keywords and category, for
inspiration when an LLM or a person writes new problems and puzzles.

The data is private and lives only in the bucket (never commit it):

    gs://inkit-research-ml/datasets/math/        MATH (Hendrycks), 12,500 problems, MIT
    gs://inkit-research-ml/datasets/numinamath/  NuminaMath 1.5 / CoT / TIR, Apache-2.0
    gs://inkit-research-ml/datasets/mathbank/    the bank: meta.parquet + vec-math/ + vec-numina15/

## Use

    gsutil -m cp -r gs://inkit-research-ml/datasets/mathbank /tmp/mathbank
    pip install fastembed pyarrow numpy
    python3 -I puzzles/mathbank/search.py /tmp/mathbank "a triangle inscribed in a circle" --k 5
    python3 -I puzzles/mathbank/search.py /tmp/mathbank --like math/test/number_theory/5
    python3 -I puzzles/mathbank/search.py /tmp/mathbank --grep pigeonhole --source olympiads --real
    python3 -I puzzles/mathbank/search.py /tmp/mathbank "invariant" --topic combinatorics --qtype proof --json

`--json` prints one object per line (id, dataset, source, topic, level, question_type, synthetic,
problem, answer, similarity), the form an LLM tool call wants.

## Categories

| column | MATH | NuminaMath-1.5 |
|---|---|---|
| topic | 7 subjects (algebra, geometry, number_theory, ...) | problem_type (algebra, geometry, combinatorics, inequalities, logic_and_puzzles, calculus, ...) |
| level | 1-5 | none |
| source | math_train / math_test | cn_k12, olympiads, orca_math, synthetic_math, aops_forum, amc_aime, ... |
| question_type | none | math_word_problem, mcq, proof |
| synthetic | false | true for LLM rewrites of other problems |

## Vectors

`embed.py` embeds each problem's text (its first 256 tokens) with BAAI/bge-small-en-v1.5
(384 numbers, unit length, float16), in chunks of 4,096 table rows. These vectors capture what a
problem is *about* (its objects and setup), not the idea that solves it: "chessboard parity" finds
grid colouring problems, not parity arguments. Key-idea vectors (an LLM's short, domain-free
description of each solution's main step) are the planned next layer for that.

Rebuild: `build_meta.py` (table), then `embed.py` locally for MATH, or on Cloud Batch for
NuminaMath (about 40 minutes on 8 spot n2-highcpu-8 VMs at a time, under $1):

    puzzles/cloud/run-batch.sh puzzles/mathbank/embed.py mathbank-embed --tasks 24 --parallel 20 \
      --machine n2-highcpu-8 --hours 2 --input datasets/mathbank:mathbank \
      --env "PY_DEPS=fastembed==0.9.1 pyarrow numpy" \
      --args "mathbank/meta.parquet /mnt/disks/inkit/results/mathbank-vec/vec-numina15 --dataset numina15 --threads 8"

Data caveats: NuminaMath solutions are mostly GPT-4o's and unchecked; some NuminaMath "problem"
fields include a solution; synthetic rows are rewrites. All of it is common model training data.
