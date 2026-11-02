"use client";

// The town's roads. Each road is drawn in its own frame (running along +x) and then turned into place,
// so markings, lane arrows, stop lines and crosswalks all follow the road's direction.
// Traffic keeps right: lane +1 (z = +lane) drives toward the road's `to` end, lane -1 back toward `from`.
import { useMemo } from "react";
import { Shape } from "three";
import { useWarehouse } from "@/hooks/useWarehouse";
import { clear, crossingsOn, ROAD, roadRot, roadToWorld, type Road } from "@/lib/world";
import { Block, LightPool, palette } from "./primitives";

const HALF = ROAD.width / 2;
/** Clear zone around an intersection centre, along the road. */
const BOX = HALF + 1;

function Flat({ x, z, w, d, color, y = 0.03 }: { x: number; z: number; w: number; d: number; color: string; y?: number }) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function useArrowShape() {
  return useMemo(() => {
    const s = new Shape();
    s.moveTo(-1.4, -0.18);
    s.lineTo(0.3, -0.18);
    s.lineTo(0.3, -0.6);
    s.lineTo(1.4, 0);
    s.lineTo(0.3, 0.6);
    s.lineTo(0.3, 0.18);
    s.lineTo(-1.4, 0.18);
    s.closePath();
    return s;
  }, []);
}

/** A painted lane arrow pointing along +x (dir 1) or -x (dir -1) of the road frame. */
function Arrow({ x, z, dir, shape }: { x: number; z: number; dir: 1 | -1; shape: Shape }) {
  return (
    <group position={[x, 0.035, z]} rotation={[0, dir > 0 ? 0 : Math.PI, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
    </group>
  );
}

function Lamp({ x, side, night }: { x: number; side: 1 | -1; night: boolean }) {
  return (
    <group position={[x, 0, side * (HALF + 1.9)]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
      <Block size={[0.14, 5, 0.14]} position={[0, 2.5, 0]} color="#e2e8f0" />
      <Block size={[0.1, 0.1, 1.2]} position={[0, 4.95, -0.55]} color="#e2e8f0" cast={false} />
      <Block size={[0.32, 0.14, 0.6]} position={[0, 4.88, -1.1]} color="#cbd5e1" cast={false} glow={night ? "#ffe9a8" : undefined} />
      {night && <LightPool x={0} z={-1.6} r={5} />}
    </group>
  );
}


function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <Block size={[0.3, 1.8, 0.3]} position={[0, 0.9, 0]} color="#8b6b4a" />
      <mesh position={[0, 2.7, 0]} castShadow>
        <sphereGeometry args={[1.35, 18, 14]} />
        <meshStandardMaterial color={palette.tree} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** A low building set back from the road, windows facing it. */
function Neighbour({ x, side, w, d, h, color, night }: { x: number; side: 1 | -1; w: number; d: number; h: number; color: string; night: boolean }) {
  return (
    <group position={[x, 0, side * (HALF + 9 + d / 2)]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
      <Block size={[w, h, d]} position={[0, h / 2, 0]} color={color} />
      <Block size={[w + 0.2, 0.3, d + 0.2]} position={[0, h + 0.15, 0]} color="#94a3b8" />
      {Array.from({ length: Math.floor(w / 4) }, (_, i) => (
        <Block key={i} size={[2.2, 1, 0.05]} position={[-w / 2 + 2 + i * 4, h * 0.6, -d / 2 - 0.03]} color="#3b5b8c" cast={false} glow={night && (i + Math.round(x)) % 3 ? "#ffd27a" : undefined} />
      ))}
    </group>
  );
}

const buildingColors = ["#f1f5f9", "#e2e8f0", "#fef3c7", "#e0f2fe", "#f5f5f4"];

function RoadView({ road, index, night }: { road: Road; index: number; night: boolean }) {
  const arrow = useArrowShape();
  const len = road.to - road.from;
  const mid = (road.from + road.to) / 2;
  const cross = useMemo(() => crossingsOn(road), [road]);
  const near = (x: number, pad: number) => cross.some((c) => Math.abs(c - x) < pad);
  // Stretches between intersections, for edge lines and sidewalks.
  const runs = useMemo(() => {
    const cuts = [road.from, ...cross.flatMap((c) => [c - HALF, c + HALF]), road.to];
    return Array.from({ length: cuts.length / 2 }, (_, i) => [cuts[i * 2], cuts[i * 2 + 1]] as const).filter(([a, b]) => b > a);
  }, [road, cross]);
  const every = (step: number, offset = 0) => Array.from({ length: Math.floor(len / step) }, (_, i) => road.from + offset + i * step);

  // Buildings along the walk sides, wherever they clear the sites and the other roads.
  const buildings = useMemo(() => {
    const out: { x: number; side: 1 | -1; w: number; d: number; h: number; color: string }[] = [];
    road.walks.forEach((side) => {
      for (let x = road.from + 20, i = 0; x < road.to - 30; i++) {
        const w = 16 + ((i * 7 + side) % 14);
        const d = 12 + ((i * 5) % 10);
        const cx = x + w / 2;
        const [ax, az] = roadToWorld(road, [x, side * (HALF + 9)]);
        const [bx, bz] = roadToWorld(road, [x + w, side * (HALF + 9 + d)]);
        if (clear({ x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) }, 4)) {
          out.push({ x: cx, side, w, d, h: 5 + ((i * 3) % 7), color: buildingColors[(i + side + 2) % buildingColors.length] });
        }
        // Sparse: a building every 90-130 m, so the sites stay the focus.
        x += w + 90 + ((i * 11) % 40);
      }
    });
    return out;
  }, [road]);

  const [px, pz] = roadToWorld(road, [0, 0]);
  const y = 0.02 + index * 0.001;
  return (
    <group position={[px, 0, pz]} rotation={[0, roadRot(road), 0]}>
      <Flat x={mid} z={0} w={len} d={ROAD.width} color={palette.road} y={y} />
      {runs.map(([a, b]) => (
        <group key={a}>
          <Flat x={(a + b) / 2} z={-HALF + 0.4} w={b - a} d={0.18} color="#ffffff" />
          <Flat x={(a + b) / 2} z={HALF - 0.4} w={b - a} d={0.18} color="#ffffff" />
          {road.walks.map((side) => (
            <group key={side}>
              <Block size={[b - a, 0.14, 3]} position={[(a + b) / 2, 0.07, side * (HALF + 1.5)]} color={palette.sidewalk} cast={false} />
              <Block size={[b - a, 0.16, 0.25]} position={[(a + b) / 2, 0.08, side * (HALF + 0.1)]} color={palette.curb} cast={false} />
            </group>
          ))}
        </group>
      ))}
      {every(6, 3)
        .filter((x) => !near(x, BOX + 2))
        .map((x) => (
          <Flat key={x} x={x} z={0} w={3} d={0.22} color="#ffffff" />
        ))}
      {every(40, 20)
        .filter((x) => !near(x, 16) && !near(x + 20, 16))
        .map((x) => (
          <group key={x}>
            <Arrow x={x} z={ROAD.lane} dir={1} shape={arrow} />
            <Arrow x={x + 20} z={-ROAD.lane} dir={-1} shape={arrow} />
          </group>
        ))}
      {cross.map((c) => (
        <group key={c}>
          {/* Stop lines where each lane drives into the junction */}
          <Flat x={c - BOX - 0.3} z={ROAD.lane} w={0.4} d={HALF} color="#ffffff" y={0.036} />
          <Flat x={c + BOX + 0.3} z={-ROAD.lane} w={0.4} d={HALF} color="#ffffff" y={0.036} />
          {[-1, 1].map((k) =>
            Array.from({ length: 6 }, (_, i) => <Flat key={`${k}${i}`} x={c + k * (BOX + 2.4)} z={-3.75 + i * 1.5} w={2.6} d={0.7} color="#ffffff" y={0.036} />),
          )}
        </group>
      ))}
      {road.walks.flatMap((side) =>
        every(30, 15)
          .filter((x) => !near(x, BOX + 3))
          .map((x, i) => (
            <group key={`${side}${x}`}>
              <Lamp x={x} side={side} night={night} />
              {i % 2 === 0 && <Tree x={x + 15} z={side * (HALF + 5.5)} s={0.85 + (i % 3) * 0.12} />}
            </group>
          )),
      )}
      {buildings.map((b) => (
        <Neighbour key={`${b.side}${b.x}`} {...b} night={night} />
      ))}
    </group>
  );
}

export function Streets({ roads }: { roads: Road[] }) {
  const night = useWarehouse((s) => s.night);
  return (
    <group>
      {roads.map((r, i) => (
        <RoadView key={r.id} road={r} index={i} night={night} />
      ))}
    </group>
  );
}
