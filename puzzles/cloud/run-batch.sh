#!/bin/bash
# Run a resumable research script sharded on Google Cloud Batch (batch-task.sh in each task).
# Batch keeps the job going by itself: a spot VM Google reclaims, or a task that reaches its
# per-attempt limit, is retried and carries on from its synced rows. Nothing has to stay running
# where this was launched, so it works from the Mac or from a cloud session with a service account.
#
#   puzzles/cloud/run-batch.sh <script> <out dir> [options]
#     --tasks N        shards (default 8)
#     --parallel P     shards running at once (default: all)
#     --machine TYPE   default n2-highcpu-32
#     --standard       regular VMs instead of spot
#     --region R       default us-central1 (a job's VMs stay in one region: 200 vCPUs a region)
#     --hours H        one attempt's limit (default 3); a task gets up to 10 attempts
#     --input P:D      a bucket path copied to a local dir before the script runs (repeatable;
#                      default private/human-corpus:references/ml/human-corpus)
#     --seed DIR       a local dir of rows already made, uploaded to results/<run>/seed
#     --run NAME       default <out dir>-<date>
#     --mem MB         memory a solve may take (default 1400)
#     --env K=V        passed to the script (repeatable), e.g. --env PROOF_CAP=60000
#     --args "..."     extra arguments for the script
#     --dry            write the job's config and print it, submit nothing
#
#   e.g. puzzles/cloud/run-batch.sh puzzles/difficulty/proof-bulk.ts proof-bulk --tasks 12 \
#          --seed references/proof-bulk --env PROOF_CAP=60000
#
# Check:  gcloud batch jobs describe <run> --location <region> --project inkit-research
#         gcloud batch tasks list --job <run> --location <region> --project inkit-research
# Gather: puzzles/cloud/gather-batch.sh <run> <out dir>
# Stop:   gcloud batch jobs delete <run> --location <region> --project inkit-research
set -e
PROJECT=inkit-research; BUCKET=inkit-research-ml
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SCRIPT=${1:?script}; OUT=${2:?out dir}; shift 2
TASKS=8; PARALLEL=; MACHINE=n2-highcpu-32; MODEL=SPOT; REGION=us-central1; HOURS=3
INPUTS=; SEED=; RUN=; MEM=1400; ENVS=(); ARGS=; DRY=
while [ $# -gt 0 ]; do
  case $1 in
    --tasks) TASKS=$2; shift ;; --parallel) PARALLEL=$2; shift ;; --machine) MACHINE=$2; shift ;;
    --standard) MODEL=STANDARD ;; --region) REGION=$2; shift ;; --hours) HOURS=$2; shift ;;
    --input) INPUTS="$INPUTS $2"; shift ;; --seed) SEED=$2; shift ;; --run) RUN=$2; shift ;;
    --mem) MEM=$2; shift ;; --env) ENVS+=("$2"); shift ;; --args) ARGS=$2; shift ;; --dry) DRY=1 ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
  shift
done
INPUTS=${INPUTS:-private/human-corpus:references/ml/human-corpus}
RUN=${RUN:-$(echo "$OUT" | tr -c 'a-z0-9\n' '-')-$(date +%Y%m%d-%H%M)}

# the code as it is now, under its commit (and a stamp when the tree has changes), so a running
# job never sees later edits
SHA=$(git -C "$ROOT" rev-parse --short HEAD)
[ -n "$(git -C "$ROOT" status --porcelain -- src puzzles package.json)" ] && SHA=$SHA-dirty-$(date +%Y%m%d%H%M%S)
CODE=private/code/$SHA

TMP=$(mktemp -d)
node --no-warnings -e '
const [run, script, out, code, inputs, hours, mem, args, tasks, parallel, machine, model, region, project, bucket, ...envs] = process.argv.slice(1);
const env = { RUN: run, SCRIPT: script, OUT: out, CODE: code, INPUTS: inputs.trim(), HOURS: hours, MEM_PER_JOB: mem, ARGS: args };
for (const e of envs) { const i = e.indexOf("="); env[e.slice(0, i)] = e.slice(i + 1); }
const job = {
  taskGroups: [{
    taskCount: Number(tasks), parallelism: Number(parallel || tasks),
    taskSpec: {
      // a whole VM per task: at the default of 2 vCPUs, Batch packs several tasks onto one VM,
      // where they share its CPUs and each sizes its pool as if it had them all
      computeResource: { cpuMilli: 1000 * Number(machine.split("-").pop()) },
      runnables: [{ script: { text: "bash /mnt/disks/inkit/" + code + "/puzzles/cloud/batch-task.sh" } }],
      environment: { variables: env },
      volumes: [{ gcs: { remotePath: bucket }, mountPath: "/mnt/disks/inkit", mountOptions: ["--implicit-dirs"] }],
      maxRunDuration: `${Number(hours) * 3600 + 600}s`,
      maxRetryCount: 10,
      lifecyclePolicies: [{ action: "RETRY_TASK", actionCondition: { exitCodes: [50001, 75] } }],
    },
  }],
  allocationPolicy: {
    location: { allowedLocations: [`regions/${region}`] },
    instances: [{ policy: { machineType: machine, provisioningModel: model, bootDisk: { sizeGb: 30 } } }],
    serviceAccount: { email: `inkit-batch-vm@${project}.iam.gserviceaccount.com` },
  },
  labels: { run, kind: "research" },
  logsPolicy: { destination: "CLOUD_LOGGING" },
};
console.log(JSON.stringify(job, null, 2));
' "$RUN" "$SCRIPT" "$OUT" "$CODE" "$INPUTS" "$HOURS" "$MEM" "$ARGS" "$TASKS" "$PARALLEL" "$MACHINE" "$MODEL" "$REGION" "$PROJECT" "$BUCKET" "${ENVS[@]}" > "$TMP/job.json"
if [ -n "$DRY" ]; then cat "$TMP/job.json"; echo "dry run: $RUN, code would go to gs://$BUCKET/$CODE"; exit; fi

gcloud storage ls "gs://$BUCKET/$CODE/package.json" > /dev/null 2>&1 || \
  gcloud storage cp -r "$ROOT/src" "$ROOT/puzzles" "$ROOT/package.json" "gs://$BUCKET/$CODE/"
[ -n "$SEED" ] && gcloud storage rsync -q -x '.*\.log$|run\..*|.*\.seed$' "$SEED" "gs://$BUCKET/results/$RUN/seed"
gcloud batch jobs submit "$RUN" --location "$REGION" --project "$PROJECT" --config "$TMP/job.json"
echo "$RUN submitted in $REGION: $TASKS tasks of $MACHINE ($MODEL), code gs://$BUCKET/$CODE"
