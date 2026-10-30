# The solver estimate with a case-split term (Masyu write-up, "What to do"). The form is fixed
# before any fitting: estimateOf's soft-max and rule-load terms, plus S · clamp(log2(1 + splits) / 5)
# (32 splits or more count as 1), with the soft-max's weight shrunk by S so the three weights sum
# to 1, and solves still capped at 0.9:
#   est(S) = min(0.9, (0.75 - S)·clamp((dSteps - 3) / 8) + 0.25·clamp((ruleLoad - 2) / 5) + S·clamp(log2(1 + splits) / 5))
# splits = steps of tier 2 or more (case splits and search). Unsolved rows keep their 0.95 / 0.97.
# Fit S on one psjp-features.ts sample (the first file), then score every file at that S beside
# today's estimate (S = 0), with a puzzle-bootstrap interval on the gain.
#
#   python3 -I estimate_splits.py <fit.jsonl> [<test.jsonl> ...] [--S 0.3]
import json, math, random, sys
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

clamp = lambda x: min(1.0, max(0.0, x))
def est(p, S):
    if not p["solved"]: return p["estimate"]          # unsolved: unchanged
    splits = p["perTier"][2] + p["perTier"][3]
    x = (0.75 - S) * clamp((p["dSteps"] - 3) / 8) + 0.25 * clamp((p["ruleLoad"] - 2) / 5) + S * clamp(math.log2(1 + splits) / 5)
    return min(x, 0.9)

def load(f):
    rows = [json.loads(l) for l in open(f)]
    ok = [r for r in rows if "profile" in r]
    return [r["profile"] for r in ok], [r["rating"] for r in ok]

args = sys.argv[1:]
fixed = float(args[args.index("--S") + 1]) if "--S" in args else None
files = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] != "--S")]
P, y = load(files[0])
grid = [round(0.05 * i, 2) for i in range(0, 15)]
print(f"fit on {files[0]} (n = {len(P)}):")
for S in grid: print(f"  S = {S:.2f}: {sp([est(p, S) for p in P], y):.3f}")
best = fixed if fixed is not None else max(grid, key=lambda S: sp([est(p, S) for p in P], y))
print(f"S = {best}")

for f in files:
    P, y = load(f)
    a, b = [est(p, 0) for p in P], [est(p, best) for p in P]
    random.seed(1); g = []
    for _ in range(500):
        s = [random.randrange(len(P)) for _ in P]
        g.append(sp([b[i] for i in s], [y[i] for i in s]) - sp([a[i] for i in s], [y[i] for i in s]))
    g = sorted(v for v in g if v == v)
    top = lambda e: sum(v >= 0.85 for v in e) / len(e)
    print(f"{f.split('/')[-1]:<24} n={len(P):4}  today {sp(a, y):.3f}  with splits {sp(b, y):.3f}  gain {sp(b, y) - sp(a, y):+.3f} ({g[12]:+.3f}, {g[487]:+.3f})  at 0.85+: {top(a):.0%} -> {top(b):.0%}  mean {mean(a):.2f} -> {mean(b):.2f}")
