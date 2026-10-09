// Where a tooltip, a menu or a tip goes beside its anchor (lib/place.ts): the side asked for, else
// flipped, and slid to stay inside.
import { describe, expect, it } from "vitest";
import { place } from "~/lib/place";

const screen = { x: 0, y: 0, w: 1000, h: 800 };

describe("place", () => {
  it("goes on the side asked for, centred", () => {
    const at = place({ x: 100, y: 100, w: 40, h: 40 }, { w: 60, h: 20 }, screen, "right", { gap: 8 });
    expect(at).toMatchObject({ side: "right", x: 148, y: 110 });
  });
  it("flips when there's no room, and slides to stay on screen", () => {
    const below = place({ x: 900, y: 770, w: 40, h: 20 }, { w: 200, h: 30 }, screen, "bottom", { gap: 6, margin: 6 });
    expect(below.side).toBe("top");
    expect(below.y).toBe(770 - 6 - 30);
    expect(below.x + 200).toBeLessThanOrEqual(994);
    // the arrow still points at the anchor's middle
    expect(below.x + below.arrow).toBe(920);
    const left = place({ x: 2, y: 400, w: 30, h: 30 }, { w: 100, h: 20 }, screen, "left");
    expect(left.side).toBe("right");
  });
  it("lines up with the anchor's end (a menu under its button)", () => {
    const at = place({ x: 500, y: 10, w: 32, h: 32 }, { w: 210, h: 90 }, screen, "bottom", { align: "end", gap: 6 });
    expect(at).toMatchObject({ side: "bottom", x: 532 - 210, y: 48 });
  });
  it("takes the roomiest side when nowhere fits whole", () => {
    const tiny = { x: 0, y: 0, w: 120, h: 100 };
    const at = place({ x: 10, y: 60, w: 20, h: 20 }, { w: 150, h: 70 }, tiny, "bottom");
    expect(at.side).toBe("top");
    expect(at.x).toBeGreaterThanOrEqual(6);
  });
});
