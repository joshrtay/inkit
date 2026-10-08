// The site's look: light, dark (the default) or auto (the device's), kept in this browser. root.tsx
// applies it before the page draws; Settings > Appearance changes it.
export type Theme = "light" | "dark" | "auto";
const KEY = "inkit:theme";

export function savedTheme(): Theme {
  try { const t = localStorage.getItem(KEY); return t === "light" || t === "auto" ? t : "dark"; } catch { return "dark"; }
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* this visit only */ }
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
