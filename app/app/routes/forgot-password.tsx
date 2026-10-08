// "Forgot your password?": ask for a reset link by email. The answer is the same whether or not
// the email has an account, so the page can't be used to find out who's signed up.
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/forgot-password";
import { authClient } from "~/lib/auth-client";

export const meta: Route.MetaFunction = () => [{ title: "Reset your password · inkit.games" }, { name: "robots", content: "noindex" }];

export default function ForgotPassword() {
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setBusy(true); setError("");
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setBusy(false);
    if (error && error.status === 429) return setError("Too many tries. Wait a minute and try again.");
    setSentTo(email);
  }

  return (
    <main className="wrap narrow">
      <h1>Reset your password</h1>
      {sentTo ? (
        <>
          <p>If <strong>{sentTo}</strong> has an account, we&rsquo;ve sent it a link to choose a new password. It works for one hour.</p>
          <p className="muted">Nothing there? Check your spam folder, or <button className="link" type="button" onClick={() => setSentTo("")}>try another email</button>.</p>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <p className="muted">Enter your account&rsquo;s email and we&rsquo;ll send you a link to choose a new password.</p>
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send the link"}</button>
        </form>
      )}
      <p className="muted"><Link to="/signin">Back to sign in</Link></p>
    </main>
  );
}
