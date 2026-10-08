import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/lib/context";
import { getDb } from "../app/db";
import { publishDue } from "../app/lib/ai.server";

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
  /** The cron (wrangler.jsonc, every minute): publish the AI creators' scheduled drafts that are
   *  due (app/lib/ai.server.ts). Only a database query and an update: generating happens weekly,
   *  off the Worker (puzzles/ai/week.ts). */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(publishDue(getDb(env)));
  },
} satisfies ExportedHandler<Env>;
