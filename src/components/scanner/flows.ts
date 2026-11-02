import { ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardCheck, ClipboardList, MapPin, Package, PackageSearch, Tag, Truck, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { simData } from "@/hooks/useWarehouse";
import type { LiveSite, Pallet } from "@/interfaces/warehouse.interface";
import { doorOf, slotOf } from "@/lib/describe";
import { binFor, nextLabel, openCapacity, orderLine, slotTaken, type ScanAction } from "@/lib/simulator";
import { truckStatus } from "@/lib/status";

export type FlowId = "receive" | "putaway" | "pick" | "load" | "count";
/** Resolved ids per step key: truck, order, label, pallet, slot, bin. */
export type Values = Record<string, string>;
export interface Count {
  qty: number;
  qcHold: boolean;
  approved: boolean;
}
export interface Option {
  code: string;
  title: string;
  note?: string;
}
/** `extra` pins facts seen at scan time (e.g. the SKU) so a later state change can't swap them. */
type Resolved = { value: string; extra?: Values } | { error: string };

export interface ScanStep {
  kind: "scan";
  key: string;
  icon: LucideIcon;
  prompt: (live: LiveSite, v: Values) => string;
  hint: (live: LiveSite, v: Values) => string;
  options: (live: LiveSite, v: Values) => Option[];
  resolve: (live: LiveSite, code: string, v: Values) => Resolved;
}
export interface CountStep {
  kind: "count";
  key: "count";
}
/** Units counted in a bin, for cycle counts. */
export interface QtyStep {
  kind: "qty";
  key: "qty";
}
export interface FlowDef {
  title: string;
  icon: LucideIcon;
  blurb: string;
  steps: (ScanStep | CountStep | QtyStep)[];
  review: (live: LiveSite, v: Values, c: Count) => [string, string][];
  action: (v: Values, c: Count) => ScanAction;
  /** Step values kept for "scan next" (same truck or order). */
  keep: string[];
}

/** Over or under the ASN by more than this needs a supervisor (PRD business rule 3). */
export const VARIANCE = 0.05;

export const norm = (code: string) => code.trim().toUpperCase().replace(/^#/, "").replace(/\s+/g, "");
export const truckOf = (live: LiveSite, id: string | undefined) => live.trucks.find((t) => t.id === id);
const itemOf = (sku: string | undefined) => simData.catalog.find((c) => c.sku === sku);
export const countOf = (live: LiveSite, id: string | undefined) => live.counts.find((c) => c.id === id);
const findTruck = (live: LiveSite, code: string) =>
  live.trucks.find((t) => t.id === code || t.shipmentId === code || t.plate.replace(/-/g, "") === code.replace(/-/g, ""));
const findSlot = (live: LiveSite, code: string) => {
  const m = code.match(/S\d{2}$/);
  return m ? live.site.layout.slots.find((s) => s.code === m[0]) : undefined;
};
const forkliftOn = (live: LiveSite, p: Pallet) => live.forklifts.find((f) => f.trip?.slotId === p.slotId);
const statusWord = (status: keyof typeof truckStatus) => truckStatus[status].label.toLowerCase();

/** Pallets a person may take from the yard; QC holds and forklift-claimed ones are off limits. */
const yardPallets = (live: LiveSite, statuses: Pallet["status"][]) =>
  live.pallets.filter((p) => p.slotId && statuses.includes(p.status) && !forkliftOn(live, p));

function checkYardPallet(live: LiveSite, code: string, statuses: Pallet["status"][]): Resolved {
  const p = live.pallets.find((x) => x.id === code);
  if (!p) return { error: `${code} is not on this site` };
  if (!p.slotId) return { error: `${p.id} is on a forklift right now` };
  if (p.status === "qc-hold") return { error: `${p.id} is on QC hold. Wait for inspection.` };
  if (!statuses.includes(p.status)) return { error: `${p.id} is ${p.status === "staged" ? "staged for an outbound truck" : "not ready yet"}` };
  const f = forkliftOn(live, p);
  if (f) return { error: `${f.id} is already moving ${p.id}` };
  return { value: p.id };
}

const slotStep = (prompt: string): ScanStep => ({
  kind: "scan",
  key: "slot",
  icon: MapPin,
  prompt: () => prompt,
  hint: () => "Scan the slot label on the floor",
  options: (live) =>
    live.site.layout.slots
      .filter((s) => !slotTaken(live, s.id))
      .slice(0, 4)
      .map((s) => ({ code: s.code, title: `Slot ${s.code}`, note: "Free · staging lane" })),
  resolve: (live, code) => {
    const slot = findSlot(live, code);
    if (!slot) return { error: `${code} is not a slot at ${live.site.code}` };
    if (slotTaken(live, slot.id)) return { error: `Slot ${slot.code} is taken. Pick a free one.` };
    return { value: slot.id };
  },
});

const labelStep: ScanStep = {
  kind: "scan",
  key: "label",
  icon: Tag,
  prompt: () => "Label the pallet",
  hint: (live) => `Stick label ${nextLabel(live)} on the pallet, then scan it`,
  options: (live) => [{ code: nextLabel(live), title: nextLabel(live), note: "Next label on the roll" }],
  resolve: (live, code) => (code === nextLabel(live) ? { value: code } : { error: `Expected label ${nextLabel(live)}` }),
};

function truckStep(want: "unloading" | "loading"): ScanStep {
  return {
    kind: "scan",
    key: "truck",
    icon: Truck,
    prompt: () => "Scan the truck",
    hint: () => "Trailer label, plate or truck ID",
    options: (live) =>
      live.trucks
        .filter((t) => t.status === want && openCapacity(live, t) > 0)
        .map((t) => ({
          code: t.id,
          title: `${t.id} · ${doorOf(live, t.doorId)?.code}`,
          note: `${t.cargo.done}/${t.cargo.total} ${want === "unloading" ? "received" : "loaded"} · ${t.carrier}`,
        })),
    resolve: (live, code) => {
      const t = findTruck(live, code);
      if (!t) return { error: `${code} is not on site` };
      if (t.status !== want) return { error: `${t.id} is ${statusWord(t.status)}, not ${want}` };
      if (openCapacity(live, t) < 1) return { error: `Forklifts already have every pallet on ${t.id}` };
      return { value: t.id };
    },
  };
}

/** Cycle count: one bin at a time; blind counts hide the system figure. */
const countFlow: FlowDef = {
  title: "Count",
  icon: ClipboardCheck,
  blurb: "Count bins for a cycle count",
  steps: [
    {
      kind: "scan",
      key: "task",
      icon: ClipboardList,
      prompt: () => "Scan the count sheet",
      hint: () => "Count number, like CC-1103",
      options: (live) =>
        live.counts
          .filter((c) => c.status === "open")
          .map((c) => ({ code: c.id, title: c.id, note: `${c.lines.filter((l) => l.counted === null).length} bins left${c.blind ? ", blind" : ""}` })),
      resolve: (live, code) => {
        const c = countOf(live, code);
        if (!c) return { error: `No count ${code} at ${live.site.code}` };
        if (c.status !== "open") return { error: `${c.id} is already finished` };
        return { value: c.id };
      },
    },
    {
      kind: "scan",
      key: "bin",
      icon: Boxes,
      prompt: () => "Scan the bin",
      hint: () => "Bin label on the rack",
      options: (live, v) =>
        countOf(live, v.task)
          ?.lines.filter((l) => l.counted === null)
          .slice(0, 5)
          .map((l) => ({ code: l.bin, title: `Bin ${l.bin}`, note: l.item })) ?? [],
      resolve: (live, code, v) => {
        const c = countOf(live, v.task);
        if (!c) return { error: "This count is gone. Start over." };
        const line = c.lines.find((l) => l.bin === code);
        if (!line) return { error: `${code} is not on ${c.id}` };
        if (line.counted !== null) return { error: `${code} is already counted` };
        return { value: code };
      },
    },
    { kind: "qty", key: "qty" },
  ],
  review: (live, v) => {
    const c = countOf(live, v.task);
    const line = c?.lines.find((l) => l.bin === v.bin);
    const rows: [string, string][] = [
      ["Count", v.task],
      ["Bin", v.bin],
      ["Item", line?.item ?? "Not found"],
      ["Counted", `${v.qty} units`],
    ];
    if (c && line && !c.blind) rows.push(["System", `${line.expected} units`]);
    return rows;
  },
  action: (v) => ({ kind: "count", taskId: v.task, bin: v.bin, qty: Number(v.qty) }),
  keep: ["task"],
};

export const flows: Record<FlowId, FlowDef> = {
  count: countFlow,
  receive: {
    title: "Receive",
    icon: ArrowDownToLine,
    blurb: "Count pallets off an inbound truck",
    steps: [truckStep("unloading"), labelStep, { kind: "count", key: "count" }, slotStep("Drop it in a staging slot")],
    review: (live, v, c) => {
      const t = truckOf(live, v.truck);
      const item = itemOf(v.sku);
      return [
        ["Truck", t ? `${t.id} · ${doorOf(live, t.doorId)?.code}` : v.truck],
        ["Pallet", v.label],
        ["Item", item ? `${item.item} (${item.sku})` : "Not found"],
        ["Counted", `${c.qty} of ${item?.qtyPerPallet ?? "?"} expected`],
        ["QC", c.qcHold ? "Hold for inspection" : "Passed"],
        ["To slot", slotOf(live, v.slot)?.code ?? "Not found"],
      ];
    },
    action: (v, c) => ({ kind: "receive", truckId: v.truck, palletId: v.label, slotId: v.slot, qty: c.qty, qcHold: c.qcHold, sku: v.sku }),
    keep: ["truck"],
  },

  putaway: {
    title: "Putaway",
    icon: Warehouse,
    blurb: "Move received pallets into storage",
    steps: [
      {
        kind: "scan",
        key: "pallet",
        icon: Package,
        prompt: () => "Scan the pallet",
        hint: () => "Pallet label (LPN)",
        options: (live) =>
          yardPallets(live, ["received"]).map((p) => ({ code: p.id, title: `${p.id} · ${p.item}`, note: `Slot ${slotOf(live, p.slotId)?.code} · ${p.qty} units` })),
        resolve: (live, code) => checkYardPallet(live, code, ["received"]),
      },
      {
        kind: "scan",
        key: "bin",
        icon: Boxes,
        prompt: (live, v) => {
          const p = live.pallets.find((x) => x.id === v.pallet);
          return p ? `Take it to bin ${binFor(live.site.layout, p.category, p.id)}` : "Take it to its bin";
        },
        hint: () => "Scan the bin label on the rack",
        options: (live, v) => {
          const p = live.pallets.find((x) => x.id === v.pallet);
          if (!p) return [];
          const bin = binFor(live.site.layout, p.category, p.id);
          return [{ code: bin, title: `Bin ${bin}`, note: `Suggested · zone ${bin[0]} holds ${p.category}` }];
        },
        resolve: (live, code, v) => {
          const p = live.pallets.find((x) => x.id === v.pallet);
          if (!p?.slotId) return { error: `${v.pallet} has left the yard. Start over.` };
          if (!/^[A-E]-\d{2}-[1-4]$/.test(code)) return { error: `${code} is not a bin label` };
          const zone = binFor(live.site.layout, p.category, p.id)[0];
          if (code[0] !== zone) return { error: `Wrong zone: ${p.category} goes to zone ${zone}` };
          return { value: code };
        },
      },
    ],
    review: (live, v) => {
      const p = live.pallets.find((x) => x.id === v.pallet);
      const suggested = p && binFor(live.site.layout, p.category, p.id);
      return [
        ["Pallet", v.pallet],
        ["Item", p ? `${p.item} · ${p.qty} units` : "Not found"],
        ["From slot", slotOf(live, p?.slotId ?? null)?.code ?? "Not found"],
        ["To bin", v.bin === suggested ? `${v.bin} (suggested)` : `${v.bin} (override of ${suggested})`],
      ];
    },
    action: (v) => ({ kind: "putaway", palletId: v.pallet, bin: v.bin }),
    keep: [],
  },

  pick: {
    title: "Pick",
    icon: PackageSearch,
    blurb: "Pick stock for an outbound order",
    steps: [
      {
        kind: "scan",
        key: "order",
        icon: PackageSearch,
        prompt: () => "Scan the pick order",
        hint: () => "Shipment number on the pick sheet",
        options: (live) =>
          live.trucks
            .filter((t) => t.direction === "outbound" && t.status !== "departing" && t.cargo.done < t.cargo.total)
            .map((t) => ({
              code: t.shipmentId,
              title: `#${t.shipmentId}`,
              note: `${t.id} · ${doorOf(live, t.doorId)?.code} · ${truckStatus[t.status].label} · ${t.cargo.total - t.cargo.done} left`,
            })),
        resolve: (live, code) => {
          const t = findTruck(live, code);
          if (!t) return { error: `No open order ${code}` };
          if (t.direction !== "outbound" || t.status === "departing" || t.cargo.done >= t.cargo.total) return { error: `#${t.shipmentId} has nothing left to pick` };
          return { value: t.id };
        },
      },
      {
        kind: "scan",
        key: "bin",
        icon: Boxes,
        prompt: (live, v) => {
          const t = truckOf(live, v.order);
          if (!t) return "Order closed";
          const item = orderLine(t, simData);
          return `Pick ${item.qtyPerPallet} × ${item.item} from bin ${binFor(live.site.layout, item.category, t.shipmentId)}`;
        },
        hint: () => "Scan the bin label on the rack",
        options: (live, v) => {
          const t = truckOf(live, v.order);
          if (!t) return [];
          const item = orderLine(t, simData);
          const bin = binFor(live.site.layout, item.category, t.shipmentId);
          return [{ code: bin, title: `Bin ${bin}`, note: `${item.item} · ${item.sku}` }];
        },
        resolve: (live, code, v) => {
          const t = truckOf(live, v.order);
          if (!t) return { error: "This order is closed. Start over." };
          const item = orderLine(t, simData);
          const bin = binFor(live.site.layout, item.category, t.shipmentId);
          return code === bin ? { value: code, extra: { sku: item.sku } } : { error: `Wrong bin. Go to ${bin}.` };
        },
      },
      labelStep,
      slotStep("Stage it in a slot"),
    ],
    review: (live, v) => {
      const t = truckOf(live, v.order);
      const item = itemOf(v.sku);
      return [
        ["Order", t ? `#${t.shipmentId}` : "Closed"],
        ["Truck", t ? `${t.id} · ${doorOf(live, t.doorId)?.code}` : "Not found"],
        ["Item", item ? `${item.qtyPerPallet} × ${item.item}` : "Not found"],
        ["From bin", v.bin],
        ["Pallet", v.label],
        ["To slot", slotOf(live, v.slot)?.code ?? "Not found"],
      ];
    },
    action: (v) => ({ kind: "pick", truckId: v.order, palletId: v.label, slotId: v.slot, sku: v.sku }),
    keep: ["order"],
  },

  load: {
    title: "Load",
    icon: ArrowUpFromLine,
    blurb: "Scan staged pallets onto a truck",
    steps: [
      truckStep("loading"),
      {
        kind: "scan",
        key: "pallet",
        icon: Package,
        prompt: () => "Scan the pallet",
        hint: () => "Pallet label (LPN)",
        options: (live) =>
          yardPallets(live, ["staged", "received"])
            .sort((a, b) => Number(b.status === "staged") - Number(a.status === "staged"))
            .map((p) => ({ code: p.id, title: `${p.id} · ${p.item}`, note: `Slot ${slotOf(live, p.slotId)?.code} · ${p.status === "staged" ? "staged" : "cross-dock"}` })),
        resolve: (live, code) => checkYardPallet(live, code, ["staged", "received"]),
      },
    ],
    review: (live, v) => {
      const t = truckOf(live, v.truck);
      const p = live.pallets.find((x) => x.id === v.pallet);
      return [
        ["Truck", t ? `${t.id} · ${doorOf(live, t.doorId)?.code}` : v.truck],
        ["Pallet", v.pallet],
        ["Item", p ? `${p.item} · ${p.qty} units` : "Not found"],
        ["From slot", slotOf(live, p?.slotId ?? null)?.code ?? "Not found"],
        ["After load", t ? `${t.cargo.done + 1}/${t.cargo.total} pallets` : "Not found"],
      ];
    },
    action: (v) => ({ kind: "load", truckId: v.truck, palletId: v.pallet }),
    keep: ["truck"],
  },
};

/** Open work per flow, for the home screen tiles. */
export function openWork(live: LiveSite): Record<FlowId, number> {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    receive: sum(live.trucks.filter((t) => t.status === "unloading").map((t) => Math.max(0, openCapacity(live, t)))),
    putaway: yardPallets(live, ["received"]).length,
    pick: sum(live.trucks.filter((t) => t.direction === "outbound" && t.status !== "departing").map((t) => t.cargo.total - t.cargo.done)),
    load: sum(live.trucks.filter((t) => t.status === "loading").map((t) => Math.max(0, openCapacity(live, t)))),
    count: sum(live.counts.filter((c) => c.status === "open").map((c) => c.lines.filter((l) => l.counted === null).length)),
  };
}
