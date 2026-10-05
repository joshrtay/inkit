# Notes for Claude

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything; it is the source of truth for layout and conventions.

- Puzzle content is generated and verified by `puzzles/` (Python). Never hand-edit files in `public/<game>/sheets/` or `src/games/*/puzzle.json`; change the generator and run `npm run puzzles`.
- Every puzzle must have exactly one solution; generators assert this. Confirm intended handoff numbers with the user.
- Each sheet's variables are local to that sheet; only the stated number passes between sheets.
- Interactive games export `mount: MountGame` and use the `GameHost` for saving and reporting a solve.
- Build links with `url()` from `src/lib/paths.ts` (the site lives under `/wyattsgames/`).
- `scans/` and `archive/` are local-only (gitignored); the repo is public.
- Run `npm run build` (type-check + build) before committing.
