import { ACKERMANN_BUGGY } from "../api";

const wheelbase = ACKERMANN_BUGGY.wheelbase;
const maxSteer = ACKERMANN_BUGGY.limits.maxSteering;

/**
 * Monte Carlo localization, then optional pure pursuit on the estimate.
 * `track` starts the cloud near the odometry origin (the true start).
 * `global` scatters most of the cloud over free space, keeps a route lattice
 * so a few hundred poses can still land on the car, and creeps with the
 * right-wall follower until one mode owns the cloud. Pursuit is the tracking
 * controller, unchanged, and it starts only after that.
 */
export function particleFilterSource(mode: "track" | "global"): string {
  const unknown = mode === "global" ? "True" : "False";
  const count = mode === "global" ? 720 : 360;
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
#   map.grid           metres, shape (height, width). The host decodes
#                      field once, before the timed step. 0 is occupied.
#
# The filter integrates the odometry delta (wheel speed and gyro, already
# in sensors.odometry.pose) with a little extra noise, weights each particle
# by a lidar likelihood field, and low-variance resamples. With a known
# start the pose we steer with is the weighted mean.
#
# UNKNOWN_START is a kidnapped robot. Most particles are free cells with
# random headings. A minority sit on the route at twelve headings, because
# a few hundred uniform poses do not cover x, y, and yaw. The car creeps
# with the right-wall follower (same gains as the wall lesson, throttle
# capped) until one particle holds about a tenth of the weight. The cloud
# then collapses around that pose and pure pursuit takes over. The oval's
# two straights share that weight; the winner on the first scans is one
# straight, not a pose known to a decimetre, and along-track error stays
# on the order of the tracking filter. The warehouse bay is flatter, so
# the creep continues until a peak appears. If the short-term likelihood
# average later falls below the long-term one, resample mixes in random
# free-space particles. A pose that has left the route hands the wheel
# back to the wall follower.

import base64
import math
import numpy as np

UNKNOWN_START = ${unknown}
N = ${count}
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

def init(sensors):
    global particles, prev_odom, trail, rng, held_pose
    global wall_phase, wall_ticks, wall_reverse, wall_gap, wall_held, wall_preview
    particles = None
    prev_odom = None
    trail = []
    pursue.index = 0
    pursue.integral = 0.0
    pursue.escape = 0
    pursue.escape_steer = 0.0
    augment.fast = None
    augment.slow = None
    explore.moved = 0.0
    explore.locked = 0
    explore.ticks = 0
    wall_phase = "follow"
    wall_ticks = 0
    wall_reverse = 0
    wall_gap = 3.2
    wall_held = False
    wall_preview = False
    held_pose = None
    rng = np.random.default_rng(1)
    distance_field(sensors.task.map)

def control(sensors):
    global particles, prev_odom, held_pose
    m = sensors.task.map
    field = distance_field(m)
    if particles is None:
        particles = initial_cloud(m, field, sensors.task.path)

    pose = sensors.odometry.pose
    odom_dx, odom_dy, odom_dyaw = 0.0, 0.0, 0.0
    if prev_odom is not None:
        odom_dx = pose.x - prev_odom[0]
        odom_dy = pose.y - prev_odom[1]
        odom_dyaw = wrap(pose.yaw - prev_odom[2])
        explore.moved += math.hypot(odom_dx, odom_dy)
        apply_motion(particles, prev_odom, (pose.x, pose.y, pose.yaw))
    prev_odom = (pose.x, pose.y, pose.yaw)

    weights, log_mean, log_best = likelihood(particles, sensors, field, m)
    just_locked = False
    if UNKNOWN_START and explore.locked == 0:
        # Count control ticks, not sensors.time. Reset does not zero the
        # simulator clock, and a stale clock would collapse the prior
        # before the first frame can show it.
        explore.ticks += 1
        sharp = np.maximum(weights, 0.0) ** 3
        total_w = float(np.sum(sharp))
        belief = sharp / total_w if total_w > 0.0 else np.full(N, 1.0 / N)
        facing = np.abs(wrap_array(particles[:, 2])) < 0.45
        score = np.where(facing, belief, -1.0)
        best = particles[int(np.argmax(score if float(np.max(score)) > 0.0 else belief))]
        peak = float(np.max(belief))
        if held_pose is None:
            # One scan picks the corridor. After that the wheels carry it;
            # the other straight is not allowed to drag the pose across.
            estimate = (float(best[0]), float(best[1]), float(best[2]))
        else:
            estimate = (held_pose[0] + odom_dx, held_pose[1] + odom_dy, wrap(held_pose[2] + odom_dyaw))
            # A sharper winner nearby replaces the guess. A jump across the
            # infield does not: that is the other oval straight.
            if peak > 0.07 and math.hypot(float(best[0]) - estimate[0], float(best[1]) - estimate[1]) < 5.0:
                yaw = float(best[2]) if abs(wrap(float(best[2]) - estimate[2])) < 0.6 else estimate[2]
                estimate = (float(best[0]), float(best[1]), yaw)
        held_pose = estimate
        # City and forest put almost all the weight on one particle. The
        # oval's best particle is only about a tenth, and that is already
        # the right straight. The warehouse bay stays near a few percent
        # until the car has moved, so it is not collapsed yet.
        if explore.ticks >= 9 and peak > 0.07:
            particles = np.column_stack((
                held_pose[0] + rng.normal(0.0, 0.25, N),
                held_pose[1] + rng.normal(0.0, 0.25, N),
                wrap_array(held_pose[2] + rng.normal(0.0, 0.06, N)),
            ))
            explore.locked = 1
            just_locked = True
            belief = np.full(N, 1.0 / N)
        weights = belief
    mean = weighted_mean(particles, weights)
    # Before the collapse the posterior can sit on one particle while the
    # drawn cloud still covers the yard. The ellipse is that cloud, equally
    # weighted, so the ring is the scatter on screen. After the collapse it
    # is the filter covariance.
    if UNKNOWN_START and explore.locked == 0:
        ellipse_w = np.full(N, 1.0 / N)
        ellipse_at = (float(np.mean(particles[:, 0])), float(np.mean(particles[:, 1])))
    else:
        ellipse_w = weights
        ellipse_at = (mean[0], mean[1])
    dxp = particles[:, 0] - ellipse_at[0]
    dyp = particles[:, 1] - ellipse_at[1]
    var_x = max(0.0, float(np.dot(ellipse_w, dxp * dxp)))
    var_y = max(0.0, float(np.dot(ellipse_w, dyp * dyp)))
    cov_xy = float(np.dot(ellipse_w, dxp * dyp))
    axis, major, minor = covariance_ellipse(var_x, var_y, cov_xy)
    if not UNKNOWN_START or explore.locked == 1:
        estimate = mean
        if UNKNOWN_START and held_pose is not None:
            # A mirrored aisle can flip the mean heading. The wheels already
            # know the heading; only a small disagreement is a real correction.
            predicted_yaw = wrap(held_pose[2] + odom_dyaw)
            if abs(wrap(mean[2] - predicted_yaw)) > 0.6:
                estimate = (mean[0], mean[1], predicted_yaw)
        if UNKNOWN_START:
            held_pose = estimate
    draw.points(np.column_stack((particles[:, 0], particles[:, 1], particles[:, 2], weights)), "#ff2bd6")
    draw.ellipse(float(ellipse_at[0]), float(ellipse_at[1]), axis, major, minor, "#ffd400")
    neff = 1.0 / max(1e-12, float(np.dot(weights, weights)))
    scan_ok = (not just_locked) and (log_best != 0.0 or log_mean != 0.0)
    inject = augmented_fraction(log_mean) if UNKNOWN_START and explore.locked == 1 and scan_ok else 0.0
    if inject > 0.05 and explore.moved > 2.0:
        particles = resample(particles, weights, inject, field, m)
    elif (not just_locked) and neff < 0.55 * N and ((not UNKNOWN_START) or explore.locked == 1):
        particles = resample(particles, weights, 0.0, field, m)
    # Creep on the right-hand wall until one particle owns the scan.
    # Wall gains are the wall lesson's; the cap is the creep. After that,
    # pursuit. A pose that has left the route hands the wheel back.
    off_route = UNKNOWN_START and path_distance(sensors.task.path, estimate[0], estimate[1]) > 4.0
    if UNKNOWN_START and (explore.locked == 0 or off_route):
        steer, throttle = follow_wall(sensors)
        speed = float(sensors.odometry.speed)
        if speed > 1.5:
            throttle = min(throttle, -0.05)
        else:
            throttle = min(throttle, 0.22)
    else:
        steer, throttle = pursue(sensors, estimate)
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
    grid = getattr(m, "grid", None)
    if grid is not None and getattr(grid, "shape", None) == (m.height, m.width):
        distance_field.grid = grid
        distance_field.stamp = m.stamp
        return grid
    if getattr(distance_field, "stamp", None) == m.stamp and m.stamp != 0 and getattr(distance_field, "grid", None) is not None:
        return distance_field.grid
    raw = np.frombuffer(base64.b64decode(m.field), dtype=np.uint8)
    decoded = raw.reshape((m.height, m.width)).astype(np.float32) * 0.01
    distance_field.grid = decoded
    distance_field.stamp = m.stamp
    return decoded

def initial_cloud(m, field, path):
    cloud = np.zeros((N, 3), dtype=float)
    if UNKNOWN_START:
        return kidnapped_cloud(m, field, path)
    cloud[:, 0] = rng.normal(0.0, 0.25, N)
    cloud[:, 1] = rng.normal(0.0, 0.25, N)
    cloud[:, 2] = rng.normal(0.0, 0.06, N)
    return cloud

def kidnapped_cloud(m, field, path):
    # Free cells first, so the drawn cloud (and a truncated draw) is a
    # scatter across the yard. A route lattice sits behind them: a few
    # hundred uniform poses will not land on the car, and the route is
    # task info. Twelve headings, both ways around the loop included.
    cloud = free_cloud(N, field, m)
    headings = np.linspace(-math.pi, math.pi, 12, endpoint=False)
    slots = min(N // 2, max(12, (N * 2) // 5))
    if len(path) < 2:
        return cloud
    stations = max(1, slots // headings.size)
    choice = np.linspace(0, len(path) - 1, stations).astype(int)
    i = N - slots
    for index in choice:
        point = path[int(index)]
        for heading in headings:
            if i >= N:
                break
            cloud[i, 0] = point.x + float(rng.normal(0.0, 0.25))
            cloud[i, 1] = point.y + float(rng.normal(0.0, 0.25))
            cloud[i, 2] = float(heading + rng.normal(0.0, 0.02))
            i += 1
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
        return np.full(N, 1.0 / N), 0.0, 0.0
    sigma = SIGMA
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
    pz = np.exp(-0.5 * (np.minimum(d, 2.2) / sigma) ** 2) + 0.09
    logw = np.sum(np.log(pz), axis=1)
    peak = float(np.max(logw))
    log_mean = peak + float(np.log(np.mean(np.exp(np.clip(logw - peak, -80.0, 0.0)))))
    log_best = peak
    logw = logw - peak
    w = np.exp(logw)
    total = float(np.sum(w))
    if total <= 0.0:
        return np.full(N, 1.0 / N), log_mean, log_best
    return w / total, log_mean, log_best

def weighted_mean(cloud, weights):
    x = float(np.dot(weights, cloud[:, 0]))
    y = float(np.dot(weights, cloud[:, 1]))
    yaw = math.atan2(float(np.dot(weights, np.sin(cloud[:, 2]))), float(np.dot(weights, np.cos(cloud[:, 2]))))
    return (x, y, yaw)

def resample(cloud, weights, inject=0.0, field=None, m=None):
    cumulative = np.cumsum(weights)
    cumulative[-1] = 1.0
    slots = (np.arange(N) + rng.random()) / N
    index = np.clip(np.searchsorted(cumulative, slots, side="left"), 0, N - 1)
    picked = cloud[index].copy()
    # inject == 0 leaves the tracking cloud exactly as the low-variance draw.
    if inject <= 0.0 or field is None or m is None:
        return picked
    n_new = int(round(min(0.45, inject) * N))
    if n_new <= 0:
        return picked
    picked[:n_new] = free_cloud(n_new, field, m)
    return picked

def covariance_ellipse(cxx, cyy, cxy):
    # Eigenvalues of the 2x2 covariance. Radii are 2-sigma.
    tr = cxx + cyy
    det = cxx * cyy - cxy * cxy
    disc = math.sqrt(max(0.0, tr * tr / 4.0 - det))
    major_var = max(tr / 2.0 + disc, 0.04)
    minor_var = max(tr / 2.0 - disc, 0.04)
    yaw = 0.5 * math.atan2(2.0 * cxy, cxx - cyy)
    return yaw, 2.0 * math.sqrt(major_var), 2.0 * math.sqrt(minor_var)

def path_distance(path, x, y):
    best = 1e9
    for point in path:
        dist = math.hypot(point.x - x, point.y - y)
        if dist < best:
            best = dist
    return best

def augmented_fraction(evidence):
    # evidence is log of the average likelihood (arithmetic mean, so the
    # particles that fit dominate). A turn moves it by a nat or two. Losing
    # the corridor moves it by several. Only that drop injects new poses,
    # and never more than a quarter of the cloud: replacing the mode that
    # was right is how a symmetric aisle flips.
    if augment.fast is None:
        augment.fast = evidence
        augment.slow = evidence
        return 0.0
    augment.slow += 0.02 * (evidence - augment.slow)
    augment.fast += 0.2 * (evidence - augment.fast)
    gap = augment.slow - augment.fast
    if gap < 4.0:
        return 0.0
    return min(0.25, (gap - 4.0) / 12.0)

def free_cells(field):
    if getattr(free_cells, "src", None) is field:
        return free_cells.xs, free_cells.ys
    ys, xs = np.nonzero(field > 0.55)
    if xs.size < 8:
        ys, xs = np.nonzero(field > 0.15)
    if xs.size == 0:
        xs = np.zeros(1, dtype=np.int32)
        ys = np.zeros(1, dtype=np.int32)
    free_cells.src = field
    free_cells.xs = xs
    free_cells.ys = ys
    return xs, ys

def free_cloud(n, field, m):
    xs, ys = free_cells(field)
    pick = rng.integers(0, int(xs.size), int(n))
    cloud = np.zeros((int(n), 3), dtype=float)
    cloud[:, 0] = m.corner.x + (xs[pick] + 0.5) * m.resolution
    cloud[:, 1] = m.corner.y + (ys[pick] + 0.5) * m.resolution
    cloud[:, 2] = rng.uniform(-math.pi, math.pi, int(n))
    return cloud

def follow_wall(sensors):
    # Right-wall follower from the wall lesson. Gains are the same
    # (TARGET 3.2, LOOK 1.8, KP 0.16, KD 0.55). The caller caps the
    # throttle so the creep is slow; this function does not retune them.
    global wall_phase, wall_ticks, wall_reverse, wall_gap, wall_held, wall_preview
    target_gap = 3.2
    look = 1.8
    kp = 0.16
    kd = 0.55
    ranges = np.asarray(sensors.lidar.ranges, dtype=float)
    angles = np.asarray(sensors.lidar.angles, dtype=float)
    side = wall_beam(ranges, angles, -math.pi / 2, 0.14)
    diag = wall_beam(ranges, angles, -math.pi / 4, 0.14)
    preview = wall_beam(ranges, angles, -0.35, 0.1)
    front = wall_beam(ranges, angles, 0.0, 0.32)
    delta = math.pi / 4
    alpha = math.atan2(diag * math.cos(delta) - side, diag * math.sin(delta))
    dist = max(0.3, side * math.cos(min(0.8, max(-0.8, alpha))))
    future = dist + look * math.sin(alpha)
    if (
        wall_phase == "follow"
        and side < 6.5
        and diag < side * 2.0
        and abs(alpha) < 0.35
        and abs(dist - target_gap) < 1.0
    ):
        wall_gap = 0.75 * wall_gap + 0.25 * dist
        if abs(dist - target_gap) < 0.55:
            wall_held = True
    buried = front < 1.05 or (side < 1.4 and alpha < -0.45) or (wall_phase == "turn" and front < 1.3 and wall_ticks > 8)
    if wall_reverse > 0:
        wall_reverse -= 1
        return -0.4, -0.26
    if buried:
        wall_reverse = 16
        wall_phase = "follow"
        wall_ticks = 0
        return -0.4, -0.26
    if wall_phase == "turn":
        wall_ticks += 1
        parallel_preview = max(side, 0.5) / math.sin(0.35)
        on_new_face = (
            wall_ticks > 20
            and abs(side - target_gap) < 0.9
            and abs(alpha) < 0.22
            and diag < side * 1.65
            and preview < parallel_preview * 1.3
        )
        if on_new_face or wall_ticks > 160:
            wall_phase = "follow"
            wall_ticks = 0
            return 0.0, 0.1
        return -min(0.52, math.atan(WHEELBASE / max(wall_gap, 3.15))), 0.12
    lost = wall_held and wall_gap < 4.2 and side > 6.2
    if wall_phase == "coast" or (wall_phase == "follow" and lost):
        if wall_phase != "coast":
            wall_phase = "coast"
            wall_ticks = 0
        wall_ticks += 1
        if wall_ticks > 6:
            wall_phase = "turn"
            wall_ticks = 0
            return -min(0.52, math.atan(WHEELBASE / max(wall_gap, 3.15))), 0.08
        return 0.0, 0.0
    parallel_preview = max(side, 0.5) / math.sin(0.35)
    settled = abs(side - target_gap) < 0.35 and abs(alpha) < 0.12
    if settled and preview < 10.5:
        wall_preview = True
    speed = float(sensors.odometry.speed)
    ending = diag > max(6.2, side * 1.7) or (wall_preview and preview > min(11.2, parallel_preview + 1.6))
    corner_soon = wall_held and side < 5.5 and ending and (settled or speed > 3.0)
    if corner_soon:
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
        steering = kp * (target_gap - future) - kd * alpha
    else:
        steering = 0.0
    if dist > target_gap + 1.0:
        steering = max(steering, -0.16)
    steering = float(np.clip(steering, -0.4, 0.4))
    return steering, 0.2

def wall_beam(ranges, angles, center, width):
    mask = np.abs(angles - center) < width
    if not np.any(mask):
        return 12.0
    return float(np.median(ranges[mask]))

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

def augment():
    return None

def explore():
    return None

augment.fast = None
augment.slow = None
explore.moved = 0.0
explore.locked = 0
explore.ticks = 0
wall_phase = "follow"
wall_ticks = 0
wall_reverse = 0
wall_gap = 3.2
wall_held = False
wall_preview = False
held_pose = None
`;
}
