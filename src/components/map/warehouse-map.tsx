"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWarehouse } from "@/hooks/useWarehouse";
import type { LiveSite, Selection, Vec2 } from "@/interfaces/warehouse.interface";
import { mapCamera } from "@/lib/map-camera";
import { ForkliftModel, PalletModel, RouteLine, TruckModel } from "./models";
import { palette } from "./primitives";
import { Ground, Street, Warehouse } from "./site";

const { ACTION } = CameraControlsImpl;

function positionOf(live: LiveSite, selection: Selection): Vec2 | null {
  if (!selection) return null;
  if (selection.kind === "truck") return live.trucks.find((t) => t.id === selection.id)?.pos ?? null;
  if (selection.kind === "forklift") return live.forklifts.find((f) => f.id === selection.id)?.pos ?? null;
  const pallet = live.pallets.find((p) => p.id === selection.id);
  const slot = live.site.layout.slots.find((s) => s.id === pallet?.slotId);
  return slot?.pos ?? live.forklifts.find((f) => f.carrying === selection.id)?.pos ?? null;
}

/** Isometric camera: drag pans, right-drag rotates, wheel zooms. */
function Rig({ siteId }: { siteId: string }) {
  const ref = useRef<CameraControlsImpl>(null);
  const framed = useRef(false);
  const layout = useWarehouse((s) => s.sites[siteId].site.layout);
  const focusKey = useWarehouse((s) => s.focusKey);
  const size = useThree((s) => s.size);

  const home = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const { width: w, depth: d } = layout.building;
    // From md up, the detail panel and dock board cover ~480px on the right:
    // frame the site in the open area instead of the full canvas.
    const wide = size.width >= 768;
    const zoom = Math.min((wide ? size.width - 480 : size.width) / (w + 60), (size.height - 240) / (d + 45)) * 1.3;
    const tx = -6;
    const tz = d / 2 + 2;
    void c.setLookAt(tx - 110, 120, tz + 140, tx, 0, tz, true);
    void c.zoomTo(zoom, true);
    void c.setFocalOffset(wide ? 220 / zoom : 0, 0, 0, true);
  }, [layout, size.width, size.height]);

  useEffect(() => {
    mapCamera.current = ref.current;
    mapCamera.home = home;
    if (!framed.current) {
      framed.current = true;
      home();
    }
  }, [home]);

  useEffect(() => () => {
    mapCamera.current = null;
    mapCamera.home = null;
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    const { sites, selection } = useWarehouse.getState();
    const pos = positionOf(sites[siteId], selection);
    if (pos) void ref.current?.moveTo(pos[0], 0, pos[1], true);
  }, [focusKey, siteId]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minZoom={3}
      maxZoom={60}
      minPolarAngle={0.3}
      maxPolarAngle={1.2}
      smoothTime={0.35}
      mouseButtons={{ left: ACTION.TRUCK, middle: ACTION.ZOOM, right: ACTION.ROTATE, wheel: ACTION.ZOOM }}
      touches={{ one: ACTION.TOUCH_TRUCK, two: ACTION.TOUCH_ZOOM_ROTATE, three: ACTION.TOUCH_ZOOM_ROTATE }}
    />
  );
}

function SiteScene({ siteId }: { siteId: string }) {
  const site = useWarehouse((s) => s.sites[siteId].site);
  const truckIds = useWarehouse(useShallow((s) => s.sites[siteId].trucks.map((t) => t.id)));
  const forkliftIds = useWarehouse(useShallow((s) => s.sites[siteId].forklifts.map((f) => f.id)));
  const palletIds = useWarehouse(useShallow((s) => s.sites[siteId].pallets.filter((p) => p.slotId).map((p) => p.id)));
  const arriving = useWarehouse(useShallow((s) => s.sites[siteId].trucks.filter((t) => t.status === "en-route" || t.status === "at-gate" || t.status === "docking").map((t) => t.id)));
  const busyDoors = useWarehouse(
    useShallow((s) => s.sites[siteId].trucks.filter((t) => t.status === "loading" || t.status === "unloading" || t.status === "docking").map((t) => t.doorId)),
  );
  return (
    <group>
      <Ground layout={site.layout} />
      <Warehouse layout={site.layout} type={site.type} busyDoors={busyDoors} />
      <Street layout={site.layout} type={site.type} />
      {arriving.map((id) => (
        <RouteLine key={`route-${id}`} siteId={siteId} id={id} />
      ))}
      {truckIds.map((id) => (
        <TruckModel key={id} siteId={siteId} id={id} />
      ))}
      {forkliftIds.map((id) => (
        <ForkliftModel key={id} siteId={siteId} id={id} />
      ))}
      {palletIds.map((id) => (
        <PalletModel key={id} siteId={siteId} id={id} />
      ))}
    </group>
  );
}

export function WarehouseMap() {
  const siteId = useWarehouse((s) => s.activeSiteId);
  const select = useWarehouse((s) => s.select);
  return (
    <Canvas
      shadows
      flat
      orthographic
      dpr={[1, 2]}
      camera={{ position: [-110, 120, 160], zoom: 10, near: 0.1, far: 2000 }}
      onPointerMissed={() => select(null)}
      aria-label="Live 3D map of the selected site"
    >
      {/* flat = no tone mapping, so the pastel palette renders as authored, like the reference */}
      <color attach="background" args={[palette.ground]} />
      <hemisphereLight args={["#ffffff", "#c3cce0", 2.1]} />
      <directionalLight castShadow position={[-60, 120, 70]} intensity={1.35} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
        <orthographicCamera attach="shadow-camera" args={[-110, 110, 110, -110, 1, 400]} />
      </directionalLight>
      <Rig key={`rig-${siteId}`} siteId={siteId} />
      <SiteScene key={siteId} siteId={siteId} />
    </Canvas>
  );
}
