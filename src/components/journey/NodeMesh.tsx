import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import {
  getNodeIconSpec,
  type NodeIconKind,
  type NodeIconSpec,
} from "./nodeIcons";
import type { PositionedNode } from "./types";

/**
 * Journey node icon style switch:
 * 1 = procedural canvas texture badges on billboarding sprites, with a rotating halo.
 * 2 = large unicode glyph medallions, intentionally flat and high-contrast.
 * 3 = small procedural 3D pictograms made from native three.js geometry.
 */
export const NODE_ICON_STYLE = 1 as 1 | 2 | 3;

interface NodeMeshProps {
  node: PositionedNode;
  onClick: (node: PositionedNode) => void;
  visible: boolean;
  labelPlacement?: LabelPlacement;
  dark?: boolean;
  /** Solar-system orbit: when set, the node revolves around the centre each frame. */
  orbit?: { radius: number; baseAngle: number; z: number; speed: number };
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

interface NodeIconProps {
  node: PositionedNode;
  spec: NodeIconSpec;
  dark: boolean;
  hovered: boolean;
  opacity: number;
}

function NodeIcon({ node, spec, dark, hovered, opacity }: NodeIconProps) {
  switch (NODE_ICON_STYLE) {
    case 1:
      return (
        <CanvasBadgeIcon
          node={node}
          spec={spec}
          dark={dark}
          hovered={hovered}
          opacity={opacity}
        />
      );
    case 2:
      return (
        <GlyphMedallionIcon
          node={node}
          spec={spec}
          dark={dark}
          hovered={hovered}
          opacity={opacity}
        />
      );
    case 3:
      return (
        <ProceduralIcon
          node={node}
          spec={spec}
          dark={dark}
          hovered={hovered}
          opacity={opacity}
        />
      );
  }

  return null;
}

function CanvasBadgeIcon({ node, spec, dark, hovered, opacity }: NodeIconProps) {
  const texture = useMemo(
    () => createCanvasIconTexture(spec, node.color, dark),
    [dark, node.color, spec],
  );

  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <>
      <mesh scale={hovered ? 1.1 : 1}>
        <torusGeometry args={[0.43, 0.02, 8, 56]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={hovered ? 0.9 : 0.45}
          transparent
          opacity={opacity * 0.82}
          roughness={0.25}
          metalness={0.25}
        />
      </mesh>
      {texture ? (
        <sprite scale={hovered ? [0.95, 0.95, 1] : [0.82, 0.82, 1]}>
          <spriteMaterial
            map={texture}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      ) : (
        <Billboard>
          <Text
            fontSize={0.24}
            color={dark ? "#f8fafc" : "#111827"}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.01}
            outlineColor={dark ? "#09090b" : "#f7f6f2"}
            fillOpacity={opacity}
          >
            {spec.abbr}
          </Text>
        </Billboard>
      )}
    </>
  );
}

function GlyphMedallionIcon({ node, spec, dark, hovered, opacity }: NodeIconProps) {
  const plate = dark ? "#111827" : "#fff7ed";
  const ink = dark ? "#f8fafc" : "#111827";

  return (
    <>
      <mesh scale={hovered ? 1.1 : 1} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.025, 8, 44]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={hovered ? 0.8 : 0.35}
          transparent
          opacity={opacity * 0.7}
          roughness={0.3}
          metalness={0.15}
        />
      </mesh>
      <Billboard>
        <mesh scale={hovered ? 1.1 : 1} position={[0, 0, -0.025]}>
          <circleGeometry args={[0.36, 48]} />
          <meshStandardMaterial
            color={plate}
            emissive={node.color}
            emissiveIntensity={dark ? 0.18 : 0.05}
            transparent
            opacity={opacity * 0.94}
            roughness={0.55}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
        <Text
          position={[0, 0.01, 0.04]}
          fontSize={spec.glyph.length > 2 ? 0.18 : 0.28}
          color={ink}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor={dark ? "#09090b" : "#f7f6f2"}
          fillOpacity={opacity}
        >
          {spec.glyph}
        </Text>
      </Billboard>
    </>
  );
}

function ProceduralIcon({ node, spec, dark, hovered, opacity }: NodeIconProps) {
  const accent = node.color;
  const ink = dark ? "#e5e7eb" : "#1f2937";

  return (
    <group scale={hovered ? 1.12 : 1}>
      <ProceduralPictogram kind={spec.kind} accent={accent} ink={ink} opacity={opacity} />
      <mesh scale={0.72}>
        <NodeGeometry group={node.group} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={hovered ? 0.35 : 0.16}
          transparent
          opacity={opacity * 0.16}
          roughness={0.5}
          metalness={0.12}
        />
      </mesh>
    </group>
  );
}

interface ProceduralPictogramProps {
  kind: NodeIconKind;
  accent: string;
  ink: string;
  opacity: number;
}

function ProceduralPictogram({ kind, accent, ink, opacity }: ProceduralPictogramProps) {
  if (kind === "database") {
    return (
      <group>
        {[-0.18, 0, 0.18].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <cylinderGeometry args={[0.25, 0.25, 0.1, 32]} />
            <IconMaterial color={accent} opacity={opacity} />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === "chip") {
    return (
      <group>
        <mesh>
          <boxGeometry args={[0.48, 0.48, 0.12]} />
          <IconMaterial color={accent} opacity={opacity} />
        </mesh>
        {[-0.34, 0.34].map((x) =>
          [-0.18, 0, 0.18].map((y) => (
            <mesh key={`${x}-${y}`} position={[x, y, 0]}>
              <boxGeometry args={[0.12, 0.035, 0.04]} />
              <IconMaterial color={ink} opacity={opacity * 0.8} />
            </mesh>
          )),
        )}
        {[-0.18, 0, 0.18].map((x) =>
          [-0.34, 0.34].map((y) => (
            <mesh key={`${x}-${y}`} position={[x, y, 0]} rotation={[0, 0, Math.PI / 2]}>
              <boxGeometry args={[0.12, 0.035, 0.04]} />
              <IconMaterial color={ink} opacity={opacity * 0.8} />
            </mesh>
          )),
        )}
      </group>
    );
  }

  if (kind === "chart" || kind === "benchmark") {
    return (
      <group>
        {[0.16, 0.28, 0.4].map((height, index) => (
          <mesh key={height} position={[-0.19 + index * 0.19, -0.2 + height / 2, 0]}>
            <boxGeometry args={[0.1, height, 0.12]} />
            <IconMaterial color={index === 2 ? accent : ink} opacity={opacity} />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === "stream" || kind === "workflow" || kind === "loop" || kind === "connector") {
    return (
      <group>
        <mesh>
          <torusGeometry args={[0.24, 0.035, 8, 40]} />
          <IconMaterial color={accent} opacity={opacity} />
        </mesh>
        <mesh position={[0.24, 0.08, 0]} rotation={[0, 0, -0.45]}>
          <coneGeometry args={[0.09, 0.2, 3]} />
          <IconMaterial color={ink} opacity={opacity} />
        </mesh>
        <mesh position={[-0.24, -0.08, 0]} rotation={[0, 0, 2.7]}>
          <coneGeometry args={[0.09, 0.2, 3]} />
          <IconMaterial color={ink} opacity={opacity} />
        </mesh>
      </group>
    );
  }

  if (kind === "security" || kind === "policy") {
    return (
      <group>
        <mesh scale={[0.72, 0.9, 0.18]}>
          <octahedronGeometry args={[0.34]} />
          <IconMaterial color={accent} opacity={opacity} />
        </mesh>
        <mesh position={[0, -0.03, 0.03]}>
          <boxGeometry args={[0.1, 0.28, 0.06]} />
          <IconMaterial color={ink} opacity={opacity * 0.8} />
        </mesh>
      </group>
    );
  }

  if (kind === "docs" || kind === "decision") {
    return (
      <group>
        {[0, 1, 2].map((index) => (
          <mesh key={index} position={[index * 0.05 - 0.05, index * 0.04 - 0.04, index * 0.025]}>
            <boxGeometry args={[0.34, 0.42, 0.035]} />
            <IconMaterial
              color={index === 2 ? accent : ink}
              opacity={opacity * (index === 2 ? 1 : 0.55)}
            />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === "cluster" || kind === "gateway" || kind === "web") {
    return (
      <group>
        <mesh>
          <sphereGeometry args={[0.12, 16, 16]} />
          <IconMaterial color={accent} opacity={opacity} />
        </mesh>
        {[
          [0.3, 0, 0],
          [-0.15, 0.26, 0],
          [-0.15, -0.26, 0],
        ].map(([x, y, z]) => (
          <mesh key={`${x}-${y}`} position={[x, y, z]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <IconMaterial color={ink} opacity={opacity * 0.85} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group>
      <mesh>
        <icosahedronGeometry args={[0.28, 1]} />
        <IconMaterial color={accent} opacity={opacity} />
      </mesh>
      <mesh scale={0.42}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <IconMaterial color={ink} opacity={opacity * 0.75} />
      </mesh>
    </group>
  );
}

function IconMaterial({ color, opacity }: { color: string; opacity: number }) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={0.28}
      transparent
      opacity={opacity}
      roughness={0.34}
      metalness={0.18}
    />
  );
}

function createCanvasIconTexture(spec: NodeIconSpec, color: string, dark: boolean) {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const bg = dark ? "#111827" : "#fffaf0";
  const ink = dark ? "#f8fafc" : "#111827";
  const muted = dark ? "rgba(248, 250, 252, 0.7)" : "rgba(17, 24, 39, 0.62)";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  roundedRect(ctx, 22, 22, 212, 212, 42);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = color;
  ctx.stroke();

  drawCanvasPictogram(ctx, spec.kind, color, ink);

  ctx.font = "700 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = muted;
  ctx.fillText(spec.abbr, 128, 204);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCanvasPictogram(
  ctx: CanvasRenderingContext2D,
  kind: NodeIconKind,
  color: string,
  ink: string,
) {
  ctx.save();
  ctx.translate(128, 106);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 11;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (kind === "database") {
    for (const y of [-34, 0, 34]) {
      ctx.beginPath();
      ctx.ellipse(0, y, 48, 16, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-48, -34);
    ctx.lineTo(-48, 34);
    ctx.moveTo(48, -34);
    ctx.lineTo(48, 34);
    ctx.stroke();
  } else if (kind === "chip") {
    ctx.strokeRect(-42, -42, 84, 84);
    for (const p of [-28, 0, 28]) {
      ctx.beginPath();
      ctx.moveTo(-62, p);
      ctx.lineTo(-45, p);
      ctx.moveTo(45, p);
      ctx.lineTo(62, p);
      ctx.moveTo(p, -62);
      ctx.lineTo(p, -45);
      ctx.moveTo(p, 45);
      ctx.lineTo(p, 62);
      ctx.stroke();
    }
    ctx.fillRect(-18, -18, 36, 36);
  } else if (kind === "chart" || kind === "benchmark") {
    for (const [x, h] of [
      [-38, 34],
      [0, 54],
      [38, 74],
    ]) {
      ctx.fillRect(x - 10, 40 - h, 20, h);
    }
  } else if (kind === "stream" || kind === "workflow" || kind === "loop" || kind === "connector") {
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0.25, Math.PI * 1.65);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(42, 8);
    ctx.lineTo(62, 4);
    ctx.lineTo(48, -14);
    ctx.stroke();
  } else if (kind === "security" || kind === "policy") {
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.lineTo(48, -38);
    ctx.lineTo(38, 34);
    ctx.lineTo(0, 62);
    ctx.lineTo(-38, 34);
    ctx.lineTo(-48, -38);
    ctx.closePath();
    ctx.stroke();
  } else if (kind === "docs" || kind === "decision") {
    ctx.strokeRect(-38, -52, 62, 82);
    ctx.beginPath();
    ctx.moveTo(24, -52);
    ctx.lineTo(48, -28);
    ctx.lineTo(48, 52);
    ctx.lineTo(-14, 52);
    ctx.stroke();
  } else if (kind === "cluster" || kind === "gateway" || kind === "web") {
    ctx.fillStyle = ink;
    for (const [x, y] of [
      [0, -42],
      [-46, 24],
      [46, 24],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(-34, 12);
    ctx.moveTo(0, -28);
    ctx.lineTo(34, 12);
    ctx.moveTo(-31, 24);
    ctx.lineTo(31, 24);
    ctx.stroke();
  } else {
    ctx.font = "700 74px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(kind === "memory" ? "∞" : "✦", 0, 0);
  }

  ctx.restore();
}

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
  orbit,
}: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const scaleRef = useRef(0);
  // Per-node spin speed so the constellation tumbles organically, not in lockstep.
  const spinSeed = useRef(0.3 + Math.random() * 0.55);
  const targetScale = visible ? (hovered ? 1.25 : 1) : 0;
  const iconSpec = getNodeIconSpec(node);

  useFrame((state, delta) => {
    scaleRef.current = THREE.MathUtils.lerp(
      scaleRef.current,
      targetScale,
      1 - Math.exp(-3 * delta),
    );
    if (groupRef.current) {
      const s = scaleRef.current;
      groupRef.current.scale.set(s, s, s);
      // Solar mode: revolve around the centre. Angle is derived from absolute
      // clock time (not delta-accumulated) so it never drifts. The group is only
      // translated, never rotated, so labels stay upright while the node orbits.
      if (orbit) {
        const a = orbit.baseAngle + state.clock.elapsedTime * orbit.speed;
        groupRef.current.position.set(
          Math.cos(a) * orbit.radius,
          Math.sin(a) * orbit.radius,
          orbit.z,
        );
      }
    }
    if (spinRef.current && visible) {
      spinRef.current.rotation.y += delta * spinSeed.current;
      spinRef.current.rotation.x += delta * spinSeed.current * 0.4;
    }
  });

  if (scaleRef.current < 0.01 && !visible) return null;

  return (
    <group ref={groupRef} position={node.position}>
      <group
        ref={spinRef}
        onClick={(event) => {
          event.stopPropagation();
          onClick(node);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setHovered(false);
        }}
      >
        <NodeIcon
          node={node}
          spec={iconSpec}
          dark={dark}
          hovered={hovered}
          opacity={Math.min(scaleRef.current, 1)}
        />
      </group>
      {/* Label — billboarded so it stays upright + readable through the solar
          disc tilt and the camera orbit. */}
      <Billboard position={labelPlacement.position}>
        <Text
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
      </Billboard>
      {/* Group sublabel removed — the icon badge already conveys the node type,
         so the "● core / ◆ database" text was redundant visual noise. */}
    </group>
  );
}
