// Where to go after signing in or making an account (`?next=` on /signin and /signup, and the
// sign-in dialog's entry points). Pure, unit-tested in tests/unit/next.test.ts.

/** A `next` that stays on this site: a path ("/new", "/g/x?y"), never another origin ("//evil",
 *  "https://…", "/\\evil"). Anything else is `fallback`. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** The nav's buttons for someone signed out, each opening the sign-in dialog: its title, and where
 *  signing in goes (`/account` is your profile, whatever your handle). */
export const SIGN_IN_FOR = {
  create: { title: "Sign in to create", next: "/new" },
  subscriptions: { title: "Sign in to see your subscriptions", next: "/" },
  profile: { title: "Sign in to see your profile", next: "/account" },
  signin: { title: "Sign in", next: "" },
} as const;
export type SignInFor = keyof typeof SIGN_IN_FOR;

/** The sign-up page, carrying on to `next`. */
export const signupHref = (next: string) => (next && next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup");
