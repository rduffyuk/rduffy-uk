import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { PositionedNode } from "./types";

interface NodeMeshProps {
  node: PositionedNode;
  onClick: (node: PositionedNode) => void;
  visible: boolean;
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

export function NodeMesh({ node, onClick, visible }: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const scaleRef = useRef(0);
  const targetScale = visible ? (hovered ? 1.25 : 1) : 0;

  useFrame((_, delta) => {
    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, 1 - Math.exp(-3 * delta));
    if (groupRef.current) {
      const s = scaleRef.current;
      groupRef.current.scale.set(s, s, s);
    }
    if (meshRef.current && visible) {
      meshRef.current.rotation.y += delta * 0.3;
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
        position={[0, 0.55, 0]}
        fontSize={0.16}
        color="#f1f5f9"
        anchorX="center"
        anchorY="bottom"
        fillOpacity={Math.min(scaleRef.current, 1)}
      >
        {node.label}
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
