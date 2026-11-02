"use client";

import { useState, type ReactNode } from "react";
import { BatteryCharging, Building2, Crosshair, Forklift as ForkliftIcon, MapPinned, Navigation, Package, ScrollText, Truck as TruckIcon, Wrench, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import type { Forklift, LiveSite, Pallet, Truck } from "@/interfaces/warehouse.interface";
import { carried, doorOf, minutesLeft, palletLocation, positionSource, serviceLeft, tagNames, truckLine, truckProgress } from "@/lib/describe";
import { clockAt, fmt, forkliftStatus, palletStatus, siteTypeLabel, truckStatus } from "@/lib/status";
import { ManifestDialog } from "./manifest-dialog";
import { batteryTone, Meter, Panel, StatusPill } from "./panel";

function Header({ icon: Icon, eyebrow, title, subtitle, onLocate, onClose }: { icon: LucideIcon; eyebrow: string; title: string; subtitle: string; onLocate?: () => void; onClose?: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[10px] font-semibold tracking-wider text-primary uppercase">{eyebrow}</p>
        <p className="truncate text-base font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex gap-1">
        {onLocate && (
          <button type="button" onClick={onLocate} aria-label="Locate on map" className="rounded-lg p-1.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground">
            <Crosshair className="size-4" />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close details" className="rounded-lg p-1.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-100">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 py-1.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate text-right text-xs font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusBlock({ pill, line, progress, tone }: { pill: ReactNode; line: string; progress?: number; tone?: "green" | "blue" | "amber" | "red" | "slate" }) {
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-2.5">
      <div className="flex items-center gap-2">
        {pill}
        <span className="truncate text-xs text-muted-foreground">{line}</span>
      </div>
      {progress !== undefined && <Meter value={progress} tone={tone} />}
    </div>
  );
}

function TruckDetail({ live, truck, actions }: { live: LiveSite; truck: Truck; actions: Actions }) {
  const status = truckStatus[truck.status];
  const shipment = live.shipments[truck.shipmentId];
  const door = doorOf(live, truck.doorId);
  const outbound = truck.direction === "outbound";
  const working = truck.status === "loading" || truck.status === "unloading";
  const startedAt = useWarehouse((s) => s.startedAt);
  const appt = live.appointments.find((a) => a.id === truck.appointmentId);
  const eta = working ? `Done in ${minutesLeft(truck)} min` : `${clockAt(startedAt, live.t + minutesLeft(truck) * 60)} (${minutesLeft(truck)} min)`;
  const [manifestOpen, setManifestOpen] = useState(false);
  return (
    <>
      <Header icon={TruckIcon} eyebrow={truck.carrier} title={truck.id} subtitle={`${truck.driver} · ${truck.plate}`} {...actions} />
      <StatusBlock pill={<StatusPill tone={status.tone}>{status.label}</StatusPill>} line={truckLine(live, truck)} progress={truckProgress(truck)} tone={working ? "green" : "blue"} />
      <Rows
        rows={[
          ["Shipment", <span key="s" className="text-primary">#{truck.shipmentId}</span>],
          [outbound ? "Customer" : "Supplier", shipment?.party ?? "Unknown"],
          [outbound ? "Destination" : "Origin", shipment?.place ?? "Unknown"],
          ["ETA", truck.status === "departing" ? "Departed" : eta],
          ["Speed", `${Math.round(truck.speed * 3.6)} km/h`],
          ["Bay", `${door?.code} · ${live.site.code}`],
          ["Cargo", `${truck.cargo.done}/${truck.cargo.total} pallets · ${((truck.cargo.done * truck.cargo.kgPerPallet) / 1000).toFixed(1)} t`],
          ["Slot", appt ? `${clockAt(startedAt, appt.slotAt)}${appt.late ? ", late" : ""}` : "Walk-in"],
          ["GPS", truck.sharing ? "Live from driver link" : "Paused by driver"],
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/driver?truck=${truck.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
          <Navigation className="size-3.5" />
          Driver link
        </Link>
        <Link href={`/track?shipment=${truck.shipmentId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
          <MapPinned className="size-3.5" />
          Tracking page
        </Link>
        {outbound && shipment && (
          <button type="button" onClick={() => setManifestOpen(true)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "col-span-2 gap-1.5")}>
            <ScrollText className="size-3.5" />
            Load manifest · {shipment.manifest.length} pallets
          </button>
        )}
      </div>
      {outbound && shipment && <ManifestDialog truck={truck} shipment={shipment} open={manifestOpen} onOpenChange={setManifestOpen} />}
    </>
  );
}

function ForkliftDetail({ live, forklift, actions }: { live: LiveSite; forklift: Forklift; actions: Actions }) {
  const status = forkliftStatus[forklift.status];
  const load = carried(live, forklift);
  const logService = useWarehouse((s) => s.logService);
  const setTag = useWarehouse((s) => s.setTag);
  const left = serviceLeft(forklift);
  return (
    <>
      <Header icon={ForkliftIcon} eyebrow={`Forklift · ${live.site.code}`} title={forklift.id} subtitle={`${forklift.driver} · ${forklift.model}`} {...actions} />
      <StatusBlock pill={<StatusPill tone={status.tone}>{status.label}</StatusPill>} line={forklift.task} />
      <div className="flex items-center gap-2 px-0.5">
        <BatteryCharging className="size-4 text-muted-foreground" />
        <Meter value={forklift.battery / 100} tone={batteryTone(forklift.battery)} className="flex-1" />
        <span className="w-12 text-right text-xs font-medium tabular-nums">{Math.round(forklift.battery)}%</span>
      </div>
      {left <= 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
          <Wrench className="size-4 shrink-0" />
          <span className="flex-1">Service due, {Math.floor(-left)} h over</span>
          <button
            type="button"
            onClick={() => {
              const err = logService(forklift.id);
              if (err) toast.error(err);
              else toast.success(`${forklift.id} service logged`);
            }}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 bg-white")}
          >
            Log service
          </button>
        </div>
      )}
      <Rows
        rows={[
          ["Carrying", load ? `${load.id} · ${load.item}` : "Empty"],
          ["Moves today", fmt(forklift.movesToday)],
          ["Speed", `${(forklift.speed * 3.6).toFixed(1)} km/h`],
          ["Engine hours", `${fmt(Math.floor(forklift.engineHours))} h`],
          ["Next service", left > 0 ? `In ${Math.ceil(left)} h, at ${fmt(forklift.serviceDueAt)} h` : "Due now"],
          ["Position", positionSource(live, forklift)],
          ["Charger", forklift.chargerId],
          ["Site", live.site.name],
        ]}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Positioning</span>
        <Select items={tagNames} value={forklift.tag ?? "none"} onValueChange={(v) => {
            const err = v && setTag(forklift.id, v === "none" ? null : (v as "uwb" | "ble"));
            if (err) toast.error(err);
          }}>
          <SelectTrigger size="sm" className="w-36 bg-white" aria-label="Positioning tag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(tagNames).map(([v, text]) => (
              <SelectItem key={v} value={v}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function PalletDetail({ live, pallet, actions }: { live: LiveSite; pallet: Pallet; actions: Actions }) {
  const status = palletStatus[pallet.status];
  const startedAt = useWarehouse((s) => s.startedAt);
  return (
    <>
      <Header icon={Package} eyebrow={`Pallet · ${pallet.category}`} title={pallet.item} subtitle={`${pallet.id} · ${pallet.sku}`} {...actions} />
      <StatusBlock pill={<StatusPill tone={status.tone}>{status.label}</StatusPill>} line={palletLocation(live, pallet)} />
      <Rows
        rows={[
          ["Quantity", `${fmt(pallet.qty)} units`],
          ["Gross weight", `${fmt(pallet.weightKg)} kg`],
          ["Location", palletLocation(live, pallet)],
          ["Lot", pallet.lot],
          ["Received", clockAt(startedAt, pallet.receivedAt)],
          ["Site", live.site.name],
        ]}
      />
    </>
  );
}

function MiniStat({ label, value, sub, progress }: { label: string; value: string; sub: string; progress?: number }) {
  return (
    <div className="space-y-1 rounded-xl bg-slate-50 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">
        {value} <span className="text-xs font-normal text-muted-foreground">{sub}</span>
      </p>
      {progress !== undefined && <Meter value={progress} />}
    </div>
  );
}

function SiteDetail({ live }: { live: LiveSite }) {
  const select = useWarehouse((s) => s.select);
  const docked = live.trucks.filter((t) => t.status === "loading" || t.status === "unloading").length;
  const arriving = live.trucks.filter((t) => t.status === "en-route" || t.status === "at-gate" || t.status === "docking").length;
  const staged = live.pallets.filter((p) => p.slotId).length;
  const doors = live.site.layout.doors.length;
  const busy = live.trucks.filter((t) => t.status !== "en-route" && t.status !== "departing").length;
  const working = live.forklifts.filter((f) => f.status !== "idle" && f.status !== "charging");
  return (
    <>
      <Header icon={Building2} eyebrow={`${siteTypeLabel[live.site.type]} · ${live.site.code}`} title={live.site.name} subtitle={live.site.address} />
      <StatusBlock pill={<StatusPill tone="green">Operational</StatusPill>} line={`${docked} docked · ${arriving} arriving · ${staged} staged`} />
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Stock on hand" value={fmt(live.stats.stockOnHand)} sub={`/ ${fmt(live.site.capacityPallets)}`} progress={live.stats.stockOnHand / live.site.capacityPallets} />
        <MiniStat label="Truck bays" value={`${busy}/${doors}`} sub="busy" progress={busy / doors} />
        <MiniStat label="Outbound today" value={`${live.stats.outboundToday}`} sub="trucks" />
        <MiniStat label="Put-aways today" value={`${live.stats.putawaysToday}`} sub="pallets" />
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold">Inventory</p>
        <ul className="divide-y divide-slate-100">
          {live.inventory.map((line) => (
            <li key={line.sku} className="flex items-center gap-2 py-1.5">
              <span className="flex size-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <Package className="size-3.5" />
              </span>
              <span className="flex-1 truncate text-xs">{line.item}</span>
              <span className="text-xs font-medium tabular-nums">{fmt(line.qty)}</span>
              <StatusPill tone={line.qty < line.lowStock ? "amber" : "green"} className="w-[4.75rem] justify-center">
                {line.qty < line.lowStock ? "Low stock" : "In stock"}
              </StatusPill>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 flex justify-between text-xs font-semibold">
          Forklift fleet
          <span className="font-normal text-muted-foreground">
            {working.length}/{live.forklifts.length} working
          </span>
        </p>
        {live.forklifts.slice(0, 3).map((f) => (
          <button key={f.id} type="button" onClick={() => select({ kind: "forklift", id: f.id }, true)} className="flex w-full items-center gap-2 rounded-lg py-1 text-left hover:bg-slate-50">
            <span className="w-11 text-xs font-semibold">{f.id}</span>
            <span className="flex-1 truncate text-xs text-muted-foreground">{f.task}</span>
            <Meter value={f.battery / 100} tone={batteryTone(f.battery)} className="w-12" />
            <span className="w-8 text-right text-[11px] tabular-nums">{Math.round(f.battery)}%</span>
          </button>
        ))}
      </div>
    </>
  );
}

type Actions = { onLocate: () => void; onClose: () => void };

export function DetailPanel() {
  const live = useActiveSite();
  const selection = useWarehouse((s) => s.selection);
  const select = useWarehouse((s) => s.select);
  const actions: Actions = { onLocate: () => select(selection, true), onClose: () => select(null) };

  let body: ReactNode = <SiteDetail live={live} />;
  if (selection?.kind === "truck") {
    const truck = live.trucks.find((t) => t.id === selection.id);
    if (truck) body = <TruckDetail live={live} truck={truck} actions={actions} />;
  } else if (selection?.kind === "forklift") {
    const forklift = live.forklifts.find((f) => f.id === selection.id);
    if (forklift) body = <ForkliftDetail live={live} forklift={forklift} actions={actions} />;
  } else if (selection?.kind === "pallet") {
    const pallet = live.pallets.find((p) => p.id === selection.id);
    if (pallet) body = <PalletDetail live={live} pallet={pallet} actions={actions} />;
  }

  return (
    <Panel aria-label="Details" className="max-h-full w-full space-y-3 overflow-y-auto p-3 sm:w-80">
      {body}
    </Panel>
  );
}
