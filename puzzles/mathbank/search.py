"""Search the math problem bank by meaning, keywords and categories.

    python3 -I puzzles/mathbank/search.py <bank dir> "a query or a whole problem" [options]
      --like ID          problems near this problem (its stored vector) instead of a query
      --grep REGEX       keep problems whose text matches (case-insensitive); alone, a keyword search
      --dataset math|numina15   --source S   --topic T   --level 1-5   --qtype proof|mcq|math_word_problem
      --real             leave out NuminaMath's synthetic rewrites
      --k N              results (default 10)   --json   one JSON object per line, for an LLM tool
      --solutions        print solutions too

<bank dir> is gs://inkit-research-ml/datasets/mathbank/ copied locally: meta.parquet plus
vec-<dataset>/chunk-*.npy from embed.py. Vectors are unit length, so similarity is a dot product.
Near-duplicates (the same problem reworded) are collapsed: a result within 0.97 of a better one is skipped.
"""
import argparse, glob, json, os, re, sys
import numpy as np, pyarrow.parquet as pq, pyarrow.compute as pc

def load_vectors(bank, n):
    # rows without a vector (a dataset not embedded yet) stay zero, so they never rank
    V = np.zeros((n, 384), dtype=np.float16)
    for f in glob.glob(f'{bank}/vec-*/chunk-*.npy'):
        s = int(re.search(r'chunk-(\d+)', f).group(1)); v = np.load(f)
        V[s:s + len(v)] = v
    return V

def main():
    a = argparse.ArgumentParser()
    a.add_argument('bank'); a.add_argument('query', nargs='?', default='')
    a.add_argument('--like'); a.add_argument('--grep')
    for f in ('dataset', 'source', 'topic', 'qtype'): a.add_argument('--' + f)
    a.add_argument('--level', type=int); a.add_argument('--real', action='store_true')
    a.add_argument('--k', type=int, default=10); a.add_argument('--json', action='store_true')
    a.add_argument('--solutions', action='store_true')
    o = a.parse_args()
    t = pq.read_table(f'{o.bank}/meta.parquet')
    keep = np.ones(t.num_rows, dtype=bool)
    def eq(col, val): return np.asarray(pc.equal(t.column(col), val).fill_null(False))
    if o.dataset: keep &= eq('dataset', o.dataset)
    if o.source: keep &= eq('source', o.source)
    if o.topic: keep &= eq('topic', o.topic)
    if o.qtype: keep &= eq('question_type', o.qtype)
    if o.level: keep &= eq('level', o.level)
    if o.real: keep &= ~np.asarray(t.column('synthetic').fill_null(False))
    if o.grep: keep &= np.asarray(pc.match_substring_regex(t.column('problem'), o.grep, ignore_case=True).fill_null(False))
    idx = np.flatnonzero(keep)
    V = None
    if o.like or o.query:
        V = load_vectors(o.bank, t.num_rows)
        if o.like:
            hit = np.flatnonzero(eq('id', o.like))
            if not len(hit): sys.exit(f'no problem {o.like}')
            q = V[hit[0]].astype(np.float32); idx = idx[idx != hit[0]]
        else:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from embed import model, embed
            q = embed(model(4), [o.query])[0].astype(np.float32)
        scores = V[idx].astype(np.float32) @ q
        order = idx[np.argsort(-scores)]; score = dict(zip(idx, scores))
    else:
        order, score = idx, {}
    shown, picked = 0, []
    for i in order:
        if shown >= o.k: break
        if V is not None and picked and max(float(V[i].astype(np.float32) @ V[j].astype(np.float32)) for j in picked) > 0.97:
            continue
        picked.append(i); shown += 1
        r = {c: t.column(c)[int(i)].as_py() for c in t.column_names}
        if i in score: r['similarity'] = round(float(score[i]), 3)
        if not o.solutions: r.pop('solution')
        if o.json: print(json.dumps(r, ensure_ascii=False)); continue
        tags = ' · '.join(str(x) for x in (r['source'], r['topic'], r['level'] and f"level {r['level']}", r['question_type'], r.get('similarity')) if x)
        print(f"== {r['id']}  ({tags})\n{r['problem'].strip()}")
        if r['answer']: print(f"Answer: {r['answer']}")
        if o.solutions: print(f"Solution: {r['solution'].strip()}")
        print()

if __name__ == '__main__':
    main()
