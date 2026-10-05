"""Generate the number-line maze: a grid of 1-4 clues whose lines form a maze.

Rules the solver sees:
  - Draw lines between orthogonal neighbours, at most one per pair.
  - Each number says how many lines touch it.
  - All lines join into one network with no loops.
Then: follow the lines from the start arrow to the exit arrow.

The answer is a uniform random spanning tree. A backtracking solver proves the
clues (plus a few pre-drawn hint lines, if needed) have exactly one solution.
"""
import argparse
import json
import random
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--size", default="11x17", help="columns x rows")
ap.add_argument("--exit-row", type=int, default=14, help="row of the exit arrow on the right edge")
ap.add_argument("--seed", type=int, default=38)
ap.add_argument("--out", default="puzzle.json", help="file name inside src/games/line-maze/")
args = ap.parse_args()

W, H = map(int, args.size.split("x"))
START, EXIT = (0, W - 1), (args.exit_row, W - 1)   # (row, col): top-right; right side lower down
SEED = args.seed
OUT = Path(__file__).resolve().parents[2] / "src" / "games" / "line-maze" / args.out

cells = [(r, c) for r in range(H) for c in range(W)]
idx = {p: i for i, p in enumerate(cells)}
edges = []                                 # (a, b) cell indices
for r in range(H):
    for c in range(W):
        if c + 1 < W: edges.append((idx[(r, c)], idx[(r, c + 1)]))
        if r + 1 < H: edges.append((idx[(r, c)], idx[(r + 1, c)]))
cell_edges = [[] for _ in cells]
for e, (a, b) in enumerate(edges):
    cell_edges[a].append(e); cell_edges[b].append(e)
nbr_edge = {}
for e, (a, b) in enumerate(edges):
    nbr_edge[(a, b)] = nbr_edge[(b, a)] = e


def wilson(rng):
    """Uniform spanning tree via loop-erased random walks."""
    in_tree = [False] * len(cells)
    in_tree[rng.randrange(len(cells))] = True
    nxt = [None] * len(cells)
    tree = set()
    order = list(range(len(cells))); rng.shuffle(order)
    for s in order:
        u = s
        while not in_tree[u]:
            nb = [b if a == u else a for e in cell_edges[u] for a, b in [edges[e]]]
            nxt[u] = rng.choice(nb); u = nxt[u]
        u = s
        while not in_tree[u]:
            in_tree[u] = True; tree.add(nbr_edge[(u, nxt[u])]); u = nxt[u]
    return tree


class Solver:
    def __init__(self, deg, fixed):
        self.deg, self.fixed = deg, fixed
        self.sols = []

    def find(self, x, parent):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x

    def propagate(self, val):
        changed = True
        while changed:
            changed = False
            parent = list(range(len(cells)))
            for e, v in enumerate(val):
                if v == 1:
                    a, b = (self.find(x, parent) for x in edges[e])
                    if a == b: return False                     # loop
                    parent[a] = b
            for e, v in enumerate(val):                         # closing a loop is forbidden
                if v == -1:
                    a, b = edges[e]
                    if self.find(a, parent) == self.find(b, parent):
                        val[e] = 0; changed = True
            for i in range(len(cells)):
                es = cell_edges[i]
                on = sum(val[e] == 1 for e in es)
                unk = [e for e in es if val[e] == -1]
                need = self.deg[i] - on
                if need < 0 or need > len(unk): return False
                if unk and need == 0:
                    for e in unk: val[e] = 0
                    changed = True
                elif unk and need == len(unk):
                    for e in unk: val[e] = 1
                    changed = True
        # the possible lines must still be able to connect everything
        parent = list(range(len(cells)))
        for e, v in enumerate(val):
            if v != 0:
                a, b = (self.find(x, parent) for x in edges[e]); parent[a] = b
        root = self.find(0, parent)
        return all(self.find(i, parent) == root for i in range(len(cells)))

    def solve(self, limit=2):
        val = [-1] * len(edges)
        for e, v in self.fixed.items(): val[e] = v
        self._search(val, limit)
        return self.sols

    def _search(self, val, limit):
        if len(self.sols) >= limit or not self.propagate(val): return
        unk = [e for e, v in enumerate(val) if v == -1]
        if not unk:
            self.sols.append({e for e, v in enumerate(val) if v == 1}); return
        # branch on an edge at the most constrained cell
        best = min((i for i in range(len(cells)) if any(val[e] == -1 for e in cell_edges[i])),
                   key=lambda i: sum(val[e] == -1 for e in cell_edges[i]))
        e = next(e for e in cell_edges[best] if val[e] == -1)
        for v in (1, 0):
            nv = val[:]; nv[e] = v
            self._search(nv, limit)


rng = random.Random(SEED)
tree = wilson(rng)
deg = [sum(e in tree for e in cell_edges[i]) for i in range(len(cells))]
hints = set()
while True:
    sols = Solver(deg, {e: 1 for e in hints}).solve(2)
    assert sols, "clues have no solution"
    if sols == [tree]: break
    alt = next(s for s in sols if s != tree)
    hints.add(rng.choice(sorted(tree - alt)))              # pin a line the alternative lacks

# The maze path from start to exit (unique in a tree).
adj = {i: [] for i in range(len(cells))}
for e in tree:
    a, b = edges[e]; adj[a].append(b); adj[b].append(a)
s, t = idx[START], idx[EXIT]
prev, stack = {s: None}, [s]
while stack:
    u = stack.pop()
    for v in adj[u]:
        if v not in prev: prev[v] = u; stack.append(v)
path, u = [], t
while u is not None: path.append(cells[u]); u = prev[u]
path.reverse()

OUT.parent.mkdir(parents=True, exist_ok=True)
# Imported by the game module at build time, so the page needs no fetch.
OUT.write_text(json.dumps({
    "w": W, "h": H, "start": START, "exit": EXIT,
    "clues": [[deg[idx[(r, c)]] for c in range(W)] for r in range(H)],
    "hints": sorted([list(cells[edges[e][0]]), list(cells[edges[e][1]])] for e in hints),
    "solution": sorted([list(cells[edges[e][0]]), list(cells[edges[e][1]])] for e in tree),
    "path": path,
}) + "\n")
counts = {k: deg.count(k) for k in range(1, 5)}
print(f"seed {SEED}: unique with {len(hints)} hint lines; clue counts {counts}; path length {len(path)}")
for r in range(H):
    print(" ".join(str(deg[idx[(r, c)]]) for c in range(W)))
