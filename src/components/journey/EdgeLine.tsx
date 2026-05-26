import { useMemo } from "react";
import { Line } from "@react-three/drei";
import type { PositionedNode } from "./types";

interface EdgeLineProps {
  from: PositionedNode;
  to: PositionedNode;
  visible: boolean;
}

export function EdgeLine({ from, to, visible }: EdgeLineProps) {
  const points = useMemo(
    () => [from.position, to.position] as [number, number, number][],
    [from.position, to.position]
  );

  if (!visible) return null;

  return (
    <Line
      points={points}
      color="#94a3b8"
      lineWidth={1}
      opacity={0.6}
      transparent
    />
  );
}
