export interface JourneyNode {
  id: string;
  label: string;
  group: string;
  color: string;
  /** Decommissioned / superseded component — rendered as a dark husk, not lit.
   * Liveness, not timeline: only things still running in the cluster glow. */
  retired?: boolean;
}

export interface JourneyEdge {
  from: string;
  to: string;
}

export interface Milestone {
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
  milestones: Milestone[];
}

export interface PositionedNode extends JourneyNode {
  position: [number, number, number];
}
