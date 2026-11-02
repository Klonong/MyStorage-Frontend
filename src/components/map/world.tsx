"use client";

// The town every site shares: one ground plane, the loop of roads, parkland in the open blocks,
// and a clickable name tag over each site.
import { useMemo } from "react";
import { useWarehouse } from "@/hooks/useWarehouse";
import { clear, roads, toWorld, town } from "@/lib/world";
import { Block, Label, palette } from "./primitives";
import { Streets } from "./streets";

function Flat({ x, z, w, d, color, y = 0.02 }: { x: number; z: number; w: number; d: number; color: string; y?: number }) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
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

function SiteTag({ siteId }: { siteId: string }) {
  const site = useWarehouse((s) => s.sites[siteId].site);
  const active = useWarehouse((s) => s.activeSiteId === siteId);
  const setActiveSite = useWarehouse((s) => s.setActiveSite);
  const [x, z] = toWorld(siteId, [0, 0]);
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        setActiveSite(siteId);
      }}
    >
      <Label position={[x, site.layout.building.height + 9, z]} text={`${site.code} · ${site.name}`} dot={active ? palette.accent : "#94a3b8"} />
    </group>
  );
}

/** Lawns with tree clumps scattered over open land, kept off the sites and the roads. */
function Parks() {
  const parks = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number }[] = [];
    for (let i = 0; i < 60; i++) {
      // Deterministic scatter over the town.
      const x = town.x0 + 40 + ((i * 197) % (town.x1 - town.x0 - 80));
      const z = town.z0 + 40 + ((i * 131) % (town.z1 - town.z0 - 80));
      const w = 24 + ((i * 13) % 30);
      const d = 20 + ((i * 17) % 26);
      const box = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
      if (clear(box, 30) && out.every((p) => Math.abs(p.x - x) > (p.w + w) / 2 + 6 || Math.abs(p.z - z) > (p.d + d) / 2 + 6)) out.push({ x, z, w, d });
    }
    return out;
  }, []);
  return (
    <group>
      {parks.map((p, i) => (
        <group key={i}>
          <Flat x={p.x} z={p.z} w={p.w} d={p.d} color="#d9efdc" y={0.012} />
          {Array.from({ length: 4 + (i % 3) }, (_, k) => (
            <Tree key={k} x={p.x - p.w / 2 + 4 + ((k * 11 + i * 3) % (p.w - 8))} z={p.z - p.d / 2 + 4 + ((k * 7 + i * 5) % (p.d - 8))} s={0.9 + (k % 3) * 0.15} />
          ))}
        </group>
      ))}
    </group>
  );
}

export function World({ siteIds }: { siteIds: string[] }) {
  return (
    <group>
      <Flat x={(town.x0 + town.x1) / 2} z={(town.z0 + town.z1) / 2} w={town.x1 - town.x0 + 400} d={town.z1 - town.z0 + 400} color={palette.ground} y={0} />
      <Streets roads={roads} />
      <Parks />
      {siteIds.map((id) => (
        <SiteTag key={id} siteId={id} />
      ))}
    </group>
  );
}
