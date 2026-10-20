import { clamp } from "./math";
import type { ControlCommand, KnownMap, RobotLimits, SensorFrame, TaskInfo } from "./types";

/**
 * Keys that must never appear anywhere in a message posted to user code.
 * Enforced on the published frame, and covered by tests.
 */
export const BANNED_SENSOR_KEYS = [
  "groundTruth",
  "groundtruth",
  "truePose",
  "trueVelocity",
  "linvel",
  "angvel",
  "translation",
  "quaternion",
  "worldPose",
  "worldVelocity",
  "position",
  "velocity",
  "rigidBody",
  "chassis",
  "image",
  "pixels",
  "origin",
] as const;

/**
 * Keys a published frame is allowed to carry. `task` and `path` are a map
 * the world gives the program, like a lane centerline. They are not a pose.
 * Ground-truth pose, velocity, and pixels are absent on purpose.
 */
export const ALLOWED_SENSOR_KEYS = [
  "time",
  "dt",
  "lidar",
  "angles",
  "ranges",
  "maxRange",
  "odometry",
  "speed",
  "steeringAngle",
  "pose",
  "x",
  "y",
  "yaw",
  "imu",
  "yawRate",
  "accel",
  "z",
  "camera",
  "available",
  "width",
  "height",
  "task",
  "path",
  "map",
  "resolution",
  "corner",
  "field",
  "segments",
  "stamp",
] as const;

const BANNED = new Set<string>(BANNED_SENSOR_KEYS.map((key) => key.toLowerCase()));

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Copy the student-visible fields and nothing else.
 * Extra properties on the input — including ground-truth pose — are dropped.
 * The camera channel is forced to the stub so a pixel buffer cannot ride along.
 */
export function publishSensorFrame(frame: SensorFrame): SensorFrame {
  const count = Math.min(frame.lidar.angles.length, frame.lidar.ranges.length);
  const angles: number[] = [];
  const ranges: number[] = [];
  const maxRange = finite(frame.lidar.maxRange, 0);
  for (let i = 0; i < count; i++) {
    angles.push(finite(frame.lidar.angles[i] ?? 0, 0));
    const range = finite(frame.lidar.ranges[i] ?? maxRange, maxRange);
    ranges.push(clamp(range, 0, maxRange));
  }
  return {
    time: finite(frame.time, 0),
    dt: finite(frame.dt, 0),
    lidar: { angles, ranges, maxRange },
    odometry: {
      speed: finite(frame.odometry.speed, 0),
      steeringAngle: finite(frame.odometry.steeringAngle, 0),
      pose: {
        x: finite(frame.odometry.pose.x, 0),
        y: finite(frame.odometry.pose.y, 0),
        yaw: finite(frame.odometry.pose.yaw, 0),
      },
    },
    imu: {
      yawRate: finite(frame.imu.yawRate, 0),
      accel: {
        x: finite(frame.imu.accel.x, 0),
        y: finite(frame.imu.accel.y, 0),
        z: finite(frame.imu.accel.z, 0),
      },
    },
    camera: { available: false, width: 0, height: 0 },
    task: copyTask(frame.task),
  };
}

export const EMPTY_MAP: KnownMap = {
  resolution: 0.5,
  corner: { x: 0, y: 0 },
  width: 0,
  height: 0,
  field: "",
  segments: [],
  stamp: 0,
};

function copyTask(task: TaskInfo | undefined): TaskInfo {
  const source = task?.path ?? [];
  const path = [];
  const count = Math.min(source.length, 400);
  for (let i = 0; i < count; i++) {
    const point = source[i];
    path.push({ x: finite(point?.x ?? 0, 0), y: finite(point?.y ?? 0, 0) });
  }
  return { path, map: copyMap(task?.map) };
}

function copyMap(map: KnownMap | undefined): KnownMap {
  if (!map) return EMPTY_MAP;
  const width = Math.max(0, Math.min(256, Math.round(finite(map.width, 0))));
  const height = Math.max(0, Math.min(256, Math.round(finite(map.height, 0))));
  const source = map.segments ?? [];
  const segments: number[] = [];
  const count = Math.min(source.length, 2000);
  for (let i = 0; i < count; i++) segments.push(finite(source[i] ?? 0, 0));
  return {
    resolution: finite(map.resolution, 0.5),
    corner: { x: finite(map.corner?.x ?? 0, 0), y: finite(map.corner?.y ?? 0, 0) },
    width,
    height,
    field: sanitizeField(map.field),
    segments,
    stamp: finite(map.stamp, 0) >>> 0,
  };
}

function sanitizeField(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length > 120000) return "";
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(trimmed)) return "";
  return trimmed;
}

export function assertNoBannedKeys(value: unknown, path = "sensors"): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertNoBannedKeys(value[i], `${path}[${i}]`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (BANNED.has(key.toLowerCase())) {
      throw new Error(`Refusing to send "${path}.${key}" to user code.`);
    }
    assertNoBannedKeys((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

export function clampCommand(
  command: Partial<ControlCommand> | null | undefined,
  limits: RobotLimits,
): ControlCommand {
  const steering = Number(command?.steering);
  const throttle = Number(command?.throttle);
  return {
    steering: clamp(Number.isFinite(steering) ? steering : 0, -limits.maxSteering, limits.maxSteering),
    throttle: clamp(
      Number.isFinite(throttle) ? throttle : 0,
      limits.minThrottle,
      limits.maxThrottle,
    ),
  };
}
