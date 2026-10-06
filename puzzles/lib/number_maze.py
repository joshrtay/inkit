"""Number maze: the game-type logic shared by every number-maze instance.

Board: numbers sit on the corners of a grid of squares. Lines between neighbouring
numbers are walls. The outer border is walled except for two gaps, the entrance and
the exit. Each gap is an Opening (side, at): a side of the board ("top", "right",
"bottom" or "left") and the square beside the gap, counted along that side (a column
for top/bottom, a row for left/right).

Rules the player sees:
  - Each number says how many walls touch it; border walls count.
  - Walls never close into a loop, and every wall connects to the border.
Those rules describe exactly a perfect maze (every square reachable, one route
between any two), so a grid with exactly one solution is a valid puzzle.

An instance's "maze" data (in src/games/number-line-maze/<n>.json):
  {"clues": [[...], ...], "entry": {"side": "left", "at": 0}, "exit": {"side": "left", "at": 6},
   "hints": [[[r, c], [r, c]], ...]}
Older instances give "entryCol" (top edge) and "exitRow" (right edge) instead.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import NamedTuple

SIDES = ("top", "right", "bottom", "left")


class Opening(NamedTuple):
    side: str                   # "top", "right", "bottom" or "left"
    at: int                     # square column (top/bottom) or square row (left/right)

    @classmethod
    def parse(cls, text: str) -> "Opening":
        """'left:0' -> Opening('left', 0)"""
        side, _, at = text.partition(":")
        if side not in SIDES or not at.lstrip("-").isdigit():
            raise ValueError(f"expected side:square, e.g. left:0 (sides: {', '.join(SIDES)}), got {text!r}")
        return cls(side, int(at))

    def json(self): return {"side": self.side, "at": self.at}


@dataclass
class Board:
    W: int                      # numbers across
    H: int                      # numbers down
    entry: Opening              # the entrance gap
    exit: Opening               # the exit gap
    verts: list = field(init=False)
    edges: list = field(init=False)

    def __post_init__(self):
        W, H = self.W, self.H
        self.entry, self.exit = Opening(*self.entry), Opening(*self.exit)
        for o in (self.entry, self.exit):
            if o.side not in SIDES or not 0 <= o.at < (W - 1 if o.side in ("top", "bottom") else H - 1):
                raise ValueError(f"opening {o} is outside the board")
        if self.entry == self.exit:
            raise ValueError("the entrance and exit are the same gap")
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
        self.entry_gap, self.exit_gap = self._gap(self.entry), self._gap(self.exit)
        self.border = {e for e in range(len(self.edges)) if self._border_edge(e)}

    # ---- geometry ----
    @property
    def CW(self): return self.W - 1
    @property
    def CH(self): return self.H - 1
    @property
    def entry_square(self): return self._square(self.entry)
    @property
    def exit_square(self): return self._square(self.exit)

    def _square(self, o: Opening):
        return {"top": (0, o.at), "bottom": (self.CH - 1, o.at),
                "left": (o.at, 0), "right": (o.at, self.CW - 1)}[o.side]

    def doorway(self, o: Opening):
        """Where a gap sits, for drawing: its midpoint as (row, col) in corner units, and the
        unit step (dr, dc) pointing out of the board."""
        return {"top": ((0, o.at + .5), (-1, 0)), "bottom": ((self.H - 1, o.at + .5), (1, 0)),
                "left": ((o.at + .5, 0), (0, -1)), "right": ((o.at + .5, self.W - 1), (0, 1))}[o.side]

    def _gap(self, o: Opening):
        r, c = {"top": (0, o.at), "bottom": (self.H - 1, o.at),
                "left": (o.at, 0), "right": (o.at, self.W - 1)}[o.side]
        q = (r, c + 1) if o.side in ("top", "bottom") else (r + 1, c)
        return self.eid[((r, c), q)]

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
    """Counts wall layouts. `clues` cells may be None (unknown: any count from 1 to 4)."""

    def __init__(self, board: Board, clues, fixed):
        self.b = board
        vals = [clues[r][c] for r, c in board.verts]
        self.lo = [1 if v is None else v for v in vals]
        self.hi = [4 if v is None else v for v in vals]
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
                need_lo, need_hi = self.lo[i] - on, self.hi[i] - on
                if need_hi < 0 or need_lo > len(unk): return False
                if unk and need_hi == 0:
                    for e in unk: val[e] = 0
                    changed = True
                elif unk and need_lo == len(unk):
                    for e in unk: val[e] = 1
                    changed = True
        parent = list(range(len(b.verts)))                      # every wall must reach the border
        for e, v in enumerate(val):
            if v != 0:
                x, y = (self.find(i, parent) for i in b.edges[e]); parent[x] = y
        touching = {self.find(i, parent) for i in range(len(b.verts)) if b.on_border(i)}
        return all(self.find(i, parent) in touching for i in range(len(b.verts)) if self.hi[i] > 0)

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


def generate(W, H, entry: Opening, exit: Opening, seed):
    """A new puzzle: (board, walls, hints) with exactly one solution."""
    board = Board(W, H, entry, exit)
    rng = random.Random(seed)
    walls = board.carve(rng)
    return board, walls, hints_for(board, walls, rng)


def openings(maze: dict):
    """(entry, exit) of an instance's maze data, including the older entryCol/exitRow form."""
    entry = Opening(**maze["entry"]) if "entry" in maze else Opening("top", maze["entryCol"])
    exit = Opening(**maze["exit"]) if "exit" in maze else Opening("right", maze["exitRow"])
    return entry, exit


def board_for(maze: dict) -> Board:
    clues = maze["clues"]
    return Board(len(clues[0]), len(clues), *openings(maze))


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


def _mismatch(board: Board, walls, sketch):
    """Corners whose wall count differs from the sketch (unknown cells never count)."""
    got = board.clues_of(walls)
    return [(r, c) for r in range(board.H) for c in range(board.W)
            if sketch[r][c] is not None and got[r][c] != sketch[r][c]]


def fit(sketch, entry: Opening, exit: Opening, seed=0, steps=200_000, log=print):
    """The valid maze closest to a hand-made grid (None = unreadable cell).

    First looks for a maze matching every readable number exactly. If there is none,
    searches perfect mazes (swapping one passage at a time) for the fewest changed
    numbers. Returns (board, walls, hints, changed_cells).
    """
    board = Board(len(sketch[0]), len(sketch), entry, exit)
    rng = random.Random(seed)
    exact = solve(board, sketch, limit=1)
    if exact:
        walls = exact[0]
        log("an exact match exists: every readable number is kept")
    else:
        walls = _anneal(board, sketch, rng, steps, log)
    return board, walls, hints_for(board, walls, rng), _mismatch(board, walls, sketch)


def _anneal(board: Board, sketch, rng, steps, log):
    """Simulated annealing over perfect mazes, minimising changed numbers."""
    import math
    cells = [(r, c) for r in range(board.CH) for c in range(board.CW)]
    pairs = [(a, b) for a in cells for b in ((a[0], a[1] + 1), (a[0] + 1, a[1])) if b[0] < board.CH and b[1] < board.CW]
    walls = board.carve(rng)
    passages = {p for p in pairs if board.wall_between(*p) not in walls}

    def cost(ws):
        got = board.clues_of(ws)
        return sum(abs(got[r][c] - sketch[r][c]) + 1 for r in range(board.H) for c in range(board.W)
                   if sketch[r][c] is not None and got[r][c] != sketch[r][c])

    def component(start, ps):
        adj = {}
        for a, b in ps: adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
        seen, stack = {start}, [start]
        while stack:
            for v in adj.get(stack.pop(), []):
                if v not in seen: seen.add(v); stack.append(v)
        return seen

    cur = best = cost(walls)
    best_walls = set(walls)
    for step in range(steps):
        t = max(0.05, 2.0 * (1 - step / steps))
        cut = rng.choice(sorted(passages))
        rest = passages - {cut}
        side = component(cut[0], rest)
        options = [p for p in pairs if (p[0] in side) != (p[1] in side) and p != cut]
        add = rng.choice(options)
        new_passages = rest | {add}
        new_walls = (walls - {board.wall_between(*add)}) | {board.wall_between(*cut)}
        new = cost(new_walls)
        if new <= cur or rng.random() < math.exp((cur - new) / t):
            passages, walls, cur = new_passages, new_walls, new
            if cur < best:
                best, best_walls = cur, set(walls)
                log(f"  step {step}: {len(_mismatch(board, walls, sketch))} numbers differ")
                if best == 0: break
    return best_walls
