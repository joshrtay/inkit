// Draw a new game here instead of on paper: inkit.games/new/draw (optionally ?in=<collection slug>).
// The sketchpad (components/Sketchpad.tsx) makes a picture of the drawing, which goes to the
// reader exactly as a photo does on /new: Claude reads it into a draft, then the editor.
import { useRef, useState } from "react";
import { Link, redirect, useNavigation, useSubmit } from "react-router";
import type { Route } from "./+types/new-draw";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { createFromDrawing, publishTargets } from "~/lib/games.server";
import { attempt, signInFirst } from "~/lib/http.server";
import { Select } from "~/components/Select";
import { ReadingScreen } from "~/components/ReadingScreen";
import { Sketchpad, type SketchpadHandle } from "~/components/Sketchpad";

export const meta: Route.MetaFunction = () => [{ title: "Draw a puzzle · inkit" }];
// a page of its own, like the editor: the whole width for the paper
export const handle = { bare: true };

// as /new's: where it can go, and making the game from the picture
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const targets = await publishTargets(getDb(env), me.id);
  const want = new URL(request.url).searchParams.get("in");
  return { targets, collection: targets.find((t) => t.slug === want)?.id ?? targets[0]?.id, slug: want };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const form = await request.formData();
  return attempt(async () => redirect(`/g/${await createFromDrawing(getDb(env), env, me, form)}/edit`));
}

export default function DrawGame({ loaderData: { targets, collection, slug }, actionData }: Route.ComponentProps) {
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const reading = nav.state === "submitting" || (nav.state === "loading" && !!nav.formData);
  const pad = useRef<SketchpadHandle | null>(null);
  const [into, setInto] = useState(collection);
  const [empty, setEmpty] = useState(true);
  const [preview, setPreview] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const error = problem ?? (actionData && "error" in actionData ? actionData.error : undefined);

  /** The drawing as a PNG, or a message saying why not. */
  const picture = async () => {
    setProblem(undefined);
    try { return await pad.current!.png(); } catch (e) { setProblem((e as Error).message); return null; }
  };
  const download = async () => {
    const png = await picture();
    if (!png) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = "puzzle-drawing.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const read = async () => {
    const png = await picture();
    if (!png || !into) return;
    setPreview(URL.createObjectURL(png));
    const data = new FormData();
    data.set("collection", into);
    data.set("image", png, "sketch.png");
    submit(data, { method: "post", encType: "multipart/form-data" });
  };

  return (
    <div className="studio sp-studio">
      <header className="studio-top">
        <div className="studio-left">
          <Link className="studio-back" to={slug ? `/new?in=${encodeURIComponent(slug)}` : "/new"} aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
          <strong className="sp-title">Draw a puzzle</strong>
        </div>
        <div className="studio-actions">
          <button type="button" className="btn" disabled={empty} onClick={download} title="Save the drawing as a picture">Download</button>
          <button type="button" className="btn primary" disabled={empty || busy || !into} onClick={read}>Read my drawing</button>
        </div>
      </header>
      <Sketchpad handle={pad} onChange={(d) => setEmpty(!d.grid && !d.items.length)} />
      <div className="sp-main">
        <div className="sp-foot">
          <Select name="collection" label="Goes in" defaultValue={collection} onChange={(v) => { setInto(v); }}
            options={targets.map((t) => ({ value: t.id, label: t.title, hint: t.personal ? "your profile" : "studio" }))} />
          <p className="hint">Claude reads your drawing as it would a photo: then you check it in the editor. Writing the puzzle's type at the top helps.</p>
        </div>
        {error && <p className="sp-error" role="alert">{error}</p>}
      </div>
      {reading && <ReadingScreen image={preview} />}
    </div>
  );
}
