// The set drawer: a draft set open beside the page while you browse (docs/research-curation.md,
// "Making sets"). No set is "pinned": the drawer being open is the only current set, kept for this
// browser tab. While it's open every puzzle card has a + that adds to it, and on a puzzle's page the
// drawer offers that puzzle; the drawer is also where the set is named, put in order and published.
// It hides (but stays open) on pages that aren't for browsing puzzles, and gives way to How to play.
// On a phone it's a sheet, opened from the toast after adding or from a puzzle's ⋯.
//
// Server: routes/api.sets.ts (/api/sets: your drafts; make one), routes/api.set.ts (/api/sets/<id>: one draft).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useRouteLoaderData } from "react-router";
import { Link } from "~/components/Link";
import { useConfirm } from "./ConfirmDialog";
import { Picture } from "./GameCard";
import { SetCover } from "./SetCard";

export const SET_DRAWER_EVENT = "inkit:set-drawer";
/** How to play and the drawer share the right-hand side: each says when it opens. */
export const GUIDE_EVENT = "inkit:guide";

/** Open the drawer on a draft set (its author's): a set's Edit. */
export const openSetDrawer = (setId: string) => window.dispatchEvent(new CustomEvent(SET_DRAWER_EVENT, { detail: setId }));
/** A set changed somewhere else (its own page): the drawer, if it's on that set, reads it again. */
export const SET_CHANGED_EVENT = "inkit:set-changed";
export const setChanged = (setId: string) => window.dispatchEvent(new CustomEvent(SET_CHANGED_EVENT, { detail: setId }));

interface DrawerPuzzle { id: string; title: string; picture: string | null; by: string; ai: boolean; level: number | null; minutes: number | null }
interface DrawerData { set: { id: string; title: string; description: string; state: string }; puzzles: DrawerPuzzle[]; summary: { count: number; minutes: number; level: number }; error?: string | null }
interface DraftSet { id: string; title: string; count: number; cover: (string | null)[] }

interface Ctx {
  /** the open set, if any (hidden or not) */
  set: DrawerData | null;
  /** the drawer is showing here (a browsing page, How to play closed) */
  shown: boolean;
  /** this puzzle is in the open set */
  has: (gameId: string) => boolean;
  /** add to the open set (one tap: the + on a card) */
  add: (gameId: string) => void;
  /** "Add to set": choose a draft set (or make one) for this puzzle */
  pick: (gameId: string) => void;
  /** Create → Set */
  create: () => void;
  /** a puzzle's page tells the drawer which puzzle it's on */
  setCurrent: (p: { id: string; title: string } | null) => void;
  /** phones: open the set as a sheet */
  openSheet: () => void;
  /** Add puzzles: open the drawer on this draft and go find puzzles (your own, on Explore) */
  gather: (setId: string) => void;
}
const DrawerCtx = createContext<Ctx | null>(null);
export const useSetDrawer = () => useContext(DrawerCtx);

const KEY = "inkit:set-drawer";
const store = {
  get: () => { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set: (v: string | null) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* this page only */ } },
};

/** Pages for browsing puzzles, where the drawer shows: home (the feed), Explore, a type's page, a
 *  puzzle, someone else's set, a profile. Not settings, paint, publishing, signing in, legal, admin. */
const NOT_BROWSING = new Set(["settings", "account", "new", "signin", "signup", "forgot-password", "reset-password", "privacy", "terms", "admin", "studios", "puzzles"]);
export function isBrowsing(pathname: string, openSet: string | null) {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return true;
  if (parts[0] === "explore") return true;
  if (parts[0] === "g") return parts.length === 2;
  if (parts[0] === "s") return parts.length === 2 && parts[1] !== openSet;   // its own page already shows it
  return parts.length === 1 && !NOT_BROWSING.has(parts[0]);
}

/** Load or change a draft through its resource route (JSON). */
async function call<T>(url: string, body?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, body ? { method: "POST", body: new URLSearchParams(body) } : undefined);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

export function SetDrawerProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const me = (useRouteLoaderData("root") as { me: { handle: string } | null } | undefined)?.me ?? null;
  // where to find puzzles for a set: your own, on Explore (remove the filter to see everyone's)
  const yours = me ? `/explore/all?by=${me.handle}` : "/explore";
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<DrawerData | null>(null);
  const [guide, setGuide] = useState(false);
  const [current, setCurrent] = useState<{ id: string; title: string } | null>(null);
  const [picker, setPicker] = useState<{ gameId: string | null; sets: DraftSet[] | null } | null>(null);
  const [toast, setToast] = useState<{ text: string; view?: string } | null>(null);
  const [sheet, setSheet] = useState(false);
  // the page a set was just opened on (made, chosen, Edit): the drawer shows there whatever the page
  const [here, setHere] = useState<string | null>(null);
  const { ask } = useConfirm();

  const load = useCallback(async (id: string) => {
    const d = await call<DrawerData>(`/api/sets/${id}`);
    if (!d || d.set.state !== "draft") { setOpenId(null); setData(null); store.set(null); return; }
    setOpenId(id); setData(d); store.set(id);
  }, []);
  // the tab's open set, after a reload or on the next page
  useEffect(() => { if (!signedIn) return; const id = store.get(); if (id) void load(id); }, [signedIn, load]);
  useEffect(() => {
    const open = (e: Event) => { setHere(location.pathname); void load((e as CustomEvent<string>).detail).then(() => setSheet(true)); setGuide(false); };
    const g = (e: Event) => setGuide(!!(e as CustomEvent<boolean>).detail);
    const changed = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (id === store.get()) void load(id); };
    addEventListener(SET_DRAWER_EVENT, open); addEventListener(GUIDE_EVENT, g); addEventListener(SET_CHANGED_EVENT, changed);
    return () => { removeEventListener(SET_DRAWER_EVENT, open); removeEventListener(GUIDE_EVENT, g); removeEventListener(SET_CHANGED_EVENT, changed); };
  }, [load]);
  useEffect(() => setSheet(false), [pathname]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const change = useCallback(async (body: Record<string, string>) => {
    if (!openId) return null;
    const d = await call<DrawerData>(`/api/sets/${openId}`, body);
    if (d) setData(d);
    return d;
  }, [openId]);
  const close = () => { setOpenId(null); setData(null); store.set(null); setSheet(false); };

  const addTo = useCallback(async (setId: string, gameId: string) => {
    const d = await call<DrawerData>(`/api/sets/${setId}`, { intent: "add", game: gameId });
    if (!d) { setToast({ text: "Couldn't add it. Try again." }); return; }
    setHere(location.pathname);
    setOpenId(setId); setData(d); store.set(setId);
    dispatchEvent(new CustomEvent(GUIDE_EVENT + ":close"));
    setToast({ text: `Added to ${d.set.title} · ${d.summary.count}` });
  }, []);
  const add = useCallback((gameId: string) => { if (openId) void addTo(openId, gameId); }, [openId, addTo]);
  const pick = useCallback(async (gameId: string | null) => {
    setPicker({ gameId, sets: null });
    const r = await call<{ sets: DraftSet[] }>("/api/sets");
    setPicker({ gameId, sets: r?.sets ?? [] });
  }, []);
  const make = useCallback(async (gameId: string | null) => {
    setPicker(null);
    const title = await ask({ title: "New set", action: "Make set", field: { label: "Name", required: true, maxLength: 80, line: true } });
    if (!title) return;
    const r = await call<{ id: string }>("/api/sets", { title, ...(gameId ? { game: gameId } : {}) });
    if (!r) { setToast({ text: "Couldn't make the set. Try again." }); return; }
    await load(r.id);
    dispatchEvent(new CustomEvent(GUIDE_EVENT + ":close"));
    if (gameId) {
      // made from a puzzle: stay where you are, with it in
      setHere(location.pathname); setSheet(true);
      setToast({ text: `Added to ${title} · 1` });
    } else navigate(yours);   // an empty set: go find puzzles for it
  }, [ask, load, navigate, yours]);

  const shown = !!data && (isBrowsing(pathname, openId) || pathname === here) && !guide;
  const ids = useMemo(() => new Set(data?.puzzles.map((p) => p.id) ?? []), [data]);
  const ctx: Ctx = {
    set: data, shown, has: (g) => ids.has(g), add, pick: (g) => void pick(g), create: () => void make(null),
    setCurrent, openSheet: () => setSheet(true),
    gather: (id) => { void load(id); navigate(yours); },
  };
  useEffect(() => { document.documentElement.classList.toggle("set-drawer-open", shown); }, [shown]);

  return (
    <DrawerCtx.Provider value={ctx}>
      {children}
      {data && shown && <Drawer data={data} current={current} sheet={sheet} change={change} add={add} close={close} closeSheet={() => setSheet(false)}
        published={(title, id) => { close(); setToast({ text: `Published · ${title}`, view: `/s/${id}` }); }} />}
      {picker && <Picker state={picker} choose={(id) => { const g = picker.gameId; setPicker(null); if (g) void addTo(id, g); else { setHere(location.pathname); void load(id).then(() => setSheet(true)); } }} make={() => void make(picker.gameId)} cancel={() => setPicker(null)} />}
      {toast && (
        <div className="set-toast" role="status">
          <button type="button" className="set-toast-text" onClick={() => { if (!toast.view && data) setSheet(true); setToast(null); }}>{toast.text}</button>
          {toast.view ? <Link to={toast.view} onClick={() => setToast(null)}>View</Link>
            : current && data && <button type="button" onClick={() => { setToast(null); void pick(current.id); }}>Change</button>}
        </div>
      )}
    </DrawerCtx.Provider>
  );
}

function Drawer({ data, current, sheet, change, add, close, closeSheet, published }: {
  data: DrawerData; current: { id: string; title: string } | null; sheet: boolean;
  change: (b: Record<string, string>) => Promise<DrawerData | null>; add: (g: string) => void; close: () => void; closeSheet: () => void;
  published: (title: string, id: string) => void;
}) {
  const { confirm } = useConfirm();
  const [title, setTitle] = useState(data.set.title);
  const [desc, setDesc] = useState(data.set.description);
  useEffect(() => { setTitle(data.set.title); setDesc(data.set.description); }, [data.set.id, data.set.title, data.set.description]);
  const drag = useRef<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const { puzzles, summary } = data;
  const here = current ? puzzles.findIndex((p) => p.id === current.id) : -1;
  const save = (k: "title" | "description", v: string) => { if (v !== (k === "title" ? data.set.title : data.set.description)) void change({ intent: "describe", [k]: v }); };
  const publish = async () => {
    const yes = await confirm({ title: `Publish “${data.set.title}”?`, body: <p>{summary.count} puzzle{summary.count === 1 ? "" : "s"}. After you publish, the puzzles and their order stay as they are.</p>, action: "Publish" });
    if (!yes) return;
    const d = await change({ intent: "publish" });
    if (d && !d.error) published(d.set.title, d.set.id);
  };
  return (
    <aside className={`set-drawer${sheet ? " sheet-open" : ""}`} aria-label="Set">
      <div className="set-drawer-head">
        <span className="state draft">Draft</span>
        <button type="button" className="set-drawer-close" aria-label="Close the set" onClick={() => (sheet ? closeSheet() : close())}>×</button>
      </div>
      <div className="set-drawer-title">
        <SetCover cover={puzzles.slice(0, 4).map((p) => p.picture)} className="set-drawer-cover" />
        <input aria-label="Name" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} onBlur={() => save("title", title)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      </div>
      <textarea className="set-drawer-desc" aria-label="Description" placeholder="Description (optional)" rows={2} maxLength={280} value={desc}
        onChange={(e) => setDesc(e.target.value)} onBlur={() => save("description", desc)} />
      <p className="set-drawer-count"><strong>{summary.count} puzzle{summary.count === 1 ? "" : "s"}</strong>{summary.minutes > 0 && <> · ~{summary.minutes} min</>}</p>
      <ol className="set-drawer-list" onDragOver={(e) => e.preventDefault()}>
        {puzzles.map((p, i) => (
          <li key={p.id} draggable className={`${i === here ? "here" : ""}${over === i ? " over" : ""}`}
            onDragStart={() => { drag.current = p.id; }} onDragEnter={() => setOver(i)} onDragEnd={() => { drag.current = null; setOver(null); }}
            onDrop={(e) => { e.preventDefault(); const g = drag.current; setOver(null); if (g && g !== p.id) void change({ intent: "move", game: g, to: String(i) }); }}
            title={`${p.by}${p.level ? ` · ${["", "Easy", "Medium", "Hard"][p.level]}` : ""}`}>
            <span className="grip" aria-hidden="true">⋮⋮</span>
            <span className="n">{i + 1}</span>
            <Picture svg={p.picture} className="mini" />
            <span className="t">{p.title}{i === here && <small>This puzzle</small>}</span>
            <span className="row-tools">
              <button type="button" aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => void change({ intent: "move", game: p.id, to: String(i - 1) })}>↑</button>
              <button type="button" aria-label={`Move ${p.title} down`} disabled={i === puzzles.length - 1} onClick={() => void change({ intent: "move", game: p.id, to: String(i + 1) })}>↓</button>
              <button type="button" aria-label={`Take ${p.title} out`} onClick={() => void change({ intent: "remove", game: p.id })}>×</button>
            </span>
          </li>
        ))}
        {current && here < 0 && (
          <li className="add-here"><button type="button" onClick={() => add(current.id)}>+ Add {current.title}</button></li>
        )}
      </ol>
      {data.error && <p className="error" role="alert">{data.error}</p>}
      <div className="set-drawer-foot">
        <button type="button" className="btn primary" disabled={!puzzles.length} onClick={() => void publish()}>Publish</button>
        <Link to={`/s/${data.set.id}`} className="set-drawer-page">Open set page</Link>
      </div>
    </aside>
  );
}

function Picker({ state, choose, make, cancel }: { state: { gameId: string | null; sets: DraftSet[] | null }; choose: (id: string) => void; make: () => void; cancel: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [cancel]);
  return (
    <div className="set-picker-back" onClick={cancel}>
      <div className="set-picker" role="dialog" aria-label="Add to set" onClick={(e) => e.stopPropagation()}>
        <h2>Add to set</h2>
        {state.sets === null ? <p className="muted">…</p> : (
          <ul>
            {state.sets.map((s) => (
              <li key={s.id}><button type="button" onClick={() => choose(s.id)}>
                <SetCover cover={s.cover} className="set-picker-cover" /><span><strong>{s.title}</strong><span className="muted">{s.count} puzzle{s.count === 1 ? "" : "s"}</span></span>
              </button></li>
            ))}
          </ul>
        )}
        <button type="button" className="btn" onClick={make}>+ New set</button>
      </div>
    </div>
  );
}
