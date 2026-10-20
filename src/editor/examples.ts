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
#   sensors.odometry.pose          .x .y .yaw from wheel speed and the gyro, not from steering
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
# Follow the widest opening the buggy actually fits through. Each return
# blocks a wedge about the width of the car, so a one-beam gap between
# two cones does not look open. Speed follows the nearest return in the
# forward half, not only the dead-ahead beam: a cone off to one side is
# still in the bumper's path at speed.
#
# If that nearest return is inside about 1.3 m, the bumper is there
# (the lidar sits ~0.7 m behind it). Back up and steer toward the clearer
# side. A zero throttle does not stop a car that is already at speed, so
# a close return also commands a real brake. A stopped car does not yaw,
# so if the nose is blocked and a side is open the car creeps into that
# opening instead of sitting.

import numpy as np

HALF = 1.35
aim = 0.0
reverse = 0

def inflate(ranges, angles):
    # A return at range r blocks beams within atan(HALF / r) of it.
    wide = np.array(ranges, dtype=float, copy=True)
    span = np.arctan(HALF / np.maximum(ranges, 0.45))
    for i in range(ranges.size):
        near = np.abs(angles - angles[i]) <= span[i]
        wide[near] = np.minimum(wide[near], ranges[i])
    return wide

def control(sensors):
    global aim, reverse
    ranges = np.asarray(sensors.lidar.ranges, dtype=float)
    angles = np.asarray(sensors.lidar.angles, dtype=float)
    wide = inflate(ranges, angles)

    front = np.abs(angles) < 0.95
    front_range = float(np.min(ranges[front])) if np.any(front) else sensors.lidar.max_range
    # Stay pointed down the open lane. Look out to the sides only once
    # something is actually in front, otherwise the car dives into a
    # side gap (the trees, a sidewalk) while the lane is still clear.
    window = 1.15 if front_range < 6.0 else 0.5
    forward = np.abs(angles) < window

    score = np.where(forward, wide * np.cos(angles * 0.9), -1.0)
    gap = float(angles[int(np.argmax(score))])
    aim = 0.6 * aim + 0.4 * gap

    left = (angles > 0.15) & (angles < 1.2)
    right = (angles < -0.15) & (angles > -1.2)
    left_clear = float(np.percentile(wide[left], 30)) if np.any(left) else 0.0
    right_clear = float(np.percentile(wide[right], 30)) if np.any(right) else 0.0
    turn = 0.5 if left_clear >= right_clear else -0.5

    speed = float(sensors.odometry.speed)
    if reverse > 0:
        reverse -= 1
        return turn, -0.28
    # Bumper distance. Reverse before the contact, and keep reversing long
    # enough to yaw the nose into the opening.
    if front_range < 1.55:
        reverse = 8
        return turn, -0.28
    # A stopped car does not yaw. If a side is open, roll into it. Reversing
    # here just rocks the car against the same obstacle.
    if abs(speed) < 0.35 and max(left_clear, right_clear) > front_range + 0.8:
        return turn, 0.2

    steering = float(np.clip(aim * 1.15, -0.5, 0.5))
    # Throttle near 0 only holds a light brake. Shed speed with a negative
    # command while a return is still several metres out.
    if front_range < 8.0 and speed > 3.0:
        throttle = -0.55
    elif front_range < 5.0 and speed > 1.8:
        throttle = -0.35
    else:
        throttle = float(np.clip((front_range - 3.0) / 12.0, 0.08, 0.3))
    if front_range < 5.0:
        blend = float(np.clip((5.0 - front_range) / 3.0, 0.0, 1.0))
        steering = float(np.clip((1.0 - blend) * steering + blend * turn, -0.52, 0.52))
    return steering, throttle
`;

/**
 * Right-wall follower. Negative lidar angles are the driver's right.
 * The TypeScript copy in tests/worlds.test.ts must stay in step with this.
 */
const wall = `# Wall follow
#
# Hold a distance to whatever is on the driver's right. Negative angles
# are that side. Positive steering turns left, which is away from the wall.
#
# Two beams estimate the wall. The -90 deg beam is the perpendicular
# distance. The -45 deg beam, compared with it, gives the wall angle:
# alpha < 0 means the nose is aimed into the wall. Steering on a straight
# is a PD law on that distance, with -alpha as the rate term, plus a
# short lookahead.
#
# An outside corner is a quarter circle about the corner point. The turn
# has to start once the -90 deg beam has passed the end of the wall, and
# the radius has to match the standoff (steer = atan(wheelbase / gap)).
# Turning earlier, or with a wider radius, cuts the corner. The -45 deg
# beam going long is the cue to slow down so that turn starts from a creep.
#
# If the forward beam is inside about a metre, the bumper is already
# there (the lidar sits ~0.7 m behind it). Back up with the wheels
# turned right. In reverse that yaws the nose left, off the wall.
#
# The car is started beside a real wall in each world: the oval's inner
# wall, a lot fence in the city, the forest corridor fence, a shelf row
# in the warehouse. A lone cone is not a wall, and this does not chase one.

import math
import numpy as np

TARGET = 3.2
LOOK = 1.8
KP = 0.16
KD = 0.55
WHEELBASE = 1.9
# follow the wall, coast past the corner, then arc onto the next face.
phase = "follow"
phase_ticks = 0
reverse = 0
gap = TARGET
locked = False
saw_preview = False

def beam(ranges, angles, center, width):
    mask = np.abs(angles - center) < width
    if not np.any(mask):
        return 12.0
    return float(np.median(ranges[mask]))

def corner_steer():
    # Radius matches the standoff, so the arc is centred on the corner.
    return -min(0.52, math.atan(WHEELBASE / max(gap, 3.15)))

def control(sensors):
    global phase, phase_ticks, reverse, gap, locked, saw_preview
    ranges = np.asarray(sensors.lidar.ranges, dtype=float)
    angles = np.asarray(sensors.lidar.angles, dtype=float)
    side = beam(ranges, angles, -math.pi / 2, 0.14)
    diag = beam(ranges, angles, -math.pi / 4, 0.14)
    # Earlier than -45 deg, used only to shed speed before the corner.
    preview = beam(ranges, angles, -0.35, 0.1)
    front = beam(ranges, angles, 0.0, 0.32)

    # alpha < 0 means the nose is aimed into the right-hand wall.
    delta = math.pi / 4
    alpha = math.atan2(diag * math.cos(delta) - side, diag * math.sin(delta))
    dist = max(0.3, side * math.cos(min(0.8, max(-0.8, alpha))))
    future = dist + LOOK * math.sin(alpha)
    # Both beams on the same face: remember how far off the wall we are.
    # Only a steady straight updates the radius. Readings mid-corner are
    # the next face arriving at a slant, and chasing them widens the arc
    # until it cuts the corner.
    if (
        phase == "follow"
        and side < 6.5
        and diag < side * 2.0
        and abs(alpha) < 0.35
        and abs(dist - TARGET) < 1.0
    ):
        gap = 0.75 * gap + 0.25 * dist
        if abs(dist - TARGET) < 0.55:
            locked = True

    # The bumper is about 0.7 m ahead of the lidar, so a forward reading
    # near 1 m is already a contact. Back up before the nose stays planted.
    buried = front < 1.05 or (side < 1.4 and alpha < -0.45) or (phase == "turn" and front < 1.3 and phase_ticks > 8)
    if reverse > 0:
        reverse -= 1
        # Wheels right while reversing: yaw rate flips with speed, so the
        # nose swings left, away from the wall.
        return -0.4, -0.26
    if buried:
        reverse = 16
        phase = "follow"
        phase_ticks = 0
        return -0.4, -0.26

    if phase == "turn":
        phase_ticks += 1
        # A real new face: parallel, both beams on it, and the shallow beam
        # still sees it continuing. Time alone is not enough at a creep.
        on_new_face = (
            phase_ticks > 20
            and abs(side - TARGET) < 0.9
            and abs(alpha) < 0.22
            and diag < side * 1.65
            and preview < max(side, 0.5) / math.sin(0.35) * 1.3
        )
        if on_new_face or phase_ticks > 160:
            phase = "follow"
            phase_ticks = 0
            return 0.0, 0.1
        return corner_steer(), 0.12

    # The -90 deg beam has gone past the end. A few ticks of straight
    # driving let the rear axle reach the corner, then the arc starts.
    # Gradual slip still counts. Requiring a one-tick jump misses a car
    # that yaws off the wall over a second and then has nothing beside it.
    lost = locked and gap < 4.2 and side > 6.2
    if phase == "coast" or (phase == "follow" and lost):
        if phase != "coast":
            phase = "coast"
            phase_ticks = 0
        phase_ticks += 1
        if phase_ticks > 6:
            phase = "turn"
            phase_ticks = 0
            return corner_steer(), 0.08
        return 0.0, 0.0

    # The wall is ending. Hold a straight line and engine-brake. Steering
    # here, from a half-lost -45 deg beam, turns the nose into the corner.
    parallel_preview = max(side, 0.5) / math.sin(0.35)
    # Only coast once the car is actually parallel at the setpoint. Freezing
    # the steer while it is still yawing off the wall walks it away from the
    # fence, and a thin fence then drops out of the shallow beam.
    settled = abs(side - TARGET) < 0.35 and abs(alpha) < 0.12
    # A short wall never shows up on the shallow beam. Only trust that beam
    # after it has actually been on the wall.
    if settled and preview < 10.5:
        saw_preview = True
    corner_soon = locked and settled and side < 5.5 and (
        diag > max(6.2, side * 1.7) or (saw_preview and preview > min(11.2, parallel_preview + 1.6))
    )
    if corner_soon:
        speed = float(sensors.odometry.speed)
        # Brake down to a creep. Holding the brake past that drives in reverse
        # and the car never reaches the corner. Steering here, off a beam that
        # is already leaving the wall, turns the nose into the corner.
        throttle = -0.45 if speed > 2.4 else (0.0 if speed > 1.7 else 0.14)
        return 0.0, throttle

    if side < 9.0 and diag < 11.0:
        steering = KP * (TARGET - future) - KD * alpha
        throttle = 0.2
    else:
        steering = 0.0
        throttle = 0.1
    if dist > TARGET + 1.0:
        steering = max(steering, -0.16)
    steering = float(np.clip(steering, -0.4, 0.4))
    if front < 4.5:
        throttle = min(throttle, 0.16)
    if front < 2.2:
        throttle = 0.08
    return steering, throttle
`;

export const EXAMPLES: CodeExample[] = [
  { id: "circle", label: "Circle drive", source: circle },
  { id: "avoid", label: "Lidar avoid", source: avoid },
  { id: "wall", label: "Wall follow", source: wall },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0]!;
