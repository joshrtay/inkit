#!/usr/bin/env bash
# The human corpus's proofs (proof-bulk.ts), detached, resuming where it stopped:
#   nohup puzzles/difficulty/proof-bulk-all.sh > /dev/null 2>&1 &
# A first pass over everything, then a pass retrying the puzzles stopped at the cap. Stop it by
# its PID (references/proof-bulk/run.pid), never pkill -f. Log: references/proof-bulk/run.log.
cd "$(dirname "$0")/../.."
mkdir -p references/proof-bulk
log=references/proof-bulk/run.log
echo $$ > references/proof-bulk/run.pid
echo "$$ started $(date)" >> "$log"
run() { PROOF_CAP=${PROOF_CAP:-60000} DEDUCE_JOBS=${DEDUCE_JOBS:-2} node --no-warnings puzzles/difficulty/proof-bulk.ts "$@" >> "$log" 2>&1; }
run
run --retry
echo "$$ finished $(date)" >> "$log"
