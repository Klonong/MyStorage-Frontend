import { Suspense } from "react";
import { DriverView } from "@/components/transport/driver-view";
import { TransportShell, ViewSkeleton } from "@/components/transport/transport-shell";

export const metadata = { title: "Driver" };

export default function DriverPage() {
  return (
    <TransportShell title="Driver">
      <Suspense fallback={<ViewSkeleton />}>
        <DriverView />
      </Suspense>
    </TransportShell>
  );
}
