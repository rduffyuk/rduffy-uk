import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { PositionedNode } from "./types";

interface NodeMeshProps {
  node: PositionedNode;
  onClick: (node: PositionedNode) => void;
  visible: boolean;
  labelPlacement?: LabelPlacement;
  dark?: boolean;
}

export interface LabelPlacement {
  position: [number, number, number];
  anchorX: "left" | "center" | "right";
  anchorY: "top" | "bottom";
  maxWidth: number;
}

function NodeGeometry({ group }: { group: string }) {
  switch (group) {
    case "core":
      return <sphereGeometry args={[0.3, 16, 16]} />;
    case "infra":
      return <boxGeometry args={[0.45, 0.45, 0.45]} />;
    case "database":
      return <octahedronGeometry args={[0.35]} />;
    case "monitoring":
      return <coneGeometry args={[0.3, 0.5, 6]} />;
    case "workflow":
      return <dodecahedronGeometry args={[0.3]} />;
    default:
      return <sphereGeometry args={[0.3, 16, 16]} />;
  }
}

const groupLabels: Record<string, string> = {
  core: "●",
  infra: "■",
  database: "◆",
  monitoring: "▲",
  workflow: "⬟",
};

function compactLabel(label: string) {
  if (label.length <= 14) return label;
  return `${label.slice(0, 13).trimEnd()}...`;
}

export function NodeMesh({
  node,
  onClick,
  visible,
  labelPlacement = {
    position: [0, 0.55, 0],
    anchorX: "center",
    anchorY: "bottom",
    maxWidth: 1.35,
  },
  dark = true,
}: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const scaleRef = useRef(0);
  // Per-node spin speed so the constellation tumbles organically, not in lockstep.
  const spinSeed = useRef(0.3 + Math.random() * 0.55);
  const targetScale = visible ? (hovered ? 1.25 : 1) : 0;

  useFrame((_, delta) => {
    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, 1 - Math.exp(-3 * delta));
    if (groupRef.current) {
      const s = scaleRef.current;
      groupRef.current.scale.set(s, s, s);
    }
    if (meshRef.current && visible) {
      meshRef.current.rotation.y += delta * spinSeed.current;
      meshRef.current.rotation.x += delta * spinSeed.current * 0.4;
    }
  });

  if (scaleRef.current < 0.01 && !visible) return null;

  return (
    <group ref={groupRef} position={node.position}>
      <mesh
        ref={meshRef}
        onClick={() => onClick(node)}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <NodeGeometry group={node.group} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={hovered ? 0.9 : 0.4}
          transparent
          opacity={Math.min(scaleRef.current, 1)}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>
      {/* Label */}
      <Text
        position={labelPlacement.position}
        fontSize={0.15}
        maxWidth={labelPlacement.maxWidth}
        color={dark ? "#f1f5f9" : "#21262e"}
        anchorX={labelPlacement.anchorX}
        anchorY={labelPlacement.anchorY}
        textAlign={
          labelPlacement.anchorX === "center" ? "center" : labelPlacement.anchorX
        }
        lineHeight={0.95}
        outlineWidth={0.008}
        outlineColor={dark ? "#09090b" : "#f7f6f2"}
        fillOpacity={Math.min(scaleRef.current, 1)}
      >
        {compactLabel(node.label)}
      </Text>
      {/* Group indicator */}
      <Text
        position={[0, -0.45, 0]}
        fontSize={0.1}
        color={node.color}
        anchorX="center"
        anchorY="top"
        fillOpacity={Math.min(scaleRef.current * 0.6, 0.6)}
      >
        {groupLabels[node.group] ?? "●"} {node.group}
      </Text>
    </group>
  );
}
