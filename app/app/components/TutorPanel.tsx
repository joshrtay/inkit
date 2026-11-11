// The tutor, on How to play's Hints tab (src/lib/tutor.ts): a chat about the player's board. Each
// time they ask, the solver reads the board in their browser (games/tutor.client.ts), and the tutor
// replies from what it found (routes/game-tutor.ts). Suggested questions start it; the player can
// also type. A reply that points at a spot can outline it on the board. Nothing is sent until the
// player asks. The chat is kept in this browser (like the board's progress), so a reload carries on;
// and each question with its reply is noted in the play's log among the moves (a TutorLog; nothing
// once the player turns solve sharing off: lib/play-log.ts).
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Link } from "~/components/Link";
import type { GridSpec } from "~site/engine/types.ts";
import { type Ask, ASKS, type BoardLike, type BoardRead, type ChatTurn, recentTurns, tutorLog } from "~site/lib/tutor";
import { readBoardInWorker } from "~/games/tutor.client";
import type { BoardLink } from "./GameBoard";

interface Turn extends ChatTurn { area?: number[] }

/** The chat kept in this browser, per puzzle: read back as far as it's a chat. */
const chatKey = (gameId: string) => `inkit:tutor:${gameId}`;
const KEPT_TURNS = 100;
export function chatOfStored(raw: string | null): Turn[] {
  try {
    const x: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(x)) return [];
    return x.filter((t): t is Turn => !!t && (t.role === "player" || t.role === "tutor") && typeof t.text === "string")
      .map((t) => ({ role: t.role, text: t.text, ...(Array.isArray(t.area) && t.area.every((i) => Number.isInteger(i)) ? { area: t.area } : {}) })).slice(-KEPT_TURNS);
  } catch { return []; }
}
interface Reply { text?: string; move?: number; mistake?: boolean; by?: "model" | "kept" | "plain"; error?: string }

export function TutorPanel({ gameId, spec, board, link, signedIn }: {
  gameId: string; spec: GridSpec; board: BoardLike | null; link: MutableRefObject<BoardLink | null>; signedIn: boolean;
}) {
  const [turns, setChat] = useState<Turn[]>([]);
  // (read after the page is up: the server doesn't have it)
  useEffect(() => { try { setChat(chatOfStored(localStorage.getItem(chatKey(gameId)))); } catch { /* storage blocked: this visit only */ } }, [gameId]);
  const setTurns = (now: Turn[]) => {
    setChat(now);
    try { if (now.length) localStorage.setItem(chatKey(gameId), JSON.stringify(now.slice(-KEPT_TURNS))); else localStorage.removeItem(chatKey(gameId)); } catch { /* this visit only */ }
  };
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
        body: JSON.stringify({ read, turns: recentTurns(now).map(({ role, text }) => ({ role, text })), ask }),
      });
      const out = await res.json().catch(() => ({})) as Reply;
      if (!res.ok || !out.text) { setError(out.error ?? "The tutor didn't answer. Try again?"); return; }
      const area = out.mistake ? read.mistakes.flatMap((m) => m.cells) : out.move ? read.moves[out.move - 1]?.focus : undefined;
      setTurns([...now, { role: "tutor", text: out.text, ...(area?.length ? { area } : {}) }]);
      link.current?.log?.("t", tutorLog(ask, text.trim(), read, { ...out, text: out.text }));
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
      <p className="muted small">When you ask, your question and what's on your board go to Claude to write the reply. We keep the chat with how you solve, to make the tutor better. <Link to="/privacy#solves">Privacy</Link>
        {turns.length > 0 && !busy && <> · <button type="button" className="link" onClick={() => { setTurns([]); setError(""); }}>Clear chat</button></>}</p>
    </section>
  );
}
