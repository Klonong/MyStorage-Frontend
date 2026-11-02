"use client";

import { Building2, Forklift, Package, ScrollText, Truck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useWarehouse } from "@/hooks/useWarehouse";
import type { Selection } from "@/interfaces/warehouse.interface";

/** "/" search across every site; picking a result switches site and flies the map to it. */
export function SearchCommand({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const sites = useWarehouse((s) => s.sites);
  const setActiveSite = useWarehouse((s) => s.setActiveSite);
  const select = useWarehouse((s) => s.select);
  const router = useRouter();
  const pathname = usePathname();
  const all = Object.values(sites);

  const go = (siteId: string, selection: Selection) => {
    if (useWarehouse.getState().activeSiteId !== siteId) setActiveSite(siteId);
    if (selection) select(selection, true);
    onOpenChange(false);
    // Results live on the map; the store survives client navigation, so the selection carries over.
    if (pathname !== "/") router.push("/");
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Find a site, truck, forklift, pallet or shipment">
      <Command>
        <CommandInput placeholder="Search sites, trucks, forklifts, pallets, shipments…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Sites">
            {all.map(({ site }) => (
              <CommandItem key={site.id} value={`${site.code} ${site.name}`} onSelect={() => go(site.id, null)}>
                <Building2 />
                {site.name}
                <span className="ml-auto text-xs text-muted-foreground">{site.code}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Trucks and shipments">
            {all.flatMap((live) =>
              live.trucks.map((t) => (
                <CommandItem key={t.id} value={`${t.id} ${t.shipmentId} ${t.carrier} ${t.plate}`} onSelect={() => go(live.site.id, { kind: "truck", id: t.id })}>
                  <Truck />
                  {t.id}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <ScrollText className="size-3" />#{t.shipmentId}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{live.site.code}</span>
                </CommandItem>
              )),
            )}
          </CommandGroup>
          <CommandGroup heading="Forklifts">
            {all.flatMap((live) =>
              live.forklifts.map((f) => (
                <CommandItem key={f.id} value={`${f.id} ${f.driver}`} onSelect={() => go(live.site.id, { kind: "forklift", id: f.id })}>
                  <Forklift />
                  {f.id}
                  <span className="truncate text-muted-foreground">{f.driver}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{live.site.code}</span>
                </CommandItem>
              )),
            )}
          </CommandGroup>
          <CommandGroup heading="Pallets">
            {all.flatMap((live) =>
              live.pallets.map((p) => (
                <CommandItem key={p.id} value={`${p.id} ${p.item} ${p.sku}`} onSelect={() => go(live.site.id, { kind: "pallet", id: p.id })}>
                  <Package />
                  {p.id}
                  <span className="truncate text-muted-foreground">{p.item}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{live.site.code}</span>
                </CommandItem>
              )),
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
