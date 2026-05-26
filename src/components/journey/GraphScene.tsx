import { useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { NodeMesh } from "./NodeMesh";
import { EdgeLine } from "./EdgeLine";
import type { JourneyData, PositionedNode, JourneyEdge } from "./types";

interface GraphSceneProps {
  data: JourneyData;
  currentIndex: number;
  onNodeClick: (node: PositionedNode) => void;
}

function layoutNodes(data: JourneyData): Map<string, PositionedNode> {
  const nodeMap = new Map<string, PositionedNode>();
  const groupOffsets: Record<string, [number, number]> = {
    core: [0, 0],
    infra: [4, 2],
    database: [-4, 2],
    monitoring: [-4, -3],
    workflow: [4, -3],
  };

  const groupCounters: Record<string, number> = {};

  for (const milestone of data.milestones) {
    for (const node of milestone.nodes) {
      if (nodeMap.has(node.id)) continue;

      const group = node.group;
      const offset = groupOffsets[group] ?? [0, 0];
      const count = groupCounters[group] ?? 0;
      groupCounters[group] = count + 1;

      const angle = (count * Math.PI * 2) / 7 + count * 0.5;
      const radius = 1.2 + count * 0.4;

      nodeMap.set(node.id, {
        ...node,
        position: [
          offset[0] + Math.cos(angle) * radius,
          offset[1] + Math.sin(angle) * radius,
          (count % 3 - 1) * 0.5,
        ],
      });
    }
  }

  return nodeMap;
}

export function GraphScene({ data, currentIndex, onNodeClick }: GraphSceneProps) {
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
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />

      {Array.from(nodeMap.values()).map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          onClick={onNodeClick}
          visible={visibleNodeIds.has(node.id)}
        />
      ))}

      {visibleEdges.map((edge, i) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return null;
        return <EdgeLine key={`${edge.from}-${edge.to}-${i}`} from={from} to={to} visible />;
      })}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        maxDistance={20}
        minDistance={3}
      />
    </>
  );
}
