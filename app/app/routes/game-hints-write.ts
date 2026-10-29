// A draft's hints, written on its publish page once its solve is verified: POST
// inkit.games/g/<id>/hints/write with { sketchHash, stuck, board? }. `stuck`: the stuck points the
// hint solver found in the creator's browser (app/games/hint-solve.client.ts); `board`: the
// creator's finished board, when the solver needed their moves (it must check out here). Opus
// words the ladder (hints.server.ts writeLadder), once per sketch: asking again returns what was
// written. Returns { ladder, verified, problems }.
import { data } from "react-router";
import type { Route } from "./+types/game-hints-write";
import { cloudflareContext } from "~/lib/context";
import { editAccess } from "~/lib/edit-access.server";
import { readPaintSave, sketchOf } from "~/games/paint-save";
import { parseSketch } from "~/games/sketch";
import { sha256 } from "~/ai/request";
import { draftLadder, storeDraftLadder, verifiedBy, writeLadder } from "~/lib/hints.server";
import { readStuck } from "~site/lib/hint-words";
import type { BoardLike } from "~site/lib/hint-ladder";
import { makePuzzle } from "~site/engine/puzzle.ts";

export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  if (request.method !== "POST") throw data(null, { status: 405 });
  const { db, game, may } = await editAccess(request, env, params.id);
  if (game.state !== "draft" || !may.edit) throw data(null, { status: 404 });
  const save = readPaintSave(game.drawing);
  const sketch = save && sketchOf(save).sketch;
  const parsed = sketch ? parseSketch(sketch) : null;
  if (!sketch || !parsed?.ok) return Response.json({ error: "Draw the puzzle in paint first." }, { status: 400 });
  const body = await request.json().catch(() => null) as { sketchHash?: unknown; stuck?: unknown; board?: unknown } | null;
  const hash = await sha256(sketch);
  if (body?.sketchHash !== hash) return Response.json({ error: "The puzzle changed. Reload the page." }, { status: 409 });
  // written already for this very sketch: the same again (an author's edit included), no new call
  const had = await draftLadder(db, game.id, sketch);
  if (had?.ladder && had.verified) return Response.json({ ladder: had.ladder, verified: had.verified, problems: [] });
  const spec = parsed.spec;
  const stuck = readStuck(body.stuck, makePuzzle(spec).grid.cellCount);
  if (!stuck) return Response.json({ error: "Those stuck points can't be read." }, { status: 400 });
  const verified = verifiedBy(spec, stuck, (body.board ?? null) as BoardLike | null);
  if (!verified) return Response.json({ error: stuck.solved ? "That solve doesn't check out. Try solving it again." : "The puzzle isn't solved yet." }, { status: 400 });
  const { ladder, problems } = await writeLadder(env, spec, stuck);
  await storeDraftLadder(db, game.id, hash, ladder, verified);
  return Response.json({ ladder, verified, problems });
}
