# What a person sees at a glance, as input for the graph network (graph_policy.py, GRAPH_STRUCTURE=1):
# from each state's known marks and the puzzle's structure, the groups of known cells and their
# size and ways out, how much room a number still needs and how far it can reach, a sight clue's
# least and most it can see, and the pieces of line with their ends. Keyed on mark kind (shaded,
# paint, line, fence, cut) and rule primitive (signatures.ts), never on a type's name; square grids
# only (cell r * cols + c), other grids get zeros.
#
#   python structure.py --selftest        hand-made states with known answers
#   python structure.py --bench file...   the cost over every state of graph records (.jsonl)
#
# Per cell (CELL numbers):
#   0  known shaded (shaded true, or the first of two paint colours)
#   1  its shaded group's size, log1p / 4
#   2-5  the group's ways out (distinct open cells next to it): 0, 1, 2, 3+ (one-hot)
#   6  known unshaded (shaded false; also a cell with no shading mark that isn't a block: a clue)
#   7  its unshaded group's size, log1p / 4
#   8-11 its ways out, as 2-5
#   12 open cell: distinct shaded groups next to it, min(n, 4) / 4
#   13 open cell: distinct unshaded groups next to it, min(n, 4) / 4
#   14 open cell: distinct unshaded groups holding a number next to it, min(n, 2) / 2
#   Size clues (a puzzle with a "size" rule; the group is the unshaded group, or with cut marks the
#   region joined by known uncut borders):
#   15 the cell's group holds exactly one number
#   16 room: that number minus the group's size, clip(-2, 8) / 8
#   17 the group holds two or more numbers
#   18 reach: cells the group could still take within `room` steps (through cells that aren't
#      shaded, blocks, or another numbered group or next to one; with cuts, across borders not known
#      cut, not into another numbered region), log1p / 4
#   19 slack: size + reach - number, clip(-2, 8) / 8 (0: every reachable cell is needed)
#   20 open cell: numbered groups that can reach it, min(n, 3) / 3
#   Sight clues (a puzzle with a "sight" rule and no "count" or "size" rule; the number cell):
#   21 a sight clue
#   22 need: the number minus the cells it surely sees (itself and known unshaded runs in 4
#      directions), clip(0, 8) / 8
#   23 spare: the most it could see (runs through cells not known shaded) minus the number, clip(0, 8) / 8
#   24 need is 0;  25 spare is 0
#   Lines (line marks join cells; fence marks join corners, and a cell takes the max over its 4):
#   26 known line degree, min(d, 4) / 4
#   27 the end of a line piece (degree 1)
#   28 the piece's size in nodes, log1p / 4
#   29 the Manhattan distance between the piece's two ends / (rows + cols)
#   30 open line ends: open line marks at the node, min(n, 4) / 4
#   31 two ends of one piece both reach this node by open marks (or it's an end and reaches the
#      other): a line through it closes a loop
#   Regions (cut marks):
#   32 the region's size (cells joined by known uncut borders), log1p / 4
#   33-36 the region's ways out (open cut marks on its edge): 0, 1, 2, 3+ (one-hot)
# Per mark (MARK numbers; line, fence and cut marks, zeros for the rest):
#   0  of its two ends, how many are a piece's end, / 2
#   1  both ends already in one piece (a line: it closes a loop; a cut: the border is inside a region)
#   2  both ends are ends of different pieces (a line joins them)
#   3  an end already has 2 or more lines
#   4  fewest open marks at either end, min(n, 4) / 4
#   5  a cut whose two regions joined would be bigger than a number in them
#   6  a cut between two regions that each hold a number
import json, os, re, sys, time
from collections import deque
import numpy as np

CELL, MARK = 37, 7
HERE = os.path.dirname(os.path.abspath(__file__))
PRIM = {}
for line in open(os.path.join(HERE, "signatures.ts")):
    for k, v in re.findall(r'"?([a-z0-9-]+)"?: "([a-z-]+)"', line):
        if v in ("count", "each-once", "pattern", "connect", "size", "sum", "sight", "order"): PRIM[k] = v
CACHE = 64   # states remembered per puzzle (more, e.g. hide and fill's random ones, are computed each time)

def find(p, x):
    while p[x] != x: p[x] = p[p[x]]; x = p[x]
    return x

def components(n, a, b):
    """Labels (the smallest member) of n nodes joined by edges a[i]–b[i]."""
    p = list(range(n))
    for u, v in zip(a.tolist(), b.tolist()):
        ru, rv = find(p, u), find(p, v)
        if ru != rv:
            if ru < rv: p[rv] = ru
            else: p[ru] = rv
    return np.array([find(p, x) for x in range(n)])

def ways(n, lab, member, nb_a, nb_b, open_):
    """Per label: distinct open nodes next to a member node."""
    a, b = np.r_[nb_a, nb_b], np.r_[nb_b, nb_a]
    sel = member[a] & open_[b]
    pairs = np.unique(lab[a[sel]] * n + b[sel])
    return np.bincount(pairs // n, minlength=n)

def onehot4(k):
    out = np.zeros((len(k), 4), np.float32); out[np.arange(len(k)), np.minimum(k, 3)] = 1
    return out

class Layout:
    """A puzzle's structure, read once from its graph record; features(s) per state."""
    def __init__(self, d):
        st = d["structure"]
        self.N = N = st["cells"]; R, C = st.get("rows") or 0, st.get("cols") or 0
        self.R, self.C = R, C
        self.M = M = len(st["marks"])
        self.ok = bool(R and C and R * C == N)
        self.memo = {}
        if not self.ok: return
        idx = np.arange(N); r, c = idx // C, idx % C
        h = idx[c < C - 1]; v = idx[r < R - 1]
        self.na, self.nb = np.r_[h, v], np.r_[h + 1, v + C]   # orthogonal neighbours
        prims = {PRIM.get(g["kind"]) for g in st["groups"]}
        self.size_rule = "size" in prims
        self.sight_rule = "sight" in prims and not ({"count", "size"} & prims)
        self.num = np.full(N, -1, np.int32)
        wall = np.zeros(N, bool); given = np.zeros(N, bool)
        for (cell, kind, val) in d["givens"]:
            if kind in ("block", "blocked"): wall[cell] = True
            else: given[cell] = True
            if kind == "number" and self.num[cell] < 0: self.num[cell] = val
        # marks by kind
        sm, sc, sd, lm, la, lb, fm, cm, ca, cb, paint = [], [], [], [], [], [], [], [], [], [], []
        for i, m in enumerate(st["marks"]):
            name = m["name"]; kind = name.split("(")[0]; args = [int(x) for x in name[name.index("(") + 1:-1].split(",")]
            if kind == "shaded": sm.append(i); sc.append(args[0]); sd.append(True)
            elif kind == "paint": paint.append((i, args[0], args[1]))
            elif kind == "line" and len(m["cells"]) == 2: lm.append(i); la.append(m["cells"][0]); lb.append(m["cells"][1])
            elif kind == "fence": fm.append((i, args[0], sorted(m["cells"])))
            elif kind == "cut" and len(m["cells"]) == 2: cm.append(i); ca.append(m["cells"][0]); cb.append(m["cells"][1])
        # two paint colours act as shaded (the first) and unshaded (the second)
        if paint and {k for (_, _, k) in paint} <= {1, 2}:
            for (i, cell, k) in paint: sm.append(i); sc.append(cell); sd.append(k == 1)
        self.sm, self.sc, self.sd = np.array(sm, int), np.array(sc, int), np.array(sd, bool)
        if sm:
            # cells without a shading mark: blocks are walls, the rest (clues) unshaded
            self.base = np.where(wall, 3, 2).astype(np.int8)
            self.base[self.sc] = 0
        # line pieces: line marks join cells; fence marks join the grid's corners
        self.graphs = []
        if lm:
            self.graphs.append((np.array(lm), np.array(la), np.array(lb), N, r, c, None))
        if fm:
            K = C + 1; ok, fa, fb, fi = True, [], [], []
            for (i, b, cells) in fm:
                if b < (R + 1) * C:
                    rr, cc = divmod(b, C); u, w = rr * K + cc, rr * K + cc + 1
                    want = sorted(x for x in ((rr - 1) * C + cc if rr > 0 else None, rr * C + cc if rr < R else None) if x is not None)
                else:
                    rr, cc = divmod(b - (R + 1) * C, K); u, w = rr * K + cc, (rr + 1) * K + cc
                    want = sorted(x for x in (rr * C + cc - 1 if cc > 0 else None, rr * C + cc if cc < C else None) if x is not None)
                if rr > R or want != cells: ok = False; break
                fi.append(i); fa.append(u); fb.append(w)
            if ok:
                corners = np.arange((R + 1) * K)
                # each cell's four corners
                cell_corners = np.stack([r * K + c, r * K + c + 1, (r + 1) * K + c, (r + 1) * K + c + 1], 1)
                self.graphs.append((np.array(fi), np.array(fa), np.array(fb), len(corners), corners // K, corners % K, cell_corners))
        self.cm, self.ca, self.cb = np.array(cm, int), np.array(ca, int), np.array(cb, int)

    def features(self, s):
        """(cell features [N, CELL], mark features [M, MARK]) for state s (0 open, 1 true, 2 false), in
        half precision, remembered for the puzzle's first CACHE states."""
        key = s.tobytes()
        if key in self.memo: return self.memo[key]
        f = tuple(x.astype(np.float16) for x in self._features(s))   # half precision: memory
        if len(self.memo) < CACHE: self.memo[key] = f
        return f

    def _features(self, s):
        N, M = self.N, self.M
        cf, mf = np.zeros((N, CELL), np.float32), np.zeros((M, MARK), np.float32)
        if not self.ok: return cf, mf
        s = np.asarray(s)
        groups = None   # (label per cell, member mask) of the groups size clues count in
        if len(self.sm):
            st = self.base.copy()
            v = s[self.sm]
            dark = ((v == 1) & self.sd) | ((v == 2) & ~self.sd); light = ((v == 2) & self.sd) | ((v == 1) & ~self.sd)
            st[self.sc[dark]] = 1; st[self.sc[light]] = 2
            open_ = st == 0
            for kind, col in ((1, 0), (2, 6)):
                mem = st == kind
                e = mem[self.na] & mem[self.nb]
                lab = components(N, self.na[e], self.nb[e])
                size = np.bincount(lab[mem], minlength=N)
                w = ways(N, lab, mem, self.na, self.nb, open_)
                cf[mem, col] = 1
                cf[mem, col + 1] = np.log1p(size[lab[mem]]) / 4
                cf[mem, col + 2:col + 6] = onehot4(w[lab[mem]])
                # open cells: distinct groups next to them
                a, b = np.r_[self.na, self.nb], np.r_[self.nb, self.na]
                sel = open_[a] & mem[b]
                pairs = np.unique(a[sel] * N + lab[b[sel]])
                cf[:, 12 if kind == 1 else 13] = np.minimum(np.bincount(pairs // N, minlength=N), 4) / 4
                if kind == 2:
                    light_lab, light_mem = lab, mem
                    # and distinct unshaded groups holding a number
                    numbered = np.zeros(N, bool); numbered[lab[mem & (self.num >= 0)]] = True
                    sel &= numbered[lab[b]]
                    pairs = np.unique(a[sel] * N + lab[b[sel]])
                    cf[:, 14] = np.minimum(np.bincount(pairs // N, minlength=N), 2) / 2
            if self.size_rule: groups = (light_lab, light_mem, "shade", st)
            if self.sight_rule: self._sight(cf, st)
        if len(self.cm):
            cv = s[self.cm]
            e = cv == 2
            lab = components(N, self.ca[e], self.cb[e])
            size = np.bincount(lab, minlength=N)
            o = cv == 0
            # ways out: open cut marks with the region on one side
            pairs = np.unique(np.r_[lab[self.ca[o]] * M + self.cm[o], lab[self.cb[o]] * M + self.cm[o]])
            w = np.bincount(pairs // M, minlength=N)
            cf[:, 32] = np.log1p(size[lab]) / 4
            cf[:, 33:37] = onehot4(w[lab])
            mf[self.cm, 1] = lab[self.ca] == lab[self.cb]
            if self.size_rule:
                groups = (lab, np.ones(N, bool), "cut", cv)
                hasnum = self.num >= 0
                cnt = np.bincount(lab[hasnum], minlength=N)
                val = np.full(N, -1); val[lab[hasnum]] = self.num[hasnum]
                ra, rb = lab[self.ca], lab[self.cb]
                diff = ra != rb
                big = ((val[ra] >= 0) & (size[ra] + size[rb] > val[ra])) | ((val[rb] >= 0) & (size[ra] + size[rb] > val[rb]))
                mf[self.cm, 5] = diff & big
                mf[self.cm, 6] = diff & (cnt[ra] > 0) & (cnt[rb] > 0)
        if groups is not None: self._size(cf, *groups)
        for g in self.graphs: self._lines(cf, mf, s, *g)
        return cf, mf

    def _size(self, cf, lab, mem, kind, st):
        """Size clues: room, reach and slack of each numbered group."""
        N, C = self.N, self.C
        hasnum = (self.num >= 0) & mem
        cnt = np.bincount(lab[hasnum], minlength=N)
        size = np.bincount(lab[mem], minlength=N)
        val = np.full(N, -1); val[lab[hasnum]] = self.num[hasnum]
        g = mem & (cnt[lab] > 0)
        one = g & (cnt[lab] == 1)
        cf[one, 15] = 1
        cf[one, 16] = np.clip(val[lab[one]] - size[lab[one]], -2, 8) / 8
        cf[g & (cnt[lab] > 1), 17] = 1
        numbered = np.zeros(N, bool); numbered[lab[g]] = True   # labels of numbered groups
        if kind == "shade":
            # a cell can join a numbered group if it isn't shaded or a wall, isn't in or next to another numbered group
            nbrs = [[] for _ in range(N)]
            for u, w in zip(self.na.tolist(), self.nb.tolist()): nbrs[u].append(w); nbrs[w].append(u)
            near = [set(lab[w] for w in nbrs[x] if g[w]) for x in range(N)]
            passable = lambda x, L: st[x] in (0, 2) and not (g[x] and lab[x] != L) and near[x] <= {L}
        else:
            # across borders not known cut
            nbrs = [[] for _ in range(N)]
            for u, w, cv in zip(self.ca.tolist(), self.cb.tolist(), st.tolist()):
                if cv != 1: nbrs[u].append(w); nbrs[w].append(u)
            passable = lambda x, L: not (g[x] and lab[x] != L)
        reached = np.zeros(N, np.int32)
        for L in np.unique(lab[one]).tolist():
            room = val[L] - size[L]
            cells = np.nonzero(mem & (lab == L))[0]
            seen = set(cells.tolist()); q = deque((x, 0) for x in cells.tolist()); got = 0
            while q:
                x, dpt = q.popleft()
                if dpt >= room: continue
                for w in nbrs[x]:
                    if w in seen or not passable(w, L): continue
                    seen.add(w); got += 1; q.append((w, dpt + 1)); reached[w] += 1
            cf[cells, 18] = np.log1p(got) / 4
            cf[cells, 19] = np.clip(size[L] + got - val[L], -2, 8) / 8
        open_ = (st == 0) if kind == "shade" else np.ones(N, bool)
        cf[:, 20] = np.where(open_ & ~g, np.minimum(reached, 3) / 3, 0)

    def _sight(self, cf, st):
        """Sight clues: the least and most each number cell sees (itself and runs in four directions)."""
        R, C = self.R, self.C
        grid = st.reshape(R, C)
        for x in np.nonzero(self.num >= 0)[0].tolist():
            r, c = divmod(x, C); lo = hi = 1
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr, cc, sure = r + dr, c + dc, True
                while 0 <= rr < R and 0 <= cc < C and grid[rr, cc] in (0, 2):
                    if grid[rr, cc] == 2 and sure: lo += 1
                    else: sure = False
                    hi += 1; rr += dr; cc += dc
            need, spare = self.num[x] - lo, hi - self.num[x]
            cf[x, 21] = 1
            cf[x, 22] = np.clip(need, 0, 8) / 8; cf[x, 23] = np.clip(spare, 0, 8) / 8
            cf[x, 24] = need == 0; cf[x, 25] = spare == 0

    def _lines(self, cf, mf, s, mi, a, b, n, nr, nc, cell_nodes):
        """Pieces of line: degree, ends, size, the distance between the ends, loop closers."""
        v = s[mi]; t, o = v == 1, v == 0
        deg = np.bincount(np.r_[a[t], b[t]], minlength=n); odeg = np.bincount(np.r_[a[o], b[o]], minlength=n)
        lab = components(n, a[t], b[t])
        on = deg > 0
        size = np.bincount(lab[on], minlength=n)
        end = deg == 1
        # each piece's two ends and the distance between them
        ends = np.nonzero(end)[0]; ecount = np.bincount(lab[ends], minlength=n)
        dist = np.zeros(n, np.float32)
        two = ends[ecount[lab[ends]] == 2]
        if len(two):
            order = two[np.argsort(lab[two], kind="stable")]
            p, q = order[0::2], order[1::2]
            dist[lab[p]] = (np.abs(nr[p] - nr[q]) + np.abs(nc[p] - nc[q])) / (self.R + self.C)
        nf = np.zeros((n, 6), np.float32)
        nf[:, 0] = np.minimum(deg, 4) / 4; nf[:, 1] = end
        nf[on, 2] = np.log1p(size[lab[on]]) / 4; nf[on, 3] = dist[lab[on]]
        nf[:, 4] = np.minimum(odeg, 4) / 4
        # loop closers: a node reaching two ends of one piece by open marks (or being one end and
        # reaching the other)
        oa, ob = a[o], b[o]
        src, dst = np.r_[oa, ob], np.r_[ob, oa]
        sel = end[dst]
        pairs = np.r_[src[sel] * n + lab[dst[sel]], ends * n + lab[ends]]
        u, k = np.unique(pairs, return_counts=True)
        nf[u[k >= 2] // n, 5] = 1
        if cell_nodes is None: cf[:, 26:32] = np.maximum(cf[:, 26:32], nf)
        else: cf[:, 26:32] = np.maximum(cf[:, 26:32], nf[cell_nodes].max(1))
        # per mark
        mf[mi, 0] = (end[a].astype(np.float32) + end[b]) / 2
        mf[mi, 1] = on[a] & on[b] & (lab[a] == lab[b])
        mf[mi, 2] = end[a] & end[b] & (lab[a] != lab[b])
        mf[mi, 3] = (deg[a] >= 2) | (deg[b] >= 2)
        mf[mi, 4] = np.minimum(np.minimum(odeg[a], odeg[b]), 4) / 4

# ---- checks ----
def record(rows, cols, marks, givens=(), groups=()):
    """A hand-made graph record: marks as (name, cells)."""
    return {"structure": {"cells": rows * cols, "rows": rows, "cols": cols, "marks": [{"name": n, "cells": c} for n, c in marks],
                          "groups": [{"kind": k, "label": "the whole grid", "cells": []} for k in groups]}, "givens": list(givens)}

def state(d, known):
    """State array from {mark name: True/False}."""
    names = [m["name"] for m in d["structure"]["marks"]]
    s = np.zeros(len(names), np.int8)
    for k, v in known.items(): s[names.index(k)] = 1 if v else 2
    return s

def selftest():
    fails = []
    def eq(what, got, want):
        ok = np.allclose(np.asarray(got, np.float32), want, atol=2e-3)   # half precision
        print(f"  {'ok  ' if ok else 'FAIL'} {what}: {np.round(got, 4).tolist()}" + ("" if ok else f" (want {want})"))
        if not ok: fails.append(what)
    lg = lambda x: np.log1p(x) / 4
    # Nurikabe, 3 × 4: a 3 at r0c0 with r0c1 unshaded (island of 2, room 1), r1c0 shaded, a 1 at r2c3
    #   3 ○ . .
    #   ● . . .
    #   . . . 1
    print("nurikabe")
    clues = {0: 3, 11: 1}
    d = record(3, 4, [(f"shaded({i})", [i]) for i in range(12) if i not in clues], [[i, "number", v] for i, v in clues.items()], ["size-clue", "connected", "no-pool"])
    L = Layout(d); cf, mf = L.features(state(d, {"shaded(1)": False, "shaded(4)": True}))
    eq("island r0c0: unshaded, size 2, ways out 2 (r0c2, r1c1)", cf[0, 6:12], [1, lg(2), 0, 0, 1, 0])
    eq("island r0c0: one number, room 1, reach 2 (r0c2, r1c1), slack 1", cf[0, 15:20], [1, 1 / 8, 0, lg(2), 1 / 8])
    eq("the 1 at r2c3: room 0, reach 0, slack 0", cf[11, 15:20], [1, 0, 0, 0, 0])
    eq("shaded r1c0: size 1, ways out 2 (r2c0, r1c1)", cf[4, 0:6], [1, lg(1), 0, 0, 1, 0])
    eq("open r1c1: next to 1 shaded, 1 unshaded, 1 numbered", cf[5, 12:15], [1 / 4, 1 / 4, 1 / 2])
    eq("open r1c1, r0c2 reachable by one numbered group; r2c0 by none", cf[[5, 2, 8], 20], [1 / 3, 1 / 3, 0])
    eq("open r1c3 next to the 1: an unshaded group", cf[7, 13], 1 / 4)
    eq("no line or cut features", np.abs(cf[:, 26:]).sum(), 0)
    # Cave, 1 × 5: a 3 at c2; c1 unshaded, c3 shaded: sees 2 surely, 3 at most
    print("cave")
    d = record(1, 5, [(f"shaded({i})", [i]) for i in (0, 1, 3, 4)], [[2, "number", 3]], ["sight", "unshaded-connected", "shaded-to-edge"])
    cf, _ = Layout(d).features(state(d, {"shaded(1)": False, "shaded(3)": True}))
    eq("sight clue: need 1, spare 0", cf[2, 21:26], [1, 1 / 8, 0, 0, 1])
    eq("the 3 is unshaded, in a group of 2 with 1 way out", cf[2, 6:12], [1, lg(2), 0, 1, 0, 0])
    eq("no size features without a size rule", cf[:, 15:21].sum(), 0)
    # Simple loop, 3 × 3, line marks between neighbours: a U through r0c0 r1c0 r1c1 r1c2 r0c2
    print("lines")
    pairs = [(i, i + 1) for i in range(9) if i % 3 < 2] + [(i, i + 3) for i in range(6)]
    marks = [(f"line({k})", list(p)) for k, p in enumerate(pairs)]
    d = record(3, 3, marks, [], ["loop"])
    name = lambda a, b: f"line({pairs.index((a, b))})"
    cf, mf = Layout(d).features(state(d, {name(0, 3): True, name(3, 4): True, name(4, 5): True, name(2, 5): True}))
    eq("r0c0: an end, degree 1, piece of 5, ends 2 apart of 6", cf[0, 26:30], [1 / 4, 1, lg(5), 2 / 6])
    eq("r1c1: degree 2, not an end", cf[4, 26:28], [2 / 4, 0])
    eq("r0c1 touches both ends by open lines: closes a loop", cf[1, 31], 1)
    eq("r2c0 doesn't", cf[6, 31], 0)
    eq("line r0c0–r0c1: one end, not one piece", mf[pairs.index((0, 1)), 0:3], [0.5, 0, 0])
    eq("line r1c1–r2c1: an end has 2 lines", mf[pairs.index((4, 7)), 3], 1)
    cf, mf = Layout(d).features(state(d, {name(0, 3): True, name(3, 4): True, name(1, 4): True}))
    eq("line r0c0–r0c1 joins one piece's two ends: closes a loop", mf[pairs.index((0, 1)), 0:3], [1, 1, 0])
    # Slitherlink, 1 × 1: top and left fences (corners (0,1)–(0,0)–(1,0))
    print("fences")
    d = record(1, 1, [(f"fence({b})", [0]) for b in range(4)], [], ["loop", "sides"])
    cf, mf = Layout(d).features(state(d, {"fence(0)": True, "fence(2)": True}))
    eq("bottom and right each touch one end", mf[[1, 3], 0], [0.5, 0.5])
    eq("the cell: max over corners (degree 2, an end, piece of 3, ends 2 apart, 2 open, closes)", cf[0, 26:32], [2 / 4, 1, lg(3), 1, 2 / 4, 1])
    cf, mf = Layout(d).features(state(d, {"fence(0)": True, "fence(2)": True, "fence(1)": True}))
    eq("right closes the loop", mf[3, 0:3], [1, 1, 0])
    # Shikaku, 2 × 3: a 2 at r0c0, uncut to r0c1; a 4 at r1c2
    #   2 . .
    #   . . 4
    print("cuts")
    pairs = [(i, i + 3) for i in range(3)] + [(i, i + 1) for i in range(6) if i % 3 < 2]
    d = record(2, 3, [(f"cut({k})", list(p)) for k, p in enumerate(pairs)], [[0, "number", 2], [5, "number", 4]], ["rectangles"])
    cut = lambda a, b: pairs.index((a, b))
    cf, mf = Layout(d).features(state(d, {f"cut({cut(0, 1)})": False}))
    eq("region of the 2: size 2, ways out 3+", cf[0, 32:37], [lg(2), 0, 0, 0, 1])
    eq("region of the 2: room 0", cf[1, 15:17], [1, 0])
    eq("the 4: room 3, reach 3 (r0c2, r1c1, r1c0), slack 0", cf[5, 15:20], [1, 3 / 8, 0, lg(3), 0])
    eq("cut r0c1–r0c2: joined would be 3 > 2", mf[cut(1, 2), 5:7], [1, 0])
    eq("cut r0c2–r1c2: joined 2 ≤ 4", mf[cut(2, 5), 5:7], [0, 0])
    eq("cut r0c0–r0c1 is inside the region", mf[cut(0, 1), 1], 1)
    cf, mf = Layout(d).features(state(d, {f"cut({cut(0, 1)})": False, f"cut({cut(1, 4)})": False}))
    eq("cut r1c1–r1c2 between two numbered regions", mf[cut(4, 5), 6], 1)
    eq("region of the 2 now 3: room -1", cf[0, 16], -1 / 8)
    # not a square grid: zeros
    d = {"structure": {"cells": 3, "rows": 0, "cols": 0, "marks": [{"name": "shaded(0)", "cells": [0]}], "groups": []}, "givens": []}
    cf, mf = Layout(d).features(np.zeros(1, np.int8))
    eq("other grids: zeros", [cf.sum(), mf.sum(), cf.shape[1], mf.shape[1]], [0, 0, CELL, MARK])
    print(f"\n{'all passed' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    return not fails

def bench(files):
    """The cost of every state of the given records, per type."""
    from collections import defaultdict
    t_lay = t_feat = 0.0; n_states = size = 0; per = defaultdict(lambda: [0, 0.0])
    for f in files:
        for line in open(f):
            if not line.strip(): continue
            d = json.loads(line)
            t0 = time.time(); L = Layout(d); t_lay += time.time() - t0
            names = {m["name"]: i for i, m in enumerate(d["structure"]["marks"])}
            s = np.zeros(len(names), np.int8)
            for x in d["initial"]:
                name, v = x.rsplit("=", 1) if isinstance(x, str) else (x[0], "true" if x[1] else "false")
                if name in names: s[names[name]] = 1 if v == "true" else 2
            for rd in d["rounds"]:
                t0 = time.time(); cf, mf = L._features(s); dt = time.time() - t0
                t_feat += dt; n_states += 1; per[d["genre"]][0] += 1; per[d["genre"]][1] += dt; size += 2 * (cf.size + mf.size)
                for (name, v, _, _) in rd["facts"]:
                    if name in names: s[names[name]] = 1 if v else 2
    print(f"{n_states} states: layouts {t_lay:.1f} s, features {t_feat:.1f} s ({1e3 * t_feat / max(1, n_states):.2f} ms a state); {size / 1e6:.0f} MB cached at half precision")
    for g, (n, t) in sorted(per.items(), key=lambda x: -x[1][1])[:12]: print(f"  {g}: {n} states, {1e3 * t / n:.2f} ms a state")

if __name__ == "__main__":
    if "--selftest" in sys.argv: sys.exit(0 if selftest() else 1)
    elif "--bench" in sys.argv: bench(sys.argv[sys.argv.index("--bench") + 1:])
    else: print(__doc__ or "python structure.py --selftest | --bench file...")
