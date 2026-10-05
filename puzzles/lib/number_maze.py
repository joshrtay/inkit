"""Number maze: the game-type logic shared by every number-maze instance.

Board: numbers sit on the corners of a grid of squares. Lines between neighbouring
numbers are walls. The outer border is pre-drawn except for two gaps: the entrance
on the top edge (above square column `entry_col`) and the exit on the right edge
(beside square row `exit_row`).

Rules the player sees:
  - Each number says how many walls touch it; border walls count.
  - Walls never close into a loop, and every wall connects to the border.
Those rules describe exactly a perfect maze (every square reachable, one route
between any two), so a grid with exactly one solution is a valid puzzle.

An instance's "maze" data (in src/games/<slug>.json):
  {"clues": [[...], ...], "entryCol": int, "exitRow": int, "hints": [[[r, c], [r, c]], ...]}
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field


@dataclass
class Board:
    W: int                      # numbers across
    H: int                      # numbers down
    entry_col: int              # square column under the entrance gap (top edge)
    exit_row: int               # square row beside the exit gap (right edge)
    verts: list = field(init=False)
    edges: list = field(init=False)

    def __post_init__(self):
        W, H = self.W, self.H
        if not (0 <= self.entry_col < W - 1 and 0 <= self.exit_row < H - 1):
            raise ValueError("entrance or exit is outside the board")
        self.verts = [(r, c) for r in range(H) for c in range(W)]
        self.vid = {p: i for i, p in enumerate(self.verts)}
        self.edges, self.eid = [], {}
        for r in range(H):
            for c in range(W):
                for q in ((r, c + 1), (r + 1, c)):
                    if q[0] < H and q[1] < W:
                        self.eid[((r, c), q)] = self.eid[(q, (r, c))] = len(self.edges)
                        self.edges.append((self.vid[(r, c)], self.vid[q]))
        self.vert_edges = [[] for _ in self.verts]
        for e, (a, b) in enumerate(self.edges):
            self.vert_edges[a].append(e); self.vert_edges[b].append(e)
        self.entry_gap = self.eid[((0, self.entry_col), (0, self.entry_col + 1))]
        self.exit_gap = self.eid[((self.exit_row, W - 1), (self.exit_row + 1, W - 1))]
        self.border = {e for e in range(len(self.edges)) if self._border_edge(e)}

    # ---- geometry ----
    @property
    def CW(self): return self.W - 1
    @property
    def CH(self): return self.H - 1
    @property
    def entry_square(self): return (0, self.entry_col)
    @property
    def exit_square(self): return (self.exit_row, self.CW - 1)

    def on_border(self, v):
        r, c = self.verts[v]
        return r in (0, self.H - 1) or c in (0, self.W - 1)

    def _border_edge(self, e):
        (r1, c1), (r2, c2) = self.verts[self.edges[e][0]], self.verts[self.edges[e][1]]
        return (r1 == r2 and r1 in (0, self.H - 1)) or (c1 == c2 and c1 in (0, self.W - 1))

    def fixed(self):
        """Border walls are given; the two gaps are open."""
        return {e: (0 if e in (self.entry_gap, self.exit_gap) else 1) for e in self.border}

    def wall_between(self, a, b):
        """The edge that separates neighbouring squares a and b."""
        (r1, c1), (r2, c2) = sorted([a, b])
        if r1 == r2:
            return self.eid[((r1, c2), (r1 + 1, c2))]
        return self.eid[((r2, c1), (r2, c1 + 1))]

    def pair(self, e):
        a, b = self.edges[e]
        return [list(self.verts[a]), list(self.verts[b])]

    def edge_of(self, pair):
        a, b = (tuple(p) for p in pair)
        return self.eid[(a, b)]

    def clues_of(self, walls):
        deg = [sum(e in walls for e in self.vert_edges[i]) for i in range(len(self.verts))]
        return [[deg[self.vid[(r, c)]] for c in range(self.W)] for r in range(self.H)]

    # ---- making a maze ----
    def carve(self, rng: random.Random):
        """Walls of a uniformly random perfect maze (Wilson's algorithm on the squares)."""
        cells = [(r, c) for r in range(self.CH) for c in range(self.CW)]
        in_tree = {rng.choice(cells)}
        nxt, open_edges = {}, {self.entry_gap, self.exit_gap}
        order = cells[:]; rng.shuffle(order)
        for s in order:
            u = s
            while u not in in_tree:
                r, c = u
                nb = [(r + dr, c + dc) for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1))
                      if 0 <= r + dr < self.CH and 0 <= c + dc < self.CW]
                nxt[u] = rng.choice(nb); u = nxt[u]
            u = s
            while u not in in_tree:
                in_tree.add(u); open_edges.add(self.wall_between(u, nxt[u])); u = nxt[u]
        return {e for e in range(len(self.edges)) if e not in open_edges}

    def route(self, walls):
        """The squares from entrance to exit."""
        def neighbours(s):
            r, c = s
            for n in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= n[0] < self.CH and 0 <= n[1] < self.CW and self.wall_between(s, n) not in walls:
                    yield n
        prev, stack = {self.entry_square: None}, [self.entry_square]
        while stack:
            u = stack.pop()
            for v in neighbours(u):
                if v not in prev: prev[v] = u; stack.append(v)
        if self.exit_square not in prev:
            return None
        path, u = [], self.exit_square
        while u is not None: path.append(u); u = prev[u]
        return path[::-1]


class _Solver:
    def __init__(self, board: Board, clues, fixed):
        self.b = board
        self.deg = [clues[r][c] for r, c in board.verts]
        self.fixed = fixed
        self.sols = []

    @staticmethod
    def find(x, parent):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x

    def propagate(self, val):
        b = self.b
        changed = True
        while changed:
            changed = False
            parent = list(range(len(b.verts)))
            for e, v in enumerate(val):
                if v == 1:
                    x, y = (self.find(i, parent) for i in b.edges[e])
                    if x == y: return False                     # walls closed a loop
                    parent[x] = y
            for e, v in enumerate(val):                         # a wall that would close a loop is out
                if v == -1:
                    x, y = b.edges[e]
                    if self.find(x, parent) == self.find(y, parent):
                        val[e] = 0; changed = True
            for i in range(len(b.verts)):
                es = b.vert_edges[i]
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
        parent = list(range(len(b.verts)))                      # every wall must reach the border
        for e, v in enumerate(val):
            if v != 0:
                x, y = (self.find(i, parent) for i in b.edges[e]); parent[x] = y
        touching = {self.find(i, parent) for i in range(len(b.verts)) if b.on_border(i)}
        return all(self.find(i, parent) in touching for i in range(len(b.verts)) if self.deg[i] > 0)

    def search(self, val, limit):
        if len(self.sols) >= limit or not self.propagate(val): return
        unk = [e for e, v in enumerate(val) if v == -1]
        if not unk:
            self.sols.append({e for e, v in enumerate(val) if v == 1}); return
        b = self.b
        best = min((i for i in range(len(b.verts)) if any(val[e] == -1 for e in b.vert_edges[i])),
                   key=lambda i: sum(val[e] == -1 for e in b.vert_edges[i]))
        e = next(e for e in b.vert_edges[best] if val[e] == -1)
        for v in (1, 0):
            nv = val[:]; nv[e] = v
            self.search(nv, limit)


def solve(board: Board, clues, hints=(), limit=2):
    """Up to `limit` wall layouts that satisfy the clues, the hints and the maze rules."""
    fixed = {**board.fixed(), **{e: 1 for e in hints}}
    s = _Solver(board, clues, fixed)
    val = [-1] * len(board.edges)
    for e, v in fixed.items(): val[e] = v
    s.search(val, limit)
    return s.sols


def hints_for(board: Board, walls, rng: random.Random):
    """Hint walls (taken from `walls`) that make the clues of `walls` have only that solution."""
    clues = board.clues_of(walls)
    hints = set()
    while True:
        sols = solve(board, clues, hints)
        if sols == [walls]:
            return hints
        alt = next(s for s in sols if s != walls)
        hints.add(rng.choice(sorted(walls - alt - board.border)))


def generate(W, H, entry_col, exit_row, seed):
    """A new puzzle: (board, walls, hints) with exactly one solution."""
    board = Board(W, H, entry_col, exit_row)
    rng = random.Random(seed)
    walls = board.carve(rng)
    return board, walls, hints_for(board, walls, rng)


def board_for(maze: dict) -> Board:
    clues = maze["clues"]
    return Board(len(clues[0]), len(clues), maze["entryCol"], maze["exitRow"])


def check(maze: dict):
    """Validate an instance's maze data. Returns (ok, message, walls_or_None)."""
    clues = maze["clues"]
    if any(len(row) != len(clues[0]) for row in clues):
        return False, "rows have different lengths", None
    board = board_for(maze)
    hints = {board.edge_of(p) for p in maze.get("hints", [])}
    sols = solve(board, clues, hints)
    if not sols:
        return False, "no wall layout fits these numbers", None
    if len(sols) > 1:
        a, b = sols[0], sols[1]
        suggest = sorted(a - b - board.border)[:3]
        return False, ("more than one wall layout fits; adding one of these walls as a hint "
                       f"would rule out the other: {[board.pair(e) for e in suggest]}"), None
    if board.route(sols[0]) is None:
        return False, "the walls leave no route from entrance to exit", None
    return True, f"one solution; route {len(board.route(sols[0]))} squares", sols[0]
