// Before the browser tests: a fresh account on the local site (signed up through the auth API, as
// the sign-up page does), and a draft of each puzzle type, copied from the seeded examples.
import { request } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { AUTH_FILE, q, RUN_FILE, sql, type Run } from "./db";

export default async function setup() {
  const stamp = Date.now().toString(36);
  const handle = `e2e${stamp}`, email = `${handle}@example.test`;
  const api = await request.newContext({ baseURL: "http://localhost:5173" });
  const res = await api.post("/api/auth/sign-up/email", { data: { email, password: `pw-${stamp}-e2e-only`, name: "Editor tests", handle }, headers: { origin: "http://localhost:5173" } });
  if (!res.ok()) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
  await api.storageState({ path: AUTH_FILE });
  await api.dispose();

  const [user] = sql<{ id: string }>(`select id from creators where email = ${q(email)}`);
  const [collection] = sql<{ id: string }>(`select id from collections where personal_of = ${q(user.id)}`);
  const kinds = sql<{ kind: string; id: string }>("select kind, min(id) id from games where state = 'published' group by kind");
  if (kinds.length < 25) throw new Error(`expected the seeded example puzzles (25 types), found ${kinds.length}: run npm run db:seed`);
  const drafts: Record<string, string> = {};
  for (const { kind, id } of kinds) {
    drafts[kind] = `e2e-${stamp}-${kind}`;
    sql(`insert into games (id, collection_id, author_id, title, description, sketch, sketch_version, kind, parse_notes, kind_choices, state)
      select ${q(drafts[kind])}, ${q(collection.id)}, ${q(user.id)}, ${q(`${kind} test`)}, '', sketch, sketch_version, kind, '[]', '[]', 'draft' from games where id = ${q(id)}`);
  }
  const run: Run = { userId: user.id, handle, collectionId: collection.id, drafts };
  writeFileSync(RUN_FILE, JSON.stringify(run));
}
