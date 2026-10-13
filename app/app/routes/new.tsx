// Make a new game: inkit.games/new (docs/creation-flow.md §1.2). It goes in the creator's profile
// (or, from a studio's link, ?in=<collection slug>, that studio).
// Two ways in, both ending in paint (/g/<id>/draw), where the type is chosen: a photo of a puzzle
// drawn on paper (Claude reads it, and it's drawn in ink with the type it was read as), or a blank
// page. Under them, a quiet row for a puzz.link or Penpa+ link (lib/import-link.ts: a type we have
// opens in paint; one we don't is noted), then the creator's latest drafts to carry on with. No
// type selector here.
import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect, useNavigation, useSubmit } from "react-router";
import type { Route } from "./+types/new";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { createBlank, createFromDrawing, createFromLink, publishTargets } from "~/lib/games.server";
import { linkNote } from "~/lib/import-link";
import { latestDrafts } from "~/lib/queries.server";
import { draftPictures } from "~/lib/thumbs.server";
import { attempt, signInFirst } from "~/lib/http.server";
import { draftName, editPath, kindName } from "~/games/kinds";
import { edited } from "~/components/GameCard";
import { ReadingScreen } from "~/components/ReadingScreen";
import "~site/game-types/grid/styles.css";

export const meta: Route.MetaFunction = () => [{ title: "New puzzle · inkit" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const db = getDb(env);
  const targets = await publishTargets(db, me.id);
  const url = new URL(request.url);
  // the studio to make it in: ?studio= (an old link's ?in= moves over: docs/url-design.md)
  if (url.searchParams.has("in")) throw redirect(`/new?studio=${encodeURIComponent(url.searchParams.get("in") ?? "")}`, 301);
  const want = url.searchParams.get("studio");
  return {
    collection: targets.find((t) => t.slug === want)?.id ?? targets[0]?.id, slug: want,
    drafts: await draftPictures(db, await latestDrafts(db, me.id)),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const db = getDb(env);
  const form = await request.formData();
  if (form.get("intent") === "link") return attempt(async () => {
    const made = await createFromLink(db, me, form);
    if ("id" in made) return redirect(`/g/${made.id}/draw`);
    const r = made.result;
    return { link: { note: linkNote(r), error: r.kind === "unreadable", choose: r.kind === "choose" ? r.genres.map((id) => ({ id, name: kindName(id) })) : null } };
  });
  return attempt(async () => form.get("intent") === "blank"
    ? redirect(`/g/${await createBlank(db, me, form)}/draw`)
    // ?read: paint opens its panel at the photo and what Claude wasn't sure of
    : redirect(`/g/${await createFromDrawing(db, env, me, form)}/draw?read=1`));
}

/** Shrink a photo in the browser (phone photos are large) to a JPEG at most 2000px across. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail()), "image/jpeg", 0.9));
  } catch {
    return file;   // a format this browser can't draw: send it as it is
  }
}

const Icon = ({ d }: { d: string[] }) => <svg viewBox="0 0 24 24" aria-hidden="true">{d.map((p) => <path key={p} d={p} />)}</svg>;

export default function NewGame({ loaderData: { collection, drafts }, actionData }: Route.ComponentProps) {
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const reading = (nav.state === "submitting" || (nav.state === "loading" && !!nav.formData)) && nav.formData?.get("intent") === "photo";
  const [preview, setPreview] = useState<string>();
  const file = useRef<HTMLInputElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  // what the last link said, until the link is changed
  const [linkEdited, setLinkEdited] = useState(false);
  useEffect(() => setLinkEdited(false), [actionData]);
  const link = actionData && "link" in actionData && !linkEdited ? actionData.link : undefined;

  const send = async (f: File) => {
    const small = await shrink(f);
    setPreview(URL.createObjectURL(small));
    const data = new FormData();
    data.set("intent", "photo");
    data.set("collection", collection ?? "");
    data.set("image", small, "sketch.jpg");
    // the browser tests' own reading (games.server.ts: development only)
    const given = (window as { __inkitGivenReading?: string }).__inkitGivenReading;
    if (given) data.set("given-reading", given);
    submit(data, { method: "post", encType: "multipart/form-data" });
  };

  return (
    <main className="wrap new-start">
      <h1>New puzzle</h1>
      <p className="lede muted">Either way, you finish it in paint.</p>
      <div className="new-ways-cards">
        <section className="new-way">
          <div className="new-way-art photo" aria-hidden="true">
            {preview ? <img src={preview} alt="" /> : <span className="new-snap"><span /></span>}
          </div>
          <div className="new-way-body">
            <h2><Icon d={["M4 8h3l2-3h6l2 3h3v11H4z", "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"]} />Start from a sketch</h2>
            <p>Take a photo of a puzzle you drew. Claude redraws it in ink.</p>
            {error && <p className="error" role="alert">{error} <span className="muted">Try another photo, or start blank and draw it.</span></p>}
            <label className={`btn primary${busy || !collection ? " disabled" : ""}`}>
              {error ? "Try another photo" : "Choose a photo"}
              <input ref={file} className="visually-hidden" type="file" accept="image/*" disabled={busy || !collection} aria-label="Choose a photo"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send(f); }} />
            </label>
          </div>
        </section>
        <section className="new-way">
          <div className="new-way-art" aria-hidden="true"><span className="new-blank">an empty page</span></div>
          <div className="new-way-body">
            <h2><Icon d={["M4 20h4L19 9l-4-4L4 16z", "m13.5 6.5 4 4"]} />Start blank</h2>
            <p>Draw it from scratch.</p>
            <Form method="post">
              <input type="hidden" name="collection" value={collection ?? ""} />
              <button className="btn" name="intent" value="blank" disabled={busy || !collection}>Open an empty page</button>
            </Form>
          </div>
        </section>
      </div>
      <section className="new-link" aria-labelledby="new-link-h">
        <Icon d={["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"]} />
        <strong id="new-link-h">Or paste a link</strong>
        <Form method="post" className="new-link-field">
          <input type="hidden" name="collection" value={collection ?? ""} />
          <input type="text" inputMode="url" name="link" required placeholder="A Penpa+ or puzz.link link" aria-label="Puzzle link" autoComplete="off" onChange={() => setLinkEdited(true)} />
          {link?.choose && (
            <select name="genre" aria-label="Puzzle type" required defaultValue="">
              <option value="" disabled>Type</option>
              {link.choose.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <button className="btn" name="intent" value="link" disabled={busy || !collection}>Open</button>
        </Form>
        {link && <p className={`new-link-note${link.error ? " error" : ""}`} role="status">{link.note}</p>}
      </section>
      {drafts.length > 0 && (
        <section className="new-drafts" aria-labelledby="new-drafts-h">
          <h2 id="new-drafts-h" className="eyebrow">Carry on with a draft</h2>
          <ul>
            {drafts.map((g) => (
              <li key={g.id}>
                <Link to={editPath(g)} className="new-draft">
                  {g.picture ? <span className="grid-game pic" dangerouslySetInnerHTML={{ __html: g.picture }} /> : <span className="pic none" />}
                  <span><strong>{draftName(g.title, g.kind, g.size)}</strong><small>{kindName(g.kind)} · edited <time suppressHydrationWarning>{edited(g.updatedAt)}</time></small></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {reading && <ReadingScreen image={preview} />}
    </main>
  );
}
