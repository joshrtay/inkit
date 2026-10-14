// Links load their page ahead on intent (components/Link.tsx), but not heavy or private pages, and
// a prefetch may be kept just long enough for its click (lib/prefetch.ts).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { prefetchCaching, prefetchable } from "~/lib/prefetch";

describe("which links load ahead", () => {
  it.each(["/", "/explore", "/explore/akari?sort=top", "/g/abc", "/g/abc?in=akari", "/wyatt", "/wyatt?tab=about", "/puzzles", "/puzzles/akari", "/s/xyz"])("%s does", (to) => {
    expect(prefetchable(to)).toBe(true);
  });
  it.each(["/new", "/new?studio=x", "/signin?next=/g/a", "/signup", "/settings", "/account", "/admin/bugs", "/g/abc/draw", "/g/abc/edit", "/g/abc/publish", "/wyatt/settings", "/api/feed", "/studios/new"])("%s doesn't", (to) => {
    expect(prefetchable(to)).toBe(false);
  });
});

describe("a prefetch's response", () => {
  const data = () => new Response("[]", { headers: { "content-type": "text/x-script" } });
  it("may be kept a few seconds when it's a prefetch of page data", () => {
    const res = data();
    prefetchCaching(new Request("http://x/g/a.data", { headers: { "sec-purpose": "prefetch" } }), res);
    expect(res.headers.get("cache-control")).toBe("private, max-age=5");
  });
  it("isn't otherwise", () => {
    const plain = data();
    prefetchCaching(new Request("http://x/g/a.data"), plain);
    expect(plain.headers.get("cache-control")).toBeNull();
    const page = new Response("<html>", { headers: { "content-type": "text/html" } });
    prefetchCaching(new Request("http://x/g/a", { headers: { "sec-purpose": "prefetch" } }), page);
    expect(page.headers.get("cache-control")).toBeNull();
  });
});

describe("the site's pages", () => {
  // every page's links go through components/Link.tsx (the editors and admin pages may use React Router's own)
  const own = new Set(["components/Link.tsx", "components/GameEditor.tsx", "components/Paint.tsx", "routes/game-publish.tsx", "routes/admin-bug.tsx", "routes/admin-bugs.tsx"]);
  const root = new URL("../../app/", import.meta.url).pathname;
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  it("import Link and NavLink from components/Link.tsx", () => {
    const wrong = files(root).filter((f) => /\.tsx?$/.test(f) && !own.has(f.slice(root.length)))
      .filter((f) => /import\s*\{[^}]*\b(?:Link|NavLink)\b[^}]*\}\s*from\s*"react-router"/.test(readFileSync(f, "utf8")));
    expect(wrong.map((f) => f.slice(root.length))).toEqual([]);
  });
});
