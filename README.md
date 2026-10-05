# Mailed Escape Rooms

Printable and in-browser escape room puzzles, published at
https://joshrtay.github.io/escape-room/.

## Quick start

```bash
npm install          # once
npm run dev          # live preview at http://localhost:4321/escape-room/
npm run build        # type-check and build the site into dist/
npm run puzzles      # regenerate, verify and render every puzzle (needs Chrome + Python)
```

Pushing to `main` publishes the site through GitHub Actions.

## Games

| Game | Type | Path |
|---|---|---|
| Escape Room Packet | 8 printable sheets | `/escape-room-packet/` |
| Number Line Maze | In the browser (game 2, in progress) | `/line-maze/` |

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the site, the game interface and the
puzzle scripts fit together, and how to add a game.
