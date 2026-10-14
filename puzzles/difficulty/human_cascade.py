# The human-or-generated classifier with its uncertainty, and a cascade with Opus
# (docs/research-human-gap.md, "Uncertainty and a cascade"). Reads
#   references/ml/human-gap/measured*.jsonl        the classifier's training sample (human_gap.py's)
#   references/ml/human-cascade/measured.jsonl     the pair puzzles, measured alike (human-cascade.ts)
#   references/ml/llm-human/pairs.json, calls/grid/ Opus's grid-only picks on the 96 pairs
#   references/ml/human-cascade/pairs.json, calls/grid/   the same on new pairs (step 4), if there
# and writes, in references/ml/human-cascade/, cascade.json and cascade-report.md (offline),
# pairs.json (sample) and confirm.json, confirm.md (confirm).
#
#   references/ml/.venv/bin/python puzzles/difficulty/human_cascade.py offline     the 96 pairs
#   references/ml/.venv/bin/python puzzles/difficulty/human_cascade.py sample 60   new pairs, toward
#       the classifier's uncertain region (by the spec-only model's gap), none of whose puzzles the
#       classifier trains on; then human-cascade.ts measure, and llm-human.ts grid with
#       LLM_HUMAN_DIR=human-cascade (its own ledger)
#   references/ml/.venv/bin/python puzzles/difficulty/human_cascade.py confirm     the new pairs,
#       with t, w and the routing cut fixed on the 96
#
# The classifier is human_gap.py's (per genre, L2 logistic regression on the spec, solve and path
# measures and the top step families), refitted with every pair puzzle left out of training, so
# no pair puzzle is scored by a model that saw it. Its uncertainty:
#   margin   |p - 0.5| for a puzzle; for a pair, the gap between the two sides' log-odds
#   spread   20 bootstrap refits (resampled within each class): the standard deviation of a
#            puzzle's probability, and of a pair's log-odds gap
# A pair whose side has no measure (a solve over 4 minutes) is scored by the spec-only model on both
# sides. Policies over pairs: the classifier, Opus, a cascade (the classifier when the pair's gap is
# at least t, else Opus), a combination (log-odds gap + w × Opus's log-odds) and routing by type
# (Opus where the classifier's cross-validated AUC on the training sample is below a). t, w and a
# are chosen by cross-validation over pairs (5 folds, repeated); confidence intervals are bootstraps
# over pairs.
import json, os, sys, hashlib
from collections import defaultdict
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from human_gap import (REFS, OUT as GAP, SIZE_COLS, spec_feats, solve_feats, path_feats, settings_of, fit_logreg,
                       standardise, predict, fill_missing, matrix, crossval, auc, read_jsonl)
np.seterr(all="ignore")

OUT = os.path.join(REFS, "ml/human-cascade")
LLM = os.path.join(REFS, "ml/llm-human")
BOOT = 20
LOGIT_CAP = 12.0          # a puzzle's log-odds, clipped: beyond it the model is sure either way
SOLVE_COLS = list(solve_feats({"band": "easy", "interest": {k: 0 for k in ("busywork", "hardShare", "stuck", "breakIn", "keyAt", "keyCost", "flowSpread", "oneWay", "aimless", "theme", "variety", "flowMean")}}).keys())
PATH_COLS = list(path_feats([[0, 0, 1, 1]], 1).keys())

def spec_key(spec): return hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()
def logit(p): p = np.clip(p, 1e-12, 1 - 1e-12); return np.clip(np.log(p / (1 - p)), -LOGIT_CAP, LOGIT_CAP)

def ok(r): return r.get("band") not in (None, "timeout") and not r.get("error") and r.get("solved")

def rows_of(g, rs, setting_vals):
    out = []
    for r in rs:
        f, _ = spec_feats(g, r["spec"])
        if ok(r):
            f.update(solve_feats(r)); f.update(path_feats(r.get("path") or [], r.get("cells") or 1))
            fam = r.get("families") or {}; n = sum(fam.values()) or 1
            for k, v in fam.items(): f["fam:" + k] = v / n
        f["setting"] = settings_of(g, r["spec"])
        for s in setting_vals: f[f"setting:{s}"] = float(f["setting"] == s) if len(setting_vals) > 1 else np.nan
        out.append(f)
    return out

class Model:
    """One genre's classifier, fitted on the training rows, with BOOT bootstrap refits."""
    def __init__(self, g, train, variant, seed=0):
        self.g = g
        self.setting_vals = sorted({settings_of(g, r["spec"]) for r in train})
        rows = rows_of(g, train, self.setting_vals)
        y = np.array([0.0 if r["source"] == "gen" else 1.0 for r in train])
        fams = defaultdict(float)
        for r in train:
            for k, v in (r.get("families") or {}).items(): fams[k] += v
        top = ["fam:" + k for k, _ in sorted(fams.items(), key=lambda x: -x[1])[:12]]
        spec_cols = sorted({c for f in rows for c in f if c != "setting" and not c.startswith("fam:") and c not in SOLVE_COLS and c not in PATH_COLS and not (c.startswith("setting:") and len(self.setting_vals) < 2)})
        cols = {"all": spec_cols + SOLVE_COLS + PATH_COLS + top,
                "sizeFree": [c for c in spec_cols + SOLVE_COLS + PATH_COLS if c not in SIZE_COLS and not c.startswith("setting:")] + top,
                "specOnly": spec_cols}[variant]
        cols = [c for c in cols if any(not np.isnan(r.get(c, np.nan)) for r in rows) or c.startswith(("fam:", "kind:", "value="))]
        self.cols = cols
        X = fill_missing(matrix(rows, cols), cols)
        self.fill = {c: (0.0 if c.startswith(("kind:", "value=", "fam:")) else float(np.nanmean(X[:, j]))) for j, c in enumerate(cols)}
        self.cv_auc = auc(y, crossval(X, y, [r["name"] for r in train]))
        Z, self.mu, self.sd = standardise(X)
        self.beta = fit_logreg(Z, y)
        rng = np.random.default_rng(seed)
        self.boot = []
        hi, lo = np.where(y == 1)[0], np.where(y == 0)[0]
        for _ in range(BOOT):
            idx = np.r_[rng.choice(hi, len(hi)), rng.choice(lo, len(lo))]
            Zb, mb, sb = standardise(X[idx])
            self.boot.append((fit_logreg(Zb, y[idx]), mb, sb))
        self.n = (int(y.sum()), int(len(y) - y.sum()))

    def X(self, rs):
        rows = rows_of(self.g, rs, self.setting_vals)
        X = matrix(rows, self.cols)
        for j, c in enumerate(self.cols): X[np.isnan(X[:, j]), j] = self.fill[c]
        return X

    def score(self, rs):
        """[(p, logit, the bootstrap probabilities)] for each puzzle"""
        X = self.X(rs)
        p = predict(self.beta, standardise(X, self.mu, self.sd)[0])
        pb = np.array([predict(b, standardise(X, m, s)[0]) for b, m, s in self.boot]).T   # puzzles × BOOT
        return p, pb

def load_training():
    seen, out = set(), []
    for f in sorted(os.listdir(GAP)):
        if f.startswith("measured") and f.endswith(".jsonl"):
            for r in read_jsonl(os.path.join(GAP, f)):
                if ok(r) and r["name"] not in seen: seen.add(r["name"]); out.append(r)
    return out

def opus_grid(folder, pairs):
    """pair id → (Opus's log-odds that the human side is human, its confidence, picked right?)"""
    out = {}
    for p in pairs:
        f = os.path.join(folder, "calls/grid", p["id"].replace("/", "_") + ".json")
        if not os.path.exists(f): continue
        s = json.load(open(f))
        if not s.get("parsed"): continue
        c = min(100, max(50, float(s["parsed"]["confidence"]))) / 100
        right = s["parsed"]["human"] == ("A" if p["humanFirst"] else "B")
        lo = float(np.log(min(c, 0.99) / (1 - min(c, 0.99))))
        out[p["id"]] = (lo if right else -lo, c, right)
    return out

# ---------- scoring the pairs ----------

def score_pairs(pairs, measured, train, variant="all", models=None):
    """Each pair: the classifier's two probabilities, log-odds gap (human minus generated; > 0 means
    right), its bootstrap spread and agreement, and which model scored it."""
    excl = {r["name"] for r in measured} | {spec_key(r["spec"]) for r in measured}
    by_g = defaultdict(list)
    for r in train:
        if r["name"] not in excl and spec_key(r["spec"]) not in excl: by_g[r["genre"]].append(r)
    meas = {(r["pair"], r["side"]): r for r in measured}
    models = models if models is not None else {}
    out = {}
    for p in pairs:
        g = p["genre"]
        h, gn = meas.get((p["id"], "human")), meas.get((p["id"], "gen"))
        if h is None or gn is None: continue
        v = variant if (ok(h) and ok(gn)) else "specOnly"
        if (g, v) not in models: models[(g, v)] = Model(g, by_g[g], v, seed=len(models))
        m = models[(g, v)]
        prob, pb = m.score([h, gn])
        L, Lb = logit(prob), logit(pb)
        gap_b = Lb[0] - Lb[1]
        out[p["id"]] = {"genre": g, "matched": p["matched"], "variant": v, "pHuman": float(prob[0]), "pGen": float(prob[1]),
                        "gap": float(L[0] - L[1]), "gapSd": float(gap_b.std()), "agree": float(np.mean(gap_b > 0) if L[0] >= L[1] else np.mean(gap_b < 0)),
                        "spreadHuman": float(pb[0].std()), "spreadGen": float(pb[1].std()), "cvAuc": m.cv_auc}
    return out, models

# ---------- policies ----------

def acc(v): return float(np.mean(v)) if len(v) else float("nan")

def boot_ci(correct, n=4000, seed=1):
    rng = np.random.default_rng(seed); c = np.asarray(correct, float)
    m = np.array([c[rng.integers(0, len(c), len(c))].mean() for _ in range(n)])
    return float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975))

def boot_diff(a, b, n=4000, seed=2):
    rng = np.random.default_rng(seed); a, b = np.asarray(a, float), np.asarray(b, float)
    d = []
    for _ in range(n):
        i = rng.integers(0, len(a), len(a)); d.append(a[i].mean() - b[i].mean())
    return float(np.mean(a) - np.mean(b)), float(np.quantile(d, 0.025)), float(np.quantile(d, 0.975)), float(np.mean(np.array(d) <= 0))

def cls_right(r): return r["gap"] > 0 if r["gap"] != 0 else 0.5
def unc(r, kind):
    """a pair's certainty: larger = more sure"""
    if kind == "gap": return abs(r["gap"])
    if kind == "z": return abs(r["gap"]) / (r["gapSd"] + 0.25)
    if kind == "agree": return r["agree"] + 1e-3 * abs(r["gap"])
    raise ValueError(kind)

def cascade(rows, t, kind):
    return [cls_right(r) if unc(r, kind) >= t else r["opus"][2] for r in rows]

def combo(rows, w):
    out = []
    for r in rows:
        s = r["gap"] + w * r["opus"][0]
        out.append(s > 0 if s != 0 else 0.5)
    return out

def route(rows, a):
    return [cls_right(r) if r["cvAuc"] >= a else r["opus"][2] for r in rows]

def choose(rows, grid, f):
    """the parameter with the best accuracy on rows (ties: the first in grid, which is the cheapest)"""
    best, bv = None, -1
    for x in grid:
        v = acc(f(rows, x))
        if v > bv + 1e-12: best, bv = x, v
    return best

def cv_policy(rows, grid_of, f, k=5, reps=20, seed=3):
    """Cross-validation over pairs: in each fold the parameter is chosen on the other folds and
    applied to this one. Returns per-pair correctness averaged over repeats, and the chosen values."""
    rng = np.random.default_rng(seed)
    n = len(rows); res = np.zeros(n); chosen = []
    for _ in range(reps):
        perm = rng.permutation(n); folds = np.array_split(perm, k)
        for te in folds:
            tes = set(te.tolist()); trs = [rows[i] for i in range(n) if i not in tes]
            x = choose(trs, grid_of(trs), f); chosen.append(x)
            v = f([rows[i] for i in te], x)
            for i, c in zip(te, v): res[i] += c
    return res / reps, chosen

def half_policy(rows, grid_of, f, seed=4):
    """Choose on a random half, evaluate on the other, both ways round, 20 splits."""
    rng = np.random.default_rng(seed); accs = []
    for _ in range(20):
        perm = rng.permutation(len(rows)); a, b = perm[: len(rows) // 2], perm[len(rows) // 2:]
        for tr, te in ((a, b), (b, a)):
            x = choose([rows[i] for i in tr], grid_of([rows[i] for i in tr]), f)
            accs.append(acc(f([rows[i] for i in te], x)))
    return float(np.mean(accs)), float(np.std(accs))

W_GRID = [0, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 1e6]
def t_grid(kind):
    return lambda rows: sorted({unc(r, kind) for r in rows} | {0.0}) + [float("inf")]
def a_grid(rows): return sorted({r["cvAuc"] for r in rows} | {0.0}) + [1.01]

def table_rows(rows, policies):
    """policies: name → per-pair correctness (aligned with rows)"""
    types = sorted({r["genre"] for r in rows}, key=lambda g: min(r["cvAuc"] for r in rows if r["genre"] == g))
    T = {}
    for name, v in policies.items():
        v = np.asarray(v, float)
        T[name] = {"all": acc(v), "ci": boot_ci(v), "matched": acc(v[[r["matched"] for r in rows]]),
                   "types": {g: acc(v[[r["genre"] == g for r in rows]]) for g in types}}
    return T, types

def offline(variant="all"):
    pairs = json.load(open(os.path.join(LLM, "pairs.json")))
    measured = list(read_jsonl(os.path.join(OUT, "measured.jsonl")))
    measured = [r for r in measured if any(p["id"] == r["pair"] for p in pairs)]
    train = load_training()
    sc, models = score_pairs(pairs, measured, train, variant)
    op = opus_grid(LLM, pairs)
    rows = []
    for p in pairs:
        if p["id"] in sc and p["id"] in op: rows.append({"id": p["id"], **sc[p["id"]], "opus": op[p["id"]]})
    R = {"variant": variant, "n": len(rows), "specOnlyPairs": [r["id"] for r in rows if r["variant"] == "specOnly"]}
    cl = [cls_right(r) for r in rows]; opv = [r["opus"][2] for r in rows]
    oracle = [max(a, b) for a, b in zip(cl, opv)]
    pol = {"classifier": cl, "opus": opv}
    # cascade by each uncertainty measure, t by CV
    cv_chosen = {}
    for kind in ("gap", "z", "agree"):
        v, ch = cv_policy(rows, t_grid(kind), lambda rs, t, kind=kind: cascade(rs, t, kind))
        pol[f"cascade ({kind}, CV)"] = v; cv_chosen[kind] = ch
    v, chw = cv_policy(rows, lambda rs: W_GRID, combo); pol["combination (CV)"] = v
    v, cha = cv_policy(rows, a_grid, route); pol["routing by type (CV)"] = v
    pol["oracle (either right)"] = oracle
    T, types = table_rows(rows, pol)
    R["table"] = T; R["types"] = types
    R["cvAuc"] = {g: next(r["cvAuc"] for r in rows if r["genre"] == g) for g in types}
    R["halves"] = {"cascade gap": half_policy(rows, t_grid("gap"), lambda rs, t: cascade(rs, t, "gap")),
                   "cascade z": half_policy(rows, t_grid("z"), lambda rs, t: cascade(rs, t, "z")),
                   "combination": half_policy(rows, lambda rs: W_GRID, combo),
                   "routing": half_policy(rows, a_grid, route)}
    best_single = "classifier" if acc(cl) >= acc(opv) else "opus"
    R["vsBest"] = {k: boot_diff(pol[k], pol[best_single]) for k in pol if k not in ("classifier", "opus")}
    R["bestSingle"] = best_single
    # the sweep, on all 96 (descriptive), by the gap
    sweep = []
    for q in np.linspace(0, 1, 21):
        t = float(np.quantile([abs(r["gap"]) for r in rows], q)) if q < 1 else float("inf")
        v = cascade(rows, t, "gap")
        sweep.append({"t": t, "toOpus": float(np.mean([abs(r["gap"]) < t for r in rows])), "acc": acc(v)})
    R["sweep"] = sweep
    # the threshold chosen on all 96 pairs (for step 4) and how often CV chose near it
    t_all = choose(rows, t_grid("gap")(rows), lambda rs, t: cascade(rs, t, "gap"))
    R["tAll"] = t_all; R["toOpusAtT"] = float(np.mean([abs(r["gap"]) < t_all for r in rows]))
    R["tCV"] = {k: [float(np.quantile(v, q)) for q in (0.1, 0.5, 0.9)] for k, v in cv_chosen.items()}
    R["toOpusCV"] = {k: float(np.mean([np.mean([unc(r, k) < t for r in rows]) for t in v])) for k, v in cv_chosen.items()}
    R["wCV"] = {str(w): int(sum(1 for x in chw if x == w)) for w in W_GRID}
    R["aCV"] = {f"{a:.3f}": int(sum(1 for x in cha if x == a)) for a in sorted(set(cha))}
    # where the classifier is unsure, who is right?
    order = sorted(rows, key=lambda r: abs(r["gap"]))
    R["byGapQuartile"] = []
    for k in range(4):
        part = order[k * len(order) // 4:(k + 1) * len(order) // 4]
        R["byGapQuartile"].append({"gapMax": abs(part[-1]["gap"]), "classifier": acc([cls_right(r) for r in part]), "opus": acc([r["opus"][2] for r in part]), "n": len(part)})
    # does the classifier's uncertainty find its errors? AUC of certainty against being right
    for kind in ("gap", "z", "agree"):
        R[f"uncAuc_{kind}"] = auc(np.array([float(cls_right(r) is True or cls_right(r) == 1) for r in rows]), np.array([unc(r, kind) for r in rows]))
    R["spreads"] = {"human": float(np.median([r["spreadHuman"] for r in rows])), "gen": float(np.median([r["spreadGen"] for r in rows])),
                    "rightSd": float(np.median([r["gapSd"] for r in rows if cls_right(r) is True])), "wrongSd": float(np.median([r["gapSd"] for r in rows if cls_right(r) is not True] or [np.nan]))}
    R["models"] = {f"{g} {v}": {"cvAuc": m.cv_auc, "n": m.n, "cols": len(m.cols)} for (g, v), m in models.items()}
    R["pairs"] = rows
    return R

def fmt(R):
    L = [f"Variant {R['variant']}; {R['n']} pairs; spec-only (a side unmeasured): {len(R['specOnlyPairs'])} {R['specOnlyPairs']}", ""]
    types = R["types"]
    L.append("| Policy | All (95% CI) | Size-matched | " + " | ".join(types) + " |")
    L.append("|---|---|---|" + "---|" * len(types))
    L.append("| classifier CV AUC (training) | | | " + " | ".join(f"{R['cvAuc'][g]:.2f}" for g in types) + " |")
    for k, v in R["table"].items():
        L.append(f"| {k} | {v['all']:.1%} ({v['ci'][0]:.0%}–{v['ci'][1]:.0%}) | {v['matched']:.1%} | " + " | ".join(f"{v['types'][g]:.0%}" for g in types) + " |")
    L += ["", f"Best single: {R['bestSingle']}. Gains over it (mean, 95% CI, share of bootstraps ≤ 0):"]
    for k, (d, lo, hi, pn) in R["vsBest"].items(): L.append(f"- {k}: {d:+.1%} ({lo:+.1%} to {hi:+.1%}), P(≤0) {pn:.2f}")
    L += ["", "Choose on one half, test on the other (mean, sd over 40):"] + [f"- {k}: {m:.1%} ± {s:.1%}" for k, (m, s) in R["halves"].items()]
    L += ["", f"t on all pairs (gap): {R['tAll']:.3f}, sends {R['toOpusAtT']:.0%} to Opus; CV's t (10/50/90%): {R['tCV']}; share to Opus under CV: {R['toOpusCV']}",
          f"w chosen in CV: {R['wCV']}", f"routing AUC cut chosen in CV: {R['aCV']}", "", "Sweep (gap):"]
    for s in R["sweep"]: L.append(f"- t {s['t']:.3f}: to Opus {s['toOpus']:.0%}, accuracy {s['acc']:.1%}")
    L += ["", "By the classifier's gap, quartiles: " + "; ".join(f"≤{q['gapMax']:.2f}: classifier {q['classifier']:.0%}, Opus {q['opus']:.0%}" for q in R["byGapQuartile"])]
    L += [f"Certainty against being right (AUC): gap {R['uncAuc_gap']:.2f}, z {R['uncAuc_z']:.2f}, agreement {R['uncAuc_agree']:.2f}",
          f"Bootstrap spread (sd of p), median: human side {R['spreads']['human']:.3f}, generated {R['spreads']['gen']:.3f}; sd of the gap when right {R['spreads']['rightSd']:.2f}, wrong {R['spreads']['wrongSd']:.2f}"]
    L += ["", "Wrong pairs (classifier):"] + [f"- {r['id']} gap {r['gap']:+.2f} (sd {r['gapSd']:.2f}, agree {r['agree']:.2f}) pH {r['pHuman']:.3f} pG {r['pGen']:.3f}; Opus {'right' if r['opus'][2] else 'wrong'} {r['opus'][1]:.2f}" for r in R["pairs"] if cls_right(r) is not True]
    return "\n".join(L)

# ---------- new pairs (step 4) ----------

FLEET = os.path.join(REFS, "ml/gen-fleet-20261013-0921/generated")
TYPES = ["akari", "hitori", "slitherlink", "star-battle", "masyu", "sudoku", "nurikabe", "cave", "shikaku", "spiral-galaxies", "simple-loop", "skyscrapers"]

def size_of(spec): return tuple(spec["size"])

def sample(n, per_type_cap=15, cands=40, seed=7):
    """Candidate pairs per type (a human puzzle and a generated one of the same size where the
    sources allow, as llm-human.ts pairs them), none in the classifier's training sample or the 96
    pairs; each scored by the spec-only model (trained without the 96 pairs' puzzles); n drawn with
    weight exp(-|gap| / 2), at most per_type_cap a type."""
    rng = np.random.default_rng(seed)
    old = json.load(open(os.path.join(LLM, "pairs.json")))
    old_names = {p[s]["name"] for p in old for s in ("human", "gen")}
    old_specs = {spec_key(p[s]["spec"]) for p in old for s in ("human", "gen")}
    train = [r for r in load_training() if r["name"] not in old_names and spec_key(r["spec"]) not in old_specs]
    used = {r["name"] for r in train} | old_names
    used_specs = {spec_key(r["spec"]) for r in train} | old_specs
    humans = defaultdict(list)
    for r in read_jsonl(os.path.join(GAP, "human-specs.jsonl")):
        if r["name"] not in used and spec_key(r["spec"]) not in used_specs and max(r["spec"]["size"]) <= 12: humans[r["genre"]].append(r)
    cand = []
    for g in TYPES:
        f = os.path.join(GAP, "gen-corpus/shikaku.jsonl") if g == "shikaku" else os.path.join(FLEET, g + ".jsonl")
        gens = [d for d in read_jsonl(f) if d.get("spec") and d["key"] not in used and spec_key(d["spec"]) not in used_specs]
        if not gens or not humans[g]: continue
        by_size = defaultdict(list)
        for d in gens: by_size[size_of(d["spec"])].append(d)
        largest = max(by_size, key=lambda s: s[0] * s[1])
        hs = list(humans[g]); rng.shuffle(hs)
        # same size first; then the smallest up to 10 × 10, against the generator's largest
        hs.sort(key=lambda h: (size_of(h["spec"]) not in by_size, 0 if size_of(h["spec"]) in by_size else h["spec"]["size"][0] * h["spec"]["size"][1]))
        hs = [h for h in hs if size_of(h["spec"]) in by_size or max(h["spec"]["size"]) <= 10][:cands]
        model = Model(g, [r for r in train if r["genre"] == g], "specOnly")
        taken = set()
        for h in hs:
            matched = size_of(h["spec"]) in by_size
            pool = [d for d in by_size[size_of(h["spec"]) if matched else largest] if d["key"] not in taken]
            if not pool: continue
            d = pool[rng.integers(len(pool))]; taken.add(d["key"])
            p, _ = model.score([{"source": h["source"], "spec": h["spec"]}, {"source": "gen", "spec": d["spec"]}])
            L = logit(p)
            cand.append({"genre": g, "human": {"source": h["source"], "name": h["name"], "spec": h["spec"]},
                         "gen": {"source": "gen", "name": d["key"], "spec": d["spec"]}, "matched": matched, "specGap": float(L[0] - L[1])})
    w = np.array([np.exp(-abs(c["specGap"]) / 2) for c in cand])
    chosen, count = [], defaultdict(int)
    for i in rng.choice(len(cand), len(cand), replace=False, p=w / w.sum()):
        c = cand[i]
        if count[c["genre"]] >= per_type_cap: continue
        count[c["genre"]] += 1; chosen.append(c)
        if len(chosen) >= n: break
    out, k_of = [], defaultdict(int)
    for c in sorted(chosen, key=lambda c: TYPES.index(c["genre"])):
        k_of[c["genre"]] += 1
        out.append({"id": f"new-{c['genre']}-{k_of[c['genre']]}", "genre": c["genre"], "human": c["human"], "gen": c["gen"], "matched": c["matched"], "humanFirst": bool(rng.integers(2)), "specGap": c["specGap"]})
    json.dump(out, open(os.path.join(OUT, "pairs.json"), "w"), indent=1)
    print(f"{len(cand)} candidate pairs ({dict((g, sum(1 for c in cand if c['genre'] == g)) for g in TYPES)}); chose {len(out)}: {dict(count)}; "
          f"|spec-only gap| median chosen {np.median([abs(c['specGap']) for c in out]):.2f}, all candidates {np.median([abs(c['specGap']) for c in cand]):.2f}; size-matched {sum(c['matched'] for c in out)}")

def confirm():
    """The new pairs, scored by the classifier (every pair puzzle, old and new, left out of
    training), with t, w and the routing cut each fixed at the value chosen on all 96."""
    old = json.load(open(os.path.join(LLM, "pairs.json")))
    new = json.load(open(os.path.join(OUT, "pairs.json")))
    measured = list(read_jsonl(os.path.join(OUT, "measured.jsonl")))
    train = load_training()
    op_old, op_new = opus_grid(LLM, old), opus_grid(OUT, new)
    R = {}
    for variant in ("all", "sizeFree"):
        sc, _ = score_pairs(old + new, measured, train, variant)
        rows_old = [{"id": p["id"], **sc[p["id"]], "opus": op_old[p["id"]]} for p in old if p["id"] in sc and p["id"] in op_old]
        rows = [{"id": p["id"], **sc[p["id"]], "opus": op_new[p["id"]], "specGap": p.get("specGap")} for p in new if p["id"] in sc and p["id"] in op_new]
        t = choose(rows_old, t_grid("gap")(rows_old), lambda rs, t: cascade(rs, t, "gap"))
        ta = choose(rows_old, t_grid("agree")(rows_old), lambda rs, t: cascade(rs, t, "agree"))
        w = choose(rows_old, W_GRID, combo)
        a = choose(rows_old, a_grid(rows_old), route)
        cl = [cls_right(r) for r in rows]; opv = [r["opus"][2] for r in rows]
        pol = {"classifier": cl, "opus": opv, f"cascade (gap, t {t:.2f})": cascade(rows, t, "gap"), f"cascade (agreement, t {ta:.2f})": cascade(rows, ta, "agree"),
               f"combination (w {w:g})": combo(rows, w), f"routing by type (AUC cut {a:.2f})": route(rows, a)}
        gaps = sorted(abs(r["gap"]) for r in rows)
        for share in (0.1, 0.25, 0.5):
            pol[f"cascade, {share:.0%} to Opus"] = cascade(rows, gaps[int(share * len(gaps))], "gap")
        pol["oracle (either right)"] = [max(x, y) for x, y in zip(cl, opv)]
        T, types = table_rows(rows, pol)
        best = "classifier" if acc(cl) >= acc(opv) else "opus"
        order = sorted(rows, key=lambda r: abs(r["gap"]))
        quart = []
        for k in range(4):
            part = order[k * len(order) // 4:(k + 1) * len(order) // 4]
            if part: quart.append({"gapMax": abs(part[-1]["gap"]), "classifier": acc([cls_right(r) for r in part]), "opus": acc([r["opus"][2] for r in part]), "n": len(part)})
        R[variant] = {"n": len(rows), "table": T, "types": types, "cvAuc": {g: next(r["cvAuc"] for r in rows if r["genre"] == g) for g in types},
                      "vsBest": {k: boot_diff(v, pol[best]) for k, v in pol.items() if k not in ("classifier", "opus")}, "bestSingle": best,
                      "byGapQuartile": quart, "specGapVsGap": float(np.corrcoef([abs(r["specGap"]) for r in rows], [abs(r["gap"]) for r in rows])[0, 1]),
                      "pairs": rows, "fixed": {"t": t, "tAgree": ta, "w": w, "a": a}}
    L = []
    for v, X in R.items():
        L += [f"## {v}: {X['n']} new pairs; fixed on the 96: {X['fixed']}", "",
              "| Policy | All (95% CI) | Size-matched | " + " | ".join(f"{g} ({sum(1 for r in X['pairs'] if r['genre'] == g)})" for g in X["types"]) + " |",
              "|---|---|---|" + "---|" * len(X["types"]),
              "| classifier CV AUC (training) | | | " + " | ".join(f"{X['cvAuc'][g]:.2f}" for g in X["types"]) + " |"]
        for k, t in X["table"].items():
            L.append(f"| {k} | {t['all']:.1%} ({t['ci'][0]:.0%}–{t['ci'][1]:.0%}) | {t['matched']:.1%} | " + " | ".join(f"{t['types'][g]:.0%}" for g in X["types"]) + " |")
        L += ["", f"Best single: {X['bestSingle']}. Gains over it:"] + [f"- {k}: {d:+.1%} ({lo:+.1%} to {hi:+.1%}), P(≤0) {pn:.2f}" for k, (d, lo, hi, pn) in X["vsBest"].items()]
        L += ["", "By the gap, quartiles: " + "; ".join(f"≤{q['gapMax']:.2f}: classifier {q['classifier']:.0%}, Opus {q['opus']:.0%}" for q in X["byGapQuartile"]),
              f"Spec-only gap (used to sample) against the full gap: r = {X['specGapVsGap']:.2f}", "", "Wrong pairs (classifier):"]
        L += [f"- {r['id']} gap {r['gap']:+.2f} pH {r['pHuman']:.3f} pG {r['pGen']:.3f}; Opus {'right' if r['opus'][2] else 'wrong'} {r['opus'][1]:.2f}" for r in X["pairs"] if cls_right(r) is not True] + [""]
    open(os.path.join(OUT, "confirm.md"), "w").write("\n".join(L))
    json.dump(R, open(os.path.join(OUT, "confirm.json"), "w"), indent=1, default=float)
    print("\n".join(L))

if __name__ == "__main__":
    job = sys.argv[1] if len(sys.argv) > 1 else "offline"
    os.makedirs(OUT, exist_ok=True)
    if job == "offline":
        res = {v: offline(v) for v in ("all", "sizeFree")}
        text = "\n\n".join(f"## {v}\n\n" + fmt(R) for v, R in res.items())
        open(os.path.join(OUT, "cascade-report.md"), "w").write(text + "\n")
        json.dump(res, open(os.path.join(OUT, "cascade.json"), "w"), indent=1, default=float)
        print(text)
    elif job == "sample": sample(int(sys.argv[2]) if len(sys.argv) > 2 else 60)
    elif job == "confirm": confirm()
