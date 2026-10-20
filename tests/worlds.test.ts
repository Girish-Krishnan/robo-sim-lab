import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { clamp } from "../src/api";
import { buildCourseSolids, solidQuaternion, type Solid } from "../src/sim/course";
import { AckermannBuggy, type SpawnPose } from "../src/sim/vehicle";
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

/** Same rule as the Wall follow example. */
function wallCommand(
  ranges: number[],
  angles: number[],
  aim: { had: boolean; creep: number; backup: number },
  time: number,
  speed: number,
): { steering: number; throttle: number } {
  const side = sector(ranges, angles, -1.45, 0.3);
  const diag = sector(ranges, angles, -0.75, 0.25);
  const front = sector(ranges, angles, 0, 0.3);
  if (side < 5.5) aim.had = true;
  const yawingIn = side < 8 && diag < side * 1.2;
  let steering = 0;
  let throttle = 0.32;
  if (side < 1.9 || yawingIn) {
    steering = 0.26;
    throttle = 0.22;
  } else if (aim.had && side > 6.5) {
    steering = -0.36;
    throttle = 0.2;
  } else if (side > 8) {
    steering = 0;
    throttle = 0.36;
  } else if (side > 4) {
    steering = -0.05;
    throttle = 0.34;
  } else {
    steering = clamp(-0.16 * (side - 2.8), -0.2, 0.2);
    throttle = 0.32;
  }
  if (front < 2.4 && side < 4) {
    steering = 0.3;
    throttle = 0.16;
  }
  steering = clamp(steering, -0.4, 0.4);
  if (aim.backup > 0) {
    aim.backup -= 1;
    return { steering: 0.36, throttle: -0.32 };
  }
  if (time > 1.5 && Math.abs(speed) < 0.1 && front < 2.8) aim.creep += 1;
  else aim.creep = 0;
  if (aim.creep > 8) {
    aim.backup = 16;
    aim.creep = 0;
    return { steering: 0.36, throttle: -0.32 };
  }
  return { steering, throttle };
}

function sector(ranges: number[], angles: number[], target: number, width: number): number {
  const values: number[] = [];
  for (let i = 0; i < ranges.length; i++) {
    if (Math.abs((angles[i] ?? 0) - target) < width) values.push(ranges[i] ?? 0);
  }
  if (values.length === 0) return Math.max(...ranges, 0);
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(0.3 * (values.length - 1)))] ?? 0;
}

async function drive(
  solids: Solid[],
  spawn: SpawnPose,
  seconds: number,
  command: (
    ranges: number[],
    angles: number[],
    aim: { had: boolean; creep: number; backup: number },
    time: number,
    speed: number,
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
  const aim = { had: false, creep: 0, backup: 0 };
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
        command(sensors.lidar.ranges, sensors.lidar.angles, aim, sensors.time, sensors.odometry.speed),
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
    const forest = await drive(buildForestSolids(), FOREST_SPAWN, 8, wallCommand);
    const warehouse = await drive(buildWarehouseSolids(), WAREHOUSE_SPAWN, 8, wallCommand);
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