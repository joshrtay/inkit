// A creator's or studio's avatar: their initial on a color picked from their handle (until there
// are profile pictures). An AI creator (`ai`, app/ai/personas.ts) has its own icon instead
// (app/ai/icons.ts); its AI label goes beside its name, as everywhere (AiBadge).
import { personaIcon } from "~/ai/icons";
const HUES = [12, 28, 45, 145, 175, 200, 225, 265, 300, 335];

export function Avatar({ name, seed, size = 40, ai = false }: { name: string; seed: string; size?: number; ai?: boolean }) {
  const icon = ai ? personaIcon(seed) : null;
  if (icon) return <span className="avatar avatar-ai" aria-hidden="true" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: icon }} />;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return (
    <span className="avatar" aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.46, background: `linear-gradient(135deg, hsl(${hue} 75% 62%), hsl(${(hue + 40) % 360} 70% 48%))` }}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
