"""Check every number-maze instance (or the files given) has exactly one solution.

    python3 puzzles/number-maze/check.py                  # all src/games/*.json of this type
    python3 puzzles/number-maze/check.py src/games/x.json

Use this after typing in a grid by hand (for example from a sketch): it reports
whether the numbers allow no maze, exactly one, or several, and for several it
suggests hint walls that would settle it.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import number_maze as nm  # noqa: E402

GAMES = Path(__file__).resolve().parents[2] / "src" / "games"


def main(paths):
    failed = 0
    for path in paths:
        instance = json.loads(path.read_text())
        if instance.get("type") != "number-maze":
            continue
        ok, message, _ = nm.check(instance["maze"])
        print(f"  {path.name}: {'ok' if ok else 'PROBLEM'} - {message}")
        failed += not ok
    return failed


if __name__ == "__main__":
    files = [Path(p) for p in sys.argv[1:]] or sorted(GAMES.glob("*.json"))
    sys.exit(1 if main(files) else 0)
