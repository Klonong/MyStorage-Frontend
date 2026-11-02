"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/base/app-shell";
import { Panel } from "@/components/operations/panel";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { simData, useActiveSite, useDenied, useWarehouse } from "@/hooks/useWarehouse";
import type { DockDoor, LiveSite, SiteLayout, Vec2, Zone } from "@/interfaces/warehouse.interface";
import { padBounds } from "@/lib/heat";
import { DOCK_STRIP, editLayout, laneZ, slotTaken, zoneBins, type LayoutEdit } from "@/lib/simulator";
import { fmt } from "@/lib/status";
import { cn } from "@/lib/utils";

type Slot = SiteLayout["slots"][number];
type Kind = "zone" | "door" | "slot";
type Selected = { kind: Kind; id: string } | null;
/** A drag in progress: pointer start (metres) and how far it has moved, snapped. */
type Drag = { kind: Kind; id: string; mode: "move" | "resize"; start: Vec2; dx: number; dz: number };

const snap = (v: number) => Math.round(v * 2) / 2;
const categories = [...new Set(simData.catalog.map((c) => c.category))];
const zoneTints = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#e0e7ff", "#ccfbf1"];
const doorColor = { in: "#2563eb", out: "#ea580c" };

/** Applies a drag to the object it holds, so the plan shows where it will land. */
function dragged<T extends Zone | DockDoor | Slot>(kind: Kind, o: T, drag: Drag | null): T {
  if (!drag || drag.id !== o.id) return o;
  if (kind === "zone") {
    const z = o as Zone;
    return (drag.mode === "resize" ? { ...z, w: Math.max(3, snap(z.w + drag.dx)), d: Math.max(3, snap(z.d + drag.dz)) } : { ...z, x: snap(z.x + drag.dx), z: snap(z.z + drag.dz) }) as T;
  }
  if (kind === "door") return { ...(o as DockDoor), x: snap((o as DockDoor).x + drag.dx) } as T;
  const s = o as Slot;
  return { ...s, pos: [snap(s.pos[0] + drag.dx), snap(s.pos[1] + drag.dz)] } as T;
}

/** First edit that the simulator accepts, for "add" buttons that need a free spot. */
const firstValid = (live: LiveSite, edits: Iterable<LayoutEdit>) => {
  for (const e of edits) if ("live" in editLayout(live, e)) return e;
  return null;
};

function* zoneSpots(live: LiveSite, code: string, stores: string): Generator<LayoutEdit> {
  const { width: w, depth: d } = live.site.layout.building;
  for (const size of [6, 4, 3])
    for (let z = -d / 2 + 1; z + size <= d / 2 - DOCK_STRIP; z += 1)
      for (let x = -w / 2 + 1; x + size <= w / 2 - 0.5; x += 1)
        yield { kind: "zone", zone: { id: `${live.site.id}-zone-${Date.now()}`, code, name: stores, stores, x, z, w: size, d: size, aisles: Math.max(1, Math.floor(size / 3)), levels: 4 } };
}

function* doorSpots(live: LiveSite, code: string): Generator<LayoutEdit> {
  const w = live.site.layout.building.width;
  for (let x = -w / 2 + 2; x <= w / 2 - 2; x += 0.5) yield { kind: "door", door: { id: `${live.site.id}-door-${Date.now()}`, code, direction: "in", x } };
}

function* slotSpots(live: LiveSite, code: string): Generator<LayoutEdit> {
  const l = live.site.layout;
  const { x0, x1 } = padBounds(l);
  const base = l.slots[0]?.pos[1] ?? l.building.depth / 2 + 6;
  for (const z of [base, base - 3, base + 3, base - 6])
    for (let x = x0 + 2; x < x1 - 2; x += 2.6) yield { kind: "slot", slot: { id: `${live.site.id}-slot-${Date.now()}`, code, pos: [x, z] } };
}

const nextCode = (taken: string[], make: (i: number) => string) => {
  for (let i = 1; ; i++) if (!taken.includes(make(i))) return make(i);
};

// ---------- the plan ----------

function Plan({ live, selected, onSelect, editable }: { live: LiveSite; selected: Selected; onSelect: (s: Selected) => void; editable: boolean }) {
  const edit = useWarehouse((s) => s.editLayout);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const l = live.site.layout;
  const { width: w, depth: d } = l.building;
  const { x0, x1, z0 } = padBounds(l);
  const z1 = l.roadZ + 6;

  const metres = (e: ReactPointerEvent): Vec2 => {
    const el = svg.current!;
    const p = el.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const m = p.matrixTransform(el.getScreenCTM()!.inverse());
    return [m.x, m.y];
  };
  const grab = (kind: Kind, id: string, mode: Drag["mode"] = "move") => (e: ReactPointerEvent) => {
    e.stopPropagation();
    onSelect({ kind, id });
    if (!editable) return;
    svg.current?.setPointerCapture(e.pointerId);
    setDrag({ kind, id, mode, start: metres(e), dx: 0, dz: 0 });
  };
  const drop = () => {
    if (!drag) return;
    setDrag(null);
    if (!snap(drag.dx) && !snap(drag.dz)) return;
    const e: LayoutEdit | null =
      drag.kind === "zone"
        ? { kind: "zone", zone: dragged("zone", l.zones.find((z) => z.id === drag.id)!, drag) }
        : drag.kind === "door"
          ? { kind: "door", door: dragged("door", l.doors.find((o) => o.id === drag.id)!, drag) }
          : { kind: "slot", slot: dragged("slot", l.slots.find((o) => o.id === drag.id)!, drag) };
    const err = edit(e);
    if (err) toast.error(err);
  };

  const isSel = (kind: Kind, id: string) => selected?.kind === kind && selected.id === id;
  const cursor = editable ? "cursor-move" : "cursor-pointer";

  return (
    <svg
      ref={svg}
      viewBox={`${x0} ${z0} ${x1 - x0} ${z1 - z0}`}
      className="w-full touch-none rounded-xl bg-[#e9ecf5] select-none"
      onPointerMove={(e) => {
        if (!drag) return;
        const [x, z] = metres(e);
        setDrag({ ...drag, dx: x - drag.start[0], dz: z - drag.start[1] });
      }}
      onPointerUp={drop}
      onPointerCancel={() => setDrag(null)}
      onPointerDown={() => onSelect(null)}
      role="img"
      aria-label={`Site plan of ${live.site.name}: building, ${l.zones.length} zones, ${l.doors.length} dock doors, ${l.slots.length} yard slots`}
    >
      <rect x={x0} y={z0} width={x1 - x0} height={l.roadZ - 5 - z0} fill="#f6f7fb" />
      <rect x={x0} y={l.roadZ - 5} width={x1 - x0} height={10} fill="#d5dae5" />
      <text x={x0 + 2} y={l.roadZ + 0.6} fontSize={1.6} fill="#64748b">
        Street
      </text>
      <line x1={x0 + 1} x2={x1 - 1} y1={laneZ(l)} y2={laneZ(l)} stroke="#c5cedc" strokeWidth={0.25} strokeDasharray="1.5 1.5" />
      <text x={x1 - 2} y={laneZ(l) - 0.6} fontSize={1.1} fill="#94a3b8" textAnchor="end">
        Forklift lane
      </text>

      {/* Building and the dock strip that stays clear */}
      <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#ffffff" stroke="#1e40af" strokeWidth={0.35} />
      <rect x={-w / 2} y={d / 2 - DOCK_STRIP} width={w} height={DOCK_STRIP} fill="#f1f5f9" />
      <text x={0} y={d / 2 - DOCK_STRIP / 2 + 0.5} fontSize={1.2} fill="#94a3b8" textAnchor="middle">
        Dock staging, kept clear
      </text>

      {l.zones.map((raw, k) => {
        const z = dragged("zone", raw, drag);
        const sel = isSel("zone", z.id);
        return (
          <g key={z.id} onPointerDown={grab("zone", z.id)} className={cursor}>
            <rect x={z.x} y={z.z} width={z.w} height={z.d} fill={zoneTints[k % zoneTints.length]} stroke={sel ? "#2563eb" : "#94a3b8"} strokeWidth={sel ? 0.35 : 0.15} />
            {Array.from({ length: z.aisles }, (_, i) => (
              <rect key={i} x={z.x + (i + 0.5) * (z.w / z.aisles) - 0.55} y={z.z + 0.3} width={1.1} height={z.d - 0.6} fill="#ea7a1f" opacity={0.55} />
            ))}
            <text x={z.x + z.w / 2} y={z.z + z.d / 2} fontSize={Math.min(2.4, z.w / 3)} fontWeight={700} fill="#0f172a" textAnchor="middle" pointerEvents="none">
              {z.code}
            </text>
            <text x={z.x + z.w / 2} y={z.z + z.d / 2 + Math.min(1.6, z.w / 5)} fontSize={Math.min(1, z.w / (z.name.length * 0.65))} fill="#334155" textAnchor="middle" pointerEvents="none">
              {z.name}
            </text>
            {sel && editable && <rect x={z.x + z.w - 0.6} y={z.z + z.d - 0.6} width={1.2} height={1.2} fill="#2563eb" className="cursor-nwse-resize" onPointerDown={grab("zone", z.id, "resize")} />}
          </g>
        );
      })}

      {l.doors.map((raw) => {
        const o = dragged("door", raw, drag);
        const sel = isSel("door", o.id);
        return (
          <g key={o.id} onPointerDown={grab("door", o.id)} className={editable ? "cursor-ew-resize" : "cursor-pointer"}>
            <rect x={o.x - 1.7} y={d / 2 - 0.4} width={3.4} height={1.2} rx={0.2} fill={doorColor[o.direction]} stroke={sel ? "#0f172a" : "none"} strokeWidth={0.3} />
            <text x={o.x} y={d / 2 + 2.4} fontSize={1.2} fill="#0f172a" textAnchor="middle" pointerEvents="none">
              {o.code}
            </text>
          </g>
        );
      })}

      {l.slots.map((raw) => {
        const o = dragged("slot", raw, drag);
        const sel = isSel("slot", o.id);
        const full = slotTaken(live, o.id);
        return (
          <g key={o.id} onPointerDown={grab("slot", o.id)} className={cursor}>
            <rect x={o.pos[0] - 1.05} y={o.pos[1] - 0.95} width={2.1} height={1.9} fill={full ? "#d3a46c" : "#ffffff"} stroke={sel ? "#2563eb" : "#f2c94c"} strokeWidth={sel ? 0.35 : 0.2} />
            <text x={o.pos[0]} y={o.pos[1] + 0.35} fontSize={0.8} fill="#0f172a" textAnchor="middle" pointerEvents="none">
              {o.code}
            </text>
          </g>
        );
      })}

      {l.chargers.map((c) => (
        <circle key={c.id} cx={c.pos[0]} cy={c.pos[1]} r={0.6} fill="#10b981" />
      ))}
    </svg>
  );
}

// ---------- inspector ----------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, disabled, step = 0.5 }: { value: number; onChange: (n: number) => void; disabled: boolean; step?: number }) {
  return <Input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} className="h-8 bg-white" />;
}

function Pick({ value, items, onChange, disabled, label }: { value: string; items: Record<string, string>; onChange: (v: string) => void; disabled: boolean; label: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-full bg-white" aria-label={label}>
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

/** Edit form for one object; it applies the draft, or removes the object. Keyed by the object, so it resets when that changes. */
function Inspector<T>({ title, initial, disabled, onApply, onRemove, note, fields }: { title: string; initial: T; disabled: boolean; onApply: (draft: T) => void; onRemove: () => void; note?: ReactNode; fields: (draft: T, set: (patch: Partial<T>) => void) => ReactNode }) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<T>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <h2 className="font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-2">{fields(draft, set)}</div>
      {note}
      <div className="flex gap-2">
        <button type="submit" disabled={disabled} className={cn(buttonVariants({ size: "sm" }), "flex-1")}>
          Apply
        </button>
        <button type="button" disabled={disabled} onClick={onRemove} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-red-600")}>
          <Trash2 className="size-3.5" />
          Remove
        </button>
      </div>
    </form>
  );
}

function Side({ live, selected, onSelect, refused }: { live: LiveSite; selected: Selected; onSelect: (s: Selected) => void; refused: string | null }) {
  const edit = useWarehouse((s) => s.editLayout);
  const l = live.site.layout;
  const off = refused !== null;
  const apply = (e: LayoutEdit, done?: string) => {
    const err = edit(e);
    if (err) toast.error(err);
    else if (done) toast.success(done);
    return !err;
  };
  const remove = (kind: Kind, id: string) => {
    if (apply({ kind: `remove-${kind}`, id } as LayoutEdit)) onSelect(null);
  };
  const add = (kind: Kind) => {
    const spot =
      kind === "zone"
        ? (() => {
            const code = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((c) => !l.zones.some((z) => z.code === c));
            const stores = [...categories].sort((a, b) => l.zones.filter((z) => z.stores === a).length - l.zones.filter((z) => z.stores === b).length)[0];
            return code ? firstValid(live, zoneSpots(live, code, stores)) : null;
          })()
        : kind === "door"
          ? firstValid(live, doorSpots(live, nextCode(l.doors.map((o) => o.code), (i) => `Bay ${i}`)))
          : firstValid(live, slotSpots(live, nextCode(l.slots.map((o) => o.code), (i) => `S${String(i).padStart(2, "0")}`)));
    if (!spot) return void toast.error(kind === "zone" ? "No free floor for a new zone; shrink or move one first" : `No room for another ${kind}`);
    const id = spot.kind === "zone" ? spot.zone.id : spot.kind === "door" ? spot.door.id : spot.kind === "slot" ? spot.slot.id : "";
    if (apply(spot, `${kind[0].toUpperCase()}${kind.slice(1)} added`)) onSelect({ kind, id });
  };

  const zone = selected?.kind === "zone" ? l.zones.find((z) => z.id === selected.id) : undefined;
  const door = selected?.kind === "door" ? l.doors.find((o) => o.id === selected.id) : undefined;
  const slot = selected?.kind === "slot" ? l.slots.find((o) => o.id === selected.id) : undefined;

  return (
    <div className="space-y-4">
      <Panel className="space-y-3 p-4">
        {zone ? (
          <Inspector
            key={JSON.stringify(zone)}
            title={`Zone ${zone.code}`}
            initial={zone}
            disabled={off}
            onApply={(z) => apply({ kind: "zone", zone: z }, `Zone ${z.code} saved`)}
            onRemove={() => remove("zone", zone.id)}
            note={<p className="text-xs text-muted-foreground">{fmt(zoneBins(zone))} bins: aisles × 2.7 m bays × levels</p>}
            fields={(z, set) => (
              <>
                <Field label="Code">
                  <Input value={z.code} maxLength={1} onChange={(e) => set({ code: e.target.value.toUpperCase() })} disabled={off} className="h-8 bg-white" />
                </Field>
                <Field label="Name">
                  <Input value={z.name} onChange={(e) => set({ name: e.target.value })} disabled={off} className="h-8 bg-white" />
                </Field>
                <Field label="Stores">
                  <Pick label="Category stored" value={z.stores} items={Object.fromEntries(categories.map((c) => [c, c]))} onChange={(stores) => set({ stores })} disabled={off} />
                </Field>
                <Field label="Aisles">
                  <Num value={z.aisles} step={1} onChange={(aisles) => set({ aisles })} disabled={off} />
                </Field>
                <Field label="Levels">
                  <Num value={z.levels} step={1} onChange={(levels) => set({ levels })} disabled={off} />
                </Field>
                <span />
                <Field label="X (m)">
                  <Num value={z.x} onChange={(x) => set({ x })} disabled={off} />
                </Field>
                <Field label="Z (m)">
                  <Num value={z.z} onChange={(v) => set({ z: v })} disabled={off} />
                </Field>
                <Field label="Width (m)">
                  <Num value={z.w} onChange={(w) => set({ w })} disabled={off} />
                </Field>
                <Field label="Depth (m)">
                  <Num value={z.d} onChange={(d) => set({ d })} disabled={off} />
                </Field>
              </>
            )}
          />
        ) : door ? (
          <Inspector
            key={JSON.stringify(door)}
            title={`Dock door ${door.code}`}
            initial={door}
            disabled={off}
            onApply={(o) => apply({ kind: "door", door: o }, `${o.code} saved`)}
            onRemove={() => remove("door", door.id)}
            note={<p className="text-xs text-muted-foreground">{live.trucks.filter((t) => t.doorId === door.id && t.status !== "departing").length} trucks assigned now</p>}
            fields={(o, set) => (
              <>
                <Field label="Code">
                  <Input value={o.code} onChange={(e) => set({ code: e.target.value })} disabled={off} className="h-8 bg-white" />
                </Field>
                <Field label="Direction">
                  <Pick label="Door direction" value={o.direction} items={{ in: "Inbound", out: "Outbound" }} onChange={(v) => set({ direction: v as DockDoor["direction"] })} disabled={off} />
                </Field>
                <Field label="Position along front wall (m)">
                  <Num value={o.x} onChange={(x) => set({ x })} disabled={off} />
                </Field>
              </>
            )}
          />
        ) : slot ? (
          <Inspector
            key={JSON.stringify(slot)}
            title={`Yard slot ${slot.code}`}
            initial={slot}
            disabled={off}
            onApply={(o) => apply({ kind: "slot", slot: o }, `${o.code} saved`)}
            onRemove={() => remove("slot", slot.id)}
            note={slotTaken(live, slot.id) ? <p className="text-xs text-amber-700">A pallet is on this slot, so it stays put for now.</p> : undefined}
            fields={(o, set) => (
              <>
                <Field label="Code">
                  <Input value={o.code} onChange={(e) => set({ code: e.target.value })} disabled={off} className="h-8 bg-white" />
                </Field>
                <span />
                <Field label="X (m)">
                  <Num value={o.pos[0]} onChange={(x) => set({ pos: [x, o.pos[1]] })} disabled={off} />
                </Field>
                <Field label="Z (m)">
                  <Num value={o.pos[1]} onChange={(z) => set({ pos: [o.pos[0], z] })} disabled={off} />
                </Field>
              </>
            )}
          />
        ) : (
          <div className="space-y-2 text-sm">
            <h2 className="font-semibold">{live.site.name}</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Building</dt>
              <dd>
                {l.building.width} × {l.building.depth} m
              </dd>
              <dt className="text-muted-foreground">Zones</dt>
              <dd>{l.zones.length}</dd>
              <dt className="text-muted-foreground">Rack bins</dt>
              <dd>{fmt(l.zones.reduce((sum, z) => sum + zoneBins(z), 0))}</dd>
              <dt className="text-muted-foreground">Dock doors</dt>
              <dd>
                {l.doors.filter((o) => o.direction === "in").length} in, {l.doors.filter((o) => o.direction === "out").length} out
              </dd>
              <dt className="text-muted-foreground">Yard slots</dt>
              <dd>{l.slots.length}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">Click something to edit it. Drag zones and slots to move them, doors to slide them along the wall, and a selected zone&apos;s corner to resize it. Positions snap to 0.5 m.</p>
          </div>
        )}
      </Panel>
      <Panel className="grid grid-cols-3 gap-2 p-3">
        {(["zone", "door", "slot"] as const).map((k) => (
          <button key={k} type="button" disabled={off} onClick={() => add(k)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
            <Plus className="size-3.5" />
            {k === "zone" ? "Zone" : k === "door" ? "Door" : "Slot"}
          </button>
        ))}
      </Panel>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: doorColor.in }} />
          Inbound door
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: doorColor.out }} />
          Outbound door
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#d3a46c]" />
          Slot with a pallet
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-500" />
          Charger
        </span>
      </div>
    </div>
  );
}

/** Site layout editor: a top-down plan of the active site. Every change is validated, audited, and drives the 3D map. */
export function LayoutEditor() {
  const live = useActiveSite();
  const refused = useDenied("admin");
  const [selected, setSelected] = useState<Selected>(null);
  return (
    <AppShell title="Layout" subtitle={refused ? `View only: ${refused}` : `${live.site.name}: zones, racks, dock doors and yard slots`}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="p-3">
          <Plan key={live.site.id} live={live} selected={selected} onSelect={setSelected} editable={refused === null} />
        </Panel>
        <Side live={live} selected={selected} onSelect={setSelected} refused={refused} />
      </div>
    </AppShell>
  );
}
