"use client";

import { Check, PackageSearch } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWarehouse } from "@/hooks/useWarehouse";
import type { Shipment } from "@/interfaces/warehouse.interface";
import { timeline } from "@/lib/describe";
import { clockAt } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Headline per last finished step: what a customer would call it. */
const headline: Record<string, string> = {
  "Order confirmed": "Order confirmed",
  Picked: "Being prepared",
  Loading: "Being loaded",
  "In transit": "On its way to you",
  Delivered: "Delivered",
  Dispatched: "Dispatched by the supplier",
  "At gate": "Arrived at the warehouse",
  Unloading: "Being unloaded",
  Received: "Received into stock",
};

function Lookup({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const id = value.trim().toUpperCase().replace(/^#/, "");
        if (id) router.replace(`${pathname}?shipment=${encodeURIComponent(id)}`);
      }}
    >
      <label htmlFor="shipment" className="sr-only">
        Shipment number
      </label>
      <Input id="shipment" value={value} onChange={(e) => setValue(e.target.value)} placeholder="SHP-78442" className="h-11 bg-white font-mono uppercase" />
      <button type="submit" className={cn(buttonVariants(), "h-11 rounded-lg px-4")}>
        Track
      </button>
    </form>
  );
}

export function TrackView() {
  const id = (useSearchParams().get("shipment") ?? "").toUpperCase().replace(/^#/, "");
  const siteId = useWarehouse((s) => Object.values(s.sites).find((l) => l.shipments[id])?.site.id ?? null);
  const live = useWarehouse((s) => (siteId ? s.sites[siteId] : null));
  const startedAt = useWarehouse((s) => s.startedAt);
  const shipment: Shipment | undefined = live?.shipments[id];

  if (!live || !shipment) {
    return (
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
        <PackageSearch className="size-8 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">{id ? `We can't find shipment ${id}` : "Track a shipment"}</h1>
          <p className="text-sm text-muted-foreground">Enter the number from your order or delivery note.</p>
        </div>
        <Lookup initial={id} />
      </section>
    );
  }

  const steps = timeline(live, shipment);
  const done = steps.filter((s) => s.state === "done");
  const last = done[done.length - 1];
  const next = steps.find((s) => s.state === "active");
  const truck = live.trucks.find((t) => t.shipmentId === shipment.id);
  const working = truck?.status === "loading" || truck?.status === "unloading";
  // While the truck works its dock, that step is what the customer is waiting on.
  const current = working && next ? next : last;
  const outbound = shipment.direction === "outbound";
  const from = outbound ? live.site.name : shipment.place;
  const to = outbound ? shipment.place : live.site.name;

  return (
    <>
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5" aria-live="polite">
        <div>
          <p className="font-mono text-sm text-muted-foreground">#{shipment.id}</p>
          <h1 className="text-2xl leading-tight font-semibold">{current ? headline[current.label] ?? current.label : "Booked"}</h1>
          <p className="text-sm text-muted-foreground">
            {working && next
              ? `Done there about ${clockAt(startedAt, next.time)}`
              : next
                ? `${next.label} expected ${clockAt(startedAt, next.time)}`
                : `Completed ${clockAt(startedAt, last?.time ?? live.t)}`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-muted-foreground">From</dt>
            <dd className="font-medium">{from}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-muted-foreground">To</dt>
            <dd className="font-medium">{to}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-muted-foreground">{outbound ? "Customer" : "Supplier"}</dt>
            <dd className="font-medium">{shipment.party}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-muted-foreground">Carrier</dt>
            <dd className="font-medium">{truck?.carrier ?? "Handed over"}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="timeline" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
        <h2 id="timeline" className="mb-4 font-semibold">
          Timeline
        </h2>
        <ol className="relative space-y-5">
          {steps.map((s, i) => {
            const isDone = s.state === "done";
            const isNext = s.state === "active";
            return (
              <li key={s.label} className="relative flex gap-3">
                {i < shipment.steps.length - 1 && <span aria-hidden className={cn("absolute top-7 left-[13px] h-[calc(100%-4px)] w-0.5", isDone ? "bg-primary" : "bg-slate-200")} />}
                <span
                  className={cn(
                    "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                    isDone && "border-primary bg-primary text-primary-foreground",
                    isNext && "border-primary bg-white ring-4 ring-primary/15",
                    !isDone && !isNext && "border-slate-200 bg-white",
                  )}
                >
                  {isDone && <Check className="size-3.5" />}
                </span>
                <div className="leading-tight">
                  <p className={cn("text-sm font-medium", !isDone && !isNext && "text-muted-foreground")}>{s.label}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {isDone ? clockAt(startedAt, s.time) : `Expected ${clockAt(startedAt, s.time)}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <p className="text-center text-xs text-muted-foreground">Updated {clockAt(startedAt, live.t)}. This page refreshes on its own.</p>
    </>
  );
}
