// The site's frame, in the manner of Substack: a left nav on wide screens (Subscriptions, Explore,
// Profile, Create, and More at the bottom) and a bottom tab bar on phones, around the page.
// Signed out, the same places: Subscriptions, Profile and Create open the sign-in dialog
// (SignInDialog.tsx), Explore is home ("/"), and Sign in takes More's place.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { authClient } from "~/lib/auth-client";
import { Avatar } from "./Avatar";
import { ReportBugItem } from "./BugReport";
import { SignInButton } from "./SignInDialog";

export interface Me { id: string; handle: string; name: string; isAdmin: boolean }

const PATHS = {
  feed: ["M4 13h4l2 3h4l2-3h4", "M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"],
  explore: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
  guide: ["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z", "M4 21V5", "M8 7h7", "M8 11h5"],
  plus: ["M12 5v14", "M5 12h14"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  more: ["M4 7h16", "M4 12h16", "M4 17h16"],
  signin: ["M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4", "M10 16l4-4-4-4", "M14 12H4"],
} as const;
export const Icon = ({ name }: { name: keyof typeof PATHS }) => (
  <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{PATHS[name].map((d) => <path key={d} d={d} />)}</svg>
);

/** Create: a new puzzle from a drawing. (Studios, shared collections, come back later.) */
export function CreateMenu({ className = "" }: { className?: string }) {
  return <Link className={`btn primary create-btn ${className}`} to="/new"><Icon name="plus" /><span>Create</span></Link>;
}

/** More: a menu that opens upward from its button, over the Puzzle types link above it, after Substack's. */
function MoreMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  // a click anywhere else, or Escape, closes it
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="account" ref={box}>
      {open && (
        <div className="menu up more-menu" role="menu">
          <Link role="menuitem" to="/settings">Settings</Link>
          <ReportBugItem onClick={() => setOpen(false)} />
          <button role="menuitem" type="button" onClick={async () => { await authClient.signOut(); location.href = "/"; }}>Sign out</button>
          <div className="menu-legal"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
        </div>
      )}
      <button className="nav-item" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="more" /><span>More</span></button>
    </div>
  );
}

export function SideNav({ me }: { me: Me | null }) {
  const { pathname } = useLocation();
  const onProfile = !!me && (pathname === `/${me.handle}` || pathname.startsWith(`/${me.handle}/`));
  // signed out, home is Explore
  const onExplore = !me && (pathname === "/" || pathname === "/explore" || pathname.startsWith("/explore/"));
  return (
    <nav className="sidenav" aria-label="Main">
      <Link className="brand" to="/">inkit</Link>
      <div className="nav-items">
        {me ? <NavLink className="nav-item" to="/" end><Icon name="feed" /><span>Subscriptions</span></NavLink>
          : <SignInButton why="subscriptions" className="nav-item"><Icon name="feed" /><span>Subscriptions</span></SignInButton>}
        {me ? <NavLink className="nav-item" to="/explore"><Icon name="explore" /><span>Explore</span></NavLink>
          : <Link className={`nav-item${onExplore ? " active" : ""}`} to="/" aria-current={onExplore ? "page" : undefined}><Icon name="explore" /><span>Explore</span></Link>}
        {me ? <Link className={`nav-item${onProfile ? " active" : ""}`} to={`/${me.handle}`}><Avatar name={me.name} seed={me.handle} size={26} /><span>Profile</span></Link>
          : <SignInButton why="profile" className="nav-item"><Icon name="user" /><span>Profile</span></SignInButton>}
      </div>
      {me ? <CreateMenu /> : <SignInButton why="create" className="btn primary create-btn"><Icon name="plus" /><span>Create</span></SignInButton>}
      {/* at the bottom: the puzzle types, then More (which opens over them) or Sign in */}
      <div className="nav-foot">
        <NavLink className="nav-item" to="/puzzles"><Icon name="guide" /><span>Puzzle types</span></NavLink>
        {me ? <MoreMenu /> : (
          <>
            <SignInButton why="signin" className="nav-item"><Icon name="signin" /><span>Sign in</span></SignInButton>
            <p className="nav-legal"><Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link></p>
          </>
        )}
      </div>
    </nav>
  );
}

/** Phones: the same places as tabs along the bottom. */
export function TabBar({ me }: { me: Me | null }) {
  const { pathname } = useLocation();
  const onExplore = !me && (pathname === "/" || pathname === "/explore" || pathname.startsWith("/explore/"));
  if (!me) return (
    <nav className="tabbar" aria-label="Main">
      <SignInButton why="subscriptions"><Icon name="feed" /><span>Feed</span></SignInButton>
      <Link to="/" className={onExplore ? "active" : undefined} aria-current={onExplore ? "page" : undefined}><Icon name="explore" /><span>Explore</span></Link>
      <SignInButton why="create" className="tab-create"><Icon name="plus" /><span>Create</span></SignInButton>
      <NavLink to="/puzzles"><Icon name="guide" /><span>Types</span></NavLink>
      <SignInButton why="profile"><Icon name="user" /><span>Profile</span></SignInButton>
    </nav>
  );
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end><Icon name="feed" /><span>Feed</span></NavLink>
      <NavLink to="/explore"><Icon name="explore" /><span>Explore</span></NavLink>
      <NavLink to="/new" className="tab-create"><Icon name="plus" /><span>Create</span></NavLink>
      <NavLink to="/puzzles"><Icon name="guide" /><span>Types</span></NavLink>
      <NavLink to={`/${me.handle}`}><Avatar name={me.name} seed={me.handle} size={24} /><span>Profile</span></NavLink>
    </nav>
  );
}
