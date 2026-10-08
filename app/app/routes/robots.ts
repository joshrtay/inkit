// /robots.txt: everything public may be crawled, AI crawlers included (lib/seo.ts).
import { robotsTxt } from "~/lib/seo";
import { textResponse } from "~/lib/seo.server";

export const loader = () => textResponse(robotsTxt(), "text/plain");
