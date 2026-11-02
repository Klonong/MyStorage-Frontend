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
  createCount,
  createLiveSite,
  createTransfer,
  decideReturn,
  setAutoCheckIn,
  setRules,
  setSharing,
  tick,
  type ScanAction,
  type SimData,
} from "@/lib/simulator";
import type { AlertRules, LiveSite, Selection, Transfer } from "@/interfaces/warehouse.interface";

export const simData: SimData = { catalog, carriers, customers, drivers, suppliers };

/** Webhook endpoints are console config here; deliveries are simulated until the API sends them. */
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
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
  start: (now: number) => void;
  tick: (dt: number) => void;
  setActiveSite: (id: string) => void;
  select: (selection: Selection, focus?: boolean) => void;
  /** Applies a handheld scan to the active site; returns the error, if any. */
  scan: (action: ScanAction) => string | null;
  /** Gatehouse check-in on the active site, optionally to another free door. */
  checkIn: (truckId: string, doorId?: string) => string | null;
  book: (input: { doorId: string; carrier: string; pallets: number; slotAt: number }) => string | null;
  setRules: (rules: AlertRules) => void;
  setAutoCheckIn: (on: boolean) => void;
  /** Driver link toggle; the truck can be at any site. */
  setSharing: (truckId: string, on: boolean) => void;
  createCount: (input: { scope: "zone" | "class"; target: string; blind: boolean }) => string | null;
  approveCount: (taskId: string) => string | null;
  decideReturn: (id: string, decision: "restock" | "scrap", note: string) => string | null;
  assignCrossDock: (palletId: string, truckId: string) => string | null;
  createTransfer: (input: { toSiteId: string; sku: string; pallets: number }) => string | null;
  saveWebhook: (hook: Webhook) => void;
  removeWebhook: (id: string) => void;
}

// ponytail: the simulator stands in for the backend; swap `tick` and `scan` for socket patches and API calls once the API exists.
export const useWarehouse = create<WarehouseState>()((set, get) => ({
  sites: Object.fromEntries(siteSeeds.map((seed) => [seed.id, createLiveSite(seed, simData)])),
  activeSiteId: siteSeeds[0].id,
  selection: null,
  startedAt: null,
  focusKey: 0,
  scanLog: [],
  transfers: [],
  webhooks: [{ id: "wh-erp", url: "https://erp.example.com/hooks/mystorage", events: ["shipment.delivered", "stock.adjusted", "transfer.received"], active: true }],
  start: (now) => set((s) => (s.startedAt === null ? { startedAt: now } : s)),
  tick: (dt) =>
    set((state) => {
      const ticked = Object.fromEntries(Object.entries(state.sites).map(([id, live]) => [id, tick(live, dt, simData)]));
      const { sites, transfers } = advanceTransfers(ticked, state.transfers);
      const sel = state.selection;
      const live = sites[state.activeSiteId];
      const pool = sel?.kind === "truck" ? live.trucks : sel?.kind === "forklift" ? live.forklifts : live.pallets;
      return { sites, transfers, selection: sel && pool.some((o) => o.id === sel.id) ? sel : null };
    }),
  setActiveSite: (id) => set({ activeSiteId: id, selection: null }),
  select: (selection, focus = false) => set((s) => ({ selection, focusKey: focus ? s.focusKey + 1 : s.focusKey })),
  scan: (action) => {
    const { sites, activeSiteId, scanLog } = get();
    const live = sites[activeSiteId];
    const result = applyScan(live, action, simData);
    const entry = (ok: boolean, message: string) => [{ id: (scanLog[0]?.id ?? 0) + 1, siteId: activeSiteId, at: live.t, ok, message }, ...scanLog].slice(0, 30);
    if ("error" in result) {
      set({ scanLog: entry(false, result.error) });
      return result.error;
    }
    set({ sites: { ...sites, [activeSiteId]: result.live }, scanLog: entry(true, result.message) });
    return null;
  },
  checkIn: (truckId, doorId) => applyToActive(get, set, (live) => checkIn(live, truckId, doorId)),
  book: (input) => applyToActive(get, set, (live) => bookAppointment(live, input)),
  setRules: (rules) => {
    applyToActive(get, set, (live) => ({ live: setRules(live, rules) }));
  },
  setAutoCheckIn: (on) => {
    applyToActive(get, set, (live) => ({ live: setAutoCheckIn(live, on) }));
  },
  setSharing: (truckId, on) =>
    set((s) => ({
      sites: Object.fromEntries(Object.entries(s.sites).map(([id, live]) => [id, live.trucks.some((t) => t.id === truckId) ? setSharing(live, truckId, on) : live])),
    })),
  createCount: (input) => applyToActive(get, set, (live) => createCount(live, input, simData)),
  approveCount: (taskId) => applyToActive(get, set, (live) => approveCount(live, taskId, simData)),
  decideReturn: (id, decision, note) => applyToActive(get, set, (live) => decideReturn(live, id, decision, note, simData)),
  assignCrossDock: (palletId, truckId) => applyToActive(get, set, (live) => assignCrossDock(live, palletId, truckId)),
  createTransfer: (input) => {
    const { sites, transfers, activeSiteId } = get();
    const result = createTransfer(sites, transfers, { ...input, fromSiteId: activeSiteId }, simData);
    if ("error" in result) return result.error;
    set(result);
    return null;
  },
  saveWebhook: (hook) => set((s) => ({ webhooks: s.webhooks.some((w) => w.id === hook.id) ? s.webhooks.map((w) => (w.id === hook.id ? hook : w)) : [...s.webhooks, hook] })),
  removeWebhook: (id) => set((s) => ({ webhooks: s.webhooks.filter((w) => w.id !== id) })),
}));

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
