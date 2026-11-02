"use client";

import { Panel, StatusPill } from "@/components/operations/panel";
import { simData, useActiveSite } from "@/hooks/useWarehouse";
import { binFor, fefo, LOT_BASE } from "@/lib/simulator";
import { fmt } from "@/lib/status";

/** Months from the simulator's lot calendar day to the expiry date. */
const monthsLeft = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const base = new Date(LOT_BASE);
  return (d.getUTCFullYear() - base.getUTCFullYear()) * 12 + d.getUTCMonth() - base.getUTCMonth();
};

/** Stock by lot, in the order it ships: earliest expiry first, then earliest received. */
export function LotsTab() {
  const live = useActiveSite();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {live.inventory.map((line) => {
        const per = simData.catalog.find((c) => c.sku === line.sku)?.qtyPerPallet ?? 1;
        const lots = fefo(line.lots);
        return (
          <Panel key={line.sku} className="space-y-3 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="leading-tight">
                <h2 className="font-semibold">{line.item}</h2>
                <p className="text-xs text-muted-foreground">
                  {line.sku} · {lots.some((l) => l.expires) ? "ships FEFO, then FIFO" : "no expiry, ships FIFO"}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{fmt(line.qty)} units</span>
            </div>
            {lots.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1 font-medium">Lot</th>
                    <th className="pb-1 font-medium">Bin</th>
                    <th className="pb-1 font-medium">Expires</th>
                    <th className="pb-1 text-right font-medium">Units</th>
                    <th className="pb-1 text-right font-medium">Pallets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lots.map((lot, i) => {
                    const left = lot.expires ? monthsLeft(lot.expires) : null;
                    return (
                      <tr key={lot.lot}>
                        <td className="py-1.5 font-mono text-xs">
                          {lot.lot} {i === 0 && <StatusPill tone="blue">Ships next</StatusPill>}
                        </td>
                        <td className="py-1.5 font-mono text-xs">{binFor(live.site.layout, line.category, lot.lot)}</td>
                        <td className="py-1.5 text-xs">
                          {lot.expires ? (
                            <span className={left !== null && left <= 6 ? "font-medium text-amber-700" : undefined}>
                              {lot.expires} · {left} mo
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No expiry</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{fmt(lot.qty)}</td>
                        <td className="py-1.5 text-right tabular-nums">{Math.floor(lot.qty / per)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">Out of stock.</p>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
