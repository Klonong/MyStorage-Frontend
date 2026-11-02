"use client";

import { Pause, Play, Radio, X } from "lucide-react";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import { heatRamps, type HeatKind } from "@/lib/heat";
import { SIM_HOUR } from "@/lib/simulator";
import { clockAt } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

const heatNames: Record<HeatKind, string> = { travel: "Travel", congestion: "Congestion" };
const iconButton = "flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

function Replay() {
  const replay = useWarehouse((s) => s.replay)!;
  const setReplay = useWarehouse((s) => s.setReplay);
  const startedAt = useWarehouse((s) => s.startedAt);
  const live = useActiveSite();
  const from = live.frames[0]?.t ?? live.t;
  const ago = (live.t - replay.at) / SIM_HOUR;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setReplay({ ...replay, playing: !replay.playing })} aria-label={replay.playing ? "Pause replay" : "Play replay"} className={iconButton}>
          {replay.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <input
          type="range"
          min={from}
          max={live.t}
          step={1}
          value={replay.at}
          onChange={(e) => setReplay({ at: Number(e.target.value), playing: false })}
          aria-label="Replay time"
          aria-valuetext={`${ago.toFixed(1)} hours ago`}
          className="min-w-0 flex-1 accent-primary"
        />
        <button type="button" onClick={() => setReplay(null)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
          <Radio className="size-3.5" />
          Live
        </button>
      </div>
      <p className="px-1 text-xs text-muted-foreground tabular-nums">
        Replaying {clockAt(startedAt, replay.at)}, {ago < 0.05 ? "now" : `${ago.toFixed(1)} h ago`} · pallets and routes hidden
      </p>
    </div>
  );
}

function Heat({ kind }: { kind: HeatKind }) {
  const setHeat = useWarehouse((s) => s.setHeat);
  const hasFrames = useActiveSite().frames.length > 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Heatmap">
          {(Object.keys(heatNames) as HeatKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setHeat(k)}
              className={cn("rounded-md px-2.5 py-1 font-medium text-muted-foreground", kind === k && "bg-white text-foreground shadow-sm")}
            >
              {heatNames[k]}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground" aria-hidden>
          Less
          <span className="h-2 min-w-0 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${heatRamps[kind].join(", ")})` }} />
          More
        </div>
        <button type="button" onClick={() => setHeat(null)} aria-label="Hide heatmap" className={iconButton}>
          <X className="size-4" />
        </button>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {!hasFrames
          ? "Collecting forklift positions…"
          : kind === "travel"
            ? "Where working forklifts drove, last 24 h"
            : "Where two working forklifts came within 3 m, last 24 h"}
      </p>
    </div>
  );
}

/** Replay scrubber and heatmap legend; shows while either is on. */
export function InsightsBar() {
  const replaying = useWarehouse((s) => s.replay !== null);
  const heat = useWarehouse((s) => s.heat);
  if (!replaying && !heat) return null;
  return (
    <Panel aria-label="Map replay and heatmap" className="w-full space-y-3 p-2.5 sm:w-[25rem]">
      {replaying && <Replay />}
      {heat && <Heat kind={heat} />}
    </Panel>
  );
}
