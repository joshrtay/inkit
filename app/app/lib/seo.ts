// What search engines and AI agents read: each page's meta tags (canonical, Open Graph, Twitter,
// JSON-LD), robots.txt, sitemap.xml, llms.txt and the guides as Markdown. Pure functions of plain
// data, so they're unit-tested (tests/unit/seo.test.ts); the routes fetch the data
// (lib/seo.server.ts, lib/guides.server.ts) and serve what these build.
import type { MetaDescriptor } from "react-router";

export const SITE = "https://inkit.games";
export const SITE_NAME = "inkit";
export const abs = (path: string) => (path.startsWith("http") ? path : SITE + path);

type JsonLd = Record<string, unknown>;

export interface PageMeta {
  /** the whole <title> */
  title: string;
  description: string;
  /** the canonical path ("/puzzles/akari"): no query string */
  path: string;
  type?: "website" | "article" | "profile";
  /** an absolute image URL for previews, if there is one */
  image?: string;
  /** keep it out of search results (drafts, editors, settings) */
  noindex?: boolean;
  /** a Markdown version of the page (its path) */
  markdown?: string;
  /** structured data; several objects go out as one @graph */
  jsonLd?: JsonLd | JsonLd[];
}

/** Search snippets are cut at about 160 characters: cut at a word and say so. */
export function clip(s: string, n = 160) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, t.lastIndexOf(" ", n - 1)).replace(/[,;:.]$/, "") + "…";
}

/** Every tag a public page needs, for a route's `meta`. */
export function pageMeta(m: PageMeta): MetaDescriptor[] {
  const url = abs(m.path), description = clip(m.description);
  const tags: MetaDescriptor[] = [
    { title: m.title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: m.type ?? "website" },
    { property: "og:title", content: m.title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { name: "twitter:card", content: m.image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: m.title },
    { name: "twitter:description", content: description },
  ];
  if (m.image) tags.push({ property: "og:image", content: m.image }, { name: "twitter:image", content: m.image });
  if (m.noindex) tags.push({ name: "robots", content: "noindex" });
  if (m.markdown) tags.push({ tagName: "link", rel: "alternate", type: "text/markdown", href: abs(m.markdown) });
  if (m.jsonLd) {
    const all = Array.isArray(m.jsonLd) ? m.jsonLd : [m.jsonLd];
    tags.push({ "script:ld+json": all.length === 1 ? { "@context": "https://schema.org", ...all[0] } : { "@context": "https://schema.org", "@graph": all } });
  }
  return tags;
}

/** A private or unfinished page: a title, and kept out of search results. */
export const privateMeta = (title: string): MetaDescriptor[] => [{ title }, { name: "robots", content: "noindex" }];

// ---------------------------------------------------------------- the guides as data

/** A puzzle type's guide as text: what the page says, without its pictures. */
export interface GuideDoc {
  kind: string;
  name: string;
  aka: string[];
  category: string;
  summary: string;
  origin: string;
  /** the credit as one line ("Invented by X (1989); popularized by Y.") */
  creditLine: string;
  credit: { inventor?: string; popularizer?: string; year?: string; note?: string; source: { label: string; url: string } };
  rules: { text: string; pictures: { ok: boolean; note: string }[] }[];
  controls: string;
  example: {
    name: string;
    /** rows × columns, for a square grid */
    size: [number, number];
    /** the givens, as the engine writes them */
    givens: unknown[];
    /** the solution written out, a line per row, where it reads as text (digits, shading) */
    solution: string[] | null;
  };
}

export const guidePath = (kind: string) => `/puzzles/${kind}`;
export const guideMdPath = (kind: string) => `/puzzles/${kind}.md`;

/** "Akari rules: how to play Akari puzzles · inkit" */
export const guideTitle = (g: Pick<GuideDoc, "name">) => `${g.name} rules: how to play ${g.name} puzzles · ${SITE_NAME}`;

/** The summary, then the other names it goes by. */
export function guideDescription(g: Pick<GuideDoc, "summary" | "aka" | "name">) {
  const base = g.aka.length ? `${g.summary} Also called ${g.aka.join(", ")}.` : g.summary;
  const more = `${base} How to play ${g.name}, with pictures and a worked example.`;
  return more.length <= 160 ? more : base;
}

const crumbs = (items: [string, string][]): JsonLd => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(path) })),
});

const ORG: JsonLd = { "@type": "Organization", "@id": `${SITE}/#org`, name: SITE_NAME, url: SITE };

/** A guide page: an Article about the puzzle type (Google supports Article; HowTo rich results are
 *  gone), with the credit, and its breadcrumbs. */
export function guideJsonLd(g: GuideDoc): JsonLd[] {
  const url = abs(guidePath(g.kind));
  return [
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: `${g.name} rules: how to play ${g.name} puzzles`,
      name: `${g.name} rules`,
      description: g.summary,
      url,
      mainEntityOfPage: url,
      inLanguage: "en",
      articleSection: g.category,
      author: ORG,
      publisher: ORG,
      about: {
        "@type": "Game",
        name: g.name,
        ...(g.aka.length ? { alternateName: g.aka } : {}),
        genre: `${g.category} logic puzzle`,
        ...(g.credit.year ? { dateCreated: g.credit.year } : {}),
      },
      ...(g.creditLine ? { creditText: g.creditLine } : {}),
      isBasedOn: g.credit.source.url,
      citation: { "@type": "CreativeWork", name: g.credit.source.label, url: g.credit.source.url },
    },
    crumbs([["Puzzle types", "/puzzles"], [g.name, guidePath(g.kind)]]),
  ];
}

/** /puzzles: the list of guides. */
export function puzzlesJsonLd(types: { kind: string; name: string }[]): JsonLd[] {
  return [
    {
      "@type": "CollectionPage",
      "@id": `${SITE}/puzzles#page`,
      name: "Puzzle types",
      url: abs("/puzzles"),
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: types.length,
        itemListElement: types.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, url: abs(guidePath(t.kind)) })),
      },
    },
    crumbs([["Puzzle types", "/puzzles"]]),
  ];
}

/** The site's home ("/"): a WebSite, for every version of it. */
export const websiteJsonLd = (): JsonLd => ({
  "@type": "WebSite", "@id": `${SITE}/#site`, name: SITE_NAME, url: SITE, description: "Hand-drawn logic puzzles you can play in the browser.",
});

export const HOME_TITLE = "inkit: hand-drawn logic puzzles to play in your browser";
export const HOME_DESCRIPTION = "Hand-drawn logic puzzles you can play in the browser, made by creators: Sudoku, Akari, Slitherlink, Nurikabe and dozens more. Draw your own and share it.";

/** Explore, which is the home page for anyone signed out (and so for search engines): the WebSite,
 *  and a CollectionPage at "/" whose list is Today's puzzles. No breadcrumbs: it's the top. */
export function exploreJsonLd(today: { id: string; title: string }[]): JsonLd[] {
  return [
    websiteJsonLd(),
    {
      "@type": "CollectionPage",
      "@id": `${SITE}/#page`,
      name: "Explore logic puzzles",
      url: abs("/"),
      isPartOf: { "@id": `${SITE}/#site` },
      mainEntity: {
        "@type": "ItemList",
        name: "Today",
        numberOfItems: today.length,
        itemListElement: today.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g.title, url: abs(`/g/${g.id}`) })),
      },
    },
  ];
}

/** Explore's tags, at "/" (signed out) or /explore. One page at two addresses, so both name "/" as
 *  canonical: the site's root is what people link to, and /explore can't redirect there, since
 *  signed in "/" is the Subscriptions feed. A search (?q=) is kept out of search results. */
export function exploreMeta(d: { q: string; today: { id: string; title: string }[] } | undefined, at: "/" | "/explore" = "/explore"): MetaDescriptor[] {
  return pageMeta({
    title: at === "/" ? HOME_TITLE : `Explore logic puzzles · ${SITE_NAME}`,
    description: HOME_DESCRIPTION,
    path: "/",
    noindex: !!d?.q,
    jsonLd: d && !d.q ? exploreJsonLd(d.today) : undefined,
  });
}

export const explorePath = (kind: string) => `/explore/${kind}`;

/** A type's puzzles (/explore/<type>): a CollectionPage of them, about the type (its guide), with breadcrumbs. */
export function typePuzzlesJsonLd(t: { kind: string; name: string }, puzzles: { id: string; title: string }[]): JsonLd[] {
  return [
    {
      "@type": "CollectionPage",
      "@id": `${abs(explorePath(t.kind))}#page`,
      name: `${t.name} puzzles`,
      url: abs(explorePath(t.kind)),
      about: { "@type": "Thing", name: t.name, url: abs(guidePath(t.kind)) },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: puzzles.length,
        itemListElement: puzzles.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g.title, url: abs(`/g/${g.id}`) })),
      },
    },
    crumbs([["Explore", "/"], [t.name, explorePath(t.kind)]]),
  ];
}

/** A published game: a Game (a CreativeWork), credited to its author. */
export function gameJsonLd(g: {
  id: string; title: string; description: string; kindName: string; kind: string;
  author: { name: string; handle: string; deleted: boolean }; created: number; published: number | null;
}): JsonLd {
  return {
    "@type": "Game",
    "@id": `${abs(`/g/${g.id}`)}#game`,
    name: g.title,
    url: abs(`/g/${g.id}`),
    ...(g.description ? { description: g.description } : {}),
    genre: g.kindName,
    gameType: "logic puzzle",
    isAccessibleForFree: true,
    inLanguage: "en",
    author: { "@type": "Person", name: g.author.name, ...(g.author.deleted ? {} : { url: abs(`/${g.author.handle}`) }) },
    dateCreated: new Date(g.created).toISOString(),
    ...(g.published ? { datePublished: new Date(g.published).toISOString() } : {}),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE },
    about: { "@type": "Thing", name: g.kindName, url: abs(guidePath(g.kind)) },
  };
}

/** A creator's (or studio's) page: a ProfilePage about a Person or Organization. */
export function profileJsonLd(p: { slug: string; title: string; description: string; person: boolean; created?: number }): JsonLd {
  return {
    "@type": "ProfilePage",
    url: abs(`/${p.slug}`),
    ...(p.created ? { dateCreated: new Date(p.created).toISOString() } : {}),
    mainEntity: {
      "@type": p.person ? "Person" : "Organization",
      name: p.title,
      alternateName: `@${p.slug}`,
      url: abs(`/${p.slug}`),
      ...(p.description ? { description: p.description } : {}),
    },
  };
}

// ---------------------------------------------------------------- robots.txt

/** Never crawled: accounts, editing, the API and admin endpoints. Anchored (`$`, a trailing `/`),
 *  as robots rules match prefixes and a creator's handle could start with "new" or "api". */
export const PRIVATE_PATHS = ["/settings$", "/new$", "/new/", "/studios/new$", "/g/*/draw", "/g/*/publish", "/g/*/edit", "/g/*/preview", "/g/*/like", "/g/*/solve", "/g/*/sketch",
  "/*/settings$", "/admin/", "/api/", "/signin$", "/signup$", "/forgot-password$", "/reset-password$"];

/** Crawlers the owner wants in by name, AI ones included (a named group overrides `*`, so each
 *  repeats the rules). */
export const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai",
  "Google-Extended", "PerplexityBot", "Perplexity-User", "CCBot", "Applebot-Extended", "Meta-ExternalAgent", "Amazonbot", "DuckAssistBot", "cohere-ai", "MistralAI-User"];

export function robotsTxt(): string {
  const rules = ["Allow: /", ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`)].join("\n");
  return [
    "# inkit.games: hand-drawn logic puzzles. Everything public may be crawled and used by search",
    "# engines and AI agents. A summary for agents: https://inkit.games/llms.txt",
    "",
    "User-agent: *",
    rules,
    "",
    ...AI_CRAWLERS.map((a) => `User-agent: ${a}`),
    rules,
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- sitemap.xml

export interface SitemapEntry { path: string; lastmod?: number | null }

/** A sitemap holds at most 50,000 addresses. */
export const SITEMAP_MAX = 50_000;

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function sitemapXml(entries: SitemapEntry[]): string {
  const seen = new Set<string>();
  const urls = entries.filter((e) => !seen.has(e.path) && seen.add(e.path)).slice(0, SITEMAP_MAX).map((e) =>
    `<url><loc>${xml(abs(e.path))}</loc>${e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// ---------------------------------------------------------------- Markdown for agents

/** One guide as Markdown: the rules (with what each picture shows), the other names, the credit,
 *  and the worked example in text. */
export function guideMarkdown(g: GuideDoc, playUrl?: string | null): string {
  const out: string[] = [`# ${g.name}`, ""];
  out.push(`> ${g.summary}`, "");
  if (g.aka.length) out.push(`Also called: ${g.aka.join(", ")}`, "");
  out.push(`Kind of puzzle: ${g.category}`, "", `Web page: ${abs(guidePath(g.kind))}`, "");
  out.push("## Origin", "", g.origin, "");
  out.push("## Credit", "");
  if (g.credit.inventor) out.push(`- Inventor: ${g.credit.inventor}${g.credit.year ? ` (${g.credit.year})` : ""}`);
  if (g.credit.popularizer) out.push(`- Popularized by: ${g.credit.popularizer}${!g.credit.inventor && g.credit.year ? ` (${g.credit.year})` : ""}`);
  if (g.credit.note) out.push(`- ${g.credit.note}`);
  out.push(`- Source: [${g.credit.source.label}](${g.credit.source.url})`, "");
  out.push("## Rules", "");
  g.rules.forEach((r, i) => {
    out.push(`${i + 1}. ${r.text}`);
    for (const p of r.pictures) out.push(`   - ${p.ok ? "✓ Right" : "✗ Wrong"}: ${p.note}`);
  });
  out.push("", `## Worked example: ${g.example.name}`, "");
  out.push(`A ${g.example.size[0]}×${g.example.size[1]} ${g.name} puzzle, with exactly one solution.`, "");
  out.push("The givens, as inkit's puzzle engine writes them (cells are [row, column] from 0 at the top left):", "", "```json", JSON.stringify(g.example.givens), "```", "");
  if (g.example.solution) {
    const has = (ch: string) => g.example.solution!.some((l) => l.includes(ch));
    const key = [has("#") && "`#` is a marked cell (shaded, or whatever this type places in a cell)", has(".") && "`.` is left empty", has("■") && "`■` is a black cell given in the puzzle"].filter(Boolean);
    out.push(`The solution, a line per row${key.length ? ` (${key.join(", ")})` : ""}:`, "", "```", ...g.example.solution, "```", "");
  }
  if (!g.example.solution) out.push(`The solution is drawn on the web page: ${abs(guidePath(g.kind))}`, "");
  if (playUrl) out.push(`Play it: ${abs(playUrl)}`, "");
  out.push("## Playing on inkit", "", g.controls, "");
  return out.join("\n");
}

/** /llms.txt (llmstxt.org): what the site is, and a link to each guide's Markdown. */
export function llmsTxt(guides: Pick<GuideDoc, "kind" | "name" | "summary" | "category" | "aka">[]): string {
  const out = [
    "# inkit",
    "",
    "> inkit (https://inkit.games) turns hand-drawn logic puzzles into games you play in the browser. A creator draws a puzzle on paper and uploads a photo, Claude reads it into a draft, the creator checks it, and publishes it once it has exactly one solution. Players solve puzzles, follow creators and like puzzles.",
    "",
    `Every puzzle type on the site has a guide: its rules, each shown with pictures of what's right and wrong, where it comes from and who to credit, and a worked example. Each guide is a web page (${SITE}/puzzles/<type>) and the same text in Markdown (${SITE}/puzzles/<type>.md). All of them in one file: ${SITE}/llms-full.txt`,
    "",
  ];
  const categories = [...new Set(guides.map((g) => g.category))];
  out.push("## Puzzle types", "");
  for (const c of categories) {
    out.push(`### ${c}`, "");
    for (const g of guides.filter((x) => x.category === c)) out.push(`- [${g.name}](${abs(guideMdPath(g.kind))}): ${g.summary}${g.aka.length ? ` Also called ${g.aka.join(", ")}.` : ""}`);
    out.push("");
  }
  out.push("## Site", "",
    `- [Puzzle types](${abs("/puzzles")}): every guide, by kind of puzzle`,
    `- [Explore](${abs("/")}): today's newest puzzles, quick ones, the week's hardest, and the creators (each type's puzzles at ${SITE}/explore/<type>)`,
    `- [Sitemap](${abs("/sitemap.xml")}): every public puzzle (${SITE}/g/<id>) and creator profile (${SITE}/<handle>)`,
    "",
    "## Optional", "",
    `- [Privacy](${abs("/privacy")})`,
    `- [Terms](${abs("/terms")})`,
    "");
  return out.join("\n");
}

/** /llms-full.txt: every guide, in full. */
export const llmsFullTxt = (docs: { doc: GuideDoc; playUrl?: string | null }[]) =>
  [`# inkit: every puzzle type's rules`, "", `> The guides from ${SITE}/puzzles, in Markdown.`, "", ...docs.map((d) => guideMarkdown(d.doc, d.playUrl).replace(/^(#+) /gm, "#$1 "))].join("\n");
