// "Report a bug" (docs/bug-pipeline.md): a dialog in the site's own style (ConfirmDialog's look and
// focus rules) asking what went wrong, with a ticked box to include the last two minutes' recording
// and an optional screenshot; the page's details (route, build, browser, the puzzle) go with it.
// Opened from anywhere with openBugReport(): the More menu, paint's … menu.
// <BugReportHost> (root.tsx) also starts the capture for signed-in people (lib/bugs/capture.ts).
import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useMatches, useRouteLoaderData } from "react-router";
import { focusStep } from "./confirm";
import { openerNow, type Opener } from "./ConfirmDialog";
import { captured, captureRoute, gzipJson, recordingAllowed, startCapture } from "~/lib/bugs/capture";
import { buildState } from "~/lib/bugs/state";
import { LIMITS } from "~/lib/bugs/report";

const OPEN = "inkit:report-bug";

/** Open the report dialog (signed in only; otherwise nothing happens). */
export function openBugReport() {
  window.dispatchEvent(new Event(OPEN));
}

/** The menu item, for the site's menus. */
export function ReportBugItem({ onClick, className }: { onClick?: () => void; className?: string }) {
  return <button type="button" role="menuitem" className={className} onClick={() => { onClick?.(); openBugReport(); }}>Report a bug</button>;
}

export function BugReportHost() {
  const me = useRouteLoaderData("root") as { me?: { id: string } | null } | undefined;
  const signedIn = !!me?.me;
  const { pathname } = useLocation();
  const [open, setOpen] = useState<{ n: number; opener: Opener } | null>(null);
  useEffect(() => { if (signedIn) startCapture(); }, [signedIn]);
  useEffect(() => { captureRoute(pathname); }, [pathname]);
  useEffect(() => {
    const show = () => { if (signedIn) setOpen((o) => ({ n: (o?.n ?? 0) + 1, opener: openerNow() })); };
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, [signedIn]);
  if (!open) return null;
  return <BugReportDialog key={open.n} opener={open.opener} onClose={() => setOpen(null)} />;
}

const FOCUSABLE = "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href]";

function BugReportDialog({ opener, onClose }: { opener: Opener; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const matches = useMatches();
  const location = useLocation();
  const [what, setWhat] = useState("");
  const [expected, setExpected] = useState("");
  const canRecord = recordingAllowed() && captured().events.length > 1;
  const [withReplay, setWithReplay] = useState(canRecord);
  const [withShot, setWithShot] = useState(false);
  const [phase, setPhase] = useState<"edit" | "sending" | "sent">("edit");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    first.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      const back = opener.trigger?.isConnected ? opener.trigger : opener.menuButton?.isConnected ? opener.menuButton : null;
      back?.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    e.stopPropagation();   // paint's shortcuts wait while typing here
    if (e.key !== "Tab") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const next = focusStep(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
    if (next < 0) return;
    e.preventDefault();
    items[next].focus();
  };

  const send = async () => {
    if (!what.trim() || phase !== "edit") return;
    setPhase("sending");
    setError("");
    try {
      const { events, logs, fails } = captured();
      const state = { ...buildState(matches.map((m) => ({ id: m.id, data: m.loaderData })), location), logs, fails };
      const form = new FormData();
      form.set("what", what);
      form.set("expected", expected);
      form.set("state", JSON.stringify(state));
      if (withReplay && events.length > 1) {
        const gz = await gzipJson(events);
        if (gz.size <= LIMITS.replay) form.set("replay", new File([gz], "replay.json.gz", { type: "application/gzip" }));
      }
      if (withShot) {
        const shot = await screenshot();
        if (shot && shot.size <= LIMITS.screenshot) form.set("screenshot", new File([shot], "screenshot.jpeg", { type: "image/jpeg" }));
      }
      // the browser tests' own verdict (bugs.server.ts: development only), so they never call Claude
      const given = (window as { __inkitGivenVerdict?: string }).__inkitGivenVerdict;
      if (given) form.set("given-verdict", given);
      const res = await fetch("/bugs", { method: "POST", body: form });
      const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || `That didn't send (${res.status}). Try again.`);
      setPhase("sent");
    } catch (e) {
      setError((e as Error).message);
      setPhase("edit");
    }
  };

  return (
    <dialog ref={ref} className="confirm bug-dialog" aria-modal="true" aria-labelledby={`${id}-title`}
      onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={onKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {phase === "sent" ? (
        <div className="confirm-box">
          <h2 id={`${id}-title`}>Thanks, we got it</h2>
          <div className="confirm-body"><p>We read every report. If it&rsquo;s a bug, we&rsquo;ll fix it.</p></div>
          <div className="confirm-acts"><button ref={(b) => b?.focus()} type="button" className="btn primary" onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <form className="confirm-box" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <h2 id={`${id}-title`}>Report a bug</h2>
          <label className="confirm-field">What went wrong?
            <textarea ref={first} rows={4} required maxLength={LIMITS.what} value={what} onChange={(e) => setWhat(e.target.value)}
              placeholder="What you did, and what happened" />
          </label>
          <label className="confirm-field"><span>What did you expect? <span className="bug-optional">(optional)</span></span>
            <textarea rows={2} maxLength={LIMITS.expected} value={expected} onChange={(e) => setExpected(e.target.value)} />
          </label>
          <label className="bug-check">
            <input type="checkbox" checked={withReplay && canRecord} disabled={!canRecord} onChange={(e) => setWithReplay(e.target.checked)} />
            <span>Include a recording of the last 2 minutes
              <small>{canRecord
                ? "Clicks, scrolling and the screen. What you typed is hidden."
                : "No recording yet, or it's off in Settings."}</small></span>
          </label>
          <label className="bug-check">
            <input type="checkbox" checked={withShot} onChange={(e) => setWithShot(e.target.checked)} />
            <span>Include a screenshot</span>
          </label>
          <p className="bug-note">We also send the page address, your browser and screen size, and recent errors. Only the inkit team sees it.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="confirm-acts">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={!what.trim() || phase === "sending"}>{phase === "sending" ? "Sending…" : "Send"}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** The viewport as a JPEG, without the dialog (html-to-image, loaded only when asked for). */
async function screenshot(): Promise<Blob | null> {
  try {
    const { toBlob } = await import("html-to-image");
    const options = {
      width: window.innerWidth, height: window.innerHeight, type: "image/jpeg", quality: 0.8, pixelRatio: Math.min(window.devicePixelRatio, 2),
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
      filter: (node: HTMLElement) => !(node instanceof HTMLDialogElement),
    };
    // fonts from Google can fail to embed; then without them
    return await toBlob(document.body, options).catch(() => toBlob(document.body, { ...options, skipFonts: true }));
  } catch { return null; }
}
