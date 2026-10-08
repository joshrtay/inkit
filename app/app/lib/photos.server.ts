// Uploaded photos of sketches, made fit to keep. A photo can show more than the puzzle (a desk, a
// room, a face), so only the puzzle is kept: the photo is turned upright and stripped of its
// metadata (location included) first, Claude reads that, says where the puzzle is in it, and the
// photo is cropped to that before it is stored. Cloudflare Images does the work (the IMAGES binding).

/** Where the puzzle is in a photo: its edges as fractions of the width and height. */
export interface Bounds { left: number; top: number; right: number; bottom: number }

/** A photo ready to read and keep. */
export interface Photo { bytes: Uint8Array; type: "image/jpeg"; width: number; height: number }

const LONGEST = 2400;   // plenty for Claude (it reads at a smaller size) and for the editor
const MARGIN = 0.03;    // around the puzzle, as a share of the photo, in case its edges were read tight

const streamOf = (bytes: Uint8Array) => new Response(bytes as Uint8Array<ArrayBuffer>).body!;

async function jpeg(env: Env, bytes: Uint8Array, transform: ImageTransform): Promise<Photo> {
  const out = await env.IMAGES.input(streamOf(bytes)).transform(transform).output({ format: "image/jpeg", quality: 88 });
  const result = new Uint8Array(await out.response().arrayBuffer());
  const info = await env.IMAGES.info(streamOf(result));
  if (!("width" in info)) throw new Error("not a photo");
  return { bytes: result, type: "image/jpeg", width: info.width, height: info.height };
}

/** Upright (as the camera held it), no bigger than it needs to be, a JPEG, and without metadata. */
export const prepare = (env: Env, bytes: Uint8Array) =>
  jpeg(env, bytes, { width: LONGEST, height: LONGEST, fit: "scale-down" });

/** The puzzle's part of the photo, with a little margin. The whole photo if the bounds make no
 *  sense, or if the puzzle fills it anyway. */
export async function cropTo(env: Env, photo: Photo, b: Bounds): Promise<Photo> {
  if (!(b.right - b.left > 0.05 && b.bottom - b.top > 0.05)) return photo;   // not a puzzle's size
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const left = clamp(b.left - MARGIN), right = clamp(b.right + MARGIN), top = clamp(b.top - MARGIN), bottom = clamp(b.bottom + MARGIN);
  if (left === 0 && top === 0 && right === 1 && bottom === 1) return photo;
  const px = (f: number, of: number) => Math.round(f * of);
  return jpeg(env, photo.bytes, { trim: {
    left: px(left, photo.width), top: px(top, photo.height),
    right: px(1 - right, photo.width), bottom: px(1 - bottom, photo.height),
  } });
}
