import { Warehouse } from "lucide-react";
import type { ReactNode } from "react";

/** Phone-width page frame for links people open outside the console (drivers, customers). */
export function TransportShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#eef1f8]">
      <header className="border-b border-slate-200/70 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Warehouse className="size-4" />
          </span>
          <span className="font-semibold">MyStorage</span>
          <span className="ml-auto text-sm text-muted-foreground">{title}</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-md flex-col gap-3 p-4">{children}</main>
    </div>
  );
}

/** Same shape as the loaded page, shown while the link's query is read on the client. */
export function ViewSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="h-40 animate-pulse rounded-2xl bg-white" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 animate-pulse rounded-2xl bg-white" />
        <div className="h-24 animate-pulse rounded-2xl bg-white" />
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}
