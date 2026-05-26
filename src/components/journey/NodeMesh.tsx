import { useRef, useState } from "react";
import { Text } from "@react-three/drei";
import type { Mesh } from "three";
import type { PositionedNode } from "./types";

interface NodeMeshProps {
  node: PositionedNode;
  onClick: (node: PositionedNode) => void;
  visible: boolean;
}

export function NodeMesh({ node, onClick, visible }: NodeMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  if (!visible) return null;

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        onClick={() => onClick(node)}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.3 : 1}
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={hovered ? 0.8 : 0.4}
        />
      </mesh>
      <Text
        position={[0, 0.5, 0]}
        fontSize={0.18}
        color="#e2e8f0"
        anchorX="center"
        anchorY="bottom"
      >
        {node.label}
      </Text>
    </group>
  );
}
