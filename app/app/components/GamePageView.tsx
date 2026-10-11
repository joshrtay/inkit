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
import type { ListBar } from "~/lib/list-play.server";
import { GUIDE_EVENT, useSetDrawer } from "./SetDrawer";

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
  /** the … menu: moderation (take down, restore), for owners and admins */
  manage?: { takeDown: boolean; restore: boolean };
  /** the … menu's last action went wrong */
  error?: string;
  /** the creator's drawing (paint's, as drawn: sketchpad/picture.ts) */
  drawnBy?: string | null;
  /** the player hasn't solved a puzzle of this type yet (signed out: always): the paper's note */
  newToType?: boolean;
  /** opened from a list: the bar under the board (lib/list-play.server.ts) */
  list?: ListBar | null;
}

// in UTC, so the server and the browser write the same date
const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const RULES_OPEN = "inkit:rules-open";

export function GamePageView({ game, collection, author, play, summary, extra, errors, likes, solves, signedIn, preview = false, drawnBy = null, editTo = null, canDelete = false, manage, error, newToType = false, list = null }: GamePageProps) {
  // How to play: the type's guide in the right-hand pane, open or closed as the player last left it
  const [rulesOpen, setRulesOpen] = useState(false);
  // back: to wherever the player came from on this site, or else this creator's page
  const navigate = useNavigate(), location = useLocation();
  const cameFromSite = location.key !== "default";
  const home = `/${collection.slug}`;
  const [big, setBig] = useState(false);   // the drawing, enlarged
  // (not while a set is open in the drawer: the drawer has the right-hand side then)
  useEffect(() => { try { setRulesOpen(localStorage.getItem(RULES_OPEN) === "1" && !sessionStorage.getItem("inkit:set-drawer")); } catch { /* closed */ } }, []);
  const drawer = useSetDrawer();
  const setCurrent = drawer?.setCurrent;
  // the set drawer offers this puzzle while it's open (a published one, not the editor's preview)
  useEffect(() => {
    if (!setCurrent || preview || game.state !== "published") return;
    setCurrent({ id: game.id, title: game.title });
    return () => setCurrent(null);
  }, [setCurrent, preview, game.id, game.title, game.state]);
  // How to play and the set drawer share the right-hand side: one gives way to the other
  useEffect(() => { dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: rulesOpen })); }, [rulesOpen]);
  useEffect(() => {
    const close = () => { setRulesOpen(false); try { localStorage.setItem(RULES_OPEN, "0"); } catch { /* this page only */ } };
    addEventListener(GUIDE_EVENT + ":close", close);
    return () => { removeEventListener(GUIDE_EVENT + ":close", close); dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: false })); };
  }, []);
  const toggleRules = (v: boolean) => { setRulesOpen(v); if (!preview) try { localStorage.setItem(RULES_OPEN, v ? "1" : "0"); } catch { /* this page only */ } };
  const stay = (e: React.MouseEvent) => { if (preview) e.preventDefault(); };
  const [typeName, ...rest] = summary.split(" · ");
  // the first time someone meets a type: a note under the paper's ?, until they open the rules or
  // dismiss it (signed in: also until they've solved one of the type; signed out: every visit)
  const tipKey = `inkit:rules-seen:${game.kind}`;
  const [tipShown, setTipShown] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = signedIn && localStorage.getItem(tipKey) === "1"; } catch { /* shown */ }
    setTipShown(!preview && newToType && !seen);
  }, [tipKey, newToType, signedIn, preview]);
  const seenRules = () => { setTipShown(false); if (signedIn) try { localStorage.setItem(tipKey, "1"); } catch { /* this page only */ } };
  const openRules = (v: boolean) => { toggleRules(v); if (v) seenRules(); };
  const tip = tipShown ? { text: `New to ${typeName}?`, onDismiss: seenRules } : null;

  // a signed-in player's solve is kept (routes/game-solve.ts): it marks the puzzle solved for them
  // everywhere, and counts toward the puzzle's solves
  const solve = useFetcher<{ count: number; solved: boolean }>();
  const solved = solve.data ?? solves;
  const keep = signedIn && !preview && game.state === "published" && !solves.solved;
  // just solved: the list bar's Next stands out
  const [won, setWon] = useState(false);
  useEffect(() => setWon(false), [game.id]);
  const onSolved = (ms: number | null) => {
    setWon(true);
    if (keep && solve.state === "idle" && !solve.data) solve.submit(ms ? { ms: String(ms) } : null, { method: "post", action: `/g/${game.id}/solve` });
  };

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
        <div className="game-title-row">
          <h1>{game.title}</h1>
          <div className="game-actions">
            {solved.solved && <span className="solved-mark" title="You've solved this">✓ Solved</span>}
            {(game.state === "published" || preview) && <LikeButton gameId={game.id} count={likes.count} liked={likes.liked} signedIn={signedIn || preview} disabled={preview} />}
            {editTo && !preview && <Link className="btn" to={editTo}>Edit</Link>}
            {!preview && <MoreMenu game={game} manage={manage} canDelete={canDelete} solves={solved.count} likes={likes.count} signedIn={signedIn} />}
          </div>
        </div>
        <p className="game-meta muted">
          {/* the type's name opens How to play */}
          <button type="button" className="type-link" aria-pressed={rulesOpen} title="How to play" onClick={() => openRules(!rulesOpen)}>{typeName}</button>
          {rest.map((r) => <span key={r}> · {r}</span>)} · by{" "}
          {author.deleted ? author.name : <Link to={`/${author.handle}`} onClick={stay}>@{author.handle}</Link>}
          {author.ai && <> <AiBadge /></>}
          {!collection.personal && <> in <Link to={`/${collection.slug}`} onClick={stay}>{collection.title}</Link></>}
          {" · "}<time dateTime={new Date(game.when).toISOString()}>{date(game.when)}</time>
          {solved.count > 0 && <> · {solved.count} solve{solved.count === 1 ? "" : "s"}</>}
        </p>
        {!preview && game.state === "draft" && <span className="state draft">Draft: only you and the collection's owners can see this.</span>}
        {!preview && game.state === "hidden" && <span className="state hidden">Taken down{game.hiddenNote ? `: ${game.hiddenNote}` : "."}</span>}
        {error && <p className="error" role="alert">{error}</p>}
      </header>

      <div className={drawnBy ? "game-body with-aside" : "game-body"}>
        <div className="game-play">
          {play ? <GameBoard play={play} saveId={preview ? undefined : `g-${game.id}`} onSolved={onSolved} description={game.description}
              onRules={() => openRules(true)} tip={tip} />
            : <div className="problems"><p>This game's sketch has problems:</p><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          {list && !preview && <ListBarView bar={list} won={won} />}
        </div>
        {drawnBy ? (
          <aside className="game-aside">
            <figure className="drawn-by">
              <button type="button" className="drawn-by-pic grid-game" aria-label="The drawing, larger" onClick={() => setBig(true)} dangerouslySetInnerHTML={{ __html: drawnBy }} />
              <figcaption>Drawn by {author.deleted ? author.name : <Link to={`/${author.handle}`} onClick={stay}>@{author.handle}</Link>}</figcaption>
            </figure>
          </aside>
        ) : null}
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

/** The game's ⋯ menu: Copy link for everyone; Delete for its author (a published puzzle can't be
 *  changed, only deleted: the confirm dialog first, then the server deletes it for good and goes
 *  back to the profile); take down (a collection's owners and admins, with a note its author sees)
 *  and restore. */
function MoreMenu({ game, manage, canDelete, solves, likes, signedIn }: {
  game: GamePageProps["game"]; manage?: GamePageProps["manage"]; canDelete: boolean; solves: number; likes: number; signedIn: boolean;
}) {
  const drawer = useSetDrawer();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { ask, confirm } = useConfirm();
  const submit = useSubmit();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!(e.target as Element).closest(".game-more, .confirm")) setOpen(false); };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [open]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/g/${game.id}`); setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 900); }
    catch { setOpen(false); }
  };
  const del = async () => {
    const kept = [solves ? `${solves} solve${solves === 1 ? "" : "s"}` : "", likes ? `${likes} like${likes === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
    const yes = await confirm({
      title: `Delete “${game.title}”?`,
      body: <p>{game.state === "published" ? "It comes off your profile and every feed, and its link stops working" : "The draft is gone"}{kept ? `, with its ${kept}` : ""}. This can&rsquo;t be undone.</p>,
      action: "Delete", danger: true,
    });
    if (!yes) return;   // cancelled: the menu stays open, its item focused again
    setOpen(false);
    submit({ intent: "delete" }, { method: "post" });
  };
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
  if (game.state !== "published" && !manage?.takeDown && !manage?.restore && !canDelete) return null;
  return (
    <div className="game-more">
      <button type="button" className="btn icon" aria-label="More for this puzzle" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div className="menu" role="menu">
          {/* phones: the set in progress in this tab, to open it */}
          {drawer?.set && drawer.shown && (
            <button type="button" role="menuitem" className="phone-only set-in-progress" onClick={() => { setOpen(false); drawer.openSheet(); }}>
              {drawer.set.set.title} · {drawer.set.summary.count}
            </button>
          )}
          {game.state === "published" && signedIn && drawer && <button type="button" role="menuitem" onClick={() => { setOpen(false); drawer.pick(game.id); }}>Add to set</button>}
          {game.state === "published" && <button type="button" role="menuitem" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>}
          {manage?.takeDown && <button type="button" role="menuitem" onClick={() => void takeDown()}>Take down…</button>}
          {manage?.restore && <Form method="post"><button role="menuitem" name="intent" value="unhide">Restore</button></Form>}
          {canDelete && <button type="button" role="menuitem" className="danger" onClick={() => void del()}>Delete…</button>}
        </div>
      )}
    </div>
  );
}

const Chevron = ({ back = false }: { back?: boolean }) => (
  <svg className="chev" viewBox="0 0 24 24" aria-hidden="true"><path d={back ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} /></svg>
);

const LIST_ICONS = {
  set: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5",
  type: "M4 4h16v16H4zM4 10h16M10 4v16",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  feed: "M4 13l3-8h10l3 8v6H4zM4 13h5a3 3 0 0 0 6 0h5",
  shelf: "M4 6h16M4 12h16M4 18h10",
};

/** The bar under the board for a puzzle opened from a list: back and on through it, and what the
 *  list is (a link back to it). Next stands out once it's solved. */
function ListBarView({ bar, won }: { bar: ListBar; won: boolean }) {
  const p = bar.progress;
  // a set's last puzzle, just solved: back to the set instead of on
  const last = !!p && !bar.next && won;
  return (
    <nav className={`list-bar${p ? " in-set" : ""}`} aria-label="This list">
      {bar.prev ? <Link className="btn list-step prev" to={bar.prev} rel="prev" aria-label="Previous puzzle"><Chevron back /><span className="step-word">Prev</span></Link>
        : <span className="list-step prev" aria-hidden="true" />}
      <Link className="list-ctx" to={bar.page}>
        <span className="list-name">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={LIST_ICONS[bar.icon]} /></svg>
          <span>{bar.text}{bar.by && <span className="list-by"> · by @{bar.by}</span>}</span>
        </span>
        {p && (
          <span className="list-progress">
            <span className="set-bar" role="img" aria-label={p.solved === null ? `${p.at + 1} of ${p.total}` : `${p.solved} of ${p.total} solved`}>
              {p.solved !== null && <i style={{ width: `${(100 * p.solved) / p.total}%` }} />}
              <b style={{ left: `${(100 * (p.at + 0.5)) / p.total}%` }} />
            </span>
            <span className="list-count">{p.solved === null ? `${p.at + 1} of ${p.total}` : `${p.solved} of ${p.total} solved`}</span>
          </span>
        )}
      </Link>
      {bar.next ? <Link className={`btn list-step next${won ? " primary" : ""}`} to={bar.next} rel="next" aria-label="Next puzzle"><span className="step-word">Next</span><Chevron /></Link>
        : last ? <Link className="btn list-step next primary back-to-set" to={bar.page}>Back to the set</Link>
        : <span className="list-step next" aria-hidden="true" />}
    </nav>
  );
}
