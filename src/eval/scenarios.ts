import { ACKERMANN_BUGGY } from "../api";
import { buildCourseSolids, type Solid } from "../sim/course";
import { circleRadius } from "../sim/spawns";
import { buildForestSolids } from "../sim/worlds/forest";
import { buildTrackSolids } from "../sim/worlds/track";
import { buildWarehouseSolids } from "../sim/worlds/warehouse";

export {
  CIRCLE_STEER,
  circleCenter,
  circleRadius,
  circleSpawn,
  pursuitSpawn,
  spawnFor,
  wallSpawn,
  worldSpawn,
} from "../sim/spawns";

export const EVAL_WORLDS = ["city", "track", "forest", "warehouse"] as const;
export const EVAL_EXAMPLES = ["circle", "avoid", "wall", "pursuit", "mcl", "mcl-global"] as const;

export type EvalWorld = (typeof EVAL_WORLDS)[number];
export type EvalExample = (typeof EVAL_EXAMPLES)[number];

/**
 * How far the body reaches from the circle's center.
 * Path radius plus half the track, with a little nose margin.
 */
export const CIRCLE_ENVELOPE = circleRadius() + ACKERMANN_BUGGY.trackWidth / 2 + 0.35;

/** Distance from a point to a solid's footprint. Zero means the point is inside. */
export function footprintGap(solid: Solid, x: number, z: number): number {
  const dx = x - solid.x;
  const dz = z - solid.z;
  const cos = Math.cos(solid.yaw);
  const sin = Math.sin(solid.yaw);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  if (solid.shape === "cuboid") {
    const outsideX = Math.max(Math.abs(localX) - solid.hx, 0);
    const outsideZ = Math.max(Math.abs(localZ) - solid.hz, 0);
    return Math.hypot(outsideX, outsideZ);
  }
  return Math.max(0, Math.hypot(localX, localZ) - Math.max(solid.hx, solid.hz));
}

export function solidsFor(world: EvalWorld): Solid[] {
  if (world === "track") return buildTrackSolids();
  if (world === "forest") return buildForestSolids();
  if (world === "warehouse") return buildWarehouseSolids();
  return buildCourseSolids();
}
