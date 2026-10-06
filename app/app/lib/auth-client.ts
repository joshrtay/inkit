// Sign-in calls from the browser (forms on /signin and /signup, the Google button, sign out).
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { handle: { type: "string", required: false } } })],
});
