#!/usr/bin/env bash
# Refresh the journey's component liveness from the live cluster and, if it
# changed, commit + push so Cloudflare Pages redeploys the site with the new
# dark/lit state. Designed to run from a systemd timer on a host that can reach
# the cluster directly (the K3s node) — so no CLUSTER_SSH hop is needed.
#
# Idempotent: a run with no liveness change makes no commit. Safe to run often.
set -euo pipefail

REPO="${RDUFFY_UK_REPO:-$HOME/rduffy-uk}"
BRANCH="${RDUFFY_UK_BRANCH:-main}"   # the branch Cloudflare Pages deploys

cd "$REPO"

# Start from a clean, current copy of the deploy branch so the only diff we ever
# introduce is the regenerated liveness/journey data.
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git reset --hard --quiet "origin/$BRANCH"

# Local kubectl (CLUSTER_SSH intentionally unset — this host reaches the cluster
# directly). Then fold the result into the generated journey data.
node scripts/refresh-cluster-liveness.mjs
node scripts/build-journey.mjs

DATA=(src/data/journey-liveness.json src/data/journey-data.json)
if git diff --quiet -- "${DATA[@]}"; then
  echo "[cron-liveness] no liveness change — nothing to deploy"
  exit 0
fi

git add "${DATA[@]}"
git -c commit.gpgsign=false \
    -c user.name="rduffy-liveness-bot" \
    -c user.email="bot@rduffy.uk" \
    commit -m "chore(journey): refresh component liveness from cluster

Automated weekly cluster read (systemd timer). Dims components no longer
running in K3s; lights ones that came back."
git push --quiet origin "$BRANCH"
echo "[cron-liveness] liveness changed — pushed; Cloudflare will redeploy"
