// A set's page: inkit.games/s/<id>. Its cover (the first four puzzles), title, who made it, what
// it's for, and its puzzles in order, each credited to whoever made it; Play opens the first one
// you haven't solved, and the puzzle carries the set (?set=) so its bar steps through it. A draft
// is seen only by its author, with Edit (the drawer: components/SetDrawer.tsx).
import { data, Link } from "react-router";
import type { Route } from "./+types/set";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { markSolved } from "~/lib/queries.server";
import { canEditSet, canViewSet, setById, setPuzzles, setSummary } from "~/lib/sets.server";
import { pageMeta, privateMeta } from "~/lib/seo";
import { inList } from "~/lib/list-context";
import { kindName } from "~/games/kinds";
import { Avatar } from "~/components/Avatar";
import { AiBadge } from "~/components/AiBadge";
import { Picture } from "~/components/GameCard";
import { Diff } from "~/components/Explore";
import { SetCover } from "~/components/SetCard";
import { openSetDrawer } from "~/components/SetDrawer";
import "~site/game-types/grid/styles.css";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const [found, viewer] = await Promise.all([setById(db, params.id), currentCreator(env, request)]);
  if (!found) throw data(null, { status: 404 });
  const { set, collection, author } = found;
  if (set.state === "deleted") throw data(null, { status: 410 });
  if (!canViewSet(set, collection, viewer)) throw data(null, { status: 404 });
  const puzzles = await markSolved(db, viewer?.id, await setPuzzles(db, set.id));
  const solved = puzzles.filter((p) => p.solved).length;
  // Play: the first one not solved yet (all solved: from the start)
  const next = puzzles.find((p) => !p.solved) ?? puzzles[0];
  return {
    set: { id: set.id, title: set.title, description: set.description, state: set.state, hiddenNote: set.hiddenNote, publishedAt: set.publishedAt?.getTime() ?? null },
    author: { handle: author.handle, name: author.name, ai: author.isAi, deleted: !!author.deletedAt },
    puzzles: puzzles.map((p) => ({ id: p.id, title: p.title, kind: p.kind, picture: p.picture, level: p.level, minutes: p.minutes, solved: !!p.solved,
      by: { handle: p.authorHandle, name: p.authorName, ai: p.authorAi } })),
    summary: setSummary(puzzles),
    progress: viewer ? { solved, total: puzzles.length } : null,
    play: next ? inList(next.id, { in: "set", set: set.id }) : null,
    canEdit: canEditSet(set, viewer),
  };
}

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [{ title: "Not found · inkit" }];
  const title = `${d.set.title}: a set of puzzles by ${d.author.name} · inkit`;
  if (d.set.state !== "published") return privateMeta(title);
  return pageMeta({ title, path: `/s/${d.set.id}`, description: d.set.description || `${d.summary.count} logic puzzles in order, picked by ${d.author.name}, to play in your browser on inkit.` });
};

const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function SetPage({ loaderData: d }: Route.ComponentProps) {
  const { set, author, puzzles, summary, progress } = d;
  const done = !!progress && progress.total > 0 && progress.solved === progress.total;
  return (
    <main className="wrap set-page">
      <header className="set-head">
        <SetCover cover={puzzles.slice(0, 4).map((p) => p.picture)} className="set-head-cover" />
        <div className="set-head-text">
          <p className="set-label">Set{set.state === "draft" && <span className="state draft">Draft</span>}{set.state === "hidden" && <span className="state hidden">Taken down{set.hiddenNote ? `: ${set.hiddenNote}` : ""}</span>}</p>
          <h1>{set.title}</h1>
          <p className="set-by">
            <Avatar name={author.name} seed={author.handle} size={22} ai={author.ai} />
            {author.deleted ? author.name : <Link to={`/${author.handle}`}>{author.name}</Link>}{author.ai && <AiBadge />}
          </p>
          {set.description && <p className="set-desc">{set.description}</p>}
          <p className="set-meta muted">
            {summary.count} puzzle{summary.count === 1 ? "" : "s"}{summary.minutes > 0 && <> · ~{summary.minutes} min</>} · <Diff level={summary.level} />
            {set.publishedAt && <> · Published {date(set.publishedAt)}</>}
          </p>
          {progress && progress.total > 0 && (
            <p className="set-progress">
              {done ? "Set done" : `${progress.solved} of ${progress.total} solved`}
              <span className="set-bar" role="img" aria-label={`${progress.solved} of ${progress.total} solved`}><i style={{ width: `${(100 * progress.solved) / progress.total}%` }} /></span>
            </p>
          )}
          <p className="set-actions">
            {d.play && <Link className="btn primary" to={d.play}>Play</Link>}
            {d.canEdit && <button type="button" className="btn" onClick={() => openSetDrawer(set.id)}>Edit</button>}
          </p>
        </div>
      </header>
      {puzzles.length ? (
        <ol className="set-list">
          {puzzles.map((p, i) => (
            <li key={p.id} className={p.solved ? "solved" : undefined}>
              <Link to={inList(p.id, { in: "set", set: set.id })}>
                <span className="set-n">{i + 1}</span>
                <Picture svg={p.picture} className="set-row-pic" />
                <span className="set-row-text">
                  <strong>{p.title}</strong>
                  <span className="muted">{kindName(p.kind)} · by {p.by.name}{p.by.ai && <> <AiBadge /></>}</span>
                </span>
                <span className="set-row-foot">
                  {p.level && <Diff level={p.level} />}
                  {p.minutes ? <span className="mins">~{p.minutes} min</span> : null}
                  {p.solved && <span className="set-check" role="img" aria-label="Solved">✓</span>}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : <p className="muted">No puzzles in it yet.</p>}
    </main>
  );
}
