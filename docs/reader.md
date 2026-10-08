# The sketch reader

How inkit turns a photo of a hand-drawn puzzle into a puzzle, how well it does, and how to make it
better. The code is `app/app/lib/read-sketch.server.ts`.

## How a read works

1. **The photo** (shrunk in the browser to at most 2000px across, then turned upright and stripped
   of its metadata, location included, by Cloudflare Images: `app/lib/photos.server.ts`) goes to
   Claude with a long system prompt: how to transcribe, every puzzle type (`GENRE_GUIDE`), every
   kind of clue (`CLUE_GUIDE`) and rule (`RULE_GUIDE`). Those three tables are typed against the
   engine's lists, so a new type, clue or rule fails the type check until it's described. What
   the seven panel types share (corners, stretches of grid line, telling them apart by their main
   symbol) is said once, in `PANEL_HOW`.
2. **The answer** is structured output (a Zod schema, `Reading`): the type and the other types the
   same clues could be, size, clues, rules, a nonogram's picture, areas, Three Coats' pieces,
   whether it's sure, and its doubts (each tied to a square, a line's clues, rows, columns, an
   area, or the whole puzzle). Rows and columns count from 0 everywhere; asking for 1-based
   numbers in one field made it mix the two. The schema keeps every field required and avoids
   optional and nullable fields, which the API limits.
3. **Two readers.** The quick reader (Claude Sonnet 5.5, medium effort) looks first. If it isn't
   sure, its answer doesn't parse, or a sanity check fails (an odd number of open cells in a
   loop, a sudoku that isn't 4, 6 or 9 across, a picture that doesn't fill its grid), the careful
   reader (Claude Opus 5.5, high effort) reads it again. Re-reads always use the careful reader.
   A declined image falls back to another model in the same call (`server-side-fallback`).
4. **Re-reads** carry the earlier transcription and what the creator said is wrong, or the type
   they chose (with that type's summary, rules and transcription guide from the puzzle guides).
5. The reading becomes the draft's sketch (`toSketch`), its doubts, and the type menu's "could be"
   list. The editor takes it from there.

**Only the puzzle is kept.** A photo can show a desk, a room or a face, so it isn't stored until
it's been read: Claude's reading includes `bounds`, where the puzzle is in the photo (fractions of
its width and height, taking in clues outside the grid and the title), and the photo is cropped
to that, with a 3% margin, before it goes to R2. A read that fails keeps no photo. Re-reads read
the cropped photo. Locally, `wrangler dev`'s stand-in for Cloudflare Images ignores the crop, so
local uploads keep the whole (upright) photo; to try the real crop, set `"remote": true` on the
`images` binding in `wrangler.jsonc` (needs `wrangler login`).

## Cost and time

Each look sends the photo and the system prompt, about 11,000 input tokens, and gets back 500 to
1,000 output tokens; a read that escalates is two looks. A quick read takes 5 to 15 seconds; with
the careful reader, 15 to 40. Every look's model, time and tokens are recorded (below).

**Next step for cost:** the system prompt is the same for every read, so prompt caching
(`cache_control` on the system block) would cut most of the input cost after the first read.

## Measuring it

**On the live site**, every read is recorded (`reads` table, `app/lib/reads.server.ts`): the
photo (only the puzzle's part of it, see below), the creator's corrections, each look, Claude's answer and the sketch made from it, or the
error. When the puzzle is first published, the published puzzle is saved with it, and the two are
compared (`app/games/diff.ts`): both are broken into facts (type, size, each clue, each area and
picture square, each rule), and the score is the share of facts they have in common (1 =
published as read). Admin endpoints (a signed-in admin, or `Authorization: Bearer
ADMIN_API_TOKEN`):

| Endpoint | |
|---|---|
| `GET /admin/reads/stats` | accuracy overall and by type, re-reads, how often the careful reader took over, time and tokens per model |
| `GET /admin/reads.jsonl` | every read, one per line: the training and evaluation data |
| `GET /admin/reads/<id>` | one read in full |
| `GET /admin/reads/<id>/photo` | the photo it read |

**Offline**, `app/eval/` scores the reader against a set of cases (a photo and the puzzle it should
be), with the same diff:

```sh
cd app
npm run eval:pull            # published reads from the live site become cases (needs ADMIN_API_TOKEN)
npm run eval                 # says how many cases it would run
npm run eval -- --yes        # runs them (calls Claude for each: costs money)
npm run eval -- --yes --careful --kind nonogram --limit 5
```

Cases live in `app/eval/data/` (git-ignored: they're people's drawings, and the repo is public),
one per line in `cases.jsonl`: `{ "id", "photo": "<file>", "expected": "<sketch>" }`. Add your own
by hand. Each run writes its results to `eval/data/runs/`. Change the prompt or models, run it
again, and compare.

Published puzzles are a good but not perfect answer key: a creator may change a puzzle after
reading it (making it harder, fixing their own drawing), which the diff counts against the reader.
Re-reads and edits made before publishing are the clearest signal of a misread.
