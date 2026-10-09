// The bug reporter's capture, in the browser (docs/bug-pipeline.md). For signed-in people only, it
// keeps in memory: an rrweb recording of the last one to two minutes of the page (inputs and form
// text masked, [data-private] blocked, nothing recorded on private pages), the last console errors
// and the last failed fetches. Nothing leaves the browser unless the person sends a report.
// rrweb loads only once the page is idle, so it never slows the first paint.
import { fetchPath, logLine, ReplayBuffer, Ring, type FailedFetch } from "./ring";

/** One minute a segment, two kept: the last 1–2 minutes. */
export const CHECKOUT_MS = 60_000;
/** Settings' switch: "inkit:no-recording" = "1" turns the recording off in this browser. */
const OPT_OUT = "inkit:no-recording";
/** Pages never recorded: settings (email, handle), and signing in or resetting a password. */
const PRIVATE = /^\/(settings|signin|signup|forgot-password|reset-password)(\/|$)|^\/[^/]+\/settings$/;
/** Never recorded at all (shown as a grey box in the replay): the report dialog, private regions. */
export const BLOCKED = "[data-private], .bug-dialog";

export interface LogEntry { at: number; level: "error" | "warn"; text: string }

const replay = new ReplayBuffer<unknown>(2);
const logs = new Ring<LogEntry>(50);
const fails = new Ring<FailedFetch>(30);
let started = false;
let paused = false;
let stopRecording: (() => void) | undefined;
let snapshot: ((isCheckout?: boolean) => void) | undefined;

export function recordingAllowed(): boolean {
  try { return localStorage.getItem(OPT_OUT) !== "1"; } catch { return true; }
}
export function setRecordingAllowed(on: boolean) {
  try { if (on) localStorage.removeItem(OPT_OUT); else localStorage.setItem(OPT_OUT, "1"); } catch { /* this visit only */ }
  if (!on) { stopRecording?.(); stopRecording = undefined; replay.clear(); }
  else if (started && !stopRecording) startRecording();
}

/** Start keeping the buffers (root.tsx, once someone is signed in). */
export function startCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  tapConsole();
  tapFetch();
  paused = PRIVATE.test(location.pathname);
  if (recordingAllowed()) startRecording();
}

/** The page changed (a client-side navigation): stop recording on private pages, and start again
 *  with a fresh snapshot when leaving one. */
export function captureRoute(pathname: string) {
  const now = PRIVATE.test(pathname);
  if (paused && !now) { paused = false; snapshot?.(true); }
  paused = now;
}

/** What a report sends: the replay's events (if asked for), the logs and the failed fetches. */
export function captured() {
  return { events: replay.events(), logs: logs.list(), fails: fails.list(), recording: !!stopRecording };
}

function startRecording() {
  const begin = () => {
    void import("@rrweb/record").then(({ record }) => {
      if (stopRecording || !recordingAllowed()) return;
      stopRecording = record({
        emit(event, isCheckout) { if (!paused) replay.push(event, isCheckout); },
        checkoutEveryNms: CHECKOUT_MS,
        maskAllInputs: true,
        // text inside form fields of any kind, and anything marked private
        maskTextSelector: "input, textarea, select, [contenteditable], [data-private]",
        blockSelector: BLOCKED,
        // styles inlined, so the replay still looks right after a deploy changes the CSS files
        inlineStylesheet: true,
        recordCanvas: false,
        collectFonts: false,
        sampling: { mousemove: 100, scroll: 150, input: "last" },
      }) ?? undefined;
      snapshot = record.takeFullSnapshot;
    }).catch(() => { /* no recording; the report still sends logs and state */ });
  };
  const idle = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(begin, { timeout: 4000 }); else setTimeout(begin, 1500);
}

function tapConsole() {
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try { logs.push({ at: Date.now(), level, text: logLine(args) }); } catch { /* never break logging */ }
      original(...args);
    };
  }
  window.addEventListener("error", (e) => logs.push({ at: Date.now(), level: "error", text: logLine([e.error ?? e.message]) }));
  window.addEventListener("unhandledrejection", (e) => logs.push({ at: Date.now(), level: "error", text: logLine(["Unhandled rejection:", e.reason]) }));
}

function tapFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    try {
      const res = await original(input, init);
      if (!res.ok) fails.push({ at: Date.now(), method, path: fetchPath(url, location.origin), status: res.status });
      return res;
    } catch (e) {
      fails.push({ at: Date.now(), method, path: fetchPath(url, location.origin), status: 0 });
      throw e;
    }
  };
}

/** JSON, gzipped in the browser (the replay is mostly repeated markup, so it shrinks ~10×). */
export async function gzipJson(value: unknown): Promise<Blob> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}
