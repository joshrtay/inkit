"""Merge MATH and NuminaMath-1.5 into one problem table with shared category columns.

    python3 -I puzzles/mathbank/build_meta.py <data dir> <out.parquet>

<data dir> holds hendrycks_math/ and NuminaMath-1.5/ as copied from
gs://inkit-research-ml/datasets/{math,numinamath}/ (the data is private: never commit it).
Columns: id, dataset, source, topic, level, question_type, synthetic, problem, solution, answer.
  topic: MATH's subject or NuminaMath's problem_type, lower-cased with underscores.
  level: MATH's 1-5; empty for NuminaMath (it has none).
"""
import glob, os, re, sys
import pyarrow as pa, pyarrow.parquet as pq

def boxed(sol):
    # the last \boxed{...} in a MATH solution, braces balanced
    i = sol.rfind('\\boxed')
    if i < 0: return ''
    j = sol.find('{', i)
    if j < 0: return ''
    depth = 0
    for k in range(j, len(sol)):
        depth += {'{': 1, '}': -1}.get(sol[k], 0)
        if depth == 0: return sol[j + 1:k]
    return ''

def norm(s): return re.sub(r'[^a-z0-9]+', '_', (s or '').lower()).strip('_')

def main(data, out):
    cols = {k: [] for k in 'id dataset source topic level question_type synthetic problem solution answer'.split()}
    def add(**r):
        for k in cols: cols[k].append(r[k])
    for f in sorted(glob.glob(f'{data}/hendrycks_math/*/*.parquet')):
        split = 'test' if os.path.basename(f).startswith('test') else 'train'
        t = pq.read_table(f).to_pylist()
        for i, r in enumerate(t):
            lv = re.search(r'\d', r['level'] or '')
            add(id=f"math/{split}/{norm(r['type'])}/{i}", dataset='math', source='math_' + split,
                topic=norm(r['type']), level=int(lv.group()) if lv else None, question_type='',
                synthetic=False, problem=r['problem'], solution=r['solution'], answer=boxed(r['solution']))
    n = 0
    for f in sorted(glob.glob(f'{data}/NuminaMath-1.5/data/*.parquet')):
        for r in pq.read_table(f).to_pylist():
            add(id=f'numina15/{n}', dataset='numina15', source=r['source'] or '', topic=norm(r['problem_type']),
                level=None, question_type=norm(r['question_type']), synthetic=bool(r['synthetic']),
                problem=r['problem'], solution=r['solution'] or '', answer=r['answer'] or '')
            n += 1
    pq.write_table(pa.table(cols), out)
    print(len(cols['id']), 'problems ->', out)

if __name__ == '__main__':
    main(*sys.argv[1:3])
