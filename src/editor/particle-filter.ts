import { ACKERMANN_BUGGY } from "../api";

const wheelbase = ACKERMANN_BUGGY.wheelbase;
const maxSteer = ACKERMANN_BUGGY.limits.maxSteering;

/**
 * Monte Carlo localization, then optional pure pursuit on the estimate.
 * `track` starts the cloud near the odometry origin (the true start).
 * `global` spreads it over the free cells and creeps until the cloud collapses.
 */
export function particleFilterSource(mode: "track" | "global"): string {
  const unknown = mode === "global" ? "True" : "False";
  return `# Particle filter localization
#
# sensors.task.map is a floor plan in the same frame as the odometry
# and the path. It is not the car's pose.
#
#   map.resolution     metres per cell
#   map.corner.x/y     odometry coordinates of cell (0, 0)
#   map.width/height
#   map.field          base64, one byte per cell: distance to the nearest
#                      occupied cell, in centimetres. 0 means occupied.
#   map.segments       wall edges, packed x0, y0, x1, y1
#   map.stamp          cache key. The field does not change while you drive.
#
# The filter integrates the odometry delta (wheel speed and gyro, already
# in sensors.odometry.pose) with a little extra noise, weights each particle
# by a lidar likelihood field, and low-variance resamples. The pose we
# steer with is the weighted mean. UNKNOWN_START spreads the cloud over
# the free cells instead of the origin.

import base64
import math
import numpy as np

UNKNOWN_START = ${unknown}
N = 360
BEAMS = 40
SIGMA = 0.5
WHEELBASE = ${wheelbase}
LOOKAHEAD = 3.2
LIDAR_FORWARD = 0.46
A1, A2, A3, A4 = 0.03, 0.04, 0.06, 0.03

rng = np.random.default_rng(1)
particles = None
prev_odom = None
trail = []

def control(sensors):
    global particles, prev_odom
    m = sensors.task.map
    field = distance_field(m)
    if particles is None:
        particles = initial_cloud(m, field)

    pose = sensors.odometry.pose
    if prev_odom is not None:
        apply_motion(particles, prev_odom, (pose.x, pose.y, pose.yaw))
    prev_odom = (pose.x, pose.y, pose.yaw)

    weights = likelihood(particles, sensors, field, m)
    estimate = weighted_mean(particles, weights)
    if 1.0 / max(1e-12, float(np.dot(weights, weights))) < 0.55 * N:
        particles = resample(particles, weights)

    spread = float(np.std(particles[:, 0]) + np.std(particles[:, 1]))
    ready = (not UNKNOWN_START) or (sensors.time > 2.0 and spread < 1.6)
    steer, throttle = pursue(sensors, estimate) if ready else (0.42, 0.16)

    draw.points(particles[:, :2], "#8eb8ff")
    trail.append((float(estimate[0]), float(estimate[1])))
    if len(trail) > 280:
        del trail[: len(trail) - 280]
    if len(trail) >= 2:
        draw.path(trail, "#ff5d73")
    draw.path(
        [
            (float(estimate[0]), float(estimate[1])),
            (float(estimate[0] + math.cos(estimate[2])), float(estimate[1] + math.sin(estimate[2]))),
        ],
        "#ffe08a",
    )
    return steer, throttle

def distance_field(m):
    if getattr(distance_field, "stamp", None) == m.stamp and m.stamp != 0:
        return distance_field.grid
    raw = np.frombuffer(base64.b64decode(m.field), dtype=np.uint8)
    grid = raw.reshape((m.height, m.width)).astype(np.float32) * 0.01
    distance_field.grid = grid
    distance_field.stamp = m.stamp
    return grid

def initial_cloud(m, field):
    cloud = np.zeros((N, 3), dtype=float)
    if UNKNOWN_START:
        free_y, free_x = np.nonzero(field > 0.9)
        if free_x.size == 0:
            free_x = np.zeros(N, dtype=int)
            free_y = np.zeros(N, dtype=int)
        pick = rng.integers(0, free_x.size, N)
        cloud[:, 0] = m.corner.x + (free_x[pick] + 0.5) * m.resolution
        cloud[:, 1] = m.corner.y + (free_y[pick] + 0.5) * m.resolution
        cloud[:, 2] = rng.uniform(-math.pi, math.pi, N)
        return cloud
    cloud[:, 0] = rng.normal(0.0, 0.25, N)
    cloud[:, 1] = rng.normal(0.0, 0.25, N)
    cloud[:, 2] = rng.normal(0.0, 0.06, N)
    return cloud

def apply_motion(cloud, before, after):
    x0, y0, th0 = before
    x1, y1, th1 = after
    dtrans = math.hypot(x1 - x0, y1 - y0)
    if dtrans < 0.012:
        drot1 = 0.0
        drot2 = wrap(th1 - th0)
    else:
        drot1 = wrap(math.atan2(y1 - y0, x1 - x0) - th0)
        drot2 = wrap(th1 - th0 - drot1)
    std1 = math.sqrt(A1 * drot1 * drot1 + A2 * dtrans * dtrans) + 0.002
    std2 = math.sqrt(A3 * dtrans * dtrans + A4 * (drot1 * drot1 + drot2 * drot2)) + 0.01
    std3 = math.sqrt(A1 * drot2 * drot2 + A2 * dtrans * dtrans) + 0.002
    s1 = drot1 + rng.normal(0.0, std1, N)
    s2 = dtrans + rng.normal(0.0, std2, N)
    s3 = drot2 + rng.normal(0.0, std3, N)
    heading = cloud[:, 2] + s1
    cloud[:, 0] += s2 * np.cos(heading)
    cloud[:, 1] += s2 * np.sin(heading)
    cloud[:, 2] = wrap_array(heading + s3)

def likelihood(cloud, sensors, field, m):
    ranges = sensors.lidar.ranges
    angles = sensors.lidar.angles
    step = max(1, int(ranges.shape[0] // BEAMS))
    r = ranges[::step][:BEAMS]
    a = angles[::step][:BEAMS]
    hit = r < (sensors.lidar.max_range - 0.05)
    r = r[hit]
    a = a[hit]
    if r.size < 6 or m.width < 2:
        return np.full(N, 1.0 / N)
    yaw = cloud[:, 2]
    ox = cloud[:, 0] + LIDAR_FORWARD * np.cos(yaw)
    oy = cloud[:, 1] + LIDAR_FORWARD * np.sin(yaw)
    c = np.cos(yaw[:, None] + a[None, :])
    s = np.sin(yaw[:, None] + a[None, :])
    ex = ox[:, None] + r[None, :] * c
    ey = oy[:, None] + r[None, :] * s
    ix = np.floor((ex - m.corner.x) / m.resolution).astype(np.int32)
    iy = np.floor((ey - m.corner.y) / m.resolution).astype(np.int32)
    valid = (ix >= 0) & (ix < m.width) & (iy >= 0) & (iy < m.height)
    d = field[np.clip(iy, 0, m.height - 1), np.clip(ix, 0, m.width - 1)]
    d = np.where(valid, d, 2.4)
    pz = np.exp(-0.5 * (np.minimum(d, 2.2) / SIGMA) ** 2) + 0.09
    logw = np.sum(np.log(pz), axis=1)
    logw -= np.max(logw)
    w = np.exp(logw)
    total = float(np.sum(w))
    if total <= 0.0:
        return np.full(N, 1.0 / N)
    return w / total

def weighted_mean(cloud, weights):
    x = float(np.dot(weights, cloud[:, 0]))
    y = float(np.dot(weights, cloud[:, 1]))
    yaw = math.atan2(float(np.dot(weights, np.sin(cloud[:, 2]))), float(np.dot(weights, np.cos(cloud[:, 2]))))
    return (x, y, yaw)

def resample(cloud, weights):
    cumulative = np.cumsum(weights)
    cumulative[-1] = 1.0
    slots = (np.arange(N) + rng.random()) / N
    index = np.clip(np.searchsorted(cumulative, slots, side="left"), 0, N - 1)
    return cloud[index].copy()

def pursue(sensors, estimate):
    path = sensors.task.path
    if len(path) < 2:
        return 0.0, 0.0
    ahead = np.abs(sensors.lidar.angles) < 0.6
    front = float(np.min(sensors.lidar.ranges[ahead])) if np.any(ahead) else sensors.lidar.max_range
    if pursue.escape > 0:
        pursue.escape -= 1
        draw.path([(point.x, point.y) for point in path], "#7dcea0")
        return pursue.escape_steer, -0.28
    if front < 0.95 and abs(sensors.odometry.speed) < 0.35:
        left = float(np.mean(sensors.lidar.ranges[sensors.lidar.angles > 0.3]))
        right = float(np.mean(sensors.lidar.ranges[sensors.lidar.angles < -0.3]))
        pursue.escape = 16
        pursue.escape_steer = 0.4 if left >= right else -0.4
        draw.path([(point.x, point.y) for point in path], "#7dcea0")
        return pursue.escape_steer, -0.28

    x, y, yaw = estimate
    n = len(path)
    best = pursue.index % n
    best_d = 1e9
    for step in range(min(n, 50)):
        i = (pursue.index + step) % n
        point = path[i]
        dist = math.hypot(point.x - x, point.y - y)
        if dist < best_d:
            best_d = dist
            best = i
    pursue.index = best
    target = path[best]
    for step in range(1, n):
        point = path[(best + step) % n]
        if math.hypot(point.x - x, point.y - y) >= LOOKAHEAD:
            target = point
            break
    dx = target.x - x
    dy = target.y - y
    forward = math.cos(yaw) * dx + math.sin(yaw) * dy
    left = -math.sin(yaw) * dx + math.cos(yaw) * dy
    ld = max(math.hypot(forward, left), 0.4)
    alpha = math.atan2(left, forward)
    curvature = 2.0 * math.sin(alpha) / ld
    steer = math.atan(WHEELBASE * curvature)
    steer = max(-${maxSteer}, min(${maxSteer}, steer))
    speed = sensors.odometry.speed
    if abs(steer) > 0.4:
        target_speed = 1.7
    elif abs(steer) > 0.15:
        target_speed = 2.6
    else:
        target_speed = 4.2
    error = target_speed - speed
    pursue.integral = max(-2.0, min(2.0, pursue.integral + error * sensors.dt))
    throttle = max(-0.55, min(0.72, 0.34 * error + 0.05 * pursue.integral))
    draw.path([(point.x, point.y) for point in path], "#7dcea0")
    draw.points([(target.x, target.y)], "#f4d03f")
    return steer, throttle

def wrap(angle):
    return (angle + math.pi) % (2.0 * math.pi) - math.pi

def wrap_array(angle):
    return (angle + math.pi) % (2.0 * math.pi) - math.pi

pursue.index = 0
pursue.integral = 0.0
pursue.escape = 0
pursue.escape_steer = 0.0
`;
}
