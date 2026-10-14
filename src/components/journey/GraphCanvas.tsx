import { Canvas } from "@react-three/fiber";
import { GraphScene } from "./GraphScene";
import type { JourneyData, PositionedNode } from "./types";

interface Props {
  data: JourneyData;
  currentIndex: number;
  onNodeClick: (node: PositionedNode) => void;
  dark: boolean;
  paused?: boolean;
}

// Isolated so the Three.js / react-three-fiber / drei stack (~1MB) lives in its
// own chunk, lazy-loaded by JourneyScrollytelling rather than blocking first paint.
export default function GraphCanvas({ data, currentIndex, onNodeClick, dark, paused = false }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 23], fov: 45 }}
      style={{ background: dark ? "#09090b" : "#f7f6f2" }}
    >
      <GraphScene
        data={data}
        currentIndex={currentIndex}
        onNodeClick={onNodeClick}
        dark={dark}
        paused={paused}
      />
    </Canvas>
  );
}
