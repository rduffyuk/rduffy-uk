# Automated site data refresh (systemd)

Keeps the cluster-derived parts of the site honest with **zero hand-editing** — the
`/journey` graph's live/retired state *and* the CV's Rootweaver metrics. A weekly
timer on a cluster-reachable host reads the running platform and, if anything
changed, commits + pushes so Cloudflare Pages redeploys.

```
rduffy-liveness.timer ──► rduffy-liveness.service ──► scripts/cron-refresh-site-data.sh
                                                          │
   live K3s workloads ──► refresh-cluster-liveness.mjs ──► journey-liveness.json
   live cluster+repo+vault ─► refresh-rootweaver-stats.mjs ─► rootweaver-stats.json
                                                          │
   build-journey.mjs ──► journey-data.json ──► git push ──► CF redeploy
```

## Where to run it

On the **K3s node itself** (the desktop) — it has local `kubectl`, so the script
runs without an SSH hop, and the box is always on. Pick a Linux user that has:

1. a working **kubeconfig** (can `kubectl get deploy -A`), and
2. a **GitHub push credential** for this repo (SSH deploy key or token).

## Prerequisites on that host

- `node` (≥22), `git`, `kubectl` on `PATH`
- a checkout of this repo, e.g. `git clone git@github.com:rduffy-uk/rduffy-uk.git ~/rduffy-uk`
- the repo's `origin` remote pushable by the service user

## Install

```bash
# from the repo root on the desktop
cp ops/systemd/rduffy-liveness.{service,timer} ~/.config/systemd/user/
# (or /etc/systemd/system/ for a system unit — then drop the User= line
#  and use absolute paths instead of %h)

systemctl --user daemon-reload
systemctl --user enable --now rduffy-liveness.timer

# verify
systemctl --user list-timers rduffy-liveness.timer
# dry-run the job once, watch the log
systemctl --user start rduffy-liveness.service
journalctl --user -u rduffy-liveness.service -n 30 --no-pager
```

> For a **user** unit to run while you're logged out, enable lingering:
> `loginctl enable-linger <user>`.

## Configuration

The service passes these to the wrapper (edit in `rduffy-liveness.service`):

| Env | Default | Meaning |
|-----|---------|---------|
| `RDUFFY_UK_REPO`   | `%h/rduffy-uk`              | repo checkout path |
| `RDUFFY_UK_BRANCH` | `main`                     | the branch Cloudflare deploys |
| `KUBECONFIG`       | `%h/.kube/config`          | cluster credentials |
| `PLATFORM_REPO`    | `/mnt/2tb/rootweaver-platform` | uv-workspace + vault, for CV stats |

## ⚠️ Before enabling

- **Only enable once the journey-liveness feature is on the deployed branch.**
  It currently lives on `redesign/unified`; pushing liveness to `main` before
  that merges just lands a JSON the live build doesn't consume yet (harmless,
  but pointless). Set `RDUFFY_UK_BRANCH` to whatever Cloudflare actually builds.
- The job **pushes to a public repo and triggers a production deploy**. That is
  the intent, but it is outward-facing — make sure the push credential is scoped
  to this repo only.
- Commits are unsigned (`commit.gpgsign=false`) and authored as
  `rduffy-liveness-bot <bot@rduffy.uk>` so they're distinguishable from your own.

## Manual alternative

No timer needed to refresh by hand. Liveness works from any mesh machine; the CV
stats refresh is best run on the K3s node (it needs the platform repo, vault, and
in-cluster Qdrant on disk/network):

```bash
# from any machine on the mesh
CLUSTER_SSH="user@cluster-host" pnpm run refresh:liveness
# from the K3s node
PLATFORM_REPO=/mnt/2tb/rootweaver-platform pnpm run refresh:stats
git add src/data/journey-liveness.json src/data/rootweaver-stats.json && git commit && git push
```
