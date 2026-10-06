// The game editor: title, description and sketch, with a live preview of the puzzle and a
// Check that proves it has exactly one solution (in this browser, with clingo). Publishing
// needs that check to have passed for the sketch as it is now.
import { useEffect, useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { parseSketch } from "~/games/sketch";
import { layoutOf } from "~/games/layout-of";
import { EXAMPLES } from "~/games/examples";
import { kindName } from "~/games/kinds";
import { GameBoard } from "./GameBoard";

interface Target { id: string; title: string; personal: boolean }

async function hash(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SketchEditor({ initial, targets, error, children, saveLabel = "Save draft", showPublish = true }: {
  initial: { title: string; description: string; sketch: string; collection?: string };
  /** where a new game can go (new games only) */
  targets?: Target[];
  error?: string;
  /** extra buttons (the edit page's state changes) */
  children?: React.ReactNode;
  saveLabel?: string;
  /** a published game has no Publish button: Save keeps it published (after a Check, if the sketch changed) */
  showPublish?: boolean;
}) {
  const busy = useNavigation().state !== "idle";
  const [sketch, setSketch] = useState(initial.sketch);
  const [settled, setSettled] = useState(initial.sketch);   // the sketch after typing pauses
  useEffect(() => { const t = setTimeout(() => setSettled(sketch), 350); return () => clearTimeout(t); }, [sketch]);

  const parsed = useMemo(() => parseSketch(settled), [settled]);
  const play = useMemo(() => (parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null), [parsed]);

  // the one-solution check, for exactly the sketch it ran on
  const [check, setCheck] = useState<{ sketch: string; text: string; ok: boolean; hash?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const checked = check?.ok && check.sketch === sketch ? check.hash : "";

  async function runCheck() {
    if (!parsed.ok || settled !== sketch) return;
    setChecking(true);
    try {
      const { countSolutions } = await import("~/games/count-solutions.client");
      const r = await countSolutions(parsed.spec);
      if ("error" in r) setCheck({ sketch, text: r.error, ok: false });
      else if (r.solutions === 1) setCheck({ sketch, text: "Exactly one solution. Ready to publish.", ok: true, hash: await hash(sketch) });
      else setCheck({ sketch, text: r.solutions === 0 ? "No solution: the clues contradict each other." : "More than one solution: add clues until only one fits.", ok: false });
    } finally { setChecking(false); }
  }

  return (
    <Form method="post" className="editor">
      <div className="editor-fields">
        {targets && (
          <label>Collection
            <select name="collection" defaultValue={initial.collection}>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.personal ? `${t.title} (yours)` : t.title}</option>)}
            </select>
          </label>
        )}
        <label>Title<input name="title" required maxLength={120} defaultValue={initial.title} /></label>
        <label>Description<textarea name="description" rows={2} maxLength={2000} defaultValue={initial.description} /></label>
        <label>
          <span className="label-row">Sketch
            <select aria-label="Start from an example" value="" onChange={(e) => { if (e.target.value) setSketch(EXAMPLES[e.target.value]); }}>
              <option value="">Start from an example…</option>
              {Object.keys(EXAMPLES).map((k) => <option key={k} value={k}>{kindName(k)}</option>)}
            </select>
          </span>
          <textarea name="sketch" className="sketch" rows={16} spellCheck={false} value={sketch} onChange={(e) => setSketch(e.target.value)} />
          <span className="hint">First line: the game type ({Object.keys(EXAMPLES).join(", ")}), then the puzzle.</span>
        </label>
        <input type="hidden" name="checked" value={checked ?? ""} />

        <div className="check-row">
          <button className="btn" type="button" onClick={runCheck} disabled={!parsed.ok || checking || settled !== sketch}>
            {checking ? "Checking…" : "Check"}
          </button>
          {check && check.sketch === sketch && <span className={check.ok ? "good" : "error"}>{check.text}</span>}
          {check && check.sketch !== sketch && <span className="muted">Changed since the last check.</span>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="editor-actions">
          <button className={showPublish ? "btn" : "btn primary"} type="submit" name="intent" value="save" disabled={busy}>{saveLabel}</button>
          {showPublish && (
            <button className="btn primary" type="submit" name="intent" value="publish" disabled={busy || !checked}
              title={checked ? undefined : "Check the puzzle first"}>Publish</button>
          )}
          {children}
        </div>
      </div>

      <div className="editor-preview">
        {parsed.ok ? (
          <>
            <p className="muted">{parsed.summary}</p>
            {play && <GameBoard play={play} />}
            <ul className="rule-list">{parsed.rules.map((r) => <li key={r}>{r}</li>)}</ul>
          </>
        ) : (
          <div className="problems"><p>The sketch needs fixing:</p><ul>{parsed.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
        )}
      </div>
    </Form>
  );
}
