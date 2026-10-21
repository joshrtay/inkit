# A difficulty model fitted on both signals (docs/research-state.md, step 2): the simulated person's
# solve (sim-difficulty.ts: its step costs, the human model's bits, splits, distance) and the solver's
# own (its estimate, step costs, peak). Each feature is log-scaled and standardised within its type
# (a type's puzzles against each other: ratings are only compared within a type), the rating is
# ranked within its type, and one ridge regression is fitted across all types. Held out two ways:
#
#   half      two folds by a hash of the puzzle: fitted on one half of every type, scored on the other
#   new type  fitted on every other type, scored on the one left out (a type the model never saw)
#
# Spearman within type on the held-out puzzles; set means are n-weighted. Beside it: the solver's
# estimate alone, the simulated cost alone, the two ranks averaged (nothing fitted), and the same fit
# on the solver's features only and the simulated person's only (what the simulation adds).
#
# The model is fitted on the games step 2 ran first (FITTED); --new scores it, frozen, on every other
# type in the rows: types it never saw, rated by the same sources.
#
#   python3 puzzles/difficulty/sim_fit.py [--save] [--new] [--logic]
# --save writes the model fitted on every FITTED type to puzzles/difficulty/sim-fit.json.
# --logic adds the share of the puzzle logic without case splits settles (sim-difficulty.ts logic,
# rows in references/sim-logic/, and references/sim-logic-long/ in their place where present: the
# types that hit the 120 s budget, rerun at 600 s), keeps only the puzzles that have it, fits it beside the solver's
# features and both, and adds two checks: how much of it the solver's features already carry, and
# how every score does on the puzzles whose solves don't finish (where the costs are cut off).
import glob, json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = os.path.join(HERE, "../../references/sim-difficulty/")
SIM = ["costSum", "costPeak", "h", "surprisal", "lse", "dist", "steps", "splits"]
SOLVER = ["estimate", "costSum", "costPeak", "steps", "splits"]
FEATS = [f"sim {k}" for k in SIM] + [f"solver {k}" for k in SOLVER]
LOGIC = "--logic" in sys.argv
if LOGIC: FEATS.append("logic settled")
logic = {}
for f in [f for d in ["sim-logic", "sim-logic-long"] for f in sorted(glob.glob(os.path.join(HERE, f"../../references/{d}/*.jsonl")))]:
    for line in open(f):
        r = json.loads(line)
        if isinstance(r.get("logic"), dict): logic[(r["set"], r["type"], r["id"])] = r["logic"]
FITTED = {"psjp": ["akari", "hitori", "masyu", "simple-loop", "slitherlink"], "tatham": ["lightup", "loopy", "singles"]}
def fitted(g):
    src, t = g.split(" ")
    return src in FITTED and (t.rsplit("-", 1)[0] if src == "tatham" else t) in FITTED[src]

def h32(key):
    h = 2166136261
    for ch in key: h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h / 2 ** 32

def rank(v):
    v = np.asarray(v, float); o = np.argsort(v, kind="mergesort"); r = np.empty(len(v)); i = 0
    while i < len(v):
        j = i
        while j + 1 < len(v) and v[o[j + 1]] == v[o[i]]: j += 1
        r[o[i:j + 1]] = (i + j) / 2; i = j + 1
    return r

def spearman(x, y):
    a, b = rank(x), rank(y); a -= a.mean(); b -= b.mean()
    d = math.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / d) if d else 0.0

# ---- the puzzles, by type ----
types, finished = {}, {}
for f in sorted(glob.glob(ROWS + "*.jsonl")):
    for line in open(f):
        r = json.loads(line)
        if not isinstance(r.get("sims"), list) or not r["sims"] or not isinstance(r.get("solver"), dict): continue
        x = [np.mean([s[k] for s in r["sims"]]) for k in SIM] + [r["solver"][k] for k in SOLVER]
        if LOGIC:
            l = logic.get((r["set"], r["type"], r["id"]))
            if not l: continue
            x.append(l["settled"])
        types.setdefault(f"{r['set']} {r['type']}", []).append((r["id"], x, r["rated"]))
        # whether both solves finished: an unfinished solve's costs are cut off, a floor, not a measure
        finished.setdefault(f"{r['set']} {r['type']}", []).append(all(q["solved"] for q in r["sims"]) and bool(r["solver"].get("solved")))
types = {g: v for g, v in types.items() if len(v) >= 20}

def prepare(rows):
    """features log-scaled (signed) and standardised within the type; the rating as a centred rank"""
    X = np.array([x for _, x, _ in rows], float)
    X = np.sign(X) * np.log1p(np.abs(X))
    X = (X - X.mean(0)) / np.where(X.std(0) > 0, X.std(0), 1)
    y = rank([r for _, _, r in rows]); y = (y - y.mean()) / max(1, len(y) - 1)
    return X, y

data = {g: prepare(v) + ([r for _, _, r in v], [i for i, _, _ in v]) for g, v in types.items()}
new = {g: v for g, v in data.items() if not fitted(g)}
data = {g: v for g, v in data.items() if fitted(g)}

def fit(groups, lam=1.0):
    X = np.vstack([data[g][0] for g in groups]); y = np.concatenate([data[g][1] for g in groups])
    return np.linalg.solve(X.T @ X + lam * len(y) / 100 * np.eye(X.shape[1]), X.T @ y)

def score(w, g, keep=None):
    X, _, rated, ids = data[g]
    m = np.array([keep(i) for i in ids]) if keep else np.ones(len(ids), bool)
    return spearman(X[m] @ w, np.array(rated)[m]), int(m.sum())

base = lambda g, keep, k: spearman(data[g][0][keep, FEATS.index(k)], np.array(data[g][2])[keep])
def both(g, keep):
    X = data[g][0][keep]; return spearman(rank(X[:, FEATS.index("sim costSum")]) + rank(X[:, FEATS.index("solver estimate")]), np.array(data[g][2])[keep])

SETS = {"both": [f for f in FEATS if not f.startswith("logic")], "solver": [f for f in FEATS if f.startswith("solver")], "sim": [f for f in FEATS if f.startswith("sim")]}
if LOGIC: SETS.update({"logic": ["logic settled"], "solver + logic": SETS["solver"] + ["logic settled"], "both + logic": FEATS})
LABEL = {"both": "fitted: both", "solver": "fitted: solver only", "sim": "fitted: sim only", "logic": "logic share alone (fitted sign)",
         "solver + logic": "fitted: solver + logic", "both + logic": "fitted: both + logic"}
FITS = ["solver", "sim", "both"] + (["logic", "solver + logic", "both + logic"] if LOGIC else [])
def heldout_half(cols, lam=1.0):
    """per type, each half scored by the model fitted on the other halves of every type"""
    j = [FEATS.index(c) for c in cols]; out = {}
    for fold in (0, 1):
        tr = [(X[:, j][m], y[m]) for X, y, _, ii in data.values() for m in [np.array([(h32(f"fold:{i}") < 0.5) != bool(fold) for i in ii])]]
        X, y = np.vstack([a for a, _ in tr]), np.concatenate([b for _, b in tr])
        w = np.linalg.solve(X.T @ X + lam * len(y) / 100 * np.eye(len(j)), X.T @ y)
        for g, (Xg, _, _, ii) in data.items():
            m = np.array([(h32(f"fold:{i}") < 0.5) == bool(fold) for i in ii])
            out.setdefault(g, np.zeros(len(ii)))[m] = Xg[:, j][m] @ w
    return out

rows, lam = [], 1.0
held = {k: heldout_half(c, lam) for k, c in SETS.items()}
for g in sorted(data):
    ids = data[g][3]
    # new type: fitted on every other type (and, for a game at another size, not its sibling either)
    game = g.split(" ")[1].split("-")[0]
    others = [k for k in data if k.split(" ")[1].split("-")[0] != game]
    rho_new = spearman(data[g][0] @ fit(others, lam), data[g][2])
    allk = np.ones(len(ids), bool)
    rows.append((g, len(ids), base(g, allk, "solver estimate"), base(g, allk, "sim costSum"), both(g, allk),
                 *[spearman(held[k][g], data[g][2]) for k in FITS], rho_new))

head = ["solver's estimate", "simulated cost", "ranks averaged"] + [LABEL[k] for k in FITS] + ["both + logic, type held out" if LOGIC else "both, type held out"]
print("| set and type | n | " + " | ".join(head) + " |")
print("|---|---|" + "---|" * len(head))
for g, n, *v in rows: print(f"| {g} | {n} | " + " | ".join(f"{x:.2f}" for x in v) + " |")
for s in ("psjp", "tatham"):
    rs = [r for r in rows if r[0].startswith(s)]; N = sum(r[1] for r in rs)
    print(f"| {s}, within type (n-weighted) | {N} | " + " | ".join(f"{sum(r[1] * r[k] for r in rs) / N:.2f}" for k in range(2, 2 + len(head))) + " |")

# paired bootstrap (puzzles resampled within type) of both minus solver only, half held out
rng = np.random.default_rng(1)
for a, b in [("both", "solver")] + ([("solver + logic", "solver"), ("both + logic", "both")] if LOGIC else []):
    print(f"\n{a} minus {b}{' only' if b == 'solver' else ''}, half held out, 95% bootstrap:")
    for s in ("psjp", "tatham"):
        gs = [g for g in data if g.startswith(s)]; N = sum(len(data[g][3]) for g in gs); ds = []
        for _ in range(400):
            d = 0
            for g in gs:
                i = rng.integers(0, len(data[g][3]), len(data[g][3])); r = np.array(data[g][2])[i]
                d += len(i) * (spearman(held[a][g][i], r) - spearman(held[b][g][i], r))
            ds.append(d / N)
        ds.sort(); print(f"  {s}: {np.mean(ds):+.3f} ({ds[10]:+.3f}, {ds[389]:+.3f})")

w = fit(list(data), lam)
if "--new" in sys.argv:
    # frozen: fitted on every FITTED type, scored on types it never saw (standardised within their own type)
    cols = {k: [FEATS.index(c) for c in v] for k, v in SETS.items()}
    ws = {k: (lambda j: (lambda X, y: np.linalg.solve(X.T @ X + lam * len(y) / 100 * np.eye(len(j)), X.T @ y))(
        np.vstack([d[0][:, j] for d in data.values()]), np.concatenate([d[1] for d in data.values()])))(j) for k, j in cols.items()}
    print("\nnew types, model frozen (fitted on the types above):\n")
    nhead = ["solver's estimate", "simulated cost", "ranks averaged"] + [LABEL[k] for k in FITS] + (["logic share alone"] if LOGIC else [])
    print("| set and type | n | both solves finish | " + " | ".join(nhead) + " |")
    print("|---|---|---|" + "---|" * len(nhead))
    fin = lambda g: np.mean(finished[g])
    nrows = []
    for g in sorted(new):
        X, _, rated, _ = new[g]; allk = np.ones(len(rated), bool)
        v = [spearman(X[:, FEATS.index("solver estimate")], rated), spearman(X[:, FEATS.index("sim costSum")], rated),
             spearman(rank(X[:, FEATS.index("sim costSum")]) + rank(X[:, FEATS.index("solver estimate")]), rated)]
        v += [spearman(X[:, cols[k]] @ ws[k], rated) for k in FITS]
        # unfitted: less settled is harder
        if LOGIC: v.append(spearman(-X[:, FEATS.index("logic settled")], rated))
        nrows.append((g, len(rated), *v)); print(f"| {g} | {len(rated)} | {fin(g):.0%} | " + " | ".join(f"{x:.2f}" for x in v) + " |")
    # puzz.link's ratings split: the games the model was fitted on (new raters) and games new to it
    seen = lambda g: g.split(" ")[1] in FITTED["psjp"] + ["lightup", "loopy", "singles"]
    groups = [("psjp, new games", lambda g: g.startswith("psjp")), ("tatham, new games", lambda g: g.startswith("tatham")),
              ("puzz.link, fitted games (new raters)", lambda g: g.startswith("puzzlink") and seen(g)),
              ("puzz.link, new games", lambda g: g.startswith("puzzlink") and not seen(g))]
    # and each again on the types where both solves mostly finish (80%+): elsewhere the costs are cut off
    for name, f in groups + [(n + ", solves finish", (lambda f: lambda g: f(g) and fin(g) >= 0.8)(f)) for n, f in groups]:
        rs = [r for r in nrows if f(r[0])]; N = sum(r[1] for r in rs)
        if N: print(f"| **{name}** (n-weighted, {len(rs)} types) | {N} | | " + " | ".join(f"{sum(r[1] * r[k] for r in rs) / N:.2f}" for k in range(2, 2 + len(nhead))) + " |")
if LOGIC:
    # 1. how much of the logic share the solver's own features already carry: within type, the share
    #    regressed on them (R²), and the rank agreement of what's left over with the rating
    every = {**data, **new}
    print("\nlogic share against the solver's features, within type (n-weighted):")
    print("| set | n | share vs rating | share vs solver estimate | vs solver splits | R² from solver features | leftover vs rating |")
    print("|---|---|---|---|---|---|---|")
    js, jl = [FEATS.index(c) for c in SETS["solver"]], FEATS.index("logic settled")
    acc = {}
    for g, (X, _, rated, _) in every.items():
        A = np.c_[X[:, js], np.ones(len(X))]; c, *_ = np.linalg.lstsq(A, X[:, jl], rcond=None); e = X[:, jl] - A @ c
        r2 = 1 - e.var() / X[:, jl].var() if X[:, jl].var() > 0 else float("nan")
        v = (spearman(X[:, jl], rated), spearman(X[:, jl], X[:, FEATS.index("solver estimate")]), spearman(X[:, jl], X[:, FEATS.index("solver splits")]), r2, spearman(e, rated))
        key = g.split(" ")[0] + (", fitted games" if g in data else ", new games")
        acc.setdefault(key, []).append((len(rated), v))
    for key in sorted(acc):
        N = sum(n for n, _ in acc[key]); ok = lambda k: [(n, v[k]) for n, v in acc[key] if np.isfinite(v[k])]
        print(f"| {key} | {N} | " + " | ".join(f"{sum(n * x for n, x in ok(k)) / max(1, sum(n for n, _ in ok(k))):.2f}" for k in range(5)) + " |")
    # 2. where the solves don't finish: each score on just those puzzles, within type (types with 8+)
    print("\npuzzles whose solves don't finish (within type, n-weighted over types with 8+ such puzzles):")
    print("| set | types | n | solver's estimate | simulated cost | logic share (less is harder) |")
    print("|---|---|---|---|---|---|")
    fin_all = dict(finished)
    acc = {}
    for g, (X, _, rated, ids) in every.items():
        f = np.array(fin_all[g]) if len(fin_all[g]) == len(ids) else None
        if f is None: continue
        m = ~f
        if m.sum() < 8: continue
        r = np.array(rated)[m]
        v = (spearman(X[m, FEATS.index("solver estimate")], r), spearman(X[m, FEATS.index("sim costSum")], r), spearman(-X[m, jl], r))
        acc.setdefault(g.split(" ")[0], []).append((g, int(m.sum()), v))
    for key in sorted(acc):
        N = sum(n for _, n, _ in acc[key])
        print(f"| {key} | {len(acc[key])} | {N} | " + " | ".join(f"{sum(n * v[k] for _, n, v in acc[key]) / N:.2f}" for k in range(3)) + " |")
        for g, n, v in sorted(acc[key]): print(f"|   {g} | | {n} | " + " | ".join(f"{x:.2f}" for x in v) + " |")

print("\nweights (fitted on everything; features standardised within type):")
for k, x in sorted(zip(FEATS, w), key=lambda t: -abs(t[1])): print(f"  {k:18s} {x:+.3f}")
if "--save" in sys.argv:
    json.dump({"features": FEATS, "fitted on": FITTED, "weights": [round(float(x), 4) for x in w], "ridge": lam,
               "note": "features: signed log1p, standardised within type; sim-fit by sim_fit.py"},
              open(os.path.join(HERE, "sim-fit.json"), "w"), indent=1)
