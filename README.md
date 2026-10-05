# Wyatt's Games

Printable and in-browser escape room puzzles, published at
https://wyattsgames.com/.

## Quick start

```bash
npm install          # once
npm run dev          # live preview at http://localhost:4321/
npm run build        # type-check and build the site into dist/
npm run puzzles      # regenerate, verify and render every puzzle (needs Chrome + Python)
cd worker && npm run dev   # local accounts API (http://localhost:8787) for testing logins
```

Pushing to `main` publishes the site through GitHub Actions.

## Games

The home page lists game types; each type has numbered games at `/<type>/<n>/`.

| Type | Games |
|---|---|
| Escape Room (`/escape-room/`) | 1 The Envelope (8 printable sheets) |
| Number Line Maze (`/number-line-maze/`) | 1 Warm-up (5 × 5), 2 The Big Maze (11 × 16) |
| Three Coats (`/three-coats/`) | 1 Triangle, 2 Hexagon, 3 Nine Squares, 4 Square in a Kite, 5 Envelope, 6 House |
| Round the Bend (`/round-the-bend/`) | 1 Little Pond, 2 Stepping Stones, 3 Canyon Run, 4 Long Bend |
| Picture Squares (`/picture-squares/`) | 1 Something Sweet, 2 From the Tree, 3 Out on the Water, 4 In the Forest, 5 Sitting Pretty, 6 Tall Word, 7 Say My Name, 8 First Place |

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the site, the game interface and the
puzzle scripts fit together, and how to add a game.
