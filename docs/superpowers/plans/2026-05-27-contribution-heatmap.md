# Contribution Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a combined GitHub + GitLab contribution heatmap to both the homepage (compact) and about page (full year).

**Architecture:** Build-time Node script fetches contribution data from GitHub GraphQL and GitLab events APIs, writes merged JSON. A React island component renders the heatmap grid with CSS tooltips.

**Tech Stack:** Node.js (fetch script), React + TypeScript (component), Astro (page integration), Tailwind CSS (styling)

---

### Task 1: Fetch Script — GitHub data

**Files:**
- Create: `scripts/fetch-contributions.mjs`

- [ ] **Step 1: Create the fetch script with GitHub GraphQL support**

```js
// scripts/fetch-contributions.mjs
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/contributions.json");

const GITHUB_USER = "rduffyuk";
const GITLAB_USER_ID = "29034229";

async function fetchGitHub() {
  const token = process.env.GITHUB_TOKEN;

  const query = `{
    user(login: "${GITHUB_USER}") {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }`;

  try {
    let data;
    if (token) {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      data = await res.json();
    } else {
      // Fall back to gh CLI
      const raw = execSync(
        `gh api graphql -f query='${query.replace(/\n/g, " ")}'`,
        { encoding: "utf-8" }
      );
      data = JSON.parse(raw);
    }

    const calendar =
      data.data.user.contributionsCollection.contributionCalendar;
    return calendar.weeks.map((w) => ({
      days: w.contributionDays.map((d) => ({
        date: d.date,
        github: d.contributionCount,
      })),
    }));
  } catch (err) {
    console.warn("⚠ GitHub fetch failed:", err.message);
    return null;
  }
}

async function fetchGitLab() {
  const token = process.env.GITLAB_TOKEN;
  const headers = token ? { "PRIVATE-TOKEN": token } : {};

  // Determine date range: 1 year ago from today
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const after = oneYearAgo.toISOString().split("T")[0];

  const commitsByDate = {};
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      let events;
      if (token) {
        const res = await fetch(
          `https://gitlab.com/api/v4/users/${GITLAB_USER_ID}/events?per_page=${perPage}&page=${page}&after=${after}`,
          { headers }
        );
        events = await res.json();
      } else {
        const raw = execSync(
          `glab api "/users/${GITLAB_USER_ID}/events?per_page=${perPage}&page=${page}&after=${after}"`,
          { encoding: "utf-8" }
        );
        events = JSON.parse(raw);
      }

      if (!Array.isArray(events) || events.length === 0) break;

      for (const event of events) {
        if (
          event.action_name === "pushed to" ||
          event.action_name === "pushed new"
        ) {
          const date = event.created_at.split("T")[0];
          const commits = event.push_data?.commit_count || 1;
          commitsByDate[date] = (commitsByDate[date] || 0) + commits;
        }
      }

      if (events.length < perPage) break;
      page++;
    }
  } catch (err) {
    console.warn("⚠ GitLab fetch failed:", err.message);
  }

  return commitsByDate;
}

async function main() {
  console.log("Fetching contribution data...");

  const [ghWeeks, glCommits] = await Promise.all([
    fetchGitHub(),
    fetchGitLab(),
  ]);

  if (!ghWeeks) {
    console.warn("⚠ No GitHub data — writing empty contributions.json");
    writeFileSync(
      OUT_PATH,
      JSON.stringify(
        { generatedAt: new Date().toISOString().split("T")[0], totalContributions: 0, weeks: [] },
        null,
        2
      )
    );
    return;
  }

  // Merge GitLab data into the GitHub calendar skeleton
  let totalContributions = 0;
  const weeks = ghWeeks.map((week) => ({
    days: week.days.map((day) => {
      const gitlab = (glCommits && glCommits[day.date]) || 0;
      const total = day.github + gitlab;
      totalContributions += total;
      return {
        date: day.date,
        github: day.github,
        gitlab,
        total,
      };
    }),
  }));

  const output = {
    generatedAt: new Date().toISOString().split("T")[0],
    totalContributions,
    weeks,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(
    `✓ Wrote ${OUT_PATH} — ${totalContributions} contributions across ${weeks.length} weeks`
  );
}

main();
```

- [ ] **Step 2: Run the script to generate data**

Run: `node scripts/fetch-contributions.mjs`
Expected: Creates `src/data/contributions.json` with merged data, logs something like `✓ Wrote ... — 850 contributions across 53 weeks`

- [ ] **Step 3: Verify the generated JSON**

Run: `node -e "const d=require('./src/data/contributions.json'); console.log('weeks:', d.weeks.length, 'total:', d.totalContributions); console.log('sample:', d.weeks[d.weeks.length-1].days[d.weeks[d.weeks.length-1].days.length-1])"`
Expected: `weeks: 53`, `total: >0`, sample day shows `{ date, github, gitlab, total }`

- [ ] **Step 4: Add prebuild script to package.json**

In `package.json`, change the `scripts` section:

```json
"scripts": {
  "dev": "astro dev",
  "prebuild": "node scripts/fetch-contributions.mjs",
  "build": "astro build",
  "preview": "astro preview",
  "astro": "astro"
},
```

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-contributions.mjs src/data/contributions.json package.json
git commit -m "feat: add build-time contribution data fetcher (GitHub + GitLab)"
```

---

### Task 2: ContributionHeatmap React Component

**Files:**
- Create: `src/components/ContributionHeatmap.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/ContributionHeatmap.tsx
import { useState } from "react";

interface ContributionDay {
  date: string;
  github: number;
  gitlab: number;
  total: number;
}

interface ContributionWeek {
  days: ContributionDay[];
}

interface ContributionData {
  generatedAt: string;
  totalContributions: number;
  weeks: ContributionWeek[];
}

interface Props {
  variant: "compact" | "full";
  data: ContributionData;
}

const LEVELS = ["#1e1e2e", "#14532d", "#16a34a", "#4ade80", "#86efac"];
const LEVELS_LIGHT = ["#ebedf0", "#14532d", "#16a34a", "#4ade80", "#86efac"];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 8) return 2;
  if (count <= 15) return 3;
  return 4;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

function getMonthLabels(
  weeks: ContributionWeek[]
): { label: string; col: number }[] {
  const labels: { label: string; col: number }[] = [];
  let lastMonth = "";
  for (let i = 0; i < weeks.length; i++) {
    const firstDay = weeks[i].days[0];
    if (!firstDay) continue;
    const month = new Date(firstDay.date + "T00:00:00").toLocaleDateString(
      "en-GB",
      { month: "short" }
    );
    if (month !== lastMonth) {
      labels.push({ label: month, col: i });
      lastMonth = month;
    }
  }
  return labels;
}

export default function ContributionHeatmap({ variant, data }: Props) {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const weeks =
    variant === "compact" ? data.weeks.slice(-13) : data.weeks;

  const compactTotal =
    variant === "compact"
      ? weeks.reduce(
          (sum, w) => sum + w.days.reduce((s, d) => s + d.total, 0),
          0
        )
      : data.totalContributions;

  const monthLabels = variant === "full" ? getMonthLabels(weeks) : [];
  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  const isDark =
    typeof document !== "undefined"
      ? !document.documentElement.hasAttribute("data-theme") ||
        document.documentElement.getAttribute("data-theme") === "dark"
      : true;
  const levels = isDark ? LEVELS : LEVELS_LIGHT;

  function handleMouseEnter(
    e: React.MouseEvent<HTMLDivElement>,
    day: ContributionDay
  ) {
    if (day.total === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text: `${formatDate(day.date)}: ${day.gitlab} GitLab · ${day.github} GitHub`,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  return (
    <div className="relative flex flex-col items-center">
      <div className="flex gap-0">
        {/* Day labels (full only) */}
        {variant === "full" && (
          <div className="mr-1 flex flex-col gap-[2px]">
            {dayLabels.map((label, i) => (
              <div
                key={i}
                className="flex items-center justify-end"
                style={{
                  height: 12,
                  width: 28,
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "#64748b",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        )}

        <div>
          {/* Month labels (full only) */}
          {variant === "full" && (
            <div className="relative mb-1" style={{ height: 14 }}>
              {monthLabels.map((m) => (
                <span
                  key={m.col}
                  className="absolute"
                  style={{
                    left: m.col * 14,
                    fontSize: 9,
                    fontFamily: "monospace",
                    color: "#64748b",
                  }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          )}

          {/* Grid */}
          <div className="flex gap-[2px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px]">
                {week.days.map((day, di) => (
                  <div
                    key={di}
                    onMouseEnter={(e) => handleMouseEnter(e, day)}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: levels[getLevel(day.total)],
                      cursor: day.total > 0 ? "pointer" : "default",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: total + legend */}
      <div
        className="mt-2 flex w-full items-center"
        style={{
          justifyContent: variant === "full" ? "space-between" : "center",
          paddingLeft: variant === "full" ? 30 : 0,
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          <span style={{ color: "#4ade80", fontWeight: 600 }}>
            {compactTotal.toLocaleString()}
          </span>{" "}
          contributions in the last{" "}
          {variant === "compact" ? "3 months" : "year"}
        </span>

        {variant === "full" && (
          <div className="flex items-center gap-1">
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                color: "#64748b",
              }}
            >
              Less
            </span>
            {levels.map((color, i) => (
              <div
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: color,
                }}
              />
            ))}
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                color: "#64748b",
              }}
            >
              More
            </span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 hidden md:block"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div
            style={{
              background: "#1e293b",
              color: "#e2e8f0",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "monospace",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            {tooltip.text}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx astro check 2>&1 | tail -5` (or just `npm run build`)
Expected: No type errors related to ContributionHeatmap

- [ ] **Step 3: Commit**

```bash
git add src/components/ContributionHeatmap.tsx
git commit -m "feat: add ContributionHeatmap React component (compact + full variants)"
```

---

### Task 3: Homepage Integration

**Files:**
- Modify: `src/pages/index.astro:1-4` (imports), `src/pages/index.astro:38-40` (insert section)

- [ ] **Step 1: Add imports and data load**

In `src/pages/index.astro`, update the frontmatter (lines 1-4):

```astro
---
import BaseLayout from "@layouts/BaseLayout.astro";
import HeroStats from "@components/HeroStats.astro";
import ContributionHeatmap from "@components/ContributionHeatmap";
import contributions from "@data/contributions.json";
---
```

- [ ] **Step 2: Add the compact heatmap section**

Insert after the closing `</section>` of the hero (after line 38, before the "What I Build" section):

```astro
  <!-- Activity heatmap -->
  <section class="border-t border-[--color-border]">
    <div class="mx-auto max-w-4xl px-6 py-12">
      <h2 class="mb-6 text-center font-mono text-xs tracking-[0.2em] uppercase text-[--color-text-subtle]">
        Activity
      </h2>
      <ContributionHeatmap variant="compact" data={contributions} client:load />
    </div>
  </section>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds, 13 pages

- [ ] **Step 4: Visual check**

Run: `npm run preview` and open `http://localhost:4321`
Verify: Compact heatmap appears below stat cards, above "What I Build"

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add compact contribution heatmap to homepage"
```

---

### Task 4: About Page Integration

**Files:**
- Modify: `src/pages/about.astro:1-6` (imports), `src/pages/about.astro:57` (insert section)

- [ ] **Step 1: Add imports and data load**

Update the frontmatter in `src/pages/about.astro`:

```astro
---
import BaseLayout from "@layouts/BaseLayout.astro";
import { getEntry, render } from "astro:content";
import ContributionHeatmap from "@components/ContributionHeatmap";
import contributions from "@data/contributions.json";

const entry = await getEntry("pages", "about");
const { Content } = await render(entry);

const roles = [
  { label: "SRE Specialist", icon: "⚙️", color: "--color-success" },
  { label: "AI Orchestrator", icon: "🧠", color: "--color-accent" },
  { label: "Platform Builder", icon: "🔮", color: "--color-accent-cyan" },
];

const principles = [
  { title: "Direct, Don't Type", description: "I architect and orchestrate. Claude Code is my hands on the keyboard." },
  { title: "Ship Daily", description: "Rootweaver grows every day. Organic, compounding progress." },
  { title: "Document Everything", description: "43 ADRs and counting. If it's not written down, it didn't happen." },
];
---
```

- [ ] **Step 2: Add the full heatmap section**

Insert after the principles grid closing `</div>` (after line 57), before the closing `</article>`:

```astro
    <!-- Contribution activity -->
    <div class="mt-10">
      <h3 class="mb-6 text-center font-mono text-xs tracking-[0.2em] uppercase text-[--color-text-subtle]">
        Contribution Activity
      </h3>
      <ContributionHeatmap variant="full" data={contributions} client:load />
    </div>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds, 13 pages

- [ ] **Step 4: Visual check**

Run: `npm run preview` and open `http://localhost:4321/about`
Verify: Full year heatmap with month labels, day labels, legend, and tooltip on hover

- [ ] **Step 5: Commit**

```bash
git add src/pages/about.astro
git commit -m "feat: add full-year contribution heatmap to about page"
```

---

### Task 5: Final Build + Push

**Files:** None new — integration verification only.

- [ ] **Step 1: Full build from clean state**

Run: `npm run build 2>&1 | tail -10`
Expected: Prebuild fetches contributions, then Astro builds 13 pages successfully

- [ ] **Step 2: Visual smoke test both pages**

Run: `npm run preview`
Check:
- Homepage: compact heatmap below stats, tooltips work
- About: full year heatmap below principles, month/day labels, legend, tooltips

- [ ] **Step 3: Push to both remotes**

```bash
git push origin main
```

(This pushes to both GitLab and GitHub since origin has dual push URLs configured.)

Expected: Cloudflare auto-deploys from GitHub.
