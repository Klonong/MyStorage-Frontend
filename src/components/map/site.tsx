"use client";

// Static scenery for one site: warehouse shell, yard markings, street and props,
// modelled on the reference video (white ribbed walls, blue sawtooth roof, open docks).
import { useLayoutEffect, useMemo, useRef } from "react";
import { DoubleSide, Object3D, Shape, type InstancedMesh } from "three";
import type { SiteLayout, SiteType, Zone } from "@/interfaces/warehouse.interface";
import { padBounds } from "@/lib/heat";
import { Block, Label, palette, type V3 } from "./primitives";
import { brandSign, ribs } from "./textures";

function Flat({ x, z, w, d, color, y = 0.02 }: { x: number; z: number; w: number; d: number; color: string; y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

// ---------- warehouse ----------

function RibbedWall({ width, height, position, rotationY }: { width: number; height: number; position: V3; rotationY: number }) {
  const map = useMemo(() => ribs(palette.wall, palette.wallRib, width / 0.9), [width]);
  return (
    <mesh position={position} rotation={[0, rotationY, 0]} receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={map} roughness={0.75} />
    </mesh>
  );
}

/** Row of pitched roofs running front to back, like the reference's sawtooth hall. */
function GableRoof({ width, depth, height }: { width: number; depth: number; height: number }) {
  const bays = Math.max(1, Math.round(width / 12));
  const span = width / bays;
  const rise = span * 0.22;
  const over = 0.5;
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 0);
    s.lineTo(span, 0);
    s.lineTo(span / 2, rise);
    s.closePath();
    return s;
  }, [span, rise]);
  const roofMap = useMemo(() => {
    const t = ribs(palette.roof, palette.roofRib, 1, 1.3);
    t.rotation = Math.PI / 2;
    return t;
  }, []);
  const slope = Math.atan2(rise, span / 2);
  const edge = Math.hypot(span / 2, rise);
  return (
    <group position={[-width / 2, height, 0]}>
      {Array.from({ length: bays }, (_, i) => (
        <group key={i} position={[i * span, 0, 0]}>
          <mesh position={[0, 0, -depth / 2 - over]} castShadow receiveShadow>
            <extrudeGeometry args={[shape, { depth: depth + over * 2, bevelEnabled: false }]} />
            <meshStandardMaterial attach="material-0" color={palette.wall} roughness={0.8} />
            <meshStandardMaterial attach="material-1" map={roofMap} roughness={0.55} />
          </mesh>
          {[depth / 2 + over, -depth / 2 - over].map((z) => (
            <group key={z}>
              <Block size={[edge, 0.18, 0.18]} position={[span / 4, rise / 2, z]} rotation={[0, 0, slope]} color={palette.trim} cast={false} />
              <Block size={[edge, 0.18, 0.18]} position={[(span * 3) / 4, rise / 2, z]} rotation={[0, 0, -slope]} color={palette.trim} cast={false} />
            </group>
          ))}
        </group>
      ))}
      <Block size={[width + 0.4, 0.3, depth + over * 2]} position={[width / 2, 0.05, 0]} color={palette.trim} />
    </group>
  );
}

/** A ribbed-wall hall with navy corner posts and a sawtooth roof. `open` cuts it down to knee walls so the floor shows. */
function Hall({ width, depth, height: full, position = [0, 0, 0], open = false }: { width: number; depth: number; height: number; position?: V3; open?: boolean }) {
  const height = open ? 1.4 : full;
  return (
    <group position={position}>
      {/* Solid core for shadows; the ribbed planes sit just outside it. Open halls show a floor instead. */}
      {open ? (
        <Flat x={0} z={0} w={width - 0.1} d={depth - 0.1} color={palette.interior} y={0.52} />
      ) : (
        <Block size={[width - 0.05, height, depth - 0.05]} position={[0, height / 2, 0]} color={palette.wall} />
      )}
      <RibbedWall width={width} height={height} position={[0, height / 2, depth / 2]} rotationY={0} />
      <RibbedWall width={width} height={height} position={[0, height / 2, -depth / 2]} rotationY={Math.PI} />
      <RibbedWall width={depth} height={height} position={[-width / 2, height / 2, 0]} rotationY={-Math.PI / 2} />
      <RibbedWall width={depth} height={height} position={[width / 2, height / 2, 0]} rotationY={Math.PI / 2} />
      <Block size={[width + 0.1, 0.5, depth + 0.1]} position={[0, 0.25, 0]} color="#cfd6e3" />
      {[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].map(([sx, sz]) => (
        <Block key={`${sx}${sz}`} size={[0.55, height + 0.2, 0.55]} position={[(sx * width) / 2, (height + 0.2) / 2, (sz * depth) / 2]} color={palette.navy} />
      ))}
      {!open && <GableRoof width={width} depth={depth} height={height} />}
    </group>
  );
}

const zoneTints = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#e0e7ff", "#ccfbf1"];

/** One rack row running front to back: uprights every bay, a beam pair per level, cartons on most cells. */
function RackRow({ x, z, length, levels }: { x: number; z: number; length: number; levels: number }) {
  const bays = Math.max(1, Math.floor(length / 2.7));
  const bay = length / bays;
  return (
    <group position={[x, 0.5, z]}>
      {Array.from({ length: bays + 1 }, (_, i) => (
        <Block key={`u${i}`} size={[1.1, levels * 1.25 + 0.3, 0.1]} position={[0, (levels * 1.25 + 0.3) / 2, -length / 2 + i * bay]} color="#ea7a1f" cast={false} />
      ))}
      {Array.from({ length: levels }, (_, j) =>
        Array.from({ length: bays }, (_, i) =>
          (i * 3 + j * 5 + Math.round(x)) % 4 === 0 ? null : (
            <Block key={`c${i}-${j}`} size={[0.95, 0.85, bay * 0.8]} position={[0, j * 1.25 + 0.5, -length / 2 + (i + 0.5) * bay]} color={(i + j) % 3 ? palette.cardboard : "#c99858"} cast={false} />
          ),
        ),
      )}
    </group>
  );
}

/** Storage zones from the layout: tinted floor, code label and a rack row per aisle. */
function Zones({ zones }: { zones: Zone[] }) {
  return (
    <group>
      {zones.map((zone, k) => (
        <group key={zone.id}>
          <Flat x={zone.x + zone.w / 2} z={zone.z + zone.d / 2} w={zone.w} d={zone.d} color={zoneTints[k % zoneTints.length]} y={0.54} />
          {Array.from({ length: zone.aisles }, (_, i) => (
            <RackRow key={i} x={zone.x + (i + 0.5) * (zone.w / zone.aisles)} z={zone.z + zone.d / 2} length={zone.d - 0.6} levels={zone.levels} />
          ))}
          <Label position={[zone.x + zone.w / 2, zone.levels * 1.25 + 2.2, zone.z + zone.d / 2]} text={`Zone ${zone.code} · ${zone.name}`} />
        </group>
      ))}
    </group>
  );
}

function DockOpening({ code, x, z, busy }: { code: string; x: number; z: number; busy: boolean }) {
  const light = busy ? "#f59e0b" : "#22c55e";
  return (
    <group position={[x, 0, z]}>
      <Block size={[3.4, 4.1, 0.05]} position={[0, 2.05, 0.03]} color={palette.interior} cast={false} />
      <Block size={[3.4, 0.05, 0.7]} position={[0, 0.03, 0.35]} color="#d8d2c6" cast={false} />
      <Block size={[0.32, 4.5, 0.75]} position={[-1.86, 2.25, 0.37]} color={palette.navy} />
      <Block size={[0.32, 4.5, 0.75]} position={[1.86, 2.25, 0.37]} color={palette.navy} />
      <Block size={[4.04, 0.42, 0.75]} position={[0, 4.29, 0.37]} color={palette.navy} />
      {/* Stock visible through the open door */}
      <Block size={[0.9, 0.8, 0.5]} position={[-0.7, 0.4, 0.3]} color={palette.cardboard} />
      <Block size={[0.9, 0.7, 0.5]} position={[-0.7, 1.15, 0.3]} color="#c99858" />
      <Block size={[0.8, 0.8, 0.5]} position={[0.55, 0.4, 0.3]} color={palette.cardboard} />
      <Block size={[0.7, 0.32, 0.14]} position={[0, 4.95, 0.12]} color="#3b82f6" cast={false} />
      <mesh position={[1.55, 4.95, 0.3]}>
        <sphereGeometry args={[0.17, 12, 12]} />
        <meshStandardMaterial color={light} emissive={light} emissiveIntensity={0.8} />
      </mesh>
      <Label position={[0, 5.4, 0.4]} text={code} />
    </group>
  );
}

export function Warehouse({ layout, type, busyDoors, interior = false }: { layout: SiteLayout; type: SiteType; busyDoors: string[]; interior?: boolean }) {
  const { width: w, depth: d, height: h } = layout.building;
  const sign = brandSign();
  // A wall post between each pair of neighbouring doors, wherever the layout puts them.
  const posts = layout.doors.slice(1).map((door, i) => (door.x + layout.doors[i].x) / 2);
  return (
    <group>
      <Hall width={w} depth={d} height={h} open={interior} />
      {interior && <Zones zones={layout.zones} />}
      {type === "hub" && <Hall width={w * 0.42} depth={d * 0.55} height={h + 1.5} position={[-w / 2 + w * 0.21, 0, -d / 2 - d * 0.27]} open={interior} />}
      {!interior &&
        posts.map((x) => (
          <Block key={`p${x}`} size={[0.4, h, 0.35]} position={[x, h / 2, d / 2 + 0.15]} color={palette.navy} />
        ))}
      {!interior && (
        <mesh position={[0, h - 1.7, d / 2 + 0.06]}>
          <planeGeometry args={[6.4, 1.6]} />
          <meshStandardMaterial map={sign} transparent roughness={0.5} />
        </mesh>
      )}
      {/* Side door used by putaway */}
      <Block size={[0.3, 3.4, 3.2]} position={[-w / 2 - 0.12, 1.7, d / 2 - 3]} color={palette.navy} />
      <Block size={[0.32, 3, 2.6]} position={[-w / 2 - 0.14, 1.5, d / 2 - 3]} color={palette.interior} cast={false} />
      {layout.doors.map((door) => (
        <DockOpening key={door.id} code={door.code} x={door.x} z={d / 2} busy={busyDoors.includes(door.id)} />
      ))}
    </group>
  );
}

// ---------- ground, street and props ----------

function Posts({ points, height, color }: { points: V3[]; height: number; color: string }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    points.forEach((p, i) => {
      dummy.position.set(p[0], height / 2, p[2]);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [points, height]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, points.length]} castShadow>
      <cylinderGeometry args={[0.06, 0.06, height, 6]} />
      <meshStandardMaterial color={color} />
    </instancedMesh>
  );
}

function FenceRun({ from, to }: { from: [number, number]; to: [number, number] }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const angle = -Math.atan2(to[1] - from[1], to[0] - from[0]);
  const count = Math.max(2, Math.round(len / 3.5) + 1);
  const posts = useMemo(
    () => Array.from({ length: count }, (_, i): V3 => [from[0] + ((to[0] - from[0]) * i) / (count - 1), 0, from[1] + ((to[1] - from[1]) * i) / (count - 1)]),
    [from, to, count],
  );
  const mid: V3 = [(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2];
  return (
    <group>
      <Posts points={posts} height={1.6} color="#94a3b8" />
      <mesh position={[mid[0], 0.8, mid[2]]} rotation={[0, angle, 0]}>
        <planeGeometry args={[len, 1.5]} />
        <meshStandardMaterial color="#a8b4c7" transparent opacity={0.28} side={DoubleSide} depthWrite={false} />
      </mesh>
      <Block size={[len, 0.06, 0.06]} position={[mid[0], 1.6, mid[2]]} rotation={[0, angle, 0]} color="#94a3b8" cast={false} />
    </group>
  );
}

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 1.8, 8]} />
        <meshStandardMaterial color="#8b6b4a" />
      </mesh>
      <mesh position={[0, 2.7, 0]} castShadow>
        <sphereGeometry args={[1.35, 24, 18]} />
        <meshStandardMaterial color={palette.tree} roughness={0.9} />
      </mesh>
      <mesh position={[0.25, 3.25, 0.2]}>
        <sphereGeometry args={[0.75, 16, 12]} />
        <meshStandardMaterial color="#7dd38a" roughness={0.9} />
      </mesh>
    </group>
  );
}

export function Ground({ layout }: { layout: SiteLayout }) {
  const { width: w, depth: d } = layout.building;
  const { roadZ } = layout;
  const lane = d / 2 + 15;
  const { x0, x1, z0 } = padBounds(layout);
  const parkZ0 = layout.chargers[0].pos[1] - 1.6;
  const parkZ1 = layout.chargers[layout.chargers.length - 1].pos[1] + 1.6;
  return (
    <group>
      <Flat x={(x0 + x1) / 2} z={(z0 + roadZ - 5) / 2} w={x1 - x0} d={roadZ - 5 - z0} color={palette.pad} y={0.01} />
      {/* Yard: forklift lane, dock bays, staging slots, forklift parking */}
      {Array.from({ length: Math.floor((x1 - x0 - 8) / 3) }, (_, i) => (
        <Flat key={`l${i}`} x={x0 + 4 + i * 3} z={lane} w={1.5} d={0.15} color="#c5cedc" y={0.03} />
      ))}
      {layout.doors.map((door) => (
        <group key={door.id}>
          <Flat x={door.x - 1.9} z={d / 2 + 6.6} w={0.16} d={13.2} color={palette.marking} y={0.03} />
          <Flat x={door.x + 1.9} z={d / 2 + 6.6} w={0.16} d={13.2} color={palette.marking} y={0.03} />
        </group>
      ))}
      {layout.slots.map((slot) => (
        <group key={slot.id}>
          <Flat x={slot.pos[0]} z={slot.pos[1]} w={2.1} d={1.9} color={palette.marking} y={0.025} />
          <Flat x={slot.pos[0]} z={slot.pos[1]} w={1.86} d={1.66} color="#f1f3f8" y={0.03} />
        </group>
      ))}
      <Flat x={-w / 2 - 2.9} z={(parkZ0 + parkZ1) / 2} w={4.6} d={parkZ1 - parkZ0} color="#dcf3e2" y={0.025} />
      <FenceRun from={[x0 + 1, z0 + 1]} to={[x1 - 1, z0 + 1]} />
      <FenceRun from={[x0 + 1, z0 + 1]} to={[x0 + 1, roadZ - 9]} />
      <FenceRun from={[x1 - 1, z0 + 1]} to={[x1 - 1, roadZ - 9]} />
    </group>
  );
}

export function Street({ layout, type }: { layout: SiteLayout; type: SiteType }) {
  const { width: w, depth: d } = layout.building;
  const { roadZ, gateX } = layout;
  return (
    <group>
      {layout.trees.map(([x, z], i) => (
        <Tree key={i} x={x} z={z} s={0.9 + (i % 3) * 0.15} />
      ))}
      {/* Gatehouse and barrier on the inbound lane */}
      <group position={[gateX - 3, 0, roadZ - 7.4]}>
        <Block size={[2.4, 2.6, 2.2]} position={[0, 1.3, 0]} color="#ffffff" />
        <Block size={[2.8, 0.3, 2.6]} position={[0, 2.75, 0]} color={palette.roof} />
        <Block size={[1.6, 0.8, 0.06]} position={[0, 1.6, 1.11]} color="#93c5fd" cast={false} />
      </group>
      <Block size={[0.3, 1.1, 0.3]} position={[gateX + 1, 0.55, roadZ - 4.9]} color="#334155" />
      <Block size={[0.14, 0.14, 4.6]} position={[gateX + 1, 1.15, roadZ - 2.5]} color="#ef4444" />
      {layout.chargers.map((c) => (
        <group key={c.id} position={[c.pos[0], 0, c.pos[1]]}>
          <Block size={[0.5, 1.3, 0.8]} position={[0, 0.65, 0]} color="#ffffff" />
          <Block size={[0.06, 0.3, 0.3]} position={[-0.27, 1, 0]} color="#22c55e" cast={false} />
        </group>
      ))}
      {type === "hub" && (
        <group position={[-w / 2 - 24, 0, -d / 2 + 3]}>
          <ContainerBox />
        </group>
      )}
      <PalletRack position={[w / 2 + 6, 0, -d / 2 + 4]} />
    </group>
  );
}

function ContainerBox() {
  const map = useMemo(() => ribs("#22a094", "#1b8a7f", 14), []);
  return (
    <group>
      <mesh position={[0, 1.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 2.7, 12]} />
        <meshStandardMaterial map={map} roughness={0.7} />
      </mesh>
      <Block size={[2.7, 0.15, 12.1]} position={[0, 2.72, 0]} color="#1b8a7f" cast={false} />
    </group>
  );
}

function PalletRack({ position }: { position: V3 }) {
  const cols = [-2.4, 0, 2.4];
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {[-3.6, -1.2, 1.2, 3.6].flatMap((x) =>
        [-0.55, 0.55].map((z) => <Block key={`${x}${z}`} size={[0.12, 4.2, 0.12]} position={[x, 2.1, z]} color="#ea7a1f" />),
      )}
      {[1.4, 2.8, 4.1].map((y) => (
        <group key={y}>
          <Block size={[7.4, 0.12, 0.1]} position={[0, y, -0.55]} color="#ea7a1f" cast={false} />
          <Block size={[7.4, 0.12, 0.1]} position={[0, y, 0.55]} color="#ea7a1f" cast={false} />
        </group>
      ))}
      {cols.flatMap((x) =>
        [0, 1.4, 2.8].map((y, j) => (
          <group key={`${x}${y}`} position={[x, y + 0.05, 0]}>
            <Block size={[1.2, 0.12, 1.0]} position={[0, 0.06, 0]} color="#b98a56" />
            <Block size={[1.05, 0.95 - (j % 2) * 0.2, 0.9]} position={[0, 0.6 - (j % 2) * 0.1, 0]} color={j === 1 && x === 0 ? "#2563eb" : palette.cardboard} />
          </group>
        )),
      )}
    </group>
  );
}
