import { Form, Link } from "react-router";
import type { Thumbed } from "~/lib/thumbs.server";
import type { CollectionCard } from "~/lib/queries.server";
import { doubtsOf } from "~/games/doubts";
import { kindName } from "~/games/kinds";
import { Avatar } from "./Avatar";
import { LikeButton } from "./LikeButton";
import { AiBadge } from "./AiBadge";

const Picture = ({ svg, className }: { svg: string | null; className: string }) =>
  svg ? <span className={`grid-game pic ${className}`} dangerouslySetInnerHTML={{ __html: svg }} /> : <span className={`pic ${className} none`} />;

/** A game in a grid: its puzzle, title, type, who made it, and its state if it isn't public. */
/** `draft`: a card in your Drafts: it opens the editor, and says when you last edited it and how
 *  many of Claude's doubts are left to check. */
export function GameCard({ game, draft = false }: { game: Thumbed; draft?: boolean }) {
  if (draft) {
    const left = doubtsOf(game.parseNotes).filter((d) => !d.done).length;
    return (
      <li>
        <Link className="game-card" to={`/g/${game.id}/edit`}>
          <Picture svg={game.picture} className="thumb" />
          <span className="game-card-text">
            <span className="kind">{kindName(game.kind)}</span>
            <strong>{game.title || "Untitled"}</strong>
            <span className="by">
              {game.publishAt ? <>Goes up {scheduled(game.publishAt)}</> : <>Edited {edited(game.updatedAt)}</>}
              {game.authorHandle && game.collectionSlug !== game.authorHandle && <> · by @{game.authorHandle}</>}
            </span>
            {game.state === "hidden" ? <span className="state hidden">taken down</span>
              : left > 0 && <span className="state to-check">{left} doubt{left === 1 ? "" : "s"} to check</span>}
          </span>
        </Link>
      </li>
    );
  }
  return (
    <li>
      <Link className="game-card" to={`/g/${game.id}`}>
        <Picture svg={game.picture} className="thumb" />
        {game.solved && <Solved />}
        <span className="game-card-text">
          <span className="kind">{kindName(game.kind)}</span>
          <strong>{game.title}</strong>
          {game.description && <span className="desc">{game.description}</span>}
          <span className="by">
            by {game.authorDeleted ? game.authorName : `@${game.authorHandle}`}{game.authorAi && <> <AiBadge /></>}
            {game.collectionSlug !== game.authorHandle && <> in {game.collectionTitle}</>}
          </span>
          {game.state !== "published" && <span className={`state ${game.state}`}>{game.state}</span>}
          {game.state === "published" && (game.likes > 0 || game.solves > 0) && (
            <span className="card-counts">
              {game.likes > 0 && <span aria-label={`${game.likes} like${game.likes === 1 ? "" : "s"}`}>♥ {game.likes}</span>}
              {game.solves > 0 && <span>{game.solves} solve{game.solves === 1 ? "" : "s"}</span>}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/** The viewer has solved this puzzle: a pen check, like the one stamped on a solved board. */
const Solved = () => (
  <span className="solved-badge" role="img" aria-label="Solved" title="Solved">
    <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 54 C24 61 32 69 39 80 C52 57 68 36 88 16" /></svg>
  </span>
);

const edited = (t: Date | number | null) => {
  if (!t) return "";
  const d = new Date(t), now = new Date();
  if (now.getTime() - d.getTime() < 86400e3 && d.getDate() === now.getDate()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
};

/** when a scheduled draft goes up (an AI creator's queue) */
const scheduled = (t: Date | number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

const when = (t: Date | number | null) => {
  if (!t) return "";
  const d = new Date(t), now = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }).toUpperCase();
};

/** A game in the feed: where it's from, its title and description, and its puzzle on the right. */
export function FeedItem({ game, liked = false, signedIn = false }: { game: Thumbed; liked?: boolean; signedIn?: boolean }) {
  return (
    <li className="feed-item">
      <Link to={`/g/${game.id}`} className="feed-link">
        <span className="feed-text">
          <span className="feed-from"><Avatar name={game.collectionTitle} seed={game.collectionSlug} size={22} /> {game.collectionTitle}{game.authorAi && game.collectionSlug === game.authorHandle && <AiBadge />}<span className="feed-when">{when(game.publishedAt)}</span></span>
          <strong>{game.title}</strong>
          {game.description && <span className="desc">{game.description}</span>}
          <span className="feed-meta">{kindName(game.kind)}{game.collectionSlug !== game.authorHandle && !game.authorDeleted && <> · @{game.authorHandle}{game.authorAi && <> <AiBadge /></>}</>}{game.solves > 0 && <> · {game.solves} solve{game.solves === 1 ? "" : "s"}</>}</span>
        </span>
        <span className="feed-pic-wrap"><Picture svg={game.picture} className="feed-pic" />{game.solved && <Solved />}</span>
      </Link>
      <div className="feed-actions"><LikeButton gameId={game.id} count={game.likes} liked={liked} signedIn={signedIn} /></div>
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
          <strong>{c.title}{c.ai && <> <AiBadge /></>}</strong>
          <span className="muted">@{c.slug}{!c.personal && " · studio"} · {c.games} puzzle{c.games === 1 ? "" : "s"} · {c.subscribers} subscriber{c.subscribers === 1 ? "" : "s"}</span>
          {c.description && <span className="desc">{c.description}</span>}
        </span>
      </Link>
      {me !== c.slug && <SubscribeButton slug={c.slug} subscribed={subscribed} signedIn={signedIn} />}
    </li>
  );
}
