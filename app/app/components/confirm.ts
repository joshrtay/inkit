// The confirm dialog's pure parts (components/ConfirmDialog.tsx), unit-tested in
// tests/unit/confirm.test.ts: where Tab goes inside it, what it answers, and what gets focus first.

/** The index Tab (or Shift+Tab, `back`) moves to among `count` focusable things, from `index` (-1:
 *  focus is outside them), wrapping round so focus never leaves the dialog. */
export function focusStep(count: number, index: number, back: boolean): number {
  if (count <= 0) return -1;
  if (index < 0) return back ? count - 1 : 0;
  return (index + (back ? count - 1 : 1)) % count;
}

/** A text field in the dialog (the take-down note). */
export interface DialogField { label: string; placeholder?: string; maxLength?: number; required?: boolean }

/** What the dialog answers when its primary action is pressed: null if it can't be pressed yet (a
 *  required field left empty), the field's text (trimmed, cut to its length) if it has one, or ""
 *  (yes) if it doesn't. Cancel and Escape answer null. */
export function answerOf(field: DialogField | undefined, text: string): string | null {
  if (!field) return "";
  const t = text.trim().slice(0, field.maxLength ?? 500).trim();
  return field.required && !t ? null : t;
}

/** What gets focus when the dialog opens: the field if it has one; Cancel if its action is
 *  destructive (so Enter doesn't delete); the action otherwise. */
export const firstFocus = (o: { field?: DialogField; danger?: boolean }): "field" | "cancel" | "action" =>
  o.field ? "field" : o.danger ? "cancel" : "action";
