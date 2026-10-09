// Paint's rule settings (docs/creation-flow.md, "v3 layout"): each sits on the rule it changes in
// This puzzle's checklist, as choices and switches: a sudoku's box shape (on its box rule) and its
// digits or letters (on its row-and-column rule); each of the type's own rules' settings (Star
// Battle's stars, a panel's one or two lines, Hidoku's corners ...). Panes' rules as a list, and for
// admins the editor's Rules and Look panels under Advanced, come after the checklist.
// The settings go into the puzzle as they are (sketchpad/to-puzzle.ts's Settings).
import { genres, type GenreName } from "~site/engine/puzzle.ts";
import { standardBox, type RuleName } from "~site/engine/rules.ts";
import type { GridSpec, RuleSpec } from "~site/engine/types.ts";
import { RULES, type Setting } from "~/editor/coverage";
import type { Settings } from "~/sketchpad/to-puzzle";
import { RulesPanel, SettingField } from "./RulesPanel";
import { LookPanel } from "./LookPanel";

const SUDOKUS = new Set<GenreName>(["sudoku", "thermo-sudoku", "irregular-sudoku"]);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A rule's setting as paint shows it: a choice as a segmented control, a flag as a switch, the rest as the editor's fields. */
function Field({ s, value, onChange }: { s: Setting; value: unknown; onChange: (v: unknown) => void }) {
  if (s.type === "choice") return (
    <div className="paint-field"><span className="paint-label">{capital(s.label)}</span>
      <span className="sp-seg" role="group" aria-label={s.label}>
        <button type="button" className="sp-btn" aria-pressed={value === undefined} onClick={() => onChange(undefined)}>{capital(s.none ?? "none")}</button>
        {s.choices.map((c) => <button key={c} type="button" className="sp-btn" aria-pressed={value === c} onClick={() => onChange(c)}>{capital(c)}</button>)}
      </span>
    </div>
  );
  if (s.type === "flag") return (
    <label className="paint-switch"><span>{capital(s.label)}</span>
      <input type="checkbox" role="switch" checked={!!value} onChange={(e) => onChange(e.target.checked || undefined)} /></label>
  );
  return <div className="paint-field ge-rules"><SettingField setting={s} value={value} onChange={onChange} /></div>;
}
const capital = (w: string) => w[0].toUpperCase() + w.slice(1);

interface Props { genre: GenreName; settings: Settings; size: [number, number] | null; onChange: (s: Settings) => void }

/** What changes a type's settings, and which of its engine rules have any. */
function useRuleSettings({ genre, settings, size, onChange }: Props) {
  const presets = genres[genre].rules as RuleSpec[];
  const own = settings.rules ?? [];
  const ruleOf = (name: string) => own.find((r) => r.rule === name) ?? presets.find((r) => r.rule === name);
  const setRules = (rules: RuleSpec[]) => { const { rules: _r, ...rest } = settings; onChange(rules.length ? { ...rest, rules } : rest); };
  /** One of a preset rule's settings, kept as an override only while it differs from the type's. */
  const setRule = (name: string, key: string, v: unknown) => {
    const preset = presets.find((r) => r.rule === name), base = ruleOf(name) ?? { rule: name };
    const next: RuleSpec = { ...base, [key]: v };
    if (v === undefined) delete next[key];
    const same = preset && JSON.stringify(Object.entries(next).sort()) === JSON.stringify(Object.entries(preset).sort());
    setRules([...own.filter((r) => r.rule !== name), ...(same ? [] : [next])]);
  };
  const setStyle = (k: string, v: unknown) => {
    const style = { ...settings.style, [k]: v } as Record<string, unknown>;
    if (v === undefined) delete style[k];
    const { style: _s, ...rest } = settings;
    onChange(Object.keys(style).length ? { ...rest, style } : rest);
  };
  // a sudoku's boxes: each shape the grid's size allows; its digits or letters
  const n = size && size[0] === size[1] ? size[0] : 0;
  const boxes = SUDOKUS.has(genre) && genre !== "irregular-sudoku" && n
    ? Array.from({ length: n }, (_, a) => a + 1).filter((a) => a > 1 && a < n && n % a === 0).map((a) => [a, n / a] as [number, number]) : [];
  const box = (ruleOf("boxes")?.box as [number, number] | undefined) ?? (n ? standardBox(n) : null);
  const writes = SUDOKUS.has(genre) && n > 0 && n <= LETTERS.length;
  const settable = presets.filter((r) => r.rule !== "boxes" && RULES[r.rule as RuleName]?.settings.length);
  return { ruleOf, setRule, setStyle, setRules, n, boxes, box, writes, settable };
}

/** The engine rules of this type that have settings (each shown on its line in the checklist). */
export function settingRules(genre: GenreName, size: [number, number] | null): string[] {
  const presets = genres[genre].rules as RuleSpec[];
  const n = size && size[0] === size[1] ? size[0] : 0;
  const out: string[] = [];
  if (SUDOKUS.has(genre) && genre !== "irregular-sudoku" && n && Array.from({ length: n }, (_, a) => a + 1).filter((a) => a > 1 && a < n && n % a === 0).length > 1) out.push("boxes");
  if (SUDOKUS.has(genre) && n > 0 && n <= LETTERS.length) out.push("latin");
  for (const r of presets) if (r.rule !== "boxes" && RULES[r.rule as RuleName]?.settings.length) out.push(r.rule);
  return [...new Set(out)];
}

/** The settings of these engine rules, as choices and switches. */
export function RuleSettings(props: Props & { rules: string[] }) {
  const { settings, rules } = props;
  const k = useRuleSettings(props);
  return <>
    {rules.includes("boxes") && k.boxes.length > 1 && k.box && (
      <div className="paint-field"><span className="paint-label">Box shape</span>
        <span className="sp-seg" role="group" aria-label="Box shape">
          {k.boxes.map(([a, b]) => <button key={`${a}x${b}`} type="button" className="sp-btn" aria-pressed={k.box![0] === a && k.box![1] === b}
            onClick={() => k.setRule("boxes", "box", a === standardBox(k.n)?.[0] && b === standardBox(k.n)?.[1] ? undefined : [a, b])}>{a} × {b}</button>)}
        </span>
      </div>
    )}
    {rules.includes("latin") && k.writes && (
      <div className="paint-field"><span className="paint-label">Writes</span>
        <span className="sp-seg" role="group" aria-label="Writes">
          <button type="button" className="sp-btn" aria-pressed={!settings.style?.symbols} onClick={() => k.setStyle("symbols", undefined)}>1–{k.n}</button>
          <button type="button" className="sp-btn" aria-pressed={!!settings.style?.symbols} onClick={() => k.setStyle("symbols", LETTERS.slice(0, k.n))}>A–{LETTERS[k.n - 1]}</button>
        </span>
      </div>
    )}
    {k.settable.filter((r) => rules.includes(r.rule)).flatMap((r) => RULES[r.rule as RuleName].settings.map((s) => (
      <Field key={`${r.rule}.${s.key}`} s={s}
        value={k.ruleOf(r.rule)?.[s.key]} onChange={(v) => k.setRule(r.rule, s.key, v)} />
    )))}
  </>;
}

/** After the checklist: Panes' own rules as a list, and for admins the editor's Rules and Look panels. */
export function MoreSettings(props: Props & { admin?: boolean }) {
  const { genre, settings, size, onChange, admin = false } = props;
  const k = useRuleSettings(props);
  const spec: GridSpec = { genre, size: size ?? [6, 6], ...settings };
  if (genre !== "panes" && !admin) return null;
  return <>
    {genre === "panes" && <div className="paint-panes"><RulesPanel spec={spec} open onChange={(s) => k.setRules(s.rules ?? [])} /></div>}
    {admin && (
      <details className="paint-advanced">
        <summary>Advanced</summary>
        {genre !== "panes" && <RulesPanel spec={spec} onChange={(s) => k.setRules(s.rules ?? [])} />}
        <LookPanel spec={spec} onChange={(s) => { const { rules: _r, style, ...rest } = s; void rest; const { style: _o, ...keep } = settings; onChange(style ? { ...keep, style } : keep); }} />
      </details>
    )}
  </>;
}
