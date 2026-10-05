# Notes for Claude

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything; it is the source of truth for layout and conventions.

- Games are numbered instances of game types: data in `src/games/<type path>/<n>.json`, code in `src/game-types/<id>/`, types listed in `src/games.ts`. A new game of an existing type should need no code.
- Puzzle content is built and verified by `puzzles/` (Python). Never hand-edit generated sheets in `public/<type>/<n>/sheets/`; change the source in `puzzles/<type>/<n>/` and run `npm run puzzles`. After changing a maze's `clues`, run `puzzles/number-maze/check.py`.
- Every puzzle must have exactly one solution; generators assert this. Confirm intended handoff numbers with the user.
- Each sheet's variables are local to that sheet; only the stated number passes between sheets.
- Each game type's `game.ts` exports a `MountGame` and `mountAll`, and uses the `GameHost` for saving and reporting a solve.
- Build links with `url()` from `src/lib/paths.ts` (the site lives under `/wyattsgames/`).
- `scans/` and `archive/` are local-only (gitignored); the repo is public.
- Run `npm run build` (type-check + build) before committing.
