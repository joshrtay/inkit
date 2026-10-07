// A game's page as it will look, for the editor's Preview: inkit.games/g/<id>/preview, shown in
// a frame on the edit page (desktop or phone width). It's the real page in the site's frame, with
// the nav inactive and no back button; the editor sends in the puzzle, title and description as
// they are in the editor, saved or not.
import { useEffect, useMemo, useState } from "react";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-preview";
import { cloudflareContext } from "~/lib/context";
import { schema } from "~/db";
import { parseSketch } from "~/games/sketch";
import { kindName } from "~/games/kinds";
import { layoutOf } from "~/games/layout-of";
import { GamePageView } from "~/components/GamePageView";
import { editAccess as load } from "~/lib/edit-access.server";

/** root.tsx makes the site's nav inactive on this page. */
export const handle = { preview: true };

/** What the editor sends in (postMessage, same origin). */
export interface PreviewState { type: "inkit-preview"; sketch: string; title: string; description: string }

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game } = await load(request, context.get(cloudflareContext).env, params.id);
  const [collection, author] = await Promise.all([
    db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) }),
    db.query.creators.findFirst({ where: eq(schema.creators.id, game.authorId) }),
  ]);
  return {
    game: { id: game.id, title: game.title, description: game.description, sketch: game.sketch, kind: game.kind, when: (game.publishedAt ?? new Date()).getTime() },
    collection: { slug: collection?.slug ?? "", title: collection?.title ?? "", personal: !!collection?.personalOf },
    author: { handle: author?.handle ?? "", name: author?.name ?? "", deleted: !!author?.deletedAt },
  };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.game.title ?? "Preview"} · inkit` }, { name: "robots", content: "noindex" }];

export default function GamePreview({ loaderData: { game, collection, author } }: Route.ComponentProps) {
  const [live, setLive] = useState({ sketch: game.sketch, title: game.title, description: game.description });
  useEffect(() => {
    const take = (e: MessageEvent<PreviewState>) => {
      if (e.origin === location.origin && e.data?.type === "inkit-preview") setLive({ sketch: e.data.sketch, title: e.data.title, description: e.data.description });
    };
    addEventListener("message", take);
    parent.postMessage({ type: "inkit-preview-ready" }, location.origin);   // ask for the editor's version
    return () => removeEventListener("message", take);
  }, []);
  const parsed = useMemo(() => parseSketch(live.sketch), [live.sketch]);
  const play = useMemo(() => (parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null), [parsed]);
  return (
    <GamePageView key={live.sketch} preview play={play} editable={false}
      summary={parsed.ok ? parsed.summary : kindName(game.kind)}
      extra={parsed.ok && parsed.spec.rules?.length ? parsed.rules : []} errors={parsed.ok ? [] : parsed.errors}
      game={{ id: game.id, title: live.title.trim() || "Untitled", description: live.description, kind: parsed.ok ? parsed.kind : game.kind, state: "published", hiddenNote: null, when: game.when }}
      collection={collection} author={author} />
  );
}
