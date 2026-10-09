// Paint, as a game's editor (/g/<id>/draw; docs/creation-flow.md, "v3 layout"): the sketchpad with a
// puzzle type. The drawing is the puzzle: the converter (sketchpad/to-puzzle.ts) reads it as the type
// chosen, on every change, and the solver checks it live.
//
// Each part of the screen answers one question:
// - the top bar, what is this puzzle: back, Type ▾ (which opens the drawer at Types) and the save
//   state (no title: it's named on the publish step); then undo, redo and … (Sketchpad's), the
//   verdict as the Check button (which opens This puzzle) and Publish, enabled when the verdict
//   passes. With no type, Check and Publish are greyed and, clicked, bounce Type and turn the drawer
//   to Types with "Choose a type first".
// - the tool rail and the palette (Sketchpad), how do I make it: the type's tools (All tools for the
//   rest), the grid in the type's look.
// - the paper: the drawing, its problems' marks, and the selected one's tip.
// - the drawer on the right, is it right and what are the rules: This puzzle (the photo and its
//   doubts, then the rules as a checklist with each broken one's problems and its settings on it,
//   the solution line, Your drawing, the solution) and Types (search, What type is this?, the list,
//   each type's guide). It collapses to a strip; on a phone it's a bottom sheet.
// - drafts save themselves (games.drawing; this browser's copy until the server has it). Only drafts:
//   a published puzzle can't be changed (routes/game-draw.tsx sends it to its page).
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
import { areasOf, convert, withAreas, type Settings } from "~/sketchpad/to-puzzle";
import { checkList, differences, doubtHighlight, highlight, marksSvg, passes, solutionSvg, verdictOf, verdictStory, verdictWords, type CheckItem } from "~/sketchpad/check";
import { checklist, type ChecklistLine, type RuleLine } from "~/sketchpad/checklist";
import { doubtPlace, type Doubt } from "~/games/doubts";
import { Sketchpad, type SketchpadHandle } from "./Sketchpad";
import { MoreSettings, RuleSettings, settingRules } from "./PaintRules";
import { TypePicker } from "./TypePicker";
import { SpIcon } from "./SketchpadIcons";
import { useSolved } from "./useSolved";
import { ReadingScreen } from "./ReadingScreen";

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

/** A draft read from a photo: the photo, Claude's doubts (games/doubts.ts) and the type it was read as. */
export interface PaintPhoto { src: string; doubts: Doubt[]; readAs: string }

/** A doubt's letter on the paper and in the list (Check's items are numbered). */
const letter = (i: number) => String.fromCharCode(65 + (i % 26));

/** Whether the drawer is folded to its strip, in this browser. */
const DRAWER_KEY = "inkit:paint-drawer";
const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

export function Paint({ game, saved, fresh = false, backTo, admin = false, photo = null, choices = [], opened = false, ruleLines = {} }: {
  game: { id: string; title: string };
  /** the drawing was made from the game's sketch just now (a game from before paint): it's saved at once */
  fresh?: boolean;
  /** each type's rules in its guide's words (src/guides/guides.ts), for This puzzle's checklist */
  ruleLines?: Record<string, RuleLine[]>;
  saved: PaintSave | null;
  backTo: string;
  admin?: boolean;
  photo?: PaintPhoto | null;
  /** the types a photo's reading could be, best first (What type is this? answers with them) */
  choices?: string[];
  /** just read from a photo: the drawer opens at This puzzle, with the photo first */
  opened?: boolean;
}) {
  const pad = useRef<SketchpadHandle | null>(null);
  const navigate = useNavigate();
  const saver = useFetcher<{ ok?: boolean; error?: string }>();
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  // ---- what's being made: the drawing, its type and settings, the title ----
  const [start, setStart] = useState<{ drawing: m.Drawing; key: number }>({ drawing: saved?.drawing ?? m.EMPTY, key: 0 });
  const [drawing, setDrawing] = useState<m.Drawing>(start.drawing);
  const [genre, setGenre] = useState<GenreName | null>(saved?.genre ?? null);
  const [settings, setSettings] = useState<Settings>(saved?.settings ?? {});
  const [title, setTitle] = useState(game.title);   // named on the publish page; kept with this browser's copy
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
  const [server, setServer] = useState(() => (fresh ? "" : JSON.stringify({ drawing: start.drawing, genre: saved?.genre ?? null, settings: saved?.settings ?? {} }) + game.title));
  const current = body + title;
  const dirty = ready && current !== server;
  const reader = useFetcher<{ ok?: boolean; error?: string; reread?: boolean }>();   // the photo, read again
  useEffect(() => {
    if (!ready || reader.state !== "idle") return;
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

  // ---- the drawer: This puzzle or Types; open, or folded to its strip (on a phone: a bottom sheet, closed) ----
  const [drawer, setDrawer] = useState<{ open: boolean; tab: "puzzle" | "types" }>({ open: true, tab: (saved?.genre || opened ? "puzzle" : "types") });
  const [about, setAbout] = useState<string | null>(null);   // a type's guide, shown in Types
  const [ask, setAsk] = useState(0);                         // What type is this?, asked from the reminder
  useEffect(() => {
    if (isPhone()) setDrawer((d) => ({ ...d, open: false }));
    else try { if (localStorage.getItem(DRAWER_KEY) === "folded") setDrawer((d) => ({ ...d, open: false })); } catch { /* open */ }
  }, []);
  const openDrawer = (tab: "puzzle" | "types") => setDrawer({ open: true, tab });
  const foldDrawer = (open: boolean) => {
    setDrawer((d) => ({ ...d, open }));
    if (!isPhone()) try { localStorage.setItem(DRAWER_KEY, open ? "open" : "folded"); } catch { /* this page only */ }
  };

  // ---- the type ----
  const kit = genre ? kitFor(genre) : null;
  const typeName = genre ? kindName(genre) : "";
  const [touched, setTouched] = useState(false);   // the type was chosen here, not read from the photo
  const [reminder, setReminder] = useState(false);
  const [hops, setHops] = useState(0);   // the Type button's bounce, restarted each time
  // Check pressed: until then (and again after the type changes) the solver waits and nothing is
  // marked on the paper but a photo's doubts: choosing a type is often well before it's a puzzle
  const [checked, setChecked] = useState(false);
  /** A type chosen (a ✓, or Use … on its guide): its tools, stamps and rules. The drawer stays where
   *  it is, and nothing is checked until Check. */
  const chooseType = (next: GenreName | null) => {
    setReminder(false);
    if (next === genre) return;
    setTouched(true);
    setChecked(false);
    // settings that mean the same in the new type are kept; the grid takes the new type's look
    if (next) {
      const keep = (settings.rules ?? []).filter((r) => (genres[next].rules as { rule: string }[]).some((p) => p.rule === r.rule));
      setSettings(keep.length ? { ...settings, rules: keep } : (({ rules: _r, ...rest }) => rest)(settings));
      const look = kitFor(next)?.look;
      if (look) pad.current?.edit((d) => (d.grid && m.lookOf(d.grid) !== look ? m.setGrid(d, m.setLook(d.grid, look)) : d));
    }
    setGenre(next);
  };
  /** Check or Publish with no type: Type bounces, and Types opens with the reminder at its top. */
  const needType = () => { setReminder(true); setHops((n) => n + 1); setAbout(null); openDrawer("types"); };

  // the Areas tool: squares dragged into an area, its borders redrawn (types with areas)
  const areaTool = useMemo(() => (genre && kit?.tools.includes("region")
    ? { of: (d: m.Drawing) => areasOf(d, genre, settings), set: (d: m.Drawing, a: string[]) => withAreas(d, a, genre) } : null), [genre, kit, settings]);

  // ---- the puzzle, and the verdict ----
  const conv = useMemo(() => (genre ? convert(drawing, genre, settings) : null), [drawing, genre, settings]);
  const key = conv?.spec ? JSON.stringify(conv.spec) : "";
  const solvable = !!conv?.spec && !conv.problems.some((p) => p.kind === "rule" || p.kind === "incomplete" || p.kind === "unsupported");
  const solved = useSolved(solvable && checked ? conv!.spec : null, key);
  const verdict = verdictOf(genre, conv, key, solved, checked);
  const words = verdictWords(verdict);
  const puzzle = useMemo<Puzzle | null>(() => { try { return conv?.spec ? makePuzzle(conv.spec, { unfinished: true }) : null; } catch { return null; } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const boards = solved && solved.key === key && "boards" in solved ? solved.boards : [];
  const diffs = useMemo(() => (verdict.kind === "several" && puzzle && boards.length > 1 ? differences(puzzle, boards[0], boards[1]) : []), [verdict.kind, puzzle, boards]);
  const digits = puzzle?.marks.includes("digit") && puzzle.digits ? `${symbolOf(puzzle, 1)} to ${symbolOf(puzzle, puzzle.digits)}` : undefined;
  // the problems (rules broken, what doesn't fit): none before Check
  const list = useMemo(() => (checked ? checkList(conv, { digits, differences: diffs }) : []), [checked, conv, digits, diffs]);

  // ---- what's selected on the paper ----
  const [selected, setSelected] = useState<number | null>(null);
  const [onBoard, setOnBoard] = useState(false);   // the solution drawn on the board, while it's pointed at
  const chosen = list.find((x) => x.n === selected) ?? null;
  useEffect(() => { if (selected !== null && !chosen) setSelected(null); }, [selected, chosen]);
  /** The Check button: the solver runs (and keeps running as it changes), This puzzle opens at the
   *  first broken rule. */
  const [aim, setAim] = useState(false);   // point at the first problem once the list is in
  const check = () => {
    if (!genre) { needType(); return; }
    setChecked(true);
    openDrawer("puzzle");
    setDoubtSel(null);
    setAim(true);
  };
  useEffect(() => {
    if (!aim || !checked) return;
    setAim(false);
    const first = list.find((x) => x.kind === "rule" || x.kind === "difference");
    if (first && selected === null) setSelected(first.n);
  }, [aim, checked, list]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => { if (list.length) setSelected(((chosen?.n ?? 0) % list.length) + 1); };
  /** A problem or doubt picked in the drawer: marked on the paper (on a phone the sheet makes way). */
  const pick = (n: number | null, doubt: number | null) => {
    setSelected(n); setDoubtSel(doubt);
    if ((n !== null || doubt !== null) && isPhone()) setDrawer((d) => ({ ...d, open: false }));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected(null); setDoubtSel(null); setReminder(false); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  // Publish: the draft's own game page (/g/<id>/publish), once the server has the latest drawing
  const [publishing, setPublishing] = useState(false);
  const [publishOnceChecked, setPublishOnceChecked] = useState(false);
  const publish = () => {
    if (!genre) { needType(); return; }
    // not checked yet: check, then go on if it passes (else This puzzle shows why)
    if (!checked) { setChecked(true); setPublishOnceChecked(true); return; }
    if (!passes(verdict)) { check(); return; }
    if (dirty && saver.state === "idle") save();
    setPublishing(true);
  };
  useEffect(() => {
    if (!publishOnceChecked || verdict.kind === "checking" || verdict.kind === "unchecked") return;
    setPublishOnceChecked(false);
    publish();
  }, [publishOnceChecked, verdict.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (publishing && !dirty && saver.state === "idle") navigate(`/g/${game.id}/publish`);
    if (publishing && failed) setPublishing(false);
  }, [publishing, dirty, saver.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the photo, and what Claude wasn't sure of (amber, lettered) ----
  const [doubtSel, setDoubtSel] = useState<number | null>(null);
  const [done, setDone] = useState<boolean[]>(() => (photo?.doubts ?? []).map((x) => !!x.done));
  const ticker = useFetcher();
  const tick = (i: number, v: boolean) => {
    setDone((d) => d.map((x, k) => (k === i ? v : x)));
    if (v && doubtSel === i) setDoubtSel(null);
    ticker.submit({ intent: "doubt", index: String(i), done: v ? "1" : "0" }, { method: "post" });
  };
  const doubts = photo?.doubts ?? [];
  const doubtLights = useMemo(() => doubts.map((x) => doubtHighlight(drawing, x)), [doubts, drawing]);
  const openDoubts = doubts.filter((_, i) => !done[i]).length;

  // ---- on the paper: the marks, the selected one's tip, the solution ----
  const g = drawing.grid;
  const box = genre && (genre === "sudoku" || genre === "thermo-sudoku") && g && g.rows === g.cols && !g.shape
    ? ((settings.rules ?? []).find((r) => r.rule === "boxes")?.box as [number, number] | undefined) ?? standardBox(g.cols) : null;
  const underlay = g && box && box[0] > 1 && box[1] > 1 && g.cols % box[1] === 0 && g.rows % box[0] === 0 ? boxLines(g, box) : "";
  const lights = useMemo(() => list.map((x) => ({ x, h: highlight(drawing, x) })), [list, drawing]);
  const overlay = (onBoard && puzzle && boards[0] && g ? solutionSvg(puzzle, boards[0], g) : "")
    + `<g class="sp-marks-all${chosen || doubtSel !== null ? " has-selection" : ""}">${lights.map(({ x, h }) => marksSvg(h, x.kind === "rule" || x.kind === "difference" ? "error" : "misfit", x.n, x.n === chosen?.n, x.values)).join("")}`
    + doubtLights.map((h, i) => (done[i] ? "" : marksSvg(h, "doubt", letter(i), doubtSel === i))).join("") + "</g>";
  const chosenLight = chosen ? lights.find((l) => l.x.n === chosen.n)?.h : null;
  const doubtLight = doubtSel !== null && !chosen ? doubtLights[doubtSel] : null;
  const tip = doubtLight?.tip && doubtSel !== null ? {
    at: doubtLight.tip, box: doubtLight.bounds,
    node: (
      <div className="paint-tip doubt">
        <button type="button" className="paint-tip-x" aria-label="Close" onClick={() => setDoubtSel(null)}>×</button>
        <strong>Claude wasn&rsquo;t sure</strong>
        <p>{doubts[doubtSel].text}</p>
        <div className="paint-tip-foot"><span>{letter(doubtSel)} of {doubts.length}</span>
          <button type="button" className="btn" onClick={() => tick(doubtSel, true)}>It&rsquo;s right</button></div>
      </div>
    ),
  } : chosen && chosenLight?.tip ? {
    at: chosenLight.tip, box: chosenLight.bounds,
    node: <TipBody item={chosen} count={list.length} onNext={next} onClose={() => setSelected(null)}
      onErase={chosen.kind === "misfit" && chosen.items.length ? () => { pad.current?.edit((d) => m.remove(d, chosen.items)); setSelected(null); } : undefined} />,
  } : null;

  // ---- This puzzle: the checklist ----
  const story = verdictStory(verdict, genre);
  const tone = words.tone;
  const mark = tone === "ok" ? "✓" : tone === "bad" ? "✕" : tone === "wait" ? "…" : "";
  const lines = useMemo(() => (genre ? checklist(genre, ruleLines[genre] ?? [], conv?.spec ?? null, list, verdict) : null), [genre, ruleLines, conv, list, verdict]);
  const size: [number, number] | null = g ? [g.rows, g.cols] : null;
  const settingNames = genre ? settingRules(genre, size) : [];
  const placed = new Set<string>();
  const settingsOn = (l: ChecklistLine) => {
    const here = settingNames.filter((r) => l.checks.includes(r) && !placed.has(r));
    here.forEach((r) => placed.add(r));
    return here.length && genre ? <RuleSettings genre={genre} settings={settings} size={size} onChange={setSettings} rules={here} /> : null;
  };
  const solution = (verdict.kind === "one" || verdict.kind === "solvable") && puzzle && boards[0] ? pictureSvg(puzzle, boards[0], "A solution") : "";
  const problem = (x: CheckItem) => (
    <li key={x.n}>
      <button type="button" className={`paint-prob ${x.kind}`} aria-pressed={chosen?.n === x.n} onClick={() => pick(chosen?.n === x.n ? null : x.n, null)}>
        <span className="paint-n" aria-hidden="true">{x.n}</span>
        <span className="paint-text">{x.text}</span>
        <span className="paint-go">{x.place}</span>
      </button>
    </li>
  );
  const line = (l: ChecklistLine, k: number) => (
    <li key={k} className={`paint-line ${l.mark}`} data-mark={l.mark}>
      <span className="paint-st" aria-label={l.mark === "ok" ? "Holds" : l.mark === "bad" ? "Broken" : l.mark === "wait" ? "Checking" : "Not yet"}>
        {l.mark === "ok" ? "✓" : l.mark === "bad" ? "✕" : l.mark === "wait" ? "…" : "–"}</span>
      <span className="paint-line-text">{l.text}{l.note && <small>{l.note}</small>}</span>
      {(settingNames.length > 0 || l.items.length > 0) && <div className="paint-line-more">
        {settingsOn(l)}
        {l.items.length > 0 && <ol className="paint-probs">{l.items.map(problem)}</ol>}
      </div>}
    </li>
  );
  const photoCard = photo && (
    <section className="paint-photo" aria-label="Your photo">
      <div className="paint-photo-card">
        <a href={photo.src} target="_blank" rel="noreferrer" className="paint-photo-img"><img src={photo.src} alt="Your photo of the puzzle" /></a>
        <span><b>From your photo</b><span className="muted">{photo.readAs ? `Claude read it as ${kindName(photo.readAs)}` : "Claude read it"}{g ? `, ${g.rows} × ${g.cols}` : ""}. Check what it wasn&rsquo;t sure of against the paper.</span></span>
      </div>
      <h3 className="paint-h3">To check<span>{doubts.length ? `${doubts.length - openDoubts} of ${doubts.length} checked` : "nothing"}</span></h3>
      {doubts.length ? (
        <ol className="paint-doubts">{doubts.map((x, i) => (
          <li key={i} className={done[i] ? "done" : ""}>
            <button type="button" className="paint-prob doubt" aria-pressed={doubtSel === i} disabled={done[i]}
              onClick={() => pick(null, doubtSel === i ? null : i)}>
              <span className="paint-n" aria-hidden="true">{letter(i)}</span>
              <span className="paint-text">{x.text}<small>{doubtPlace(x) || "The whole puzzle"}</small></span>
            </button>
            <label className="paint-tick" title="Checked: it matches your drawing"><input type="checkbox" checked={done[i]} onChange={(e) => tick(i, e.target.checked)} /><span className="visually-hidden">Checked</span></label>
          </li>
        ))}</ol>
      ) : <p className="paint-quiet">Claude read everything clearly.</p>}
      <TellClaude reader={reader} onSend={() => { try { localStorage.removeItem(bufferKey(game.id)); } catch { /* none kept */ } }} />
    </section>
  );
  const thisPuzzle = (
    <div className="paint-puzzle">
      {photoCard}
      {!genre ? <>
        <header className="paint-head"><h2>No type yet</h2></header>
        <p className="paint-sub">{verdictStory(verdict, null).text}</p>
        <button type="button" className="btn primary paint-choose" onClick={() => openDrawer("types")}>Choose a type</button>
      </> : <>
        <header className="paint-head">
          <h2>{typeName}{size && <small> · {size[0]} × {size[1]}</small>}</h2>
          <span className={`paint-pill ${tone}`} role="status" data-verdict={verdict.kind}>{mark && <>{mark} </>}{verdict.kind === "unchecked" ? "Not checked yet" : words.text}</span>
        </header>
        <p className="paint-sub">{story.text}</p>
        {verdict.kind === "unchecked" && <button type="button" className="btn primary paint-choose" onClick={check}>Check</button>}
        {lines && <>
          <h3 className="paint-h3">Rules<span>{lines.broken ? `${lines.broken} of ${lines.rules.length} broken` : genre === "panel" ? "for the symbols you used" : ""}</span></h3>
          <ol className="paint-checklist" aria-label="Rules">{lines.rules.map(line)}</ol>
          {settingNames.some((r) => !placed.has(r)) && (
            <div className="paint-settings"><RuleSettings genre={genre} settings={settings} size={size} onChange={setSettings} rules={settingNames.filter((r) => !placed.has(r))} /></div>
          )}
          <h3 className="paint-h3">Your drawing</h3>
          <ol className="paint-checklist" aria-label="Your drawing">{line(lines.drawing, 0)}</ol>
        </>}
        {solution && (
          <section className="paint-sol" aria-label="A solution">
            <h3 className="paint-h3">{verdict.kind === "one" ? "The solution" : "A solution"}</h3>
            <div className="grid-game paint-solution" tabIndex={0} aria-label="Point at it to draw it on the board"
              onPointerEnter={() => setOnBoard(true)} onPointerLeave={() => setOnBoard(false)} onFocus={() => setOnBoard(true)} onBlur={() => setOnBoard(false)}
              onClick={() => setOnBoard((v) => !v)} dangerouslySetInnerHTML={{ __html: solution }} />
            <p className="paint-quiet">Pointing at it draws it on the board.</p>
          </section>
        )}
        <MoreSettings genre={genre} settings={settings} size={size} onChange={setSettings} admin={admin} />
        <footer className="paint-foot">
          <button type="button" className="paint-link" onClick={() => { setAbout(genre); openDrawer("types"); }}><SpIcon name="guide" />More about {typeName}</button>
          <span className="muted">{size ? `Size ${size[0]} × ${size[1]}, from the grid` : "Draw a grid"}</span>
        </footer>
      </>}
    </div>
  );
  const reminderBox = reminder && !genre && (
    <div className="paint-reminder" role="alert" aria-labelledby="paint-reminder-h">
      <span className="paint-reminder-ic" aria-hidden="true">!</span>
      <span><strong id="paint-reminder-h">Choose a type first</strong>
        <span>Check and Publish need to know what kind of puzzle this is: its rules decide what counts as a solution.</span>
        <button type="button" className="btn" onClick={() => setAsk((n) => n + 1)}>What type is this?</button></span>
    </div>
  );
  const types = (
    <TypePicker current={genre} onChoose={chooseType} ask={ask} drawing={drawing} settings={settings} choices={choices}
      about={about} onAbout={setAbout} top={reminderBox} />
  );

  // ---- the drawer, or its strip ----
  const toCheck = (lines?.drawing.items.length ?? 0) + openDoubts;
  const brokenWords = !genre ? "no type yet" : lines?.broken ? `${lines.broken} broken rule${lines.broken === 1 ? "" : "s"}` : words.text;
  const drawerNode = <>
    {drawer.open ? (
      <aside className="paint-drawer" aria-label="This puzzle and types">
        <div className="paint-tabs" role="tablist" aria-label="Drawer">
          <button type="button" role="tab" id="paint-tab-puzzle" aria-controls="paint-tabpanel" aria-selected={drawer.tab === "puzzle"} className="paint-tab" onClick={() => openDrawer("puzzle")}>
            <SpIcon name="checklist" />This puzzle{genre && tone !== "none" && <span className={`paint-dot ${tone}`} aria-hidden="true" />}</button>
          <button type="button" role="tab" id="paint-tab-types" aria-controls="paint-tabpanel" aria-selected={drawer.tab === "types"} className="paint-tab" onClick={() => openDrawer("types")}>
            <SpIcon name="types" />Types</button>
          <span className="paint-tabs-grow" />
          <button type="button" className="sp-btn paint-drawer-fold" aria-label="Collapse the drawer" onClick={() => foldDrawer(false)}><SpIcon name="unfold" /></button>
          <button type="button" className="sp-btn paint-drawer-close" aria-label="Close" onClick={() => foldDrawer(false)}><SpIcon name="close" /></button>
        </div>
        <div className="paint-drawer-body" role="tabpanel" id="paint-tabpanel" aria-labelledby={drawer.tab === "puzzle" ? "paint-tab-puzzle" : "paint-tab-types"}>
          {drawer.tab === "puzzle" ? thisPuzzle : types}
        </div>
      </aside>
    ) : (
      <nav className="paint-strip" aria-label="This puzzle and types, folded" data-tip-side="left">
        <button type="button" className="sp-btn" aria-label="Open the drawer" data-tip="Open" onClick={() => foldDrawer(true)}><SpIcon name="fold" /></button>
        <span className="paint-strip-sep" />
        <button type="button" className="sp-btn" aria-label={`This puzzle: ${words.text}`} data-tip="This puzzle" onClick={() => openDrawer("puzzle")}>
          <SpIcon name="checklist" />{genre && tone !== "none" && <span className={`paint-badge ${tone}`}>{tone === "ok" ? "✓" : tone === "bad" ? "✕" : "…"}</span>}</button>
        {toCheck > 0 && <button type="button" className="sp-btn" aria-label={`${toCheck} to check`} data-tip="To check" onClick={() => openDrawer("puzzle")}>
          <SpIcon name="warn" /><span className="paint-badge warn">{toCheck}</span></button>}
        <span className="paint-strip-sep" />
        <button type="button" className="sp-btn" aria-label="Types" data-tip="Types" onClick={() => { setAbout(null); openDrawer("types"); }}><SpIcon name="types" /></button>
        {genre && <button type="button" className="sp-btn" aria-label={`More about ${typeName}`} data-tip={`About ${typeName}`} onClick={() => { setAbout(genre); openDrawer("types"); }}><SpIcon name="guide" /></button>}
      </nav>
    )}
    {/* a phone: the sheet's handle above the palette, and the scrim behind the open sheet */}
    {!drawer.open && (
      <button type="button" className="paint-sheet-handle" onClick={() => (genre ? check() : openDrawer("types"))}>
        <SpIcon name="checklist" /><span>This puzzle · <b className={tone}>{brokenWords}</b></span>
      </button>
    )}
    {drawer.open && <div className="paint-scrim" aria-hidden="true" onClick={() => foldDrawer(false)} />}
  </>;

  return (
    // data-puzzle: the puzzle as converted, for the browser tests' round trip (tests/e2e/parity.spec.ts)
    <div className="studio sp-studio paint" data-puzzle={key}>
      <header className="studio-top">
        <div className="studio-left">
          <Link className="studio-back" to={backTo} aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
          <button key={hops} type="button" className={`paint-type${genre ? "" : " unset"}${hops ? " bounce" : ""}${reminder && !genre ? " ringed" : ""}`}
            aria-expanded={drawer.open && drawer.tab === "types"} aria-controls="paint-tabpanel" onClick={() => { setAbout(null); openDrawer("types"); }}>
            <span className="paint-type-label">Type:</span><span className="paint-type-name">{genre ? typeName : "Not set"}</span>
            {photo && genre && genre === photo.readAs && !touched && <span className="paint-type-from">· from the photo</span>}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <span className={`paint-saved${saveState === "Saved" ? " ok" : failed ? " bad" : ""}`} aria-live="polite">{saveState}</span>
        </div>
        <div className="studio-actions">
          <span ref={setSlot} className="sp-doc-slot" />
          <button type="button" className={`paint-verdict-btn ${tone}`} aria-disabled={!genre || undefined} aria-pressed={drawer.open && drawer.tab === "puzzle"} onClick={check}
            data-verdict={verdict.kind} title={genre ? "This puzzle: its rules, and whether it has one solution" : "Choose a type first"}>
            <span className="paint-verdict-mark" aria-hidden="true">{mark || "✓"}</span>{words.text}</button>
          <button type="button" className="btn primary paint-publish" aria-disabled={!genre || (checked && !passes(verdict)) || undefined} aria-busy={publishing || publishOnceChecked || undefined} onClick={publish}
            title={!genre ? "Choose a type first" : !checked ? "Checks it, then on to name it, play it and publish it" : passes(verdict) ? "Name it, play it, and publish it" : "Publishing needs the verdict to pass"}>Publish</button>
        </div>
      </header>
      {ready && (
        <Sketchpad key={start.key} handle={pad} initial={start.drawing} onChange={setDrawing} actions={slot}
          kit={kit} typeName={typeName} underlay={underlay} overlay={overlay} tip={tip} drawer={drawerNode} areas={areaTool}
          onPaper={() => setReminder(false)} filename={`${(title || "puzzle").replace(/[^\w-]+/g, "-").toLowerCase()}.png`} />
      )}
      {saver.data?.error && <p className="sp-error" role="alert">{saver.data.error}</p>}
      {reader.data?.error && reader.state === "idle" && <p className="sp-error" role="alert">{reader.data.error}</p>}
      {reader.state !== "idle" && photo && <ReadingScreen image={photo.src} />}
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

/** Asking Claude to read the photo again, saying what's wrong: the new reading replaces the drawing. */
function TellClaude({ reader, onSend }: { reader: ReturnType<typeof useFetcher<{ ok?: boolean; error?: string; reread?: boolean }>>; onSend: () => void }) {
  const [open, setOpen] = useState(false);
  // the browser tests' own reading (games.server.ts: development only), as /new sends it
  const [given, setGiven] = useState("");
  useEffect(() => { setGiven((window as { __inkitGivenReading?: string }).__inkitGivenReading ?? ""); }, [open]);
  if (!open) return <button type="button" className="paint-link" onClick={() => setOpen(true)}>Tell Claude what&rsquo;s wrong</button>;
  return (
    <reader.Form method="post" className="paint-tell" onSubmit={() => { onSend(); setOpen(false); }}>
      {given && <input type="hidden" name="given-reading" value={given} />}
      <label><span className="paint-label">What&rsquo;s wrong?</span>
        <textarea name="feedback" rows={3} required maxLength={2000} autoFocus placeholder={'"It\'s 6 rows, not 5"'} /></label>
      <span className="paint-quiet">Claude reads your photo again with this. Its reading replaces the drawing here.</span>
      <span className="paint-tell-acts">
        <button className="btn primary" name="intent" value="reread">Read it again</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </span>
    </reader.Form>
  );
}
