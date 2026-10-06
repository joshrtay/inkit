// Light / dark mode. "auto" follows the device. The choice is saved in this browser and
// applied as <html data-theme="..."> (global.css keys its dark tokens off that); Base.astro
// also applies it with an inline script in <head>, before the page draws, so there's no flash.
export type Theme = "light" | "dark" | "auto";
const KEY = "wyattsgames:theme";

export function theme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

export function setTheme(t: Theme) {
  try {
    if (t === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* storage blocked: still switch for this page */ }
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
