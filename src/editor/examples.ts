import { ACKERMANN_BUGGY } from "../api";

export interface CodeExample {
  id: string;
  label: string;
  source: string;
}

const maxSteer = ACKERMANN_BUGGY.limits.maxSteering;
const wheelbase = ACKERMANN_BUGGY.wheelbase;
const beams = ACKERMANN_BUGGY.sensors.lidar.beams;
const maxRange = ACKERMANN_BUGGY.sensors.lidar.maxRange;

/**
 * Open-loop circle. Constant steer and throttle.
 * Turning radius is about wheelbase / tan(steering).
 */
const circle = `// Circle drive
//
// update(sensors) runs at 20 Hz in a Web Worker. The object you receive
// has only simulated sensors — try Object.keys(sensors). World pose and
// velocity are not included.
//
//   sensors.lidar      { angles, ranges, maxRange }   ${beams} planar beams
//   sensors.odometry   { speed, steeringAngle, pose } wheel odometry (pose drifts)
//   sensors.imu        { yawRate, accel }             specific force, m/s^2
//   sensors.camera     { available: false }           not wired up yet
//   sensors.time, sensors.dt
//
// Return { steering, throttle }:
//   steering  radians, positive = left, clamped to ±${maxSteer}
//   throttle  -1 … 1, positive = forward
//
// Robot frame: x forward, y left, z up. Yaw is counterclockwise from above.
// Code above update() runs once. Variables there persist across ticks.
// Wheelbase is ${wheelbase} m, so this steer is a circle of roughly
// ${wheelbase} / tan(0.34) metres.

let ticks = 0;

function update(sensors) {
  ticks += 1;
  if (ticks === 1) {
    console.log("channels:", Object.keys(sensors).join(", "));
    console.log("odometry:", Object.keys(sensors.odometry).join(", "));
  }
  if (ticks % 20 === 0) {
    const nearest = Math.min(...sensors.lidar.ranges);
    console.log(
      "t=" + sensors.time.toFixed(1),
      "odom", sensors.odometry.speed.toFixed(2), "m/s",
      "steer", sensors.odometry.steeringAngle.toFixed(2),
      "yawRate", sensors.imu.yawRate.toFixed(2),
      "az", sensors.imu.accel.z.toFixed(2),
      "nearest", nearest.toFixed(2), "m",
    );
  }

  return { steering: 0.34, throttle: 0.5 };
}
`;

/**
 * Reactive avoidance: steer away from the nearest return in the forward
 * half-plane, and ease off the throttle as it gets close.
 */
const avoid = `// Lidar avoid
//
// Reads the planar lidar only (angles: 0 is forward, positive is left,
// ranges in metres, ${maxRange} m means no return) and steers away from
// the closest obstacle in front. Odometry and IMU are logged so you can
// see them, but this controller does not use them.
//
// This is a teaching sketch, not a planner. It will get stuck in some
// corners — try changing the distances.

let ticks = 0;

function update(sensors) {
  const { ranges, angles, maxRange } = sensors.lidar;
  let nearest = maxRange;
  let nearestAngle = 0;
  let leftClear = 0;
  let rightClear = 0;

  for (let i = 0; i < ranges.length; i++) {
    const angle = angles[i];
    const range = ranges[i];
    if (angle > 0.05 && angle < Math.PI / 2) leftClear += range;
    if (angle < -0.05 && angle > -Math.PI / 2) rightClear += range;
    if (Math.abs(angle) < Math.PI / 2 && range < nearest) {
      nearest = range;
      nearestAngle = angle;
    }
  }

  let steering = 0;
  if (nearest < 8) {
    // Obstacle on the left (positive angle) → steer right, and vice versa.
    const away = nearestAngle > 0 ? -1 : 1;
    const urgency = (8 - nearest) / 8;
    steering = away * (0.12 + 0.42 * urgency);
  }
  const bias = (leftClear - rightClear) / (leftClear + rightClear + 1);
  steering = Math.max(-0.5, Math.min(0.5, steering + bias * 0.2));

  let throttle = 0.48;
  if (nearest < 5) throttle = 0.28;
  if (nearest < 2.4) throttle = 0.08;

  ticks += 1;
  if (ticks % 20 === 0) {
    console.log(
      "nearest", nearest.toFixed(2), "m at",
      nearestAngle.toFixed(2), "rad",
      "steer", steering.toFixed(2),
      "odom", sensors.odometry.pose.x.toFixed(1), sensors.odometry.pose.y.toFixed(1),
    );
  }

  return { steering, throttle };
}
`;

export const EXAMPLES: CodeExample[] = [
  { id: "circle", label: "Circle drive", source: circle },
  { id: "avoid", label: "Lidar avoid", source: avoid },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0]!;
