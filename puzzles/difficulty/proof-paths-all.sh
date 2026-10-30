#!/usr/bin/env bash
# Phase 1's proofs, every set in turn (proof-paths.ts), detached:
#   nohup puzzles/difficulty/proof-paths-all.sh > /dev/null 2>&1 &
# Each set resumes from its file, so rerunning after a restart carries on; a second pass retries
# the puzzles stopped at the cap. Log: references/proof/run.log.
cd "$(dirname "$0")/../.."
log=references/proof/run.log
echo "$$ started $(date)" >> "$log"
run() { DEDUCE_JOBS=${DEDUCE_JOBS:-2} node --no-warnings puzzles/difficulty/proof-paths.ts "$@" >> "$log" 2>&1; }
for pass in 1 2; do
  extra=""; [[ $pass == 2 ]] && extra="--retry"
  run ba $extra
  run pilot $extra
  run tatham 10 $extra
  for t in akari slitherlink masyu simple-loop; do run psjp $t 250 $extra; done
  for t in akari star-battle masyu slitherlink hitori fillomino nurikabe spiral-galaxies; do run janko $t 80 $extra; done
done
echo "$$ finished $(date)" >> "$log"
