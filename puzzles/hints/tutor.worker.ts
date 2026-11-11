// The tutor's read of the player's board (tutor.ts), in a Web Worker in the player's browser
// (app/games/tutor.client.ts): the solver is too heavy for the page's own thread or a Worker request.
//   in   { spec, board, budgetMs? }
//   out  { kind: "done", read } or { kind: "error", message }
import factory from "../../node_modules/clingo-wasm/dist/clingo.js";
import wasm from "../../node_modules/clingo-wasm/dist/clingo.wasm?url";
import type { GridSpec } from "../../src/engine/types.ts";
import type { BoardLike } from "../../src/lib/tutor.ts";

// the solver reads its switches from process.env (all off here)
(globalThis as { process?: unknown }).process ??= { env: {} };

self.onmessage = async (e: MessageEvent<{ spec: GridSpec; board: BoardLike; budgetMs?: number }>) => {
  try {
    const { useClingoFactory } = await import("../difficulty/clingo.ts");
    useClingoFactory(factory as never, wasm);
    const { readBoard } = await import("./tutor.ts");
    self.postMessage({ kind: "done", read: await readBoard(e.data.spec, e.data.board, { budgetMs: e.data.budgetMs }) });
  } catch (err) {
    self.postMessage({ kind: "error", message: (err as Error).message ?? String(err) });
  }
};
