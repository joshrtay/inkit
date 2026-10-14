// Lets a script under puzzles/ import the app's pure modules (app/app/lib/import-link.ts, the
// puzz.link reader) as plain Node: the app's import aliases (~site/ for src/, ~/ for app/app/) and
// its extensionless relative imports, resolved the way Vite would, and its TypeScript transformed
// rather than stripped. Import this first.
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = new URL("../../../", import.meta.url).pathname;
// TypeScript's own transpiler (a dev dependency): Node's type stripping refuses parameter properties
const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
const withExt = (path: string) => [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`].find((p) => existsSync(p) && !p.endsWith("/")) ?? path;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("~site/")) return next(pathToFileURL(withExt(`${repo}src/${specifier.slice(6)}`)).href, context);
    if (specifier.startsWith("~/")) return next(pathToFileURL(withExt(`${repo}app/app/${specifier.slice(2)}`)).href, context);
    if (specifier.startsWith(".") && context.parentURL?.includes("/app/app/") && !/\.[a-z]+$/.test(specifier)) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      return next(pathToFileURL(withExt(base)).href, context);
    }
    return next(specifier, context);
  },
  // the app's TypeScript uses syntax plain type-stripping refuses (parameter properties): transform it
  load(url, context, next) {
    if (url.includes("/app/app/") && url.endsWith(".ts")) {
      const code = readFileSync(fileURLToPath(url), "utf8");
      const js = ts.transpileModule(code, { fileName: url, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
      return { format: "module", source: js, shortCircuit: true };
    }
    return next(url, context);
  },
});
