import { authClient } from "~/lib/auth-client";

/** "Continue with Google" (shown only when the site has Google keys). */
export function GoogleButton() {
  return (
    <button className="btn google" type="button"
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}>
      Continue with Google
    </button>
  );
}
