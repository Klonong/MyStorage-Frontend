import type { CameraControls } from "@react-three/drei";

/** Set by the 3D map once mounted, so the overlay buttons can drive the camera. */
export const mapCamera: { current: CameraControls | null; home: (() => void) | null } = {
  current: null,
  home: null,
};
