import type { ForkliftStatus, PalletStatus, TruckStatus } from "@/interfaces/warehouse.interface";

export type Tone = "green" | "blue" | "amber" | "slate" | "red";

export const toneClass: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300",
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300",
};

export const truckStatus: Record<TruckStatus, { label: string; tone: Tone }> = {
  "en-route": { label: "En route", tone: "blue" },
  "at-gate": { label: "At gate", tone: "amber" },
  docking: { label: "Docking", tone: "blue" },
  unloading: { label: "Unloading", tone: "green" },
  loading: { label: "Loading", tone: "green" },
  departing: { label: "Departing", tone: "slate" },
};

export const forkliftStatus: Record<ForkliftStatus, { label: string; tone: Tone }> = {
  idle: { label: "Idle", tone: "slate" },
  "to-pick": { label: "Moving", tone: "blue" },
  carrying: { label: "Carrying", tone: "green" },
  handling: { label: "Handling", tone: "green" },
  "to-charger": { label: "To charger", tone: "amber" },
  charging: { label: "Charging", tone: "amber" },
};

export const palletStatus: Record<PalletStatus, { label: string; tone: Tone }> = {
  received: { label: "Received", tone: "blue" },
  staged: { label: "Staged", tone: "green" },
  "qc-hold": { label: "QC hold", tone: "amber" },
  loading: { label: "Loading", tone: "green" },
};

export const siteTypeLabel = { hub: "Hub", dc: "Distribution center", "cross-dock": "Cross-dock" } as const;

/** Wall-clock HH:MM for a sim time; "--:--" until the client has a clock. */
export function clockAt(startedAt: number | null, t: number) {
  if (startedAt === null) return "--:--";
  return new Date(startedAt + t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export const fmt = (n: number) => n.toLocaleString("en-US");
