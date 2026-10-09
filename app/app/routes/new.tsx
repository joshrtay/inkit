// Make a new game: inkit.games/new (docs/creation-flow.md §1.2). It goes in the creator's profile
// (or, from a studio's link, ?in=<collection slug>, that studio).
// Two ways in, both ending in paint (/g/<id>/draw), where the type is chosen: a photo of a puzzle
// drawn on paper (Claude reads it, and it's drawn in ink with the type it was read as), or a blank
// page. Under them, the creator's latest drafts to carry on with. No type selector here.
import { useRef, useState } from "react";
import { Form, Link, redirect, useNavigation, useSubmit } from "react-router";
import type { Route } from "./+types/new";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { createBlank, createFromDrawing, publishTargets } from "~/lib/games.server";
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
  const want = new URL(request.url).searchParams.get("in");
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
      <p className="lede muted">Either way you finish it in paint. Check it there whenever you like: it needs exactly one solution (panels: at least one) before it can be published.</p>
      <div className="new-ways-cards">
        <section className="new-way">
          <div className="new-way-art photo" aria-hidden="true">
            {preview ? <img src={preview} alt="" /> : <span className="new-snap"><span /></span>}
          </div>
          <div className="new-way-body">
            <h2><Icon d={["M4 8h3l2-3h6l2 3h3v11H4z", "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"]} />Start from a sketch</h2>
            <p>Take or choose a photo of a puzzle you drew on paper. Claude reads it and redraws it here in ink, and marks anything it wasn&rsquo;t sure of.</p>
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
            <p>An empty page with the grid, pen, stamps and text. Choose the puzzle type in paint when you know it; from then on paint shows only what that type needs.</p>
            <Form method="post">
              <input type="hidden" name="collection" value={collection ?? ""} />
              <button className="btn" name="intent" value="blank" disabled={busy || !collection}>Open an empty page</button>
            </Form>
          </div>
        </section>
      </div>
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
