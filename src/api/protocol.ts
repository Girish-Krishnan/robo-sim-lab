import { clamp } from "./math";
import type { ControlCommand, RobotLimits, SensorFrame, TaskInfo } from "./types";

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

function copyTask(task: TaskInfo | undefined): TaskInfo {
  const source = task?.path ?? [];
  const path = [];
  const count = Math.min(source.length, 400);
  for (let i = 0; i < count; i++) {
    const point = source[i];
    path.push({ x: finite(point?.x ?? 0, 0), y: finite(point?.y ?? 0, 0) });
  }
  return { path };
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
