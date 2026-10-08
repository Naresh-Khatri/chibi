import type { CameraDef } from "../schema";

/** Match perspective framing at the target while keeping parallel sight lines. */
export function orthographicZoom(camera: CameraDef, height: number): number {
  const distance = Math.hypot(...camera.position.map((value, axis) => value - camera.target[axis]));
  const viewHeight = 2 * distance * Math.tan(camera.fov * Math.PI / 360);
  return height / Math.max(0.001, viewHeight);
}
