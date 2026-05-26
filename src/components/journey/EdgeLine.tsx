import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { PositionedNode } from "./types";

interface EdgeLineProps {
  from: PositionedNode;
  to: PositionedNode;
  visible: boolean;
}

export function EdgeLine({ from, to, visible }: EdgeLineProps) {
  const opacityRef = useRef(0);
  const target = visible ? 0.6 : 0;

  useFrame((_, delta) => {
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, target, 1 - Math.exp(-3 * delta));
  });

  const points = useMemo(
    () => [from.position, to.position] as [number, number, number][],
    [from.position, to.position]
  );

  if (opacityRef.current < 0.01 && !visible) return null;

  return (
    <Line
      points={points}
      color="#94a3b8"
      lineWidth={1.5}
      opacity={opacityRef.current}
      transparent
    />
  );
}
