// Edit a game, and change its state: wyattsgames.com/g/<id>/edit.
// Its author (while a member) and the collection's owners can edit; owners and admins can
// take it down; admins can feature it.
import { data, Form, Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-edit";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canEdit, canHide, roleIn } from "~/lib/permissions.server";
import { changeGame, isFeatured, rereadDrawing } from "~/lib/games.server";
import { ConfirmDrawing } from "~/components/ConfirmDrawing";
import { attempt, signInFirst } from "~/lib/http.server";
import { SketchEditor } from "~/components/SketchEditor";

async function load(request: Request, env: Env, id: string) {
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const db = getDb(env);
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, id) });
  if (!game) throw data(null, { status: 404 });
  const role = await roleIn(db, game.collectionId, me.id);
  const may = { edit: canEdit(game, me, role), hide: canHide(me, role), feature: me.isAdmin };
  if (!may.edit && !may.hide) throw data(null, { status: 404 });
  return { db, env, me, game, may };
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  return {
    game: { id: game.id, title: game.title, description: game.description, sketch: game.sketch, state: game.state, hiddenNote: game.hiddenNote },
    may, featured: await isFeatured(db, game.id),
    // a draft made from a drawing is confirmed against it first
    drawing: game.sketchImage && game.state === "draft" && may.edit ? { notes: game.parseNotes ?? [] } : null,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, env, me, game } = await load(request, context.get(cloudflareContext).env, params.id);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  return attempt(async () => {
    if (intent === "reread") { await rereadDrawing(db, env, me, game, form); return { error: undefined, done: intent }; }
    await changeGame(db, me, game, form);
    // saving a drawing's corrected reading keeps the creator on the confirm screen
    const confirming = game.sketchImage && game.state === "draft" && intent === "save" && form.get("stay") === "1";
    return (intent === "save" || intent === "publish") && !confirming ? redirect(`/g/${game.id}`) : { error: undefined, done: intent };
  });
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Edit ${loaderData?.game.title ?? "game"} · Wyatt's Games` }];

export default function EditGame({ loaderData: { game, may, featured, drawing }, actionData }: Route.ComponentProps) {
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  const published = game.state === "published";
  return (
    <main className="wrap">
      <header className="edit-head">
        <h1>Edit {game.title}</h1>
        <span className={`state ${game.state}`}>{game.state}</span>
        <Link to={`/g/${game.id}`}>View the game</Link>
      </header>
      {game.state === "hidden" && <p className="state hidden">Taken down: {game.hiddenNote}</p>}

      {drawing ? (
        <>
          <ConfirmDrawing gameId={game.id} title={game.title} description={game.description} sketch={game.sketch}
            notes={drawing.notes} error={error} />
          <details className="advanced">
            <summary>Edit the sketch text yourself</summary>
            <SketchEditor key={game.sketch} initial={game} saveLabel="Save draft" />
          </details>
        </>
      ) : may.edit ? (
        <SketchEditor key={game.sketch} initial={game} error={error} saveLabel={published ? "Save" : "Save draft"} showPublish={game.state === "draft"} />
      ) : (
        error && <p className="error" role="alert">{error}</p>
      )}

      <section className="moderation">
        {may.edit && published && (
          <Form method="post"><button className="btn" name="intent" value="unpublish">Back to draft</button>
            <span className="muted">Only you and the collection's owners will see it.</span></Form>
        )}
        {may.hide && game.state !== "hidden" && (
          <Form method="post" className="inline-form">
            <input name="note" placeholder="Why is it being taken down?" maxLength={500} required />
            <button className="btn danger" name="intent" value="hide">Take down</button>
          </Form>
        )}
        {may.hide && game.state === "hidden" && (
          <Form method="post"><button className="btn" name="intent" value="unhide">Restore</button></Form>
        )}
        {may.feature && published && (
          <Form method="post">
            <button className="btn" name="intent" value={featured ? "unfeature" : "feature"}>{featured ? "Remove from Featured" : "Add to Featured"}</button>
          </Form>
        )}
      </section>
    </main>
  );
}
