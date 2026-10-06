"""Make a number-maze instance (src/games/number-line-maze/<n>.json) from a hand-made grid.

    python3 puzzles/number-maze/fit.py scans/game2/maze-transcription.txt \\
        --number 2 --entry top:9 --exit right:13

The grid file has one row of numbers per line; `?` marks a number that couldn't be
read, and lines starting with # are ignored. The tool finds the valid maze closest to
the grid: an exact match if one exists, otherwise the one that changes the fewest
numbers. It adds the fewest hint walls needed for a single solution, writes the
instance, and prints which numbers (if any) had to change.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import number_maze as nm  # noqa: E402

GAMES = Path(__file__).resolve().parents[2] / "src" / "games" / "number-line-maze"

ap = argparse.ArgumentParser()
ap.add_argument("grid", type=Path)
ap.add_argument("--number", type=int, required=True, help="instance number: writes src/games/number-line-maze/<n>.json")
ap.add_argument("--entry", type=nm.Opening.parse, required=True,
                help="entrance as side:square, e.g. top:9 or left:0 (square column for top/bottom, row for left/right)")
ap.add_argument("--exit", type=nm.Opening.parse, required=True, help="exit as side:square, e.g. right:13")
ap.add_argument("--seed", type=int, default=0)
ap.add_argument("--steps", type=int, default=400_000, help="search length when no exact match exists")
ap.add_argument("--name", help="display name for a new instance")
ap.add_argument("--force", action="store_true", help="replace an existing maze")
args = ap.parse_args()

sketch = [[None if v == "?" else int(v) for v in line.split()]
          for line in args.grid.read_text().splitlines() if line.strip() and not line.lstrip().startswith("#")]
if any(len(row) != len(sketch[0]) for row in sketch):
    sys.exit("every row of the grid must have the same number of entries")

board, walls, hints, changed = nm.fit(sketch, args.entry, args.exit, args.seed, steps=args.steps, log=lambda *a: None)
clues = board.clues_of(walls)

print(f"\n{len(sketch)} x {len(sketch[0])} grid; {len(changed)} readable numbers changed, {len(hints)} hint walls, "
      f"route {len(board.route(walls))} squares")
for r, row in enumerate(sketch):
    cells = []
    for c, v in enumerate(row):
        got = clues[r][c]
        cells.append(f"[{got}]" if v is None else (f"{v}>{got}" if v != got else f" {got} "))
    print(" ".join(f"{x:>4}" for x in cells))
print("   [n] = filled in for an unreadable cell;  a>b = sketch said a, maze needs b")

path = GAMES / f"{args.number}.json"
instance = json.loads(path.read_text()) if path.exists() else {}
if instance.get("maze") and not args.force:
    sys.exit(f"\n{path.name} already has a maze; pass --force to replace it")
instance = {
    "type": "number-maze",
    "name": args.name or instance.get("name") or f"Maze {args.number}",
    "meta": instance.get("meta") or f"{len(sketch[0])} × {len(sketch)} numbers",
    **{k: v for k, v in instance.items() if k not in ("type", "maze")},
    "maze": {
        "source": str(args.grid),
        "seed": args.seed,
        "entry": args.entry.json(),
        "exit": args.exit.json(),
        "hints": sorted(board.pair(e) for e in hints),
        "clues": clues,
    },
}
path.write_text(json.dumps(instance, indent=2) + "\n")
print(f"\nwrote {path.relative_to(GAMES.parents[2])}")
