// The site's own confirm dialog, in place of the browser's confirm() and prompt(): a title, a line
// of what happens, Cancel and the action (red when it destroys something: Delete, Clear), and for
// the take-down note a text field. The native <dialog> opened with showModal (the page behind is
// inert); Tab stays inside it, Escape or a click outside cancels, and focus goes back to what opened
// it (or, if that was a menu item that has gone, to its menu's button). The look is the menus':
// the panel, their border, radius and shadow, in light and dark (styles/base.css, .confirm).
//
// Asked imperatively, from anywhere under ConfirmProvider (root.tsx):
//   const { confirm, ask } = useConfirm();
//   if (await confirm({ title: "Delete this puzzle?", action: "Delete", danger: true })) …
//   const note = await ask({ title: "Take it down?", action: "Take down", field: { label: "Why?" } });   // null: cancelled
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { answerOf, firstFocus, focusStep, type DialogField } from "./confirm";

export interface ConfirmOptions {
  title: string;
  /** what happens, in a line or two */
  body?: ReactNode;
  /** the primary action's words ("Delete", "Clear the page") */
  action: string;
  cancel?: string;
  /** destructive: the action is red */
  danger?: boolean;
}
export interface AskOptions extends ConfirmOptions { field: DialogField }
type Options = ConfirmOptions & { field?: DialogField };

const FOCUSABLE = "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

/** Where focus goes back to when the dialog closes: what had it when the dialog was asked for, or,
 *  if that's a menu item gone with its menu by then, the menu's button (the site's menus: a wrapper
 *  holding the button with aria-expanded and the role="menu" list). Taken when the question is
 *  asked, before a menu closes. */
export interface Opener { trigger: HTMLElement | null; menuButton: HTMLElement | null }
export function openerNow(): Opener {
  const trigger = typeof document !== "undefined" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const menuButton = trigger?.closest('[role="menu"]')?.parentElement?.querySelector<HTMLElement>("[aria-expanded]") ?? null;
  return { trigger, menuButton };
}

/** The dialog itself: open while it's mounted; `onClose` gets the answer (null: cancelled). */
export function ConfirmDialog({ title, body, action, cancel = "Cancel", danger = false, field, opener, onClose }: Options & { opener?: Opener; onClose: (answer: string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState("");
  const id = useId();
  const answer = answerOf(field, text);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const { trigger, menuButton } = opener ?? openerNow();
    if (!dialog.open) dialog.showModal();
    const first = firstFocus({ field, danger });
    (first === "field" ? fieldRef : first === "cancel" ? cancelRef : actionRef).current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      const back = trigger?.isConnected ? trigger : menuButton?.isConnected ? menuButton : null;
      back?.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    e.stopPropagation();   // the page's own shortcuts (paint's tools, undo) wait; Escape still cancels
    if (e.key !== "Tab") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const next = focusStep(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
    if (next < 0) return;
    e.preventDefault();
    items[next].focus();
  };

  return (
    <dialog ref={ref} className="confirm" role={field ? "dialog" : "alertdialog"} aria-modal="true"
      aria-labelledby={`${id}-title`} aria-describedby={body ? `${id}-body` : undefined}
      onCancel={(e) => { e.preventDefault(); onClose(null); }}   // Escape
      onKeyDown={onKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(null); }}>   {/* the backdrop */}
      <form className="confirm-box" method="dialog" onSubmit={(e) => { e.preventDefault(); if (answer !== null) onClose(answer); }}>
        <h2 id={`${id}-title`}>{title}</h2>
        {body && <div id={`${id}-body`} className="confirm-body">{body}</div>}
        {field && (
          <label className="confirm-field">{field.label}
            <textarea ref={fieldRef} rows={3} value={text} maxLength={field.maxLength ?? 500} placeholder={field.placeholder}
              required={field.required} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
          </label>
        )}
        <div className="confirm-acts">
          <button ref={cancelRef} type="button" className="btn" onClick={() => onClose(null)}>{cancel}</button>
          <button ref={actionRef} type="submit" className={`btn primary${danger ? " danger" : ""}`} disabled={answer === null}>{action}</button>
        </div>
      </form>
    </dialog>
  );
}

type Open = (o: Options) => Promise<string | null>;
const Ctx = createContext<Open | null>(null);

/** Holds the one dialog the page can have open at a time (root.tsx wraps every page in it). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<{ n: number; options: Options; opener: Opener } | null>(null);
  const resolver = useRef<((v: string | null) => void) | null>(null);
  const count = useRef(0);
  const open = useCallback<Open>((options) => new Promise((resolve) => {
    resolver.current?.(null);   // a second question answers the first with Cancel
    resolver.current = resolve;
    setAsking({ n: ++count.current, options, opener: openerNow() });
  }), []);
  const close = (answer: string | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    setAsking(null);
    resolve?.(answer);
  };
  return (
    <Ctx.Provider value={open}>
      {children}
      {asking && <ConfirmDialog key={asking.n} {...asking.options} opener={asking.opener} onClose={close} />}
    </Ctx.Provider>
  );
}

/** `confirm` answers true or false; `ask` answers the field's text, or null if cancelled. */
export function useConfirm() {
  const open = useContext(Ctx);
  if (!open) throw new Error("useConfirm needs a ConfirmProvider (root.tsx)");
  return useMemo(() => ({
    confirm: async (o: ConfirmOptions) => (await open(o)) !== null,
    ask: (o: AskOptions) => open(o),
  }), [open]);
}
