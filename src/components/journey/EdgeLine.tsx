import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { PositionedNode } from "./types";

interface EdgeLineProps {
  from: PositionedNode;
  to: PositionedNode;
  visible: boolean;
  dark?: boolean;
}

export function EdgeLine({ from, to, visible, dark = true }: EdgeLineProps) {
  const opacityRef = useRef(0);
  // Faint by design — soft neural/cosmic threads, not a hard straight-line web.
  const target = visible ? 0.18 : 0;

  useFrame((_, delta) => {
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, target, 1 - Math.exp(-3 * delta));
  });

  // Curve each edge: bow it out of the node plane toward the viewer so the lines
  // arc gently instead of crossing as straight chords — reads as a constellation web.
  const points = useMemo(() => {
    const a = new THREE.Vector3(...from.position);
    const b = new THREE.Vector3(...to.position);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.z += Math.min(a.distanceTo(b) * 0.22, 1.4);
    return new THREE.QuadraticBezierCurve3(a, mid, b)
      .getPoints(24)
      .map((p) => [p.x, p.y, p.z] as [number, number, number]);
  }, [from.position, to.position]);

  if (opacityRef.current < 0.01 && !visible) return null;

  return (
    <Line
      points={points}
      color={dark ? "#7c84d8" : "#a9adba"}
      lineWidth={1}
      opacity={opacityRef.current}
      transparent
    />
  );
}
