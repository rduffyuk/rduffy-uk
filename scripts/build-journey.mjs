#!/usr/bin/env node
/**
 * build-journey.mjs — generate the journey timeline from a curated seed
 * plus the public ADRs, so the journey auto-extends as decisions ship.
 *
 *   journey-seed.json   (hand-authored history — the founding narrative; frozen)
 *        +
 *   src/content/adrs/*.md  (every public:true ADR, interleaved with the seed by date)
 *        =
 *   journey-data.json   (GENERATED — what the site renders; do not hand-edit)
 *
 * Idempotent: always rebuilds from seed + ADRs, never reads its own output.
 * Runs in `prebuild`, so every deploy refreshes the timeline. Publish a new
 * public ADR → it appears as a milestone automatically.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEED = "src/data/journey-seed.json";
const ADR_DIR = "src/content/adrs";
const OUT = "src/data/journey-data.json";

// Palette shared with the site/journey visuals.
const PALETTE = ["#a855f7", "#22c55e", "#ec4899", "#f97316", "#3b82f6", "#00d4ff", "#ef4444", "#eab308"];
const STATUS_COLOR = { accepted: "#22c55e", proposed: "#eab308", superseded: "#64748b", deprecated: "#64748b" };

// Stable string hash → palette index (deterministic colour per tag).
function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Minimal frontmatter field extraction (mirrors sync-adrs.mjs's regex style;
// avoids a YAML dependency for the handful of fields we need).
function parseAdr(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const head = fm[1];
  if (!/^public:\s*true\s*$/m.test(head)) return null; // never publish private ADRs

  const id = head.match(/^id:\s*(\d+)/m)?.[1];
  const title = head.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  const date = head.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
  const status = head.match(/^status:\s*(\w+)/m)?.[1] ?? "accepted";
  const tagsRaw = head.match(/^tags:\s*\[(.*?)\]/m)?.[1] ?? "";
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
  if (!id || !title || !date) return null;

  // Description = first paragraph after "## Context", de-marked + truncated.
  const body = content.slice(fm[0].length);
  const ctx = body.match(/##\s+Context\s*\n+([\s\S]*?)(?:\n\n|\n##)/);
  let desc = (ctx?.[1] ?? "").replace(/\s+/g, " ").trim();
  desc = desc.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/\[(.+?)\]\(.*?\)/g, "$1");
  if (desc.length > 230) desc = desc.slice(0, 227).replace(/\s+\S*$/, "") + "…";

  return { id, title, date, status, tags, desc };
}

function adrToMilestone(adr, prevHubId) {
  const padded = String(adr.id).padStart(3, "0");
  // ONE node per ADR in the 3D graph (the decision), chained to the previous
  // decision so they form a clean timeline thread — not a burst of tag nodes
  // (that piled up and made labels collide). Tags live on the card as chips.
  const retired = adr.status === "superseded" || adr.status === "deprecated";
  const hub = { id: `adr-${padded}`, label: `ADR-${padded}`, group: "decision", color: STATUS_COLOR[adr.status] ?? "#a855f7", retired };
  const tags = adr.tags.slice(0, 6).map((t) => ({
    id: t.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label: t,
    color: tagColor(t),
  }));
  const edges = prevHubId ? [{ from: prevHubId, to: hub.id }] : [];
  return {
    date: adr.date,
    title: `ADR-${padded} · ${adr.title}`,
    description: adr.desc,
    nodes: [hub],
    edges,
    tags, // card chips only (not 3D nodes)
    blogEpisode: null,
    link: { href: `/adrs/${padded}/`, label: "Read decision" }, // href resolved below to the real slug
  };
}

// ---- build ----
const seed = JSON.parse(readFileSync(SEED, "utf8"));
const seedMilestones = seed.milestones ?? [];

// Map ADR id → real filename slug so the link href is correct.
const files = readdirSync(ADR_DIR).filter((f) => f.endsWith(".md"));
const slugById = {};
for (const f of files) {
  const m = f.match(/^(\d+)-(.+)\.md$/);
  if (m) slugById[String(Number(m[1])).padStart(3, "0")] = f.replace(/\.md$/, "");
}

// Every public ADR becomes a milestone, interleaved with the seed by date.
// Sort by date first so the decision-chain edges thread chronologically.
const parsed = files
  .map((f) => parseAdr(readFileSync(join(ADR_DIR, f), "utf8")))
  .filter(Boolean)
  .sort((a, b) => a.date.localeCompare(b.date));

const adrMilestones = [];
let prevHubId = null;
for (const adr of parsed) {
  const padded = String(adr.id).padStart(3, "0");
  const ms = adrToMilestone(adr, prevHubId);
  ms.link.href = slugById[padded] ? `/adrs/${slugById[padded]}/` : `/adrs/`;
  adrMilestones.push(ms);
  prevHubId = `adr-${padded}`;
}

const milestones = [...seedMilestones, ...adrMilestones].sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(OUT, JSON.stringify({ milestones }, null, 2) + "\n");
console.log(`[build-journey] ${seedMilestones.length} seed + ${adrMilestones.length} public ADR = ${milestones.length} milestones → ${OUT}`);
