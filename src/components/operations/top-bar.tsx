"use client";

import { Bell, ChevronDown, ScanLine, Search, SlidersHorizontal, Warehouse } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import type { LiveSite } from "@/interfaces/warehouse.interface";
import { initials, roles } from "@/lib/access";
import { clockAt } from "@/lib/status";
import { cn } from "@/lib/utils";
import { AlertRulesDialog } from "./alert-rules";
import { Panel } from "./panel";

const docked = (live: LiveSite) => live.trucks.filter((t) => t.status === "loading" || t.status === "unloading").length;
const fill = (live: LiveSite) => Math.round((live.stats.stockOnHand / live.site.capacityPallets) * 100);

function SiteBadge({ code }: { code: string }) {
  return <span className="rounded-md bg-primary px-1.5 py-1 text-[10px] font-semibold text-primary-foreground">{code}</span>;
}

function SiteSwitcher() {
  const sites = useWarehouse((s) => s.sites);
  const setActiveSite = useWarehouse((s) => s.setActiveSite);
  const live = useActiveSite();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-xl border bg-white px-2 py-1.5 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Switch site"
      >
        <SiteBadge code={live.site.code} />
        <span className="hidden leading-tight md:block">
          <span className="block text-sm font-semibold">{live.site.name}</span>
          <span className="block text-xs text-muted-foreground">
            {fill(live)}% full · {docked(live)}/{live.site.layout.doors.length} docked
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sites</DropdownMenuLabel>
          {Object.values(sites).map((s) => (
            <DropdownMenuItem key={s.site.id} onClick={() => setActiveSite(s.site.id)} className="gap-2 py-2">
              <SiteBadge code={s.site.code} />
              <span className="flex-1 leading-tight">
                <span className="block font-medium">{s.site.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {fill(s)}% full · {docked(s)}/{s.site.layout.doors.length} docked
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LiveClock() {
  const startedAt = useWarehouse((s) => s.startedAt);
  const t = useActiveSite().t;
  return (
    <div className="flex items-center gap-1.5 rounded-xl border bg-white px-2.5 py-2 text-xs font-medium" aria-live="off">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-emerald-700">Live</span>
      <span className="tabular-nums text-muted-foreground">{clockAt(startedAt, t)}</span>
    </div>
  );
}

function AlertsMenu({ onRules }: { onRules: () => void }) {
  const live = useActiveSite();
  const warnings = live.alerts.filter((a) => a.severity !== "info").length;
  const ago = (at: number) => {
    const m = Math.floor((live.t - at) / 60);
    return m < 1 ? "just now" : `${m} min ago`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-9 items-center justify-center rounded-xl border bg-white outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Alerts, ${warnings} warnings`}
      >
        <Bell className="size-4" />
        {warnings > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {warnings > 9 ? "9+" : warnings}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Alerts · {live.site.code}</DropdownMenuLabel>
          {live.alerts.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No alerts yet.</p>}
          {live.alerts.slice(0, 8).map((a) => (
            <DropdownMenuItem key={a.id} className="items-start gap-2 py-2">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  a.severity === "info" ? "bg-blue-500" : a.severity === "warning" ? "bg-amber-500" : "bg-red-500",
                )}
              />
              <span className="flex-1 leading-snug">
                <span className="block text-sm">{a.message}</span>
                <span className="block text-xs text-muted-foreground">{ago(a.at)}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRules} className="gap-2">
          <SlidersHorizontal className="size-4" />
          Alert rules
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const tabs = [
  { href: "/", label: "Map" },
  { href: "/yard", label: "Yard" },
  { href: "/stock", label: "Stock" },
  { href: "/reports", label: "Reports" },
  { href: "/integrations", label: "Integrations" },
  { href: "/layout", label: "Layout" },
  { href: "/admin", label: "Admin" },
];

/** Who is signed in; switching users is a demo stand-in for real sign-in. */
function UserMenu() {
  const users = useWarehouse((s) => s.users);
  const userId = useWarehouse((s) => s.userId);
  const setUser = useWarehouse((s) => s.setUser);
  const me = users.find((u) => u.id === userId) ?? users[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Signed in as ${me.name}, switch user`}>
        <Avatar className="size-8">
          <AvatarFallback className="bg-slate-200 text-xs font-semibold">{initials(me.name)}</AvatarFallback>
        </Avatar>
        <span className="hidden leading-tight xl:block">
          <span className="block text-sm font-semibold">{me.name}</span>
          <span className="block text-xs text-muted-foreground">{roles[me.role].name}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sign in as (demo)</DropdownMenuLabel>
          {users.map((u) => (
            <DropdownMenuItem key={u.id} onClick={() => setUser(u.id)} className="gap-2 py-1.5">
              <span className="flex-1 leading-tight">
                <span className={cn("block text-sm", u.id === me.id && "font-semibold")}>{u.name}</span>
                <span className="block text-xs text-muted-foreground">{roles[u.role].name}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  const [rulesOpen, setRulesOpen] = useState(false);
  return (
    <Panel className="flex items-center gap-2 px-2.5 py-2 sm:gap-3">
      <div className="flex items-center gap-2 pr-1">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Warehouse className="size-4" />
        </span>
        <span className="hidden text-base font-semibold tracking-tight sm:block">MyStorage</span>
      </div>
      <nav aria-label="Screens" className="hidden rounded-xl bg-slate-100 p-1 md:flex">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground",
              pathname === tab.href && "bg-white text-foreground shadow-sm",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white px-3 text-left text-muted-foreground outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-ring lg:max-w-md"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search sites, trucks, forklifts, pallets, shipments…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">/</Kbd>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <SiteSwitcher />
        <div className="hidden sm:block">
          <LiveClock />
        </div>
        <Link
          href="/scanner"
          aria-label="Open handheld scanner"
          title="Handheld scanner"
          className="flex size-9 items-center justify-center rounded-xl border bg-white outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ScanLine className="size-4" />
        </Link>
        <AlertsMenu onRules={() => setRulesOpen(true)} />
        <UserMenu />
      </div>
      <AlertRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
    </Panel>
  );
}
