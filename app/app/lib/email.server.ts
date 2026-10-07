// Sending email (password resets) with Cloudflare Email Service: the EMAIL binding in
// wrangler.jsonc, sending from inkit.games once it's onboarded (Compute > Email Service > Email
// Sending). Locally the binding is simulated, so nothing is really sent: the message is logged
// instead, links included, so the flow can still be tried.
export const FROM = "inkit.games <no-reply@inkit.games>";

export interface Mail { to: string; subject: string; text: string; html: string }

export async function sendEmail(env: Env, mail: Mail) {
  if (!env.EMAIL || import.meta.env.DEV) {
    console.log(`email to ${mail.to}: ${mail.subject}\n${mail.text}`);
    if (!env.EMAIL) return;
  }
  try {
    await env.EMAIL.send({ from: FROM, ...mail });
  } catch (e) {
    // a failed send shouldn't reveal anything to the person asking; it shows in the logs
    console.error(`couldn't send "${mail.subject}" to ${mail.to}:`, e);
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The password reset email. */
export function resetEmail(name: string, url: string): Omit<Mail, "to"> {
  return {
    subject: "Reset your password",
    text: `Hi ${name},\n\nSomeone (hopefully you) asked to reset the password for your account on inkit.games. Choose a new one here:\n\n${url}\n\nThe link works for one hour. If you didn't ask, ignore this email: your password stays the same.`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#222;max-width:480px">
<p>Hi ${esc(name)},</p>
<p>Someone (hopefully you) asked to reset the password for your account on inkit.games.</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#26398f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">Choose a new password</a></p>
<p style="color:#666;font-size:14px">The link works for one hour. If you didn't ask, ignore this email: your password stays the same.</p>
</div>`,
  };
}
