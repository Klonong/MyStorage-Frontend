"use client";

import { House, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mapCamera } from "@/lib/map-camera";
import { Panel } from "./panel";

const controls: { label: string; icon: LucideIcon; run: () => void }[] = [
  { label: "Zoom in", icon: Plus, run: () => mapCamera.current?.zoom((mapCamera.current.camera.zoom ?? 10) * 0.25, true) },
  { label: "Zoom out", icon: Minus, run: () => mapCamera.current?.zoom(-(mapCamera.current.camera.zoom ?? 10) * 0.2, true) },
  { label: "Rotate left", icon: RotateCcw, run: () => mapCamera.current?.rotate(Math.PI / 8, 0, true) },
  { label: "Rotate right", icon: RotateCw, run: () => mapCamera.current?.rotate(-Math.PI / 8, 0, true) },
  { label: "Reset view", icon: House, run: () => mapCamera.home?.() },
];

export function MapControls() {
  return (
    <Panel className="flex flex-col p-1">
      {controls.map(({ label, icon: Icon, run }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            onClick={run}
            aria-label={label}
            className="flex size-8 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="left">{label}</TooltipContent>
        </Tooltip>
      ))}
    </Panel>
  );
}
