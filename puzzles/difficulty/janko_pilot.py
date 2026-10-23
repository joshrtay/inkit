# Janko pilot (docs: /mnt/project-files/research/aim4/janko-sim-pilot-2026-10-23.md): Spearman with Janko
# level per type and within size, bootstrap 95% intervals, for the finish-set solver estimate, the
# simulated cost sum, the fitted solver + logic score (sim-fit.json) and the two ranks averaged.
#   python3 puzzles/difficulty/janko_pilot.py <sim rows dir> <logic rows dir> <guard rows.jsonl> <data.json> <sim-fit.json>
import glob, json, math, sys, collections
import numpy as np

simdir, logdir, guardf, dataf, fitf = sys.argv[1:6]
data = json.load(open(dataf)); fit = json.load(open(fitf))

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
    return float((a * b).sum() / d) if d else float("nan")

def boot(x, y, B=2000, seed=12345):
    rng = np.random.default_rng(seed); x, y = np.asarray(x), np.asarray(y); rs = []
    for _ in range(B):
        i = rng.integers(0, len(x), len(x)); r = spearman(x[i], y[i])
        if np.isfinite(r): rs.append(r)
    rs.sort(); return rs[int(0.025 * len(rs))], rs[int(math.ceil(0.975 * len(rs))) - 1]

# psjp/<type>/<n>.json → sourceId: the sim rows carry the file number as id, the guard rows the name
ids = {}
import os
root = os.path.dirname(dataf)
for f in glob.glob(f"{root}/*/*.json"):
    t, n = f.split("/")[-2], f.split("/")[-1][:-5]
    ids[(t, n)] = json.load(open(f))["source"]["psjp"]

sim = {}
for f in glob.glob(f"{simdir}/psjp-*.jsonl"):
    for l in open(f):
        r = json.loads(l)
        if isinstance(r.get("sims"), list) and r["sims"] and isinstance(r.get("solver"), dict): sim[(r["type"], r["id"])] = r
logic = {}
for f in glob.glob(f"{logdir}/psjp-*.jsonl"):
    for l in open(f):
        r = json.loads(l)
        if isinstance(r.get("logic"), dict): logic[(r["type"], r["id"])] = r["logic"]
guard = collections.defaultdict(dict)
for l in open(guardf):
    r = json.loads(l)
    if r["section"] != "psjp" or r["estimate"] is None: continue
    t, n = r["name"].split("/"); guard[r["setting"]][(t, n[:-5])] = r

# per type: 200 calls unless under 1 in 5 finish there
budget = {}
for t in sorted({k[0] for k in guard["c200-finish"]}):
    rs = [r for k, r in guard["c200-finish"].items() if k[0] == t]
    budget[t] = "c200-finish" if sum(r["solved"] for r in rs) >= len(rs) / 5 else "c1000-finish"

SOLVER = ["estimate", "costSum", "costPeak", "steps", "splits"]
def slog(X): X = np.asarray(X, float); return np.sign(X) * np.log1p(np.abs(X))
def std(X): return (X - X.mean(0)) / np.where(X.std(0) > 0, X.std(0), 1)

def columns(keys):
    """the scores on these puzzles (one group: a type, or a type at one size)"""
    lv = np.array([data[ids[k]]["level"] for k in keys], float)
    g = guard[budget[keys[0][0]]]
    est = np.array([g[k]["estimate"] for k in keys])
    cost = np.array([np.mean([s["costSum"] for s in sim[k]["sims"]]) for k in keys])
    X = std(slog([[sim[k]["solver"][f] for f in SOLVER] + [logic[k]["settled"]] for k in keys]))
    fitted = X @ np.array(fit["weights"])
    return lv, {"solver estimate (finish set)": est, "sim costSum": cost, "solver + logic (fitted)": fitted,
                "ranks averaged: solver + sim": rank(est) + rank(cost),
                "solver estimate (sim run, 60 s)": np.array([sim[k]["solver"]["estimate"] for k in keys])}

def keys_all(t):
    return sorted(k for k in sim if k[0] == t and k in logic and k in guard[budget.get(t, "c200-finish")])

out = []
COLS = None
def table(groups, title):
    global COLS
    rows = []
    for name, keys in groups:
        if len(keys) < 10: continue
        lv, cols = columns(keys); COLS = list(cols)
        if len(set(lv)) < 2: continue
        rows.append((name, len(keys), [(spearman(v, lv), *boot(v, lv)) for v in cols.values()]))
    out.append(f"### {title}\n\n| Type | n | " + " | ".join(COLS) + " |\n|---|---|" + "---|" * len(COLS))
    for name, n, v in rows: out.append(f"| {name} | {n} | " + " | ".join(f"{a:.2f} ({b:.2f} to {c:.2f})" for a, b, c in v) + " |")
    N = sum(n for _, n, _ in rows)
    if N: out.append(f"| **mean (n-weighted)** | {N} | " + " | ".join(f"{sum(n * v[j][0] for _, n, v in rows) / N:.2f}" for j in range(len(COLS))) + " |")
    out.append("")

types = sorted({k[0] for k in sim})
table([(t, keys_all(t)) for t in types], "Per type")
# within size: each size with 10+ puzzles, in types that mix sizes
groups = []
for t in types:
    ks = keys_all(t); by = collections.defaultdict(list)
    for k in ks: by["x".join(map(str, data[ids[k]]["size"]))].append(k)
    if len(by) > 1: groups += [(f"{t} {s}", v) for s, v in sorted(by.items(), key=lambda x: -len(x[1])) if len(v) >= 15]
table(groups, "Within size (sizes with 15+ puzzles)")
GROUPS = {"per type": [(t, keys_all(t)) for t in types], "within size": groups}
fin = {t: (budget[t], sum(guard[budget[t]][k]["solved"] for k in keys_all(t)), len(keys_all(t)),
           sum(all(s["solved"] for s in sim[k]["sims"]) for k in keys_all(t))) for t in types if t in budget}
out.append("### Budgets and finishes\n\n| Type | solver budget | solver finished | sims both finished |\n|---|---|---|---|")
out += [f"| {t} | {b.split('-')[0][1:]} calls | {s} of {n} | {m} of {n} |" for t, (b, s, n, m) in fin.items()]
missing = {t: sum(1 for (tt, _) in ids if tt == t) - len(keys_all(t)) for t in {k[0] for k in ids}}
# paired bootstrap, n-weighted over groups (puzzles resampled within each group): A minus B
rng = np.random.default_rng(1)
def paired(groups, a, b, B=1000):
    gs = [(columns(k), len(k)) for _, k in groups if len(k) >= 10]
    gs = [((lv, c), n) for (lv, c), n in gs if len(set(lv)) > 1]
    N = sum(n for _, n in gs); pt = sum(n * (spearman(c[a], lv) - spearman(c[b], lv)) for (lv, c), n in gs) / N; ds = []
    for _ in range(B):
        d = 0
        for (lv, c), n in gs:
            i = rng.integers(0, n, n); d += n * (np.nan_to_num(spearman(c[a][i], lv[i])) - np.nan_to_num(spearman(c[b][i], lv[i])))
        ds.append(d / N)
    ds.sort(); return pt, ds[int(0.025 * B)], ds[int(0.975 * B) - 1]
out.append("### Paired differences (n-weighted, 95% bootstrap)\n\n| Comparison | per type | within size |\n|---|---|---|")
for a, b in [("sim costSum", "solver estimate (finish set)"), ("sim costSum", "solver estimate (sim run, 60 s)"), ("ranks averaged: solver + sim", "solver estimate (finish set)"), ("solver + logic (fitted)", "solver estimate (finish set)")]:
    out.append(f"| {a} minus {b} | " + " | ".join("{:+.3f} ({:+.3f} to {:+.3f})".format(*paired(GROUPS[g], a, b)) for g in ("per type", "within size")) + " |")
out.append(f"\nPuzzles dropped for a missing row (sim capped at 900 s, logic or solver): {sum(missing.values())} {dict((t, m) for t, m in missing.items() if m)}")
print("\n".join(out))
