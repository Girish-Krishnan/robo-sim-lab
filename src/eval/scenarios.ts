import { ACKERMANN_BUGGY } from "../api";
import { buildCourseSolids, type Solid } from "../sim/course";
import { DEFAULT_SPAWN, type SpawnPose } from "../sim/vehicle";
import { buildForestSolids, FOREST_SPAWN } from "../sim/worlds/forest";
import { buildTrackSolids, TRACK_SPAWN } from "../sim/worlds/track";
import { buildWarehouseSolids, WAREHOUSE_SPAWN } from "../sim/worlds/warehouse";
import type { WorldId } from "../sim/worlds";

export const EVAL_WORLDS = ["city", "track", "forest", "warehouse"] as const;
export const EVAL_EXAMPLES = ["circle", "avoid", "wall"] as const;

export type EvalWorld = (typeof EVAL_WORLDS)[number];
export type EvalExample = (typeof EVAL_EXAMPLES)[number];

/** Steer used by the circle example. Radius is wheelbase / tan(steer). */
export const CIRCLE_STEER = 0.34;

export function circleRadius(): number {
  return ACKERMANN_BUGGY.wheelbase / Math.tan(CIRCLE_STEER);
}

/**
 * How far the body reaches from the circle's centre.
 * Path radius plus half the track, with a little nose margin.
 */
export const CIRCLE_ENVELOPE = circleRadius() + ACKERMANN_BUGGY.trackWidth / 2 + 0.35;

/**
 * Open pads where a constant left circle stays clear of walls.
 * The car starts on the circle, west of the centre, nose along +Z,
 * so the centre sits on the driver's left.
 */
const CIRCLE_CENTER: Record<EvalWorld, { x: number; z: number }> = {
  city: { x: 5.5, z: -30 },
  track: { x: 0, z: 0 },
  forest: { x: 0, z: -20 },
  warehouse: { x: 0, z: -8 },
};

export function circleCenter(world: EvalWorld): { x: number; z: number } {
  return CIRCLE_CENTER[world];
}

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

export function circleSpawn(world: EvalWorld): SpawnPose {
  const center = CIRCLE_CENTER[world];
  return { x: center.x - circleRadius(), y: 0.84, z: center.z, yaw: 0 };
}

export function worldSpawn(world: WorldId): SpawnPose {
  if (world === "track") return TRACK_SPAWN;
  if (world === "forest") return FOREST_SPAWN;
  if (world === "warehouse") return WAREHOUSE_SPAWN;
  return DEFAULT_SPAWN;
}

export function solidsFor(world: EvalWorld): Solid[] {
  if (world === "track") return buildTrackSolids();
  if (world === "forest") return buildForestSolids();
  if (world === "warehouse") return buildWarehouseSolids();
  return buildCourseSolids();
}

/**
 * Spawn used for a run.
 * `scenario` puts the circle example on its open pad.
 * `default` always uses the world's driving spawn (the pre-tune baseline).
 */
/**
 * Wall follow starts beside a real wall, already near the 2.8 m setpoint,
 * so it does not have to sweep across the lane to find one.
 * The oval spawn is already on the east straight with the inner wall to the right.
 */
const WALL_SPAWN: Record<EvalWorld, SpawnPose> = {
  city: { x: 8.6, y: 0.84, z: -6, yaw: 0 },
  track: { x: 16, y: 0.84, z: -20, yaw: 0 },
  forest: { x: -4.2, y: 0.84, z: -2, yaw: 0 },
  warehouse: { x: -5.7, y: 0.84, z: 4, yaw: 0 },
};

export function wallSpawn(world: EvalWorld): SpawnPose {
  return WALL_SPAWN[world];
}

export function spawnFor(world: EvalWorld, example: EvalExample, mode: "scenario" | "default"): SpawnPose {
  if (mode !== "scenario") return worldSpawn(world);
  if (example === "circle") return circleSpawn(world);
  if (example === "wall") return wallSpawn(world);
  return worldSpawn(world);
}
