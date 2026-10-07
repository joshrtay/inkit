// The puzzle types beside the new-game page, so a creator can look up the rules while drawing or
// checking a reading: search, a compact list, and a type's full guide in place. Wide screens show
// it as a right-hand pane; narrower ones as a drawer behind a "Puzzle types" button.
import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import type { loader as listLoader } from "~/routes/puzzles";
import type { loader as typeLoader } from "~/routes/puzzle-type";
import { GuideBody } from "./GuideView";
import "~site/game-types/grid/styles.css";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** `drawer`: always a drawer behind its button (for pages that need the width). */
export function GuidePane({ start, drawer = false }: { start?: string; drawer?: boolean }) {
  const list = useFetcher<typeof listLoader>();
  const detail = useFetcher<typeof typeLoader>();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(start ?? null);
  const [open, setOpen] = useState(false);   // the drawer, on narrower screens

  useEffect(() => { if (list.state === "idle" && !list.data) list.load("/puzzles"); }, [list]);
  useEffect(() => { if (kind) detail.load(`/puzzles/${kind}`); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const types = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return (list.data?.types ?? []).filter((t) => words.every((w) => fold([t.name, ...t.aka, t.summary, t.category].join(" ")).includes(w)));
  }, [list.data, q]);
  const g = detail.data && "name" in detail.data && detail.data.kind === kind ? detail.data : null;

  return (
    <>
      <button className={`btn pane-toggle${drawer ? " drawer" : ""}`} type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Puzzle types</button>
      <aside className={`guide-pane${open ? " open" : ""}${drawer ? " drawer" : ""}`} aria-label="Puzzle types">
        <div className="pane-head">
          {kind ? <button className="link pane-back" type="button" onClick={() => setKind(null)}>← All puzzle types</button> : <h2>Puzzle types</h2>}
          <button className="pane-close" type="button" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        </div>
        {!kind && (
          <>
            <input className="pane-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, like “Light Up”" aria-label="Search puzzle types" />
            {!list.data ? <p className="muted">Loading…</p> : (
              <ul className="pane-list">
                {types.map((t) => (
                  <li key={t.kind}>
                    <button type="button" onClick={() => setKind(t.kind)}>
                      <span className="grid-game pic" style={{ "--paper-ink": t.ink } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: t.thumb }} />
                      <span><strong>{t.name}</strong><span className="muted">{t.summary}</span></span>
                    </button>
                  </li>
                ))}
                {!types.length && <li className="muted">No types match.</li>}
              </ul>
            )}
          </>
        )}
        {kind && (g ? (
          <div className="pane-guide" style={{ "--paper-ink": g.ink } as React.CSSProperties}>
            <h2>{g.name}</h2>
            {g.aka.length > 0 && <p className="aka">Also called {g.aka.join(", ")}</p>}
            <p className="lead">{g.summary}</p>
            <GuideBody g={g} />
          </div>
        ) : <p className="muted">Loading…</p>)}
      </aside>
    </>
  );
}
