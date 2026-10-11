// One address per page: lowercase, no trailing slash (lib/tidy-url.ts).
import { describe, expect, it } from "vitest";
import { tidyPath } from "~/lib/tidy-url";

describe("tidyPath", () => {
  it("leaves a page's own address alone", () => {
    for (const p of ["/", "/explore", "/g/akari-1", "/wyatt", "/puzzles/star-battle", "/s/k4t9wq2v7c"]) expect(tidyPath(p)).toBeNull();
  });
  it("drops a slash at the end and lowercases", () => {
    expect(tidyPath("/explore/")).toBe("/explore");
    expect(tidyPath("/puzzles/akari//")).toBe("/puzzles/akari");
    expect(tidyPath("/Wyatt")).toBe("/wyatt");
    expect(tidyPath("/G/Akari-1/")).toBe("/g/akari-1");
  });
  it("leaves what only the site's pages call, and admin, as asked", () => {
    expect(tidyPath("/api/auth/callback/Google")).toBeNull();
    expect(tidyPath("/admin/bugs/AbC/files/Shot.png")).toBeNull();
  });
});
