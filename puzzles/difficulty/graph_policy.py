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
#   python graph_policy.py family <family>... like holdout, a whole family of types at once (FAMILIES)
#   python graph_policy.py grid [family...]   every version (base, attention, pretrain, both): the
#                                             per-type table, then each family left out in turn;
#                                             results to GRID_OUT as they come (summary.md)
#
#   --attention  global self-attention over all of a puzzle's nodes after every other round of
#                message passing (a GPS-style hybrid)
#   --pretrain   hide and fill first: solved puzzles with 15-50% of their marks hidden, the network
#                fills them in from the rest; then move prediction as usual
import json, os, random, sys, time
from collections import defaultdict
import numpy as np
import torch, torch.nn as nn

HERE = os.path.dirname(os.path.abspath(__file__))
# one file, or several joined by commas
DATA = os.environ.get("GRAPH_DATA") or os.path.join(HERE, "../../references/ml/graphs.jsonl")
NEXT = 3
# families of types from the types × techniques SVD (technique_svd.py); other types are in none
FAMILIES = {
    "lines-loops": ["simple-loop", "simple-path", "numberlink", "masyu", "slitherlink"],
    "counting": ["star-battle", "aquarium", "abstract-art", "binary-puzzle"],
    "each-once": ["sudoku", "irregular-sudoku", "thermo-sudoku", "skyscrapers", "easy-as-abc", "hitori"],
    "sight-near": ["akari", "minesweeper", "cave", "wittgenstein-briquet"],
    "regions-size": ["shikaku", "square-jam", "spiral-galaxies", "polyomino-packing", "fillomino"],
    "order": ["hive", "hidoku", "pythagorean-paths", "honeycomb-paths"],
}
FLAGS = {a for a in sys.argv[1:] if a.startswith("--")}
# the network's size (GRAPH_H numbers per node, GRAPH_HEADS attention heads) and GRAPH_POS=1 for
# each cell's position (row and column, and waves across the grid) as input
H = int(os.environ.get("GRAPH_H", 64)); HEADS = int(os.environ.get("GRAPH_HEADS", 4))
POS = os.environ.get("GRAPH_POS") == "1"
NPOS = 10 if POS else 0
sys.argv = [a for a in sys.argv if not a.startswith("--")]
dev = torch.device(os.environ["GRAPH_DEVICE"]) if os.environ.get("GRAPH_DEVICE") else torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")

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
        cf = np.zeros((self.nc, len(GIVENS) + 1 + NPOS), np.float32)
        for (c, kind, v) in d["givens"]:
            if kind in GIVENS: cf[c, GIVENS.index(kind)] = 1
            if v: cf[c, len(GIVENS)] = v / 9
        if POS:
            # where each cell is (rows and columns from the cell's number; grids that aren't rows
            # of cells get none): row and column as fractions, distance to the nearest edge, and
            # two waves across each axis, so attention can tell near from far
            R, C = st.get("rows") or 0, st.get("cols") or 0
            if R and C and R * C >= self.nc:
                for c in range(self.nc):
                    r, q = divmod(c, C); fr, fc = (r + .5) / R, (q + .5) / C
                    cf[c, -NPOS:] = [fr, fc, min(fr, 1 - fr), min(fc, 1 - fc)] + [np.sin(np.pi * fr), np.cos(np.pi * fr), np.sin(2 * np.pi * fr), np.sin(np.pi * fc), np.cos(np.pi * fc), np.sin(2 * np.pi * fc)]
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

def batch(items, attention=False):
    """Several (puzzle, state index) as one graph."""
    return batch_states([(pz, pz.states[k][0], pz.states[k][1]) for (pz, k) in items], attention)

def batch_states(items, attention=False):
    """Several (puzzle, state array, targets) as one graph; with attention, also its groups."""
    mfs, cfs, gfs, mes, ges, ys, masks, offs = [], [], [], [], [], [], [], []
    om = oc = og = 0
    for (pz, s, y) in items:
        state = np.zeros((len(s), 3), np.float32); state[np.arange(len(s)), s] = 1
        mfs.append(torch.cat([pz.mf, torch.tensor(state)], 1)); cfs.append(pz.cf); gfs.append(pz.gf)
        mes.append(pz.me + torch.tensor([om, oc])); ges.append(pz.ge + torch.tensor([og, oc]))
        ys.append(torch.tensor(y)); masks.append(torch.tensor((s == 0).astype(np.float32)))
        offs.append((om, len(s)))
        om += len(s); oc += pz.nc; og += len(pz.gf)
    groups = attention_groups(items, om, oc) if attention else None
    return (torch.cat(mfs), torch.cat(cfs), torch.cat(gfs), torch.cat(mes), torch.cat(ges), oc, groups), torch.cat(ys), torch.cat(masks), offs

ATT_CAP = 1 << 24   # padded query × key pairs per attention call
def attention_groups(items, M, C):
    """Each puzzle's nodes (its marks, cells and rule instances, as rows of cat(marks, cells,
    rules)); puzzles sorted by size and padded together in groups of like size: (index, valid)."""
    nodes, om, oc, og = [], 0, 0, 0
    for (pz, s, _) in items:
        nodes.append(np.r_[np.arange(om, om + len(s)), M + np.arange(oc, oc + pz.nc), M + C + np.arange(og, og + len(pz.gf))])
        om += len(s); oc += pz.nc; og += len(pz.gf)
    groups, cur = [], []
    for i in sorted(range(len(nodes)), key=lambda i: len(nodes[i])):
        L = len(nodes[i])
        if cur and ((len(cur) + 1) * L * L > ATT_CAP or L > 1.25 * len(nodes[cur[0]]) + 16): groups.append(cur); cur = []
        cur.append(i)
    if cur: groups.append(cur)
    out = []
    for g in groups:
        L = max(len(nodes[i]) for i in g)
        idx = np.zeros((len(g), L), np.int64); valid = np.zeros((len(g), L), bool)
        for r, i in enumerate(g): idx[r, :len(nodes[i])] = nodes[i]; valid[r, :len(nodes[i])] = True
        out.append((torch.tensor(idx), torch.tensor(valid)))
    return out

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

class GlobalAttention(nn.Module):
    """Multi-head self-attention over every node of each puzzle, then a feed-forward block (both
    pre-norm, residual); puzzles padded in groups of like size."""
    def __init__(self, h, heads=4):
        super().__init__()
        self.heads, self.n1, self.n2 = heads, nn.LayerNorm(h), nn.LayerNorm(h)
        self.qkv, self.o = nn.Linear(h, 3 * h), nn.Linear(h, h)
        self.ff = nn.Sequential(nn.Linear(h, 2 * h), nn.ReLU(), nn.Linear(2 * h, h))
    def forward(self, x, groups):
        h = x.shape[1]; d = h // self.heads
        z, upd = self.n1(x), torch.zeros_like(x)
        for idx, valid in groups:
            G, L = idx.shape
            q, k, v = self.qkv(z[idx]).view(G, L, 3, self.heads, d).permute(2, 0, 3, 1, 4)
            a = nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=valid[:, None, None, :].expand(G, 1, L, L))
            a = self.o(a.transpose(1, 2).reshape(G, L, h))
            upd = upd.index_copy(0, idx[valid], a[valid])
        x = x + upd
        return x + self.ff(self.n2(x))

class GraphNet(nn.Module):
    def __init__(self, h=H, rounds=6, attention=False):
        super().__init__()
        # global attention after rounds 2, 4 and 6
        self.att = nn.ModuleList([GlobalAttention(h, HEADS) for _ in range(rounds // 2)]) if attention else None
        self.fill = nn.Linear(h, 1)   # hide and fill: is this hidden mark true?
        self.em, self.ec, self.eg = nn.Linear(len(MARKS) + 1 + 3, h), nn.Linear(len(GIVENS) + 1 + NPOS, h), nn.Linear(len(PRIMS) + len(UNITS) + 2, h)
        self.rounds = rounds
        self.m2c = nn.ModuleList([mlp(3 * h, h) for _ in range(rounds)]); self.c2g = nn.ModuleList([mlp(3 * h, h) for _ in range(rounds)])
        self.g2c = nn.ModuleList([mlp(3 * h, h) for _ in range(rounds)]); self.c2m = nn.ModuleList([mlp(3 * h, h) for _ in range(rounds)])
        self.out = nn.Linear(h, 2)
    def forward(self, g, hidden=False, fill=False):
        mf, cf, gf, me, ge, nc, groups = g
        m, c, q = self.em(mf), self.ec(cf), self.eg(gf)
        for t in range(self.rounds):
            c = c + self.m2c[t](torch.cat([c, pool(m[me[:, 0]], me[:, 1], nc)], 1))
            q = q + self.c2g[t](torch.cat([q, pool(c[ge[:, 1]], ge[:, 0], len(q))], 1)) if len(q) else q
            c = c + self.g2c[t](torch.cat([c, pool(q[ge[:, 0]], ge[:, 1], nc)], 1)) if len(q) else c
            m = m + self.c2m[t](torch.cat([m, pool(c[me[:, 1]], me[:, 0], len(m))], 1))
            if self.att is not None and t % 2 == 1:
                x = self.att[t // 2](torch.cat([m, c, q]), groups)
                m, c, q = x[:len(m)], x[len(m):len(m) + len(c)], x[len(m) + len(c):]
            m, c = torch.relu(m), torch.relu(c)
        if fill: return self.fill(m)[:, 0]
        return (self.out(m), m) if hidden else self.out(m)

def to(g):
    mv = lambda x: x.to(dev) if torch.is_tensor(x) else [tuple(t.to(dev) for t in p) for p in x] if isinstance(x, list) else x
    return tuple(mv(x) for x in g)
def attends(net): return net.att is not None
def new_net(): return GraphNet(attention="--attention" in FLAGS).to(dev)
def version(): return "both" if {"--attention", "--pretrain"} <= FLAGS else "attention" if "--attention" in FLAGS else "pretrain" if "--pretrain" in FLAGS else "base"
def weights(): return os.path.join(HERE, "../../references/ml/graph-policy" + ("" if version() == "base" else "-" + version()) + (f"-{os.environ['GRAPH_TAG']}" if os.environ.get("GRAPH_TAG") else "") + ".pt")

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

def pretrain(puzzles, epochs, net=None, lr=2e-3):
    """Hide and fill: each epoch, every solved puzzle with a fresh 15-50% of its marks hidden; the
    network says which hidden marks are true."""
    net = net or new_net()
    opt = torch.optim.AdamW(net.parameters(), lr, weight_decay=1e-4)
    t0 = time.time()
    for ep in range(epochs):
        net.train(); items = []
        for p in puzzles:
            truth = np.array([m in p.answer for m in p.marks])
            s = np.where(truth, 1, 2).astype(np.int8)
            s[np.random.rand(len(s)) < random.uniform(0.15, 0.5)] = 0
            items.append((p, s, truth.astype(np.float32)[:, None]))
        random.shuffle(items); tot = n = right = seen = 0
        for part in chunks(items):
            g, y, mask, _ = batch_states(part, attends(net)); g, y, mask = to(g), y[:, 0].to(dev), mask.to(dev)
            logit = net(g, fill=True)
            # true marks are rarer (one digit in nine): weighted to count as much as the false
            pos = (y * mask).sum() / mask.sum().clamp(min=1)
            w = torch.where(y > 0, 0.5 / pos.clamp(min=1e-3), 0.5 / (1 - pos).clamp(min=1e-3))
            loss = (nn.functional.binary_cross_entropy_with_logits(logit, y, weight=w, reduction="none") * mask).sum() / mask.sum().clamp(min=1)
            opt.zero_grad(); loss.backward()
            if LR_SCALE: nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step(); tot += loss.item(); n += 1
            right += (((logit > 0).float() == y).float() * mask).sum().item(); seen += mask.sum().item()
        print(f"  fill epoch {ep + 1}: loss {tot / max(1, n):.3f}, hidden marks right {right / max(1, seen):.0%} ({time.time() - t0:.0f} s)", flush=True)
    return net

# GRAPH_LR_SCALE=1: the learning rate scaled down with width (2e-3 at width 64, half that at 128,
# a quarter at 256) and warmed up over the first epoch, with gradients clipped. One rate for every
# width made the wide networks diverge (graph-20261013-0640, width 256)
LR_SCALE = os.environ.get("GRAPH_LR_SCALE") == "1"

def train(items, epochs, net=None, lr=2e-3):
    net = net or new_net()
    if LR_SCALE: lr = lr * 64 / H
    opt = torch.optim.AdamW(net.parameters(), lr, weight_decay=1e-4)
    t0 = time.time(); steps_per_epoch = max(1, len(chunks(items))); step = 0
    for ep in range(epochs):
        net.train(); random.shuffle(items); tot = n = 0
        for part in chunks(items):
            if LR_SCALE and ep == 0:
                step += 1
                for gr in opt.param_groups: gr["lr"] = lr * min(1.0, step / steps_per_epoch)
            g, y, mask, _ = batch(part, attends(net)); g, y, mask = to(g), y.to(dev), mask.to(dev)
            pos = (y.max(1).values * mask).sum() / mask.sum().clamp(min=1)
            w = 1 + y * ((1 - pos) / pos.clamp(min=1e-3)).clamp(max=30)
            loss = (nn.functional.binary_cross_entropy_with_logits(net(g), y, weight=w, reduction="none").sum(1) * mask).sum() / mask.sum().clamp(min=1)
            opt.zero_grad(); loss.backward()
            if LR_SCALE: nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step(); tot += loss.item(); n += 1
            # Apple's GPU caches memory per tensor shape, and graph batches vary: release it
            if dev.type == "mps" and n % 10 == 0: torch.mps.empty_cache()
        print(f"  epoch {ep + 1}: loss {tot / max(1, n):.3f} ({time.time() - t0:.0f} s)", flush=True)
    return net

def evaluate(net, items):
    """Share of states whose top-scored open mark (either way) is a move within the next rounds; random's share."""
    net.eval(); hits = base = 0
    with torch.no_grad():
        for part in chunks(items):
            g, y, mask, offs = batch(part, attends(net)); logits = net(to(g)).cpu()
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

EPOCHS = int(os.environ.get("GRAPH_EPOCHS", 8))         # training on every type
HOLD_EPOCHS = int(os.environ.get("GRAPH_HOLD_EPOCHS", 4))  # training without a type or family
PRE_EPOCHS = int(os.environ.get("GRAPH_PRE_EPOCHS", 30))   # hide and fill, before either
MIN_TYPE = int(os.environ.get("GRAPH_MIN_TYPE", 20))   # types with fewer puzzles are left out of the means (and get no few-shot)

def load_net(path):
    net = new_net(); missing, extra = net.load_state_dict(torch.load(path, map_location=dev), strict=False)
    assert not extra and all(k.startswith("fill.") for k in missing), (missing, extra)
    return net

def run_all(split):
    """Train on every type (after hide and fill, with --pretrain); test on each type's held-out puzzles."""
    train_pz = [p for tr, _ in split.values() for p in tr]
    net = pretrain(train_pz, PRE_EPOCHS) if "--pretrain" in FLAGS else None
    if net is None: net = new_net()
    print(f"network: {sum(x.numel() for x in net.parameters()):,} parameters, width {H}, {HEADS} heads, positions {'on' if POS else 'off'}, {EPOCHS} epochs, learning rate {2e-3 * 64 / H if LR_SCALE else 2e-3:.1e}{' scaled and warmed up' if LR_SCALE else ''}", flush=True)
    net = train(states(train_pz), EPOCHS, net)
    out = {}
    for g, (_, te) in sorted(split.items()):
        if te: out[g] = (len(states(te)),) + evaluate(net, states(te))
    return net, out

def run_without(split, held):
    """Train without the types in `held` (after hide and fill on the others' puzzles, with
    --pretrain); test on each held type (zero-shot); fine-tune on 10 puzzles of each held type, and
    test again (few-shot). {type: (zero, few, random)}"""
    others = [p for k, (tr, _) in split.items() if k not in held for p in tr]
    held = [g for g in held if g in split]
    # at most 8 states a puzzle (the scaled data would take hours a run)
    net = pretrain(others, PRE_EPOCHS) if "--pretrain" in FLAGS else None
    net = train(states(others, 8), HOLD_EPOCHS, net)
    zero = {g: evaluate(net, states(split[g][1])) for g in held}
    # few-shot: 10 of each held type's puzzles, mixed with as many states again from the other
    # types, so the network learns the new types without forgetting the rest
    new = states([p for g in held if len(split[g][0]) + len(split[g][1]) >= MIN_TYPE or len(held) == 1 for p in split[g][0][:10]])
    pool_ = states(others, 8); replay = random.sample(pool_, min(len(new), len(pool_)))
    net = train(new + replay, 4, net, lr=2e-4)
    return {g: (zero[g][0], evaluate(net, states(split[g][1]))[0], zero[g][1]) for g in held}

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
        net, out = run_all(split)
        print("\n| Type | Test states | Top guess is a move | Random |\n|---|---|---|---|")
        for g, (n, h, b) in out.items(): print(f"| {g} | {n} | {h:.0%} | {b:.0%} |")
        big = [g for g in out if len(by[g]) >= MIN_TYPE]
        print(f"\nmean over the {len(big)} types with at least {MIN_TYPE} puzzles: {np.mean([out[g][1] for g in big]):.1%} (random {np.mean([out[g][2] for g in big]):.1%})")
        torch.save(net.state_dict(), weights())
    elif mode in ("holdout", "family"):
        print("\n| Held-out type | Trained with it | Without it (zero-shot) | + 10 of its puzzles (few-shot) | Random |\n|---|---|---|---|---|")
        full = load_net(weights()) if os.path.exists(weights()) else None
        for name in sys.argv[2:]:
            for g, (zero, few, base) in run_without(split, FAMILIES[name] if mode == "family" else [name]).items():
                withit = f"{evaluate(full, states(split[g][1]))[0]:.0%}" if full else "–"
                print(f"| {g} | {withit} | {zero:.0%} | {few:.0%} | {base:.0%} |", flush=True)
    elif mode == "grid":
        # every version: the per-type table, then each family left out; GRID_DEADLINE (seconds) stops
        # starting new runs, so a time limit loses little
        out_dir = os.environ.get("GRID_OUT") or os.path.join(HERE, "../../references/ml/grid")
        os.makedirs(out_dir, exist_ok=True)
        deadline = time.time() + float(os.environ.get("GRID_DEADLINE", 1e9))
        versions = os.environ.get("GRID_VERSIONS", "base attention pretrain both").split()
        fams = sys.argv[2:] or ["lines-loops", "counting", "each-once", "sight-near", "regions-size", "order"]
        flags = {"base": set(), "attention": {"--attention"}, "pretrain": {"--pretrain"}, "both": {"--attention", "--pretrain"}}
        big = {g for g, v in by.items() if len(v) >= MIN_TYPE}
        indist, held, times = {}, {}, {}
        def summary():
            mean = lambda xs: f"{np.mean(xs):.0%}" if xs else "–"
            lines = ["| Version | In-distribution (mean of types) | Random | " + " | ".join(f"{f} zero-shot | {f} few-shot | {f} random" for f in fams) + " |",
                     "|---" * (3 + 3 * len(fams)) + "|"]
            for v in versions:
                row = [v, mean([indist[v][g][1] for g in indist.get(v, {}) if g in big]), mean([indist[v][g][2] for g in indist.get(v, {}) if g in big])]
                for f in fams:
                    r = held.get((v, f), {}); ts = [g for g in r if g in big]
                    row += [mean([r[g][0] for g in ts]), mean([r[g][1] for g in ts]), mean([r[g][2] for g in ts])]
                lines.append("| " + " | ".join(row) + " |")
            lines += ["", "Per type, left out with its family (trained with it / zero-shot / few-shot / random):", "",
                      "| Family | Type | " + " | ".join(versions) + " |", "|---" * (2 + len(versions)) + "|"]
            for f in fams:
                for g in FAMILIES[f]:
                    if g not in by: continue
                    cell = lambda v: (f"{indist[v][g][1]:.0%} / " if g in indist.get(v, {}) else "– / ") + (" / ".join(f"{x:.0%}" for x in held[(v, f)][g]) if g in held.get((v, f), {}) else "–")
                    lines.append(f"| {f} | {g}{'' if g in big else ' (few puzzles)'} | " + " | ".join(cell(v) for v in versions) + " |")
            lines += ["", "In distribution, per type (top guess is a move; random):", "", "| Type | Test states | " + " | ".join(versions) + " | Random |", "|---" * (3 + len(versions)) + "|"]
            for g in sorted(by):
                have = [indist[v][g] for v in versions if g in indist.get(v, {})]
                if have: lines.append(f"| {g} | {have[0][0]} | " + " | ".join(f"{indist[v][g][1]:.0%}" if g in indist.get(v, {}) else "–" for v in versions) + f" | {have[0][2]:.0%} |")
            lines += ["", "Minutes per run: " + ", ".join(f"{k} {t / 60:.1f}" for k, t in times.items())]
            open(os.path.join(out_dir, "summary.md"), "w").write("\n".join(lines) + "\n")
        def reset(v):
            FLAGS.clear(); FLAGS.update(flags[v]); random.seed(1); np.random.seed(1); torch.manual_seed(1)
        failed = set()   # a version that fails (out of memory, say) is skipped from then on
        def attempt(v, fn):
            try: return fn()
            except Exception:
                import traceback; traceback.print_exc(); failed.add(v); torch.cuda.empty_cache() if dev.type == "cuda" else None
        for v in versions:
            if time.time() > deadline: break
            reset(v); t0 = time.time(); print(f"\n## {v}: every type", flush=True)
            r = attempt(v, lambda: run_all(split))
            if r is None: continue
            net, indist[v] = r; times[f"{v} all"] = time.time() - t0
            torch.save(net.state_dict(), os.path.join(out_dir, f"graph-policy-{v}.pt"))
            with open(os.path.join(out_dir, "indist.txt"), "a") as fh:
                for g, (n, h, b) in indist[v].items(): fh.write(f"| {v} | {g} | {n} | {h:.0%} | {b:.0%} |\n")
            summary()
        for f in fams:
            for v in versions:
                if time.time() > deadline or v in failed: continue
                reset(v); t0 = time.time(); print(f"\n## {v}: without {f}", flush=True)
                r = attempt(v, lambda: run_without(split, FAMILIES[f]))
                if r is None: continue
                held[(v, f)] = r; times[f"{v} −{f}"] = time.time() - t0
                with open(os.path.join(out_dir, "family.txt"), "a") as fh:
                    for g, (z, fw, b) in held[(v, f)].items(): fh.write(f"| {v} | {f} | {g} | {z:.0%} | {fw:.0%} | {b:.0%} |\n")
                summary()
        summary(); print(open(os.path.join(out_dir, "summary.md")).read())
    elif mode == "embed":
        net = load_net(weights()); net.eval()
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
        # nearest neighbours by cosine, a block of rows at a time (the whole table of every move
        # against every move would be N² numbers: about 150 GB for the full corpus)
        U = torch.tensor(V / np.linalg.norm(V, axis=1, keepdims=True), dtype=torch.float32, device=dev)
        gcode = torch.tensor(np.unique(genres, return_inverse=True)[1], device=dev)
        nn5, nn_other = np.zeros((len(V), 5), dtype=np.int64), np.zeros(len(V), dtype=np.int64)
        for a0 in range(0, len(V), 2048):
            S = U[a0:a0 + 2048] @ U.T
            S[torch.arange(len(S)), torch.arange(a0, a0 + len(S))] = -2
            nn5[a0:a0 + len(S)] = S.topk(5, 1).indices.cpu().numpy()
            S[gcode[a0:a0 + len(S), None] == gcode[None, :]] = -3   # the nearest from another type
            nn_other[a0:a0 + len(S)] = S.argmax(1).cpu().numpy()
        del U
        same = (sigs[nn5] == sigs[:, None]).mean()
        freq = defaultdict(int)
        for s_ in sigs: freq[s_] += 1
        chance = sum((v / len(sigs)) ** 2 for v in freq.values())
        # across types: each move's nearest neighbour from another type
        cross, n_cross = 0, 0
        single = len(set(genres)) == 1
        for i in range(len(V)):
            if single or freq[sigs[i]] < 3: continue
            cross += sigs[nn_other[i]] == sigs[i]; n_cross += 1
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
