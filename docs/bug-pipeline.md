# Bug reports → AI fixes

How a player's or creator's bug report becomes a draft pull request that the owner reviews. The
design and its reasons are in [research-bug-pipeline.md](research-bug-pipeline.md) (the lean
design, and the safeguards in §9). This is what was built.

```
browser                         Worker (inkit.games)                          GitHub (public)
rrweb buffer, logs, state ──► POST /bugs ──► D1 bug_reports, R2 bugs/<id>/…
  (sent only on "Send")         │ waitUntil: gatekeeper (Claude, no tools) → verdict on the row
                                ▼
                    /admin/bugs/<id>: replay, state, logs ── Send to GitHub ──► issue: id, restatement,
                                                                               severity, area, build, route
                                                         owner adds label ai-fix ─┘
                                                                  ▼
                                            bug-fix.yml: gate → fix (claude-code-action) → check → audit
                                                                  ▼
                                                        a DRAFT PR; the owner reviews and merges
```

## Phase 1: reporting

**Capture** (`app/app/lib/bugs/capture.ts`, started by `components/BugReport.tsx`'s
`BugReportHost` in `root.tsx`, for signed-in people only):

- rrweb (`@rrweb/record`, pinned) loads once the page is idle and records into memory:
  `checkoutEveryNms: 60_000` with two segments kept (`ReplayBuffer` in `lib/bugs/ring.ts`), so a
  report carries the last 1–2 minutes. `maskAllInputs`, text in form fields masked, `[data-private]`
  and the dialog itself blocked, stylesheets inlined (replays survive deploys), no canvas.
- Nothing is recorded on settings, sign-in, sign-up or password pages; the settings page is also
  `data-private`. Settings → Bug reports turns the recording off (`inkit:no-recording` in this browser).
- Console errors and warnings (last 50) and failed fetches (last 30: method, path without query,
  status) go into small rings.
- Nothing leaves the browser until the person presses Send.

**The dialog** ("Report a bug" in the nav's More menu, paint's … menu and on Settings, for
phones): What went wrong?, What did you expect? (optional), "Include a recording of the last 2
minutes" (ticked), "Include a screenshot" (html-to-image of the viewport, unticked). It sends the
state from `lib/bugs/state.ts`: the route, the build (`__BUILD_SHA__`, injected by
`vite.config.ts` from `GITHUB_SHA` or git), the user agent, viewport, colour scheme, and the
puzzle: on paint the live drawing, type and settings (paint's own copy in this browser,
`inkit:draw:<id>`), on the player the spec and the saved progress. A page with other state can
add it with `registerBugState(name, getter)`.

**The Worker** (`routes/bugs.ts`, `lib/bugs/bugs.server.ts`): signed in only (401), at most
`BUG_REPORTS_PER_DAY` (default 5) per person per day, counted from the `bug_reports` rows (429),
size limits (`LIMITS` in `lib/bugs/report.ts`: text 4,000 / 2,000 characters, state 512 KB,
replay 8 MB gzipped, screenshot 3 MB). The row goes to D1 (`bug_reports`, migration
`0009_bug_reports`); the files to R2: `bugs/<id>/state.json`, `replay.json.gz`, `screenshot.jpeg`.
Turnstile isn't configured on the site, so it isn't used; signed-in only plus the daily limit
stand in for it (add Turnstile if spam appears).

**The gatekeeper** (`lib/bugs/gatekeeper.server.ts`) runs after the response (`ctx.waitUntil`):
one Claude call (Sonnet 5.5, effort low, with the reader's refusal fallback) with **no tools**. The
report is cleaned (HTML comments, invisible characters, markdown links removed) and quoted as JSON
inside `<report>`, `<page>` and `<open_reports>` tags; the system prompt says it's data. It returns
a schema-checked verdict: `is_bug`, `duplicate_of_candidate` (among the last 20 open reports),
`spam_or_abuse`, `contains_instructions_to_ai`, `severity`, `area` (paint / player / layout /
other), a neutral `restatement` and `repro_steps`, capped to 600 / 8×200 characters. Spam or
instructions to an AI **quarantine** the report: it never goes to GitHub. With no
`ANTHROPIC_API_KEY` the report stays unreviewed. The browser tests give the verdict themselves
(`given-verdict`, accepted only when `import.meta.env.DEV`), so they never call Claude.

**Admin** (`/admin/bugs`, `/admin/bugs/<id>`; a signed-in admin or `ADMIN_API_TOKEN`): the list
with each verdict; a report's text, verdict, rrweb-player replay (loaded on demand), screenshot,
console and request log and state JSON; Dismiss / Reopen, Mark duplicate, and **Send to GitHub**,
which files an issue holding only `issueBody()`: the report id, the restatement and steps,
severity, area, build, the route as a pattern (`/g/<id>/draw`, `/<handle>`) and the admin link.
Never the reporter's text, the replay, the screenshot or the state. The page shows the issue it
would file. `GET /admin/bugs/<id>/bundle` gives the fix workflow the restatement, steps, state and
console log (not the reporter's words, not the replay), with `BUG_BUNDLE_TOKEN`, which opens
nothing else.

## Phase 2: the gated fix workflow

`.github/workflows/bug-fix.yml`, with its scripts in `.github/bug-fix/`:

1. **gate** (`gate.mjs`): runs only on `issues: labeled` with the label `ai-fix`. Never on issues
   opened or commented. The label must be added by the repo owner or someone whose role is admin
   or maintain. The issue must carry the site's marker (`<!-- inkit-bug-report: <id> -->`). At most
   5 runs a day.
2. **fix**: the same setup as CI's tests (`npm ci`, `.dev.vars` from the example, seeded local
   D1, Playwright). The bundle is fetched with `BUG_BUNDLE_TOKEN` in a step of its own, before the
   agent, into the gitignored `bug/`. Then `anthropics/claude-code-action@v1` runs with
   `prompt.md`: write a failing test first (unit, or Playwright at
   `tests/e2e/bugs/<id>.spec.ts`), commit it, fix, run CLAUDE.md's checks, commit. Everything in
   the bundle is data. Limits:
   - Sonnet 5.5, `--max-turns 60`, `--max-budget-usd 10`, `timeout-minutes: 45`;
   - `show_full_output: false`;
   - tools: read, edit, `npm`/`npx playwright`/`npx vitest`, and local `git` (no push, no curl, no
     gh, no web).
   
   The checkout keeps no token, and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is on. Then the guard
   (`guard.mjs`, copied before the agent ran) checks the diff. If it passes, the workflow pushes
   `ai-fix/issue-<n>-<run>` and opens a **draft** PR with a fixed template body.
3. **check**: a fresh job checks out the default branch, which the agent can't change, and runs
   the guard on the pushed branch again. If it fails, the PR is closed and the branch deleted.
4. **audit**: comments a summary on the issue: who added the label, the gate's verdict, the fixer's
   turns and cost, the diff's size, the guard's and the check's results, and the PR.

**The guard**:
- at most 10 files and 300 changed lines, and no binaries;
- none of these paths: `.github/`, `bug/`, `.claude/`, `CLAUDE.md`, `CODEOWNERS`, `.dev.vars`,
  `.env`, anything named secret, `package.json` and lockfiles, `wrangler.jsonc`, migrations,
  `db/schema.ts`, `workers/`, auth, admin and permission code, the auth and admin routes,
  `lib/bugs/`, and the test configs.

**Least privilege**:
- The fix job has only `contents: write` and `pull-requests: write`, through `GITHUB_TOKEN` (no
  PAT). That token can't change `.github/workflows` anyway.
- Its secrets are only `ANTHROPIC_API_KEY` and `BUG_BUNDLE_TOKEN` (step-scoped). No Cloudflare
  token and no `ADMIN_API_TOKEN`.
- The audit job alone has `issues: write`, and runs no agent.
- Nothing is uploaded as an artifact: artifacts on a public repo are public.

**Never merged automatically.** PRs are drafts; see the branch protection below. A PR opened with
`GITHUB_TOKEN` doesn't start other workflows, so run *Test and deploy inkit.games* on the branch
(Actions → Run workflow) before merging. Its deploy job runs only for `main`.

## Setup (the owner)

1. **Worker secrets**:
   - `npx wrangler secret put GITHUB_ISSUES_TOKEN`: a fine-grained token for this one repo with
     **Issues: read and write** and nothing else.
   - `npx wrangler secret put BUG_BUNDLE_TOKEN`: 32+ random characters (`openssl rand -hex 32`).
   - `ANTHROPIC_API_KEY` is already set for the reader. Optional: `GITHUB_REPO` (default
     `joshrtay/inkit`) and `BUG_REPORTS_PER_DAY`.
2. **GitHub secrets** (Settings → Secrets → Actions):
   - `ANTHROPIC_API_KEY`, already there for `ai-week.yml`. Better: a key from a separate Anthropic
     workspace with a monthly spend limit.
   - `BUG_BUNDLE_TOKEN`: the same value as the Worker's.
3. **The label**: create `ai-fix`. The issues are labelled `bug-report`, which GitHub creates on
   first use.
4. **A ruleset on `main`** (Settings → Rules → Rulesets; set up 2026-10-09 as "main"):
   - bypass: **Repository admin** only (the owner keeps pushing to main, which deploys);
   - for everyone else, including the fix workflow's token: a pull request with 1 approval and
     **Require review from Code Owners** (`.github/CODEOWNERS` names the owner for everything),
     and the **`test`** status check must pass;
   - deletion and force pushes blocked; auto-merge off (Settings → General).
5. **Actions settings** (Settings → Actions → General): keep *Workflow permissions* at "Read
   repository contents" (the workflow asks for what it needs per job). Don't allow Actions to
   approve pull requests.
6. **R2 retention**: add a lifecycle rule on `inkit-media` deleting objects under `bugs/` after
   30 days. The D1 rows stay.
7. Apply the migration: deploys do it (`deploy-inkit.yml`); locally run `npm --prefix app run db:migrate`.

## Using it

1. Open `/admin/bugs`, then the report.
2. Watch the replay and read the verdict. Dismiss it, mark it a duplicate, or **Send to GitHub**.
3. On the issue, add `ai-fix` to have the fixer try. Wait for the audit comment and the draft PR.
4. Review the PR as untrusted code: read the test first. The fix workflow starts the site's tests
   on the branch itself (a PR opened with its token can't), so the PR shows them; the ruleset
   requires them to pass. Try it (`gh pr checkout <n> && npm --prefix app run dev`), then mark it
   ready and merge, or close it.

## Safeguards, in one place

| Layer | Where |
|---|---|
| Signed-in reporters, 5 reports a day, size limits | `routes/bugs.ts`, `bugs.server.ts` |
| Nothing recorded until Send; inputs masked; private pages skipped; opt-out | `capture.ts`, Settings |
| The gatekeeper: no tools, quoted data, a schema, length caps, quarantine | `gatekeeper.server.ts`, `report.ts` |
| No user text, replay or personal data on GitHub; route as a pattern | `issueBody()`, tested in `bug-pipeline.test.ts` and `bugs.spec.ts` |
| Human gate: only the owner's or a maintainer's `ai-fix` label | `gate.mjs` |
| Least privilege: per-job permissions, no deploy secrets, no PAT, no push tool | `bug-fix.yml` |
| Path denylist and diff limit, enforced twice (the second from the default branch) | `guard.mjs`, the `check` job |
| Max turns, a budget, a timeout, 5 runs a day; a spend limit on the key | `bug-fix.yml`, Anthropic console |
| Draft PRs only, CODEOWNERS review, never auto-merge | branch protection |
| Audit comment on every run | the `audit` job |

**Not built yet** (research §8, phase 3): preview deploys per PR, emailing the owner, a replay
timeline and frames for the agent, and auto-running low-risk reports without the label.
