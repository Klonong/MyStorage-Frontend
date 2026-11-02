"use client";

import { ArrowLeft, ChevronDown, Map as MapIcon, ScanLine } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import { clockAt } from "@/lib/status";

function SiteChip() {
  const sites = useWarehouse((s) => s.sites);
  const setActiveSite = useWarehouse((s) => s.setActiveSite);
  const live = useActiveSite();
  const startedAt = useWarehouse((s) => s.startedAt);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch site"
        className="flex h-10 items-center gap-1.5 rounded-xl bg-white/15 px-2.5 text-sm font-semibold text-white outline-none hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        {live.site.code}
        <span className="font-normal tabular-nums text-white/80">{clockAt(startedAt, live.t)}</span>
        <ChevronDown className="size-4 text-white/80" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Working at</DropdownMenuLabel>
          {Object.values(sites).map(({ site }) => (
            <DropdownMenuItem key={site.id} onClick={() => setActiveSite(site.id)} className="h-11 gap-2">
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{site.code}</span>
              {site.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone-width frame for the handheld screens: big header, one column, thumb-sized targets. */
export function ScannerShell({ title, sub, back, children }: { title: string; sub?: string; back?: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-slate-50 shadow-xl shadow-slate-900/5">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-primary px-3 py-2.5 text-white">
        {back ? (
          <Link href="/scanner" aria-label="Back to tasks" className="flex size-10 items-center justify-center rounded-xl hover:bg-white/15">
            <ArrowLeft className="size-5" />
          </Link>
        ) : (
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15">
            <ScanLine className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {sub && <p className="truncate text-xs text-white/80">{sub}</p>}
        </div>
        <SiteChip />
        {!back && (
          <Link href="/" aria-label="Open live map" title="Live map" className="flex size-10 items-center justify-center rounded-xl hover:bg-white/15">
            <MapIcon className="size-5" />
          </Link>
        )}
      </header>
      <main className="flex flex-1 flex-col gap-4 p-3">{children}</main>
    </div>
  );
}
