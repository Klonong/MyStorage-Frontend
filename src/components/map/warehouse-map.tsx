"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, SRGBColorSpace, type DirectionalLight } from "three";
import { useShallow } from "zustand/react/shallow";
import { useWarehouse } from "@/hooks/useWarehouse";
import type { LiveSite, Selection, Vec2 } from "@/interfaces/warehouse.interface";
import { HEAT_CELL, heatGrid, heatRamps, type HeatKind } from "@/lib/heat";
import { mapCamera } from "@/lib/map-camera";
import { sitePlacement, toWorld, turn } from "@/lib/world";
import { SiteDecor } from "./decor";
import { ForkliftModel, PalletModel, replayFrame, RouteLine, TruckModel } from "./models";
import { palette } from "./primitives";
import { Ground, Street, Warehouse } from "./site";
import { World } from "./world";

const { ACTION } = CameraControlsImpl;

function positionOf(live: LiveSite, selection: Selection): Vec2 | null {
  if (!selection) return null;
  if (selection.kind === "truck") return live.trucks.find((t) => t.id === selection.id)?.pos ?? null;
  if (selection.kind === "forklift") return live.forklifts.find((f) => f.id === selection.id)?.shown ?? null;
  const pallet = live.pallets.find((p) => p.id === selection.id);
  const slot = live.site.layout.slots.find((s) => s.id === pallet?.slotId);
  return slot?.pos ?? live.forklifts.find((f) => f.carrying === selection.id)?.shown ?? null;
}

/**
 * Isometric camera over the shared map: drag pans (neighbouring sites stay in view), right-drag rotates,
 * wheel zooms. Switching site flies the camera to it.
 */
function Rig() {
  const ref = useRef<CameraControlsImpl>(null);
  const siteId = useWarehouse((s) => s.activeSiteId);
  const building = useWarehouse((s) => s.sites[s.activeSiteId].site.layout.building);
  const focusKey = useWarehouse((s) => s.focusKey);
  const size = useThree((s) => s.size);

  const home = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const { width: w, depth: d } = building;
    // From md up, the detail panel and dock board cover ~480px on the right:
    // frame the site in the open area instead of the full canvas.
    const wide = size.width >= 768;
    const zoom = Math.min((wide ? size.width - 480 : size.width) / (w + 60), (size.height - 240) / (d + 45)) * 1.3;
    // Same view of every site: from its street side, front-left, however the site is turned.
    const [tx, tz] = toWorld(siteId, [-6, d / 2 + 2]);
    const [cx, cz] = turn([-110, 140], sitePlacement[siteId].rot);
    void c.setLookAt(tx + cx, 120, tz + cz, tx, 0, tz, true);
    void c.zoomTo(zoom, true);
    void c.setFocalOffset(wide ? 220 / zoom : 0, 0, 0, true);
  }, [siteId, building, size.width, size.height]);

  // Fly to the site on load and whenever another one is picked from the dropdown or its name tag.
  // Clicking a truck at another site also switches site, but the camera stays where the user is looking.
  const framed = useRef<string | null>(null);
  useEffect(() => {
    mapCamera.current = ref.current;
    mapCamera.home = home;
    if (framed.current === siteId) return;
    framed.current = siteId;
    if (!useWarehouse.getState().selection) home();
  }, [home, siteId]);

  useEffect(() => () => {
    mapCamera.current = null;
    mapCamera.home = null;
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    const { sites, selection, activeSiteId } = useWarehouse.getState();
    const pos = positionOf(sites[activeSiteId], selection);
    if (pos) {
      const [x, z] = toWorld(activeSiteId, pos);
      void ref.current?.moveTo(x, 0, z, true);
    }
  }, [focusKey]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minZoom={1}
      maxZoom={60}
      minPolarAngle={0.3}
      maxPolarAngle={1.2}
      smoothTime={0.35}
      mouseButtons={{ left: ACTION.TRUCK, middle: ACTION.ZOOM, right: ACTION.ROTATE, wheel: ACTION.ZOOM }}
      touches={{ one: ACTION.TOUCH_TRUCK, two: ACTION.TOUCH_ZOOM_ROTATE, three: ACTION.TOUCH_ZOOM_ROTATE }}
    />
  );
}

/** Heatmap as one textured plane over the yard pad: a pixel per grid cell, darker and more opaque where busier. */
function HeatLayer({ siteId, kind }: { siteId: string; kind: HeatKind }) {
  const frames = useWarehouse((s) => s.sites[siteId].frames);
  const layout = useWarehouse((s) => s.sites[siteId].site.layout);
  const heat = useMemo(() => {
    const grid = heatGrid(frames, layout, kind);
    const canvas = document.createElement("canvas");
    canvas.width = grid.cols;
    canvas.height = grid.rows;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(grid.cols, grid.rows);
    const ramp = heatRamps[kind].map((hex) => new Color(hex));
    grid.cells.forEach((v, i) => {
      if (!v) return;
      // Square root keeps quieter lanes visible next to the one or two hotspots.
      const t = Math.sqrt(v / grid.max);
      const c = ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
      img.data.set([c.r * 255, c.g * 255, c.b * 255, 90 + 140 * t], i * 4);
    });
    ctx.putImageData(img, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { grid, texture };
  }, [frames, layout, kind]);
  useEffect(() => () => heat.texture.dispose(), [heat]);
  const { grid, texture } = heat;
  const w = grid.cols * HEAT_CELL;
  const d = grid.rows * HEAT_CELL;
  return (
    <mesh position={[grid.x0 + w / 2, 0.05, grid.z0 + d / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

function SiteScene({ siteId }: { siteId: string }) {
  const site = useWarehouse((s) => s.sites[siteId].site);
  const heat = useWarehouse((s) => s.heat);
  const active = useWarehouse((s) => s.activeSiteId === siteId);
  const interior = useWarehouse((s) => s.interior);
  // In replay the moving objects come from the frame; pallets and planned routes are live-only, so they hide.
  const replaying = useWarehouse((s) => s.replay !== null);
  const onScreen = (s: Parameters<typeof replayFrame>[0]) => replayFrame(s, siteId) ?? s.sites[siteId];
  const truckIds = useWarehouse(useShallow((s) => onScreen(s).trucks.map((t) => t.id)));
  const forkliftIds = useWarehouse(useShallow((s) => onScreen(s).forklifts.map((f) => f.id)));
  const palletIds = useWarehouse(useShallow((s) => (replaying ? [] : s.sites[siteId].pallets.filter((p) => p.slotId).map((p) => p.id))));
  const arriving = useWarehouse(
    useShallow((s) => (replaying ? [] : s.sites[siteId].trucks.filter((t) => t.status === "en-route" || t.status === "at-gate" || t.status === "docking").map((t) => t.id))),
  );
  const busyDoors = useWarehouse(
    useShallow((s) => onScreen(s).trucks.filter((t) => t.status === "loading" || t.status === "unloading" || t.status === "docking").map((t) => t.doorId)),
  );
  const { pos, rot } = sitePlacement[siteId];
  return (
    <group position={[pos[0], 0, pos[1]]} rotation={[0, rot, 0]}>
      <Ground layout={site.layout} />
      <SiteDecor layout={site.layout} type={site.type} />
      {heat && active && <HeatLayer siteId={siteId} kind={heat} />}
      <Warehouse layout={site.layout} type={site.type} busyDoors={busyDoors} interior={interior} />
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

/** Sun over the active site, so its shadows stay crisp wherever the map is panned to. */
function Sun() {
  const ref = useRef<DirectionalLight>(null);
  const siteId = useWarehouse((s) => s.activeSiteId);
  const night = useWarehouse((s) => s.night);
  useEffect(() => {
    const light = ref.current;
    if (!light) return;
    const [ox, oz] = sitePlacement[siteId].pos;
    light.position.set(ox - 60, 120, oz + 70);
    light.target.position.set(ox, 0, oz);
    light.target.updateMatrixWorld();
  }, [siteId]);
  return (
    <directionalLight ref={ref} castShadow position={[-60, 120, 70]} intensity={night ? 0.35 : 1.35} color={night ? "#9fb4e6" : "#ffffff"} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
      <orthographicCamera attach="shadow-camera" args={[-110, 110, 110, -110, 1, 400]} />
    </directionalLight>
  );
}

export function WarehouseMap() {
  const siteIds = useWarehouse(useShallow((s) => Object.keys(s.sites)));
  const select = useWarehouse((s) => s.select);
  const night = useWarehouse((s) => s.night);
  return (
    <Canvas
      shadows
      flat
      orthographic
      dpr={[1, 2]}
      camera={{ position: [-110, 120, 160], zoom: 10, near: 0.1, far: 2000 }}
      onPointerMissed={() => select(null)}
      aria-label="Live 3D map of every site"
    >
      {/* flat = no tone mapping, so the pastel palette renders as authored, like the reference */}
      <color attach="background" args={[night ? "#121a2b" : palette.ground]} />
      {/* Night is moonlight: the scene dims and cools, and only lamps, windows and lights glow. */}
      <hemisphereLight args={night ? ["#5b6f9e", "#1a2236", 0.75] : ["#ffffff", "#c3cce0", 2.1]} />
      <Sun />
      <Rig />
      <World siteIds={siteIds} />
      {siteIds.map((id) => (
        <SiteScene key={id} siteId={id} />
      ))}
    </Canvas>
  );
}
