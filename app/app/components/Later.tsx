// A part of a page that arrives after it (a loader's unawaited promise: lib/stream.server.ts): its
// skeleton until then, and a quiet fallback (by default nothing) if it fails. Skeletons are the
// site's paper and ink: the shape of what's coming in a faint wash of the ink, breathing slowly,
// and a card's picture a blank sheet of paper (base.css, "Skeletons").
import { Suspense, type ReactNode } from "react";
import { Await } from "react-router";

export type MaybeLater<T> = T | Promise<T>;

export function Later<T>({ value, fallback, error = null, children }: {
  value: MaybeLater<T>; fallback: ReactNode; error?: ReactNode; children: (value: T) => ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <Await resolve={value} errorElement={error}>{(v) => children(v as T)}</Await>
    </Suspense>
  );
}

/** A line of text to come, `w` wide (any CSS length). */
export const SkelText = ({ w = "8em", className = "" }: { w?: string; className?: string }) => (
  <span className={`skel skel-text ${className}`} style={{ width: w }} aria-hidden="true" />
);

/** A puzzle card to come, the size of one (Explore's .pcard): a blank sheet, then its lines. */
export const SkelCard = () => (
  <li aria-hidden="true">
    <span className="game-card pcard skel-card">
      <span className="thumb skel-sheet" />
      <span className="game-card-text">
        <SkelText w="5em" className="small" />
        <SkelText w="80%" className="big" />
        <SkelText w="55%" />
        <SkelText w="40%" className="small" />
      </span>
    </span>
  </li>
);

/** A shelf to come on Explore: its heading and a row of cards. */
export const SkelShelf = ({ cards = 6 }: { cards?: number }) => (
  <section className="shelf xshelf skel-shelf" aria-hidden="true">
    <header className="shelf-head"><div><SkelText w="9em" className="h2" /><SkelText w="14em" /></div></header>
    <div className="rail"><ul className="row">{Array.from({ length: cards }, (_, i) => <SkelCard key={i} />)}</ul></div>
  </section>
);
