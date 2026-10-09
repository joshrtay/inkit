// A game's page as players see it: back, the title and who made it, How to play, the board and
// the description, and the creator's drawing ("Drawn by", for a puzzle drawn in paint). The game
// route shows it, and the editor's Preview shows the same thing. (A draft drawn in paint is
// published from its own page in paint's chrome: routes/game-publish.tsx.)
import { useEffect, useState } from "react";
import { Form, Link, useFetcher, useLocation, useNavigate, useSubmit } from "react-router";
import type { Playable } from "~/games/layout";
import { GameBoard } from "./GameBoard";
import { GuidePane } from "./GuidePane";
import { LikeButton } from "./LikeButton";
import { AiBadge } from "./AiBadge";
import { useConfirm } from "./ConfirmDialog";

export interface GamePageProps {
  game: { id: string; title: string; description: string; kind: string; state: string; hiddenNote: string | null; when: number };
  collection: { slug: string; title: string; personal: boolean };
  author: { handle: string; name: string; deleted: boolean; ai?: boolean };
  play: Playable | null;
  summary: string;
  extra: string[];
  errors: string[];
  likes: { count: number; liked: boolean };
  /** how many players have solved it, and whether this one has (signed in) */
  solves: { count: number; solved: boolean };
  signedIn: boolean;
  /** shown in the editor's preview: nothing is saved, and links don't leave the editor */
  preview?: boolean;
  /** where a draft's Edit goes (paint; RYB, its figure editor): none for a published puzzle (it
   *  can't be changed) or for those who can't edit it */
  editTo?: string | null;
  /** its author (or an admin) can delete it: a red Delete, after the confirm dialog */
  canDelete?: boolean;
  /** the … menu: moderation (take down, restore, Featured), for owners and admins */
  manage?: { takeDown: boolean; restore: boolean; feature: boolean; featured: boolean };
  /** the … menu's last action went wrong */
  error?: string;
  /** the creator's drawing (paint's, as drawn: sketchpad/picture.ts) */
  drawnBy?: string | null;
}

// in UTC, so the server and the browser write the same date
const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const RULES_OPEN = "inkit:rules-open";

export function GamePageView({ game, collection, author, play, summary, extra, errors, likes, solves, signedIn, preview = false, drawnBy = null, editTo = null, canDelete = false, manage, error }: GamePageProps) {
  // How to play: the type's guide in the right-hand pane, open or closed as the player last left it
  const [rulesOpen, setRulesOpen] = useState(false);
  // back: to wherever the player came from on this site, or else this creator's page
  const navigate = useNavigate(), location = useLocation();
  const cameFromSite = location.key !== "default";
  const home = `/${collection.slug}`;
  const [big, setBig] = useState(false);   // the drawing, enlarged
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
          {author.ai && <> <AiBadge /></>}
          {!collection.personal && <> in <Link to={`/${collection.slug}`} onClick={stay}>{collection.title}</Link></>}
          {" · "}<time dateTime={new Date(game.when).toISOString()}>{date(game.when)}</time>
          {solved.count > 0 && <> · {solved.count} solve{solved.count === 1 ? "" : "s"}</>}
        </span>
        {solved.solved && <span className="solved-mark" title="You've solved this">✓ Solved</span>}
        {(game.state === "published" || preview) && <LikeButton gameId={game.id} count={likes.count} liked={likes.liked} signedIn={signedIn || preview} disabled={preview} />}
        <button className="btn rules-toggle" type="button" aria-pressed={rulesOpen} onClick={() => toggleRules(!rulesOpen)}>How to play</button>
        {editTo && !preview && <Link className="btn" to={editTo}>Edit</Link>}
        {canDelete && !preview && <DeleteButton title={game.title} published={game.state === "published"} solves={solved.count} likes={likes.count} />}
        {manage && !preview && <ManageMenu manage={manage} />}
        {!preview && game.state === "draft" && <span className="state draft">Draft: only you and the collection's owners can see this.</span>}
        {!preview && game.state === "hidden" && <span className="state hidden">Taken down{game.hiddenNote ? `: ${game.hiddenNote}` : "."}</span>}
        {error && <p className="error" role="alert">{error}</p>}
      </header>

      <div className={drawnBy ? "game-body with-aside" : "game-body"}>
        {play ? <GameBoard play={play} saveId={preview ? undefined : `g-${game.id}`} onSolved={onSolved} />
          : <div className="problems"><p>This game's sketch has problems:</p><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
        {drawnBy ? (
          <aside className="game-aside">
            <figure className="drawn-by">
              <button type="button" className="drawn-by-pic grid-game" aria-label="The drawing, larger" onClick={() => setBig(true)} dangerouslySetInnerHTML={{ __html: drawnBy }} />
              <figcaption>Drawn by {author.deleted ? author.name : <Link to={`/${author.handle}`} onClick={stay}>@{author.handle}</Link>}</figcaption>
            </figure>
            {game.description && <p className="game-desc">{game.description}</p>}
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

/** Delete: its author's one action on a published puzzle (it can't be changed). The confirm dialog
 *  first; then the server deletes it for good and goes back to the profile. */
function DeleteButton({ title, published, solves, likes }: { title: string; published: boolean; solves: number; likes: number }) {
  const { confirm } = useConfirm();
  const submit = useSubmit();
  const kept = [solves ? `${solves} solve${solves === 1 ? "" : "s"}` : "", likes ? `${likes} like${likes === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
  const onClick = async () => {
    const yes = await confirm({
      title: `Delete “${title}”?`,
      body: <p>{published ? "It comes off your profile and every feed, and its link stops working" : "The draft is gone"}{kept ? `, with its ${kept}` : ""}. This can&rsquo;t be undone.</p>,
      action: "Delete", danger: true,
    });
    if (yes) submit({ intent: "delete" }, { method: "post" });
  };
  return <button type="button" className="btn danger game-delete" onClick={() => void onClick()}>Delete</button>;
}

/** The game's … menu, moderation only: take down (a collection's owners and admins, with a note its
 *  author sees, asked for in the confirm dialog), restore, and the Featured shelf (admins). Shown
 *  only with something in it. */
function ManageMenu({ manage }: { manage: NonNullable<GamePageProps["manage"]> }) {
  const [open, setOpen] = useState(false);
  const { ask } = useConfirm();
  const submit = useSubmit();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!(e.target as Element).closest(".game-more, .confirm")) setOpen(false); };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [open]);
  if (!manage.takeDown && !manage.restore && !manage.feature) return null;
  const takeDown = async () => {
    const note = await ask({
      title: "Take this puzzle down?",
      body: <p>It goes offline for everyone but its author and the collection&rsquo;s owners. An admin can restore it.</p>,
      field: { label: "Why? Its author sees this note.", required: true, maxLength: 500 },
      action: "Take down", danger: true,
    });
    if (!note) return;   // cancelled: the menu stays open, its item focused again
    setOpen(false);
    submit({ intent: "hide", note }, { method: "post" });
  };
  return (
    <div className="game-more">
      <button type="button" className="btn icon" aria-label="More for this puzzle" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div className="menu" role="menu">
          {manage.takeDown && <button type="button" role="menuitem" onClick={() => void takeDown()}>Take down…</button>}
          {manage.restore && <Form method="post"><button role="menuitem" name="intent" value="unhide">Restore</button></Form>}
          {manage.feature && <Form method="post"><button role="menuitem" name="intent" value={manage.featured ? "unfeature" : "feature"}>{manage.featured ? "Remove from Featured" : "Add to Featured"}</button></Form>}
        </div>
      )}
    </div>
  );
}
