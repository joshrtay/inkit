// Something happens the moment a link or button is clicked, while the next page loads: a thin pen
// line across the top of the page (after a tenth of a second, so quick pages don't flash it), and
// the link or button that was clicked marked pending (`data-pending`, styled in shell.css).
import { useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";

/** Wait this long before showing the line: most quick navigations are done by then. */
const DELAY = 100;

export function NavProgress() {
  const busy = useNavigation().state !== "idle";
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  // what was last clicked (a link, or a form's submit button), to mark it pending
  const last = useRef<{ el: Element; at: number } | null>(null);
  const marked = useRef<Element | null>(null);

  useEffect(() => {
    const note = (el: Element | null) => { if (el) last.current = { el, at: performance.now() }; };
    const click = (e: MouseEvent) => note((e.target as Element | null)?.closest?.("a[href], button") ?? null);
    const submit = (e: SubmitEvent) => note(e.submitter ?? (e.target as Element));
    addEventListener("click", click, true);
    addEventListener("submit", submit, true);
    return () => { removeEventListener("click", click, true); removeEventListener("submit", submit, true); };
  }, []);

  useEffect(() => {
    if (busy) {
      const l = last.current;
      if (l && performance.now() - l.at < 1000 && l.el.isConnected) { l.el.setAttribute("data-pending", ""); marked.current = l.el; }
      last.current = null;
      const t = setTimeout(() => setPhase("loading"), DELAY);
      return () => clearTimeout(t);
    }
    marked.current?.removeAttribute("data-pending");
    marked.current = null;
    setPhase((p) => (p === "loading" ? "done" : "idle"));
  }, [busy]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 450);
    return () => clearTimeout(t);
  }, [phase]);

  return <div className="nav-progress" data-state={phase} aria-hidden="true" />;
}
