// The one-solution check for a sketch, run in this browser with clingo (count-solutions.client.ts).
// `checked` is the sketch's hash once it passed: the form sends it so the server lets the game be
// published. It clears as soon as the sketch changes.
import { useState } from "react";
import type { GridSpec } from "~site/engine/types.ts";

async function hash(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function useOneSolutionCheck(sketch: string, spec: GridSpec | null) {
  const [check, setCheck] = useState<{ sketch: string; text: string; ok: boolean; hash?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const current = check && check.sketch === sketch ? check : null;
  async function run() {
    if (!spec) return;
    setChecking(true);
    try {
      const { countSolutions } = await import("~/games/count-solutions.client");
      const r = await countSolutions(spec);
      if ("error" in r) setCheck({ sketch, text: r.error, ok: false });
      else if (r.solutions === 1) setCheck({ sketch, text: "Exactly one solution.", ok: true, hash: await hash(sketch) });
      else setCheck({ sketch, text: r.solutions === 0 ? "No solution: the clues contradict each other." : "More than one solution: add clues until only one fits.", ok: false });
    } finally { setChecking(false); }
  }
  return { run, checking, result: current, stale: !!check && !current, checked: current?.ok ? current.hash! : "" };
}
