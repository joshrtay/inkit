// A game's page as players see it: back, the title and who made it, How to play, the board and
// the description, and the creator's drawing ("Drawn by", for a puzzle drawn in paint). The game
// route shows it; the editor's Preview shows the same thing; and a draft's publish page
// (/g/<id>/publish) shows it with the title and description edited in place, the solver's verdict
// and Publish (`draft`).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useFetcher, useLocation, useNavigate } from "react-router";
import type { Playable } from "~/games/layout";
import { GameBoard } from "./GameBoard";
import { GuidePane } from "./GuidePane";
import { LikeButton } from "./LikeButton";
import { AiBadge } from "./AiBadge";

export interface GamePageProps {
  game: { id: string; title: string; description: string; kind: string; state: string; hiddenNote: string | null; when: number };
  collection: { slug: string; title: string; personal: boolean };
  author: { handle: string; name: string; deleted: boolean; ai?: boolean };
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
  /** where Edit goes (a draft drawn in paint: paint) */
  editTo?: string;
  /** the creator's drawing (paint's, as drawn: sketchpad/picture.ts) */
  drawnBy?: string | null;
  /** the draft's publish page: the title and description edited in place, and the publish bar */
  draft?: DraftEdit;
}

export interface DraftEdit {
  title: string; description: string;
  onTitle: (v: string) => void; onDescription: (v: string) => void;
  /** "Give it a title" under the title (it takes focus) */
  needsTitle?: boolean;
  /** the verdict and Publish, under the head */
  bar: ReactNode;
  /** paint, for this draft */
  paintTo: string;
}

// in UTC, so the server and the browser write the same date
const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const RULES_OPEN = "inkit:rules-open";

export function GamePageView({ game, collection, author, play, summary, extra, errors, editable, likes, solves, signedIn, preview = false, drawnBy = null, draft, editTo }: GamePageProps) {
  // How to play: the type's guide in the right-hand pane, open or closed as the player last left it
  const [rulesOpen, setRulesOpen] = useState(false);
  // back: to wherever the player came from on this site, or else this creator's page
  const navigate = useNavigate(), location = useLocation();
  const cameFromSite = location.key !== "default";
  const home = draft ? draft.paintTo : `/${collection.slug}`;
  const [big, setBig] = useState(false);   // the drawing, enlarged
  const titleBox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (draft?.needsTitle) titleBox.current?.focus(); }, [draft?.needsTitle]);
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
        <Link className="back-btn" to={home} aria-label={draft ? "Back to paint" : "Back"} title={draft ? "Back to paint" : "Back"}
          onClick={(e) => { if (cameFromSite && !draft) { e.preventDefault(); navigate(-1); } }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
      )}
    <main className="wrap game-page">
      <header className="game-head">
        {draft ? (
          <h1 className="game-title-edit">
            <input ref={titleBox} aria-label="Title" value={draft.title} maxLength={120} placeholder="Give it a title"
              size={Math.max(8, Math.min(40, draft.title.length + 1))} onChange={(e) => draft.onTitle(e.target.value)}
              aria-invalid={draft.needsTitle || undefined} aria-describedby={draft.needsTitle ? "title-needed" : undefined} />
          </h1>
        ) : <h1>{game.title}</h1>}
        <span className="muted">
          {summary} · by{" "}
          {author.deleted ? author.name : <Link to={`/${author.handle}`} onClick={stay}>@{author.handle}</Link>}
          {author.ai && <> <AiBadge /></>}
          {!collection.personal && <> in <Link to={`/${collection.slug}`} onClick={stay}>{collection.title}</Link></>}
          {" · "}{draft ? "not published yet" : <time dateTime={new Date(game.when).toISOString()}>{date(game.when)}</time>}
          {solved.count > 0 && <> · {solved.count} solve{solved.count === 1 ? "" : "s"}</>}
        </span>
        {solved.solved && <span className="solved-mark" title="You've solved this">✓ Solved</span>}
        {(game.state === "published" || preview) && !draft && <LikeButton gameId={game.id} count={likes.count} liked={likes.liked} signedIn={signedIn || preview} disabled={preview} />}
        <button className="btn rules-toggle" type="button" aria-pressed={rulesOpen} onClick={() => toggleRules(!rulesOpen)}>How to play</button>
        {draft ? <Link className="btn" to={draft.paintTo}>Back to paint</Link>
          : editable && !preview && <Link className="btn" to={editTo ?? `/g/${game.id}/edit`}>Edit</Link>}
        {!preview && game.state === "draft" && <span className="state draft">{draft ? "Draft: only you can see this" : "Draft: only you and the collection's owners can see this."}</span>}
        {draft?.needsTitle && <p id="title-needed" className="error game-title-needed" role="alert">Give it a title</p>}
        {!preview && game.state === "hidden" && <span className="state hidden">Taken down{game.hiddenNote ? `: ${game.hiddenNote}` : "."}</span>}
      </header>

      {draft?.bar}

      <div className={drawnBy || draft ? "game-body with-aside" : "game-body"}>
        {/* a draft's test-play saves nothing and records no solve */}
        {play ? <GameBoard play={play} saveId={preview || draft ? undefined : `g-${game.id}`} onSolved={draft ? undefined : onSolved} />
          : <div className="problems"><p>This game's sketch has problems:</p><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
        {(drawnBy || draft) ? (
          <aside className="game-aside">
            {drawnBy && (
              <figure className="drawn-by">
                <button type="button" className="drawn-by-pic grid-game" aria-label="The drawing, larger" onClick={() => setBig(true)} dangerouslySetInnerHTML={{ __html: drawnBy }} />
                <figcaption>Drawn by {author.deleted ? author.name : <Link to={`/${author.handle}`} onClick={stay}>@{author.handle}</Link>}</figcaption>
              </figure>
            )}
            {draft ? <textarea className="game-desc-edit" aria-label="Description" placeholder="Add a description…" rows={2} maxLength={2000}
              value={draft.description} onChange={(e) => draft.onDescription(e.target.value)} />
              : game.description && <p className="game-desc">{game.description}</p>}
          </aside>
        ) : game.description && <p className="game-desc">{game.description}</p>}
      </div>
      {big && drawnBy && (
        <div className="drawn-by-big" role="dialog" aria-label={`Drawn by @${author.handle}`} onClick={() => setBig(false)}>
          <div className="grid-game" dangerouslySetInnerHTML={{ __html: drawnBy }} />
          <button type="button" className="pane-close" aria-label="Close">×</button>
        </div>
      )}
    </main>
    <GuidePane key={game.kind} start={game.kind} side open={rulesOpen} onClose={() => toggleRules(false)} extra={extra} />
    </div>
  );
}
