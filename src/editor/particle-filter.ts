import { ACKERMANN_BUGGY } from "../api";
import { programPreamble } from "./program-header";

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
  return `${programPreamble(mode === "global" ? "mcl-global" : "mcl")}# Particle filter localization
#
# sensors.task.map is a floor plan in the same frame as the odometry
# and the path. It is not the car's pose.
#
#   map.resolution     meters per cell
#   map.corner.x/y     odometry coordinates of cell (0, 0)
#   map.width/height
#   map.field          base64, one byte per cell: distance to the nearest
#                      occupied cell, in centimeters. 0 means occupied.
#   map.segments       wall edges, packed x0, y0, x1, y1
#   map.stamp          cache key. The field does not change while you drive.
#   map.grid           meters, shape (height, width). The host decodes
#                      field once, before the timed step. 0 is occupied.
#
# The filter integrates the odometry delta (wheel speed and gyro, already
# in sensors.odometry.pose) with a little extra noise, weights each particle
# by a lidar likelihood field, and low-variance resamples. With a known
# start the pose we steer with is the weighted mean.
#
# UNKNOWN_START is a kidnapped robot. Most particles start in empty space
# with random headings. A minority sit on the route at twelve headings, because
# a few hundred uniform poses do not cover x, y, and yaw. The car creeps
# with the right-wall follower (same gains as the wall lesson, throttle
# capped) until one particle holds about a tenth of the weight. The cloud
# then collapses around that pose and pure pursuit takes over. Cubing the
# weights is only that peak test. The drawn cloud keeps the raw likelihood,
# so one sharp particle is not reported as a tight posterior.
#
# Parallel walls do not observe distance along a corridor. Short map
# edges (cones, crates, barrels, trunks, pillars) and the corners of long
# walls do. Once the cloud has collapsed, the estimate is slid along the
# route tangent to the shift whose scan best matches those landmarks.
# Beams near a landmark use a tighter likelihood. A quadratic penalty
# keeps a uniform corridor from walking. In a trunk row the grid peak is
# shallow, so a smaller improvement is accepted. A sparse cone still has
# to beat a clear gap. The whole cloud moves with the estimate, at most
# half a meter per tick. The search reads map.segments and map.field only.
# Nothing reads the true pose.
# The warehouse bay is flatter, so the creep continues until a peak
# appears. If the short-term likelihood average later falls below the
# long-term one, resample mixes in random free-space particles. A pose
# that has left the route backs away when the bumper is against a wall.

import base64
import math
import numpy as np

UNKNOWN_START = ${unknown}
N = ${count}
TRACK_SPREAD = 0.25
BEAMS = 40
SIGMA = 0.5
LAND_SIGMA = 0.35
WHEELBASE = ${wheelbase}
LOOKAHEAD = 3.2
LIDAR_FORWARD = 0.46
A1, A2, A3, A4 = 0.03, 0.04, 0.06, 0.03

class Run:
    def __init__(self):
        self.rng = np.random.default_rng(SEED)
        self.moved = 0.0
        self.locked = 0
        self.ticks = 0
        self.fast = None
        self.slow = None
        self.path_index = 0
        self.speed_integral = 0.0
        self.escape = 0
        self.escape_steer = 0.0
        self.wall_phase = "follow"
        self.wall_ticks = 0
        self.wall_reverse = 0
        self.wall_gap = 3.2
        self.wall_held = False
        self.wall_preview = False
        self.particles = None
        self.prev_odom = None
        self.trail = []
        self.held_pose = None
        self.field_grid = None
        self.field_stamp = None
        self.marks = None
        self.marks_stamp = None
        self.near = None
        self.near_stamp = None
        self.free_src = None
        self.free_xs = None
        self.free_ys = None

run = Run()

def init(sensors):
    global run
    run = Run()
    distance_field(sensors.task.map)

def control(sensors):
    m = sensors.task.map
    field = distance_field(m)
    if run.particles is None:
        run.particles = initial_cloud(m, field, sensors.task.path)

    pose = sensors.odometry.pose
    odom_dx, odom_dy, odom_dyaw = 0.0, 0.0, 0.0
    if run.prev_odom is not None:
        odom_dx = pose.x - run.prev_odom[0]
        odom_dy = pose.y - run.prev_odom[1]
        odom_dyaw = wrap(pose.yaw - run.prev_odom[2])
        run.moved += math.hypot(odom_dx, odom_dy)
        apply_motion(run.particles, run.prev_odom, (pose.x, pose.y, pose.yaw))
    run.prev_odom = (pose.x, pose.y, pose.yaw)

    weights, log_mean, log_best = likelihood(run.particles, sensors, field, m)
    just_locked = False
    if UNKNOWN_START and run.locked == 0:
        # Count control ticks, not sensors.time. Reset does not zero the
        # simulator clock, and a stale clock would collapse the prior
        # before the first frame can show it.
        run.ticks += 1
        sharp = np.maximum(weights, 0.0) ** 3
        total_w = float(np.sum(sharp))
        belief = sharp / total_w if total_w > 0.0 else np.full(N, 1.0 / N)
        facing = np.abs(wrap_array(run.particles[:, 2])) < 0.45
        score = np.where(facing, belief, -1.0)
        best = run.particles[int(np.argmax(score if float(np.max(score)) > 0.0 else belief))]
        peak = float(np.max(belief))
        if run.held_pose is None:
            # One scan picks the corridor. After that the wheels carry it;
            # the other straight is not allowed to drag the pose across.
            estimate = (float(best[0]), float(best[1]), float(best[2]))
        else:
            estimate = (run.held_pose[0] + odom_dx, run.held_pose[1] + odom_dy, wrap(run.held_pose[2] + odom_dyaw))
            # A sharper winner nearby replaces the guess. A jump across the
            # infield does not: that is the other oval straight.
            if peak > 0.07 and math.hypot(float(best[0]) - estimate[0], float(best[1]) - estimate[1]) < 5.0:
                yaw = float(best[2]) if abs(wrap(float(best[2]) - estimate[2])) < 0.6 else estimate[2]
                estimate = (float(best[0]), float(best[1]), yaw)
        run.held_pose = estimate
        # City and forest put almost all the weight on one particle. The
        # oval's best particle is only about a tenth, and that is already
        # the right straight. The warehouse bay stays near a few percent
        # until the car has moved, so it is not collapsed yet.
        if run.ticks >= 9 and peak > 0.07:
            run.particles = np.column_stack((
                run.held_pose[0] + run.rng.normal(0.0, 0.12, N),
                run.held_pose[1] + run.rng.normal(0.0, 0.12, N),
                wrap_array(run.held_pose[2] + run.rng.normal(0.0, 0.04, N)),
            ))
            run.locked = 1
            just_locked = True
            weights = np.full(N, 1.0 / N)
        # belief is the cubed peak test only. Leave weights on the raw
        # likelihood so the drawn cloud's covariance is the posterior.
    mean = weighted_mean(run.particles, weights)
    # Before the collapse the posterior can sit on one particle while the
    # drawn cloud still covers the world. The ellipse is that cloud, equally
    # weighted, so the ring is the scatter on screen. After the collapse it
    # is the filter covariance.
    if UNKNOWN_START and run.locked == 0:
        ellipse_w = np.full(N, 1.0 / N)
        ellipse_at = (float(np.mean(run.particles[:, 0])), float(np.mean(run.particles[:, 1])))
    else:
        raw_x = float(np.mean(run.particles[:, 0]))
        raw_y = float(np.mean(run.particles[:, 1]))
        raw_dx = run.particles[:, 0] - raw_x
        raw_dy = run.particles[:, 1] - raw_y
        raw_var = float(np.mean(raw_dx * raw_dx + raw_dy * raw_dy))
        # Scatter guesses throws the cloud out several meters. While those
        # dots are still spread, the ring is that scatter. A tight cloud
        # keeps the weighted covariance, which is the agreement of the guesses.
        if raw_var > 4.0:
            ellipse_w = np.full(N, 1.0 / N)
            ellipse_at = (raw_x, raw_y)
        else:
            ellipse_w = weights
            ellipse_at = (mean[0], mean[1])
    dxp = run.particles[:, 0] - ellipse_at[0]
    dyp = run.particles[:, 1] - ellipse_at[1]
    var_x = max(0.0, float(np.dot(ellipse_w, dxp * dxp)))
    var_y = max(0.0, float(np.dot(ellipse_w, dyp * dyp)))
    cov_xy = float(np.dot(ellipse_w, dxp * dyp))
    axis, major, minor = covariance_ellipse(var_x, var_y, cov_xy)
    if not UNKNOWN_START or run.locked == 1:
        estimate = mean
        if UNKNOWN_START and run.held_pose is not None:
            # A mirrored aisle can flip the mean heading. The wheels already
            # know the heading; only a small disagreement is a real correction.
            predicted_yaw = wrap(run.held_pose[2] + odom_dyaw)
            if abs(wrap(mean[2] - predicted_yaw)) > 0.6:
                estimate = (mean[0], mean[1], predicted_yaw)
        if UNKNOWN_START:
            run.held_pose = estimate
        # Slide along the route onto the landmark-consistent pose, and
        # take the cloud with the estimate. Cross-track is left alone:
        # a jump between the oval's two straights is not a correction.
        if path_distance(sensors.task.path, estimate[0], estimate[1]) <= 4.0:
            corrected, delta = pin_along_track(estimate, sensors, field, m, sensors.task.path)
            if abs(delta[0]) + abs(delta[1]) > 1e-4:
                run.particles[:, 0] += delta[0]
                run.particles[:, 1] += delta[1]
                ellipse_at = (float(ellipse_at[0]) + delta[0], float(ellipse_at[1]) + delta[1])
                estimate = corrected
                if UNKNOWN_START:
                    run.held_pose = estimate
    draw.points(np.column_stack((run.particles[:, 0], run.particles[:, 1], run.particles[:, 2], weights)), "#ff2bd6")
    draw.ellipse(float(ellipse_at[0]), float(ellipse_at[1]), axis, major, minor, "#ffd400")
    neff = 1.0 / max(1e-12, float(np.dot(weights, weights)))
    scan_ok = (not just_locked) and (log_best != 0.0 or log_mean != 0.0)
    inject = augmented_fraction(log_mean) if UNKNOWN_START and run.locked == 1 and scan_ok else 0.0
    if inject > 0.05 and run.moved > 2.0:
        run.particles = resample(run.particles, weights, inject, field, m)
    elif (not just_locked) and neff < 0.55 * N and ((not UNKNOWN_START) or run.locked == 1):
        run.particles = resample(run.particles, weights, 0.0, field, m)
    # Creep on the right-hand wall until one particle owns the scan.
    # Wall gains are the wall lesson's; the cap is the creep. After that,
    # pursuit. Off the route, back away instead of grinding the wall ahead.
    off_route = UNKNOWN_START and path_distance(sensors.task.path, estimate[0], estimate[1]) > 4.0
    if UNKNOWN_START and run.locked == 0:
        steer, throttle = follow_wall(sensors)
        speed = float(sensors.odometry.speed)
        if speed > 1.5:
            throttle = min(throttle, -0.05)
        else:
            throttle = min(throttle, 0.22)
    elif off_route:
        # The guess has left the loop, so the route wall is the wrong one
        # to creep along. A return inside 2 m is the bumper on whatever
        # is actually ahead (the lidar sits behind it). Back off that face.
        steer, throttle = follow_wall(sensors)
        ranges = np.asarray(sensors.lidar.ranges, dtype=float)
        angles = np.asarray(sensors.lidar.angles, dtype=float)
        ahead = np.abs(angles) < 0.8
        front = float(np.min(ranges[ahead])) if np.any(ahead) else sensors.lidar.max_range
        if front < 2.2:
            left = float(np.mean(ranges[angles > 0.4])) if np.any(angles > 0.4) else 0.0
            right = float(np.mean(ranges[angles < -0.4])) if np.any(angles < -0.4) else 0.0
            steer = 0.45 if left >= right else -0.45
            throttle = -0.35
        else:
            speed = float(sensors.odometry.speed)
            if speed > 1.5:
                throttle = min(throttle, -0.05)
            else:
                throttle = min(throttle, 0.22)
    else:
        steer, throttle = pursue(sensors, estimate)
    run.trail.append((float(estimate[0]), float(estimate[1])))
    if len(run.trail) > 280:
        del run.trail[: len(run.trail) - 280]
    if len(run.trail) >= 2:
        draw.path(run.trail, "#ff5d73")
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
        run.field_grid = grid
        run.field_stamp = m.stamp
        return grid
    if run.field_stamp == m.stamp and m.stamp != 0 and run.field_grid is not None:
        return run.field_grid
    raw = np.frombuffer(base64.b64decode(m.field), dtype=np.uint8)
    decoded = raw.reshape((m.height, m.width)).astype(np.float32) * 0.01
    run.field_grid = decoded
    run.field_stamp = m.stamp
    return decoded

def initial_cloud(m, field, path):
    cloud = np.zeros((N, 3), dtype=float)
    if UNKNOWN_START:
        return kidnapped_cloud(m, field, path)
    cloud[:, 0] = run.rng.normal(0.0, TRACK_SPREAD, N)
    cloud[:, 1] = run.rng.normal(0.0, TRACK_SPREAD, N)
    cloud[:, 2] = run.rng.normal(0.0, 0.06, N)
    return cloud

def kidnapped_cloud(m, field, path):
    # Free cells first, so the drawn cloud (and a truncated draw) is a
    # scatter across the world. A route lattice sits behind them: a few
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
            cloud[i, 0] = point.x + float(run.rng.normal(0.0, 0.25))
            cloud[i, 1] = point.y + float(run.rng.normal(0.0, 0.25))
            cloud[i, 2] = float(heading + run.rng.normal(0.0, 0.02))
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
    s1 = drot1 + run.rng.normal(0.0, std1, N)
    s2 = dtrans + run.rng.normal(0.0, std2, N)
    s3 = drot2 + run.rng.normal(0.0, std3, N)
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
    d = np.minimum(np.where(valid, d, 2.4), 2.2)
    # log_mean stays on the wide field so a tight landmark beam is not the
    # kidnapped-robot failure signal. Weights use the tight width on beams
    # that land near a short object or a corner, which is what makes an
    # along-track shift look different from the truth.
    near = landmark_near(m)[np.clip(iy, 0, m.height - 1), np.clip(ix, 0, m.width - 1)]
    pz_plain = np.exp(-0.5 * (d / SIGMA) ** 2) + 0.09
    sigma = np.where(valid & near, LAND_SIGMA, SIGMA)
    pz = np.exp(-0.5 * (d / sigma) ** 2) + 0.09
    log_plain = np.sum(np.log(pz_plain), axis=1)
    peak_plain = float(np.max(log_plain))
    log_mean = peak_plain + float(np.log(np.mean(np.exp(np.clip(log_plain - peak_plain, -80.0, 0.0)))))
    log_best = peak_plain
    logw = np.sum(np.log(pz), axis=1)
    peak = float(np.max(logw))
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
    slots = (np.arange(N) + run.rng.random()) / N
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

def landmark_points(m):
    # Short edges are cones, crates, barrels, trunks, pillars. Endpoints of
    # long edges are corners. Both break the shift symmetry of a corridor.
    # Cached on the map stamp. Nothing here is the true pose.
    if run.marks_stamp == m.stamp and m.stamp != 0 and run.marks is not None:
        return run.marks
    raw = np.asarray(getattr(m, "segments", []), dtype=float)
    if raw.size < 4:
        run.marks = np.zeros((0, 2))
        run.marks_stamp = m.stamp
        return run.marks
    segs = raw.reshape((-1, 4))
    length = np.hypot(segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1])
    short = segs[length < 2.8]
    long = segs[length >= 2.8]
    # Short objects first. A cap that filled up on wall corners would drop
    # the cones and trunks that actually observe along-track position.
    pts = []
    if short.shape[0] > 0:
        pts.append(np.column_stack(((short[:, 0] + short[:, 2]) * 0.5, (short[:, 1] + short[:, 3]) * 0.5)))
        pts.append(short[:, 0:2])
        pts.append(short[:, 2:4])
    if long.shape[0] > 0:
        pts.append(long[:, 0:2])
        pts.append(long[:, 2:4])
    if not pts:
        run.marks = np.zeros((0, 2))
        run.marks_stamp = m.stamp
        return run.marks
    stacked = np.vstack(pts)
    # One point per 0.8 m cell. Short objects were stacked first, and
    # unique keeps the first row, so a cone is not dropped for a wall corner.
    cell = np.floor(stacked / 0.8).astype(np.int64)
    keys = cell[:, 0] * np.int64(1000003) + cell[:, 1]
    _, first = np.unique(keys, return_index=True)
    kept = stacked[np.sort(first)]
    if kept.shape[0] > 320:
        kept = kept[:320]
    run.marks = np.asarray(kept, dtype=float)
    run.marks_stamp = m.stamp
    return run.marks

def landmark_near(m):
    if run.near_stamp == m.stamp and m.stamp != 0 and run.near is not None:
        return run.near
    marks = landmark_points(m)
    near = np.zeros((m.height, m.width), dtype=bool)
    if marks.shape[0] == 0 or m.width < 2:
        run.near = near
        run.near_stamp = m.stamp
        return near
    res = float(m.resolution) if m.resolution else 0.5
    rad = int(math.ceil(1.6 / max(res, 0.05)))
    for x, y in marks:
        ix = int(math.floor((float(x) - m.corner.x) / res))
        iy = int(math.floor((float(y) - m.corner.y) / res))
        x0 = max(0, ix - rad)
        x1 = min(int(m.width), ix + rad + 1)
        y0 = max(0, iy - rad)
        y1 = min(int(m.height), iy + rad + 1)
        if x1 > x0 and y1 > y0:
            near[y0:y1, x0:x1] = True
    run.near = near
    run.near_stamp = m.stamp
    return near

def route_tangent(path, x, y, yaw):
    best_i = 0
    best_d = 1e9
    for i, point in enumerate(path):
        dist = math.hypot(point.x - x, point.y - y)
        if dist < best_d:
            best_d = dist
            best_i = i
    n = len(path)
    prev = path[(best_i - 1) % n]
    nxt = path[(best_i + 1) % n]
    tx = nxt.x - prev.x
    ty = nxt.y - prev.y
    norm = math.hypot(tx, ty)
    if norm < 1e-6:
        return math.cos(yaw), math.sin(yaw)
    tx /= norm
    ty /= norm
    if tx * math.cos(yaw) + ty * math.sin(yaw) < 0.0:
        tx, ty = -tx, -ty
    return tx, ty

def pin_along_track(estimate, sensors, field, m, path):
    # Score the current pose and poses shifted along the route. Every beam
    # votes, so leaving a landmark is a penalty, not a free move. The
    # quadratic term keeps a uniform corridor at shift 0. At most 0.5 m/tick.
    if len(path) < 2 or m.width < 2:
        return estimate, (0.0, 0.0)
    tx, ty = route_tangent(path, estimate[0], estimate[1], estimate[2])
    shifts = np.linspace(-2.4, 2.4, 25)
    ranges = np.asarray(sensors.lidar.ranges, dtype=float)
    angles = np.asarray(sensors.lidar.angles, dtype=float)
    step = max(1, int(ranges.shape[0] // BEAMS))
    r = ranges[::step][:BEAMS]
    a = angles[::step][:BEAMS]
    hit = r < (float(sensors.lidar.max_range) - 0.05)
    r = r[hit]
    a = a[hit]
    if r.size < 6:
        return estimate, (0.0, 0.0)
    yaw = float(estimate[2])
    ox = float(estimate[0]) + LIDAR_FORWARD * math.cos(yaw)
    oy = float(estimate[1]) + LIDAR_FORWARD * math.sin(yaw)
    ex = ox + r * np.cos(yaw + a)
    ey = oy + r * np.sin(yaw + a)
    sx = ex[None, :] + shifts[:, None] * tx
    sy = ey[None, :] + shifts[:, None] * ty
    ix = np.floor((sx - m.corner.x) / m.resolution).astype(np.int32)
    iy = np.floor((sy - m.corner.y) / m.resolution).astype(np.int32)
    valid = (ix >= 0) & (ix < m.width) & (iy >= 0) & (iy < m.height)
    d = field[np.clip(iy, 0, m.height - 1), np.clip(ix, 0, m.width - 1)]
    d = np.minimum(np.where(valid, d, 2.4), 2.2)
    near = landmark_near(m)[np.clip(iy, 0, m.height - 1), np.clip(ix, 0, m.width - 1)]
    sigma = np.where(valid & near, LAND_SIGMA, SIGMA)
    logw = np.sum(np.log(np.exp(-0.5 * (d / sigma) ** 2) + 0.09), axis=1)
    score = logw - 0.45 * shifts * shifts
    zero_i = int(shifts.shape[0] // 2)
    zero = float(score[zero_i])
    best_i = int(np.argmax(score))
    # A trunk row puts most endpoints on a landmark, and the grid peak is
    # only a little taller than the neighboring cell. A sparse cone has
    # to beat a clear gap before the cloud slides.
    near_frac = float(np.mean(near[zero_i])) if near.size else 0.0
    need = 0.16 if near_frac > 0.45 else 0.35
    if float(score[best_i]) < zero + need:
        return estimate, (0.0, 0.0)
    shift = float(shifts[best_i])
    if abs(shift) < 0.18:
        return estimate, (0.0, 0.0)
    cap = 0.55
    if shift > cap:
        shift = cap
    elif shift < -cap:
        shift = -cap
    moved = (float(estimate[0] + shift * tx), float(estimate[1] + shift * ty), yaw)
    return moved, (shift * tx, shift * ty)

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
    if run.fast is None:
        run.fast = evidence
        run.slow = evidence
        return 0.0
    run.slow += 0.02 * (evidence - run.slow)
    run.fast += 0.2 * (evidence - run.fast)
    gap = run.slow - run.fast
    if gap < 4.0:
        return 0.0
    return min(0.25, (gap - 4.0) / 12.0)

def free_cells(field):
    if run.free_src is field:
        return run.free_xs, run.free_ys
    ys, xs = np.nonzero(field > 0.55)
    if xs.size < 8:
        ys, xs = np.nonzero(field > 0.15)
    if xs.size == 0:
        xs = np.zeros(1, dtype=np.int32)
        ys = np.zeros(1, dtype=np.int32)
    run.free_src = field
    run.free_xs = xs
    run.free_ys = ys
    return xs, ys

def free_cloud(n, field, m):
    xs, ys = free_cells(field)
    pick = run.rng.integers(0, int(xs.size), int(n))
    cloud = np.zeros((int(n), 3), dtype=float)
    cloud[:, 0] = m.corner.x + (xs[pick] + 0.5) * m.resolution
    cloud[:, 1] = m.corner.y + (ys[pick] + 0.5) * m.resolution
    cloud[:, 2] = run.rng.uniform(-math.pi, math.pi, int(n))
    return cloud

def follow_wall(sensors):
    # Right-wall follower from the wall lesson. Gains are the same
    # (TARGET 3.2, LOOK 1.8, KP 0.16, KD 0.55). The caller caps the
    # throttle so the creep is slow; this function does not retune them.
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
        run.wall_phase == "follow"
        and side < 6.5
        and diag < side * 2.0
        and abs(alpha) < 0.35
        and abs(dist - target_gap) < 1.0
    ):
        run.wall_gap = 0.75 * run.wall_gap + 0.25 * dist
        if abs(dist - target_gap) < 0.55:
            run.wall_held = True
    buried = front < 1.05 or (side < 1.4 and alpha < -0.45) or (run.wall_phase == "turn" and front < 1.3 and run.wall_ticks > 8)
    if run.wall_reverse > 0:
        run.wall_reverse -= 1
        return -0.4, -0.26
    if buried:
        run.wall_reverse = 16
        run.wall_phase = "follow"
        run.wall_ticks = 0
        return -0.4, -0.26
    if run.wall_phase == "turn":
        run.wall_ticks += 1
        parallel_preview = max(side, 0.5) / math.sin(0.35)
        on_new_face = (
            run.wall_ticks > 20
            and abs(side - target_gap) < 0.9
            and abs(alpha) < 0.22
            and diag < side * 1.65
            and preview < parallel_preview * 1.3
        )
        if on_new_face or run.wall_ticks > 160:
            run.wall_phase = "follow"
            run.wall_ticks = 0
            return 0.0, 0.1
        return -min(0.52, math.atan(WHEELBASE / max(run.wall_gap, 3.15))), 0.12
    lost = run.wall_held and run.wall_gap < 4.2 and side > 6.2
    if run.wall_phase == "coast" or (run.wall_phase == "follow" and lost):
        if run.wall_phase != "coast":
            run.wall_phase = "coast"
            run.wall_ticks = 0
        run.wall_ticks += 1
        if run.wall_ticks > 6:
            run.wall_phase = "turn"
            run.wall_ticks = 0
            return -min(0.52, math.atan(WHEELBASE / max(run.wall_gap, 3.15))), 0.08
        return 0.0, 0.0
    parallel_preview = max(side, 0.5) / math.sin(0.35)
    settled = abs(side - target_gap) < 0.35 and abs(alpha) < 0.12
    if settled and preview < 10.5:
        run.wall_preview = True
    speed = float(sensors.odometry.speed)
    ending = diag > max(6.2, side * 1.7) or (run.wall_preview and preview > min(11.2, parallel_preview + 1.6))
    corner_soon = run.wall_held and side < 5.5 and ending and (settled or speed > 3.0)
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
    if run.escape > 0:
        run.escape -= 1
        draw.path([(point.x, point.y) for point in path], "#7dcea0")
        return run.escape_steer, -0.28
    if front < 0.95 and abs(sensors.odometry.speed) < 0.35:
        left = float(np.mean(sensors.lidar.ranges[sensors.lidar.angles > 0.3]))
        right = float(np.mean(sensors.lidar.ranges[sensors.lidar.angles < -0.3]))
        run.escape = 16
        run.escape_steer = 0.4 if left >= right else -0.4
        draw.path([(point.x, point.y) for point in path], "#7dcea0")
        return run.escape_steer, -0.28

    x, y, yaw = estimate
    n = len(path)
    best = run.path_index % n
    best_d = 1e9
    for step in range(min(n, 50)):
        i = (run.path_index + step) % n
        point = path[i]
        dist = math.hypot(point.x - x, point.y - y)
        if dist < best_d:
            best_d = dist
            best = i
    run.path_index = best
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
    run.speed_integral = max(-2.0, min(2.0, run.speed_integral + error * sensors.dt))
    throttle = max(-0.55, min(0.72, 0.34 * error + 0.05 * run.speed_integral))
    draw.path([(point.x, point.y) for point in path], "#7dcea0")
    draw.points([(target.x, target.y)], "#f4d03f")
    return steer, throttle

def wrap(angle):
    return (angle + math.pi) % (2.0 * math.pi) - math.pi

def wrap_array(angle):
    return (angle + math.pi) % (2.0 * math.pi) - math.pi
`;
}
