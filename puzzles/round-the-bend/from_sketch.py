"""Turn the hand-drawn Round the Bend grids into levels.

    python3 puzzles/round-the-bend/from_sketch.py

Reads the transcriptions in scans/ (local only) and keeps every drawn black cell and
wall where possible. When a sketch includes its drawn solution ("loop"), walls are added
so that loop is the only one; otherwise puzzles/lib/lazy_river.fit adds the fewest walls
for a single loop, and a grid that can't hold any loop gets the fewest black-cell
toggles first. Walls left touching a black cell do nothing and are dropped.
The Astro build re-checks that each level has exactly one loop.
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "puzzles" / "lib"))
import lazy_river as lr  # noqa: E402

GAME2 = "scans/game2/rivers-transcription.json"
BATCH3 = "scans/batch3/rivers-transcription.json"
LEVELS = [  # (level, transcription, sketch key, name, source)
    (1, GAME2, "D", "Little Pond", "scans/game2/20261004214832_003.pdf (grid D)"),
    (2, GAME2, "C", "Stepping Stones", "scans/game2/20261004214832_003.pdf (grid C)"),
    (3, GAME2, "B", "Canyon Run", "scans/game2/20261004214832_003.pdf (grid B)"),
    (4, GAME2, "A", "Long Bend", "scans/game2/20261004214832_003.pdf (grid A)"),
    (5, BATCH3, "IMG_0337", "Twin Peaks", "scans/batch3/IMG_0337.heic"),
    (6, BATCH3, "IMG_0338", "Narrow Pass", "scans/batch3/IMG_0338.heic"),
    (7, BATCH3, "IMG_0339", "Little Loop", "scans/batch3/IMG_0339.heic"),
    (8, BATCH3, "IMG_0340", "Six Rows Down", "scans/batch3/IMG_0340.heic"),
]
only = {int(a) for a in sys.argv[1:]}   # optional: level numbers to (re)make


def from_loop(grid, walls, loop, seed=0, tries=30):
    """Fewest added walls that make the drawn loop the only one."""
    pairs = [[loop[i], loop[(i + 1) % len(loop)]] for i in range(len(loop))]
    rng = random.Random(seed)
    best = min((lr.unique_walls(grid, walls, pairs, random.Random(rng.random())) for _ in range(tries)), key=len)
    return grid, best, best[len(walls):], []


for n, file, key, name, source in LEVELS:
    if only and n not in only:
        continue
    g = json.loads((ROOT / file).read_text())[key]
    if "loop" in g:
        grid, walls, added, toggled = from_loop(g["grid"], g["walls"], g["loop"])
    else:
        best = None
        for seed in range(6):
            grid, walls, added, toggled = lr.fit(g["grid"], g["walls"], seed=seed, tries=15)
            if best is None or len(added) < len(best[2]):
                best = (grid, walls, added, toggled)
        grid, walls, added, toggled = best
    walls = [w for w in walls if all(grid[r][c] != "#" for r, c in w)]
    ok, msg = lr.check({"grid": grid, "walls": walls})
    assert ok, (key, msg)
    # grid engine format (src/engine): rocks are "block" cells, walls are "wall" borders
    givens = [{"at": "cell", "cell": [r, c], "kind": "block"} for r, row in enumerate(grid) for c, ch in enumerate(row) if ch == "#"]
    givens += [{"at": "border", "cells": [list(a), list(b)], "kind": "wall"} for a, b in walls]
    level = {"type": "grid", "name": name, "meta": f"{len(grid[0])} × {len(grid)}", "source": source,
             "grid": {"size": [len(grid), len(grid[0])], "givens": givens}}
    (ROOT / "src" / "games" / "round-the-bend" / f"{n}.json").write_text(json.dumps(level, indent=2) + "\n")
    print(f"{n} {name} ({key}): {msg}; added walls {added}; toggled cells {toggled}")
