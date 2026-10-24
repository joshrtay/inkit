// The one-time question under a published puzzle: may we keep how you solve, for puzzle research
// (lib/play-log.ts)? Shown until it's answered in this browser; Settings and the privacy page can
// change the answer (ShareSolvesSetting).
// Nothing is logged before a yes.
import { useEffect, useState } from "react";
import { Link } from "~/components/Link";
import { setShare, shareAllowed, shareChoice } from "~/lib/play-log";

export function ShareSolves() {
  // unknown until the browser has read its storage, so the server's page shows nothing
  const [asked, setAsked] = useState(true);
  useEffect(() => {
    const read = () => setAsked(shareChoice() !== null);
    read();
    addEventListener("inkit:share-solves", read);
    return () => removeEventListener("inkit:share-solves", read);
  }, []);
  if (asked) return null;
  return (
    <aside className="share-solves" aria-label="Puzzle research">
      <p>Help us learn how people solve puzzles? We&rsquo;d keep your moves and their timing on puzzles you play here, with no name attached. <Link to="/privacy#solves">More</Link></p>
      <div className="share-buttons">
        <button type="button" className="btn primary" onClick={() => setShare(true)}>Yes, share</button>
        <button type="button" className="btn" onClick={() => setShare(false)}>No thanks</button>
      </div>
    </aside>
  );
}

/** Whether this browser shares how its player solves (lib/play-log.ts): off until they say yes. */
export function ShareSolvesSetting() {
  const [on, set] = useState(false);
  useEffect(() => set(shareAllowed()), []);
  return (
    <div className="settings-card">
      <label className="bug-setting">
        <input type="checkbox" checked={on} onChange={(e) => { set(e.target.checked); setShare(e.target.checked); }} />
        <span>Share how I solve
          <small>Your moves and their timing on puzzles you play in this browser, with a random number in place of your name, for puzzle research. Never shown on the site.</small></span>
      </label>
    </div>
  );
}

