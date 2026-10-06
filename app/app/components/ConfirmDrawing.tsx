// After Claude reads a drawing: 1) the creator compares the reading with their drawing and either
// confirms it or says what's wrong (Claude reads it again); 2) then the one-solution check, and
// publish. Editing the sketch text directly stays available underneath.
import { useState } from "react";
import { Form, useNavigation } from "react-router";
import type { Playable } from "~/games/layout";
import { GameBoard } from "./GameBoard";
import { useOneSolutionCheck } from "./SketchEditor";

export function ConfirmDrawing({ gameId, title, description, sketch, play, notes, problems, error }: {
  gameId: string; title: string; description: string; sketch: string;
  play: Playable | null; notes: string[]; problems: string[]; error?: string;
}) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const rereading = busy && nav.formData?.get("intent") === "reread";
  const [confirmed, setConfirmed] = useState(false);
  const [fixing, setFixing] = useState(false);
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
          <figcaption>How Claude read it</figcaption>
          {play ? <GameBoard play={play} /> : <div className="problems"><p>This reading can't be played yet:</p><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
        </figure>
      </section>

      {notes.length > 0 && (
        <section className="notes">
          <h2>Claude wasn&rsquo;t sure about</h2>
          <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {!confirmed && (
        <section className="decide">
          <h2>Does it match your drawing?</h2>
          <p className="muted">Check the grid size and every clue: rocks, numbers, walls, symbols.</p>
          <div className="editor-actions">
            <button className="btn primary" type="button" disabled={!play || busy} onClick={() => setConfirmed(true)}>Yes, it matches</button>
            <button className="btn" type="button" disabled={busy} onClick={() => setFixing(true)}>Something&rsquo;s off</button>
          </div>
          {(fixing || !play) && (
            <Form method="post" className="form">
              <label>What&rsquo;s wrong?
                <textarea name="feedback" rows={3} required maxLength={2000}
                  placeholder={'e.g. "It\'s 6 rows, not 5" or "the rock in row 2 is in column 4"'} />
              </label>
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
            <p className="muted">If the drawing itself needs another clue, add it and upload again, or edit the sketch text below.</p>
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
