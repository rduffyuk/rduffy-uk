#!/usr/bin/env node
/** Build historical stories, reviewed checkpoints and optional public decisions.
 * Generated output is reproducible; a build does not verify live state.
 * Original founding history stays in journey-seed.json.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEED = "src/data/journey-seed.json";
const ADR_DIR = "src/content/adrs";
const REVIEWED = "src/data/journey-reviewed.json";
const LIFECYCLE = "src/data/journey-lifecycle.json";
const OUT = "src/data/journey-data.json";
const reviewed = JSON.parse(readFileSync(REVIEWED, "utf8"));
const journal = JSON.parse(readFileSync("src/data/journal-backfill.json", "utf8"));
const lifecycle = JSON.parse(readFileSync(LIFECYCLE, "utf8")).nodes;

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
  const field = key => {
    const raw = head.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"))?.[1];
    if (!raw) return undefined;
    if (raw.startsWith('"')) return JSON.parse(raw);
    return raw.replace(/^'|'$/g, '');
  };
  const title = field('title');
  const date = head.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
  const status = head.match(/^status:\s*(\w+)/m)?.[1] ?? "accepted";
  const tagsRaw = head.match(/^tags:\s*\[(.*?)\]/m)?.[1] ?? "";
  const tags = tagsRaw.trim().startsWith('"') ? JSON.parse(`[${tagsRaw}]`) : tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
  if (!id || !title || !date) return null;

  // Description = first paragraph after "## Context", de-marked + truncated.
  const body = content.slice(fm[0].length);
  const ctx = body.match(/##\s+Context\s*\n+([\s\S]*?)(?:\n\n|\n##)/);
  let desc = (ctx?.[1] ?? "").replace(/\s+/g, " ").trim();
  desc = desc.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/\[(.+?)\]\(.*?\)/g, "$1");
  if (desc.length > 230) desc = desc.slice(0, 227).replace(/\s+\S*$/, "") + "…";

  return { id, title, date, status, recordedStatus:field("recordedStatus"), tags, desc, sourceKind:field("sourceKind"), stableId:field("journeyId"), dateLabel:field("dateLabel"), noteLabel:field("noteLabel") };
}

function adrToMilestone(adr, prevHubId) {
  const padded = String(adr.id).padStart(3, "0");
  // ONE node per ADR in the 3D graph (the decision), chained to the previous
  // decision so they form a clean timeline thread — not a burst of tag nodes
  // (that piled up and made labels collide). Tags live on the card as chips.
  const historical = adr.sourceKind === "historical-note";
  const legacy = adr.sourceKind === "legacy-record";
  const hub = { id: historical ? `note-${adr.slug}` : legacy ? adr.slug : `adr-${padded}`, label: historical ? adr.noteLabel : legacy ? (Number(adr.id) ? `Legacy ADR-${padded}` : 'Legacy ADR') : `ADR-${padded}`, group: "decision", color: STATUS_COLOR[adr.status] ?? "#a855f7" };
  const tags = adr.tags.slice(0, 6).map((t) => ({
    id: t.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label: t,
    color: tagColor(t),
  }));
  const edges = prevHubId ? [{ from: prevHubId, to: hub.id }] : [];
  return {
    kind: "decision",
    recordKind: historical ? "historical-note" : legacy ? "legacy-record" : "adr",
    ...(!historical ? {decisionStatus:adr.recordedStatus ?? adr.status} : {}),
    ...(adr.stableId ? {stableId:adr.stableId} : {}),
    ...(adr.dateLabel ? {dateLabel:adr.dateLabel} : {}),
    date: adr.date,
    title: historical ? `Design note · ${adr.title}` : legacy ? `${hub.label} · ${adr.title}` : `ADR-${padded} · ${adr.title}`,
    description: adr.status === 'withdrawn' ? 'Withdrawn duplicate of ADR-032. Retained for traceability; the original proposal does not override the recorded withdrawal.' : adr.desc,
    nodes: [hub],
    edges,
    tags, // card chips only (not 3D nodes)
    blogEpisode: null,
    link: { href: `/adrs/${padded}/`, label: historical ? "Read design note" : "Read decision" }, // href resolved below to the real slug
  };
}

// ---- build ----
const seed = JSON.parse(readFileSync(SEED, "utf8"));
// Retirement is dated evidence, never a blanket claim about the entire past.
const seedMilestones = (seed.milestones ?? []).map(m => ({ ...m, kind: "story" }));

// Slugs identify records: a historical note may share a number with a real ADR.
const files = readdirSync(ADR_DIR).filter((f) => f.endsWith(".md"));

// Every public ADR becomes a milestone, interleaved with the seed by date.
// Sort by date first so the decision-chain edges thread chronologically.
const parsed = files
  .map((f) => {
    const adr = parseAdr(readFileSync(join(ADR_DIR, f), "utf8"));
    return adr ? {...adr, slug: f.replace(/\.md$/, '')} : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.date.localeCompare(b.date));

const adrMilestones = [];
let prevHubId = null;
for (const adr of parsed) {
  const padded = String(adr.id).padStart(3, "0");
  const ms = adrToMilestone(adr, prevHubId);
  ms.link.href = `/adrs/${adr.slug}/`;
  adrMilestones.push(ms);
  prevHubId = ms.nodes[0].id;
}

const milestoneId = m => `${m.date}-${m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const history = [...seedMilestones, ...reviewed.milestones].map(m => journal.detachEpisodeFrom.includes(m.title) ? {...m, blogEpisode:null} : m);
for (const entry of journal.records) {
  const { targetId, ...fields } = entry;
  if (targetId) {
    const index = history.findIndex(m => milestoneId(m) === targetId);
    if (index < 0) throw new Error(`Journal backfill target missing: ${targetId}`);
    history[index] = {...history[index], ...fields};
  } else history.push(fields);
}
const milestones = [...history, ...adrMilestones]
  .sort((a, b) => a.date.localeCompare(b.date))
  .map(m => ({ ...m, nodes: m.nodes.map(({ retired, ...n }) => ({ ...n, ...(lifecycle[n.id] ?? {}) })) }));
writeFileSync(OUT, JSON.stringify({ reviewedAt: reviewed.reviewedAt, journalCutoff: journal.cutoff, journalEpisodes: journal.records.length, milestones }, null, 2) + "\n");
console.log(`[build-journey] ${history.length} story/checkpoint entries + ${adrMilestones.filter(m=>m.recordKind==="adr").length} ADRs + ${adrMilestones.filter(m=>m.recordKind==="legacy-record").length} legacy records + ${adrMilestones.filter(m=>m.recordKind==="historical-note").length} design notes = ${milestones.length} milestones; ${journal.records.length} episodes mapped through ${journal.cutoff}`);
