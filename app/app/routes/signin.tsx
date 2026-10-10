import { Link, redirect } from "react-router";
import type { Route } from "./+types/signin";
import { cloudflareContext } from "~/lib/context";
import { currentCreator } from "~/lib/auth.server";
import { safeNext, signupHref } from "~/lib/next";
import { SignInForm } from "~/components/SignInForm";

export const meta: Route.MetaFunction = () => [{ title: "Sign in · inkit" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (await currentCreator(env, request)) throw redirect(next);
  return { google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), next };
}

export default function SignIn({ loaderData: { google, next } }: Route.ComponentProps) {
  return (
    <main className="wrap narrow">
      <h1>Sign in</h1>
      <SignInForm google={google} next={next} />
      <p className="muted"><Link to="/forgot-password">Forgot your password?</Link></p>
      <p className="muted">New here? <Link to={signupHref(next)}>Create an account</Link></p>
    </main>
  );
}
