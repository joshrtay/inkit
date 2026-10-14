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
#   `all` also reports (report()): the key move (the top guess is the round's costliest step); the
#   human test set (graph-human.ts → graphs-human.jsonl: Janko's and Puzzle Square JP's puzzles,
#   never trained on), per type; agreement with people on Janko's states (the top guess among the
#   person's next 3 moves, beside our solver's next step and random), per type and per person;
#   held-out generated puzzles by band; and each set by family. GRAPH_SEEDS=n: n seeds, mean and
#   spread. Generated puzzles (gen-set.ts) with GRAPH_GEN_SHARE, GRAPH_GEN_TEST and
#   GRAPH_STATES_PER (load())
#
#   GRAPH_HUMAN_TRAIN=path: human-made puzzles to train on too (graph-human.ts --train →
#   graphs-human-train.jsonl: Janko's and Puzzle Square JP's, the test set's left out), their loss
#   weighted GRAPH_HUMAN_WEIGHT times a corpus or generated state's (train()).
#   GRAPH_HUMAN_LABELS=path ("1": references/ml/graphs-human-labels.jsonl): Janko's puzzles labelled by
#   the person, not our solver (graph-human-labels.ts; labels "human": states from the person's
#   progression, targets their next 3 moves), so puzzles our solver can't finish count too. The
#   "train" side trains (weighted GRAPH_HUMAN_LABELS_WEIGHT); the "test" side is held out by puzzle
#   (its other copies leave training) and reports agreement with people on puzzles our solver
#   finished and on the rest (report_labels()). GRAPH_TRAIN_DEADLINE
#   (seconds): no training epoch starts that wouldn't end by then
#
#   --attention  global self-attention over all of a puzzle's nodes after every other round of
#                message passing (a GPS-style hybrid)
#   --pretrain   hide and fill first: solved puzzles with 15-50% of their marks hidden, the network
#                fills them in from the rest; then move prediction as usual
import hashlib, json, os, random, re, sys, time
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
# GRAPH_STRUCTURE=1: what a person sees at a glance (structure.py: known groups, their size and ways
# out, a number's room and reach, line pieces and their ends), computed from each state, as extra
# inputs for cells and marks
STRUCT = os.environ.get("GRAPH_STRUCTURE") == "1"
if STRUCT: import structure
NSC, NSM = (structure.CELL, structure.MARK) if STRUCT else (0, 0)
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
    def __init__(self, d, keep_moves=False):
        self.genre, self.source, self.name = d["genre"], d["source"], d["name"]
        st = d["structure"]
        self.nc = st["cells"]
        # mark names are kept only while reading (133,000 puzzles' worth of strings would fill memory)
        marks = [m["name"] for m in st["marks"]]
        mindex = {m: i for i, m in enumerate(marks)}
        M = self.M = len(marks)
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
        self.layout = structure.Layout(d) if STRUCT else None
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
        # edges as 32-bit (made 64-bit per batch): the generated set is 133,000 puzzles
        self.me = torch.tensor(me, dtype=torch.int32).reshape(-1, 2)
        self.ge = torch.tensor(ge, dtype=torch.int32).reshape(-1, 2)
        answer = set(d["answer"])
        self.truth = np.array([m in answer for m in marks])   # the solution's true marks
        self.band, self.solver = d.get("band"), d.get("solver")
        # States aren't stored: each mark's round (-1 known at the start, R never settled) and value
        # (1 true, 2 false) give every state and its targets (state k: known if settled before
        # round k; a target if settled in rounds k … k + NEXT - 1), so memory grows with marks, not
        # marks × rounds. The first round that settles a mark counts.
        rounds = d["rounds"]; R = self.R = len(rounds)
        rnd, val = np.full(M, R, np.int32), np.zeros(M, np.int8)
        for f in d["initial"]:
            name, v = f.rsplit("=", 1) if isinstance(f, str) else (f[0], "true" if f[1] else "false")
            i = mindex.get(name)
            if i is not None and rnd[i] == R: rnd[i], val[i] = -1, 1 if v == "true" else 2
        # per round, as codes (mark × 2 + 0 true / 1 false): the key facts (the costliest step's)
        # and the first step's facts (a step's facts sit together, with one signature and cost)
        key, first, koff, foff = [], [], [0], [0]
        self.moves = [] if keep_moves else None
        for ri, rd in enumerate(rounds):
            fs = [(mindex[name], v, "cell-only" if sig == "(none)" else sig, cost) for (name, v, sig, cost) in rd["facts"] if name in mindex]
            for (i, v, _, _) in fs:
                if rnd[i] == R: rnd[i], val[i] = ri, 1 if v else 2
            top = max((c for (_, _, _, c) in fs), default=None)
            key += [2 * i + (0 if v else 1) for (i, v, _, c) in fs if c == top]
            if fs:
                s0, c0 = fs[0][2], fs[0][3]
                for (i, v, sg, c) in fs:
                    if (sg, c) != (s0, c0): break
                    first.append(2 * i + (0 if v else 1))
            koff.append(len(key)); foff.append(len(first))
            if keep_moves: self.moves.append(fs)
        self.rnd, self.val = rnd, val
        self.key_codes, self.key_off = np.array(key, np.int32), np.array(koff, np.int32)
        self.first_codes, self.first_off = np.array(first, np.int32), np.array(foff, np.int32)
        # Janko's records: the person's order (marks they settled, earliest first) as codes
        ho = [(mindex[m], k) for (m, k) in d.get("humanOrder") or [] if m in mindex]
        self.human = np.array([2 * i + (0 if self.truth[i] else 1) for (i, _) in ho], np.int32) if d.get("humanOrder") is not None else None
        # labels "human" (graph-human-labels.ts): the rounds are the person's moves, and a state's
        # targets are the person's next NEXT label marks still open, not what the next rounds settle
        self.human_labels = d.get("labels") == "human"
        self.split, self.finished = d.get("split"), None   # its side (train / test); our solver finished it (set at load)
        self.keep, self.dup = None, False   # the states kept (GRAPH_STATES_PER), or all; in the human test set
        self.weight, self.human_train = 1.0, False   # loss weight (GRAPH_HUMAN_WEIGHT); from GRAPH_HUMAN_TRAIN
        self.states = States(self)

    def state(self, k):
        """State k (0 open, 1 true, 2 false) and its targets (settled in the next NEXT rounds; with
        human labels, the person's next NEXT label marks)."""
        s = np.where(self.rnd < k, self.val, 0).astype(np.int8)
        y = np.zeros((len(s), 2), np.float32)
        if self.human_labels:
            nxt = self.human[s[self.human // 2] == 0][:NEXT]
            y[nxt // 2, nxt % 2] = 1
            return s, y
        sel = (self.rnd >= k) & (self.rnd < k + NEXT)
        y[np.nonzero(sel)[0], self.val[sel] - 1] = 1
        return s, y
    def key(self, k): return self.key_codes[self.key_off[k]:self.key_off[k + 1]]
    def first(self, k): return self.first_codes[self.first_off[k]:self.first_off[k + 1]]
    def people(self, s):
        """The person's next 3 moves from state s: of the marks they settled, the first 3 still open."""
        if self.human is None: return None
        return self.human[s[self.human // 2] == 0][:3]

class States:
    """A puzzle's states as a sequence of (state, targets, moves); moves only with keep_moves."""
    def __init__(self, p): self.p = p
    def __len__(self): return self.p.R
    def __getitem__(self, k):
        if not -self.p.R <= k < self.p.R: raise IndexError(k)
        k %= self.p.R
        return self.p.state(k) + (self.p.moves[k] if self.p.moves is not None else [],)
    def __iter__(self): return (self[k] for k in range(len(self)))

def batch(items, attention=False):
    """Several (puzzle, state index) as one graph."""
    return batch_states([(pz,) + pz.state(k) for (pz, k) in items], attention)

def batch_states(items, attention=False):
    """Several (puzzle, state array, targets) as one graph; with attention, also its groups."""
    mfs, cfs, gfs, mes, ges, ys, masks, offs, sms, scs = [], [], [], [], [], [], [], [], [], []
    om = oc = og = 0
    for (pz, s, y) in items:
        state = np.zeros((len(s), 3), np.float32); state[np.arange(len(s)), s] = 1
        if STRUCT: xc, xm = pz.layout.features(s); scs.append(torch.from_numpy(xc).float()); sms.append(torch.from_numpy(xm).float())
        mfs.append(torch.cat([pz.mf, torch.tensor(state)], 1)); cfs.append(pz.cf); gfs.append(pz.gf)
        mes.append(pz.me.long() + torch.tensor([om, oc])); ges.append(pz.ge.long() + torch.tensor([og, oc]))
        ys.append(torch.tensor(y)); masks.append(torch.tensor((s == 0).astype(np.float32)))
        offs.append((om, len(s)))
        om += len(s); oc += pz.nc; og += len(pz.gf)
    mf, cf = torch.cat(mfs), torch.cat(cfs)
    if STRUCT: mf, cf = torch.cat([mf, torch.cat(sms)], 1), torch.cat([cf, torch.cat(scs)], 1)
    groups = attention_groups(items, om, oc) if attention else None
    return (mf, cf, torch.cat(gfs), torch.cat(mes), torch.cat(ges), oc, groups), torch.cat(ys), torch.cat(masks), offs

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
        self.em, self.ec, self.eg = nn.Linear(len(MARKS) + 1 + 3 + NSM, h), nn.Linear(len(GIVENS) + 1 + NPOS + NSC, h), nn.Linear(len(PRIMS) + len(UNITS) + 2, h)
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
        m = it[0].M
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
            truth = p.truth
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

TRAIN_DEADLINE = float(os.environ.get("GRAPH_TRAIN_DEADLINE") or 0)

def loss_of(net, part):
    """A batch's loss: each open mark's, the rarer settled ones weighted up, and each state's weighted
    by its puzzle's weight (GRAPH_HUMAN_WEIGHT for the human training set, else 1), over the batch's
    weighted open marks (so a batch's loss keeps its scale)."""
    g, y, mask, offs = batch(part, attends(net)); g, y, mask = to(g), y.to(dev), mask.to(dev)
    pos = (y.max(1).values * mask).sum() / mask.sum().clamp(min=1)
    w = 1 + y * ((1 - pos) / pos.clamp(min=1e-3)).clamp(max=30)
    if any(pz.weight != 1 for pz, _ in part):
        mask = mask * torch.cat([torch.full((k,), float(pz.weight)) for (pz, _), (_, k) in zip(part, offs)]).to(dev)
    return (nn.functional.binary_cross_entropy_with_logits(net(g), y, weight=w, reduction="none").sum(1) * mask).sum() / mask.sum().clamp(min=1)

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
            loss = loss_of(net, part)
            opt.zero_grad(); loss.backward()
            if LR_SCALE: nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step(); tot += loss.item(); n += 1
            # Apple's GPU caches memory per tensor shape, and graph batches vary: release it
            if dev.type == "mps" and n % 10 == 0: torch.mps.empty_cache()
        print(f"  epoch {ep + 1}: loss {tot / max(1, n):.3f} ({time.time() - t0:.0f} s)", flush=True)
        if TRAIN_DEADLINE and ep + 1 < epochs and (time.time() - t0) * (ep + 2) / (ep + 1) > TRAIN_DEADLINE:
            print(f"  stopping after {ep + 1} of {epochs} epochs: another wouldn't end within GRAPH_TRAIN_DEADLINE ({TRAIN_DEADLINE:.0f} s)", flush=True)
            break
    return net

def score(net, items):
    """Each state's results, (puzzle, state, row); row: the top guess is a move within the next NEXT
    rounds, and random's chance of one; the top guess is the round's key fact (the costliest step's),
    and random's chance; and on Janko's puzzles (else None): the top guess is among the person's
    next 3 moves, random's chance, and whether our solver's next step (any of its facts) or its first
    fact is. A state with nothing open counts as a miss, as it always has."""
    net.eval(); out = []
    with torch.no_grad():
        for part in chunks(items):
            g, y, mask, offs = batch(part, attends(net)); logits = net(to(g)).cpu()
            for (pz, k), (o, n) in zip(part, offs):
                lg, yy, mm = logits[o:o + n], y[o:o + n], mask[o:o + n]
                if mm.sum() == 0: out.append((pz, k, (0, 0, 0, 0, None))); continue
                top = lg.masked_fill(mm[:, None] == 0, -1e9).flatten().argmax().item()
                n_open = 2 * mm.sum().item(); s = (mm.numpy() == 0).astype(np.int8)   # 0: open
                key = np.unique(pz.key(k)); key = key[s[key // 2] == 0]   # a mark can sit in several steps
                row = [yy.flatten()[top].item() > 0, ((yy * mm[:, None]).sum() / n_open).item(), bool(np.isin(top, key)), len(key) / n_open, None]
                nxt = pz.people(s)
                if nxt is not None and len(nxt) and pz.human_labels:
                    # no solver steps here (the rounds are the person's)
                    row[4] = (bool(np.isin(top, nxt)), len(nxt) / n_open, float("nan"), float("nan"))
                elif nxt is not None and len(nxt):
                    first = pz.first(k)
                    row[4] = (bool(np.isin(top, nxt)), len(nxt) / n_open, bool(np.isin(first, nxt).any()), bool(len(first) and np.isin(first[0], nxt)))
                out.append((pz, k, tuple(row)))
    return out

def evaluate(net, items):
    """Share of states whose top-scored open mark (either way) is a move within the next rounds; random's share."""
    rows = score(net, items)
    return sum(r[0] for _, _, r in rows) / max(1, len(items)), sum(r[1] for _, _, r in rows) / max(1, len(items))

# ---- the data ----
# GRAPH_DATA's generated puzzles (gen-set.ts, source "gen-set"): a fixed slice of GRAPH_GEN_TEST
# held out for testing, and GRAPH_GEN_SHARE of the rest for training, both chosen by a hash of the
# puzzle's name, so the slices are the same in every run and 10% ⊂ 25% ⊂ 50% ⊂ 100%. At most
# GRAPH_STATES_PER of each generated puzzle's states, spread through its solve (0: all). The human
# test set (GRAPH_HUMAN, graph-human.ts) is never trained on: corpus copies of its puzzles stay in
# the per-type split (so the earlier test sets don't change) but leave training. The human training
# set (GRAPH_HUMAN_TRAIN) trains only: a copy of a test puzzle is left out (graph-human.ts leaves
# them out already; this checks), and so is a copy of a corpus puzzle (the corpus's copy may be in
# the per-type test split).
GEN_SOURCES = {"gen-set"}
GEN_SHARE = float(os.environ.get("GRAPH_GEN_SHARE", 1))
GEN_TEST = float(os.environ.get("GRAPH_GEN_TEST", 0.01))
STATES_PER = int(os.environ.get("GRAPH_STATES_PER", 0))
HUMAN = os.environ.get("GRAPH_HUMAN") or os.path.join(HERE, "../../references/ml/graphs-human.jsonl")
HUMAN_TRAIN = os.environ.get("GRAPH_HUMAN_TRAIN")
HUMAN_WEIGHT = float(os.environ.get("GRAPH_HUMAN_WEIGHT", 1))
# GRAPH_HUMAN_LABELS: records labelled by people (graph-human-labels.ts → graphs-human-labels.jsonl;
# "1" for that file): their "train" side trains (weight GRAPH_HUMAN_LABELS_WEIGHT), their "test" side
# measures agreement with people, on puzzles our solver finished and on those it didn't
HUMAN_LABELS = os.environ.get("GRAPH_HUMAN_LABELS")
if HUMAN_LABELS == "1": HUMAN_LABELS = os.path.join(HERE, "../../references/ml/graphs-human-labels.jsonl")
HUMAN_LABELS_WEIGHT = float(os.environ.get("GRAPH_HUMAN_LABELS_WEIGHT", 1))
KEEP_MOVES = sys.argv[1:2] == ["embed"]   # each round's moves with their signatures, for the embedding
MAX_MARKS = 4000   # a few puzzles have very many marks (a big board's every digit, link or border): left out

def draw(name):
    """A generated puzzle's fixed place in [0, 1), from its name without its band (gen-set.ts names
    a puzzle "<genre> <size> <band> #<seed>"; a re-banding mustn't move it between slices)."""
    name = re.sub(r" (easy|medium|hard|expert) #", " #", name)
    return int(hashlib.md5(("graph-gen:" + name).encode()).hexdigest()[:12], 16) / 16 ** 12

LEMMA_GROUPS = {"component", "parity", "premature"}
def content_key(d):
    """The same puzzle, whatever its source or name: type, givens, rule instances (the puzzle's
    own: not the groups our solver's lemmas add while solving, which a record built without solving
    lacks) and solution (the givens a record keeps are its cells': without the solution, every
    Spiral Galaxies, Easy as ABC or Nonogram of one size would be the same). graph-data.ts's
    contentKey is the same."""
    st = d["structure"]
    return hashlib.md5(json.dumps([d["genre"], st["cells"], d["givens"], sorted(g["cells"] for g in st["groups"] if g.get("kind") not in LEMMA_GROUPS), sorted(d.get("answer") or [])]).encode()).hexdigest()

def lines(path):
    """A file's lines one at a time (the generated set is 1.6 GB: never all in memory)."""
    with open(path) as fh:
        for line in fh:
            if line.strip(): yield line

def spread(ks, per):
    """At most `per` of ks, spread evenly."""
    ks = list(ks)
    return ks[:: max(1, len(ks) // per)][:per] if per and len(ks) > per else ks

NAME = re.compile(r'"name":("(?:[^"\\]|\\.)*")')
def load():
    """(corpus puzzles, generated for training, generated held out, human-made for training,
    {what the leakage guard left out of the human training set}, human-labelled for training,
    human-labelled held out), streamed a line at a time."""
    human = {content_key(json.loads(l)) for l in lines(HUMAN)} if os.path.exists(HUMAN) else set()
    if (HUMAN_TRAIN or HUMAN_LABELS) and not human: sys.exit(f"GRAPH_HUMAN_TRAIN and GRAPH_HUMAN_LABELS need the human test set ({HUMAN}) to keep its puzzles out of training")
    if HUMAN_TRAIN and not os.path.exists(HUMAN_TRAIN): sys.exit(f"GRAPH_HUMAN_TRAIN: no file {HUMAN_TRAIN} (graph-human.ts --train builds it)")
    if HUMAN_LABELS and not os.path.exists(HUMAN_LABELS): sys.exit(f"GRAPH_HUMAN_LABELS: no file {HUMAN_LABELS} (graph-human-labels.ts builds it)")
    # the human-labelled test side: its puzzles' other copies (corpus, solver-labelled) never train
    hl_test, hl_test_names = set(), set()
    for line in lines(HUMAN_LABELS) if HUMAN_LABELS else []:
        if '"split":"test"' not in line: continue
        d = json.loads(line); hl_test.add(content_key(d)); hl_test_names.add(d["name"])
    held = human | hl_test
    pz, gen_tr, gen_te, corpus = [], [], [], set()
    for f in DATA.split(","):
        for line in lines(f):
            m = re.search(r'"source":"([^"]*)"', line[:300])
            gen, dest = bool(m and m.group(1) in GEN_SOURCES), pz
            if gen:
                # lines left out aren't parsed
                nm = NAME.search(line[:300])
                u = draw(json.loads(nm.group(1)) if nm else json.loads(line)["name"])
                dest = gen_te if u < GEN_TEST else gen_tr if u < GEN_TEST + (1 - GEN_TEST) * GEN_SHARE else None
                if dest is None: continue
            d = json.loads(line); p = Puzzle(d, keep_moves=KEEP_MOVES)
            if not p.R or p.M > MAX_MARKS: continue
            key = content_key(d); p.dup = key in held
            if gen:
                if p.dup: continue
                if STATES_PER: p.keep = spread(range(p.R), STATES_PER)
            else: corpus.add(key)
            dest.append(p)
    hum_tr, out, seen = [], {"test": 0, "labels test": 0, "corpus": 0, "twice": 0}, set()
    solved = {}   # the solver-labelled human puzzles (our solver finished each): name → content key
    for line in lines(HUMAN) if HUMAN_LABELS and os.path.exists(HUMAN) else []:
        d = json.loads(line); solved[d["name"]] = content_key(d)
    for line in lines(HUMAN_TRAIN) if HUMAN_TRAIN else []:
        d = json.loads(line); key = content_key(d)
        if HUMAN_LABELS: solved[d["name"]] = key
        why = "test" if key in human else "labels test" if key in hl_test or d["name"] in hl_test_names else "corpus" if key in corpus else "twice" if key in seen else None
        if why: out[why] += 1; continue
        seen.add(key)
        p = Puzzle(d)
        if not p.R or p.M > MAX_MARKS: continue
        p.weight, p.human_train = HUMAN_WEIGHT, True
        hum_tr.append(p)
    # human-labelled: the train side (the human test set's puzzles and the corpus's left out, as
    # above; a puzzle also in the solver-labelled human training set stays: its labels differ), and
    # the test side
    hl_tr, hl_te, seen_l = [], [], set()
    out.update({"labels: test": 0, "labels: corpus": 0, "labels: twice": 0})
    solved_keys = set(solved.values())
    for line in lines(HUMAN_LABELS) if HUMAN_LABELS else []:
        d = json.loads(line); key = content_key(d)
        test_side = d.get("split") == "test"
        if not test_side:
            why = "test" if key in human else "corpus" if key in corpus else "twice" if key in seen_l else None
            if why: out["labels: " + why] += 1; continue
        seen_l.add(key)
        p = Puzzle(d)
        if not p.R or p.M > MAX_MARKS: continue
        # our solver finished it: a solver-labelled copy exists; else as the record says (False: a
        # cached run didn't finish; None: none cached)
        p.finished = True if (d["name"] in solved or key in solved_keys) else d.get("solverFinished")
        if test_side: hl_te.append(p)
        else:
            p.weight, p.human_train = HUMAN_LABELS_WEIGHT, True
            hl_tr.append(p)
    return pz, gen_tr, gen_te, hum_tr, out, hl_tr, hl_te

def source_of(p):
    if p.human_labels: return f"human labels: {p.source}"
    return f"human train: {p.source}" if p.human_train else "generated (gen-set)" if p.source in GEN_SOURCES else f"corpus: {p.source}"

def mix(train_pz):
    """The training mix by source: puzzles, states, and each source's share of training (states ×
    weight)."""
    rows = defaultdict(lambda: [0, 0, 0.0])
    for p in train_pz:
        n = len(p.keep) if p.keep is not None else p.R
        r = rows[source_of(p)]; r[0] += 1; r[1] += n; r[2] += n * p.weight
    tot = sum(r[2] for r in rows.values()) or 1
    print("\n### Training mix\n\n| Source | Puzzles | States | Weight | Share of training (states × weight) |\n|---|---|---|---|---|")
    for s_, (np_, ns, w) in sorted(rows.items()): print(f"| {s_} | {np_} | {ns} | {w / max(1, ns):g} | {w / tot:.0%} |")
    print(f"| all | {sum(r[0] for r in rows.values())} | {sum(r[1] for r in rows.values())} | | |\n", flush=True)

def load_human():
    out = []
    for l in lines(HUMAN):
        p = Puzzle(json.loads(l))
        if p.R and p.M <= MAX_MARKS: out.append(p)
    return out

def states(puzzles, per=None):
    """Every (puzzle, state) (those kept, for generated puzzles with GRAPH_STATES_PER), or at most
    `per` of each puzzle's states (spread through its solve)."""
    out = []
    for p in puzzles: out += [(p, k) for k in spread(p.keep if p.keep is not None else range(p.R), per)]
    return out

EPOCHS = int(os.environ.get("GRAPH_EPOCHS", 8))         # training on every type
HOLD_EPOCHS = int(os.environ.get("GRAPH_HOLD_EPOCHS", 4))  # training without a type or family
PRE_EPOCHS = int(os.environ.get("GRAPH_PRE_EPOCHS", 30))   # hide and fill, before either
MIN_TYPE = int(os.environ.get("GRAPH_MIN_TYPE", 20))   # types with fewer puzzles are left out of the means (and get no few-shot)

def load_net(path):
    net = new_net(); missing, extra = net.load_state_dict(torch.load(path, map_location=dev), strict=False)
    assert not extra and all(k.startswith("fill.") for k in missing), (missing, extra)
    return net

def run_all(split, rows=None):
    """Train on every type (after hide and fill, with --pretrain); test on each type's held-out
    puzzles. `rows`, a dict, gets each type's per-state results (score)."""
    train_pz = [p for tr, _ in split.values() for p in tr]
    net = pretrain(train_pz, PRE_EPOCHS) if "--pretrain" in FLAGS else None
    if net is None: net = new_net()
    print(f"network: {sum(x.numel() for x in net.parameters()):,} parameters, width {H}, {HEADS} heads, positions {'on' if POS else 'off'}, {EPOCHS} epochs, learning rate {2e-3 * 64 / H if LR_SCALE else 2e-3:.1e}{' scaled and warmed up' if LR_SCALE else ''}", flush=True)
    items = states(train_pz)
    print(f"training on {len(train_pz)} puzzles, {len(items)} states", flush=True)
    net = train(items, EPOCHS, net)
    out = {}
    for g, (_, te) in sorted(split.items()):
        if not te: continue
        r = score(net, states(te)); n = len(r)
        out[g] = (n, sum(x[2][0] for x in r) / max(1, n), sum(x[2][1] for x in r) / max(1, n))
        if rows is not None: rows[g] = r
    return net, out

def family_of(g): return next((f for f, ts in FAMILIES.items() if g in ts), "other")
MIN_HUMAN = int(os.environ.get("GRAPH_MIN_HUMAN", 10))   # human test types with fewer puzzles are left out of its means
BANDS = ["easy", "medium", "hard", "expert"]
BAND_SKIP = set(filter(None, os.environ.get("GRAPH_BAND_SKIP", "spiral-galaxies,fill-in").split(",")))

def report(net, rows, by, gen_te, human):
    """The measures beyond the per-type table: the key move, the human test set, agreement with
    people (Janko), held-out generated puzzles by band, and each set by family. Returns the
    headline numbers (means over types)."""
    nan = float("nan")
    mean = lambda xs: float(np.mean(xs)) if len(xs) else nan
    pct = lambda x: "–" if x != x else f"{x:.0%}"
    col = lambda rs, i: mean([r[i] for r in rs])
    def group(rs, f):
        out = defaultdict(list)
        for pz, k, r in rs: out[f(pz)].append(r)
        return out
    head = {}
    # in distribution: the key move, per type
    big = sorted(g for g in rows if len(by[g]) >= MIN_TYPE)
    print("\n### Key move (top guess is the round's costliest step), held-out puzzles\n\n| Type | Family | Test states | Top guess is a move | Key move | Random key |\n|---|---|---|---|---|---|")
    for g in sorted(rows):
        rs = [r for _, _, r in rows[g]]
        print(f"| {g} | {family_of(g)} | {len(rs)} | {pct(col(rs, 0))} | {pct(col(rs, 2))} | {pct(col(rs, 3))} |")
    head["in-distribution"] = mean([col([r for _, _, r in rows[g]], 0) for g in big])
    head["in-distribution key move"] = mean([col([r for _, _, r in rows[g]], 2) for g in big])
    print(f"\nkey move, mean over the {len(big)} types with at least {MIN_TYPE} puzzles: {pct(head['in-distribution key move'])} (random {pct(mean([col([r for _, _, r in rows[g]], 3) for g in big]))})")
    fam = {"in distribution": {g: [r for _, _, r in rows[g]] for g in big}}
    # the human test set: per type, then by source
    if human:
        hr = score(net, states(human))
        bt = group(hr, lambda p: p.genre)
        npz = defaultdict(lambda: defaultdict(int))
        for p in human: npz[p.genre][p.source] += 1
        hbig = sorted(g for g in bt if sum(npz[g].values()) >= MIN_HUMAN)
        print("\n### Human test set (graphs-human.jsonl, never trained on)\n\n| Type | Family | Puzzles (Janko / Puzzle Square JP) | States | Top guess is a move | Random | Key move | Random key |\n|---|---|---|---|---|---|---|---|")
        for g in sorted(bt):
            rs = bt[g]
            print(f"| {g} | {family_of(g)} | {npz[g]['janko']} / {npz[g]['psjp']} | {len(rs)} | {pct(col(rs, 0))} | {pct(col(rs, 1))} | {pct(col(rs, 2))} | {pct(col(rs, 3))} |")
        head["human"] = mean([col(bt[g], 0) for g in hbig]); head["human random"] = mean([col(bt[g], 1) for g in hbig])
        head["human key move"] = mean([col(bt[g], 2) for g in hbig])
        print(f"\nhuman test, mean over the {len(hbig)} types with at least {MIN_HUMAN} puzzles: {pct(head['human'])} (random {pct(head['human random'])}); key move {pct(head['human key move'])} (random {pct(mean([col(bt[g], 3) for g in hbig]))})")
        for src in ("janko", "psjp"):
            bs = group([x for x in hr if x[0].source == src], lambda p: p.genre)
            ts = [g for g in bs if npz[g][src] >= MIN_HUMAN]
            print(f"  {src}: {len(ts)} types, mean {pct(mean([col(bs[g], 0) for g in ts]))} (random {pct(mean([col(bs[g], 1) for g in ts]))})")
        fam["human"] = {g: bt[g] for g in hbig}
        # agreement with people: Janko's states where the person has a next move still open
        pr = [(pz, k, r) for pz, k, r in hr if r[4] is not None]
        if pr:
            print("\n### Agreement with people (Janko): the top guess among the person's next 3 moves\n\n| Type / person | Puzzles | States | Network | Solver's next step (any fact) | Solver's first fact | Random |\n|---|---|---|---|---|---|---|")
            def line(name, rs, n):
                ps = [r[4] for r in rs]
                print(f"| {name} | {n} | {len(ps)} | {pct(col(ps, 0))} | {pct(col(ps, 2))} | {pct(col(ps, 3))} | {pct(col(ps, 1))} |")
            bt_p = group(pr, lambda p: p.genre); bs_p = group(pr, lambda p: p.solver or "?")
            for g in sorted(bt_p): line(g, bt_p[g], len({id(p) for p, _, _ in pr if p.genre == g}))
            for s_ in sorted(bs_p, key=lambda s_: -len(bs_p[s_])): line(f"*{s_}*", bs_p[s_], len({id(p) for p, _, _ in pr if (p.solver or "?") == s_}))
            line("**all states**", [r for _, _, r in pr], len({id(p) for p, _, _ in pr}))
            tm = lambda i: mean([col([r[4] for r in bt_p[g]], i) for g in bt_p])
            head["people"], head["people solver step"], head["people solver fact"], head["people random"] = tm(0), tm(2), tm(3), tm(1)
            print(f"\nagreement with people, mean over {len(bt_p)} types: network {pct(head['people'])}, solver's next step {pct(head['people solver step'])}, its first fact {pct(head['people solver fact'])}, random {pct(head['people random'])}")
    # held-out generated puzzles, by band
    if gen_te:
        gr = score(net, states(gen_te))
        # bands as the records have them (read at load); types whose bands are being redone are left
        # out of this table (GRAPH_BAND_SKIP)
        bb = group([x for x in gr if x[0].genre not in BAND_SKIP], lambda p: p.band or "?")
        print(f"\n### Generated, held out ({len(gen_te)} puzzles, GRAPH_GEN_TEST {GEN_TEST:g}; by band without {', '.join(sorted(BAND_SKIP)) or 'none'})\n\n| Band | Puzzles | States | Top guess is a move | Random | Key move | Random key |\n|---|---|---|---|---|---|---|")
        for b in [b for b in BANDS if b in bb] + sorted(set(bb) - set(BANDS)):
            print(f"| {b} | {sum(1 for p in gen_te if (p.band or '?') == b and p.genre not in BAND_SKIP)} | {len(bb[b])} | {pct(col(bb[b], 0))} | {pct(col(bb[b], 1))} | {pct(col(bb[b], 2))} | {pct(col(bb[b], 3))} |")
        gt = group(gr, lambda p: p.genre)
        head["generated"] = mean([col(gt[g], 0) for g in gt]); head["generated key move"] = mean([col(gt[g], 2) for g in gt])
        print(f"\ngenerated held out, mean over {len(gt)} types: {pct(head['generated'])} (random {pct(mean([col(gt[g], 1) for g in gt]))}); key move {pct(head['generated key move'])}")
        fam["generated"] = dict(gt)
    # by family: the mean over each family's types, for each set
    sets = list(fam)
    print("\n### By family (mean over the family's types: top guess is a move / key move)\n\n| Family | " + " | ".join(sets) + " |\n|---" * 1 + "|---" * len(sets) + "|")
    for f in list(FAMILIES) + ["other"]:
        cells = []
        for s_ in sets:
            ts = [g for g in fam[s_] if family_of(g) == f]
            cells.append(f"{pct(mean([col(fam[s_][g], 0) for g in ts]))} / {pct(mean([col(fam[s_][g], 2) for g in ts]))} ({len(ts)})" if ts else "–")
        print(f"| {f} | " + " | ".join(cells) + " |")
    print("", flush=True)
    return head

def report_labels(net, hl_te):
    """Agreement with people on the human-labelled held-out puzzles (GRAPH_HUMAN_LABELS, split
    "test"): the top guess among the person's next 3 moves, per type, on the puzzles our solver
    finished and on those it didn't (or that no run reached). Returns the headline numbers."""
    nan = float("nan")
    mean = lambda xs: float(np.mean(xs)) if len(xs) else nan
    pct = lambda x: "–" if x != x else f"{x:.0%}"
    rs = [(pz, k, r) for pz, k, r in score(net, states(hl_te)) if r[4] is not None]
    by = defaultdict(list)
    for pz, k, r in rs: by[pz.genre].append((pz, r[4]))
    part = lambda xs, f: [r for pz, r in xs if f(pz)]
    fin, unf = (lambda pz: pz.finished is True), (lambda pz: pz.finished is not True)
    print("\n### Agreement with people, human-labelled held out (GRAPH_HUMAN_LABELS test side): the top guess among the person's next 3 moves\n\n"
          "| Type | Puzzles (solver finished / not or not run) | States | Network | Random | Network, solver finished | Network, not finished |\n|---|---|---|---|---|---|---|")
    head = {}
    for g in sorted(by):
        xs = by[g]; ps = {id(pz): pz for pz, _ in xs}
        a, b = part(xs, fin), part(xs, unf)
        print(f"| {g} | {len(ps)} ({sum(fin(p) for p in ps.values())} / {sum(unf(p) for p in ps.values())}) | {len(xs)} | {pct(mean([r[0] for _, r in xs]))} | {pct(mean([r[1] for _, r in xs]))} | {pct(mean([r[0] for r in a]))} | {pct(mean([r[0] for r in b]))} |")
    tm = lambda f: mean([m for m in (mean([r[0] for r in part(by[g], f)]) for g in by) if m == m])
    head["people (labels)"], head["people (labels) random"] = tm(lambda pz: True), mean([mean([r[1] for _, r in by[g]]) for g in by])
    head["people (labels), solver finished"], head["people (labels), not finished"] = tm(fin), tm(unf)
    print(f"\nagreement with people (human labels), mean over {len(by)} types: {pct(head['people (labels)'])} (random {pct(head['people (labels) random'])}); "
          f"on puzzles our solver finished {pct(head['people (labels), solver finished'])}, on the rest {pct(head['people (labels), not finished'])}", flush=True)
    return head

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
    t_load = time.time()
    pzs, gen_tr, gen_te, hum_tr, hum_out, hl_tr, hl_te = load()
    by = defaultdict(list)
    for p in pzs: by[p.genre].append(p)
    for v in by.values(): random.Random(2).shuffle(v)
    print(f"{len(pzs)} puzzles, {sum(len(p.states) for p in pzs)} states, {len(by)} types: " + ", ".join(f"{g} {len(v)}" for g, v in sorted(by.items())))
    split = {g: (v[:int(0.8 * len(v))], v[int(0.8 * len(v)):]) for g, v in by.items()}
    # the human test set's puzzles never train; generated puzzles add to training only
    dups = sum(p.dup for tr, _ in split.values() for p in tr)
    split = {g: ([p for p in tr if not p.dup], te) for g, (tr, te) in split.items()}
    for p in gen_tr: split.setdefault(p.genre, ([], []))[0].append(p)
    if gen_tr or gen_te: print(f"generated: {len(gen_tr)} puzzles to train on ({sum(len(p.keep or range(p.R)) for p in gen_tr)} states, GRAPH_GEN_SHARE {GEN_SHARE:g}, GRAPH_STATES_PER {STATES_PER or 'all'}), {len(gen_te)} held out")
    for p in hum_tr: split.setdefault(p.genre, ([], []))[0].append(p)
    if HUMAN_TRAIN: print(f"human training set ({HUMAN_TRAIN}): {len(hum_tr)} puzzles, {sum(p.R for p in hum_tr)} states, weight {HUMAN_WEIGHT:g}; left out: {hum_out['test']} copies of human test puzzles, {hum_out['corpus']} of corpus puzzles, {hum_out['twice']} repeats")
    for p in hl_tr: split.setdefault(p.genre, ([], []))[0].append(p)
    if HUMAN_LABELS: print(f"human-labelled ({HUMAN_LABELS}): {len(hl_tr)} puzzles to train on ({sum(p.R for p in hl_tr)} states, weight {HUMAN_LABELS_WEIGHT:g}), {len(hl_te)} held out ({sum(p.R for p in hl_te)} states); "
                           f"left out of its training side: {hum_out['labels: test']} copies of human test puzzles, {hum_out['labels: corpus']} of corpus puzzles, {hum_out['labels: twice']} repeats; "
                           f"{hum_out['labels test']} solver-labelled human training puzzles left out as copies of its test side")
    print(f"{dups} training puzzles left out as copies of human test puzzles; loaded in {time.time() - t_load:.0f} s", flush=True)
    mix([p for tr, _ in split.values() for p in tr])
    if mode == "all":
        # GRAPH_SEEDS=n: n runs from different starting weights and batch orders (same data and split)
        seeds = int(os.environ.get("GRAPH_SEEDS", 1))
        human = load_human() if os.path.exists(HUMAN) else []
        if human: print(f"human test set: {len(human)} puzzles, {sum(p.R for p in human)} states ({sum(p.source == 'janko' for p in human)} Janko)")
        heads = []
        for i in range(seeds):
            random.seed(1 + i); torch.manual_seed(1 + i)
            if seeds > 1: print(f"\n## Seed {1 + i}", flush=True)
            t0, rows = time.time(), {}
            net, out = run_all(split, rows)
            print("\n| Type | Test states | Top guess is a move | Random |\n|---|---|---|---|")
            for g, (n, h, b) in out.items(): print(f"| {g} | {n} | {h:.0%} | {b:.0%} |")
            big = [g for g in out if len(by[g]) >= MIN_TYPE]
            print(f"\nmean over the {len(big)} types with at least {MIN_TYPE} puzzles: {np.mean([out[g][1] for g in big]):.1%} (random {np.mean([out[g][2] for g in big]):.1%})")
            heads.append(report(net, rows, by, gen_te, human))
            if hl_te: heads[-1].update(report_labels(net, hl_te))
            print(f"run took {(time.time() - t0) / 60:.1f} min", flush=True)
            if i == 0: torch.save(net.state_dict(), weights())
        if seeds > 1:
            print(f"\n### Over {seeds} seeds (means over types)\n\n| Measure | Mean | Spread (sd) | Each seed |\n|---|---|---|---|")
            for k in heads[0]:
                xs = [h_.get(k, float("nan")) for h_ in heads]
                print(f"| {k} | {np.mean(xs):.1%} | {np.std(xs, ddof=1):.1%} | " + ", ".join(f"{x:.1%}" for x in xs) + " |")
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
