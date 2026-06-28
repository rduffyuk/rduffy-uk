import { useMemo } from "react";
import * as THREE from "three";
import { Line, OrbitControls } from "@react-three/drei";
import { NodeMesh, type LabelPlacement } from "./NodeMesh";
import { EdgeLine } from "./EdgeLine";
import type { JourneyData, PositionedNode, JourneyEdge } from "./types";

// Layout mode. "clusters" = grouped constellation; "solar" = concentric orbital
// rings around a core (core innermost → decisions outermost).
export const GRAPH_LAYOUT: "clusters" | "solar" = "solar";

// Tilt the solar disc to a 3/4 view so orbits read as 3D ellipses receding in
// depth, rather than a flat top-down ring. Combined with a slow camera orbit this
// gives the disc a real sense of spinning in 3D space.
const SOLAR_TILT = -0.55;

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

// Solar-system layout: each group is an orbital ring around the centre, core
// innermost. Nodes are spread evenly around their ring like planets on an orbit.
const RING_ORDER = ["core", "database", "infra", "monitoring", "workflow", "decision"];

function ringRadius(group: string): number {
  const i = RING_ORDER.indexOf(group);
  // Inner ring pushed out to ~2.6 so the dense core group (most nodes) has room
  // to space around its circle and clears the sun's glow halo.
  return 2.6 + (i < 0 ? RING_ORDER.length : i) * 1.2;
}

function layoutSolar(data: JourneyData): GraphLayout {
  const nodeMap = new Map<string, PositionedNode>();
  const labelPlacements = new Map<string, LabelPlacement>();

  // Collect unique nodes per group, preserving first-seen order.
  const byGroup = new Map<string, PositionedNode[]>();
  const seen = new Set<string>();
  for (const milestone of data.milestones) {
    for (const node of milestone.nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const arr = byGroup.get(node.group) ?? [];
      arr.push(node as PositionedNode);
      byGroup.set(node.group, arr);
    }
  }

  for (const [group, nodes] of byGroup) {
    const radius = ringRadius(group);
    const phase = (RING_ORDER.indexOf(group) + 1) * 0.7; // stagger rings so spokes don't line up
    nodes.forEach((node, i) => {
      const angle = phase + (i / nodes.length) * Math.PI * 2;
      nodeMap.set(node.id, {
        ...node,
        position: [Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(i * 1.7) * 0.22],
      });
      labelPlacements.set(node.id, getLabelPlacement(group, angle));
    });
  }

  return { nodeMap, labelPlacements };
}

// A faint orbit circle in the XY plane.
function OrbitRing({ radius, dark }: { radius: number; dark: boolean }) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      pts.push([Math.cos(t) * radius, Math.sin(t) * radius, 0]);
    }
    return pts;
  }, [radius]);
  return (
    <Line points={points} color={dark ? "#3a3f63" : "#d8d4c8"} lineWidth={1} opacity={0.3} transparent />
  );
}

// Glowing sun at the centre of the solar layout: an emissive core, two additive
// halo shells for the glow (no postprocessing dependency), and a warm point light
// that illuminates the orbiting planets.
function Sun() {
  const color = "#ffce6a";
  return (
    <group>
      <pointLight position={[0, 0, 0]} intensity={1.5} distance={22} decay={1.6} color={color} />
      <mesh>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.7} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.95, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.6, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function GraphScene({ data, currentIndex, onNodeClick, dark = true }: GraphSceneProps) {
  const { nodeMap, labelPlacements } = useMemo(
    () => (GRAPH_LAYOUT === "solar" ? layoutSolar(data) : layoutNodes(data)),
    [data],
  );

  const orbitRadii = useMemo(() => {
    if (GRAPH_LAYOUT !== "solar") return [];
    const groups = new Set<string>();
    nodeMap.forEach((n) => groups.add(n.group));
    return [...groups].map(ringRadius).sort((a, b) => a - b);
  }, [nodeMap]);

  // Per-node orbit params, derived from each node's solar position. Inner rings
  // revolve faster (angular speed ∝ 1/radius), like real orbital mechanics.
  const orbits = useMemo(() => {
    if (GRAPH_LAYOUT !== "solar") return null;
    const m = new Map<string, { radius: number; baseAngle: number; z: number; speed: number }>();
    nodeMap.forEach((n) => {
      const [x, y, z] = n.position;
      const radius = Math.hypot(x, y);
      m.set(n.id, {
        radius,
        baseAngle: Math.atan2(y, x),
        z,
        speed: radius > 0.01 ? 0.3 / radius : 0,
      });
    });
    return m;
  }, [nodeMap]);

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

      <group rotation={GRAPH_LAYOUT === "solar" ? [SOLAR_TILT, 0, 0] : [0, 0, 0]}>
        {GRAPH_LAYOUT === "solar" && <Sun />}

        {orbitRadii.map((r) => (
          <OrbitRing key={r} radius={r} dark={dark} />
        ))}

        {Array.from(nodeMap.values()).map((node) => (
          <NodeMesh
            key={node.id}
            node={node}
            onClick={onNodeClick}
            visible={visibleNodeIds.has(node.id)}
            labelPlacement={labelPlacements.get(node.id)}
            dark={dark}
            orbit={orbits?.get(node.id)}
          />
        ))}
      </group>

      {/* In solar mode the orbit rings carry the structure and the planets move,
          so inter-node edges (drawn from static positions) are skipped. */}
      {GRAPH_LAYOUT === "clusters" &&
        visibleEdges.map((edge, i) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          return <EdgeLine key={`${edge.from}-${edge.to}-${i}`} from={from} to={to} visible dark={dark} />;
        })}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        autoRotate={GRAPH_LAYOUT !== "solar"}
        autoRotateSpeed={0.6}
        enableDamping
        dampingFactor={0.05}
        maxDistance={20}
        minDistance={5}
      />
    </>
  );
}
