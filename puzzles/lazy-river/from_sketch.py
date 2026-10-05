"""Turn the four hand-drawn Lazy River grids into levels 1-4.

    python3 puzzles/lazy-river/from_sketch.py

Reads the transcription in scans/game2/rivers-transcription.json (local only) and
keeps every drawn black cell and wall where possible. puzzles/lib/lazy_river.fit adds
the fewest walls for a single loop; a grid that can't hold any loop gets the fewest
black-cell toggles first. Walls left touching a black cell do nothing and are dropped.
The Astro build re-checks that each level has exactly one loop.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "puzzles" / "lib"))
import lazy_river as lr  # noqa: E402

SKETCH = json.loads((ROOT / "scans" / "game2" / "rivers-transcription.json").read_text())
LEVELS = [(1, "D", "Little Pond"), (2, "C", "Stepping Stones"), (3, "B", "Canyon Run"), (4, "A", "Long Bend")]

for n, key, name in LEVELS:
    g = SKETCH[key]
    best = None
    for seed in range(6):
        grid, walls, added, toggled = lr.fit(g["grid"], g["walls"], seed=seed, tries=15)
        if best is None or len(added) < len(best[2]):
            best = (grid, walls, added, toggled)
    grid, walls, added, toggled = best
    walls = [w for w in walls if all(grid[r][c] != "#" for r, c in w)]
    ok, msg = lr.check({"grid": grid, "walls": walls})
    assert ok, (key, msg)
    level = {"type": "lazy-river", "name": name, "meta": f"{len(grid[0])} × {len(grid)}",
             "river": {"source": f"scans/game2/20261004214832_003.pdf (grid {key})", "grid": grid, "walls": walls}}
    (ROOT / "src" / "games" / "lazy-river" / f"{n}.json").write_text(json.dumps(level, indent=2) + "\n")
    print(f"{n} {name} (sketch grid {key}): {msg}; added walls {added}; toggled cells {toggled}")
