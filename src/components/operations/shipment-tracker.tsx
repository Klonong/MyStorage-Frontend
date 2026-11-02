"use client";

import { Check, ClipboardCheck, PackageCheck, PackageOpen, Truck as TruckIcon, Warehouse } from "lucide-react";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import { doorOf, minutesLeft, timeline } from "@/lib/describe";
import { clockAt, truckStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Panel, StatusPill } from "./panel";

const stepIcons = [ClipboardCheck, PackageCheck, PackageOpen, TruckIcon, Warehouse];

export function ShipmentTracker() {
  const live = useActiveSite();
  const startedAt = useWarehouse((s) => s.startedAt);
  const selection = useWarehouse((s) => s.selection);
  const select = useWarehouse((s) => s.select);

  // The selected truck, else the busiest one on site.
  const truck =
    live.trucks.find((t) => selection?.kind === "truck" && t.id === selection.id) ??
    live.trucks.find((t) => t.status === "loading" || t.status === "unloading") ??
    live.trucks.find((t) => t.status !== "departing");
  const shipment = truck && live.shipments[truck.shipmentId];
  if (!truck || !shipment) return null;

  const status = truckStatus[truck.status];
  const door = doorOf(live, truck.doorId);
  const outbound = shipment.direction === "outbound";

  return (
    <Panel aria-label="Shipment tracking" className="flex w-full max-w-2xl flex-col gap-3 p-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <TruckIcon className="size-4 text-primary" />
            Shipment Tracking
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {truck.id} · {truck.carrier}
          </p>
        </div>
        <ol className="grid grid-cols-5">
          {timeline(live, shipment).map((step, i) => {
            const Icon = stepIcons[i];
            const done = step.state === "done";
            const active = step.state === "active";
            const label =
              active && (step.label === "Loading" || step.label === "Unloading")
                ? `${step.label} ${truck.cargo.done}/${truck.cargo.total}`
                : step.label;
            return (
              <li key={step.label} className="relative flex flex-col items-center text-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn("absolute top-4 right-1/2 -z-0 h-0.5 w-full -translate-y-1/2", done || active ? "bg-primary" : "bg-slate-200")}
                  />
                )}
                <span
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-full border-2",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-white text-primary ring-4 ring-primary/15",
                    !done && !active && "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span className={cn("mt-1.5 text-[11px] font-medium leading-tight", !done && !active && "text-muted-foreground")}>{label}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {done ? clockAt(startedAt, step.time) : `ETA ${clockAt(startedAt, step.time)}`}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <button
        type="button"
        onClick={() => select({ kind: "truck", id: truck.id }, true)}
        className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 text-left hover:bg-slate-100 md:w-56"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
          <TruckIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5 leading-tight">
          <span className="block text-sm font-semibold">#{shipment.id}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {outbound ? "To" : "From"}: {shipment.place}
          </span>
          <span className="flex items-center gap-1.5">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {live.site.code} · {door?.code} · {minutesLeft(truck)} min left
          </span>
        </span>
      </button>
    </Panel>
  );
}
