import { Suspense } from "react";
import { TrackView } from "@/components/transport/track-view";
import { TransportShell, ViewSkeleton } from "@/components/transport/transport-shell";

export const metadata = { title: "Shipment tracking" };

export default function TrackPage() {
  return (
    <TransportShell title="Shipment tracking">
      <Suspense fallback={<ViewSkeleton />}>
        <TrackView />
      </Suspense>
    </TransportShell>
  );
}
