// A game's permanent page: wyattsgames.com/g/<id>.
import { data, Link } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canEdit, canHide, canView, roleIn } from "~/lib/permissions.server";
import { parseSketch } from "~/games/sketch";
import { kindName } from "~/games/kinds";
import { layoutOf } from "~/games/layout-of";
import { GameBoard } from "~/components/GameBoard";
import { guides } from "~site/guides/guides.ts";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, params.id) });
  if (!game) throw data(null, { status: 404 });
  const [collection, author, viewer] = await Promise.all([
    db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) }),
    db.query.creators.findFirst({ where: eq(schema.creators.id, game.authorId) }),
    currentCreator(env, request),
  ]);
  if (!collection || !author) throw data(null, { status: 404 });
  const role = await roleIn(db, collection.id, viewer?.id);
  // Drafts and taken-down games look like they don't exist to anyone not allowed to see them.
  if (!canView(game, collection, viewer, role)) throw data(null, { status: 404 });

  const parsed = parseSketch(game.sketch, game.sketchVersion);
  return {
    game: { id: game.id, title: game.title, description: game.description, kind: game.kind, state: game.state, hiddenNote: game.hiddenNote,
      when: (game.publishedAt ?? game.createdAt).getTime() },
    origin: (guides as Record<string, { origin: string }>)[game.kind]?.origin ?? null,
    collection: { slug: collection.slug, title: collection.title, personal: !!collection.personalOf },
    author: { handle: author.handle, name: author.name, deleted: !!author.deletedAt },
    play: parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null,
    summary: parsed.ok ? parsed.summary : kindName(game.kind),
    rules: parsed.ok ? parsed.rules : [],
    errors: parsed.ok ? [] : parsed.errors,
    editable: canEdit(game, viewer, role) || canHide(viewer, role),
  };
}

export const meta: Route.MetaFunction = ({ loaderData: data }) => data
  ? [{ title: `${data.game.title} · inkit` }, { name: "description", content: data.game.description || `A ${kindName(data.game.kind)} puzzle.` }]
  : [{ title: "Not found · inkit" }];

const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function Game({ loaderData: { game, collection, author, play, summary, rules, errors, editable, origin } }: Route.ComponentProps) {
  return (
    <main className="wrap game-page">
      <header className="game-head">
        <h1>{game.title}</h1>
        <span className="muted">
          {summary} · by{" "}
          {author.deleted ? author.name : <Link to={`/${author.handle}`}>@{author.handle}</Link>}
          {!collection.personal && <> in <Link to={`/${collection.slug}`}>{collection.title}</Link></>}
          {" · "}<time dateTime={new Date(game.when).toISOString()}>{date(game.when)}</time>
        </span>
        {editable && <Link className="btn" to={`/g/${game.id}/edit`}>Edit</Link>}
        {game.state === "draft" && <span className="state draft">Draft: only you and the collection's owners can see this.</span>}
        {game.state === "hidden" && <span className="state hidden">Taken down{game.hiddenNote ? `: ${game.hiddenNote}` : "."}</span>}
      </header>

      {play ? <GameBoard play={play} saveId={`g-${game.id}`} />
        : <div className="problems"><p>This game's sketch has problems:</p><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}

      {game.description && <p className="game-desc">{game.description}</p>}
      {rules.length > 0 && (
        <section className="rules current">
          <h2>How to play</h2>
          {origin && <p className="origin">This is {/^[AEIOU]/.test(kindName(game.kind)) ? "an" : "a"} {kindName(game.kind)}. {origin}</p>}
          <ol>{rules.map((r) => <li key={r}>{r}</li>)}</ol>
          <p><Link to={`/puzzles/${game.kind}`}>{kindName(game.kind)} rules, with pictures and an example →</Link></p>
        </section>
      )}
    </main>
  );
}
