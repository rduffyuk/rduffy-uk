// Helpers for the writing collection
export function episodeChip(id: string): string {
  const m = id.match(/season-(\d+)-episode-(\d+)/);
  if (m) return `S${m[1]}·E${String(m[2]).padStart(2, "0")}`;
  return "ESSAY";
}

export function seasonOf(id: string): number | null {
  const m = id.match(/season-(\d+)/);
  return m ? Number(m[1]) : null;
}

export const SEASONS: Record<number, { name: string; meta: string }> = {
  1: { name: "Season 1 — ConvoCanvas", meta: "Oct 2025 · complete" },
  2: { name: "Season 2 — Validation", meta: "Oct 2025 · complete" },
  3: { name: "Season 3 — Building in Public", meta: "Feb 2026 → · in progress" },
};
