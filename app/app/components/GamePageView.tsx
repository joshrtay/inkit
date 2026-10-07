// A game's page as players see it: back, the title and who made it, How to play, the board and
// the description. The game route shows it; the editor's Preview shows the same thing.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Playable } from "~/games/layout";
import { GameBoard } from "./GameBoard";
import { GuidePane } from "./GuidePane";

export interface GamePageProps {
  game: { id: string; title: string; description: string; kind: string; state: string; hiddenNote: string | null; when: number };
  collection: { slug: string; title: string; personal: boolean };
  author: { handle: string; name: string; deleted: boolean };
  play: Playable | null;
  summary: string;
  extra: string[];
  errors: string[];
  editable: boolean;
  /** shown in the editor's preview: nothing is saved, and links don't leave the editor */
  preview?: boolean;
}

const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const RULES_OPEN = "inkit:rules-open";

export function GamePageView({ game, collection, author, play, summary, extra, errors, editable, preview = false }: GamePageProps) {
  // How to play: the type's guide in the right-hand pane, open or closed as the player last left it
  const [rulesOpen, setRulesOpen] = useState(false);
  // back: to wherever the player came from on this site, or else this creator's page
  const navigate = useNavigate(), location = useLocation();
  const cameFromSite = location.key !== "default";
  const home = `/${collection.slug}`;
  useEffect(() => { try { setRulesOpen(localStorage.getItem(RULES_OPEN) === "1"); } catch { /* closed */ } }, []);
  const toggleRules = (v: boolean) => { setRulesOpen(v); if (!preview) try { localStorage.setItem(RULES_OPEN, v ? "1" : "0"); } catch { /* this page only */ } };
  const stay = (e: React.MouseEvent) => { if (preview) e.preventDefault(); };

  return (
    <div className={`game-layout${rulesOpen ? " rules-open" : ""}`}>
      <Link className="back-btn" to={home} aria-label="Back" title="Back"
        onClick={(e) => { if (preview) e.preventDefault(); else if (cameFromSite) { e.preventDefault(); navigate(-1); } }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </Link>
    <main className="wrap game-page">
      <header className="game-head">
        <h1>{game.title}</h1>
        <span className="muted">
          {summary} · by{" "}
          {author.deleted ? author.name : <Link to={`/${author.handle}`} onClick={stay}>@{author.handle}</Link>}
          {!collection.personal && <> in <Link to={`/${collection.slug}`} onClick={stay}>{collection.title}</Link></>}
          {" · "}<time dateTime={new Date(game.when).toISOString()}>{date(game.when)}</time>
        </span>
        <button className="btn rules-toggle" type="button" aria-pressed={rulesOpen} onClick={() => toggleRules(!rulesOpen)}>How to play</button>
        {editable && !preview && <Link className="btn" to={`/g/${game.id}/edit`}>Edit</Link>}
        {!preview && game.state === "draft" && <span className="state draft">Draft: only you and the collection's owners can see this.</span>}
        {!preview && game.state === "hidden" && <span className="state hidden">Taken down{game.hiddenNote ? `: ${game.hiddenNote}` : "."}</span>}
      </header>

      {play ? <GameBoard play={play} saveId={preview ? undefined : `g-${game.id}`} />
        : <div className="problems"><p>This game's sketch has problems:</p><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}

      {game.description && <p className="game-desc">{game.description}</p>}
    </main>
    <GuidePane key={game.kind} start={game.kind} side open={rulesOpen} onClose={() => toggleRules(false)} extra={extra} />
    </div>
  );
}
