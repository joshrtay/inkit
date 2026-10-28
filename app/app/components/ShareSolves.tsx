// The switch for solve logging (lib/play-log.ts), in Settings and on the privacy page: on unless the
// player turns it off; off forgets the player's random id and sends nothing more.
import { useEffect, useState } from "react";
import { setShare, shareAllowed } from "~/lib/play-log";

/** Whether this browser shares how its player solves (lib/play-log.ts): on until they turn it off. */
export function ShareSolvesSetting() {
  const [on, set] = useState(true);
  useEffect(() => set(shareAllowed()), []);
  return (
    <div className="settings-card">
      <label className="bug-setting">
        <input type="checkbox" checked={on} onChange={(e) => { set(e.target.checked); setShare(e.target.checked); }} />
        <span>Share how I solve
          <small>Your moves, their timing and the hints you use on puzzles you play in this browser, tied to a random number and, when you&rsquo;re signed in, your account, for puzzle research. Never shown on the site.</small></span>
      </label>
    </div>
  );
}

