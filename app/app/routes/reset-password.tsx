// Where a reset link lands (/reset-password?token=...): choose a new password.
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/reset-password";
import { authClient } from "~/lib/auth-client";

export const meta: Route.MetaFunction = () => [{ title: "Choose a new password · inkit.games" }];

export function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams;
  return { token: q.get("token") ?? "", invalid: !!q.get("error") };
}

export default function ResetPassword({ loaderData: { token, invalid } }: Route.ComponentProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), password = String(f.get("password"));
    if (password !== String(f.get("again"))) return setError("The two passwords don't match.");
    setBusy(true); setError("");
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) return setError(error.status === 400 && /token/i.test(error.message ?? "") ? "This link has expired or was already used. Ask for a new one." : error.message ?? "Couldn't change the password.");
    setDone(true);
  }

  if (invalid || !token) return (
    <main className="wrap narrow">
      <h1>That link doesn&rsquo;t work</h1>
      <p>Reset links work once, for one hour.</p>
      <p><Link className="btn primary" to="/forgot-password">Send a new link</Link></p>
    </main>
  );
  return (
    <main className="wrap narrow">
      <h1>Choose a new password</h1>
      {done ? (
        <>
          <p className="good">Your password is changed. Any other devices you were signed in on are signed out.</p>
          <p><Link className="btn primary" to="/signin">Sign in</Link></p>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <label>New password<input name="password" type="password" required minLength={8} autoComplete="new-password" />
            <span className="hint">At least 8 characters.</span></label>
          <label>Again<input name="again" type="password" required minLength={8} autoComplete="new-password" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save the new password"}</button>
        </form>
      )}
    </main>
  );
}
