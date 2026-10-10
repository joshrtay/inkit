// Signing in with an email and password, or Google when the site has its keys: the form on /signin
// and in the sign-in dialog (SignInDialog.tsx). On success it goes to `next` (a full load, so the
// whole page picks up the session).
import { useState } from "react";
import { authClient } from "~/lib/auth-client";
import { GoogleButton } from "./GoogleButton";

export function SignInForm({ google, next, autoFocus = false }: { google: boolean; next: string; autoFocus?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError("");
    const { error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
    if (error) {
      setBusy(false);
      return setError(error.status === 401 ? "That email and password don't match." : error.message ?? "Couldn't sign in.");
    }
    location.href = next;
  }

  return (
    <>
      {google && <><GoogleButton next={next} /><p className="or">or</p></>}
      <form className="form" onSubmit={submit}>
        <label>Email<input name="email" type="email" required autoComplete="email" autoFocus={autoFocus} /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </>
  );
}
