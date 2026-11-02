import type { LiveSite, Sample } from "@/interfaces/warehouse.interface";
import { countAccuracy } from "@/lib/simulator";

export interface Report {
  throughput: { t: number; in: number; out: number }[];
  utilisation: { t: number; docks: number; forklifts: number }[];
  dwell: { carrier: string; minutes: number; visits: number }[];
  onTime: { carrier: string; pct: number; visits: number }[];
  kpis: { received: number; shipped: number; dwellMinutes: number | null; onTimePct: number | null; accuracyPct: number | null };
}

/** Sums the selected sites' samples at each shared timestamp (sites tick in lockstep). */
function merge(sites: LiveSite[]): Sample[] {
  const byT = new Map<number, Sample>();
  for (const live of sites) {
    for (const s of live.history) {
      const m = byT.get(s.t);
      byT.set(
        s.t,
        m
          ? {
              t: s.t,
              palletsIn: m.palletsIn + s.palletsIn,
              palletsOut: m.palletsOut + s.palletsOut,
              stock: m.stock + s.stock,
              docksBusy: m.docksBusy + s.docksBusy,
              doors: m.doors + s.doors,
              forkliftsBusy: m.forkliftsBusy + s.forkliftsBusy,
              forklifts: m.forklifts + s.forklifts,
            }
          : s,
      );
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

const byCarrier = <T,>(rows: T[], carrier: (r: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(carrier(r), [...(groups.get(carrier(r)) ?? []), r]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
};

export function buildReport(sites: LiveSite[], rangeSeconds: number): Report {
  const samples = merge(sites);
  const now = samples.at(-1)?.t ?? 0;
  const from = now - rangeSeconds;
  const inRange = samples.filter((s) => s.t >= from);

  // Running totals -> pallets per minute: the last sample in each minute, minus the minute before.
  const lastPerMinute = new Map<number, Sample>();
  for (const s of samples) lastPerMinute.set(Math.floor(s.t / 60), s);
  const minutes = [...lastPerMinute.entries()].sort(([a], [b]) => a - b);
  const throughput = minutes
    .slice(1)
    .map(([m, s], i) => ({ t: m * 60, in: s.palletsIn - minutes[i][1].palletsIn, out: s.palletsOut - minutes[i][1].palletsOut }))
    .filter((p) => p.t >= from);

  const utilisation = inRange.map((s) => ({
    t: s.t,
    docks: s.doors ? Math.round((s.docksBusy / s.doors) * 100) : 0,
    forklifts: s.forklifts ? Math.round((s.forkliftsBusy / s.forklifts) * 100) : 0,
  }));

  const visits = sites.flatMap((l) => l.visits).filter((v) => v.doneAt >= from);
  const dwell = byCarrier(visits, (v) => v.carrier).map(([carrier, vs]) => ({
    carrier,
    minutes: Math.round((vs.reduce((sum, v) => sum + v.doneAt - v.dockedAt, 0) / vs.length / 60) * 10) / 10,
    visits: vs.length,
  }));
  const onTime = byCarrier(visits, (v) => v.carrier).map(([carrier, vs]) => ({
    carrier,
    pct: Math.round((vs.filter((v) => !v.late).length / vs.length) * 100),
    visits: vs.length,
  }));

  const first = samples.filter((s) => s.t < from).at(-1) ?? inRange[0];
  const last = inRange.at(-1);
  const accuracies = sites.map(countAccuracy).filter((a): a is number => a !== null);
  return {
    throughput,
    utilisation,
    dwell,
    onTime,
    kpis: {
      received: last && first ? last.palletsIn - first.palletsIn : 0,
      shipped: last && first ? last.palletsOut - first.palletsOut : 0,
      dwellMinutes: visits.length ? Math.round((visits.reduce((s, v) => s + v.doneAt - v.dockedAt, 0) / visits.length / 60) * 10) / 10 : null,
      onTimePct: visits.length ? Math.round((visits.filter((v) => !v.late).length / visits.length) * 100) : null,
      accuracyPct: accuracies.length ? Math.round((accuracies.reduce((a, b) => a + b, 0) / accuracies.length) * 1000) / 10 : null,
    },
  };
}

/** One row per site and sample in the range, for spreadsheets. */
export function reportCsv(sites: LiveSite[], rangeSeconds: number, clock: (t: number) => string) {
  const now = Math.max(...sites.map((l) => l.history.at(-1)?.t ?? 0));
  const header = "time,site,pallets_in_total,pallets_out_total,stock_pallets,docks_busy,doors,forklifts_busy,forklifts";
  const rows = sites.flatMap((l) =>
    l.history
      .filter((s) => s.t >= now - rangeSeconds)
      .map((s) => [clock(s.t), l.site.code, s.palletsIn, s.palletsOut, s.stock, s.docksBusy, s.doors, s.forkliftsBusy, s.forklifts].join(",")),
  );
  return [header, ...rows].join("\n");
}
