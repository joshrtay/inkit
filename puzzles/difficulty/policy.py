# A fast move-predicting network for the deduction solver (data from policy-data.ts, kept in
# references/ml, local only; PyTorch in references/ml/.venv). From a puzzle state it predicts, for every undecided mark,
# whether the solver settles it this round (its cheapest moves). Tested on held-out puzzles:
# is the top-scored mark one of the round's moves (top-1), is it at least true, and how long
# does a prediction take.
#
# Each layer looks at a cell's 3 × 3 neighbourhood, then pools over every unit the cell is in (row,
# column, box or area) and hands the pool back: Sudoku's and Star Battle's constraints are about
# whole units, and plain convolutions alone reached about half the accuracy.
#
# First results (October 2026), top-scored mark is settled within the next 3 rounds, about 2 ms a
# prediction on the CPU: Sudoku 9 × 9, 72% of held-out states (random 17%), 66% on Puzzle Square
# JP's rated ones; Star Battle, 91% on held-out generated 1-star puzzles but 38% on rated 2-star
# ones (the generator makes only 1-star). At stuck states (tier 2 and up) it's much weaker.
#
#   references/ml/.venv/bin/python puzzles/difficulty/policy.py <sudoku|star-battle> [epochs] [rounds ahead] [stuck weight]
import json, sys, time, glob, random
import numpy as np
import torch, torch.nn as nn

genre = sys.argv[1]
epochs = int(sys.argv[2]) if len(sys.argv) > 2 else 8
# a state's moves: the facts settled in its round and the next AHEAD-1 (the solver takes only the
# cheapest each round, so an easy fact left for later still counts)
AHEAD = int(sys.argv[3]) if len(sys.argv) > 3 else 1
# stuck states (tier 1 and up) are rare in generated puzzles: repeat them this many times in training
HARD = int(sys.argv[4]) if len(sys.argv) > 4 else 1
here = __file__.rsplit("/", 1)[0] + "/../../references/ml"
S = 9 if genre == "sudoku" else 10

def parse(fact):
    mark, v = fact.rsplit("=", 1)
    name, args = mark[:-1].split("(")
    return name, [int(a) for a in args.split(",")], v == "true"

# ---- states and features ----
def sudoku_states(d):
    g = d["spec"]
    given = np.zeros((9, 9, 9), np.float32)
    for x in g["givens"]:
        if x["kind"] == "number": given[x["value"] - 1, x["cell"][0], x["cell"][1]] = 1
    know = np.full((9, 9, 9), -1, np.int8)   # digit d at (r, c): -1 open, 0 no, 1 yes
    def apply(facts):
        for f in facts:
            name, a, v = parse(f)
            if name == "digit": know[a[1] - 1, a[0] // 9, a[0] % 9] = 1 if v else 0
    apply(d["initial"])
    out = []
    for ri, rd in enumerate(d["rounds"]):
        k = know.copy()
        y = np.zeros((18, 9, 9), np.float32)
        for later in d["rounds"][ri:ri + AHEAD]:
            for f in later["facts"]:
                name, a, v = parse(f)
                if name == "digit": y[(a[1] - 1) + (0 if v else 9), a[0] // 9, a[0] % 9] = 1
        out.append((k, given, y, rd["tier"]))
        apply(rd["facts"])
    final = know.copy()
    return [(k, gv, y, t, final) for (k, gv, y, t) in out]

def sudoku_x(k, given):
    open_ = (k == -1).astype(np.float32)
    x = [given, (k == 1).astype(np.float32), (k == 0).astype(np.float32), open_.sum(0, keepdims=True) / 9]
    # per digit, open places left in the cell's row, column and box
    row = np.repeat(open_.sum(2, keepdims=True), 9, 2) / 9
    col = np.repeat(open_.sum(1, keepdims=True), 9, 1) / 9
    box = open_.reshape(9, 3, 3, 3, 3).sum((2, 4), keepdims=True)
    box = np.broadcast_to(box, (9, 3, 3, 3, 3)).reshape(9, 9, 9) / 9
    x += [row, col, box]
    return np.concatenate(x, 0), np.concatenate([open_, open_], 0)

def sb_states(d):
    g = d["spec"]; n = g["size"][0]
    areas = g["areas"]; stars = next((r.get("n", 1) for r in g.get("rules", []) if r["rule"] == "shaded-per-line"), 1)
    know = np.full((n, n), -1, np.int8)
    def apply(facts):
        for f in facts:
            name, a, v = parse(f)
            if name == "shaded": know[a[0] // n, a[0] % n] = 1 if v else 0
    apply(d["initial"])
    out = []
    for ri, rd in enumerate(d["rounds"]):
        k = know.copy()
        y = np.zeros((2, S, S), np.float32)
        for later in d["rounds"][ri:ri + AHEAD]:
            for f in later["facts"]:
                name, a, v = parse(f)
                if name == "shaded": y[0 if v else 1, a[0] // n, a[0] % n] = 1
        out.append((k, y, rd["tier"]))
        apply(rd["facts"])
    final = know.copy()
    return [(k, (areas, stars), y, t, final) for (k, y, t) in out]

def sb_x(k, info):
    areas, stars = info
    n = k.shape[0]
    ch = np.zeros((14, S, S), np.float32)
    ch[0, :n, :n] = 1
    ch[1, :n, :n] = k == 1
    ch[2, :n, :n] = k == 0
    a = np.array([[ord(c) for c in row] for row in areas])
    ch[3, :n, :n - 1] = a[:, :-1] != a[:, 1:]; ch[3, :n, n - 1] = 1
    ch[4, :n - 1, :n] = a[:-1, :] != a[1:, :]; ch[4, n - 1, :n] = 1
    ch[5, :n, 1:n] = a[:, 1:] != a[:, :-1]; ch[5, :n, 0] = 1
    ch[6, 1:n, :n] = a[1:, :] != a[:-1, :]; ch[6, 0, :n] = 1
    ch[7, :n, :n] = stars == 2
    star, open_ = (k == 1), (k == -1)
    ch[8, :n, :n] = ((stars - star.sum(1)) / stars)[:, None]
    ch[9, :n, :n] = ((stars - star.sum(0)) / stars)[None, :]
    ch[11, :n, :n] = (open_.sum(1) / n)[:, None]
    ch[12, :n, :n] = (open_.sum(0) / n)[None, :]
    for v in np.unique(a):
        m = a == v
        ch[10, :n, :n][m] = (stars - star[m].sum()) / stars
        ch[13, :n, :n][m] = open_[m].sum() / max(1, m.sum())
    mask = np.zeros((2, S, S), np.float32); mask[:, :n, :n] = open_
    return ch, mask

states_of, x_of = (sudoku_states, sudoku_x) if genre == "sudoku" else (sb_states, sb_x)

def load(files):
    out = []
    for f in files:
        for line in open(f):
            d = json.loads(line)
            if genre == "sudoku" and d["spec"]["size"] != [9, 9]: continue
            if d["spec"]["size"][0] > S: continue
            out.append([(d.get("seed", d.get("name")), *s) for s in states_of(d)])
    return out

puzzles = load(sorted(glob.glob(f"{here}/data-{genre}-*.jsonl")))
random.Random(1).shuffle(puzzles)
cut = int(0.85 * len(puzzles))
train = [s for p in puzzles[:cut] for s in p]; test = [s for p in puzzles[cut:] for s in p]
train += [s for s in train if s[4] >= 1] * (HARD - 1)
hard = [s for p in load(sorted(glob.glob(f"{here}/test-{genre}.jsonl"))) for s in p]
print(f"{genre}: {len(puzzles)} puzzles, {len(train)} training states, {len(test)} test states, {len(hard)} rated-puzzle states")

K = 27 if genre == "sudoku" else 36   # units per state: rows, columns, and boxes or areas
def units_of(info, n):
    """Membership of each cell (padded to S × S) in each unit: rows, columns, boxes or areas."""
    U = np.zeros((K, S * S), np.float32)
    for r in range(n):
        for c in range(n):
            i = r * S + c
            U[r, i] = 1; U[S + c, i] = 1
            if genre == "sudoku": U[18 + (r // 3) * 3 + c // 3, i] = 1
            else: U[2 * S + (ord(info[0][r][c]) - 97) % (K - 2 * S), i] = 1
    return U
def tensors(states):
    xs, ms, ys, us = [], [], [], []
    for (_, k, info, y, t, final) in states:
        x, m = x_of(k, info); xs.append(x); ms.append(m); ys.append(y); us.append(units_of(info, k.shape[-1]))
    return torch.tensor(np.stack(xs)), torch.tensor(np.stack(ms)), torch.tensor(np.stack(ys)), torch.tensor(np.stack(us))

class Block(nn.Module):
    """A local 3 × 3 look, then each cell hears the mean and max over every unit it's in."""
    def __init__(self, c):
        super().__init__(); self.a = nn.Conv2d(c, c, 3, padding=1); self.n1 = nn.BatchNorm2d(c)
        self.mix = nn.Conv2d(3 * c, c, 1); self.n2 = nn.BatchNorm2d(c)
    def forward(self, x, U):
        B, C, H, W = x.shape
        h = torch.relu(self.n1(self.a(x)))
        f = h.flatten(2)                                     # B, C, cells
        cnt = U.sum(2).clamp(min=1)                          # B, K
        mean = torch.einsum("bci,bki->bck", f, U) / cnt[:, None, :]
        back_mean = torch.einsum("bck,bki->bci", mean, U) / U.sum(1).clamp(min=1)[:, None, :]
        mx = (f[:, :, None, :] * U[:, None] - 1e4 * (1 - U[:, None])).amax(3)   # B, C, K
        back_max = (mx[:, :, :, None] * U[:, None] - 1e4 * (1 - U[:, None])).amax(2)
        back_max = torch.where(back_max < -1e3, torch.zeros_like(back_max), back_max)
        z = torch.cat([f, back_mean, back_max], 1).view(B, 3 * C, H, W)
        return torch.relu(x + self.n2(self.mix(z)))
class Net(nn.Module):
    def __init__(self, cin, cout, c=64, blocks=6):
        super().__init__(); self.inp = nn.Sequential(nn.Conv2d(cin, c, 3, padding=1), nn.ReLU()); self.body = nn.ModuleList([Block(c) for _ in range(blocks)]); self.out = nn.Conv2d(c, cout, 1)
    def forward(self, x, U):
        h = self.inp(x)
        for b in self.body: h = b(h, U)
        return self.out(h)

dev = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
Xtr, Mtr, Ytr, Utr = tensors(train)
net = Net(Xtr.shape[1], Ytr.shape[1]).to(dev)
opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
pos = (Ytr * Mtr).sum() / Mtr.sum()
lossf = nn.BCEWithLogitsLoss(reduction="none", pos_weight=torch.tensor((1 - pos) / pos).clamp(max=50).to(dev))
t0 = time.time()
for ep in range(epochs):
    net.train(); perm = torch.randperm(len(Xtr)); tot = 0
    for i in range(0, len(perm), 128):
        b = perm[i:i + 128]
        x, m, y, u = Xtr[b].to(dev), Mtr[b].to(dev), Ytr[b].to(dev), Utr[b].to(dev)
        loss = (lossf(net(x, u), y) * m).sum() / m.sum()
        opt.zero_grad(); loss.backward(); opt.step(); tot += loss.item() * len(b)
    print(f"epoch {ep + 1}: loss {tot / len(perm):.4f} ({time.time() - t0:.0f} s)")

def evaluate(states, label):
    if not states: return
    net.eval(); X, M, Y, U = tensors(states)
    with torch.no_grad(): logits = torch.cat([net(X[i:i + 256].to(dev), U[i:i + 256].to(dev)).cpu() for i in range(0, len(X), 256)])
    logits[M == 0] = -1e9
    flat = logits.flatten(1); top = flat.argmax(1)
    hit = Y.flatten(1)[torch.arange(len(top)), top] == 1
    base = ((Y * M).flatten(1).sum(1) / M.flatten(1).sum(1).clamp(min=1)).mean()
    # is the top mark at least true (the answer agrees), though maybe not this round's move?
    true = []
    for i, (_, k, info, y, t, final) in enumerate(states):
        ch = top[i].item() // (S * S); cell = top[i].item() % (S * S); r, c = cell // S, cell % S
        if genre == "sudoku": d, want = ch % 9, ch < 9; true.append(final[d, r, c] == (1 if want else 0))
        else: true.append(final[r, c] == (1 if ch == 0 else 0))
    true = np.array(true); tiers = np.array([s[4] for s in states])
    print(f"{label} (moves = next {AHEAD} rounds): top-1 is a move {hit.float().mean():.0%} (random {base:.0%}), true {true.mean():.0%}"
          + "".join(f"; tier {t}: {hit[tiers == t].float().mean():.0%} move, {true[tiers == t].mean():.0%} true (n={int((tiers == t).sum())})" for t in sorted(set(tiers.tolist()))))

evaluate(test, "held-out generated")
evaluate(hard, "rated puzzles")
# speed: one state at a time on the CPU, as the solver would ask
cpu = Net(Xtr.shape[1], Ytr.shape[1]); cpu.load_state_dict({k: v.cpu() for k, v in net.state_dict().items()}); cpu.eval()
x, u = Xtr[:1], Utr[:1]
with torch.no_grad():
    for _ in range(5): cpu(x, u)
    t1 = time.time()
    for _ in range(50): cpu(x, u)
print(f"one prediction on the CPU: {(time.time() - t1) / 50 * 1000:.1f} ms")
torch.save(net.state_dict(), f"{here}/policy-{genre}.pt")
