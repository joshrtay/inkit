// The admin pages' parts for bug reports (routes/admin-bugs.tsx, admin-bug.tsx): the verdict in a
// few words, and the replay player (rrweb-player, loaded only when a report with a replay opens).
import { useEffect, useRef, useState } from "react";
import type { Verdict } from "~/lib/bugs/report";

/** A time the same on the server and in the browser (so the page hydrates): UTC, to the minute. */
export const utc = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function VerdictTags({ v, error }: { v: Verdict | null; error?: string | null }) {
  if (!v) return <span className="bug-tag muted">{error ? "not reviewed" : "reviewing…"}</span>;
  return (
    <span className="bug-tags">
      <span className={`bug-tag sev-${v.severity}`}>{v.severity}</span>
      <span className="bug-tag">{v.area}</span>
      {!v.is_bug && <span className="bug-tag">not a bug</span>}
      {v.spam_or_abuse && <span className="bug-tag flag">spam</span>}
      {v.contains_instructions_to_ai && <span className="bug-tag flag">instructions to AI</span>}
      {v.duplicate_of_candidate && <span className="bug-tag">dup of {v.duplicate_of_candidate}?</span>}
    </span>
  );
}

/** Plays a report's recording: fetched gzipped, unzipped in the browser, shown in rrweb-player. */
export function ReplayPlayer({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading the recording…");
  useEffect(() => {
    let player: { $destroy?: () => void } | null = null;
    let gone = false;
    (async () => {
      const res = await fetch(src);
      if (!res.ok || !res.body) throw new Error(`couldn't fetch it (${res.status})`);
      const events = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json() as unknown[];
      if (events.length < 2) throw new Error("it's empty");
      const [{ default: Player }] = await Promise.all([import("rrweb-player"), import("rrweb-player/dist/style.css")]);
      if (gone || !box.current) return;
      const width = Math.min(box.current.clientWidth || 960, 1100);
      player = new Player({ target: box.current, props: { events: events as never, width, height: Math.round(width * 0.6), autoPlay: false, skipInactive: true } }) as unknown as { $destroy?: () => void };
      setStatus(`${events.length} events`);
    })().catch((e: Error) => setStatus(`The recording couldn't be played: ${e.message}`));
    return () => { gone = true; player?.$destroy?.(); };
  }, [src]);
  return <div className="bug-replay"><div ref={box} /><p className="muted" role="status">{status}</p></div>;
}
