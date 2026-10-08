// Start a shared studio: inkit.games/studios/new.
import { Form, redirect, useNavigation } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/studio-new";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { createStudio } from "~/lib/collections.server";
import { attempt, signInFirst } from "~/lib/http.server";

export const meta: Route.MetaFunction = () => [{ title: "Start a studio · inkit" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  if (!(await currentCreator(context.get(cloudflareContext).env, request))) signInFirst(request);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const form = await request.formData();
  return attempt(async () => redirect(`/${await createStudio(getDb(env), me, form)}/settings`));
}

export default function NewStudio({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const [slug, setSlug] = useState("");
  return (
    <main className="wrap narrow">
      <h1>Start a studio</h1>
      <p className="muted">A shared collection: you'll be its owner, and you can add other creators as owners or contributors.</p>
      <Form method="post" className="form">
        <label>Name<input name="title" required maxLength={80} /></label>
        <label>Web address
          <input name="slug" required maxLength={30} autoCapitalize="none" spellCheck={false} value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
          <span className="hint">inkit.games/{slug || "your-studio"}</span>
        </label>
        <label>Description<textarea name="description" rows={3} maxLength={1000} /></label>
        {actionData && "error" in actionData && <p className="error" role="alert">{actionData.error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>Start the studio</button>
      </Form>
    </main>
  );
}
