// A game's permanent page: wyattsgames.com/g/<id>.
import { useEffect, useState } from "react";
import { data, Link, useLocation, useNavigate } from "react-router";
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
import { GuidePane } from "~/components/GuidePane";

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
    collection: { slug: collection.slug, title: collection.title, personal: !!collection.personalOf },
    author: { handle: author.handle, name: author.name, deleted: !!author.deletedAt },
    play: parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null,
    summary: parsed.ok ? parsed.summary : kindName(game.kind),
    // a puzzle that lists its own rules (Panes; a 2-star Star Battle) shows them above its type's guide
    extra: parsed.ok && parsed.spec.rules?.length ? parsed.rules : [],
    errors: parsed.ok ? [] : parsed.errors,
    editable: canEdit(game, viewer, role) || canHide(viewer, role),
  };
}

export const meta: Route.MetaFunction = ({ loaderData: data }) => data
  ? [{ title: `${data.game.title} · inkit` }, { name: "description", content: data.game.description || `A ${kindName(data.game.kind)} puzzle.` }]
  : [{ title: "Not found · inkit" }];

const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const RULES_OPEN = "inkit:rules-open";

export default function Game({ loaderData: { game, collection, author, play, summary, extra, errors, editable } }: Route.ComponentProps) {
  // How to play: the type's guide in the right-hand pane, open or closed as the player last left it
  const [rulesOpen, setRulesOpen] = useState(false);
  // back: to wherever the player came from on this site, or else this creator's page
  const navigate = useNavigate(), location = useLocation();
  const cameFromSite = location.key !== "default";
  const home = `/${collection.slug}`;
  useEffect(() => { try { setRulesOpen(localStorage.getItem(RULES_OPEN) === "1"); } catch { /* closed */ } }, []);
  const toggleRules = (v: boolean) => { setRulesOpen(v); try { localStorage.setItem(RULES_OPEN, v ? "1" : "0"); } catch { /* this page only */ } };
  return (
    <div className={`game-layout${rulesOpen ? " rules-open" : ""}`}>
    <main className="wrap game-page">
      <header className="game-head">
        <Link className="back-btn" to={home} aria-label="Back" title="Back"
          onClick={(e) => { if (cameFromSite) { e.preventDefault(); navigate(-1); } }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <h1>{game.title}</h1>
        <span className="muted">
          {summary} · by{" "}
          {author.deleted ? author.name : <Link to={`/${author.handle}`}>@{author.handle}</Link>}
          {!collection.personal && <> in <Link to={`/${collection.slug}`}>{collection.title}</Link></>}
          {" · "}<time dateTime={new Date(game.when).toISOString()}>{date(game.when)}</time>
        </span>
        <button className="btn rules-toggle" type="button" aria-pressed={rulesOpen} onClick={() => toggleRules(!rulesOpen)}>How to play</button>
        {editable && <Link className="btn" to={`/g/${game.id}/edit`}>Edit</Link>}
        {game.state === "draft" && <span className="state draft">Draft: only you and the collection's owners can see this.</span>}
        {game.state === "hidden" && <span className="state hidden">Taken down{game.hiddenNote ? `: ${game.hiddenNote}` : "."}</span>}
      </header>

      {play ? <GameBoard play={play} saveId={`g-${game.id}`} />
        : <div className="problems"><p>This game's sketch has problems:</p><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}

      {game.description && <p className="game-desc">{game.description}</p>}
    </main>
    <GuidePane key={game.kind} start={game.kind} side open={rulesOpen} onClose={() => toggleRules(false)} extra={extra} />
    </div>
  );
}
