import { useState, useEffect, useCallback } from "react";
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
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (currentIndex >= data.milestones.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setCurrentIndex((i) => i + 1), 2000);
    return () => clearTimeout(timer);
  }, [playing, currentIndex, data.milestones.length]);

  const handleNodeClick = useCallback((node: PositionedNode) => {
    setSelectedNode(node);
  }, []);

  const selectedMilestone = selectedNode
    ? data.milestones.find((m) => m.nodes.some((n) => n.id === selectedNode.id)) ?? null
    : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50 }}
        style={{ background: "#000000" }}
      >
        <GraphScene
          data={data}
          currentIndex={currentIndex}
          onNodeClick={handleNodeClick}
        />
      </Canvas>

      <Timeline
        milestones={data.milestones}
        currentIndex={currentIndex}
        onChange={setCurrentIndex}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
      />

      <DetailCard
        node={selectedNode}
        milestone={selectedMilestone}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
