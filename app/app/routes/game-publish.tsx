// Play and publish a draft drawn in paint: inkit.games/g/<id>/publish (docs/creation-flow.md §1.9).
// The draft's own game page, as it will look published (GamePageView): the real player to try it
// as players will (a host that saves nothing and records no solve), the title and description
// edited in place (saved as they change), the "Drawn by" thumbnail, and a bar with the solver's
// verdict (clingo in this browser) and Publish. No collection picker: it goes where the draft is
// (the creator's profile, or the studio a ?in= link made it in).
// The server converts the saved drawing again and publishes only the sketch the browser's solver
// passed (games.server.ts's publishDrawing).
import { useEffect, useMemo, useRef, useState } from "react";
import { data, redirect, useFetcher } from "react-router";
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
import { drawingSvg } from "~/sketchpad/picture";
import { GamePageView } from "~/components/GamePageView";
import { passed, useLiveCheck } from "~/components/useOneSolutionCheck";

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Publish ${loaderData?.game.title ?? "a puzzle"} · inkit` }, { name: "robots", content: "noindex" }];

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  if (!may.edit) throw data(null, { status: 404 });
  if (game.state !== "draft") throw redirect(`/g/${game.id}`);
  // a draft that isn't a puzzle yet (no type, no grid) is finished in paint first
  const save = readPaintSave(game.drawing);
  const made = save && sketchOf(save);
  if (!save || !made?.sketch) throw redirect(`/g/${game.id}/draw`);
  const [collection, author] = await Promise.all([
    db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) }),
    db.query.creators.findFirst({ where: eq(schema.creators.id, game.authorId) }),
  ]);
  const parsed = parseSketch(made.sketch);
  const misfits = made.conversion?.problems.filter((p) => p.kind === "off-type" || p.kind === "off-grid").length ?? 0;
  return {
    game: { id: game.id, title: game.title === "Untitled" ? "" : game.title, description: game.description, kind: made.kind, state: game.state, hiddenNote: null, when: Date.now() },
    collection: { slug: collection?.slug ?? "", title: collection?.title ?? "", personal: !!collection?.personalOf },
    author: { handle: author?.handle ?? "", name: author?.name ?? "", deleted: !!author?.deletedAt, ai: !!author?.isAi },
    sketch: made.sketch,
    play: parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null,
    summary: parsed.ok ? parsed.summary : "",
    extra: parsed.ok && parsed.spec.rules?.length ? parsed.rules : [],
    errors: parsed.ok ? [] : parsed.errors,
    drawnBy: drawingSvg(save.drawing, `${game.title}, as drawn by @${author?.handle ?? ""}`) || null,
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

  // the title and description save themselves, a moment after the last change
  const last = useRef(game.title + "\n" + game.description);
  useEffect(() => {
    const now = title.trim() + "\n" + description.trim();
    if (now === last.current) return;
    const t = setTimeout(() => {
      last.current = now;
      details.submit({ intent: "details", title: title.trim() || "Untitled", description }, { method: "post" });
    }, SAVE_AFTER);
    return () => clearTimeout(t);
  }, [title, description]); // eslint-disable-line react-hooks/exhaustive-deps

  // the solver's verdict on the very sketch the server will publish
  const check = useLiveCheck(d.sketch, play?.spec ?? null, d.errors.join(" "));
  const ok = passed(check.state);
  const busy = publisher.state !== "idle";
  const publish = () => {
    if (!title.trim()) { setTried(true); return; }
    publisher.submit({ intent: "publish", title: title.trim(), description, checked: check.hash }, { method: "post" });
  };
  const words = check.state === "one" ? "Exactly one solution" : check.state === "some" ? "Solvable"
    : check.state === "checking" ? "Checking…" : check.state === "many" ? "Several solutions" : check.state === "none" ? "No solution" : "Can't be checked";
  const warn = [
    d.warnings.doubts ? `${d.warnings.doubts} of Claude's doubts not checked` : "",
    d.warnings.misfits ? `${d.warnings.misfits} thing${d.warnings.misfits === 1 ? "" : "s"} left out (they don't fit)` : "",
  ].filter(Boolean);
  const bar = useMemo(() => (
    <div className={`publish-bar ${ok ? "ok" : check.state === "checking" ? "wait" : "bad"}`} role="status" data-verdict={check.state}>
      <strong className="publish-verdict">{ok ? "✓ " : check.state === "checking" ? "" : "✕ "}{words}</strong>
      <span className="muted">{ok ? "Play it here as players will; your solve isn't counted."
        : check.state === "checking" ? "The solver is checking it." : <>It needs {play?.spec.genre === "panel" ? "at least one solution" : "exactly one solution"} to be published. Back to paint to fix it.</>}</span>
      {warn.length > 0 && <span className="publish-warn">{warn.join(" · ")}</span>}
      {(publisher.data?.error || details.data?.error) && <span className="error" role="alert">{publisher.data?.error ?? details.data?.error}</span>}
      <button type="button" className="btn primary" disabled={!ok || busy} onClick={publish}>{busy ? "Publishing…" : "Publish"}</button>
    </div>
  ), [ok, check.state, check.hash, busy, title, description, publisher.data, details.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GamePageView game={{ ...game, title: title || "Untitled" }} collection={d.collection} author={d.author} play={play}
      summary={d.summary} extra={d.extra} errors={d.errors} editable likes={{ count: 0, liked: false }} solves={{ count: 0, solved: false }} signedIn
      drawnBy={d.drawnBy}
      draft={{ title, description, onTitle: (v) => { setTitle(v); if (v.trim()) setTried(false); }, onDescription: setDescription, needsTitle: tried && !title.trim(), bar, paintTo: `/g/${game.id}/draw` }} />
  );
}
