"use client";

import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronRight, ClipboardCheck, PackageSearch, Warehouse, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import type { LiveSite } from "@/interfaces/warehouse.interface";
import { doorOf, slotOf } from "@/lib/describe";
import { openCapacity } from "@/lib/simulator";
import { clockAt } from "@/lib/status";
import { flows, openWork, type FlowId } from "./flows";
import { ScannerShell } from "./scanner-shell";

const order: FlowId[] = ["receive", "putaway", "pick", "load", "count"];
const pallets = (n: number) => `${n} pallet${n === 1 ? "" : "s"}`;

interface Task {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  note: string;
}

/** What needs a person right now, most urgent first: docked trucks, then the yard, then picks. */
function openTasks(live: LiveSite): Task[] {
  const door = (id: string) => doorOf(live, id)?.code ?? "";
  return [
    ...live.trucks
      .filter((t) => (t.status === "unloading" || t.status === "loading") && openCapacity(live, t) > 0)
      .map((t) =>
        t.status === "unloading"
          ? { key: t.id, href: "/scanner/receive", icon: ArrowDownToLine, title: `Receive ${t.id}`, note: `${door(t.doorId)} · ${pallets(openCapacity(live, t))} to count` }
          : { key: t.id, href: "/scanner/load", icon: ArrowUpFromLine, title: `Load ${t.id}`, note: `${door(t.doorId)} · ${t.cargo.done}/${t.cargo.total} loaded` },
      ),
    ...live.pallets
      .filter((p) => p.slotId && p.status === "received")
      .map((p) => ({ key: p.id, href: "/scanner/putaway", icon: Warehouse, title: `Put away ${p.id}`, note: `${p.item} · slot ${slotOf(live, p.slotId)?.code}` })),
    ...live.counts
      .filter((c) => c.status === "open")
      .map((c) => ({ key: c.id, href: "/scanner/count", icon: ClipboardCheck, title: `Count ${c.id}`, note: `${c.lines.filter((l) => l.counted === null).length} bins left${c.blind ? ", blind" : ""}` })),
    ...live.trucks
      .filter((t) => t.direction === "outbound" && (t.status === "en-route" || t.status === "at-gate" || t.status === "docking"))
      .map((t) => ({ key: `pick-${t.id}`, href: "/scanner/pick", icon: PackageSearch, title: `Pick #${t.shipmentId}`, note: `${t.id} arriving at ${door(t.doorId)} · ${pallets(t.cargo.total - t.cargo.done)}` })),
  ];
}

export function ScannerHome() {
  const live = useActiveSite();
  const startedAt = useWarehouse((s) => s.startedAt);
  const scanLog = useWarehouse((s) => s.scanLog);
  const work = openWork(live);
  const tasks = openTasks(live);
  const recent = scanLog.filter((e) => e.siteId === live.site.id).slice(0, 5);

  return (
    <ScannerShell title="Scanner" sub={live.site.name}>
      <section className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-900/5">
        <Avatar className="size-11">
          <AvatarFallback className="bg-primary/10 font-semibold text-primary">RP</AvatarFallback>
        </Avatar>
        <div className="leading-tight">
          <p className="font-semibold">Rina Putri</p>
          <p className="text-sm text-muted-foreground">Dock crew · {live.site.code}</p>
        </div>
      </section>

      <section aria-label="Scan flows" className="grid grid-cols-2 gap-3">
        {order.map((id) => {
          const { title, blurb, icon: Icon } = flows[id];
          return (
            <Link
              key={id}
              href={`/scanner/${id}`}
              aria-label={`${title}, ${work[id]} open`}
              className="flex min-h-32 flex-col last:odd:col-span-2 justify-between gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-900/5 hover:ring-primary/40 active:scale-[0.98]"
            >
              <span className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="text-2xl font-semibold tabular-nums">{work[id]}</span>
              </span>
              <span>
                <span className="block text-base font-semibold">{title}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{blurb}</span>
              </span>
            </Link>
          );
        })}
      </section>

      <section aria-label="Open tasks">
        <h2 className="mb-2 flex justify-between px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Open tasks <span>{tasks.length}</span>
        </h2>
        {tasks.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-muted-foreground ring-1 ring-slate-900/5">All clear at {live.site.code}.</p>}
        <ul className="space-y-2">
          {tasks.slice(0, 6).map((task) => (
            <li key={task.key}>
              <Link href={task.href} className="flex min-h-14 items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-slate-900/5 hover:ring-primary/40">
                <task.icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{task.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{task.note}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {recent.length > 0 && (
        <section aria-label="Recent scans">
          <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent scans</h2>
          <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-900/5">
            {recent.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5 px-3.5 py-2.5 text-sm">
                {e.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
                <span className="flex-1">{e.message}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{clockAt(startedAt, e.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ScannerShell>
  );
}
