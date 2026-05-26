import { useState, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { GraphScene } from "./GraphScene";
import { DetailCard } from "./DetailCard";
import type { JourneyData, PositionedNode } from "./types";

interface Props {
  data: JourneyData;
}

export default function JourneyStepButtons({ data }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (currentIndex >= data.milestones.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setCurrentIndex((i) => i + 1), 2000);
    return () => clearTimeout(timer);
  }, [playing, currentIndex, data.milestones.length]);

  const handleNodeClick = useCallback((node: PositionedNode) => setSelectedNode(node), []);
  const prev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const next = () => setCurrentIndex((i) => Math.min(data.milestones.length - 1, i + 1));

  const m = data.milestones[currentIndex];
  const progress = ((currentIndex + 1) / data.milestones.length) * 100;
  const selectedMilestone = selectedNode
    ? data.milestones.find((ms) => ms.nodes.some((n) => n.id === selectedNode.id)) ?? null
    : null;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    fontFamily: "JetBrains Mono, monospace", fontSize: 12, padding: "8px 18px", borderRadius: 8,
    border: "1px solid #1e293b", background: "#0f0f13", color: disabled ? "#334155" : "#a855f7",
    cursor: disabled ? "default" : "pointer", transition: "all 0.15s",
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [0, 0, 14], fov: 45 }} style={{ background: "#09090b" }}>
        <GraphScene data={data} currentIndex={currentIndex} onNodeClick={handleNodeClick} />
      </Canvas>

      <DetailCard node={selectedNode} milestone={selectedMilestone} onClose={() => setSelectedNode(null)} />

      {/* Bottom control bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{ height: 2, background: "#1e293b" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #a855f7, #00d4ff)", transition: "width 0.5s ease" }} />
        </div>
        <div style={{
          background: "rgba(9,9,11,0.9)", backdropFilter: "blur(16px)", padding: "14px 24px",
          display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid #1e293b",
        }}>
          <button onClick={prev} disabled={currentIndex === 0} style={btnStyle(currentIndex === 0)}>← Prev</button>
          <button onClick={() => setPlaying((p) => !p)} style={{ ...btnStyle(false), borderColor: "rgba(168,85,247,0.3)" }}>
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={next} disabled={currentIndex === data.milestones.length - 1} style={btnStyle(currentIndex === data.milestones.length - 1)}>Next →</button>

          <span style={{ width: 1, height: 24, background: "#1e293b" }} />

          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00d4ff", whiteSpace: "nowrap" }}>{m?.date}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{m?.title}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{m?.description}</div>
          </div>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#64748b" }}>
            {currentIndex + 1}/{data.milestones.length}
          </span>
        </div>
      </div>
    </div>
  );
}
