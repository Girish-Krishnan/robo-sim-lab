import { ACKERMANN_BUGGY } from "../api";
import { particleFilterSource } from "./particle-filter";
import { programPreamble } from "./program-header";

export interface CodeExample {
  id: string;
  label: string;
  blurb: string;
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
const circle = `${programPreamble("circle")}# Circle drive
#
# control(sensors) runs at 20 Hz in a Python sandbox. The object you
# receive has only simulated sensors. World pose and velocity are not included.
#
#   sensors.lidar.ranges           NumPy array, ${beams} beams, meters
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
# ${wheelbase} / tan(0.34) meters (about 5.4 m). The car is placed on an
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
const avoid = `${programPreamble("avoid")}# Lidar avoid
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
# (the lidar sits ~0.7 m behind it). Back up a short way and steer
# toward the clearer side.
#
# A corner is different from a close cone. If the car has barely moved
# for a couple of seconds, the way out is the widest gap in the whole
# scan, often beside the nose rather than ahead of it. Reverse with the
# opposite steer (yaw rate flips with speed) so the nose swings toward
# that gap, then drive into it. Twitching in place is not exploring.
#
# Among trees the forward ranges are chopped up, and the score then
# prefers the current heading plus a slow wander. That is a bias, not
# a recorded path, so the car weaves through gaps instead of lapping
# one fence. An open avenue does not look like that, and it stays in lane.

import math
import numpy as np

def tunables():
    global HALF
    HALF = 1.35

tunables()
aim = 0.0
reverse = 0
phase = "run"
phase_ticks = 0
cooldown = 0
held_sign = 1.0
anchor_x = 0.0
anchor_y = 0.0
anchor_t = 0.0
saw_anchor = False

def inflate(ranges, angles):
    # A return at range r blocks beams within atan(HALF / r) of it.
    wide = np.array(ranges, dtype=float, copy=True)
    span = np.arctan(HALF / np.maximum(ranges, 0.45))
    for i in range(ranges.size):
        near = np.abs(angles - angles[i]) <= span[i]
        wide[near] = np.minimum(wide[near], ranges[i])
    return wide

def keep_misses(ranges, max_range):
    # A beam at max_range did not hit anything. Leave it there so it counts as far, not as a wall.
    return np.where(ranges >= max_range - 1e-6, max_range, ranges)

def control(sensors):
    global aim, reverse, phase, phase_ticks, cooldown, held_sign
    global anchor_x, anchor_y, anchor_t, saw_anchor
    ranges = np.asarray(sensors.lidar.ranges, dtype=float)
    angles = np.asarray(sensors.lidar.angles, dtype=float)
    ranges = keep_misses(ranges, sensors.lidar.max_range)
    wide = inflate(ranges, angles)

    front = np.abs(angles) < 0.95
    front_range = float(np.min(ranges[front])) if np.any(front) else sensors.lidar.max_range
    # Trees chop the forward ranges up. A wall or an empty road does not.
    fwd = np.abs(angles) < 1.05
    fwd_ranges = ranges[fwd]
    # Trunks chop the scan into many range jumps. A wall is one flat return.
    if fwd_ranges.size > 20:
        jumps = int(np.sum(np.abs(np.diff(fwd_ranges)) > 1.5))
    else:
        jumps = 0
    weave = jumps > 8 and float(np.mean(fwd_ranges)) < 10.0
    if weave:
        # A long fence beside the car would win on raw width. Weight gaps
        # near a slowly wandering heading so the car threads trunks instead.
        desired = 0.35 * math.sin(sensors.time * 0.09)
        window = 1.25
        pref = np.exp(-0.5 * ((angles - desired) / 0.75) ** 2)
    else:
        window = 1.15 if front_range < 6.0 else 0.5
        pref = np.cos(angles * 0.9)
    forward = np.abs(angles) < window
    score = np.where(forward, wide * pref, -1.0)
    gap = float(angles[int(np.argmax(score))])
    aim = 0.6 * aim + 0.4 * gap
    # Widest opening anywhere in the scan. A corner's exit is often beside
    # the nose, outside the forward window the gap follower uses.
    exit_angle = float(angles[int(np.argmax(wide))])

    left = (angles > 0.15) & (angles < 1.2)
    right = (angles < -0.15) & (angles > -1.2)
    left_clear = float(np.percentile(wide[left], 30)) if np.any(left) else 0.0
    right_clear = float(np.percentile(wide[right], 30)) if np.any(right) else 0.0
    turn = 0.5 if left_clear >= right_clear else -0.5

    speed = float(sensors.odometry.speed)
    pose = sensors.odometry.pose
    if not saw_anchor:
        anchor_x, anchor_y, anchor_t = pose.x, pose.y, sensors.time
        saw_anchor = True
    if sensors.time - anchor_t > 2.5:
        moved = math.hypot(pose.x - anchor_x, pose.y - anchor_y)
        stalled = moved < 1.2 and abs(speed) < 0.55
        anchor_x, anchor_y, anchor_t = pose.x, pose.y, sensors.time
    else:
        stalled = False
    if cooldown > 0:
        cooldown -= 1

    # Back out of a stall, yaw toward the widest gap while still reversing
    # (steer sign flips with speed), then drive into that gap. The gap is
    # re-read each tick because a body angle goes stale as the car yaws.
    if phase == "back":
        phase_ticks += 1
        rear = np.abs(angles) > 2.0
        rear_range = float(np.min(ranges[rear])) if np.any(rear) else sensors.lidar.max_range
        # The tail is about 1.6 m behind the lidar, and the rear 90 deg is
        # not scanned. A side-rear beam inside 1.7 m means that corner is
        # already at the bumper. Stop backing before the second contact.
        if phase_ticks > 40 or (phase_ticks > 10 and rear_range < 1.7):
            phase = "spin" if abs(exit_angle) > 0.8 else "go"
            phase_ticks = 0
        return float(np.clip(0.22 * held_sign, -0.3, 0.3)), -0.4
    if phase == "spin":
        phase_ticks += 1
        if abs(exit_angle) < 0.6 or phase_ticks > 50:
            phase = "go"
            phase_ticks = 0
        else:
            return float(np.clip(-exit_angle, -0.52, 0.52)), -0.4
    if phase == "go":
        phase_ticks += 1
        if phase_ticks > 50:
            phase = "run"
            phase_ticks = 0
            cooldown = 30
        return float(np.clip(exit_angle * 0.9, -0.5, 0.5)), 0.26
    if (stalled or (front_range < 2.0 and left_clear < 3.0 and right_clear < 3.0 and abs(speed) < 1.0)) and cooldown == 0:
        held_sign = 1.0 if left_clear < right_clear else -1.0
        phase = "back"
        phase_ticks = 0
        return float(np.clip(0.22 * held_sign, -0.3, 0.3)), -0.36

    if reverse > 0:
        rear = np.abs(angles) > 2.0
        rear_range = float(np.min(ranges[rear])) if np.any(rear) else sensors.lidar.max_range
        if rear_range < 1.7:
            reverse = 0
        else:
            reverse -= 1
            return turn, -0.28
    # Creep into a dead end is a contact the 1.55 m check still allows,
    # because the bumper arrives while the car is already slow. Back up
    # sooner, and only then: a fast straight (the oval) does not reverse.
    if front_range < 1.55 or ((not weave) and abs(speed) < 0.8 and front_range < 2.15):
        reverse = 12
        return turn, -0.28
    # A stopped car does not yaw. If a side is open, roll into it.
    if abs(speed) < 0.35 and max(left_clear, right_clear) > front_range + 0.8:
        return turn, 0.2

    steering = float(np.clip(aim * 1.15, -0.5, 0.5))
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
const wall = `${programPreamble("wall")}# Wall follow
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
# Speed is scheduled on front clearance and curvature. A parallel wall
# and a long forward beam is a straight, and the car runs. The same beams
# going long, or a return a few meters ahead, is a corner: brake to a
# creep, then take the arc. Creeping the straights as well does not
# finish an oval lap.
#
# If the forward beam is inside about a meter, the bumper is already
# there (the lidar sits ~0.7 m behind it). Back up with the wheels
# turned right. In reverse that yaws the nose left, off the wall.
#
# The car is started beside a real wall in each world: the oval's inner
# wall, a lot fence in the city, the forest corridor fence, a shelf row
# in the warehouse. A lone cone is not a wall, and this does not chase one.

import math
import numpy as np

def tunables():
    global TARGET, LOOK, KP, KD
    TARGET = 3.2
    LOOK = 1.8
    KP = 0.16
    KD = 0.55

tunables()
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

def wall_error(side, diag, look):
    # alpha < 0 means the nose is aimed into the right-hand wall.
    delta = math.pi / 4
    alpha = math.atan2(diag * math.cos(delta) - side, diag * math.sin(delta))
    dist = max(0.3, side * math.cos(min(0.8, max(-0.8, alpha))))
    future = dist + look * math.sin(alpha)
    return alpha, dist, future

def wall_steer(target, future, alpha, kp, kd):
    return kp * (target - future) - kd * alpha

def corner_steer():
    # Radius matches the standoff, so the arc is centered on the corner.
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
    alpha, dist, future = wall_error(side, diag, LOOK)
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
    # A fast car cannot wait until it is perfectly settled to start braking.
    # Steering stays at zero either way: a half-lost beam turns the nose in.
    speed = float(sensors.odometry.speed)
    ending = diag > max(6.2, side * 1.7) or (saw_preview and preview > min(11.2, parallel_preview + 1.6))
    corner_soon = locked and side < 5.5 and ending and (settled or speed > 3.0)
    if corner_soon:
        # The straight may be near 5 m/s. The shallow beam sees the wall end
        # several meters early. Shed that before the arc. Holding the brake
        # once the car is already slow drives it in reverse.
        if speed > 3.6:
            throttle = -0.72
        elif speed > 2.3:
            throttle = -0.5
        elif speed > 1.55:
            throttle = 0.0
        else:
            throttle = 0.14
        return 0.0, throttle

    if side < 9.0 and diag < 11.0:
        steering = wall_steer(TARGET, future, alpha, KP, KD)
    else:
        steering = 0.0
    if dist > TARGET + 1.0:
        steering = max(steering, -0.16)
    steering = float(np.clip(steering, -0.4, 0.4))
    # Open straight: run. A bend, or a return inside a few meters: slow.
    curvature = abs(alpha) + 0.55 * abs(steering)
    if front > 8.0 and curvature < 0.14:
        target = 5.4
    elif front > 5.5 and curvature < 0.28:
        target = 3.0
    else:
        target = 2.0
    if front < 4.0:
        target = min(target, 1.7)
    if speed < target - 0.4:
        throttle = 0.46
    elif speed > target + 0.5:
        throttle = -0.3
    else:
        throttle = 0.2
    return steering, throttle
`;

/**
 * Pure pursuit on the path the world publishes.
 * Steering is the curvature that reaches a lookahead point; speed is a
 * small PID. Drawings are the student's own estimate, not the true pose.
 */
const pursuit = `${programPreamble("pursuit")}# Pure pursuit
#
# The world hands you a route the way a planner would hand a real robot a
# lane: sensors.task.path is a list of waypoints in the same frame as
# sensors.odometry.pose. That pose is dead reckoning. Wheel-speed bias
# scales the distance, and the gyro bias walks the heading. Neither is
# corrected here, so the estimate drifts off the car. Cross-track error
# against the true trail grows with time. The path plot in the eval shows
# that gap. A later lesson localizes; this one does not.
#
# Wheelbase is ${wheelbase} m. Positive steering is a left turn.
# draw.* posts shapes back to the view. It does not return information.

import math

WHEELBASE = ${wheelbase}
MAX_STEER = ${maxSteer}

def tunables():
    global LOOKAHEAD
    LOOKAHEAD = 3.2

tunables()

class Run:
    def __init__(self):
        self.index = 0
        self.integral = 0.0
        self.escape = 0
        self.escape_steer = 0.0

run = Run()

def init(sensors):
    global run
    run = Run()

def pursuit_steer(pose, path, best, lookahead):
    n = len(path)
    target = path[best]
    for step in range(1, n):
        point = path[(best + step) % n]
        if math.hypot(point.x - pose.x, point.y - pose.y) >= lookahead:
            target = point
            break
    dx = target.x - pose.x
    dy = target.y - pose.y
    # Body frame: +x forward, +y left. Yaw is the integral of the gyro.
    forward = math.cos(pose.yaw) * dx + math.sin(pose.yaw) * dy
    left = -math.sin(pose.yaw) * dx + math.cos(pose.yaw) * dy
    ld = max(math.hypot(forward, left), 0.4)
    alpha = math.atan2(left, forward)
    curvature = 2.0 * math.sin(alpha) / ld
    steer = math.atan(WHEELBASE * curvature)
    steer = max(-MAX_STEER, min(MAX_STEER, steer))
    return steer, target, curvature, ld

def control(sensors):
    path = sensors.task.path
    if len(path) < 2:
        return 0.0, 0.0

    pose = sensors.odometry.pose
    # The pose never feels a contact. If the bumper is in a trunk, hold a
    # short reverse instead of driving the same point into it every tick.
    ahead = np.abs(sensors.lidar.angles) < 0.6
    front = float(np.min(sensors.lidar.ranges[ahead])) if np.any(ahead) else sensors.lidar.max_range
    if run.escape > 0:
        run.escape -= 1
        draw.path([{"x": point.x, "y": point.y} for point in path], "#7dcea0")
        return run.escape_steer, -0.28
    if front < 0.95 and abs(sensors.odometry.speed) < 0.35:
        left = float(np.mean(sensors.lidar.ranges[sensors.lidar.angles > 0.3]))
        right = float(np.mean(sensors.lidar.ranges[sensors.lidar.angles < -0.3]))
        run.escape = 16
        run.escape_steer = 0.4 if left >= right else -0.4
        draw.path([{"x": point.x, "y": point.y} for point in path], "#7dcea0")
        return run.escape_steer, -0.28

    n = len(path)
    # Search forward from the last progress index so a loop that folds
    # back on itself is not jumped onto the return leg.
    best = run.index % n
    best_d = 1e9
    for step in range(min(n, 50)):
        i = (run.index + step) % n
        point = path[i]
        dist = math.hypot(point.x - pose.x, point.y - pose.y)
        if dist < best_d:
            best_d = dist
            best = i
    run.index = best
    steer, target, curvature, ld = pursuit_steer(pose, path, best, LOOKAHEAD)

    # Slower into a bend. The integral is clamped so a long straight
    # does not wind up and then overshoot the corner.
    speed = sensors.odometry.speed
    if abs(steer) > 0.4:
        target_speed = 1.7
    elif abs(steer) > 0.15:
        target_speed = 2.6
    else:
        target_speed = 4.4
    error = target_speed - speed
    run.integral = max(-2.0, min(2.0, run.integral + error * sensors.dt))
    throttle = 0.34 * error + 0.05 * run.integral
    throttle = max(-0.55, min(0.75, throttle))

    # The path, the lookahead, and the arc the steering command would drive.
    # All three are in the odometry frame. As the gyro drifts, the lookahead
    # drawn on the ground walks off the real car.
    draw.path([{"x": point.x, "y": point.y} for point in path], "#7dcea0")
    draw.points([{"x": target.x, "y": target.y}], "#f4d03f")
    draw.path(command_arc(pose, curvature, ld), "#f5b041")
    draw.text(target.x, target.y, "lookahead", "#f4f1ea")
    return steer, throttle

def command_arc(pose, curvature, length):
    points = []
    steps = 10
    for i in range(steps + 1):
        s = length * i / steps
        if abs(curvature) < 1e-3:
            fx, ly = s, 0.0
        else:
            fx = math.sin(curvature * s) / curvature
            ly = (1.0 - math.cos(curvature * s)) / curvature
        c = math.cos(pose.yaw)
        sy = math.sin(pose.yaw)
        points.append({
            "x": pose.x + c * fx - sy * ly,
            "y": pose.y + sy * fx + c * ly,
        })
    return points
`;

export const EXAMPLES: CodeExample[] = [
  { id: "circle", label: "Circle drive", blurb: "Hold a fixed steer and draw a circle on an open pad.", source: circle },
  { id: "avoid", label: "Lidar avoid", blurb: "Steer toward the widest gap the car can fit through.", source: avoid },
  { id: "wall", label: "Wall follow", blurb: "Hold a distance from the wall on the driver's right.", source: wall },
  { id: "pursuit", label: "Pure pursuit", blurb: "Steer an arc toward a point a few meters along the path.", source: pursuit },
  { id: "mcl", label: "PF pursuit", blurb: "Follow the path using a particle-filter pose instead of raw odometry.", source: particleFilterSource("track") },
  { id: "mcl-global", label: "PF kidnapped", blurb: "Start with no idea where the car is, then drive once the cloud collapses.", source: particleFilterSource("global") },
];
