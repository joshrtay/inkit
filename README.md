# inkit

Hand-drawn logic puzzles, made playable: draw a puzzle on paper, take a photo, and Claude reads it
into a game you can check, edit and publish at https://inkit.games/ (the social site, in `app/`).

This repo also holds **Wyatt's Games** (the Astro site at the top level), printable and in-browser
escape room puzzles published at https://wyattsgames.com/. Both share the grid game engine in
`src/engine`.

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
| Number Line Maze (`/number-line-maze/`) | 1 Warm-up (5 × 5), 2 The Big Maze (11 × 16), 3 Side Doors (10 × 8) |
| Three Coats (`/three-coats/`) | 1 Triangle, 2 Hexagon, 3 Nine Squares, 4 Square in a Kite, 5 Envelope, 6 House |
| Simple Loop (`/round-the-bend/`) | 1 Little Pond, 2 Stepping Stones, 3 Canyon Run, 4 Long Bend, 5 Twin Peaks, 6 Narrow Pass, 7 Little Loop, 8 Six Rows Down |
| Nonogram (`/picture-squares/`) | 1 Something Sweet, 2 From the Tree, 3 Out on the Water, 4 In the Forest, 5 Sitting Pretty, 6 Tall Word, 7 Say My Name, 8 First Place, 9 Standing Tall |

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the site, the game interface and the
puzzle scripts fit together, and how to add a game.
