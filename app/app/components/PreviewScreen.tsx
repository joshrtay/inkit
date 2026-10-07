// The editor's Preview: the game's real page (routes/game-preview.tsx) in a frame, at desktop or
// phone width, under a bar with the choice of width on the left and Publish and Close on the
// right. The editor's version of the puzzle, title and description is sent into the frame, so
// unsaved changes show too.
import { useEffect, useRef, useState } from "react";

const WIDTH = "inkit:preview-width";

export function PreviewScreen({ gameId, sketch, title, description, onClose, onPublish, publishLabel }: {
  gameId: string; sketch: string; title: string; description: string;
  onClose: () => void;
  /** absent when there's nothing to publish */
  onPublish?: () => void;
  publishLabel: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidthNow] = useState<"desktop" | "mobile">(() => {
    try { return localStorage.getItem(WIDTH) === "mobile" ? "mobile" : "desktop"; } catch { return "desktop"; }
  });
  const setWidth = (w: "desktop" | "mobile") => { setWidthNow(w); try { localStorage.setItem(WIDTH, w); } catch { /* this time only */ } };

  // send the editor's version in when the page asks (it loads with the saved one), and on changes
  const send = () => frame.current?.contentWindow?.postMessage({ type: "inkit-preview", sketch, title, description }, location.origin);
  useEffect(() => {
    const ready = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === "inkit-preview-ready" && e.source === frame.current?.contentWindow) send(); };
    addEventListener("message", ready);
    return () => removeEventListener("message", ready);
  });
  useEffect(send, [sketch, title, description]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="preview-screen" role="dialog" aria-modal="true" aria-label="Preview">
      <header className="preview-bar">
        <div className="be-seg" role="group" aria-label="Preview width">
          <button type="button" className="be-btn" aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}>Desktop</button>
          <button type="button" className="be-btn" aria-pressed={width === "mobile"} onClick={() => setWidth("mobile")}>Mobile</button>
        </div>
        <span className="preview-label">Preview</span>
        <div className="preview-actions">
          {onPublish && <button type="button" className="btn primary" onClick={onPublish}>{publishLabel}</button>}
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </header>
      <div className={`preview-stage ${width}`}>
        <iframe ref={frame} src={`/g/${gameId}/preview`} title="Preview of the game's page" />
      </div>
    </div>
  );
}
