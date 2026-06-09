# Dev deployment — unified redesign

Branch-ready package implementing the unified design (Engineering Notebook + shipping log).
Prod (`main` → push → build) is untouched: dev is a **separate worker** (`rduffy-uk-dev`)
deployed manually with one command.

## What's in this package

```
wrangler.json                       UPDATED — adds env.dev (rduffy-uk-dev worker)
package.json                        UPDATED — prebuild runs build-shipping-log; adds deploy:dev script
src/styles/global.css               REPLACED — unified tokens, semantic colors, legacy shims
src/layouts/BaseLayout.astro        REPLACED — IBM Plex Sans + JetBrains Mono
src/components/Nav.astro            REPLACED — slim nav: writing · adrs · platform · journey · cv · about
src/components/Footer.astro         REPLACED — status line + socials (moved here from nav)
src/components/ProofStrip.astro     NEW — replaces HeroStats; stats.json + collection counts, provenance line
src/components/ShippingLog.astro    NEW — posts + ADRs + commit digests, one stream
src/pages/index.astro               REPLACED — new homepage
src/pages/rss.xml.ts                NEW — RSS for /writing
src/pages/writing/index.astro       NEW — seasons + essays index
src/pages/writing/[...slug].astro   NEW — article layout (progress bar, linked ADRs, prev/next)
src/pages/adrs/index.astro          NEW — ADR ledger with status filters
src/pages/adrs/[...slug].astro      NEW — ADR detail (content + meta sidebar)
src/content.config.ts               REPLACED — adds `writing` and `adrs` collections
src/content/adrs/*.md               4 EXAMPLE ADRs — replace with real records (see sync-adrs)
src/utils/writing.ts                NEW — episode chip / season helpers
scripts/build-shipping-log.mjs      NEW — weekly commit digests → src/data/shipping-log.json
scripts/sync-adrs.mjs               NEW — copies `public: true` ADRs from the platform repo
```

Untouched: about / cv / journey / projects / rootweaver pages. They inherit the new
tokens via legacy shims in global.css (`.gradient-text` now renders solid text, glows
are gone). Port them properly later.

## Step 1 — branch + apply

```bash
cd rduffy-uk
git checkout -b redesign/unified
# copy everything from this package over the repo root (same paths)
```

## Step 2 — migrate the blog content

```bash
mkdir -p src/content/writing
cp ../blog-astro/src/data/blog/*.md src/content/writing/
cp -r ../blog-astro/public/posts public/        # post images keep their /posts/... URLs
```

Add `adrsTotal` to `src/data/stats.json` (used by ProofStrip + ADR index):

```json
{ "...": "existing fields", "adrsTotal": 46 }
```

## Step 3 — run locally

```bash
pnpm install        # no new dependencies — should be a no-op
pnpm dev            # check /, /writing, /writing/<slug>, /adrs, /adrs/046-mcp-transport
```

## Step 4 — deploy dev

```bash
pnpm deploy:dev
# → https://rduffy-uk-dev.<your-account>.workers.dev
```

## Step 5 — lock it behind Cloudflare Access

Dashboard → Zero Trust → Access → Applications → **Add application** → Self-hosted:

- Application domain: `rduffy-uk-dev.<your-account>.workers.dev`
- Policy: Allow → Include → Emails → your email
- Identity provider: One-time PIN is fine (no IdP setup needed)

Access also blocks crawlers, so no noindex worries on dev.

## Step 6 — real ADRs (when ready)

In the platform repo, add `public: true` to the frontmatter of ADRs you want published, then:

```bash
ADR_SOURCE_DIR=../rootweaver/adr pnpm sync-adrs
```

Delete the 4 EXAMPLE records in `src/content/adrs/` once real ones are in.
Each ADR can link its episode via `episode: <writing-collection-id>` frontmatter.

## Commit digests (optional now, easy later)

`scripts/build-shipping-log.mjs` already digests this repo's git history at build time.
To include the platform repo, add its project path to `GITLAB_PROJECTS` in the script and
set `GITLAB_TOKEN` (read_api scope) as a build secret. Subjects matching
secret/password/token/wip/merge are filtered out.

## Later — going to prod

1. Port about/cv/journey/projects/rootweaver pages to the unified components.
2. Merge `redesign/unified` → `main` (prod deploys automatically).
3. Cloudflare bulk redirects: `blog.rduffy.uk/posts/:slug → rduffy.uk/writing/:slug`,
   `blog.rduffy.uk/rss.xml → rduffy.uk/rss.xml`. Slugs were kept identical, so it's 1:1.
4. Archive the blog-astro repo after Search Console shows the new URLs indexed.
