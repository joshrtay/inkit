# Pricing steps from step-level labels (step-labels.ts → references/ml/step-labels*.jsonl): each of
# our steps with an expert's verdict from the same position (Tatham's Singles deductions and Loopy levels;
# Sudoku's community rating). A step's price is today's cost plus a learned correction from its
# features (price.py's vec); fitted so that, within each game, steps the experts call harder cost
# more. Reported: agreement (Spearman) between price and label per game, today and fitted, and
# with each game left out of the fitting. Writes puzzles/difficulty/step-prices.json.
#
#   references/ml/.venv/bin/python puzzles/difficulty/price_steps.py
import json, os, random, sys
from collections import defaultdict
import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.argv = sys.argv[:1]
from price import FEATURES, vec   # noqa: E402  (price.py runs its own fit when imported as a script only)

import glob
rows = [json.loads(l) for f in sorted(glob.glob(os.path.join(HERE, "../../references/ml/step-labels*.jsonl"))) for l in open(f) if l.strip()]
# a step no expert level reached is harder than the highest level
top = defaultdict(float)
for r in rows: top[r["game"]] = max(top[r["game"]], r["label"])
for r in rows:
    if r["label"] == -1: r["label"] = top[r["game"]] + 1
rows = [r for r in rows if r["label"] >= 0]
games = sorted({r["game"] for r in rows})
print(f"{len(rows)} labelled steps: " + ", ".join(f"{g} {sum(r['game'] == g for r in rows)}" for g in games))
for g in games:
    ls = [r["label"] for r in rows if r["game"] == g]
    print(f"  {g} labels: " + ", ".join(f"{v}: {ls.count(v)}" for v in sorted(set(ls))))

# which of Tatham's deductions our connection (component lemma) steps correspond to, by group size
conn = [r for r in rows if r["game"] == "singles" and r["feat"].get("p_connect", 0) > 0]
if conn:
    print(f"\nSingles steps using the component lemma ({len(conn)}): Tatham's deduction applied once, by group size")
    by = defaultdict(lambda: defaultdict(int))
    for r in conn: by["one cell" if r["feat"].get("extent", 0) < 2 else "a group"][r.get("by", "-")] += 1
    for k, v in by.items(): print(f"  {k}: " + ", ".join(f"{b} {n}" for b, n in sorted(v.items(), key=lambda x: -x[1])))
    print("  their cost today: " + ", ".join(f"{k} {np.mean([r['cost'] for r in conn if (r['feat'].get('extent', 0) < 2) == (k == 'one cell')]):.1f}" for k in by))

cost = torch.tensor([r["cost"] for r in rows], dtype=torch.float32)
X = torch.tensor([vec(r["feat"]) for r in rows], dtype=torch.float32)
label = np.array([r["label"] for r in rows]); game = np.array([r["game"] for r in rows])

def spearman(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1]) if np.std(ra) and np.std(rb) else 0.0

def agreement(w, g):
    ix = game == g
    return spearman((cost + X @ w).detach().numpy()[ix], label[ix])

def fit(train_games, iters=400, lam=0.002, pairs_per_game=20000):
    rng = random.Random(1); pa, pb = [], []
    for g in train_games:
        ix = np.where(game == g)[0]
        for _ in range(pairs_per_game):
            a, b = rng.choice(ix), rng.choice(ix)
            if label[a] > label[b]: pa.append(a); pb.append(b)
    pa, pb = torch.tensor(pa), torch.tensor(pb)
    w = torch.zeros(len(FEATURES), requires_grad=True); opt = torch.optim.Adam([w], lr=0.05)
    for _ in range(iters):
        c = cost + X @ w
        loss = torch.nn.functional.softplus(-(c[pa] - c[pb])).mean() + lam * (w ** 2).sum()
        opt.zero_grad(); loss.backward(); opt.step()
    return w.detach()

zero = torch.zeros(len(FEATURES))
w_all = fit(games)
print("\n| Game | Today's prices | Fitted on all | Fitted without it |\n|---|---|---|---|")
for g in games:
    print(f"| {g} | {agreement(zero, g):.2f} | {agreement(w_all, g):.2f} | {agreement(fit([x for x in games if x != g]), g):.2f} |")
print("\nCorrections:")
for k, v in sorted(zip(FEATURES, w_all.tolist()), key=lambda x: -abs(x[1])): print(f"  {k:15s} {v:+.2f}")
# centred: the corrections move steps against each other (all the labels say), not the whole
# scale (an overall rise pushed puzzles against the estimate's ceiling: every Loopy rated 0.80)
offset = float((X @ w_all).mean())
print(f"\nmean correction {offset:+.2f}, taken off so the average step costs what it did")
json.dump({"features": FEATURES, "weights": [round(x, 4) for x in w_all.tolist()], "offset": round(-offset, 4), "from": "step labels"}, open(os.path.join(HERE, "step-prices.json"), "w"), indent=1)
