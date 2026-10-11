// Creators own the top level of the site (inkit.games/<handle>: docs/url-design.md), so every
// first part of the site's own routes is reserved: no handle or studio can take it and end up with
// a profile nobody can reach.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isReserved, isValidHandle } from "~/lib/names.server";

const routes = readFileSync(new URL("../../app/routes.ts", import.meta.url), "utf8");
const firsts = [...new Set([...routes.matchAll(/route\("([^"]+)"/g)].map((m) => m[1].split("/")[0]))]
  .filter((s) => !s.startsWith(":"));

describe("the site's own top-level paths", () => {
  it("are found in routes.ts", () => {
    expect(firsts).toEqual(expect.arrayContaining(["g", "s", "explore", "puzzles", "api", "admin", "settings"]));
  });
  it.each(firsts.filter((s) => !s.includes(".")))("%s is reserved", (s) => {
    expect(isReserved(s)).toBe(true);
    expect(isValidHandle(s)).toBe(false);
  });
});
