// A dropdown that looks like the rest of the site (the browser's own <select> menu doesn't follow
// our dark theme). Submits like a select: a hidden input named `name`. With one option there's
// nothing to choose, so it just says what it is.
import { useEffect, useId, useRef, useState } from "react";

export interface Option { value: string; label: string; hint?: string }

/** `onChange` runs before a new choice takes; returning false keeps the old one. */
export function Select({ name, options, defaultValue, label, onChange, disabled = false }: {
  name: string; options: Option[]; defaultValue?: string; label: string; onChange?: (value: string) => boolean | void; disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (options.length <= 1) return (
    <div className="select single"><span className="select-label">{label}</span>
      <span className="select-value">{current?.label}{current?.hint && <span className="muted"> · {current.hint}</span>}</span>
      <input type="hidden" name={name} value={value} />
    </div>
  );

  const pick = (v: string) => { setOpen(false); if (v !== value && onChange?.(v) !== false) setValue(v); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    }
    if ((e.key === "Enter" || e.key === " ") && open) { e.preventDefault(); pick(options[active].value); }
  };

  return (
    <div className="select" ref={box}>
      <span className="select-label" id={`${id}-label`}>{label}</span>
      <button type="button" className="select-button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label`} disabled={disabled}
        onClick={() => setOpen(!open)} onKeyDown={onKey}>
        <span>{current?.label}{current?.hint && <span className="muted"> · {current.hint}</span>}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <ul className="select-list" role="listbox" aria-labelledby={`${id}-label`}>
          {options.map((o, k) => (
            <li key={o.value} role="option" aria-selected={o.value === value} className={k === active ? "active" : undefined}
              onMouseEnter={() => setActive(k)} onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}>
              <span>{o.label}</span>{o.hint && <span className="muted">{o.hint}</span>}
              {o.value === value && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>}
            </li>
          ))}
        </ul>
      )}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
