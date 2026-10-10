// For someone signed out, the nav's Subscriptions, Profile and Create (and Sign in) open this: the
// site's modal (ConfirmDialog.tsx's Modal) with the sign-in form and a way to make an account.
// Signing in goes on to where the button was going (lib/next.ts, SIGN_IN_FOR).
import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useRouteLoaderData } from "react-router";
import { Modal, type Opener } from "./ConfirmDialog";
import { SignInForm } from "./SignInForm";
import { SIGN_IN_FOR, signupHref, type SignInFor } from "~/lib/next";

export function SignInDialog({ why, opener, onClose }: { why: SignInFor; opener?: Opener; onClose: () => void }) {
  const id = useId();
  const { pathname, search } = useLocation();
  const google = !!useRouteLoaderData<{ google?: boolean }>("root")?.google;
  const { title, next: to } = SIGN_IN_FOR[why];
  const next = to || pathname + search;
  return (
    <Modal className="signin-dialog" labelledBy={`${id}-title`} opener={opener} onCancel={onClose}
      focusFirst={(d) => d.querySelector<HTMLInputElement>("input[name=email]")?.focus()}>
      <div className="confirm-box">
        <div className="signin-head">
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" className="signin-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <SignInForm google={google} next={next} />
        <p className="signin-foot">
          <Link to={signupHref(next)} onClick={onClose}>Create an account</Link>
          <Link to="/forgot-password" className="muted" onClick={onClose}>Forgot your password?</Link>
        </p>
      </div>
    </Modal>
  );
}

/** A button that opens the sign-in dialog (in the body, so a nav hidden at this width can't hide it). */
export function SignInButton({ why, className, children, ...rest }: { why: SignInFor; className?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [open, setOpen] = useState<Opener | null>(null);
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={(e) => setOpen({ trigger: e.currentTarget, menuButton: null })} {...rest}>{children}</button>
      {open && createPortal(<SignInDialog why={why} opener={open} onClose={() => setOpen(null)} />, document.body)}
    </>
  );
}
