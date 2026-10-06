// Light / dark mode. Dark is the default; "auto" follows the device. The choice is saved in
// this browser and applied as <html data-theme="light|dark"> ("auto" leaves it off, so the
// prefers-color-scheme rules in global.css decide). Base.astro also applies it with an
// inline script in <head>, before the page draws, so there's no flash.
export type Theme = "light" | "dark" | "auto";
const KEY = "wyattsgames:theme";

export function theme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "auto" ? t : "dark";
  } catch {
    return "dark";
  }
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked: still switch for this page */ }
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
