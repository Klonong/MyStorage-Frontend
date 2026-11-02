"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import { DetailPanel } from "./detail-panel";
import { FleetBoard } from "./fleet-board";
import { InsightsBar } from "./insights-bar";
import { KpiStrip } from "./kpi-strip";
import { MapControls } from "./map-controls";
import { SearchCommand } from "./search-command";
import { ShipmentTracker } from "./shipment-tracker";
import { TopBar } from "./top-bar";

// WebGL only exists in the browser, and the scene needs the live clock: never prerender it.
const WarehouseMap = dynamic(() => import("@/components/map/warehouse-map").then((m) => m.WarehouseMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading live map…</div>,
});

function useAlertToasts() {
  const latest = useActiveSite().alerts[0];
  useEffect(() => {
    // Only fresh alerts: switching sites must not replay that site's last warning.
    const { sites, activeSiteId } = useWarehouse.getState();
    if (latest && latest.severity !== "info" && sites[activeSiteId].t - latest.at < 1) toast.warning(latest.message);
  }, [latest]);
}

export function OperationsConsole() {
  const [searchOpen, setSearchOpen] = useState(false);
  const hasSelection = useWarehouse((s) => s.selection !== null);
  useAlertToasts();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && !typing) useWarehouse.getState().select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#eef1f8]">
      <h1 className="sr-only">MyStorage operations</h1>
      <div className="absolute inset-0">
        <WarehouseMap />
      </div>
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col gap-3 p-3 sm:p-4">
        <TopBar onSearch={() => setSearchOpen(true)} />
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 md:flex-row">
          <div className="flex min-w-0 flex-col justify-between gap-3">
            <KpiStrip />
            <div className="hidden lg:block">
              <ShipmentTracker />
            </div>
          </div>
          <div className="flex min-h-0 items-start gap-3">
            <div className="hidden md:block">
              <MapControls />
            </div>
            <div className="flex h-full min-h-0 w-full flex-col justify-between gap-3 sm:w-auto">
              {/* On phones the site summary would hide the map; show details only for a selection. */}
              <div className={hasSelection ? "min-h-0 shrink" : "hidden min-h-0 shrink sm:block"}>
                <DetailPanel />
              </div>
              <div className="hidden space-y-3 md:block">
                <InsightsBar />
                <FleetBoard />
              </div>
            </div>
          </div>
        </div>
      </div>
      {searchOpen && <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />}
    </main>
  );
}
