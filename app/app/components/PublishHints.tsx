// The publish page's hints (docs/plan-generator-and-hints.md, "Publishing"): a puzzle publishes only
// with a verified solve and hints for players. Once the one-solution check passes, the deduction
// solver works through the puzzle in this browser (app/games/hint-solve.client.ts) and finds where
// a player would stall; Sonnet words the hints on the server (routes/game-hints-write.ts). Where the
// solver can't finish, the creator solves it on the board and their moves fill the gaps (the solve
// must check out). The creator then reviews the hints, and can rewrite any of them.
import { useEffect, useRef, useState } from "react";
import type { GridSpec } from "~site/engine/types.ts";
import type { BoardLike, Ladder, Rung } from "~site/lib/hint-ladder";
import type { Stuck } from "~site/lib/hint-words";
import { hintSolve, stopHintSolve } from "~/games/hint-solve.client";
import { creatorMarks, noMoves, noteBoard } from "~/games/creator-moves";
import { HintsEditor, KIND } from "./HintsPanel";

export type Verified = "solver" | "creator";
type Phase =
  | { at: "waiting" }
  | { at: "solving"; share: number; yours: boolean }
  | { at: "yours" }
  | { at: "writing" }
  | { at: "ready"; ladder: Ladder; verified: Verified; problems: string[] }
  | { at: "failed"; message: string };

/** The hints' state for the publish page: `ready` once the check has passed; `onBoard` and
 *  `onSolved` go to the board, to follow the creator's solve. */
export function usePublishHints({ gameId, spec, sketchHash, ready, had }: {
  gameId: string; spec: GridSpec | null; sketchHash: string; ready: boolean;
  had: { ladder: Ladder | null; verified: string | null } | null;
}) {
  const [phase, setPhase] = useState<Phase>(() => had?.ladder && had.verified
    ? { at: "ready", ladder: had.ladder, verified: had.verified as Verified, problems: [] } : { at: "waiting" });
  const order = useRef(noMoves());
  const finished = useRef<BoardLike | null>(null);   // the creator's board, once solved
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; stopHintSolve(); }; }, []);
  const set = (p: Phase) => { if (live.current) setPhase(p); };

  const write = async (stuck: Stuck, board?: BoardLike) => {
    set({ at: "writing" });
    try {
      const res = await fetch(`/g/${gameId}/hints/write`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sketchHash, stuck, board }) });
      const out = await res.json().catch(() => ({})) as { ladder?: Ladder; verified?: Verified; problems?: string[]; error?: string };
      if (!res.ok || !out.ladder || !out.verified) { set({ at: "failed", message: out.error ?? "The hints couldn't be written." }); return; }
      set({ at: "ready", ladder: out.ladder, verified: out.verified, problems: out.problems ?? [] });
    } catch { set({ at: "failed", message: "The hints couldn't be written. Check your connection." }); }
  };

  // the solver alone first; with the creator's moves once they've solved it
  const solve = async (yours: boolean) => {
    if (!spec) return;
    set({ at: "solving", share: 0, yours });
    const board = finished.current;
    const creator = yours ? creatorMarks(order.current, board) : [];
    const r = await hintSolve(spec, { creator, onProgress: (share) => set({ at: "solving", share, yours }) });
    if (!live.current) return;
    if ("stuck" in r && r.stuck.solved) return write(r.stuck, yours ? board ?? undefined : undefined);
    if (yours) { set({ at: "failed", message: "The solver still couldn't follow the solve. Try solving it again." }); return; }
    // the solver couldn't finish (or run): the creator's turn, unless they've already solved it
    if (board) return solve(true);
    set({ at: "yours" });
  };

  useEffect(() => { if (ready && phase.at === "waiting") void solve(false); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBoard = (b: BoardLike | null) => { order.current = noteBoard(order.current, b); };
  const onSolved = () => {
    finished.current = order.current.prev;
    if (phase.at === "yours" || (phase.at === "failed" && finished.current)) void solve(true);
  };
  const retry = () => { order.current = noteBoard(noMoves(), order.current.prev); finished.current = null; void solve(false); };
  const edited = (ladder: Ladder) => setPhase((p) => (p.at === "ready" ? { ...p, ladder, problems: [] } : p));
  return { phase, onBoard, onSolved, retry, edited, done: phase.at === "ready" };
}

/** What the hints are doing, and once written, the hints to review and rewrite. */
export function PublishHints({ gameId, hints }: { gameId: string; hints: ReturnType<typeof usePublishHints> }) {
  const [editing, setEditing] = useState(false);
  const { phase } = hints;
  if (phase.at === "waiting") return null;
  if (phase.at === "solving") return (
    <p className="publish-hints-state" aria-live="polite">
      {phase.yours ? "Following your solve" : "Working out the solve for its hints"}… {Math.round(phase.share * 100)}%
    </p>);
  if (phase.at === "writing") return <p className="publish-hints-state" aria-live="polite">Writing the hints…</p>;
  if (phase.at === "yours") return (
    <p className="publish-hints-state yours" role="status">
      The solver couldn&rsquo;t finish this one. <strong>Solve it on the board below</strong>: your moves become the hints&rsquo; key steps.
    </p>);
  if (phase.at === "failed") return (
    <p className="error publish-hints-state" role="alert">{phase.message} <button type="button" className="link" onClick={hints.retry}>Start again</button></p>);

  if (editing) return (
    <div className="publish-hints">
      <HintsEditor gameId={gameId} ladder={phase.ladder} onDone={(l) => { if (l) hints.edited(l); setEditing(false); }} />
    </div>);
  const rung = (r: Rung, key: string) => (
    <li key={key} className={`hint ${r.kind}`}>
      <span className="hint-kind">{KIND[r.kind]}{r.technique ? ` · ${r.technique}` : ""}</span>
      <span className="hint-text">{r.text}</span>
    </li>);
  return (
    <details className="publish-hints" open>
      <summary>
        <span className="publish-hints-ok">✓ Solve checked {phase.verified === "creator" ? "(your solve)" : "(by the solver)"} · hints ready</span>
        <span className="muted small"> Review them before you publish.</span>
      </summary>
      <ol className="hint-list">
        {phase.ladder.opening.map((r, i) => rung(r, `o${i}`))}
        {phase.ladder.points.map((p, k) => (
          <li key={`p${k}`} className="hint-point"><span className="hint-kind">Stuck point {k + 1}</span>
            <ol className="hint-list">{p.rungs.map((r, i) => rung(r, `p${k}r${i}`))}</ol></li>))}
      </ol>
      <button type="button" className="link" onClick={() => setEditing(true)}>Edit hints</button>
    </details>);
}
