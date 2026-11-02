"use client";

import { useEffect } from "react";
import { useWarehouse } from "@/hooks/useWarehouse";

const TICK_SECONDS = 0.25;

/**
 * Drives the simulated live feed. Mounted once in the root layout, so the
 * console and the scanner share one running site across client navigation.
 */
export function LiveFeed() {
  useEffect(() => {
    const { start, tick } = useWarehouse.getState();
    start(Date.now());
    const id = setInterval(() => tick(TICK_SECONDS), TICK_SECONDS * 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}
