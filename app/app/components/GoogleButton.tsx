import { authClient } from "~/lib/auth-client";

/** "Continue with Google" (shown only when the site has Google keys); back to `next` after. */
export function GoogleButton({ next = "/" }: { next?: string }) {
  return (
    <button className="btn google" type="button"
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}>
      Continue with Google
    </button>
  );
}
