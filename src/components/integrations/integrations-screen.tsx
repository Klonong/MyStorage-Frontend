"use client";

import { Plus, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/base/app-shell";
import { Panel, StatusPill } from "@/components/operations/panel";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useWarehouse, type Webhook } from "@/hooks/useWarehouse";
import type { LiveSite, Transfer } from "@/interfaces/warehouse.interface";
import { clockAt } from "@/lib/status";
import { cn } from "@/lib/utils";

const eventTypes: Record<string, string> = {
  "shipment.delivered": "Outbound shipment reached the customer",
  "stock.adjusted": "Count approved or return restocked/scrapped",
  "transfer.received": "Inter-site transfer booked into the receiving site",
};

// Planned contract for MyStorage-Backend; the console runs on the simulator until it ships.
const endpoints: [string, string, string][] = [
  ["GET", "/v1/sites/{site}/inventory", "Stock on hand per SKU"],
  ["GET", "/v1/shipments/{id}", "Shipment and its tracking steps"],
  ["POST", "/v1/orders", "Create an outbound order to pick and load"],
  ["POST", "/v1/asn", "Advance shipping notice for an inbound truck"],
  ["POST", "/v1/transfers", "Move pallets between sites"],
];

interface FeedEvent {
  key: string;
  type: string;
  at: number;
  summary: string;
}

/** Events the ERP would hear about, read straight from simulator state, newest first. */
function collectEvents(sites: Record<string, LiveSite>, transfers: Transfer[]): FeedEvent[] {
  const out: FeedEvent[] = [];
  for (const live of Object.values(sites)) {
    const code = live.site.code;
    for (const s of Object.values(live.shipments)) {
      const at = s.direction === "outbound" ? s.steps.find((st) => st.label === "Delivered")?.at : null;
      if (at != null) out.push({ key: `${s.id}-del`, type: "shipment.delivered", at, summary: `${s.id} delivered to ${s.party}` });
    }
    for (const c of live.counts) {
      if (c.approvedAt !== null) out.push({ key: `${c.id}-ok`, type: "stock.adjusted", at: c.approvedAt, summary: `${code} count ${c.id} approved` });
    }
    for (const r of live.returns) {
      if (r.decidedAt !== null) out.push({ key: `${r.id}-dec`, type: "stock.adjusted", at: r.decidedAt, summary: `${code} return ${r.id} ${r.status}` });
    }
  }
  for (const tr of transfers) {
    if (tr.status === "received") out.push({ key: `${tr.id}-rcv`, type: "transfer.received", at: tr.updatedAt, summary: `${tr.pallets} pallets of ${tr.item} received` });
  }
  return out.sort((a, b) => b.at - a.at);
}

function validUrl(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function NewWebhook() {
  const save = useWarehouse((s) => s.saveWebhook);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(Object.keys(eventTypes));
  return (
    <form
      className="space-y-3 rounded-xl bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!validUrl(url)) return void toast.error("Enter a full https:// address");
        if (!events.length) return void toast.error("Pick at least one event");
        const err = save({ id: `wh-${Date.now()}`, url, events, active: true });
        if (err) return void toast.error(err);
        setUrl("");
        toast.success("Webhook added");
      }}
    >
      <label htmlFor="wh-url" className="text-sm font-medium">
        New endpoint
      </label>
      <Input id="wh-url" type="url" placeholder="https://erp.example.com/hooks" value={url} onChange={(e) => setUrl(e.target.value)} className="bg-white" />
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="sr-only">Events</legend>
        {Object.keys(eventTypes).map((ev) => (
          <label key={ev} className="flex items-center gap-1.5 font-mono text-xs">
            <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
            {ev}
          </label>
        ))}
      </fieldset>
      <button type="submit" className={cn(buttonVariants(), "h-9 gap-2 rounded-xl")}>
        <Plus className="size-4" />
        Add webhook
      </button>
    </form>
  );
}

function WebhookRow({ hook }: { hook: Webhook }) {
  const save = useWarehouse((s) => s.saveWebhook);
  const remove = useWarehouse((s) => s.removeWebhook);
  return (
    <li className="flex items-start gap-3 rounded-xl border bg-white p-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate font-mono text-sm">{hook.url}</p>
        <div className="flex flex-wrap gap-1">
          {hook.events.map((ev) => (
            <span key={ev} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
              {ev}
            </span>
          ))}
        </div>
      </div>
      <Switch checked={hook.active} onCheckedChange={(active) => {
          const err = save({ ...hook, active });
          if (err) toast.error(err);
        }} aria-label={`${hook.active ? "Pause" : "Resume"} ${hook.url}`} />
      <button
        type="button"
        onClick={() => {
          const err = remove(hook.id);
          if (err) toast.error(err);
        }}
        aria-label={`Delete ${hook.url}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

export function IntegrationsScreen() {
  const webhooks = useWarehouse((s) => s.webhooks);
  const sites = useWarehouse((s) => s.sites);
  const transfers = useWarehouse((s) => s.transfers);
  const startedAt = useWarehouse((s) => s.startedAt);
  const deliveries = collectEvents(sites, transfers)
    .flatMap((ev) => webhooks.filter((h) => h.active && h.events.includes(ev.type)).map((h) => ({ ...ev, hook: h })))
    .slice(0, 25);

  return (
    <AppShell title="Integrations" subtitle="Webhooks and the API your ERP talks to">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <WebhookIcon className="size-4" />
            <h2 className="font-semibold">Webhooks</h2>
          </div>
          {webhooks.length ? (
            <ul className="space-y-2">
              {webhooks.map((h) => (
                <WebhookRow key={h.id} hook={h} />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">No endpoints yet.</p>
          )}
          <NewWebhook />
          <dl className="space-y-1 text-xs">
            {Object.entries(eventTypes).map(([ev, text]) => (
              <div key={ev} className="flex gap-2">
                <dt className="w-36 shrink-0 font-mono">{ev}</dt>
                <dd className="text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel className="space-y-3 p-4">
          <div className="leading-tight">
            <h2 className="font-semibold">Recent deliveries</h2>
            <p className="text-xs text-muted-foreground">Simulated: what each active endpoint would receive</p>
          </div>
          {deliveries.length ? (
            <ul className="divide-y text-sm">
              {deliveries.map((d) => (
                <li key={`${d.key}-${d.hook.id}`} className="flex items-center gap-3 py-2">
                  <span className="w-16 shrink-0 tabular-nums text-xs text-muted-foreground">{clockAt(startedAt, d.at)}</span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate">{d.summary}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {d.type} → {new URL(d.hook.url).host}
                    </span>
                  </span>
                  <StatusPill tone="green">200</StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">Nothing sent yet. Deliveries appear as shipments land, counts get approved and transfers arrive.</p>
          )}
        </Panel>
      </div>

      <Panel className="space-y-3 p-4">
        <div className="leading-tight">
          <h2 className="font-semibold">REST API</h2>
          <p className="text-xs text-muted-foreground">Planned endpoints for the ERP, served by MyStorage-Backend. Requests carry an API key in the Authorization header.</p>
        </div>
        <ul className="divide-y text-sm">
          {endpoints.map(([method, path, text]) => (
            <li key={method + path} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={cn("w-12 rounded-md px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold", method === "GET" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700")}>{method}</span>
              <span className="font-mono text-xs">{path}</span>
              <span className="text-xs text-muted-foreground">{text}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </AppShell>
  );
}
