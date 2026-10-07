// The one-solution check for a sketch, run in this browser with clingo (count-solutions.client.ts),
// a moment after each change. `hash` is the sketch's hash once it passed: the form sends it so the
// server lets the game be published.
import { useEffect, useState } from "react";
import type { GridSpec } from "~site/engine/types.ts";

async function hash(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type CheckState = "checking" | "one" | "none" | "many" | "broken";
export interface Check { state: CheckState; text: string; hash: string }

const TEXT: Record<Exclude<CheckState, "broken">, string> = {
  checking: "Checking…",
  one: "One solution",
  none: "No solution",
  many: "More than one solution",
};

/** `problem`: why the sketch can't be played at all (then there's nothing to check). */
export function useLiveCheck(sketch: string, spec: GridSpec | null, problem = ""): Check {
  const [check, setCheck] = useState<Check & { sketch: string }>({ sketch: "", state: "checking", text: TEXT.checking, hash: "" });
  useEffect(() => {
    if (!spec) return;
    let live = true;
    const t = setTimeout(async () => {
      const { countSolutions } = await import("~/games/count-solutions.client");
      const r = await countSolutions(spec).catch((e: Error) => ({ error: e.message }));
      if (!live) return;
      if ("error" in r) setCheck({ sketch, state: "broken", text: r.error, hash: "" });
      else {
        const state = r.solutions === 1 ? "one" : r.solutions === 0 ? "none" : "many";
        setCheck({ sketch, state, text: TEXT[state], hash: state === "one" ? await hash(sketch) : "" });
      }
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [sketch]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!spec) return { state: "broken", text: problem || "This puzzle can't be played yet.", hash: "" };
  return check.sketch === sketch ? check : { state: "checking", text: TEXT.checking, hash: "" };
}
