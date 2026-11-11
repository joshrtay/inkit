// The tutor, on How to play's Hints tab (src/lib/tutor.ts): a chat about the player's board. Each
// time they ask, the solver reads the board in their browser (games/tutor.client.ts), and the tutor
// replies from what it found (routes/game-tutor.ts). Suggested questions start it; the player can
// also type. A reply that points at a spot can outline it on the board. Nothing is sent until the
// player asks. Replies aren't noted in the play's log: that log is never tied to an account
// (lib/play-log.ts), and the tutor's own record (tutor_turns) is.
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Link } from "~/components/Link";
import type { GridSpec } from "~site/engine/types.ts";
import { type Ask, ASKS, type BoardLike, type BoardRead, type ChatTurn } from "~site/lib/tutor";
import { readBoardInWorker } from "~/games/tutor.client";
import type { BoardLink } from "./GameBoard";

interface Turn extends ChatTurn { area?: number[] }
interface Reply { text?: string; move?: number; mistake?: boolean; by?: "model" | "kept" | "plain"; error?: string }

export function TutorPanel({ gameId, spec, board, link, signedIn }: {
  gameId: string; spec: GridSpec; board: BoardLike | null; link: MutableRefObject<BoardLink | null>; signedIn: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState<"" | "reading" | "thinking">("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [turns, busy]);

  const send = async (text: string, ask: Ask | null) => {
    if (!text.trim() || busy) return;
    const now: Turn[] = [...turns, { role: "player", text: text.trim() }];
    setTurns(now); setDraft(""); setError(""); setBusy("reading");
    let read: BoardRead;
    try { read = await readBoardInWorker(spec, board ?? {}); } catch (e) { setError(`I couldn't read the board (${(e as Error).message}).`); setBusy(""); return; }
    setBusy("thinking");
    try {
      const res = await fetch(`/g/${gameId}/tutor`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ read, turns: now.map(({ role, text }) => ({ role, text })), ask }),
      });
      const out = await res.json().catch(() => ({})) as Reply;
      if (!res.ok || !out.text) { setError(out.error ?? "The tutor didn't answer. Try again?"); return; }
      const area = out.mistake ? read.mistakes.flatMap((m) => m.cells) : out.move ? read.moves[out.move - 1]?.focus : undefined;
      setTurns([...now, { role: "tutor", text: out.text, ...(area?.length ? { area } : {}) }]);
      // a plain reply has no words for the place: show it
      if (out.by === "plain" && area?.length) link.current?.outline?.(area);
    } catch { setError("The tutor didn't answer. Try again?"); } finally { setBusy(""); }
  };

  if (!signedIn) return (
    <section className="puzzle-hints tutor" aria-label="Tutor">
      <p>Stuck? The tutor looks at your board and helps you find the next step yourself.</p>
      <p><Link className="btn" to="/signin">Sign in to ask the tutor</Link></p>
      <p className="muted small">The board's own hint button works without signing in.</p>
    </section>
  );
  return (
    <section className="puzzle-hints tutor" aria-label="Tutor">
      {!turns.length && <p className="muted small">Stuck? Ask me about your board.</p>}
      <ol className="tutor-chat">
        {turns.map((t, i) => (
          <li key={i} className={`tutor-turn ${t.role}`}>
            <span>{t.text}</span>
            {t.area && <button type="button" className="link" onClick={() => link.current?.outline?.(t.area!)}>Show where</button>}
          </li>
        ))}
        {busy && <li className="tutor-turn tutor muted">{busy === "reading" ? "Looking at your board…" : "Thinking…"}</li>}
      </ol>
      <div ref={end} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="tutor-asks">
        {(Object.keys(ASKS) as Ask[]).map((k) => (
          <button key={k} type="button" className="btn small" disabled={!!busy} onClick={() => void send(ASKS[k], turns.length ? null : k)}>{ASKS[k]}</button>
        ))}
      </div>
      <form className="tutor-input" onSubmit={(e) => { e.preventDefault(); void send(draft, null); }}>
        <input value={draft} maxLength={600} placeholder="Ask anything" aria-label="Ask the tutor" onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn" disabled={!!busy || !draft.trim()}>Ask</button>
      </form>
      <p className="muted small">When you ask, your question and what's on your board go to Claude to write the reply. <Link to="/privacy">Privacy</Link></p>
    </section>
  );
}
