import { Link } from "react-router";
import type { GameCard as Card } from "~/lib/queries.server";
import { kindName } from "~/games/kinds";

/** A game in a list: title, type, who made it, and its state if it isn't public. */
export function GameCard({ game }: { game: Card }) {
  return (
    <li>
      <Link className="game-card" to={`/g/${game.id}`}>
        <span className="kind">{kindName(game.kind)}</span>
        <strong>{game.title}</strong>
        {game.description && <span className="desc">{game.description}</span>}
        <span className="by">
          by {game.authorDeleted ? game.authorName : `@${game.authorHandle}`}
          {game.collectionSlug !== game.authorHandle && <> in {game.collectionTitle}</>}
        </span>
        {game.state !== "published" && <span className={`state ${game.state}`}>{game.state}</span>}
      </Link>
    </li>
  );
}
