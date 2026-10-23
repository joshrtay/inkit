# A grid-size term in the solver's price (docs: /mnt/project-files/research/aim4/size-term-2026-10-23.md).
# A finished solve's estimate e becomes
#     e' = 0.9 · (e + w·ln(cells)) / (0.9 + w·ln(CMAX))
# so finished solves still sit in [0, 0.9] and the unsolved stop prices (0.95 / 0.97 / 1) stay above
# every one of them; stops are unchanged. "rank" form: e is replaced by its rank within the type
# (0 to 0.9) before the term is added. One global w, fitted on a seeded half of the Janko pilot
# (Spearman with Janko's level, n-weighted over types), scored on the other half; then written as
# guard rows (settings "base" and "size") for guard-report.ts.
#
#   python3 puzzles/difficulty/size_term.py fit <guard-janko rows> <janko data.json>
#   python3 puzzles/difficulty/size_term.py apply <rows.jsonl> <sizes.json> <out.jsonl> --w W [--form est|rank]
#     [--base-setting S] [--low-setting S2] [--sizes-key psjp|psjp-fresh|...] [--janko data.json]
import json, math, sys, collections
import numpy as np

CMAX = 2500

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

def h32(key):
    h = 2166136261
    for ch in key: h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h / 2 ** 32

def price(rows, w, form):
    """rows of one type: dicts with estimate, solved, cells; returns the new estimates"""
    e = np.array([r["estimate"] for r in rows], float); s = np.array([r["solved"] for r in rows], bool)
    c = np.log(np.array([r["cells"] for r in rows], float))
    if form == "rank" and s.sum() > 1:
        base = e.copy(); base[s] = 0.9 * rank(e[s]) / (s.sum() - 1)
    else: base = e
    out = e.copy()
    out[s] = 0.9 * (base[s] + w * c[s]) / (0.9 + w * math.log(CMAX))
    return out

def mean_rho(groups, w, form, key="rated"):
    tot = n = 0
    for rows in groups.values():
        if len(rows) < 10 or len({r[key] for r in rows}) < 2: continue
        tot += len(rows) * spearman(price(rows, w, form), [r[key] for r in rows]); n += len(rows)
    return tot / n

def janko_rows(rowsf, dataf):
    data = json.load(open(dataf)); import os, glob
    root = os.path.dirname(dataf); ids = {}
    for f in glob.glob(f"{root}/*/*.json"): ids[f"{f.split('/')[-2]}/{f.split('/')[-1]}"] = json.load(open(f))["source"]["psjp"]
    by = collections.defaultdict(dict)
    for l in open(rowsf):
        r = json.loads(l)
        if r["section"] == "psjp" and r["estimate"] is not None: by[r["setting"]][r["name"]] = r
    out = collections.defaultdict(list)
    for t in sorted({n.split("/")[0] for n in by["c200-finish"]}):
        rs = [r for n, r in by["c200-finish"].items() if n.startswith(t + "/")]
        s = "c200-finish" if sum(r["solved"] for r in rs) >= len(rs) / 5 else "c1000-finish"
        for n, r in by[s].items():
            if n.startswith(t + "/"):
                d = data[ids[n]]; out[t].append({**r, "sid": ids[n], "level": d["level"], "size": "x".join(map(str, d["size"])), "cells": d["size"][0] * d["size"][1]})
    return out

if sys.argv[1] == "fit":
    groups = janko_rows(sys.argv[2], sys.argv[3])
    half = lambda r: h32(f"size-term:{r['sid']}") < 0.5
    fitg = {t: [r for r in rs if half(r)] for t, rs in groups.items()}
    test = {t: [r for r in rs if not half(r)] for t, rs in groups.items()}
    ws = np.round(np.arange(0, 1.0001, 0.005), 3)
    best = {}
    for form in ("est", "rank"):
        curve = [(w, mean_rho(fitg, w, form, "level")) for w in ws]
        best[form] = max(curve, key=lambda x: x[1])
        print(f"{form}: best w {best[form][0]} (fit half {best[form][1]:.3f}, w=0 {curve[0][1]:.3f}); curve " + ", ".join(f"{w}:{v:.3f}" for w, v in curve[::10]))
    rng = np.random.default_rng(12345)
    print("\n| Type | n (test half) | base | est form | rank form |\n|---|---|---|---|---|")
    tot = collections.Counter(); N = 0
    for t, rs in sorted(test.items()):
        if len(rs) < 10: continue
        lv = [r["level"] for r in rs]; v = [spearman(price(rs, 0, "est"), lv), spearman(price(rs, best["est"][0], "est"), lv), spearman(price(rs, best["rank"][0], "rank"), lv)]
        print(f"| {t} | {len(rs)} | " + " | ".join(f"{x:.2f}" for x in v) + " |")
        for k, x in zip(("base", "est", "rank"), v): tot[k] += len(rs) * x
        N += len(rs)
    print(f"| **n-weighted** | {N} | " + " | ".join(f"{tot[k] / N:.3f}" for k in ("base", "est", "rank")) + " |")
    # paired bootstrap on the test half, n-weighted: est form minus base
    for form in ("est", "rank"):
        ds = []
        for _ in range(1000):
            d = 0
            for t, rs in test.items():
                if len(rs) < 10: continue
                i = rng.integers(0, len(rs), len(rs)); sub = [rs[k] for k in i]; lv = [r["level"] for r in sub]
                d += len(rs) * (np.nan_to_num(spearman(price(sub, best[form][0], form), lv)) - np.nan_to_num(spearman(price(sub, 0, form if form == "est" else "est"), lv)))
            ds.append(d / N)
        ds.sort(); print(f"{form} form minus base, test half: 95% {ds[25]:+.3f} to {ds[974]:+.3f}")
    # within size: the term is constant inside a size, so solved-solved order can't change
    wsz = collections.Counter(); M = 0
    for t, rs in test.items():
        by = collections.defaultdict(list)
        for r in rs: by[r["size"]].append(r)
        for s, g in by.items():
            if len(g) < 15 or len({r["level"] for r in g}) < 2: continue
            lv = [r["level"] for r in g]
            for k, (w, form) in {"base": (0, "est"), "est": (best["est"][0], "est"), "rank": (best["rank"][0], "rank")}.items(): wsz[k] += len(g) * spearman(price(g, w, form), lv)
            M += len(g)
    print(f"within size (test half, groups of 15+, n={M}): " + ", ".join(f"{k} {wsz[k] / M:.3f}" for k in ("base", "est", "rank")))
    json.dump({"est": best["est"][0], "rank": best["rank"][0]}, open("/tmp/claude-0/jk/size-w.json", "w"))

if sys.argv[1] == "apply":
    rowsf, sizesf, outf = sys.argv[2:5]
    opt = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
    w, form = float(opt("--w", "0")), opt("--form", "est")
    sizes = json.load(open(sizesf))[opt("--sizes-key", "psjp")] if sizesf != "-" else {}
    base, low = opt("--base-setting", "c200-baseline"), opt("--low-setting")
    rows = [json.loads(l) for l in open(rowsf) if l.strip()]
    # types under 1 in 5 finished at 200 calls take the 1,000-call rows (the guard rule)
    fin = collections.defaultdict(lambda: [0, 0])
    for r in rows:
        if r["setting"] == base: fin[(r["section"], r["group"])][0] += r["solved"]; fin[(r["section"], r["group"])][1] += 1
    lowt = {k for k, (a, b) in fin.items() if a < b / 5} if low else set()
    keep = [r for r in rows if r["estimate"] is not None and ((r["setting"] == base and (r["section"], r["group"]) not in lowt) or (r["setting"] == low and (r["section"], r["group"]) in lowt))]
    by = collections.defaultdict(list)
    for r in keep:
        if r["section"] == "tatham": r["cells"] = int(np.prod([int(x) for x in r["group"].split(" ")[-1].split("x")]))
        else: r["cells"] = int(np.prod(sizes[r["name"]]))
        by[(r["section"], r["group"])].append(r)
    with open(outf, "w") as f:
        for rs in by.values():
            wt = w if not opt("--w-types") else json.load(open(opt("--w-types"))).get(rs[0]["group"], 0.0)
            new = price(rs, wt, form)
            for r, e in zip(rs, new):
                f.write(json.dumps({**r, "setting": "base"}) + "\n")
                f.write(json.dumps({**r, "setting": "size", "estimate": float(e)}) + "\n")
    print(f"{len(keep)} rows, low types at 1,000: {sorted(g for _, g in lowt)}", file=sys.stderr)

if sys.argv[1] == "pertype":
    # one w per type, fitted on the same half; scored on the other; written to size-w-type.json
    groups = janko_rows(sys.argv[2], sys.argv[3])
    half = lambda r: h32(f"size-term:{r['sid']}") < 0.5
    ws = np.round(np.arange(0, 1.0001, 0.01), 2); out = {}
    print("| Type | fit n | w | test n | base | per-type w | global w |\n|---|---|---|---|---|---|---|")
    g = json.load(open("/tmp/claude-0/jk/size-w.json"))["est"]
    for t, rs in sorted(groups.items()):
        fr, te = [r for r in rs if half(r)], [r for r in rs if not half(r)]
        if len(fr) < 10 or len(te) < 10 or len({r["level"] for r in fr}) < 2 or len({r["level"] for r in te}) < 2: continue
        w = max(ws, key=lambda w: (round(spearman(price(fr, w, "est"), [r["level"] for r in fr]), 4), -w)); out[t] = float(w)
        lv = [r["level"] for r in te]
        print(f"| {t} | {len(fr)} | {w} | {len(te)} | {spearman(price(te, 0, 'est'), lv):.2f} | {spearman(price(te, w, 'est'), lv):.2f} | {spearman(price(te, g, 'est'), lv):.2f} |")
    json.dump(out, open("/tmp/claude-0/jk/size-w-type.json", "w"))
