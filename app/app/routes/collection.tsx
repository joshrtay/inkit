// A profile: inkit.games/<slug>. A creator's personal collection lives at their handle; studios
// have their own. Like a Substack profile: who they are, Subscribe, and tabs for their puzzles
// and (for a person) who they subscribe to, or (for a studio) its members.
import { data, Link, redirect } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/collection";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { roleIn } from "~/lib/permissions.server";
import { signInFirst } from "~/lib/http.server";
import { collectionBySlug, collectionGames, collectionMembers, collectionSolves, isSubscribed, markSolved, subscriberCount, subscriptionsOf } from "~/lib/queries.server";
import { withPictures } from "~/lib/thumbs.server";
import { CollectionRow, GameCard, SubscribeButton } from "~/components/GameCard";
import { Avatar } from "~/components/Avatar";
import { CreateMenu } from "~/components/Shell";
import "~site/game-types/grid/styles.css";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const collection = await collectionBySlug(db, params.slug.toLowerCase());
  if (!collection) throw data(null, { status: 404 });
  const viewer = await currentCreator(env, request);
  const role = await roleIn(db, collection.id, viewer?.id);
  // A deleted studio is offline, except to its owners.
  if (collection.deletedAt && role !== "owner" && !viewer?.isAdmin) throw data(null, { status: 404 });
  const owner = role === "owner";
  const tab = new URL(request.url).searchParams.get("tab") ?? "puzzles";
  const [games, members, person, subscribers, subscribed, solves] = await Promise.all([
    collectionGames(db, collection.id, !!role || !!viewer?.isAdmin),
    collectionMembers(db, collection.id),
    collection.personalOf ? db.query.creators.findFirst({ where: eq(schema.creators.id, collection.personalOf) }) : null,
    subscriberCount(db, collection.id),
    isSubscribed(db, viewer?.id, collection.id),
    collectionSolves(db, collection.id),
  ]);
  const following = person ? await subscriptionsOf(db, person.id) : [];
  const viewerFollows = viewer && following.length
    ? new Set((await db.select({ id: schema.subscriptions.collectionId }).from(schema.subscriptions).where(eq(schema.subscriptions.subscriberId, viewer.id))).map((s) => s.id))
    : new Set<string>();
  // Puzzles: what everyone sees. Drafts (and games taken down): only their author, the
  // collection's owners and admins, in a tab of their own.
  const published = games.filter((g) => g.state === "published");
  const drafts = games.filter((g) => g.state !== "published" && (owner || viewer?.isAdmin || g.authorHandle === viewer?.handle));
  const canSeeDrafts = !!role || !!viewer?.isAdmin;
  return {
    collection: { slug: collection.slug, title: collection.title, description: collection.description, personal: !!collection.personalOf, deleted: !!collection.deletedAt },
    person: person && { handle: person.handle, name: person.name },
    members,
    games: await markSolved(db, viewer?.id, withPictures(published)),
    drafts: canSeeDrafts ? withPictures(drafts) : null,
    following: following.map((c) => ({ ...c, subscribed: viewerFollows.has(c.id) })),
    subscribers, subscribed, solves, role,
    me: viewer?.handle ?? null,
    tab: ["puzzles", "subscriptions", "members", ...(canSeeDrafts ? ["drafts"] : [])].includes(tab) ? tab : "puzzles",
  };
}

/** Subscribe or unsubscribe (any signed-in creator, to anyone but themselves). */
export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const collection = await collectionBySlug(db, params.slug.toLowerCase());
  if (!collection || collection.deletedAt) throw data(null, { status: 404 });
  const intent = (await request.formData()).get("intent");
  if (intent === "subscribe" && collection.personalOf !== me.id) {
    await db.insert(schema.subscriptions).values({ subscriberId: me.id, collectionId: collection.id }).onConflictDoNothing();
  } else if (intent === "unsubscribe") {
    await db.delete(schema.subscriptions).where(and(eq(schema.subscriptions.subscriberId, me.id), eq(schema.subscriptions.collectionId, collection.id)));
  }
  // a subscribe from another page (Explore, a list) returns there
  const back = request.headers.get("referer");
  return back && new URL(back).origin === new URL(request.url).origin ? redirect(new URL(back).pathname + new URL(back).search) : null;
}

export const meta: Route.MetaFunction = ({ loaderData: data }) => data
  ? [{ title: `${data.collection.title} · inkit` }, { name: "description", content: data.collection.description || `Puzzles by ${data.collection.title}.` }]
  : [{ title: "Not found · inkit" }];

export default function Collection({ loaderData: d }: Route.ComponentProps) {
  const { collection, person, members, games, drafts, following, subscribers, subscribed, solves, role, me, tab } = d;
  const mine = !!person && person.handle === me;
  const tabs = [
    { id: "puzzles", label: "Puzzles", n: games.length },
    // only you (and the owners) see this tab
    ...(drafts ? [{ id: "drafts", label: "Drafts", n: drafts.length }] : []),
    ...(person ? [{ id: "subscriptions", label: "Subscriptions", n: following.length }] : [{ id: "members", label: "Members", n: members.length }]),
  ];
  return (
    <main className="wrap profile">
      <header className="profile-head">
        <div className="profile-id">
          <h1>{collection.title}</h1>
          <span className="muted">{person ? `@${person.handle}` : `@${collection.slug} · studio`}</span>
          {collection.description && <p className="profile-bio">{collection.description}</p>}
          <p className="profile-stats">{subscribers} subscriber{subscribers === 1 ? "" : "s"}{solves > 0 && <> · {solves} solve{solves === 1 ? "" : "s"}</>}{role && !mine && <> · you&rsquo;re {role === "owner" ? "an owner" : "a contributor"}</>}</p>
        </div>
        <Avatar name={collection.title} seed={collection.slug} size={96} />
        {collection.deleted && <p className="state hidden">This studio was deleted; its games are offline.</p>}
        <div className="profile-actions">
          {mine ? <CreateMenu /> : role ? <Link className="btn primary" to={`/new?in=${collection.slug}`}>New puzzle here</Link>
            : <SubscribeButton slug={collection.slug} subscribed={subscribed} signedIn={!!me} />}
          {role && <Link className="btn" to={`/${collection.slug}/settings`}>{mine ? "Edit profile" : "Settings"}</Link>}
        </div>
      </header>

      <nav className="tabs" aria-label="Profile">
        {tabs.map((t) => (
          <Link key={t.id} to={t.id === "puzzles" ? `/${collection.slug}` : `/${collection.slug}?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined} preventScrollReset>
            {t.label}{t.id !== "puzzles" && ` (${t.n})`}
          </Link>
        ))}
      </nav>

      {tab === "puzzles" && (games.length ? <ul className="cards">{games.map((g) => <GameCard key={g.id} game={g} />)}</ul> : (
        <div className="empty-tab">
          <p>{mine ? "You haven't made any puzzles yet." : "No puzzles here yet."}</p>
          {mine && <p className="muted">Draw one on paper, take a photo, and upload it.</p>}
          {mine && <Link className="btn primary" to="/new">Make a puzzle</Link>}
        </div>
      ))}
      {tab === "drafts" && drafts && (drafts.length ? <ul className="cards">{drafts.map((g) => <GameCard key={g.id} game={g} draft />)}</ul> : (
        <div className="empty-tab">
          <p>No drafts.</p>
          <p className="muted">Puzzles you&rsquo;re still working on wait here until you publish them.</p>
          <Link className="btn primary" to={role && !mine ? `/new?in=${collection.slug}` : "/new"}>Make a puzzle</Link>
        </div>
      ))}
      {tab === "subscriptions" && (following.length
        ? <ul className="collection-list">{following.map((c) => <CollectionRow key={c.id} c={c} subscribed={c.subscribed} signedIn={!!me} me={me ?? undefined} />)}</ul>
        : <div className="empty-tab"><p>{mine ? "You don't subscribe to anyone yet." : "Not subscribed to anyone yet."}</p>{mine && <Link className="btn" to="/explore">Explore creators</Link>}</div>)}
      {tab === "members" && (
        <ul className="member-list">{members.map((m) => <li key={m.handle}><Link to={`/${m.handle}`}><Avatar name={m.name} seed={m.handle} size={32} /> {m.name} <span className="muted">@{m.handle}{m.role === "owner" ? " · owner" : ""}</span></Link></li>)}</ul>
      )}

    </main>
  );
}
