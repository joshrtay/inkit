// Better Auth's endpoints (sign up, sign in, Google callback, sign out, sessions).
import type { Route } from "./+types/api.auth";
import { cloudflareContext } from "~/lib/context";
import { createAuth } from "~/lib/auth.server";

const handle = ({ request, context }: Route.LoaderArgs | Route.ActionArgs) =>
  createAuth(context.get(cloudflareContext).env).handler(request);

export const loader = handle;
export const action = handle;
