// Your settings: inkit.games/settings. Account (profile, email, password, handle), each row with
// an Edit that opens it in place, and Appearance (light, dark, or the device's). After Substack's.
import { useEffect, useState } from "react";
import { Form, Link, useNavigation, useRevalidator } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/settings";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { changeHandle, changeProfile } from "~/lib/account.server";
import { attempt, signInFirst } from "~/lib/http.server";
import { savedTheme, setTheme, type Theme } from "~/lib/theme";
import { recordingAllowed, setRecordingAllowed } from "~/lib/bugs/capture";
import { openBugReport } from "~/components/BugReport";
import { Avatar } from "~/components/Avatar";

export const meta: Route.MetaFunction = () => [{ title: "Settings · inkit" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const db = getDb(env);
  const [profile, password] = await Promise.all([
    db.query.collections.findFirst({ where: eq(schema.collections.personalOf, me.id) }),
    db.query.accounts.findFirst({ columns: { id: true }, where: and(eq(schema.accounts.userId, me.id), eq(schema.accounts.providerId, "credential")) }),
  ]);
  return {
    name: me.name, handle: me.handle, email: me.email, bio: profile?.description ?? "", hasPassword: !!password,
    emailChanged: new URL(request.url).searchParams.has("email-changed"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const db = getDb(env);
  const form = await request.formData();
  return attempt(async () => {
    if (form.get("intent") === "profile") { await changeProfile(db, me, form); return { done: "profile" as const }; }
    if (form.get("intent") === "handle") { await changeHandle(db, me, form); return { done: "handle" as const }; }
    return { error: "Nothing to change." };
  });
}

type Row = "profile" | "email" | "password" | "handle" | null;

export default function Settings({ loaderData: d, actionData }: Route.ComponentProps) {
  const [editing, setEditing] = useState<Row>(null);
  const [note, setNote] = useState(d.emailChanged ? "Your email is changed." : "");
  const busy = useNavigation().state !== "idle";
  const error = actionData && "error" in actionData ? actionData.error : "";
  // a saved row closes
  useEffect(() => { if (actionData && "done" in actionData) { setEditing(null); setNote("Saved."); } }, [actionData]);
  const edit = (row: Row) => { setEditing(editing === row ? null : row); setNote(""); };

  return (
    <main className="wrap narrow settings-page" data-private>
      <h1>Settings</h1>
      {note && <p className="good" role="status">{note}</p>}

      <section aria-labelledby="account">
        <h2 id="account">Account</h2>
        <div className="settings-card">
          <SettingRow title="Profile" value={d.name} lead={<Avatar name={d.name} seed={d.handle} size={56} />}
            open={editing === "profile"} onEdit={() => edit("profile")}>
            <Form method="post" className="form">
              <label>Name<input name="name" required maxLength={80} defaultValue={d.name} autoComplete="name" /></label>
              <label>Bio<textarea name="bio" rows={3} maxLength={1000} defaultValue={d.bio} placeholder="What you make, in a sentence or two" /></label>
              {error && editing === "profile" && <p className="error" role="alert">{error}</p>}
              <Buttons busy={busy} onCancel={() => setEditing(null)} intent="profile" />
            </Form>
          </SettingRow>

          <SettingRow title="Email" value={d.email} open={editing === "email"} onEdit={() => edit("email")}>
            <EmailForm current={d.email} onCancel={() => setEditing(null)} />
          </SettingRow>

          <SettingRow title="Password" value={d.hasPassword ? "••••••••••" : "You sign in with Google"}
            open={editing === "password"} onEdit={d.hasPassword ? () => edit("password") : undefined}>
            <PasswordForm onDone={() => { setEditing(null); setNote("Your password is changed."); }} onCancel={() => setEditing(null)} />
          </SettingRow>

          <SettingRow title="Handle" value={`@${d.handle}`} open={editing === "handle"} onEdit={() => edit("handle")}>
            <Form method="post" className="form">
              <label>Handle
                <input name="handle" required maxLength={31} defaultValue={d.handle} autoCapitalize="none" spellCheck={false} />
                <span className="hint">Your profile is at inkit.games/<em>handle</em>. Links to your old address stop working; your puzzles keep theirs.</span>
              </label>
              {error && editing === "handle" && <p className="error" role="alert">{error}</p>}
              <Buttons busy={busy} onCancel={() => setEditing(null)} intent="handle" />
            </Form>
          </SettingRow>
        </div>
      </section>

      <section aria-labelledby="appearance">
        <h2 id="appearance">Appearance</h2>
        <Appearance />
      </section>

      <section aria-labelledby="bug-reports">
        <h2 id="bug-reports">Bug reports</h2>
        <Recording />
      </section>

      {/* phones have no More menu, so its other places are here too */}
      <footer className="settings-foot">
        <button className="btn" type="button" onClick={async () => { await authClient.signOut(); location.href = "/"; }}>Sign out</button>
        <button className="btn" type="button" onClick={openBugReport}>Report a bug</button>
        <Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link>
      </footer>
    </main>
  );
}

/** One line of the account card: what it is, what it's set to, and Edit (which opens the form below it, with its own Cancel). */
function SettingRow({ title, value, lead, open, onEdit, children }: {
  title: string; value: string; lead?: React.ReactNode; open: boolean; onEdit?: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`setting${open ? " open" : ""}`}>
      <div className="setting-line">
        {lead}
        <span className="setting-text"><strong>{title}</strong><span className="muted">{value}</span></span>
        {onEdit && !open && <button className="btn setting-edit" type="button" onClick={onEdit}>Edit</button>}
      </div>
      {open && <div className="setting-form">{children}</div>}
    </div>
  );
}

const Buttons = ({ busy, onCancel, intent }: { busy: boolean; onCancel: () => void; intent?: string }) => (
  <div className="setting-buttons">
    <button className="btn primary" name={intent ? "intent" : undefined} value={intent} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    <button className="btn" type="button" onClick={onCancel}>Cancel</button>
  </div>
);

/** A new email: a link goes to the new address, and the email changes when it's opened. */
function EmailForm({ current, onCancel }: { current: string; onCancel: () => void }) {
  const [sentTo, setSentTo] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newEmail = String(new FormData(e.currentTarget).get("email")).trim();
    if (newEmail.toLowerCase() === current.toLowerCase()) return setError("That's your email already.");
    setBusy(true); setError("");
    const { error } = await authClient.changeEmail({ newEmail, callbackURL: "/settings?email-changed" });
    setBusy(false);
    if (error) return setError(error.status === 429 ? "Too many tries. Wait a minute and try again." : error.message || "That didn't work. Try again.");
    setSentTo(newEmail);
  }
  if (sentTo) return <p>We&rsquo;ve sent a link to <strong>{sentTo}</strong>. Your email changes when you open it (it works for a day).</p>;
  return (
    <form className="form" onSubmit={submit}>
      <label>New email<input name="email" type="email" required autoComplete="email" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="setting-buttons">
        <button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Send a link"}</button>
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** A new password (the current one first); other devices are signed out. */
function PasswordForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const revalidate = useRevalidator();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const newPassword = String(f.get("new"));
    if (newPassword.length < 8) return setError("Use at least 8 characters.");
    setBusy(true); setError("");
    const { error } = await authClient.changePassword({ currentPassword: String(f.get("current")), newPassword, revokeOtherSessions: true });
    setBusy(false);
    if (error) return setError(error.status === 429 ? "Too many tries. Wait a minute and try again." : error.message || "That didn't work. Try again.");
    revalidate.revalidate();
    onDone();
  }
  return (
    <form className="form" onSubmit={submit}>
      <label>Current password<input name="current" type="password" required autoComplete="current-password" /></label>
      <label>New password<input name="new" type="password" required minLength={8} autoComplete="new-password" />
        <span className="hint">At least 8 characters. You&rsquo;ll stay signed in here; other devices are signed out.</span></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="setting-buttons">
        <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** Whether this browser keeps the last two minutes' recording for bug reports (lib/bugs/capture.ts). */
function Recording() {
  const [on, set] = useState(true);
  useEffect(() => set(recordingAllowed()), []);
  return (
    <div className="settings-card">
      <label className="bug-setting">
        <input type="checkbox" checked={on} onChange={(e) => { set(e.target.checked); setRecordingAllowed(e.target.checked); }} />
        <span>Keep a recording for bug reports
          <small>While you use inkit, this browser keeps the last two minutes of the page in memory, so a bug report can show what happened. It&rsquo;s sent only if you report a bug and leave its box ticked; what you type is hidden, and settings pages are never recorded.</small></span>
      </label>
    </div>
  );
}

/** Light, dark or the device's: a little page of each to pick from. */
function Appearance() {
  const [theme, pick] = useState<Theme>("dark");
  useEffect(() => pick(savedTheme()), []);
  const choose = (t: Theme) => { pick(t); setTheme(t); };
  return (
    <div className="settings-card themes" role="radiogroup" aria-label="Appearance">
      {(["light", "dark", "auto"] as const).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} className="theme-choice" onClick={() => choose(t)}>
          <span className={`theme-preview ${t}`} aria-hidden="true">
            <span className="tp-page light"><Mini /></span>
            {t !== "light" && <span className="tp-page dark"><Mini /></span>}
          </span>
          <span className="theme-name">{t === "auto" ? "Auto" : t === "light" ? "Light" : "Dark"}</span>
        </button>
      ))}
    </div>
  );
}

/** The inside of a preview: a sheet of paper with a little puzzle and some lines of text. */
const Mini = () => (
  <span className="tp-sheet">
    <svg className="tp-grid" viewBox="0 0 30 30"><path d="M2 2h26v26H2zM10.7 2v26M19.3 2v26M2 10.7h26M2 19.3h26" /></svg>
    <i /><i /><i /><i />
  </span>
);
