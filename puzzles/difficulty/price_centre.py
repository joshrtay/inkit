# Centring learned step prices (step-prices.json) per type on what a puzzle's score uses. A score is
# the soft maximum of its steps' costs (deduce.ts SOFTMAX_K), and adding the same amount to every
# step adds exactly that to the soft maximum; so each type's offset is the gap between its puzzles'
# mean score today and with the corrections, measured on puzzles solved with the solver's defaults
# (references/ml/price-data-defaults.jsonl, from price-data.ts with PRICE_DEFAULTS=1 DEDUCE_PRICES=0
# PRICE_OUT=price-data-defaults: the defaults, raw costs). A type then
# keeps its place in the estimate's range, and the corrections only reorder steps within it (holding
# the average step instead pushed small hard puzzles against the ceiling).
#
#   references/ml/.venv/bin/python puzzles/difficulty/price_centre.py
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.argv = sys.argv[:1]
from price import K, vec   # noqa: E402

P = json.load(open(os.path.join(HERE, "step-prices.json"))); w = np.array(P["weights"]); caps = np.array(P["caps"])
def correction(f):
    # as deduce.ts priceCorrection: no correction for loop or whole-grid steps
    # features capped at the largest seen in the labelled steps: no extrapolating past the evidence
    return 0.0 if f.get("global", 0) > 0 and not f.get("extent", 0) else float(np.minimum(np.array(vec(f)), caps) @ w)
def score(costs): return float(np.log(np.sum(np.exp(K * np.asarray(costs)))) / K)

by = {}
for line in open(os.path.join(HERE, "../../references/ml/price-data-defaults.jsonl")):
    if not line.strip(): continue
    r = json.loads(line)
    if not r["steps"]: continue
    c = [s["cost"] for s in r["steps"]]
    d = [max(0.3, s["cost"] + correction(s["feat"])) for s in r["steps"]]
    by.setdefault(r["genre"], []).append((score(c), score(d)))
P["offsets"] = {g: round(float(np.mean([a for a, _ in v]) - np.mean([b for _, b in v])), 4) for g, v in by.items()}
P["offset"] = round(float(np.mean([a - b for v in by.values() for a, b in v])), 4)
P["offsetFrom"] = "per type, keeping its puzzles' mean score (soft maximum of step costs) on price-data-defaults; loop and whole-grid steps uncorrected"
json.dump(P, open(os.path.join(HERE, "step-prices.json"), "w"), indent=1)
for g, o in sorted(P["offsets"].items()): print(f"  {g:16s} {o:+.2f}")
