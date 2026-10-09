// What a bug report says about the page (docs/bug-pipeline.md): the route, the build, the browser,
// and the puzzle the person was on. Pages that hold state the loaders don't (paint's live drawing)
// can register a getter here; paint's drawing is also read from the copy it keeps in this browser.

/** The commit this build was made from (vite.config.ts injects it). */
export const BUILD_VERSION: string = typeof __BUILD_SHA__ === "string" ? __BUILD_SHA__ : "dev";

type Getter = () => unknown;
const registry = new Map<string, Getter>();

/** A page's live state for bug reports: `const off = registerBugState("paint", () => ({...}))`;
 *  call `off()` when the page goes. */
export function registerBugState(name: string, get: Getter): () => void {
  registry.set(name, get);
  return () => { if (registry.get(name) === get) registry.delete(name); };
}

interface Match { id: string; data: unknown }

const readJson = (key: string): unknown => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
};

/** The state sent with a report, built from the route's loader data, this browser's copies, and
 *  the registry. No account details: the server knows who sent it. */
export function buildState(matches: Match[], location: { pathname: string }) {
  const by = (id: string) => matches.find((m) => m.id === id)?.data as Record<string, unknown> | undefined;
  const game: Record<string, unknown> = {};
  let gameId: string | null = null;

  const draw = by("routes/game-draw");
  if (draw) {
    const g = draw.game as { id: string; title?: string } | undefined;
    gameId = g?.id ?? null;
    // paint's own copy (Paint.tsx keeps it on every change): the drawing as it is now
    const live = gameId ? readJson(`inkit:draw:${gameId}`) as { drawing?: unknown; genre?: unknown; settings?: unknown; dirty?: boolean } | null : null;
    const saved = draw.saved as { drawing?: unknown; genre?: unknown; settings?: unknown } | null;
    Object.assign(game, {
      page: "paint",
      kind: live?.genre ?? saved?.genre ?? null,
      drawing: live?.drawing ?? saved?.drawing ?? null,
      settings: live?.settings ?? saved?.settings ?? null,
      unsaved: !!live?.dirty,
    });
  }
  const play = by("routes/game");
  if (play) {
    const g = play.game as { id: string; kind?: string; state?: string } | undefined;
    gameId = g?.id ?? null;
    Object.assign(game, {
      page: "player", kind: g?.kind ?? null, state: g?.state ?? null,
      spec: (play.play as { spec?: unknown } | null)?.spec ?? null,
      errors: play.errors ?? [],
      progress: gameId ? readJson(`game:${gameId}`) : null,
    });
  }
  const publish = by("routes/game-publish");
  if (publish) {
    const g = publish.game as { id: string; kind?: string } | undefined;
    gameId = g?.id ?? null;
    Object.assign(game, { page: "publish", kind: g?.kind ?? null, spec: (publish.play as { spec?: unknown } | null)?.spec ?? null });
  }
  const registered: Record<string, unknown> = {};
  for (const [name, get] of registry) { try { registered[name] = get(); } catch (e) { registered[name] = { error: String(e) }; } }

  return {
    route: location.pathname,
    version: BUILD_VERSION,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    colorScheme: document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    gameId,
    game: gameId ? game : null,
    registered,
  };
}
