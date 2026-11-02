"use client";

import { ArrowDownToLine, ArrowUpFromLine, CalendarPlus, LogIn, LogOut, MapPinned, Navigation, Signal, SignalZero } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Panel, StatusPill } from "@/components/operations/panel";
import { AppShell } from "@/components/base/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { simData, useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import type { Appointment, LiveSite, Truck } from "@/interfaces/warehouse.interface";
import { doorOf } from "@/lib/describe";
import { etaSeconds, SLOT_WINDOW } from "@/lib/simulator";
import { clockAt, truckStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

const PAST = 120;
const AHEAD = 600;

const duration = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} min`);

/** Doors with no truck on them or headed for them. */
const freeDoors = (live: LiveSite) => live.site.layout.doors.filter((d) => !live.trucks.some((t) => t.doorId === d.id && t.status !== "departing"));

function slotTone(a: Appointment) {
  if (a.status === "missed") return "bg-red-50 text-red-700 ring-red-300";
  if (a.status === "done") return "bg-slate-100 text-slate-500 ring-slate-200";
  if (a.late) return "bg-amber-50 text-amber-800 ring-amber-300";
  if (a.status === "on-site") return "bg-emerald-50 text-emerald-800 ring-emerald-300";
  if (a.status === "en-route") return "bg-blue-100 text-blue-800 ring-blue-300";
  return "bg-white text-primary ring-primary/40";
}

function DockSchedule({ onBook }: { onBook: () => void }) {
  const live = useActiveSite();
  const startedAt = useWarehouse((s) => s.startedAt);
  const select = useWarehouse((s) => s.select);
  const router = useRouter();
  const from = live.t - PAST;
  const span = PAST + AHEAD;
  const pct = (t: number) => ((t - from) / span) * 100;
  const ticks = Array.from({ length: 13 }, (_, i) => Math.ceil(from / 60) * 60 + i * 60).filter((t) => t <= from + span);

  return (
    <Panel aria-labelledby="schedule-title" className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="schedule-title" className="text-lg font-semibold">
            Dock schedule
          </h2>
          <p className="text-sm text-muted-foreground">
            {live.site.name}: booked slots for the next {AHEAD / 60} minutes
          </p>
        </div>
        <button type="button" onClick={onBook} className={cn(buttonVariants(), "h-10 gap-2 rounded-xl px-4")}>
          <CalendarPlus className="size-4" />
          Book a slot
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="relative ml-24 h-6 text-[11px] text-muted-foreground">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pct(t)}%` }}>
                {clockAt(startedAt, t)}
              </span>
            ))}
          </div>
          <ul className="space-y-2">
            {live.site.layout.doors.map((door) => (
              <li key={door.id} className="flex items-center gap-3">
                <div className="w-21 shrink-0 leading-tight">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {door.direction === "in" ? <ArrowDownToLine className="size-3.5 text-primary" /> : <ArrowUpFromLine className="size-3.5 text-primary" />}
                    {door.code}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{door.direction === "in" ? "Inbound" : "Outbound"}</p>
                </div>
                <div className="relative h-11 flex-1 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-900/5">
                  {ticks.map((t) => (
                    <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-slate-200/70" style={{ left: `${pct(t)}%` }} />
                  ))}
                  {live.appointments
                    .filter((a) => a.doorId === door.id && (a.dockedAt ?? a.slotAt) + SLOT_WINDOW > from && a.slotAt < from + span)
                    .map((a) => {
                      const start = a.dockedAt ?? a.slotAt;
                      const truck = live.trucks.find((t) => t.id === a.truckId);
                      const label = `${a.carrier}, ${a.pallets} pallets, slot ${clockAt(startedAt, a.slotAt)}, ${a.late ? "late" : a.status.replace("-", " ")}`;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          title={label}
                          aria-label={label}
                          disabled={!truck}
                          onClick={() => {
                            if (!truck) return;
                            select({ kind: "truck", id: truck.id }, true);
                            router.push("/");
                          }}
                          className={cn(
                            "absolute inset-y-1.5 flex min-w-0 items-center gap-1 overflow-hidden rounded-lg px-2 text-left text-xs font-medium whitespace-nowrap ring-1 transition-[left] duration-300 ease-linear enabled:hover:brightness-95",
                            slotTone(a),
                          )}
                          style={{ left: `${Math.max(0, pct(start))}%`, width: `${(SLOT_WINDOW * 100) / span}%` }}
                        >
                          <span className="truncate">{truck ? truck.id : a.carrier.split(" ")[0]}</span>
                        </button>
                      );
                    })}
                  <span aria-hidden className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${pct(live.t)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <ul className="mt-4 ml-24 flex flex-wrap gap-2 text-xs" aria-label="Legend">
            {[
              ["Booked", "bg-white text-primary ring-primary/40"],
              ["On the way", "bg-blue-100 text-blue-800 ring-blue-300"],
              ["On site", "bg-emerald-50 text-emerald-800 ring-emerald-300"],
              ["Late", "bg-amber-50 text-amber-800 ring-amber-300"],
              ["Done", "bg-slate-100 text-slate-500 ring-slate-200"],
            ].map(([name, tone]) => (
              <li key={name} className={cn("rounded-md px-2 py-0.5 font-medium ring-1", tone)}>
                {name}
              </li>
            ))}
            <li className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-3 w-0.5 bg-red-500" />
              Now
            </li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function BookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const live = useActiveSite();
  const book = useWarehouse((s) => s.book);
  const startedAt = useWarehouse((s) => s.startedAt);
  const doors = live.site.layout.doors;
  const [doorId, setDoorId] = useState(doors[0].id);
  const [carrier, setCarrier] = useState(simData.carriers[0]);
  const [pallets, setPallets] = useState(6);
  const [minutes, setMinutes] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const doorItems = Object.fromEntries(doors.map((d) => [d.id, `${d.code} (${d.direction === "in" ? "inbound" : "outbound"})`]));
  const carrierItems = Object.fromEntries(simData.carriers.map((c) => [c, c]));
  const whenItems = Object.fromEntries(["2", "5", "10", "15"].map((m) => [m, `In ${m} min`]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book a dock slot</DialogTitle>
          <DialogDescription>The carrier gets a driver link once the truck sets off.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const slotAt = live.t + Number(minutes) * 60;
            const err = book({ doorId, carrier, pallets, slotAt });
            if (err) return setError(err);
            toast.success(`${carrier} booked at ${doorOf(live, doorId)?.code} for ${clockAt(startedAt, slotAt)}`);
            setError(null);
            onOpenChange(false);
          }}
        >
          <div className="grid gap-2">
            <label className="text-sm font-medium">Door</label>
            <Select items={doorItems} value={doorId} onValueChange={(v) => v && setDoorId(v)}>
              <SelectTrigger className="w-full" aria-label="Door">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {doors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {doorItems[d.id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Carrier</label>
            <Select items={carrierItems} value={carrier} onValueChange={(v) => v && setCarrier(v)}>
              <SelectTrigger className="w-full" aria-label="Carrier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {simData.carriers.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <label htmlFor="pallets" className="text-sm font-medium">
                Pallets
              </label>
              <Input id="pallets" type="number" min={1} max={26} value={pallets} onChange={(e) => setPallets(Number(e.target.value) || 0)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Slot</label>
              <Select items={whenItems} value={minutes} onValueChange={(v) => v && setMinutes(v)}>
                <SelectTrigger className="w-full" aria-label="Slot time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(whenItems).map(([m, text]) => (
                    <SelectItem key={m} value={m}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} className={buttonVariants({ variant: "outline" })}>
              Cancel
            </button>
            <button type="submit" className={buttonVariants()}>
              Book slot
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function slotNote(live: LiveSite, truck: Truck, at: number) {
  const appt = live.appointments.find((a) => a.id === truck.appointmentId);
  if (!appt) return null;
  const off = at - appt.slotAt;
  return off > live.rules.lateArrival.seconds ? { late: true, text: `${duration(off)} behind slot` } : { late: false, text: "On time for slot" };
}

function GatePanel() {
  const live = useActiveSite();
  const checkIn = useWarehouse((s) => s.checkIn);
  const setAutoCheckIn = useWarehouse((s) => s.setAutoCheckIn);
  const [doorFor, setDoorFor] = useState<Record<string, string>>({});
  const waiting = live.trucks.filter((t) => t.status === "at-gate");
  const free = freeDoors(live);

  return (
    <Panel aria-labelledby="gate-title" className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="gate-title" className="font-semibold">
          At the gate <span className="text-muted-foreground">{waiting.length}</span>
        </h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Auto check-in
          <Switch checked={live.autoCheckIn} onCheckedChange={setAutoCheckIn} />
        </label>
      </div>
      {waiting.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
          No trucks at the gate. {live.autoCheckIn ? "The gatehouse checks trucks in on its own; switch it off to do it here." : "Arrivals will wait here for you."}
        </p>
      )}
      <ul className="space-y-2">
        {waiting.map((t) => {
          const door = doorFor[t.id] ?? t.doorId;
          const items = Object.fromEntries([doorOf(live, t.doorId)!, ...free].map((d) => [d.id, d.id === t.doorId ? `${d.code} (booked)` : d.code]));
          const note = slotNote(live, t, live.t);
          return (
            <li key={t.id} className="space-y-2.5 rounded-xl bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="leading-tight">
                  <p className="text-sm font-semibold">{t.id}</p>
                  <p className="text-xs text-muted-foreground">{t.carrier}</p>
                </div>
                <div className="text-right leading-tight">
                  <p className="text-sm font-semibold tabular-nums">{duration(live.t - (t.gateAt ?? live.t))}</p>
                  <p className="text-xs text-muted-foreground">waiting</p>
                </div>
              </div>
              {note && <StatusPill tone={note.late ? "amber" : "green"}>{note.text}</StatusPill>}
              <div className="flex gap-2">
                <Select items={items} value={door} onValueChange={(v) => v && setDoorFor((m) => ({ ...m, [t.id]: v }))}>
                  <SelectTrigger className="h-10 flex-1 bg-white" aria-label={`Door for ${t.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(items).map(([id, text]) => (
                      <SelectItem key={id} value={id}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => {
                    const err = checkIn(t.id, door);
                    if (err) toast.error(err);
                    else toast.success(`${t.id} checked in to ${doorOf(live, door)?.code}`);
                  }}
                  className={cn(buttonVariants(), "h-10 gap-1.5 rounded-lg px-3")}
                >
                  <LogIn className="size-4" />
                  Check in
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ArrivalsPanel() {
  const live = useActiveSite();
  const startedAt = useWarehouse((s) => s.startedAt);
  const arriving = live.trucks
    .filter((t) => t.status === "en-route" || t.status === "docking")
    .map((t) => ({ t, eta: etaSeconds(live, t) }))
    .sort((a, b) => a.eta - b.eta);

  return (
    <Panel aria-labelledby="arrivals-title" className="p-4">
      <h2 id="arrivals-title" className="mb-3 font-semibold">
        Arriving <span className="text-muted-foreground">{arriving.length}</span>
      </h2>
      {arriving.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">Nothing on the way. Booked slots send trucks about a minute ahead.</p>}
      <ul className="space-y-2">
        {arriving.map(({ t, eta }) => {
          const note = slotNote(live, t, live.t + eta);
          return (
            <li key={t.id} className="space-y-2 rounded-xl bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="leading-tight">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {t.id}
                    {t.sharing ? <Signal className="size-3.5 text-emerald-600" aria-label="Live location" /> : <SignalZero className="size-3.5 text-amber-600" aria-label="Location paused" />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.carrier}, to {doorOf(live, t.doorId)?.code}
                  </p>
                </div>
                <div className="text-right leading-tight">
                  <p className="text-sm font-semibold tabular-nums">{clockAt(startedAt, live.t + eta)}</p>
                  <p className="text-xs text-muted-foreground">in {duration(eta)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={truckStatus[t.status].tone}>{truckStatus[t.status].label}</StatusPill>
                {note && <StatusPill tone={note.late ? "amber" : "green"}>{note.text}</StatusPill>}
                <span className="ml-auto flex gap-1">
                  <Link href={`/driver?truck=${t.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1 bg-white")}>
                    <Navigation className="size-3.5" />
                    Driver link
                  </Link>
                  <Link href={`/track?shipment=${t.shipmentId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1 bg-white")}>
                    <MapPinned className="size-3.5" />
                    Tracking
                  </Link>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function GateLog() {
  const live = useActiveSite();
  const startedAt = useWarehouse((s) => s.startedAt);
  return (
    <Panel aria-labelledby="log-title" className="p-4">
      <h2 id="log-title" className="mb-3 font-semibold">
        Gate log
      </h2>
      {live.gateLog.length === 0 && <p className="text-sm text-muted-foreground">Check-ins and check-outs appear here.</p>}
      <ul className="space-y-1.5">
        {live.gateLog.slice(0, 8).map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-sm">
            {e.kind === "in" ? <LogIn className="size-4 text-emerald-600" /> : <LogOut className="size-4 text-slate-500" />}
            <span className="font-medium">{e.truckId}</span>
            <span className="truncate text-muted-foreground">
              {e.kind === "in" ? `in to ${e.door}` : "left the site"}
            </span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{clockAt(startedAt, e.at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function YardScreen() {
  const live = useActiveSite();
  const [bookOpen, setBookOpen] = useState(false);
  return (
    <AppShell title="Yard and gate" subtitle={`${live.site.name}: dock slots, the gate queue and trucks on the way`}>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-4">
            <DockSchedule onBook={() => setBookOpen(true)} />
            <GateLog />
          </div>
          <div className="flex flex-col gap-4">
            <GatePanel />
            <ArrivalsPanel />
          </div>
        </div>
      {bookOpen && <BookDialog open={bookOpen} onOpenChange={setBookOpen} />}
    </AppShell>
  );
}
