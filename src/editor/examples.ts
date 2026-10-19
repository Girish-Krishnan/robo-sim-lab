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
 * Gap follower for the yard: steer toward the most open forward beam.
 * Positive angle and positive steering are both the driver's left.
 */
const avoid = `# Lidar avoid
#
# angles: 0 is straight ahead, positive is the driver's left.
# steering uses the same sign, so a positive number also turns left.
# A range of ${maxRange} m means no return.
#
# Each tick, aim at the most open beam in front of the car and slow down
# when that gap gets close. If something is near, commit to whichever
# half of the scan is clearer. This is still a teaching sketch — tight
# corners can trap it — but it will weave the avenue and go around the
# roundabout.

import numpy as np

aim = 0.0
ticks = 0

def control(sensors):
    global aim, ticks
    ranges = np.asarray(sensors.lidar.ranges, dtype=float)
    angles = np.asarray(sensors.lidar.angles, dtype=float)

    forward = np.abs(angles) < 1.2
    # Prefer open space, with a gentle pull back toward straight ahead.
    score = ranges * (1.0 - 0.28 * np.abs(angles))
    score = np.where(forward, score, -1.0)
    index = int(np.argmax(score))
    gap_angle = float(angles[index])
    gap_range = float(ranges[index])
    aim = 0.72 * aim + 0.28 * gap_angle

    left = (angles > 0.12) & (angles < 1.5)
    right = (angles < -0.12) & (angles > -1.5)
    left_clear = float(np.mean(ranges[left])) if np.any(left) else 0.0
    right_clear = float(np.mean(ranges[right])) if np.any(right) else 0.0

    steering = float(np.clip(aim * 0.95, -0.48, 0.48))
    if gap_range < 7.0:
        prefer = 0.42 if left_clear >= right_clear else -0.42
        blend = float(np.clip((7.0 - gap_range) / 7.0, 0.0, 1.0))
        steering = float(np.clip((1.0 - blend) * steering + blend * prefer, -0.5, 0.5))

    throttle = 0.52
    if gap_range < 9.0:
        throttle = 0.36
    if gap_range < 5.0:
        throttle = 0.2
    if gap_range < 2.4:
        throttle = 0.0

    ticks += 1
    if ticks % 20 == 0:
        pose = sensors.odometry.pose
        print(
            f"gap {gap_range:.1f} m at {gap_angle:.2f} rad",
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
