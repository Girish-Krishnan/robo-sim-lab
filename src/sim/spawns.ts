import { ACKERMANN_BUGGY } from "../api";
import { referenceRoute } from "./routes";
import { DEFAULT_SPAWN, type SpawnPose } from "./vehicle";
import type { WorldId } from "./worlds";

export type SpawnWorld = WorldId;

/** Steer used by the circle example. Radius is wheelbase / tan(steer). */
export const CIRCLE_STEER = 0.34;

export const TRACK_SPAWN: SpawnPose = { x: 16, y: 0.84, z: -20, yaw: 0 };
export const FOREST_SPAWN: SpawnPose = { x: 0, y: 0.84, z: -4, yaw: 0 };
/** Side lane of the south bay, nose north, clear of the central rack. */
export const WAREHOUSE_SPAWN: SpawnPose = { x: -12, y: 0.84, z: -10, yaw: 0 };

export function circleRadius(): number {
  return ACKERMANN_BUGGY.wheelbase / Math.tan(CIRCLE_STEER);
}

/**
 * Open pads where a constant left circle stays clear of walls.
 * The car starts on the circle, east of the center (smaller x; +X is west),
 * nose along +Z, so the center sits on the driver's left.
 */
const CIRCLE_CENTER: Record<SpawnWorld, { x: number; z: number }> = {
  city: { x: 5.5, z: -30 },
  track: { x: 0, z: 0 },
  forest: { x: 0, z: -34 },
  warehouse: { x: 0, z: -8 },
};

export function circleCenter(world: SpawnWorld): { x: number; z: number } {
  return CIRCLE_CENTER[world];
}

export function circleSpawn(world: SpawnWorld): SpawnPose {
  const center = CIRCLE_CENTER[world];
  return { x: center.x - circleRadius(), y: 0.84, z: center.z, yaw: 0 };
}

export function worldSpawn(world: WorldId): SpawnPose {
  if (world === "track") return TRACK_SPAWN;
  if (world === "forest") return FOREST_SPAWN;
  if (world === "warehouse") return WAREHOUSE_SPAWN;
  return DEFAULT_SPAWN;
}

/**
 * Wall follow starts beside a real wall, already near the setpoint,
 * so it does not have to sweep across the lane to find one.
 */
const WALL_SPAWN: Record<SpawnWorld, SpawnPose> = {
  city: { x: -14.4, y: 0.84, z: -30, yaw: 0 },
  track: { x: 16, y: 0.84, z: -20, yaw: 0 },
  forest: { x: 19.0, y: 0.84, z: 4, yaw: 0 },
  warehouse: { x: -5, y: 0.84, z: -4.6, yaw: -Math.PI / 2 },
};

/**
 * City avoid stays on the painted START. The drive spawn sits a meter
 * south of that paint so the chevron is ahead of the nose.
 */
const AVOID_SPAWN: Partial<Record<SpawnWorld, SpawnPose>> = {
  city: { x: 5.4, y: 0.84, z: 0, yaw: 0 },
  forest: { x: 0.2, y: 0.84, z: -2, yaw: 0 },
  warehouse: { x: 0, y: 0.84, z: 17.4, yaw: 0 },
};

export function wallSpawn(world: SpawnWorld): SpawnPose {
  return WALL_SPAWN[world];
}

/** On the reference path, nose along the first segment. */
export function pursuitSpawn(world: SpawnWorld): SpawnPose {
  const route = referenceRoute(world);
  const start = route[0] ?? { x: 0, z: 0 };
  const next = route[1] ?? start;
  const yaw = Math.atan2(-(next.x - start.x), next.z - start.z);
  return { x: start.x, y: 0.84, z: start.z, yaw };
}

export function spawnFor(world: SpawnWorld, example: string, mode: "scenario" | "default"): SpawnPose {
  if (mode !== "scenario") return worldSpawn(world);
  if (example === "circle") return circleSpawn(world);
  if (example === "wall") return wallSpawn(world);
  if (example === "pursuit" || example === "mcl" || example === "mcl-global") return pursuitSpawn(world);
  return AVOID_SPAWN[world] ?? worldSpawn(world);
}
