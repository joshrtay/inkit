import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/lib/context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/** Old domains that now lead to inkit: Wyatt's former site goes to his profile here. */
const MOVED: Record<string, string> = {
  "wyattsgames.com": "https://inkit.games/wyatt",
  "www.wyattsgames.com": "https://inkit.games/wyatt",
};

export default {
  async fetch(request, env, ctx) {
    const moved = MOVED[new URL(request.url).hostname];
    if (moved) return Response.redirect(moved, 301);
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;
