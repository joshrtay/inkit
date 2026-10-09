// The site's tooltips: one layer for every button that has a `data-tip` (its name and shortcut; the
// button's accessible name stays its aria-label). A tooltip drawn inside its button's container (a
// CSS ::after, as they were) is caught by that container's stacking and overflow: under the
// palette, cut off by a scrolling panel. So there is one tooltip, in the page's top layer (the
// Popover API; a fixed box at the end of <body> where that's missing), placed beside its button by
// lib/place.ts: on the side the button (or a container, `data-tip-side`) asks for, flipped or slid
// to stay on screen.
//
// It shows on hover after a short wait (at once while moving from one button to the next) and on
// keyboard focus, never on touch; it goes on leaving, pressing, scrolling or Escape. Mounted once,
// in root.tsx.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { place, rectOf, type Side } from "~/lib/place";

const HOVER_WAIT = 450, FOCUS_WAIT = 150, WARM_FOR = 600;

export function TooltipLayer() {
  const box = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);   // in the browser, after hydrating: a portal needs <body>
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const tip = box.current;
    if (!tip) return;
    const popover = typeof tip.showPopover === "function";
    let shown: Element | null = null, waiting: ReturnType<typeof setTimeout> | undefined, warmUntil = 0;

    const hide = () => {
      clearTimeout(waiting);
      if (!shown) return;
      shown = null;
      warmUntil = Date.now() + WARM_FOR;
      delete tip.dataset.open;
      if (popover) { try { tip.hidePopover(); } catch { /* already hidden */ } }
    };
    const show = (el: Element) => {
      const text = el.getAttribute("data-tip");
      if (!text || !el.isConnected) return;
      shown = el;
      tip.textContent = text;
      if (popover) { try { tip.showPopover(); } catch { /* already showing */ } }
      tip.dataset.open = "";
      const side = (el.getAttribute("data-tip-side") ?? el.closest("[data-tip-side]")?.getAttribute("data-tip-side") ?? "bottom") as Side;
      const at = place(rectOf(el.getBoundingClientRect()), { w: tip.offsetWidth, h: tip.offsetHeight },
        { x: 0, y: 0, w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }, side, { gap: side === "left" || side === "right" ? 8 : 6 });
      tip.style.left = `${Math.round(at.x)}px`;
      tip.style.top = `${Math.round(at.y)}px`;
      tip.dataset.side = at.side;
    };
    const later = (el: Element, wait: number) => {
      clearTimeout(waiting);
      if (shown && shown !== el) hide();
      if (wait <= 0 || Date.now() < warmUntil) show(el);
      else waiting = setTimeout(() => show(el), wait);
    };
    const tipped = (t: EventTarget | null) => (t instanceof Element ? t.closest("[data-tip]") : null);

    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = tipped(e.target);
      if (el && el !== shown) later(el, HOVER_WAIT);
    };
    const out = (e: PointerEvent) => {
      const el = tipped(e.target);
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      if (el === shown || !shown) hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = tipped(e.target);
      if (el && e.target instanceof Element && e.target.matches(":focus-visible")) later(el, FOCUS_WAIT);
    };
    const focusOut = () => hide();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    // a button that changes its tip while it's shown (Undo's, Fewer / All tools): the new words
    const watch = new MutationObserver(() => { if (shown && shown.isConnected && shown.getAttribute("data-tip") !== tip.textContent) show(shown); else if (shown && !shown.isConnected) hide(); });
    watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-tip"], childList: true });

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    document.addEventListener("keydown", key);
    addEventListener("scroll", hide, true);
    addEventListener("wheel", hide, { passive: true });
    addEventListener("blur", hide);
    return () => {
      hide();
      watch.disconnect();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      document.removeEventListener("keydown", key);
      removeEventListener("scroll", hide, true);
      removeEventListener("wheel", hide);
      removeEventListener("blur", hide);
    };
  }, [mounted]);
  return !mounted ? null
    : createPortal(<div ref={box} className="tip-layer" role="tooltip" aria-hidden="true" popover="manual" />, document.body);
}
