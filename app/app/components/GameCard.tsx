import { Form, Link } from "react-router";
import type { Thumbed } from "~/lib/thumbs.server";
import type { CollectionCard } from "~/lib/queries.server";
import { kindName } from "~/games/kinds";
import { Avatar } from "./Avatar";

const Picture = ({ svg, className }: { svg: string | null; className: string }) =>
  svg ? <span className={`grid-game pic ${className}`} dangerouslySetInnerHTML={{ __html: svg }} /> : <span className={`pic ${className} none`} />;

/** A game in a grid: its puzzle, title, type, who made it, and its state if it isn't public. */
export function GameCard({ game }: { game: Thumbed }) {
  return (
    <li>
      <Link className="game-card" to={`/g/${game.id}`}>
        <Picture svg={game.picture} className="thumb" />
        <span className="game-card-text">
          <span className="kind">{kindName(game.kind)}</span>
          <strong>{game.title}</strong>
          {game.description && <span className="desc">{game.description}</span>}
          <span className="by">
            by {game.authorDeleted ? game.authorName : `@${game.authorHandle}`}
            {game.collectionSlug !== game.authorHandle && <> in {game.collectionTitle}</>}
          </span>
          {game.state !== "published" && <span className={`state ${game.state}`}>{game.state}</span>}
        </span>
      </Link>
    </li>
  );
}

const when = (t: Date | number | null) => {
  if (!t) return "";
  const d = new Date(t), now = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }).toUpperCase();
};

/** A game in the feed: where it's from, its title and description, and its puzzle on the right. */
export function FeedItem({ game }: { game: Thumbed }) {
  return (
    <li className="feed-item">
      <Link to={`/g/${game.id}`} className="feed-link">
        <span className="feed-text">
          <span className="feed-from"><Avatar name={game.collectionTitle} seed={game.collectionSlug} size={22} /> {game.collectionTitle}<span className="feed-when">{when(game.publishedAt)}</span></span>
          <strong>{game.title}</strong>
          {game.description && <span className="desc">{game.description}</span>}
          <span className="feed-meta">{kindName(game.kind)}{game.collectionSlug !== game.authorHandle && !game.authorDeleted && <> · @{game.authorHandle}</>}</span>
        </span>
        <Picture svg={game.picture} className="feed-pic" />
      </Link>
    </li>
  );
}

/** Subscribe / Subscribed, for a collection (posts to its page). */
export function SubscribeButton({ slug, subscribed, signedIn }: { slug: string; subscribed: boolean; signedIn: boolean }) {
  if (!signedIn) return <Link className="btn primary" to={`/signin?next=/${slug}`}>Subscribe</Link>;
  return (
    <Form method="post" action={`/${slug}`} className="subscribe-form" preventScrollReset>
      <input type="hidden" name="intent" value={subscribed ? "unsubscribe" : "subscribe"} />
      <button className={subscribed ? "btn subscribed" : "btn primary"} type="submit">{subscribed ? "Subscribed" : "Subscribe"}</button>
    </Form>
  );
}

/** A creator or studio in a list: avatar, name, what they've made, and Subscribe. */
export function CollectionRow({ c, subscribed, signedIn, me }: { c: CollectionCard; subscribed: boolean; signedIn: boolean; me?: string }) {
  return (
    <li className="collection-row">
      <Link to={`/${c.slug}`} className="collection-link">
        <Avatar name={c.title} seed={c.slug} size={48} />
        <span className="collection-text">
          <strong>{c.title}</strong>
          <span className="muted">@{c.slug}{!c.personal && " · studio"} · {c.games} puzzle{c.games === 1 ? "" : "s"} · {c.subscribers} subscriber{c.subscribers === 1 ? "" : "s"}</span>
          {c.description && <span className="desc">{c.description}</span>}
        </span>
      </Link>
      {me !== c.slug && <SubscribeButton slug={c.slug} subscribed={subscribed} signedIn={signedIn} />}
    </li>
  );
}
