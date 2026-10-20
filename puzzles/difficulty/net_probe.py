# What does the network see in people's moves that the step programs don't? (Phase 1 v2, after
# net_ceiling.py: on its test puzzles the human-tuned network codes people's moves 8–20% shorter than
# nearness to the last move; no slot of library.ts's step programs comes close.)
#
# The network never sees the order of the moves, only the board, so whatever it uses is in the state.
# On the same moves as net_ceiling.py (menus of the network's test puzzles), each choice gets a set of
# features from the board as the person had it, and three questions are asked of them:
#
#   1. explain   how much of the network's preference among the choices (its logit, centred in each
#                move) a linear fit on the features explains (R², the features' weights)
#   2. code      bits a move for a conditional logit on the features, with and without nearness, on
#                the held-out half, against the network: how much of its gap the features close
#   3. examples  the held-out moves where the network beats nearness most, with the network's choice
#                and nearness's choice side by side (for reading by eye)
#
#   python3 puzzles/difficulty/net_probe.py [genre …]   → references/ml/net-probe/<genre>.txt
import json, math, os, sys
os.environ.update(GRAPH_H="256", GRAPH_HEADS="8", GRAPH_POS="1", GRAPH_STRUCTURE="1")
only = [a for a in sys.argv[1:] if not a.startswith("--")]
sys.argv = [sys.argv[0], "--attention"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, torch
import graph_policy as gp

REFS = os.path.join(HERE, "../../references/")
OUT = REFS + "ml/net-probe/"
os.makedirs(OUT, exist_ok=True)
def h32(key):
    h = 2166136261
    for ch in key: h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h / 2 ** 32

recs = {}
for line in open(REFS + "ml/graphs-human-labels.jsonl"):
    d = json.loads(line)
    if d.get("split") == "test": recs[d["name"]] = d
net = gp.load_net(os.path.join(REFS, "ml/models/human-tuned-2026-10-20/model.pt")); net.eval()

FEATS = ["cost", "stage", "items", "facts", "area", "open", "groups", "around", "around_open", "line_settled",
         "to_given", "to_edge", "row", "col", "settled_global"]

def features(rec, s, keys, marks, idx, geo):
    """each choice's features from the board as the person had it (s: 0 open, 1 true, 2 false)"""
    cells_of, groups_of, group_marks, near, R, C, given_rc = geo
    settled = s > 0
    out = []
    for k in keys:
        i = idx[k]; cost, r, c, _, stage, items, nf, area, kinds = marks[k]
        opens = [int((~settled[group_marks[g]]).sum()) for g in groups_of[i]]
        rr = np.array([x // C for x in cells_of[i]]) if C else np.zeros(1); cc = np.array([x % C for x in cells_of[i]]) if C else np.zeros(1)
        mr, mc = rr.mean(), cc.mean()
        # the marks in the same row or column of cells, settled share
        line = [j for j, cs in enumerate(cells_of) if C and any(x // C == int(mr) or x % C == int(mc) for x in cs)]
        out.append([cost, stage, math.log(items), nf, math.log(1 + area),
                    min(opens) if opens else 10, len(opens), int(settled[near[i]].sum()), int((~settled[near[i]]).sum()),
                    float(settled[line].mean()) if line else 0.0,
                    min((math.hypot(mr - a, mc - b) for a, b in given_rc), default=10.0),
                    min(mr, R - 1 - mr, mc, C - 1 - mc) if C else 0.0, mr / max(1, R - 1), mc / max(1, C - 1),
                    float(settled.mean())])
    return np.array(out, np.float64)

def geometry(rec):
    st = rec["structure"]; C, R = st.get("cols") or 0, st.get("rows") or 0
    cells_of = [m["cells"] for m in st["marks"]]
    by_cell = {}
    for i, cs in enumerate(cells_of):
        for x in cs: by_cell.setdefault(x, []).append(i)
    group_marks = []
    for g in st["groups"]:
        gs = set(g["cells"]); group_marks.append(np.array([i for i, cs in enumerate(cells_of) if all(x in gs for x in cs)], int))
    groups_of = [[] for _ in cells_of]
    for gi, ms in enumerate(group_marks):
        for i in ms: groups_of[i].append(gi)
    near = []
    for i, cs in enumerate(cells_of):
        out = set()
        for x in cs:
            r, q = (x // C, x % C) if C else (0, x)
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if C and not (0 <= q + dc < C): continue
                    for j in by_cell.get((r + dr) * C + q + dc, []):
                        if j != i: out.add(j)
        near.append(np.array(sorted(out), int))
    given_rc = [(x // C, x % C) for x, *_ in rec.get("givens") or []] if C else []
    return cells_of, groups_of, group_marks, near, R, C, given_rc

data = {}   # genre → moves: (test, name, at, keys, chosen, dist, logit, X, kinds)
for f in sorted(os.listdir(REFS + "proof-menus-test")):
    if not f.endswith(".jsonl"): continue
    genre = f[:-6]
    if only and genre not in only: continue
    corpus = {}
    for line in open(REFS + f"ml/human-test-corpus/{genre}.jsonl"):
        d = json.loads(line); corpus[d["key"]] = d
    for line in open(REFS + "proof-menus-test/" + f):
        row = json.loads(line)
        if "positions" not in row or row["id"] not in corpus or row["id"] not in recs: continue
        rec, c = recs[row["id"]], corpus[row["id"]]
        pz, geo = gp.Puzzle(rec), geometry(rec)
        ms = [m["name"] for m in rec["structure"]["marks"]]; idx = {m: i for i, m in enumerate(ms)}
        answer = set(rec["answer"])
        order = [m for m, _ in sorted(c["humanOrder"], key=lambda x: x[1])]
        test = h32(f"split:{row['id']}") < 0.5
        for p in row["positions"]:
            s = np.zeros(len(ms), np.int8)
            for m in rec.get("initial") or []:
                name, v = (m.split("=") + ["true"])[:2]
                if name in idx: s[idx[name]] = 1 if v in ("true", "1") else 2
            for m in order[:p["at"]]:
                if m in idx: s[idx[m]] = 1 if m in answer else 2
            with torch.no_grad():
                g, _, mask, _ = gp.batch_states([(pz, s, np.zeros((len(ms), 2), np.float32))], gp.attends(net))
                lg = net(gp.to(g)).cpu().numpy()
            marks = {}
            for it in p["menu"]:
                r, cc = (it["b"][0] + it["b"][2]) / 2, (it["b"][1] + it["b"][3]) / 2
                kinds = "+".join(sorted({x.split(" (")[0] for x in it["cl"]}))
                area = (it["b"][2] - it["b"][0] + 1) * (it["b"][3] - it["b"][1] + 1)
                for fact in it["m"]:
                    mk, v = fact.split("=")
                    if mk not in marks: marks[mk] = [it["c"], r, cc, v, it["k"], 0, len(it["m"]), area, kinds]
                    marks[mk][5] += 1
                    if it["c"] < marks[mk][0]: marks[mk][:5] = [it["c"], r, cc, v, it["k"]]; marks[mk][6:] = [len(it["m"]), area, kinds]
            prev = None
            for nx in p["next"]:
                if nx.get("known"): continue
                t = marks.get(nx["mark"])
                if not t: prev = None; continue
                keys = [k for k, v in marks.items() if v[3] == t[3] and k in idx]
                if nx["mark"] not in keys: prev = None; continue
                col = 0 if t[3] == "1" else 1
                dist = np.array([math.hypot(marks[k][1] - prev[0], marks[k][2] - prev[1]) if prev else 0.0 for k in keys])
                data.setdefault(genre, []).append((test, row["id"], p["at"], keys, keys.index(nx["mark"]), dist,
                    np.array([lg[idx[k], col] for k in keys]), features(rec, s, keys, marks, idx, geo), [marks[k][8] for k in keys]))
                prev = (t[1], t[2])
    print(f"{genre}: {len(data.get(genre, []))} moves", file=sys.stderr)

import pickle
pickle.dump(data, open(OUT + "moves.pkl", "wb"))   # for reading by hand

def clogit(ms, cols, near_on, iters=300, l2=0.01):
    """a conditional logit on standardised features (and −distance), by gradient descent"""
    X = [np.column_stack([m[7][:, cols]] + ([-m[5][:, None]] if near_on else [])) for m in ms]
    allx = np.concatenate(X); mu, sd = allx.mean(0), allx.std(0) + 1e-9
    X = [(x - mu) / sd for x in X]
    w = np.zeros(X[0].shape[1])
    for _ in range(iters):
        g = np.zeros_like(w)
        for x, m in zip(X, ms):
            u = x @ w; u -= u.max(); p = np.exp(u); p /= p.sum()
            g += x.T @ p - x[m[4]]
        w -= 0.5 * (g / len(ms) + l2 * w)
    return w, mu, sd
def clogit_bits(ms, cols, near_on, model):
    w, mu, sd = model; s = 0.0
    for m in ms:
        x = (np.column_stack([m[7][:, cols]] + ([-m[5][:, None]] if near_on else [])) - mu) / sd
        u = x @ w; u -= u.max(); s -= (u[m[4]] - math.log(np.exp(u).sum())) / math.log(2)
    return s / len(ms)
def near_bits(ms, lam):
    return sum(-(-lam * m[5][m[4]] - (np.log(np.exp(-lam * m[5]).sum()))) / math.log(2) for m in ms) / len(ms)
def net_bits(ms, tau, lam=0):
    s = 0.0
    for m in ms:
        u = tau * m[6] - lam * m[5]; u = u - u.max(); s -= (u[m[4]] - math.log(np.exp(u).sum())) / math.log(2)
    return s / len(ms)

summary = []
for genre, ms in sorted(data.items()):
    tr, te = [m for m in ms if not m[0]], [m for m in ms if m[0]]
    if len(tr) < 30 or len(te) < 30: continue
    lines = [f"# {genre}: {len(ms)} moves ({len(te)} held out)", ""]
    # 1. explain: the network's centred logit against the centred features (multi-choice moves)
    Y, Xc = [], []
    for m in ms:
        if len(m[3]) < 2: continue
        Y.append(m[6] - m[6].mean()); Xc.append(m[7] - m[7].mean(0))
    Y, Xc = np.concatenate(Y), np.concatenate(Xc)
    sd = Xc.std(0) + 1e-9; Z = Xc / sd
    beta, *_ = np.linalg.lstsq(Z, Y, rcond=None)
    r2 = 1 - ((Y - Z @ beta) ** 2).sum() / (Y ** 2).sum()
    single = {f: float(np.corrcoef(Z[:, j], Y)[0, 1] ** 2) if Z[:, j].std() > 0 else 0.0 for j, f in enumerate(FEATS)}
    lines += [f"1. The network's preference among the choices (centred logit) explained by the features: R² {r2:.2f}",
              "   each alone (R²), and its weight in the joint fit (standardised):"]
    for j, f in sorted(enumerate(FEATS), key=lambda x: -single[x[1]]):
        lines.append(f"   {f:14s} {single[f]:.3f}  {beta[j]:+.2f}")
    # 2. code: held-out bits
    lams = [0, 0.1, 0.2, 0.4, 0.7, 1, 1.5, 2]
    lam = min(lams, key=lambda l: near_bits(tr, l)); tau = min([0.25, 0.5, 0.75, 1, 1.5, 2], key=lambda t: net_bits(tr, t))
    cols = list(range(len(FEATS)))
    fm, fnm = clogit(tr, cols, False), clogit(tr, cols, True)
    # the same with a weight for each common kind of step (the rules its explanation uses)
    top = [k for k, n in __import__("collections").Counter(x for m in tr for x in m[8]).most_common(8) if n >= 20]
    kx = lambda ms: [m[:7] + (np.column_stack([m[7]] + [np.array([1.0 if x == k else 0.0 for x in m[8]]) for k in top]),) + m[8:] for m in ms]
    trk, tek = kx(tr), kx(te); colk = list(range(len(FEATS) + len(top)))
    kb = clogit_bits(tek, colk, True, clogit(trk, colk, True))
    tb, lb = min(((t, l) for t in [0.25, 0.5, 0.75, 1, 1.5, 2] for l in lams), key=lambda x: net_bits(tr, *x))
    nb, xb, xnb, fb, fnb = near_bits(te, lam), net_bits(te, tau), net_bits(te, tb, lb), clogit_bits(te, cols, False, fm), clogit_bits(te, cols, True, fnm)
    uni = sum(math.log2(len(m[3])) for m in te) / len(te)
    lines += ["", f"2. Bits a move, held out: uniform {uni:.2f}, near {nb:.2f}, network {xb:.2f}, network+near {xnb:.2f}, features {fb:.2f}, features+near {fnb:.2f}",
              f"   features+near close {100 * (nb - fnb) / (nb - xnb):.0f}% of the gap from nearness down to network+near" if nb > xnb else "   (network+near doesn't beat nearness here)",
              f"   with a weight for each kind of step ({', '.join(top)}): features+near+kinds {kb:.2f}, closing {100 * (nb - kb) / (nb - xnb):.0f}%" if nb > xnb else f"   features+near+kinds {kb:.2f}",
              "   features+near weights: " + ", ".join(f"{f} {w:+.2f}" for f, w in zip(FEATS + ['near'], fnm[0]))]
    summary.append(f"{genre:12s} near {nb:.2f}  network {xb:.2f}  network+near {xnb:.2f}  features {fb:.2f}  features+near {fnb:.2f}  +kinds {kb:.2f}  R² {r2:.2f}  top: " + ", ".join(sorted(FEATS, key=lambda f: -single[f])[:3]))
    # 3. examples: where the network beats nearness most
    gain = []
    for m in te:
        pn = np.exp(-lam * m[5]); pn /= pn.sum(); u = tau * m[6]; u -= u.max(); px = np.exp(u); px /= px.sum()
        gain.append((math.log2(px[m[4]] / pn[m[4]]), m, px, pn))
    gain.sort(key=lambda x: -x[0])
    lines += ["", "3. Held-out moves where the network beats nearness most (person's choice, network's top, nearness's top):"]
    for gbits, m, px, pn in gain[:25]:
        ch, nt, nn = m[4], int(px.argmax()), int(pn.argmax())
        fx = lambda i: " ".join(f"{f}={m[7][i, j]:.2g}" for j, f in enumerate(FEATS) if f in ("cost", "open", "around", "line_settled", "to_given", "to_edge"))
        lines += [f"  {gbits:+.1f} bits  {m[1]} at {m[2]}, {len(m[3])} choices",
                  f"     person  {m[3][ch]:14s} {m[8][ch]:24s} p_net {px[ch]:.2f} p_near {pn[ch]:.2f}  {fx(ch)}",
                  f"     network {m[3][nt]:14s} {m[8][nt]:24s} {fx(nt)}",
                  f"     nearest {m[3][nn]:14s} {m[8][nn]:24s} dist {m[5][nn]:.1f} (person's {m[5][ch]:.1f})"]
    open(OUT + f"{genre}.txt", "w").write("\n".join(lines) + "\n")
    print(f"{genre} → {OUT}{genre}.txt", file=sys.stderr)
print("\n".join(summary))
