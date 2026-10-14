// Lets plain Node import the site's pure modules from app/app (the link importers, kinds): maps
// the Vite aliases "~site/" (src/) and "~/" (app/app/), and finds extensionless relative imports'
// .ts files. Use: node --import ./puzzles/difficulty/sources/app-alias.ts <script>.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../../../", import.meta.url);
const site = new URL("src/", root).href;
const app = new URL("app/app/", root).href;

registerHooks({
  resolve(specifier, context, next) {
    let s = specifier;
    if (s.startsWith("~site/")) s = site + s.slice(6);
    else if (s.startsWith("~/")) s = app + s.slice(2);
    else if ((s.startsWith("./") || s.startsWith("../")) && context.parentURL) s = new URL(s, context.parentURL).href;
    if (s.startsWith("file:") && !/\.[cm]?[jt]sx?$/.test(s)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(s + ext))) { s = s + ext; break; }
      }
    }
    return next(s.startsWith("file:") ? pathToFileURL(fileURLToPath(s)).href : s, context);
  },
});
