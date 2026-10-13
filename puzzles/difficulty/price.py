# Pricing steps from labelled puzzles (data: price-data.ts → references/ml/price-data.jsonl).
# A step's price is today's cost plus a learned correction from its type-free features (deduce.ts
# Step.feat); a puzzle's score is the soft maximum of its steps' prices, as in the estimate. The
# corrections are fitted so that, within each group (one source, type and size), harder-labelled
# puzzles score higher. Reported: agreement (Spearman) per group before and after, and with each
# type left out of the fitting and tested on (does the pricing carry to types it never saw?).
# The fitted corrections go to puzzles/difficulty/step-prices.json, which deduce.ts can apply.
#
#   references/ml/.venv/bin/python puzzles/difficulty/price.py
import json, os, sys
from collections import defaultdict
import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "../../references/ml/price-data.jsonl")
K = 1.5   # deduce.ts SOFTMAX_K

FEATURES = ["tier1", "tier2", "tier3", "instances", "facts", "global", "extent", "cells", "spread", "window",
            "p_count", "p_each-once", "p_pattern", "p_connect", "p_size", "p_sum", "p_sight", "p_order",
            "u_line", "u_strip", "u_region", "u_block", "u_local", "u_grid", "capped",
            # combinations a sum of single features can't say: connection reasoning about a group of
            # several cells (Tatham's Singles "tricky": removesplits) or about one cell ("easy":
            # allblackbutone)
            "connect_group", "connect_single"]

def vec(f):
    """A step's features as numbers on similar scales."""
    t = f.get("tier", 0)
    v = {"tier1": t == 1, "tier2": t == 2, "tier3": t == 3, "instances": f.get("instances", 0) / 4, "facts": f.get("facts", 0) / 4,
         "global": f.get("global", 0), "extent": np.log1p(f.get("extent", 0)) / 2, "cells": np.log1p(f.get("cells", 0)) / 3,
         "spread": f.get("spread", 0) / 10, "window": np.log1p(f.get("window", 0)) / 4, "capped": f.get("capped", 0)}
    for k in FEATURES:
        if k.startswith(("p_", "u_")): v[k] = f.get(k, 0) / 2
    conn = f.get("p_connect", 0) > 0
    v["connect_group"] = float(conn and f.get("extent", 0) >= 2)
    v["connect_single"] = float(conn and f.get("extent", 0) < 2)
    return [float(v[k]) for k in FEATURES]

def main():
    global rows, groups, puzzles
    rows = [json.loads(l) for l in open(DATA) if l.strip()]
    rows = [r for r in rows if r["steps"]]
    groups = defaultdict(list)
    for i, r in enumerate(rows): groups[r["group"]].append(i)
    groups = {g: ix for g, ix in groups.items() if len(ix) >= 6 and len({rows[i]["label"] for i in ix}) > 1}
    puzzles = [(torch.tensor([s["cost"] for s in r["steps"]], dtype=torch.float32), torch.tensor([vec(s["feat"]) for s in r["steps"]], dtype=torch.float32)) for r in rows]
    print(f"{len(rows)} puzzles, {sum(len(r['steps']) for r in rows)} steps, {len(groups)} groups")

    def scores(w):
        out = []
        for cost, X in puzzles:
            c = torch.clamp(cost + X @ w, min=0.3)
            out.append(torch.logsumexp(K * c, 0) / K)
        return torch.stack(out)

    def spearman(a, b):
        ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
        return float(np.corrcoef(ra, rb)[0, 1]) if np.std(ra) and np.std(rb) else 0.0

    def agreement(w, which):
        s = scores(w).detach().numpy()
        return {g: spearman(s[groups[g]], np.array([rows[i]["label"] for i in groups[g]])) for g in which}

    def fit(which, iters=300, lam=0.002):
        w = torch.zeros(len(FEATURES), requires_grad=True)
        opt = torch.optim.Adam([w], lr=0.05)
        pairs = []
        for g in which:
            ix = groups[g]
            for a in ix:
                for b in ix:
                    if rows[a]["label"] > rows[b]["label"]: pairs.append((a, b))
        pa, pb = torch.tensor([p[0] for p in pairs]), torch.tensor([p[1] for p in pairs])
        for _ in range(iters):
            s = scores(w)
            loss = torch.nn.functional.softplus(-(s[pa] - s[pb])).mean() + lam * (w ** 2).sum()
            opt.zero_grad(); loss.backward(); opt.step()
        return w.detach()

    genre_of = {g: rows[groups[g][0]]["genre"] for g in groups}
    zero = torch.zeros(len(FEATURES))
    base = agreement(zero, groups)
    w_all = fit(list(groups))
    after = agreement(w_all, groups)
    # leave each type out of the fitting, test on its groups
    held = {}
    for gen in sorted(set(genre_of.values())):
        train = [g for g in groups if genre_of[g] != gen]
        test = [g for g in groups if genre_of[g] == gen]
        held.update(agreement(fit(train), test))

    print("\n| Group | n | Today's prices | Fitted on all | Fitted without its type |\n|---|---|---|---|---|")
    for g in sorted(groups):
        print(f"| {g} | {len(groups[g])} | {base[g]:.2f} | {after[g]:.2f} | {held[g]:.2f} |")
    m = lambda d: np.mean(list(d.values()))
    print(f"| **mean** | | {m(base):.2f} | {m(after):.2f} | {m(held):.2f} |")
    print("\nCorrections (added to a step's cost per unit of feature):")
    for k, v in sorted(zip(FEATURES, w_all.tolist()), key=lambda x: -abs(x[1])): print(f"  {k:12s} {v:+.2f}")
    json.dump({"features": FEATURES, "weights": [round(x, 4) for x in w_all.tolist()]}, open(os.path.join(HERE, "step-prices.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
