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

function wallCommand(ranges: number[], angles: number[], aim: { v: number }): { steering: number; throttle: number } {
  let best = -1;
  let gapAngle = 0;
  let gapRange = 25;
  for (let i = 0; i < ranges.length; i++) {
    const angle = angles[i] ?? 0;
    const dist = ranges[i] ?? gapRange;
    if (Math.abs(angle) >= 1.55) continue;
    const score = dist * (1 - 0.18 * Math.abs(angle)) + (angle < -0.05 ? 0.6 : 0);
    if (score > best) {
      best = score;
      gapAngle = angle;
      gapRange = dist;
    }
  }
  aim.v = 0.65 * aim.v + 0.35 * gapAngle;
  const steering = clamp(aim.v * 0.85, -0.48, 0.48);
  let throttle = 0.46;
  if (gapRange < 8) throttle = 0.32;
  if (gapRange < 4) throttle = 0.18;
  if (gapRange < 2) throttle = 0;
  return { steering, throttle };
}

async function drive(
  solids: Solid[],
  spawn: SpawnPose,
  seconds: number,
  command: (ranges: number[], angles: number[], aim: { v: number }) => { steering: number; throttle: number },
): Promise<{ travelled: number; minUp: number; end: { x: number; z: number }; nearest: number }> {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.5, 400).setFriction(1.05), ground);
  for (const solid of solids) addSolid(world, solid);
  const scene = new THREE.Scene();
  const robot = new AckermannBuggy(RAPIER, world, scene);
  robot.reset(spawn);
  const aim = { v: 0 };
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
      robot.setCommand(command(sensors.lidar.ranges, sensors.lidar.angles, aim), 0);
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