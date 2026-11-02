"use client";

import { ArrowRight, ClipboardCheck, PackageX, RotateCcw, ScanLine, Shuffle, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/base/app-shell";
import { Meter, Panel, StatusPill } from "@/components/operations/panel";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { simData, useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import type { CountTask, ReturnCase, Transfer } from "@/interfaces/warehouse.interface";
import { slotOf } from "@/lib/describe";
import { countAccuracy } from "@/lib/simulator";
import { clockAt, fmt, palletStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

const zoneNames: Record<string, string> = { A: "Zone A: PPE", B: "Zone B: Lighting", C: "Zone C: Furniture", D: "Zone D: Packaging" };
const classNames: Record<string, string> = { A: "Class A: top movers", B: "Class B: middle", C: "Class C: slow" };

function Labeled({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Pick({ value, items, onChange, label }: { value: string; items: Record<string, string>; onChange: (v: string) => void; label: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-full bg-white" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">{children}</p>;
}

// ---------- cycle counts ----------

function NewCount() {
  const create = useWarehouse((s) => s.createCount);
  const live = useActiveSite();
  const [scope, setScope] = useState<"zone" | "class">("zone");
  const [target, setTarget] = useState("A");
  const [blind, setBlind] = useState(true);
  const accuracy = countAccuracy(live);
  return (
    <div className="flex flex-col gap-4">
      <Panel className="space-y-4 p-4">
        <h2 className="font-semibold">New cycle count</h2>
        <Labeled label="Count by">
          <Pick label="Count by" value={scope} items={{ zone: "Storage zone", class: "ABC class" }} onChange={(v) => setScope(v as "zone" | "class")} />
        </Labeled>
        <Labeled label={scope === "zone" ? "Zone" : "Class"}>
          <Pick label="Target" value={target} items={scope === "zone" ? zoneNames : classNames} onChange={setTarget} />
        </Labeled>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
          <span className="leading-tight">
            <span className="block text-sm font-medium">Blind count</span>
            <span className="block text-xs text-muted-foreground">Counters do not see the expected quantity</span>
          </span>
          <Switch checked={blind} onCheckedChange={setBlind} />
        </label>
        <button
          type="button"
          onClick={() => {
            const err = create({ scope, target, blind });
            if (err) toast.error(err);
            else toast.success(`Count created for ${(scope === "zone" ? zoneNames : classNames)[target]}`);
          }}
          className={cn(buttonVariants(), "h-10 w-full gap-2 rounded-xl")}
        >
          <ClipboardCheck className="size-4" />
          Create count
        </button>
      </Panel>
      <Panel className="space-y-1 p-4">
        <p className="text-sm text-muted-foreground">Count accuracy</p>
        <p className="text-3xl font-semibold">{accuracy === null ? "No data" : `${(accuracy * 100).toFixed(1)}%`}</p>
        <p className="text-xs text-muted-foreground">Bins that matched the system, across approved counts at {live.site.code}</p>
      </Panel>
      <Link href="/scanner/count" className="flex items-center gap-2 px-1 text-sm font-medium text-primary hover:underline">
        <ScanLine className="size-4" />
        Counters use the handheld Count flow
      </Link>
    </div>
  );
}

function CountCard({ task }: { task: CountTask }) {
  const approve = useWarehouse((s) => s.approveCount);
  const startedAt = useWarehouse((s) => s.startedAt);
  const counted = task.lines.filter((l) => l.counted !== null).length;
  const hide = task.blind && task.status === "open";
  const status =
    task.status === "approved" ? (
      <StatusPill tone="slate">Approved {clockAt(startedAt, task.approvedAt ?? 0)}</StatusPill>
    ) : task.status === "review" ? (
      <StatusPill tone="amber">Ready for review</StatusPill>
    ) : (
      <StatusPill tone="blue">
        Counting {counted}/{task.lines.length}
      </StatusPill>
    );
  return (
    <Panel className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="leading-tight">
          <p className="font-semibold">{task.id}</p>
          <p className="text-xs text-muted-foreground">
            {(task.scope === "zone" ? zoneNames : classNames)[task.target]}
            {task.blind ? ", blind" : ""}, opened {clockAt(startedAt, task.createdAt)}
          </p>
        </div>
        {status}
      </div>
      {task.status === "open" && <Meter value={counted / task.lines.length} />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Bin</th>
              <th className="py-1.5 pr-3 font-medium">Item</th>
              <th className="py-1.5 pr-3 text-right font-medium">Expected</th>
              <th className="py-1.5 pr-3 text-right font-medium">Counted</th>
              <th className="py-1.5 text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {task.lines.map((l) => {
              const variance = l.counted === null ? null : l.counted - l.expected;
              return (
                <tr key={l.bin} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 font-mono text-xs">{l.bin}</td>
                  <td className="py-1.5 pr-3">{l.item}</td>
                  <td className="py-1.5 pr-3 text-right">{hide ? "Hidden" : fmt(l.expected)}</td>
                  <td className="py-1.5 pr-3 text-right">{l.counted === null ? "Not yet" : fmt(l.counted)}</td>
                  <td className="py-1.5 text-right">
                    {variance === null || hide ? "" : <StatusPill tone={variance === 0 ? "green" : "amber"}>{variance > 0 ? `+${variance}` : variance}</StatusPill>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {task.status === "review" && (
        <button
          type="button"
          onClick={() => {
            const err = approve(task.id);
            if (err) toast.error(err);
            else toast.success(`${task.id} approved and posted to stock`);
          }}
          className={cn(buttonVariants(), "h-10 rounded-xl px-4")}
        >
          Approve and post variances
        </button>
      )}
    </Panel>
  );
}

function CountsTab() {
  const live = useActiveSite();
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <NewCount />
      <div className="flex flex-col gap-4">
        {live.counts.length === 0 && <Empty>No counts yet at {live.site.name}. Create one, then count the bins with the handheld.</Empty>}
        {live.counts.map((task) => (
          <CountCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

// ---------- returns ----------

function ReturnRow({ rma }: { rma: ReturnCase }) {
  const decide = useWarehouse((s) => s.decideReturn);
  const startedAt = useWarehouse((s) => s.startedAt);
  const [note, setNote] = useState("");
  const act = (decision: "restock" | "scrap") => {
    const err = decide(rma.id, decision, note);
    if (err) toast.error(err);
    else toast.success(`${rma.id} ${decision === "restock" ? "restocked" : "scrapped"}`);
  };
  return (
    <li className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-900/5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{rma.id}</span>
          {rma.status === "arrived" && <StatusPill tone="amber">Waiting for inspection</StatusPill>}
          {rma.status === "expected" && <StatusPill tone="blue">Arrives {clockAt(startedAt, rma.expectedAt)}</StatusPill>}
          {rma.status === "restocked" && <StatusPill tone="green">Restocked</StatusPill>}
          {rma.status === "scrapped" && <StatusPill tone="slate">Scrapped</StatusPill>}
        </div>
        <p className="text-sm">
          {rma.qty} × {rma.item} from {rma.customer}
        </p>
        <p className="text-xs text-muted-foreground">
          {rma.reason}
          {rma.note ? `. Inspector: ${rma.note}` : ""}
        </p>
      </div>
      {rma.status === "arrived" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition note (optional)" aria-label={`Condition note for ${rma.id}`} className="h-9 w-56" />
          <button type="button" onClick={() => act("restock")} className={cn(buttonVariants(), "h-9 gap-1.5 rounded-lg")}>
            <RotateCcw className="size-4" />
            Restock
          </button>
          <button type="button" onClick={() => act("scrap")} className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 rounded-lg")}>
            <PackageX className="size-4" />
            Scrap
          </button>
        </div>
      )}
    </li>
  );
}

function ReturnsTab() {
  const live = useActiveSite();
  const order = { arrived: 0, expected: 1, restocked: 2, scrapped: 2 };
  const returns = [...live.returns].sort((a, b) => order[a.status] - order[b.status]);
  const waiting = live.returns.filter((r) => r.status === "arrived").length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Waiting for inspection", waiting],
          ["Restocked", live.stats.returnsRestocked],
          ["Scrapped", live.stats.returnsScrapped],
        ].map(([label, value]) => (
          <Panel key={label} className="p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </Panel>
        ))}
      </div>
      {returns.length === 0 && <Empty>No returns yet.</Empty>}
      <ul className="space-y-2">
        {returns.map((r) => (
          <ReturnRow key={r.id} rma={r} />
        ))}
      </ul>
    </div>
  );
}

// ---------- transfers ----------

const transferSteps: Transfer["status"][] = ["requested", "loading", "in-transit", "arriving", "received"];
const transferLabels: Record<Transfer["status"], string> = { requested: "Booked", loading: "Loading", "in-transit": "On the road", arriving: "Arriving", received: "Received" };

function NewTransfer() {
  const live = useActiveSite();
  const sites = useWarehouse((s) => s.sites);
  const create = useWarehouse((s) => s.createTransfer);
  const others = Object.values(sites).filter((s) => s.site.id !== live.site.id);
  const [to, setTo] = useState(others[0].site.id);
  const [sku, setSku] = useState(simData.catalog[0].sku);
  const [pallets, setPallets] = useState(2);
  const item = simData.catalog.find((c) => c.sku === sku)!;
  const onHand = live.inventory.find((l) => l.sku === sku)?.qty ?? 0;
  const toId = others.some((o) => o.site.id === to) ? to : others[0].site.id;
  return (
    <Panel className="space-y-4 p-4">
      <h2 className="font-semibold">New transfer</h2>
      <p className="rounded-xl bg-slate-50 p-3 text-sm">
        From <span className="font-semibold">{live.site.name}</span>
        <span className="block text-xs text-muted-foreground">Switch site in the top bar to send from elsewhere</span>
      </p>
      <Labeled label="To">
        <Pick label="Destination site" value={toId} items={Object.fromEntries(others.map((o) => [o.site.id, `${o.site.code} ${o.site.name}`]))} onChange={setTo} />
      </Labeled>
      <Labeled label="Item">
        <Pick label="Item" value={sku} items={Object.fromEntries(simData.catalog.map((c) => [c.sku, c.item]))} onChange={setSku} />
      </Labeled>
      <Labeled label="Pallets" htmlFor="transfer-pallets">
        <Input id="transfer-pallets" type="number" min={1} max={26} value={pallets} onChange={(e) => setPallets(Number(e.target.value) || 0)} className="bg-white" />
      </Labeled>
      <p className="text-xs text-muted-foreground">
        {fmt(pallets * item.qtyPerPallet)} units of {fmt(onHand)} on hand at {live.site.code}
      </p>
      <button
        type="button"
        onClick={() => {
          const err = create({ toSiteId: toId, sku, pallets });
          if (err) toast.error(err);
          else toast.success(`Transfer booked to ${sites[toId].site.code}`);
        }}
        className={cn(buttonVariants(), "h-10 w-full gap-2 rounded-xl")}
      >
        <Shuffle className="size-4" />
        Book transfer
      </button>
    </Panel>
  );
}

function TransfersTab() {
  const transfers = useWarehouse((s) => s.transfers);
  const sites = useWarehouse((s) => s.sites);
  const startedAt = useWarehouse((s) => s.startedAt);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <NewTransfer />
      <div className="flex flex-col gap-3">
        {transfers.length === 0 && <Empty>No transfers yet. A transfer books an outbound slot here and, once that truck leaves, an inbound slot at the other site.</Empty>}
        {transfers.map((tr) => {
          const at = transferSteps.indexOf(tr.status);
          return (
            <Panel key={tr.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="leading-tight">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {tr.id}
                    <span className="font-normal text-muted-foreground">
                      {sites[tr.fromSiteId].site.code} <ArrowRight className="inline size-3.5" /> {sites[tr.toSiteId].site.code}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tr.pallets} pallets of {tr.item}, updated {clockAt(startedAt, tr.updatedAt)}
                  </p>
                </div>
                <StatusPill tone={tr.status === "received" ? "green" : "blue"}>{transferLabels[tr.status]}</StatusPill>
              </div>
              <ol className="grid grid-cols-5 gap-1" aria-label={`${tr.id} progress`}>
                {transferSteps.map((step, i) => (
                  <li key={step} className="space-y-1">
                    <span className={cn("block h-1.5 rounded-full", i <= at ? "bg-primary" : "bg-slate-200")} />
                    <span className={cn("block text-[11px]", i <= at ? "font-medium" : "text-muted-foreground")}>{transferLabels[step]}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ---------- cross-dock ----------

function CrossDockTab() {
  const live = useActiveSite();
  const assign = useWarehouse((s) => s.assignCrossDock);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const outbound = live.trucks.filter((t) => t.direction === "outbound" && t.status !== "departing" && t.cargo.done < t.cargo.total);
  const yard = live.pallets.filter((p) => p.slotId && p.status !== "qc-hold");
  const truckItems = Object.fromEntries(outbound.map((t) => [t.id, `${t.id} (${t.cargo.total - t.cargo.done} to go)`]));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4">
          <p className="text-sm text-muted-foreground">Cross-docked today</p>
          <p className="text-2xl font-semibold">{live.stats.crossDocked}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm text-muted-foreground">Pallets in the yard</p>
          <p className="text-2xl font-semibold">{yard.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm text-muted-foreground">Outbound trucks with space</p>
          <p className="text-2xl font-semibold">{outbound.length}</p>
        </Panel>
      </div>
      {live.site.type === "cross-dock" && (
        <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800 ring-1 ring-blue-600/15">
          {live.site.name} is a cross-dock: every receipt is staged for an outbound truck and nothing is put away.
        </p>
      )}
      <Panel className="p-4">
        <h2 className="mb-3 font-semibold">Yard pallets</h2>
        {yard.length === 0 && <Empty>The yard is empty.</Empty>}
        <ul className="divide-y divide-slate-100">
          {yard.map((p) => {
            const target = choice[p.id] ?? outbound[0]?.id ?? "";
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-48 flex-1 leading-tight">
                  <p className="text-sm font-semibold">
                    {p.id} <span className="font-normal text-muted-foreground">in {slotOf(live, p.slotId)?.code}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.qty} × {p.item}
                  </p>
                </div>
                <StatusPill tone={palletStatus[p.status].tone}>{p.crossDockFor ? `For ${p.crossDockFor}` : palletStatus[p.status].label}</StatusPill>
                {outbound.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="w-52">
                      <Pick label={`Truck for ${p.id}`} value={target} items={truckItems} onChange={(v) => setChoice((c) => ({ ...c, [p.id]: v }))} />
                    </div>
                    <button
                      type="button"
                      disabled={p.crossDockFor === target}
                      onClick={() => {
                        const err = assign(p.id, target);
                        if (err) toast.error(err);
                        else toast.success(`${p.id} goes straight onto ${target}`);
                      }}
                      className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 rounded-lg")}
                    >
                      <Truck className="size-4" />
                      Send
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">No outbound truck has space</span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

export function StockScreen() {
  const live = useActiveSite();
  return (
    <AppShell title="Stock" subtitle={`${live.site.name}: counts, returns, transfers and cross-dock`}>
      <Tabs defaultValue="counts">
        <TabsList className="mb-2">
          <TabsTrigger value="counts">Cycle counts</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="crossdock">Cross-dock</TabsTrigger>
        </TabsList>
        <TabsContent value="counts">
          <CountsTab />
        </TabsContent>
        <TabsContent value="returns">
          <ReturnsTab />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTab />
        </TabsContent>
        <TabsContent value="crossdock">
          <CrossDockTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
