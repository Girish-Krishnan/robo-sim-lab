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
# ${wheelbase} / tan(0.34) metres (about 5.4 m). The car is placed on an
# open pad for this example: the south lawn, the oval infield, the meadow
# south of the trees, or the open bay in the warehouse.

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
 * Gap follower. Positive angle and positive steering are the driver's left.
 * The TypeScript copy in tests/avoid.test.ts must stay in step with this.
 */
const avoid = `# Lidar avoid
#
# angles: 0 is straight ahead, positive is the driver's left.
# steering uses the same sign, so a positive number also turns left.
# A range of ${maxRange} m means no return.
#
# Aim at the most open beam in front of the car. When the nose gets close,
# commit to whichever side is clearer. If the bumper is still against
# something, reverse for a short stretch and try again. That keeps the
# car moving instead of stopping with the throttle at zero.

import numpy as np

aim = 0.0
mode = "go"
reverse_ticks = 0
prefer_left = True

def widen(ranges):
    # A one-beam hole between two cones is not wide enough for the car.
    wide = np.array(ranges, dtype=float, copy=True)
    for shift in range(1, 9):
        wide[:-shift] = np.minimum(wide[:-shift], ranges[shift:])
        wide[shift:] = np.minimum(wide[shift:], ranges[:-shift])
    return wide

def control(sensors):
    global aim, mode, reverse_ticks, prefer_left
    ranges = np.asarray(sensors.lidar.ranges, dtype=float)
    angles = np.asarray(sensors.lidar.angles, dtype=float)
    wide = widen(ranges)

    forward = np.abs(angles) < 1.15
    front = np.abs(angles) < 0.4
    front_range = float(np.min(ranges[front])) if np.any(front) else sensors.lidar.max_range

    score = wide * (1.0 - 0.35 * np.abs(angles))
    score = np.where(forward, score, -1.0)
    gap_angle = float(angles[int(np.argmax(score))])
    aim = 0.84 * aim + 0.16 * gap_angle

    left = (angles > 0.3) & (angles < 1.35)
    right = (angles < -0.3) & (angles > -1.35)
    left_clear = float(np.percentile(wide[left], 20)) if np.any(left) else 0.0
    right_clear = float(np.percentile(wide[right], 20)) if np.any(right) else 0.0
    prefer_left = left_clear >= right_clear
    turn = 0.4 if prefer_left else -0.4

    steering = float(np.clip(aim * 0.75, -0.38, 0.38))
    # A completely empty forward view gets a small left arc so the car
    # meets the yard boundary and turns, instead of holding a straight line.
    forward_min = float(np.min(wide[forward])) if np.any(forward) else 0.0
    if front_range > 10.0 and forward_min > 9.0:
        steering = float(np.clip(steering + 0.06, -0.4, 0.4))
    throttle = 0.4
    if front_range < 8.0:
        blend = float(np.clip((8.0 - front_range) / 5.0, 0.0, 1.0))
        steering = float(np.clip((1.0 - blend) * steering + blend * turn, -0.46, 0.46))
        throttle = 0.24

    if mode == "go" and front_range < 1.8:
        mode = "reverse"
        reverse_ticks = 0
    elif mode == "reverse":
        reverse_ticks += 1
        steering = 0.46 if prefer_left else -0.46
        throttle = -0.34
        if reverse_ticks == 14:
            prefer_left = not prefer_left
        if front_range > 3.6 or reverse_ticks > 30:
            mode = "go"
    return steering, throttle
`;

/**
 * Right-wall follower. Negative lidar angles are the driver's right.
 * The TypeScript copy in tests/worlds.test.ts must stay in step with this.
 */
const wall = `# Wall follow
#
# Hold a distance to the wall on the driver's right. Negative angles are
# that side. Positive steering turns left, away from the wall.
#
# On the oval the inner wall starts out on the right, so this laps clockwise.
# The car is started beside that wall. A continuous wall is the case this
# is built for. A single cone or tree trunk is a poor wall: the side beam
# misses it, and the backup below is only there for a nose-in.

import numpy as np

had_wall = False
creep = 0
backup = 0

def sector(ranges, angles, center, width):
    mask = np.abs(angles - center) < width
    if not np.any(mask):
        return float(ranges.max()) if ranges.size else 12.0
    return float(np.percentile(ranges[mask], 30))

def control(sensors):
    global had_wall, creep, backup
    ranges = np.asarray(sensors.lidar.ranges, dtype=float)
    angles = np.asarray(sensors.lidar.angles, dtype=float)
    side = sector(ranges, angles, -1.45, 0.3)
    diag = sector(ranges, angles, -0.75, 0.25)
    front = sector(ranges, angles, 0.0, 0.3)
    if side < 5.5:
        had_wall = True

    # diag is shorter than a parallel wall would allow: the nose is aimed at it.
    yawing_in = side < 8.0 and diag < side * 1.2
    if side < 1.9 or yawing_in:
        steering = 0.26
        throttle = 0.22
    elif had_wall and side > 6.5:
        # The wall we were following ended. Turn right to pick it up again.
        steering = -0.36
        throttle = 0.2
    elif side > 8.0:
        # No wall in view. Drive straight instead of hunting into a pole.
        steering = 0.0
        throttle = 0.36
    elif side > 4.0:
        steering = -0.05
        throttle = 0.34
    else:
        steering = float(np.clip(-0.16 * (side - 2.8), -0.2, 0.2))
        throttle = 0.32
    if front < 2.4 and side < 4.0:
        steering = 0.3
        throttle = 0.16
    steering = float(np.clip(steering, -0.4, 0.4))
    if backup > 0:
        backup -= 1
        return 0.36, -0.32
    if sensors.time > 1.5 and abs(sensors.odometry.speed) < 0.1 and front < 2.8:
        creep += 1
    else:
        creep = 0
    if creep > 8:
        backup = 16
        creep = 0
        return 0.36, -0.32
    return steering, throttle
`;

export const EXAMPLES: CodeExample[] = [
  { id: "circle", label: "Circle drive", source: circle },
  { id: "avoid", label: "Lidar avoid", source: avoid },
  { id: "wall", label: "Wall follow", source: wall },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0]!;
