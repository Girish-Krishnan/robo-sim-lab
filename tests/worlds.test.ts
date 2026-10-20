import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { clamp } from "../src/api";
import { buildCourseSolids, solidQuaternion, type Solid } from "../src/sim/course";
import { AckermannBuggy, type SpawnPose } from "../src/sim/vehicle";
import { wallSpawn } from "../src/eval/scenarios";
import { buildForestSolids, FOREST_SPAWN } from "../src/sim/worlds/forest";
import { buildTrackSolids, TRACK_SPAWN } from "../src/sim/worlds/track";
import { buildWarehouseSolids, WAREHOUSE_SPAWN } from "../src/sim/worlds/warehouse";

const DT = 1 / 60;

function addSolid(world: InstanceType<typeof RAPIER.World>, solid: Solid): void {
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

function clearance(solid: Solid, spawn: SpawnPose): number {
  const dx = Math.max(Math.abs(spawn.x - solid.x) - solid.hx, 0);
  const dz = Math.max(Math.abs(spawn.z - solid.z) - solid.hz, 0);
  return Math.hypot(dx, dz);
}

/** Top of an upright solid, or the radius of a log laid on its side. */
function top(solid: Solid): number {
  if (Math.abs(solid.pitch) > 0.4) return solid.y + solid.hx;
  return solid.y + solid.hy;
}

const WALL_TARGET = 3.2;
const WALL_LOOK = 1.8;
const WALL_WHEELBASE = 1.9;

interface WallState {
  phase: "follow" | "coast" | "turn";
  ticks: number;
  reverse: number;
  gap: number;
  locked: boolean;
  sawPreview: boolean;
}

/** Same rule as the Wall follow example, including the corner orbit. */
function wallCommand(
  ranges: number[],
  angles: number[],
  speed: number,
  state: WallState,
): { steering: number; throttle: number } {
  const side = medianBeam(ranges, angles, -Math.PI / 2, 0.14);
  const diag = medianBeam(ranges, angles, -Math.PI / 4, 0.14);
  const preview = medianBeam(ranges, angles, -0.35, 0.1);
  const front = medianBeam(ranges, angles, 0, 0.32);
  const delta = Math.PI / 4;
  const alpha = Math.atan2(diag * Math.cos(delta) - side, diag * Math.sin(delta));
  const dist = Math.max(0.3, side * Math.cos(Math.min(0.8, Math.max(-0.8, alpha))));
  const future = dist + WALL_LOOK * Math.sin(alpha);
  if (state.phase === "follow" && side < 6.5 && diag < side * 2 && Math.abs(alpha) < 0.35 && Math.abs(dist - WALL_TARGET) < 1) {
    state.gap = 0.75 * state.gap + 0.25 * dist;
    if (Math.abs(dist - WALL_TARGET) < 0.55) state.locked = true;
  }
  const cornerSteer = -Math.min(0.52, Math.atan(WALL_WHEELBASE / Math.max(state.gap, 3.15)));

  const buried = front < 1.05 || (side < 1.4 && alpha < -0.45) || (state.phase === "turn" && front < 1.3 && state.ticks > 8);
  if (state.reverse > 0) {
    state.reverse -= 1;
    return { steering: -0.4, throttle: -0.26 };
  }
  if (buried) {
    state.reverse = 16;
    state.phase = "follow";
    state.ticks = 0;
    return { steering: -0.4, throttle: -0.26 };
  }
  if (state.phase === "turn") {
    state.ticks += 1;
    const onNewFace =
      state.ticks > 20 &&
      Math.abs(side - WALL_TARGET) < 0.9 &&
      Math.abs(alpha) < 0.22 &&
      diag < side * 1.65 &&
      preview < (Math.max(side, 0.5) / Math.sin(0.35)) * 1.3;
    if (onNewFace || state.ticks > 160) {
      state.phase = "follow";
      state.ticks = 0;
      return { steering: 0, throttle: 0.1 };
    }
    return { steering: cornerSteer, throttle: 0.12 };
  }
  const lost = state.locked && state.gap < 4.2 && side > 6.2;
  if (state.phase === "coast" || (state.phase === "follow" && lost)) {
    if (state.phase !== "coast") {
      state.phase = "coast";
      state.ticks = 0;
    }
    state.ticks += 1;
    if (state.ticks > 6) {
      state.phase = "turn";
      state.ticks = 0;
      return { steering: cornerSteer, throttle: 0.08 };
    }
    return { steering: 0, throttle: 0 };
  }
  const parallelPreview = Math.max(side, 0.5) / Math.sin(0.35);
  const settled = Math.abs(side - WALL_TARGET) < 0.35 && Math.abs(alpha) < 0.12;
  if (settled && preview < 10.5) state.sawPreview = true;
  const ending = diag > Math.max(6.2, side * 1.7) || (state.sawPreview && preview > Math.min(11.2, parallelPreview + 1.6));
  const cornerSoon = state.locked && side < 5.5 && ending && (settled || speed > 3);
  if (cornerSoon) {
    const throttle = speed > 3.6 ? -0.72 : speed > 2.3 ? -0.5 : speed > 1.55 ? 0 : 0.14;
    return { steering: 0, throttle };
  }
  let steering = 0;
  if (side < 9 && diag < 11) steering = 0.16 * (WALL_TARGET - future) - 0.55 * alpha;
  if (dist > WALL_TARGET + 1) steering = Math.max(steering, -0.16);
  steering = clamp(steering, -0.4, 0.4);
  const curvature = Math.abs(alpha) + 0.55 * Math.abs(steering);
  let target = 2;
  if (front > 8 && curvature < 0.14) target = 5.4;
  else if (front > 5.5 && curvature < 0.28) target = 3;
  if (front < 4) target = Math.min(target, 1.7);
  let throttle = 0.2;
  if (speed < target - 0.4) throttle = 0.46;
  else if (speed > target + 0.5) throttle = -0.3;
  return { steering, throttle };
}

function medianBeam(ranges: number[], angles: number[], target: number, width: number): number {
  const values: number[] = [];
  for (let i = 0; i < ranges.length; i++) {
    if (Math.abs((angles[i] ?? 0) - target) < width) values.push(ranges[i] ?? 0);
  }
  if (values.length === 0) return 12;
  values.sort((a, b) => a - b);
  return values[Math.floor((values.length - 1) / 2)] ?? 0;
}

async function drive(
  solids: Solid[],
  spawn: SpawnPose,
  seconds: number,
  command: (
    ranges: number[],
    angles: number[],
    speed: number,
    state: WallState,
  ) => { steering: number; throttle: number },
): Promise<{ travelled: number; minUp: number; end: { x: number; z: number }; nearest: number }> {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.5, 400).setFriction(1.05), ground);
  for (const solid of solids) addSolid(world, solid);
  const scene = new THREE.Scene();
  const robot = new AckermannBuggy(RAPIER, world, scene);
  robot.reset(spawn);
  const aim: WallState = { phase: "follow", ticks: 0, reverse: 0, gap: WALL_TARGET, locked: false, sawPreview: false };
  let sensorAccumulator = 0;
  let nearest = 25;
  const start = robot.focus();
  let minUp = 1;
  for (let i = 0; i < 60 * seconds; i++) {
    sensorAccumulator += DT;
    if (sensorAccumulator >= 0.05 - 1e-4) {
      const sensors = robot.sampleSensors(sensorAccumulator);
      sensorAccumulator = 0;
      nearest = Math.min(nearest, ...sensors.lidar.ranges);
      robot.setCommand(
        command(sensors.lidar.ranges, sensors.lidar.angles, sensors.odometry.speed, aim),
        0,
      );
    }
    robot.preStep(DT);
    world.step();
    if (i % 15 === 0) {
      robot.syncVisuals();
      const chassis = scene.children.find((child) => child instanceof THREE.Group);
      if (chassis instanceof THREE.Group) {
        minUp = Math.min(minUp, new THREE.Vector3(0, 1, 0).applyQuaternion(chassis.quaternion).y);
      }
    }
  }
  const end = robot.focus();
  return { travelled: Math.hypot(end.x - start.x, end.z - start.z), minUp, end: { x: end.x, z: end.z }, nearest };
}

describe("environments", () => {
  it("keeps every yard's spawn clear and its obstacles tall enough for the lidar", () => {
    const yards: [string, Solid[], SpawnPose][] = [
      ["city", buildCourseSolids(), { x: 5.4, y: 0.84, z: 0, yaw: 0 }],
      ["track", buildTrackSolids(), TRACK_SPAWN],
      ["forest", buildForestSolids(), FOREST_SPAWN],
      ["warehouse", buildWarehouseSolids(), WAREHOUSE_SPAWN],
    ];
    for (const [name, solids, spawn] of yards) {
      expect(solids.length, name).toBeGreaterThan(8);
      for (const solid of solids) {
        expect(clearance(solid, spawn), `${name} ${solid.look} at ${solid.x}, ${solid.z}`).toBeGreaterThan(2.4);
        if (solid.hy >= 0.4) expect(top(solid), `${name} ${solid.look}`).toBeGreaterThan(1.12);
      }
    }
  });

  it("laps the track with the wall-follow policy without rolling", async () => {
    await RAPIER.init({});
    const result = await drive(buildTrackSolids(), TRACK_SPAWN, 10, wallCommand);
    console.log(`track wall-follow x=${result.end.x.toFixed(1)} z=${result.end.z.toFixed(1)} travelled=${result.travelled.toFixed(1)} nearest=${result.nearest.toFixed(2)}`);
    expect(result.minUp).toBeGreaterThan(0.75);
    expect(result.travelled).toBeGreaterThan(18);
    expect(result.nearest).toBeLessThan(8);
  });

  it("sees the forest and the warehouse and keeps moving", async () => {
    await RAPIER.init({});
    const forest = await drive(buildForestSolids(), wallSpawn("forest"), 12, wallCommand);
    const warehouse = await drive(buildWarehouseSolids(), wallSpawn("warehouse"), 14, wallCommand);
    console.log(`forest travelled=${forest.travelled.toFixed(1)} nearest=${forest.nearest.toFixed(2)} up=${forest.minUp.toFixed(2)}`);
    console.log(`warehouse travelled=${warehouse.travelled.toFixed(1)} nearest=${warehouse.nearest.toFixed(2)} up=${warehouse.minUp.toFixed(2)}`);
    expect(forest.minUp).toBeGreaterThan(0.75);
    expect(warehouse.minUp).toBeGreaterThan(0.75);
    expect(forest.nearest).toBeLessThan(10);
    expect(warehouse.nearest).toBeLessThan(10);
    expect(forest.travelled).toBeGreaterThan(15);
    expect(warehouse.travelled).toBeGreaterThan(15);
  });
});