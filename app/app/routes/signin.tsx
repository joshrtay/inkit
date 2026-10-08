import { useState } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/signin";
import { cloudflareContext } from "~/lib/context";
import { currentCreator } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { GoogleButton } from "~/components/GoogleButton";

export const meta: Route.MetaFunction = () => [{ title: "Sign in · inkit" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  if (await currentCreator(env, request)) throw redirect("/");
  return { google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) };
}

export default function SignIn({ loaderData: { google } }: Route.ComponentProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError("");
    const { error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
    setBusy(false);
    if (error) return setError(error.status === 401 ? "That email and password don't match." : error.message ?? "Couldn't sign in.");
    location.href = new URLSearchParams(location.search).get("next") || "/";
  }

  return (
    <main className="wrap narrow">
      <h1>Sign in</h1>
      {google && <><GoogleButton /><p className="or">or</p></>}
      <form className="form" onSubmit={submit}>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="muted"><Link to="/forgot-password">Forgot your password?</Link></p>
      <p className="muted">New here? <Link to="/signup">Start creating</Link></p>
    </main>
  );
}
