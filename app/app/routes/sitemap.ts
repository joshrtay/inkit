// /sitemap.xml: the site's pages, every guide, and published games and their creators' profiles.
import type { Route } from "./+types/sitemap";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { sitemapXml } from "~/lib/seo";
import { sitemapEntries, textResponse } from "~/lib/seo.server";

export async function loader({ context }: Route.LoaderArgs) {
  return textResponse(sitemapXml(await sitemapEntries(getDb(context.get(cloudflareContext).env))), "application/xml");
}
