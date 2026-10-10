import { describe, expect, it } from "vitest";
import { safeNext, signupHref } from "~/lib/next";

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/new")).toBe("/new");
    expect(safeNext("/g/a?b=1")).toBe("/g/a?b=1");
  });
  it("refuses anything that leaves the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "", null, undefined]) expect(safeNext(bad)).toBe("/");
    expect(safeNext("//x", "/explore")).toBe("/explore");
  });
});

describe("signupHref", () => {
  it("carries next, but not home", () => {
    expect(signupHref("/new")).toBe("/signup?next=%2Fnew");
    expect(signupHref("/")).toBe("/signup");
    expect(signupHref("")).toBe("/signup");
  });
});
