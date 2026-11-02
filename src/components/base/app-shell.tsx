"use client";

import { useState, type ReactNode } from "react";
import { SearchCommand } from "@/components/operations/search-command";
import { TopBar } from "@/components/operations/top-bar";

/** Frame for the desk screens (yard, stock, reports, integrations): top bar, search, one column of content. */
export function AppShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <main className="min-h-dvh bg-[#eef1f8]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-3 sm:p-4">
        <TopBar onSearch={() => setSearchOpen(true)} />
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {actions}
        </div>
        {children}
      </div>
      {searchOpen && <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />}
    </main>
  );
}
