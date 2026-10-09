// What paint saves for a game (games.drawing, docs/creation-flow.md §1.10): the drawing, its
// puzzle type (or none yet) and its rule settings. The game's sketch is always converted from it
// (sketchpad/to-puzzle.ts), here, on the server as in the browser, so nobody saves a sketch by hand.
// Pure: safe on both sides.
import { GENRE_NAMES, type GenreName } from "~site/engine/puzzle.ts";
import * as m from "~/sketchpad/model";
import { convert, type Conversion, type Settings } from "~/sketchpad/to-puzzle";
import { specToSketch } from "./sketch";

export interface PaintSave { drawing: m.Drawing; genre: GenreName | null; settings: Settings }

/** The most a saved drawing may be, as JSON. */
export const MAX_DRAWING = 400_000;

const isGenre = (g: unknown): g is GenreName => typeof g === "string" && (GENRE_NAMES as string[]).includes(g);

/** A saved drawing read back (from the database or a form), if it's one. */
export function readPaintSave(v: unknown): PaintSave | null {
  if (typeof v === "string") { if (v.length > MAX_DRAWING) return null; try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const drawing = m.revive(o.drawing);
  if (!drawing) return null;
  const s = (o.settings && typeof o.settings === "object" ? o.settings : {}) as Record<string, unknown>;
  const settings: Settings = {
    ...(Array.isArray(s.rules) ? { rules: s.rules as Settings["rules"] } : {}),
    ...(s.style && typeof s.style === "object" ? { style: s.style as Settings["style"] } : {}),
  };
  return { drawing, genre: isGenre(o.genre) ? o.genre : null, settings };
}

/** The game's sketch and type from its drawing: the converter's output; none without a type or a grid. */
export function sketchOf(save: PaintSave): { sketch: string; kind: string; conversion: Conversion | null } {
  if (!save.genre) return { sketch: "", kind: "", conversion: null };
  const conversion = convert(save.drawing, save.genre, save.settings);
  return { sketch: conversion.spec ? specToSketch(conversion.spec) : "", kind: save.genre, conversion };
}
