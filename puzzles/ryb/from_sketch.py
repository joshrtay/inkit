"""Turn the three hand-drawn RYB figures (scans/game2/..._002.pdf) into levels 4-6.

    python3 puzzles/ryb/from_sketch.py

Pieces are traced from the sketch in its own pixel coordinates. Overlapping outlines
cut the figures into pieces; a circle inside a triangle becomes the circle plus three
corner pieces. Every number drawn in the sketch is kept as written (1 red, 2 yellow,
3 blue). Where the sketch's clues allow more than one coloring, the fewest extra dots
are added to blank pieces until exactly one coloring fits and it can be reached step
by step without guessing. The Astro build re-checks uniqueness.
"""
import json
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "src" / "games" / "ryb"


# ---- geometry ----
def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def on_segment_x(a, b, x):
    return lerp(a, b, (x - a[0]) / (b[0] - a[0]))


def on_segment_y(a, b, y):
    return lerp(a, b, (y - a[1]) / (b[1] - a[1]))


def shares_edge(a1, a2, b1, b2, tol):
    """Same rule as src/game-types/ryb/solver.ts: collinear within tol, overlapping > 2 tol."""
    dx, dy = a2[0] - a1[0], a2[1] - a1[1]
    ln = math.hypot(dx, dy)
    cross = lambda p: (dx * (p[1] - a1[1]) - dy * (p[0] - a1[0])) / ln
    if abs(cross(b1)) > tol or abs(cross(b2)) > tol:
        return False
    along = lambda p: (dx * (p[0] - a1[0]) + dy * (p[1] - a1[1])) / ln
    lo, hi = max(0, min(along(b1), along(b2))), min(ln, max(along(b1), along(b2)))
    return hi - lo > 2 * tol


def adjacency(polys):
    xs = [p[0] for poly in polys for p in poly]; ys = [p[1] for poly in polys for p in poly]
    tol = max(max(xs) - min(xs), max(ys) - min(ys)) * 1e-3
    polys = [[(round(x, 1), round(y, 1)) for x, y in poly] for poly in polys]   # as written to JSON
    edges = [[(p[i], p[(i + 1) % len(p)]) for i in range(len(p))] for p in polys]
    return [[j for j in range(len(polys)) if j != i and
             any(shares_edge(a, b, c, d, tol) for a, b in edges[i] for c, d in edges[j])] for i in range(len(polys))]


def incircle_split(A, B, C, steps=8):
    """A triangle cut by its inscribed circle: [circle, corner at A, corner at B, corner at C].
    The circle is a polygon through the three tangent points; each corner piece shares
    the circle's arc between its two tangent points."""
    a, b, c = math.dist(B, C), math.dist(C, A), math.dist(A, B)
    s = (a + b + c) / 2
    I = ((a * A[0] + b * B[0] + c * C[0]) / (2 * s), (a * A[1] + b * B[1] + c * C[1]) / (2 * s))
    r = math.sqrt((s - a) * (s - b) * (s - c) / s)
    foot = lambda P, Q: lerp(P, Q, ((I[0] - P[0]) * (Q[0] - P[0]) + (I[1] - P[1]) * (Q[1] - P[1])) / math.dist(P, Q) ** 2)
    tAB, tBC, tCA = foot(A, B), foot(B, C), foot(C, A)
    ang = lambda P: math.atan2(P[1] - I[1], P[0] - I[0])

    def arc(P, Q):  # points from P to Q the short way round, P included, Q excluded
        a0, a1 = ang(P), ang(Q)
        d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        return [(I[0] + r * math.cos(a0 + d * k / steps), I[1] + r * math.sin(a0 + d * k / steps)) for k in range(steps)]

    circle = arc(tAB, tBC) + arc(tBC, tCA) + arc(tCA, tAB)
    corner_A = [A, tAB] + arc(tAB, tCA)[1:] + [tCA]          # arc from tAB back to tCA passes near A
    corner_B = [B, tBC] + arc(tBC, tAB)[1:] + [tAB]
    corner_C = [C, tCA] + arc(tCA, tBC)[1:] + [tBC]
    return circle, corner_A, corner_B, corner_C


# ---- the three figures (sketch pixel coordinates) ----
def figure_a():
    """Square in a kite. Square '11'; the kite's upper part '3'."""
    K1, K2, K3, K4 = (180, 205), (650, 0), (735, 240), (100, 555)
    S2, S4 = (405, 200), (215, 400)
    S3 = on_segment_x(K3, K4, 430)                     # square corner sits on the kite's lower edge
    pieces = [[K1, S2, S3, S4], [K1, K2, K3, S3, S2], [K1, S4, S3, K4]]
    return pieces, ["11", "3", ""]


def figure_b():
    """Envelope: frame, big tilted square '1113', small square '1' in the top-right corner."""
    TL, TR, BR, BL = (20, 50), (520, 60), (470, 495), (65, 395)
    DL = (70, 205)
    DT = on_segment_x(TL, TR, 230)
    DR = on_segment_y(TR, BR, 300)
    DB = (230, 400)
    SmT = on_segment_x(TL, TR, 375)
    SmR = on_segment_y(TR, BR, 155)
    SmL = on_segment_x(DT, DR, 310)
    SmB = on_segment_x(DT, DR, 425)
    pieces = [
        [DL, DT, SmL, SmB, DR, DB],     # big square (its top-right side is split by the small square)
        [SmL, SmT, SmR, SmB],           # small square
        [TL, DT, DL],                   # top-left corner
        [DL, DB, BL],                   # bottom-left corner
        [DB, DR, BR],                   # bottom-right corner
        [DT, SmT, SmL],                 # sliver left of the small square
        [SmT, TR, SmR],                 # top-right corner
        [SmB, SmR, DR],                 # sliver below the small square
    ]
    return pieces, ["1113", "1", "", "", "", "", "", ""]


def figure_c():
    """House: vertical split, tilted square '33', circles '21' (left) and '13' (top)."""
    L, TLc, TRc, BRc, BLc = (40, 195), (160, 75), (445, 55), (460, 350), (200, 355)
    DT = on_segment_x(TLc, TRc, 290)
    DR = on_segment_y(TRc, BRc, 195)
    DB = on_segment_x(BLc, BRc, 330)
    DL = on_segment_y(TLc, BLc, 215)                   # the square's left corner touches the vertical line
    left = incircle_split(L, TLc, BLc)                 # circle '21' in the left triangle
    top = incircle_split(TLc, DT, DL)                  # circle '13' in the top triangle
    pieces = [
        [DT, DR, DB, DL],                              # tilted square
        left[0], left[1], left[2], left[3],
        top[0], top[1], top[2], top[3],
        [DT, TRc, DR],                                 # top-right corner
        [DR, BRc, DB],                                 # bottom-right corner
        [DL, DB, BLc],                                 # lower triangle by the vertical line
    ]
    clues = ["33", "12", "", "", "", "13", "", "", "", "", "", ""]
    return pieces, clues


# ---- solving and clue design ----
def solutions(nb, clues, fixed=None, limit=10 ** 6):
    n = len(nb)
    need = [[0, c.count("1"), c.count("2"), c.count("3")] for c in clues]
    col = [0] * n
    for i, c in (fixed or {}).items(): col[i] = c
    order = [i for i in sorted(range(n), key=lambda i: -len(nb[i])) if not col[i]]
    out = []

    def ok(i):
        have, opn = [0] * 4, 0
        for j in nb[i]:
            if col[j]: have[col[j]] += 1
            else: opn += 1
        return sum(max(0, need[i][c] - have[c]) for c in (1, 2, 3)) <= opn

    def rec(k):
        if len(out) >= limit: return
        if k == len(order):
            if all(ok(i) for i in range(n)): out.append(col[:])
            return
        i = order[k]
        for c in (1, 2, 3):
            col[i] = c
            if ok(i) and all(ok(j) for j in nb[i]): rec(k + 1)
            col[i] = 0
    rec(0)
    return out


def guess_free(nb, clues):
    """Solvable by repeatedly painting pieces every consistent coloring agrees on."""
    fixed = {}
    while len(fixed) < len(nb):
        sols = solutions(nb, clues, fixed, limit=50000)
        if not sols: return False
        forced = {i: sols[0][i] for i in range(len(nb)) if i not in fixed and all(s[i] == sols[0][i] for s in sols)}
        if not forced: return False
        fixed.update(forced)
    return True


def room(poly):
    """Distance from the roomiest interior point to the nearest edge (grid search)."""
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    def inside(x, y):
        hit = False
        for i in range(len(poly)):
            (xi, yi), (xj, yj) = poly[i], poly[i - 1]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: hit = not hit
        return hit
    def dist(x, y):
        best = math.inf
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy or 1)))
            best = min(best, math.hypot(x - a[0] - t * dx, y - a[1] - t * dy))
        return best
    N, best = 28, 0
    for i in range(1, N):
        for j in range(1, N):
            x = min(xs) + (max(xs) - min(xs)) * i / N; y = min(ys) + (max(ys) - min(ys)) * j / N
            if inside(x, y): best = max(best, dist(x, y))
    return best


def complete(nb, clues, roomy, seed=1, tries=3000):
    """Fewest added dots giving one guess-free solution. Dots drawn in the sketch are
    always kept; extra dots go on blank pieces first, and on drawn pieces only if needed."""
    rng = random.Random(seed)
    base = solutions(nb, clues)
    assert base, "the sketch's own clues allow no coloring"
    if len(base) == 1 and guess_free(nb, clues):
        return clues, base[0]
    best = None
    for t in range(tries):
        target = rng.choice(base)
        cl = clues[:]
        allow_drawn = t % 2 == 1                       # every other try may extend drawn clues too
        order = [i for i in range(len(nb)) if (allow_drawn or not cl[i]) and roomy[i]]
        rng.shuffle(order)
        for i in order:
            if len(solutions(nb, cl, limit=2)) == 1 and guess_free(nb, cl):
                break
            free = [str(target[j]) for j in nb[i]]
            for ch in cl[i]:                           # dots already there use up matching neighbors
                if ch in free: free.remove(ch)
            if not free: continue
            rng.shuffle(free)
            cl[i] = "".join(sorted(cl[i] + "".join(free[: rng.randint(1, len(free))])))
        if solutions(nb, cl, limit=2) == [target] and guess_free(nb, cl):
            added = sum(len(c) - len(o) for c, o in zip(cl, clues))
            on_drawn = sum(len(c) - len(o) for c, o in zip(cl, clues) if o)
            score = (on_drawn, added)
            if best is None or score < best[0]:
                best = (score, cl, target)
    assert best, "could not complete the clues"
    return best[1], best[2]


def main():
    names = {4: ("Square in a Kite", figure_a), 5: ("Envelope", figure_b), 6: ("House with Circles", figure_c)}
    for n, (name, fig) in names.items():
        polys, clues = fig()
        nb = adjacency(polys)
        xs = [p[0] for poly in polys for p in poly]; ys = [p[1] for poly in polys for p in poly]
        span = max(max(xs) - min(xs), max(ys) - min(ys))
        roomy = [room(p) > span * 0.035 for p in polys]          # only pieces with space for dots
        final, sol = complete(nb, clues, roomy)
        added = [i for i, (c, o) in enumerate(zip(final, clues)) if c != o]
        level = {"type": "ryb", "name": name, "meta": f"{len(polys)} pieces · from the sketch",
                 "ryb": {"source": "scans/game2/20261004214832_002.pdf",
                         "pieces": [{"points": [[round(x, 1), round(y, 1)] for x, y in p], **({"clue": c} if c else {})}
                                    for p, c in zip(polys, final)]}}
        (OUT / f"{n}.json").write_text(json.dumps(level, indent=2) + "\n")
        print(f"{n} {name}: {len(polys)} pieces; sketch clues {[c for c in clues if c]}; "
              f"added dots on pieces {added}: {[final[i] for i in added]}; solution {sol}")


if __name__ == "__main__":
    main()
