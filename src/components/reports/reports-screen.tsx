"use client";

import { Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/base/app-shell";
import { Panel } from "@/components/operations/panel";
import { buttonVariants } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWarehouse } from "@/hooks/useWarehouse";
import { buildReport, reportCsv } from "@/lib/reports";
import { clockAt, fmt } from "@/lib/status";
import { cn } from "@/lib/utils";

// Chart chrome and series from the validated reference palette (slots 1-2 pass CVD and contrast on this surface).
const chrome = { grid: "#e1e0d9", axis: "#c3c2b7", muted: "#898781", secondary: "#52514e" };
const series = { first: "#2a78d6", second: "#eb6834" };
const ranges: Record<string, string> = { "900": "Last 15 minutes", "1800": "Last 30 minutes", "3600": "Last hour" };
const axisTick = { fill: chrome.muted, fontSize: 11 };

function Pick({ value, items, onChange, label }: { value: string; items: Record<string, string>; onChange: (v: string) => void; label: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="h-9 w-48 bg-white" aria-label={label}>
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

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Panel className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </Panel>
  );
}

/** Line keys mirror the marks: a short stroke per series, labels in text ink. */
function LineKeys({ items }: { items: [string, string][] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {items.map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: color }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function ChartCard({ title, subtitle, legend, table, empty, children }: { title: string; subtitle: string; legend?: ReactNode; table: ReactNode; empty?: string; children: ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1.5">
          <div className="leading-tight">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {view === "chart" && legend}
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label={`${title} view`}>
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn("rounded-md px-2.5 py-1 font-medium capitalize text-muted-foreground", view === v && "bg-white text-foreground shadow-sm")}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {empty ? <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-muted-foreground">{empty}</p> : view === "chart" ? children : table}
    </Panel>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("py-1.5 pr-3 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {r.map((c, j) => (
                <td key={j} className={cn("py-1.5 pr-3", j > 0 && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsScreen() {
  const sites = useWarehouse((s) => s.sites);
  const startedAt = useWarehouse((s) => s.startedAt);
  const [siteId, setSiteId] = useState("all");
  const [range, setRange] = useState("1800");
  const selected = siteId === "all" ? Object.values(sites) : [sites[siteId]];
  const report = buildReport(selected, Number(range));
  const clock = (t: number) => clockAt(startedAt, t);
  const scopeName = siteId === "all" ? "all sites" : sites[siteId].site.name;

  const exportCsv = () => {
    const blob = new Blob([reportCsv(selected, Number(range), clock)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mystorage-${siteId}-${range}s.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const flowConfig = { in: { label: "Pallets in", color: series.first }, out: { label: "Pallets out", color: series.second } } satisfies ChartConfig;
  const busyConfig = { docks: { label: "Docks busy", color: series.first }, forklifts: { label: "Forklifts busy", color: series.second } } satisfies ChartConfig;
  const dwellConfig = { minutes: { label: "Minutes at dock", color: series.first } } satisfies ChartConfig;
  const onTimeConfig = { pct: { label: "On time", color: series.first } } satisfies ChartConfig;
  const barHeight = (n: number) => Math.max(120, n * 44 + 16);
  const timeAxis = (
    <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={clock} tickLine={false} axisLine={{ stroke: chrome.axis }} tick={axisTick} minTickGap={36} />
  );
  const tooltipLabel = (_: unknown, payload: readonly { payload?: { t?: number } }[]) => clock(payload?.[0]?.payload?.t ?? 0);

  return (
    <AppShell title="Reports" subtitle={`Throughput, dock time and accuracy for ${scopeName}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Pick label="Site" value={siteId} items={{ all: "All sites", ...Object.fromEntries(Object.values(sites).map((l) => [l.site.id, `${l.site.code} ${l.site.name}`])) }} onChange={setSiteId} />
        <Pick label="Time range" value={range} items={ranges} onChange={setRange} />
        <button type="button" onClick={exportCsv} className={cn(buttonVariants({ variant: "outline" }), "ml-auto h-9 gap-2 bg-white")}>
          <Download className="size-4" />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Pallets received" value={fmt(report.kpis.received)} note={ranges[range].toLowerCase()} />
        <StatTile label="Pallets shipped" value={fmt(report.kpis.shipped)} note={ranges[range].toLowerCase()} />
        <StatTile label="Average time at dock" value={report.kpis.dwellMinutes === null ? "No data" : `${report.kpis.dwellMinutes} min`} note="finished truck visits" />
        <StatTile label="Arrivals on time" value={report.kpis.onTimePct === null ? "No data" : `${report.kpis.onTimePct}%`} note="docked within their slot" />
        <StatTile label="Count accuracy" value={report.kpis.accuracyPct === null ? "No counts" : `${report.kpis.accuracyPct}%`} note="approved cycle counts" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Pallets in and out"
          subtitle="Pallets per minute, received and shipped"
          legend={<LineKeys items={[["Pallets in", series.first], ["Pallets out", series.second]]} />}
          empty={report.throughput.length ? undefined : "Not enough history in this range yet."}
          table={<DataTable head={["Minute", "In", "Out"]} rows={[...report.throughput].reverse().map((p) => [clock(p.t), p.in, p.out])} />}
        >
          <ChartContainer config={flowConfig} className="aspect-auto h-64 w-full">
            <LineChart data={report.throughput} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke={chrome.grid} />
              {timeAxis}
              <YAxis width={28} tickLine={false} axisLine={false} allowDecimals={false} tick={axisTick} />
              <ChartTooltip cursor={{ stroke: chrome.axis }} content={<ChartTooltipContent indicator="line" labelFormatter={tooltipLabel} />} />
              <Line dataKey="in" type="monotone" stroke="var(--color-in)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }} isAnimationActive={false} />
              <Line dataKey="out" type="monotone" stroke="var(--color-out)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard
          title="Docks and forklifts busy"
          subtitle="Share of doors working a truck, and of forklifts on a task"
          legend={<LineKeys items={[["Docks busy", series.first], ["Forklifts busy", series.second]]} />}
          empty={report.utilisation.length ? undefined : "Not enough history in this range yet."}
          table={<DataTable head={["Time", "Docks busy", "Forklifts busy"]} rows={[...report.utilisation].reverse().map((p) => [clock(p.t), `${p.docks}%`, `${p.forklifts}%`])} />}
        >
          <ChartContainer config={busyConfig} className="aspect-auto h-64 w-full">
            <LineChart data={report.utilisation} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke={chrome.grid} />
              {timeAxis}
              <YAxis width={40} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={axisTick} />
              <ChartTooltip cursor={{ stroke: chrome.axis }} content={<ChartTooltipContent indicator="line" labelFormatter={tooltipLabel} formatter={(v, name) => `${busyConfig[name as keyof typeof busyConfig].label}: ${v}%`} />} />
              <Line dataKey="docks" type="stepAfter" stroke="var(--color-docks)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }} isAnimationActive={false} />
              <Line dataKey="forklifts" type="stepAfter" stroke="var(--color-forklifts)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard
          title="Average time at dock by carrier"
          subtitle="From docking to leaving, finished visits in range"
          empty={report.dwell.length ? undefined : "No finished truck visits in this range."}
          table={<DataTable head={["Carrier", "Minutes", "Visits"]} rows={report.dwell.map((d) => [d.carrier, d.minutes, d.visits])} />}
        >
          <ChartContainer config={dwellConfig} className="aspect-auto w-full" style={{ height: barHeight(report.dwell.length) }}>
            <BarChart data={report.dwell} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 4 }} accessibilityLayer>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="carrier" width={130} tickLine={false} axisLine={false} tick={{ fill: chrome.secondary, fontSize: 12 }} />
              <ChartTooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltipContent formatter={(v, _n, item) => `${v} min over ${item.payload.visits} visits`} />} />
              <Bar dataKey="minutes" fill="var(--color-minutes)" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="minutes" position="right" formatter={(v) => `${v} min`} fill="#0b0b0b" fontSize={12} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard
          title="Arrivals on time by carrier"
          subtitle="Trucks that docked within their slot, finished visits in range"
          empty={report.onTime.length ? undefined : "No finished truck visits in this range."}
          table={<DataTable head={["Carrier", "On time", "Visits"]} rows={report.onTime.map((d) => [d.carrier, `${d.pct}%`, d.visits])} />}
        >
          <ChartContainer config={onTimeConfig} className="aspect-auto w-full" style={{ height: barHeight(report.onTime.length) }}>
            <BarChart data={report.onTime} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 4 }} accessibilityLayer>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="carrier" width={130} tickLine={false} axisLine={false} tick={{ fill: chrome.secondary, fontSize: 12 }} />
              <ChartTooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltipContent formatter={(v, _n, item) => `${v}% of ${item.payload.visits} visits`} />} />
              <Bar dataKey="pct" fill="var(--color-pct)" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} fill="#0b0b0b" fontSize={12} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>
      <p className="px-1 text-xs text-muted-foreground">Times run on the demo clock, where a shift passes in minutes.</p>
    </AppShell>
  );
}
