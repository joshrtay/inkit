// After Claude reads a drawing: 1) the creator compares the reading with their drawing and either
// confirms it, fixes it themselves in the visual editor, or tells Claude what's wrong (it reads
// the drawing again); 2) then the one-solution check, and publish. Editing the sketch text
// directly stays available underneath.
import { useEffect, useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { looseSpec, parseSketch, specToSketch } from "~/games/sketch";
import { layoutOf } from "~/games/layout-of";
import { GameBoard } from "./GameBoard";
import { GivensEditor } from "./GivensEditor";
import { useOneSolutionCheck } from "./SketchEditor";

export function ConfirmDrawing({ gameId, title, description, sketch: saved, notes, error }: {
  gameId: string; title: string; description: string; sketch: string; notes: string[]; error?: string;
}) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const rereading = busy && nav.formData?.get("intent") === "reread";
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<"compare" | "edit" | "tell">("compare");
  // the working copy: starts as the saved reading, changed by the visual editor
  const [sketch, setSketch] = useState(saved);
  useEffect(() => setSketch(saved), [saved]);   // a new reading from Claude replaces it
  const edited = sketch !== saved;
  const parsed = useMemo(() => parseSketch(sketch), [sketch]);
  const play = useMemo(() => (parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null), [parsed]);
  const problems = parsed.ok ? [] : parsed.errors;
  const loose = useMemo(() => looseSpec(sketch), [sketch]);
  const check = useOneSolutionCheck(sketch, play?.spec ?? null);

  return (
    <div className="confirm">
      <ol className="steps">
        <li className="done">Upload</li>
        <li className={confirmed ? "done" : "now"}>Confirm the reading</li>
        <li className={confirmed ? (check.checked ? "done" : "now") : ""}>One solution</li>
        <li className={check.checked ? "now" : ""}>Publish</li>
      </ol>

      <section className="compare">
        <figure>
          <figcaption>Your drawing</figcaption>
          <img src={`/g/${gameId}/sketch`} alt="The hand-drawn sketch" />
        </figure>
        <figure>
          <figcaption>{mode === "edit" ? "Fix the clues" : edited ? "Your corrected version" : "How Claude read it"}</figcaption>
          {mode === "edit" && loose ? (
            <GivensEditor spec={loose} onChange={(s) => setSketch(specToSketch(s))} />
          ) : play ? <GameBoard play={play} /> : <div className="problems"><p>This reading can't be played yet:</p><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
          {mode === "edit" && (
            <>
              {problems.length > 0 && <p className="error">{problems[0]}</p>}
              <p className="editor-actions">
                <button className="btn primary" type="button" onClick={() => setMode("compare")}>Done fixing</button>
                <button className="link" type="button" onClick={() => { setSketch(saved); setMode("compare"); }}>Undo my changes</button>
              </p>
            </>
          )}
        </figure>
      </section>

      {notes.length > 0 && (
        <section className="notes">
          <h2>Claude wasn&rsquo;t sure about</h2>
          <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {!confirmed && mode !== "edit" && (
        <section className="decide">
          <h2>Does it match your drawing?</h2>
          <p className="muted">Check the grid size and every clue: rocks, numbers, walls, symbols.</p>
          <div className="editor-actions">
            <button className="btn primary" type="button" disabled={!play || busy} onClick={() => setConfirmed(true)}>Yes, it matches</button>
            <button className="btn" type="button" disabled={busy || !loose} onClick={() => setMode("edit")}>Fix it myself</button>
            <button className="btn" type="button" disabled={busy} onClick={() => setMode("tell")}>Tell Claude what&rsquo;s wrong</button>
          </div>
          {edited && (
            <Form method="post" className="inline-form">
              <input type="hidden" name="sketch" value={sketch} />
              <input type="hidden" name="title" value={title} />
              <input type="hidden" name="description" value={description} />
              <input type="hidden" name="stay" value="1" />
              <span className="muted">You&rsquo;ve changed the reading.</span>
              <button className="btn" name="intent" value="save" disabled={busy || !play}>Save my changes</button>
            </Form>
          )}
          {mode === "tell" && (
            <Form method="post" className="form">
              <label>What&rsquo;s wrong?
                <textarea name="feedback" rows={3} required maxLength={2000}
                  placeholder={'e.g. "It\'s 6 rows, not 5" or "the rock in row 2 is in column 4"'} />
              </label>
              <span className="hint">Claude reads the drawing again, more carefully, with your corrections.{edited ? " This replaces your own changes." : ""}</span>
              <button className="btn primary" name="intent" value="reread" disabled={busy}>
                {rereading ? "Reading it again… (up to a minute)" : "Read it again"}
              </button>
            </Form>
          )}
        </section>
      )}

      {confirmed && (
        <Form method="post" className="form publish-step">
          <h2>Check it has exactly one solution</h2>
          <input type="hidden" name="sketch" value={sketch} />
          <input type="hidden" name="checked" value={check.checked} />
          <label>Title<input name="title" required maxLength={120} defaultValue={title} /></label>
          <label>Description<textarea name="description" rows={2} maxLength={2000} defaultValue={description} /></label>
          <div className="check-row">
            <button className="btn" type="button" onClick={check.run} disabled={check.checking}>{check.checking ? "Checking…" : "Check"}</button>
            {check.result && <span className={check.result.ok ? "good" : "error"}>{check.result.text}</span>}
          </div>
          {check.result && !check.result.ok && (
            <p className="muted">If the puzzle needs another clue, go <button className="link" type="button" onClick={() => { setConfirmed(false); setMode("edit"); }}>back and add it</button>.</p>
          )}
          <div className="editor-actions">
            <button className="btn" name="intent" value="save" disabled={busy}>Save draft</button>
            <button className="btn primary" name="intent" value="publish" disabled={busy || !check.checked}
              title={check.checked ? undefined : "Check the puzzle first"}>Publish</button>
            <button className="link" type="button" onClick={() => setConfirmed(false)}>Back to comparing</button>
          </div>
        </Form>
      )}
    </div>
  );
}
