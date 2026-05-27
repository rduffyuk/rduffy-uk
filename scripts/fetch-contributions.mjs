import { execSync } from "child_process";
import { writeFileSync, existsSync } from "fs";
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
    if (existsSync(OUT_PATH)) {
      console.log("⚠ GitHub fetch failed — keeping existing contributions.json");
    } else {
      console.warn("⚠ No GitHub data and no existing file — writing empty contributions.json");
      writeFileSync(
        OUT_PATH,
        JSON.stringify(
          { generatedAt: new Date().toISOString().split("T")[0], totalContributions: 0, weeks: [] },
          null,
          2
        )
      );
    }
    return;
  }

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
