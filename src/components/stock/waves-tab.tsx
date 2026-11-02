"use client";

import { Check, ListChecks, PackageMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Panel, StatusPill } from "@/components/operations/panel";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveSite, useDenied, useWarehouse } from "@/hooks/useWarehouse";
import type { PickLine, Wave } from "@/interfaces/warehouse.interface";
import { releasable } from "@/lib/simulator";
import { clockAt } from "@/lib/status";
import { cn } from "@/lib/utils";

function ReleaseOrders() {
  const live = useActiveSite();
  const startedAt = useWarehouse((s) => s.startedAt);
  const release = useWarehouse((s) => s.releaseWave);
  const refused = useDenied("release");
  const [chosen, setChosen] = useState<string[]>([]);
  const orders = releasable(live);
  const picked = chosen.filter((id) => orders.some((o) => o.id === id));
  return (
    <Panel className="space-y-3 p-4">
      <div className="leading-tight">
        <h2 className="font-semibold">Orders to release</h2>
        <p className="text-xs text-muted-foreground">Outbound slots not yet at the dock</p>
      </div>
      {orders.length ? (
        <ul className="divide-y divide-slate-100">
          {orders.map((o) => (
            <li key={o.id}>
              <label className="flex items-center gap-3 py-2 text-sm">
                <input type="checkbox" checked={picked.includes(o.id)} onChange={(e) => setChosen(e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))} />
                <span className="flex-1 leading-tight">
                  <span className="block font-medium">{o.id}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.carrier} · slot {clockAt(startedAt, o.slotAt)}
                  </span>
                </span>
                <span className="tabular-nums">{o.pallets} pallets</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">Every open order is in a wave.</p>
      )}
      <button
        type="button"
        disabled={!picked.length || refused !== null}
        title={refused ?? undefined}
        onClick={() => {
          const err = release(picked);
          if (err) return void toast.error(err);
          setChosen([]);
          toast.success("Wave released");
        }}
        className={cn(buttonVariants(), "h-10 w-full gap-2 rounded-xl")}
      >
        <ListChecks className="size-4" />
        Release wave{picked.length ? ` (${picked.length})` : ""}
      </button>
      {refused && <p className="text-xs text-muted-foreground">{refused}.</p>}
    </Panel>
  );
}

function LineRow({ wave, line }: { wave: Wave; line: PickLine }) {
  const confirm = useWarehouse((s) => s.confirmPick);
  const [short, setShort] = useState<string | null>(null);
  const done = (picked: number) => {
    const err = confirm(wave.id, line.id, picked);
    if (err) toast.error(err);
    else setShort(null);
  };
  const status =
    line.picked === null ? null : line.picked < line.pallets ? <StatusPill tone="amber">Short {line.picked}/{line.pallets}</StatusPill> : <StatusPill tone="green">Picked</StatusPill>;
  return (
    <tr className="align-middle">
      <td className="py-2 font-mono text-xs">{line.bin}</td>
      <td className="py-2 leading-tight">
        <span className="block text-sm">{line.item}</span>
        <span className="block text-xs text-muted-foreground">
          {line.appointmentId} · {line.lot ? `${line.lot}${line.expires ? `, exp ${line.expires}` : ""}` : <span className="text-red-600">no stock allocated</span>}
        </span>
      </td>
      <td className="py-2 text-right tabular-nums">{line.pallets}</td>
      <td className="py-2 pl-3 text-right">
        {status ??
          (short !== null ? (
            <form
              className="flex items-center justify-end gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                done(Number(short));
              }}
            >
              <Input type="number" min={0} max={line.pallets - 1} value={short} onChange={(e) => setShort(e.target.value)} className="h-8 w-16 bg-white" aria-label="Pallets picked" autoFocus />
              <button type="submit" className={cn(buttonVariants({ size: "sm" }), "h-8")}>
                Report
              </button>
            </form>
          ) : (
            <span className="flex justify-end gap-1.5">
              {line.lot && (
                <button type="button" onClick={() => done(line.pallets)} className={cn(buttonVariants({ size: "sm" }), "h-8 gap-1")}>
                  <Check className="size-3.5" />
                  Picked
                </button>
              )}
              <button type="button" onClick={() => setShort(String(Math.max(0, line.pallets - 1)))} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1")}>
                <PackageMinus className="size-3.5" />
                Short
              </button>
            </span>
          ))}
      </td>
    </tr>
  );
}

function WaveCard({ wave }: { wave: Wave }) {
  const startedAt = useWarehouse((s) => s.startedAt);
  const done = wave.lines.filter((l) => l.picked !== null).length;
  return (
    <Panel className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="leading-tight">
          <h2 className="font-semibold">{wave.id}</h2>
          <p className="text-xs text-muted-foreground">
            Released {clockAt(startedAt, wave.createdAt)} · {wave.appointmentIds.join(", ")}
          </p>
        </div>
        {done === wave.lines.length ? <StatusPill tone="green">Picked</StatusPill> : <StatusPill tone="blue">Picking {done}/{wave.lines.length}</StatusPill>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-1 font-medium">Bin</th>
            <th className="pb-1 font-medium">Item and lot</th>
            <th className="pb-1 text-right font-medium">Pallets</th>
            <th className="pb-1" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {wave.lines.map((line) => (
            <LineRow key={line.id} wave={wave} line={line} />
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** Supervisors release outbound orders as a wave; pickers work the list in walking order and report shorts. */
export function WavesTab() {
  const waves = useActiveSite().waves;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <ReleaseOrders />
      <div className="space-y-4">
        {waves.length ? (
          waves.map((w) => <WaveCard key={w.id} wave={w} />)
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">No waves yet. Pick orders on the left and release them; the pick list comes out in walking order, allocated FEFO.</p>
        )}
      </div>
    </div>
  );
}
