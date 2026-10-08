// /llms.txt (llmstxt.org): the site and a link to each guide's Markdown, for AI agents.
import { guideDoc, ORDER } from "~/lib/guides.server";
import { llmsTxt } from "~/lib/seo";
import { textResponse } from "~/lib/seo.server";

export const loader = () => textResponse(llmsTxt(ORDER.map(guideDoc)), "text/plain");
