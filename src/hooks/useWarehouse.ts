"use client";

import { create, type StoreApi } from "zustand";
import { catalog, carriers, customers, drivers, siteSeeds, suppliers } from "@/data/sites";
import {
  advanceTransfers,
  applyScan,
  approveCount,
  assignCrossDock,
  bookAppointment,
  checkIn,
  confirmPick,
  createCount,
  createLiveSite,
  createTransfer,
  decideReturn,
  editLayout,
  logService,
  releaseWave,
  setAutoCheckIn,
  setRules,
  setSharing,
  setTag,
  tick,
  type LayoutEdit,
  type ScanAction,
  type SimData,
} from "@/lib/simulator";
import type { AlertRules, LiveSite, PositionTag, Selection, Transfer } from "@/interfaces/warehouse.interface";
import { denied, roles, seedUsers, type Permission, type User } from "@/lib/access";
import type { HeatKind } from "@/lib/heat";

export const simData: SimData = { catalog, carriers, customers, drivers, suppliers };

/** Replay plays this many times faster than live: 24 demo hours in under a minute. */
const REPLAY_SPEED = 30;

/** Webhook endpoints are console config here; deliveries are simulated until the API sends them. */
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}

/** Who changed what, where and when; every gated action writes one. */
export interface AuditEntry {
  id: number;
  /** Wall-clock ms. */
  at: number;
  user: string;
  role: string;
  site: string;
  action: string;
  detail: string;
}

export interface ScanLogEntry {
  id: number;
  siteId: string;
  /** Sim time of the scan, in the site's clock. */
  at: number;
  ok: boolean;
  message: string;
}

interface WarehouseState {
  sites: Record<string, LiveSite>;
  activeSiteId: string;
  selection: Selection;
  /** Wall-clock ms when the live feed started; null during server render. */
  startedAt: number | null;
  /** Bumped to ask the map to fly to the current selection. */
  focusKey: number;
  scanLog: ScanLogEntry[];
  /** Transfers span two sites, so they live beside the sites rather than in one. */
  transfers: Transfer[];
  webhooks: Webhook[];
  /** Map replay: the sim time on screen, or null for live. */
  replay: { at: number; playing: boolean } | null;
  heat: HeatKind | null;
  /** Map layer: roof off, zones and racks shown. */
  interior: boolean;
  /** Map lighting: moonlight, with lamps, windows and headlights lit. */
  night: boolean;
  users: User[];
  /** The signed-in user (switchable for the demo). */
  userId: string;
  audit: AuditEntry[];
  start: (now: number) => void;
  tick: (dt: number) => void;
  setActiveSite: (id: string) => void;
  select: (selection: Selection, focus?: boolean) => void;
  // Every action below that changes data returns why it was refused or failed, or null when applied.
  /** Applies a handheld scan to the active site. */
  scan: (action: ScanAction) => string | null;
  /** Gatehouse check-in on the active site, optionally to another free door. */
  checkIn: (truckId: string, doorId?: string) => string | null;
  book: (input: { doorId: string; carrier: string; pallets: number; slotAt: number }) => string | null;
  setRules: (rules: AlertRules) => string | null;
  setAutoCheckIn: (on: boolean) => string | null;
  /** Driver link toggle; the truck can be at any site. Drivers have no login, so it is logged, not gated. */
  setSharing: (truckId: string, on: boolean) => void;
  createCount: (input: { scope: "zone" | "class"; target: string; blind: boolean }) => string | null;
  approveCount: (taskId: string) => string | null;
  decideReturn: (id: string, decision: "restock" | "scrap", note: string) => string | null;
  assignCrossDock: (palletId: string, truckId: string) => string | null;
  createTransfer: (input: { toSiteId: string; sku: string; pallets: number }) => string | null;
  saveWebhook: (hook: Webhook) => string | null;
  removeWebhook: (id: string) => string | null;
  logService: (forkliftId: string) => string | null;
  setTag: (forkliftId: string, tag: PositionTag) => string | null;
  releaseWave: (appointmentIds: string[]) => string | null;
  confirmPick: (waveId: string, lineId: string, picked: number) => string | null;
  setUser: (userId: string) => void;
  saveUser: (user: User) => string | null;
  editLayout: (edit: LayoutEdit) => string | null;
  setInterior: (on: boolean) => void;
  setNight: (on: boolean) => void;
  setReplay: (replay: { at: number; playing: boolean } | null) => void;
  setHeat: (heat: HeatKind | null) => void;
}

// ponytail: the simulator stands in for the backend; swap `tick` and `scan` for socket patches and API calls once the API exists.
export const useWarehouse = create<WarehouseState>()((set, get) => {
  const log = (user: string, role: string, site: string, action: string, detail: string) =>
    set((s) => ({ audit: [{ id: (s.audit[0]?.id ?? 0) + 1, at: Date.now(), user, role, site, action, detail }, ...s.audit].slice(0, 500) }));

  /** Checks the signed-in user's role and site scope, runs the change, then audits it. */
  const gated = (perm: Permission, action: string, detail: () => string, change: () => string | null) => {
    const s = get();
    const site = s.sites[s.activeSiteId].site;
    const user = s.users.find((u) => u.id === s.userId);
    const error = denied(user, perm, site.id, site.code) ?? change();
    if (error) return error;
    log(user!.name, roles[user!.role].name, site.code, action, detail());
    return null;
  };
  const onActive = (action: (live: LiveSite) => { live: LiveSite } | { error: string }) => applyToActive(get, set, action);
  const active = () => get().sites[get().activeSiteId];
  const siteCode = (id: string) => get().sites[id]?.site.code ?? id;
  const scope = (u: User) => (u.sites.length ? u.sites.map(siteCode).join(", ") : "all sites");

  return {
    sites: Object.fromEntries(siteSeeds.map((seed) => [seed.id, createLiveSite(seed, simData)])),
    activeSiteId: siteSeeds[0].id,
    selection: null,
    startedAt: null,
    focusKey: 0,
    scanLog: [],
    transfers: [],
    webhooks: [{ id: "wh-erp", url: "https://erp.example.com/hooks/mystorage", events: ["shipment.delivered", "stock.adjusted", "transfer.received"], active: true }],
    replay: null,
    heat: null,
    interior: false,
    night: false,
    users: seedUsers,
    userId: "u-2",
    audit: [],
    start: (now) => set((s) => (s.startedAt === null ? { startedAt: now } : s)),
    tick: (dt) =>
      set((state) => {
        const ticked = Object.fromEntries(Object.entries(state.sites).map(([id, live]) => [id, tick(live, dt, simData)]));
        const { sites, transfers } = advanceTransfers(ticked, state.transfers);
        const sel = state.selection;
        const live = sites[state.activeSiteId];
        const pool = sel?.kind === "truck" ? live.trucks : sel?.kind === "forklift" ? live.forklifts : live.pallets;
        let replay = state.replay;
        if (replay?.playing) {
          const at = Math.min(replay.at + dt * REPLAY_SPEED, live.t);
          replay = { at, playing: at < live.t };
        }
        return { sites, transfers, replay, selection: sel && pool.some((o) => o.id === sel.id) ? sel : null };
      }),
    setActiveSite: (id) => set({ activeSiteId: id, selection: null }),
    select: (selection, focus = false) => set((s) => ({ selection, focusKey: focus ? s.focusKey + 1 : s.focusKey })),
    scan: (action) => {
      let message = "";
      return gated(
        "scan",
        `Scan: ${action.kind}`,
        () => message,
        () => {
          const { sites, activeSiteId, scanLog } = get();
          const live = sites[activeSiteId];
          const result = applyScan(live, action, simData);
          const entry = (ok: boolean, text: string) => [{ id: (scanLog[0]?.id ?? 0) + 1, siteId: activeSiteId, at: live.t, ok, message: text }, ...scanLog].slice(0, 30);
          if ("error" in result) {
            set({ scanLog: entry(false, result.error) });
            return result.error;
          }
          message = result.message;
          set({ sites: { ...sites, [activeSiteId]: result.live }, scanLog: entry(true, result.message) });
          return null;
        },
      );
    },
    checkIn: (truckId, doorId) => gated("gate", "Check in truck", () => `${truckId}${doorId ? ` to ${doorId}` : ""}`, () => onActive((live) => checkIn(live, truckId, doorId))),
    book: (input) => gated("gate", "Book dock slot", () => `${input.carrier}, ${input.pallets} pallets at ${input.doorId}`, () => onActive((live) => bookAppointment(live, input))),
    setRules: (rules) => {
      const before = active().rules;
      const changed = (Object.keys(rules) as (keyof AlertRules)[]).filter((k) => JSON.stringify(rules[k]) !== JSON.stringify(before[k]));
      return gated(
        "approve",
        "Change alert rules",
        () => changed.map((k) => `${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(rules[k])}`).join("; ") || "No change",
        () => onActive((live) => ({ live: setRules(live, rules) })),
      );
    },
    setAutoCheckIn: (on) => gated("gate", "Auto check-in", () => (on ? "off → on" : "on → off"), () => onActive((live) => ({ live: setAutoCheckIn(live, on) }))),
    setSharing: (truckId, on) => {
      const site = Object.values(get().sites).find((l) => l.trucks.some((t) => t.id === truckId));
      set((s) => ({
        sites: Object.fromEntries(Object.entries(s.sites).map(([id, live]) => [id, live.trucks.some((t) => t.id === truckId) ? setSharing(live, truckId, on) : live])),
      }));
      log("Driver link", "Driver", site?.site.code ?? "", "Location sharing", `${truckId}: ${on ? "on" : "off"}`);
    },
    createCount: (input) =>
      gated("release", "Create cycle count", () => `${input.scope} ${input.target}${input.blind ? ", blind" : ""}`, () => onActive((live) => createCount(live, input, simData))),
    approveCount: (taskId) => gated("approve", "Approve stock adjustment", () => `Count ${taskId}`, () => onActive((live) => approveCount(live, taskId, simData))),
    decideReturn: (id, decision, note) =>
      gated("approve", "Approve stock adjustment", () => `Return ${id}: ${decision}${note ? ` (${note})` : ""}`, () => onActive((live) => decideReturn(live, id, decision, note, simData))),
    assignCrossDock: (palletId, truckId) => gated("release", "Assign cross-dock", () => `${palletId} → ${truckId}`, () => onActive((live) => assignCrossDock(live, palletId, truckId))),
    createTransfer: (input) =>
      gated(
        "release",
        "Create transfer",
        () => `${input.pallets} pallets of ${input.sku} to ${siteCode(input.toSiteId)}`,
        () => {
          const { sites, transfers, activeSiteId } = get();
          const result = createTransfer(sites, transfers, { ...input, fromSiteId: activeSiteId }, simData);
          if ("error" in result) return result.error;
          set(result);
          return null;
        },
      ),
    saveWebhook: (hook) => {
      const before = get().webhooks.find((w) => w.id === hook.id);
      return gated(
        "admin",
        before ? "Update webhook" : "Add webhook",
        () => (before ? `${hook.url}: ${before.active ? "active" : "paused"} → ${hook.active ? "active" : "paused"}` : `${hook.url} (${hook.events.join(", ")})`),
        () => {
          set((s) => ({ webhooks: before ? s.webhooks.map((w) => (w.id === hook.id ? hook : w)) : [...s.webhooks, hook] }));
          return null;
        },
      );
    },
    removeWebhook: (id) => {
      const url = get().webhooks.find((w) => w.id === id)?.url ?? id;
      return gated(
        "admin",
        "Remove webhook",
        () => url,
        () => {
          set((s) => ({ webhooks: s.webhooks.filter((w) => w.id !== id) }));
          return null;
        },
      );
    },
    logService: (forkliftId) => gated("release", "Log forklift service", () => forkliftId, () => onActive((live) => ({ live: logService(live, forkliftId) }))),
    setTag: (forkliftId, tag) => {
      const before = active().forklifts.find((f) => f.id === forkliftId)?.tag ?? null;
      return gated("release", "Change positioning tag", () => `${forkliftId}: ${before ?? "none"} → ${tag ?? "none"}`, () => onActive((live) => ({ live: setTag(live, forkliftId, tag) })));
    },
    releaseWave: (appointmentIds) =>
      gated("release", "Release wave", () => `${active().waves[0]?.id}: ${appointmentIds.join(", ")}`, () => onActive((live) => releaseWave(live, appointmentIds, simData))),
    confirmPick: (waveId, lineId, picked) => {
      const line = active()
        .waves.find((w) => w.id === waveId)
        ?.lines.find((l) => l.id === lineId);
      const short = line !== undefined && picked < line.pallets;
      return gated(
        "scan",
        short ? "Short pick" : "Confirm pick",
        () => `${lineId}: ${picked} of ${line?.pallets} pallets of ${line?.item}`,
        () => onActive((live) => confirmPick(live, waveId, lineId, picked)),
      );
    },
    setUser: (userId) => set({ userId }),
    saveUser: (user) => {
      const before = get().users.find((u) => u.id === user.id);
      const changes = before
        ? [before.role !== user.role && `role ${roles[before.role].name} → ${roles[user.role].name}`, scope(before) !== scope(user) && `sites ${scope(before)} → ${scope(user)}`].filter(Boolean)
        : [];
      return gated(
        "admin",
        before ? "Update user" : "Add user",
        () => (before ? `${user.name}: ${changes.join("; ") || "no change"}` : `${user.name} (${user.email}) as ${roles[user.role].name}, ${scope(user)}`),
        () => {
          if (!user.name.trim() || !/^\S+@\S+\.\S+$/.test(user.email)) return "Enter a name and a valid email";
          if (get().users.some((u) => u.id !== user.id && u.email.toLowerCase() === user.email.toLowerCase())) return `${user.email} is already a user`;
          // Keeps at least one admin, so nobody locks the console out of user management.
          if (before?.role === "admin" && user.role !== "admin" && get().users.filter((u) => u.role === "admin").length === 1) return "Keep at least one admin";
          set((s) => ({ users: before ? s.users.map((u) => (u.id === user.id ? user : u)) : [...s.users, user] }));
          return null;
        },
      );
    },
    editLayout: (edit) => {
      const l = active().site.layout;
      const m = (n: number) => Math.round(n * 10) / 10;
      const pos = (x: number, z: number) => `(${m(x)}, ${m(z)})`;
      let action = "Layout";
      let detail = "";
      if (edit.kind === "zone") {
        const z = edit.zone;
        const was = l.zones.find((o) => o.id === z.id);
        const now = `${m(z.w)}×${m(z.d)} m at ${pos(z.x, z.z)}, ${z.aisles} aisles × ${z.levels} levels, stores ${z.stores}`;
        action = was ? "Layout: edit zone" : "Layout: add zone";
        detail = was ? `Zone ${z.code} "${z.name}": ${m(was.w)}×${m(was.d)} m at ${pos(was.x, was.z)}, ${was.aisles} aisles × ${was.levels} levels, stores ${was.stores} → ${now}` : `Zone ${z.code} "${z.name}": ${now}`;
      } else if (edit.kind === "door") {
        const d = edit.door;
        const was = l.doors.find((o) => o.id === d.id);
        action = was ? "Layout: edit door" : "Layout: add door";
        detail = was ? `${was.code} ${was.direction} at x ${m(was.x)} → ${d.code} ${d.direction} at x ${m(d.x)}` : `${d.code} ${d.direction} at x ${m(d.x)}`;
      } else if (edit.kind === "slot") {
        const sl = edit.slot;
        const was = l.slots.find((o) => o.id === sl.id);
        action = was ? "Layout: move slot" : "Layout: add slot";
        detail = was ? `${was.code} ${pos(...was.pos)} → ${sl.code} ${pos(...sl.pos)}` : `${sl.code} at ${pos(...sl.pos)}`;
      } else {
        const what = edit.kind.slice("remove-".length);
        const gone = [...l.zones.map((z) => ({ id: z.id, code: `Zone ${z.code}` })), ...l.doors, ...l.slots].find((o) => o.id === edit.id);
        action = `Layout: remove ${what}`;
        detail = gone?.code ?? edit.id;
      }
      return gated("admin", action, () => detail, () => onActive((live) => editLayout(live, edit)));
    },
    setInterior: (interior) => set({ interior }),
    setNight: (night) => set({ night }),
    setReplay: (replay) => set({ replay }),
    setHeat: (heat) => set({ heat }),
  };
});

type Store = StoreApi<WarehouseState>;
/** Runs a pure site action on the active site; returns its error, or null when applied. */
function applyToActive(get: Store["getState"], set: Store["setState"], action: (live: LiveSite) => { live: LiveSite } | { error: string }) {
  const { sites, activeSiteId } = get();
  const result = action(sites[activeSiteId]);
  if ("error" in result) return result.error;
  set({ sites: { ...sites, [activeSiteId]: result.live } });
  return null;
}

export const useActiveSite = () => useWarehouse((s) => s.sites[s.activeSiteId]);

/** Why the signed-in user can't do this on the active site, or null; for disabling controls. */
export const useDenied = (perm: Permission) =>
  useWarehouse((s) => {
    const site = s.sites[s.activeSiteId].site;
    return denied(
      s.users.find((u) => u.id === s.userId),
      perm,
      site.id,
      site.code,
    );
  });
