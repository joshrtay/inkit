// Lets a research script import the site's pure modules (app/app/lib/import-link.ts, the puzz.link
// reader): the site's path aliases ("~site/" is src/, "~/" is app/app/) and its extensionless
// imports, resolved for Node. Import this first, then the site's module with a dynamic import (so
// the root type-check, which doesn't know the aliases, doesn't follow it):
//
//   await import("./app-resolve.mjs");
//   const { readPuzzlinkSpec } = await import(siteModule);
import { existsSync } from "node:fs";
import { register } from "node:module";

const repo = new URL("../../", import.meta.url);
const ALIASES = [["~site/", new URL("src/", repo)], ["~/", new URL("app/app/", repo)]];

export async function resolve(spec, ctx, next) {
  for (const [prefix, base] of ALIASES) if (spec.startsWith(prefix)) spec = new URL(spec.slice(prefix.length), base).href;
  const isFile = spec.startsWith("file:") || ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:"));
  if (isFile && !/\.[cm]?[jt]sx?$|\.json$/.test(spec)) {
    const url = new URL(spec, ctx.parentURL);
    for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(new URL(url.href + ext))) return next(url.href + ext, ctx);
  }
  return next(spec, ctx);
}

// the site's TypeScript uses syntax Node's type stripping refuses (parameter properties): its
// modules are transformed instead
const app = new URL("app/", repo).href;
export async function load(url, ctx, next) {
  if (!url.startsWith(app) || !/\.tsx?$/.test(url)) return next(url, ctx);
  const { stripTypeScriptTypes } = await import("node:module");
  const source = String((await next(url, { ...ctx, format: "module" })).source);
  return { format: "module", source: stripTypeScriptTypes(source, { mode: "transform", sourceUrl: url }), shortCircuit: true };
}

if (!import.meta.url.endsWith("?hooks")) register(import.meta.url + "?hooks");
