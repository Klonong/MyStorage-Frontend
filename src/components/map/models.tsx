"use client";

import { Edges, Line, RoundedBox, useCursor } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Group } from "three";
import { useWarehouse } from "@/hooks/useWarehouse";
import type { Pallet } from "@/interfaces/warehouse.interface";
import { plannedRoute } from "@/lib/simulator";
import { forkliftStatus, palletStatus, truckStatus, type Tone } from "@/lib/status";
import { Block, Label, palette, Pin, type V3 } from "./primitives";
import { carrierDecal } from "./textures";

const toneHex: Record<Tone, string> = { green: "#10b981", blue: "#3b82f6", amber: "#f59e0b", slate: "#94a3b8", red: "#ef4444" };

/** Carrier livery: cab colour and the stripe/decal colour on the box. */
const livery: Record<string, { cab: string; accent: string }> = {
  "WareTrack Freight": { cab: "#2563eb", accent: "#2563eb" },
  "Nordline Logistics": { cab: "#f8fafc", accent: "#0f8f80" },
  Bluepeak: { cab: "#f8fafc", accent: "#1e3a8a" },
  Cargolink: { cab: "#f8fafc", accent: "#ea580c" },
};

// ---------- shared helpers ----------

function useHover() {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return {
    hovered,
    handlers: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      },
      onPointerOut: () => setHovered(false),
    },
  };
}

/** Eases a model toward its simulated position each frame, so 4 Hz updates look continuous. */
function useFollow(siteId: string, kind: "truck" | "forklift", id: string) {
  const ref = useRef<Group>(null);
  const placed = useRef(false);
  useFrame((_, delta) => {
    const g = ref.current;
    const live = useWarehouse.getState().sites[siteId];
    const o = kind === "truck" ? live.trucks.find((t) => t.id === id) : live.forklifts.find((f) => f.id === id);
    if (!g || !o) return;
    const k = placed.current ? 1 - Math.exp(-10 * delta) : 1;
    placed.current = true;
    g.position.x += (o.pos[0] - g.position.x) * k;
    g.position.z += (o.pos[1] - g.position.z) * k;
    g.rotation.y += Math.atan2(Math.sin(o.heading - g.rotation.y), Math.cos(o.heading - g.rotation.y)) * k;
  });
  return ref;
}

/** Selection from the reference: thin box outline, bold corner brackets on the ground, a pin above. */
function Highlight({ size }: { size: V3 }) {
  const [w, h, l] = size;
  const arm = Math.min(w, l) * 0.35;
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  return (
    <group>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={size} />
        <meshBasicMaterial color={palette.accent} transparent opacity={0.05} depthWrite={false} />
        <Edges color={palette.accent} lineWidth={1.2} />
      </mesh>
      {corners.map(([sx, sz]) => (
        <group key={`${sx}${sz}`} position={[(sx * (w + 0.5)) / 2, 0.06, (sz * (l + 0.5)) / 2]}>
          <mesh position={[(-sx * arm) / 2, 0, 0]}>
            <boxGeometry args={[arm, 0.04, 0.16]} />
            <meshBasicMaterial color={palette.accent} />
          </mesh>
          <mesh position={[0, 0, (-sz * arm) / 2]}>
            <boxGeometry args={[0.16, 0.04, arm]} />
            <meshBasicMaterial color={palette.accent} />
          </mesh>
        </group>
      ))}
      <Pin y={h + 0.5} color={palette.accent} />
    </group>
  );
}

// ---------- pallets ----------

/** Load look per product, after the reference: kraft cartons, blue crates, white wrapped stacks. */
function cargoOf(p: Pallet) {
  if (p.sku === "PPE-GLV-N") return { color: "#2f6fe4", seam: "#1f56c4", h: 1.0, grid: 3 };
  if (p.category === "Furniture") return { color: "#e9eef6", seam: "#d5dde9", h: 1.4, grid: 1 };
  if (p.category === "Lighting") return { color: "#cf9f66", seam: "#b9874f", h: 1.15, grid: 1 };
  return { color: palette.cardboard, seam: "#bb8a52", h: 1.0, grid: 2 };
}

export function PalletShape({ pallet }: { pallet: Pallet }) {
  const c = cargoOf(pallet);
  const cells = Array.from({ length: c.grid * c.grid }, (_, i) => [i % c.grid, Math.floor(i / c.grid)]);
  const cw = 1.12 / c.grid;
  const cd = 0.96 / c.grid;
  const layers = c.grid === 1 ? 1 : 2;
  const lh = c.h / layers;
  return (
    <group>
      <Block size={[1.2, 0.08, 1.0]} position={[0, 0.13, 0]} color="#c4925c" />
      {[-0.42, 0, 0.42].map((z) => (
        <Block key={z} size={[1.2, 0.1, 0.14]} position={[0, 0.05, z]} color="#a87a48" />
      ))}
      {Array.from({ length: layers }, (_, layer) =>
        cells.map(([ix, iz]) => (
          <Block
            key={`${layer}-${ix}-${iz}`}
            size={[cw - 0.03, lh - 0.03, cd - 0.03]}
            position={[-0.56 + cw * (ix + 0.5), 0.17 + lh * (layer + 0.5), -0.48 + cd * (iz + 0.5)]}
            color={c.color}
          />
        )),
      )}
      <Block size={[c.grid === 1 ? 0.2 : 1.13, 0.02, c.grid === 1 ? 0.98 : 0.1]} position={[0, 0.18 + c.h, 0]} color={c.seam} cast={false} />
    </group>
  );
}

export function PalletModel({ siteId, id }: { siteId: string; id: string }) {
  const pallet = useWarehouse((s) => s.sites[siteId].pallets.find((p) => p.id === id));
  const slot = useWarehouse((s) => s.sites[siteId].site.layout.slots.find((sl) => sl.id === pallet?.slotId));
  const selected = useWarehouse((s) => s.selection?.kind === "pallet" && s.selection.id === id);
  const select = useWarehouse((s) => s.select);
  const { hovered, handlers } = useHover();
  if (!pallet || !slot) return null;
  const status = palletStatus[pallet.status];
  return (
    <group
      position={[slot.pos[0], 0, slot.pos[1]]}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: "pallet", id });
      }}
      {...handlers}
    >
      <PalletShape pallet={pallet} />
      {selected && <Highlight size={[1.6, 1.9, 1.4]} />}
      {!selected && pallet.status === "qc-hold" && <Pin y={1.9} color="#f59e0b" />}
      {(hovered || selected) && <Label position={[0, 4.6, 0]} text={`${pallet.id} · ${status.label}`} dot={toneHex[status.tone]} />}
    </group>
  );
}

// ---------- trucks ----------

function Wheel({ x, z }: { x: number; z: number }) {
  const side = Math.sign(x);
  return (
    <group position={[x, 0.48, z]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.48, 0.48, 0.36, 20]} />
        <meshStandardMaterial color="#1f2937" roughness={0.9} />
      </mesh>
      <mesh position={[0, side * 0.19, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.02, 16]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** Rigid box truck facing +z: cab at the front, branded cargo box behind. About 10.4 m long. */
function TruckBody({ carrier }: { carrier: string }) {
  const { cab, accent } = livery[carrier] ?? livery["WareTrack Freight"];
  const decal = carrierDecal(carrier, accent);
  return (
    <group>
      <Block size={[2.1, 0.4, 9.8]} position={[0, 0.78, 0]} color="#334155" />
      {/* Cargo box */}
      <RoundedBox args={[2.55, 2.9, 7.2]} radius={0.08} smoothness={3} position={[0, 2.5, -1.4]} castShadow receiveShadow>
        <meshStandardMaterial color="#fbfcfe" roughness={0.45} />
      </RoundedBox>
      <Block size={[2.58, 0.42, 7.05]} position={[0, 1.27, -1.4]} color={accent} cast={false} />
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 1.282, 2.55, -1.2]} rotation={[0, (s * Math.PI) / 2, 0]}>
          <planeGeometry args={[3.4, 1.28]} />
          <meshStandardMaterial map={decal} transparent roughness={0.5} />
        </mesh>
      ))}
      <Block size={[2.3, 2.5, 0.05]} position={[0, 2.5, -5.02]} color="#e2e8f0" cast={false} />
      {/* Cab */}
      <RoundedBox args={[2.45, 2.25, 2.45]} radius={0.22} smoothness={4} position={[0, 2.0, 3.55]} castShadow receiveShadow>
        <meshStandardMaterial color={cab} roughness={0.35} />
      </RoundedBox>
      <Block size={[2.15, 0.95, 0.06]} position={[0, 2.45, 4.78]} color="#1e293b" cast={false} roughness={0.15} />
      {[1, -1].map((s) => (
        <group key={s}>
          <Block size={[0.06, 0.8, 1.05]} position={[s * 1.23, 2.45, 3.85]} color="#1e293b" cast={false} roughness={0.15} />
          <Block size={[0.12, 0.42, 0.1]} position={[s * 1.42, 2.35, 4.45]} color="#1f2937" cast={false} />
          <Block size={[0.4, 0.16, 0.04]} position={[s * 0.82, 1.15, 4.79]} color="#fff8e1" cast={false} />
        </group>
      ))}
      <Block size={[1.1, 0.38, 0.04]} position={[0, 1.25, 4.79]} color="#475569" cast={false} />
      <Block size={[2.5, 0.32, 0.34]} position={[0, 0.78, 4.78]} color="#64748b" />
      {cab !== accent && <Block size={[2.47, 0.3, 2.3]} position={[0, 1.18, 3.55]} color={accent} cast={false} />}
      {[3.75, -3.3, -4.4].flatMap((z) => [-1.12, 1.12].map((x) => <Wheel key={`${x}${z}`} x={x} z={z} />))}
    </group>
  );
}

export function TruckModel({ siteId, id }: { siteId: string; id: string }) {
  const ref = useFollow(siteId, "truck", id);
  const status = useWarehouse((s) => s.sites[siteId].trucks.find((t) => t.id === id)?.status);
  const carrier = useWarehouse((s) => s.sites[siteId].trucks.find((t) => t.id === id)?.carrier ?? "");
  const selected = useWarehouse((s) => s.selection?.kind === "truck" && s.selection.id === id);
  const select = useWarehouse((s) => s.select);
  const { hovered, handlers } = useHover();
  const meta = status ? truckStatus[status] : null;
  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: "truck", id });
      }}
      {...handlers}
    >
      <TruckBody carrier={carrier} />
      {selected && <Highlight size={[3.2, 4.2, 10.8]} />}
      {meta && (hovered || selected) && <Label position={[0, 6.8, 0]} text={`${id} · ${meta.label}`} dot={toneHex[meta.tone]} />}
    </group>
  );
}

/** Blue path on the road from an arriving truck to its dock, as in the reference. */
export function RouteLine({ siteId, id }: { siteId: string; id: string }) {
  // Select stable store objects; building the route inside the selector would loop useSyncExternalStore.
  const truck = useWarehouse((s) => s.sites[siteId].trucks.find((t) => t.id === id));
  const layout = useWarehouse((s) => s.sites[siteId].site.layout);
  const route = truck ? plannedRoute(layout, truck) : [];
  const selected = useWarehouse((s) => s.selection?.kind === "truck" && s.selection.id === id);
  if (route.length < 2) return null;
  return (
    <Line
      points={route.map(([x, z]): V3 => [x, 0.09, z])}
      color={palette.accent}
      lineWidth={selected ? 7 : 4}
      transparent
      opacity={selected ? 0.85 : 0.45}
      depthWrite={false}
    />
  );
}

// ---------- forklifts ----------

export function ForkliftModel({ siteId, id }: { siteId: string; id: string }) {
  const ref = useFollow(siteId, "forklift", id);
  const status = useWarehouse((s) => s.sites[siteId].forklifts.find((f) => f.id === id)?.status ?? "idle");
  const load = useWarehouse((s) => {
    const live = s.sites[siteId];
    const carrying = live.forklifts.find((f) => f.id === id)?.carrying;
    return carrying ? live.pallets.find((p) => p.id === carrying) : undefined;
  });
  const selected = useWarehouse((s) => (s.selection?.kind === "forklift" && s.selection.id === id) || (s.selection?.kind === "pallet" && s.selection.id === load?.id));
  const select = useWarehouse((s) => s.select);
  const { hovered, handlers } = useHover();
  const meta = forkliftStatus[status];
  const lift = load ? 0.35 : 0;
  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: "forklift", id });
      }}
      {...handlers}
    >
      <RoundedBox args={[1.2, 0.85, 1.75]} radius={0.12} smoothness={3} position={[0, 0.72, -0.15]} castShadow>
        <meshStandardMaterial color="#f6b70f" roughness={0.45} />
      </RoundedBox>
      <RoundedBox args={[1.2, 0.8, 0.5]} radius={0.12} smoothness={3} position={[0, 0.75, -1.15]} castShadow>
        <meshStandardMaterial color="#d99a00" roughness={0.5} />
      </RoundedBox>
      <Block size={[0.6, 0.4, 0.5]} position={[0, 1.32, -0.45]} color="#1f2937" />
      {/* Driver */}
      <Block size={[0.46, 0.5, 0.32]} position={[0, 1.7, -0.4]} color="#2563eb" />
      <mesh position={[0, 2.12, -0.38]} castShadow>
        <sphereGeometry args={[0.17, 14, 12]} />
        <meshStandardMaterial color="#e0ac85" />
      </mesh>
      <mesh position={[0, 2.25, -0.38]}>
        <sphereGeometry args={[0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      {[
        [-0.52, 0.25],
        [0.52, 0.25],
        [-0.52, -0.9],
        [0.52, -0.9],
      ].map(([x, z]) => (
        <Block key={`${x}${z}`} size={[0.07, 1.3, 0.07]} position={[x, 1.75, z]} color="#1f2937" />
      ))}
      <Block size={[1.2, 0.07, 1.3]} position={[0, 2.42, -0.32]} color="#1f2937" />
      <mesh position={[0, 2.54, -0.32]}>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshStandardMaterial color={toneHex[meta.tone]} emissive={toneHex[meta.tone]} emissiveIntensity={0.8} />
      </mesh>
      <Block size={[0.09, 2.6, 0.09]} position={[-0.38, 1.4, 0.78]} color="#374151" />
      <Block size={[0.09, 2.6, 0.09]} position={[0.38, 1.4, 0.78]} color="#374151" />
      <Block size={[0.9, 0.09, 0.09]} position={[0, 2.65, 0.78]} color="#374151" />
      <group position={[0, lift, 0]}>
        <Block size={[0.9, 0.5, 0.06]} position={[0, 0.45, 0.86]} color="#374151" />
        <Block size={[0.13, 0.05, 1.15]} position={[-0.28, 0.22, 1.45]} color="#6b7280" />
        <Block size={[0.13, 0.05, 1.15]} position={[0.28, 0.22, 1.45]} color="#6b7280" />
        {load && (
          <group position={[0, 0.25, 1.5]}>
            <PalletShape pallet={load} />
          </group>
        )}
      </group>
      {[
        [-0.56, 0.45],
        [0.56, 0.45],
        [-0.56, -0.9],
        [0.56, -0.9],
      ].map(([x, z]) => (
        <mesh key={`w${x}${z}`} position={[x, 0.3, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.24, 14]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      {selected && <Highlight size={[1.8, 2.8, 3.6]} />}
      {(hovered || selected) && <Label position={[0, 5.3, 0]} text={`${id} · ${meta.label}`} dot={toneHex[meta.tone]} />}
    </group>
  );
}
