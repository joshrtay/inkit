// A card's ⋮ (a puzzle's or a set's), at the bottom right: what you can do with it without opening
// it. A puzzle: Add to set (signed out: sign in first), Copy link; a set: Copy link. While a set is
// open in the drawer (components/SetDrawer.tsx) a puzzle's ⋮ is a + instead, one tap to add it
// (✓ once it's in). More goes in the menu later (Report a problem, …).
import { useEffect, useRef, useState } from "react";
import { useRouteLoaderData } from "react-router";
import { useSetDrawer } from "./SetDrawer";
import { SignInButton } from "./SignInDialog";

export function CardMore({ kind, id, title }: { kind: "puzzle" | "set"; id: string; title: string }) {
  const drawer = useSetDrawer();
  const root = useRouteLoaderData("root") as { me: { handle: string } | null } | undefined;
  const signedIn = !!root?.me;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".signin-dialog")) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("pointerdown", away); addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", esc); };
  }, [open]);

  // building a set: the corner adds
  if (kind === "puzzle" && drawer?.set && drawer.shown) {
    const inSet = drawer.has(id), name = drawer.set.set.title;
    return (
      <span className="card-more">
        <button type="button" className={`card-add${inSet ? " in" : ""}`} disabled={inSet}
          aria-label={inSet ? `${title} is in ${name}` : `Add ${title} to ${name}`} title={inSet ? "In the set" : `Add to ${name}`}
          onClick={(e) => { e.preventDefault(); drawer.add(id); }}>{inSet ? "✓" : "+"}</button>
      </span>
    );
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/${kind === "set" ? "s" : "g"}/${id}`); setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 900); }
    catch { setOpen(false); }
  };
  return (
    <span className="card-more" ref={box}>
      <button type="button" className="card-more-btn" aria-label={`More for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {open && (
        <span className="menu up" role="menu">
          {kind === "puzzle" && (signedIn && drawer
            ? <button type="button" role="menuitem" onClick={() => { setOpen(false); drawer.pick(id); }}>Add to set</button>
            : <SignInButton why="sets" role="menuitem">Add to set</SignInButton>)}
          <button type="button" role="menuitem" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>
        </span>
      )}
    </span>
  );
}
