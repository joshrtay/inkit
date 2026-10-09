// Paint's Rules panel (docs/creation-flow.md §3): the type's rules in plain words, then only the
// settings the type has, as choices and switches: a sudoku's box shape and its digits or letters;
// each of the type's own rules' settings (Star Battle's stars, a panel's symmetry, Fillomino's sizes
// ...); Panes' rules as a list. Admins get the editor's Rules and Look panels under Advanced.
// The settings go into the puzzle as they are (sketchpad/to-puzzle.ts's Settings).
import { useMemo } from "react";
import { describe, genres, makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { standardBox, type RuleName } from "~site/engine/rules.ts";
import type { GridSpec, RuleSpec } from "~site/engine/types.ts";
import { RULES, type Setting } from "~/editor/coverage";
import { kindName } from "~/games/kinds";
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

export function PaintRules({ genre, settings, size, onChange, onGuide, admin = false }: {
  genre: GenreName; settings: Settings; size: [number, number] | null;
  onChange: (s: Settings) => void; onGuide: () => void; admin?: boolean;
}) {
  const presets = genres[genre].rules as RuleSpec[];
  const own = settings.rules ?? [];
  const ruleOf = (name: string) => own.find((r) => r.rule === name) ?? presets.find((r) => r.rule === name);
  const spec: GridSpec = { genre, size: size ?? [6, 6], ...settings };
  const always = useMemo(() => {
    try { return describe(makePuzzle(spec, { unfinished: true })); } catch { return []; }
  }, [JSON.stringify(spec)]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const settable = presets.filter((r) => r.rule !== "boxes" && RULES[r.rule as RuleName]?.settings.length);

  return (
    <section className="sp-panel paint-rules" aria-labelledby="paint-rules-h">
      <div className="paint-rules-head">
        <h2 id="paint-rules-h" className="sp-panel-h">{kindName(genre)} rules</h2>
        <button type="button" className="sp-btn paint-guide-link" onClick={onGuide}>Guide</button>
      </div>
      {always.length > 0 && <p className="paint-always"><b>Always:</b> {always.join(" ")}</p>}
      <div className="paint-field"><span className="paint-label">Size</span><b>{size ? `${size[0]} × ${size[1]}, from the grid` : "Draw a grid"}</b></div>
      {boxes.length > 1 && box && (
        <div className="paint-field"><span className="paint-label">Box shape</span>
          <span className="sp-seg" role="group" aria-label="Box shape">
            {boxes.map(([a, b]) => <button key={`${a}x${b}`} type="button" className="sp-btn" aria-pressed={box[0] === a && box[1] === b}
              onClick={() => setRule("boxes", "box", a === standardBox(n)?.[0] && b === standardBox(n)?.[1] ? undefined : [a, b])}>{a} × {b}</button>)}
          </span>
        </div>
      )}
      {SUDOKUS.has(genre) && n > 0 && n <= LETTERS.length && (
        <div className="paint-field"><span className="paint-label">Writes</span>
          <span className="sp-seg" role="group" aria-label="Writes">
            <button type="button" className="sp-btn" aria-pressed={!settings.style?.symbols} onClick={() => setStyle("symbols", undefined)}>1–{n}</button>
            <button type="button" className="sp-btn" aria-pressed={!!settings.style?.symbols} onClick={() => setStyle("symbols", LETTERS.slice(0, n))}>A–{LETTERS[n - 1]}</button>
          </span>
        </div>
      )}
      {settable.flatMap((r) => RULES[r.rule as RuleName].settings.map((s) => (
        <Field key={`${r.rule}.${s.key}`} s={{ ...s, label: settable.length > 1 || s.label.length < 12 ? `${RULES[r.rule as RuleName].label}: ${s.label}` : s.label }}
          value={ruleOf(r.rule)?.[s.key]} onChange={(v) => setRule(r.rule, s.key, v)} />
      )))}
      {genre === "panes" && <RulesPanel spec={spec} open onChange={(s) => setRules(s.rules ?? [])} />}
      {admin && (
        <details className="paint-advanced">
          <summary>Advanced</summary>
          {genre !== "panes" && <RulesPanel spec={spec} onChange={(s) => setRules(s.rules ?? [])} />}
          <LookPanel spec={spec} onChange={(s) => { const { rules: _r, style, ...rest } = s; void rest; const { style: _o, ...keep } = settings; onChange(style ? { ...keep, style } : keep); }} />
        </details>
      )}
    </section>
  );
}
