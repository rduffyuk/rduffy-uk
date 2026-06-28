import { useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { NodeMesh, type LabelPlacement } from "./NodeMesh";
import { EdgeLine } from "./EdgeLine";
import type { JourneyData, PositionedNode, JourneyEdge } from "./types";

interface GraphSceneProps {
  data: JourneyData;
  currentIndex: number;
  onNodeClick: (node: PositionedNode) => void;
  dark?: boolean;
}

interface GraphLayout {
  nodeMap: Map<string, PositionedNode>;
  labelPlacements: Map<string, LabelPlacement>;
}

function getLabelPlacement(nodeGroup: string, angle: number): LabelPlacement {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const offsetRadius = nodeGroup === "core" ? 0.75 : 0.65;
  const sideBias = Math.abs(x) > 0.35 ? 0 : 0.1;

  return {
    position: [x * offsetRadius, y * offsetRadius + sideBias, 0.06],
    anchorX: x > 0.35 ? "left" : x < -0.35 ? "right" : "center",
    anchorY: y < -0.25 ? "top" : "bottom",
    maxWidth: nodeGroup === "core" ? 1.05 : 1.2,
  };
}

function layoutNodes(data: JourneyData): GraphLayout {
  const nodeMap = new Map<string, PositionedNode>();
  const labelPlacements = new Map<string, LabelPlacement>();

  const groupConfig: Record<string, { center: [number, number]; spread: number }> = {
    core: { center: [0, 0.7], spread: 2.1 },
    infra: { center: [5.2, 3], spread: 1.9 },
    database: { center: [-5.2, 3], spread: 1.9 },
    monitoring: { center: [-5.2, -3.7], spread: 1.9 },
    workflow: { center: [5.2, -3.7], spread: 1.9 },
    decision: { center: [0, -3.8], spread: 1.4 },
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
      const radius = 0.72 + Math.sqrt(count) * cfg.spread * 0.55;

      nodeMap.set(node.id, {
        ...node,
        position: [
          cfg.center[0] + Math.cos(angle) * radius,
          cfg.center[1] + Math.sin(angle) * radius,
          Math.sin(count * 1.7) * 0.4,
        ],
      });
      labelPlacements.set(node.id, getLabelPlacement(node.group, angle));
    }
  }

  return { nodeMap, labelPlacements };
}

export function GraphScene({ data, currentIndex, onNodeClick, dark = true }: GraphSceneProps) {
  const { nodeMap, labelPlacements } = useMemo(() => layoutNodes(data), [data]);

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
          labelPlacement={labelPlacements.get(node.id)}
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
