// Public-data boundary. Private MR fields are never copied or used as fallbacks.
export const MARKER = "<!-- public-build-note:v1 -->";
const fields = new Set([
  "id",
  "title",
  "summary",
  "category",
  "detail",
  "href",
]);
const categories = new Set([
  "Agent tools",
  "Knowledge",
  "Operations",
  "Platform",
  "Website",
]);
function fail() {
  throw new Error("Invalid public build note; publication stopped.");
}
function plain(value, max) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f<>]/.test(value) ||
    /https?:\/\/|\b(?:glpat-|ghp_|github_pat_|AKIA)[A-Za-z0-9_-]+|\b\d{1,3}(?:\.\d{1,3}){3}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i.test(
      value,
    )
  )
    fail();
  return value.trim();
}
export function validateNote(input) {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    Object.keys(input).some((k) => !fields.has(k))
  )
    fail();
  if (typeof input.id !== "string" || !/^[a-z][a-z0-9-]{3,79}$/.test(input.id))
    fail();
  if (!categories.has(input.category)) fail();
  const note = {
    id: input.id,
    title: plain(input.title, 90),
    summary: plain(input.summary, 240),
    category: input.category,
  };
  if (input.detail !== undefined) note.detail = plain(input.detail, 600);
  if (input.href !== undefined) {
    if (
      typeof input.href !== "string" ||
      !/^\/(?:writing\/[a-z0-9-]+|adrs\/[a-z0-9-]+|rootweaver|journey)\/$/.test(
        input.href,
      )
    )
      fail();
    note.href = input.href;
  }
  return note;
}
export function validateManifest(input) {
  if (!Array.isArray(input) || input.length > 2000) fail();
  const ids = new Set();
  for (const row of input) {
    if (!row || typeof row !== "object") fail();
    const { date, ...note } = row;
    validateNote(note);
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      fail();
    if (ids.has(note.id)) fail();
    ids.add(note.id);
  }
  return input;
}
export function publicNoteFromMR(mr, comments, approverIds) {
  if (
    mr.state !== "merged" ||
    mr.draft ||
    mr.target_branch !== "main" ||
    !mr.labels?.includes("public-build-note")
  )
    return null;
  // An owner-authored public note is the approval. Its latest edit is authoritative.
  // Bot-generated prose, ordinary MR approvals and labels alone cannot publish text.
  const approved = comments
    .filter(
      (n) =>
        !n.system &&
        approverIds.includes(n.author?.id) &&
        typeof n.body === "string" &&
        n.body.trimStart().startsWith(MARKER),
    )
    .sort(
      (a, b) =>
        Date.parse(b.updated_at ?? b.created_at) -
          Date.parse(a.updated_at ?? a.created_at) || b.id - a.id,
    )[0];
  if (!approved) return null;
  const raw = approved.body.trim().slice(MARKER.length).trim();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    fail();
  }
  if (input && Object.keys(input).length === 1 && input.withdrawn === true)
    return null;
  const note = validateNote(input);
  if (
    typeof mr.merged_at !== "string" ||
    Number.isNaN(Date.parse(mr.merged_at))
  )
    fail();
  const entry = {
    ...note,
    date: new Date(mr.merged_at).toISOString().slice(0, 10),
  };
  validateManifest([entry]);
  return entry;
}
export async function collectPublicNotes(sources, request) {
  if (!Array.isArray(sources) || !sources.length) fail();
  const entries = [];
  let selected = 0,
    unapproved = 0;
  async function pages(path) {
    const all = [];
    for (let page = 1; page <= 100; page++) {
      const items = await request(
        path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page,
      );
      if (!Array.isArray(items)) fail();
      all.push(...items);
      if (items.length < 100) return all;
    }
    throw new Error("Pagination limit reached; existing feed preserved.");
  }
  for (const source of sources) {
    if (
      !Number.isSafeInteger(source.projectId) ||
      !Array.isArray(source.approverIds) ||
      !source.approverIds.length ||
      source.approverIds.some((id) => !Number.isSafeInteger(id))
    )
      fail();
    const mrs = await pages(
      `projects/${source.projectId}/merge_requests?state=merged&labels=public-build-note&scope=all`,
    );
    for (const mr of mrs) {
      selected++;
      if (!Number.isSafeInteger(mr.iid)) fail();
      const comments = await pages(
        `projects/${source.projectId}/merge_requests/${mr.iid}/notes`,
      );
      const note = publicNoteFromMR(mr, comments, source.approverIds);
      if (note) entries.push(note);
      else unapproved++;
    }
  }
  validateManifest(entries);
  entries.sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
  return { entries, selected, unapproved };
}
