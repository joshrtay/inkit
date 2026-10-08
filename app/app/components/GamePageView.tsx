// A game's page as players see it: back, the title and who made it, How to play, the board and
// the description. The game route shows it; the editor's Preview shows the same thing.
import { useEffect, useState } from "react";
import { Link, useFetcher, useLocation, useNavigate } from "react-router";
import type { Playable } from "~/games/layout";
import { GameBoard } from "./GameBoard";
import { GuidePane } from "./GuidePane";
import { LikeButton } from "./LikeButton";

export interface GamePageProps {
  game: { id: string; title: string; description: string; kind: string; state: string; hiddenNote: string | null; when: number };
  collection: { slug: string; title: string; personal: boolean };
  author: { handle: string; name: string; deleted: boolean };
  play: Playable | null;
  summary: string;
  extra: string[];
  errors: string[];
  editable: boolean;
  likes: { count: number; liked: boolean };
  /** how many players have solved it, and whether this one has (signed in) */
  solves: { count: number; solved: boolean };
  signedIn: boolean;
  /** shown in the editor's preview: nothing is saved, and links don't leave the editor */
  preview?: boolean;
}

// in UTC, so the server and the browser write the same date
const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const RULES_OPEN = "inkit:rules-open";

export function GamePageView({ game, collection, author, play, summary, extra, errors, editable, likes, solves, signedIn, preview = false }: GamePageProps) {
  // How to play: the type's guide in the right-hand pane, open or closed as the player last left it
  const [rulesOpen, setRulesOpen] = useState(false);
  // back: to wherever the player came from on this site, or else this creator's page
  const navigate = useNavigate(), location = useLocation();
  const cameFromSite = location.key !== "default";
  const home = `/${collection.slug}`;
  useEffect(() => { try { setRulesOpen(localStorage.getItem(RULES_OPEN) === "1"); } catch { /* closed */ } }, []);
  const toggleRules = (v: boolean) => { setRulesOpen(v); if (!preview) try { localStorage.setItem(RULES_OPEN, v ? "1" : "0"); } catch { /* this page only */ } };
  const stay = (e: React.MouseEvent) => { if (preview) e.preventDefault(); };
  // a signed-in player's solve is kept (routes/game-solve.ts): it marks the puzzle solved for them
  // everywhere, and counts toward the puzzle's solves
  const solve = useFetcher<{ count: number; solved: boolean }>();
  const solved = solve.data ?? solves;
  const onSolved = signedIn && !preview && game.state === "published" && !solves.solved
    ? () => { if (solve.state === "idle" && !solve.data) solve.submit(null, { method: "post", action: `/g/${game.id}/solve` }); }
    : undefined;

  return (
    <div className={`game-layout${rulesOpen ? " rules-open" : ""}`}>
      {!preview && (
        <Link className="back-btn" to={home} aria-label="Back" title="Back"
          onClick={(e) => { if (cameFromSite) { e.preventDefault(); navigate(-1); } }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
      )}
    <main className="wrap game-page">
      <header className="game-head">
        <h1>{game.title}</h1>
        <span className="muted">
          {summary} · by{" "}
          {author.deleted ? author.name : <Link to={`/${author.handle}`} onClick={stay}>@{author.handle}</Link>}
          {!collection.personal && <> in <Link to={`/${collection.slug}`} onClick={stay}>{collection.title}</Link></>}
          {" · "}<time dateTime={new Date(game.when).toISOString()}>{date(game.when)}</time>
          {solved.count > 0 && <> · {solved.count} solve{solved.count === 1 ? "" : "s"}</>}
        </span>
        {solved.solved && <span className="solved-mark" title="You've solved this">✓ Solved</span>}
        {(game.state === "published" || preview) && <LikeButton gameId={game.id} count={likes.count} liked={likes.liked} signedIn={signedIn || preview} disabled={preview} />}
        <button className="btn rules-toggle" type="button" aria-pressed={rulesOpen} onClick={() => toggleRules(!rulesOpen)}>How to play</button>
        {editable && !preview && <Link className="btn" to={`/g/${game.id}/edit`}>Edit</Link>}
        {!preview && game.state === "draft" && <span className="state draft">Draft: only you and the collection's owners can see this.</span>}
        {!preview && game.state === "hidden" && <span className="state hidden">Taken down{game.hiddenNote ? `: ${game.hiddenNote}` : "."}</span>}
      </header>

      {play ? <GameBoard play={play} saveId={preview ? undefined : `g-${game.id}`} onSolved={onSolved} />
        : <div className="problems"><p>This game's sketch has problems:</p><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}

      {game.description && <p className="game-desc">{game.description}</p>}
    </main>
    <GuidePane key={game.kind} start={game.kind} side open={rulesOpen} onClose={() => toggleRules(false)} extra={extra} />
    </div>
  );
}
