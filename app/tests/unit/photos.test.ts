// Keeping only the puzzle's part of a photo (app/lib/photos.server.ts), against a stand-in for
// Cloudflare Images that records what it was asked to do.
import { describe, expect, it } from "vitest";
import { cropTo, type Photo } from "~/lib/photos.server";

function fakeImages() {
  const asked: ImageTransform[] = [];
  const IMAGES = {
    input: () => ({ transform: (t: ImageTransform) => { asked.push(t); return { output: async () => ({ response: () => new Response(new Uint8Array([1])) }) }; } }),
    info: async () => ({ format: "image/jpeg", fileSize: 1, width: 10, height: 10 }),
  };
  return { env: { IMAGES } as unknown as Env, asked };
}
const photo: Photo = { bytes: new Uint8Array([0]), type: "image/jpeg", width: 1000, height: 800 };

describe("cropTo", () => {
  it("trims each side to the puzzle, with a margin", async () => {
    const { env, asked } = fakeImages();
    await cropTo(env, photo, { left: 0.2, top: 0.25, right: 0.7, bottom: 0.75 });
    expect(asked).toEqual([{ trim: { left: 170, top: 176, right: 270, bottom: 176 } }]);
  });
  it("keeps the margin inside the photo", async () => {
    const { env, asked } = fakeImages();
    await cropTo(env, photo, { left: 0.01, top: 0, right: 0.5, bottom: 1 });
    expect(asked).toEqual([{ trim: { left: 0, top: 0, right: 470, bottom: 0 } }]);
  });
  it("keeps the photo as it is when the puzzle fills it, or the bounds make no sense", async () => {
    for (const b of [{ left: 0, top: 0, right: 1, bottom: 1 }, { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 }, { left: 0.8, top: 0.1, right: 0.2, bottom: 0.9 }]) {
      const { env, asked } = fakeImages();
      expect(await cropTo(env, photo, b)).toBe(photo);
      expect(asked).toEqual([]);
    }
  });
});
