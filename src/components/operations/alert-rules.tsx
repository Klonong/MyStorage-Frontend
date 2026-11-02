"use client";

import { useState } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import type { AlertRules } from "@/interfaces/warehouse.interface";
import { cn } from "@/lib/utils";

type TimedRule = "gateWait" | "dockDwell" | "lateArrival" | "qcHold";

const timed: { key: TimedRule; label: string; help: string }[] = [
  { key: "gateWait", label: "Truck waiting at the gate", help: "Fires when nobody checks a truck in" },
  { key: "lateArrival", label: "Truck docks after its slot", help: "Grace period after the booked time" },
  { key: "dockDwell", label: "Truck at a dock too long", help: "Counted from the moment it docks" },
  { key: "qcHold", label: "Pallet on QC hold too long", help: "Counted from when it was received" },
];

function RulesForm({ onDone }: { onDone: () => void }) {
  const live = useActiveSite();
  const setRules = useWarehouse((s) => s.setRules);
  const [rules, setDraft] = useState<AlertRules>(live.rules);
  const patch = <K extends keyof AlertRules>(key: K, value: Partial<AlertRules[K]>) => setDraft((r) => ({ ...r, [key]: { ...r[key], ...value } }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setRules(rules);
        toast.success(`Alert rules saved for ${live.site.name}`);
        onDone();
      }}
      className="space-y-4"
    >
      <ul className="divide-y divide-slate-100">
        {timed.map(({ key, label, help }) => (
          <li key={key} className="flex items-center gap-3 py-3">
            <Switch checked={rules[key].on} onCheckedChange={(on) => patch(key, { on })} aria-label={label} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{help}</p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="sr-only">{label}, seconds</span>
              <Input
                type="number"
                min={5}
                max={3600}
                value={rules[key].seconds}
                disabled={!rules[key].on}
                onChange={(e) => patch(key, { seconds: Math.max(5, Number(e.target.value) || 5) })}
                className="h-9 w-20 text-right tabular-nums"
              />
              s
            </label>
          </li>
        ))}
        <li className="flex items-center gap-3 py-3">
          <Switch checked={rules.battery.on} onCheckedChange={(on) => patch("battery", { on })} aria-label="Forklift battery low" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-medium">Forklift battery low</p>
            <p className="text-xs text-muted-foreground">Fires as the battery drops below this</p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only">Battery threshold, percent</span>
            <Input
              type="number"
              min={5}
              max={60}
              value={rules.battery.percent}
              disabled={!rules.battery.on}
              onChange={(e) => patch("battery", { percent: Math.min(60, Math.max(5, Number(e.target.value) || 5)) })}
              className="h-9 w-20 text-right tabular-nums"
            />
            %
          </label>
        </li>
        <li className="flex items-center gap-3 py-3">
          <Switch checked={rules.lowStock.on} onCheckedChange={(on) => patch("lowStock", { on })} aria-label="Low stock" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-medium">Item below its low-stock level</p>
            <p className="text-xs text-muted-foreground">Levels are set per item</p>
          </div>
        </li>
      </ul>
      <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-muted-foreground">Times use the demo clock, where a shift runs in minutes.</p>
      <DialogFooter>
        <button type="button" onClick={onDone} className={cn(buttonVariants({ variant: "outline" }))}>
          Cancel
        </button>
        <button type="submit" className={cn(buttonVariants())}>
          Save rules
        </button>
      </DialogFooter>
    </form>
  );
}

export function AlertRulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const live = useActiveSite();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alert rules</DialogTitle>
          <DialogDescription>When to warn the team at {live.site.name}.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the form starts from the saved rules each time. */}
        {open && <RulesForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
