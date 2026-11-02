"use client";

import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, SRGBColorSpace, type Group, type OrthographicCamera, type Sprite } from "three";

export type V3 = [number, number, number];

export const palette = {
  ground: "#e9ecf5",
  pad: "#f6f7fb",
  road: "#d5dae5",
  sidewalk: "#f2f4f9",
  curb: "#dde2ec",
  wall: "#f4f6fa",
  wallRib: "#dfe4ee",
  roof: "#3d79ea",
  roofRib: "#3169d6",
  navy: "#1e40af",
  trim: "#ffffff",
  interior: "#ece7dd",
  cardboard: "#d3a46c",
  marking: "#f2c94c",
  tree: "#5fc46f",
  accent: "#2563eb",
};

export function Block({ size, position, color, cast = true, rotation, roughness = 0.85 }: { size: V3; position: V3; color: string; cast?: boolean; rotation?: V3; roughness?: number }) {
  return (
    <mesh position={position} rotation={rotation} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

/**
 * Screen-sized text chip drawn into a sprite. Used instead of drei <Html>, whose
 * per-label React root logs unmount races under React 19.
 */
export function Label({ position, text, dot }: { position: V3; text: string; dot?: string }) {
  const ref = useRef<Sprite>(null);
  const { texture, w, h } = useMemo(() => {
    const r = 2;
    const font = `600 ${11 * r}px ${getComputedStyle(document.body).fontFamily}`;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = font;
    const dotW = dot ? 11 * r : 0;
    const chipW = Math.ceil(ctx.measureText(text).width) + 16 * r + dotW;
    const chipH = 22 * r;
    ctx.canvas.width = chipW + 8 * r;
    ctx.canvas.height = chipH + 8 * r;
    ctx.font = font;
    ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
    ctx.shadowBlur = 6 * r;
    ctx.shadowOffsetY = r;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(4 * r, 3 * r, chipW, chipH, 6 * r);
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (dot) {
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(4 * r + 11 * r, 3 * r + chipH / 2, 3 * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#1e293b";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 4 * r + 8 * r + dotW, 3 * r + chipH / 2 + r);
    const tex = new CanvasTexture(ctx.canvas);
    tex.colorSpace = SRGBColorSpace;
    return { texture: tex, w: ctx.canvas.width / r, h: ctx.canvas.height / r };
  }, [text, dot]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ camera }) => {
    const zoom = (camera as OrthographicCamera).zoom;
    ref.current?.scale.set(w / zoom, h / zoom, 1);
  });
  return (
    <sprite ref={ref} position={position} center={[0.5, 0]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

/** Map pin from the reference: teardrop head with a white centre that always faces the camera. */
export function Pin({ y, color }: { y: number; color: string }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = y + Math.sin(clock.elapsedTime * 2.2) * 0.12;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]} castShadow>
        <coneGeometry args={[0.36, 1.0, 20]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <sphereGeometry args={[0.58, 24, 18]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <Billboard position={[0, 1.25, 0]}>
        <mesh position={[0, 0, 0.6]}>
          <circleGeometry args={[0.24, 20]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </Billboard>
    </group>
  );
}
