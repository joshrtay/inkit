# Why the networks are weak on Hidoku (docs/research-opus-human-moves.md, "Why Hidoku"): its graph
# encoding gives each digit mark its number only as one input (n / 9), so nothing ties 23 to 22 and
# 24, or says 23 is already placed. Three checks, on graphs-human-labels.jsonl (local only):
#
#   python hidoku_relations.py rule              a hand rule: place a number whose neighbour in the
#                                                sequence leaves it one free cell (a gap of one first)
#   python hidoku_relations.py score <model.pt>  a network's agreement with people on every test-side
#                                                state of Hidoku, Skyscrapers and Easy as ABC (a fifth
#                                                of Easy as ABC's), and what its Hidoku top guesses are
#   python hidoku_relations.py probe <arm> [epochs]   baseline-2026-10-14 fine-tuned on Hidoku's
#                                                training side only (lr 3e-4, as opus_human_tune.py),
#                                                agreement on its test side after each epoch. arm:
#                                                none (the encoding as is), rel (four more inputs per
#                                                mark: n - 1 placed next door, n + 1 placed next door,
#                                                n placed anywhere, the cell filled), cand (rel and
#                                                how many cells n could still take, min(k, 4) / 4)
#
# Agreement is graph_policy.py's: the top guess is among the person's next 3 moves. CPU is enough
# (a probe epoch is ~22 min on one thread); THREADS sets torch's threads.
import json, os, re, sys, time, random
from collections import Counter
MODE, ARGS = (sys.argv[1] if len(sys.argv) > 1 else "rule"), sys.argv[2:]
os.environ.update(GRAPH_H="256", GRAPH_HEADS="8", GRAPH_POS="1", GRAPH_STRUCTURE="1")
sys.argv = [sys.argv[0], "--attention"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, torch, torch.nn as nn
torch.set_num_threads(int(os.environ.get("THREADS", 4)))
import graph_policy as gp

REFS = os.path.join(HERE, "../../references/ml/")
LABELS = os.environ.get("LABELS") or os.path.join(REFS, "graphs-human-labels.jsonl")
BASE = os.path.join(REFS, "models/baseline-2026-10-14/model.pt")
ARM = ARGS[0] if MODE == "probe" else "none"
NX = {"none": 0, "rel": 4, "cand": 5}[ARM]

def records(genre, split=None):
    for l in gp.lines(LABELS):
        if f'"genre":"{genre}"' not in l or (split and f'"split":"{split}"' not in l): continue
        d = json.loads(l); p = gp.Puzzle(d)
        if p.R and p.M <= gp.MAX_MARKS: prep(p, d); yield p

def prep(p, d):
    """A Hidoku's digit marks as (cell, number), its cells' king-move neighbours and its rocks."""
    st = d["structure"]; R, C = st["rows"], st["cols"]
    p.names, p.split = [m["name"] for m in st["marks"]], d["split"]
    if d["genre"] != "hidoku": return
    p.cv = np.array([tuple(map(int, re.match(r"digit\((\d+),(\d+)\)", n).groups())) for n in p.names])
    p.blocked = {c for c, kind, _ in d["givens"] if kind == "blocked"}
    p.adj = np.zeros((R * C, R * C), bool)
    for c in range(R * C):
        r, q = divmod(c, C)
        for rr in range(max(0, r - 1), min(R, r + 2)):
            for qq in range(max(0, q - 1), min(C, q + 2)):
                if (rr, qq) != (r, q) and rr * C + qq not in p.blocked: p.adj[c, rr * C + qq] = True
    p.N, p.ncell = p.cv[:, 1].max(), R * C

def relations(p, s):
    """Per mark: n - 1 next door, n + 1 next door, n placed, the cell filled (and with cand, the
    cells n could still take)."""
    cell, val = p.cv[:, 0], p.cv[:, 1]; t = s == 1
    pos = np.full(p.N + 2, -1); pos[val[t]] = cell[t]
    filled = np.zeros(p.ncell, bool); filled[cell[t]] = True; filled[list(p.blocked)] = True
    pm, pp = pos[val - 1], pos[np.minimum(val + 1, p.N + 1)]
    f1 = (pm >= 0) & p.adj[cell, np.maximum(pm, 0)]
    f2 = (pp >= 0) & p.adj[cell, np.maximum(pp, 0)]
    f3, f4 = pos[val] >= 0, filled[cell]
    cols = [f1, f2, f3, f4]
    if ARM == "cand":
        ok = ~f3 & ~f4 & (s != 2) & ((pm < 0) | f1) & ((pp < 0) | f2) & ((pm >= 0) | (pp >= 0))
        n = np.bincount(val[ok], minlength=p.N + 2)
        cols.append(np.where(ok, np.minimum(n[val], 4) / 4, 0))
    return np.stack(cols, 1).astype(np.float32)

_batch = gp.batch_states
def batch_states(items, attention=False):
    g, y, mask, offs = _batch(items, attention)
    if NX: g = (torch.cat([g[0], torch.from_numpy(np.concatenate([relations(p, s) for (p, s, _) in items]))], 1),) + g[1:]
    return g, y, mask, offs
gp.batch_states = batch_states

def agreement(net, items):
    hits = [r[4][0] for _, _, r in gp.score(net, items) if r[4] is not None]
    return float(np.mean(hits)), len(hits)

def rule():
    for split in ("train", "test"):
        c = Counter()
        for p in records("hidoku", split):
            idx = {tuple(x): i for i, x in enumerate(p.cv)}
            for k in range(p.R):
                s, _ = p.state(k); nxt = p.people(s)
                if nxt is None or not len(nxt): continue
                cell, val = p.cv[:, 0], p.cv[:, 1]
                pos = dict(zip(val[s == 1].tolist(), cell[s == 1].tolist()))
                filled = set(pos.values()) | p.blocked
                moves = []
                for v in range(1, p.N + 1):
                    if v in pos or (v - 1 not in pos and v + 1 not in pos): continue
                    cs = [x for x in range(p.ncell) if x not in filled and s[idx[(x, v)]] != 2 and all(w not in pos or p.adj[x, pos[w]] for w in (v - 1, v + 1))]
                    if len(cs) == 1: moves.append((0 if v - 1 in pos and v + 1 in pos else 1, v, 2 * idx[(cs[0], v)]))
                moves.sort(); c["states"] += 1; c["a move"] += bool(moves)
                if moves: c["top in next 3"] += moves[0][2] in set(nxt.tolist())
        print(f"{split}: {c['states']} states; the rule has a move in {c['a move'] / c['states']:.0%}, its top move is among the person's next 3 in {c['top in next 3'] / c['states']:.0%}")

def score(model):
    net = gp.load_net(model); net.eval()
    for genre in ("hidoku", "skyscrapers", "easy-as-abc"):
        te = list(records(genre, "test"))
        items = [(p, k) for p in te for k in range(p.R)]
        if genre == "easy-as-abc": items = items[::5]
        a, n = agreement(net, items)
        print(f"{genre}: agreement {a:.1%} on {n} test states", flush=True)
        if genre != "hidoku": continue
        c = Counter()
        with torch.no_grad():
            for (p, k) in items:
                s, _ = p.state(k)
                if p.people(s) is None or not len(p.people(s)): continue
                g, _, mask, _ = gp.batch_states([(p, s, np.zeros((len(s), 2), np.float32))], True)
                top = net(gp.to(g)).masked_fill(mask[:, None] == 0, -1e9).flatten().argmax().item()
                i = top // 2; x, v = p.cv[i]; t = s == 1
                pos = dict(zip(p.cv[t, 1].tolist(), p.cv[t, 0].tolist()))
                c["n"] += 1; c["correct"] += bool(p.truth[i]) == (top % 2 == 0)
                c["number already placed"] += v in pos
                c["next to n - 1 or n + 1"] += any(w in pos and p.adj[x, pos[w]] for w in (v - 1, v + 1))
        print("hidoku top guesses: " + ", ".join(f"{k} {c[k] / c['n']:.0%}" for k in c if k != "n"))

def probe(epochs):
    random.seed(0); np.random.seed(0); torch.manual_seed(0); gp.random.seed(0)
    tr, te = list(records("hidoku", "train")), list(records("hidoku", "test"))
    items, titems = [(p, k) for p in tr for k in range(p.R)], [(p, k) for p in te for k in range(p.R)]
    net = gp.load_net(BASE)
    if NX:
        # the new inputs start at zero weight, so the network starts as the baseline
        old = net.em; net.em = nn.Linear(old.in_features + NX, old.out_features)
        with torch.no_grad(): net.em.weight.zero_(); net.em.weight[:, :old.in_features] = old.weight; net.em.bias.copy_(old.bias)
    a, n = agreement(net, titems)
    print(f"{ARM} epoch 0: agreement {a:.1%} on {n} test states ({len(items)} training states)", flush=True)
    opt = torch.optim.AdamW(net.parameters(), 3e-4, weight_decay=1e-4)
    for ep in range(epochs):
        t0 = time.time(); net.train(); gp.random.shuffle(items); tot = m = 0
        parts = gp.chunks(items)
        for i, part in enumerate(parts):
            if ep == 0:
                for gr in opt.param_groups: gr["lr"] = 3e-4 * min(1.0, (i + 1) / max(1, len(parts) // 10))
            loss = gp.loss_of(net, part); opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 1.0); opt.step()
            tot += loss.item(); m += 1
        a, n = agreement(net, titems)
        print(f"{ARM} epoch {ep + 1}: loss {tot / m:.3f}, agreement {a:.1%} ({time.time() - t0:.0f} s)", flush=True)

if MODE == "rule": rule()
elif MODE == "score": score(ARGS[0])
elif MODE == "probe": probe(int(ARGS[1]) if len(ARGS) > 1 else 4)
else: sys.exit("modes: rule | score <model.pt> | probe <none|rel|cand> [epochs]")
