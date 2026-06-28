#!/usr/bin/env bash
# Refresh the cluster-derived site data — journey component liveness AND the CV's
# Rootweaver metrics — and, if anything changed, commit + push so Cloudflare Pages
# redeploys. Designed to run from a systemd timer on a host that can reach the
# cluster directly (the K3s node), so no CLUSTER_SSH hop is needed.
#
# Idempotent: a run with no change makes no commit. Safe to run often.
set -euo pipefail

REPO="${RDUFFY_UK_REPO:-$HOME/rduffy-uk}"
BRANCH="${RDUFFY_UK_BRANCH:-main}"            # the branch Cloudflare Pages deploys
export PLATFORM_REPO="${PLATFORM_REPO:-/mnt/2tb/rootweaver-platform}"

cd "$REPO"

# Start from a clean, current copy of the deploy branch so the only diff we ever
# introduce is the regenerated data.
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git reset --hard --quiet "origin/$BRANCH"

# Read the live cluster (local kubectl — this host reaches it directly).
node scripts/refresh-cluster-liveness.mjs      # → journey-liveness.json
node scripts/refresh-rootweaver-stats.mjs      # → rootweaver-stats.json
node scripts/build-journey.mjs                 # fold liveness into journey-data.json

DATA=(
  src/data/journey-liveness.json
  src/data/journey-data.json
  src/data/rootweaver-stats.json
)
if git diff --quiet -- "${DATA[@]}"; then
  echo "[cron-site-data] no change — nothing to deploy"
  exit 0
fi

git add "${DATA[@]}"
git -c commit.gpgsign=false \
    -c user.name="rduffy-liveness-bot" \
    -c user.email="bot@rduffy.uk" \
    commit -m "chore(site): refresh cluster-derived data (liveness + CV stats)

Automated cluster read (systemd timer): journey component liveness and the
CV's Rootweaver metrics, kept true to the running platform."
git push --quiet origin "$BRANCH"
echo "[cron-site-data] data changed — pushed; Cloudflare will redeploy"
