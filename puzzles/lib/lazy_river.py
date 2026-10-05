"""Round the Bend (game type id "lazy-river"; after Inkwell Games' Loopy River, the classic "Simple Loop").

Grid: white cells ('.') and black cells ('#'); thick walls between some neighbouring
cells. Rules: draw ONE closed loop through the centre of every white cell (each entered
and left once: no branches, no crossings, no separate mini-loops). The loop never enters
black cells and never crosses a wall.

An instance's "river" data (src/games/round-the-bend/<n>.json):
  {"grid": ["......", "..#...", ...], "walls": [[[r, c], [r, c]], ...]}
"""
from __future__ import annotations

import random

NEIGHBOURS = ((0, 1), (1, 0), (0, -1), (-1, 0))


class Board:
    def __init__(self, grid: list[str], walls=()):
        self.grid = grid
        self.H, self.W = len(grid), len(grid[0])
        if any(len(row) != self.W for row in grid):
            raise ValueError("every grid row must be the same length")
        self.cells = [(r, c) for r in range(self.H) for c in range(self.W) if grid[r][c] != "#"]
        self.cid = {p: i for i, p in enumerate(self.cells)}
        wallset = {frozenset(map(tuple, w)) for w in walls}
        self.walls = wallset
        self.edges, self.eid = [], {}
        for (r, c) in self.cells:
            for q in ((r, c + 1), (r + 1, c)):
                if q in self.cid and frozenset({(r, c), q}) not in wallset:
                    self.eid[frozenset({(r, c), q})] = len(self.edges)
                    self.edges.append((self.cid[(r, c)], self.cid[q]))
        self.cell_edges = [[] for _ in self.cells]
        for e, (a, b) in enumerate(self.edges):
            self.cell_edges[a].append(e); self.cell_edges[b].append(e)

    def pair(self, e):
        a, b = self.edges[e]
        return [list(self.cells[a]), list(self.cells[b])]


class _Solver:
    def __init__(self, board: Board, rng: random.Random | None = None):
        self.b, self.rng, self.sols = board, rng, []
        self.n = len(board.cells)

    @staticmethod
    def find(x, parent):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x

    def propagate(self, val):
        b, n = self.b, self.n
        changed = True
        while changed:
            changed = False
            for i in range(n):
                es = b.cell_edges[i]
                on = sum(val[e] == 1 for e in es)
                unk = [e for e in es if val[e] == -1]
                need = 2 - on
                if need < 0 or need > len(unk): return False
                if unk and need == 0:
                    for e in unk: val[e] = 0
                    changed = True
                elif unk and need == len(unk):
                    for e in unk: val[e] = 1
                    changed = True
            # no mini-loops: a closed cycle is only allowed once it is the whole loop
            parent, size = list(range(n)), [1] * n
            total_on = sum(1 for v in val if v == 1)
            for e, v in enumerate(val):
                if v == 1:
                    x, y = (self.find(k, parent) for k in b.edges[e])
                    if x == y:
                        if total_on != n: return False
                        continue
                    parent[x] = y; size[y] += size[x]
            for e, v in enumerate(val):
                if v == -1:
                    x, y = (self.find(k, parent) for k in b.edges[e])
                    if x == y and size[x] < n:
                        val[e] = 0; changed = True
        # every white cell must still be reachable
        parent = list(range(n))
        for e, v in enumerate(val):
            if v != 0:
                x, y = (self.find(k, parent) for k in b.edges[e]); parent[x] = y
        root = self.find(0, parent)
        return all(self.find(i, parent) == root for i in range(n))

    def solve(self, limit):
        if self.n < 4: return []
        self._search([-1] * len(self.b.edges), limit)
        return self.sols

    def _search(self, val, limit):
        if len(self.sols) >= limit or not self.propagate(val): return
        unk = [e for e, v in enumerate(val) if v == -1]
        if not unk:
            on = {e for e, v in enumerate(val) if v == 1}
            if len(on) == self.n: self.sols.append(on)
            return
        b = self.b
        best = min((i for i in range(self.n) if any(val[e] == -1 for e in b.cell_edges[i])),
                   key=lambda i: sum(val[e] == -1 for e in b.cell_edges[i]))
        e = next(e for e in b.cell_edges[best] if val[e] == -1)
        order = (1, 0) if self.rng is None or self.rng.random() < 0.5 else (0, 1)
        for v in order:
            nv = val[:]; nv[e] = v
            self._search(nv, limit)


def solve(board: Board, limit=2, rng=None):
    """Up to `limit` loops (sets of edge ids) through every white cell."""
    return _Solver(board, rng).solve(limit)


def check(river: dict):
    """(ok, message): exactly one loop fits this grid and these walls?"""
    board = Board(river["grid"], river.get("walls", []))
    sols = solve(board, 2)
    if not sols: return False, "no loop can pass through every white cell"
    if len(sols) > 1: return False, "more than one loop fits; add walls (or black cells) to rule one out"
    return True, f"one solution; {len(board.cells)} cells"


def unique_walls(grid, walls, loop_pairs, rng):
    """Add walls (never on the loop) until `loop_pairs` is the only solution."""
    walls = [list(map(list, w)) for w in walls]
    loop = {frozenset(map(tuple, p)) for p in loop_pairs}
    while True:
        board = Board(grid, walls)
        sols = solve(board, 2)
        target = {e for e in range(len(board.edges)) if frozenset(map(tuple, board.pair(e))) in loop}
        if sols == [target]:
            return walls
        alt = next(s for s in sols if s != target)
        pick = rng.choice(sorted(alt - target))
        walls.append(board.pair(pick))


def fit(grid, walls, seed=0, tries=40):
    """Closest valid level to a sketch: keep its black cells and walls, adding as few
    walls as possible for a unique loop. If no loop fits at all, the fewest black-cell
    toggles are tried first. Returns (grid, walls, added_walls, toggled_cells)."""
    rng = random.Random(seed)
    toggled = []
    if not solve(Board(grid, walls), 1):
        H, W = len(grid), len(grid[0])
        options = []
        for r in range(H):
            for c in range(W):
                g = [list(row) for row in grid]
                g[r][c] = "." if g[r][c] == "#" else "#"
                g = ["".join(row) for row in g]
                if solve(Board(g, walls), 1):
                    options.append(((r, c), g))
        if not options:
            raise ValueError("no single black-cell change lets a loop fit; adjust the sketch")
        (toggled_cell, grid) = options[0]
        toggled = [toggled_cell]
    best = None
    for _ in range(tries):
        board = Board(grid, walls)
        loop = solve(board, 1, rng=random.Random(rng.random()))[0]
        loop_pairs = [board.pair(e) for e in loop]
        new_walls = unique_walls(grid, walls, loop_pairs, rng)
        added = len(new_walls) - len(walls)
        if best is None or added < best[0]:
            best = (added, new_walls)
    return grid, best[1], best[1][len(walls):], toggled
