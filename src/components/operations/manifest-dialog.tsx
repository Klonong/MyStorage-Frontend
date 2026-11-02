"use client";

import { Printer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Shipment, Truck } from "@/interfaces/warehouse.interface";
import { fmt } from "@/lib/status";
import { cn } from "@/lib/utils";

/** The load manifest an outbound truck is dispatched with: one row per pallet loaded. */
export function ManifestDialog({ truck, shipment, open, onOpenChange }: { truck: Truck; shipment: Shipment; open: boolean; onOpenChange: (open: boolean) => void }) {
  const kg = shipment.manifest.reduce((sum, m) => sum + m.kg, 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load manifest · #{shipment.id}</DialogTitle>
          <DialogDescription>
            {truck.id} ({truck.plate}), {truck.carrier} · to {shipment.party}, {shipment.place}
          </DialogDescription>
        </DialogHeader>
        {shipment.manifest.length ? (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 font-medium">Pallet</th>
                  <th className="pb-1 font-medium">Item</th>
                  <th className="pb-1 font-medium">Lot</th>
                  <th className="pb-1 text-right font-medium">Units</th>
                  <th className="pb-1 text-right font-medium">kg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipment.manifest.map((m) => (
                  <tr key={m.palletId}>
                    <td className="py-1.5 font-mono text-xs">{m.palletId}</td>
                    <td className="py-1.5">
                      {m.item} <span className="text-xs text-muted-foreground">{m.sku}</span>
                    </td>
                    <td className="py-1.5 font-mono text-xs">{m.lot}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(m.units)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(m.kg)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="pt-2" colSpan={3}>
                    {shipment.manifest.length} of {truck.cargo.total} pallets loaded
                  </td>
                  <td />
                  <td className="pt-2 text-right tabular-nums">{fmt(kg)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">Nothing loaded yet. Rows appear as each pallet is scanned onto the truck.</p>
        )}
        <DialogFooter>
          <button type="button" onClick={() => window.print()} className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
            <Printer className="size-4" />
            Print
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
