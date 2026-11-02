"use client";

import { CircleCheck, Clock3, LinkIcon, MapPinned, Navigation, ShieldCheck, Truck as TruckIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Meter, StatusPill } from "@/components/operations/panel";
import { Switch } from "@/components/ui/switch";
import { useWarehouse } from "@/hooks/useWarehouse";
import type { LiveSite, Truck } from "@/interfaces/warehouse.interface";
import { doorOf } from "@/lib/describe";
import { dockedPos, etaSeconds } from "@/lib/simulator";
import { clockAt } from "@/lib/status";
import { RouteMap } from "./route-map";

const minutes = (s: number) => (s < 60 ? "under a minute" : `${Math.round(s / 60)} min`);

/** What the driver should do right now, in one line and one hint. */
function instruction(live: LiveSite, truck: Truck): { icon: LucideIcon; title: string; hint: string } {
  const door = doorOf(live, truck.doorId)?.code ?? "your door";
  switch (truck.status) {
    case "en-route":
      return { icon: Navigation, title: `Head to ${live.site.name}`, hint: `${live.site.address}. Your bay is ${door}.` };
    case "at-gate":
      return { icon: ShieldCheck, title: "Stop at the barrier", hint: "The gatehouse will check you in and open the gate." };
    case "docking": {
      if (!truck.reversing) return { icon: TruckIcon, title: `Drive to ${door}`, hint: "Follow the yellow bay lines, then reverse in." };
      const [x, z] = dockedPos(live.site.layout, doorOf(live, truck.doorId)!);
      return { icon: TruckIcon, title: `Reverse into ${door}`, hint: `${Math.round(Math.hypot(x - truck.pos[0], z - truck.pos[1]))} m to go` };
    }
    case "unloading":
    case "loading":
      return { icon: Clock3, title: "Stay with your truck", hint: `${truck.status === "unloading" ? "Unloading" : "Loading"} ${truck.cargo.done} of ${truck.cargo.total} pallets` };
    default:
      return { icon: CircleCheck, title: "All done, drive safely", hint: "Leave by the exit on the right." };
  }
}

export function DriverView() {
  const id = (useSearchParams().get("truck") ?? "").toUpperCase();
  const siteId = useWarehouse((s) => Object.values(s.sites).find((l) => l.trucks.some((t) => t.id === id))?.site.id ?? null);
  const live = useWarehouse((s) => (siteId ? s.sites[siteId] : null));
  const startedAt = useWarehouse((s) => s.startedAt);
  const setSharing = useWarehouse((s) => s.setSharing);
  const truck = live?.trucks.find((t) => t.id === id);

  if (!live || !truck) {
    return (
      <section className="space-y-2 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-900/5">
        <LinkIcon className="mx-auto size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">This link is no longer active</h1>
        <p className="text-sm text-muted-foreground">Driver links stop working once the delivery is done{id ? ` for ${id}` : ""}.</p>
      </section>
    );
  }

  const step = instruction(live, truck);
  const appt = live.appointments.find((a) => a.id === truck.appointmentId);
  const eta = etaSeconds(live, truck);
  const working = truck.status === "loading" || truck.status === "unloading";
  const late = appt && !working && truck.status !== "departing" && live.t + eta - appt.slotAt > live.rules.lateArrival.seconds;
  const Icon = step.icon;

  return (
    <>
      <section className="space-y-3 rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm" aria-live="polite">
        <Icon className="size-7" />
        <h1 className="text-2xl leading-tight font-semibold">{step.title}</h1>
        <p className="text-sm text-white/85">{step.hint}</p>
        {working && <Meter value={truck.cargo.done / truck.cargo.total} tone="green" className="bg-white/25" />}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-900/5">
          <p className="text-xs text-muted-foreground">{working ? "Done at" : "At your bay"}</p>
          <p className="text-xl font-semibold tabular-nums">{truck.status === "departing" ? "Done" : clockAt(startedAt, live.t + eta)}</p>
          <p className="text-xs text-muted-foreground">{truck.status === "departing" ? "Thank you" : `in ${minutes(eta)}`}</p>
        </div>
        <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-900/5">
          <p className="text-xs text-muted-foreground">Your slot</p>
          <p className="text-xl font-semibold tabular-nums">{appt ? clockAt(startedAt, appt.slotAt) : "Walk-in"}</p>
          <StatusPill tone={late ? "amber" : "green"} className="mt-0.5">
            {late ? "Running late" : "On time"}
          </StatusPill>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-900/5">
        <RouteMap live={live} truck={truck} />
        <p className="px-1 text-xs text-muted-foreground">
          {doorOf(live, truck.doorId)?.code} at {live.site.name} is highlighted.
        </p>
      </section>

      <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
        <div className="flex-1 leading-tight">
          <p className="text-sm font-semibold">Share live location</p>
          <p className="text-xs text-muted-foreground">Only while this delivery is active. The yard uses it for your ETA.</p>
        </div>
        <Switch checked={truck.sharing} onCheckedChange={(on) => setSharing(truck.id, on)} aria-label="Share live location" />
      </section>

      <Link href={`/track?shipment=${truck.shipmentId}`} className="flex items-center gap-2 rounded-2xl bg-white p-4 text-sm font-medium shadow-sm ring-1 ring-slate-900/5 hover:ring-primary/40">
        <MapPinned className="size-4 text-primary" />
        Shipment #{truck.shipmentId}
        <span className="ml-auto text-muted-foreground">Tracking page</span>
      </Link>
    </>
  );
}
