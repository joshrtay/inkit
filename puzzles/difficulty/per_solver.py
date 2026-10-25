# Agreement with people by person (research review 2026-10-24, idea 3). Janko's ~6,700 recorded
# solves are by seven experts, Rainer about a third, and every agreement figure so far pools them.
# On opus_human_tune.py's held-out side (6 states a puzzle, the person's own positions), for each
# solver and type: the tuned network's top guess among the person's next 3 moves, beside nearness
# (the open mark nearest the person's previous move, ties shared out) and random.
#
# Scored on where only (the mark, whatever its value), so nearness, which names no value, competes
# fairly; the network's full figure (mark and value) is beside it.
#
#   python per_solver.py <model.pt> [labels.jsonl]    (REFS as opus_human_tune.py)
import hashlib, json, os, sys
os.environ.update(GRAPH_H="256", GRAPH_HEADS="8", GRAPH_POS="1", GRAPH_STRUCTURE="1")
os.environ.setdefault("GRAPH_RELATIONS", "1")
MODEL, ARGS = sys.argv[1], sys.argv[2:]
sys.argv = [sys.argv[0], "--attention"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, torch
import graph_policy as gp

REFS = os.environ.get("REFS_ML") or os.path.join(HERE, "../../references/ml/")
LABELS = ARGS[0] if ARGS else os.path.join(REFS, "graphs-human-labels.jsonl")
PER = 6

def where(d):
    """Each mark's place: the mean row and column of its cells."""
    st = d["structure"]; C = st.get("cols") or 0
    if not C: return None
    return np.array([[np.mean([c // C for c in m["cells"]]), np.mean([c % C for c in m["cells"]])] if m["cells"] else [np.nan, np.nan] for m in st["marks"]], np.float32)

# the held-out side, as opus_human_tune.py's load() (its test records need no leakage guard)
test = []
for l in gp.lines(LABELS):
    d = json.loads(l)
    if d.get("split") != "test": continue
    p = gp.Puzzle(d)
    if not p.R or p.M > gp.MAX_MARKS: continue
    p.where = where(d); test.append(p)
items = gp.states(test, PER)
print(f"{len(test)} held-out puzzles, {len(items)} states", flush=True)

rows = []   # (solver, genre, net full hit, net where hit, nearness where hit (expected), random where)
net = gp.load_net(MODEL); net.eval()
with torch.no_grad():
    for part in gp.chunks(items):
        g, y, mask, offs = gp.batch(part, gp.attends(net)); logits = net(gp.to(g)).cpu()
        for (pz, k), (o, n) in zip(part, offs):
            mm = mask[o:o + n]
            if mm.sum() == 0: continue
            s = (mm.numpy() == 0).astype(np.int8)
            nxt = pz.people(s)
            if nxt is None or not len(nxt): continue
            top = logits[o:o + n].masked_fill(mm[:, None] == 0, -1e9).flatten().argmax().item()
            marks = set((nxt // 2).tolist()); open_ = np.nonzero(s == 0)[0]
            near = float("nan")
            prev = np.nonzero(pz.rnd == k - 1)[0] if k > 0 else []
            if pz.where is not None and len(prev):
                dist = np.min(np.linalg.norm(pz.where[open_][:, None, :] - pz.where[prev][None, :, :], axis=2), axis=1)
                best = open_[np.isclose(dist, np.nanmin(dist))]
                near = float(np.mean([m in marks for m in best]))
            rows.append(((pz.solver or "?").strip(), pz.genre, bool(np.isin(top, nxt)), (top // 2) in marks, near, len(marks) / len(open_), pz.name, int(k)))

if os.environ.get("PER_SOLVER_ROWS"):
    with open(os.environ["PER_SOLVER_ROWS"], "w") as f:
        for r in rows: f.write(json.dumps(r) + "\n")

def ci(rs, col, n=400):
    """95% interval of a column's mean, resampling puzzles (a puzzle's 6 states move together)."""
    by = {}
    for r in rs: by.setdefault(r[6], []).append(r[col])
    groups = list(by.values()); rng = np.random.default_rng(1); means = []
    for _ in range(n):
        pick = [groups[i] for i in rng.integers(0, len(groups), len(groups))]
        means.append(np.mean([x for g in pick for x in g]))
    return np.percentile(means, 2.5), np.percentile(means, 97.5), len(groups)

def line(label, rs):
    a = np.array([[r[2], r[3], r[4], r[5]] for r in rs], float)
    nr = a[~np.isnan(a[:, 2])]
    lo, hi, np_ = ci(rs, 2)
    return f"{label:<26} {np_:>4} puzzles {len(rs):>5} states  net {a[:, 0].mean():5.0%} ({lo:.0%}-{hi:.0%})  net where {a[:, 1].mean():5.0%}  nearness {nr[:, 2].mean() if len(nr) else float('nan'):5.0%}  random {a[:, 3].mean():5.0%}"

print(line("all", rows))
solvers = sorted({r[0] for r in rows}, key=lambda s: -sum(r[0] == s for r in rows))
print("\nby solver, all types:")
for s in solvers: print(line(s, [r for r in rows if r[0] == s]))
# within type, so the mix of genres a solver recorded doesn't make the difference
print("\nby type and solver (types with 2+ solvers of 30+ states):")
for g in sorted({r[1] for r in rows}):
    by = {s: [r for r in rows if r[1] == g and r[0] == s] for s in solvers}
    by = {s: v for s, v in by.items() if len(v) >= 30}
    if len(by) < 2: continue
    print(f"{g}:")
    for s, v in by.items(): print(line("  " + s, v))
