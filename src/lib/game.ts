import { noteSave } from "./account";

// The game interface (GameHost, MountGame, GameSolvedDetail) lives in ./game-api, so code that
// only needs the types doesn't pull in accounts and storage.
import type { GameHost, GameSolvedDetail } from "./game-api";
export type { GameHost, MountGame, GameSolvedDetail } from "./game-api";

export function createHost(id: string): GameHost {
  const key = `game:${id}`;
  return {
    id,
    load<T>() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;   // private mode or blocked storage: play without saving
      }
    },
    save(state) {
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
      noteSave(id);                     // timestamps the save and syncs it when logged in
    },
    clear() {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    },
    solved(result) {
      document.dispatchEvent(new CustomEvent<GameSolvedDetail>("game:solved", { detail: { id, result } }));
    },
  };
}
