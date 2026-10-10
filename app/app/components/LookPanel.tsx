// How a puzzle looks, beyond its type's style (admins): ink, wash, grid, shading, symbols, region
// colors, and which marks the player draws. The options are in editor/coverage.ts.
import { genres, type GenreName } from "~site/engine/puzzle.ts";
import type { GridSpec, GridStyle, MarkKind } from "~site/engine/types.ts";
import { MARKS, STYLE } from "~/editor/coverage";

export function LookPanel({ spec, onChange }: { spec: GridSpec; onChange: (spec: GridSpec) => void }) {
  const genre = (spec.genre ?? "simple-loop") as GenreName;
  const style = spec.style ?? {};
  const set = (patch: Partial<GridSpec>) => onChange({ ...spec, ...patch });
  const setStyle = (k: keyof GridStyle, v: unknown) => {
    const next = { ...style, [k]: v };
    if (v === undefined || v === "") delete next[k];
    set({ style: Object.keys(next).length ? next : undefined });
  };
  return (
    <details className="ge-section">
      <summary>Look</summary>
      <div className="ge-look">
        {(Object.keys(STYLE) as (keyof GridStyle)[]).map((k) => {
          const def = STYLE[k], v = style[k];
          return (
            <label key={k}>{def.label}
              {def.type === "color" && (
                <span className="ge-inline">
                  <input type="color" value={typeof v === "string" ? v : "#26398f"} onChange={(e) => setStyle(k, e.target.value)} />
                  {v !== undefined && <button type="button" className="link" onClick={() => setStyle(k, undefined)}>default</button>}
                </span>
              )}
              {def.type === "text" && <input value={typeof v === "string" ? v : ""} maxLength={10} onChange={(e) => setStyle(k, e.target.value.toUpperCase() || undefined)} />}
              {def.type === "number" && <input type="number" min={0} max={30} value={v === undefined ? "" : Number(v)} onChange={(e) => setStyle(k, e.target.value === "" ? undefined : Number(e.target.value))} />}
              {def.type === "choice" && (
                <select value={String(v ?? "")} onChange={(e) => setStyle(k, e.target.value || undefined)}>
                  <option value="">default</option>{def.choices!.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {def.type === "colors" && (
                <span className="ge-inline">
                  {(Array.isArray(v) ? (v as string[]) : []).map((c, i, all) => (
                    <span key={i} className="swatch-edit">
                      <input type="color" value={c} aria-label={`Region color ${i + 1}`} onChange={(e) => setStyle(k, all.map((x, j) => (j === i ? e.target.value : x)))} />
                      <button type="button" className="x" aria-label={`Remove region color ${i + 1}`} onClick={() => setStyle(k, all.filter((_, j) => j !== i).length ? all.filter((_, j) => j !== i) : undefined)}>×</button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setStyle(k, [...(Array.isArray(v) ? (v as string[]) : []), "#4f9fdc"])}>+ Color</button>
                </span>
              )}
            </label>
          );
        })}
        <fieldset className="ge-marks">
          <legend>What the player draws <span className="hint">default: the type&rsquo;s</span></legend>
          {(Object.keys(MARKS) as MarkKind[]).map((m) => {
            const current = spec.marks ?? (genres[genre]?.marks as MarkKind[] | undefined) ?? [];
            return (
              <label key={m} className="ge-inline">
                <input type="checkbox" checked={current.includes(m)} onChange={(e) => {
                  const next = e.target.checked ? [...current, m] : current.filter((x) => x !== m);
                  const preset = (genres[genre]?.marks as MarkKind[] | undefined) ?? [];
                  set({ marks: next.length === preset.length && next.every((x) => preset.includes(x)) ? undefined : next });
                }} /> {MARKS[m]}
              </label>
            );
          })}
        </fieldset>
      </div>
    </details>
  );
}
