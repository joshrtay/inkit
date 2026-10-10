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
import { inks, newestPictures } from "~/lib/explore.server";
import { recommendationsOf } from "~/lib/recommendations.server";
import { collectionBySlug, collectionGames, collectionMembers, collectionSolves, isSubscribed, markSolved, subscriberCount, subscriptionsOf } from "~/lib/queries.server";
import { draftPictures, withPictures } from "~/lib/thumbs.server";
import { pageMeta, profileJsonLd } from "~/lib/seo";
import { CollectionRow, GameCard, SubscribeButton } from "~/components/GameCard";
import { Avatar } from "~/components/Avatar";
import { CreateMenu } from "~/components/Shell";
import { AiBadge } from "~/components/AiBadge";
import { Pic } from "~/components/Explore";
import { personaByHandle } from "~/ai/personas";
import { kindName } from "~/games/kinds";
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
  const [following, recs] = person ? await Promise.all([subscriptionsOf(db, person.id), recommendationsOf(db, person.id)]) : [[], []];
  const recPics = recs.length ? await newestPictures(db, recs.map((r) => r.id), 2) : { byAuthor: {}, pictures: {} };
  const viewerFollows = viewer && (following.length || recs.length)
    ? new Set((await db.select({ id: schema.subscriptions.collectionId }).from(schema.subscriptions).where(eq(schema.subscriptions.subscriberId, viewer.id))).map((s) => s.id))
    : new Set<string>();
  // Puzzles: what everyone sees. Drafts (and games taken down): only their author, the
  // collection's owners and admins, in a tab of their own.
  const published = games.filter((g) => g.state === "published");
  const drafts = games.filter((g) => g.state !== "published" && (owner || viewer?.isAdmin || g.authorHandle === viewer?.handle));
  const canSeeDrafts = !!role || !!viewer?.isAdmin;
  return {
    collection: { slug: collection.slug, title: collection.title, description: collection.description, personal: !!collection.personalOf, deleted: !!collection.deletedAt, since: collection.createdAt },
    person: person && { handle: person.handle, name: person.name, ai: person.isAi },
    // an AI creator's "How I make puzzles" (app/ai/personas.ts)
    persona: person?.isAi ? aiProfile(person.handle) : null,
    members,
    games: await markSolved(db, viewer?.id, withPictures(published)),
    drafts: canSeeDrafts ? await draftPictures(db, drafts) : null,
    following: following.map((c) => ({ ...c, subscribed: viewerFollows.has(c.id) })),
    // whom they recommend (lib/recommendations.server.ts), with each one's two newest puzzles
    recommends: recs.map((r) => ({ ...r, subscribed: viewerFollows.has(r.collectionId), newest: recPics.byAuthor[r.id] ?? [] })),
    recPictures: recPics.pictures, inks: recs.length ? inks() : {},
    subscribers, subscribed, solves, role,
    me: viewer?.handle ?? null,
    tab: ["puzzles", "about", "subscriptions", "members", "recommends", ...(canSeeDrafts ? ["drafts"] : [])].includes(tab) ? tab : "puzzles",
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

function aiProfile(handle: string) {
  const p = personaByHandle(handle);
  if (!p) return null;
  return { howIMake: p.howIMake, schedule: p.schedule.summary, kinds: p.genres.map((g) => kindName(g.genre)), principles: p.quality.principles, paused: !!p.paused };
}

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [{ title: "Not found · inkit" }];
  const c = d.collection, n = d.games.length;
  return pageMeta({
    title: `${c.title} (@${c.slug}): logic puzzles · inkit`,
    description: c.description || `${n ? `${n} hand-drawn logic puzzle${n === 1 ? "" : "s"}` : "Hand-drawn logic puzzles"} by ${c.title}, to play in your browser on inkit.`,
    path: `/${c.slug}`, type: "profile",
    // a deleted studio, still shown to its owners
    noindex: c.deleted,
    jsonLd: profileJsonLd({ slug: c.slug, title: c.title, description: c.description, person: c.personal }),
  });
};

/** Text whose verse lines are broken with " / " (an AI creator's light verse), as lines. */
const verse = (text: string) => text.split(" / ").flatMap((line, i) => (i ? [<br key={i} />, line] : [line]));

export default function Collection({ loaderData: d }: Route.ComponentProps) {
  const { collection, person, persona, members, games, drafts, following, recommends, subscribers, subscribed, solves, role, me, tab } = d;
  const mine = !!person && person.handle === me;
  const tabs = [
    { id: "puzzles", label: "Puzzles", n: games.length },
    // only you (and the owners) see this tab
    ...(drafts ? [{ id: "drafts", label: "Drafts", n: drafts.length }] : []),
    // whom they recommend: shown when they recommend anyone (and always to themselves, to set it up)
    ...(person && (recommends.length || mine) ? [{ id: "recommends", label: "Recommends", n: recommends.length }] : []),
    ...(person ? [{ id: "subscriptions", label: "Subscriptions", n: following.length }] : [{ id: "members", label: "Members", n: members.length }]),
    // who they are, at length: the whole bio, what they make, since when (an AI creator's how and when)
    { id: "about", label: "About", n: null },
  ];
  const makes = [...new Set(games.map((g) => g.kind).filter(Boolean))].map(kindName).sort();
  return (
    <main className="wrap profile">
      <header className="profile-head">
        <div className="profile-id">
          <h1>{collection.title}</h1>
          <span className="muted">{person ? `@${person.handle}` : `@${collection.slug} · studio`}{person?.ai && <> <AiBadge /></>}</span>
          {/* the bio, kept short here (two lines); the whole of it is on About */}
          {collection.description && tab !== "about" && <p className="profile-bio">{verse(collection.description)}</p>}
          {collection.description && tab !== "about" && <Link className="profile-more" to={`/${collection.slug}?tab=about`} preventScrollReset>More about {person ? (person.name.split(" ")[0] || collection.title) : "this studio"}</Link>}
          <p className="profile-stats">{subscribers} subscriber{subscribers === 1 ? "" : "s"}{solves > 0 && <> · {solves} solve{solves === 1 ? "" : "s"}</>}{role && !mine && <> · you&rsquo;re {role === "owner" ? "an owner" : "a contributor"}</>}</p>
        </div>
        <Avatar name={collection.title} seed={collection.slug} size={96} ai={!!person?.ai} />
        {collection.deleted && <p className="state hidden">This studio was deleted.</p>}
        <div className="profile-actions">
          {mine ? <CreateMenu /> : role ? <Link className="btn primary" to={`/new?in=${collection.slug}`}>New puzzle here</Link>
            : <SubscribeButton slug={collection.slug} subscribed={subscribed} signedIn={!!me} />}
          {mine ? <Link className="btn" to="/settings">Edit profile</Link> : role && <Link className="btn" to={`/${collection.slug}/settings`}>Settings</Link>}
        </div>
      </header>

      <nav className="tabs" aria-label="Profile">
        {tabs.map((t) => (
          <Link key={t.id} to={t.id === "puzzles" ? `/${collection.slug}` : `/${collection.slug}?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined} preventScrollReset>
            {t.label}{t.n !== null && t.id !== "puzzles" && ` (${t.n})`}
          </Link>
        ))}
      </nav>

      {tab === "about" && (
        <section className="about" aria-labelledby="about-h">
          <h2 id="about-h" className="visually-hidden">About</h2>
          {collection.description && <p className="about-bio">{verse(collection.description)}</p>}
          {persona && <>
            <h3>How I make puzzles</h3>
            {persona.howIMake.map((p) => <p key={p}>{verse(p)}</p>)}
          </>}
          <dl className="ai-facts">
            {(persona?.kinds.length || makes.length) ? <><dt>Makes</dt><dd>{(persona?.kinds ?? makes).join(", ")}</dd></> : null}
            {persona && <><dt>Posts</dt><dd>{persona.paused ? "Paused for now." : persona.schedule}</dd></>}
            {persona && <><dt>Holds to</dt><dd>{persona.principles.join(" · ")}</dd></>}
            {collection.since && <><dt>On inkit since</dt><dd>{new Date(collection.since).toLocaleDateString("en", { month: "long", year: "numeric" })}</dd></>}
          </dl>
          {persona && (
            <p className="ai-note muted">
              <AiBadge /> An AI creator. Its puzzles come from inkit&rsquo;s generator, and each one is proved to have exactly one
              solution before it&rsquo;s posted. Claude writes the titles and notes in this voice.
            </p>
          )}
        </section>
      )}
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
          <p className="muted">Unpublished puzzles wait here.</p>
          <Link className="btn primary" to={role && !mine ? `/new?in=${collection.slug}` : "/new"}>Make a puzzle</Link>
        </div>
      ))}
      {tab === "recommends" && person && (recommends.length ? (
        <section className="recommends" aria-labelledby="recs-h">
          <h2 id="recs-h" className="visually-hidden">Recommends</h2>
          <p className="muted rec-intro">{mine ? "You recommend" : `${person.name.replace(/^The (Hon\. )?/, "").split(" ")[0]} recommends`} {recommends.length} creator{recommends.length === 1 ? "" : "s"}.{mine && <> <Link to="/settings#recommendations">Edit</Link></>}</p>
          <ul className="rec-list">{recommends.map((r) => (
            <li key={r.id}>
              <Link to={`/${r.handle}`} className="rec-list-who"><Avatar name={r.name} seed={r.handle} size={44} ai={r.ai} /></Link>
              <div>
                <Link to={`/${r.handle}`} className="rec-name"><strong>{r.name}</strong></Link>{r.ai && <> <AiBadge /></>} <span className="muted">@{r.handle}</span>
                <p>{r.note || r.bio}</p>
              </div>
              <Link className="ccard-pics" to={`/${r.handle}`} aria-label={`${r.name}'s puzzles`}>{r.newest.map((id) => <Pic key={id} pic={d.recPictures[id]} inks={d.inks} className="mini" />)}</Link>
              {me !== r.handle ? <SubscribeButton slug={r.handle} subscribed={r.subscribed} signedIn={!!me} /> : <span />}
            </li>
          ))}</ul>
        </section>
      ) : (
        <div className="empty-tab"><p>You don&rsquo;t recommend anyone yet.</p><p className="muted">Up to five creators, each with a line.</p><Link className="btn" to="/settings#recommendations">Choose in Settings</Link></div>
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
