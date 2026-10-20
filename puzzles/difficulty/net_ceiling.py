# The network as the ceiling for phase 1 v2's human-move code (Fable's stop rule: if the network sits
# within ~10% of the simple context model, the steps carry no structure a vocabulary could find).
# On human-menus.ts's rows, each person's move is coded as a choice among the menu's marks set to the
# value the person set, as human-choice.ts and library.ts code it:
#
#   uniform   log2 of the choices
#   near      ∝ exp(−λ · distance from the last move)            (λ fitted on half the puzzles)
#   net       ∝ exp(the network's logit for the mark and value)
#   net+near  ∝ exp(τ · logit − λ · distance)                    (τ, λ fitted on half the puzzles)
#   near+scan ∝ exp(−λ · distance − σ · rank in reading order)   (people scan top to bottom)
#   all       the three together
#
# Only puzzles on the network's test side (graphs-human-labels.jsonl split "test": never trained on).
# The human corpus leaves those out, so their menus are their own run: human-test-corpus.ts, then
# MENUS_CORPUS=references/ml/human-test-corpus/ MENUS_OUT=references/proof-menus-test/ human-menus.ts.
# The network's state at a position is the record's initial marks and the person's marks before it
# (at the answer's values), the same state the menu was listed from.
#
#   python3 puzzles/difficulty/net_ceiling.py [model dir, default human-tuned-2026-10-20]
import json, math, os, sys
os.environ.update(GRAPH_H="256", GRAPH_HEADS="8", GRAPH_POS="1", GRAPH_STRUCTURE="1")
model = sys.argv[1] if len(sys.argv) > 1 else "human-tuned-2026-10-20"
sys.argv = [sys.argv[0], "--attention"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, torch
import graph_policy as gp

REFS = os.path.join(HERE, "../../references/")
def h32(key):
    h = 2166136261
    for ch in key: h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h / 2 ** 32

# the network's test-side records, by name (the test corpus's keys)
recs = {}
for line in open(REFS + "ml/graphs-human-labels.jsonl"):
    d = json.loads(line)
    if d.get("split") == "test": recs[d["name"]] = d
net = gp.load_net(os.path.join(REFS, f"ml/models/{model}/model.pt")); net.eval()

moves = {}   # genre → list of (test half, dist array, logit array, chosen)
for f in sorted(os.listdir(REFS + "proof-menus-test")):
    if not f.endswith(".jsonl") or f == "misses.jsonl": continue
    genre = f[:-6]
    corpus = {}
    for line in open(REFS + f"ml/human-test-corpus/{genre}.jsonl"):
        d = json.loads(line); corpus[d["key"]] = d
    n_rows = 0
    for line in open(REFS + "proof-menus-test/" + f):
        row = json.loads(line)
        if "positions" not in row or row["id"] not in corpus: continue
        c = corpus[row["id"]]
        rec = recs.get(row["id"])
        if not rec: continue
        n_rows += 1
        pz = gp.Puzzle(rec)
        ms = [m["name"] for m in rec["structure"]["marks"]]; idx = {m: i for i, m in enumerate(ms)}
        answer = set(rec["answer"])
        order = [m for m, _ in sorted(c["humanOrder"], key=lambda x: x[1])]
        test = h32(f"split:{row['id']}") < 0.5
        for p in row["positions"]:
            s = np.zeros(len(ms), np.int8)
            for m in rec.get("initial") or []:
                name, v = (m.split("=") + ["true"])[:2] if isinstance(m, str) else (m[0], str(m[1]).lower())
                if name in idx: s[idx[name]] = 1 if v in ("true", "1") else 2
            for m in order[:p["at"]]:
                if m in idx: s[idx[m]] = 1 if m in answer else 2
            with torch.no_grad():
                g, _, mask, _ = gp.batch_states([(pz, s, np.zeros((len(ms), 2), np.float32))], gp.attends(net))
                lg = net(gp.to(g)).cpu().numpy()
            # the menu's marks, as human-choice.ts takes them
            marks = {}
            for it in p["menu"]:
                r, cc = (it["b"][0] + it["b"][2]) / 2, (it["b"][1] + it["b"][3]) / 2
                for fact in it["m"]:
                    mk, v = fact.split("=")
                    if mk not in marks or it["c"] < marks[mk][0]: marks[mk] = (it["c"], r, cc, v)
            prev = None
            for nx in p["next"]:
                if nx.get("known"): continue
                t = marks.get(nx["mark"])
                if not t: prev = None; continue
                keys = [k for k, v in marks.items() if v[3] == t[3] and k in idx]
                if nx["mark"] not in keys or len(keys) < 1: prev = None; continue
                col = 0 if t[3] == "1" else 1
                dist = np.array([math.hypot(marks[k][1] - prev[0], marks[k][2] - prev[1]) if prev else 0.0 for k in keys])
                logit = np.array([lg[idx[k], col] for k in keys])
                # reading order: each choice's rank among them, 0 first to 1 last (people scan top to bottom)
                ro = np.array([marks[k][1] * 1000 + marks[k][2] for k in keys]); rank = ro.argsort().argsort() / max(1, len(keys) - 1)
                moves.setdefault(genre, []).append((test, dist, logit, keys.index(nx["mark"]), rank))
                prev = (t[1], t[2])
    print(f"{genre}: {n_rows} puzzles on the network's test side", file=sys.stderr)

def bits(ms, tau, lam, sig=0):
    s = 0.0
    for _, d, l, ch, rk in ms:
        u = tau * l - lam * d - sig * rk; u = u - u.max()
        s += -(u[ch] - math.log(np.exp(u).sum())) / math.log(2)
    return s / len(ms)
def fit(ms, taus, lams, sigs=(0,)):
    return min(((bits(ms, t, l, g), t, l, g) for t in taus for l in lams for g in sigs))
T = [0, 0.25, 0.5, 0.75, 1, 1.5, 2]; L = [0, 0.1, 0.2, 0.4, 0.7, 1, 1.5, 2]
print(f"network {model}: bits a move on the held-out half (people's moves, the network's test puzzles)")
S = [0, 0.5, 1, 2, 3, 5]
print("genre         moves  uniform  near  near+scan   net  net+near  all  (τ, λ, σ)  savings over near: near+scan, net+near, all")
for g, ms in sorted(moves.items()):
    tr, te = [m for m in ms if not m[0]], [m for m in ms if m[0]]
    if len(tr) < 30 or len(te) < 30: continue
    uni = sum(math.log2(len(m[2])) for m in te) / len(te)
    _, _, ln, _ = fit(tr, [0], L); _, tn, _, _ = fit(tr, T[1:] + [3, 4], [0]); _, tb, lb, _ = fit(tr, T + [3, 4], L)
    _, _, ls, gs = fit(tr, [0], L, S); _, ta, la, ga = fit(tr, T + [3, 4], L, S)
    near, nt, both, ns, al = bits(te, 0, ln), bits(te, tn, 0), bits(te, tb, lb), bits(te, 0, ls, gs), bits(te, ta, la, ga)
    pc = lambda x: f"{100 * (1 - x / near):4.1f}%"
    print(f"{g:12s} {len(ms):6d}  {uni:7.2f}  {near:4.2f}  {ns:9.2f}  {nt:4.2f}  {both:8.2f}  {al:4.2f}  ({ta}, {la}, {ga})  {pc(ns)}, {pc(both)}, {pc(al)}")
