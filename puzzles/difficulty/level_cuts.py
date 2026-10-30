# Per-type level cuts for the solver's estimate (the site's easy / medium / hard: app/app/games/
# estimate.ts SOLVER_CUTS). Within a type, the cuts put the same share of finished solves at each
# level as PSJP's raters do (1-2 easy, 3 medium, 4-5 hard): quantile matching on psjp-features.ts
# rows, so only the order within a type matters. Prints the cuts, and how often the level matches
# the rating band with the shared cuts (0.4, 0.62) and with the fitted ones, in sample and with
# cuts fitted on one md5 half and judged on the other.
#
#   python3 -I level_cuts.py <type>=<rows.jsonl>[,<rows.jsonl>] ...
import hashlib, json, sys
exec(open(__file__.replace("level_cuts.py", "estimate_splits.py")).read().split("def load")[0])
S = 0.35
band = lambda r: 1 if r <= 2 else 2 if r == 3 else 3
lv = lambda d, c: 1 if d < c[0] else 2 if d < c[1] else 3

def fit(xs):
    xs = sorted(xs); e, m = (sum(band(r) == 1 for _, r in xs), sum(band(r) == 2 for _, r in xs))
    ds = sorted(d for d, _ in xs); n = len(ds)
    q = lambda k: ds[min(n - 1, k)] if k < n else 1.0
    # a cut sits halfway between the last puzzle below it and the first above, so ties stay together
    cut = lambda k: round((ds[k - 1] + ds[k]) / 2, 3) if 0 < k < n else (0.0 if k <= 0 else 1.0)
    return (cut(e), cut(e + m))

agree = lambda xs, c: sum(lv(d, c) == band(r) for d, r in xs) / len(xs)
out = {}
for a in sys.argv[1:]:
    t, fs = a.split("="); xs = []; seen = set()
    for f in fs.split(","):
        for l in open(f):
            r = json.loads(l)
            if "profile" in r and r["profile"]["solved"] and r["id"] not in seen:
                seen.add(r["id"]); xs.append((est(r["profile"], S), r["rating"], r["id"]))
    pairs = [(d, r) for d, r, _ in xs]; c = fit(pairs); out[t] = c
    h = [int(hashlib.md5(str(i).encode()).hexdigest(), 16) % 2 for *_, i in xs]
    held = []
    for k in (0, 1):
        tr = [p for p, hh in zip(pairs, h) if hh != k]; te = [p for p, hh in zip(pairs, h) if hh == k]
        held.append(agree(te, fit(tr)))
    print(f"{t:<16} n={len(xs):3}  cuts {c[0]:.3f} {c[1]:.3f}  level = rating band: shared cuts {agree(pairs, (0.4, 0.62)):.0%}, fitted {agree(pairs, c):.0%}, held-out halves {held[0]:.0%} {held[1]:.0%}")
print(json.dumps(out))
