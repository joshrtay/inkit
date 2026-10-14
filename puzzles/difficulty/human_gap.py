# How our generated puzzles differ from human-made ones, and how human a generated puzzle looks
# (docs/research-human-gap.md). Reads what human-gap.ts gathered:
#   references/ml/human-gap/human-specs.jsonl   every human puzzle we read (Janko, Puzzle Square JP)
#   references/ml/human-gap/measured*.jsonl     a sample of human and generated puzzles, solved alike
#   references/ml/gen-fleet-20261013-0921/generated/<genre>.jsonl   the fleet's 133k puzzles
# and writes
#   references/ml/human-gap/<genre>.md, summary.md   the biggest differences, with effect sizes
#   references/ml/human-gap/scores.jsonl             key → the probability a puzzle is human,
#                                                     out of fold (5 folds), per genre
#   puzzles/difficulty/human-targets.json            the human distributions, for the generator
#                                                     (human-targets.md says what's in it)
#
#   references/ml/.venv/bin/python puzzles/difficulty/human_gap.py
#   references/ml/.venv/bin/python puzzles/difficulty/human_gap.py score <records.jsonl>...
#       new puzzles (gen-set.ts's lines, or GEN_CANDS's candidates) scored by their genre's size-free
#       fleet model (score_records): for measuring the generator's preferences
#
# Three groups of measures:
#   spec    from the puzzle alone (size, settings, clue density and kinds, symmetry): every human
#           puzzle against every generated one
#   solve   from the solve gen-set.ts records (band, estimate, step tiers, interest): the sample,
#           solved the same way on both sides
#   path    from each step's round, tier and cost (rounds, stuck rounds, where the hardest steps
#           fall, runs of easy steps, break-ins): the sample
# Effect sizes: Cohen's d (difference of means over the pooled spread) for numbers, Cohen's h for
# shares. The classifier is logistic regression (numpy; the venv has no scikit-learn), L2,
# standardised features, classes weighted equally, 5-fold cross-validated AUC.
import glob, hashlib, json, math, os, sys
from collections import Counter, defaultdict
import numpy as np
np.seterr(all="ignore")   # numpy 2.0 on Accelerate reports spurious overflow in matmul

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../.."))
REFS = next((d for d in [os.path.join(REPO, "references"), os.path.join(REPO.split("/.claude/worktrees/")[0], "references")] if os.path.isdir(os.path.join(d, "ml"))), os.path.join(REPO, "references"))
OUT = os.path.join(REFS, "ml/human-gap")
FLEET = os.environ.get("GAP_GEN") or os.path.join(REFS, "ml/gen-fleet-20261013-0921/generated")
TARGETS = os.path.join(HERE, "human-targets.json")
FIXED = {"block", "door", "peg", "lengths", "start", "end", "gap", "bank"}
BANDS = ["easy", "medium", "hard", "expert", "beyond"]
MIN_HUMAN = 12          # human puzzles (solved) a genre needs to be compared and classified

# ---------- measures ----------

def default_rules(genre):
    return {"star-battle": {"stars": 1}, "easy-as-abc": {"letters": 3}}.get(genre, {})

def settings_of(genre, spec):
    """The rule settings that vary between puzzles of a genre, as a short label."""
    s = dict(default_rules(genre))
    for r in spec.get("rules") or []:
        if r.get("rule") == "shaded-per-line": s["stars"] = r.get("n", 1)
        elif r.get("rule") == "letters": s["letters"] = r.get("count")
        elif r.get("rule") == "boxes": s["box"] = "x".join(map(str, r.get("box", [])))
        elif r.get("rule") not in ("shaded-per-area", "no-touch", "first-seen"): s[r.get("rule")] = 1
    if genre == "fill-in": s["digits"] = max((len(e) for e in spec.get("entries", [])), default=0)
    return ",".join(f"{k}={v}" for k, v in sorted(s.items())) or "default"

def nested_settings(counts, n):
    """{"stars=2,box=3x3": 5, ...} → {"stars": {"2": share}, "box": {"3x3": share}}"""
    out = defaultdict(Counter)
    for label, k in counts.items():
        if label == "default": continue
        for part in label.split(","):
            key, _, val = part.partition("=")
            out[key][val] += k
    return {key: {v: round(c / max(1, n), 3) for v, c in vals.most_common()} for key, vals in out.items()}

def symmetry(spec):
    """looks.ts's measures, extended to clues outside the grid (Skyscrapers, Easy as ABC: a clue on
    the top edge sits at row -1) and on grid points (Spiral Galaxies' centres): the share of clues
    (or area walls) whose twin under a half turn, a mirror, a quarter turn or a diagonal is one too.
    Places are in doubled coordinates (cell r, c at 2r + 1, 2c + 1; a point as given). Hitori
    (every cell given) has no layout to be symmetric: its kind is "none" by definition."""
    R, C = spec["size"]
    feats = []
    cell = lambda r, c: (2 * r + 1, 2 * c + 1)
    if spec.get("areas"):
        a = spec["areas"]
        for r in range(R):
            for c in range(C):
                if c + 1 < C and a[r][c] != a[r][c + 1]: feats.append((*cell(r, c), *cell(r, c + 1)))
                if r + 1 < R and a[r][c] != a[r + 1][c]: feats.append((*cell(r, c), *cell(r + 1, c)))
    elif spec.get("genre") != "hitori":
        seen = set()
        for g in spec.get("givens") or []:
            if g.get("at") == "point" and "point" in g: p = tuple(g["point"])
            elif "cell" not in g or g.get("kind") == "lengths": continue
            elif g.get("at") == "edge":
                r, c = g["cell"]
                p = cell(*{"top": (-1, c), "bottom": (R, c), "left": (r, -1), "right": (r, C)}.get(g.get("side"), (r, c)))
            elif g.get("at") == "cell": p = cell(*g["cell"])
            else: continue
            if p not in seen: seen.add(p); feats.append((*p, *p))
    key = lambda p: tuple(sorted([(p[0], p[1]), (p[2], p[3])]))
    have = {key(p) for p in feats}
    def share(t):
        if not feats: return 0.0
        return sum(1 for (a, b, c, d) in feats if key((*t(a, b), *t(c, d))) in have) / len(feats)
    H, W = 2 * R, 2 * C
    rot = share(lambda r, c: (H - r, W - c))
    mir = max(share(lambda r, c: (r, W - c)), share(lambda r, c: (H - r, c)))
    quarter = diag = 0.0
    if R == C:
        quarter = share(lambda r, c: (c, H - r))
        diag = max(share(lambda r, c: (c, r)), share(lambda r, c: (W - c, H - r)))
    best = max(rot, mir, quarter, diag)
    # a diagonal is a mirror too (the generator reads rot180, mirror and none)
    kind = "rot180" if rot == 1 else "mirror" if max(mir, diag) == 1 else "none"
    return {"symRot": rot, "symMirror": mir, "symDiag": diag, "symBest": best, "exactRot": float(rot == 1), "exactAny": float(best == 1)}, kind, len(feats)

def spec_feats(genre, spec):
    R, C = spec["size"]
    cells = R * C
    givens = spec.get("givens") or []
    clues = [g for g in givens if g.get("kind") not in FIXED]
    f = {"rows": R, "cols": C, "cells": cells, "notSquare": float(R != C)}
    sym, kind, nfeat = symmetry(spec)
    f.update(sym)
    if spec.get("areas"):
        f["areaCount"] = len(set("".join(spec["areas"])))
        f["areaMean"] = cells / max(1, f["areaCount"])
        sizes = Counter("".join(spec["areas"]))
        f["areaSpread"] = float(np.std(list(sizes.values())) / max(1e-9, np.mean(list(sizes.values()))))
    outside = [g for g in givens if g.get("at") == "edge"]
    f["clueDensity"] = len(clues) / cells
    f["givenDensity"] = len(givens) / cells
    if outside: f["edgeShare"] = len(outside) / (2 * (R + C))
    kinds = Counter(g.get("kind") for g in givens)
    for k, n in kinds.items(): f[f"kind:{k}"] = n / max(1, len(givens))
    nums = [g["value"] for g in clues if isinstance(g.get("value"), (int, float)) and not isinstance(g.get("value"), bool)]
    if nums:
        f["valueMean"] = float(np.mean(nums))
        f["valueMeanPerSide"] = float(np.mean(nums)) / max(R, C)
        if genre in ("slitherlink", "akari", "minesweeper", "cave", "nurikabe", "skyscrapers", "easy-as-abc", "aquarium"):
            vc = Counter(min(int(v), 6) for v in nums)
            for v, n in vc.items(): f[f"value={v}"] = n / len(nums)
    cats = Counter(str(g.get("value")) for g in clues if isinstance(g.get("value"), str))
    for v, n in cats.items(): f[f"value={v}"] = n / max(1, len(clues))
    if genre == "hitori":
        num = {tuple(g["cell"]): g["value"] for g in givens if g.get("at") == "cell"}
        dup = 0
        for (r, c), v in num.items():
            if sum(1 for cc in range(C) if num.get((r, cc)) == v) > 1 or sum(1 for rr in range(R) if num.get((rr, c)) == v) > 1: dup += 1
        f["dupShare"] = dup / max(1, len(num))
    if genre == "sudoku":
        f["givens"] = len(clues)
    return f, kind

def solve_feats(r):
    """From what gen-set.ts records of a solve (both sides measured the same way)."""
    cells = max(1, r.get("cells") or 1)
    steps = max(1, r.get("steps") or 1)
    pt = r.get("perTier") or [0, 0, 0, 0]
    it = r.get("interest") or {}
    f = {
        "band": BANDS.index(r["band"]) if r.get("band") in BANDS else np.nan,
        "estimate": r.get("estimate"), "dSteps": r.get("dSteps"), "maxCost": r.get("maxCost"),
        "stepsPerCell": steps / cells, "tier1Share": pt[1] / steps, "tier2Share": (pt[2] + pt[3]) / steps,
        "ruleLoad": r.get("ruleLoad"), "required": len(r.get("required") or []),
    }
    for k in ("busywork", "hardShare", "stuck", "breakIn", "keyAt", "keyCost", "flowSpread", "oneWay", "aimless", "theme", "variety"):
        if k in it: f[k] = it[k]
    if "flowMean" in it: f["flowPerCell"] = it["flowMean"] / cells
    return {k: (np.nan if v is None else float(v)) for k, v in f.items()}

def path_feats(path, cells):
    """From each step's [round, tier, cost, facts]."""
    if not path: return {}
    n = len(path)
    costs = np.array([p[2] for p in path], float)
    rounds = defaultdict(list)
    for p in path: rounds[p[0]].append(p)
    nr = len(rounds)
    hard_n = max(1, round(0.1 * n))
    top = np.argsort(-costs, kind="stable")[:hard_n]
    pos = top / max(1, n - 1)
    easy = costs <= 2.5
    runs, cur = [], 0
    for e in easy:
        if e: cur += 1
        else:
            if cur: runs.append(cur)
            cur = 0
    if cur: runs.append(cur)
    key = int(np.argmax(costs))
    after = 0
    for e in easy[key + 1:]:
        if not e: break
        after += 1
    return {
        "rounds": nr, "roundsPerCell": nr / cells, "stepsPerRound": n / nr,
        "stuckRounds": sum(1 for ps in rounds.values() if any(p[1] >= 2 for p in ps)) / nr,
        "tier1Rounds": sum(1 for ps in rounds.values() if any(p[1] >= 1 for p in ps)) / nr,
        "hardAt": float(pos.mean()), "hardEarly": float((pos < 1 / 3).mean()), "hardMiddle": float(((pos >= 1 / 3) & (pos < 2 / 3)).mean()), "hardLate": float((pos >= 2 / 3).mean()),
        "easyRunMax": max(runs, default=0) / n, "easyRunMean": float(np.mean(runs)) / n if runs else 0.0,
        "breakInRun": after / n, "breakInFlag": float(costs[key] >= 4 and after >= max(3, 0.15 * n)),
        "costSpread": float(costs.std() / max(1e-9, costs.mean())),
        "factsPerStep": float(np.mean([p[3] for p in path])),
    }

# ---------- statistics ----------

def cohen_d(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    if len(a) < 2 or len(b) < 2: return float("nan")
    s = math.sqrt(((len(a) - 1) * a.var(ddof=1) + (len(b) - 1) * b.var(ddof=1)) / (len(a) + len(b) - 2))
    if s < 1e-12: return 0.0 if abs(a.mean() - b.mean()) < 1e-12 else math.copysign(9.99, a.mean() - b.mean())
    return float((a.mean() - b.mean()) / s)

def cohen_h(p, q):
    return 2 * math.asin(math.sqrt(min(1, max(0, p)))) - 2 * math.asin(math.sqrt(min(1, max(0, q))))

def auc(y, s):
    y, s = np.asarray(y), np.asarray(s, float)
    order = np.argsort(s, kind="mergesort")
    ranks = np.empty(len(s)); ranks[order] = np.arange(1, len(s) + 1)
    # ties: average ranks
    _, inv, counts = np.unique(s, return_inverse=True, return_counts=True)
    sums = np.zeros(len(counts)); np.add.at(sums, inv, ranks); ranks = (sums / counts)[inv]
    npos, nneg = (y == 1).sum(), (y == 0).sum()
    if not npos or not nneg: return float("nan")
    return float((ranks[y == 1].sum() - npos * (npos + 1) / 2) / (npos * nneg))

def fit_logreg(X, y, lam=0.01):
    """L2 logistic regression, each class weighing half (Newton steps with backtracking; X already
    standardised). Minimises Σ w·logloss + lam/2·|β|², the weights summing to 1."""
    n, d = X.shape
    Xb = np.hstack([X, np.ones((n, 1))])
    w = np.where(y == 1, 0.5 / max(1, y.sum()), 0.5 / max(1, (1 - y).sum()))
    reg = np.full(d + 1, lam); reg[-1] = 0
    def loss(b):
        z = Xb @ b
        return float(np.sum(w * (np.logaddexp(0, z) - y * z)) + 0.5 * np.sum(reg * b * b))
    beta = np.zeros(d + 1); cur = loss(beta)
    for _ in range(100):
        p = 1 / (1 + np.exp(-np.clip(Xb @ beta, -30, 30)))
        g = Xb.T @ (w * (p - y)) + reg * beta
        H = (Xb * (w * p * (1 - p))[:, None]).T @ Xb + np.diag(reg + 1e-9)
        step = np.linalg.solve(H, g)
        t = 1.0
        while t > 1e-4:
            new = loss(beta - t * step)
            if new <= cur - 1e-4 * t * float(g @ step): break
            t /= 2
        beta, prev, cur = beta - t * step, cur, new
        if prev - cur < 1e-9: break
    return beta

def standardise(X, mu=None, sd=None):
    if mu is None:
        mu = np.nanmean(X, 0); sd = np.nanstd(X, 0); sd[sd < 1e-9] = 1
    Z = (X - mu) / sd
    return np.clip(np.nan_to_num(Z), -5, 5), mu, sd   # clipped: a rare one-hot can't dominate

def predict(beta, Z):
    return 1 / (1 + np.exp(-np.clip(np.hstack([Z, np.ones((len(Z), 1))]) @ beta, -30, 30)))

def folds_of(names, y, k=5):
    # stratified, and fixed per puzzle: within each class, puzzles in the order of a hash of their
    # name, dealt round the folds (so a rerun scores alike, and every fold has its share of humans)
    f = np.zeros(len(names), int)
    for c in (0, 1):
        idx = [i for i in range(len(names)) if y[i] == c]
        idx.sort(key=lambda i: hashlib.md5(names[i].encode()).hexdigest())
        for j, i in enumerate(idx): f[i] = j % k
    return f

def crossval(X, y, names, lam=0.01, k=5):
    """Out-of-fold probabilities (each puzzle scored by a model that never saw it)."""
    f = folds_of(names, y, k)
    out = np.zeros(len(y))
    for i in range(k):
        tr, te = f != i, f == i
        if not te.any() or len(set(y[tr])) < 2: continue
        Ztr, mu, sd = standardise(X[tr])
        beta = fit_logreg(Ztr, y[tr], lam)
        out[te] = predict(beta, standardise(X[te], mu, sd)[0])
    return out

def matrix(rows, cols):
    return np.array([[r.get(c, np.nan) for c in cols] for r in rows], float)

def fill_missing(X, cols):
    """A missing share (a clue kind or value a puzzle doesn't have) is 0; other gaps the column mean."""
    X = X.copy()
    for j, c in enumerate(cols):
        miss = np.isnan(X[:, j])
        if not miss.any(): continue
        X[miss, j] = 0.0 if (c.startswith("kind:") or c.startswith("value=") or c.startswith("fam:")) else (np.nanmean(X[:, j]) if (~miss).any() else 0.0)
    return X

# ---------- data ----------

def read_jsonl(path):
    with open(path) as f:
        for l in f:
            if l.strip(): yield json.loads(l)

def load():
    humans = list(read_jsonl(os.path.join(OUT, "human-specs.jsonl")))
    measured = [r for p in sorted(glob.glob(os.path.join(OUT, "measured*.jsonl"))) for r in read_jsonl(p)]
    measured = [r for r in measured if r.get("band") not in (None, "timeout") and not r.get("error") and r.get("solved")]
    fleet = defaultdict(list)
    for p in sorted(glob.glob(os.path.join(FLEET, "*.jsonl"))):
        g = os.path.basename(p)[:-6]
        for r in read_jsonl(p):
            if r.get("spec") and r.get("band") in BANDS: fleet[g].append(r)
    # the corpus's Shikaku (the network's generated Shikaku: no fleet ones), measured only
    for r in measured:
        if r["source"] == "gen" and r["genre"] not in fleet: fleet.setdefault("~" + r["genre"], []).append(r)
    for g in [g for g in fleet if g.startswith("~")]:
        fleet[g[1:]] = [dict(r, key=r["key"]) for r in fleet.pop(g)]
    return humans, measured, fleet

# ---------- per genre ----------

def compare(rows_h, rows_g, cols, label):
    """Per feature: means (or shares), medians and the effect size, biggest first."""
    out = []
    for c in cols:
        a = np.array([r.get(c, np.nan) for r in rows_h], float)
        b = np.array([r.get(c, np.nan) for r in rows_g], float)
        if c.startswith(("kind:", "value=", "fam:")): a, b = np.nan_to_num(a), np.nan_to_num(b)
        if np.isnan(a).all() or np.isnan(b).all(): continue
        binary = set(np.unique(a[~np.isnan(a)])) | set(np.unique(b[~np.isnan(b)])) <= {0.0, 1.0}
        if binary:
            p, q = np.nanmean(a), np.nanmean(b)
            e, kind = cohen_h(p, q), "h"
        else:
            e, kind = cohen_d(a, b), "d"
        if np.isnan(e): continue
        out.append({"feature": c, "group": label, "human": float(np.nanmean(a)), "gen": float(np.nanmean(b)),
                    "humanMed": float(np.nanmedian(a)), "genMed": float(np.nanmedian(b)), "effect": e, "kind": kind,
                    "auc": auc(np.r_[np.ones(np.sum(~np.isnan(a))), np.zeros(np.sum(~np.isnan(b)))], np.r_[a[~np.isnan(a)], b[~np.isnan(b)]])})
    return sorted(out, key=lambda x: -abs(x["effect"]))

def dist(xs, top=None):
    c = Counter(xs); n = sum(c.values()) or 1
    items = c.most_common(top)
    return {str(k): round(v / n, 3) for k, v in items}

SIZE_COLS = {"rows", "cols", "cells", "notSquare", "areaCount", "areaMean", "givens", "setting", "rounds", "valueMean"}   # what grows with the grid

def main():
    humans, measured, fleet = load()
    os.makedirs(OUT, exist_ok=True)
    hs_by = defaultdict(list)
    for h in humans: hs_by[h["genre"]].append(h)
    ms_h, ms_g = defaultdict(list), defaultdict(list)
    for r in measured: (ms_h if r["source"] != "gen" else ms_g)[r["genre"]].append(r)
    genres = sorted(g for g in fleet if len(ms_h[g]) >= MIN_HUMAN or len(hs_by[g]) >= MIN_HUMAN)
    summary, targets, scores, drift_rows = [], {}, {}, []

    for g in genres:
        gen = fleet[g]
        # ---- spec-level: every human puzzle against every generated one
        hspec, gspec = [], []
        hkind, gkind = [], []
        for h in hs_by[g]:
            f, k = spec_feats(g, h["spec"]); f["setting"] = settings_of(g, h["spec"]); hspec.append(f); hkind.append(k)
        for r in gen:
            f, k = spec_feats(g, r["spec"]); f["setting"] = settings_of(g, r["spec"]); gspec.append(f); gkind.append(k)
        settings_h = Counter(f["setting"] for f in hspec)
        setting_vals = sorted(set(settings_h) | {f["setting"] for f in gspec})
        for f in hspec + gspec:
            for s in setting_vals: f[f"setting:{s}"] = float(f["setting"] == s) if len(setting_vals) > 1 else np.nan
        spec_cols = sorted({c for f in hspec + gspec for c in f if c != "setting" and not (c.startswith("setting:") and len(setting_vals) < 2)})
        spec_cmp = compare(hspec, gspec, spec_cols, "spec") if hspec else []

        # ---- the solved sample, measured alike
        mh, mg = ms_h[g], ms_g[g]
        def solved_rows(rs):
            out = []
            for r in rs:
                f, _ = spec_feats(g, r["spec"]); f.update(solve_feats(r)); f.update(path_feats(r.get("path") or [], r.get("cells") or 1))
                f["setting"] = settings_of(g, r["spec"])
                for s in setting_vals: f[f"setting:{s}"] = float(f["setting"] == s) if len(setting_vals) > 1 else np.nan
                fam = r.get("families") or {}; n = sum(fam.values()) or 1
                for k2, v in fam.items(): f["fam:" + k2] = v / n
                out.append(f)
            return out
        fh, fg = solved_rows(mh), solved_rows(mg)
        solve_cols = list(solve_feats({"band": "easy", "interest": {k: 0 for k in ("busywork", "hardShare", "stuck", "breakIn", "keyAt", "keyCost", "flowSpread", "oneWay", "aimless", "theme", "variety", "flowMean")}}).keys())
        path_cols = list(path_feats([[0, 0, 1, 1]], 1).keys())
        solve_cmp = compare(fh, fg, solve_cols, "solve") if fh and fg else []
        path_cmp = compare(fh, fg, path_cols, "path") if fh and fg else []
        # the same, human puzzles no bigger than the generator's biggest (by a quarter)
        cap = 1.25 * max((f["cells"] for f in fg), default=0)
        fh_small = [f for f in fh if f["cells"] <= cap]
        matched_cmp = compare(fh_small, fg, solve_cols + path_cols, "matched") if len(fh_small) >= 8 and fg else []
        # families: share of steps, top by the larger side
        famc_h, famc_g = Counter(), Counter()
        for r in mh: famc_h.update(r.get("families") or {})
        for r in mg: famc_g.update(r.get("families") or {})
        nh_steps, ng_steps = sum(famc_h.values()) or 1, sum(famc_g.values()) or 1
        fam_rows = []
        for k2 in set(famc_h) | set(famc_g):
            p, q = famc_h[k2] / nh_steps, famc_g[k2] / ng_steps
            fam_rows.append({"family": k2, "human": p, "gen": q, "logRatio": math.log((p + 1e-3) / (q + 1e-3))})
        fam_rows.sort(key=lambda x: -abs(x["human"] - x["gen"]))
        req_h = Counter(t for r in mh for t in r.get("required") or []); req_g = Counter(t for r in mg for t in r.get("required") or [])
        band_h = dist([r["band"] for r in mh]); band_g = dist([r["band"] for r in mg]); band_fleet = dist([r["band"] for r in gen])

        # drift: the fleet's record against today's solve of the same puzzle
        fleet_by_key = {r["key"]: r for r in gen}
        same = [(fleet_by_key[r["key"]], r) for r in mg if r.get("key") in fleet_by_key and r.get("key", "").split("|")[2] != "corpus"]
        if same:
            drift_rows.append({"genre": g, "n": len(same),
                               "bandSame": float(np.mean([a["band"] == b["band"] for a, b in same])),
                               "bandUp": float(np.mean([BANDS.index(b["band"]) > BANDS.index(a["band"]) for a, b in same])),
                               "stepsCorr": float(np.corrcoef([a["steps"] for a, b in same], [b["steps"] for a, b in same])[0, 1]) if len(same) > 2 else float("nan"),
                               "estCorr": float(np.corrcoef([a["estimate"] for a, b in same], [b["estimate"] for a, b in same])[0, 1]) if len(same) > 2 else float("nan")})

        # ---- classifiers
        cls = {}
        if len(fh) >= MIN_HUMAN and len(fg) >= MIN_HUMAN:
            top_fams = [k2 for k2, _ in (famc_h + famc_g).most_common(12)]
            for name, cols in (("all", [c for c in spec_cols + solve_cols + path_cols] + ["fam:" + k2 for k2 in top_fams]),
                               ("sizeFree", [c for c in spec_cols + solve_cols + path_cols if c not in SIZE_COLS and not c.startswith("setting:")] + ["fam:" + k2 for k2 in top_fams]),
                               ("specOnly", spec_cols), ("solveOnly", solve_cols + path_cols + ["fam:" + k2 for k2 in top_fams])):
                rows = fh + fg
                cols = [c for c in cols if any(not np.isnan(r.get(c, np.nan)) for r in rows) or c.startswith(("fam:", "kind:", "value="))]
                X = fill_missing(matrix(rows, cols), cols)
                y = np.r_[np.ones(len(fh)), np.zeros(len(fg))]
                names = [r["name"] for r in mh + mg]
                p = crossval(X, y, names)
                Z, _, _ = standardise(X)
                beta = fit_logreg(Z, y)
                coef = sorted(zip(cols, beta[:-1]), key=lambda x: -abs(x[1]))
                cls[name] = {"auc": auc(y, p), "top": [(c, float(b)) for c, b in coef[:8]], "n": (len(fh), len(fg))}
        # scoring every generated puzzle: human sample against the whole fleet genre, on what the
        # fleet records hold (spec and solve; not the path), out of fold
        if len(fh) >= MIN_HUMAN:
            for name in ("score", "scoreSizeFree"):
                cols = [c for c in spec_cols + solve_cols if (name == "score" or (c not in SIZE_COLS and not c.startswith("setting:")))]
                grows = []
                for r, sf in zip(gen, gspec):
                    f = dict(sf); f.update(solve_feats(r)); grows.append(f)
                rows = fh + grows
                X = fill_missing(matrix(rows, cols), cols)
                y = np.r_[np.ones(len(fh)), np.zeros(len(grows))]
                names = [r["name"] for r in mh] + [r["key"] for r in gen]
                p = crossval(X, y, names)
                cls.setdefault("fleet", {})[name] = auc(y, p)
                for r, s in zip(gen, p[len(fh):]): scores.setdefault(r["key"], {})[name] = round(float(s), 4)

        # ---- targets for the generator
        nh = len(hspec)
        # square sizes by side, those of 1% or more, as shares of them; the rest as one share
        sq = Counter(str(f["rows"]) for f in hspec if f["rows"] == f["cols"])
        sq_kept = {k: v for k, v in sq.items() if v >= 0.01 * nh}
        n_kept = sum(sq_kept.values()) or 1
        dens = np.array([f["clueDensity"] if not hs_by[g][0]["spec"].get("areas") else f.get("areaCount", 0) / f["cells"] for f in hspec]) if hspec else np.array([])
        t = {"n": nh, "nSolved": len(mh),
             "sizes": {k: round(v / n_kept, 3) for k, v in sorted(sq_kept.items(), key=lambda x: -x[1])},
             "nonSquare": round(sum(1 for f in hspec if f["rows"] != f["cols"]) / max(1, nh), 3),
             "upTo12": round(sum(1 for f in hspec if max(f["rows"], f["cols"]) <= 12) / max(1, nh), 3),
             # per setting, the shares of its values ({"stars": {"2": 0.65, "1": 0.26}}), as
             # gen-set.ts's HumanTarget reads them
             "settings": nested_settings(settings_h, nh),
             "clueDensity": [round(float(np.quantile(dens, 0.1)), 3), round(float(np.quantile(dens, 0.9)), 3)] if len(dens) else None,
             "clueDensityMedian": round(float(np.median(dens)), 3) if len(dens) else None,
             "symmetry": dist(hkind),
             "bands": band_h,
             "families": {k2: round(v / nh_steps, 4) for k2, v in famc_h.most_common(25)} if mh else {},
             "required": {k2: round(v / max(1, len(mh)), 3) for k2, v in req_h.most_common()}}
        targets[g] = t

        # ---- report
        L = [f"# {g}: human-made against generated", "",
             f"Human: {nh} puzzles read ({dict(Counter(h['source'] for h in hs_by[g]))}), {len(mh)} solved. Generated: {len(gen)} in the fleet, {len(mg)} solved again.", ""]
        if cls:
            L.append("## Classifier (human or generated), 5-fold AUC")
            for k2, v in cls.items():
                if k2 == "fleet": L.append(f"- fleet scoring (human sample against every generated puzzle, recorded measures): all {v.get('score', float('nan')):.3f}, size-free {v.get('scoreSizeFree', float('nan')):.3f}")
                else: L.append(f"- {k2}: {v['auc']:.3f} (n = {v['n'][0]} human, {v['n'][1]} generated); top: " + "; ".join(f"`{c[:80]}` {b:+.2f}" for c, b in v["top"][:6]))
            L.append("")
        def table(rows, title, n=15):
            if not rows: return
            L.append(f"## {title}")
            L.append("| Feature | Human | Generated | Human median | Generated median | Effect | AUC |")
            L.append("|---|---|---|---|---|---|---|")
            for x in rows[:n]:
                L.append(f"| {x['feature']} | {x['human']:.3f} | {x['gen']:.3f} | {x['humanMed']:.3f} | {x['genMed']:.3f} | {x['kind']} {x['effect']:+.2f} | {x['auc']:.2f} |")
            L.append("")
        table(spec_cmp, f"Puzzle (all {nh} human, all {len(gen)} generated)")
        table(solve_cmp, "Solve (the solved sample)")
        table(path_cmp, "Shape of the solve (the solved sample)")
        table(matched_cmp, f"Solve and its shape, human puzzles up to {int(cap)} cells only ({len(fh_small)} of them)", 12)
        L += ["## Sizes and settings", f"- human sizes: {t['sizes']}", f"- generated sizes: {dist([str(f['rows']) if f['rows'] == f['cols'] else str(f['rows']) + 'x' + str(f['cols']) for f in gspec])}",
              f"- human settings: {t['settings']}", f"- generated settings: {dist([f['setting'] for f in gspec])}",
              f"- symmetry, human: {t['symmetry']}; generated: {dist(gkind)}", "",
              "## Bands", f"- human (solved sample): {band_h}", f"- generated (solved sample, today's solver): {band_g}", f"- generated (fleet records): {band_fleet}", "",
              "## Required techniques (share of puzzles)", f"- human: { {k2: round(v / max(1, len(mh)), 2) for k2, v in req_h.most_common()} }", f"- generated: { {k2: round(v / max(1, len(mg)), 2) for k2, v in req_g.most_common()} }", "",
              "## Step families (share of steps), biggest differences", "| Family | Human | Generated |", "|---|---|---|"]
        for x in fam_rows[:15]: L.append(f"| `{x['family'][:110]}` | {x['human']:.3f} | {x['gen']:.3f} |")
        only_h = sum(x["human"] for x in fam_rows if x["gen"] == 0)
        L += ["", f"Steps whose family never appears in the generated sample: {only_h:.1%} of human steps; {len(famc_h)} families human, {len(famc_g)} generated, {len(set(famc_h) & set(famc_g))} shared.", ""]
        with open(os.path.join(OUT, f"{g}.md"), "w") as fo: fo.write("\n".join(L))
        top3 = sorted(spec_cmp + solve_cmp + path_cmp, key=lambda x: -abs(x["effect"]))
        summary.append({"genre": g, "nHuman": nh, "nSolved": len(mh), "nGen": len(gen), "cls": cls, "top": top3[:8], "bandH": band_h, "bandG": band_g, "onlyHuman": only_h, "matched": matched_cmp[:6], "nMatched": len(fh_small)})

    # ---- outputs
    with open(os.path.join(OUT, "scores.jsonl"), "w") as fo:
        for k2, v in scores.items(): fo.write(json.dumps({"key": k2, **v}) + "\n")
    header = {"_about": "Human-made puzzles' distributions per genre, for steering the generator (puzzles/difficulty/human-targets.md). Summary statistics only. Made by human_gap.py."}
    with open(TARGETS, "w") as fo: json.dump({**header, **targets}, fo, indent=1)
    L = ["# Human against generated: summary", "", "| Genre | Human read | Human solved | Generated | AUC all | size-free | spec only | solve only | fleet AUC (size-free) |", "|---|---|---|---|---|---|---|---|---|"]
    for s in summary:
        c = s["cls"]; a = lambda k: f"{c[k]['auc']:.2f}" if k in c else "-"
        fl = c.get("fleet", {})
        L.append(f"| {s['genre']} | {s['nHuman']} | {s['nSolved']} | {s['nGen']} | {a('all')} | {a('sizeFree')} | {a('specOnly')} | {a('solveOnly')} | {fl.get('score', float('nan')):.2f} ({fl.get('scoreSizeFree', float('nan')):.2f}) |")
    L += ["", "## Biggest differences per genre", ""]
    for s in summary:
        L.append(f"**{s['genre']}** (bands human {s['bandH']}, generated {s['bandG']}; {s['onlyHuman']:.0%} of human steps in families the generated never show): " +
                 "; ".join(f"{x['feature']} {x['human']:.2f} vs {x['gen']:.2f} ({x['kind']} {x['effect']:+.1f})" for x in s["top"][:6]))
        if s["matched"]: L.append(f"  size-matched ({s['nMatched']} human): " + "; ".join(f"{x['feature']} {x['human']:.2f} vs {x['gen']:.2f} ({x['kind']} {x['effect']:+.1f})" for x in s["matched"][:5]))
        L.append("")
    L += ["## Drift (the fleet's record against today's solve of the same puzzle)", "| Genre | n | same band | band up | steps r | estimate r |", "|---|---|---|---|---|---|"]
    for d in drift_rows: L.append(f"| {d['genre']} | {d['n']} | {d['bandSame']:.2f} | {d['bandUp']:.2f} | {d['stepsCorr']:.2f} | {d['estCorr']:.2f} |")
    with open(os.path.join(OUT, "summary.md"), "w") as fo: fo.write("\n".join(L) + "\n")
    with open(os.path.join(OUT, "summary.json"), "w") as fo: json.dump({"summary": summary, "drift": drift_rows}, fo, indent=1, default=float)
    print("\n".join(L))

def score_records(paths):
    """Each record (a gen-set.ts line: spec plus the solve's measures) scored by its genre's
    size-free fleet model: the human sample against every fleet puzzle of the genre, on the same
    columns as scores.jsonl's scoreSizeFree, fitted on all of them (not out of fold: these puzzles
    aren't in it). Prints a JSON line per record: key, candSeed, chosen, band, scoreSizeFree."""
    humans, measured, fleet = load()
    recs = [r for p in paths for r in read_jsonl(p) if r.get("spec") and r.get("band") in BANDS]
    hs_by, ms_h = defaultdict(list), defaultdict(list)
    for h in humans: hs_by[h["genre"]].append(h)
    for r in measured:
        if r["source"] != "gen": ms_h[r["genre"]].append(r)
    for g in sorted({r["genre"] for r in recs}):
        if g not in fleet or len(ms_h[g]) < MIN_HUMAN:
            print(json.dumps({"genre": g, "skipped": "no fleet or too few human puzzles solved"})); continue
        gen = fleet[g]
        hspec = [spec_feats(g, h["spec"])[0] for h in hs_by[g]]
        gspec = [spec_feats(g, r["spec"])[0] for r in gen]
        spec_cols = sorted({c for f in hspec + gspec for c in f})
        solve_cols = list(solve_feats({"band": "easy", "interest": {k: 0 for k in ("busywork", "hardShare", "stuck", "breakIn", "keyAt", "keyCost", "flowSpread", "oneWay", "aimless", "theme", "variety", "flowMean")}}).keys())
        cols = [c for c in spec_cols + solve_cols if c not in SIZE_COLS and not c.startswith("setting:")]
        fh = []
        for r in ms_h[g]:
            f, _ = spec_feats(g, r["spec"]); f.update(solve_feats(r)); fh.append(f)
        grows = []
        for r, sf in zip(gen, gspec):
            f = dict(sf); f.update(solve_feats(r)); grows.append(f)
        rows = fh + grows
        cols = [c for c in cols if any(not np.isnan(r.get(c, np.nan)) for r in rows) or c.startswith(("kind:", "value="))]
        X = fill_missing(matrix(rows, cols), cols)
        y = np.r_[np.ones(len(fh)), np.zeros(len(grows))]
        Z, mu, sd = standardise(X)
        beta = fit_logreg(Z, y)
        mine = [r for r in recs if r["genre"] == g]
        R = []
        for r in mine:
            f, _ = spec_feats(g, r["spec"]); f.update(solve_feats(r)); R.append(f)
        XR = matrix(R, cols)
        for j, c in enumerate(cols):
            if c.startswith(("kind:", "value=")): XR[np.isnan(XR[:, j]), j] = 0.0
        p = predict(beta, standardise(XR, mu, sd)[0])
        for r, s in zip(mine, p):
            print(json.dumps({"genre": g, "key": r.get("key"), "candSeed": r.get("candSeed"), "chosen": r.get("chosen"), "band": r.get("band"), "target": r.get("target"),
                              "breakIn": r.get("breakInScore"), "threadScore": r.get("threadScore"), "scoreSizeFree": round(float(s), 5)}))

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "score": score_records(sys.argv[2:])
    else: main()
