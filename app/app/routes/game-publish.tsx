// Play and publish a draft drawn in paint: inkit.games/g/<id>/publish (docs/creation-flow.md, "v3
// layout", option A). Still paint's chrome: the same top bar (Type, the save state), then Back to paint
// and Publish. On the dark page above the board, the title and description edited in place (saved
// as they change) and a line of what it is; on the paper, only the real player, to try it as
// players will (a host that saves nothing and records no solve). No verdict badge: paint already
// showed it, and the solver here (clingo in this browser) wakes Publish when it passes. No
// collection picker: it goes where the draft is (the creator's profile, or a ?in= studio).
// The server converts the saved drawing again and publishes only the sketch the browser's solver
// passed (games.server.ts's publishDrawing).
// Only a draft: a published puzzle can't be changed (docs/creation-flow.md, decision 8), so it goes
// to its page.
import { useEffect, useRef, useState } from "react";
import { data, Link, redirect, useFetcher } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-publish";
import { cloudflareContext } from "~/lib/context";
import { schema } from "~/db";
import { editAccess as load } from "~/lib/edit-access.server";
import { publishDrawing, saveDetails } from "~/lib/games.server";
import { attempt } from "~/lib/http.server";
import { readPaintSave, sketchOf } from "~/games/paint-save";
import { parseSketch } from "~/games/sketch";
import { layoutOf } from "~/games/layout-of";
import { doubtsOf } from "~/games/doubts";
import { draftName, kindName } from "~/games/kinds";
import { GameBoard } from "~/components/GameBoard";
import { passed, useLiveCheck } from "~/components/useOneSolutionCheck";

export const handle = { bare: true };

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Publish ${loaderData ? draftName(loaderData.game.title, loaderData.game.kind, loaderData.play?.spec.size) : "a puzzle"} · inkit` }, { name: "robots", content: "noindex" }];

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  if (game.state !== "draft") throw redirect(`/g/${game.id}`);
  if (!may.edit) throw data(null, { status: 404 });
  // a draft that isn't a puzzle yet (no type, no grid) is finished in paint first
  const save = readPaintSave(game.drawing);
  const made = save && sketchOf(save);
  if (!save || !made?.sketch) throw redirect(`/g/${game.id}/draw`);
  const author = await db.query.creators.findFirst({ where: eq(schema.creators.id, game.authorId) });
  const parsed = parseSketch(made.sketch);
  const misfits = made.conversion?.problems.filter((p) => p.kind === "off-type" || p.kind === "off-grid").length ?? 0;
  return {
    game: { id: game.id, title: game.title === "Untitled" ? "" : game.title, description: game.description, kind: made.kind },
    author: { handle: author?.handle ?? "" },
    sketch: made.sketch,
    play: parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null,
    summary: parsed.ok ? parsed.summary : kindName(made.kind),
    errors: parsed.ok ? [] : parsed.errors,
    // they warn beside Publish; they don't block it
    warnings: { doubts: doubtsOf(game.parseNotes).filter((d) => !d.done).length, misfits },
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, me, game } = await load(request, context.get(cloudflareContext).env, params.id);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  return attempt(async () => {
    if (intent === "details") { await saveDetails(db, me, game, form); return { ok: true, error: undefined }; }
    if (intent !== "publish") throw new Response(null, { status: 400 });
    await publishDrawing(db, me, game, form);
    return redirect(`/g/${game.id}`);
  });
}

const SAVE_AFTER = 800;

export default function PublishGame({ loaderData: d }: Route.ComponentProps) {
  const { game, play } = d;
  const [title, setTitle] = useState(game.title);
  const [description, setDescription] = useState(game.description);
  const [tried, setTried] = useState(false);   // Publish pressed with no title
  const details = useFetcher<{ ok?: boolean; error?: string }>();
  const publisher = useFetcher<{ error?: string }>();
  const titleBox = useRef<HTMLInputElement>(null);
  const paintTo = `/g/${game.id}/draw`;

  // the title and description save themselves, a moment after the last change
  const last = useRef(game.title + "\n" + game.description);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const now = title.trim() + "\n" + description.trim();
    if (now === last.current) { setPending(false); return; }
    setPending(true);
    const t = setTimeout(() => {
      last.current = now;
      setPending(false);
      details.submit({ intent: "details", title: title.trim() || "Untitled", description }, { method: "post" });
    }, SAVE_AFTER);
    return () => clearTimeout(t);
  }, [title, description]); // eslint-disable-line react-hooks/exhaustive-deps

  // the solver, on the very sketch the server will publish: Publish wakes when it passes
  const check = useLiveCheck(d.sketch, play?.spec ?? null, d.errors.join(" "));
  const ok = passed(check.state);
  const busy = publisher.state !== "idle";
  const publish = () => {
    if (!title.trim()) { setTried(true); titleBox.current?.focus(); return; }
    publisher.submit({ intent: "publish", title: title.trim(), description, checked: check.hash }, { method: "post" });
  };
  const failed = !ok && check.state !== "checking";
  const warn = [
    d.warnings.doubts ? `${d.warnings.doubts} of Claude's doubts not checked` : "",
    d.warnings.misfits ? `${d.warnings.misfits} thing${d.warnings.misfits === 1 ? "" : "s"} left out (they don't fit)` : "",
  ].filter(Boolean);
  const saveState = details.state !== "idle" || pending ? "Saving…" : details.data?.error ? "Couldn't save" : "Saved";

  return (
    <div className="studio sp-studio paint publish">
      <header className="studio-top">
        <div className="studio-left">
          <Link className="studio-back" to={paintTo} aria-label="Back to paint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
          {/* the type is settled by now: shown, not changed here (Back to paint to change it) */}
          <span className="paint-type locked">
            <span className="paint-type-label">Type:</span><span className="paint-type-name">{kindName(game.kind)}</span>
          </span>
          <span className={`paint-saved${saveState === "Saved" ? " ok" : saveState === "Couldn't save" ? " bad" : ""}`} aria-live="polite">{saveState}</span>
        </div>
        <div className="studio-actions">
          <Link className="btn publish-back" to={paintTo}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.7 18.5z" /><path d="M13.8 7l3.2 3.2" /></svg>
            <span>Back to paint</span></Link>
          <button type="button" className="btn primary paint-publish" disabled={!ok || busy} onClick={publish}
            title={ok ? "Publish it: everyone can play it; once published, it can't be changed" : check.state === "checking" ? "The solver is checking it" : "It needs to pass the check in paint first"}>
            {busy ? "Publishing…" : "Publish"}</button>
        </div>
      </header>
      <main className="publish-stage">
        <div className="publish-head">
          <input ref={titleBox} className="publish-title" aria-label="Title" value={title} maxLength={120} placeholder="Name your puzzle"
            onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) setTried(false); }}
            aria-invalid={tried && !title.trim() ? true : undefined} aria-describedby={tried && !title.trim() ? "title-needed" : undefined} />
          {tried && !title.trim() && <p id="title-needed" className="error publish-needed" role="alert">Give it a title</p>}
          <textarea className="publish-desc" aria-label="Description" value={description} maxLength={2000} rows={1} placeholder="Add a line about it"
            onChange={(e) => setDescription(e.target.value)} />
          <p className="publish-meta">{d.summary} · by @{d.author.handle} · not published yet</p>
          {failed && <p className="error publish-error" role="alert">Needs {play?.spec.genre === "panel" ? "a solution" : "exactly one solution"}. Back to paint to fix it.</p>}
          {warn.length > 0 && <p className="publish-warn">{warn.join(" · ")}</p>}
          {(publisher.data?.error || details.data?.error) && <p className="error" role="alert">{publisher.data?.error ?? details.data?.error}</p>}
        </div>
        <div className="publish-paper">
          {/* the real player: saves nothing, records no solve */}
          {play ? <GameBoard play={play} />
            : <div className="problems"><p>This puzzle has problems:</p><ul>{d.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
        </div>
        <p className="publish-note">Try the puzzle. It&rsquo;s playable.</p>
      </main>
    </div>
  );
}
