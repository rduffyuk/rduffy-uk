import { Canvas } from "@react-three/fiber";
import { GraphScene } from "./GraphScene";
import type { JourneyData, PositionedNode } from "./types";

interface Props {
  data: JourneyData;
  currentIndex: number;
  onNodeClick: (node: PositionedNode) => void;
  dark: boolean;
}

// Isolated so the Three.js / react-three-fiber / drei stack (~1MB) lives in its
// own chunk, lazy-loaded by JourneyScrollytelling rather than blocking first paint.
export default function GraphCanvas({ data, currentIndex, onNodeClick, dark }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 14], fov: 45 }}
      style={{ background: dark ? "#09090b" : "#f7f6f2" }}
    >
      <GraphScene
        data={data}
        currentIndex={currentIndex}
        onNodeClick={onNodeClick}
        dark={dark}
      />
    </Canvas>
  );
}
