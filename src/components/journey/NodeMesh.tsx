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

export function NodeMesh({ node, onClick, visible }: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const scaleRef = useRef(0);
  const targetScale = visible ? (hovered ? 1.2 : 1) : 0;

  useFrame((_, delta) => {
    const speed = 3;
    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, 1 - Math.exp(-speed * delta));
    if (groupRef.current) {
      const s = scaleRef.current;
      groupRef.current.scale.set(s, s, s);
    }
  });

  if (scaleRef.current < 0.01 && !visible) return null;

  return (
    <group ref={groupRef} position={node.position}>
      <mesh
        onClick={() => onClick(node)}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={hovered ? 0.8 : 0.4}
          transparent
          opacity={Math.min(scaleRef.current, 1)}
        />
      </mesh>
      <Text
        position={[0, 0.5, 0]}
        fontSize={0.18}
        color="#f1f5f9"
        anchorX="center"
        anchorY="bottom"
        fillOpacity={Math.min(scaleRef.current, 1)}
      >
        {node.label}
      </Text>
    </group>
  );
}
