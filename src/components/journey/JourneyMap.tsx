import { useState, useEffect, useCallback, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { GraphScene } from "./GraphScene";
import { DetailCard } from "./DetailCard";
import type { JourneyData, PositionedNode } from "./types";

interface JourneyMapProps {
  data: JourneyData;
}

export default function JourneyMap({ data }: JourneyMapProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll-driven: map scroll position to milestone index
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only capture vertical scroll when not orbiting (shift/ctrl = orbit)
      if (e.shiftKey || e.ctrlKey || e.metaKey) return;

      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      setCurrentIndex((prev) => {
        const next = prev + delta;
        return Math.max(0, Math.min(data.milestones.length - 1, next));
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [data.milestones.length]);

  // Auto-play
  useEffect(() => {
    if (!playing) return;
    if (currentIndex >= data.milestones.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setCurrentIndex((i) => i + 1), 1800);
    return () => clearTimeout(timer);
  }, [playing, currentIndex, data.milestones.length]);

  const handleNodeClick = useCallback((node: PositionedNode) => {
    setSelectedNode(node);
  }, []);

  const milestone = data.milestones[currentIndex];
  const progress = ((currentIndex + 1) / data.milestones.length) * 100;

  const selectedMilestone = selectedNode
    ? data.milestones.find((m) => m.nodes.some((n) => n.id === selectedNode.id)) ?? null
    : null;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Full-width 3D graph */}
      <Canvas
        camera={{ position: [0, 0, 14], fov: 45 }}
        style={{ background: "#09090b" }}
      >
        <GraphScene
          data={data}
          currentIndex={currentIndex}
          onNodeClick={handleNodeClick}
        />
      </Canvas>

      {/* Top-left: controls */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          display: "flex",
          gap: 8,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "#a855f7",
            background: "rgba(9, 9, 11, 0.85)",
            backdropFilter: "blur(12px)",
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid rgba(168, 85, 247, 0.2)",
            cursor: "pointer",
          }}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "#94a3b8",
            background: "rgba(9, 9, 11, 0.85)",
            backdropFilter: "blur(12px)",
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid #1e293b",
          }}
        >
          {currentIndex + 1} / {data.milestones.length}
        </span>
      </div>

      {/* Top-right: hint */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          color: "#64748b",
          background: "rgba(9, 9, 11, 0.85)",
          backdropFilter: "blur(12px)",
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid #1e293b",
          zIndex: 10,
        }}
      >
        Scroll ↕ timeline · Drag to orbit · Click nodes
      </div>

      {/* Detail card */}
      <DetailCard
        node={selectedNode}
        milestone={selectedMilestone}
        onClose={() => setSelectedNode(null)}
      />

      {/* Bottom: milestone info bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
        }}
      >
        {/* Progress bar */}
        <div style={{ height: 2, background: "#1e293b" }}>
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #a855f7, #00d4ff)",
              transition: "width 0.5s ease",
            }}
          />
        </div>

        {/* Milestone info */}
        <div
          style={{
            background: "rgba(9, 9, 11, 0.9)",
            backdropFilter: "blur(16px)",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            borderTop: "1px solid #1e293b",
          }}
        >
          {/* Date */}
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12,
              color: "#00d4ff",
              whiteSpace: "nowrap",
            }}
          >
            {milestone?.date}
          </span>

          {/* Divider */}
          <span style={{ width: 1, height: 24, background: "#1e293b" }} />

          {/* Title + description */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
              {milestone?.title}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>
              {milestone?.description}
            </div>
          </div>

          {/* Node pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {milestone?.nodes.map((n) => (
              <span
                key={n.id}
                style={{
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "2px 8px",
                  borderRadius: 6,
                  border: `1px solid ${n.color}44`,
                  color: n.color,
                  background: `${n.color}15`,
                  whiteSpace: "nowrap",
                }}
              >
                {n.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
