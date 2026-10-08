// /llms-full.txt: every guide in full, as Markdown, for AI agents.
import type { Route } from "./+types/llms-full";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { guideDoc, ORDER } from "~/lib/guides.server";
import { llmsFullTxt } from "~/lib/seo";
import { playableExamples, textResponse } from "~/lib/seo.server";

export async function loader({ context }: Route.LoaderArgs) {
  const play = await playableExamples(getDb(context.get(cloudflareContext).env));
  return textResponse(llmsFullTxt(ORDER.map((k) => ({ doc: guideDoc(k), playUrl: play.get(k) ?? null }))), "text/plain");
}
