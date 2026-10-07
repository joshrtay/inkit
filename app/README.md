# inkit: the site (inkit.games)

How it fits together is in [../ARCHITECTURE.md](../ARCHITECTURE.md); the grid engine (and how
the editor and the sketch reader must keep up with it) in [../docs/grid-engine.md](../docs/grid-engine.md).

## Running it locally

```sh
npm install                         # in the repo root: installs the shared code and the site (npm workspaces)
cd app
cp .dev.vars.example .dev.vars      # then put a random BETTER_AUTH_SECRET in it
npm run db:migrate && python3 seed/make.py && npm run db:seed
npm run dev                         # http://localhost:5173
```

After changing `app/db/schema.ts`, run `npm run db:generate` and `npm run db:migrate`
(pushes to `main` apply new migrations to production before deploying). `npm run typecheck`
checks everything.

## Tests

```sh
npm test            # unit tests (tests/unit): the editor's actions, read diffs, sketches, doubts
npm run test:e2e    # browser tests (tests/e2e): the editor for every puzzle type, on the local site
```

The browser tests need the local database migrated and seeded (see above). They sign up a
throwaway account on the local site, copy one example of each puzzle type in as its drafts,
drive the editor with a real mouse and keyboard, check what was saved in the local database,
and delete it all afterwards. They reuse a running `npm run dev`. GitHub runs both (and the
engine self-test) on every push and pull request, and deploys `main` only when they pass.

## The sketch reader

How it works, what it costs, the record of every read on the live site, and the offline
evaluation (`npm run eval`): [../docs/reader.md](../docs/reader.md).

## Later

- **An inkit MCP connector**, so creators can bring their own AI (Claude, ChatGPT...) to edit a
  draft: actions to read a puzzle, change it, and check it has one solution (the solver is the
  big win), scoped to one draft, never able to publish. An "Open in Claude" button on the edit
  page opens their AI with the draft's address in the prompt; the page updates as it edits.
  Then **WebMCP** (the same actions offered by the page itself to in-browser agents) once
  browsers support it. Build after the on-puzzle editor, whose actions these mirror.
- **Style in the editor**: choose a puzzle's look (ink, paper, colors) on the edit page, seen live
  in Preview, which already shows the puzzle as its page will.
- **Prompt caching for the sketch reader**: the system prompt (every puzzle type, clue and rule) is
  the same for every read, about 11,000 input tokens per look. Mark it with `cache_control` so
  reads after the first pay a fraction for it; measure the saving with `npm run eval` and the
  token counts in `/admin/reads/stats` (see docs/reader.md).
- **Studios** (shared collections with several creators) are built but set aside: their pages
  (`/studios/new`, `/<slug>/settings`), memberships and roles still work, but nothing links to
  them. Decide what they should be, then link them again (Create menu, profile).
- **A contact address**: the privacy policy and terms name hello@inkit.games (`app/lib/legal.ts`),
  which doesn't exist yet. Set it up with Cloudflare Email Routing, forwarding to a real inbox.
