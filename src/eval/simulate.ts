import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import {
  CONTROL_DT,
  CONTROL_HZ,
  odomToWorld,
  PHYSICS_DT,
  PHYSICS_HZ,
  assertNoBannedKeys,
  publishSensorFrame,
  worldToOdom,
  type SensorFrame,
} from "../api";
import { solidQuaternion, type Solid } from "../sim/course";
import { referenceRoute, type RoutePoint } from "../sim/routes";
import { AckermannBuggy, type SpawnPose } from "../sim/vehicle";
import type { EvalExample, EvalWorld } from "./scenarios";

type World = InstanceType<typeof RAPIER.World>;

export interface TrailSample {
  t: number;
  x: number;
  z: number;
  speed: number;
  odomX: number;
  odomZ: number;
  hit: boolean;
}

export interface ShotPose {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface RunMetrics {
  world: EvalWorld;
  example: EvalExample;
  seed: number;
  seconds: number;
  physicsHz: number;
  controlHz: number;
  distance: number;
  meanSpeed: number;
  collisionCount: number;
  contactTime: number;
  contactTimes: number[];
  minLidar: number;
  stuckTime: number;
  flipped: boolean;
  minUp: number;
  outOfBounds: boolean;
  laps: number;
  lapTimes: number[];
  odomDrift: number;
  /** Metres from the true pose to the reference polyline. Zero outside pure pursuit. */
  crossTrackMean: number;
  crossTrackMax: number;
  crossTrackEarly: number;
  crossTrackLate: number;
  final: { x: number; z: number; yaw: number };
  shots: ShotPose[];
}

export interface Episode {
  metrics: RunMetrics;
  trail: TrailSample[];
  solids: Solid[];
}

export type Policy = (frame: SensorFrame) => { steering: number; throttle: number };

const SHOT_TIMES = [5, 20, 40, 55];
const STUCK_SPEED = 0.1;
const STUCK_HOLD = 2;

function addSolid(RAPIER: typeof import("@dimforge/rapier3d-compat").default, world: World, solid: Solid): void {
  const q = solidQuaternion(solid.yaw, solid.pitch);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(solid.x, solid.y, solid.z).setRotation(q),
  );
  const desc =
    solid.shape === "cuboid"
      ? RAPIER.ColliderDesc.cuboid(solid.hx, solid.hy, solid.hz)
      : solid.shape === "cylinder"
        ? RAPIER.ColliderDesc.cylinder(solid.hy, solid.hx)
        : solid.shape === "cone"
          ? RAPIER.ColliderDesc.cone(solid.hy, solid.hx)
          : RAPIER.ColliderDesc.ball(solid.hx);
  world.createCollider(desc.setFriction(solid.friction), body);
}

function countLaps(spawnZ: number, trail: TrailSample[]): { laps: number; lapTimes: number[] } {
  let prev = spawnZ;
  let armed = false;
  let laps = 0;
  let lastCross: number | null = null;
  const lapTimes: number[] = [];
  for (const sample of trail) {
    if (Math.abs(sample.z + 20) > 8) armed = true;
    const onStraight = sample.x > 10 && sample.x < 22;
    const up = prev < -20 && sample.z >= -20;
    const down = prev > -20 && sample.z <= -20;
    if (armed && onStraight && (up || down)) {
      laps += 1;
      lapTimes.push(round(sample.t - (lastCross ?? 0)));
      lastCross = sample.t;
      armed = false;
    }
    prev = sample.z;
  }
  return { laps, lapTimes };
}

/** A lap is leaving the start and coming back to it, along the true trail. */
function countRouteLaps(route: RoutePoint[], trail: TrailSample[]): { laps: number; lapTimes: number[] } {
  const start = route[0];
  if (!start) return { laps: 0, lapTimes: [] };
  let away = false;
  let laps = 0;
  let last = 0;
  const lapTimes: number[] = [];
  for (const sample of trail) {
    const distance = Math.hypot(sample.x - start.x, sample.z - start.z);
    if (distance > 8) away = true;
    if (away && distance < 6) {
      laps += 1;
      lapTimes.push(round(sample.t - last));
      last = sample.t;
      away = false;
    }
  }
  return { laps, lapTimes };
}

function distanceToRoute(route: RoutePoint[], x: number, z: number): number {
  if (route.length === 0) return 0;
  let best = Infinity;
  const count = route.length;
  const closed = count > 2 && Math.hypot(route[0]!.x - route[count - 1]!.x, route[0]!.z - route[count - 1]!.z) < 1;
  const segments = closed ? count : count - 1;
  for (let i = 0; i < segments; i++) {
    const a = route[i]!;
    const b = route[(i + 1) % count]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 1e-8 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

/**
 * One seeded episode. Physics steps at PHYSICS_DT. The policy sees only the
 * published sensor frame, at CONTROL_HZ, the same gate the worker uses.
 */
export function runEpisode(
  RAPIER: typeof import("@dimforge/rapier3d-compat").default,
  solids: Solid[],
  options: {
    world: EvalWorld;
    example: EvalExample;
    spawn: SpawnPose;
    seconds: number;
    seed: number;
    policy: Policy;
  },
): Episode {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = PHYSICS_DT;
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  const ground = world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.5, 400).setFriction(1.05), groundBody);
  const groundHandle = ground.handle;
  for (const solid of solids) addSolid(RAPIER, world, solid);

  const scene = new THREE.Scene();
  const robot = new AckermannBuggy(RAPIER, world, scene);
  robot.setNoiseSeed(options.seed);
  robot.reset(options.spawn);
  const route = referenceRoute(options.world);
  const taskPath = route.map((point) => worldToOdom(options.spawn, point));

  const steps = Math.round(options.seconds * PHYSICS_HZ);
  let sensorAccumulator = 0;
  let simTime = 0;
  let distance = 0;
  let collisionCount = 0;
  let contactTime = 0;
  const contactTimes: number[] = [];
  let minLidar = Infinity;
  let minUp = 1;
  let outOfBounds = false;
  let slowFor = 0;
  let stuckTime = 0;
  const trail: TrailSample[] = [];
  const shots: ShotPose[] = [];
  const touching = new Set<number>();
  let prevX = options.spawn.x;
  let prevZ = options.spawn.z;
  let lastOdom = { x: options.spawn.x, z: options.spawn.z };

  for (let i = 0; i < steps; i++) {
    robot.preStep(PHYSICS_DT);
    world.step();
    simTime += PHYSICS_DT;
    sensorAccumulator += PHYSICS_DT;

    const focus = robot.focus();
    distance += Math.hypot(focus.x - prevX, focus.z - prevZ);
    prevX = focus.x;
    prevZ = focus.z;
    const speed = robot.telemetry().trueSpeed;
    minUp = Math.min(minUp, robot.upright());
    if (Math.abs(focus.x) > 100 || Math.abs(focus.z) > 100 || focus.y > 5 || focus.y < -1) outOfBounds = true;

    if (Math.abs(speed) < STUCK_SPEED) slowFor += PHYSICS_DT;
    else {
      if (slowFor > STUCK_HOLD) stuckTime += slowFor;
      slowFor = 0;
    }

    const now = new Set<number>();
    world.contactPairsWith(robot.collider(), (other) => {
      if (other.handle !== groundHandle) now.add(other.handle);
    });
    let started = false;
    for (const handle of now) {
      if (!touching.has(handle)) {
        collisionCount += 1;
        contactTimes.push(round(simTime));
        started = true;
      }
    }
    touching.clear();
    for (const handle of now) touching.add(handle);
    if (now.size > 0) contactTime += PHYSICS_DT;

    if (sensorAccumulator >= CONTROL_DT - 1e-4) {
      const sampleDt = sensorAccumulator;
      sensorAccumulator = 0;
      const raw = robot.sampleSensors(sampleDt);
      raw.time = simTime;
      raw.task = { path: taskPath };
      const frame = publishSensorFrame(raw);
      assertNoBannedKeys(frame);
      for (const range of frame.lidar.ranges) minLidar = Math.min(minLidar, range);
      const odom = odomToWorld(options.spawn, frame.odometry.pose);
      lastOdom = odom;
      const command = options.policy(frame);
      robot.setCommand(
        {
          steering: Number.isFinite(command.steering) ? command.steering : 0,
          throttle: Number.isFinite(command.throttle) ? command.throttle : 0,
        },
        0,
      );
      trail.push({
        t: simTime,
        x: focus.x,
        z: focus.z,
        speed,
        odomX: odom.x,
        odomZ: odom.z,
        hit: started,
      });
    }

    for (const t of SHOT_TIMES) {
      if (t > options.seconds + 1e-6) continue;
      if (shots.some((shot) => shot.t === t)) continue;
      if (simTime + 1e-9 >= t) shots.push({ t, x: focus.x, y: focus.y, z: focus.z, yaw: focus.yaw });
    }
  }

  if (slowFor > STUCK_HOLD) stuckTime += slowFor;
  const laps =
    options.example === "pursuit"
      ? countRouteLaps(route, trail)
      : options.world === "track"
        ? countLaps(options.spawn.z, trail)
        : { laps: 0, lapTimes: [] };
  let crossSum = 0;
  let crossMax = 0;
  let earlySum = 0;
  let earlyCount = 0;
  let lateSum = 0;
  let lateCount = 0;
  if (options.example === "pursuit") {
    for (const sample of trail) {
      const error = distanceToRoute(route, sample.x, sample.z);
      crossSum += error;
      crossMax = Math.max(crossMax, error);
      if (sample.t <= 15) {
        earlySum += error;
        earlyCount += 1;
      }
      if (sample.t >= 45) {
        lateSum += error;
        lateCount += 1;
      }
    }
  }
  const end = robot.focus();
  const odomDrift = Math.hypot(end.x - lastOdom.x, end.z - lastOdom.z);
  robot.dispose();
  world.free();

  const metrics: RunMetrics = {
    world: options.world,
    example: options.example,
    seed: options.seed,
    seconds: options.seconds,
    physicsHz: PHYSICS_HZ,
    controlHz: CONTROL_HZ,
    distance: round(distance),
    meanSpeed: round(distance / options.seconds),
    collisionCount,
    contactTime: round(contactTime),
    contactTimes,
    minLidar: round(Number.isFinite(minLidar) ? minLidar : 0),
    stuckTime: round(stuckTime),
    flipped: minUp < 0.5,
    minUp: round(minUp),
    outOfBounds,
    laps: laps.laps,
    lapTimes: laps.lapTimes,
    odomDrift: round(odomDrift),
    crossTrackMean: round(trail.length > 0 && options.example === "pursuit" ? crossSum / trail.length : 0),
    crossTrackMax: round(crossMax),
    crossTrackEarly: round(earlyCount > 0 ? earlySum / earlyCount : 0),
    crossTrackLate: round(lateCount > 0 ? lateSum / lateCount : 0),
    final: { x: round(end.x), z: round(end.z), yaw: round(end.yaw) },
    shots,
  };
  return { metrics, trail, solids };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
