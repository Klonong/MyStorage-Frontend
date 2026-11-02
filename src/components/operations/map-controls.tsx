"use client";

import { Flame, History, House, Layers, Minus, Moon, Plus, RotateCcw, RotateCw, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWarehouse } from "@/hooks/useWarehouse";
import { mapCamera } from "@/lib/map-camera";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

const controls: { label: string; icon: LucideIcon; run: () => void }[] = [
  { label: "Zoom in", icon: Plus, run: () => mapCamera.current?.zoom((mapCamera.current.camera.zoom ?? 10) * 0.25, true) },
  { label: "Zoom out", icon: Minus, run: () => mapCamera.current?.zoom(-(mapCamera.current.camera.zoom ?? 10) * 0.2, true) },
  { label: "Rotate left", icon: RotateCcw, run: () => mapCamera.current?.rotate(Math.PI / 8, 0, true) },
  { label: "Rotate right", icon: RotateCw, run: () => mapCamera.current?.rotate(-Math.PI / 8, 0, true) },
  { label: "Reset view", icon: House, run: () => mapCamera.home?.() },
];

function Control({ label, icon: Icon, run, pressed }: { label: string; icon: LucideIcon; run: () => void; pressed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={run}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          "flex size-8 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          pressed && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
        )}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

export function MapControls() {
  const replaying = useWarehouse((s) => s.replay !== null);
  const heat = useWarehouse((s) => s.heat);
  const interior = useWarehouse((s) => s.interior);
  const night = useWarehouse((s) => s.night);
  const { setReplay, setHeat, setInterior, setNight } = useWarehouse.getState();
  const startReplay = () => {
    const { sites, activeSiteId } = useWarehouse.getState();
    const live = sites[activeSiteId];
    setReplay({ at: live.frames[0]?.t ?? live.t, playing: true });
  };
  return (
    <div className="flex flex-col gap-2">
      <Panel className="flex flex-col p-1">
        {controls.map((c) => (
          <Control key={c.label} {...c} />
        ))}
      </Panel>
      <Panel className="flex flex-col p-1">
        <Control label={replaying ? "Back to live" : "Replay last 24 h"} icon={History} pressed={replaying} run={() => (replaying ? setReplay(null) : startReplay())} />
        <Control label={heat ? "Hide heatmap" : "Show heatmap"} icon={Flame} pressed={heat !== null} run={() => setHeat(heat ? null : "travel")} />
        <Control label={interior ? "Show roof" : "Show zones and racks"} icon={Layers} pressed={interior} run={() => setInterior(!interior)} />
        <Control label={night ? "Day view" : "Night view"} icon={night ? Sun : Moon} pressed={night} run={() => setNight(!night)} />
      </Panel>
    </div>
  );
}
