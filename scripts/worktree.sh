#!/usr/bin/env bash
# A working copy of its own for a job done alongside others (another session, an agent): a git
# worktree in .claude/worktrees/<name> on branch claude/<name>, with its packages installed, its own
# local database (migrated and seeded) and its own dev server port, so parallel jobs don't share a
# checkout, a database or a server. Merge its branch into main when it's done, then remove it.
#
#   scripts/worktree.sh <name> [base]   make one (base: main)
#   scripts/worktree.sh --remove <name> take it away (its branch too, if it's merged)
#   scripts/worktree.sh --list          the ones there are, with their ports
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
dir_of() { echo "$root/.claude/worktrees/$1"; }

if [[ "${1:-}" == "--list" ]]; then
  git -C "$root" worktree list
  for f in "$root"/.claude/worktrees/*/.worktree-port; do [[ -e "$f" ]] && echo "$(basename "$(dirname "$f")"): port $(cat "$f")"; done
  exit 0
fi

if [[ "${1:-}" == "--remove" ]]; then
  name="${2:?name}"; dir="$(dir_of "$name")"
  git -C "$root" worktree remove "$dir"
  git -C "$root" branch -d "claude/$name" 2>/dev/null || echo "Kept branch claude/$name: it isn't merged."
  exit 0
fi

name="${1:?usage: scripts/worktree.sh <name> [base]}"; base="${2:-main}"
dir="$(dir_of "$name")"
[[ -e "$dir" ]] && { echo "$dir already exists."; exit 1; }

git -C "$root" worktree add -b "claude/$name" "$dir" "$base"

# a dev server port no other worktree (or the main checkout's 5173) is using
port=5180
while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || grep -qx "$port" "$root"/.claude/worktrees/*/.worktree-port 2>/dev/null; do port=$((port + 1)); done
echo "$port" > "$dir/.worktree-port"

# local secrets (gitignored) come along; everything else is the branch's own
[[ -e "$root/app/.dev.vars" ]] && cp "$root/app/.dev.vars" "$dir/app/.dev.vars"

(cd "$dir" && npm ci --prefer-offline --no-audit --no-fund)
(cd "$dir/app" && npm run db:migrate && python3 seed/make.py && npm run db:seed)

cat <<EOF

Ready: $dir (branch claude/$name, port $port)
  dev server:   npm --prefix "$dir/app" run dev -- --port $port --strictPort
  browser tests: (cd "$dir/app" && E2E_PORT=$port npx playwright test)
  when merged:  scripts/worktree.sh --remove $name
EOF
