// A collection's settings: inkit.games/<slug>/settings.
// Owners change its details and members; any member can leave; owners can delete a studio.
import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/collection-settings";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { roleIn } from "~/lib/permissions.server";
import { collectionBySlug } from "~/lib/queries.server";
import { changeCollection, membersOf } from "~/lib/collections.server";
import { attempt, signInFirst } from "~/lib/http.server";

async function load(request: Request, env: Env, slug: string) {
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const db = getDb(env);
  const collection = await collectionBySlug(db, slug.toLowerCase());
  if (!collection) throw data(null, { status: 404 });
  const role = await roleIn(db, collection.id, me.id);
  if (!role) throw data(null, { status: 404 });
  return { db, me, collection, role };
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, me, collection, role } = await load(request, context.get(cloudflareContext).env, params.slug);
  const members = await membersOf(db, collection.id);
  return {
    collection: { slug: collection.slug, title: collection.title, description: collection.description, personal: !!collection.personalOf, deleted: !!collection.deletedAt },
    members: members.sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || a.handle.localeCompare(b.handle)),
    owners: members.filter((m) => m.role === "owner").length,
    me: me.id, role,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, me, collection } = await load(request, context.get(cloudflareContext).env, params.slug);
  const form = await request.formData();
  return attempt(async () => {
    const r = await changeCollection(db, me, collection, form);
    return r.goTo ? redirect(r.goTo) : { note: r.note };
  });
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Settings: ${loaderData?.collection.title ?? ""} · inkit` }];

export default function Settings({ loaderData: { collection, members, owners, me, role }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const owner = role === "owner";
  const note = actionData && "note" in actionData ? actionData.note : undefined;
  const error = actionData && "error" in actionData ? actionData.error : undefined;

  return (
    <main className="wrap narrow settings">
      <header>
        <h1>{collection.title}</h1>
        <span className="muted"><Link to={`/${collection.slug}`}>inkit.games/{collection.slug}</Link>
          {" · "}{collection.personal ? "your personal collection" : owner ? "you're an owner" : "you're a contributor"}</span>
      </header>
      {(note || error) && <p className={error ? "error" : "good"} role="status">{error ?? note}</p>}

      {owner && (
        <section>
          <h2>Details</h2>
          <Form method="post" className="form">
            <label>Name<input name="title" required maxLength={80} defaultValue={collection.title} /></label>
            <label>Description<textarea name="description" rows={3} maxLength={1000} defaultValue={collection.description} /></label>
            <button className="btn primary" name="intent" value="details" disabled={busy}>Save</button>
          </Form>
        </section>
      )}

      {!collection.personal && (
        <section>
          <h2>Members</h2>
          <p className="muted">Owners manage members and details, and can edit or take down any game here. Contributors publish and edit their own games.</p>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id}>
                <span><Link to={`/${m.handle}`}>@{m.handle}</Link> <span className="muted">{m.name}</span></span>
                {owner ? (
                  <span className="member-actions">
                    <Form method="post">
                      <input type="hidden" name="creator" value={m.id} />
                      <input type="hidden" name="intent" value="role" />
                      <select name="role" defaultValue={m.role} aria-label={`Role for @${m.handle}`}
                        disabled={m.role === "owner" && owners === 1}
                        title={m.role === "owner" && owners === 1 ? "A collection needs at least one owner" : undefined}
                        onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                        <option value="owner">Owner</option>
                        <option value="contributor">Contributor</option>
                      </select>
                    </Form>
                    {m.id !== me && (
                      <Form method="post">
                        <input type="hidden" name="creator" value={m.id} />
                        <button className="link" name="intent" value="remove"
                          disabled={m.role === "owner" && owners === 1}>Remove</button>
                      </Form>
                    )}
                  </span>
                ) : <span className="muted">{m.role}</span>}
              </li>
            ))}
          </ul>
          {owner && (
            <Form method="post" className="inline-form">
              <input name="handle" placeholder="@handle" required autoCapitalize="none" spellCheck={false} aria-label="Creator's handle" />
              <select name="role" defaultValue="contributor" aria-label="Role">
                <option value="contributor">Contributor</option>
                <option value="owner">Owner</option>
              </select>
              <button className="btn" name="intent" value="add" disabled={busy}>Add</button>
            </Form>
          )}
        </section>
      )}

      {!collection.personal && (
        <section>
          <h2>Leave</h2>
          {role === "owner" && owners === 1 ? (
            <p className="muted">You're the only owner. Make someone else an owner before you leave.</p>
          ) : (
            <Form method="post">
              <p className="muted">You'll lose edit access. Your games stay here, with your name on them.</p>
              <button className="btn" name="intent" value="leave" disabled={busy}>Leave {collection.title}</button>
            </Form>
          )}
        </section>
      )}

      {owner && !collection.personal && !collection.deleted && (
        <section>
          <h2>Delete studio</h2>
          <Form method="post" className="form">
            <p className="muted">Its games go offline but aren't erased.</p>
            <label>Type <strong>{collection.slug}</strong> to confirm<input name="confirm" required autoCapitalize="none" /></label>
            <button className="btn danger" name="intent" value="delete" disabled={busy}>Delete {collection.title}</button>
          </Form>
        </section>
      )}
    </main>
  );
}
