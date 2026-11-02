import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneClass, type Tone } from "@/lib/status";

/** Floating glass card that sits over the 3D map. */
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "pointer-events-auto rounded-2xl border border-white/70 bg-white/90 text-sm shadow-[0_8px_30px_rgb(15_23_42/0.08)] backdrop-blur-md",
        className,
      )}
      {...props}
    />
  );
}

export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Thin progress bar; tone picks the fill colour. */
export function Meter({ value, tone = "blue", className }: { value: number; tone?: Tone; className?: string }) {
  const fill = { green: "bg-emerald-500", blue: "bg-primary", amber: "bg-amber-500", slate: "bg-slate-400", red: "bg-red-500" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn("h-1.5 overflow-hidden rounded-full bg-slate-200/80", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-300", fill)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export const batteryTone = (pct: number): Tone => (pct < 25 ? "red" : pct < 50 ? "amber" : "green");
