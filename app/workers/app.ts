import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/lib/context";
import { getDb } from "../app/db";
import { publishDue } from "../app/lib/ai.server";
import { isKind } from "../app/lib/guides.server";
import { guideMarkdownOf, playableExamples, textResponse } from "../app/lib/seo.server";

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
    // a guide as Markdown, for agents (/puzzles/<kind>.md): React Router's segments can't end in ".md"
    const md = new URL(request.url).pathname.match(/^\/puzzles\/([a-z0-9-]+)\.md$/);
    if (md && isKind(md[1]) && (request.method === "GET" || request.method === "HEAD")) {
      const play = (await playableExamples(getDb(env))).get(md[1]) ?? null;
      return textResponse(guideMarkdownOf(md[1], play), "text/markdown");
    }
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
