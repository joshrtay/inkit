// /account: your profile, whatever your handle (where signing in from the nav's Profile goes), or
// sign in first.
import { redirect } from "react-router";
import type { Route } from "./+types/account";
import { cloudflareContext } from "~/lib/context";
import { currentCreator } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await currentCreator(context.get(cloudflareContext).env, request);
  throw redirect(me ? `/${me.handle}` : "/signin?next=/account");
}
