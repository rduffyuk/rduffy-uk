import type { Milestone } from "./types";

interface TimelineProps {
  milestones: Milestone[];
  currentIndex: number;
  onChange: (index: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
}

export function Timeline({ milestones, currentIndex, onChange, playing, onTogglePlay }: TimelineProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "16px 24px",
        background: "linear-gradient(transparent, rgba(0,0,0,0.9))",
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onTogglePlay}
          style={{
            background: "none",
            border: "1px solid #334155",
            borderRadius: 6,
            color: "#a855f7",
            padding: "6px 12px",
            cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
          }}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <input
          type="range"
          min={0}
          max={milestones.length - 1}
          value={currentIndex}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "#a855f7" }}
        />
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            color: "#64748b",
            minWidth: 80,
          }}
        >
          {milestones[currentIndex]?.date}
        </span>
      </div>
      <div style={{ marginTop: 8, textAlign: "center" }}>
        <span style={{ color: "#a855f7", fontWeight: 600, fontSize: 14 }}>
          {milestones[currentIndex]?.title}
        </span>
        <span style={{ color: "#64748b", fontSize: 13, marginLeft: 12 }}>
          {milestones[currentIndex]?.description}
        </span>
      </div>
    </div>
  );
}
