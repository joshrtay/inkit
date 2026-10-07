// Make a creator account: display name, handle (their web address), email and password.
import { useState } from "react";
import { Link, redirect, useNavigate } from "react-router";
import type { Route } from "./+types/signup";
import { cloudflareContext } from "~/lib/context";
import { currentCreator } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { GoogleButton } from "~/components/GoogleButton";

export const meta: Route.MetaFunction = () => [{ title: "Start creating · inkit" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  if (await currentCreator(env, request)) throw redirect("/");
  return { google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) };
}

export default function SignUp({ loaderData: { google } }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError("");
    const { data, error } = await authClient.signUp.email({
      name: String(f.get("name")), email: String(f.get("email")), password: String(f.get("password")),
      handle: String(f.get("handle")).toLowerCase(),
    });
    setBusy(false);
    if (error) return setError(error.message ?? "Couldn't make the account.");
    navigate(`/${(data.user as { handle?: string }).handle ?? ""}`, { replace: true });
    location.reload();   // pick up the new session in the top bar
  }

  return (
    <main className="wrap narrow">
      <h1>Start creating</h1>
      <p className="muted">Make games, and publish them in your own collection or a shared studio.</p>
      {google && <><GoogleButton /><p className="or">or</p></>}
      <form className="form" onSubmit={submit}>
        <label>Display name<input name="name" required maxLength={60} autoComplete="name" /></label>
        <label>Handle
          <input name="handle" required pattern="[a-z][a-z0-9\-]{2,29}" maxLength={30} autoCapitalize="none" spellCheck={false}
            value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} />
          <span className="hint">Your web address: wyattsgames.com/{handle || "your-handle"}</span>
        </label>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required minLength={8} autoComplete="new-password" />
          <span className="hint">At least 8 characters.</span></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Making your account…" : "Make my account"}</button>
        <p className="legal-note">By making an account you agree to the <Link to="/terms">terms</Link> and <Link to="/privacy">privacy policy</Link>.</p>
      </form>
      <p className="muted">Already have an account? <Link to="/signin">Sign in</Link></p>
    </main>
  );
}
