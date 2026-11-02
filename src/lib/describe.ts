import type { Forklift, LiveSite, Pallet, Shipment, Truck } from "@/interfaces/warehouse.interface";
import { DELIVERY_AFTER, etaSeconds } from "@/lib/simulator";

/** Rough seconds per pallet move, used for "n min left" estimates. */
const SECONDS_PER_PALLET = 30;

export const doorOf = (live: LiveSite, doorId: string) => live.site.layout.doors.find((d) => d.id === doorId);
export const slotOf = (live: LiveSite, slotId: string | null) => live.site.layout.slots.find((s) => s.id === slotId);

const pathLength = (truck: Truck) =>
  truck.path.reduce(
    (sum, p, i) => {
      const from = i === 0 ? truck.pos : truck.path[i - 1];
      return sum + Math.hypot(p[0] - from[0], p[1] - from[1]);
    },
    0,
  );

export function truckProgress(truck: Truck) {
  if (truck.status === "loading" || truck.status === "unloading") return truck.cargo.done / truck.cargo.total;
  if (truck.status === "docking") return Math.max(0.05, 1 - pathLength(truck) / 40);
  if (truck.status === "en-route") return Math.max(0.05, 1 - pathLength(truck) / 120);
  return truck.status === "departing" ? 1 : 0.5;
}

export function minutesLeft(truck: Truck) {
  const seconds =
    truck.status === "loading" || truck.status === "unloading"
      ? (truck.cargo.total - truck.cargo.done) * SECONDS_PER_PALLET
      : pathLength(truck) / 6 + truck.cargo.total * SECONDS_PER_PALLET;
  return Math.max(1, Math.ceil(seconds / 60));
}

export function truckLine(live: LiveSite, truck: Truck) {
  const door = doorOf(live, truck.doorId)?.code ?? "";
  const code = live.site.code;
  switch (truck.status) {
    case "en-route":
      return `To ${code} · ${door}`;
    case "at-gate":
      return `Gate check-in · assigned ${door}`;
    case "docking":
      return truck.reversing ? `Reversing into ${door} · ${Math.round(pathLength(truck))} m left` : `Approaching ${door}`;
    case "departing":
      return `Leaving ${code}`;
    default:
      return `${code} · ${door} · ${truck.cargo.done}/${truck.cargo.total} pallets`;
  }
}

export function palletLocation(live: LiveSite, pallet: Pallet) {
  const slot = slotOf(live, pallet.slotId);
  if (slot) return `${live.site.code} · Yard slot ${slot.code}`;
  const holder = live.forklifts.find((f) => f.carrying === pallet.id);
  return holder ? `On ${holder.id}` : `${live.site.code} · Storage`;
}

export const carried = (live: LiveSite, f: Forklift) => live.pallets.find((p) => p.id === f.carrying);

export type StepState = "done" | "active" | "todo";

/**
 * Shipment steps with live times. Done steps keep their stamp; the dock step is
 * "active" while the truck works it; later steps are projected from the truck's ETA.
 */
export function timeline(live: LiveSite, shipment: Shipment) {
  const truck = live.trucks.find((t) => t.shipmentId === shipment.id);
  const dockLabel = shipment.direction === "outbound" ? "Loading" : "Unloading";
  const working = truck?.status === "loading" || truck?.status === "unloading";
  const active = working ? shipment.steps.findIndex((s) => s.label === dockLabel) : shipment.steps.findIndex((s) => s.at === null);
  const delivery = live.deliveries.find((d) => d.shipmentId === shipment.id);
  const remaining = truck ? (truck.cargo.total - truck.cargo.done) * 30 : 0;
  // When the truck reaches its dock (or now, if already there), then when it is done there.
  const atDock = truck && !working && truck.status !== "departing" ? live.t + etaSeconds(live, truck) : live.t;
  const doneAtDock = truck && working ? live.t + etaSeconds(live, truck) : atDock + remaining;

  return shipment.steps.map((s, i) => {
    const state: StepState = i === active ? "active" : s.at !== null ? "done" : "todo";
    if (state === "done" || (state === "active" && s.at !== null && s.label !== dockLabel)) return { label: s.label, state, time: s.at! };
    if (s.label === dockLabel) return { label: s.label, state, time: working ? doneAtDock : atDock };
    if (s.label === "At gate") return { label: s.label, state, time: live.t + (atDock - live.t) * 0.6 };
    if (s.label === "Delivered") return { label: s.label, state, time: delivery?.at ?? doneAtDock + DELIVERY_AFTER };
    return { label: s.label, state, time: i < shipment.steps.findIndex((x) => x.label === dockLabel) ? atDock : doneAtDock };
  });
}
