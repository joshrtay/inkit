// The puzzle's hints, at the top of How to play (src/lib/hint-ladder.ts): one more each time the
// player asks, in order. Stuck points the player has already got past are skipped and folded; once
// every hint at the point they're on is open, the next is the board's own hint (show me). A rule the
// player has been shown often shrinks to its name. Each hint opened is logged with the play, as a
// move is. Its author (and admins) can rewrite the hints here.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  expose, type Exposures, firstOpen, type Ladder, nextHint, nothingShown, readLadder, reveal, type Rung, type Shown, skipped, textFor, type BoardLike,
} from "~site/lib/hint-ladder";
import type { HintLog } from "~site/lib/game-api";
import type { BoardLink } from "./GameBoard";

const KIND: Record<Rung["kind"], string> = { start: "How to start", habit: "A habit", where: "Where", rule: "A rule", step: "The step" };
const SEEN = "inkit:hint-exposures";
const shownKey = (id: string) => `inkit:hints:${id}`;
const loadJson = <T,>(key: string, d: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const keep = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* this visit only */ } };

export function HintsPanel({ gameId, kind, ladder: given, board, link, canEdit, preview = false }: {
  gameId: string; kind: string; ladder: Ladder | null; board: BoardLike | null; link: MutableRefObject<BoardLink | null>;
  canEdit: boolean; preview?: boolean;
}) {
  const [ladder, setLadder] = useState(given);
  useEffect(() => setLadder(given), [given]);
  const [shown, setShown] = useState<Shown>(nothingShown);
  const [seen, setSeen] = useState<Exposures>({});
  const [more, setMore] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [noShowMe, setNoShowMe] = useState(false);
  // what the player opened before (this browser), and the techniques they've met anywhere
  useEffect(() => { if (!preview) setShown(loadJson(shownKey(gameId), nothingShown())); setSeen(loadJson(SEEN, {})); }, [gameId, preview]);
  // the stuck points already logged as got past without their hints
  const logged = useRef(new Set<number>());

  const at = ladder ? firstOpen(ladder, board) : 0;
  const next = ladder ? nextHint(ladder, shown, board) : null;
  const folded = useMemo(() => new Set(ladder ? skipped(ladder, shown, board) : []), [ladder, shown, board]);

  if (!ladder && !canEdit) return null;
  if (editing && canEdit) return <HintsEditor gameId={gameId} ladder={ladder} onDone={(l) => { if (l !== undefined) setLadder(l); setEditing(false); }} />;

  const open = () => {
    if (!ladder || !next) return;
    const r = next.section === "opening" ? ladder.opening[next.rung] : ladder.points[next.point].rungs[next.rung];
    const { faded } = textFor(r, seen);
    const passedNow = [...folded].filter((k) => !logged.current.has(k));
    passedNow.forEach((k) => logged.current.add(k));
    const point = next.section === "opening" ? "opening" as const : next.point;
    const rungs = next.section === "opening" ? ladder.opening.length : ladder.points[next.point].rungs.length;
    const entry: HintLog = {
      ladder: ladder.version, rung: next.rung + 1, rungs, technique: r.technique ?? null, rule: null, area: r.area ?? [], cells: [],
      point, kind: r.kind, faded, skipped: passedNow,
    };
    link.current?.log?.("h", entry);
    if (r.area?.length) link.current?.outline?.(r.area);
    const s = reveal(shown, next);
    setShown(s);
    if (!preview) keep(shownKey(gameId), s);
    if (r.technique) { const e = expose(seen, r); setSeen(e); keep(SEEN, e); }
  };

  const item = (r: Rung, key: string) => {
    const t = textFor(r, seen), full = more.has(key);
    return (
      <li key={key} className={`hint ${r.kind}`}>
        <span className="hint-kind">{KIND[r.kind]}{r.technique && <> · <a href={`/puzzles/${kind}`} target="_blank" rel="noreferrer">{r.technique}</a></>}</span>
        <span className="hint-text">{full ? r.text : t.text}</span>
        {t.faded && !full && <button type="button" className="link" onClick={() => setMore(new Set(more).add(key))}>Say more</button>}
        {r.area?.length ? <button type="button" className="link" onClick={() => link.current?.outline?.(r.area!)}>Show where</button> : null}
      </li>
    );
  };

  const total = ladder ? ladder.opening.length + ladder.points.reduce((n, p) => n + p.rungs.length, 0) : 0;
  return (
    <section className="puzzle-hints" aria-label="Hints">
      <div className="hints-head">
        <p className="muted small">Stuck? Open one hint at a time.</p>
        {canEdit && <button type="button" className="link" onClick={() => setEditing(true)}>{ladder ? "Edit hints" : "Write hints"}</button>}
      </div>
      {!ladder ? <p className="muted">This puzzle has no hints yet.</p> : (
        <>
          <ol className="hint-list">
            {ladder.opening.slice(0, shown.opening).map((r, i) => item(r, `o${i}`))}
            {ladder.points.map((p, k) => {
              const n = shown.points[k] ?? 0;
              if (folded.has(k)) return <li key={`p${k}`} className="hint passed">✓ You got past stuck point {k + 1}{n ? "" : " without a hint"}.</li>;
              return n ? p.rungs.slice(0, n).map((r, i) => item(r, `p${k}r${i}`)) : null;
            })}
          </ol>
          {next ? <button type="button" className="btn" onClick={open}>{shown.opening || shown.points.some((n) => n) ? "Another hint" : "Show a hint"}</button>
            : at < ladder.points.length
              ? noShowMe ? <p className="muted">That&rsquo;s every hint for this spot.</p>
                : <button type="button" className="btn" onClick={() => { if (!link.current?.showMe?.()) setNoShowMe(true); }}>Show me on the board</button>
              : <p className="muted">{total ? "No more hints: you're past every stuck point." : ""}</p>}
        </>
      )}
    </section>
  );
}

/** The author's view: each hint's text, to rewrite or empty (an empty one goes). The stuck points
 *  and what they check on the board stay as the writer found them. */
function HintsEditor({ gameId, ladder, onDone }: { gameId: string; ladder: Ladder | null; onDone: (l?: Ladder | null) => void }) {
  const start: Ladder = ladder ?? { version: "author", opening: [{ kind: "start", text: "" }], points: [] };
  const [draft, setDraft] = useState<Ladder>(start);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const edit = (where: "opening" | number, i: number, text: string) => setDraft((d) => where === "opening"
    ? { ...d, opening: d.opening.map((r, j) => (j === i ? { ...r, text } : r)) }
    : { ...d, points: d.points.map((p, k) => (k === where ? { ...p, rungs: p.rungs.map((r, j) => (j === i ? { ...r, text } : r)) } : p)) });
  const send = async (body: { ladder: unknown }) => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/g/${gameId}/hints`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({})) as { ladder?: Ladder | null; error?: string };
      if (!res.ok) { setError(out.error ?? "That didn't save. Try again?"); return; }
      onDone(out.ladder ?? null);
    } catch { setError("That didn't save. Try again?"); } finally { setBusy(false); }
  };
  const save = () => {
    const trimmed = {
      ...draft, version: "author",
      opening: draft.opening.filter((r) => r.text.trim()),
      points: draft.points.map((p) => ({ ...p, rungs: p.rungs.filter((r) => r.text.trim()) })).filter((p) => p.rungs.length),
    };
    if (!readLadder(trimmed)) { setError("Write at least one hint, or clear them."); return; }
    void send({ ladder: trimmed });
  };
  const field = (r: Rung, where: "opening" | number, i: number) => (
    <label key={`${where}-${i}`} className="hint-edit">
      <span className="hint-kind">{KIND[r.kind]}{r.technique ? ` · ${r.technique}` : ""}</span>
      <textarea rows={2} value={r.text} maxLength={400} onChange={(e) => edit(where, i, e.target.value)} />
    </label>
  );
  return (
    <section className="puzzle-hints editing" aria-label="Edit hints">
      <h3>Edit hints</h3>
      <p className="muted small">Players open these one at a time. Keep each short and plain; empty one to remove it.</p>
      {draft.opening.map((r, i) => field(r, "opening", i))}
      {draft.points.map((p, k) => (
        <fieldset key={k}><legend>Stuck point {k + 1}</legend>{p.rungs.map((r, i) => field(r, k, i))}</fieldset>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="hints-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={save}>Save</button>
        <button type="button" className="btn" disabled={busy} onClick={() => onDone()}>Cancel</button>
        {ladder && <button type="button" className="link danger" disabled={busy} onClick={() => void send({ ladder: null })}>Clear all hints</button>}
      </div>
    </section>
  );
}
