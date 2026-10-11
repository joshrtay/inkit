// A set as a card (a profile's grid, the feed, search) and its cover: the first four puzzles as
// four small paper cards in a square (docs/research-curation.md, cover A).
import { Link } from "react-router";
import type { SetCard as SetCardData } from "~/lib/sets.server";
import { Picture } from "./GameCard";
import { Diff } from "./Explore";
import { CardMore } from "./CardMore";

/** The cover: up to four puzzles, each its own little card, in a 2 × 2 square. */
export function SetCover({ cover, className = "" }: { cover: (string | null)[]; className?: string }) {
  return (
    <span className={`set-cover ${className}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (cover[i] !== undefined ? <Picture key={i} svg={cover[i]} className="set-mini" /> : <span key={i} className="set-mini empty" />))}
    </span>
  );
}

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86400e3);
  return d < 1 ? "today" : d < 30 ? `${d} d ago` : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/** A set in a grid. `draft`: in its author's Drafts (opens its page, where Edit opens the drawer). */
export function SetCard({ set, draft = false }: { set: SetCardData; draft?: boolean }) {
  return (
    <li>
      <Link className={`game-card set-card${draft ? " draft" : ""}`} to={`/s/${set.id}`}>
        <SetCover cover={set.cover} className="thumb" />
        <span className="game-card-text">
          <span className="kind">Set · {set.count} puzzle{set.count === 1 ? "" : "s"}</span>
          <strong>{set.title}</strong>
          <span className="by">by @{set.authorHandle}</span>
          <span className="card-foot">
            <Diff level={set.level} />
            {set.minutes > 0 && <span className="mins">~{set.minutes} min</span>}
            {draft ? <span className="when">Draft</span> : set.publishedAt && <span className="when">{ago(set.publishedAt)}</span>}
          </span>
        </span>
      </Link>
      {!draft && <CardMore kind="set" id={set.id} title={set.title} />}
    </li>
  );
}

/** A set in the Subscriptions feed: who made it and when, its title and numbers, its cover. */
export function SetFeedItem({ set }: { set: SetCardData }) {
  return (
    <li className="feed-item set-feed-item">
      <Link to={`/s/${set.id}`} className="feed-link">
        <span className="feed-text">
          <span className="by">@{set.authorHandle}{set.publishedAt && <> · {ago(set.publishedAt)}</>}</span>
          <strong className="feed-title">{set.title}</strong>
          <span className="kind">Set · {set.count} puzzle{set.count === 1 ? "" : "s"}{set.minutes > 0 && <> · ~{set.minutes} min</>}</span>
        </span>
        <SetCover cover={set.cover} className="feed-pic" />
      </Link>
    </li>
  );
}
