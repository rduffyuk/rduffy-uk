import { useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { NodeMesh } from "./NodeMesh";
import { EdgeLine } from "./EdgeLine";
import type { JourneyData, PositionedNode, JourneyEdge } from "./types";

interface GraphSceneProps {
  data: JourneyData;
  currentIndex: number;
  onNodeClick: (node: PositionedNode) => void;
  dark?: boolean;
}

function layoutNodes(data: JourneyData): Map<string, PositionedNode> {
  const nodeMap = new Map<string, PositionedNode>();

  const groupConfig: Record<string, { center: [number, number]; spread: number }> = {
    core:       { center: [0, 1],     spread: 2.0 },
    infra:      { center: [5, 3],     spread: 1.8 },
    database:   { center: [-5, 3],    spread: 1.8 },
    monitoring: { center: [-5, -3.5], spread: 1.8 },
    workflow:   { center: [5, -3.5],  spread: 1.8 },
    decision:   { center: [0, -3.5],  spread: 1.3 },
  };

  const groupCounters: Record<string, number> = {};

  for (const milestone of data.milestones) {
    for (const node of milestone.nodes) {
      if (nodeMap.has(node.id)) continue;

      const cfg = groupConfig[node.group] ?? { center: [0, -2], spread: 2.0 };
      const count = groupCounters[node.group] ?? 0;
      groupCounters[node.group] = count + 1;

      const goldenAngle = 2.39996323;
      const angle = count * goldenAngle;
      const radius = 0.6 + Math.sqrt(count) * cfg.spread * 0.55;

      nodeMap.set(node.id, {
        ...node,
        position: [
          cfg.center[0] + Math.cos(angle) * radius,
          cfg.center[1] + Math.sin(angle) * radius,
          (Math.sin(count * 1.7) * 0.4),
        ],
      });
    }
  }

  return nodeMap;
}

export function GraphScene({ data, currentIndex, onNodeClick, dark = true }: GraphSceneProps) {
  const nodeMap = useMemo(() => layoutNodes(data), [data]);

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i <= currentIndex; i++) {
      for (const node of data.milestones[i].nodes) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [data, currentIndex]);

  const visibleEdges = useMemo(() => {
    const edges: JourneyEdge[] = [];
    for (let i = 0; i <= currentIndex; i++) {
      for (const edge of data.milestones[i].edges) {
        if (visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)) {
          edges.push(edge);
        }
      }
    }
    return edges;
  }, [data, currentIndex, visibleNodeIds]);

  return (
    <>
      <ambientLight intensity={dark ? 0.4 : 0.85} />
      <pointLight position={[10, 10, 10]} intensity={0.7} />
      <pointLight position={[-8, -5, 5]} intensity={0.3} color="#a855f7" />

      {Array.from(nodeMap.values()).map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          onClick={onNodeClick}
          visible={visibleNodeIds.has(node.id)}
          dark={dark}
        />
      ))}

      {visibleEdges.map((edge, i) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return null;
        return <EdgeLine key={`${edge.from}-${edge.to}-${i}`} from={from} to={to} visible dark={dark} />;
      })}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        autoRotate
        autoRotateSpeed={0.6}
        enableDamping
        dampingFactor={0.05}
        maxDistance={20}
        minDistance={5}
      />
    </>
  );
}
