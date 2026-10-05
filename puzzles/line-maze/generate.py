"""Generate the number-line maze: numbers at grid corners say how many walls touch them.

Board: numbers sit on the corners of a grid of squares. Lines between neighbouring
numbers are WALLS. The outer border is drawn for the player, with two gaps: the
entrance (top edge, under the arrow) and the exit (right edge, beside the arrow).

Rules the player sees:
  - Draw walls between neighbouring numbers (up, down, left, right).
  - Each number says how many walls touch it; border walls count.
  - Walls never close into a loop, and every wall connects to the border.
Then: walk through the open squares from the entrance to the exit.

Those rules describe exactly a "perfect" maze: every square reachable, one route
between any two. We carve a random perfect maze of squares, derive its walls and
the numbers, then a backtracking solver proves the numbers (plus a few pre-drawn
hint walls if needed) allow only that maze.
"""
import argparse
import json
import random
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--size", default="11x17", help="numbers across x numbers down")
ap.add_argument("--exit-row", type=int, default=14, help="square row the exit opens from (right edge)")
ap.add_argument("--seed", type=int, default=53)
ap.add_argument("--out", default="puzzle.json", help="file name inside src/games/line-maze/")
args = ap.parse_args()

W, H = map(int, args.size.split("x"))        # numbers (grid corners)
CW, CH = W - 1, H - 1                         # squares
SEED = args.seed
OUT = Path(__file__).resolve().parents[2] / "src" / "games" / "line-maze" / args.out
ENTRY_CELL, EXIT_CELL = (0, CW - 1), (args.exit_row, CW - 1)

# ---- corner graph: vertices are numbers, edges are possible walls ----
verts = [(r, c) for r in range(H) for c in range(W)]
vid = {p: i for i, p in enumerate(verts)}
edges, eid = [], {}
for r in range(H):
    for c in range(W):
        for q in ((r, c + 1), (r + 1, c)):
            if q[0] < H and q[1] < W:
                eid[((r, c), q)] = eid[(q, (r, c))] = len(edges)
                edges.append((vid[(r, c)], vid[q]))
vert_edges = [[] for _ in verts]
for e, (a, b) in enumerate(edges):
    vert_edges[a].append(e); vert_edges[b].append(e)


def on_border(v):
    r, c = verts[v]
    return r in (0, H - 1) or c in (0, W - 1)


def border_edge(e):
    (r1, c1), (r2, c2) = verts[edges[e][0]], verts[edges[e][1]]
    return (r1 == r2 and r1 in (0, H - 1)) or (c1 == c2 and c1 in (0, W - 1))


ENTRY_GAP = eid[((0, W - 2), (0, W - 1))]                              # top edge of the entrance square
EXIT_GAP = eid[((args.exit_row, W - 1), (args.exit_row + 1, W - 1))]   # right edge of the exit square


def wall_between(a, b):
    """The corner-graph edge that separates neighbouring squares a and b."""
    (r1, c1), (r2, c2) = sorted([a, b])
    if r1 == r2:   # side by side: vertical wall on column c2
        return eid[((r1, c2), (r1 + 1, c2))]
    return eid[((r2, c1), (r2, c1 + 1))]   # stacked: horizontal wall on row r2


# ---- carve a perfect maze of squares (Wilson's algorithm: uniform spanning tree) ----
def carve(rng):
    cells = [(r, c) for r in range(CH) for c in range(CW)]
    in_tree = {rng.choice(cells)}
    nxt, passages = {}, set()
    order = cells[:]; rng.shuffle(order)
    for s in order:
        u = s
        while u not in in_tree:
            r, c = u
            nb = [(r + dr, c + dc) for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1))
                  if 0 <= r + dr < CH and 0 <= c + dc < CW]
            nxt[u] = rng.choice(nb); u = nxt[u]
        u = s
        while u not in in_tree:
            in_tree.add(u); passages.add(frozenset((u, nxt[u]))); u = nxt[u]
    return passages


class Solver:
    """Counts wall layouts (up to `limit`) that satisfy the numbers and the maze rules."""

    def __init__(self, deg, fixed):
        self.deg, self.fixed, self.sols = deg, fixed, []

    @staticmethod
    def find(x, parent):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x

    def propagate(self, val):
        changed = True
        while changed:
            changed = False
            parent = list(range(len(verts)))
            for e, v in enumerate(val):
                if v == 1:
                    a, b = (self.find(x, parent) for x in edges[e])
                    if a == b: return False                     # walls closed a loop
                    parent[a] = b
            for e, v in enumerate(val):                         # a wall that would close a loop is out
                if v == -1:
                    a, b = edges[e]
                    if self.find(a, parent) == self.find(b, parent):
                        val[e] = 0; changed = True
            for i in range(len(verts)):
                es = vert_edges[i]
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
        # every wall must still be able to reach the border
        parent = list(range(len(verts)))
        for e, v in enumerate(val):
            if v != 0:
                a, b = (self.find(x, parent) for x in edges[e]); parent[a] = b
        touches = {self.find(i, parent) for i in range(len(verts)) if on_border(i)}
        return all(self.find(i, parent) in touches for i in range(len(verts)) if self.deg[i] > 0)

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
        best = min((i for i in range(len(verts)) if any(val[e] == -1 for e in vert_edges[i])),
                   key=lambda i: sum(val[e] == -1 for e in vert_edges[i]))
        e = next(e for e in vert_edges[best] if val[e] == -1)
        for v in (1, 0):
            nv = val[:]; nv[e] = v
            self._search(nv, limit)


rng = random.Random(SEED)
passages = carve(rng)
open_edges = {wall_between(*tuple(p)) for p in passages} | {ENTRY_GAP, EXIT_GAP}
walls = {e for e in range(len(edges)) if e not in open_edges}
deg = [sum(e in walls for e in vert_edges[i]) for i in range(len(verts))]
assert min(deg) >= 1, "a perfect maze has a wall at every corner"

border = {e for e in range(len(edges)) if border_edge(e)}
fixed = {e: (0 if e in (ENTRY_GAP, EXIT_GAP) else 1) for e in border}
hints = set()
while True:
    sols = Solver(deg, {**fixed, **{e: 1 for e in hints}}).solve(2)
    assert sols, "numbers have no solution"
    if sols == [walls]: break
    alt = next(s for s in sols if s != walls)
    hints.add(rng.choice(sorted(walls - alt - border)))   # pre-draw a wall the alternative lacks

# The one route through the squares from entrance to exit.
adj = {}
for p in passages:
    a, b = tuple(p); adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
prev, stack = {ENTRY_CELL: None}, [ENTRY_CELL]
while stack:
    u = stack.pop()
    for v in adj.get(u, []):
        if v not in prev: prev[v] = u; stack.append(v)
path, u = [], EXIT_CELL
while u is not None: path.append(u); u = prev[u]
path.reverse()


def pair(e):
    return [list(verts[edges[e][0]]), list(verts[edges[e][1]])]


OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    "w": W, "h": H,                         # numbers across / down
    "entry": list(ENTRY_CELL), "exit": list(EXIT_CELL),   # squares under the arrows
    "clues": [[deg[vid[(r, c)]] for c in range(W)] for r in range(H)],
    "border": sorted(pair(e) for e in border if e not in (ENTRY_GAP, EXIT_GAP)),
    "gaps": [pair(ENTRY_GAP), pair(EXIT_GAP)],
    "hints": sorted(pair(e) for e in hints),
    "solution": sorted(pair(e) for e in walls),
    "path": [list(p) for p in path],
}) + "\n")
counts = {k: deg.count(k) for k in range(1, 5)}
print(f"seed {SEED}: unique with {len(hints)} hint walls; clue counts {counts}; route {len(path)} squares")
for r in range(H):
    print(" ".join(str(deg[vid[(r, c)]]) for c in range(W)))
