# inkit

Hand-drawn logic puzzles, made playable: draw a puzzle on paper, take a photo, and Claude reads it
into a game you can check, edit and publish at https://inkit.games/.

- `app/`: the site (React Router on Cloudflare Workers)
- `src/`: the grid puzzle engine, the in-browser player, and the puzzle-type guides
- `puzzles/grid/`: tools to make example puzzles and check the guides

See [ARCHITECTURE.md](ARCHITECTURE.md) and [app/README.md](app/README.md).
