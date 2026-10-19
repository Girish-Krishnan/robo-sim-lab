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
const circle = `# Circle drive
#
# control(sensors) runs at 20 Hz in a Python sandbox. The object you
# receive has only simulated sensors. World pose and velocity are not included.
#
#   sensors.lidar.ranges           NumPy array, ${beams} beams, metres
#   sensors.lidar.angles           NumPy array, radians. 0 is forward, positive is left
#   sensors.lidar.max_range        ${maxRange} m means no return
#   sensors.odometry.speed         noisy wheel speed, m/s
#   sensors.odometry.steering_angle
#   sensors.odometry.pose          .x .y .yaw, integrated from those noisy readings
#   sensors.imu.yaw_rate           rad/s
#   sensors.imu.accel              .x .y .z specific force, m/s^2
#   sensors.time, sensors.dt
#
# Return (steering, throttle), or a dict with those keys:
#   steering  radians, positive = left, clamped to ±${maxSteer}
#   throttle  -1 … 1, positive = forward
#
# Code above control() runs once per Run. Names there persist across ticks.
# Wheelbase is ${wheelbase} m, so this steer is a circle of roughly
# ${wheelbase} / tan(0.34) metres.

import numpy as np

ticks = 0

def control(sensors):
    global ticks
    ticks += 1
    if ticks == 1:
        print("lidar beams", int(sensors.lidar.ranges.shape[0]))
        print("odometry fields: speed, steering_angle, pose")
    if ticks % 20 == 0:
        nearest = float(np.min(sensors.lidar.ranges))
        print(
            f"t={sensors.time:.1f}",
            f"odom {sensors.odometry.speed:.2f} m/s",
            f"steer {sensors.odometry.steering_angle:.2f}",
            f"yaw_rate {sensors.imu.yaw_rate:.2f}",
            f"az {sensors.imu.accel.z:.2f}",
            f"nearest {nearest:.2f} m",
        )
    return 0.34, 0.5
`;

/**
 * Reactive avoidance: steer away from the nearest return in the forward
 * half-plane, and ease off the throttle as it gets close.
 */
const avoid = `# Lidar avoid
#
# Reads the planar lidar only. angles: 0 is forward, positive is left.
# A range of ${maxRange} m means no return. This steers away from the
# closest obstacle in front. Odometry is printed so you can see it, but
# the controller does not use it.
#
# This is a teaching sketch, not a planner. It will get stuck in some
# corners — try changing the distances.

import numpy as np

ticks = 0

def control(sensors):
    global ticks
    ranges = sensors.lidar.ranges
    angles = sensors.lidar.angles
    max_range = sensors.lidar.max_range
    nearest = max_range
    nearest_angle = 0.0
    left_clear = 0.0
    right_clear = 0.0

    for i in range(int(ranges.shape[0])):
        angle = float(angles[i])
        dist = float(ranges[i])
        if 0.05 < angle < np.pi / 2:
            left_clear += dist
        if -np.pi / 2 < angle < -0.05:
            right_clear += dist
        if abs(angle) < np.pi / 2 and dist < nearest:
            nearest = dist
            nearest_angle = angle

    steering = 0.0
    if nearest < 8:
        # Obstacle on the left (positive angle) → steer right, and the reverse.
        away = -1.0 if nearest_angle > 0 else 1.0
        urgency = (8 - nearest) / 8
        steering = away * (0.12 + 0.42 * urgency)
    bias = (left_clear - right_clear) / (left_clear + right_clear + 1)
    steering = float(np.clip(steering + bias * 0.2, -0.5, 0.5))

    throttle = 0.48
    if nearest < 5:
        throttle = 0.28
    if nearest < 2.4:
        throttle = 0.08

    ticks += 1
    if ticks % 20 == 0:
        pose = sensors.odometry.pose
        print(
            f"nearest {nearest:.2f} m at {nearest_angle:.2f} rad",
            f"steer {steering:.2f}",
            f"odom {pose.x:.1f} {pose.y:.1f}",
        )
    return steering, throttle
`;

export const EXAMPLES: CodeExample[] = [
  { id: "circle", label: "Circle drive", source: circle },
  { id: "avoid", label: "Lidar avoid", source: avoid },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0]!;
