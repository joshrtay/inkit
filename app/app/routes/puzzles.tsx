// Every puzzle type, to browse or search: a card each, grouped by kind of puzzle.
import { useMemo, useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/puzzles";
import { CATEGORIES, guideCard, ORDER } from "~/lib/guides.server";
import { pageMeta, puzzlesJsonLd } from "~/lib/seo";
import "~site/game-types/grid/styles.css";

export const meta: Route.MetaFunction = ({ loaderData: d }) => pageMeta({
  title: "Logic puzzle types and their rules · inkit",
  description: `How to play ${d?.types.length ?? "every"} kinds of logic puzzle, from Sudoku and Akari to Slitherlink and Nurikabe: the rules of each, with pictures and a worked example.`,
  path: "/puzzles",
  jsonLd: d ? puzzlesJsonLd(d.types) : undefined,
});

export function loader({ request }: Route.LoaderArgs) {
  return { types: ORDER.map(guideCard), categories: CATEGORIES, q: new URL(request.url).searchParams.get("q") ?? "" };
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function Puzzles({ loaderData: { types, categories, q: initial } }: Route.ComponentProps) {
  const [q, setQ] = useState(initial);
  const [only, setOnly] = useState<string | null>(null);
  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return types.filter((t) => (!only || t.category === only)
      && words.every((w) => fold([t.name, ...t.aka, t.summary, t.category].join(" ")).includes(w)));
  }, [types, q, only]);

  return (
    <main className="wrap guides">
      <header className="guides-head">
        <h1>Puzzle types</h1>
        <p className="lead">The rules of every puzzle on the site, each with pictures of what works and what doesn&rsquo;t, and a worked example.</p>
        <Form className="guide-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
          <input type="search" name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, like “Light Up” or “sudoku”"
            aria-label="Search puzzle types" autoComplete="off" />
        </Form>
        <div className="chips" role="group" aria-label="Kind of puzzle">
          <button type="button" aria-pressed={!only} onClick={() => setOnly(null)}>All <span>{types.length}</span></button>
          {categories.map((c) => (
            <button key={c} type="button" aria-pressed={only === c} onClick={() => setOnly(only === c ? null : c)}>
              {c} <span>{types.filter((t) => t.category === c).length}</span>
            </button>
          ))}
        </div>
      </header>

      {categories.map((c) => {
        const list = shown.filter((t) => t.category === c);
        if (!list.length) return null;
        return (
          <section key={c} className="guide-group" aria-labelledby={`cat-${c}`}>
            <h2 id={`cat-${c}`}>{c}</h2>
            <ul className="guide-cards">
              {list.map((t) => (
                <li key={t.kind}>
                  <Link className="guide-card" to={`/puzzles/${t.kind}`}>
                    <span className="grid-game pic thumb" style={{ "--paper-ink": t.ink } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: t.thumb }} />
                    <span className="guide-card-text">
                      <strong>{t.name}</strong>
                      {t.aka.length > 0 && <span className="aka">also {t.aka.join(", ")}</span>}
                      <span className="desc">{t.summary}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!shown.length && (
        <p className="muted empty">No puzzle types match &ldquo;{q}&rdquo;. <button className="link" type="button" onClick={() => { setQ(""); setOnly(null); }}>Show them all</button></p>
      )}
    </main>
  );
}
