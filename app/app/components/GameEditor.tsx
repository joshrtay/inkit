// The one editor for a game, on its edit page.
//
// A draft made from a drawing starts by checking Claude's reading against the photo: confirm it,
// edit it on the puzzle itself, or tell Claude what's wrong (it reads the drawing again).
// Then, and for every other game: title and description, editing, the one-solution check,
// and save / publish. The puzzle is only ever shown as the puzzle, never as text.
//
// Types with their own on-puzzle tools (BoardEditor) are edited and checked on the board; the
// rest use the generic editor (PuzzleEditor) until they get theirs.
import { useEffect, useMemo, useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";
import { looseSpec, parseSketch, specToSketch } from "~/games/sketch";
import { layoutOf } from "~/games/layout-of";
import { GameBoard } from "./GameBoard";
import { PuzzleEditor } from "./PuzzleEditor";
import { BoardEditor, hasBoardEditor } from "./BoardEditor";
import { useOneSolutionCheck } from "./useOneSolutionCheck";
import { Select } from "./Select";
import { KIND_NAMES, kindName } from "~/games/kinds";

export function GameEditor({ gameId, title, description, sketch: saved, state, drawing, notes, choices = [], error }: {
  gameId: string; title: string; description: string; sketch: string;
  state: "draft" | "published" | "hidden";
  /** the game was made from an uploaded drawing (shown beside the puzzle) */
  drawing: boolean;
  /** what Claude wasn't sure of when it read the drawing */
  notes: string[];
  /** the game types Claude thought the drawing could be, best first (listed first in the type menu) */
  choices?: string[];
  error?: string;
}) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const rereading = busy && nav.formData?.get("intent") === "reread";
  const rereadKind = rereading ? String(nav.formData?.get("kind") ?? "") : "";
  const submit = useSubmit();
  const reviewing = drawing && state === "draft";          // a fresh reading to confirm first
  const [confirmed, setConfirmed] = useState(!reviewing);
  const [mode, setMode] = useState<"view" | "edit" | "tell">("view");

  // the working copy: starts as the saved puzzle, changed by the visual editor
  const [sketch, setSketch] = useState(saved);
  useEffect(() => setSketch(saved), [saved]);   // a new reading (or a save) replaces it
  const edited = sketch !== saved;
  const parsed = useMemo(() => parseSketch(sketch), [sketch]);
  const play = useMemo(() => (parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null), [parsed]);
  const problems = parsed.ok ? [] : parsed.errors;
  const loose = useMemo(() => looseSpec(sketch), [sketch]);
  const check = useOneSolutionCheck(sketch, play?.spec ?? null);
  // a published game keeps being published only if a changed puzzle passes the check
  const needsCheck = state === "draft" ? false : edited;

  const onBoard = hasBoardEditor(loose?.genre);
  const done = <button className="btn primary" type="button" onClick={() => setMode("view")}>Done</button>;
  const puzzle = onBoard && loose && (mode === "edit" || !confirmed)
    ? <BoardEditor spec={loose} editing={mode === "edit"} onChange={(s) => setSketch(specToSketch(s))} actions={mode === "edit" && done} />
    : mode === "edit" && loose
    ? <PuzzleEditor spec={loose} onChange={(s) => setSketch(specToSketch(s))} />
    : play ? <GameBoard play={play} />
      : <div className="problems"><p>This puzzle can&rsquo;t be played yet:</p><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>;

  return (
    <div className="confirm">
      {reviewing && (
        <ol className="steps">
          <li className="done">Upload</li>
          <li className={confirmed ? "done" : "now"}>Check the reading</li>
          <li className={confirmed ? (check.checked ? "done" : "now") : ""}>One solution</li>
          <li className={check.checked ? "now" : ""}>Publish</li>
        </ol>
      )}

      <section className={drawing ? "compare" : "solo"}>
        {drawing && (
          <figure>
            <figcaption>Your drawing</figcaption>
            <img src={`/g/${gameId}/sketch`} alt="The hand-drawn sketch" />
            {reviewing && notes.length > 0 && (
              <section className="notes">
                <h2>Claude wasn&rsquo;t sure about</h2>
                <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
              </section>
            )}
          </figure>
        )}
        <figure>
          <figcaption>{mode === "edit" ? "Editing" : !reviewing ? "The puzzle" : !confirmed ? (edited ? "Check the reading (your corrected version)" : "Check the reading") : "The puzzle"}</figcaption>
          {(reviewing || edited) && (
            <div className="editor-top">
              {reviewing && loose?.genre ? (
                <Select key={loose.genre} name="kind" label="Puzzle type" defaultValue={loose.genre} disabled={busy}
                  options={typeOptions(choices, loose.genre)} onChange={(kind) => {
                    const ok = confirm(`Read your drawing again as ${kindName(kind)}?\n\nClaude looks at it again, told which type it is. This takes up to a minute${edited ? " and replaces your edits" : ""}.`);
                    if (ok) submit({ intent: "reread", kind }, { method: "post" });
                    return ok;
                  }} />
              ) : <span />}
              {edited && <button className="btn" type="button" disabled={busy} onClick={() => setSketch(saved)}>Reset</button>}
            </div>
          )}
          {rereading && <p className="muted" role="status">Reading your drawing again{rereadKind ? ` as ${kindName(rereadKind)}` : ""}… (up to a minute)</p>}
          {puzzle}
          {mode === "edit" ? (!onBoard &&
            <>
              {problems.length > 0 && <p className="error">{problems[0]}</p>}
              <p className="editor-actions">{done}</p>
            </>
          ) : confirmed && (
            <p className="editor-actions"><button className="btn" type="button" disabled={!loose} onClick={() => setMode("edit")}>Edit</button></p>
          )}
        </figure>
      </section>


      {error && <p className="error" role="alert">{error}</p>}

      {!confirmed && mode !== "edit" && (
        <section className="decide">
          <h2>Does it match your drawing?</h2>
          <p className="muted">Check the grid size and every clue: rocks, numbers, walls, symbols.</p>
          <div className="editor-actions">
            <button className="btn primary" type="button" disabled={!play || busy} onClick={() => setConfirmed(true)}>Yes, it matches</button>
            <button className="btn" type="button" disabled={busy || !loose} onClick={() => setMode("edit")}>Edit it</button>
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

      {confirmed && mode !== "edit" && (
        <Form method="post" className="form publish-step">
          <input type="hidden" name="sketch" value={sketch} />
          <input type="hidden" name="checked" value={check.checked} />
          <label>Title<input name="title" required maxLength={120} defaultValue={title} /></label>
          <label>Description<textarea name="description" rows={2} maxLength={2000} defaultValue={description} /></label>
          <div className="check-row">
            <button className="btn" type="button" onClick={check.run} disabled={check.checking || !play}>{check.checking ? "Checking…" : "Check for one solution"}</button>
            {check.result && <span className={check.result.ok ? "good" : "error"}>{check.result.text}</span>}
          </div>
          {check.result && !check.result.ok && (
            <p className="muted">Use <button className="link" type="button" onClick={() => setMode("edit")}>Edit</button> to add or change clues until only one solution fits.</p>
          )}
          <div className="editor-actions">
            {state === "draft" ? (
              <>
                <button className="btn" name="intent" value="save" disabled={busy || !play}>Save draft</button>
                <button className="btn primary" name="intent" value="publish" disabled={busy || !check.checked}
                  title={check.checked ? undefined : "Check for one solution first"}>Publish</button>
              </>
            ) : (
              <button className="btn primary" name="intent" value="save" disabled={busy || !play || (needsCheck && !check.checked)}
                title={needsCheck && !check.checked ? "You changed the clues: check for one solution first" : undefined}>Save</button>
            )}
            {reviewing && <button className="link" type="button" onClick={() => setConfirmed(false)}>Back to comparing</button>}
          </div>
        </Form>
      )}
    </div>
  );
}

/** The type menu: the types Claude thought it could be first, then the rest by name. */
function typeOptions(choices: string[], current: string) {
  const likely = [...new Set([current, ...choices])];
  const rest = Object.keys(KIND_NAMES).filter((k) => !likely.includes(k)).sort((a, b) => kindName(a).localeCompare(kindName(b)));
  return [...likely.map((k) => ({ value: k, label: kindName(k), hint: k === current ? undefined : "could be" })), ...rest.map((k) => ({ value: k, label: kindName(k) }))];
}
