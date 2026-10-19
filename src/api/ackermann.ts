import { clamp } from "./math";

/**
 * Front wheel angles for a bicycle-model steer command.
 * `steer` is positive to the left. The inner wheel gets the larger angle.
 */
export function ackermannAngles(
  steer: number,
  wheelbase: number,
  trackWidth: number,
): { left: number; right: number } {
  const s = clamp(steer, -1.2, 1.2);
  if (Math.abs(s) < 1e-4) return { left: 0, right: 0 };
  const radius = wheelbase / Math.tan(s);
  const left = Math.atan(wheelbase / (radius - trackWidth / 2));
  const right = Math.atan(wheelbase / (radius + trackWidth / 2));
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return { left: s, right: s };
  }
  return { left, right };
}
