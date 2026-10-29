// The deduction solver in the creator's browser (the publish page: app/games/hint-solve.client.ts),
// in a Web Worker so the page stays live while it works: finds the puzzle's stuck points for its
// hint ladder (stuck.ts), taking the creator's own moves where it can't go on by itself.
//   in   { spec, creator?: [layer, index, value][] (the creator's board marks, in the order they
//          made them), budgetMs? }
//   out  { kind: "progress", share } … then { kind: "done", stuck } or { kind: "error", message }
import factory from "../../node_modules/clingo-wasm/dist/clingo.js";
import wasm from "../../node_modules/clingo-wasm/dist/clingo.wasm?url";
import type { GridSpec } from "../../src/engine/types.ts";

// the solver reads its switches from process.env (all off here)
(globalThis as { process?: unknown }).process ??= { env: {} };

self.onmessage = async (e: MessageEvent<{ spec: GridSpec; creator?: [string, number, number][]; budgetMs?: number }>) => {
  try {
    const { useClingoFactory } = await import("../difficulty/clingo.ts");
    useClingoFactory(factory as never, wasm);
    const { markOfBoard, stuckPoints } = await import("./stuck.ts");
    const creator = (e.data.creator ?? []).map(([layer, i, v]) => markOfBoard(e.data.spec, layer, i, v)).filter((m): m is string => !!m);
    const stuck = await stuckPoints(e.data.spec, {
      creator, budgetMs: e.data.budgetMs ?? 90_000,
      onProgress: (share) => self.postMessage({ kind: "progress", share }),
    });
    self.postMessage({ kind: "done", stuck });
  } catch (err) {
    self.postMessage({ kind: "error", message: (err as Error).message ?? String(err) });
  }
};
