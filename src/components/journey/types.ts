export interface JourneyNode {
  id: string;
  label: string;
  group: string;
  color: string;
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
}

export interface JourneyData {
  milestones: Milestone[];
}

export interface PositionedNode extends JourneyNode {
  position: [number, number, number];
}
