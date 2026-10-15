#!/bin/bash
# Keep the long crawls going through network blips, detached from any session. Every 10 minutes,
# for each crawl that isn't running and hasn't finished: if it stopped on a network error
# (connection reset, timeout, fetch failed), restart it, at most 6 times a day per crawl and after a
# 30-minute pause; if it stopped on anything else (HTTP 403 or 429, a block page, robots), leave it
# stopped for a person to look at. The crawls themselves stay polite and stop on every error; this
# only decides whether to resume. Log: references/crawl-keeper.log.
#
#   nohup puzzles/difficulty/sources/crawl-keeper.sh > /dev/null 2>&1 &
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT" || exit 1
LOG=references/crawl-keeper.log
exec >> "$LOG" 2>&1
echo "$(date '+%F %H:%M') keeper started (pid $$)"
# name | status line | start command | process pattern
status() { case $1 in
  janko) tail -1 references/janko-full/progress.txt 2>/dev/null ;;
  lmd) tail -1 references/lmd/crawl.log 2>/dev/null ;;
esac; }
running() { case $1 in
  janko) pgrep -f "sources/janko_crawl.py" > /dev/null ;;
  lmd) pgrep -f "sources/lmd.ts crawl" > /dev/null ;;
esac; }
start() { case $1 in
  janko) nohup python3 -I puzzles/difficulty/sources/janko_crawl.py > /dev/null 2>&1 & ;;
  lmd) nohup node --no-warnings puzzles/difficulty/sources/lmd.ts crawl >> references/lmd/crawl.log 2>&1 & ;;
esac; }
while true; do
  for c in janko lmd; do
    running "$c" && continue
    s=$(status "$c")
    [[ $s == *finished* || $s == *"done"* ]] && continue
    if [[ $s =~ (Connection\ reset|timed\ out|fetch\ failed|network\ error|URLError|Temporary\ failure|Name\ or\ service) ]] && ! [[ $s =~ (HTTP\ 4[0-9][0-9]|429|looks\ like\ a\ block|robots) ]]; then
      # restarts today, counted in a small file (macOS's bash has no associative arrays)
      f="references/.crawl-keeper-$c-$(date +%F)"; n=$(cat "$f" 2>/dev/null || echo 0)
      [ "$n" -ge 6 ] && continue
      sleep 1800
      running "$c" && continue
      n=$((n + 1)); echo "$n" > "$f"; echo "$(date '+%F %H:%M') restarting $c (try $n today) after: ${s:0:160}"; start "$c"
    fi
  done
  sleep 600
done
