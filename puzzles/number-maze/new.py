"""Create (or regenerate) a number-maze game instance in src/games/<slug>.json.

    python3 puzzles/number-maze/new.py --slug line-maze --size 11x17 --exit-row 14 --seed 53
    python3 puzzles/number-maze/new.py --slug my-maze --size 7x9 --search 40   # try 40 seeds, keep the best

Regenerating an existing instance keeps its name, blurb and other fields and only
replaces the "maze" data. Use --force to overwrite an existing maze.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import number_maze as nm  # noqa: E402

GAMES = Path(__file__).resolve().parents[2] / "src" / "games"

ap = argparse.ArgumentParser()
ap.add_argument("--slug", required=True)
ap.add_argument("--size", default="11x17", help="numbers across x numbers down")
ap.add_argument("--entry-col", type=int, help="square column of the entrance (default: rightmost)")
ap.add_argument("--exit-row", type=int, help="square row of the exit (default: near the bottom)")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--search", type=int, default=1, help="try this many seeds from --seed; keep fewest hints, longest route")
ap.add_argument("--name", help="display name for a new instance")
ap.add_argument("--force", action="store_true", help="replace an existing maze")
args = ap.parse_args()

W, H = map(int, args.size.split("x"))
entry_col = args.entry_col if args.entry_col is not None else W - 2
exit_row = args.exit_row if args.exit_row is not None else max(0, H - 4)

best = None
for seed in range(args.seed, args.seed + args.search):
    board, walls, hints = nm.generate(W, H, entry_col, exit_row, seed)
    score = (len(hints), -len(board.route(walls)))
    if best is None or score < best[0]:
        best = (score, seed, board, walls, hints)
_, seed, board, walls, hints = best

path = GAMES / f"{args.slug}.json"
instance = json.loads(path.read_text()) if path.exists() else {}
if instance.get("maze") and not args.force:
    sys.exit(f"{path.name} already has a maze; pass --force to replace it")
instance = {
    "type": "number-maze",
    "name": args.name or instance.get("name") or args.slug.replace("-", " ").title(),
    "blurb": instance.get("blurb", "Build the walls each number asks for, then find your way out."),
    "meta": instance.get("meta", "Play in the browser"),
    "listed": instance.get("listed", False),
    **{k: v for k, v in instance.items() if k not in ("type", "maze")},
    "maze": {
        "seed": seed,
        "entryCol": entry_col,
        "exitRow": exit_row,
        "hints": sorted(board.pair(e) for e in hints),
        "clues": board.clues_of(walls),
    },
}
GAMES.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(instance, indent=2) + "\n")
print(f"{path.relative_to(GAMES.parents[1])}: seed {seed}, {len(hints)} hint walls, route {len(board.route(walls))} squares")
