// Paint's Types tab (docs/creation-flow.md, "v3 layout"), in the right drawer that the Type button
// opens: every puzzle type in the guide pane's list style (its example's picture, its name and what
// it is), searchable, and "Not set"; each with "More", its guide shown in the drawer. The type can
// be changed any time; nothing drawn is lost.
//
// What type is this? (on demand only, never by itself): for a photo, the types its reading could be
// (games.kind_choices), at once; for a drawing, no AI: the drawing converted as every type paint
// makes, the best fits checked by the solver in turn (sketchpad/suggest.ts), within a time budget
// and with a Cancel. The top three show as cards: the drawing as that type, the solver's verdict,
// and how much of it fits.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import type { loader as listLoader } from "~/routes/puzzles";
import type { loader as typeLoader } from "~/routes/puzzle-type";
import { GuideBody } from "./GuideView";
import { SpIcon } from "./SketchpadIcons";
import { kindName } from "~/games/kinds";
import type * as m from "~/sketchpad/model";
import { PROFILES, type Settings } from "~/sketchpad/to-puzzle";
import { fitsOf, fitWords, rankSuggestions, SAID_WORDS, saidBeforeSolving, saidOf, type Fit, type Said } from "~/sketchpad/suggest";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** How many types the solver checks, and for how long in all. */
const CHECK_AT_MOST = 8, BUDGET_MS = 12_000;

interface Suggestion { fit: Fit; said: Said }
type Asked = { state: "checking" | "done" | "stopped"; list: Suggestion[]; photo: boolean };

export function TypePicker({ current, onChoose, ask = 0, drawing, settings = {}, choices = [], about, onAbout, top: head }: {
  current: GenreName | null; onChoose: (g: GenreName | null) => void;
  /** asks What type is this? each time it goes up */
  ask?: number;
  drawing?: m.Drawing; settings?: Settings;
  /** a photo reading's candidates, best first */
  choices?: string[];
  /** the type whose guide is shown in the drawer ("More about …"), or null for the list */
  about: string | null; onAbout: (kind: string | null) => void;
  /** above the list (the "Choose a type first" reminder) */
  top?: React.ReactNode;
}) {
  const list = useFetcher<typeof listLoader>();
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (list.state === "idle" && !list.data) list.load("/puzzles"); }, [list]);
  const types = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return (list.data?.types ?? []).filter((t) => words.every((w) => fold([t.name, ...t.aka, t.summary, t.category].join(" ")).includes(w)));
  }, [list.data, q]);

  // ---- What type is this? ----
  const [asked, setAsked] = useState<Asked | null>(null);
  const [pick, setPick] = useState<GenreName | null>(null);
  const run = useRef(0);
  const stop = async () => {
    run.current++;
    setAsked((a) => (a && a.state === "checking" ? { ...a, state: "stopped" } : a));
    const { stopSolving } = await import("~/games/count-solutions.client");
    await stopSolving();
  };
  const suggest = async () => {
    if (!drawing) return;
    const me = ++run.current, photo = choices.length > 0;
    const fits = photo ? fitsOf(drawing, settings, choices) : fitsOf(drawing, settings).slice(0, CHECK_AT_MOST);
    let found: Suggestion[] = fits.map((fit) => ({ fit, said: saidBeforeSolving(fit) ?? "unchecked" }));
    const show = (state: Asked["state"]) => {
      const ranked = rankSuggestions(found, photo);
      setAsked({ state, list: ranked, photo });
      setPick((p) => p ?? ranked[0]?.fit.genre ?? null);
    };
    show("checking");
    const { findSolutions, stopSolving } = await import("~/games/count-solutions.client");
    const deadline = Date.now() + BUDGET_MS;
    for (const s of found) {
      if (s.said !== "unchecked") continue;
      if (run.current !== me) return;
      const left = deadline - Date.now();
      if (left <= 0) break;
      const timer = setTimeout(() => void stopSolving(), left);
      const r = await findSolutions(s.fit.conv.spec!).catch((e: Error) => ({ error: e.message }));
      clearTimeout(timer);
      if (run.current !== me) return;
      found = found.map((x) => (x === s ? { ...x, said: "error" in r ? (r.error === "stopped" ? "unchecked" : "error") : saidOf(s.fit.genre, r.solutions) } : x));
      show("checking");
    }
    if (run.current === me) show(found.some((x) => x.said === "unchecked") ? "stopped" : "done");
  };
  useEffect(() => { if (ask) void suggest(); }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { run.current++; }, []);
  const top = asked?.list.slice(0, 3) ?? [];
  const pictures = useMemo(() => new Map(top.map(({ fit }) => {
    try { return [fit.genre, pictureSvg(makePuzzle(fit.conv.spec!, { unfinished: true }), null, kindName(fit.genre))]; } catch { return [fit.genre, ""]; }
  })), [top.map((x) => x.fit.genre).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const about_ = (g: string) => list.data?.types.find((t) => t.kind === g)?.summary ?? "";
  const tone = (s: Said) => (s === "one" || s === "solvable" ? "ok" : s === "unchecked" ? "wait" : "bad");

  const name = (k: string) => list.data?.types.find((t) => t.kind === k)?.name ?? kindName(k);

  if (about) return <AboutType kind={about} current={current} onBack={() => onAbout(null)} onChoose={(k) => { onAbout(null); onChoose(k); }} />;
  return (
    <div className={`paint-types${asked ? " asking" : ""}`} ref={box}>
      {head}
      <label className="paint-search"><SpIcon name="search" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, like “Light Up”" aria-label="Search puzzle types" /></label>
      {!asked ? (
        <button type="button" className="paint-ask" onClick={() => void suggest()} disabled={!drawing?.grid}
          title={drawing?.grid ? undefined : "Draw a grid first: the types are tried on it"}>
          <SpIcon name="sparkle" />What type is this?
        </button>
      ) : (
        <section className="paint-suggest" aria-label="Suggested types" aria-busy={asked.state === "checking"}>
          <h3 className="paint-h3">What type is this?</h3>
          <p className="muted">{asked.photo
            ? "Claude read your photo as one of these. Each is shown with your drawing and the solver's verdict."
            : "Your drawing tried as every type, without asking Claude: these fit it best, each with the solver's verdict."}</p>
          {!top.length ? <p className="paint-quiet">Nothing fits yet: draw a grid and some clues, then ask again.</p> : (
            <ul className="paint-suggest-cards">
              {top.map(({ fit, said }, i) => (
                <li key={fit.genre}>
                  <button type="button" className="paint-suggest-card" aria-pressed={pick === fit.genre} onClick={() => setPick(fit.genre)} data-genre={fit.genre}>
                    {i === 0 && asked.state !== "checking" && <span className="paint-best">Best fit</span>}
                    <span className="grid-game pic" dangerouslySetInnerHTML={{ __html: pictures.get(fit.genre) ?? "" }} />
                    <span className="paint-suggest-text">
                      <span className="paint-suggest-head"><strong>{kindName(fit.genre)}</strong><span className={`paint-said ${tone(said)}`}>{said === "unchecked" && asked.state === "checking" ? "Checking…" : SAID_WORDS[said]}</span></span>
                      <span className="muted">{about_(fit.genre)}</span>
                      <span className={`paint-fits${fit.wontFit ? " bad" : ""}`}>{fit.wontFit ? "" : "✓ "}{fitWords(fit)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="paint-suggest-foot">
            <span className="muted">{asked.state === "checking" ? "The solver is checking each…" : asked.state === "stopped" ? "Stopped: some weren't checked." : "The verdicts are the solver's, on what you've drawn so far."}</span>
            {asked.state === "checking" && <button type="button" className="btn" onClick={() => void stop()}>Cancel</button>}
            <button type="button" className="btn" onClick={() => { void stop(); setAsked(null); }}>Not now</button>
            <button type="button" className="btn primary" disabled={!pick} onClick={() => { void stop(); if (pick) { setAsked(null); onChoose(pick); } }}>{pick ? `Make it ${kindName(pick)}` : "Make it"}</button>
          </div>
        </section>
      )}
      <h3 className="paint-h3">All types<span>Now: {current ? name(current) : "not set"}</span></h3>
      <ul className="paint-type-list">
        {!q && (
          <li className={current === null ? "on" : ""}>
            <button type="button" className="paint-ty" aria-pressed={current === null} onClick={() => onChoose(null)}>
              <span className="pic paint-unset" aria-hidden="true">?</span>
              <span><strong>Not set</strong><span className="muted">Plain paint, every tool: choose a type when you know it</span></span>
            </button>
          </li>
        )}
        {!list.data ? <li className="muted">Loading…</li> : types.map((t) => {
          const inPaint = !!PROFILES[t.kind as GenreName];
          return (
            <li key={t.kind} className={current === t.kind ? "on" : ""}>
              <button type="button" className="paint-ty" aria-pressed={current === t.kind} disabled={!inPaint} onClick={() => onChoose(t.kind as GenreName)}>
                <span className="grid-game pic" style={{ "--paper-ink": t.ink } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: t.thumb }} />
                <span><strong>{t.name}</strong><span className="muted">{inPaint ? t.summary : "Not made in paint yet: it keeps its own editor"}</span></span>
              </button>
              <button type="button" className="paint-ty-more" aria-label={`More about ${t.name}`} onClick={() => onAbout(t.kind)}>More ›</button>
            </li>
          );
        })}
        {list.data && !types.length && <li className="muted">No types match.</li>}
      </ul>
      <p className="paint-picker-foot muted">You can change the type any time; nothing you drew is lost.</p>
    </div>
  );
}

/** A type's guide in the drawer: its rules with their pictures and a worked example, a way back,
 *  and choosing it. */
function AboutType({ kind, current, onBack, onChoose }: { kind: string; current: GenreName | null; onBack: () => void; onChoose: (k: GenreName) => void }) {
  const detail = useFetcher<typeof typeLoader>();
  useEffect(() => { detail.load(`/puzzles/${kind}`); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const g = detail.data && "name" in detail.data && detail.data.kind === kind ? detail.data : null;
  const inPaint = !!PROFILES[kind as GenreName];
  return (
    <div className="paint-about" aria-label={`About ${g?.name ?? kindName(kind)}`} role="region">
      <div className="paint-about-head">
        <button type="button" className="link pane-back" onClick={onBack}>← All types</button>
        {current !== kind && inPaint && <button type="button" className="btn primary" onClick={() => onChoose(kind as GenreName)}>Make it {g?.name ?? kindName(kind)}</button>}
      </div>
      {g ? (
        <div className="pane-guide" style={{ "--paper-ink": g.ink } as React.CSSProperties}>
          <h2>{g.name}</h2>
          {g.aka.length > 0 && <p className="aka">Also called {g.aka.join(", ")}</p>}
          <p className="lead">{g.summary}</p>
          <GuideBody g={g} inPane />
          <p><a href={`/puzzles/${kind}`} target="_blank" rel="noreferrer">The full guide, on its own page ↗</a></p>
        </div>
      ) : <p className="muted">Loading…</p>}
    </div>
  );
}
