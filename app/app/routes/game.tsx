// A game's permanent page: inkit.games/g/<id>.
import { data, redirect } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/game";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canChange, canDelete, canHide, canView } from "~/lib/permissions.server";
import { ladderOf } from "~/lib/hints.server";
import { parseSketch } from "~/games/sketch";
import { editPath, kindName } from "~/games/kinds";
import { layoutOf } from "~/games/layout-of";
import { gameSocial } from "~/lib/queries.server";
import { later } from "~/lib/stream.server";
import { GamePageView } from "~/components/GamePageView";
import { readContext } from "~/lib/list-context";
import { listBar } from "~/lib/list-play.server";
import { isKind } from "~/lib/guides.server";
import { gameJsonLd, pageMeta, privateMeta } from "~/lib/seo";
import { changeGame } from "~/lib/games.server";
import { attempt, signInFirst } from "~/lib/http.server";

/** The game's … menu (take down, restore, feature: moderation) and Delete; changeGame checks who may. */
const MANAGE = new Set(["hide", "unhide", "delete"]);
export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const db = getDb(env);
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, params.id) });
  if (!game || game.state === "deleted") throw data(null, { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (!MANAGE.has(intent)) throw data(null, { status: 400 });
  return attempt(async () => {
    await changeGame(db, me, game, form);
    if (intent !== "delete") return { error: undefined };
    // deleted: back to the profile it was on
    const collection = await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
    return redirect(collection ? `/${collection.slug}` : "/");
  });
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  // the session, the game with its collection and author, and the viewer's role in that
  // collection, side by side
  const viewerP = currentCreator(env, request);
  const [row, viewer, role] = await Promise.all([
    db.select({ game: schema.games, collection: schema.collections, author: schema.creators }).from(schema.games)
      .leftJoin(schema.collections, eq(schema.collections.id, schema.games.collectionId))
      .leftJoin(schema.creators, eq(schema.creators.id, schema.games.authorId))
      .where(eq(schema.games.id, params.id)).then((r) => r[0]),
    viewerP,
    viewerP.then((v) => v && db.select({ role: schema.memberships.role }).from(schema.memberships)
      .where(and(eq(schema.memberships.creatorId, v.id), eq(schema.memberships.collectionId,
        db.select({ id: schema.games.collectionId }).from(schema.games).where(eq(schema.games.id, params.id)))))
      .then((r) => r[0]?.role ?? null)),
  ]);
  if (!row) throw data(null, { status: 404 });
  const { game, collection, author } = row;
  // deleted by its creator: gone for everyone (410, so search engines drop it)
  if (game.state === "deleted") throw data(null, { status: 410 });
  if (!collection || !author) throw data(null, { status: 404 });
  // Drafts and taken-down games look like they don't exist to anyone not allowed to see them.
  if (!canView(game, collection, viewer, role ?? null)) throw data(null, { status: 404 });

  const parsed = parseSketch(game.sketch, game.sketchVersion);
  // opened from a list (?in=…, ?set=…): the bar under the board, to step through it
  const ctx = game.state === "published" ? readContext(new URL(request.url).searchParams, isKind) : null;
  // sent after the page (components/Later.tsx): the counts and the viewer's marks, and the list bar
  const social = later(gameSocial(db, game, viewer?.id));
  return {
    list: ctx ? later(listBar(db, ctx, game, viewer?.id ?? null)) : null,
    game: { id: game.id, title: game.title, description: game.description, kind: game.kind, state: game.state, hiddenNote: game.hiddenNote,
      when: (game.publishedAt ?? game.createdAt).getTime() },
    collection: { slug: collection.slug, title: collection.title, personal: !!collection.personalOf },
    author: { handle: author.handle, name: author.name, deleted: !!author.deletedAt, ai: author.isAi },
    play: parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null,
    summary: parsed.ok ? parsed.summary : kindName(game.kind),
    // a puzzle that lists its own rules (Panes; a 2-star Star Battle) shows them above its type's guide
    extra: parsed.ok && parsed.spec.rules?.length ? parsed.rules : [],
    errors: parsed.ok ? [] : parsed.errors,
    // a draft's Edit opens paint (RYB: its figure editor); a published puzzle can't be changed
    editTo: canChange(game, viewer, role ?? null) ? editPath(game) : null,
    // its author's one action on it (or an admin's): Delete, after the confirm dialog
    canDelete: canDelete(game, viewer, role ?? null),
    manage: {
      takeDown: canHide(viewer, role ?? null) && game.authorId !== viewer?.id && game.state === "published",
      restore: canHide(viewer, role ?? null) && game.state === "hidden",
    },
    // its hints, in How to play (lib/hints.server.ts): written and edited on the publish page, then
    // locked with the puzzle
    hints: game.state === "draft" ? null : later(ladderOf(db, game)),
    likes: later(social.then((x) => x.likes)),
    solves: later(social.then((x) => x.solves)),
    signedIn: !!viewer,
    // the first-time note under the paper's ?: until they've solved one of this type (signed out: always)
    newToType: later(social.then((x) => x.newToType)),
    dates: { created: game.createdAt.getTime(), published: game.publishedAt?.getTime() ?? null },
  };
}

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [{ title: "Not found · inkit" }];
  const { game, author } = d, kind = kindName(game.kind), a = /^[aeiou]/i.test(kind) ? "an" : "a";
  const title = `${game.title}: ${a} ${kind} puzzle by ${author.name} · inkit`;
  // drafts and games taken down are seen only by their author and owners: never indexed
  if (game.state !== "published") return privateMeta(title);
  return pageMeta({
    title, path: `/g/${game.id}`, type: "article",
    description: game.description || `${game.title}, ${a} ${kind} logic puzzle by ${author.name}, to play in your browser on inkit.`,
    jsonLd: gameJsonLd({ id: game.id, title: game.title, description: game.description, kind: game.kind, kindName: kind, author, created: d.dates.created, published: d.dates.published }),
  });
};

export default function Game({ loaderData, actionData }: Route.ComponentProps) {
  return <GamePageView {...loaderData} error={actionData?.error} />;
}
