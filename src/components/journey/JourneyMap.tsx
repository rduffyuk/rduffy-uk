import { useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { GraphScene } from "./GraphScene";
import { Timeline } from "./Timeline";
import { DetailCard } from "./DetailCard";
import type { JourneyData, PositionedNode } from "./types";

interface JourneyMapProps {
  data: JourneyData;
}

export default function JourneyMap({ data }: JourneyMapProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);

  const handleMilestoneVisible = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleNodeClick = useCallback((node: PositionedNode) => {
    setSelectedNode(node);
  }, []);

  const selectedMilestone = selectedNode
    ? data.milestones.find((m) => m.nodes.some((n) => n.id === selectedNode.id)) ?? null
    : null;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left: sticky 3D graph */}
      <div style={{ flex: "1 1 55%", position: "sticky", top: 0, height: "100vh", minWidth: 0 }}>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <Canvas
            camera={{ position: [0, 0, 12], fov: 50 }}
            style={{ background: "#09090b" }}
          >
            <GraphScene
              data={data}
              currentIndex={currentIndex}
              onNodeClick={handleNodeClick}
            />
          </Canvas>

          {/* Milestone counter overlay */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: "#94a3b8",
              background: "rgba(9, 9, 11, 0.8)",
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #1e293b",
            }}
          >
            {currentIndex + 1} / {data.milestones.length} milestones
          </div>

          <DetailCard
            node={selectedNode}
            milestone={selectedMilestone}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      </div>

      {/* Right: scrollable timeline */}
      <div
        style={{
          flex: "1 1 45%",
          overflowY: "auto",
          padding: "0 24px",
          borderLeft: "1px solid #1e293b",
        }}
      >
        <div style={{ padding: "24px 0 8px", position: "sticky", top: 0, background: "#09090b", zIndex: 5 }}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#00d4ff", margin: 0 }}>
            Scroll to explore
          </p>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>
            Platform Timeline
          </h2>
        </div>
        <Timeline
          milestones={data.milestones}
          currentIndex={currentIndex}
          onMilestoneVisible={handleMilestoneVisible}
        />
        <div style={{ height: "30vh" }} />
      </div>
    </div>
  );
}
