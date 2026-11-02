"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import { doorOf, minutesLeft, serviceLeft, truckProgress } from "@/lib/describe";
import { forkliftStatus, truckStatus } from "@/lib/status";
import { batteryTone, Meter, Panel, StatusPill } from "./panel";

function Row({ title, sub, middle, status, tail, onClick }: { title: string; sub: string; middle: ReactNode; status: ReactNode; tail: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="grid w-full grid-cols-[3.75rem_1fr_auto_4.5rem_1rem] items-center gap-2 rounded-lg px-1.5 py-1.5 text-left enabled:hover:bg-slate-50"
    >
      <span className="leading-tight">
        <span className="block text-xs font-semibold">{title}</span>
        <span className="block text-[10px] text-muted-foreground">{sub}</span>
      </span>
      <span className="truncate text-xs">{middle}</span>
      {status}
      <span className="text-right text-[11px] text-muted-foreground tabular-nums">{tail}</span>
      {onClick ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <span />}
    </button>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col items-end gap-1">
      <Meter value={value} tone="green" className="w-full" />
      {label}
    </span>
  );
}

export function FleetBoard() {
  const live = useActiveSite();
  const select = useWarehouse((s) => s.select);
  const code = live.site.code;
  const truckAt = (doorId: string) => live.trucks.find((t) => t.doorId === doorId && t.status !== "departing" && t.status !== "en-route");
  const docksBusy = live.site.layout.doors.filter((d) => truckAt(d.id)).length;
  const working = live.forklifts.filter((f) => f.status !== "idle" && f.status !== "charging").length;

  return (
    <Panel aria-label="Docks, forklifts and trucks" className="w-full p-2.5 sm:w-[25rem]">
      <Tabs defaultValue="docks">
        <div className="mb-1 flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="docks">Docks {docksBusy}/{live.site.layout.doors.length}</TabsTrigger>
            <TabsTrigger value="forklifts">Forklifts {working}/{live.forklifts.length}</TabsTrigger>
            <TabsTrigger value="trucks">Trucks {live.trucks.length}</TabsTrigger>
          </TabsList>
          <span className="truncate text-xs text-muted-foreground">{live.site.name}</span>
        </div>
        <div className="max-h-44 overflow-y-auto">
          <TabsContent value="docks">
            {live.site.layout.doors.map((door) => {
              const truck = truckAt(door.id);
              const working = truck && (truck.status === "loading" || truck.status === "unloading");
              return (
                <Row
                  key={door.id}
                  title={door.code}
                  sub={door.direction === "in" ? "Inbound" : "Outbound"}
                  middle={truck ? `${truck.id} · ${truck.carrier}` : <span className="text-muted-foreground">No truck assigned</span>}
                  status={truck ? <StatusPill tone={truckStatus[truck.status].tone}>{truckStatus[truck.status].label}</StatusPill> : <StatusPill tone="slate">Available</StatusPill>}
                  tail={working ? <Progress value={truckProgress(truck)} label={`${truck.cargo.done}/${truck.cargo.total}`} /> : truck ? `${minutesLeft(truck)} min` : ""}
                  onClick={truck ? () => select({ kind: "truck", id: truck.id }, true) : undefined}
                />
              );
            })}
          </TabsContent>
          <TabsContent value="forklifts">
            {live.forklifts.map((f) => (
              <Row
                key={f.id}
                title={f.id}
                sub={f.chargerId}
                middle={serviceLeft(f) <= 0 ? <span className="text-amber-700">Service due · {f.task}</span> : f.task}
                status={<StatusPill tone={forkliftStatus[f.status].tone}>{forkliftStatus[f.status].label}</StatusPill>}
                tail={
                  <span className="flex flex-col items-end gap-1">
                    <Meter value={f.battery / 100} tone={batteryTone(f.battery)} className="w-full" />
                    {Math.round(f.battery)}%
                  </span>
                }
                onClick={() => select({ kind: "forklift", id: f.id }, true)}
              />
            ))}
          </TabsContent>
          <TabsContent value="trucks">
            {live.trucks.map((t) => (
              <Row
                key={t.id}
                title={t.id}
                sub={t.carrier.split(" ")[0]}
                middle={`${t.status === "departing" ? "From" : "To"} ${code} · ${doorOf(live, t.doorId)?.code}`}
                status={<StatusPill tone={truckStatus[t.status].tone}>{truckStatus[t.status].label}</StatusPill>}
                tail={t.status === "loading" || t.status === "unloading" ? <Progress value={truckProgress(t)} label={`${t.cargo.done}/${t.cargo.total}`} /> : t.status === "departing" ? "" : `${minutesLeft(t)} min`}
                onClick={() => select({ kind: "truck", id: t.id }, true)}
              />
            ))}
          </TabsContent>
        </div>
      </Tabs>
    </Panel>
  );
}
