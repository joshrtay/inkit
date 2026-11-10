"""Embed the problem table's problems with an open model (bge-small, 384 numbers each), resumably.

    python3 -I puzzles/mathbank/embed.py <meta.parquet> <out dir> [--dataset math] [--shard k --of n]

Writes <out dir>/chunk-<start>.npy (float16, unit length) for each 4,096 rows of the table, in
table order, skipping chunks already there, so a stopped run carries on. Run n shards at once
(each takes every n-th chunk) to use n processes; join with search.py's loader.
"""
import argparse, os, sys
import numpy as np, pyarrow.parquet as pq

MODEL = 'BAAI/bge-small-en-v1.5'
CHUNK = 4096

MAX_TOKENS = 256  # a problem's opening carries its topic; the tail is often Asymptote code

def model(threads=1):
    from fastembed import TextEmbedding
    m = TextEmbedding(MODEL, threads=threads)
    m.model.load_onnx_model()
    m.model.tokenizer.enable_truncation(max_length=MAX_TOKENS)
    return m

def embed(m, texts):
    # batches pad to their longest text, so embed in length order and put the rows back
    order = sorted(range(len(texts)), key=lambda i: len(texts[i]))
    v = np.stack(list(m.embed([texts[i] for i in order], batch_size=32))).astype(np.float32)
    out = np.empty_like(v); out[order] = v
    return (out / np.linalg.norm(out, axis=1, keepdims=True)).astype(np.float16)

def main():
    a = argparse.ArgumentParser()
    a.add_argument('meta'); a.add_argument('out')
    a.add_argument('--dataset'); a.add_argument('--shard', type=int, default=0); a.add_argument('--of', type=int, default=1)
    a.add_argument('--threads', type=int, default=1)
    o = a.parse_args()
    t = pq.read_table(o.meta, columns=['dataset', 'problem'])
    rows = range(t.num_rows)
    if o.dataset:
        ds = t.column('dataset').to_pylist()
        rows = [i for i in rows if ds[i] == o.dataset]
        lo, hi = rows[0], rows[-1] + 1
    else:
        lo, hi = 0, t.num_rows
    problems = t.column('problem')
    os.makedirs(o.out, exist_ok=True)
    m = model(o.threads)
    starts = list(range(lo, hi, CHUNK))[o.shard::o.of]
    for s in starts:
        path = f'{o.out}/chunk-{s:07d}.npy'
        if os.path.exists(path): continue
        texts = problems.slice(s, min(CHUNK, hi - s)).to_pylist()
        v = embed(m, texts)
        np.save(path + '.tmp.npy', v); os.replace(path + '.tmp.npy', path)
        print('done', s, flush=True)

if __name__ == '__main__':
    main()
