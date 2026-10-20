#!/bin/bash
# Run once at the start of a cloud Claude session: when the environment carries GCP_SA_KEY_B64
# (the inkit-cloud-claude service account's JSON key, base64), sign gcloud in as that account,
# so research threads can use the bucket and launch Batch jobs without the Mac.
# Does nothing elsewhere. The key goes to a private temp file, never into the repo.
[ "$CLAUDE_CODE_REMOTE" = "true" ] && [ -n "$GCP_SA_KEY_B64" ] || exit 0
command -v gcloud > /dev/null || { echo "session-login: gcloud not installed"; exit 0; }
KEY=$(mktemp /tmp/gcp-sa-XXXXXX.json); chmod 600 "$KEY"
echo "$GCP_SA_KEY_B64" | base64 -d > "$KEY" 2>/dev/null || { echo "session-login: GCP_SA_KEY_B64 is not valid base64"; rm -f "$KEY"; exit 0; }
gcloud auth activate-service-account --key-file="$KEY" --project inkit-research > /dev/null 2>&1 \
  && echo "gcloud signed in as $(gcloud config get-value account 2>/dev/null)" \
  || echo "session-login: gcloud sign-in failed"
rm -f "$KEY"
exit 0
