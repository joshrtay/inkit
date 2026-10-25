# What the solver misprices on one PSJP type (psjp-features.ts's rows): Spearman of every readout
# with the rating, beside cells alone, the clue counts and the solve's shape (step costs, tiers,
# case splits, the rule kinds steps use), with a bootstrap interval; how coarse the estimate is
# (its distinct values, ties by rating); and a small held-out ridge on the readouts, to see how far
# the solver's own features go before anything new is added.
#
#   python3 -I psjp_features.py <rows.jsonl>
import hashlib, json, sys, random
from collections import Counter, defaultdict
from statistics import mean
import numpy as np

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

def boot(a, b, n=300):
    random.seed(1); v = []
    for _ in range(n):
        s = [random.randrange(len(a)) for _ in a]; v.append(sp([a[i] for i in s], [b[i] for i in s]))
    v = sorted(x for x in v if x == x)
    return (v[int(.025 * len(v))], v[int(.975 * len(v))]) if v else (float("nan"), float("nan"))

rows = [json.loads(l) for l in open(sys.argv[1])]
ok = [r for r in rows if "profile" in r]
print(f"{len(rows)} puzzles, {len(ok)} with a solve ({sum(r['profile']['solved'] for r in ok)} finished); ratings {sorted(Counter(r['rating'] for r in ok).items())}")

kinds = Counter(k for r in ok for s in r["steps"] for k in s[3].split("+") if k)
top_kinds = [k for k, _ in kinds.most_common(12)]
feat = defaultdict(list)
for r in ok:
    p, st = r["profile"], r["steps"]
    costs = [s[0] for s in st] or [0]
    n = max(1, len(st))
    f = {
        "solver estimate": p["estimate"], "steps": p["steps"], "dSteps (soft-max)": p["dSteps"], "maxCost": p["maxCost"],
        "totalCost": p["totalCost"], "facts": p["facts"], "ruleLoad": p["ruleLoad"], "hardStretch": p["hardStretch"],
        "entryPoints": p["entryPoints"], "rounds": p["rounds"],
        "steps tier 1": p["perTier"][1], "steps tier 2+ (splits, search)": p["perTier"][2] + p["perTier"][3],
        "mean step cost": mean(costs), "90th pct step cost": float(np.percentile(costs, 90)),
        "steps cost 5+": sum(c >= 5 for c in costs), "share of steps cost 5+": sum(c >= 5 for c in costs) / n,
        "facts per step": p["facts"] / n,
        "cells": r["rows"] * r["cols"], "clues": sum(r["clues"].values()),
        "black pearls": r["clues"].get("pearl:black", 0), "white pearls": r["clues"].get("pearl:white", 0),
        "black share": r["clues"].get("pearl:black", 0) / max(1, sum(r["clues"].values())),
        "solves on PSJP (answered_n)": r.get("answered") or 0,
        "ms": r["ms"],
    }
    for k in top_kinds: f[f"steps using {k} (share)"] = sum(k in s[3].split("+") for s in st) / n
    for k, v in f.items(): feat[k].append(v)
y = [r["rating"] for r in ok]
print(f"\nSpearman with the rating (n = {len(ok)}), sorted by |rho|:")
res = [(k, sp(v, y), *boot(v, y)) for k, v in feat.items()]
for k, rho, lo, hi in sorted(res, key=lambda x: -abs(x[1]) if x[1] == x[1] else 0):
    print(f"  {k:<40} {rho:5.2f}  ({lo:.2f}, {hi:.2f})")

est = feat["solver estimate"]
print(f"\nestimate: {len(set(est))} distinct values; share at the top value {max(Counter(est).values()) / len(est):.0%}")
by = defaultdict(list)
for e, r in zip(est, y): by[r].append(e)
for r in sorted(by): print(f"  rating {r}: n={len(by[r]):3}  estimate mean {mean(by[r]):.3f}  share at 0.85+ {sum(e >= .85 for e in by[r]) / len(by[r]):.0%}  splits mean {mean(s for s, rr in zip(feat['steps tier 2+ (splits, search)'], y) if rr == r):.1f}")

# held-out ridge on the solver's readouts (ranks, standardised): two halves by a hash of the id
names = [k for k in feat if k not in ("ms", "solves on PSJP (answered_n)")]
X = np.array([rank(feat[k]) for k in names]).T; X = (X - X.mean(0)) / (X.std(0) + 1e-9)
yy = np.array(y, float); half = np.array([int(hashlib.md5(str(r["id"]).encode()).hexdigest(), 16) % 2 for r in ok])
for lam in (1.0, 10.0, 100.0):
    out = []
    for h in (0, 1):
        tr, te = half != h, half == h
        A = X[tr]; w = np.linalg.solve(A.T @ A + lam * np.eye(len(names)), A.T @ (yy[tr] - yy[tr].mean()))
        out.append(sp(list(X[te] @ w), list(yy[te])))
    print(f"ridge on {len(names)} readouts, lambda {lam:g}: held-out halves {out[0]:.2f}, {out[1]:.2f}")
