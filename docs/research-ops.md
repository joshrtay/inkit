# Research operations

How to run, check and stop the research machinery, and the rules learned running it. Read with
[research-state.md](research-state.md), which holds the results, open questions and queue. Written
2026-10-14; keep it current when anything below changes.

## Start here (a new session)

1. Read research-state.md (aim, results, sequence, queue), then this file.
2. Check what's running (next section), and the cloud: `gcloud compute instances list`.
3. Merge any finished agent branches (`git branch | grep worktree-agent`) after reading their
   commits; see "Working rules".
4. Ask before anything on the "Needs the user's approval" list.

## What runs, and how to check, resume or stop it

Everything long runs **detached** (nohup), so it survives a session ending. A Mac restart stops it.
After one, rerun the start commands; each resumes from its cache.

| What | Start | Check | Stop |
|---|---|---|---|
| Janko full crawl (references/janko-full/) | `nohup python3 -I puzzles/difficulty/sources/janko_crawl.py > /dev/null 2>&1 &` | `tail -1 references/janko-full/progress.txt` | `kill <pid>` (pid in that line) |
| Logic Masters crawl (references/lmd/) | `nohup node --no-warnings puzzles/difficulty/sources/lmd.ts crawl >> references/lmd/crawl.log 2>&1 &` | `node --no-warnings puzzles/difficulty/sources/lmd.ts status` | `kill <pid>` |
| Crawl keeper: resumes the two above after network errors | `nohup puzzles/difficulty/sources/crawl-keeper.sh > /dev/null 2>&1 &` | `tail references/crawl-keeper.log` | `kill <pid>` (`pgrep -fl crawl-keeper`) |
| A sharded human build's watchdog and gather | `nohup puzzles/cloud/human-finish.sh <run> 3 > /dev/null 2>&1 &` | `tail references/ml/<run>-finish.log` | `kill <pid>` (`pgrep -fl human-finish`) |

**Done crawls:**
- Puzzle Square JP (references/psjp-full/, 78,238 puzzles; converted with `puzzles/difficulty/sources/psjp.ts`);
- puzz.link database (references/puzzlink-db/);
- LMI Expo (references/lmi-expo/; time figures only, since its puzzles need a login);
- puzzlekit and Nikoli 100.

**The cloud build as of writing:** `human-20261014-2153`, 8 spot VMs solving the 39,467-puzzle human corpus. human-finish.sh gathers it into references/ml/graphs-human-train.jsonl, human-corpus-status.jsonl and human-corpus-solved.md, uploads the training file to `gs://inkit-research-ml/data/`, and deletes the VMs.

**Crawling rules** (docs/research-puzzle-sources.md has each source's verdict):
- honest User-Agent with the contact address; one connection; cache everything;
- never log in; never collect per-person data (names, countries, replays): aggregates only;
- every crawler stops on any error. The keeper resumes only after network errors, never after
  pushback (403, 429, block pages, robots).

Janko reset the connection at 3 s and 4 s a request, so it now runs at 6 s.

## Google Cloud (project inkit-research)

- **gcloud:** `export PATH="$HOME/google-cloud-sdk/bin:$PATH"` in every shell. **The login
  expires every few days:** commands fail with "Reauthentication failed". Only the user can fix it,
  by running `gcloud auth login` in a terminal. Scripts and watchers wait rather than act on a
  failed listing.
- **Bucket:** `gs://inkit-research-ml`, private to the project.
  - `code/` and `private/code/`: code for jobs; uploaded by the launch scripts.
  - `data/`: training files the GPU jobs read.
  - `private/`: raw human puzzle data (Janko, Puzzle Square JP, corpus); never public.
  - `results/<run>/`: every job's output and job.log.
  - `models/<id>/`: registered networks, held (immutable), with cards (index:
    puzzles/difficulty/models.json).
- **Quotas:**
  - **CPU:** 512 vCPUs over all regions, but **200 per region** (us-central1, us-east4 and
    us-west4 allow 200; others 100). So 6 × 32-vCPU VMs fill a region: spread fleets across regions.
  - **Spot VMs** draw on the regular CPU quota (the preemptible quota is 0, and the request for more
    was declined).
  - **GPUs: 1 L4** in all. Requests for more were declined automatically; a smaller re-request with
    a justification is pending on the user's side. A separate Vertex AI quota of one preemptible L4
    (us-west2) exists and is unused.
- **L4 stockouts are common.** Launch with a loop over zones, retrying every 10 minutes (see how
  earlier launches were done: `puzzles/cloud/run-graph-job.sh <zone> <step>` in a zone loop).
- **Spot VMs get reclaimed:** fleets run with a watchdog (gen-fleet-watch.sh, human-watch.sh) that
  relaunches in another zone, carrying on from the synced cache.
- **Every VM** has a max run duration and deletes itself, but a VM that shuts itself down
  (finished) stays TERMINATED until deleted: the gather scripts delete them; check
  `gcloud compute instances list` after runs.
- **Jobs:**
  - **GPU:** `run-graph-job.sh <zone> <step>`; steps are all, holdout, grid, scale, structure,
    curve and next, set in graph-job.sh.
  - **Generation fleet:** `run-gen-fleet.sh` (GEN_PLAN=human for the human-like plan), then
    `gather-gen.sh`.
  - **Human corpus:** `run-human-job.sh --corpus N 32 3 20 [region]`, then human-finish.sh.

## Spending (approximate; the Cloud Billing console has the exact figures)

| What | Spent | Approved |
|---|---|---|
| Anthropic API: mining rounds | $2.50 | $10 |
| Anthropic API: labeller pilot and interest confirmation | $17.69 | $15, then about $5.50 more |
| Anthropic API: can Opus tell human-made puzzles | $2.68 | about $3 |
| Anthropic API: uncertainty cascade | $0.59 | $3 |
| GPU runs (about 9 so far, at roughly $0.8 an hour on one L4) | about $15–20 | per run, about $2–5 each |
| CPU: generation (first batch and the 15-VM fleet) | about $20 | about $20 |
| CPU: human builds (three so far) | a few dollars | under $8 |

**The API key** is read from app/.dev.vars with `grep '^ANTHROPIC_API_KEY='`. Never print or commit it.

## Needs the user's approval

- **Spending:** any new API spend, GPU run or CPU fleet, with an estimate first.
- **Pushing to main:** it deploys inkit.games. Main is far ahead with site changes (speed and
  loading, the link importer, bug fixes) waiting for the user's OK.
- **Sending emails or contacting anyone:** drafts are in references/outreach/emails.md, for the
  user to send.
- **Contacting any site,** or anything the sources report marks "ask first".
- **Downloads** from a source not yet in docs/research-puzzle-sources.md (check its licence first).

## Working rules learned the hard way

- **Keep the Mac quiet:** at most 2–4 solver jobs locally (DEDUCE_JOBS); heavy work goes to the
  cloud.
- **Stop processes by PID,** never by `pkill -f <pattern>`: patterns have matched the shell running
  them, more than once.
- **Agents** work in their own worktrees, merge main first, and never push. Merge their branches
  into main after reading the report. They sometimes leave background processes, so check with ps.
- **Before the app's browser tests:** apply local database migrations (`npm --prefix app run
  db:migrate`). The tests fail on a missing table otherwise.
- **Pre-commit checks** (CLAUDE.md): root build, the app's typecheck, tests and build, and for UI
  changes the e2e suite.
- **Editing a bash script while it runs breaks it** (bash reads scripts as it goes): stop it first.
- **macOS has bash 3.2:** no associative arrays.

## Decisions to remember

- **Beast Academy** is evaluation-only (its robots.txt says ai-train=no): never trained on
  (GRAPH_EVAL_ONLY).
- **Human data comes first:** generated data at 10× volume didn't move the human test. The
  human-like generation fleet (about $20, ready in run-gen-fleet.sh's HUMAN_FLEET) waits for the
  first training run with human data. Its narrow-thread preference should be off: it doesn't raise
  the human-likeness score.
- **puzz.link's computer-made puzzles** (its `generated` flag) aren't human: left out of the human
  corpus.
- **Capability and human-likeness are separate experiments.** The cheap-solver loop (network
  proposes, engine verifies) forks from the registered snapshot baseline-2026-10-14.
- **Opus is good for hints and for critiquing generator output,** not for labelling difficulty or
  interest, and not as a cascade behind the human-likeness classifier.
