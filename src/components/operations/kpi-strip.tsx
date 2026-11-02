"use client";

import { ArrowDown, ArrowUp, Boxes, Clock3, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useActiveSite } from "@/hooks/useWarehouse";
import { fmt } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

function Kpi({ icon: Icon, label, value, delta, unit = "", note }: { icon: LucideIcon; label: string; value: string; delta: number; unit?: string; note: string }) {
  const up = delta >= 0;
  return (
    <Panel className="flex min-w-40 items-center gap-3 px-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="leading-tight">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-xl font-semibold tabular-nums">{value}</span>
          <span className={cn("inline-flex items-center text-xs font-medium tabular-nums", up ? "text-emerald-600" : "text-red-600")}>
            {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {Math.abs(delta)}
            {unit}
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground">{note}</p>
      </div>
    </Panel>
  );
}

export function KpiStrip() {
  const live = useActiveSite();
  const code = live.site.code;
  const onSite = live.trucks.filter((t) => t.status !== "en-route" && t.status !== "departing").length;
  const inbound = live.trucks.filter((t) => t.status === "en-route").length;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:gap-3">
      <Kpi icon={Boxes} label="Stock on hand" value={fmt(live.stats.stockOnHand)} delta={live.stats.stockDelta} note={`pallets · ${code}`} />
      <Kpi icon={Truck} label="Trucks on site" value={`${onSite}`} delta={inbound} note={`${inbound} inbound · ${code}`} />
      <Kpi icon={Clock3} label="On-time delivery" value={`${live.stats.onTimePct.toFixed(1)}%`} delta={0.4} unit="%" note={`last 30 days · ${code}`} />
    </div>
  );
}
