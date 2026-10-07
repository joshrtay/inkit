// A game's editor: a page of its own, after Substack's post editor. Along the top: back, whether
// it's saved, the puzzle type, then whether it has one solution, Preview and Publish. Under that,
// the type's tools; then the puzzle itself, edited in place. The drawing it was read from sits in
// the left margin and Claude's doubts in the right, as a checklist pinned to their cells. Undo and
// Reset sit in the bottom-left corner.
//
// Drafts save themselves as you go; a published game changes only when you press Update (and only
// to a puzzle with one solution). Types with their own on-puzzle tools use BoardEditor; the rest
// use the generic PuzzleEditor until they get theirs.
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import { looseSpec, parseSketch, specToSketch } from "~/games/sketch";
import { layoutOf } from "~/games/layout-of";
import { doubtPlace, type Doubt } from "~/games/doubts";
import { KIND_NAMES, kindName } from "~/games/kinds";
import type { GridSpec } from "~site/engine/types.ts";
import { GameBoard } from "./GameBoard";
import { PuzzleEditor } from "./PuzzleEditor";
import { BoardEditor, hasBoardEditor } from "./BoardEditor";
import { useLiveCheck } from "./useOneSolutionCheck";
import { Select } from "./Select";

export interface EditorGame {
  id: string; title: string; description: string; sketch: string; state: "draft" | "published" | "hidden"; hiddenNote: string | null;
}
export interface EditorRights { edit: boolean; hide: boolean; takeDown: boolean; feature: boolean }

export function GameEditor({ game, reading, drawing, doubts, choices, may, featured, backTo, error }: {
  game: EditorGame;
  /** Claude's latest reading of the drawing (what Reset goes back to) */
  reading: string | null;
  /** the game was made from an uploaded drawing */
  drawing: boolean;
  doubts: Doubt[];
  /** the game types Claude thought the drawing could be, best first */
  choices: string[];
  may: EditorRights;
  featured: boolean;
  backTo: string;
  error?: string;
}) {
  const saver = useFetcher<{ error?: string; done?: string }>();
  const reader = useFetcher<{ error?: string; done?: string }>();
  const ticker = useFetcher();
  const isDraft = game.state === "draft";

  // the working copy, with undo
  const [sketch, setSketchNow] = useState(game.sketch);
  const [history, setHistory] = useState<string[]>([]);
  const setSketch = (next: string, continuing = false) => {
    if (next === sketch) return;
    if (!continuing) setHistory((h) => [...h.slice(-99), sketch]);
    setSketchNow(next);
  };
  const undo = () => { const last = history.at(-1); if (last === undefined) return; setHistory((h) => h.slice(0, -1)); setSketchNow(last); };
  const resetTo = reading ?? game.sketch;

  // a new reading replaces the working copy
  const wasReading = useRef(false);
  useEffect(() => {
    if (reader.state !== "idle") { wasReading.current = true; return; }
    if (wasReading.current && reader.data?.done === "reread") { setHistory((h) => [...h, sketch]); setSketchNow(game.sketch); }
    wasReading.current = false;
  }, [reader.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => parseSketch(sketch), [sketch]);
  const play = useMemo(() => (parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null), [parsed]);
  const loose = useMemo(() => looseSpec(sketch), [sketch]);
  const check = useLiveCheck(sketch, play?.spec ?? null, parsed.ok ? "" : parsed.errors[0]);
  const genre = loose?.genre;
  const onBoard = hasBoardEditor(genre);

  // the title and description, written above the puzzle
  const [title, setTitle] = useState(game.title);
  const [description, setDescription] = useState(game.description);

  // drafts save themselves a moment after each change
  const unsaved = sketch !== game.sketch || title !== game.title || description !== game.description;
  useEffect(() => {
    if (!isDraft || !unsaved || !may.edit || !parsed.ok) return;
    const t = setTimeout(() => {
      saver.submit({ intent: "save", stay: "1", sketch, title: title.trim() || "Untitled", description }, { method: "post" });
    }, 1200);
    return () => clearTimeout(t);
  }, [sketch, title, description, isDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveStatus = !isDraft ? (unsaved ? "Not updated yet" : game.state === "hidden" ? "Taken down" : "Published")
    : saver.state !== "idle" ? "Saving…" : saver.data?.error ? "Couldn't save" : unsaved ? (parsed.ok ? "Unsaved" : "Can't save yet") : "Saved";

  // cmd/ctrl-Z undoes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPanel(null); setMenu(false); }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z" && !(e.target as Element).closest("input, textarea")) { e.preventDefault(); undo(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  // Claude's doubts, ticked off one at a time
  const [ticked, setTicked] = useState(() => doubts.map((d) => !!d.done));
  useEffect(() => setTicked(doubts.map((d) => !!d.done)), [doubts]);
  const [hover, setHover] = useState<number | null>(null);
  const tick = (i: number, done: boolean) => {
    setTicked((t) => t.map((v, j) => (j === i ? done : v)));
    if (may.edit) ticker.submit({ intent: "doubt", index: String(i), done: done ? "1" : "0" }, { method: "post" });
  };
  const open = doubts.filter((_, i) => !ticked[i]).length;

  const [tools, setTools] = useState<HTMLElement | null>(null);
  const [flash, setFlash] = useState(0);
  const [panel, setPanel] = useState<"preview" | "publish" | "drawing" | null>(null);
  const [menu, setMenu] = useState(false);
  const hasMore = game.state === "published" ? may.edit || may.takeDown || may.feature : game.state === "hidden" && may.hide;
  const rereading = reader.state !== "idle";
  const rereadKind = rereading ? String(reader.formData?.get("kind") ?? "") : "";
  const problem = saver.data?.error || reader.data?.error || error;

  const changeType = (kind: string) => {
    if (!drawing || !isDraft) return false;
    const ok = confirm(`Read your drawing again as ${kindName(kind)}?\n\nClaude looks at it again, told which type it is. This takes up to a minute and replaces the puzzle here.`);
    if (ok) reader.submit({ intent: "reread", kind }, { method: "post" });
    return ok;
  };

  return (
    <div className="studio">
      <header className="studio-top">
        <div className="studio-left">
          <Link className="studio-back" to={backTo} aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
          <span className={`save-pill${saveStatus === "Saved" || saveStatus === "Published" ? " ok" : ""}`} aria-live="polite">{saveStatus}</span>
        </div>
        <div className="studio-actions">
          <button type="button" className={`check-chip ${check.state}`} title={check.state === "broken" ? check.text : check.state === "many" ? "Show the cells the clues can't pin down" : undefined}
            onClick={() => check.state === "many" && setFlash((n) => n + 1)}>
            {check.state === "one" ? "✓ " : check.state === "checking" ? "" : "✕ "}{check.state === "broken" ? "Can't be played" : check.text}
          </button>
          <button type="button" className="btn" disabled={!play} onClick={() => setPanel("preview")}>Preview</button>
          {may.edit && (isDraft
            ? <button type="button" className="btn primary" onClick={() => setPanel("publish")}>Publish</button>
            : game.state === "published" && <button type="button" className="btn primary" disabled={!unsaved} onClick={() => setPanel("publish")}>Update</button>)}
          {hasMore && <div className="studio-more">
            <button type="button" className="btn icon" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
            {menu && (
              <div className="menu" role="menu">
                {may.edit && game.state === "published" && (
                  <Form method="post"><button role="menuitem" name="intent" value="unpublish">Back to draft</button></Form>
                )}
                {may.takeDown && game.state === "published" && (
                  <Form method="post" onSubmit={(e) => {
                    const note = prompt("Why is it being taken down? Its author sees this note.");
                    if (!note) { e.preventDefault(); return; }
                    (e.currentTarget.elements.namedItem("note") as HTMLInputElement).value = note;
                  }}><input type="hidden" name="note" /><button role="menuitem" name="intent" value="hide">Take down…</button></Form>
                )}
                {may.hide && game.state === "hidden" && (
                  <Form method="post"><button role="menuitem" name="intent" value="unhide">Restore</button></Form>
                )}
                {may.feature && game.state === "published" && (
                  <Form method="post"><button role="menuitem" name="intent" value={featured ? "unfeature" : "feature"}>{featured ? "Remove from Featured" : "Add to Featured"}</button></Form>
                )}
              </div>
            )}
          </div>}
        </div>
      </header>
      <div className="studio-tools">
        <div className="studio-type">
          {genre && drawing && isDraft && may.edit ? (
            <Select key={genre} name="kind" label="Puzzle type" defaultValue={genre} disabled={rereading}
              options={typeOptions(choices, genre)} onChange={changeType} />
          ) : <strong>{genre ? kindName(genre) : "Puzzle"}</strong>}
        </div>
        <span className="tool-sep" aria-hidden="true" />
        <div className="studio-tools-slot" ref={setTools} />
      </div>

      {game.state === "hidden" && <p className="studio-banner">Taken down: {game.hiddenNote}</p>}
      {problem && <p className="studio-banner error" role="alert">{problem}</p>}
      {rereading && <p className="studio-banner" role="status">Reading your drawing again{rereadKind ? ` as ${kindName(rereadKind)}` : ""}… (up to a minute)</p>}

      <main className={`studio-canvas${drawing ? " with-drawing" : ""}${doubts.length || (drawing && isDraft) ? " with-doubts" : ""}`}>
        {drawing && (
          <button type="button" className="drawing-thumb" onClick={() => setPanel("drawing")} aria-label="Your drawing (enlarge)">
            <img src={`/g/${game.id}/sketch`} alt="" />
            <span>Your drawing</span>
          </button>
        )}

        <div className="studio-title">
          <input aria-label="Title" placeholder="Title" maxLength={120} value={title} readOnly={!may.edit}
            onChange={(e) => setTitle(e.target.value)} onFocus={(e) => title === "Untitled" && e.currentTarget.select()} />
          <textarea aria-label="Description" placeholder="Add a description…" rows={1} maxLength={2000} value={description} readOnly={!may.edit}
            onChange={(e) => setDescription(e.target.value)}
            onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }} />
        </div>

        <div className={`studio-board${rereading ? " busy" : ""}`}>
          {onBoard && loose ? (
            <BoardEditor spec={loose} tools={tools} ambiguous={check.state === "many"} flash={flash}
              onChange={(s: GridSpec, continuing?: boolean) => setSketch(specToSketch(s), continuing)}
              pins={doubts.flatMap((d, i) => (ticked[i] ? [] : [{ n: i + 1, row: d.row, col: d.col, active: hover === i }]))} />
          ) : loose ? (
            <PuzzleEditor spec={loose} onChange={(s) => setSketch(specToSketch(s))} />
          ) : (
            <div className="problems"><p>This puzzle can&rsquo;t be played yet:</p><ul>{(parsed.ok ? [] : parsed.errors).map((p) => <li key={p}>{p}</li>)}</ul></div>
          )}
        </div>

        {(doubts.length > 0 || (drawing && isDraft && may.edit)) && (
          <aside className="doubts" aria-label="Claude wasn't sure about">
            {doubts.length > 0 && (
              <>
                <h2>Claude wasn&rsquo;t sure <span className="muted">{doubts.length - open} of {doubts.length} checked</span></h2>
                <ul>
                  {doubts.map((d, i) => (
                    <li key={i} className={ticked[i] ? "done" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                      <label>
                        <input type="checkbox" checked={ticked[i]} onChange={(e) => tick(i, e.target.checked)} />
                        <span><b>{i + 1}{doubtPlace(d) && ` · ${doubtPlace(d)}`}</b> {d.text}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {drawing && isDraft && may.edit && <TellClaude reader={reader} />}
          </aside>
        )}
      </main>

      <div className="studio-corner">
        <button type="button" className="btn" disabled={!history.length} onClick={undo} title="Undo (⌘Z)">↶ Undo</button>
        <button type="button" className="btn" disabled={sketch === resetTo} onClick={() => {
          if (confirm(reading ? "Go back to Claude's reading? You can undo this." : "Go back to the saved puzzle? You can undo this.")) setSketch(resetTo);
        }}>Reset</button>
      </div>

      {panel && (
        <div className="studio-dialog" role="dialog" aria-modal="true" aria-label={panel === "preview" ? "Preview" : panel === "drawing" ? "Your drawing" : "Publish"}
          onClick={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
          <div className={`studio-sheet ${panel}`}>
            <button type="button" className="pane-close" aria-label="Close" onClick={() => setPanel(null)}>×</button>
            {panel === "drawing" && <img className="drawing-full" src={`/g/${game.id}/sketch`} alt="Your hand-drawn sketch" />}
            {panel === "preview" && play && (
              <>
                <h2>{title || "Untitled"}</h2>
                <GameBoard play={play} />
              </>
            )}
            {panel === "publish" && (
              <Form method="post" className="form">
                <h2>{isDraft ? "Publish" : "Update"}</h2>
                <input type="hidden" name="sketch" value={sketch} />
                <input type="hidden" name="checked" value={check.hash} />
                <input type="hidden" name="title" value={title.trim()} />
                <input type="hidden" name="description" value={description} />
                <p className="publish-what"><strong>{title.trim() || "Untitled"}</strong>{description && <span className="muted">{description}</span>}</p>
                {!title.trim() && <p className="error">Give it a title first (at the top of the page).</p>}
                {check.state !== "one" && <p className="error">{check.state === "checking" ? "Still checking for one solution…" : `It needs exactly one solution first (${check.state === "broken" ? check.text : check.text.toLowerCase()}).`}</p>}
                {open > 0 && <p className="muted">{open === 1 ? "One of Claude's doubts isn't" : `${open} of Claude's doubts aren't`} checked yet.</p>}
                <div className="editor-actions">
                  <button className="btn primary" name="intent" value="publish" disabled={check.state !== "one" || !title.trim()}>{isDraft ? "Publish" : "Update"}</button>
                  {isDraft && <><input type="hidden" name="stay" value="1" /><button className="btn" name="intent" value="save">Save draft</button></>}
                </div>
              </Form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Asking Claude to read the drawing again, saying what's wrong. */
function TellClaude({ reader }: { reader: ReturnType<typeof useFetcher<{ error?: string; done?: string }>> }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="link" onClick={() => setOpen(true)}>Tell Claude what&rsquo;s wrong</button>;
  return (
    <reader.Form method="post" className="form tell" onSubmit={() => setOpen(false)}>
      <label>What&rsquo;s wrong?
        <textarea name="feedback" rows={3} required maxLength={2000} autoFocus placeholder={'"It\'s 6 rows, not 5"'} />
      </label>
      <span className="hint">Claude reads your drawing again with this. It replaces the puzzle here.</span>
      <div className="editor-actions">
        <button className="btn primary" name="intent" value="reread">Read it again</button>
        <button className="link" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </reader.Form>
  );
}

/** The type menu: the types Claude thought it could be first, then the rest by name. */
function typeOptions(choices: string[], current: string) {
  const likely = [...new Set([current, ...choices])];
  const rest = Object.keys(KIND_NAMES).filter((k) => !likely.includes(k)).sort((a, b) => kindName(a).localeCompare(kindName(b)));
  return [...likely.map((k) => ({ value: k, label: kindName(k), hint: k === current ? undefined : "could be" })), ...rest.map((k) => ({ value: k, label: kindName(k) }))];
}
