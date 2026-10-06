// The GameHost a game talks to (see ../src/lib/game.ts): saving progress and reporting a solve.
// For now progress is saved in this browser; signed-in syncing comes later.
import type { GameHost } from "~site/lib/game-api";

export function createHost(id: string, onSolved?: () => void, ephemeral = false): GameHost {
  const key = `game:${id}`;
  if (ephemeral) return { id, load: () => null, save() {}, clear() {}, solved() { onSolved?.(); } };
  return {
    id,
    load<T>() {
      try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
    },
    save(state) { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* storage blocked */ } },
    clear() { try { localStorage.removeItem(key); } catch { /* storage blocked */ } },
    solved() { onSolved?.(); },
  };
}
