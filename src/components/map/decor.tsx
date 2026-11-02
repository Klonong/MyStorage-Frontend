"use client";

// Static scenery that makes a site read as a real place: office block, staff car park, dock bollards,
// dumpsters, parked trailers, an entrance sign, the crosswalk at the gate and lawns. None of it is simulated.
import { useWarehouse } from "@/hooks/useWarehouse";
import type { SiteLayout, SiteType } from "@/interfaces/warehouse.interface";
import { padBounds } from "@/lib/heat";
import { Block, LightPool, palette, type V3 } from "./primitives";

const carColors = ["#f8fafc", "#1f2937", "#9ca3af", "#2563eb", "#dc2626", "#e5e7eb", "#0f766e", "#f59e0b"];
const lawn = "#d9efdc";

function Flat({ x, z, w, d, color, y = 0.02 }: { x: number; z: number; w: number; d: number; color: string; y?: number }) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

/** A parked car, nose toward +x. */
export function Car({ position, color, rotation = 0, night = false }: { position: V3; color: string; rotation?: number; night?: boolean }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Block size={[4.2, 0.75, 1.8]} position={[0, 0.55, 0]} color={color} roughness={0.35} />
      <Block size={[2.2, 0.6, 1.6]} position={[-0.25, 1.2, 0]} color={color} roughness={0.35} />
      <Block size={[2.0, 0.45, 1.64]} position={[-0.25, 1.2, 0]} color="#1e293b" cast={false} roughness={0.15} />
      {[-0.6, 0.6].map((z) => (
        <Block key={z} size={[0.05, 0.16, 0.4]} position={[2.11, 0.65, z]} color="#fff8e1" cast={false} glow={night ? "#fff1b8" : undefined} />
      ))}
      {[-1.35, 1.35].flatMap((x) =>
        [-0.86, 0.86].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.22, 12]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Two-storey office with window bands, an entrance canopy and rooftop AC units. */
function Office({ x, z, w, d, night }: { x: number; z: number; w: number; d: number; night: boolean }) {
  const h = 7;
  return (
    <group position={[x, 0, z]}>
      <Block size={[w, h, d]} position={[0, h / 2, 0]} color="#ffffff" />
      {[2.1, 5.1].map((y, i) => {
        // At night the ground floor stays lit (security), the upper floor partly.
        const lit = night ? "#ffd98a" : undefined;
        return (
          <group key={y}>
            <Block size={[w - 1, 1.3, 0.06]} position={[0, y, d / 2 + 0.03]} color="#3b5b8c" cast={false} roughness={0.1} glow={lit} />
            <Block size={[0.06, 1.3, d - 1]} position={[w / 2 + 0.03, y, 0]} color="#3b5b8c" cast={false} roughness={0.1} glow={i === 0 ? lit : undefined} />
            <Block size={[0.06, 1.3, d - 1]} position={[-w / 2 - 0.03, y, 0]} color="#3b5b8c" cast={false} roughness={0.1} glow={i === 0 ? lit : undefined} />
          </group>
        );
      })}
      <Block size={[w + 0.3, 0.5, d + 0.3]} position={[0, h + 0.25, 0]} color={palette.navy} />
      {/* Entrance on the car-park side */}
      <Block size={[0.06, 2.4, 2]} position={[w / 2 + 0.04, 1.2, d / 2 - 2]} color="#93c5fd" cast={false} roughness={0.1} />
      <Block size={[1.8, 0.18, 3]} position={[w / 2 + 0.9, 2.7, d / 2 - 2]} color={palette.navy} />
      {[-1, 1].map((k) => (
        <group key={k} position={[k * w * 0.22, h + 0.5, -d * 0.15]}>
          <Block size={[1.8, 0.9, 1.3]} position={[0, 0.45, 0]} color="#cbd5e1" />
          <mesh position={[0, 0.92, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.45, 18]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        </group>
      ))}
      <Block size={[1, 0.2, 2.4]} position={[0, h + 0.6, d * 0.25]} color="#e2e8f0" cast={false} />
    </group>
  );
}

/** Staff parking: stall lines in two rows facing a centre aisle, about two thirds full. */
function CarPark({ x0, x1, z0, z1 }: { x0: number; x1: number; z0: number; z1: number }) {
  const stalls = Math.floor((z1 - z0) / 2.7);
  const rows = [x0 + 2.6, x1 - 2.6];
  return (
    <group>
      <Flat x={(x0 + x1) / 2} z={(z0 + z1) / 2} w={x1 - x0} d={z1 - z0} color="#dfe3eb" y={0.015} />
      {rows.map((rx, r) =>
        Array.from({ length: stalls }, (_, i) => {
          const z = z0 + 1.35 + i * 2.7;
          const taken = (i * 5 + r * 3) % 3 !== 0;
          return (
            <group key={`${r}-${i}`}>
              <Flat x={rx} z={z - 1.35} w={5} d={0.1} color="#ffffff" y={0.025} />
              {taken && <Car position={[rx, 0, z]} rotation={r ? Math.PI : 0} color={carColors[(i * 3 + r * 5) % carColors.length]} />}
            </group>
          );
        }),
      )}
    </group>
  );
}

function Dumpster({ position, color }: { position: V3; color: string }) {
  return (
    <group position={position}>
      <Block size={[2, 1.3, 1.3]} position={[0, 0.75, 0]} color={color} />
      <Block size={[2.05, 0.1, 1.35]} position={[0, 1.45, 0]} color="#1f2937" />
    </group>
  );
}

/** A trailer parked without its cab, on its landing legs. */
function Trailer({ position, rotation = 0, color = "#f8fafc" }: { position: V3; rotation?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Block size={[2.5, 2.6, 10]} position={[0, 2.4, 0]} color={color} />
      <Block size={[2.52, 0.3, 10.02]} position={[0, 1.2, 0]} color="#64748b" cast={false} />
      {[-3.3, -4.4].flatMap((z) =>
        [-1.1, 1.1].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.5, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.5, 0.5, 0.3, 14]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        )),
      )}
      {[-0.9, 0.9].map((x) => (
        <Block key={x} size={[0.12, 1.1, 0.12]} position={[x, 0.55, 3.2]} color="#334155" />
      ))}
    </group>
  );
}

/** Wall-mounted floodlight over the dock apron; at night it lights the ground in front of the doors. */
function Floodlight({ x, z, y, night }: { x: number; z: number; y: number; night: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <Block size={[0.9, 0.35, 0.6]} position={[0, y, 0.3]} color="#e2e8f0" cast={false} glow={night ? "#fff4cc" : undefined} />
      {night && <LightPool x={0} z={7} r={7} />}
    </group>
  );
}

export function SiteDecor({ layout, type }: { layout: SiteLayout; type: SiteType }) {
  const night = useWarehouse((s) => s.night);
  const { width: w, depth: d } = layout.building;
  const { x0, x1, z0 } = padBounds(layout);
  const { roadZ, gateX } = layout;
  return (
    <group>
      {/* Lawns: behind the building and around the office side */}
      <Flat x={(x0 + x1) / 2} z={z0 + 3} w={x1 - x0 - 4} d={3} color={lawn} y={0.018} />
      <Flat x={w / 2 + 6.5} z={d / 2 + 3} w={10} d={4} color={lawn} y={0.018} />

      <Office x={w / 2 + 6.5} z={4} w={9} d={d - 10} night={night} />
      {/* Floodlights on the front wall: one between each pair of doors and one past each end */}
      {[layout.doors[0].x - 4, ...layout.doors.slice(1).map((door, i) => (door.x + layout.doors[i].x) / 2), layout.doors[layout.doors.length - 1].x + 4]
        .filter((x) => Math.abs(x) < w / 2 - 0.5)
        .map((x) => (
          <Floodlight key={x} x={x} z={d / 2} y={layout.building.height - 2} night={night} />
        ))}
      <CarPark x0={w / 2 + 13} x1={x1 - 2} z0={-d / 2 + 1} z1={d / 2 + 3} />

      {/* Yellow bollards guarding each dock opening */}
      {layout.doors.flatMap((door) =>
        [-2.15, 2.15].map((dx) => (
          <mesh key={`${door.id}${dx}`} position={[door.x + dx, 0.55, d / 2 + 0.7]} castShadow>
            <cylinderGeometry args={[0.13, 0.13, 1.1, 10]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
        )),
      )}

      <Dumpster position={[-w / 2 - 7, 0, -d / 2 - 4]} color="#15803d" />
      <Dumpster position={[-w / 2 - 9.5, 0, -d / 2 - 4]} color="#1d4ed8" />

      {type === "hub" ? (
        <Trailer position={[-w / 2 - 30, 0, -d / 2 + 3]} />
      ) : (
        <>
          <Trailer position={[-w / 2 - 24, 0, -d / 2 + 3]} />
          <Trailer position={[-w / 2 - 29, 0, -d / 2 + 3]} color="#e0f2fe" />
        </>
      )}

      {/* Entrance sign by the gate */}
      <group position={[gateX - 9, 0, roadZ - 9]}>
        <Block size={[4.6, 0.5, 1]} position={[0, 0.25, 0]} color="#cbd5e1" />
        <Block size={[4, 1.7, 0.45]} position={[0, 1.35, 0]} color={palette.navy} />
        <Block size={[3.2, 0.22, 0.05]} position={[0, 1.6, 0.25]} color="#ffffff" cast={false} />
        <Block size={[2.2, 0.16, 0.05]} position={[0, 1.15, 0.25]} color="#93c5fd" cast={false} />
      </group>

      {/* Crosswalk across the street at the gate */}
      {Array.from({ length: 6 }, (_, i) => (
        <Flat key={i} x={gateX + 7} z={roadZ - 3.75 + i * 1.5} w={3.2} d={0.7} color="#ffffff" y={0.035} />
      ))}
    </group>
  );
}
