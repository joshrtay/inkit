// What Vite gives the browser worker (solve.worker.ts): a file's address, and clingo's browser build.
declare module "*?url" { const url: string; export default url; }
declare module "../../node_modules/clingo-wasm/dist/clingo.js" { const factory: (opts: object) => Promise<unknown>; export default factory; }
