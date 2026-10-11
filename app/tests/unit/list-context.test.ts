// The list a puzzle was opened from, in its URL (lib/list-context.ts): read back exactly as written,
// with defaults left out, anything unknown refused, and the bar's words for each kind of list.
import { describe, expect, it } from "vitest";
import { browse, contextLabel, contextQuery, inList, readContext, type ListContext } from "~/lib/list-context";

const isKind = (k: string) => ["akari", "sudoku", "star-battle"].includes(k);
const read = (q: string) => readContext(new URLSearchParams(q), isKind);
const names = { kindName: (k: string) => ({ akari: "Akari", sudoku: "Sudoku", "star-battle": "Star Battle" })[k] ?? k };

describe("the list in a puzzle's URL", () => {
  it("round-trips every kind of list", () => {
    const lists: ListContext[] = [
      { in: "set", set: "k4t9wq2v7c" },
      { in: "feed" },
      { in: "shelf", shelf: "quick" },
      { in: "profile", handle: "wyatt" },
      browse("akari"),
      browse("akari", { level: 1, quick: true, unsolved: true }),
      browse("all", { q: "lamps", level: 2 }),
      browse("all", { category: "Shading", sort: "top", period: "week" }),
      browse("sudoku", { sort: "top" }),
    ];
    for (const c of lists) expect(read(contextQuery(c).slice(1))).toEqual(c);
  });

  it("writes only what isn't the default", () => {
    expect(contextQuery(browse("akari"))).toBe("?in=akari");
    expect(contextQuery(browse("akari", { sort: "top" }))).toBe("?in=akari&sort=top");
    expect(contextQuery(browse("akari", { sort: "top", period: "all" }))).toBe("?in=akari&sort=top&period=all");
    expect(contextQuery(browse("all", { q: "lamps", level: 1 }))).toBe("?in=all&q=lamps&level=1");
    expect(inList("abc", { in: "profile", handle: "wyatt" })).toBe("/g/abc?in=%40wyatt");
    expect(inList("abc", null)).toBe("/g/abc");
  });

  it("refuses what it doesn't know", () => {
    expect(read("")).toBeNull();
    expect(read("in=nonsense")).toBeNull();
    expect(read("in=@Not A Handle")).toBeNull();
    expect(read("set=../x")).toBeNull();
    // unknown values fall back to the page's defaults
    expect(read("in=akari&level=7&sort=best&period=year")).toEqual(browse("akari"));
    // a category only goes with every type
    expect(read("in=akari&category=Shading")).toEqual(browse("akari"));
  });

  it("says where you are", () => {
    expect(contextLabel(browse("all", { q: "lamps", level: 1 }), names)).toEqual({ icon: "search", text: "Search: lamps · Easy · Newest" });
    expect(contextLabel(browse("akari", { level: 1, quick: true }), names)).toEqual({ icon: "type", text: "Akari · Easy · Quick · Newest" });
    expect(contextLabel(browse("all", { category: "Shading", sort: "top", period: "week" }), names).text).toBe("All puzzles · Shading · Top this week");
    expect(contextLabel({ in: "profile", handle: "wyatt" }, { ...names, who: "Wyatt" }).text).toBe("Wyatt");
    expect(contextLabel({ in: "feed" }, names).text).toBe("Subscriptions");
    expect(contextLabel({ in: "shelf", shelf: "today" }, names).text).toBe("Today");
    expect(contextLabel({ in: "set", set: "x" }, { ...names, setTitle: "Akari for beginners" }).text).toBe("Akari for beginners");
  });
});
