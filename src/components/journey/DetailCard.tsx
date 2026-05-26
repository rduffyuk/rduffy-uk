import type { PositionedNode, Milestone } from "./types";

interface DetailCardProps {
  node: PositionedNode | null;
  milestone: Milestone | null;
  onClose: () => void;
}

export function DetailCard({ node, milestone, onClose }: DetailCardProps) {
  if (!node) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        width: 300,
        background: "#0a0a0a",
        border: "1px solid #1e293b",
        borderRadius: 8,
        padding: 16,
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 16, color: node.color }}>{node.label}</h3>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18 }}
        >
          ×
        </button>
      </div>
      <p style={{ color: "#64748b", fontSize: 12, marginTop: 4, fontFamily: "JetBrains Mono, monospace" }}>
        {node.group}
      </p>
      {milestone && (
        <>
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 12 }}>
            Added: {milestone.date}
          </p>
          <p style={{ color: "#e2e8f0", fontSize: 13, marginTop: 4 }}>
            {milestone.description}
          </p>
          {milestone.blogEpisode && (
            <a
              href={milestone.blogEpisode}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#a855f7", fontSize: 13, marginTop: 8, display: "inline-block" }}
            >
              Read blog episode →
            </a>
          )}
        </>
      )}
    </div>
  );
}
