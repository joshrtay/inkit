// What search engines and agents read (app/lib/seo.ts): meta tags, JSON-LD, robots.txt, the
// sitemap, llms.txt and the guides as Markdown.
import { describe, expect, it } from "vitest";
import {
  AI_CRAWLERS, clip, gameJsonLd, guideDescription, guideJsonLd, guideMarkdown, guideTitle, llmsFullTxt, llmsTxt, pageMeta,
  profileJsonLd, puzzlesJsonLd, robotsTxt, SITE, sitemapXml,
} from "~/lib/seo";
import { guideDoc, ORDER } from "~/lib/guides.server";

type Obj = Record<string, unknown>;
const docs = ORDER.map(guideDoc);

/** Every URL in a JSON-LD tree is absolute, on the site or an https source. */
function urlsIn(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string" && /^(https?:)?\/\//.test(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => urlsIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => urlsIn(x, out));
  return out;
}

function expectBreadcrumbs(b: Obj, names: string[]) {
  expect(b["@type"]).toBe("BreadcrumbList");
  const items = b.itemListElement as Obj[];
  expect(items.map((i) => i.name)).toEqual(names);
  items.forEach((i, k) => { expect(i["@type"]).toBe("ListItem"); expect(i.position).toBe(k + 1); expect(String(i.item)).toMatch(/^https:\/\/inkit\.games\//); });
}

describe("page meta", () => {
  const tags = pageMeta({ title: "T · inkit", description: "D", path: "/puzzles/akari", type: "article", markdown: "/puzzles/akari.md", jsonLd: [{ "@type": "Article" }, { "@type": "BreadcrumbList" }] });
  const find = (pred: (t: Obj) => boolean) => tags.find((t) => pred(t as Obj)) as Obj | undefined;

  it("has an absolute canonical, Open Graph and Twitter tags", () => {
    expect(find((t) => t.rel === "canonical")?.href).toBe(`${SITE}/puzzles/akari`);
    expect(find((t) => t.property === "og:url")?.content).toBe(`${SITE}/puzzles/akari`);
    expect(find((t) => t.property === "og:type")?.content).toBe("article");
    expect(find((t) => t.property === "og:title")?.content).toBe("T · inkit");
    expect(find((t) => t.name === "twitter:card")?.content).toBe("summary");
    expect(find((t) => t.name === "robots")).toBeUndefined();
  });

  it("links the Markdown and puts several JSON-LD objects in one @graph", () => {
    expect(find((t) => t.rel === "alternate")).toMatchObject({ tagName: "link", type: "text/markdown", href: `${SITE}/puzzles/akari.md` });
    const ld = find((t) => "script:ld+json" in t)!["script:ld+json"] as Obj;
    expect(ld["@context"]).toBe("https://schema.org");
    expect((ld["@graph"] as Obj[]).map((o) => o["@type"])).toEqual(["Article", "BreadcrumbList"]);
  });

  it("marks private pages noindex", () => {
    expect(pageMeta({ title: "x", description: "y", path: "/g/1", noindex: true })).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("clips long descriptions at a word", () => {
    const s = clip("word ".repeat(60));
    expect(s.length).toBeLessThanOrEqual(161);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("guides", () => {
  it("every guide has a unique title and a description under 160 characters", () => {
    const titles = docs.map(guideTitle);
    expect(new Set(titles).size).toBe(docs.length);
    for (const d of docs) {
      expect(guideTitle(d)).toBe(`${d.name} rules: how to play ${d.name} puzzles · inkit`);
      expect(guideDescription(d)).toContain(d.summary);
      if (d.aka.length && guideDescription(d).length < 160) expect(guideDescription(d)).toContain(d.aka[0]);
    }
  });

  it("JSON-LD: an Article about the puzzle type, credited, with breadcrumbs", () => {
    for (const d of docs) {
      const [article, crumbs] = guideJsonLd(d) as Obj[];
      expect(article).toMatchObject({ "@type": "Article", headline: expect.any(String), description: d.summary, url: `${SITE}/puzzles/${d.kind}` });
      expect((article.headline as string).length).toBeLessThanOrEqual(110);   // Google's headline limit
      expect(article.author).toMatchObject({ "@type": "Organization", name: "inkit" });
      expect(article.about).toMatchObject({ "@type": "Game", name: d.name });
      expect(article.isBasedOn).toBe(d.credit.source.url);
      if (d.creditLine) expect(article.creditText).toBe(d.creditLine);
      for (const u of urlsIn(article)) expect(u).toMatch(/^https:\/\//);
      expectBreadcrumbs(crumbs, ["Puzzle types", d.name]);
      expect(() => JSON.stringify(article)).not.toThrow();
    }
  });

  it("/puzzles JSON-LD: an ItemList of every type", () => {
    const [page, crumbs] = puzzlesJsonLd(docs) as Obj[];
    expect(page["@type"]).toBe("CollectionPage");
    const list = page.mainEntity as Obj;
    expect(list["@type"]).toBe("ItemList");
    expect(list.numberOfItems).toBe(docs.length);
    (list.itemListElement as Obj[]).forEach((item, i) => expect(item).toEqual({ "@type": "ListItem", position: i + 1, name: docs[i].name, url: `${SITE}/puzzles/${docs[i].kind}` }));
    expectBreadcrumbs(crumbs, ["Puzzle types"]);
  });

  it("Markdown: rules with what each picture shows, the other names, the credit and the example", () => {
    const akari = docs.find((d) => d.kind === "akari")!;
    const md = guideMarkdown(akari, "/g/akari-1");
    expect(md).toMatch(/^# Akari\n/);
    expect(md).toContain(`> ${akari.summary}`);
    expect(md).toContain("Also called: Light Up");
    expect(md).toContain("## Rules");
    expect(md).toContain(`1. ${akari.rules[0].text}`);
    expect(md).toContain(`✓ Right: ${akari.rules[0].pictures[0].note}`);
    expect(md).toContain(`Source: [${akari.credit.source.label}](${akari.credit.source.url})`);
    expect(md).toContain(`## Worked example: ${akari.example.name}`);
    expect(md).toContain("Play it: https://inkit.games/g/akari-1");
    // the solution, a line per row
    expect(akari.example.solution).toHaveLength(akari.example.size[0]);
    for (const line of akari.example.solution!) expect(md).toContain(`\n${line}\n`);
  });

  it("Markdown for every type, with a written-out solution for the cell-marking ones", () => {
    for (const d of docs) {
      const md = guideMarkdown(d);
      expect(md).toContain(`# ${d.name}`);
      for (const r of d.rules) expect(md).toContain(r.text);
      if (d.example.solution) expect(md).toContain("The solution, a line per row");
      else expect(md).toContain("The solution is drawn on the web page");
    }
    expect(docs.find((d) => d.kind === "sudoku")!.example.solution).not.toBeNull();
  });
});

describe("game and profile JSON-LD", () => {
  it("a game: a Game with its author and dates", () => {
    const ld = gameJsonLd({ id: "akari-1", title: "Lights On", description: "", kind: "akari", kindName: "Akari", author: { name: "Wyatt", handle: "wyatt", deleted: false }, created: Date.UTC(2026, 0, 2), published: Date.UTC(2026, 0, 3) });
    expect(ld).toMatchObject({
      "@type": "Game", name: "Lights On", url: `${SITE}/g/akari-1`, genre: "Akari",
      author: { "@type": "Person", name: "Wyatt", url: `${SITE}/wyatt` },
      dateCreated: "2026-01-02T00:00:00.000Z", datePublished: "2026-01-03T00:00:00.000Z",
    });
    expect(ld).not.toHaveProperty("description");
    const gone = gameJsonLd({ id: "x", title: "X", description: "d", kind: "akari", kindName: "Akari", author: { name: "Gone", handle: "gone", deleted: true }, created: 0, published: null });
    expect(gone.author).toEqual({ "@type": "Person", name: "Gone" });
    expect(gone).not.toHaveProperty("datePublished");
  });

  it("a profile: a ProfilePage about a Person or an Organization", () => {
    expect(profileJsonLd({ slug: "wyatt", title: "Wyatt", description: "", person: true })).toMatchObject({ "@type": "ProfilePage", mainEntity: { "@type": "Person", name: "Wyatt", url: `${SITE}/wyatt` } });
    expect(profileJsonLd({ slug: "lab", title: "Lab", description: "d", person: false }).mainEntity).toMatchObject({ "@type": "Organization", description: "d" });
  });
});

describe("robots.txt", () => {
  const txt = robotsTxt();
  it("allows everything public, keeps crawlers out of private and app routes, and names the sitemap", () => {
    expect(txt).toMatch(/User-agent: \*\nAllow: \//);
    for (const p of ["/settings$", "/new$", "/g/*/edit", "/admin/", "/api/"]) expect(txt).toContain(`Disallow: ${p}`);
    expect(txt).toContain("Sitemap: https://inkit.games/sitemap.xml");
    expect(txt).not.toMatch(/Disallow: \/\s*$/m);   // never the whole site
    expect(txt).not.toMatch(/Disallow: \/puzzles|Disallow: \/g\/\*\s*$|Disallow: \/explore/m);
  });

  it("lets AI crawlers in by name, under the same rules", () => {
    for (const bot of ["GPTBot", "ClaudeBot", "Google-Extended", "PerplexityBot", "CCBot"]) expect(AI_CRAWLERS).toContain(bot);
    const group = txt.split("\n\n").find((g) => g.includes("User-agent: GPTBot"))!;
    for (const bot of AI_CRAWLERS) expect(group).toContain(`User-agent: ${bot}\n`);
    expect(group).toContain("Allow: /");
    expect(group).toContain("Disallow: /g/*/edit");
  });
});

describe("sitemap.xml", () => {
  it("lists absolute addresses once each, with their dates, escaped", () => {
    const xml = sitemapXml([{ path: "/", lastmod: Date.UTC(2026, 9, 8) }, { path: "/puzzles" }, { path: "/puzzles" }, { path: "/a&b" }]);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
    expect(xml).toContain("<url><loc>https://inkit.games/</loc><lastmod>2026-10-08</lastmod></url>");
    expect(xml).toContain("<url><loc>https://inkit.games/puzzles</loc></url>");
    expect(xml.match(/\/puzzles</g)).toHaveLength(1);
    expect(xml).toContain("https://inkit.games/a&amp;b");
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });

  it("stops at 50,000 addresses", () => {
    const xml = sitemapXml(Array.from({ length: 50_010 }, (_, i) => ({ path: `/g/${i}` })));
    expect(xml.match(/<url>/g)).toHaveLength(50_000);
  });
});

describe("llms.txt", () => {
  it("follows llmstxt.org: a title, a summary, and sections of links to each guide's Markdown", () => {
    const txt = llmsTxt(docs);
    expect(txt).toMatch(/^# inkit\n\n> /);
    for (const d of docs) expect(txt).toContain(`- [${d.name}](${SITE}/puzzles/${d.kind}.md): ${d.summary}`);
    expect(txt).toContain("## Puzzle types");
    expect(txt).toContain("## Optional");
    expect(txt).toContain(`${SITE}/llms-full.txt`);
  });

  it("llms-full.txt has every guide, its headings one level down", () => {
    const full = llmsFullTxt(docs.map((doc) => ({ doc })));
    expect(full).toMatch(/^# inkit: every puzzle type's rules/);
    for (const d of docs) { expect(full).toContain(`\n## ${d.name}\n`); expect(full).toContain(d.summary); }
    expect(full).toContain("\n### Rules\n");
    // solution grids (lines starting "#") are left alone
    expect(full).toContain("\n..#■#.\n");
  });
});
