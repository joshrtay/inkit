// Paint's type picker (docs/creation-flow.md §1.7), hanging from the Type button: every puzzle type
// in the guide pane's list style (its example's picture, its name and what it is), searchable, and
// "Not set". The type can be changed any time; nothing drawn is lost. (Suggestions, "What type is
// this?", come with the photo path.)
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { GenreName } from "~site/engine/puzzle.ts";
import type { loader as listLoader } from "~/routes/puzzles";
import { PROFILES } from "~/sketchpad/to-puzzle";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function TypePicker({ current, onChoose, onClose }: { current: GenreName | null; onChoose: (g: GenreName | null) => void; onClose: () => void }) {
  const list = useFetcher<typeof listLoader>();
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (list.state === "idle" && !list.data) list.load("/puzzles"); }, [list]);
  useEffect(() => { box.current?.querySelector("input")?.focus(); }, []);
  // closes on a click outside it (the Type button toggles it itself)
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!(e.target as Element).closest(".paint-picker, .paint-type")) onClose(); };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [onClose]);
  const types = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return (list.data?.types ?? []).filter((t) => words.every((w) => fold([t.name, ...t.aka, t.summary, t.category].join(" ")).includes(w)));
  }, [list.data, q]);

  return (
    <div className="paint-picker guide-pane" ref={box} role="dialog" aria-label="Puzzle type">
      <div className="pane-head"><h2>Puzzle type</h2><button className="pane-close" type="button" aria-label="Close" onClick={onClose}>×</button></div>
      <input className="pane-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, like “Light Up”" aria-label="Search puzzle types" />
      <ul className="pane-list">
        {!q && (
          <li><button type="button" aria-pressed={current === null} onClick={() => onChoose(null)}>
            <span className="pic paint-unset" aria-hidden="true">?</span>
            <span><strong>Not set</strong><span className="muted">Plain paint, every tool: choose a type when you know it</span></span>
          </button></li>
        )}
        {!list.data ? <li className="muted">Loading…</li> : types.map((t) => {
          const inPaint = !!PROFILES[t.kind as GenreName];
          return (
            <li key={t.kind}>
              <button type="button" aria-pressed={current === t.kind} disabled={!inPaint} onClick={() => onChoose(t.kind as GenreName)}>
                <span className="grid-game pic" style={{ "--paper-ink": t.ink } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: t.thumb }} />
                <span><strong>{t.name}</strong><span className="muted">{inPaint ? t.summary : "Not made in paint yet: it keeps its own editor"}</span></span>
              </button>
            </li>
          );
        })}
        {list.data && !types.length && <li className="muted">No types match.</li>}
      </ul>
      <p className="paint-picker-foot muted">You can change the type any time; nothing you drew is lost.</p>
    </div>
  );
}
