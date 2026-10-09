// Draw a puzzle in paint: inkit.games/g/<id>/draw (docs/creation-flow.md). The drawing is the
// puzzle: components/Paint.tsx, with its type, This puzzle's checklist and autosave. A page of its
// own. Every draft its author can edit, but RYB's (its figure editor, /g/<id>/edit). A published
// puzzle can't be changed, only deleted: it goes to its page. A draft made before paint (or read
// from a photo) has no drawing yet: its sketch is drawn in ink (paintFromSketch) and saved as its
// drawing.
import { data, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-draw";
import { cloudflareContext } from "~/lib/context";
import { schema } from "~/db";
import { changeGame, rereadDrawing, saveDrawing } from "~/lib/games.server";
import { editAccess as load } from "~/lib/edit-access.server";
import { attempt } from "~/lib/http.server";
import { Paint } from "~/components/Paint";
import { paintFromSketch, readPaintSave } from "~/games/paint-save";
import { doubtsOf } from "~/games/doubts";
import { guides } from "~site/guides/guides.ts";

/** Each type's rules in its guide's words, for This puzzle's checklist (text only: the pictures stay here). */
const RULE_LINES = Object.fromEntries(Object.entries(guides).map(([k, g]) => [k, g.rules.map((r) => ({ text: r.text, checks: r.checks }))]));

export const handle = { bare: true };

/** A short fingerprint of a text (djb2). */
const stamp = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Draw ${loaderData?.game.title ?? "a puzzle"} · inkit` }, { name: "robots", content: "noindex" }];

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  // a published puzzle (or one taken down) is locked: its page, where its author can delete it
  if (game.state !== "draft") throw redirect(`/g/${game.id}`);
  if (!may.edit) throw data(null, { status: 404 });
  if (game.kind === "coats") throw redirect(`/g/${game.id}/edit`);
  const collection = await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  const drawn = readPaintSave(game.drawing);
  const saved = drawn ?? paintFromSketch(game.sketch);
  const choices = (game.kindChoices ?? []).filter(Boolean);
  return {
    game: { id: game.id, title: game.title },
    saved,
    // drawn from its sketch just now: saved as its drawing straight away
    fresh: !drawn && !!saved,
    // a photo's: the photo, what Claude wasn't sure of, and the types it thought it could be
    photo: game.sketchImage ? {
      src: `/g/${game.id}/sketch?k=${encodeURIComponent(game.sketchImage.slice(-12))}`,
      doubts: doubtsOf(game.parseNotes),
      readAs: choices[0] ?? "",
    } : null,
    choices,
    // which reading of the photo this is (a re-read starts paint again)
    reading: game.sketchImage && game.reading ? stamp(game.reading) : "",
    opened: new URL(request.url).searchParams.has("read"),
    admin: may.feature,
    backTo: collection ? `/${collection.slug}?tab=drafts` : "/new",
    ruleLines: RULE_LINES,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, env, me, game } = await load(request, context.get(cloudflareContext).env, params.id);
  const form = await request.formData();
  return attempt(async () => {
    const intent = String(form.get("intent"));
    // a doubt ticked off (or not): as the editor does
    if (intent === "doubt") { await changeGame(db, me, game, form); return { ok: true, error: undefined }; }
    // the photo read again, with what's wrong: its reading replaces the drawing
    if (intent === "reread") { await rereadDrawing(db, env, me, game, form); return { ok: true, error: undefined, reread: true }; }
    if (intent !== "save") throw new Response(null, { status: 400 });
    await saveDrawing(db, me, game, form);
    return { ok: true, error: undefined };
  });
}

export default function DrawGame({ loaderData: { game, saved, fresh, admin, backTo, photo, choices, opened, ruleLines, reading } }: Route.ComponentProps) {
  // a new reading of the photo starts paint again, from it
  return <Paint key={`${game.id}:${reading}`} game={game} saved={saved} fresh={fresh} backTo={backTo} admin={admin} photo={photo} choices={choices} opened={opened} ruleLines={ruleLines} />;
}
