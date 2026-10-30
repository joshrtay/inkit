# Size and ceiling audit (research review 2026-10-24, idea 2): within type on Puzzle Square JP, what
# the cell count alone scores against the rating, and how well puzz.link's raters agree with PSJP's
# on the same puzzles (the inter-rater line), with cells beside each. With a third argument it
# writes those lines as difficulty-baselines.json, which the difficulty reports print beside every
# within-type figure: cells alone (a score below it reads nothing but size) and the ceiling, the
# square root of the raters' agreement (what a perfect score would reach against one rater, by
# classical test theory; approximate on 1 to 5 scales).
#
#   python3 -I size_audit.py <psjp-full/converted/> <psjp/puzzlink-psjp.json> [difficulty-baselines.json]
import json, collections, random, sys, os, glob, re
from statistics import mean

def rank(x):
    o = sorted(range(len(x)), key=lambda i: x[i]); r = [0.0] * len(x); i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and x[o[j + 1]] == x[o[i]]: j += 1
        for k in range(i, j + 1): r[o[k]] = (i + j) / 2
        i = j + 1
    return r

def sp(a, b):
    ra, rb = rank(a), rank(b); ma, mb = mean(ra), mean(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** .5
    return num / den if den else float("nan")

def boot(a, b, n=200):
    random.seed(1); v = []
    for _ in range(n):
        s = [random.randrange(len(a)) for _ in a]; v.append(sp([a[i] for i in s], [b[i] for i in s]))
    v = sorted(x for x in v if x == x); return v[int(.025 * len(v))], v[int(.975 * len(v))]

def norm(link):
    m = re.search(r"\?(.*)$", link or ""); return m.group(1) if m else (link or "")

conv, pl_file = sys.argv[1], sys.argv[2]
out = {}
print("PSJP rated puzzles, all of psjp-full (variation 0): Spearman of cell count with the PSJP rating, within type")
psjp, tot = {}, []
for f in sorted(glob.glob(os.path.join(conv, "*.jsonl"))):
    t = os.path.basename(f)[:-6]
    rows = [json.loads(l) for l in open(f)]
    for r in rows:
        if r["meta"].get("difficulty") is not None:
            psjp[norm(r["meta"].get("link"))] = (r["genre"], r["meta"]["difficulty"], r["spec"]["size"][0] * r["spec"]["size"][1])
    rows = [r for r in rows if r["meta"].get("difficulty") is not None and r["meta"].get("variation", 0) == 0]
    if len(rows) < 30: continue
    cells = [r["spec"]["size"][0] * r["spec"]["size"][1] for r in rows]; dif = [r["meta"]["difficulty"] for r in rows]
    rho = sp(cells, dif)
    if rho != rho: continue
    lo, hi = boot(cells, dif); tot.append((rho, len(rows)))
    out[t] = {"n": len(rows), "cells": round(rho, 2), "cellsInterval": [round(lo, 2), round(hi, 2)]}
    print(f"  {t:20} n={len(rows):5}  cells {rho:.2f} ({lo:.2f}, {hi:.2f})  distinct sizes {len(set(cells))}")
print(f"  n-weighted {sum(r * n for r, n in tot) / sum(n for r, n in tot):.2f}")

pairs = collections.defaultdict(list)
for r in json.load(open(pl_file)):
    hit = psjp.get(norm(r.get("pzv_override") or r.get("pzv"))) or psjp.get(r.get("pzv"))
    if hit and r.get("difficulty") is not None: pairs[hit[0]].append((r["difficulty"], hit[1], hit[2]))
print("\npuzz.link rating vs PSJP rating on the same puzzles (inter-rater), and cells with each")
tw = []
for g, v in sorted(pairs.items(), key=lambda x: -len(x[1])):
    if len(v) < 20: continue
    a, b, c = zip(*v); raters = sp(a, b); tw.append((raters, sp(c, b), len(v)))
    print(f"  {g:20} n={len(v):4}  raters {raters:.2f}  cells~PSJP {sp(c, b):.2f}  cells~puzz.link {sp(c, a):.2f}")
    if len(v) >= 50 and g in out:
        out[g].update(raters=round(raters, 2), ratersN=len(v), ceiling=round(max(raters, 0) ** .5, 2))
N = sum(x[2] for x in tw)
print(f"  n-weighted raters {sum(x[0] * x[2] for x in tw) / N:.2f}  cells~PSJP {sum(x[1] * x[2] for x in tw) / N:.2f}")

if len(sys.argv) > 3:
    with open(sys.argv[3], "w") as f:
        json.dump({"source": "psjp", "note": "cells: Spearman of cell count with the PSJP rating within type, all rated puzzles (variation 0). raters: puzz.link vs PSJP on shared puzzles (50+ only). ceiling: sqrt(raters). size_audit.py, 2026-10-24.", "types": out}, f, indent=1, ensure_ascii=False)
        f.write("\n")
