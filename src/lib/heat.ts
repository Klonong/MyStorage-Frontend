// Travel and congestion heatmaps, built from the replay frames.
// Only `import type` here: the test runs this file in plain Node.
import type { ForkliftStatus, Frame, SiteLayout } from "@/interfaces/warehouse.interface";

export type HeatKind = "travel" | "congestion";

/** Sequential ramps, light to dark: blue for travel, orange for the second context (congestion). */
export const heatRamps: Record<HeatKind, string[]> = {
  travel: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  congestion: ["#fde0d2", "#f8bb9d", "#f2956a", "#eb6834", "#c9501f", "#a03d15", "#7a2d0f"],
};

/** Grid cell size in metres. */
export const HEAT_CELL = 2;
/** Two working forklifts closer than this (metres) count as congestion. */
const NEAR = 3;

/** The yard pad forklifts work on; the map's ground draws the same rectangle. */
export function padBounds(l: SiteLayout) {
  const { width: w, depth: d } = l.building;
  return { x0: -w / 2 - 42, x1: w / 2 + 26, z0: -d / 2 - 16, z1: l.roadZ - 5 };
}

export interface HeatGrid {
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  /** Row-major counts: frames a working forklift (travel) or a close pair (congestion) was in the cell. */
  cells: number[];
  max: number;
}

const working = (s: ForkliftStatus) => s !== "idle" && s !== "charging";

export function heatGrid(frames: Frame[], layout: SiteLayout, kind: HeatKind): HeatGrid {
  const { x0, x1, z0, z1 } = padBounds(layout);
  const cols = Math.ceil((x1 - x0) / HEAT_CELL);
  const rows = Math.ceil((z1 - z0) / HEAT_CELL);
  const cells = new Array<number>(cols * rows).fill(0);
  const add = (x: number, z: number) => {
    const c = Math.floor((x - x0) / HEAT_CELL);
    const r = Math.floor((z - z0) / HEAT_CELL);
    if (c >= 0 && c < cols && r >= 0 && r < rows) cells[r * cols + c] += 1;
  };
  for (const frame of frames) {
    const busy = frame.forklifts.filter((f) => working(f.status));
    if (kind === "travel") {
      for (const f of busy) add(f.pos[0], f.pos[1]);
      continue;
    }
    for (let i = 0; i < busy.length; i++) {
      for (let j = i + 1; j < busy.length; j++) {
        const [a, b] = [busy[i].pos, busy[j].pos];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < NEAR) add((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
    }
  }
  return { x0, z0, cols, rows, cells, max: cells.reduce((m, v) => Math.max(m, v), 0) };
}
