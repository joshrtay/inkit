# Notes for Claude

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything; it is the source of truth for layout and conventions.

- Games are numbered instances of game types: data in `src/games/<type path>/<n>.json`, code in `src/game-types/<id>/`, types listed in `src/games.ts`. A new game of an existing type should need no code.
- Puzzle content is built and verified by `puzzles/` (Python). Never hand-edit generated sheets in `public/<type>/<n>/sheets/`; change the source in `puzzles/<type>/<n>/` and run `npm run puzzles`. After changing a maze's `clues`, run `puzzles/number-maze/check.py`.
- Every puzzle must have exactly one solution; generators assert this. Confirm intended handoff numbers with the user.
- Each sheet's variables are local to that sheet; only the stated number passes between sheets.
- Each game type's `game.ts` exports a `MountGame` and `mountAll`, and uses the `GameHost` for saving and reporting a solve.
- Build links with `url()` from `src/lib/paths.ts` (keeps links working if the site ever moves under a sub-path).
- `scans/` and `archive/` are local-only (gitignored); the repo is public.
- **Grid engine changes reach the editors and the reader in the same change.** Whenever `src/engine` gains anything (a genre, a clue kind, a rule block or a rule setting, a style option, a mark, a puzzle field), add it to the editors and the sketch reader (`app/app/lib/read-sketch.server.ts`), give a new genre a name in `app/app/games/kinds.ts`, and write its guide in `src/guides/guides.ts` (rules with ✓/✗ pictures and a worked example; the site's /puzzles pages), then run `npm run guides` to check the pictures and solve the example. Creators can only change puzzles through the editors, so every type's editor must cover everything that type needs: its on-puzzle editor's tools (`TOOLS` in `app/app/components/BoardEditor.tsx`, for every grid type), plus the generic `app/app/components/PuzzleEditor.tsx` (Three Coats' figure editor, Panes' rules), which must stay able to express everything the engine can. Their coverage tables are typed against the engine's lists, so `npm --prefix app run typecheck` fails until they're updated; settings inside a rule and fields inside a clue aren't checked that way, so add those by hand. See `docs/grid-engine.md`, "The visual editor".
- Run `npm run build` (type-check + build) before committing; for the social site in `app/`, also `npm --prefix app run typecheck`.
