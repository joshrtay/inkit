// Paint, as a game's editor (/g/<id>/draw; docs/creation-flow.md): the sketchpad with a puzzle
// type. The drawing is the puzzle: the converter (sketchpad/to-puzzle.ts) reads it as the type
// chosen, on every change, and the solver checks it live.
//
// One job per place, as the sketchpad's own chrome:
// - the top bar: back, the title (edited in place), the Type button (its picker, any time) and the
//   save state; then undo, redo and clear, How to play (the type's guide), Check and Publish. With
//   no type, Check and Publish look disabled and, clicked, say "Choose a type first" and bounce Type.
// - with a type: the tool rail and stamps are the type's (All tools for the rest), the grid takes
//   the type's look, and the right side gains the type's Rules.
// - the status line: the verdict chip (live; a click is Check).
// - the Check panel, over the workspace's left side (minimised to a tab): the verdict, the solution,
//   and a numbered list of what's wrong; selecting one marks it on the paper with a tip.
// - drafts save themselves (games.drawing; this browser's copy until the server has it).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { genres, makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { standardBox, symbolOf } from "~site/engine/rules.ts";
import type { Puzzle } from "~site/engine/types.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import { kindName } from "~/games/kinds";
import type { PaintSave } from "~/games/paint-save";
import * as m from "~/sketchpad/model";
import { kitFor } from "~/sketchpad/kit";
import { convert, type Settings } from "~/sketchpad/to-puzzle";
import { checkList, differences, highlight, marksSvg, passes, solutionSvg, verdictOf, verdictStory, verdictWords, type CheckItem } from "~/sketchpad/check";
import { Sketchpad, type SketchpadHandle } from "./Sketchpad";
import { GuidePane } from "./GuidePane";
import { PaintRules } from "./PaintRules";
import { TypePicker } from "./TypePicker";
import { useSolved } from "./useSolved";

/** This browser's copy of a draft (docs: "localStorage as the offline buffer"): `dirty` until the server has it. */
interface Buffer extends Omit<PaintSave, "drawing"> { drawing: m.Drawing; title: string; dirty: boolean }
const bufferKey = (id: string) => `inkit:draw:${id}`;
const SAVE_AFTER = 1500;

/** A sudoku's box lines, drawn with its grid (medium, between the boxes). */
function boxLines(g: m.Grid, box: [number, number]): string {
  let out = "";
  const line = (x1: number, y1: number, x2: number, y2: number) => { out += `<line class="sp-pen medium" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; };
  for (let r = box[0]; r < g.rows; r += box[0]) line(g.x, g.y + r * g.S, g.x + g.cols * g.S, g.y + r * g.S);
  for (let c = box[1]; c < g.cols; c += box[1]) line(g.x + c * g.S, g.y, g.x + c * g.S, g.y + g.rows * g.S);
  return out;
}

export function Paint({ game, saved, backTo, admin = false }: {
  game: { id: string; title: string };
  saved: PaintSave | null;
  backTo: string;
  admin?: boolean;
}) {
  const pad = useRef<SketchpadHandle | null>(null);
  const navigate = useNavigate();
  const saver = useFetcher<{ ok?: boolean; error?: string }>();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [guide, setGuide] = useState(false);   // How to play: the type's guide, slid in from the right

  // ---- what's being made: the drawing, its type and settings, the title ----
  const [start, setStart] = useState<{ drawing: m.Drawing; key: number }>({ drawing: saved?.drawing ?? m.EMPTY, key: 0 });
  const [drawing, setDrawing] = useState<m.Drawing>(start.drawing);
  const [genre, setGenre] = useState<GenreName | null>(saved?.genre ?? null);
  const [settings, setSettings] = useState<Settings>(saved?.settings ?? {});
  const [title, setTitle] = useState(game.title);
  const [ready, setReady] = useState(false);

  // this browser's copy wins if the server never got it (a save cut off, offline)
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(bufferKey(game.id)) ?? "null") as Buffer | null;
      const drawingOk = b && m.revive(b.drawing);
      if (b?.dirty && drawingOk) {
        setStart({ drawing: drawingOk, key: 1 }); setDrawing(drawingOk);
        setGenre(b.genre); setSettings(b.settings ?? {}); setTitle(b.title ?? game.title);
      }
    } catch { /* nothing kept */ }
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- saving: this browser at once, the server a moment after the last change ----
  const body = useMemo(() => JSON.stringify({ drawing, genre, settings }), [drawing, genre, settings]);
  const [sent, setSent] = useState<string | null>(null);
  const [server, setServer] = useState(() => JSON.stringify({ drawing: start.drawing, genre: saved?.genre ?? null, settings: saved?.settings ?? {} }) + game.title);
  const current = body + title;
  const dirty = ready && current !== server;
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(bufferKey(game.id), JSON.stringify({ drawing, genre, settings, title, dirty } satisfies Buffer)); } catch { /* private mode */ }
  }, [current, dirty, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    setSent(current);
    saver.submit({ intent: "save", drawing: body, title: title.trim() || "Untitled" }, { method: "post" });
  };
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(save, SAVE_AFTER);
    return () => clearTimeout(t);
  }, [current, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (saver.state === "idle" && saver.data?.ok && sent) { setServer(sent); setSent(null); }
  }, [saver.state, saver.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // leaving with changes unsaved: send them on the way out
  const unsent = useRef({ dirty, body, title });
  unsent.current = { dirty, body, title };
  useEffect(() => {
    const away = () => {
      if (!unsent.current.dirty) return;
      const f = new FormData();
      f.set("intent", "save"); f.set("drawing", unsent.current.body); f.set("title", unsent.current.title.trim() || "Untitled");
      navigator.sendBeacon?.(location.pathname, f);
    };
    addEventListener("pagehide", away);
    return () => removeEventListener("pagehide", away);
  }, []);
  const failed = saver.state === "idle" && !!saver.data && !saver.data.ok;
  const saveState = !ready ? "Saved" : saver.state !== "idle" ? "Saving…" : failed ? (typeof navigator !== "undefined" && !navigator.onLine ? "Offline, saved here" : "Couldn't save") : dirty ? "Saving…" : "Saved";

  // ---- the type ----
  const kit = genre ? kitFor(genre) : null;
  const typeName = genre ? kindName(genre) : "";
  const [picking, setPicking] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [hops, setHops] = useState(0);   // the Type button's bounce, restarted each time
  const chooseType = (next: GenreName | null) => {
    setPicking(false); setReminder(false);
    if (next === genre) return;
    // settings that mean the same in the new type are kept; the grid takes the new type's look
    if (next) {
      const keep = (settings.rules ?? []).filter((r) => (genres[next].rules as { rule: string }[]).some((p) => p.rule === r.rule));
      setSettings(keep.length ? { ...settings, rules: keep } : (({ rules: _r, ...rest }) => rest)(settings));
      const look = kitFor(next)?.look;
      if (look) pad.current?.edit((d) => (d.grid && m.lookOf(d.grid) !== look ? m.setGrid(d, m.setLook(d.grid, look)) : d));
    }
    setGenre(next);
  };
  const needType = () => { setReminder(true); setHops((n) => n + 1); };
  // the reminder closes on the next click elsewhere
  useEffect(() => {
    if (!reminder) return;
    const close = (e: PointerEvent) => { if (!(e.target as Element).closest(".paint-reminder, .paint-type")) setReminder(false); };
    addEventListener("pointerdown", close);
    return () => removeEventListener("pointerdown", close);
  }, [reminder]);

  // ---- the puzzle, and the verdict ----
  const conv = useMemo(() => (genre ? convert(drawing, genre, settings) : null), [drawing, genre, settings]);
  const key = conv?.spec ? JSON.stringify(conv.spec) : "";
  const solvable = !!conv?.spec && !conv.problems.some((p) => p.kind === "rule" || p.kind === "incomplete" || p.kind === "unsupported");
  const solved = useSolved(solvable ? conv!.spec : null, key);
  const verdict = verdictOf(genre, conv, key, solved);
  const words = verdictWords(verdict);
  const puzzle = useMemo<Puzzle | null>(() => { try { return conv?.spec ? makePuzzle(conv.spec, { unfinished: true }) : null; } catch { return null; } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const boards = solved && solved.key === key && "boards" in solved ? solved.boards : [];
  const diffs = useMemo(() => (verdict.kind === "several" && puzzle && boards.length > 1 ? differences(puzzle, boards[0], boards[1]) : []), [verdict.kind, puzzle, boards]);
  const digits = puzzle?.marks.includes("digit") && puzzle.digits ? `${symbolOf(puzzle, 1)} to ${symbolOf(puzzle, puzzle.digits)}` : undefined;
  const list = useMemo(() => checkList(conv, { digits, differences: diffs }), [conv, digits, diffs]);

  // ---- the Check panel and what's selected in it ----
  const [panel, setPanel] = useState<"open" | "min" | "closed">("closed");
  const [selected, setSelected] = useState<number | null>(null);
  const [onBoard, setOnBoard] = useState(false);
  const chosen = list.find((x) => x.n === selected) ?? null;
  useEffect(() => { if (selected !== null && !chosen) setSelected(null); }, [selected, chosen]);
  const check = () => {
    if (!genre) { needType(); return; }
    setPanel("open");
    const first = list.find((x) => x.kind === "rule" || x.kind === "difference");
    if (first && selected === null) setSelected(first.n);
  };
  const next = () => { if (list.length) setSelected(((chosen?.n ?? 0) % list.length) + 1); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected(null); setReminder(false); setPicking(false); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  const publish = () => {
    if (!genre) { needType(); return; }
    if (dirty) save();
    // the publish step (the draft's own game page) comes later: the editor's Publish, for now
    navigate(`/g/${game.id}/edit?publish=1`);
  };

  // ---- on the paper: the marks, the selected one's tip, the solution ----
  const g = drawing.grid;
  const box = genre && (genre === "sudoku" || genre === "thermo-sudoku") && g && g.rows === g.cols && !g.shape
    ? ((settings.rules ?? []).find((r) => r.rule === "boxes")?.box as [number, number] | undefined) ?? standardBox(g.cols) : null;
  const underlay = g && box && box[0] > 1 && box[1] > 1 && g.cols % box[1] === 0 && g.rows % box[0] === 0 ? boxLines(g, box) : "";
  const lights = useMemo(() => list.map((x) => ({ x, h: highlight(drawing, x) })), [list, drawing]);
  const overlay = (onBoard && puzzle && boards[0] && g ? solutionSvg(puzzle, boards[0], g) : "")
    + `<g class="sp-marks-all${chosen ? " has-selection" : ""}">${lights.map(({ x, h }) => marksSvg(h, x.kind === "rule" || x.kind === "difference" ? "error" : "misfit", x.n, x.n === chosen?.n, x.values)).join("")}</g>`;
  const chosenLight = chosen ? lights.find((l) => l.x.n === chosen.n)?.h : null;
  const tip = chosen && chosenLight?.tip ? {
    at: chosenLight.bounds && chosenLight.bounds.y0 < m.PAGE * 0.28 ? { x: chosenLight.tip.x, y: chosenLight.bounds.y1 } : chosenLight.tip,
    below: !!chosenLight.bounds && chosenLight.bounds.y0 < m.PAGE * 0.28,
    node: <TipBody item={chosen} count={list.length} onNext={next} onClose={() => setSelected(null)}
      onErase={chosen.kind === "misfit" && chosen.items.length ? () => { pad.current?.edit((d) => m.remove(d, chosen.items)); setSelected(null); } : undefined} />,
  } : null;

  // ---- the Check panel ----
  const story = verdictStory(verdict, genre);
  const tone = words.tone === "ok" ? "ok" : words.tone === "bad" ? "bad" : "wait";
  const errors = list.filter((x) => x.kind === "rule" || x.kind === "difference"), fixes = list.filter((x) => x.kind === "fix"), misfits = list.filter((x) => x.kind === "misfit");
  const solution = (verdict.kind === "one" || verdict.kind === "solvable") && puzzle && boards[0] ? pictureSvg(puzzle, boards[0], "A solution") : "";
  const row = (x: CheckItem) => (
    <li key={x.n}>
      <button type="button" className={`paint-item ${x.kind}`} aria-pressed={chosen?.n === x.n} onClick={() => setSelected(chosen?.n === x.n ? null : x.n)}>
        <span className="paint-n" aria-hidden="true">{x.n}</span>
        <span><span className="paint-place">{x.place}</span><span className="paint-text">{x.text}</span></span>
      </button>
    </li>
  );
  const panelNode = panel === "closed" ? null : panel === "min" ? (
    <button type="button" className="paint-check-tab" onClick={() => setPanel("open")} aria-label={`Check: ${list.length} to look at`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>Check{list.length > 0 && <span className="paint-count">{list.length}</span>}
    </button>
  ) : (
    <section className="paint-check" aria-label="Check">
      <div className="paint-check-head">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg><strong>Check</strong>
        <button type="button" className="sp-btn" aria-label="Minimise" onClick={() => setPanel("min")}>−</button>
      </div>
      <div className="paint-check-body">
        <div className={`paint-verdict ${tone}`} role="status" data-verdict={verdict.kind}>
          <span className="paint-verdict-mark" aria-hidden="true">{tone === "ok" ? "✓" : tone === "bad" ? "✕" : "…"}</span>
          <span><strong>{story.title}</strong><span>{story.text}</span></span>
        </div>
        {solution && <>
          <div className="grid-game paint-solution" dangerouslySetInnerHTML={{ __html: solution }} />
          <label className="paint-switch"><span>Draw it on the board</span><input type="checkbox" role="switch" checked={onBoard} onChange={(e) => setOnBoard(e.target.checked)} /></label>
        </>}
        {verdict.kind === "several" && diffs.length > 0 && !chosen && (
          <button type="button" className="btn paint-diff" onClick={() => setSelected(errors.find((x) => x.kind === "difference")?.n ?? null)}>Show a difference</button>
        )}
        {errors.length > 0 && <div className="paint-group"><h3>{verdict.kind === "several" ? "Differences" : "Broken rules"}<span>{errors.length}</span></h3><ol>{errors.map(row)}</ol></div>}
        {fixes.length > 0 && <div className="paint-group"><h3>To fix<span>{fixes.length}</span></h3><ol>{fixes.map(row)}</ol></div>}
        <div className="paint-group"><h3>Doesn&rsquo;t fit<span>{misfits.length || "nothing"}</span></h3>
          {misfits.length ? <ol>{misfits.map(row)}</ol> : <p className="paint-quiet">Everything on the page is part of the puzzle.</p>}</div>
      </div>
    </section>
  );

  const chip = (
    <button type="button" className={`paint-chip ${words.tone}`} onClick={check} data-verdict={verdict.kind} title="Check">
      {words.tone === "ok" ? "✓ " : words.tone === "bad" ? "⚠ " : ""}{words.text}
    </button>
  );
  const misfitCount = misfits.length + fixes.length;

  return (
    <div className="studio sp-studio paint">
      <header className="studio-top">
        <div className="studio-left">
          <Link className="studio-back" to={backTo} aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
          <input className="paint-title" aria-label="Title" value={title} maxLength={120} placeholder="Untitled"
            onChange={(e) => setTitle(e.target.value)} onFocus={(e) => title === "Untitled" && e.currentTarget.select()} size={Math.max(6, Math.min(28, title.length + 1))} />
          <div className="paint-type-wrap">
            <button key={hops} type="button" className={`paint-type${genre ? "" : " unset"}${hops ? " bounce" : ""}${reminder ? " ringed" : ""}`}
              aria-haspopup="dialog" aria-expanded={picking} onClick={() => { setPicking(!picking); setReminder(false); }}>
              <span className="paint-type-label">Type</span><span className="paint-type-name">{genre ? typeName : "Not set"}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {reminder && (
              <div className="paint-reminder" role="alertdialog" aria-labelledby="paint-reminder-h">
                <strong id="paint-reminder-h">Choose a type first</strong>
                <p>Check and Publish need to know what kind of puzzle this is: its rules decide what counts as a solution.</p>
                <button type="button" className="btn primary" onClick={() => { setReminder(false); setPicking(true); }}>Choose a type</button>
              </div>
            )}
            {picking && <TypePicker current={genre} onChoose={chooseType} onClose={() => setPicking(false)} />}
          </div>
          <span className={`paint-saved${saveState === "Saved" ? " ok" : failed ? " bad" : ""}`} aria-live="polite">{saveState}</span>
        </div>
        <div className="studio-actions">
          <span ref={setSlot} className="sp-doc-slot" />
          <button type="button" className="btn rules-toggle sp-head-btn paint-howto" aria-pressed={guide} onClick={() => setGuide(!guide)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z", "M4 21V5", "M8 7h7", "M8 11h5"].map((d) => <path key={d} d={d} />)}</svg>
            <span>{genre ? "How to play" : "Puzzle types"}</span></button>
          <button type="button" className="btn paint-check-btn" aria-label="Check" aria-disabled={!genre || undefined} onClick={check}
            title={genre ? "Check: is it a puzzle, with one solution?" : "Choose a type first"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg><span>Check</span></button>
          <button type="button" className="btn primary paint-publish" aria-disabled={!genre || undefined} onClick={publish}
            title={!genre ? "Choose a type first" : passes(verdict) ? "Publish it" : "Publishing needs the verdict to pass"}>Publish</button>
        </div>
      </header>
      {ready && (
        <Sketchpad key={start.key} handle={pad} initial={start.drawing} storageKey={null} onChange={setDrawing} actions={slot}
          kit={kit} typeName={typeName} underlay={underlay} overlay={overlay} tip={tip} panel={panelNode}
          onPaper={() => setReminder(false)}
          chips={<>{chip}{misfitCount > 0 && <button type="button" className="paint-chip todo" onClick={check}><span className="paint-count">{misfitCount}</span>to check</button>}</>}
          side={genre && <PaintRules genre={genre} settings={settings} size={g ? [g.rows, g.cols] : null} onChange={setSettings} onGuide={() => setGuide(true)} admin={admin} />} />
      )}
      {saver.data?.error && <p className="sp-error" role="alert">{saver.data.error}</p>}
      <GuidePane key={genre ?? "all"} side start={genre ?? undefined} open={guide} onClose={() => setGuide(false)} />
    </div>
  );
}

/** The tip beside a selected item on the paper: what it is, why, and what to do. */
function TipBody({ item, count, onNext, onClose, onErase }: { item: CheckItem; count: number; onNext: () => void; onClose: () => void; onErase?: () => void }) {
  return (
    <div className={`paint-tip ${item.kind}`}>
      <button type="button" className="paint-tip-x" aria-label="Close" onClick={onClose}>×</button>
      <strong>{item.text}</strong>
      <p>{item.tip}</p>
      <div className="paint-tip-foot">
        <span>{item.n} of {count}</span>
        {onErase && <button type="button" className="btn" onClick={onErase}>Erase</button>}
        {count > 1 && <button type="button" className="btn" onClick={onNext}>{item.kind === "difference" ? "Next difference" : "Next"}</button>}
      </div>
    </div>
  );
}
