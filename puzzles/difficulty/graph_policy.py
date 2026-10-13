# One move-predicting network for every type (data: graph-data.ts → references/ml/graphs.jsonl,
# local only). A puzzle state is a graph of marks, cells and rule instances; the rule instances are
# described only in the shared vocabulary (signatures.ts: primitive and unit kind), so nothing in
# the network is specific to a type. Messages pass mark → cell → rule → cell → mark several times;
# each open mark gets a score for being settled within the next three rounds.
#
#   python graph_policy.py all                train on every type, test held-out puzzles per type
#   python graph_policy.py holdout <type>...  train without each type; test on it (zero-shot), then
#                                             after fine-tuning on 10 of its puzzles (few-shot)
#   python graph_policy.py embed              move embeddings: do moves with the same signature sit
#                                             together, across types? does cost lie along a line?
import json, os, random, sys, time
from collections import defaultdict
import numpy as np
import torch, torch.nn as nn

HERE = os.path.dirname(os.path.abspath(__file__))
# one file, or several joined by commas
DATA = os.environ.get("GRAPH_DATA") or os.path.join(HERE, "../../references/ml/graphs.jsonl")
NEXT = 3
dev = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")

PRIMS = ["count", "each-once", "pattern", "connect", "size", "sum", "sight", "order"]
UNITS = ["line", "strip", "region", "block", "grid", "local"]
MARKS = ["shaded", "digit", "line", "cut", "fence", "paint"]
GIVENS = ["number", "block", "blocked"]
# the rule → primitive table, read from signatures.ts so there is one copy
PRIM = {}
for line in open(os.path.join(HERE, "signatures.ts")):
    for k, v in __import__("re").findall(r'"?([a-z0-9-]+)"?: "([a-z-]+)"', line):
        if v in PRIMS: PRIM[k] = v

def unit_kind(label):
    import re
    if re.match(r"^(row|column) ", label): return "line"
    if re.match(r"^(rows|columns) \d", label): return "strip"
    if re.match(r"^(area|box) ", label): return "region"
    if label.startswith("2 × 2 "): return "block"
    if label == "the whole grid": return "grid"
    return "local"

# ---- a puzzle as tensors, and its states ----
class Puzzle:
    def __init__(self, d):
        self.genre, self.source, self.name = d["genre"], d["source"], d["name"]
        st = d["structure"]
        self.nc = st["cells"]
        self.marks = [m["name"] for m in st["marks"]]
        self.mindex = {m: i for i, m in enumerate(self.marks)}
        M = len(self.marks)
        # static features
        mf = np.zeros((M, len(MARKS) + 1), np.float32)
        me = []   # mark–cell edges
        for i, m in enumerate(st["marks"]):
            kind = m["name"].split("(")[0]
            if kind in MARKS: mf[i, MARKS.index(kind)] = 1
            args = m["name"][m["name"].index("(") + 1:-1].split(",")
            if len(args) > 1: mf[i, -1] = int(args[1]) / 9
            for c in m["cells"]: me.append((i, c))
        cf = np.zeros((self.nc, len(GIVENS) + 1), np.float32)
        for (c, kind, v) in d["givens"]:
            if kind in GIVENS: cf[c, GIVENS.index(kind)] = 1
            if v: cf[c, -1] = v / 9
        gf, ge = [], []
        for j, g in enumerate(st["groups"]):
            f = np.zeros(len(PRIMS) + len(UNITS) + 2, np.float32)
            p = PRIM.get(g["kind"])
            if p: f[PRIMS.index(p)] = 1
            else: f[len(PRIMS) + len(UNITS)] = 1
            f[len(PRIMS) + UNITS.index(unit_kind(g["label"]))] = 1
            f[-1] = np.log1p(len(g["cells"])) / 4
            gf.append(f)
            for c in g["cells"]: ge.append((j, c))
        self.mf, self.cf = torch.tensor(mf), torch.tensor(cf)
        self.gf = torch.tensor(np.stack(gf)) if gf else torch.zeros((0, len(PRIMS) + len(UNITS) + 2))
        self.me = torch.tensor(me, dtype=torch.long).reshape(-1, 2)
        self.ge = torch.tensor(ge, dtype=torch.long).reshape(-1, 2)
        self.answer = set(d["answer"])
        # states: known before each round; labels: the next NEXT rounds' facts
        known = {}
        def apply(facts):
            for f in facts:
                if isinstance(f, str): name, v = f.rsplit("=", 1); known[name] = v == "true"
                else: known[f[0]] = f[1]
        apply(d["initial"])
        self.states = []
        rounds = d["rounds"]
        for ri, rd in enumerate(rounds):
            s = np.zeros(M, np.int8)   # 0 open, 1 true, 2 false
            for name, v in known.items():
                if name in self.mindex: s[self.mindex[name]] = 1 if v else 2
            y = np.zeros((M, 2), np.float32)
            moves = []
            for later in rounds[ri:ri + NEXT]:
                for (name, v, sig, cost) in later["facts"]:
                    if name in self.mindex: y[self.mindex[name], 0 if v else 1] = 1
            for (name, v, sig, cost) in rd["facts"]:
                # "(none)" was the earlier name for cell-only moves
                if name in self.mindex: moves.append((self.mindex[name], v, "cell-only" if sig == "(none)" else sig, cost))
            self.states.append((s, y, moves))
            apply([(f[0], f[1]) for f in rd["facts"]])

def batch(items):
    """Several (puzzle, state index) as one graph."""
    mfs, cfs, gfs, mes, ges, ys, masks, offs = [], [], [], [], [], [], [], []
    om = oc = og = 0
    for (pz, k) in items:
        s, y, _ = pz.states[k]
        state = np.zeros((len(s), 3), np.float32); state[np.arange(len(s)), s] = 1
        mfs.append(torch.cat([pz.mf, torch.tensor(state)], 1)); cfs.append(pz.cf); gfs.append(pz.gf)
        mes.append(pz.me + torch.tensor([om, oc])); ges.append(pz.ge + torch.tensor([og, oc]))
        ys.append(torch.tensor(y)); masks.append(torch.tensor((s == 0).astype(np.float32)))
        offs.append((om, len(s)))
        om += len(s); oc += pz.nc; og += len(pz.gf)
    return (torch.cat(mfs), torch.cat(cfs), torch.cat(gfs), torch.cat(mes), torch.cat(ges), oc), torch.cat(ys), torch.cat(masks), offs

# ---- the network ----
def pool(src, index, n):
    """Mean and max of src rows into n slots by index."""
    d = src.shape[1]
    s = torch.zeros(n, d, device=src.device).index_add_(0, index, src)
    cnt = torch.zeros(n, device=src.device).index_add_(0, index, torch.ones(len(index), device=src.device)).clamp(min=1)
    mx = torch.full((n, d), -1e4, device=src.device).scatter_reduce(0, index[:, None].expand(-1, d), src, "amax")
    mx = torch.where(mx < -1e3, torch.zeros_like(mx), mx)
    return torch.cat([s / cnt[:, None], mx], 1)

def mlp(i, o): return nn.Sequential(nn.Linear(i, o), nn.ReLU(), nn.Linear(o, o))
class GraphNet(nn.Module):
    def __init__(self, h=64, rounds=6):
        super().__init__()
        self.em, self.ec, self.eg = nn.Linear(len(MARKS) + 1 + 3, h), nn.Linear(len(GIVENS) + 1, h), nn.Linear(len(PRIMS) + len(UNITS) + 2, h)
        self.rounds = rounds
        self.m2c = nn.ModuleList([mlp(3 * h, h) for _ in range(rounds)]); self.c2g = nn.ModuleList([mlp(3 * h, h) for _ in range(rounds)])
        self.g2c = nn.ModuleList([mlp(3 * h, h) for _ in range(rounds)]); self.c2m = nn.ModuleList([mlp(3 * h, h) for _ in range(rounds)])
        self.out = nn.Linear(h, 2)
    def forward(self, g, hidden=False):
        mf, cf, gf, me, ge, nc = g
        m, c, q = self.em(mf), self.ec(cf), self.eg(gf)
        for t in range(self.rounds):
            c = c + self.m2c[t](torch.cat([c, pool(m[me[:, 0]], me[:, 1], nc)], 1))
            q = q + self.c2g[t](torch.cat([q, pool(c[ge[:, 1]], ge[:, 0], len(q))], 1)) if len(q) else q
            c = c + self.g2c[t](torch.cat([c, pool(q[ge[:, 0]], ge[:, 1], nc)], 1)) if len(q) else c
            m = m + self.c2m[t](torch.cat([m, pool(c[me[:, 1]], me[:, 0], len(m))], 1))
            m, c = torch.relu(m), torch.relu(c)
        return (self.out(m), m) if hidden else self.out(m)

def to(g): return tuple(x.to(dev) if torch.is_tensor(x) else x for x in g)

BUDGET = 20000   # marks per batch: batches by size, not count, so memory stays even

def chunks(items):
    """Items in batches of at most BUDGET marks."""
    out, cur, size = [], [], 0
    for it in items:
        m = len(it[0].marks)
        if cur and size + m > BUDGET: out.append(cur); cur, size = [], 0
        cur.append(it); size += m
    if cur: out.append(cur)
    return out

def train(items, epochs, net=None, lr=2e-3):
    net = net or GraphNet().to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr, weight_decay=1e-4)
    t0 = time.time()
    for ep in range(epochs):
        net.train(); random.shuffle(items); tot = n = 0
        for part in chunks(items):
            g, y, mask, _ = batch(part); g, y, mask = to(g), y.to(dev), mask.to(dev)
            pos = (y.max(1).values * mask).sum() / mask.sum().clamp(min=1)
            w = 1 + y * ((1 - pos) / pos.clamp(min=1e-3)).clamp(max=30)
            loss = (nn.functional.binary_cross_entropy_with_logits(net(g), y, weight=w, reduction="none").sum(1) * mask).sum() / mask.sum().clamp(min=1)
            opt.zero_grad(); loss.backward(); opt.step(); tot += loss.item(); n += 1
            # Apple's GPU caches memory per tensor shape, and graph batches vary: release it
            if dev.type == "mps" and n % 10 == 0: torch.mps.empty_cache()
        print(f"  epoch {ep + 1}: loss {tot / max(1, n):.3f} ({time.time() - t0:.0f} s)", flush=True)
    return net

def evaluate(net, items):
    """Share of states whose top-scored open mark (either way) is a move within the next rounds; random's share."""
    net.eval(); hits = base = 0
    with torch.no_grad():
        for part in chunks(items):
            g, y, mask, offs = batch(part); logits = net(to(g)).cpu()
            for (o, n) in offs:
                lg, yy, mm = logits[o:o + n], y[o:o + n], mask[o:o + n]
                if mm.sum() == 0: continue
                lg = lg.masked_fill(mm[:, None] == 0, -1e9).flatten(); top = lg.argmax().item()
                hits += yy.flatten()[top].item() > 0
                base += ((yy * mm[:, None]).sum() / (2 * mm.sum())).item()
    return hits / max(1, len(items)), base / max(1, len(items))

def load():
    pz = [Puzzle(json.loads(l)) for f in DATA.split(",") for l in open(f) if l.strip()]
    # a few puzzles have very many marks (a big board's every digit, link or border): left out
    return [p for p in pz if p.states and len(p.marks) <= 4000]
def states(puzzles, per=None):
    """Every (puzzle, state), or at most `per` of each puzzle's states (spread through its solve)."""
    out = []
    for p in puzzles:
        ks = list(range(len(p.states)))
        if per and len(ks) > per: ks = ks[:: max(1, len(ks) // per)][:per]
        out += [(p, k) for k in ks]
    return out

if __name__ == "__main__":
    random.seed(1); torch.manual_seed(1)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    pzs = load()
    by = defaultdict(list)
    for p in pzs: by[p.genre].append(p)
    for v in by.values(): random.Random(2).shuffle(v)
    print(f"{len(pzs)} puzzles, {sum(len(p.states) for p in pzs)} states, {len(by)} types: " + ", ".join(f"{g} {len(v)}" for g, v in sorted(by.items())))
    split = {g: (v[:int(0.8 * len(v))], v[int(0.8 * len(v)):]) for g, v in by.items()}
    if mode == "all":
        net = train(states([p for tr, _ in split.values() for p in tr]), 8)
        print("\n| Type | Test states | Top guess is a move | Random |\n|---|---|---|---|")
        for g, (_, te) in sorted(split.items()):
            if not te: continue
            h, b = evaluate(net, states(te)); print(f"| {g} | {len(states(te))} | {h:.0%} | {b:.0%} |")
        torch.save(net.state_dict(), os.path.join(HERE, "../../references/ml/graph-policy.pt"))
    elif mode == "holdout":
        print("\n| Held-out type | Trained with it | Without it (zero-shot) | + 10 of its puzzles (few-shot) | Random |\n|---|---|---|---|---|")
        full = GraphNet().to(dev); full.load_state_dict(torch.load(os.path.join(HERE, "../../references/ml/graph-policy.pt"), map_location=dev))
        for g in sys.argv[2:]:
            tr_others = [p for k, (tr, _) in split.items() if k != g for p in tr]
            te = states(split[g][1])
            withit, base = evaluate(full, te)
            # without it: at most 8 states a puzzle, 4 epochs (the scaled data would take hours a run)
            net = train(states(tr_others, 8), 4)
            zero, _ = evaluate(net, te)
            # few-shot: 10 of its puzzles, mixed with as many states again from the other types, so
            # the network learns the new type without forgetting the rest
            new = states(split[g][0][:10]); pool_ = states(tr_others, 8); replay = random.sample(pool_, min(len(new), len(pool_)))
            net = train(new + replay, 4, net, lr=2e-4)
            few, _ = evaluate(net, te)
            print(f"| {g} | {withit:.0%} | {zero:.0%} | {few:.0%} | {base:.0%} |", flush=True)
    elif mode == "embed":
        net = GraphNet().to(dev); net.load_state_dict(torch.load(os.path.join(HERE, "../../references/ml/graph-policy.pt"), map_location=dev)); net.eval()
        vecs, sigs, genres, costs = [], [], [], []
        with torch.no_grad():
            for g, (_, te) in sorted(split.items()):
                for p in te:
                    for k, (s, y, moves) in enumerate(p.states):
                        if not moves: continue
                        gr, _, _, offs = batch([(p, k)]); _, h = net(to(gr), hidden=True); h = h.cpu()
                        for (mi, v, sig, cost) in moves[:4]:
                            vecs.append(h[mi].numpy()); sigs.append(" ".join(sorted(set(sig.split(" "))))); genres.append(g); costs.append(cost)
        V = np.stack(vecs); keep = V.std(0) > 1e-3   # nearly constant columns would blow up when scaled
        V = (V[:, keep] - V[:, keep].mean(0)) / V[:, keep].std(0); costs = np.array(costs)
        sigs, genres = np.array(sigs), np.array(genres)
        # nearest neighbours by cosine
        U = V / np.linalg.norm(V, axis=1, keepdims=True); S = U @ U.T; np.fill_diagonal(S, -1)
        nn5 = np.argsort(-S, 1)[:, :5]
        same = (sigs[nn5] == sigs[:, None]).mean()
        freq = defaultdict(int)
        for s_ in sigs: freq[s_] += 1
        chance = sum((v / len(sigs)) ** 2 for v in freq.values())
        # across types: each move's nearest neighbour from another type
        cross, n_cross = 0, 0
        for i in range(len(V)):
            other = np.where(genres != genres[i])[0]
            if len(other) == 0 or freq[sigs[i]] < 3: continue
            j = other[np.argmax(S[i, other])]; cross += sigs[j] == sigs[i]; n_cross += 1
        print(f"{len(V)} moves from {len(set(genres))} types, {len(freq)} signatures")
        print(f"nearest 5 share the move's signature: {same:.0%} (chance {chance:.0%})")
        # chance: a random move of another type sharing the signature
        by_g = defaultdict(lambda: defaultdict(int))
        for s_, g_ in zip(sigs, genres): by_g[g_][s_] += 1
        tot_g = {g_: sum(v.values()) for g_, v in by_g.items()}
        ch = []
        for s_, g_ in zip(sigs, genres):
            other_n = len(sigs) - tot_g[g_]
            if other_n and freq[s_] >= 3: ch.append((freq[s_] - by_g[g_][s_]) / other_n)
        print(f"nearest move from another type shares it: {cross / max(1, n_cross):.0%} (chance {np.mean(ch):.0%}, n={n_cross})")
        # a difficulty direction: ridge regression of cost on the embedding, fit on half, tested on the other
        idx = np.random.RandomState(0).permutation(len(V)); a, b = idx[: len(V) // 2], idx[len(V) // 2:]
        X = np.c_[V, np.ones(len(V))]; w = np.linalg.lstsq(np.r_[X[a], np.sqrt(10) * np.eye(X.shape[1])], np.r_[costs[a], np.zeros(X.shape[1])], rcond=None)[0]
        pred = X[b] @ w; r2 = 1 - ((pred - costs[b]) ** 2).sum() / ((costs[b] - costs[b].mean()) ** 2).sum()
        print(f"step cost from a straight line through the space: R² {r2:.2f} on held-out moves")
        np.savez(os.path.join(HERE, "../../references/ml/move-embedding.npz"), V=V, sigs=sigs, genres=genres, costs=costs)
