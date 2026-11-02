// The town every site sits in: a loop of roads (two east-west streets, two north-south avenues)
// with each site fronting a different road and facing a different way. Sites keep their own local
// coordinates (the simulator never sees world positions); the map places and turns each site's group.
import { siteSeeds } from "@/data/sites";
import type { Vec2 } from "@/interfaces/warehouse.interface";
import { padBounds } from "./heat";
import { buildLayout } from "./simulator";

/** Road width and lane offset from the centre line, in metres. */
export const ROAD = { width: 10, lane: 2.5 };

/**
 * A straight road. In its own frame it runs along +x from `from` to `to`, centred on z = 0.
 * Lane +1 sits at z = +lane and drives toward `to` (traffic keeps right); lane -1 drives back.
 */
export interface Road {
  id: string;
  /** World axis the road runs along, and its fixed coordinate on the other axis. */
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  /** Road-frame sides (+1 / -1) with a sidewalk, lamps and buildings; the side a site fronts has none. */
  walks: (1 | -1)[];
}

export const roads: Road[] = [
  { id: "main", axis: "x", at: 0, from: -700, to: 560, walks: [1] },
  { id: "east", axis: "z", at: 240, from: -660, to: 260, walks: [1] },
  { id: "north", axis: "x", at: -440, from: -700, to: 560, walks: [-1] },
  { id: "west", axis: "z", at: -500, from: -660, to: 260, walks: [-1, 1] },
];

/** Which road each site fronts, where along it (road frame x), and on which side of it. */
const frontage: Record<string, { road: string; along: number; side: 1 | -1 }> = {
  "wh-01": { road: "main", along: 0, side: -1 },
  "wh-02": { road: "east", along: -210, side: -1 },
  "wh-04": { road: "north", along: -200, side: 1 },
};

/** Rotates a ground vector by `rot` radians about the vertical axis (three.js y-rotation). */
export const turn = ([x, z]: Vec2, rot: number): Vec2 => [x * Math.cos(rot) + z * Math.sin(rot), -x * Math.sin(rot) + z * Math.cos(rot)];

/** Road frame → world: east-west roads are unturned, north-south roads are turned so their +x runs south. */
export const roadRot = (r: Road) => (r.axis === "x" ? 0 : -Math.PI / 2);
export const roadToWorld = (r: Road, [x, z]: Vec2): Vec2 => {
  const [wx, wz] = turn([x, z], roadRot(r));
  return r.axis === "x" ? [wx, wz + r.at] : [wx + r.at, wz];
};

function place() {
  const placement: Record<string, { pos: Vec2; rot: number }> = {};
  siteSeeds.forEach((seed, i) => {
    const f = frontage[seed.id] ?? { road: "main", along: i * 260, side: -1 as const };
    const road = roads.find((r) => r.id === f.road)!;
    const layout = buildLayout(seed);
    // A site's own street runs along its local +x at z = roadZ, and the site lies toward local -z.
    // Turn it so that "away from the street" points to the road side it occupies.
    const rot = roadRot(road) + (f.side === -1 ? 0 : Math.PI);
    const [rx, rz] = roadToWorld(road, [f.along, 0]);
    const [dx, dz] = turn([0, layout.roadZ], rot);
    placement[seed.id] = { pos: [rx - dx, rz - dz], rot };
  });
  return placement;
}

/** Site id → its origin on the map and its turn about the vertical axis. */
export const sitePlacement = place();

/** A point in a site's local frame, on the map. */
export const toWorld = (siteId: string, v: Vec2): Vec2 => {
  const p = sitePlacement[siteId] ?? { pos: [0, 0], rot: 0 };
  const [x, z] = turn(v, p.rot);
  return [x + p.pos[0], z + p.pos[1]];
};

/** Each site's fenced pad as a world box, for keeping scenery off it. */
export const siteBoxes = siteSeeds.map((seed) => {
  const l = buildLayout(seed);
  const { x0, x1, z0 } = padBounds(l);
  const corners = [toWorld(seed.id, [x0, z0]), toWorld(seed.id, [x1, z0]), toWorld(seed.id, [x0, l.roadZ - 5]), toWorld(seed.id, [x1, l.roadZ - 5])];
  return {
    x0: Math.min(...corners.map((c) => c[0])),
    x1: Math.max(...corners.map((c) => c[0])),
    z0: Math.min(...corners.map((c) => c[1])),
    z1: Math.max(...corners.map((c) => c[1])),
  };
});

/** Where each road is crossed by another, in that road's own frame (x along it). */
export const crossingsOn = (r: Road) =>
  roads.filter((o) => o.axis !== r.axis && r.at >= Math.min(o.from, o.to) && r.at <= Math.max(o.from, o.to) && o.at > r.from && o.at < r.to).map((o) => o.at);

/** True when a world box clears every site pad and every road (with a margin). */
export function clear(b: { x0: number; x1: number; z0: number; z1: number }, margin = 6) {
  const hit = (o: { x0: number; x1: number; z0: number; z1: number }) => b.x0 < o.x1 + margin && o.x0 - margin < b.x1 && b.z0 < o.z1 + margin && o.z0 - margin < b.z1;
  if (siteBoxes.some(hit)) return false;
  return !roads.some((r) => {
    const half = ROAD.width / 2;
    const box = r.axis === "x" ? { x0: r.from, x1: r.to, z0: r.at - half, z1: r.at + half } : { x0: r.at - half, x1: r.at + half, z0: r.from, z1: r.to };
    return hit(box);
  });
}

/** The ground that covers the whole town. */
export const town = { x0: -760, x1: 620, z0: -720, z1: 320 };
