# Learning from people's solves: Janko's Star Battles (references/janko, local and non-commercial
# only) replayed move by move. A state is what the person had settled so far; its label, their
# next three moves. Three networks on held-out puzzles, predicting the person's next move:
#   A  trained on our solver's paths (policy.py's saved network), as it is
#   B  A fine-tuned on people's moves
#   C  the same network trained on people's moves alone
#
# First result (October 2026, 251 solves, 50 held out): the top guess is one of the person's next
# three moves 47% of the time for A (random 7%), 52% for B, 46% for C: our solver's paths teach
# most of where people look, and people's moves add a little on top.
#
#   references/ml/.venv/bin/python puzzles/difficulty/policy_human.py [epochs]
import glob, os, random, re, sys
import numpy as np
import torch

os.environ["POLICY_GENRE"] = "star-battle"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import policy as P

epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 10
NEXT = 3
janko = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../references/janko/Sternenschlacht")

def section(text, name):
    m = re.search(r"\[" + name + r"\]\n(.*?)\n\[", text, re.S)
    return [l.strip() for l in m.group(1).strip().split("\n")] if m else []

def read(path):
    text = open(path).read()
    n = int(re.search(r"^size (\d+)", text, re.M).group(1))
    stars = int((re.search(r"^depth (\d+)", text, re.M) or [None, 1])[1])
    rows = [l.split() for l in section(text, "areas")]
    if n > P.S or len(rows) != n or any(x in ("@", "#") for r in rows for x in r): return None
    ids = sorted({x for r in rows for x in r}, key=lambda x: [x for r in rows for x in r].index(x))
    if len(ids) > 16: return None
    areas = ["".join(chr(97 + ids.index(x)) for x in r) for r in rows]
    sol = [l.split() for l in section(text, "solution")]
    final = np.array([[1 if sol[r][c] == "x" else 0 for c in range(n)] for r in range(n)], np.int8)
    order = []
    seen = set()
    for mv in "".join(section(text, "moves")).split(";"):
        m = re.match(r"^([a-z])([a-z]),([01])$", mv.strip())
        if not m: continue
        c, r, v = ord(m.group(1)) - 97, ord(m.group(2)) - 97, int(m.group(3))
        if r < n and c < n and (r, c) not in seen and v == final[r, c]: seen.add((r, c)); order.append((r, c, v))
    if len(order) < n * n * 0.6: return None
    return n, stars, areas, final, order

def states(puzzle):
    n, stars, areas, final, order = puzzle
    know = np.full((n, n), -1, np.int8)
    out = []
    for t in range(len(order)):
        y = np.zeros((2, P.S, P.S), np.float32)
        for (r, c, v) in order[t:t + NEXT]: y[0 if v else 1, r, c] = 1
        out.append((None, know.copy(), (areas, stars), y, 0, final))
        r, c, v = order[t]; know[r, c] = v
    return out

puzzles = [p for f in sorted(glob.glob(f"{janko}/*.txt")) if (p := read(f))]
random.Random(1).shuffle(puzzles)
cut = int(0.8 * len(puzzles))
train = [s for p in puzzles[:cut] for s in states(p)]; test = [s for p in puzzles[cut:] for s in states(p)]
print(f"{len(puzzles)} human solves; {len(train)} training states, {len(test)} test states")

def report(net, label):
    logits, M, Y = P.scores(net, test)
    top = logits.flatten(1).argmax(1)
    hit3 = (Y.flatten(1)[torch.arange(len(top)), top] == 1).float().mean()
    base = ((Y * M).flatten(1).sum(1) / M.flatten(1).sum(1).clamp(min=1)).mean()
    print(f"{label}: top guess is one of the person's next {NEXT} moves {hit3:.0%} (random {base:.0%})")

A = P.Net(14, 2).to(P.dev); A.load_state_dict(torch.load(f"{P.here}/policy-star-battle.pt", map_location=P.dev))
report(A, "A  trained on our solver's paths")
B = P.Net(14, 2).to(P.dev); B.load_state_dict(torch.load(f"{P.here}/policy-star-battle.pt", map_location=P.dev))
B = P.fit(train, epochs, B, lr=5e-4)
report(B, "B  A fine-tuned on people's moves")
C = P.fit(train, epochs)
report(C, "C  trained on people's moves alone")
torch.save(B.state_dict(), f"{P.here}/policy-star-battle-human.pt")
