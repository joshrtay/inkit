// Make a new game: wyattsgames.com/new (optionally ?in=<collection slug>).
// Upload a photo of a hand-drawn sketch; Claude reads it into a draft, which the creator then
// confirms (or fixes) and checks on its edit page.
import { useState } from "react";
import { Form, redirect, useNavigation, useSubmit } from "react-router";
import type { Route } from "./+types/new";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { createFromDrawing, publishTargets } from "~/lib/games.server";
import { attempt, signInFirst } from "~/lib/http.server";

export const meta: Route.MetaFunction = () => [{ title: "New game · Wyatt's Games" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const targets = await publishTargets(getDb(env), me.id);
  const want = new URL(request.url).searchParams.get("in");
  return { targets, collection: targets.find((t) => t.slug === want)?.id ?? targets[0]?.id };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const form = await request.formData();
  return attempt(async () => redirect(`/g/${await createFromDrawing(getDb(env), env, me, form)}/edit`));
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

export default function NewGame({ loaderData: { targets, collection }, actionData }: Route.ComponentProps) {
  const submit = useSubmit();
  const busy = useNavigation().state !== "idle";
  const [preview, setPreview] = useState<string>();
  const [photo, setPhoto] = useState<Blob>();
  const error = actionData && "error" in actionData ? actionData.error : undefined;

  return (
    <main className="wrap narrow">
      <h1>New game</h1>
      <p className="muted">Take a photo of your hand-drawn puzzle. Claude reads it, then you check it matches your drawing and that it has exactly one solution.</p>
      <Form method="post" encType="multipart/form-data" className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!photo) return;
          const data = new FormData(e.currentTarget);
          data.set("image", photo, "sketch.jpg");
          submit(data, { method: "post", encType: "multipart/form-data" });
        }}>
        <label>Collection
          <select name="collection" defaultValue={collection}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.personal ? `${t.title} (yours)` : t.title}</option>)}
          </select>
        </label>
        <label>Title <span className="hint">optional; a title written on the sketch is used otherwise</span>
          <input name="title" maxLength={120} />
        </label>
        <label className="drop">
          {preview ? <img src={preview} alt="Your sketch" /> : <span>Choose or take a photo of the sketch</span>}
          <input type="file" accept="image/*" required
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const small = await shrink(file);
              setPhoto(small);
              setPreview(URL.createObjectURL(small));
            }} />
        </label>
        <p className="hint">Tip: write the game type at the top of the sketch (river, slitherlink, nurikabe, nonogram, sudoku, or panes with its rules).</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy || !photo}>
          {busy ? "Reading your sketch… (up to a minute)" : "Read my sketch"}
        </button>
      </Form>
    </main>
  );
}
