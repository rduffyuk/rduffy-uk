export interface JourneyNode {
  id: string;
  label: string;
  group: string;
  color: string;
  /** Dated lifecycle evidence; absence means unknown, not currently running. */
  retired?: boolean;
  retiredBy?: string;
  note?: string;
}

export interface JourneyEdge {
  from: string;
  to: string;
}

export interface Milestone {
  stableId?: string;
  recordKind?: "adr" | "historical-note" | "legacy-record";
  decisionStatus?: string;
  dateLabel?: string;
  journalEpisode?: string;
  journalLabel?: string;
  editorialNote?: string;
  kind?: 'story' | 'decision' | 'checkpoint';
  evidenceLabel?: string;
  relatedLinks?: { href: string; label: string }[];
  date: string;
  title: string;
  description: string;
  nodes: JourneyNode[];
  edges: JourneyEdge[];
  blogEpisode: string | null;
  /** Optional internal link (e.g. to an ADR). Auto-set for ADR-derived milestones. */
  link?: { href: string; label: string } | null;
  /** Card-only chips (not 3D nodes). Used by ADR milestones for their tags. */
  tags?: { id: string; label: string; color: string }[];
}

export interface JourneyData {
  reviewedAt?: string;
  journalCutoff?: string;
  journalEpisodes?: number;
  milestones: Milestone[];
}

export interface PositionedNode extends JourneyNode {
  position: [number, number, number];
}
