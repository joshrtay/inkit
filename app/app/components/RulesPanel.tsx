// The rules a puzzle has beyond its type's own, each with its settings: Panes puzzles list their
// rules, and admins can add any rule to any puzzle. The rule blocks are in editor/coverage.ts.
import { genres, type GenreName } from "~site/engine/puzzle.ts";
import type { RuleName } from "~site/engine/rules.ts";
import type { GridSpec, RuleSpec } from "~site/engine/types.ts";
import { KIND_NAMES } from "~/games/kinds";
import { RULES, type Setting } from "~/editor/coverage";

/** One of a rule's settings, as the editor's Rules panel and paint's (components/PaintRules.tsx) edit it. */
export function SettingField({ setting: s, value, onChange }: { setting: Setting; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <label className="setting">{s.label}
      {s.type === "number" && <input type="number" min={0} max={99} value={value === undefined ? "" : Number(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />}
      {s.type === "flag" && <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />}
      {s.type === "choice" && (
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{s.none ?? "default"}</option>{s.choices.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {(s.type === "pair" || s.type === "list") && (
        <input placeholder={s.type === "pair" ? "e.g. 2 3" : "e.g. 1 2"} defaultValue={Array.isArray(value) ? (value as number[]).join(" ") : ""}
          onBlur={(e) => {
            const p = e.target.value.trim().split(/[\s×x,:]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
            onChange((s.type === "pair" ? p.length === 2 : p.length > 0) ? p : undefined);
          }} />
      )}
    </label>
  );
}

export function RulesPanel({ spec, onChange, open = false }: { spec: GridSpec; onChange: (spec: GridSpec) => void; open?: boolean }) {
  const genre = (spec.genre ?? "simple-loop") as GenreName;
  const extra = spec.rules ?? [];
  const presets = (genres[genre]?.rules ?? []) as RuleSpec[];
  const setRules = (r: RuleSpec[]) => { const { rules: _r, ...rest } = spec; onChange(r.length ? { ...rest, rules: r } : rest); };
  return (
    <details className="ge-section" open={open}>
      <summary>Rules</summary>
      {presets.length > 0 && <p className="hint">{KIND_NAMES[genre]} always has: {presets.map((r) => RULES[r.rule as RuleName]?.label ?? r.rule).join("; ")}.</p>}
      <div className="ge-rules">
        {extra.map((r, i) => {
          const def = RULES[r.rule as RuleName];
          const update = (k: string, v: unknown) => setRules(extra.map((x, j) => {
            if (j !== i) return x;
            const next: RuleSpec = { ...x, [k]: v };
            if (v === undefined || v === "" || v === false) delete next[k];
            return next;
          }));
          return (
            <span key={i} className="chip">
              {def?.label ?? r.rule}
              {def?.settings.map((s) => <SettingField key={s.key} setting={s} value={r[s.key]} onChange={(v) => update(s.key, v)} />)}
              <button type="button" aria-label={`Remove ${def?.label ?? r.rule}`} onClick={() => setRules(extra.filter((_, j) => j !== i))}>×</button>
            </span>
          );
        })}
        <select value="" aria-label="Add a rule" onChange={(e) => {
          const rule = e.target.value as RuleName;
          // a rule the type has already starts from the type's settings (Star Battle's stars, say)
          if (rule) setRules([...extra, presets.find((r) => r.rule === rule) ?? (rule === "size" ? { rule, is: 4 } : { rule })]);
        }}>
          <option value="">Add a rule…</option>
          {(Object.keys(RULES) as RuleName[]).map((r) => <option key={r} value={r}>{RULES[r].label}</option>)}
        </select>
      </div>
    </details>
  );
}
