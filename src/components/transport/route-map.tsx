"use client";

import type { LiveSite, Truck } from "@/interfaces/warehouse.interface";
import { plannedRoute } from "@/lib/simulator";

/** Top-down sketch of the site with the truck and its remaining route, drawn from live data. */
export function RouteMap({ live, truck }: { live: LiveSite; truck: Truck }) {
  const { building, doors, roadZ, gateX } = live.site.layout;
  const route = plannedRoute(live.site.layout, truck);
  const target = doors.find((d) => d.id === truck.doorId);
  const minX = Math.min(gateX - 14, truck.pos[0] - 12);
  const maxX = building.width / 2 + 18;
  const minZ = -building.depth / 2 - 6;
  const maxZ = roadZ + 9;
  const font = Math.max(2.2, (maxX - minX) / 55);

  return (
    <svg
      viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}
      className="h-auto w-full rounded-xl bg-[#eef1f8]"
      role="img"
      aria-label={`Map: ${truck.id} and its route to ${target?.code ?? "its door"}`}
    >
      <rect x={minX} y={roadZ - 5} width={maxX - minX} height={10} fill="#d5dae5" />
      <line x1={minX} x2={maxX} y1={roadZ} y2={roadZ} stroke="#ffffff" strokeWidth={0.35} strokeDasharray="3 3" />
      <rect x={-building.width / 2} y={-building.depth / 2} width={building.width} height={building.depth} rx={0.8} fill="#3d79ea" />
      {doors.map((d) => (
        <g key={d.id}>
          <rect x={d.x - 1.7} y={building.depth / 2 - 0.7} width={3.4} height={1.4} rx={0.3} fill={d.id === truck.doorId ? "#f59e0b" : "#ffffff"} />
          <text x={d.x} y={building.depth / 2 + font * 1.6} fontSize={font} textAnchor="middle" fill="#1e293b" fontWeight={d.id === truck.doorId ? 700 : 500}>
            {d.code}
          </text>
        </g>
      ))}
      <rect x={gateX - 1} y={roadZ - 6.5} width={2} height={2} rx={0.4} fill="#1e40af" />
      <text x={gateX} y={roadZ - 7.5} fontSize={font} textAnchor="middle" fill="#1e293b" fontWeight={600}>
        Gate
      </text>
      {route.length > 1 && (
        <polyline
          points={route.map(([x, z]) => `${x},${z}`).join(" ")}
          fill="none"
          stroke="#2563eb"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2.4 1.6"
        />
      )}
      <g>
        {truck.sharing && (
          <circle
            cx={truck.pos[0]}
            cy={truck.pos[1]}
            r={3.2}
            fill="#2563eb"
            opacity={0.25}
            className="motion-safe:animate-ping"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )}
        <circle cx={truck.pos[0]} cy={truck.pos[1]} r={1.9} fill={truck.sharing ? "#2563eb" : "#94a3b8"} stroke="#ffffff" strokeWidth={0.7} />
      </g>
    </svg>
  );
}
