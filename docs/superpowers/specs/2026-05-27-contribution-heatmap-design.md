# Contribution Heatmap — Design Spec

**Date**: 2026-05-27
**Status**: Approved

## Overview

Add a GitHub-style contribution heatmap to rduffy.uk showing combined commit activity from GitLab and GitHub. Data fetched at build time, rendered as a React island.

## Data Pipeline

### Fetch Script: `scripts/fetch-contributions.mjs`

Runs as a prebuild step (`"prebuild": "node scripts/fetch-contributions.mjs"` in package.json).

**Local development**: Uses `gh` and `glab` CLIs (already authenticated).

**Cloudflare builds**: Reads `GITHUB_TOKEN` and `GITLAB_TOKEN` env vars, calls APIs directly via fetch. Follow-up ticket for token setup.

**GitHub source**: GraphQL API `contributionsCollection.contributionCalendar` — returns 53 weeks of daily contribution counts. Includes private repo activity (if enabled in profile settings).

**GitLab source**: REST API `GET /users/29034229/events?per_page=100` — paginate all push events for the year, aggregate commit counts by date from `push_data.commit_count`.

**Output**: `src/data/contributions.json`

```json
{
  "generatedAt": "2026-05-27",
  "totalContributions": 850,
  "weeks": [
    {
      "days": [
        { "date": "2026-05-27", "github": 5, "gitlab": 37, "total": 42 },
        { "date": "2026-05-26", "github": 3, "gitlab": 8, "total": 11 }
      ]
    }
  ]
}
```

Weeks array is ordered oldest-first (left to right on the heatmap). Each week has exactly 7 days (Sun–Sat). The script handles merging: GitHub calendar provides the skeleton, GitLab events fill in the `gitlab` field by date.

**Graceful degradation**: If either API fails (rate limit, no token), the script logs a warning and writes the available data with 0 for the missing platform. The component renders whatever data exists.

## Component: `<ContributionHeatmap />`

React island at `src/components/ContributionHeatmap.tsx`. Uses `client:load`.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `variant` | `"compact" \| "full"` | Controls layout and time range |
| `data` | `ContributionData` | Imported from contributions.json |

### Variants

**Compact** (homepage):
- Last 13 weeks (3 months)
- No month labels, no day labels
- Grid only + total count below: `"342 contributions in the last 3 months"`
- Section header: "Activity" in site's mono uppercase style

**Full** (about page):
- All 53 weeks (1 year)
- Month labels across top (Jun, Jul, ... May)
- Day labels on left (Mon, Wed, Fri)
- Legend bottom-right: Less → 5 colour swatches → More
- Total count bottom-left: `"850 contributions in the last year"`
- Section header: "Contribution Activity" in site's mono uppercase style

### Visual Spec

- Cell size: 12px × 12px with 2px gap
- Border radius: 2px per cell
- Colour scale (5 levels):
  - 0 contributions: `#1e1e2e`
  - 1–3: `#14532d`
  - 4–8: `#16a34a`
  - 9–15: `#4ade80`
  - 16+: `#86efac`
- Light theme: adjust empty cell to `#ebedf0`, keep green scale

### Tooltip

On hover, show tooltip above the cell:
```
May 27: 37 GitLab · 5 GitHub
```

CSS tooltip (no library). Hidden on mobile (touch doesn't have hover).

## Page Integration

### Homepage (`src/pages/index.astro`)

New section between the stat cards and "What I'm Building" section:

```astro
<section class="border-t border-[--color-border]">
  <div class="mx-auto max-w-4xl px-6 py-12">
    <h2 class="mb-6 text-center font-mono text-xs tracking-[0.2em] uppercase text-[--color-text-subtle]">
      Activity
    </h2>
    <ContributionHeatmap variant="compact" data={contributions} client:load />
  </div>
</section>
```

### About Page (`src/pages/about.astro`)

New section after the principles cards, before the journey CTA:

```astro
<div class="mt-8">
  <h3 class="mb-6 text-center font-mono text-xs tracking-[0.2em] uppercase text-[--color-text-subtle]">
    Contribution Activity
  </h3>
  <ContributionHeatmap variant="full" data={contributions} client:load />
</div>
```

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/fetch-contributions.mjs` | Build-time data fetcher |
| `src/data/contributions.json` | Generated output (gitignored) |
| `src/components/ContributionHeatmap.tsx` | React heatmap component |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `"prebuild": "node scripts/fetch-contributions.mjs"` |
| `.gitignore` | No change yet — commit `contributions.json` initially so Cloudflare has data. Gitignore after tokens are set up in CI. |
| `src/pages/index.astro` | Add compact heatmap section |
| `src/pages/about.astro` | Add full heatmap section |

## Follow-up (separate ticket)

- Set `GITHUB_TOKEN` and `GITLAB_TOKEN` as Cloudflare Pages env vars for CI builds
- Until then, local builds generate the JSON and it gets committed manually
