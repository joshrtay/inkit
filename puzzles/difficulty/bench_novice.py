# Weak models' whole-solve rate as a novice difficulty proxy (research review 2026-10-24, idea 6).
# Per puzzle of the whole-solve benchmark (bench-solve.ts, no hints): the share of weak setups that
# solve it and their share of the answer placed, beside the solver's estimate (bench-novice.ts) and
# the cell count, each against the human rating (Thinky author level 1-4, puzz.link band 1-5), and
# the rank average of solver and weak models (does the proxy add anything to the solver?).
#
#   python3 -I bench_novice.py <whole-solves.jsonl> <solver.jsonl>
import json, sys, random
from collections import defaultdict
from statistics import mean

WEAK = ["haiku-low-grid", "sonnet-low-grid", "haiku-high-grid"]
ALL = WEAK + ["sonnet-high-grid", "opus-low-grid", "opus-high-grid"]

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

def boot(a, b, n=1000):
    random.seed(1); v = []
    for _ in range(n):
        s = [random.randrange(len(a)) for _ in a]; v.append(sp([a[i] for i in s], [b[i] for i in s]))
    v = sorted(x for x in v if x == x); return v[int(.025 * len(v))], v[int(.975 * len(v))]

runs = [json.loads(l) for l in open(sys.argv[1])]
solver = {r["id"]: r for r in map(json.loads, open(sys.argv[2]))}
by = defaultdict(lambda: {"runs": {}})
for r in runs:
    if r["hints"] != "none": continue
    p = by[r["id"]]; p.update(set=r["set"], genre=r["genre"], rating=r["rating"])
    p["runs"][r["setup"]] = r
for s in ["thinky", "puzzlink"]:
    ps = [(i, p) for i, p in by.items() if p["set"] == s]
    rows = []
    for i, p in ps:
        weak = [p["runs"][w] for w in WEAK if w in p["runs"]]
        allr = [p["runs"][w] for w in ALL if w in p["runs"]]
        sv = solver.get(i, {})
        if "estimate" not in sv: continue
        rows.append(dict(rating=p["rating"], genre=p["genre"],
                         weak=mean(r["solved"] for r in weak), placed=mean(r["placed"] / max(1, r["positives"]) for r in weak),
                         all=mean(r["solved"] for r in allr), est=sv["estimate"], cells=sv["cells"], finished=sv["solved"]))
    rt = [r["rating"] for r in rows]
    print(f"\n{s}: {len(rows)} puzzles with a solver estimate (of {len(ps)}); solver finished {sum(r['finished'] for r in rows)}")
    cols = {
        "weak setups unsolved (share)": [-r["weak"] for r in rows],
        "weak setups, answer not placed": [-r["placed"] for r in rows],
        "all six setups unsolved": [-r["all"] for r in rows],
        "solver estimate": [r["est"] for r in rows],
        "cells": [r["cells"] for r in rows],
    }
    ra, rb = rank(cols["solver estimate"]), rank(cols["weak setups, answer not placed"])
    cols["rank average: solver + weak placed"] = [x + y for x, y in zip(ra, rb)]
    for name, v in cols.items():
        lo, hi = boot(v, rt); print(f"  {name:<38} rho {sp(v, rt):5.2f}  ({lo:.2f}, {hi:.2f})")
    print(f"  solver estimate vs weak placed: rho {sp(cols['solver estimate'], cols['weak setups, answer not placed']):.2f}")
    # the solver's estimate is a within-type scale: the n-weighted mean of within-genre rhos too
    g = defaultdict(list)
    for r in rows: g[r["genre"]].append(r)
    acc = defaultdict(lambda: [0.0, 0])
    for v in g.values():
        t = [r["rating"] for r in v]
        if len(v) < 4 or len(set(t)) < 2: continue
        for name, f in [("weak placed", lambda r: -r["placed"]), ("all six unsolved", lambda r: -r["all"]), ("solver estimate", lambda r: r["est"]), ("cells", lambda r: r["cells"])]:
            x = sp([f(r) for r in v], t)
            if x == x: acc[name][0] += x * len(v); acc[name][1] += len(v)
    print("  within genre (4+ puzzles), n-weighted: " + ", ".join(f"{k} {a / n:.2f}" for k, (a, n) in acc.items() if n) + f" ({max(n for _, n in acc.values()) if acc else 0} puzzles)")
    if s == "thinky":
        print("  within genre (8+ puzzles): weak placed / solver estimate vs rating")
        for k, v in sorted(g.items(), key=lambda x: -len(x[1])):
            if len(v) < 8: continue
            t = [r["rating"] for r in v]
            print(f"    {k:<16} n={len(v):2}  weak {sp([-r['placed'] for r in v], t):5.2f}  solver {sp([r['est'] for r in v], t):5.2f}")
