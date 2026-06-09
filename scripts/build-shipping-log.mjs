#!/usr/bin/env node
/**
 * build-shipping-log.mjs — weekly commit digests for the homepage shipping log.
 *
 * Reads git history from the current repo (always available in CI checkouts)
 * and, optionally, from GitLab projects via API when GITLAB_TOKEN is set.
 * Groups commits by ISO week, filters noise, writes src/data/shipping-log.json.
 *
 * Privacy: only repos explicitly listed below are read; commit subjects are
 * filtered (no bodies, no diffs); anything matching SKIP_PATTERNS is dropped.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const WEEKS_BACK = 6;
const MAX_DIGESTS = 4;

// GitLab projects to include (besides this repo). Requires GITLAB_TOKEN env
// with read_api scope. Use the URL-encoded project path.
const GITLAB_PROJECTS = [
  // "ryanduffy.uk%2Frootweaver-platform",
];

const SKIP_PATTERNS = [/^wip\b/i, /^fixup!/, /^squash!/, /secret/i, /password/i, /token/i, /^merge branch/i];

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

function localCommits() {
  try {
    const out = execSync(
      `git log --since="${WEEKS_BACK} weeks ago" --pretty=format:"%ad|%s" --date=short`,
      { encoding: "utf8" }
    );
    return out.split("\n").filter(Boolean).map((line) => {
      const [date, ...rest] = line.split("|");
      return { date, subject: rest.join("|") };
    });
  } catch {
    console.warn("[shipping-log] no git history available, skipping local commits");
    return [];
  }
}

async function gitlabCommits(project) {
  const token = process.env.GITLAB_TOKEN;
  if (!token) return [];
  const since = new Date(Date.now() - WEEKS_BACK * 7 * 86400000).toISOString();
  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${project}/repository/commits?since=${since}&per_page=100`,
    { headers: { "PRIVATE-TOKEN": token } }
  );
  if (!res.ok) {
    console.warn(`[shipping-log] GitLab fetch failed for ${project}: ${res.status}`);
    return [];
  }
  const commits = await res.json();
  return commits.map((c) => ({ date: c.created_at.slice(0, 10), subject: c.title }));
}

const all = [...localCommits()];
for (const p of GITLAB_PROJECTS) {
  all.push(...(await gitlabCommits(p)));
}

const clean = all.filter((c) => !SKIP_PATTERNS.some((re) => re.test(c.subject)));

// Group by ISO week
const byWeek = new Map();
for (const c of clean) {
  const { year, week } = isoWeek(new Date(c.date));
  const key = `${year}-W${String(week).padStart(2, "0")}`;
  if (!byWeek.has(key)) byWeek.set(key, { dates: [], subjects: [] });
  const g = byWeek.get(key);
  g.dates.push(c.date);
  g.subjects.push(c.subject);
}

// Digest: pick the 3 most informative subjects (longest, deduped prefixes)
const digests = [...byWeek.entries()]
  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
  .slice(0, MAX_DIGESTS)
  .map(([key, g]) => {
    const top = [...new Set(g.subjects)]
      .sort((a, b) => b.length - a.length)
      .slice(0, 3)
      .map((s) => s.replace(/^\w+(\(.+?\))?:\s*/, "")); // strip conventional-commit prefix
    return {
      week: `WK·${key.slice(-2)}`,
      date: g.dates.sort().at(-1),
      title: `${g.subjects.length} commits — ${top.join(", ")}`,
    };
  });

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/shipping-log.json", JSON.stringify(digests, null, 2));
console.log(`[shipping-log] wrote ${digests.length} weekly digests`);
